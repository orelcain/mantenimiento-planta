import { useEffect, useMemo, useRef, useState } from 'react'
import maplibregl, { type Map as MapLibreMap } from 'maplibre-gl'
import 'maplibre-gl/dist/maplibre-gl.css'

import { Badge } from '@/components/ui'
import {
  estimateRectangleMeters,
  parseCoordinatesText,
  type GeoCoordinate,
  type TerrainImportPreview,
} from '@/lib/terrainImport'

interface TerrainGeoPreviewProps {
  coordinatesText: string
  preview?: TerrainImportPreview | null
  previewError?: string | null
  statusMessage?: string | null
  isImporting: boolean
  mapHeightClassName?: string
}

type QuadCorners = [GeoCoordinate, GeoCoordinate, GeoCoordinate, GeoCoordinate]

const DETAIL_COLS = 31
const DETAIL_ROWS = 31
const OPEN_METEO_ELEVATION_API = 'https://api.open-meteo.com/v1/elevation'
const BATCH_SIZE = 80

type ContourFeatureCollection = GeoJSON.FeatureCollection<GeoJSON.LineString, { elevation: number }>

const EMPTY_CONTOURS: ContourFeatureCollection = { type: 'FeatureCollection', features: [] }

function interpolatePoint(pointA: GeoCoordinate, pointB: GeoCoordinate, t: number): GeoCoordinate {
  return {
    lat: pointA.lat + (pointB.lat - pointA.lat) * t,
    lon: pointA.lon + (pointB.lon - pointA.lon) * t,
  }
}

function interpolateQuad(corners: QuadCorners, u: number, v: number): GeoCoordinate {
  const [point1, point2, point3, point4] = corners
  const top = interpolatePoint(point1, point2, u)
  const bottom = interpolatePoint(point4, point3, u)
  return interpolatePoint(top, bottom, v)
}

function buildSampleGrid(corners: QuadCorners, cols: number, rows: number) {
  const points: Array<GeoCoordinate & { u: number; v: number }> = []
  for (let row = 0; row < rows; row += 1) {
    const v = row / Math.max(1, rows - 1)
    for (let col = 0; col < cols; col += 1) {
      const u = col / Math.max(1, cols - 1)
      points.push({ ...interpolateQuad(corners, u, v), u, v })
    }
  }
  return points
}

async function fetchElevationBatch(batch: GeoCoordinate[]) {
  const latitude = batch.map((point) => point.lat.toFixed(6)).join(',')
  const longitude = batch.map((point) => point.lon.toFixed(6)).join(',')
  const response = await fetch(`${OPEN_METEO_ELEVATION_API}?latitude=${latitude}&longitude=${longitude}`)
  if (!response.ok) {
    throw new Error(`Open-Meteo respondió ${response.status}`)
  }
  const payload = await response.json() as { elevation?: number[] }
  return payload.elevation ?? []
}

async function fetchElevations(points: GeoCoordinate[]) {
  const elevations: number[] = []
  for (let index = 0; index < points.length; index += BATCH_SIZE) {
    const batch = points.slice(index, index + BATCH_SIZE)
    const values = await fetchElevationBatch(batch)
    if (values.length !== batch.length) {
      throw new Error('La respuesta de elevación vino incompleta')
    }
    elevations.push(...values)
  }
  return elevations
}

function sampleElevation(u: number, v: number, elevations: number[], cols: number, rows: number) {
  const x = Math.min(cols - 1, Math.max(0, u * (cols - 1)))
  const y = Math.min(rows - 1, Math.max(0, v * (rows - 1)))
  const x0 = Math.floor(x)
  const y0 = Math.floor(y)
  const x1 = Math.min(cols - 1, x0 + 1)
  const y1 = Math.min(rows - 1, y0 + 1)
  const tx = x - x0
  const ty = y - y0
  const valueAt = (row: number, col: number) => elevations[row * cols + col] ?? elevations[0] ?? 0
  const top = valueAt(y0, x0) * (1 - tx) + valueAt(y0, x1) * tx
  const bottom = valueAt(y1, x0) * (1 - tx) + valueAt(y1, x1) * tx
  return top * (1 - ty) + bottom * ty
}

