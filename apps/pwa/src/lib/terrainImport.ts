import type { IsometricMapConfig, TerrainTile } from '@/types/isometricMap'
import { SEA_LEVEL_ELEVATION, MIN_TERRAIN_ELEVATION, MAX_TERRAIN_ELEVATION } from '@/types/isometricMap'

export interface GeoCoordinate {
  lat: number
  lon: number
}

export interface TerrainImportOptions {
  config: Pick<IsometricMapConfig, 'width' | 'depth'>
  corners: GeoCoordinate[]
  sampleStep?: number
  keepSeaLevelTiles?: boolean
  onProgress?: (progress: TerrainImportProgress) => void
}

export interface TerrainImportProgress {
  completedBatches: number
  totalBatches: number
  completedPoints: number
  totalPoints: number
  currentBatchSize: number
  percent: number
}

export interface TerrainImportResult {
  tiles: TerrainTile[]
  minElevation: number
  maxElevation: number
  usedSampleStep: number
  bounds: {
    minLat: number
    maxLat: number
    minLon: number
    maxLon: number
  }
  geoBounds: TerrainGeoBounds
}

/** Geo bounds stored alongside terrain for coordinate display on hover */
export interface TerrainGeoBounds {
  minLat: number
  maxLat: number
  minLon: number
  maxLon: number
  /** Grid extents at time of import */
  gridMinX: number
  gridMaxX: number
  gridMinZ: number
  gridMaxZ: number
}

/** Convert grid position (x,z) back to geo coordinates using linear interpolation */
export function gridToGeo(
  x: number,
  z: number,
  bounds: TerrainGeoBounds
): { lat: number; lon: number } | null {
  if (!bounds) return null
  const gridW = bounds.gridMaxX - bounds.gridMinX
  const gridD = bounds.gridMaxZ - bounds.gridMinZ
  if (gridW <= 0 || gridD <= 0) return null

  const u = (x - bounds.gridMinX) / gridW
  const v = (z - bounds.gridMinZ) / gridD

  // lon increases with u (left to right), lat decreases with v (top to bottom)
  const lon = bounds.minLon + (bounds.maxLon - bounds.minLon) * u
  const lat = bounds.maxLat - (bounds.maxLat - bounds.minLat) * v

  return { lat, lon }
}

export class TerrainImportHttpError extends Error {
  status: number

  constructor(status: number, message: string) {
    super(message)
    this.name = 'TerrainImportHttpError'
    this.status = status
  }
}

// Coordenadas base entregadas por usuario para el rectangulo de trabajo.
export const DEFAULT_CHONCHI_RECTANGLE: GeoCoordinate[] = [
  { lat: -42.6325, lon: -73.7632 },
  { lat: -42.6292, lon: -73.7579 },
  { lat: -42.6308, lon: -73.7563 },
  { lat: -42.6334, lon: -73.7626 },
]

const OPEN_METEO_ELEVATION_API = 'https://api.open-meteo.com/v1/elevation'
const MAX_POINTS_PER_REQUEST = 100
const MAX_HTTP_RETRIES = 6
const MAX_SAMPLE_POINTS = 800
const AUTO_EXPAND_PADDING_METERS = 20
const MAX_AUTO_GRID_WIDTH = 600
const MAX_AUTO_GRID_DEPTH = 500
const BATCH_SLEEP_MS = 1000

export interface TerrainImportPreview {
  rectangleWidthMeters: number
  rectangleDepthMeters: number
  gridWidth: number
  gridDepth: number
  sampleStep: number
  sampleCols: number
  sampleRows: number
  totalSamplePoints: number
}

const clamp01 = (value: number) => Math.max(0, Math.min(1, value))

function chunk<T>(values: T[], size: number): T[][] {
  if (size <= 0) return [values]
  const chunks: T[][] = []
  for (let index = 0; index < values.length; index += size) {
    chunks.push(values.slice(index, index + size))
  }
  return chunks
}

function resolveSamplingPlan(
  config: Pick<IsometricMapConfig, 'width' | 'depth'>,
  requestedSampleStep: number
): {
  sampleStep: number
  sampleCols: number
  sampleRows: number
  totalSamplePoints: number
} {
  const widthCells = Math.max(1, Math.round(config.width))
  const depthCells = Math.max(1, Math.round(config.depth))

  let sampleStep = Math.max(1, Math.round(requestedSampleStep || 1))
  let sampleCols = Math.max(3, Math.floor(widthCells / sampleStep) + 1)
  let sampleRows = Math.max(3, Math.floor(depthCells / sampleStep) + 1)

  while (sampleCols * sampleRows > MAX_SAMPLE_POINTS) {
    sampleStep += 2
    sampleCols = Math.max(3, Math.floor(widthCells / sampleStep) + 1)
    sampleRows = Math.max(3, Math.floor(depthCells / sampleStep) + 1)
  }

  return {
    sampleStep,
    sampleCols,
    sampleRows,
    totalSamplePoints: sampleCols * sampleRows,
  }
}

