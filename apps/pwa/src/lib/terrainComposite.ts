/**
 * terrainComposite — Generate hillshade from elevation data and composite
 * it with satellite imagery for realistic terrain visualization.
 *
 * Uses Horn's method for slope/aspect → shaded relief.
 */

import type { TerrainTile } from '@/types/isometricMap'

/* ------------------------------------------------------------------ */
/*  Build a 2-D elevation grid from flat TerrainTile[]                */
/* ------------------------------------------------------------------ */

interface ElevationGrid {
  grid: Float32Array
  cols: number
  rows: number
  minX: number
  minZ: number
}

export function tilesToGrid(
  tiles: TerrainTile[],
  fallback = 0,
): ElevationGrid {
  let minX = Infinity, maxX = -Infinity
  let minZ = Infinity, maxZ = -Infinity
  for (const t of tiles) {
    if (t.x < minX) minX = t.x
    if (t.x > maxX) maxX = t.x
    if (t.z < minZ) minZ = t.z
    if (t.z > maxZ) maxZ = t.z
  }
  const cols = maxX - minX + 1
  const rows = maxZ - minZ + 1
  const grid = new Float32Array(cols * rows).fill(fallback)
  for (const t of tiles) {
    grid[(t.z - minZ) * cols + (t.x - minX)] = t.elevation
  }
  return { grid, cols, rows, minX, minZ }
}

/* ------------------------------------------------------------------ */
/*  Hillshade via Horn's method                                        */
/* ------------------------------------------------------------------ */

interface HillshadeOptions {
  /** Light azimuth in degrees (0 = N, 90 = E, etc.). Default 315 (NW). */
  azimuth?: number
  /** Light altitude in degrees (0 = horizon, 90 = overhead). Default 45. */
  altitude?: number
  /** Vertical exaggeration. Default 2.0 for plant-scale areas. */
  zFactor?: number
}

export function generateHillshade(
  eg: ElevationGrid,
  outWidth: number,
  outHeight: number,
  opts: HillshadeOptions = {},
): HTMLCanvasElement {
  const { azimuth = 315, altitude = 45, zFactor = 2.0 } = opts
  const { grid, cols, rows } = eg

  const azRad = ((360 - azimuth + 90) * Math.PI) / 180
  const altRad = (altitude * Math.PI) / 180

  const canvas = document.createElement('canvas')
  canvas.width = outWidth
  canvas.height = outHeight
  const ctx = canvas.getContext('2d')
  if (!ctx) return canvas
  const imgData = ctx.createImageData(outWidth, outHeight)
  const data = imgData.data

  const scaleX = cols / outWidth
  const scaleY = rows / outHeight

  const getElev = (c: number, r: number) =>
    grid[Math.min(r, rows - 1) * cols + Math.min(c, cols - 1)] ?? 0

  for (let py = 0; py < outHeight; py++) {
    const r = Math.min(Math.floor(py * scaleY), rows - 1)
    for (let px = 0; px < outWidth; px++) {
      const c = Math.min(Math.floor(px * scaleX), cols - 1)

      // Sobel-style 3×3 kernel (Horn's method)
      const r0 = Math.max(0, r - 1)
      const r2 = Math.min(rows - 1, r + 1)
      const c0 = Math.max(0, c - 1)
      const c2 = Math.min(cols - 1, c + 1)

      const dzdx =
        ((getElev(c2, r0) + 2 * getElev(c2, r) + getElev(c2, r2)) -
         (getElev(c0, r0) + 2 * getElev(c0, r) + getElev(c0, r2))) /
        8

      const dzdy =
        ((getElev(c0, r2) + 2 * getElev(c, r2) + getElev(c2, r2)) -
         (getElev(c0, r0) + 2 * getElev(c, r0) + getElev(c2, r0))) /
        8

      const slope = Math.atan(zFactor * Math.sqrt(dzdx * dzdx + dzdy * dzdy))
      const aspect = Math.atan2(-dzdy, dzdx)

      let shade =
        Math.sin(altRad) * Math.cos(slope) +
        Math.cos(altRad) * Math.sin(slope) * Math.cos(azRad - aspect)

      shade = Math.max(0, Math.min(1, shade))

      // Map to grayscale with slight ambient lift (0.15) for shadow areas
      const lum = Math.round(38 + shade * 217) // range 38..255

      const idx = (py * outWidth + px) * 4
      data[idx    ] = lum
      data[idx + 1] = lum
      data[idx + 2] = lum
      data[idx + 3] = 255
    }
  }

  ctx.putImageData(imgData, 0, 0)
  return canvas
}

