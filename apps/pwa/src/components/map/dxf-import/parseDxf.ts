/**
 * parseDxf.ts
 * Convierte un archivo .dxf (texto) a capas GeoJSON usando dxf-parser.
 *
 * DXF coords [X, Y] → GeoJSON [X, Y] (lon, lat).
 * En CRS.Simple Leaflet los trata como píxeles/metros directos.
 */

// dxf-parser es CJS; el import default funciona con Vite
// eslint-disable-next-line @typescript-eslint/ban-ts-comment
// @ts-ignore
import DxfParser from 'dxf-parser'

// ── Tipos de salida ──────────────────────────────────────────────────────────

export interface CapaDxfParseada {
  name: string
  color: string          // hex '#rrggbb'
  entityCount: number
  geojson: GeoJSON.FeatureCollection
}

export interface ResultadoParseDxf {
  capas: CapaDxfParseada[]
  bounds: [[number, number], [number, number]]  // [[Ymin,Xmin],[Ymax,Xmax]]
  warnings: string[]
}

// ── Colores AutoCAD (índice 1-9 básico) ─────────────────────────────────────

const ACI_COLORS: Record<number, string> = {
  1: '#ff0000', 2: '#ffff00', 3: '#00ff00', 4: '#00ffff',
  5: '#0000ff', 6: '#ff00ff', 7: '#ffffff', 8: '#808080', 9: '#c0c0c0',
}

function aciToHex(colorNum: number | undefined): string {
  if (!colorNum) return '#c8d8f0'
  return ACI_COLORS[colorNum] ?? '#c8d8f0'
}

// ── Aproximar arco de círculo a puntos ──────────────────────────────────────

function arcPoints(
  cx: number, cy: number, r: number,
  startDeg: number, endDeg: number,
  segments = 32,
): [number, number][] {
  const pts: [number, number][] = []
  let end = endDeg < startDeg ? endDeg + 360 : endDeg
  const step = (end - startDeg) / segments
  for (let i = 0; i <= segments; i++) {
    const a = ((startDeg + i * step) * Math.PI) / 180
    pts.push([cx + r * Math.cos(a), cy + r * Math.sin(a)])
  }
  return pts
}

function circlePoints(cx: number, cy: number, r: number, n = 32): [number, number][] {
  return arcPoints(cx, cy, r, 0, 360, n)
}

// ── Entidad → Feature(s) GeoJSON ────────────────────────────────────────────

type GeoFeature = GeoJSON.Feature<GeoJSON.Geometry>

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function entityToFeatures(e: any): GeoFeature[] {
  try {
    switch (e.type) {
      case 'LINE': {
        const coords: [number, number][] = [
          [e.start.x, e.start.y],
          [e.end.x,   e.end.y],
        ]
        return [{ type: 'Feature', properties: {}, geometry: { type: 'LineString', coordinates: coords } }]
      }

      case 'LWPOLYLINE':
      case 'POLYLINE': {
        const verts: [number, number][] = (e.vertices ?? []).map(
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          (v: any) => [v.x, v.y] as [number, number]
        )
        if (verts.length < 2) return []
        const closed = e.shape ?? e.closed ?? false
        if (closed) {
          verts.push(verts[0]!)
          return [{ type: 'Feature', properties: {}, geometry: { type: 'Polygon', coordinates: [verts] } }]
        }
        return [{ type: 'Feature', properties: {}, geometry: { type: 'LineString', coordinates: verts } }]
      }

      case 'CIRCLE': {
        const pts = circlePoints(e.center.x, e.center.y, e.radius)
        pts.push(pts[0]!)
        return [{ type: 'Feature', properties: {}, geometry: { type: 'Polygon', coordinates: [pts] } }]
      }

      case 'ARC': {
        const pts = arcPoints(e.center.x, e.center.y, e.radius, e.startAngle ?? 0, e.endAngle ?? 360)
        return [{ type: 'Feature', properties: {}, geometry: { type: 'LineString', coordinates: pts } }]
      }

      case 'POINT':
        return [{ type: 'Feature', properties: {}, geometry: { type: 'Point', coordinates: [e.position.x, e.position.y] } }]

      case 'SPLINE': {
        const pts = (e.controlPoints ?? e.fitPoints ?? []).map(
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          (p: any) => [p.x, p.y] as [number, number]
        )
        if (pts.length < 2) return []
        return [{ type: 'Feature', properties: {}, geometry: { type: 'LineString', coordinates: pts } }]
      }

      default:
        return []
    }
  } catch {
    return []
  }
}

