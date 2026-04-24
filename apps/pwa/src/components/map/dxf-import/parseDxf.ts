/**
 * parseDxf.ts
 * Convierte un archivo .dxf (texto) a capas GeoJSON usando dxf-parser.
 *
 * DXF coords [X, Y] → GeoJSON [X, Y] (lon, lat).
 * En CRS.Simple Leaflet los trata como píxeles/metros directos.
 */

// dxf-parser es CJS sin tipos TS; el import default funciona con Vite
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
  const end = endDeg < startDeg ? endDeg + 360 : endDeg
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
// dxf-parser no tiene definiciones TS — los parámetros son unknown en runtime
type DxfEntity = Record<string, unknown>
type DxfVertex = { x: number; y: number }
type DxfBlocks = Record<string, { entities?: DxfEntity[] }>
type Transform = { dx: number; dy: number; sx: number; sy: number; rot: number }

const IDENTITY: Transform = { dx: 0, dy: 0, sx: 1, sy: 1, rot: 0 }

function applyTransform(x: number, y: number, t: Transform): [number, number] {
  const xs = x * t.sx
  const ys = y * t.sy
  const cos = Math.cos(t.rot)
  const sin = Math.sin(t.rot)
  return [xs * cos - ys * sin + t.dx, xs * sin + ys * cos + t.dy]
}

function transformCoords(coords: [number, number][], t: Transform): [number, number][] {
  return coords.map(([x, y]) => applyTransform(x, y, t))
}

function transformFeature(f: GeoFeature, t: Transform): GeoFeature {
  if (t === IDENTITY) return f
  const g = f.geometry
  if (g.type === 'Point') {
    const [x, y] = g.coordinates
    return { ...f, geometry: { type: 'Point', coordinates: applyTransform(x!, y!, t) } }
  }
  if (g.type === 'LineString') {
    return { ...f, geometry: { type: 'LineString', coordinates: transformCoords(g.coordinates as [number, number][], t) } }
  }
  if (g.type === 'Polygon') {
    return { ...f, geometry: { type: 'Polygon', coordinates: g.coordinates.map((ring) => transformCoords(ring as [number, number][], t)) } }
  }
  return f
}

