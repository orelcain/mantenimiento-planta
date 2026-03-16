import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { Canvas, useFrame, useThree } from '@react-three/fiber'
import { OrbitControls } from '@react-three/drei'
import * as THREE from 'three'

import { Badge } from '@/components/ui'
import { Button } from '@/components/ui/button'
import { BarChart3, Compass, Layers, MapPin, Ruler, X } from 'lucide-react'
import { CompassWidget } from '@/components/map/isometric/CompassWidget'
import {
  estimateRectangleMeters,
  parseCoordinatesText,
  type GeoCoordinate,
  type TerrainImportPreview,
} from '@/lib/terrainImport'

/* ── Types ─────────────────────────────────────────────────────── */

interface TerrainGeoPreviewProps {
  coordinatesText: string
  preview?: TerrainImportPreview | null
  previewError?: string | null
  statusMessage?: string | null
  isImporting: boolean
  mapHeightClassName?: string
}

type QuadCorners = [GeoCoordinate, GeoCoordinate, GeoCoordinate, GeoCoordinate]

type BrushTool = 'none' | 'raise' | 'lower' | 'smooth' | 'flatten'

interface TerrainPayload {
  texture: THREE.CanvasTexture
  elevations: number[]
  waterMask: boolean[]
  cols: number
  rows: number
  meshWidth: number
  meshDepth: number
  minElev: number
  maxElev: number
  realWidth: number
  realDepth: number
}

interface TerrainEditCallbacks {
  onHoverInfo: (info: { elevation: number; gridR: number; gridC: number } | null) => void
  onBrushApply: (centerR: number, centerC: number) => void
  onMeasurePoint: (point: { elevation: number; gridR: number; gridC: number }) => void
  brushTool: BrushTool
  brushRadius: number
  measureMode: boolean
}

interface MeasureMarker {
  elevation: number
  gridR: number
  gridC: number
}

/* ── Constants ─────────────────────────────────────────────────── */

const GRID = 128
const TILE_Z = 17
const DEM_Z = 14
const SCALE = 10

/* ── Helpers ───────────────────────────────────────────────────── */

function asQuadCorners(list: GeoCoordinate[]): QuadCorners {
  if (list.length !== 4) throw new Error(`Se requieren 4 coordenadas (recibidas ${list.length})`)
  const [a, b, c, d] = list
  if (!a || !b || !c || !d) throw new Error('Coordenadas incompletas')
  return [a, b, c, d]
}

function boundsOf(corners: QuadCorners) {
  const lats = corners.map((c) => c.lat)
  const lons = corners.map((c) => c.lon)
  return { south: Math.min(...lats), north: Math.max(...lats), west: Math.min(...lons), east: Math.max(...lons) }
}

function lonLatToTile(lon: number, lat: number, z: number) {
  const n = 2 ** z
  const r = (lat * Math.PI) / 180
  return {
    x: Math.floor(((lon + 180) / 360) * n),
    y: Math.floor((1 - Math.log(Math.tan(r) + 1 / Math.cos(r)) / Math.PI) / 2 * n),
  }
}

function tileToLonLat(x: number, y: number, z: number) {
  const n = 2 ** z
  return {
    lon: (x / n) * 360 - 180,
    lat: (Math.atan(Math.sinh(Math.PI * (1 - (2 * y) / n))) * 180) / Math.PI,
  }
}

function gridToGeo(corners: QuadCorners, gridR: number, gridC: number, rows: number, cols: number) {
  const { south, north, west, east } = boundsOf(corners)
  const u = cols > 1 ? gridC / (cols - 1) : 0
  const v = rows > 1 ? gridR / (rows - 1) : 0
  return {
    lat: north - (north - south) * v,
    lon: west + (east - west) * u,
  }
}

function CameraAzimuthProbe({ onChange }: { onChange: (deg: number) => void }) {
  const { camera } = useThree()
  const lastSentRef = useRef<number | null>(null)

  useFrame(() => {
    const azimuthDeg = (Math.atan2(camera.position.x, camera.position.z) * 180) / Math.PI
    if (lastSentRef.current !== null && Math.abs(lastSentRef.current - azimuthDeg) < 0.5) return
    lastSentRef.current = azimuthDeg
    onChange(azimuthDeg)
  })

  return null
}

/* ── Satellite imagery → Canvas ────────────────────────────────── */

async function fetchSatelliteCanvas(corners: QuadCorners): Promise<HTMLCanvasElement> {
  const { south, north, west, east } = boundsOf(corners)
  const nw = lonLatToTile(west, north, TILE_Z)
  const se = lonLatToTile(east, south, TILE_Z)
  const nx = se.x - nw.x + 1
  const ny = se.y - nw.y + 1

  const big = document.createElement('canvas')
  big.width = nx * 256
  big.height = ny * 256
  const ctx = big.getContext('2d')
  if (!ctx) throw new Error('Canvas 2D no disponible')

  const jobs: Promise<void>[] = []
  for (let dy = 0; dy < ny; dy++) {
    for (let dx = 0; dx < nx; dx++) {
      jobs.push(
        new Promise<void>((ok) => {
          const img = new Image()
          img.crossOrigin = 'anonymous'
          img.onload = () => { ctx.drawImage(img, dx * 256, dy * 256); ok() }
          img.onerror = () => ok()
          img.src = `https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/${TILE_Z}/${nw.y + dy}/${nw.x + dx}`
        }),
      )
    }
  }
  await Promise.all(jobs)

  const tl = tileToLonLat(nw.x, nw.y, TILE_Z)
  const br = tileToLonLat(se.x + 1, se.y + 1, TILE_Z)
  const lonSpan = br.lon - tl.lon
  const latSpan = tl.lat - br.lat
  const cl = ((west - tl.lon) / lonSpan) * big.width
  const ct = ((tl.lat - north) / latSpan) * big.height
  const cw = ((east - west) / lonSpan) * big.width
  const ch = ((north - south) / latSpan) * big.height

  const out = document.createElement('canvas')
  out.width = 1024
  out.height = 1024
  const outCtx = out.getContext('2d')
  if (!outCtx) throw new Error('Canvas 2D no disponible')
  outCtx.drawImage(big, Math.round(cl), Math.round(ct), Math.round(cw), Math.round(ch), 0, 0, 1024, 1024)
  return out
}

