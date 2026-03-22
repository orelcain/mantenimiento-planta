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

import { Suspense, useCallback, useEffect, useMemo } from 'react'
import { Canvas, useLoader, useThree } from '@react-three/fiber'
// drei helpers disponibles si se necesitan (Environment, etc.)
import * as THREE from 'three'
import { IsometricCamera } from './IsometricCamera'
import { EquipmentNode } from './EquipmentNode'
import { DraggableNode } from './editor/DraggableNode'
import { MapAreaOverlay } from './MapAreaOverlay'
import { MapConnector } from './MapConnector'
import { OSMOverlay3D } from './OSMOverlay3D'
import { TerrainMesh, useTerrainData } from './TerrainMesh'
import { SceneEnvironment } from './SceneEnvironment'
import type {
  IsometricMapConfig,
  MapNode,
  MapConnector as MapConnectorType,
  MapArea,
  TerrainTile,
  NodeRuntimeData,
  IsometricViewerState,
} from '@/types/isometricMap'
import { SEA_LEVEL_ELEVATION } from '@/types/isometricMap'
import type { OSMFeatures } from '@/lib/osmBuildings'
import type { TerrainGeoBounds } from '@/lib/terrainImport'

interface IsometricSceneProps {
  /** Configuración del mapa (dimensiones, colores, grid) */
  config: IsometricMapConfig
  /** Plano raster opcional como base visual del mapa */
  underlayImageUrl?: string | null
  underlayDisplayMode?: 'original' | 'soft-light' | 'blueprint'
  underlayOpacity?: number
  underlayWidth?: number
  underlayDepth?: number
  underlayOffset?: { x: number; z: number }
  underlayRotation?: number
  underlayInteractionMode?: 'move' | 'scale' | 'rotate' | null
  onUnderlayTransform?: (next: {
    width?: number
    depth?: number
    offsetX?: number
    offsetZ?: number
    rotation?: number
  }) => void
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

  onBackgroundClick?: () => void
  /** Editor callbacks */
  onNodeDragEnd?: (
    nodeId: string,
    newPosition: { x: number; y: number; z: number },
    options?: { duplicate?: boolean }
  ) => void
  /** Callback para agregar nodo al hacer click en suelo en modo 'add' */
  onFloorClick?: (position: { x: number; z: number }) => void
  /** Callback para pintar/editar en arrastre sobre suelo */
  onFloorDrag?: (position: { x: number; z: number }) => void
  /** Callback de hover sobre suelo para preview de brocha */
  onFloorHover?: (position: { x: number; z: number } | null) => void
  /** Preview de brocha de terreno */
  terrainBrushPreview?: {
    center: { x: number; z: number }
    size: 1 | 3 | 5 | 7 | 9
    mode: 'raise' | 'lower' | 'flatten' | 'smooth' | 'sample'
  } | null
  /** Tiles de pintura para el editor de áreas (overlay en el suelo) */
  paintTiles?: { tiles: Set<string>; color: string; opacity: number }
  /** Filtro adicional de nodos visibles */
  visibleNodeIds?: Set<string>
  /** Preview fantasma para colocación de nodos */
  placementPreview?: {
    position: { x: number; z: number }
    floor: number
    size: { width: number; height: number; depth: number }
    rotation: number
    valid: boolean
    snapGuides?: Array<{ axis: 'x' | 'z'; from: { x: number; z: number }; to: { x: number; z: number } }>
  } | null
  /** Preview de bulldozer sobre celda de piso */
  bulldozerPreview?: { x: number; z: number } | null
  /** Canvas con textura satelital para draping sobre el terreno */
  satelliteTextureCanvas?: HTMLCanvasElement | null
  /** Features OSM 3D (edificios, caminos, agua, landcover) */
  osmFeatures?: OSMFeatures | null
  /** Bounds georreferenciados del terreno para mapeo geo→grid */
  terrainGeoBounds?: TerrainGeoBounds | null
}