function buildMicroReliefImage(corners: QuadCorners, elevations: number[], cols: number, rows: number) {
  const minElevation = Math.min(...elevations)
  const maxElevation = Math.max(...elevations)
  const range = Math.max(1, maxElevation - minElevation)
  const size = 768
  const canvas = document.createElement('canvas')
  canvas.width = size
  canvas.height = size
  const context = canvas.getContext('2d')
  if (!context) {
    return null
  }
  const image = context.createImageData(size, size)
  const light = { x: -0.45, y: 0.55, z: 0.72 }

  for (let y = 0; y < size; y += 1) {
    const v = y / Math.max(1, size - 1)
    for (let x = 0; x < size; x += 1) {
      const u = x / Math.max(1, size - 1)
      const h = sampleElevation(u, v, elevations, cols, rows)
      const hL = sampleElevation(Math.max(0, u - 1 / size), v, elevations, cols, rows)
      const hR = sampleElevation(Math.min(1, u + 1 / size), v, elevations, cols, rows)
      const hU = sampleElevation(u, Math.max(0, v - 1 / size), elevations, cols, rows)
      const hD = sampleElevation(u, Math.min(1, v + 1 / size), elevations, cols, rows)
      const dx = hR - hL
      const dy = hD - hU
      const nx = -dx * 0.42
      const ny = -dy * 0.42
      const nz = 1
      const length = Math.hypot(nx, ny, nz) || 1
      const shade = Math.max(0, Math.min(1, (nx * light.x + ny * light.y + nz * light.z) / length))
      const normalized = (h - minElevation) / range
      const hue = 0.56 - normalized * 0.34
      const saturation = 0.5
      const lightness = 0.22 + normalized * 0.18
      const color = hslToRgb(hue, saturation, lightness, 0.62 + shade * 0.78)
      const alpha = Math.round(110 + shade * 80)
      const index = (y * size + x) * 4
      image.data[index] = color.r
      image.data[index + 1] = color.g
      image.data[index + 2] = color.b
      image.data[index + 3] = alpha
    }
  }

  context.putImageData(image, 0, 0)

  const [point1, point2, point3, point4] = corners

  return {
    url: canvas.toDataURL('image/png'),
    coordinates: [
      [point1.lon, point1.lat],
      [point2.lon, point2.lat],
      [point3.lon, point3.lat],
      [point4.lon, point4.lat],
    ] as [[number, number], [number, number], [number, number], [number, number]],
    minElevation,
    maxElevation,
  }
}

function hslToRgb(h: number, s: number, l: number, intensity: number) {
  const hue2rgb = (p: number, q: number, t: number) => {
    if (t < 0) t += 1
    if (t > 1) t -= 1
    if (t < 1 / 6) return p + (q - p) * 6 * t
    if (t < 1 / 2) return q
    if (t < 2 / 3) return p + (q - p) * (2 / 3 - t) * 6
    return p
  }

  let r: number
  let g: number
  let b: number

  if (s === 0) {
    r = g = b = l
  } else {
    const q = l < 0.5 ? l * (1 + s) : l + s - l * s
    const p = 2 * l - q
    r = hue2rgb(p, q, h + 1 / 3)
    g = hue2rgb(p, q, h)
    b = hue2rgb(p, q, h - 1 / 3)
  }

  return {
    r: Math.round(Math.max(0, Math.min(255, r * 255 * intensity))),
    g: Math.round(Math.max(0, Math.min(255, g * 255 * intensity))),
    b: Math.round(Math.max(0, Math.min(255, b * 255 * intensity))),
  }
}