/* ── Water detection from satellite imagery ─────────────────────── */

function detectWaterMask(satCanvas: HTMLCanvasElement, cols: number, rows: number): boolean[] {
  const ctx = satCanvas.getContext('2d', { willReadFrequently: true })
  if (!ctx) return new Array(cols * rows).fill(false)

  const imgData = ctx.getImageData(0, 0, satCanvas.width, satCanvas.height)
  const px = imgData.data
  const mask: boolean[] = []

  for (let r = 0; r < rows; r++) {
    for (let c = 0; c < cols; c++) {
      // Sample a small region (3×3) centered on this grid point
      const sx = Math.round((c / (cols - 1)) * (satCanvas.width - 1))
      const sy = Math.round((r / (rows - 1)) * (satCanvas.height - 1))
      let waterVotes = 0
      let total = 0
      for (let dy = -1; dy <= 1; dy++) {
        for (let dx = -1; dx <= 1; dx++) {
          const px2 = Math.max(0, Math.min(satCanvas.width - 1, sx + dx))
          const py2 = Math.max(0, Math.min(satCanvas.height - 1, sy + dy))
          const i = (py2 * satCanvas.width + px2) * 4
          const red = px[i]!
          const green = px[i + 1]!
          const blue = px[i + 2]!
          const brightness = (red + green + blue) / 3
          // Water detection heuristic: dark pixels where blue dominates
          // or very dark overall (deep ocean)
          const isWater = (brightness < 80 && blue >= red * 0.9) ||
                          (brightness < 45) ||
                          (blue > red * 1.15 && blue > green && brightness < 110)
          if (isWater) waterVotes++
          total++
        }
      }
      mask.push(waterVotes > total / 2)
    }
  }
  return mask
}

/* ── Elevation from Terrarium DEM tiles (same source as maps3d.io) ── */

async function fetchElevationGrid(corners: QuadCorners, cols: number, rows: number) {
  const { south, north, west, east } = boundsOf(corners)
  const nwT = lonLatToTile(west, north, DEM_Z)
  const seT = lonLatToTile(east, south, DEM_Z)
  const nx = seT.x - nwT.x + 1
  const ny = seT.y - nwT.y + 1

  const big = document.createElement('canvas')
  big.width = nx * 256
  big.height = ny * 256
  const ctx = big.getContext('2d', { willReadFrequently: true })
  if (!ctx) throw new Error('Canvas 2D no disponible')

  const jobs: Promise<void>[] = []
  for (let dy = 0; dy < ny; dy++) {
    for (let dx = 0; dx < nx; dx++) {
      jobs.push(
        new Promise<void>((ok) => {
          const img = new Image()
          img.crossOrigin = 'anonymous'
          img.onload = () => { ctx.drawImage(img, dx * 256, dy * 256); ok() }
          img.onerror = () => ok()
          img.src = `https://s3.amazonaws.com/elevation-tiles-prod/terrarium/${DEM_Z}/${nwT.x + dx}/${nwT.y + dy}.png`
        }),
      )
    }
  }
  await Promise.all(jobs)

  let px: Uint8ClampedArray
  try {
    const imgData = ctx.getImageData(0, 0, big.width, big.height)
    px = imgData.data
  } catch {
    // CORS tainted canvas — return flat grid at 0
    return new Array(cols * rows).fill(0)
  }

  const tl = tileToLonLat(nwT.x, nwT.y, DEM_Z)
  const br = tileToLonLat(seT.x + 1, seT.y + 1, DEM_Z)

  // Decode Terrarium elevation at pixel coordinate
  const readElev = (ix: number, iy: number) => {
    const i = (iy * big.width + ix) * 4
    return ((px[i] ?? 0) * 256 + (px[i + 1] ?? 0) + (px[i + 2] ?? 0) / 256) - 32768
  }

  const elevations: number[] = []
  for (let r = 0; r < rows; r++) {
    const lat = north - (r / (rows - 1)) * (north - south)
    for (let c = 0; c < cols; c++) {
      const lon = west + (c / (cols - 1)) * (east - west)
      // Bilinear interpolation for smoother terrain
      const fX = ((lon - tl.lon) / (br.lon - tl.lon)) * (big.width - 1)
      const fY = ((tl.lat - lat) / (tl.lat - br.lat)) * (big.height - 1)
      const x0 = Math.max(0, Math.min(big.width - 2, Math.floor(fX)))
      const y0 = Math.max(0, Math.min(big.height - 2, Math.floor(fY)))
      const fx = fX - x0
      const fy = fY - y0
      const e00 = readElev(x0, y0)
      const e10 = readElev(x0 + 1, y0)
      const e01 = readElev(x0, y0 + 1)
      const e11 = readElev(x0 + 1, y0 + 1)
      const elev = e00 * (1 - fx) * (1 - fy) + e10 * fx * (1 - fy) + e01 * (1 - fx) * fy + e11 * fx * fy
      elevations.push(Math.max(0, elev))
    }
  }

  return elevations
}

/* ── Smooth elevation grid (Gaussian blur — reduces DEM noise) ── */

