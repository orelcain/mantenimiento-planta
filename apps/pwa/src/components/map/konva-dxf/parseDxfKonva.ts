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

  const bbox: [number, number, number, number] = [
    result.bbox.min.x,
    result.bbox.min.y,
    result.bbox.max.x,
    result.bbox.max.y,
  ]

  // Si el bbox es inválido, calcular de vertices
  if (!isFinite(bbox[0]) || !isFinite(bbox[2])) {
    let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity
    for (const capa of capas) {
      for (const poly of capa.polylines) {
        for (const [x, y] of poly) {
          if (x < minX) minX = x
          if (x > maxX) maxX = x
          if (y < minY) minY = y
          if (y > maxY) maxY = y
        }
      }
    }
    bbox[0] = minX; bbox[1] = minY; bbox[2] = maxX; bbox[3] = maxY
  }

  return { capas, bbox, warnings }
}