const sleep = (ms: number) => new Promise<void>((resolve) => setTimeout(resolve, ms))

const toRadians = (value: number) => (value * Math.PI) / 180

function haversineMeters(lat1: number, lon1: number, lat2: number, lon2: number): number {
  const r = 6371000
  const dLat = toRadians(lat2 - lat1)
  const dLon = toRadians(lon2 - lon1)
  const a =
    Math.sin(dLat / 2) * Math.sin(dLat / 2) +
    Math.cos(toRadians(lat1)) * Math.cos(toRadians(lat2)) * Math.sin(dLon / 2) * Math.sin(dLon / 2)
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a))
  return r * c
}

export function estimateRectangleMeters(corners: GeoCoordinate[]): { widthMeters: number; depthMeters: number } {
  if (!corners || corners.length < 4) {
    return { widthMeters: 0, depthMeters: 0 }
  }

  const latitudes = corners.map((point) => point.lat)
  const longitudes = corners.map((point) => point.lon)
  const minLat = Math.min(...latitudes)
  const maxLat = Math.max(...latitudes)
  const minLon = Math.min(...longitudes)
  const maxLon = Math.max(...longitudes)
  const centerLat = (minLat + maxLat) / 2
  const centerLon = (minLon + maxLon) / 2

  const widthMeters = haversineMeters(centerLat, minLon, centerLat, maxLon)
  const depthMeters = haversineMeters(minLat, centerLon, maxLat, centerLon)
  return { widthMeters, depthMeters }
}

export function getAutoExpandedMapConfig(
  config: Pick<IsometricMapConfig, 'width' | 'depth' | 'cellSize' | 'floorColor' | 'gridColor' | 'gridOpacity' | 'showGrid' | 'showAxisLabels'>,
  corners: GeoCoordinate[]
): IsometricMapConfig {
  const { widthMeters, depthMeters } = estimateRectangleMeters(corners)

  const desiredWidth = Math.ceil((widthMeters + AUTO_EXPAND_PADDING_METERS * 2) / 10) * 10
  const desiredDepth = Math.ceil((depthMeters + AUTO_EXPAND_PADDING_METERS * 2) / 10) * 10

  return {
    ...config,
    width: Math.max(config.width, Math.min(MAX_AUTO_GRID_WIDTH, desiredWidth || config.width)),
    depth: Math.max(config.depth, Math.min(MAX_AUTO_GRID_DEPTH, desiredDepth || config.depth)),
  }
}

export function estimateTerrainImportPreview(
  config: Pick<IsometricMapConfig, 'width' | 'depth' | 'cellSize' | 'floorColor' | 'gridColor' | 'gridOpacity' | 'showGrid' | 'showAxisLabels'>,
  corners: GeoCoordinate[],
  requestedSampleStep: number
): TerrainImportPreview {
  const expandedConfig = getAutoExpandedMapConfig(config, corners)
  const { widthMeters, depthMeters } = estimateRectangleMeters(corners)
  const sampling = resolveSamplingPlan(expandedConfig, requestedSampleStep)

  return {
    rectangleWidthMeters: widthMeters,
    rectangleDepthMeters: depthMeters,
    gridWidth: expandedConfig.width,
    gridDepth: expandedConfig.depth,
    sampleStep: sampling.sampleStep,
    sampleCols: sampling.sampleCols,
    sampleRows: sampling.sampleRows,
    totalSamplePoints: sampling.totalSamplePoints,
  }
}

export function formatCoordinatesText(points: GeoCoordinate[]): string {
  return points.map((point) => `${point.lat.toFixed(6)}, ${point.lon.toFixed(6)}`).join('\n')
}