function smoothElevations(elev: number[], cols: number, rows: number, passes = 1): number[] {
  let cur = [...elev]
  for (let p = 0; p < passes; p++) {
    const nxt = [...cur]
    for (let r = 1; r < rows - 1; r++) {
      for (let c = 1; c < cols - 1; c++) {
        const idx = r * cols + c
        nxt[idx] = (
          cur[(r - 1) * cols + c - 1]! + cur[(r - 1) * cols + c]! * 2 + cur[(r - 1) * cols + c + 1]! +
          cur[r * cols + c - 1]! * 2 + cur[r * cols + c]! * 4 + cur[r * cols + c + 1]! * 2 +
          cur[(r + 1) * cols + c - 1]! + cur[(r + 1) * cols + c]! * 2 + cur[(r + 1) * cols + c + 1]!
        ) / 16
      }
    }
    cur = nxt
  }
  return cur
}

function applyWaterMaskAndThreshold(
  elev: number[],
  waterMask: boolean[],
  seaThreshold: number,
  cols: number,
  rows: number,
): number[] {
  const result = [...elev]

  // 1. Force water pixels to 0
  for (let i = 0; i < result.length; i++) {
    if (waterMask[i]) result[i] = 0
  }

  // 2. Clamp elevations below threshold to 0 (DEM noise near coast)
  for (let i = 0; i < result.length; i++) {
    if (result[i]! < seaThreshold) result[i] = 0
  }

  // 3. Extra smooth only coastal transition (land pixels adjacent to water)
  for (let pass = 0; pass < 3; pass++) {
    const nxt = [...result]
    for (let r = 1; r < rows - 1; r++) {
      for (let c = 1; c < cols - 1; c++) {
        const idx = r * cols + c
        if (result[idx] === 0) continue // skip water
        // Check if any neighbor is water
        const hasWaterNeighbor =
          result[(r - 1) * cols + c] === 0 || result[(r + 1) * cols + c] === 0 ||
          result[r * cols + c - 1] === 0 || result[r * cols + c + 1] === 0
        if (!hasWaterNeighbor) continue
        // Smooth toward water — blend with neighbors
        nxt[idx] = (
          result[(r - 1) * cols + c]! + result[(r + 1) * cols + c]! +
          result[r * cols + c - 1]! + result[r * cols + c + 1]! +
          result[idx]! * 2
        ) / 6
      }
    }
    for (let i = 0; i < result.length; i++) result[i] = nxt[i]!
  }

  return result
}

function applyEdgeFeathering(elev: number[], cols: number, rows: number, borderSize = 10): number[] {
  const result = [...elev]

  for (let r = 0; r < rows; r++) {
    for (let c = 0; c < cols; c++) {
      const idx = r * cols + c
      const distToEdge = Math.min(r, c, rows - 1 - r, cols - 1 - c)
      if (distToEdge >= borderSize) continue
      const t = Math.max(0, Math.min(1, distToEdge / borderSize))
      const smooth = t * t * (3 - 2 * t)
      result[idx] = result[idx]! * smooth
    }
  }

  return result
}

/* ── R3F: Terrain island with raycasting + brush editing ────── */

