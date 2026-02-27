/**
 * DraggableNode — Envuelve EquipmentNode con soporte drag & drop en modo editor
 * 
 * Usa raycasting contra el plano Y=0 para convertir movimiento del mouse
 * en coordenadas 3D, con snap a grilla configurable.
 * Solo activa drag cuando el visor está en modo 'edit'.
 */

import { useRef, useState, useCallback } from 'react'
import { useThree } from '@react-three/fiber'
import * as THREE from 'three'
import { EquipmentNode } from '../EquipmentNode'
import type { MapNode, OperationalStatus, IsometricViewerState } from '@/types/isometricMap'

interface DraggableNodeProps {
  node: MapNode
  status?: OperationalStatus
  activeIncidents?: number
  sensorValue?: string
  selected?: boolean
  hovered?: boolean
  showLabel?: boolean
  viewerState: IsometricViewerState
  /** Snap al mover (en metros). 0 = sin snap */
  gridSnap?: number
  onClick?: (nodeId: string) => void
  onHover?: (nodeId: string | null) => void
  /** Llamado al completar un drag con la nueva posición */
  onDragEnd?: (nodeId: string, newPosition: { x: number; y: number; z: number }) => void
}

const raycaster = new THREE.Raycaster()
const floorPlane = new THREE.Plane(new THREE.Vector3(0, 1, 0), 0)
const intersectionPoint = new THREE.Vector3()

export function DraggableNode({
  node,
  status,
  activeIncidents,
  sensorValue,
  selected,
  hovered,
  showLabel,
  viewerState,
  gridSnap = 1,
  onClick,
  onHover,
  onDragEnd,
}: DraggableNodeProps) {
  const { camera, gl } = useThree()
  const isDragging = useRef(false)
  const dragStartPos = useRef<THREE.Vector3>(new THREE.Vector3())
  const nodeStartPos = useRef<{ x: number; y: number; z: number }>({ x: 0, y: 0, z: 0 })
  const [dragOffset, setDragOffset] = useState<{ x: number; z: number } | null>(null)
  const hasMoved = useRef(false)

  const isEditMode = viewerState.mode === 'edit'

  // Snap posición a grilla
  const snapToGrid = useCallback(
    (val: number) => {
      if (gridSnap <= 0) return val
      return Math.round(val / gridSnap) * gridSnap
    },
    [gridSnap]
  )

  // Obtener punto de intersección con el plano del suelo
  const getFloorIntersection = useCallback(
    (clientX: number, clientY: number): THREE.Vector3 | null => {
      const rect = gl.domElement.getBoundingClientRect()
      const mouse = new THREE.Vector2(
        ((clientX - rect.left) / rect.width) * 2 - 1,
        -((clientY - rect.top) / rect.height) * 2 + 1
      )
      raycaster.setFromCamera(mouse, camera)
      const hit = raycaster.ray.intersectPlane(floorPlane, intersectionPoint)
      return hit ? intersectionPoint.clone() : null
    },
    [camera, gl]
  )

  const handlePointerDown = useCallback(
    (e: THREE.Event & { stopPropagation: () => void; nativeEvent: PointerEvent }) => {
      if (!isEditMode) return
      e.stopPropagation()

      const point = getFloorIntersection(e.nativeEvent.clientX, e.nativeEvent.clientY)
      if (!point) return

      isDragging.current = true
      hasMoved.current = false
      dragStartPos.current.copy(point)
      nodeStartPos.current = { ...node.position }

      // Capturar pointer para seguir recibiendo eventos
      gl.domElement.setPointerCapture(e.nativeEvent.pointerId)
      gl.domElement.style.cursor = 'grabbing'
    },
    [isEditMode, getFloorIntersection, gl, node.position]
  )

  const handlePointerMove = useCallback(
    (e: THREE.Event & { nativeEvent: PointerEvent }) => {
      if (!isDragging.current || !isEditMode) return

      const point = getFloorIntersection(e.nativeEvent.clientX, e.nativeEvent.clientY)
      if (!point) return

      const dx = point.x - dragStartPos.current.x
      const dz = point.z - dragStartPos.current.z

      // Threshold mínimo para considerar drag (evitar micro-movimientos)
      if (!hasMoved.current && Math.abs(dx) < 0.3 && Math.abs(dz) < 0.3) return
      hasMoved.current = true

      const newX = snapToGrid(nodeStartPos.current.x + dx)
      const newZ = snapToGrid(nodeStartPos.current.z + dz)

      setDragOffset({ x: newX - node.position.x, z: newZ - node.position.z })
    },
    [isEditMode, getFloorIntersection, snapToGrid, node.position]
  )

  const handlePointerUp = useCallback(
    (e: THREE.Event & { nativeEvent: PointerEvent }) => {
      if (!isDragging.current) return
      isDragging.current = false
      gl.domElement.style.cursor = 'default'

      try {
        gl.domElement.releasePointerCapture(e.nativeEvent.pointerId)
      } catch {
        // ignore if already released
      }

      if (hasMoved.current && dragOffset) {
        const newPos = {
          x: node.position.x + dragOffset.x,
          y: node.position.y,
          z: node.position.z + dragOffset.z,
        }
        onDragEnd?.(node.id, newPos)
      } else if (!hasMoved.current) {
        // Si no hubo movimiento real, tratar como click
        onClick?.(node.id)
      }

      setDragOffset(null)
      hasMoved.current = false
    },
    [gl, dragOffset, node.id, node.position, onDragEnd, onClick]
  )

  // Nodo con posición ajustada durante el drag
  const effectiveNode: MapNode = dragOffset
    ? {
        ...node,
        position: {
          x: node.position.x + dragOffset.x,
          y: node.position.y,
          z: node.position.z + dragOffset.z,
        },
      }
    : node

  // En modo editor, envolvemos con handlers extra
  if (isEditMode) {
    return (
      <group
        onPointerDown={handlePointerDown as any}
        onPointerMove={handlePointerMove as any}
        onPointerUp={handlePointerUp as any}
      >
        <EquipmentNode
          node={effectiveNode}
          status={status}
          activeIncidents={activeIncidents}
          sensorValue={sensorValue}
          selected={selected}
          hovered={hovered}
          showLabel={showLabel}
          onClick={undefined} // Manejamos click en handlePointerUp
          onHover={onHover}
        />
        {/* Indicador visual de grilla snap durante drag */}
        {dragOffset && (
          <mesh
            rotation-x={-Math.PI / 2}
            position={[
              effectiveNode.position.x,
              0.03,
              effectiveNode.position.z,
            ]}
          >
            <ringGeometry
              args={[
                Math.max(effectiveNode.size.width, effectiveNode.size.depth) * 0.6,
                Math.max(effectiveNode.size.width, effectiveNode.size.depth) * 0.7,
                4,
              ]}
            />
            <meshBasicMaterial color="#3b82f6" transparent opacity={0.5} side={THREE.DoubleSide} />
          </mesh>
        )}
      </group>
    )
  }

  // En modo view, renderizar normal
  return (
    <EquipmentNode
      node={node}
      status={status}
      activeIncidents={activeIncidents}
      sensorValue={sensorValue}
      selected={selected}
      hovered={hovered}
      showLabel={showLabel}
      onClick={onClick}
      onHover={onHover}
    />
  )
}
