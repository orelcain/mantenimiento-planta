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
  /** Canvas con textura satelital para draping sobre el terreno */
  satelliteTextureCanvas?: HTMLCanvasElement | null
  /** Features OSM 3D (edificios, caminos, agua, landcover) */
  osmFeatures?: OSMFeatures | null
  /** Bounds georreferenciados del terreno para mapeo geo→grid */
  terrainGeoBounds?: TerrainGeoBounds | null
}

const TOPOGRAPHIC_COLOR_STOPS = [
  { stop: 0, color: new THREE.Color('#4f95bf') },
  { stop: 0.16, color: new THREE.Color('#78c1d1') },
  { stop: 0.28, color: new THREE.Color('#e7d9a3') },
  { stop: 0.48, color: new THREE.Color('#96bc73') },
  { stop: 0.7, color: new THREE.Color('#739763') },
  { stop: 0.86, color: new THREE.Color('#b18d68') },
  { stop: 1, color: new THREE.Color('#ddd6c5') },
]

function clamp01(value: number): number {
  return Math.max(0, Math.min(1, value))
}

function getTopographicColor(normalizedElevation: number): THREE.Color {
  const normalized = clamp01(normalizedElevation)

  for (let index = 0; index < TOPOGRAPHIC_COLOR_STOPS.length - 1; index++) {
    const current = TOPOGRAPHIC_COLOR_STOPS[index]
    const next = TOPOGRAPHIC_COLOR_STOPS[index + 1]
    if (!current || !next) continue

    if (normalized <= next.stop) {
      const range = Math.max(0.0001, next.stop - current.stop)
      const mix = clamp01((normalized - current.stop) / range)
      return current.color.clone().lerp(next.color, mix)
    }
  }

  const lastStop = TOPOGRAPHIC_COLOR_STOPS[TOPOGRAPHIC_COLOR_STOPS.length - 1]
  return (lastStop?.color ?? new THREE.Color('#c8c3b5')).clone()
}