function TerrainIsland({
  data, exaggeration, edit,
}: {
  data: TerrainPayload
  exaggeration: number
  edit: TerrainEditCallbacks
}) {
  const { texture, elevations, cols, rows, meshWidth, meshDepth, minElev, maxElev, realWidth } = data
  const elevRange = Math.max(0.1, maxElev - minElev)
  const hScale = (meshWidth / realWidth) * exaggeration
  const wallDepth = Math.min(meshWidth * 0.08, elevRange * hScale * 0.22) + 0.08

  const topRef = useRef<THREE.Mesh>(null)
  const cursorRef = useRef<THREE.Mesh>(null)
  const raycaster = useMemo(() => new THREE.Raycaster(), [])
  const pointer = useRef(new THREE.Vector2(9999, 9999))
  const isPainting = useRef(false)
  const lastPaintTime = useRef(0)
  const currentHoverRef = useRef<{ elevation: number; gridR: number; gridC: number } | null>(null)
  const { camera, gl } = useThree()

  // Track mouse position
  useEffect(() => {
    const el = gl.domElement
    const onMove = (e: PointerEvent) => {
      const rect = el.getBoundingClientRect()
      pointer.current.x = ((e.clientX - rect.left) / rect.width) * 2 - 1
      pointer.current.y = -((e.clientY - rect.top) / rect.height) * 2 + 1
    }
    const onDown = (e: PointerEvent) => {
      if (e.button !== 0) return
      if (edit.measureMode && currentHoverRef.current) {
        edit.onMeasurePoint(currentHoverRef.current)
        return
      }
      if (edit.brushTool !== 'none') isPainting.current = true
    }
    const onUp = () => { isPainting.current = false }
    const onLeave = () => {
      pointer.current.set(9999, 9999)
      isPainting.current = false
      currentHoverRef.current = null
      edit.onHoverInfo(null)
    }
    el.addEventListener('pointermove', onMove)
    el.addEventListener('pointerdown', onDown)
    el.addEventListener('pointerup', onUp)
    el.addEventListener('pointerleave', onLeave)
    return () => {
      el.removeEventListener('pointermove', onMove)
      el.removeEventListener('pointerdown', onDown)
      el.removeEventListener('pointerup', onUp)
      el.removeEventListener('pointerleave', onLeave)
    }
  }, [gl, edit])

  // Raycast each frame
  useFrame(() => {
    if (!topRef.current) return
    raycaster.setFromCamera(pointer.current, camera)
    const hits = raycaster.intersectObject(topRef.current)
    if (hits.length === 0) {
      if (cursorRef.current) cursorRef.current.visible = false
      return
    }
    const pt = hits[0]!.point
    // Map hit point back to grid coordinates
    const normX = (pt.x / meshWidth) + 0.5
    const normZ = (pt.z / meshDepth) + 0.5
    const gridC = Math.round(normX * (cols - 1))
    const gridR = Math.round(normZ * (rows - 1))
    if (gridR >= 0 && gridR < rows && gridC >= 0 && gridC < cols) {
      const elev = elevations[gridR * cols + gridC] ?? 0
      currentHoverRef.current = { elevation: elev, gridR, gridC }
      edit.onHoverInfo(currentHoverRef.current)
    }
    // Position brush cursor ring
    if (cursorRef.current && edit.brushTool !== 'none') {
      cursorRef.current.visible = true
      cursorRef.current.position.set(pt.x, pt.y + 0.02, pt.z)
      const worldRadius = (edit.brushRadius / (cols - 1)) * meshWidth
      cursorRef.current.scale.set(worldRadius, worldRadius, worldRadius)
    } else if (cursorRef.current) {
      cursorRef.current.visible = false
    }
    // Apply brush while painting
    if (isPainting.current && edit.brushTool !== 'none') {
      const now = performance.now()
      if (now - lastPaintTime.current > 50) {
        lastPaintTime.current = now
        edit.onBrushApply(gridR, gridC)
      }
    }
  })

  const { topGeo, sideGeo, botGeo } = useMemo(() => {
    const top = new THREE.PlaneGeometry(meshWidth, meshDepth, cols - 1, rows - 1)
    top.rotateX(-Math.PI / 2)
    const pos = top.attributes.position as THREE.BufferAttribute

    for (let i = 0; i < pos.count; i++) {
      const r = Math.floor(i / cols)
      const c = i % cols
      pos.setY(i, ((elevations[r * cols + c] ?? minElev) - minElev) * hScale)
    }
    pos.needsUpdate = true
    top.computeVertexNormals()

    const baseY = -wallDepth
    const sv: number[] = []

    const addWall = (x1: number, y1: number, z1: number, x2: number, y2: number, z2: number) => {
      sv.push(x1, y1, z1, x2, y2, z2, x1, baseY, z1)
      sv.push(x2, y2, z2, x2, baseY, z2, x1, baseY, z1)
    }

    for (let c = 0; c < cols - 1; c++) {
      addWall(pos.getX(c), pos.getY(c), pos.getZ(c), pos.getX(c + 1), pos.getY(c + 1), pos.getZ(c + 1))
    }
    for (let c = 0; c < cols - 1; c++) {
      const base = (rows - 1) * cols
      addWall(
        pos.getX(base + c + 1), pos.getY(base + c + 1), pos.getZ(base + c + 1),
        pos.getX(base + c), pos.getY(base + c), pos.getZ(base + c),
      )
    }
    for (let r = 0; r < rows - 1; r++) {
      const i1 = (r + 1) * cols
      const i2 = r * cols
      addWall(pos.getX(i1), pos.getY(i1), pos.getZ(i1), pos.getX(i2), pos.getY(i2), pos.getZ(i2))
    }
    for (let r = 0; r < rows - 1; r++) {
      const i1 = r * cols + cols - 1
      const i2 = (r + 1) * cols + cols - 1
      addWall(pos.getX(i1), pos.getY(i1), pos.getZ(i1), pos.getX(i2), pos.getY(i2), pos.getZ(i2))
    }

    const side = new THREE.BufferGeometry()
    side.setAttribute('position', new THREE.Float32BufferAttribute(sv, 3))
    side.computeVertexNormals()

    const bot = new THREE.PlaneGeometry(meshWidth, meshDepth)
    bot.rotateX(Math.PI / 2)
    bot.translate(0, baseY, 0)

    return { topGeo: top, sideGeo: side, botGeo: bot }
  }, [elevations, cols, rows, meshWidth, meshDepth, minElev, hScale, wallDepth])

  // Brush cursor ring geometry
  const cursorGeo = useMemo(() => {
    const geo = new THREE.RingGeometry(0.9, 1, 32)
    geo.rotateX(-Math.PI / 2)
    return geo
  }, [])

  return (
    <group>
      <mesh ref={topRef} geometry={topGeo}>
        <meshStandardMaterial map={texture} color="#e7e0d2" roughness={0.96} metalness={0.02} />
      </mesh>
      <mesh geometry={sideGeo}>
        <meshStandardMaterial color="#756650" roughness={1} side={THREE.DoubleSide} />
      </mesh>
      <mesh geometry={botGeo}>
        <meshStandardMaterial color="#4a3f30" roughness={1} />
      </mesh>
      <mesh position={[0, 0.005, 0]} rotation={[-Math.PI / 2, 0, 0]}>
        <planeGeometry args={[meshWidth * 1.3, meshDepth * 1.3]} />
        <meshStandardMaterial color="#1d6f8a" transparent opacity={0.72} roughness={0.08} metalness={0.22} />
      </mesh>
      {/* Brush cursor */}
      <mesh ref={cursorRef} geometry={cursorGeo} visible={false}>
        <meshBasicMaterial color="#fbbf24" transparent opacity={0.8} side={THREE.DoubleSide} />
      </mesh>
    </group>
  )
}

/* ── Main component ────────────────────────────────────────────── */

