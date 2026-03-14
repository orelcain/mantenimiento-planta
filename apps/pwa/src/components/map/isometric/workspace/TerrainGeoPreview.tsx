import { useEffect, useMemo, useRef, useState } from 'react'
import { Canvas } from '@react-three/fiber'
import { OrbitControls } from '@react-three/drei'
import * as THREE from 'three'

import { Badge } from '@/components/ui'
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

/* ── R3F: Terrain island ───────────────────────────────────────── */

function TerrainIsland({ data, exaggeration }: { data: TerrainPayload; exaggeration: number }) {
  const { texture, elevations, cols, rows, meshWidth, meshDepth, minElev, maxElev, realWidth } = data
  const elevRange = Math.max(0.1, maxElev - minElev)
  // Normalize height: map real meters to mesh units, then apply exaggeration
  const hScale = (meshWidth / realWidth) * exaggeration
  const wallDepth = Math.min(meshWidth * 0.15, elevRange * hScale * 0.5) + 0.15

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

    // North edge
    for (let c = 0; c < cols - 1; c++) {
      addWall(pos.getX(c), pos.getY(c), pos.getZ(c), pos.getX(c + 1), pos.getY(c + 1), pos.getZ(c + 1))
    }
    // South edge (reversed winding)
    for (let c = 0; c < cols - 1; c++) {
      const base = (rows - 1) * cols
      addWall(
        pos.getX(base + c + 1), pos.getY(base + c + 1), pos.getZ(base + c + 1),
        pos.getX(base + c), pos.getY(base + c), pos.getZ(base + c),
      )
    }
    // West edge
    for (let r = 0; r < rows - 1; r++) {
      const i1 = (r + 1) * cols
      const i2 = r * cols
      addWall(pos.getX(i1), pos.getY(i1), pos.getZ(i1), pos.getX(i2), pos.getY(i2), pos.getZ(i2))
    }
    // East edge
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

  return (
    <group>
      <mesh geometry={topGeo}>
        <meshStandardMaterial map={texture} roughness={0.82} metalness={0.05} />
      </mesh>
      <mesh geometry={sideGeo}>
        <meshStandardMaterial color="#6B5B45" roughness={0.92} side={THREE.DoubleSide} />
      </mesh>
      <mesh geometry={botGeo}>
        <meshStandardMaterial color="#4a3f30" roughness={1} />
      </mesh>
      {/* Water plane at sea level */}
      <mesh position={[0, 0.005, 0]} rotation={[-Math.PI / 2, 0, 0]}>
        <planeGeometry args={[meshWidth * 1.3, meshDepth * 1.3]} />
        <meshStandardMaterial color="#1a6e8e" transparent opacity={0.6} roughness={0.15} metalness={0.3} />
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
  const [exaggeration, setExaggeration] = useState(1.5)
  const [seaThreshold, setSeaThreshold] = useState(3)
  const [autoRotate, setAutoRotate] = useState(true)
  const texRef = useRef<THREE.CanvasTexture | null>(null)
  const rawElevRef = useRef<number[]>([])
  const waterMaskRef = useRef<boolean[]>([])

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
        const smoothed = smoothElevations(rawElev, GRID, GRID, 2)
        const elev = applyWaterMaskAndThreshold(smoothed, wMask, 3, GRID, GRID)

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
    const smoothed = smoothElevations(rawElevRef.current, GRID, GRID, 2)
    const elev = applyWaterMaskAndThreshold(smoothed, waterMaskRef.current, seaThreshold, GRID, GRID)
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

  return (
    <div className="space-y-3 rounded-xl border bg-background/80 p-3 shadow-sm">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div>
          <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
            Vista 3D · Terreno aislado
          </p>
          <p className="text-[11px] text-muted-foreground">
            Modelo 3D del terreno delimitado por las 4 coordenadas. Arrastra para rotar, scroll para zoom.
          </p>
        </div>
        <div className="flex flex-wrap gap-1.5">
          <Badge
            variant={autoRotate ? 'default' : 'outline'}
            className="cursor-pointer"
            onClick={() => setAutoRotate((v) => !v)}
          >
            Auto-rotar
          </Badge>
        </div>
      </div>

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
      </div>

      <div className={`overflow-hidden rounded-xl border bg-[#0a0e17] ${mapHeightClassName}`}>
        {terrainData ? (
          <Canvas
            camera={{ position: [SCALE * 0.75, SCALE * 0.55, SCALE * 0.75], fov: 45, near: 0.01, far: 200 }}
            gl={{ antialias: true }}
            style={{ background: '#0a0e17' }}
          >
            <ambientLight intensity={0.4} />
            <hemisphereLight args={['#b1e1ff', '#b97a20', 0.55]} />
            <directionalLight position={[6, 10, 4]} intensity={1.4} />
            <directionalLight position={[-3, 6, -5]} intensity={0.35} />
            <TerrainIsland data={terrainData} exaggeration={exaggeration} />
            <OrbitControls
              enableDamping
              dampingFactor={0.12}
              autoRotate={autoRotate}
              autoRotateSpeed={0.5}
              maxDistance={SCALE * 3}
              minDistance={SCALE * 0.3}
            />
          </Canvas>
        ) : (
          <div className="flex h-full items-center justify-center text-sm text-muted-foreground">
            {loading || 'Esperando coordenadas válidas…'}
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