// ── Calcular bounds desde todas las coordenadas ──────────────────────────────

function updateBounds(
  coords: [number, number][],
  b: { minX: number; minY: number; maxX: number; maxY: number },
) {
  for (const [x, y] of coords) {
    if (x < b.minX) b.minX = x
    if (x > b.maxX) b.maxX = x
    if (y < b.minY) b.minY = y
    if (y > b.maxY) b.maxY = y
  }
}

function featuresCoords(f: GeoFeature): [number, number][] {
  const g = f.geometry
  if (g.type === 'Point') return [[g.coordinates[0]!, g.coordinates[1]!]]
  if (g.type === 'LineString') return g.coordinates as [number, number][]
  if (g.type === 'Polygon') return g.coordinates[0] as [number, number][]
  return []
}

// ── Función principal ────────────────────────────────────────────────────────

export function parseDxfText(text: string): ResultadoParseDxf {
  const parser = new DxfParser()
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const dxf = parser.parseSync(text) as any

  const warnings: string[] = []
  const layerMap = new Map<string, GeoFeature[]>()
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const layerColorMap = new Map<string, string>()

  // Colores de las capas definidos en TABLES
  const layerTable = dxf?.tables?.layer?.layers ?? {}
  for (const [name, info] of Object.entries(layerTable)) {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    layerColorMap.set(name, aciToHex((info as any).color))
  }

  // Procesar entidades
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  for (const entity of (dxf?.entities ?? []) as any[]) {
    const layer = entity.layer ?? '0'
    if (!layerMap.has(layer)) layerMap.set(layer, [])
    const features = entityToFeatures(entity)
    layerMap.get(layer)!.push(...features)
  }

  // Bounds globales
  const b = { minX: Infinity, minY: Infinity, maxX: -Infinity, maxY: -Infinity }

  // Intentar bounds del header primero
  if (dxf?.header?.$EXTMIN && dxf?.header?.$EXTMAX) {
    const mn = dxf.header.$EXTMIN
    const mx = dxf.header.$EXTMAX
    if (isFinite(mn.x) && isFinite(mx.x)) {
      b.minX = mn.x; b.minY = mn.y; b.maxX = mx.x; b.maxY = mx.y
    }
  }

  // Construir capas
  const capas: CapaDxfParseada[] = []

  for (const [name, features] of layerMap.entries()) {
    if (!features.length) continue

    // Actualizar bounds desde geometría si header no los dio
    if (!isFinite(b.minX)) {
      for (const f of features) updateBounds(featuresCoords(f), b)
    }

    const fc: GeoJSON.FeatureCollection = { type: 'FeatureCollection', features }
    capas.push({
      name,
      color: layerColorMap.get(name) ?? '#c8d8f0',
      entityCount: features.length,
      geojson: fc,
    })
  }

  if (!isFinite(b.minX)) {
    warnings.push('No se pudieron determinar los bounds del DXF')
    b.minX = 0; b.minY = 0; b.maxX = 100; b.maxY = 100
  }

  // Ordenar por nombre
  capas.sort((a, z) => a.name.localeCompare(z.name))

  return {
    capas,
    bounds: [[b.minY, b.minX], [b.maxY, b.maxX]],
    warnings,
  }
}
