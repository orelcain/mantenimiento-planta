/**
 * Pureza por puerta (gateMix): qué cayó realmente en cada gate del Grader
 * contra lo que tenía asignado (calibre + calidad), y cómo evolucionó a lo
 * largo del turno en bloques de 30 minutos.
 *
 * Responde la pregunta de terreno «¿en la G6 está cayendo mezclado?» sin bajar
 * los registros crudos: se calcula UNA vez al guardar el Excel, en
 * `computeShiftSummary`, donde las piezas y la config de gates ya están en
 * memoria. Pesa ~2 KB por turno.
 *
 * Reglas:
 *  - Pureza = piezas con el calibre Y la calidad asignados ÷ piezas de la
 *    puerta. Una pieza sin calibre o sin calidad en el Excel NO coincide (se
 *    cuenta como «Sin dato»): mejor un aviso de más que una mezcla escondida.
 *  - `assignedCalibre === 'Other'` significa «cualquier calibre» (p. ej. la
 *    puerta Industrial que recibe de todo): el calibre no se compara.
 *  - Gate presente en las piezas pero sin asignación activa → `purityPct`
 *    null, pero se conservan los desgloses para poder mirarlo igual.
 *  - Los bloques son de reloj (07:00, 07:30…), no relativos al inicio, para
 *    que el eje del gráfico se lea directo. Los timestamps del Grader son
 *    wall-clock marcado como UTC (ver graderSegmenter), así que se opera en UTC.
 */
import type { GateAssignment, PieceRecord } from './types'

export const GATE_MIX_BUCKET_MINUTES = 30
/** Tope de bloques (30 h): protege el doc de un timestamp basura. */
const MAX_BUCKETS = 60
/** Intruso mínimo para reportarlo (bajo esto es ruido de balanza). */
const MIN_INTRUDER_PCT = 1
/** Calibre asignado que significa «cualquiera». */
export const ANY_CALIBRE = 'Other'
/** Clave para piezas sin el dato en el Excel. */
export const SIN_DATO = 'Sin dato'

export interface GateMixIntruder {
  kind: 'calibre' | 'quality'
  value: string
  /** % de las piezas de la puerta. */
  pct: number
}

export interface GateMixEntry {
  gate: number
  /** Piezas clasificadas en la puerta (gates 1-12). */
  pieces: number
  assignedCalibre?: string
  assignedQuality?: string
  /** Piezas que coinciden con lo asignado. 0 si no hay asignación. */
  matchPieces: number
  /** null cuando la puerta no tiene asignación activa. */
  purityPct: number | null
  /** Piezas por calibre real (`Sin dato` si el Excel no lo trae). */
  byCalibre: Record<string, number>
  /** Piezas por calidad real (`Sin dato` si el Excel no lo trae). */
  byQuality: Record<string, number>
  /** El desvío más grande respecto a lo asignado, si supera el 1 %. */
  topIntruder?: GateMixIntruder
  /** Pureza por bloque desde `bucketsFrom`; null = sin piezas en el bloque. */
  purityByBucket: Array<number | null>
}

export interface GateMix {
  /** Inicio del primer bloque, ISO sin zona (wall-clock del Grader). */
  bucketsFrom: string
  bucketMinutes: number
  /** Cantidad de bloques (igual para todas las puertas). */
  bucketCount: number
  gates: GateMixEntry[]
}

function r1(v: number): number {
  return Math.round(v * 10) / 10
}

/** Misma convención que el parser: wall-clock del Grader marcado como Z. */
function isoWallClock(ms: number): string {
  return new Date(ms).toISOString()
}

/**
 * Parsea un ts del módulo como UTC aunque venga sin sufijo: un ISO «naive»
 * (`2026-09-07T07:20:00`) `Date.parse` lo toma como hora LOCAL del navegador
 * y correría los bloques según el huso de quien cargó el Excel.
 */
function parseWallClock(ts: string): number {
  const naive = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}(?::\d{2}(?:\.\d+)?)?$/.test(ts)
  return Date.parse(naive ? `${ts}Z` : ts)
}

function floorToBucket(ms: number): number {
  const size = GATE_MIX_BUCKET_MINUTES * 60_000
  return Math.floor(ms / size) * size
}

interface Acc {
  pieces: number
  match: number
  byCalibre: Map<string, number>
  byQuality: Map<string, number>
  /** índice de bloque → [piezas, coincidentes] */
  buckets: Map<number, [number, number]>
}

/**
 * @param records  piezas productivas (gate > 0). Las de gate 0 se ignoran.
 * @param gates    config de gates del turno; solo cuentan las activas.
 */