function computeContourBreaks(minElevation: number, maxElevation: number) {
  const range = Math.max(1, maxElevation - minElevation)
  const step = range <= 20 ? 2 : range <= 40 ? 5 : 10
  const breaks: number[] = []
  let current = Math.ceil(minElevation / step) * step
  while (current < maxElevation) {
    breaks.push(current)
    current += step
  }
  return breaks
}

function buildContours(corners: QuadCorners, elevations: number[], cols: number, rows: number): ContourFeatureCollection {
  const minElevation = Math.min(...elevations)
  const maxElevation = Math.max(...elevations)
  const thresholds = computeContourBreaks(minElevation, maxElevation)
  const features: ContourFeatureCollection['features'] = []

  const crosses = (a: number, b: number, threshold: number) => (a <= threshold && b > threshold) || (a > threshold && b <= threshold)
  const interpolate = (a: number, b: number, threshold: number) => Math.max(0, Math.min(1, Math.abs(b - a) < 0.000001 ? 0.5 : (threshold - a) / (b - a)))

  for (const threshold of thresholds) {
    for (let row = 0; row < rows - 1; row += 1) {
      for (let col = 0; col < cols - 1; col += 1) {
        const topLeft = elevations[row * cols + col] ?? minElevation
        const topRight = elevations[row * cols + col + 1] ?? minElevation
        const bottomLeft = elevations[(row + 1) * cols + col] ?? minElevation
        const bottomRight = elevations[(row + 1) * cols + col + 1] ?? minElevation
        const points: Array<{ u: number; v: number }> = []

        if (crosses(topLeft, topRight, threshold)) {
          const t = interpolate(topLeft, topRight, threshold)
          points.push({ u: (col + t) / (cols - 1), v: row / (rows - 1) })
        }
        if (crosses(topRight, bottomRight, threshold)) {
          const t = interpolate(topRight, bottomRight, threshold)
          points.push({ u: (col + 1) / (cols - 1), v: (row + t) / (rows - 1) })
        }
        if (crosses(bottomLeft, bottomRight, threshold)) {
          const t = interpolate(bottomLeft, bottomRight, threshold)
          points.push({ u: (col + t) / (cols - 1), v: (row + 1) / (rows - 1) })
        }
        if (crosses(topLeft, bottomLeft, threshold)) {
          const t = interpolate(topLeft, bottomLeft, threshold)
          points.push({ u: col / (cols - 1), v: (row + t) / (rows - 1) })
        }

        if (points.length < 2) continue

        for (let index = 0; index + 1 < points.length; index += 2) {
          const fromPoint = points[index]
          const toPoint = points[index + 1]
          if (!fromPoint || !toPoint) continue
          const from = interpolateQuad(corners, fromPoint.u, fromPoint.v)
          const to = interpolateQuad(corners, toPoint.u, toPoint.v)
          features.push({
            type: 'Feature',
            properties: { elevation: threshold },
            geometry: {
              type: 'LineString',
              coordinates: [
                [from.lon, from.lat],
                [to.lon, to.lat],
              ],
            },
          })
        }
      }
    }
  }

  return { type: 'FeatureCollection', features }
}

function asQuadCorners(corners: GeoCoordinate[]): QuadCorners {
  if (corners.length !== 4) {
    throw new Error(`Se requieren exactamente 4 coordenadas, recibidas: ${corners.length}`)
  }
  const [point1, point2, point3, point4] = corners
  if (!point1 || !point2 || !point3 || !point4) {
    throw new Error('No fue posible resolver las 4 coordenadas del rectángulo')
  }
  return [point1, point2, point3, point4]
}

const OVERPASS_API = 'https://overpass-api.de/api/interpreter'

interface OverpassElement {
  tags?: Record<string, string>
  geometry?: Array<{ lat: number; lon: number }>
}