export function TerrainGeoPreview({
  coordinatesText,
  preview,
  previewError,
  statusMessage,
  isImporting,
  mapHeightClassName = 'h-[460px] md:h-[560px] xl:h-[640px]',
}: TerrainGeoPreviewProps) {
  const [terrainData, setTerrainData] = useState<TerrainPayload | null>(null)
  const [loading, setLoading] = useState('')
  const [exaggeration, setExaggeration] = useState(1.05)
  const [seaThreshold, setSeaThreshold] = useState(3)
  const [autoRotate, setAutoRotate] = useState(true)
  const [brushTool, setBrushTool] = useState<BrushTool>('none')
  const [brushRadius, setBrushRadius] = useState(5)
  const [brushStrength, setBrushStrength] = useState(2)
  const [hoverInfo, setHoverInfo] = useState<{ elevation: number; gridR: number; gridC: number } | null>(null)
  const [editCount, setEditCount] = useState(0)
  const [showCompass, setShowCompass] = useState(true)
  const [showMinimap, setShowMinimap] = useState(true)
  const [showStats, setShowStats] = useState(false)
  const [showGeoCoords, setShowGeoCoords] = useState(false)
  const [measureMode, setMeasureMode] = useState(false)
  const [measureMarkers, setMeasureMarkers] = useState<MeasureMarker[]>([])
  const [cameraAzimuthDeg, setCameraAzimuthDeg] = useState(0)
  const minimapRef = useRef<HTMLCanvasElement>(null)
  const texRef = useRef<THREE.CanvasTexture | null>(null)
  const rawElevRef = useRef<number[]>([])
  const waterMaskRef = useRef<boolean[]>([])
  const editedElevRef = useRef<number[]>([])

  const handleBrushApply = useCallback((centerR: number, centerC: number) => {
    if (!terrainData || brushTool === 'none') return
    const { cols, rows } = terrainData
    const elev = [...terrainData.elevations]
    const r0 = Math.max(0, centerR - brushRadius)
    const r1 = Math.min(rows - 1, centerR + brushRadius)
    const c0 = Math.max(0, centerC - brushRadius)
    const c1 = Math.min(cols - 1, centerC + brushRadius)

    for (let r = r0; r <= r1; r++) {
      for (let c = c0; c <= c1; c++) {
        const dist = Math.sqrt((r - centerR) ** 2 + (c - centerC) ** 2)
        if (dist > brushRadius) continue
        const falloff = 1 - (dist / brushRadius)
        const idx = r * cols + c
        const amount = brushStrength * falloff

        if (brushTool === 'raise') {
          elev[idx] = (elev[idx] ?? 0) + amount
        } else if (brushTool === 'lower') {
          elev[idx] = Math.max(0, (elev[idx] ?? 0) - amount)
        } else if (brushTool === 'smooth') {
          let sum = 0; let cnt = 0
          for (let dr = -1; dr <= 1; dr++) {
            for (let dc = -1; dc <= 1; dc++) {
              const nr = r + dr; const nc = c + dc
              if (nr >= 0 && nr < rows && nc >= 0 && nc < cols) {
                sum += elev[nr * cols + nc]!; cnt++
              }
            }
          }
          const avg = sum / cnt
          elev[idx] = elev[idx]! + (avg - elev[idx]!) * falloff * 0.5
        } else if (brushTool === 'flatten') {
          const targetElev = elev[centerR * cols + centerC] ?? 0
          elev[idx] = elev[idx]! + (targetElev - elev[idx]!) * falloff * 0.6
        }
      }
    }

    editedElevRef.current = elev
    setTerrainData((prev) =>
      prev ? { ...prev, elevations: elev, minElev: Math.min(...elev), maxElev: Math.max(...elev) } : null,
    )
    setEditCount((c) => c + 1)
  }, [terrainData, brushTool, brushRadius, brushStrength])

  const handleResetTerrain = useCallback(() => {
    if (rawElevRef.current.length === 0) return
    const smoothed = smoothElevations(rawElevRef.current, GRID, GRID, 2)
    const masked = applyWaterMaskAndThreshold(smoothed, waterMaskRef.current, seaThreshold, GRID, GRID)
    const elev = applyEdgeFeathering(masked, GRID, GRID)
    editedElevRef.current = []
    setTerrainData((prev) =>
      prev ? { ...prev, elevations: elev, minElev: Math.min(...elev), maxElev: Math.max(...elev) } : null,
    )
    setEditCount(0)
  }, [seaThreshold])

  const editCallbacks = useMemo<TerrainEditCallbacks>(() => ({
    onHoverInfo: setHoverInfo,
    onBrushApply: handleBrushApply,
    onMeasurePoint: (point) => {
      setMeasureMarkers((prev) => (prev.length >= 2 ? [point] : [...prev, point]))
    },
    brushTool,
    brushRadius,
    measureMode,
  }), [handleBrushApply, brushTool, brushRadius, measureMode])

  const parsed = useMemo(() => {
    try {
      return { corners: asQuadCorners(parseCoordinatesText(coordinatesText)), error: null }
    } catch (e) {
      return { corners: null, error: e instanceof Error ? e.message : 'Coordenadas inválidas' }
    }
  }, [coordinatesText])

  const metrics = useMemo(
    () => (parsed.corners ? estimateRectangleMeters(parsed.corners) : null),
    [parsed.corners],
  )

  useEffect(() => {
    if (!parsed.corners) return
    let dead = false
    const corners = parsed.corners

    async function load() {
      try {
        setTerrainData(null)
        if (texRef.current) { texRef.current.dispose(); texRef.current = null }

        setLoading('Descargando imagen satelital…')
        const canvas = await fetchSatelliteCanvas(corners)
        if (dead) return

        const tex = new THREE.CanvasTexture(canvas)
        tex.colorSpace = THREE.SRGBColorSpace
        tex.minFilter = THREE.LinearFilter
        tex.magFilter = THREE.LinearFilter
        texRef.current = tex

        setLoading('Detectando agua en imagen satelital…')
        const wMask = detectWaterMask(canvas, GRID, GRID)
        waterMaskRef.current = wMask

        setLoading('Decodificando elevaciones DEM…')
        const rawElev = await fetchElevationGrid(corners, GRID, GRID)
        if (dead) return
        rawElevRef.current = rawElev

        setLoading('Procesando relieve…')
        const smoothed = smoothElevations(rawElev, GRID, GRID, 3)
        const masked = applyWaterMaskAndThreshold(smoothed, wMask, 3, GRID, GRID)
        const elev = applyEdgeFeathering(masked, GRID, GRID)

        const { south, north, west, east } = boundsOf(corners)
        const avgLat = ((north + south) / 2) * Math.PI / 180
        const wm = (east - west) * 111320 * Math.cos(avgLat)
        const dm = (north - south) * 111320
        const aspect = dm / wm

        setTerrainData({
          texture: tex,
          elevations: elev,
          waterMask: wMask,
          cols: GRID,
          rows: GRID,
          meshWidth: SCALE,
          meshDepth: SCALE * aspect,
          minElev: Math.min(...elev),
          maxElev: Math.max(...elev),
          realWidth: wm,
          realDepth: dm,
        })
        setLoading('')
      } catch (err) {
        if (!dead) setLoading(err instanceof Error ? err.message : 'Error cargando terreno')
      }
    }

    void load()
    return () => { dead = true }
  }, [parsed.corners])

  // Re-process elevations when sea threshold changes (no re-fetch needed)
  useEffect(() => {
    if (!terrainData || rawElevRef.current.length === 0) return
    const smoothed = smoothElevations(rawElevRef.current, GRID, GRID, 3)
    const masked = applyWaterMaskAndThreshold(smoothed, waterMaskRef.current, seaThreshold, GRID, GRID)
    const elev = applyEdgeFeathering(masked, GRID, GRID)
    setTerrainData((prev) =>
      prev
        ? { ...prev, elevations: elev, minElev: Math.min(...elev), maxElev: Math.max(...elev) }
        : null,
    )
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [seaThreshold])

  useEffect(() => {
    return () => { texRef.current?.dispose(); texRef.current = null }
  }, [])

  useEffect(() => {
    if (!measureMode) setMeasureMarkers([])
  }, [measureMode])

  const hoverGeo = useMemo(() => {
    if (!showGeoCoords || !parsed.corners || !hoverInfo) return null
    return gridToGeo(parsed.corners, hoverInfo.gridR, hoverInfo.gridC, GRID, GRID)
  }, [showGeoCoords, parsed.corners, hoverInfo])

  const measurement = useMemo(() => {
    if (!terrainData || measureMarkers.length !== 2) return null
    const [a, b] = measureMarkers
    if (!a || !b) return null
    const dx = ((b.gridC - a.gridC) / (GRID - 1)) * terrainData.realWidth
    const dz = ((b.gridR - a.gridR) / (GRID - 1)) * terrainData.realDepth
    const dy = b.elevation - a.elevation
    const planar = Math.sqrt(dx * dx + dz * dz)
    const spatial = Math.sqrt(dx * dx + dz * dz + dy * dy)
    return { planar, spatial, dy }
  }, [terrainData, measureMarkers])

  const previewStats = useMemo(() => {
    if (!terrainData) return null
    const relief = terrainData.maxElev - terrainData.minElev
    const coveredCells = terrainData.elevations.filter((value) => value > 0.1).length
    return {
      relief,
      coveredCells,
      totalCells: terrainData.cols * terrainData.rows,
      waterCells: terrainData.waterMask.filter(Boolean).length,
    }
  }, [terrainData])

  useEffect(() => {
    const canvas = minimapRef.current
    if (!canvas || !terrainData) return
    const ctx = canvas.getContext('2d')
    if (!ctx) return

    const { cols, rows, elevations, waterMask, minElev, maxElev } = terrainData
    const width = canvas.width
    const height = canvas.height
    const img = ctx.createImageData(width, height)
    const relief = Math.max(0.1, maxElev - minElev)

    for (let y = 0; y < height; y++) {
      const r = Math.min(rows - 1, Math.round((y / (height - 1)) * (rows - 1)))
      for (let x = 0; x < width; x++) {
        const c = Math.min(cols - 1, Math.round((x / (width - 1)) * (cols - 1)))
        const idx = r * cols + c
        const offset = (y * width + x) * 4
        if (waterMask[idx]) {
          img.data[offset] = 24
          img.data[offset + 1] = 99
          img.data[offset + 2] = 140
          img.data[offset + 3] = 255
          continue
        }
        const normalized = (elevations[idx]! - minElev) / relief
        const red = 104 + normalized * 88
        const green = 112 + normalized * 74
        const blue = 78 + normalized * 36
        img.data[offset] = Math.round(red)
        img.data[offset + 1] = Math.round(green)
        img.data[offset + 2] = Math.round(blue)
        img.data[offset + 3] = 255
      }
    }

    ctx.putImageData(img, 0, 0)

    if (hoverInfo) {
      const hx = (hoverInfo.gridC / (cols - 1)) * width
      const hy = (hoverInfo.gridR / (rows - 1)) * height
      ctx.strokeStyle = '#f8fafc'
      ctx.lineWidth = 1.5
      ctx.beginPath()
      ctx.arc(hx, hy, 4, 0, Math.PI * 2)
      ctx.stroke()
    }

    for (const marker of measureMarkers) {
      const mx = (marker.gridC / (cols - 1)) * width
      const my = (marker.gridR / (rows - 1)) * height
      ctx.fillStyle = '#f59e0b'
      ctx.beginPath()
      ctx.arc(mx, my, 3.5, 0, Math.PI * 2)
      ctx.fill()
    }
  }, [terrainData, hoverInfo, measureMarkers])

  return (
    <div className="space-y-3 rounded-xl border bg-background/80 p-3 shadow-sm">
      {/* ── Header + tools ── */}
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div>
          <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
            Vista 3D · Terreno aislado
          </p>
          <p className="text-[11px] text-muted-foreground">
            {brushTool !== 'none'
              ? 'Click y arrastra sobre el terreno para editar. Mantén presionado para pintar.'
              : 'Arrastra para rotar, scroll para zoom.'}
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-1.5">
          {hoverInfo && (
            <Badge variant="secondary" className="font-mono text-[10px]">
              {hoverInfo.elevation.toFixed(1)} m s.n.m.
            </Badge>
          )}
          <Badge
            variant={autoRotate ? 'default' : 'outline'}
            className="cursor-pointer"
            onClick={() => setAutoRotate((v) => !v)}
          >
            Auto-rotar
          </Badge>
        </div>
      </div>

      {/* ── Brush tools ── */}
      <div className="flex flex-wrap items-center gap-1.5 text-[11px]">
        {[
          { id: 'none' as BrushTool, label: '🖐 Navegar', color: '' },
          { id: 'raise' as BrushTool, label: '⬆ Subir', color: 'bg-green-600' },
          { id: 'lower' as BrushTool, label: '⬇ Bajar', color: 'bg-red-600' },
          { id: 'smooth' as BrushTool, label: '〰 Suavizar', color: 'bg-blue-600' },
          { id: 'flatten' as BrushTool, label: '═ Aplanar', color: 'bg-amber-600' },
        ].map((t) => (
          <button
            key={t.id}
            onClick={() => { setBrushTool(t.id); if (t.id !== 'none') setAutoRotate(false) }}
            className={`rounded-md border px-2 py-1 transition-colors ${
              brushTool === t.id
                ? `${t.color || 'bg-muted'} text-white border-transparent`
                : 'bg-background/60 text-muted-foreground hover:bg-muted/50'
            }`}
          >
            {t.label}
          </button>
        ))}
        {editCount > 0 && (
          <button
            onClick={handleResetTerrain}
            className="rounded-md border border-orange-500/40 bg-orange-500/10 px-2 py-1 text-orange-400 hover:bg-orange-500/20"
          >
            ↩ Reset ({editCount})
          </button>
        )}
      </div>

      {/* ── Sliders ── */}
      <div className="flex flex-wrap items-center gap-4 text-[11px] text-muted-foreground">
        <label className="flex items-center gap-2">
          <span className="whitespace-nowrap">Exageración ×{exaggeration.toFixed(1)}</span>
          <input
            type="range" min="0.5" max="5" step="0.25"
            value={exaggeration}
            onChange={(e) => setExaggeration(Number(e.target.value))}
            className="h-1.5 w-28 cursor-pointer accent-sky-500"
          />
        </label>
        <label className="flex items-center gap-2">
          <span className="whitespace-nowrap">Nivel mar {seaThreshold} m</span>
          <input
            type="range" min="0" max="15" step="1"
            value={seaThreshold}
            onChange={(e) => setSeaThreshold(Number(e.target.value))}
            className="h-1.5 w-24 cursor-pointer accent-cyan-400"
          />
        </label>
        {brushTool !== 'none' && (
          <>
            <label className="flex items-center gap-2">
              <span className="whitespace-nowrap">Radio {brushRadius}</span>
              <input
                type="range" min="1" max="20" step="1"
                value={brushRadius}
                onChange={(e) => setBrushRadius(Number(e.target.value))}
                className="h-1.5 w-20 cursor-pointer accent-amber-400"
              />
            </label>
            <label className="flex items-center gap-2">
              <span className="whitespace-nowrap">Fuerza {brushStrength.toFixed(1)}</span>
              <input
                type="range" min="0.5" max="10" step="0.5"
                value={brushStrength}
                onChange={(e) => setBrushStrength(Number(e.target.value))}
                className="h-1.5 w-20 cursor-pointer accent-amber-400"
              />
            </label>
          </>
        )}
      </div>

      <div className={`relative overflow-hidden rounded-xl border bg-[#0a0e17] ${mapHeightClassName}`}>
        {terrainData ? (
          <Canvas
            camera={{ position: [SCALE * 0.75, SCALE * 0.55, SCALE * 0.75], fov: 45, near: 0.01, far: 200 }}
            gl={{ antialias: true }}
            style={{ background: '#0a0e17' }}
          >
            <fog attach="fog" args={['#0a0e17', 12, 28]} />
            <ambientLight intensity={0.55} />
            <hemisphereLight args={['#d9efff', '#7d5e38', 0.75]} />
            <directionalLight position={[5, 9, 3]} intensity={1.15} />
            <directionalLight position={[-4, 5, -4]} intensity={0.22} />
            <CameraAzimuthProbe onChange={setCameraAzimuthDeg} />
            <TerrainIsland data={terrainData} exaggeration={exaggeration} edit={editCallbacks} />
            <OrbitControls
              enableDamping
              dampingFactor={0.12}
              autoRotate={autoRotate}
              autoRotateSpeed={0.5}
              maxDistance={SCALE * 3}
              minDistance={SCALE * 0.3}
              enabled={brushTool === 'none' && !measureMode}
            />
          </Canvas>
        ) : (
          <div className="flex h-full items-center justify-center text-sm text-muted-foreground">
            {loading || 'Esperando coordenadas válidas…'}
          </div>
        )}

        <div className="absolute top-3 right-3 z-20 flex flex-wrap gap-1.5">
          <Button
            variant={showCompass ? 'default' : 'ghost'}
            size="icon"
            className="h-8 w-8 bg-card/85 backdrop-blur border shadow"
            onClick={() => setShowCompass((value) => !value)}
            title={showCompass ? 'Ocultar brújula' : 'Mostrar brújula'}
          >
            <Compass className="h-4 w-4" />
          </Button>
          <Button
            variant={showMinimap ? 'default' : 'ghost'}
            size="icon"
            className="h-8 w-8 bg-card/85 backdrop-blur border shadow"
            onClick={() => setShowMinimap((value) => !value)}
            title={showMinimap ? 'Ocultar minimapa' : 'Mostrar minimapa'}
          >
            <Layers className="h-4 w-4" />
          </Button>
          <Button
            variant={showStats ? 'default' : 'ghost'}
            size="icon"
            className="h-8 w-8 bg-card/85 backdrop-blur border shadow"
            onClick={() => setShowStats((value) => !value)}
            title={showStats ? 'Ocultar estadísticas' : 'Mostrar estadísticas'}
          >
            <BarChart3 className="h-4 w-4" />
          </Button>
          <Button
            variant={showGeoCoords ? 'default' : 'ghost'}
            size="icon"
            className="h-8 w-8 bg-card/85 backdrop-blur border shadow"
            onClick={() => setShowGeoCoords((value) => !value)}
            title={showGeoCoords ? 'Ocultar coordenadas' : 'Mostrar coordenadas'}
          >
            <MapPin className="h-4 w-4" />
          </Button>
          <Button
            variant={measureMode ? 'default' : 'ghost'}
            size="icon"
            className="h-8 w-8 bg-card/85 backdrop-blur border shadow"
            onClick={() => {
              setMeasureMode((value) => !value)
              setBrushTool('none')
              setAutoRotate(false)
            }}
            title={measureMode ? 'Salir de medición' : 'Medir distancia'}
          >
            <Ruler className="h-4 w-4" />
          </Button>
        </div>

        {showCompass && (
          <div className="absolute top-3 left-3 z-20">
            <CompassWidget rotationDeg={cameraAzimuthDeg} />
          </div>
        )}

        {showStats && terrainData && previewStats && (
          <div className="absolute top-24 left-3 z-20 max-w-[220px] rounded-xl border bg-card/88 p-3 text-[11px] shadow-lg backdrop-blur">
            <div className="mb-2 flex items-center gap-1.5 font-semibold text-foreground">
              <BarChart3 className="h-3.5 w-3.5 text-primary" />
              Estadísticas del preview
            </div>
            <div className="grid grid-cols-[auto_1fr] gap-x-2 gap-y-1 text-muted-foreground">
              <span>Grilla</span>
              <span className="text-foreground">{terrainData.cols}×{terrainData.rows}</span>
              <span>Elevación</span>
              <span className="text-foreground">{terrainData.minElev.toFixed(1)}m — {terrainData.maxElev.toFixed(1)}m</span>
              <span>Relieve</span>
              <span className="text-foreground">{previewStats.relief.toFixed(1)}m</span>
              <span>Terreno útil</span>
              <span className="text-foreground">{previewStats.coveredCells} celdas</span>
              <span>Agua</span>
              <span className="text-foreground">{previewStats.waterCells} celdas</span>
            </div>
          </div>
        )}

        {showGeoCoords && hoverInfo && hoverGeo && (
          <div className="absolute top-3 left-1/2 z-20 -translate-x-1/2 rounded-md border bg-card/88 px-3 py-1.5 text-[11px] shadow backdrop-blur">
            <div className="flex items-center gap-3 font-mono text-foreground">
              <span>{hoverInfo.elevation.toFixed(1)} m</span>
              <span className="text-muted-foreground">r{hoverInfo.gridR} c{hoverInfo.gridC}</span>
              <span>{hoverGeo.lat.toFixed(6)}°, {hoverGeo.lon.toFixed(6)}°</span>
            </div>
          </div>
        )}

        {showMinimap && terrainData && (
          <div className="absolute bottom-3 right-3 z-20 rounded-xl border bg-card/88 p-2 shadow-lg backdrop-blur">
            <canvas ref={minimapRef} width={136} height={136} className="block rounded border" />
          </div>
        )}

        {measureMode && (
          <div className="absolute bottom-3 left-1/2 z-20 -translate-x-1/2 rounded-md border bg-card/88 px-3 py-2 text-[11px] shadow-lg backdrop-blur">
            {measurement ? (
              <div className="flex items-center gap-3">
                <span className="font-medium text-foreground">Planta {measurement.planar.toFixed(1)} m</span>
                <span className="text-muted-foreground">3D {measurement.spatial.toFixed(1)} m</span>
                <span className="text-muted-foreground">Δh {measurement.dy.toFixed(1)} m</span>
                <button className="opacity-70 hover:opacity-100" onClick={() => setMeasureMarkers([])}>
                  <X className="h-3.5 w-3.5" />
                </button>
              </div>
            ) : (
              <span className="text-muted-foreground">
                Haz click en dos puntos del terreno para medir distancia.
              </span>
            )}
          </div>
        )}
      </div>

      <div className="grid gap-2 text-[11px] text-muted-foreground md:grid-cols-3">
        <div className="rounded-md border bg-muted/30 p-2">
          {parsed.error ?? previewError ?? statusMessage ?? 'Modelo 3D del terreno listo para inspección.'}
        </div>
        <div className="rounded-md border bg-muted/30 p-2">
          {preview
            ? `Rectángulo ${Math.round(preview.rectangleWidthMeters)} m × ${Math.round(preview.rectangleDepthMeters)} m · canvas ${preview.gridWidth} m × ${preview.gridDepth} m · muestreo ${preview.sampleStep} m`
            : metrics
              ? `Rectángulo ${Math.round(metrics.widthMeters)} m × ${Math.round(metrics.depthMeters)} m`
              : 'Esperando 4 coordenadas.'}
          <br />
          {isImporting ? 'Importación en progreso…' : (loading || 'Terreno 3D cargado')}
        </div>
        <div className="rounded-md border bg-muted/30 p-2">
          {terrainData
            ? `Malla ${GRID}×${GRID} · elevación ${terrainData.minElev.toFixed(1)} – ${terrainData.maxElev.toFixed(1)} m · DEM zoom ${DEM_Z} · textura zoom ${TILE_Z}`
            : 'Esperando datos de terreno…'}
        </div>
      </div>
    </div>
  )
}
