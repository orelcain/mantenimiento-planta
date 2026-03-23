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
import * as THREE from 'three'
import { IsometricCamera } from './IsometricCamera'
import { EquipmentNode } from './EquipmentNode'
import { DraggableNode } from './editor/DraggableNode'
import { MapAreaOverlay } from './MapAreaOverlay'
import { MapConnector } from './MapConnector'
import { OSMOverlay3D } from './OSMOverlay3D'
import { TerrainMesh, useTerrainData } from './TerrainMesh'
import { SceneEnvironment } from './SceneEnvironment'
import { UnderlayImage } from './UnderlayImage'
import { EditorPreviews } from './EditorPreviews'
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

// ── Grouped prop interfaces ──

export interface UnderlayProps {
  imageUrl?: string | null
  displayMode?: 'original' | 'soft-light' | 'blueprint'
  opacity?: number
  width?: number
  depth?: number
  offset?: { x: number; z: number }
  rotation?: number
  interactionMode?: 'move' | 'scale' | 'rotate' | null
  onTransform?: (next: {
    width?: number; depth?: number; offsetX?: number; offsetZ?: number; rotation?: number
  }) => void
}

export interface EntityProps {
  nodes: MapNode[]
  connectors: MapConnectorType[]
  areas: MapArea[]
  selectedAreaId?: string | null
  highlightedAreaId?: string | null
  runtimeData: Map<string, NodeRuntimeData>
  visibleNodeIds?: Set<string>
}

export interface TerrainDataProps {
  terrain?: TerrainTile[]
  satelliteTextureCanvas?: HTMLCanvasElement | null
  terrainGeoBounds?: TerrainGeoBounds | null
}

export interface EditorPreviewsProps {
  terrainBrushPreview?: {
    center: { x: number; z: number }
    size: 1 | 3 | 5 | 7 | 9
    mode: 'raise' | 'lower' | 'flatten' | 'smooth' | 'sample'
  } | null
  placementPreview?: {
    position: { x: number; z: number }
    floor: number
    size: { width: number; height: number; depth: number }
    rotation: number
    valid: boolean
    snapGuides?: Array<{ axis: 'x' | 'z'; from: { x: number; z: number }; to: { x: number; z: number } }>
  } | null
  bulldozerPreview?: { x: number; z: number } | null
  paintTiles?: { tiles: Set<string>; color: string; opacity: number }
}

export interface SceneCallbacks {
  onNodeClick?: (nodeId: string) => void
  onNodeHover?: (nodeId: string | null) => void
  onAreaClick?: (areaId: string) => void
  onBackgroundClick?: () => void
  onNodeDragEnd?: (
    nodeId: string,
    newPosition: { x: number; y: number; z: number },
    options?: { duplicate?: boolean }
  ) => void
  onFloorClick?: (position: { x: number; z: number }) => void
  onFloorDrag?: (position: { x: number; z: number }) => void
  onFloorHover?: (position: { x: number; z: number } | null) => void
}

interface IsometricSceneProps {
  config: IsometricMapConfig
  viewerState: IsometricViewerState
  underlay?: UnderlayProps
  entities: EntityProps
  terrainData?: TerrainDataProps
  previews?: EditorPreviewsProps
  callbacks?: SceneCallbacks
  osmFeatures?: OSMFeatures | null
}

/** Contenido de la escena (dentro del Canvas) */
function SceneContent({
  config,
  viewerState,
  underlay,
  entities,
  terrainData,
  previews,
  callbacks,
  osmFeatures,
}: IsometricSceneProps) {
  // Destructure grouped props for convenience
  const { imageUrl: underlayImageUrl, displayMode: underlayDisplayMode, opacity: underlayOpacity,
    width: underlayWidth, depth: underlayDepth, offset: underlayOffset, rotation: underlayRotation,
    interactionMode: underlayInteractionMode, onTransform: onUnderlayTransform } = underlay ?? {}
  const { nodes, connectors, areas, selectedAreaId, highlightedAreaId, runtimeData, visibleNodeIds } = entities
  const { terrain, satelliteTextureCanvas, terrainGeoBounds } = terrainData ?? {}
  const { terrainBrushPreview, placementPreview, bulldozerPreview, paintTiles } = previews ?? {}
  const { onNodeClick, onNodeHover, onAreaClick, onBackgroundClick, onNodeDragEnd,
    onFloorClick, onFloorDrag, onFloorHover } = callbacks ?? {}
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

      {/* Underlay (plano base raster) */}
      {underlayImageUrl && (
        <UnderlayImage
          imageUrl={underlayImageUrl}
          displayMode={underlayDisplayMode}
          opacity={underlayOpacity}
          width={underlayWidth}
          depth={underlayDepth}
          offset={underlayOffset}
          rotation={underlayRotation}
          interactionMode={underlayInteractionMode}
          onTransform={onUnderlayTransform}
          config={config}
        />
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

      {/* Editor previews (brush, placement, bulldozer, paint tiles) */}
      <EditorPreviews
        terrainBrushPreview={terrainBrushPreview}
        placementPreview={placementPreview}
        bulldozerPreview={bulldozerPreview}
        paintTiles={paintTiles}
        currentFloor={viewerState.currentFloor}
        terrainElevationMap={terrainElevationMap}
      />

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
        onPointerMissed={() => props.callbacks?.onBackgroundClick?.()}
      >
        <Suspense fallback={<InCanvasLoader />}>
          <SceneContent {...props} />
        </Suspense>
      </Canvas>
    </div>
  )
}
