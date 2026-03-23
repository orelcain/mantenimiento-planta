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
        onPointerMissed={() => props.onBackgroundClick?.()}
      >
        <Suspense fallback={<InCanvasLoader />}>
          <SceneContent {...props} />
        </Suspense>
      </Canvas>
    </div>
  )
}
