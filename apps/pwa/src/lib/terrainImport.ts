import type { IsometricMapConfig, TerrainTile } from '@/types/isometricMap'
import { SEA_LEVEL_ELEVATION, clampElevation } from '@/types/isometricMap'

export interface GeoCoordinate {
  lat: number
  lon: number
}

export interface TerrainImportOptions {
  config: Pick<IsometricMapConfig, 'width' | 'depth'>
  corners: GeoCoordinate[]
  sampleStep?: number
  keepSeaLevelTiles?: boolean
}

export interface TerrainImportResult {
  tiles: TerrainTile[]
  minElevation: number
  maxElevation: number
  bounds: {
    minLat: number
    maxLat: number
    minLon: number
    maxLon: number
  }
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
const OPEN_TOPO_DATA_API = 'https://api.opentopodata.org/v1/aster30m'
const MAX_POINTS_PER_REQUEST = 50
const MAX_HTTP_RETRIES = 4

const clamp01 = (value: number) => Math.max(0, Math.min(1, value))

function chunk<T>(values: T[], size: number): T[][] {
  if (size <= 0) return [values]
  const chunks: T[][] = []
  for (let index = 0; index < values.length; index += size) {
    chunks.push(values.slice(index, index + size))
  }
  return chunks
}

const sleep = (ms: number) => new Promise<void>((resolve) => setTimeout(resolve, ms))

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

    const waitMs = 700 * Math.pow(2, attempt)
    await sleep(waitMs)
  }

  throw new Error('Error inesperado en consulta de elevaciones')
}

async function fetchElevationBatchOpenTopo(batch: GeoCoordinate[]): Promise<number[]> {
  const locations = batch.map((point) => `${point.lat.toFixed(6)},${point.lon.toFixed(6)}`).join('|')

  for (let attempt = 0; attempt <= MAX_HTTP_RETRIES; attempt++) {
    const response = await fetch(`${OPEN_TOPO_DATA_API}?locations=${encodeURIComponent(locations)}`)

    if (response.ok) {
      const payload = (await response.json()) as {
        results?: Array<{ elevation?: number | null }>
      }
      const values = (payload.results ?? []).map((entry) => {
        const elevation = entry?.elevation
        return Number.isFinite(elevation) ? Number(elevation) : SEA_LEVEL_ELEVATION
      })

      if (values.length !== batch.length) {
        throw new Error('Respuesta de elevacion incompleta en proveedor alternativo')
      }

      return values
    }

    const isRetryable = response.status === 429 || response.status >= 500
    if (!isRetryable || attempt === MAX_HTTP_RETRIES) {
      throw new TerrainImportHttpError(response.status, `No se pudo consultar elevaciones (${response.status})`)
    }

    const waitMs = 900 * Math.pow(2, attempt)
    await sleep(waitMs)
  }

  throw new Error('Error inesperado en proveedor alternativo de elevaciones')
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

async function fetchElevations(points: GeoCoordinate[]): Promise<number[]> {
  const batches = chunk(points, MAX_POINTS_PER_REQUEST)
  const elevations: number[] = []

  for (const batch of batches) {
    let values: number[]
    try {
      values = await fetchElevationBatch(batch)
    } catch (error) {
      // Si Open-Meteo limita por cuota, usar proveedor alternativo.
      if (error instanceof TerrainImportHttpError && error.status === 429) {
        values = await fetchElevationBatchOpenTopo(batch)
      } else {
        throw error
      }
    }

    elevations.push(...values)

    // Suaviza el ritmo de consulta para evitar throttling.
    await sleep(120)
  }

  return elevations
}

export async function importTerrainFromRectangle(options: TerrainImportOptions): Promise<TerrainImportResult> {
  const { config, corners, keepSeaLevelTiles = false } = options
  const sampleStep = Math.max(2, Math.round(options.sampleStep ?? 4))

  if (!corners || corners.length < 4) {
    throw new Error('Se requieren 4 coordenadas para definir el rectangulo')
  }

  const latitudes = corners.map((point) => point.lat)
  const longitudes = corners.map((point) => point.lon)

  const minLat = Math.min(...latitudes)
  const maxLat = Math.max(...latitudes)
  const minLon = Math.min(...longitudes)
  const maxLon = Math.max(...longitudes)

  const widthCells = Math.max(1, Math.round(config.width))
  const depthCells = Math.max(1, Math.round(config.depth))

  const sampleCols = Math.max(3, Math.floor(widthCells / sampleStep) + 1)
  const sampleRows = Math.max(3, Math.floor(depthCells / sampleStep) + 1)

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

  const sampleElevations = await fetchElevations(samplePoints)

  const coarseGrid: number[][] = []
  for (let row = 0; row < sampleRows; row++) {
    const offset = row * sampleCols
    coarseGrid.push(sampleElevations.slice(offset, offset + sampleCols))
  }

  const minX = Math.floor(-config.width / 2)
  const maxX = Math.ceil(config.width / 2)
  const minZ = Math.floor(-config.depth / 2)
  const maxZ = Math.ceil(config.depth / 2)

  const tiles: TerrainTile[] = []
  let minElevation = Number.POSITIVE_INFINITY
  let maxElevation = Number.NEGATIVE_INFINITY

  for (let z = minZ; z < maxZ; z++) {
    const v = (z - minZ) / Math.max(1, maxZ - minZ - 1)

    for (let x = minX; x < maxX; x++) {
      const u = (x - minX) / Math.max(1, maxX - minX - 1)
      const rawElevation = bilinearInterpolate(coarseGrid, u, v)
      const elevation = clampElevation(Math.round(rawElevation))

      minElevation = Math.min(minElevation, elevation)
      maxElevation = Math.max(maxElevation, elevation)

      if (!keepSeaLevelTiles && elevation === SEA_LEVEL_ELEVATION) continue
      tiles.push({ x, z, elevation })
    }
  }

  if (!Number.isFinite(minElevation) || !Number.isFinite(maxElevation)) {
    minElevation = SEA_LEVEL_ELEVATION
    maxElevation = SEA_LEVEL_ELEVATION
  }

  return {
    tiles,
    minElevation,
    maxElevation,
    bounds: { minLat, maxLat, minLon, maxLon },
  }
}