async function fetchOSMFeatures(corners: QuadCorners) {
  const lats = corners.map((c) => c.lat)
  const lons = corners.map((c) => c.lon)
  const south = Math.min(...lats) - 0.003
  const north = Math.max(...lats) + 0.003
  const west = Math.min(...lons) - 0.003
  const east = Math.max(...lons) + 0.003
  const bbox = `${south},${west},${north},${east}`

  const query = `[out:json][timeout:25];(way["building"](${bbox});way["highway"](${bbox});way["natural"="water"](${bbox});way["waterway"](${bbox});way["landuse"="reservoir"](${bbox});relation["natural"="water"](${bbox}););out geom;`
  const resp = await fetch(OVERPASS_API, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: `data=${encodeURIComponent(query)}`,
  })
  if (!resp.ok) throw new Error('Overpass API no disponible')
  const data = (await resp.json()) as { elements: OverpassElement[] }

  const buildings: GeoJSON.Feature[] = []
  const roads: GeoJSON.Feature[] = []
  const water: GeoJSON.Feature[] = []

  for (const el of data.elements) {
    if (!el.geometry || el.geometry.length < 2) continue
    const coords = el.geometry.map((p) => [p.lon, p.lat] as [number, number])
    const tags = el.tags ?? {}

    if (tags.building) {
      if (coords.length < 4) continue
      const ring = [...coords]
      const first = ring[0]
      const last = ring[ring.length - 1]
      if (first && last && (first[0] !== last[0] || first[1] !== last[1])) ring.push(first)
      const levels = parseFloat(tags['building:levels'] ?? '0')
      const h = parseFloat(tags.height ?? '0') || (levels > 0 ? levels * 3.2 : 5)
      buildings.push({
        type: 'Feature',
        geometry: { type: 'Polygon', coordinates: [ring] },
        properties: { height: h, type: tags.building },
      })
    } else if (tags.highway) {
      roads.push({
        type: 'Feature',
        geometry: { type: 'LineString', coordinates: coords },
        properties: { type: tags.highway, surface: tags.surface ?? '' },
      })
    } else if (tags.natural === 'water' || tags.waterway || tags.landuse === 'reservoir') {
      if (coords.length >= 4) {
        const ring = [...coords]
        const first = ring[0]
        const last = ring[ring.length - 1]
        if (first && last && (first[0] !== last[0] || first[1] !== last[1])) ring.push(first)
        water.push({ type: 'Feature', geometry: { type: 'Polygon', coordinates: [ring] }, properties: {} })
      } else {
        water.push({ type: 'Feature', geometry: { type: 'LineString', coordinates: coords }, properties: {} })
      }
    }
  }

  return {
    buildings: { type: 'FeatureCollection' as const, features: buildings },
    roads: { type: 'FeatureCollection' as const, features: roads },
    water: { type: 'FeatureCollection' as const, features: water },
  }
}