/** Contenido de la escena (dentro del Canvas) */
function SceneContent({
  config,
  underlayImageUrl,
  underlayDisplayMode,
  underlayOpacity,
  underlayWidth,
  underlayDepth,
  underlayOffset,
  underlayRotation,
  underlayInteractionMode,
  onUnderlayTransform,
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
  onBackgroundClick,
  onNodeDragEnd,
  onFloorClick,
  onFloorDrag,
  onFloorHover,
  terrainBrushPreview,
  paintTiles,
  visibleNodeIds,
  placementPreview,
  bulldozerPreview,
  satelliteTextureCanvas,
  osmFeatures,
  terrainGeoBounds,
}: IsometricSceneProps) {
  const { gl } = useThree()
  const underlayDragState = useMemo(() => ({ current: null as null | {
    mode: 'move' | 'scale' | 'rotate'
    startPoint: { x: number; z: number }
    startOffsetX: number
    startOffsetZ: number
    startWidth: number
    startDepth: number
    startRotation: number
    startDistance: number
    startAngle: number
  } }), [])

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

  // Terrain data (elevation map, metrics, bounds) via extracted hook
  const { elevationMap: terrainElevationMap, metrics: terrainMetrics } = useTerrainData(terrain)

  const underlayTexture = useLoader(
    THREE.TextureLoader,
    underlayImageUrl || 'data:image/gif;base64,R0lGODlhAQABAIAAAAAAAP///ywAAAAAAQABAAACAUwAOw=='
  )

  const underlayStyle = useMemo(() => {
    const baseOpacity = Math.max(0.05, Math.min(underlayOpacity ?? 0.5, 1))

    if (underlayDisplayMode === 'original') {
      return {
        tint: '#ffffff',
        planeOpacity: baseOpacity,
        backdropOpacity: 0,
        backdropColor: '#000000',
        frameOpacity: 0,
        frameColor: '#ffffff',
      }
    }

    if (underlayDisplayMode === 'blueprint') {
      return {
        tint: '#a7e3ff',
        planeOpacity: Math.min(0.34, baseOpacity * 0.72),
        backdropOpacity: 0.16,
        backdropColor: '#07273a',
        frameOpacity: 0.32,
        frameColor: '#6dd3ff',
      }
    }

    return {
      tint: '#e5eef5',
      planeOpacity: Math.min(0.42, baseOpacity * 0.8),
      backdropOpacity: 0.12,
      backdropColor: '#08131d',
      frameOpacity: 0.22,
      frameColor: '#b8cad8',
    }
  }, [underlayDisplayMode, underlayOpacity])

  const underlayFrameGeometry = useMemo(() => {
    if (!underlayImageUrl) return null

    const halfWidth = (underlayWidth ?? config.width) / 2
    const halfDepth = (underlayDepth ?? config.depth) / 2
    return new THREE.BufferGeometry().setFromPoints([
      new THREE.Vector3(-halfWidth, 0.03, -halfDepth),
      new THREE.Vector3(halfWidth, 0.03, -halfDepth),
      new THREE.Vector3(halfWidth, 0.03, halfDepth),
      new THREE.Vector3(-halfWidth, 0.03, halfDepth),
      new THREE.Vector3(-halfWidth, 0.03, -halfDepth),
    ])
  }, [config.depth, config.width, underlayDepth, underlayImageUrl, underlayWidth])

  const underlayFrameLine = useMemo(() => {
    if (!underlayFrameGeometry || underlayStyle.frameOpacity <= 0) return null

    return new THREE.Line(
      underlayFrameGeometry,
      new THREE.LineBasicMaterial({
        color: underlayStyle.frameColor,
        transparent: true,
        opacity: underlayStyle.frameOpacity,
        depthWrite: false,
      })
    )
  }, [underlayFrameGeometry, underlayStyle.frameColor, underlayStyle.frameOpacity])

  useEffect(() => {
    underlayTexture.colorSpace = THREE.SRGBColorSpace
    underlayTexture.wrapS = THREE.ClampToEdgeWrapping
    underlayTexture.wrapT = THREE.ClampToEdgeWrapping
    underlayTexture.magFilter = THREE.LinearFilter
    underlayTexture.minFilter = THREE.LinearMipmapLinearFilter
    underlayTexture.anisotropy = Math.min(8, gl.capabilities.getMaxAnisotropy())
    underlayTexture.needsUpdate = true
  }, [gl, underlayTexture])

  const handleUnderlayPointerDown = useCallback((event: { stopPropagation: () => void; point: THREE.Vector3 }) => {
    if (!underlayInteractionMode || !onUnderlayTransform) return
    event.stopPropagation()

    const centerX = underlayOffset?.x ?? 0
    const centerZ = underlayOffset?.z ?? 0
    const deltaX = event.point.x - centerX
    const deltaZ = event.point.z - centerZ

    underlayDragState.current = {
      mode: underlayInteractionMode,
      startPoint: { x: event.point.x, z: event.point.z },
      startOffsetX: centerX,
      startOffsetZ: centerZ,
      startWidth: underlayWidth ?? config.width,
      startDepth: underlayDepth ?? config.depth,
      startRotation: underlayRotation ?? 0,
      startDistance: Math.max(1, Math.hypot(deltaX, deltaZ)),
      startAngle: Math.atan2(deltaZ, deltaX),
    }
  }, [config.depth, config.width, onUnderlayTransform, underlayDepth, underlayDragState, underlayInteractionMode, underlayOffset?.x, underlayOffset?.z, underlayRotation, underlayWidth])

  const handleUnderlayPointerMove = useCallback((event: { stopPropagation: () => void; point: THREE.Vector3; buttons: number }) => {
    const drag = underlayDragState.current
    if (!drag || !onUnderlayTransform || event.buttons !== 1) return
    event.stopPropagation()

    if (drag.mode === 'move') {
      onUnderlayTransform({
        offsetX: Math.round((drag.startOffsetX + (event.point.x - drag.startPoint.x)) * 10) / 10,
        offsetZ: Math.round((drag.startOffsetZ + (event.point.z - drag.startPoint.z)) * 10) / 10,
      })
      return
    }

    const centerX = drag.startOffsetX
    const centerZ = drag.startOffsetZ
    const currentDx = event.point.x - centerX
    const currentDz = event.point.z - centerZ

    if (drag.mode === 'scale') {
      const currentDistance = Math.max(1, Math.hypot(currentDx, currentDz))
      const factor = Math.max(0.1, currentDistance / drag.startDistance)
      onUnderlayTransform({
        width: Math.max(1, Math.round(drag.startWidth * factor)),
        depth: Math.max(1, Math.round(drag.startDepth * factor)),
      })
      return
    }

    const currentAngle = Math.atan2(currentDz, currentDx)
    const deltaAngle = (currentAngle - drag.startAngle) * (180 / Math.PI)
    onUnderlayTransform({
      rotation: Math.round((drag.startRotation + deltaAngle) * 10) / 10,
    })
  }, [onUnderlayTransform, underlayDragState])

  const handleUnderlayPointerUp = useCallback((event: { stopPropagation: () => void }) => {
    if (!underlayDragState.current) return
    event.stopPropagation()
    underlayDragState.current = null
  }, [underlayDragState])

  return (
    <>
      <SceneEnvironment hasSatelliteTexture={!!satelliteTextureCanvas} />

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
      {underlayImageUrl && (
        <group
          rotation-x={-Math.PI / 2}
          rotation-z={((underlayRotation ?? 0) * Math.PI) / 180}
          position={[underlayOffset?.x ?? 0, -0.02, underlayOffset?.z ?? 0]}
        >
          {underlayStyle.backdropOpacity > 0 && (
            <mesh position={[0, 0.003, 0]}>
              <planeGeometry args={[(underlayWidth ?? config.width) * 1.02, (underlayDepth ?? config.depth) * 1.02]} />
              <meshBasicMaterial
                color={underlayStyle.backdropColor}
                transparent
                opacity={underlayStyle.backdropOpacity}
                toneMapped={false}
                depthWrite={false}
              />
            </mesh>
          )}
          <mesh
            raycast={underlayInteractionMode ? undefined : () => null}
            onPointerDown={underlayInteractionMode ? handleUnderlayPointerDown : undefined}
            onPointerMove={underlayInteractionMode ? handleUnderlayPointerMove : undefined}
            onPointerUp={underlayInteractionMode ? handleUnderlayPointerUp : undefined}
            onPointerLeave={underlayInteractionMode ? handleUnderlayPointerUp : undefined}
          >
            <planeGeometry args={[underlayWidth ?? config.width, underlayDepth ?? config.depth]} />
            <meshBasicMaterial
              map={underlayTexture}
              color={underlayStyle.tint}
              transparent
              opacity={underlayStyle.planeOpacity}
              toneMapped={false}
              depthWrite={false}
            />
          </mesh>
          {underlayFrameLine && (
            <primitive object={underlayFrameLine} />
          )}
        </group>
      )}

      {/* Terrain heightfield mesh (vertex-color or satellite drape + contours) */}
      {terrain && terrain.length > 0 && (
        <TerrainMesh
          terrain={terrain}
          config={config}
          satelliteTextureCanvas={satelliteTextureCanvas}
        />
      )}

      {/* OSM 3D overlay: edificios, caminos, agua, árboles */}
      {osmFeatures && terrainGeoBounds && (
        <OSMOverlay3D
          features={osmFeatures}
          geoBounds={terrainGeoBounds}
          terrainElevationMap={terrainElevationMap}
          minElevation={terrainMetrics.minElevation}
        />
      )}

      {/* Preview de brocha de terreno */}
      {terrainBrushPreview && (
        <group>
          {(() => {
            const cells: Array<{ x: number; z: number; opacity: number }> = []
            const radius = Math.floor(terrainBrushPreview.size / 2)
            for (let dx = -radius; dx <= radius; dx++) {
              for (let dz = -radius; dz <= radius; dz++) {
                const distance = Math.sqrt(dx * dx + dz * dz)
                if (distance > radius + 0.001) continue
                const normalizedDistance = radius === 0 ? 0 : distance / (radius + 0.35)
                const falloff = radius === 0 ? 1 : Math.pow(Math.max(0, 1 - normalizedDistance), 1.4)
                if (falloff <= 0) continue
                cells.push({
                  x: terrainBrushPreview.center.x + dx,
                  z: terrainBrushPreview.center.z + dz,
                  opacity: 0.15 + 0.35 * falloff,
                })
              }
            }
            return cells.map((cell) => (
              <mesh
                key={`preview-${cell.x},${cell.z}`}
                rotation-x={-Math.PI / 2}
                position={[
                  cell.x + 0.5,
                  (terrainElevationMap.get(`${cell.x},${cell.z}`) ?? SEA_LEVEL_ELEVATION) + 0.08,
                  cell.z + 0.5,
                ]}
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
                  opacity={cell.opacity}
                  depthWrite={false}
                />
              </mesh>
            ))
          })()}
        </group>
      )}

      {/* Preview fantasma de colocación (verde válido / rojo inválido) */}
      {placementPreview && (
        <group>
          <mesh
            position={[
              placementPreview.position.x,
              placementPreview.floor + placementPreview.size.height / 2,
              placementPreview.position.z,
            ]}
            rotation-y={(placementPreview.rotation * Math.PI) / 180}
          >
            <boxGeometry args={[
              placementPreview.size.width,
              placementPreview.size.height,
              placementPreview.size.depth,
            ]} />
            <meshStandardMaterial
              color={placementPreview.valid ? '#22c55e' : '#ef4444'}
              transparent
              opacity={0.35}
              depthWrite={false}
            />
          </mesh>
          <mesh
            rotation-x={-Math.PI / 2}
            position={[placementPreview.position.x, placementPreview.floor + 0.05, placementPreview.position.z]}
          >
            <planeGeometry args={[placementPreview.size.width, placementPreview.size.depth]} />
            <meshBasicMaterial
              color={placementPreview.valid ? '#22c55e' : '#ef4444'}
              transparent
              opacity={0.25}
              depthWrite={false}
            />
          </mesh>

          {placementPreview.snapGuides?.map((guide, index) => {
            const centerX = (guide.from.x + guide.to.x) / 2
            const centerZ = (guide.from.z + guide.to.z) / 2
            const width = Math.abs(guide.to.x - guide.from.x)
            const depth = Math.abs(guide.to.z - guide.from.z)

            return (
              <mesh
                key={`snap-guide-${index}`}
                rotation-x={-Math.PI / 2}
                position={[centerX, placementPreview.floor + 0.08, centerZ]}
              >
                <planeGeometry args={[
                  guide.axis === 'z' ? Math.max(width, 0.08) : 0.08,
                  guide.axis === 'x' ? Math.max(depth, 0.08) : 0.08,
                ]} />
                <meshBasicMaterial
                  color={placementPreview.valid ? '#22c55e' : '#ef4444'}
                  transparent
                  opacity={0.6}
                  depthWrite={false}
                />
              </mesh>
            )
          })}
        </group>
      )}

      {/* Preview de bulldozer */}
      {bulldozerPreview && (
        <mesh
          rotation-x={-Math.PI / 2}
          position={[bulldozerPreview.x, viewerState.currentFloor + 0.06, bulldozerPreview.z]}
        >
          <planeGeometry args={[1, 1]} />
          <meshBasicMaterial color="#ef4444" transparent opacity={0.3} depthWrite={false} />
        </mesh>
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
        style={{ background: '#1a2530' }}
        onPointerMissed={() => props.onBackgroundClick?.()}
      >
        <Suspense fallback={<InCanvasLoader />}>
          <SceneContent {...props} />
        </Suspense>
      </Canvas>
    </div>
  )
}
