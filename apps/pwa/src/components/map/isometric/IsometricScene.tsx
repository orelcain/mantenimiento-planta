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
  TerrainTile,
  NodeRuntimeData,
  IsometricViewerState,
} from '@/types/isometricMap'
import { SEA_LEVEL_ELEVATION } from '@/types/isometricMap'

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
  /** Área resaltada por contexto (hover/preview) */
  highlightedAreaId?: string | null
  /** Data runtime (estados, incidencias, sensores) */
  runtimeData: Map<string, NodeRuntimeData>
  /** Terreno editable (celdas 1m x 1m con elevación) */
  terrain?: TerrainTile[]
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
  /** Callback para pintar/editar en arrastre sobre suelo */
  onFloorDrag?: (position: { x: number; z: number }) => void
  /** Callback de hover sobre suelo para preview de brocha */
  onFloorHover?: (position: { x: number; z: number } | null) => void
  /** Preview de brocha de terreno */
  terrainBrushPreview?: {
    center: { x: number; z: number }
    size: 1 | 3 | 5
    mode: 'raise' | 'lower' | 'flatten' | 'smooth' | 'sample'
  } | null
  /** Tiles de pintura para el editor de áreas (overlay en el suelo) */
  paintTiles?: { tiles: Set<string>; color: string; opacity: number }
  /** Filtro adicional de nodos visibles */
  visibleNodeIds?: Set<string>
}

/** Contenido de la escena (dentro del Canvas) */
function SceneContent({
  config,
  nodes,
  connectors,
  areas,
  selectedAreaId,
  highlightedAreaId,
  runtimeData,
  terrain,
  viewerState,
  onNodeClick,
  onNodeHover,
  onAreaClick,
  onCameraAngleChange: _onCameraAngleChange,
  onBackgroundClick,
  onNodeDragEnd,
  onFloorClick,
  onFloorDrag,
  onFloorHover,
  terrainBrushPreview,
  paintTiles,
  visibleNodeIds,
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
      if ((node.floor ?? SEA_LEVEL_ELEVATION) !== currentFloor) return false
      const typeAllowed = (() => {
        switch (node.type) {
          case 'pump': return filters.showPumps
          case 'motor': return filters.showMotors
          case 'sensor': return filters.showSensors
          default: return true
        }
      })()
      if (!typeAllowed) return false
      if (visibleNodeIds && !visibleNodeIds.has(node.id)) return false
      return true
    })
  }, [nodes, viewerState, visibleNodeIds])

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

      {/* Terreno voxel simplificado (estilo construcción por cuadrante) */}
      {terrain && terrain.length > 0 && (
        <group>
          {terrain.map((tile) => (
            <mesh
              key={`${tile.x},${tile.z}`}
              position={[tile.x + 0.5, tile.elevation - 0.125, tile.z + 0.5]}
              castShadow
              receiveShadow
            >
              <boxGeometry args={[0.96, 0.25, 0.96]} />
              <meshStandardMaterial
                color={tile.elevation >= SEA_LEVEL_ELEVATION ? '#6b8e5a' : '#3b82f6'}
                roughness={0.85}
                metalness={0.05}
              />
            </mesh>
          ))}
        </group>
      )}

      {/* Preview de brocha de terreno */}
      {terrainBrushPreview && (
        <group>
          {(() => {
            const cells: Array<{ x: number; z: number }> = []
            const radius = Math.floor(terrainBrushPreview.size / 2)
            for (let dx = -radius; dx <= radius; dx++) {
              for (let dz = -radius; dz <= radius; dz++) {
                cells.push({
                  x: terrainBrushPreview.center.x + dx,
                  z: terrainBrushPreview.center.z + dz,
                })
              }
            }
            return cells.map((cell) => (
              <mesh
                key={`preview-${cell.x},${cell.z}`}
                rotation-x={-Math.PI / 2}
                position={[cell.x + 0.5, 0.06, cell.z + 0.5]}
              >
                <planeGeometry args={[0.94, 0.94]} />
                <meshBasicMaterial
                  color={
                    terrainBrushPreview.mode === 'raise'
                      ? '#22c55e'
                      : terrainBrushPreview.mode === 'lower'
                        ? '#ef4444'
                        : terrainBrushPreview.mode === 'flatten'
                          ? '#3b82f6'
                          : terrainBrushPreview.mode === 'smooth'
                            ? '#a855f7'
                            : '#f59e0b'
                  }
                  transparent
                  opacity={0.35}
                  depthWrite={false}
                />
              </mesh>
            ))
          })()}
        </group>
      )}

      {/* Áreas/zonas (filtradas por piso) */}
      {viewerState.filters.showAreas && areas
        .filter((a) => (a.floor ?? SEA_LEVEL_ELEVATION) === viewerState.currentFloor)
        .map((area) => (
        <MapAreaOverlay
          key={area.id}
          area={area}
          selected={selectedAreaId === area.id}
          highlighted={highlightedAreaId === area.id}
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
              gridSnap={config.cellSize}
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
            onFloorClick({
              x: Math.floor(point.x + 0.0001),
              z: Math.floor(point.z + 0.0001),
            })
          } else {
            onBackgroundClick?.()
          }
        }}
        onPointerMove={(e) => {
          const point = e.point
          onFloorHover?.({
            x: Math.floor(point.x + 0.0001),
            z: Math.floor(point.z + 0.0001),
          })

          if (!onFloorDrag) return
          if (e.buttons !== 1) return
          onFloorDrag({
            x: Math.floor(point.x + 0.0001),
            z: Math.floor(point.z + 0.0001),
          })
        }}
        onPointerOut={() => onFloorHover?.(null)}
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
          zoom: 1,
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