function getContourIntersection(
  start: [number, number, number],
  end: [number, number, number],
  contourLevel: number
): [number, number, number] | null {
  const delta = end[1] - start[1]
  if (Math.abs(delta) < 0.0001) return null

  const t = (contourLevel - start[1]) / delta
  if (t < 0 || t > 1) return null

  return [
    start[0] + (end[0] - start[0]) * t,
    contourLevel + 0.14,
    start[2] + (end[2] - start[2]) * t,
  ]
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

  const terrainElevationMap = useMemo(() => {
    const map = new Map<string, number>()
    for (const tile of terrain ?? []) {
      map.set(`${tile.x},${tile.z}`, tile.elevation)
    }
    return map
  }, [terrain])

  const terrainMetrics = useMemo(() => {
    if (!terrain || terrain.length === 0) {
      return {
        minElevation: SEA_LEVEL_ELEVATION,
        maxElevation: SEA_LEVEL_ELEVATION,
        elevationRange: 1,
        baseElevation: MIN_TERRAIN_ELEVATION,
      }
    }

    let minElevation = Number.POSITIVE_INFINITY
    let maxElevation = Number.NEGATIVE_INFINITY

    for (const tile of terrain) {
      minElevation = Math.min(minElevation, tile.elevation)
      maxElevation = Math.max(maxElevation, tile.elevation)
    }

    const elevationRange = Math.max(1, maxElevation - minElevation)
    // Thinner cross-section for natural look (3-6m deep)
    const sideDepth = Math.max(3, Math.min(6, Math.round(elevationRange * 0.08)))

    return {
      minElevation,
      maxElevation,
      elevationRange,
      baseElevation: Math.max(MIN_TERRAIN_ELEVATION, minElevation - sideDepth),
    }
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
    const baseY = terrainMetrics.baseElevation

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
    const uvs: number[] = []
    const indices: number[] = []

    // Warm earth/rock tones for geological cross-section
    const cliffDark = new THREE.Color('#3a2a1a')
    const cliffLight = new THREE.Color('#8b7355')
    const bottomColor = new THREE.Color('#2a1f14')
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
      const normalized = (elevation - terrainMetrics.minElevation) / terrainMetrics.elevationRange
      color.copy(getTopographicColor(normalized))
      color.offsetHSL(0, 0.02, 0.08)
    }

    const pushVertex = (x: number, y: number, z: number, c: THREE.Color, u = 0, v = 0) => {
      positions.push(x, y + 0.02, z)
      colors.push(c.r, c.g, c.b)
      uvs.push(u, v)
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
      colorD: THREE.Color,
      uvA?: [number, number],
      uvB?: [number, number],
      uvC?: [number, number],
      uvD?: [number, number],
    ) => {
      const ia = pushVertex(a[0], a[1], a[2], colorA, uvA?.[0] ?? 0, uvA?.[1] ?? 0)
      const ib = pushVertex(b[0], b[1], b[2], colorB, uvB?.[0] ?? 0, uvB?.[1] ?? 0)
      const ic = pushVertex(c[0], c[1], c[2], colorC, uvC?.[0] ?? 0, uvC?.[1] ?? 0)
      const id = pushVertex(d[0], d[1], d[2], colorD, uvD?.[0] ?? 0, uvD?.[1] ?? 0)
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

        // UV coordinates mapping each cell to its normalized position across the full grid
        const u0 = ix / widthCells
        const u1 = (ix + 1) / widthCells
        const v0 = 1 - iz / depthCells        // flip V (texture top = north = iz=0)
        const v1 = 1 - (iz + 1) / depthCells

        pushQuad(
          [x, y00, z],
          [x + 1, y10, z],
          [x + 1, y11, z + 1],
          [x, y01, z + 1],
          c00,
          c10,
          c11,
          c01,
          [u0, v0],
          [u1, v0],
          [u1, v1],
          [u0, v1],
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

    // Boundary walls (masa lateral) — gradient top→bottom for geological strata
    for (let ix = 0; ix < widthCells; ix++) {
      const x1 = minX + ix
      const x2 = x1 + 1
      const y1 = getTopGrid(ix, 0)
      const y2 = getTopGrid(ix + 1, 0)

      const topMix = clamp01((Math.max(y1, y2) - terrainMetrics.minElevation) / terrainMetrics.elevationRange)
      const wallTop = cliffDark.clone().lerp(cliffLight, topMix * 0.8 + 0.2)
      const wallBottom = cliffDark.clone()

      // North
      pushQuad(
        [x1, y1, minZ],
        [x1, baseY, minZ],
        [x2, baseY, minZ],
        [x2, y2, minZ],
        wallTop,
        wallBottom,
        wallBottom,
        wallTop
      )

      const ys1 = getTopGrid(ix, depthCells)
      const ys2 = getTopGrid(ix + 1, depthCells)
      const topMixS = clamp01((Math.max(ys1, ys2) - terrainMetrics.minElevation) / terrainMetrics.elevationRange)
      const wallTopS = cliffDark.clone().lerp(cliffLight, topMixS * 0.8 + 0.2)
      const wallBottomS = cliffDark.clone()

      // South
      pushQuad(
        [x1, ys1, maxZ],
        [x2, ys2, maxZ],
        [x2, baseY, maxZ],
        [x1, baseY, maxZ],
        wallTopS,
        wallTopS,
        wallBottomS,
        wallBottomS
      )
    }

    for (let iz = 0; iz < depthCells; iz++) {
      const z1 = minZ + iz
      const z2 = z1 + 1
      const yw1 = getTopGrid(0, iz)
      const yw2 = getTopGrid(0, iz + 1)

      const topMixW = clamp01((Math.max(yw1, yw2) - terrainMetrics.minElevation) / terrainMetrics.elevationRange)
      const wallTopW = cliffDark.clone().lerp(cliffLight, topMixW * 0.8 + 0.2)
      const wallBottomW = cliffDark.clone()

      // West
      pushQuad(
        [minX, yw1, z1],
        [minX, yw2, z2],
        [minX, baseY, z2],
        [minX, baseY, z1],
        wallTopW,
        wallTopW,
        wallBottomW,
        wallBottomW
      )

      const ye1 = getTopGrid(widthCells, iz)
      const ye2 = getTopGrid(widthCells, iz + 1)
      const topMixE = clamp01((Math.max(ye1, ye2) - terrainMetrics.minElevation) / terrainMetrics.elevationRange)
      const wallTopE = cliffDark.clone().lerp(cliffLight, topMixE * 0.8 + 0.2)
      const wallBottomE = cliffDark.clone()

      // East
      pushQuad(
        [maxX, ye1, z1],
        [maxX, baseY, z1],
        [maxX, baseY, z2],
        [maxX, ye2, z2],
        wallTopE,
        wallBottomE,
        wallBottomE,
        wallTopE
      )
    }

    const geometry = new THREE.BufferGeometry()
    geometry.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3))
    geometry.setAttribute('color', new THREE.Float32BufferAttribute(colors, 3))
    geometry.setAttribute('uv', new THREE.Float32BufferAttribute(uvs, 2))
    geometry.setIndex(indices)
    geometry.computeVertexNormals()
    return geometry
  }, [terrain, terrainElevationMap, terrainMetrics, config.width, config.depth])

  const terrainContourGeometry = useMemo(() => {
    if (!terrain || terrain.length === 0) return null

    const minX = Math.floor(-config.width / 2)
    const maxX = Math.ceil(config.width / 2)
    const minZ = Math.floor(-config.depth / 2)
    const maxZ = Math.ceil(config.depth / 2)

    const widthCells = maxX - minX
    const depthCells = maxZ - minZ
    if (widthCells <= 0 || depthCells <= 0) return null

    const getCellElevation = (x: number, z: number) => terrainElevationMap.get(`${x},${z}`) ?? SEA_LEVEL_ELEVATION
    const getTopElevation = (vx: number, vz: number) => {
      const e1 = getCellElevation(vx - 1, vz - 1)
      const e2 = getCellElevation(vx, vz - 1)
      const e3 = getCellElevation(vx - 1, vz)
      const e4 = getCellElevation(vx, vz)
      return (e1 + e2 + e3 + e4) / 4
    }

    const contourInterval = terrainMetrics.elevationRange >= 80 ? 10 : 5
    const startLevel = Math.ceil(terrainMetrics.minElevation / contourInterval) * contourInterval
    const endLevel = Math.floor(terrainMetrics.maxElevation / contourInterval) * contourInterval
    const positions: number[] = []

    for (let iz = 0; iz < depthCells; iz++) {
      const z = minZ + iz

      for (let ix = 0; ix < widthCells; ix++) {
        const x = minX + ix
        const y00 = getTopElevation(x, z)
        const y10 = getTopElevation(x + 1, z)
        const y11 = getTopElevation(x + 1, z + 1)
        const y01 = getTopElevation(x, z + 1)

        for (let level = startLevel; level <= endLevel; level += contourInterval) {
          const intersections = [
            getContourIntersection([x, y00, z], [x + 1, y10, z], level),
            getContourIntersection([x + 1, y10, z], [x + 1, y11, z + 1], level),
            getContourIntersection([x + 1, y11, z + 1], [x, y01, z + 1], level),
            getContourIntersection([x, y01, z + 1], [x, y00, z], level),
          ].filter((point): point is [number, number, number] => point !== null)

          if (intersections.length < 2) continue

          for (let index = 0; index <= intersections.length - 2; index += 2) {
            const start = intersections[index]
            const end = intersections[index + 1]
            if (!start || !end) continue
            positions.push(start[0], start[1], start[2], end[0], end[1], end[2])
          }
        }
      }
    }

    if (positions.length === 0) return null

    const geometry = new THREE.BufferGeometry()
    geometry.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3))
    return geometry
  }, [terrain, terrainElevationMap, terrainMetrics, config.width, config.depth])

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
      {/* Background color */}
      <color attach="background" args={['#0c1a24']} />

      {/* Iluminación natural */}
      <ambientLight intensity={satelliteTextureCanvas ? 0.9 : 0.72} />
      <directionalLight
        position={[30, 45, 20]}
        intensity={satelliteTextureCanvas ? 1.4 : 1.1}
        color={satelliteTextureCanvas ? '#fffaf0' : '#fff4db'}
        castShadow
        shadow-mapSize-width={2048}
        shadow-mapSize-height={2048}
        shadow-camera-far={120}
        shadow-camera-left={-60}
        shadow-camera-right={60}
        shadow-camera-top={60}
        shadow-camera-bottom={-60}
      />
      <directionalLight position={[-18, 12, -22]} intensity={0.25} color="#96c8e8" />
      <hemisphereLight args={[satelliteTextureCanvas ? '#e8f4ff' : '#d7f0ff', '#1a1510', satelliteTextureCanvas ? 0.7 : 0.58]} />

      {/* Ambiente — niebla lejana para no oscurecer el terreno */}
      <fog attach="fog" args={['#0c1a24', 180, 400]} />

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

      {/* Terreno suavizado tipo heightfield (menos voxel/pixelado) */}
      {terrainSolidGeometry && !satelliteTextureCanvas && (
        <mesh geometry={terrainSolidGeometry} castShadow receiveShadow renderOrder={2}>
          <meshStandardMaterial
            vertexColors
            roughness={0.85}
            metalness={0}
            side={THREE.FrontSide}
          />
        </mesh>
      )}

      {/* Terreno con textura satelital + hillshade compuesto */}
      {terrainSolidGeometry && satelliteTextureCanvas && (
        <mesh geometry={terrainSolidGeometry} castShadow receiveShadow renderOrder={2}>
          <meshStandardMaterial
            roughness={0.88}
            metalness={0.02}
            side={THREE.FrontSide}
            envMapIntensity={0.3}
          >
            <canvasTexture
              attach="map"
              image={satelliteTextureCanvas}
              colorSpace={THREE.SRGBColorSpace}
              wrapS={THREE.ClampToEdgeWrapping}
              wrapT={THREE.ClampToEdgeWrapping}
              magFilter={THREE.LinearFilter}
              minFilter={THREE.LinearMipmapLinearFilter}
            />
          </meshStandardMaterial>
        </mesh>
      )}

      {/* Contornos solo sin textura satelital (con satélite el hillshade basta) */}
      {terrainContourGeometry && !satelliteTextureCanvas && (
        <lineSegments geometry={terrainContourGeometry} renderOrder={3}>
          <lineBasicMaterial
            color="#9fd8ff"
            transparent
            opacity={0.4}
            depthWrite={false}
          />
        </lineSegments>
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