function entityToFeatures(e: DxfEntity, blocks: DxfBlocks, depth = 0): GeoFeature[] {
  try {
    switch (e.type) {
      case 'LINE': {
        const s = e.start as DxfVertex
        const n = e.end   as DxfVertex
        const coords: [number, number][] = [[s.x, s.y], [n.x, n.y]]
        return [{ type: 'Feature', properties: {}, geometry: { type: 'LineString', coordinates: coords } }]
      }

      case 'LWPOLYLINE':
      case 'POLYLINE': {
        const verts: [number, number][] = ((e.vertices ?? []) as DxfVertex[]).map(
          (v) => [v.x, v.y] as [number, number]
        )
        if (verts.length < 2) return []
        const closed = (e.shape ?? e.closed ?? false) as boolean
        if (closed) {
          verts.push(verts[0]!)
          return [{ type: 'Feature', properties: {}, geometry: { type: 'Polygon', coordinates: [verts] } }]
        }
        return [{ type: 'Feature', properties: {}, geometry: { type: 'LineString', coordinates: verts } }]
      }

      case 'CIRCLE': {
        const c = e.center as DxfVertex
        const pts = circlePoints(c.x, c.y, e.radius as number)
        pts.push(pts[0]!)
        return [{ type: 'Feature', properties: {}, geometry: { type: 'Polygon', coordinates: [pts] } }]
      }

      case 'ARC': {
        const c = e.center as DxfVertex
        const pts = arcPoints(c.x, c.y, e.radius as number, (e.startAngle ?? 0) as number, (e.endAngle ?? 360) as number)
        return [{ type: 'Feature', properties: {}, geometry: { type: 'LineString', coordinates: pts } }]
      }

      case 'ELLIPSE': {
        // Elipse DXF: center + majorAxisEndPoint (relativo al center) + axisRatio + startAngle/endAngle (radianes)
        const c = e.center as DxfVertex
        const maj = e.majorAxisEndPoint as DxfVertex
        const ratio = (e.axisRatio ?? 1) as number
        const a = Math.hypot(maj.x, maj.y)
        const b = a * ratio
        const rot = Math.atan2(maj.y, maj.x)
        const start = (e.startAngle ?? 0) as number
        const end   = (e.endAngle ?? Math.PI * 2) as number
        const span = end <= start ? end + Math.PI * 2 - start : end - start
        const n = 48
        const pts: [number, number][] = []
        for (let i = 0; i <= n; i++) {
          const th = start + (span * i) / n
          const x = a * Math.cos(th)
          const y = b * Math.sin(th)
          const xr = x * Math.cos(rot) - y * Math.sin(rot) + c.x
          const yr = x * Math.sin(rot) + y * Math.cos(rot) + c.y
          pts.push([xr, yr])
        }
        const closed = Math.abs(span - Math.PI * 2) < 1e-4
        if (closed) {
          return [{ type: 'Feature', properties: {}, geometry: { type: 'Polygon', coordinates: [pts] } }]
        }
        return [{ type: 'Feature', properties: {}, geometry: { type: 'LineString', coordinates: pts } }]
      }

      case 'POINT': {
        const p = e.position as DxfVertex
        return [{ type: 'Feature', properties: {}, geometry: { type: 'Point', coordinates: [p.x, p.y] } }]
      }

      case 'SPLINE': {
        const raw = (e.controlPoints ?? e.fitPoints ?? []) as DxfVertex[]
        const pts = raw.map((p) => [p.x, p.y] as [number, number])
        if (pts.length < 2) return []
        return [{ type: 'Feature', properties: {}, geometry: { type: 'LineString', coordinates: pts } }]
      }

      case 'INSERT': {
        // Expansión de bloque: aplicar transform (posición + rotación + escala) a las
        // entidades del bloque referenciado. Soporta anidación limitada.
        if (depth > 6) return [] // evitar recursión infinita
        const blockName = e.name as string | undefined
        if (!blockName) return []
        const block = blocks[blockName]
        if (!block || !block.entities) return []
        const pos = (e.position as DxfVertex) ?? { x: 0, y: 0 }
        const t: Transform = {
          dx: pos.x,
          dy: pos.y,
          sx: ((e.xScale ?? 1) as number),
          sy: ((e.yScale ?? 1) as number),
          rot: ((e.rotation ?? 0) as number) * Math.PI / 180,
        }
        const out: GeoFeature[] = []
        for (const child of block.entities) {
          const childFeatures = entityToFeatures(child, blocks, depth + 1)
          for (const f of childFeatures) out.push(transformFeature(f, t))
        }
        return out
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
  const dxf = parser.parseSync(text) as unknown as Record<string, unknown>

  const warnings: string[] = []
  const layerMap = new Map<string, GeoFeature[]>()
  const layerColorMap = new Map<string, string>()

  // Colores de las capas definidos en TABLES
  const layerTable = ((dxf?.tables as Record<string, unknown>)?.layer as Record<string, unknown>)?.layers ?? {}
  for (const [name, info] of Object.entries(layerTable as Record<string, unknown>)) {
    layerColorMap.set(name, aciToHex((info as Record<string, unknown>).color as number))
  }

  // Bloques (para expansión de INSERT)
  const blocks = (dxf?.blocks ?? {}) as DxfBlocks

  // Procesar entidades — tracking de tipos ignorados para diagnóstico
  const ignorados: Record<string, number> = {}
  const supported = new Set([
    'LINE','LWPOLYLINE','POLYLINE','CIRCLE','ARC','ELLIPSE','POINT','SPLINE','INSERT',
  ])
  for (const entity of ((dxf?.entities ?? []) as DxfEntity[])) {
    const t = String(entity.type)
    if (!supported.has(t)) ignorados[t] = (ignorados[t] ?? 0) + 1
    const layer = (entity.layer as string) ?? '0'
    if (!layerMap.has(layer)) layerMap.set(layer, [])
    const features = entityToFeatures(entity, blocks)
    layerMap.get(layer)!.push(...features)
  }

  if (Object.keys(ignorados).length) {
    const resumen = Object.entries(ignorados).map(([k, v]) => `${k}:${v}`).join(', ')
    warnings.push(`Entidades ignoradas: ${resumen}`)
    // eslint-disable-next-line no-console
    console.info('[parseDxf] entidades sin soporte:', ignorados)
  }
  // eslint-disable-next-line no-console
  console.info('[parseDxf] bloques disponibles:', Object.keys(blocks).length)

  // Bounds globales — SIEMPRE desde geometría (los $EXTMIN/MAX del header
  // suelen ser irrealmente grandes o estar desactualizados)
  const b = { minX: Infinity, minY: Infinity, maxX: -Infinity, maxY: -Infinity }

  // Construir capas + calcular bounds de todas las features
  const capas: CapaDxfParseada[] = []

  for (const [name, features] of layerMap.entries()) {
    if (!features.length) continue

    for (const f of features) updateBounds(featuresCoords(f), b)

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
