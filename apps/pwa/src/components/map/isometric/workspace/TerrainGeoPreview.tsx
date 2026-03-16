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
  importTerrainFromRectangle,
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
  coastFoam: Array<{
    x: number
    y: number
    z: number
    scale: number
    opacity: number
    stretch: number
    rotation: number
    tint: number
  }>
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
const DEM_Z = 15
const SCALE = 10
const OPEN_METEO_ELEVATION_API = 'https://api.open-meteo.com/v1/elevation'

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

function clamp01(value: number) {
  return Math.max(0, Math.min(1, value))
}

function lerp(from: number, to: number, amount: number) {
  return from + (to - from) * amount
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

async function fetchExactCornerElevations(points: GeoCoordinate[]): Promise<number[]> {
  const latitudes = points.map((point) => point.lat).join(',')
  const longitudes = points.map((point) => point.lon).join(',')
  const response = await fetch(`${OPEN_METEO_ELEVATION_API}?latitude=${latitudes}&longitude=${longitudes}`)
  if (!response.ok) throw new Error(`Elevacion coordenadas ${response.status}`)
  const payload = await response.json() as { elevation?: number[] }
  if (!Array.isArray(payload.elevation)) throw new Error('Respuesta invalida de elevacion')
  return payload.elevation.map((value) => Math.round(value * 10) / 10)
}

function terrainTilesToGrid(tiles: Array<{ x: number; z: number; elevation: number }>, cols: number, rows: number): number[] {
  if (tiles.length === 0) return new Array(cols * rows).fill(0)

  let minX = Number.POSITIVE_INFINITY
  let maxX = Number.NEGATIVE_INFINITY
  let minZ = Number.POSITIVE_INFINITY
  let maxZ = Number.NEGATIVE_INFINITY
  const tileMap = new Map<string, number>()

  for (const tile of tiles) {
    minX = Math.min(minX, tile.x)
    maxX = Math.max(maxX, tile.x)
    minZ = Math.min(minZ, tile.z)
    maxZ = Math.max(maxZ, tile.z)
    tileMap.set(`${tile.x},${tile.z}`, tile.elevation)
  }

  const width = Math.max(1, maxX - minX)
  const depth = Math.max(1, maxZ - minZ)
  const grid = new Array<number>(cols * rows).fill(0)

  for (let r = 0; r < rows; r++) {
    const sourceZ = Math.round(minZ + (r / Math.max(1, rows - 1)) * depth)
    for (let c = 0; c < cols; c++) {
      const sourceX = Math.round(minX + (c / Math.max(1, cols - 1)) * width)
      grid[r * cols + c] = tileMap.get(`${sourceX},${sourceZ}`) ?? 0
    }
  }

  return grid
}

function createShadedTerrainCanvas(
  satCanvas: HTMLCanvasElement,
  elevations: number[],
  waterMask: boolean[],
  cols: number,
  rows: number,
): HTMLCanvasElement {
  const out = document.createElement('canvas')
  out.width = satCanvas.width
  out.height = satCanvas.height
  const ctx = out.getContext('2d')
  if (!ctx) return satCanvas

  ctx.drawImage(satCanvas, 0, 0)
  const img = ctx.getImageData(0, 0, out.width, out.height)
  const data = img.data
  const original = new Uint8ClampedArray(data)
  const minElev = Math.min(...elevations)
  const maxElev = Math.max(...elevations)
  const elevRange = Math.max(0.1, maxElev - minElev)

  const sampleElevation = (row: number, col: number) => {
    const r = Math.max(0, Math.min(rows - 1, row))
    const c = Math.max(0, Math.min(cols - 1, col))
    return elevations[r * cols + c] ?? 0
  }

  const sampleWater = (row: number, col: number) => {
    const r = Math.max(0, Math.min(rows - 1, row))
    const c = Math.max(0, Math.min(cols - 1, col))
    return waterMask[r * cols + c] ?? false
  }

  const sampleSourceColor = (row: number, col: number) => {
    const rr = Math.max(0, Math.min(rows - 1, row))
    const cc = Math.max(0, Math.min(cols - 1, col))
    const sx = Math.round((cc / Math.max(1, cols - 1)) * (out.width - 1))
    const sy = Math.round((rr / Math.max(1, rows - 1)) * (out.height - 1))
    const offset = (sy * out.width + sx) * 4
    const red = original[offset] ?? 0
    const green = original[offset + 1] ?? 0
    const blue = original[offset + 2] ?? 0
    const maxChannel = Math.max(red, green, blue)
    const minChannel = Math.min(red, green, blue)
    return {
      sx,
      sy,
      red,
      green,
      blue,
      brightness: (red + green + blue) / 3,
      saturation: maxChannel <= 0 ? 0 : (maxChannel - minChannel) / maxChannel,
    }
  }

  const sampleSlope = (row: number, col: number) => {
    const left = sampleElevation(row, col - 1)
    const right = sampleElevation(row, col + 1)
    const up = sampleElevation(row - 1, col)
    const down = sampleElevation(row + 1, col)
    return Math.min(1, Math.sqrt((left - right) ** 2 + (up - down) ** 2) / 18)
  }

  const getRoadScore = (row: number, col: number) => {
    if (sampleWater(row, col)) return 0
    const center = sampleElevation(row, col)
    if (center < 1.1) return 0
    const source = sampleSourceColor(row, col)
    const slope = sampleSlope(row, col)
    const brightScore = clamp01((source.brightness - 126) / 34)
    const lowSatScore = clamp01((0.17 - source.saturation) / 0.17)
    const flatScore = clamp01((0.2 - slope) / 0.2)
    return brightScore * 0.42 + lowSatScore * 0.33 + flatScore * 0.25
  }

  const light = new THREE.Vector3(-0.45, 0.85, -0.3).normalize()

  for (let y = 0; y < out.height; y++) {
    const row = Math.round((y / Math.max(1, out.height - 1)) * (rows - 1))
    for (let x = 0; x < out.width; x++) {
      const col = Math.round((x / Math.max(1, out.width - 1)) * (cols - 1))
      const left = sampleElevation(row, col - 1)
      const right = sampleElevation(row, col + 1)
      const up = sampleElevation(row - 1, col)
      const down = sampleElevation(row + 1, col)
      const center = sampleElevation(row, col)
      const normal = new THREE.Vector3(left - right, 2.2, up - down).normalize()
      const shade = Math.max(0, normal.dot(light))
      const slope = Math.min(1, Math.sqrt((left - right) ** 2 + (up - down) ** 2) / 18)
      const normalizedElevation = (center - minElev) / elevRange
      const contourBandMinor = Math.abs((((center - minElev) / 1) % 1) - 0.5)
      const contourBandMajor = Math.abs((((center - minElev) / 5) % 1) - 0.5)
      const contourStrengthMinor = contourBandMinor < 0.028 ? (0.028 - contourBandMinor) / 0.028 : 0
      const contourStrengthMajor = contourBandMajor < 0.08 ? (0.08 - contourBandMajor) / 0.08 : 0
      const offset = (y * out.width + x) * 4
      const baseRed = original[offset] ?? 0
      const baseGreen = original[offset + 1] ?? 0
      const baseBlue = original[offset + 2] ?? 0
      const maxChannel = Math.max(baseRed, baseGreen, baseBlue)
      const minChannel = Math.min(baseRed, baseGreen, baseBlue)
      const saturation = maxChannel <= 0 ? 0 : (maxChannel - minChannel) / maxChannel
      const brightnessSource = (baseRed + baseGreen + baseBlue) / 3
      const ambient = 0.68
      const brightness = ambient + shade * 0.44
      const elevationWarm = normalizedElevation * 18
      const elevationCool = (1 - normalizedElevation) * 10
      const slopeDarken = slope * 18
      const contourDarken = contourStrengthMinor * 8 + contourStrengthMajor * 18
      const rockStrength = clamp01((slope - 0.24) / 0.38) * (0.45 + normalizedElevation * 0.55)
      const meadowStrength = clamp01((0.22 - slope) / 0.22) * clamp01((normalizedElevation - 0.05) / 0.24) * clamp01((0.82 - normalizedElevation) / 0.3)
      const wetlandStrength = clamp01((8 - center) / 8) * clamp01((0.2 - slope) / 0.2)
      const yardStrength = clamp01((brightnessSource - 122) / 42) * clamp01((0.18 - saturation) / 0.18) * clamp01((0.22 - slope) / 0.22) * clamp01((center - 1.2) / 3)
      const roadStrength = clamp01((brightnessSource - 132) / 34) * clamp01((0.13 - saturation) / 0.13) * clamp01((0.16 - slope) / 0.16) * clamp01((center - 1.1) / 4)
      const coastalWetness = clamp01((4.2 - center) / 4.2) * clamp01((0.18 - slope) / 0.18)
      const ridgeLight = clamp01((normalizedElevation - 0.72) / 0.18) * clamp01((0.28 - slope) / 0.28)

      let red = data[offset]! * brightness + elevationWarm
      let green = data[offset + 1]! * brightness + normalizedElevation * 8 - slopeDarken * 0.35
      let blue = data[offset + 2]! * brightness - elevationWarm * 0.4 + elevationCool - slopeDarken * 0.2

      if (center < 6) {
        red -= 10
        green += 8
        blue += 6
      }

        red -= contourDarken
        green -= contourDarken * 0.9
        blue -= contourDarken * 0.8

        red = lerp(red, 142, rockStrength * 0.5)
        green = lerp(green, 134, rockStrength * 0.46)
        blue = lerp(blue, 126, rockStrength * 0.42)

        red = lerp(red, 108, meadowStrength * 0.18)
        green = lerp(green, 129, meadowStrength * 0.34)
        blue = lerp(blue, 86, meadowStrength * 0.14)

        red = lerp(red, 98, wetlandStrength * 0.12)
        green = lerp(green, 126, wetlandStrength * 0.22)
        blue = lerp(blue, 102, wetlandStrength * 0.2)

        red = lerp(red, 154, yardStrength * 0.52)
        green = lerp(green, 146, yardStrength * 0.48)
        blue = lerp(blue, 132, yardStrength * 0.42)

        red = lerp(red, 176, roadStrength * 0.36)
        green = lerp(green, 164, roadStrength * 0.3)
        blue = lerp(blue, 144, roadStrength * 0.24)

        red = lerp(red, 64, coastalWetness * 0.08)
        green = lerp(green, 96, coastalWetness * 0.12)
        blue = lerp(blue, 102, coastalWetness * 0.18)

        red += ridgeLight * 10
        green += ridgeLight * 9
        blue += ridgeLight * 6

      data[offset] = Math.max(0, Math.min(255, Math.round(red)))
      data[offset + 1] = Math.max(0, Math.min(255, Math.round(green)))
      data[offset + 2] = Math.max(0, Math.min(255, Math.round(blue)))
    }
  }

  ctx.putImageData(img, 0, 0)

  const pathSegments: Array<[number, number, number, number, number]> = []
  const yardRects: Array<[number, number, number, number]> = []
  const wetCoastMarks: Array<[number, number, number, number]> = []

  for (let r = 1; r < rows - 1; r++) {
    for (let c = 1; c < cols - 1; c++) {
      const idx = r * cols + c
      if (waterMask[idx]) continue

      const center = elevations[idx] ?? 0
      const slope = sampleSlope(r, c)
      const source = sampleSourceColor(r, c)
      const brightness = source.brightness
      const saturation = source.saturation
      const nearWater = [
        sampleWater(r - 1, c),
        sampleWater(r + 1, c),
        sampleWater(r, c - 1),
        sampleWater(r, c + 1),
      ].filter(Boolean).length
      const roadScore = getRoadScore(r, c)
      const roadCandidate = roadScore > 0.63
      const yardCandidate = brightness > 144 && saturation < 0.1 && slope < 0.11 && center > 1.1
      const wetCandidate = nearWater > 0 && center < 4.2 && slope < 0.18

      const px = (c / (cols - 1)) * out.width
      const py = (r / (rows - 1)) * out.height

      if (wetCandidate) {
        wetCoastMarks.push([px, py, 5 + nearWater * 2, 0.05 + nearWater * 0.02])
      }

      if (yardCandidate) {
        yardRects.push([px - 4, py - 4, 8, 8])
      }

      if (roadCandidate) {
        const horizontalSupport = getRoadScore(r, c - 1) + getRoadScore(r, c + 1) + getRoadScore(r, c - 2) + getRoadScore(r, c + 2)
        const verticalSupport = getRoadScore(r - 1, c) + getRoadScore(r + 1, c) + getRoadScore(r - 2, c) + getRoadScore(r + 2, c)
        if (horizontalSupport > 1.25 || verticalSupport > 1.25) {
          if (horizontalSupport >= verticalSupport) {
            const startX = ((Math.max(0, c - 1.35)) / (cols - 1)) * out.width
            const endX = ((Math.min(cols - 1, c + 1.35)) / (cols - 1)) * out.width
            pathSegments.push([startX, py, endX, py, 1.15 + roadScore * 1.1])
          } else {
            const startY = ((Math.max(0, r - 1.35)) / (rows - 1)) * out.height
            const endY = ((Math.min(rows - 1, r + 1.35)) / (rows - 1)) * out.height
            pathSegments.push([px, startY, px, endY, 1.15 + roadScore * 1.1])
          }
        }
      }
    }
  }

  ctx.save()
  ctx.globalCompositeOperation = 'multiply'
  for (const [px, py, radius, alpha] of wetCoastMarks) {
    const gradient = ctx.createRadialGradient(px, py, 0, px, py, radius)
    gradient.addColorStop(0, `rgba(24, 61, 68, ${alpha})`)
    gradient.addColorStop(1, 'rgba(24, 61, 68, 0)')
    ctx.fillStyle = gradient
    ctx.beginPath()
    ctx.arc(px, py, radius, 0, Math.PI * 2)
    ctx.fill()
  }
  ctx.restore()

  ctx.save()
  ctx.globalCompositeOperation = 'screen'
  ctx.fillStyle = 'rgba(220, 206, 184, 0.1)'
  for (const [x, y, width, height] of yardRects) {
    ctx.fillRect(x, y, width, height)
  }
  ctx.restore()

  ctx.save()
  ctx.globalCompositeOperation = 'screen'
  ctx.lineCap = 'round'
  for (const [x1, y1, x2, y2, width] of pathSegments) {
    ctx.strokeStyle = 'rgba(236, 225, 201, 0.11)'
    ctx.lineWidth = width + 0.9
    ctx.beginPath()
    ctx.moveTo(x1, y1)
    ctx.lineTo(x2, y2)
    ctx.stroke()

    ctx.strokeStyle = 'rgba(150, 132, 112, 0.08)'
    ctx.lineWidth = Math.max(0.8, width - 0.2)
    ctx.beginPath()
    ctx.moveTo(x1, y1)
    ctx.lineTo(x2, y2)
    ctx.stroke()
  }
  ctx.restore()

  // Shoreline emphasis for better coast readability.
  ctx.save()
  ctx.globalCompositeOperation = 'screen'
  ctx.strokeStyle = 'rgba(216, 234, 228, 0.16)'
  ctx.lineWidth = 2
  ctx.beginPath()
  for (let r = 1; r < rows - 1; r++) {
    for (let c = 1; c < cols - 1; c++) {
      const center = sampleElevation(r, c)
      if (center > 1.8) continue
      const neighbors = [
        sampleElevation(r - 1, c),
        sampleElevation(r + 1, c),
        sampleElevation(r, c - 1),
        sampleElevation(r, c + 1),
      ]
      if (!neighbors.some((value) => value > 3)) continue
      const px = (c / (cols - 1)) * out.width
      const py = (r / (rows - 1)) * out.height
      ctx.moveTo(px - 1, py)
      ctx.lineTo(px + 1, py)
    }
  }
  ctx.stroke()
  ctx.restore()

  return out
}

function generateCoastalFoamSpots(
  elevations: number[],
  waterMask: boolean[],
  cols: number,
  rows: number,
  meshWidth: number,
  meshDepth: number,
  minElev: number,
  realWidth: number,
  exaggeration: number,
): TerrainPayload['coastFoam'] {
  const foam: TerrainPayload['coastFoam'] = []
  const hScale = (meshWidth / realWidth) * exaggeration

  const sampleElevation = (row: number, col: number) => {
    const r = Math.max(0, Math.min(rows - 1, row))
    const c = Math.max(0, Math.min(cols - 1, col))
    return elevations[r * cols + c] ?? 0
  }

  const sampleWater = (row: number, col: number) => {
    const r = Math.max(0, Math.min(rows - 1, row))
    const c = Math.max(0, Math.min(cols - 1, col))
    return waterMask[r * cols + c] ?? false
  }

  for (let r = 2; r < rows - 2; r += 2) {
    for (let c = 2; c < cols - 2; c += 2) {
      const idx = r * cols + c
      const center = elevations[idx] ?? 0
      if (waterMask[idx] || center < 0.4 || center > 3.2) continue

      const nearWater = [
        sampleWater(r - 1, c),
        sampleWater(r + 1, c),
        sampleWater(r, c - 1),
        sampleWater(r, c + 1),
      ].filter(Boolean).length
      if (nearWater === 0) continue

      const shorelineDrop = Math.max(
        Math.abs(center - sampleElevation(r - 1, c)),
        Math.abs(center - sampleElevation(r + 1, c)),
        Math.abs(center - sampleElevation(r, c - 1)),
        Math.abs(center - sampleElevation(r, c + 1)),
      )
      const seed = Math.sin((r * 177.71) + (c * 913.17)) * 24631.334
      const random01 = seed - Math.floor(seed)
      if (random01 < 0.45) continue

      const detailSeed = Math.sin((r * 391.31) + (c * 117.73)) * 12874.231
      const detail01 = detailSeed - Math.floor(detailSeed)

      const worldX = (c / (cols - 1) - 0.5) * meshWidth
      const worldZ = (r / (rows - 1) - 0.5) * meshDepth
      const worldY = Math.max(0.008, (center - minElev) * hScale * 0.05)
      const scale = 0.026 + nearWater * 0.014 + shorelineDrop * 0.003 + detail01 * 0.016
      const opacity = clamp01(0.08 + nearWater * 0.07 + shorelineDrop * 0.018 + detail01 * 0.04)
      const stretch = 0.72 + detail01 * 1.1
      const rotation = random01 * Math.PI
      const tint = 0.78 + detail01 * 0.22

      foam.push({ x: worldX, y: worldY, z: worldZ, scale, opacity, stretch, rotation, tint })
      if (foam.length >= 160) return foam
    }
  }

  return foam
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

/* ── R3F: Terrain island with raycasting + brush editing ────── */

function TerrainIsland({
  data, exaggeration, edit,
}: {
  data: TerrainPayload
  exaggeration: number
  edit: TerrainEditCallbacks
}) {
  const { texture, elevations, coastFoam, cols, rows, meshWidth, meshDepth, minElev, realWidth } = data
  const hScale = (meshWidth / realWidth) * exaggeration

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

  const topGeo = useMemo(() => {
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
    return top
  }, [elevations, cols, rows, meshWidth, meshDepth, minElev, hScale])

  // Brush cursor ring geometry
  const cursorGeo = useMemo(() => {
    const geo = new THREE.RingGeometry(0.9, 1, 32)
    geo.rotateX(-Math.PI / 2)
    return geo
  }, [])

  return (
    <group>
      <mesh ref={topRef} geometry={topGeo}>
        <meshStandardMaterial map={texture} color="#ece2cf" roughness={0.94} metalness={0.02} />
      </mesh>
      <mesh position={[0, -0.015, 0]} rotation={[-Math.PI / 2, 0, 0]}>
        <planeGeometry args={[meshWidth * 1.45, meshDepth * 1.45]} />
        <meshStandardMaterial color="#14586d" transparent opacity={0.84} roughness={0.11} metalness={0.14} />
      </mesh>
      <mesh position={[0, -0.008, 0]} rotation={[-Math.PI / 2, 0, 0]}>
        <planeGeometry args={[meshWidth * 1.42, meshDepth * 1.42]} />
        <meshStandardMaterial color="#2d8096" transparent opacity={0.14} roughness={0.06} metalness={0.22} emissive="#76c8db" emissiveIntensity={0.04} />
      </mesh>
      {coastFoam.map((foam, index) => (
        <group key={`${foam.x}-${foam.z}-${index}`} position={[foam.x, foam.y, foam.z]} rotation={[-Math.PI / 2, 0, foam.rotation]}>
          <mesh scale={[foam.stretch, 1, 1]}>
            <circleGeometry args={[foam.scale, 18]} />
            <meshBasicMaterial color={`hsl(191, 70%, ${88 + foam.tint * 8}%)`} transparent opacity={foam.opacity * 0.42} />
          </mesh>
          <mesh position={[0, 0.001, 0]} scale={[foam.stretch * 1.08, 1, 1]}>
            <ringGeometry args={[foam.scale * 0.42, foam.scale * 0.9, 18]} />
            <meshBasicMaterial color={`hsl(189, 64%, ${76 + foam.tint * 6}%)`} transparent opacity={foam.opacity * 0.3} side={THREE.DoubleSide} />
          </mesh>
        </group>
      ))}
      <mesh position={[0, -0.05, 0]} rotation={[-Math.PI / 2, 0, 0]}>
        <planeGeometry args={[meshWidth * 1.85, meshDepth * 1.85]} />
        <meshBasicMaterial color="#07111a" transparent opacity={0.58} />
      </mesh>
      <mesh position={[0, -0.02, 0]} rotation={[-Math.PI / 2, 0, 0]}>
        <planeGeometry args={[meshWidth * 1.08, meshDepth * 1.08]} />
        <meshBasicMaterial color="#000000" transparent opacity={0.14} />
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
  const [seaThreshold, setSeaThreshold] = useState(0)
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
  const [cornerElevations, setCornerElevations] = useState<number[] | null>(null)
  const minimapRef = useRef<HTMLCanvasElement>(null)
  const texRef = useRef<THREE.CanvasTexture | null>(null)
  const rawElevRef = useRef<number[]>([])
  const waterMaskRef = useRef<boolean[]>([])
  const baseElevRef = useRef<number[]>([])

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

    setTerrainData((prev) =>
      prev ? { ...prev, elevations: elev, minElev: Math.min(...elev), maxElev: Math.max(...elev) } : null,
    )
    setEditCount((c) => c + 1)
  }, [terrainData, brushTool, brushRadius, brushStrength])

  const handleResetTerrain = useCallback(() => {
    if (baseElevRef.current.length === 0) return
    const elev = [...baseElevRef.current]
    setTerrainData((prev) =>
      prev ? { ...prev, elevations: elev, minElev: Math.min(...elev), maxElev: Math.max(...elev) } : null,
    )
    setEditCount(0)
  }, [])

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
        setCornerElevations(null)
        if (texRef.current) { texRef.current.dispose(); texRef.current = null }

        setLoading('Descargando imagen satelital…')
        const previewWidth = Math.max(10, Math.round(preview?.gridWidth ?? metrics?.widthMeters ?? GRID))
        const previewDepth = Math.max(10, Math.round(preview?.gridDepth ?? metrics?.depthMeters ?? GRID))

        const [canvas, exactCorners, importedTerrain] = await Promise.all([
          fetchSatelliteCanvas(corners),
          fetchExactCornerElevations(corners),
          importTerrainFromRectangle({
            config: { width: previewWidth, depth: previewDepth },
            corners,
            sampleStep: Math.max(1, Math.round(preview?.sampleStep ?? 1)),
            keepSeaLevelTiles: true,
          }),
        ])
        if (dead) return
        setCornerElevations(exactCorners)

        const importedGrid = terrainTilesToGrid(importedTerrain.tiles, GRID, GRID)
        baseElevRef.current = importedGrid
        rawElevRef.current = importedGrid

        setLoading('Detectando agua en imagen satelital…')
        const wMask = detectWaterMask(canvas, GRID, GRID)
        waterMaskRef.current = wMask

        setLoading('Aplicando sombreado natural…')
        const shadedCanvas = createShadedTerrainCanvas(canvas, importedGrid, wMask, GRID, GRID)

        const tex = new THREE.CanvasTexture(shadedCanvas)
        tex.colorSpace = THREE.SRGBColorSpace
        tex.minFilter = THREE.LinearFilter
        tex.magFilter = THREE.LinearFilter
        texRef.current = tex
        const elev = importedGrid.map((value, index) => (wMask[index] && value < Math.max(0.5, seaThreshold) ? 0 : value))

        const { south, north, west, east } = boundsOf(corners)
        const avgLat = ((north + south) / 2) * Math.PI / 180
        const wm = (east - west) * 111320 * Math.cos(avgLat)
        const dm = (north - south) * 111320
        const aspect = dm / wm

        const coastFoam = generateCoastalFoamSpots(elev, wMask, GRID, GRID, SCALE, SCALE * aspect, Math.min(...elev), wm, exaggeration)

        setTerrainData({
          texture: tex,
          elevations: elev,
          waterMask: wMask,
          coastFoam,
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
  }, [parsed.corners, preview?.gridWidth, preview?.gridDepth, preview?.sampleStep, metrics?.widthMeters, metrics?.depthMeters, seaThreshold])

  // Re-process elevations when sea threshold changes (no re-fetch needed)
  useEffect(() => {
    if (!terrainData || baseElevRef.current.length === 0) return
    const elev = baseElevRef.current.map((value, index) => (waterMaskRef.current[index] && value < Math.max(0.5, seaThreshold) ? 0 : value))
    setTerrainData((prev) =>
      prev
        ? {
            ...prev,
            elevations: elev,
            coastFoam: generateCoastalFoamSpots(
              elev,
              waterMaskRef.current,
              prev.cols,
              prev.rows,
              prev.meshWidth,
              prev.meshDepth,
              Math.min(...elev),
              prev.realWidth,
              exaggeration,
            ),
            minElev: Math.min(...elev),
            maxElev: Math.max(...elev),
          }
        : null,
    )
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [seaThreshold, exaggeration])

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
    const meanElevation = terrainData.elevations.reduce((sum, value) => sum + value, 0) / Math.max(1, terrainData.elevations.length)
    const coastlineCells = terrainData.elevations.filter((value) => value > 0.1 && value < 6).length
    return {
      relief,
      coveredCells,
      totalCells: terrainData.cols * terrainData.rows,
      waterCells: terrainData.waterMask.filter(Boolean).length,
      meanElevation,
      coastlineCells,
      foamCount: terrainData.coastFoam.length,
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
          {cornerElevations && cornerElevations.length === 4 && (
            <Badge variant="outline" className="font-mono text-[10px]">
              P1 {cornerElevations[0]?.toFixed(0)}m · P2 {cornerElevations[1]?.toFixed(0)}m · P3 {cornerElevations[2]?.toFixed(0)}m · P4 {cornerElevations[3]?.toFixed(0)}m
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
          <span className="whitespace-nowrap">Corte mar {seaThreshold} m</span>
          <input
            type="range" min="0" max="5" step="1"
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
        <div className="pointer-events-none absolute inset-0 z-[1] bg-[radial-gradient(circle_at_50%_0%,rgba(98,181,214,0.18),transparent_38%),linear-gradient(180deg,rgba(18,40,66,0.34)_0%,rgba(6,15,26,0)_32%,rgba(4,9,17,0.22)_100%)]" />
        {terrainData ? (
          <Canvas
            camera={{ position: [SCALE * 0.75, SCALE * 0.55, SCALE * 0.75], fov: 45, near: 0.01, far: 200 }}
            gl={{ antialias: true }}
            style={{ background: '#0a0e17' }}
          >
            <fog attach="fog" args={['#09131d', 10, 24]} />
            <ambientLight intensity={0.62} />
            <hemisphereLight args={['#e4f6ff', '#866342', 0.9]} />
            <directionalLight position={[5, 9, 3]} intensity={1.25} color="#fff7dd" />
            <directionalLight position={[-4, 5, -4]} intensity={0.3} color="#9cc8ff" />
            <directionalLight position={[0, 2, 8]} intensity={0.16} color="#6dd0ff" />
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
        <div className="pointer-events-none absolute inset-0 z-[2] bg-[radial-gradient(circle_at_center,transparent_58%,rgba(2,6,12,0.22)_100%)]" />
        <div className="pointer-events-none absolute inset-x-0 top-0 z-[2] h-24 bg-gradient-to-b from-white/5 via-sky-200/5 to-transparent" />

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
              <span>Media</span>
              <span className="text-foreground">{previewStats.meanElevation.toFixed(1)}m</span>
              <span>Terreno útil</span>
              <span className="text-foreground">{previewStats.coveredCells} celdas</span>
              <span>Agua</span>
              <span className="text-foreground">{previewStats.waterCells} celdas</span>
              <span>Costa baja</span>
              <span className="text-foreground">{previewStats.coastlineCells} celdas</span>
              <span>Espuma costa</span>
              <span className="text-foreground">{previewStats.foamCount} marcas</span>
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
            <div className="mt-1 flex items-center justify-between text-[10px] text-muted-foreground">
              <span>Cenital</span>
              <span>{terrainData.minElev.toFixed(0)}–{terrainData.maxElev.toFixed(0)}m</span>
            </div>
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