export function parseCoordinatesText(text: string): GeoCoordinate[] {
  const lines = text
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean)

  const points: GeoCoordinate[] = []
  for (const line of lines) {
    const parts = line.split(/[,;\s]+/).filter(Boolean)
    if (parts.length < 2) {
      throw new Error(`Linea invalida: "${line}". Usa formato: lat, lon`)
    }

    const lat = Number(parts[0])
    const lon = Number(parts[1])
    if (!Number.isFinite(lat) || !Number.isFinite(lon)) {
      throw new Error(`Coordenadas invalidas en linea: "${line}"`)
    }
    if (lat < -90 || lat > 90 || lon < -180 || lon > 180) {
      throw new Error(`Coordenadas fuera de rango en linea: "${line}"`)
    }

    points.push({ lat, lon })
  }

  if (points.length !== 4) {
    throw new Error(`Se requieren exactamente 4 coordenadas, recibidas: ${points.length}`)
  }

  return points
}

async function fetchElevationBatch(batch: GeoCoordinate[]): Promise<number[]> {
  const latitude = batch.map((point) => point.lat.toFixed(6)).join(',')
  const longitude = batch.map((point) => point.lon.toFixed(6)).join(',')

  for (let attempt = 0; attempt <= MAX_HTTP_RETRIES; attempt++) {
    const response = await fetch(`${OPEN_METEO_ELEVATION_API}?latitude=${latitude}&longitude=${longitude}`)

    if (response.ok) {
      const payload = (await response.json()) as { elevation?: number[] }
      const values = payload.elevation ?? []
      if (values.length !== batch.length) {
        throw new Error('Respuesta de elevacion incompleta en API externa')
      }
      return values
    }

    const isRetryable = response.status === 429 || response.status >= 500
    if (!isRetryable || attempt === MAX_HTTP_RETRIES) {
      throw new TerrainImportHttpError(response.status, `No se pudo consultar elevaciones (${response.status})`)
    }

    // Esperar progresivamente más: 3s, 5s, 7s, 9s... hasta 15s max
    const waitMs = Math.min(15_000, 3000 + 2000 * attempt)
    await sleep(waitMs)
  }

  throw new Error('Error inesperado en consulta de elevaciones')
}

/** 3×3 Gaussian blur pass on a 2D grid to smooth sampling artifacts */
function gaussianSmooth3x3(grid: number[][]): number[][] {
  const rows = grid.length
  if (rows === 0) return grid
  const cols = grid[0]?.length ?? 0
  if (cols === 0) return grid

  // Kernel weights: center=4, adjacents=2, diagonals=1 — total 16
  const result: number[][] = []
  for (let r = 0; r < rows; r++) {
    const row: number[] = []
    for (let c = 0; c < cols; c++) {
      let sum = 0
      let weight = 0
      for (let dr = -1; dr <= 1; dr++) {
        for (let dc = -1; dc <= 1; dc++) {
          const nr = r + dr
          const nc = c + dc
          if (nr < 0 || nr >= rows || nc < 0 || nc >= cols) continue
          const w = dr === 0 && dc === 0 ? 4 : (dr === 0 || dc === 0 ? 2 : 1)
          sum += (grid[nr]?.[nc] ?? 0) * w
          weight += w
        }
      }
      row.push(weight > 0 ? sum / weight : (grid[r]?.[c] ?? 0))
    }
    result.push(row)
  }
  return result
}

function bilinearInterpolate(grid: number[][], u: number, v: number): number {
  const rows = grid.length
  const cols = grid[0]?.length ?? 0
  if (rows === 0 || cols === 0) return SEA_LEVEL_ELEVATION

  const x = clamp01(u) * (cols - 1)
  const y = clamp01(v) * (rows - 1)

  const x0 = Math.floor(x)
  const y0 = Math.floor(y)
  const x1 = Math.min(cols - 1, x0 + 1)
  const y1 = Math.min(rows - 1, y0 + 1)

  const tx = x - x0
  const ty = y - y0

  const v00 = grid[y0]?.[x0] ?? SEA_LEVEL_ELEVATION
  const v10 = grid[y0]?.[x1] ?? v00
  const v01 = grid[y1]?.[x0] ?? v00
  const v11 = grid[y1]?.[x1] ?? v00

  const top = v00 * (1 - tx) + v10 * tx
  const bottom = v01 * (1 - tx) + v11 * tx
  return top * (1 - ty) + bottom * ty
}

