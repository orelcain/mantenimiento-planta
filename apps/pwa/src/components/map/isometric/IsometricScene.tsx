/**
 * IsometricScene — Componente principal del mapa isométrico 3D
 * 
 * Combina todos los sub-componentes:
 * - Canvas R3F con cámara ortográfica
 * - Iluminación de escena
 * - Grilla 1m×1m
 * - Áreas/zonas
 * - Equipos (nodos)
 * - Conectores
 * - Controles de cámara FFT
 * 
 * Es el equivalente del <Canvas> + <SceneContent> patrón Viewer3D.
 */

import { Suspense, useCallback, useMemo } from 'react'
import { Canvas } from '@react-three/fiber'
// drei helpers disponibles si se necesitan (Environment, etc.)
import * as THREE from 'three'
import { IsometricCamera } from './IsometricCamera'
import { PlantGrid } from './PlantGrid'
import { EquipmentNode } from './EquipmentNode'
import { DraggableNode } from './editor/DraggableNode'
import { MapAreaOverlay } from './MapAreaOverlay'
import { MapConnector } from './MapConnector'
import type {
  CameraAngle,
  IsometricMapConfig,
  MapNode,
  MapConnector as MapConnectorType,
  MapArea,
  NodeRuntimeData,
  IsometricViewerState,
} from '@/types/isometricMap'

interface IsometricSceneProps {
  /** Configuración del mapa (dimensiones, colores, grid) */
  config: IsometricMapConfig
  /** Nodos (equipos/sensores) */
  nodes: MapNode[]
  /** Conectores (tuberías, cables) */
  connectors: MapConnectorType[]
  /** Áreas/zonas */
  areas: MapArea[]
  /** Área seleccionada */
  selectedAreaId?: string | null
  /** Data runtime (estados, incidencias, sensores) */
  runtimeData: Map<string, NodeRuntimeData>
  /** Estado del visor */
  viewerState: IsometricViewerState
  /** Callbacks */
  onNodeClick?: (nodeId: string) => void
  onNodeHover?: (nodeId: string | null) => void
  onAreaClick?: (areaId: string) => void
  onCameraAngleChange?: (angle: CameraAngle) => void
  onBackgroundClick?: () => void
  /** Editor callbacks */
  onNodeDragEnd?: (nodeId: string, newPosition: { x: number; y: number; z: number }) => void
  /** Callback para agregar nodo al hacer click en suelo en modo 'add' */
  onFloorClick?: (position: { x: number; z: number }) => void
  /** Tiles de pintura para el editor de áreas (overlay en el suelo) */
  paintTiles?: { tiles: Set<string>; color: string; opacity: number }
}