export function TerrainGeoPreview({
  coordinatesText,
  preview,
  previewError,
  statusMessage,
  isImporting,
  mapHeightClassName = 'h-[460px] md:h-[560px] xl:h-[640px]',
}: TerrainGeoPreviewProps) {
  const containerRef = useRef<HTMLDivElement | null>(null)
  const mapRef = useRef<MapLibreMap | null>(null)
  const markersRef = useRef<maplibregl.Marker[]>([])
  const [mapReady, setMapReady] = useState(false)
  const [microReliefEnabled, setMicroReliefEnabled] = useState(true)
  const [contoursEnabled, setContoursEnabled] = useState(true)
  const [hillshadeEnabled, setHillshadeEnabled] = useState(true)
  const [pointsEnabled, setPointsEnabled] = useState(true)
  const [buildingsEnabled, setBuildingsEnabled] = useState(true)
  const [roadsEnabled, setRoadsEnabled] = useState(true)
  const [waterEnabled, setWaterEnabled] = useState(true)
  const [terrainExaggeration, setTerrainExaggeration] = useState(2.0)
  const [buildingExaggeration, setBuildingExaggeration] = useState(4)
  const [microReliefSummary, setMicroReliefSummary] = useState<string>('Esperando coordenadas válidas...')
  const [osmStatus, setOsmStatus] = useState<string>('')

  const parsed = useMemo(() => {
    try {
      return { corners: asQuadCorners(parseCoordinatesText(coordinatesText)), error: null }
    } catch (error) {
      return {
        corners: null,
        error: error instanceof Error ? error.message : 'No se pudieron interpretar las coordenadas',
      }
    }
  }, [coordinatesText])

  const rectangleMetrics = useMemo(() => {
    return parsed.corners ? estimateRectangleMeters(parsed.corners) : null
  }, [parsed.corners])

  useEffect(() => {
    if (!containerRef.current || mapRef.current) return

    const map = new maplibregl.Map({
      container: containerRef.current,
      center: [-73.7600, -42.6315],
      zoom: 15.5,
      pitch: 72,
      bearing: -20,
      style: {
        version: 8,
        sources: {
          satellite: {
            type: 'raster',
            tiles: ['https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}'],
            tileSize: 256,
            attribution: 'Esri World Imagery',
            maxzoom: 19,
          },
          terrainSource: {
            type: 'raster-dem',
            url: 'https://demotiles.maplibre.org/terrain-tiles/tiles.json',
            tileSize: 256,
          },
          hillshadeSource: {
            type: 'raster-dem',
            url: 'https://demotiles.maplibre.org/terrain-tiles/tiles.json',
            tileSize: 256,
          },
          boundsRect: {
            type: 'geojson',
            data: { type: 'FeatureCollection', features: [] },
          },
          contours: {
            type: 'geojson',
            data: EMPTY_CONTOURS,
          },
          outsideMask: {
            type: 'geojson',
            data: { type: 'FeatureCollection', features: [] },
          },
          osmBuildings: {
            type: 'geojson',
            data: { type: 'FeatureCollection', features: [] },
          },
          osmRoads: {
            type: 'geojson',
            data: { type: 'FeatureCollection', features: [] },
          },
          osmWater: {
            type: 'geojson',
            data: { type: 'FeatureCollection', features: [] },
          },
        },
        layers: [
          { id: 'satellite', type: 'raster', source: 'satellite' },
          {
            id: 'terrain-hillshade',
            type: 'hillshade',
            source: 'hillshadeSource',
            paint: {
              'hillshade-exaggeration': 0.4,
              'hillshade-shadow-color': '#04111d',
              'hillshade-highlight-color': '#fffae0',
            },
          },
          {
            id: 'rect-fill',
            type: 'fill',
            source: 'boundsRect',
            paint: { 'fill-color': '#63d0ff', 'fill-opacity': 0.08 },
          },
          {
            id: 'rect-line',
            type: 'line',
            source: 'boundsRect',
            paint: { 'line-color': '#f6b86c', 'line-width': 3 },
          },
          {
            id: 'water-fill',
            type: 'fill',
            source: 'osmWater',
            paint: { 'fill-color': '#3399cc', 'fill-opacity': 0.6 },
          },
          {
            id: 'roads',
            type: 'line',
            source: 'osmRoads',
            paint: {
              'line-color': '#e8dcc8',
              'line-width': [
                'match', ['get', 'type'],
                'primary', 4, 'secondary', 3.5, 'tertiary', 3,
                'residential', 2, 'service', 1.5, 'track', 1.2,
                2,
              ],
              'line-opacity': 0.85,
            },
          },
          {
            id: 'buildings-3d',
            type: 'fill-extrusion',
            source: 'osmBuildings',
            paint: {
              'fill-extrusion-color': [
                'interpolate', ['linear'], ['get', 'height'],
                0, '#9a8b7a',
                8, '#b0a090',
                20, '#c8baa8',
                50, '#ddd4c6',
              ],
              'fill-extrusion-height': ['*', ['get', 'height'], 4],
              'fill-extrusion-base': 0,
              'fill-extrusion-opacity': 0.92,
            },
          },
          {
            id: 'contour-lines',
            type: 'line',
            source: 'contours',
            paint: { 'line-color': '#fff0cf', 'line-width': 1.2, 'line-opacity': 0.82 },
          },
          {
            id: 'outside-mask',
            type: 'fill',
            source: 'outsideMask',
            paint: { 'fill-color': '#06080d', 'fill-opacity': 1 },
          },
        ],
        terrain: {
          source: 'terrainSource',
          exaggeration: 2.0,
        },
      },
      maxPitch: 85,
    })

    map.addControl(new maplibregl.NavigationControl({ visualizePitch: true }), 'top-right')
    map.on('load', () => setMapReady(true))

    mapRef.current = map
    return () => {
      markersRef.current.forEach((marker) => marker.remove())
      markersRef.current = []
      map.remove()
      mapRef.current = null
      setMapReady(false)
    }
  }, [])

  useEffect(() => {
    const map = mapRef.current
    if (!map || !mapReady) return

    const setVisibility = (layerId: string, visible: boolean) => {
      if (!map.getLayer(layerId)) return
      map.setLayoutProperty(layerId, 'visibility', visible ? 'visible' : 'none')
    }

    setVisibility('terrain-hillshade', hillshadeEnabled)
    setVisibility('contour-lines', contoursEnabled)
    setVisibility('microrelief-raster', microReliefEnabled)
    setVisibility('water-fill', waterEnabled)
    setVisibility('roads', roadsEnabled)
    setVisibility('buildings-3d', buildingsEnabled)

    markersRef.current.forEach((marker) => {
      const element = marker.getElement()
      element.style.display = pointsEnabled ? '' : 'none'
    })
  }, [mapReady, hillshadeEnabled, contoursEnabled, microReliefEnabled, pointsEnabled, buildingsEnabled, roadsEnabled, waterEnabled])

  useEffect(() => {
    const map = mapRef.current
    if (!map || !mapReady) return
    map.setTerrain({ source: 'terrainSource', exaggeration: terrainExaggeration })
  }, [mapReady, terrainExaggeration])

  useEffect(() => {
    const map = mapRef.current
    if (!map || !mapReady || !map.getLayer('buildings-3d')) return
    map.setPaintProperty('buildings-3d', 'fill-extrusion-height', [
      '*', ['get', 'height'], buildingExaggeration,
    ])
  }, [mapReady, buildingExaggeration])

  useEffect(() => {
    const map = mapRef.current
    if (!map || !mapReady || !parsed.corners) return
    const currentMap = map
    const corners = parsed.corners
    let cancelled = false

    async function loadOSMData() {
      try {
        setOsmStatus('Consultando OpenStreetMap (edificios, caminos, agua)...')
        const osm = await fetchOSMFeatures(corners)
        if (cancelled) return
        const bSrc = currentMap.getSource('osmBuildings') as maplibregl.GeoJSONSource | undefined
        const rSrc = currentMap.getSource('osmRoads') as maplibregl.GeoJSONSource | undefined
        const wSrc = currentMap.getSource('osmWater') as maplibregl.GeoJSONSource | undefined
        bSrc?.setData(osm.buildings)
        rSrc?.setData(osm.roads)
        wSrc?.setData(osm.water)
        setOsmStatus(
          `OSM: ${osm.buildings.features.length} edificios · ${osm.roads.features.length} caminos · ${osm.water.features.length} cuerpos de agua`
        )
      } catch (error) {
        if (!cancelled) {
          setOsmStatus(error instanceof Error ? error.message : 'Error cargando datos OSM')
        }
      }
    }

    void loadOSMData()
    return () => { cancelled = true }
  }, [mapReady, parsed.corners])

  useEffect(() => {
    const map = mapRef.current
    if (!map || !mapReady || !parsed.corners) return
    const currentMap = map
    const [point1, point2, point3, point4] = parsed.corners

    const source = currentMap.getSource('boundsRect') as maplibregl.GeoJSONSource | undefined
    source?.setData({
      type: 'FeatureCollection',
      features: [{
        type: 'Feature',
        geometry: {
          type: 'Polygon',
          coordinates: [[
            [point1.lon, point1.lat],
            [point2.lon, point2.lat],
            [point3.lon, point3.lat],
            [point4.lon, point4.lat],
            [point1.lon, point1.lat],
          ]],
        },
        properties: {},
      }],
    })

    const maskSource = currentMap.getSource('outsideMask') as maplibregl.GeoJSONSource | undefined
    maskSource?.setData({
      type: 'FeatureCollection',
      features: [{
        type: 'Feature',
        geometry: {
          type: 'Polygon',
          coordinates: [
            [[-180, -90], [180, -90], [180, 90], [-180, 90], [-180, -90]],
            [
              [point1.lon, point1.lat],
              [point4.lon, point4.lat],
              [point3.lon, point3.lat],
              [point2.lon, point2.lat],
              [point1.lon, point1.lat],
            ],
          ],
        },
        properties: {},
      }],
    })

    markersRef.current.forEach((marker) => marker.remove())
    markersRef.current = parsed.corners.map((corner, index) => {
      const element = document.createElement('div')
      element.className = 'flex h-7 min-w-7 items-center justify-center rounded-full border border-slate-950/70 bg-sky-400 px-2 text-[10px] font-bold text-slate-950 shadow'
      element.textContent = `P${index + 1}`
      element.style.display = pointsEnabled ? '' : 'none'
      return new maplibregl.Marker({ element }).setLngLat([corner.lon, corner.lat]).addTo(currentMap)
    })

    const lons = parsed.corners.map((point) => point.lon)
    const lats = parsed.corners.map((point) => point.lat)
    currentMap.fitBounds([
      [Math.min(...lons), Math.min(...lats)],
      [Math.max(...lons), Math.max(...lats)],
    ], { padding: 36, duration: 0, pitch: 72, bearing: -20 })
  }, [mapReady, parsed.corners, pointsEnabled])

  useEffect(() => {
    const map = mapRef.current
    if (!map || !mapReady || !parsed.corners) return
    const currentMap = map
    const corners = parsed.corners

    let cancelled = false

    async function loadGeospatialTerrain() {
      try {
        setMicroReliefSummary('Consultando elevaciones detalladas para microrelieve...')
        const detailGrid = buildSampleGrid(corners, DETAIL_COLS, DETAIL_ROWS)
        const detailElevations = await fetchElevations(detailGrid)
        if (cancelled) return

        const contours = buildContours(corners, detailElevations, DETAIL_COLS, DETAIL_ROWS)
        const contourSource = currentMap.getSource('contours') as maplibregl.GeoJSONSource | undefined
        contourSource?.setData(contours)

        const imageSpec = buildMicroReliefImage(corners, detailElevations, DETAIL_COLS, DETAIL_ROWS)
        if (currentMap.getLayer('microrelief-raster')) currentMap.removeLayer('microrelief-raster')
        if (currentMap.getSource('microrelief-image')) currentMap.removeSource('microrelief-image')
        if (imageSpec && !cancelled) {
          currentMap.addSource('microrelief-image', {
            type: 'image',
            url: imageSpec.url,
            coordinates: imageSpec.coordinates,
          })
          currentMap.addLayer({
            id: 'microrelief-raster',
            type: 'raster',
            source: 'microrelief-image',
            paint: { 'raster-opacity': 0.72, 'raster-resampling': 'linear' },
          }, 'contour-lines')
          currentMap.setLayoutProperty('microrelief-raster', 'visibility', microReliefEnabled ? 'visible' : 'none')
          setMicroReliefSummary(
            `Microrelieve ${DETAIL_COLS}×${DETAIL_ROWS} · cota ${imageSpec.minElevation.toFixed(1)} a ${imageSpec.maxElevation.toFixed(1)} m`
          )
        }
      } catch (error) {
        if (!cancelled) {
          setMicroReliefSummary(error instanceof Error ? error.message : 'No fue posible cargar el microrelieve')
        }
      }
    }

    void loadGeospatialTerrain()

    return () => {
      cancelled = true
    }
  }, [mapReady, parsed.corners, microReliefEnabled])

  return (
    <div className="space-y-3 rounded-xl border bg-background/80 p-3 shadow-sm">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div>
          <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Vista A · Mapa real georreferenciado</p>
          <p className="text-[11px] text-muted-foreground">Base satelital, relieve geográfico y microrelieve continuo sobre el rectángulo real.</p>
        </div>
        <div className="flex flex-wrap gap-1.5">
          <Badge variant={microReliefEnabled ? 'default' : 'outline'} className="cursor-pointer" onClick={() => setMicroReliefEnabled((value) => !value)}>Microrelieve</Badge>
          <Badge variant={hillshadeEnabled ? 'default' : 'outline'} className="cursor-pointer" onClick={() => setHillshadeEnabled((value) => !value)}>Relieve</Badge>
          <Badge variant={contoursEnabled ? 'default' : 'outline'} className="cursor-pointer" onClick={() => setContoursEnabled((value) => !value)}>Curvas</Badge>
          <Badge variant={pointsEnabled ? 'default' : 'outline'} className="cursor-pointer" onClick={() => setPointsEnabled((value) => !value)}>Puntos</Badge>
          <Badge variant={buildingsEnabled ? 'default' : 'outline'} className="cursor-pointer" onClick={() => setBuildingsEnabled((value) => !value)}>Edificios</Badge>
          <Badge variant={roadsEnabled ? 'default' : 'outline'} className="cursor-pointer" onClick={() => setRoadsEnabled((value) => !value)}>Caminos</Badge>
          <Badge variant={waterEnabled ? 'default' : 'outline'} className="cursor-pointer" onClick={() => setWaterEnabled((value) => !value)}>Agua</Badge>
        </div>
      </div>

      <div className="flex flex-wrap items-center gap-4 text-[11px] text-muted-foreground">
        <label className="flex items-center gap-2">
          <span className="whitespace-nowrap">Terreno ×{terrainExaggeration.toFixed(2)}</span>
          <input type="range" min="0.5" max="3" step="0.25" value={terrainExaggeration}
            onChange={(e) => setTerrainExaggeration(Number(e.target.value))}
            className="h-1.5 w-24 cursor-pointer accent-sky-500" />
        </label>
        <label className="flex items-center gap-2">
          <span className="whitespace-nowrap">Edificios ×{buildingExaggeration}</span>
          <input type="range" min="1" max="12" step="1" value={buildingExaggeration}
            onChange={(e) => setBuildingExaggeration(Number(e.target.value))}
            className="h-1.5 w-24 cursor-pointer accent-orange-400" />
        </label>
      </div>

      <div className="overflow-hidden rounded-xl border bg-slate-950">
        <div ref={containerRef} className={`w-full ${mapHeightClassName}`} />
      </div>

      <div className="grid gap-2 text-[11px] text-muted-foreground md:grid-cols-3">
        <div className="rounded-md border bg-muted/30 p-2">
          {parsed.error ?? previewError ?? statusMessage ?? 'Mapa listo para revisar el terreno real antes de importarlo al canvas editable.'}
        </div>
        <div className="rounded-md border bg-muted/30 p-2">
          {preview
            ? `Rectángulo ${Math.round(preview.rectangleWidthMeters)} m × ${Math.round(preview.rectangleDepthMeters)} m · canvas ${preview.gridWidth} m × ${preview.gridDepth} m · muestreo ${preview.sampleStep} m`
            : rectangleMetrics
              ? `Rectángulo estimado ${Math.round(rectangleMetrics.widthMeters)} m × ${Math.round(rectangleMetrics.depthMeters)} m`
              : 'Esperando 4 coordenadas válidas.'}
          <br />
          {isImporting ? 'Actualizando vista mientras corre la importación…' : microReliefSummary}
        </div>
        <div className="rounded-md border bg-muted/30 p-2">
          {osmStatus || 'Esperando coordenadas para cargar datos OSM...'}
        </div>
      </div>
    </div>
  )
}