async function fetchElevations(
  points: GeoCoordinate[],
  onProgress?: (progress: TerrainImportProgress) => void
): Promise<number[]> {
  const batches = chunk(points, MAX_POINTS_PER_REQUEST)
  const elevations: number[] = []
  const totalPoints = points.length

  onProgress?.({
    completedBatches: 0,
    totalBatches: batches.length,
    completedPoints: 0,
    totalPoints,
    currentBatchSize: 0,
    percent: totalPoints === 0 ? 100 : 0,
  })

  for (const [index, batch] of batches.entries()) {
    const values = await fetchElevationBatch(batch)
    elevations.push(...values)

    onProgress?.({
      completedBatches: index + 1,
      totalBatches: batches.length,
      completedPoints: elevations.length,
      totalPoints,
      currentBatchSize: batch.length,
      percent: totalPoints === 0 ? 100 : Math.round((elevations.length / totalPoints) * 100),
    })

    // Suaviza el ritmo de consulta para evitar throttling.
    await sleep(BATCH_SLEEP_MS)
  }

  return elevations
}

export async function importTerrainFromRectangle(options: TerrainImportOptions): Promise<TerrainImportResult> {
  const { config, corners, keepSeaLevelTiles = false, onProgress } = options
  let sampleStep = Math.max(2, Math.round(options.sampleStep ?? 4))

  if (!corners || corners.length < 4) {
    throw new Error('Se requieren 4 coordenadas para definir el rectangulo')
  }

  const latitudes = corners.map((point) => point.lat)
  const longitudes = corners.map((point) => point.lon)

  const minLat = Math.min(...latitudes)
  const maxLat = Math.max(...latitudes)
  const minLon = Math.min(...longitudes)
  const maxLon = Math.max(...longitudes)

  const sampling = resolveSamplingPlan(config, sampleStep)
  sampleStep = sampling.sampleStep
  const sampleCols = sampling.sampleCols
  const sampleRows = sampling.sampleRows

  const samplePoints: GeoCoordinate[] = []
  for (let row = 0; row < sampleRows; row++) {
    const v = sampleRows <= 1 ? 0 : row / (sampleRows - 1)
    const lat = maxLat - (maxLat - minLat) * v

    for (let col = 0; col < sampleCols; col++) {
      const u = sampleCols <= 1 ? 0 : col / (sampleCols - 1)
      const lon = minLon + (maxLon - minLon) * u
      samplePoints.push({ lat, lon })
    }
  }

  const sampleElevations = await fetchElevations(samplePoints, onProgress)

  const coarseGrid: number[][] = []
  for (let row = 0; row < sampleRows; row++) {
    const offset = row * sampleCols
    coarseGrid.push(sampleElevations.slice(offset, offset + sampleCols))
  }

  const minX = Math.floor(-config.width / 2)
  const maxX = Math.ceil(config.width / 2)
  const minZ = Math.floor(-config.depth / 2)
  const maxZ = Math.ceil(config.depth / 2)

  // --- Gaussian-smooth the coarse grid to remove sampling artifacts ---
  const smoothedGrid = gaussianSmooth3x3(coarseGrid)

  const tiles: TerrainTile[] = []
  let minElevation = Number.POSITIVE_INFINITY
  let maxElevation = Number.NEGATIVE_INFINITY

  for (let z = minZ; z < maxZ; z++) {
    const v = (z - minZ) / Math.max(1, maxZ - minZ - 1)

    for (let x = minX; x < maxX; x++) {
      const u = (x - minX) / Math.max(1, maxX - minX - 1)
      const rawElevation = bilinearInterpolate(smoothedGrid, u, v)
      // Keep sub-meter precision for smooth mesh — only clamp to range, don't round
      const elevation = Math.max(MIN_TERRAIN_ELEVATION, Math.min(MAX_TERRAIN_ELEVATION, rawElevation))

      minElevation = Math.min(minElevation, elevation)
      maxElevation = Math.max(maxElevation, elevation)

      if (!keepSeaLevelTiles && Math.abs(elevation - SEA_LEVEL_ELEVATION) < 0.1) continue
      tiles.push({ x, z, elevation: Math.round(elevation * 10) / 10 })
    }
  }

  if (!Number.isFinite(minElevation) || !Number.isFinite(maxElevation)) {
    minElevation = SEA_LEVEL_ELEVATION
    maxElevation = SEA_LEVEL_ELEVATION
  }

  return {
    tiles,
    minElevation: Math.round(minElevation * 10) / 10,
    maxElevation: Math.round(maxElevation * 10) / 10,
    usedSampleStep: sampleStep,
    bounds: { minLat, maxLat, minLon, maxLon },
    geoBounds: { minLat, maxLat, minLon, maxLon, gridMinX: minX, gridMaxX: maxX, gridMinZ: minZ, gridMaxZ: maxZ },
  }
}
