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
import { SEA_LEVEL_ELEVATION, MIN_TERRAIN_ELEVATION } from '@/types/isometricMap'

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
  placementPreview,
  bulldozerPreview,
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

  const terrainElevationMap = useMemo(() => {
    const map = new Map<string, number>()
    for (const tile of terrain ?? []) {
      map.set(`${tile.x},${tile.z}`, tile.elevation)
    }
    return map
  }, [terrain])

  const terrainSolidGeometry = useMemo(() => {
    if (!terrain || terrain.length === 0) return null

    const minX = Math.floor(-config.width / 2)
    const maxX = Math.ceil(config.width / 2)
    const minZ = Math.floor(-config.depth / 2)
    const maxZ = Math.ceil(config.depth / 2)

    const widthCells = maxX - minX
    const depthCells = maxZ - minZ
    if (widthCells <= 0 || depthCells <= 0) return null
    const baseY = MIN_TERRAIN_ELEVATION

    const getCellElevation = (x: number, z: number) => terrainElevationMap.get(`${x},${z}`) ?? SEA_LEVEL_ELEVATION
    const getTopElevation = (vx: number, vz: number) => {
      const e1 = getCellElevation(vx - 1, vz - 1)
      const e2 = getCellElevation(vx, vz - 1)
      const e3 = getCellElevation(vx - 1, vz)
      const e4 = getCellElevation(vx, vz)
      return (e1 + e2 + e3 + e4) / 4
    }

    const positions: number[] = []
    const colors: number[] = []
    const indices: number[] = []

    const cliffDark = new THREE.Color('#3f4c32')
    const cliffLight = new THREE.Color('#6b7f4c')
    const bottomColor = new THREE.Color('#2f3a24')
    const color = new THREE.Color()

    const topHeightGrid: number[][] = []
    for (let iz = 0; iz <= depthCells; iz++) {
      const row: number[] = []
      const z = minZ + iz
      for (let ix = 0; ix <= widthCells; ix++) {
        const x = minX + ix
        row.push(getTopElevation(x, z))
      }
      topHeightGrid.push(row)
    }

    const getTopGrid = (ix: number, iz: number) => topHeightGrid[iz]?.[ix] ?? SEA_LEVEL_ELEVATION

    const setTopColor = (elevation: number) => {
      const meter = Math.round(elevation)
      const isPositive = meter >= SEA_LEVEL_ELEVATION
      const t = isPositive
        ? Math.min(1, meter / 200)
        : Math.min(1, Math.abs(meter) / 50)

      const hue = isPositive ? 118 - 56 * t : 205 + 18 * t
      const saturation = isPositive ? 50 + 22 * t : 60 + 18 * t
      let lightness = isPositive ? 32 + 22 * t : 30 + 18 * t

      // Banda cada metro para diferenciar alturas rápidamente.
      lightness += Math.abs(meter) % 2 === 0 ? 5 : -2
      lightness = Math.max(18, Math.min(78, lightness))

      color.setHSL(hue / 360, saturation / 100, lightness / 100)
    }

    const pushVertex = (x: number, y: number, z: number, c: THREE.Color) => {
      positions.push(x, y + 0.02, z)
      colors.push(c.r, c.g, c.b)
      return positions.length / 3 - 1
    }

    const pushQuad = (
      a: [number, number, number],
      b: [number, number, number],
      c: [number, number, number],
      d: [number, number, number],
      colorA: THREE.Color,
      colorB: THREE.Color,
      colorC: THREE.Color,
      colorD: THREE.Color
    ) => {
      const ia = pushVertex(a[0], a[1], a[2], colorA)
      const ib = pushVertex(b[0], b[1], b[2], colorB)
      const ic = pushVertex(c[0], c[1], c[2], colorC)
      const id = pushVertex(d[0], d[1], d[2], colorD)
      indices.push(ia, ib, ic)
      indices.push(ia, ic, id)
    }

    // Top surface (suavizada)
    for (let iz = 0; iz < depthCells; iz++) {
      const z = minZ + iz
      for (let ix = 0; ix < widthCells; ix++) {
        const x = minX + ix

        const y00 = getTopGrid(ix, iz)
        const y10 = getTopGrid(ix + 1, iz)
        const y11 = getTopGrid(ix + 1, iz + 1)
        const y01 = getTopGrid(ix, iz + 1)

        setTopColor(y00)
        const c00 = color.clone()
        setTopColor(y10)
        const c10 = color.clone()
        setTopColor(y11)
        const c11 = color.clone()
        setTopColor(y01)
        const c01 = color.clone()

        pushQuad(
          [x, y00, z],
          [x + 1, y10, z],
          [x + 1, y11, z + 1],
          [x, y01, z + 1],
          c00,
          c10,
          c11,
          c01
        )
      }
    }

    // Bottom face (base sólida)
    pushQuad(
      [minX, baseY, minZ],
      [minX, baseY, maxZ],
      [maxX, baseY, maxZ],
      [maxX, baseY, minZ],
      bottomColor,
      bottomColor,
      bottomColor,
      bottomColor
    )

    // Boundary walls (masa lateral)
    for (let ix = 0; ix < widthCells; ix++) {
      const x1 = minX + ix
      const x2 = x1 + 1
      const y1 = getTopGrid(ix, 0)
      const y2 = getTopGrid(ix + 1, 0)

      const wallColorA = cliffDark.clone().lerp(cliffLight, Math.min(1, Math.max(y1, y2) / 200))
      const wallColorB = wallColorA.clone()

      // North
      pushQuad(
        [x1, y1, minZ],
        [x1, baseY, minZ],
        [x2, baseY, minZ],
        [x2, y2, minZ],
        wallColorA,
        wallColorA,
        wallColorB,
        wallColorB
      )

      const ys1 = getTopGrid(ix, depthCells)
      const ys2 = getTopGrid(ix + 1, depthCells)
      const wallSouthA = cliffDark.clone().lerp(cliffLight, Math.min(1, Math.max(ys1, ys2) / 200))
      const wallSouthB = wallSouthA.clone()

      // South
      pushQuad(
        [x1, ys1, maxZ],
        [x2, ys2, maxZ],
        [x2, baseY, maxZ],
        [x1, baseY, maxZ],
        wallSouthA,
        wallSouthB,
        wallSouthB,
        wallSouthA
      )
    }

    for (let iz = 0; iz < depthCells; iz++) {
      const z1 = minZ + iz
      const z2 = z1 + 1
      const yw1 = getTopGrid(0, iz)
      const yw2 = getTopGrid(0, iz + 1)

      const wallWestA = cliffDark.clone().lerp(cliffLight, Math.min(1, Math.max(yw1, yw2) / 200))
      const wallWestB = wallWestA.clone()

      // West
      pushQuad(
        [minX, yw1, z1],
        [minX, yw2, z2],
        [minX, baseY, z2],
        [minX, baseY, z1],
        wallWestA,
        wallWestB,
        wallWestB,
        wallWestA
      )

      const ye1 = getTopGrid(widthCells, iz)
      const ye2 = getTopGrid(widthCells, iz + 1)
      const wallEastA = cliffDark.clone().lerp(cliffLight, Math.min(1, Math.max(ye1, ye2) / 200))
      const wallEastB = wallEastA.clone()

      // East
      pushQuad(
        [maxX, ye1, z1],
        [maxX, baseY, z1],
        [maxX, baseY, z2],
        [maxX, ye2, z2],
        wallEastA,
        wallEastA,
        wallEastB,
        wallEastB
      )
    }

    const geometry = new THREE.BufferGeometry()
    geometry.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3))
    geometry.setAttribute('color', new THREE.Float32BufferAttribute(colors, 3))
    geometry.setIndex(indices)
    geometry.computeVertexNormals()
    return geometry
  }, [terrain, terrainElevationMap, config.width, config.depth])

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

      {/* Terreno suavizado tipo heightfield (menos voxel/pixelado) */}
      {terrainSolidGeometry && (
        <mesh geometry={terrainSolidGeometry} castShadow receiveShadow>
          <meshStandardMaterial
            vertexColors
            roughness={0.94}
            metalness={0.02}
            side={THREE.DoubleSide}
          />
        </mesh>
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