export function computeGateMix(
  records: readonly PieceRecord[],
  gates: readonly GateAssignment[],
): GateMix | null {
  const prod = records.filter((rec) => rec.gate > 0 && rec.pieces > 0 && rec.ts)
  if (prod.length === 0) return null

  const assigned = new Map<number, GateAssignment>()
  for (const g of gates) if (g.active) assigned.set(g.gateNumber, g)

  // Ventana de bloques: del primer al último registro, alineada al reloj.
  let minMs = Infinity
  let maxMs = -Infinity
  for (const rec of prod) {
    const ms = parseWallClock(rec.ts)
    if (Number.isNaN(ms)) continue
    if (ms < minMs) minMs = ms
    if (ms > maxMs) maxMs = ms
  }
  if (!Number.isFinite(minMs)) return null
  const from = floorToBucket(minMs)
  const size = GATE_MIX_BUCKET_MINUTES * 60_000
  const bucketCount = Math.min(MAX_BUCKETS, Math.floor((maxMs - from) / size) + 1)

  const acc = new Map<number, Acc>()
  for (const rec of prod) {
    const ms = parseWallClock(rec.ts)
    if (Number.isNaN(ms)) continue
    const a = acc.get(rec.gate) ?? {
      pieces: 0, match: 0, byCalibre: new Map(), byQuality: new Map(), buckets: new Map(),
    }
    const calibre = rec.calibre || SIN_DATO
    const quality = rec.quality || SIN_DATO
    a.pieces += rec.pieces
    a.byCalibre.set(calibre, (a.byCalibre.get(calibre) ?? 0) + rec.pieces)
    a.byQuality.set(quality, (a.byQuality.get(quality) ?? 0) + rec.pieces)

    const g = assigned.get(rec.gate)
    const matches = !!g
      && (g.assignedCalibre === ANY_CALIBRE || calibre === g.assignedCalibre)
      && quality === g.assignedQuality
    if (matches) a.match += rec.pieces

    const bi = Math.floor((ms - from) / size)
    if (bi >= 0 && bi < bucketCount) {
      const b = a.buckets.get(bi) ?? [0, 0]
      b[0] += rec.pieces
      if (matches) b[1] += rec.pieces
      a.buckets.set(bi, b)
    }
    acc.set(rec.gate, a)
  }

  const entries: GateMixEntry[] = []
  for (const [gate, a] of acc) {
    const g = assigned.get(gate)
    const byCalibre = Object.fromEntries(a.byCalibre)
    const byQuality = Object.fromEntries(a.byQuality)

    let topIntruder: GateMixIntruder | undefined
    if (g) {
      const candidates: GateMixIntruder[] = []
      if (g.assignedCalibre !== ANY_CALIBRE) {
        for (const [value, pieces] of a.byCalibre) {
          if (value !== g.assignedCalibre) candidates.push({ kind: 'calibre', value, pct: r1(pieces / a.pieces * 100) })
        }
      }
      for (const [value, pieces] of a.byQuality) {
        if (value !== g.assignedQuality) candidates.push({ kind: 'quality', value, pct: r1(pieces / a.pieces * 100) })
      }
      candidates.sort((x, y) => y.pct - x.pct)
      if (candidates[0] && candidates[0].pct >= MIN_INTRUDER_PCT) topIntruder = candidates[0]
    }

    const purityByBucket: Array<number | null> = []
    for (let i = 0; i < bucketCount; i++) {
      const b = a.buckets.get(i)
      purityByBucket.push(g && b && b[0] > 0 ? r1(b[1] / b[0] * 100) : null)
    }

    entries.push({
      gate,
      pieces: a.pieces,
      ...(g ? { assignedCalibre: g.assignedCalibre, assignedQuality: g.assignedQuality } : {}),
      matchPieces: g ? a.match : 0,
      purityPct: g ? r1(a.match / a.pieces * 100) : null,
      byCalibre,
      byQuality,
      ...(topIntruder ? { topIntruder } : {}),
      purityByBucket,
    })
  }
  entries.sort((x, y) => x.gate - y.gate)

  return {
    bucketsFrom: isoWallClock(from),
    bucketMinutes: GATE_MIX_BUCKET_MINUTES,
    bucketCount,
    gates: entries,
  }
}

/** Piezas coincidentes y totales del turno entre las puertas con asignación. */
export function gateMixTotals(mix: GateMix): { match: number; pieces: number; purityPct: number | null } {
  let match = 0
  let pieces = 0
  for (const g of mix.gates) {
    if (g.purityPct == null) continue
    match += g.matchPieces
    pieces += g.pieces
  }
  return { match, pieces, purityPct: pieces > 0 ? r1(match / pieces * 100) : null }
}