/* ------------------------------------------------------------------ */
/*  Landcover color overlay from OSM features                          */
/* ------------------------------------------------------------------ */

export interface LandcoverFeature {
  coords: { lat: number; lon: number }[]
  type: 'forest' | 'scrub' | 'water' | 'wetland' | 'farmland' | 'grass' | 'sand' | 'rock'
}

const LANDCOVER_COLORS: Record<LandcoverFeature['type'], string> = {
  forest:   'rgba(34, 85, 34, 0.35)',
  scrub:    'rgba(72, 110, 52, 0.25)',
  water:    'rgba(40, 100, 160, 0.45)',
  wetland:  'rgba(60, 120, 100, 0.30)',
  farmland: 'rgba(180, 170, 100, 0.15)',
  grass:    'rgba(100, 160, 60, 0.18)',
  sand:     'rgba(210, 195, 140, 0.20)',
  rock:     'rgba(140, 135, 130, 0.15)',
}

function geoToCanvas(
  lat: number,
  lon: number,
  minLat: number,
  maxLat: number,
  minLon: number,
  maxLon: number,
  canvasW: number,
  canvasH: number,
): [number, number] {
  const x = ((lon - minLon) / (maxLon - minLon)) * canvasW
  const y = ((maxLat - lat) / (maxLat - minLat)) * canvasH
  return [x, y]
}

export function paintLandcover(
  canvas: HTMLCanvasElement,
  features: LandcoverFeature[],
  minLat: number,
  maxLat: number,
  minLon: number,
  maxLon: number,
): void {
  if (features.length === 0) return
  const ctx = canvas.getContext('2d')
  if (!ctx) return
  const { width: w, height: h } = canvas

  for (const f of features) {
    if (f.coords.length < 3) continue
    const first = f.coords[0]
    if (!first) continue
    ctx.beginPath()
    const [sx, sy] = geoToCanvas(first.lat, first.lon, minLat, maxLat, minLon, maxLon, w, h)
    ctx.moveTo(sx, sy)
    for (let i = 1; i < f.coords.length; i++) {
      const pt = f.coords[i]
      if (!pt) continue
      const [px, py] = geoToCanvas(pt.lat, pt.lon, minLat, maxLat, minLon, maxLon, w, h)
      ctx.lineTo(px, py)
    }
    ctx.closePath()
    ctx.fillStyle = LANDCOVER_COLORS[f.type]
    ctx.fill()
  }
}

/* ------------------------------------------------------------------ */
/*  Composite: satellite + hillshade → final texture                   */
/* ------------------------------------------------------------------ */

export function compositeTerrain(
  satellite: HTMLCanvasElement,
  hillshade: HTMLCanvasElement,
  landcover?: { features: LandcoverFeature[]; bounds: { minLat: number; maxLat: number; minLon: number; maxLon: number } },
  hillshadeStrength = 0.45,
): HTMLCanvasElement {
  const w = satellite.width
  const h = satellite.height
  const canvas = document.createElement('canvas')
  canvas.width = w
  canvas.height = h
  const ctx = canvas.getContext('2d')
  if (!ctx) return canvas

  // 1) Draw satellite imagery as base
  ctx.drawImage(satellite, 0, 0, w, h)

  // 2) Overlay landcover tinted regions
  if (landcover && landcover.features.length > 0) {
    paintLandcover(canvas, landcover.features, landcover.bounds.minLat, landcover.bounds.maxLat, landcover.bounds.minLon, landcover.bounds.maxLon)
  }

  // 3) Blend hillshade using "multiply" for shaded relief
  ctx.globalAlpha = hillshadeStrength
  ctx.globalCompositeOperation = 'multiply'
  ctx.drawImage(hillshade, 0, 0, w, h)

  // 4) Add slight "soft-light" pass for highlights
  ctx.globalAlpha = hillshadeStrength * 0.3
  ctx.globalCompositeOperation = 'soft-light'
  ctx.drawImage(hillshade, 0, 0, w, h)

  // Reset
  ctx.globalAlpha = 1
  ctx.globalCompositeOperation = 'source-over'

  return canvas
}