/** Contenido de la escena (dentro del Canvas) */
function SceneContent({
  config,
  nodes,
  connectors,
  areas,
  selectedAreaId,
  runtimeData,
  viewerState,
  onNodeClick,
  onNodeHover,
  onAreaClick,
  onCameraAngleChange: _onCameraAngleChange,
  onBackgroundClick,
  onNodeDragEnd,
  onFloorClick,
  paintTiles,
}: IsometricSceneProps) {
  // Centro de la planta
  const centerTarget = useMemo<[number, number, number]>(
    () => [0, 0, 0],
    []
  )

  // Lookup de nodos para conectores
  const nodeMap = useMemo(() => {
    const map = new Map<string, MapNode>()
    for (const node of nodes) {
      map.set(node.id, node)
    }
    return map
  }, [nodes])

  // Filtrar nodos visibles según filtros activos y piso actual
  const visibleNodes = useMemo(() => {
    const { filters, currentFloor } = viewerState
    if (!filters.showEquipment) return []
    return nodes.filter((node) => {
      if (!node.visible) return false
      // Filtrar por piso (default 0 si no tiene)
      if ((node.floor ?? 0) !== currentFloor) return false
      switch (node.type) {
        case 'pump': return filters.showPumps
        case 'motor': return filters.showMotors
        case 'sensor': return filters.showSensors
        default: return true
      }
    })
  }, [nodes, viewerState.filters, viewerState.currentFloor])

  const handleRotationComplete = useCallback(() => {
    // Notificación opcional al completar rotación
  }, [])

  return (
    <>
      {/* Background color */}
      <color attach="background" args={['#0d1117']} />

      {/* Iluminación */}
      <ambientLight intensity={0.5} />
      <directionalLight
        position={[20, 30, 15]}
        intensity={0.8}
        castShadow
        shadow-mapSize-width={2048}
        shadow-mapSize-height={2048}
        shadow-camera-far={100}
        shadow-camera-left={-50}
        shadow-camera-right={50}
        shadow-camera-top={50}
        shadow-camera-bottom={-50}
      />
      <directionalLight position={[-15, 20, -10]} intensity={0.3} />
      <hemisphereLight args={['#1e40af', '#1e293b', 0.4]} />

      {/* Ambiente */}
      <fog attach="fog" args={['#0d1117', 80, 200]} />

      {/* Cámara isométrica con rotación FFT */}
      <IsometricCamera
        angle={viewerState.cameraAngle}
        zoom={viewerState.zoom}
        target={centerTarget}
        panOffset={viewerState.panOffset}
        distance={60}
        onRotationComplete={handleRotationComplete}
      />

      {/* Grilla del suelo */}
      <PlantGrid config={config} />

      {/* Áreas/zonas (filtradas por piso) */}
      {viewerState.filters.showAreas && areas
        .filter((a) => (a.floor ?? 0) === viewerState.currentFloor)
        .map((area) => (
        <MapAreaOverlay
          key={area.id}
          area={area}
          selected={selectedAreaId === area.id}
          onClick={onAreaClick}
        />
      ))}

      {/* Paint tiles overlay (editor de áreas) */}
      {paintTiles && paintTiles.tiles.size > 0 && (
        <group>
          {Array.from(paintTiles.tiles).map((key) => {
            const parts = key.split(',')
            const px = Number(parts[0])
            const pz = Number(parts[1])
            return (
              <mesh
                key={key}
                rotation-x={-Math.PI / 2}
                position={[px + 0.5, 0.02, pz + 0.5]}
              >
                <planeGeometry args={[0.95, 0.95]} />
                <meshBasicMaterial
                  color={paintTiles.color}
                  transparent
                  opacity={Math.min(paintTiles.opacity + 0.2, 0.8)}
                  depthWrite={false}
                />
              </mesh>
            )
          })}
        </group>
      )}

      {/* Conectores */}
      {viewerState.filters.showConnectors && connectors.map((connector) => {
        const fromNode = nodeMap.get(connector.fromNodeId)
        const toNode = nodeMap.get(connector.toNodeId)
        if (!fromNode || !toNode) return null
        return (
          <MapConnector
            key={connector.id}
            connector={connector}
            fromNode={fromNode}
            toNode={toNode}
          />
        )
      })}

      {/* Equipos/nodos (DraggableNode en edit, EquipmentNode en view) */}
      {visibleNodes.map((node) => {
        const runtime = runtimeData.get(node.id)
        const isEditMode = viewerState.mode === 'edit'

        if (isEditMode) {
          return (
            <DraggableNode
              key={node.id}
              node={node}
              status={runtime?.status || 'ok'}
              activeIncidents={runtime?.activeIncidents || 0}
              sensorValue={
                runtime?.sensorValue !== undefined
                  ? `${runtime.sensorValue}${runtime.sensorUnit || ''}`
                  : undefined
              }
              selected={viewerState.selectedNodeId === node.id}
              hovered={viewerState.hoveredNodeId === node.id}
              showLabel={viewerState.filters.showLabels}
              viewerState={viewerState}
              gridSnap={1}
              onClick={onNodeClick}
              onHover={onNodeHover}
              onDragEnd={onNodeDragEnd}
            />
          )
        }

        return (
          <EquipmentNode
            key={node.id}
            node={node}
            status={runtime?.status || 'ok'}
            activeIncidents={runtime?.activeIncidents || 0}
            sensorValue={
              runtime?.sensorValue !== undefined
                ? `${runtime.sensorValue}${runtime.sensorUnit || ''}`
                : undefined
            }
            selected={viewerState.selectedNodeId === node.id}
            hovered={viewerState.hoveredNodeId === node.id}
            showLabel={viewerState.filters.showLabels}
            onClick={onNodeClick}
            onHover={onNodeHover}
          />
        )
      })}

      {/* Click en fondo para deseleccionar / agregar equipo en modo add / pintar área */}
      <mesh
        rotation-x={-Math.PI / 2}
        position={[0, -0.1, 0]}
        onClick={(e) => {
          if ((viewerState.mode === 'edit' || paintTiles) && onFloorClick) {
            const point = e.point
            onFloorClick({ x: Math.round(point.x), z: Math.round(point.z) })
          } else {
            onBackgroundClick?.()
          }
        }}
        visible={false}
      >
        <planeGeometry args={[config.width * 2, config.depth * 2]} />
        <meshBasicMaterial transparent opacity={0} />
      </mesh>
    </>
  )
}

/** Fallback de carga dentro del Canvas */
function InCanvasLoader() {
  return (
    <mesh position={[0, 1, 0]}>
      <boxGeometry args={[1, 1, 1]} />
      <meshStandardMaterial color="#3b82f6" wireframe />
    </mesh>
  )
}

/** Componente principal exportado */
export function IsometricScene(props: IsometricSceneProps) {
  return (
    <div className="w-full h-full relative">
      <Canvas
        orthographic
        camera={{
          position: [40, 40, 40],
          zoom: props.viewerState.zoom,
          near: 0.1,
          far: 1000,
        }}
        shadows
        gl={{
          antialias: true,
          alpha: false,
          toneMapping: THREE.ACESFilmicToneMapping,
          toneMappingExposure: 1.0,
          outputColorSpace: THREE.SRGBColorSpace,
        }}
        style={{ background: '#0d1117' }}
        onPointerMissed={() => props.onBackgroundClick?.()}
      >
        <Suspense fallback={<InCanvasLoader />}>
          <SceneContent {...props} />
        </Suspense>
      </Canvas>
    </div>
  )
}
