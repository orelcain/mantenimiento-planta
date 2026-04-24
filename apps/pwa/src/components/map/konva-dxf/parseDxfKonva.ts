/**
 * parseDxfKonva.ts
 * Usa el paquete `dxf` (gdsestimating/dxf) para parsear y convertir TODAS
 * las entidades a polilíneas interpoladas listas para renderizar en Konva.
 *
 * Ventajas sobre nuestro parser custom:
 * - Expande INSERT (bloques) con transformaciones anidadas
 * - Interpola SPLINE, ELLIPSE, ARC correctamente
 * - Resuelve colores por capa (ByLayer)
 * - Calcula bbox real de la geometría
 */

// dxf package es CJS sin tipos — el default export es una función, y `Helper` es export named
// eslint-disable-next-line @typescript-eslint/ban-ts-comment
// @ts-ignore
import { Helper } from 'dxf'

// ── Tipos ────────────────────────────────────────────────────────────────────

export interface CapaKonva {
  name: string
  color: string                 // hex '#rrggbb' por capa (ByLayer)
  entityCount: number
  /** Cada elemento es una polilínea: array de [x, y] */
  polylines: [number, number][][]
}

export interface ResultadoParseKonva {
  capas: CapaKonva[]
  /** [minX, minY, maxX, maxY] */
  bbox: [number, number, number, number]
  warnings: string[]
}

// ── Helpers ──────────────────────────────────────────────────────────────────

function rgbToHex(rgb: [number, number, number] | string | undefined): string {
  if (!rgb) return '#c8d8f0'
  if (typeof rgb === 'string') return rgb
  const [r, g, b] = rgb
  const toHex = (n: number) => Math.max(0, Math.min(255, Math.round(n))).toString(16).padStart(2, '0')
  return `#${toHex(r)}${toHex(g)}${toHex(b)}`
}

// ── Parser principal ─────────────────────────────────────────────────────────

export function parseDxfKonva(text: string): ResultadoParseKonva {
  const helper = new Helper(text)
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const result = helper.toPolylines() as {
    bbox: { min: { x: number; y: number }; max: { x: number; y: number } }
    polylines: Array<{
      rgb: [number, number, number] | string
      layer?: { name?: string }
      vertices: Array<[number, number]>
    }>
  }

  const warnings: string[] = []
  const capasMap = new Map<string, CapaKonva>()

  for (const poly of result.polylines) {
    if (!poly.vertices || poly.vertices.length < 2) continue
    const layerName = poly.layer?.name ?? '0'
    let capa = capasMap.get(layerName)
    if (!capa) {
      capa = {
        name: layerName,
        color: rgbToHex(poly.rgb),
        entityCount: 0,
        polylines: [],
      }
      capasMap.set(layerName, capa)
    }
    capa.polylines.push(poly.vertices.map(([x, y]) => [x, y] as [number, number]))
    capa.entityCount++
  }

  if (capasMap.size === 0) {
    warnings.push('El DXF no contiene entidades geométricas renderizables')
  }

  // Ordenar capas alfabéticamente
  const capas = Array.from(capasMap.values()).sort((a, b) => a.name.localeCompare(b.name))

  const bbox = computeRobustBbox(capas, warnings)

  return { capas, bbox, warnings }
}

// ── Bbox robusto (ignorando outliers tipo "paper space") ─────────────────────

/**
 * Muchos DXF de AutoCAD contienen polilíneas de "paper space" (viewports,
 * cajetines, bordes de hoja) cuyas coordenadas están a decenas de miles de
 * unidades del "model space" real. Si incluimos esas en el bbox, el fit-to-bbox
 * deja el contenido real microscópico.
 *
 * Estrategia:
 *   1. Por cada polilínea, calcular su centro (cx, cy).
 *   2. Usar mediana + MAD (median absolute deviation) para detectar outliers.
 *   3. Excluir polilíneas cuyo centro esté a > 15 · MAD de la mediana.
 *   4. Calcular bbox con las polilíneas restantes.
 */
function computeRobustBbox(capas: CapaKonva[], warnings: string[]): [number, number, number, number] {
  const centros: Array<{ cx: number; cy: number; poly: [number, number][] }> = []
  for (const capa of capas) {
    for (const poly of capa.polylines) {
      let sx = 0, sy = 0
      for (const [x, y] of poly) { sx += x; sy += y }
      centros.push({ cx: sx / poly.length, cy: sy / poly.length, poly })
    }
  }
  if (!centros.length) return [0, 0, 100, 100]

  // Mediana de X e Y por separado
  const xs = centros.map((c) => c.cx).sort((a, b) => a - b)
  const ys = centros.map((c) => c.cy).sort((a, b) => a - b)
  const medX = xs[Math.floor(xs.length / 2)]!
  const medY = ys[Math.floor(ys.length / 2)]!

  // MAD (desviación mediana absoluta)
  const devX = centros.map((c) => Math.abs(c.cx - medX)).sort((a, b) => a - b)
  const devY = centros.map((c) => Math.abs(c.cy - medY)).sort((a, b) => a - b)
  const madX = Math.max(devX[Math.floor(devX.length / 2)]!, 1)
  const madY = Math.max(devY[Math.floor(devY.length / 2)]!, 1)

  const UMBRAL = 15
  const insiders = centros.filter(
    (c) => Math.abs(c.cx - medX) <= UMBRAL * madX && Math.abs(c.cy - medY) <= UMBRAL * madY,
  )

  const descartados = centros.length - insiders.length
  if (descartados > 0) {
    warnings.push(`${descartados} polilíneas outlier descartadas del bbox (probable paper space)`)
  }

  const pool = insiders.length ? insiders : centros
  let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity
  for (const { poly } of pool) {
    for (const [x, y] of poly) {
      if (x < minX) minX = x
      if (x > maxX) maxX = x
      if (y < minY) minY = y
      if (y > maxY) maxY = y
    }
  }

  if (!isFinite(minX)) return [0, 0, 100, 100]
  // Margen pequeño
  const padX = (maxX - minX) * 0.02
  const padY = (maxY - minY) * 0.02
  return [minX - padX, minY - padY, maxX + padX, maxY + padY]
}
