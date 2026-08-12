/**
 * graderCalibreHistory.ts — ¿la config de gates aguanta lo que suele venir?
 *
 * El análisis de saturación que ya existe (`GateBreakdownCard`) contesta la
 * pregunta DESPUÉS: con el Excel del turno cargado dice qué gate quedó chica.
 * Para entonces el turno ya pasó. Esto contesta la misma pregunta ANTES,
 * usando lo único que se sabe antes de producir la primera pieza: cómo se
 * repartieron los calibres en los turnos anteriores.
 *
 * ── Por qué por CALIBRE y no por calibre × calidad ───────────────────────────
 *
 * `GateBreakdownCard` agrupa por (calibre, calidad) porque tiene el Excel y
 * puede cruzar ambas cosas. Acá la fuente es `calibreDistribution` del resumen
 * de cada turno, que guarda SOLO el calibre. Cruzar con calidad exigiría releer
 * las piezas de cada turno histórico —miles de documentos— para responder algo
 * que el calibre ya contesta: el 8-10 lb es más de la mitad de la producción y
 * la config le deja 3 de 12 gates.
 *
 * ── Por qué NO se filtra por lote ────────────────────────────────────────────
 *
 * `lotsInShift` está vacío en casi todos los resúmenes reales (verificado en
 * producción: 1 de 37 turnos lo tiene). Filtrar por lote dejaría la tarjeta
 * muda. Se compara contra los últimos N turnos de la línea y se dice cuáles
 * son, para que quien mira pueda descartar el período si no representa lo que
 * está entrando hoy.
 *
 * ── El calibre viene sin normalizar ──────────────────────────────────────────
 *
 * Los turnos de agosto traen `"8-10 lb"` y los de agosto 3 `"8 - 10 LB"`: es el
 * mismo calibre escrito distinto por Matrix. Sin normalizar, el histórico los
 * cuenta como dos calibres y todos los porcentajes salen mal. `calibreKey()` es
 * la misma normalización que usa `GateBreakdownCard` para agrupar.
 */

import { GATE_RATIO_THRESHOLDS, gateStatusFromRatio, type GateAssignmentStatus } from './graderGateAssignment'
import type { GateAssignment, GraderDailySummary } from './types'

/** Cuántos turnos anteriores se miran por defecto. */
export const DEFAULT_HISTORY_SHIFTS = 6

/** Mínimo de turnos para que el histórico signifique algo. */
export const MIN_HISTORY_SHIFTS = 3

/** Máximo de movimientos que se proponen de una vez. */
const MAX_MOVES = 3

/** Clave de agrupación: "8 - 10 LB" y "8-10 lb" son el mismo calibre. */
export function calibreKey(calibre: string): string {
  return String(calibre ?? '').toLowerCase().replace(/\s+/g, '')
}

export interface CalibreHistory {
  /** Turnos efectivamente usados, del más reciente al más antiguo. */
  shiftIds: string[]
  fromDateKey: string
  toDateKey: string
  totalPieces: number
  /** Reparto de la producción por calibre, de mayor a menor. */
  rows: Array<{ key: string; label: string; pieces: number; pct: number }>
}

/**
 * Agrega el reparto de calibres de los turnos anteriores, ponderado por piezas
 * (un turno de 9.000 piezas pesa más que uno de 1.500 — el promedio simple de
 * porcentajes le daría el mismo voto a los dos).
 */
export function aggregateCalibreHistory(
  summaries: GraderDailySummary[],
  maxShifts: number = DEFAULT_HISTORY_SHIFTS,
): CalibreHistory | null {
  const usables = summaries
    .filter((s) => (s.calibreDistribution?.length ?? 0) > 0)
    .sort((a, b) => (b.startAt ?? b.dateKey ?? '').localeCompare(a.startAt ?? a.dateKey ?? ''))
    .slice(0, maxShifts)

  if (usables.length < MIN_HISTORY_SHIFTS) return null

  const pieces = new Map<string, number>()
  // El label se toma del turno MÁS RECIENTE que use ese calibre: si Matrix
  // cambió la forma de escribirlo, se muestra la vigente y no la vieja.
  const labels = new Map<string, string>()
  let totalPieces = 0

  for (const s of usables) {
    for (const c of s.calibreDistribution ?? []) {
      const key = calibreKey(c.calibre)
      if (!key) continue
      pieces.set(key, (pieces.get(key) ?? 0) + c.pieces)
      if (!labels.has(key)) labels.set(key, c.calibre)
      totalPieces += c.pieces
    }
  }
  if (totalPieces === 0) return null

  const dateKeys = usables.map((s) => s.dateKey).filter(Boolean).sort()

  return {
    shiftIds: usables.map((s) => s.id ?? `${s.dateKey}__${s.shiftId}`),
    fromDateKey: dateKeys[0] ?? '',
    toDateKey: dateKeys[dateKeys.length - 1] ?? '',
    totalPieces,
    rows: [...pieces.entries()]
      .map(([key, p]) => ({ key, label: labels.get(key) ?? key, pieces: p, pct: (p / totalPieces) * 100 }))
      .sort((a, b) => b.pieces - a.pieces),
  }
}

export interface CalibreFit {
  key: string
  label: string
  /** Gates activas asignadas a este calibre. */
  gates: number[]
  gatesPct: number
  /** % de la producción histórica que se llevó este calibre. */
  productionPct: number
  /** productionPct / gatesPct. Sin gates asignadas → Infinity. */
  ratio: number
  status: GateAssignmentStatus
}

/**
 * Cruza la config vigente con el histórico.
 *
 * Un calibre con producción y CERO gates da `ratio: Infinity` y sale como
 * saturado: no es un caso de borde a ignorar, es el peor caso posible —el
 * pescado de ese calibre no tiene dónde caer y termina en el rechazo.
 */
export function compareGatesVsHistory(gates: GateAssignment[], history: CalibreHistory): CalibreFit[] {
  const active = gates.filter((g) => g.active)
  if (active.length === 0) return []

  const byKey = new Map<string, number[]>()
  const labels = new Map<string, string>()
  for (const g of active) {
    const key = calibreKey(g.assignedCalibre)
    if (!key) continue
    if (!byKey.has(key)) byKey.set(key, [])
    byKey.get(key)!.push(g.gateNumber)
    if (!labels.has(key)) labels.set(key, g.assignedCalibre)
  }
  for (const r of history.rows) if (!labels.has(r.key)) labels.set(r.key, r.label)

  const prodByKey = new Map(history.rows.map((r) => [r.key, r.pct]))

  return [...new Set([...byKey.keys(), ...prodByKey.keys()])]
    .map((key) => {
      const gateNumbers = (byKey.get(key) ?? []).sort((a, b) => a - b)
      const gatesPct = (gateNumbers.length / active.length) * 100
      const productionPct = prodByKey.get(key) ?? 0
      const ratio = gatesPct > 0 ? productionPct / gatesPct : (productionPct > 0 ? Infinity : 0)
      return {
        key,
        label: labels.get(key) ?? key,
        gates: gateNumbers,
        gatesPct,
        productionPct,
        ratio,
        status: gateStatusFromRatio(ratio),
      }
    })
    .sort((a, b) => b.productionPct - a.productionPct)
}

export interface GateMove {
  /** Calibre que cede una gate. */
  fromKey: string
  fromLabel: string
  /** Gates candidatas del grupo donante — quien decide elige cuál. */
  fromGates: number[]
  toKey: string
  toLabel: string
  /** Ratio del calibre saturado antes y después de este movimiento. */
  beforeRatio: number
  afterRatio: number
  afterStatus: GateAssignmentStatus
}

/**
 * Propone mover gates del calibre más sobredimensionado al más saturado, de a
 * una, recalculando después de cada movimiento.
 *
 * ⚠ Nunca deja un calibre en 0 gates aunque el ratio lo justifique: el pescado
 * de ese calibre igual va a llegar y sin gate cae al rechazo. Solo cede quien
 * tiene 2 o más.
 *
 * No dice QUÉ gate mover porque sin el Excel del turno no se sabe cuál del
 * grupo produjo menos. Nombra las candidatas y el editor hace el cambio.
 */
export function suggestGateMoves(fits: CalibreFit[], totalActiveGates: number): GateMove[] {
  if (totalActiveGates === 0) return []

  // Copia mutable: cada movimiento cambia los ratios de los siguientes.
  const state = fits.map((f) => ({ ...f, count: f.gates.length, gates: [...f.gates] }))
  const moves: GateMove[] = []

  const recompute = (row: (typeof state)[number]) => {
    const gatesPct = (row.count / totalActiveGates) * 100
    row.gatesPct = gatesPct
    row.ratio = gatesPct > 0 ? row.productionPct / gatesPct : (row.productionPct > 0 ? Infinity : 0)
    row.status = gateStatusFromRatio(row.ratio)
  }

  for (let i = 0; i < MAX_MOVES; i++) {
    const dest = state
      .filter((r) => r.status === 'saturado')
      .sort((a, b) => b.ratio - a.ratio)[0]
    if (!dest) break

    const donor = state
      .filter((r) => r.key !== dest.key && r.count >= 2 && r.status === 'sobredimensionado')
      .sort((a, b) => a.ratio - b.ratio)[0]
    if (!donor) break

    const beforeRatio = dest.ratio
    donor.count -= 1
    dest.count += 1
    recompute(donor)
    recompute(dest)

    moves.push({
      fromKey: donor.key,
      fromLabel: donor.label,
      fromGates: donor.gates,
      toKey: dest.key,
      toLabel: dest.label,
      beforeRatio,
      afterRatio: dest.ratio,
      afterStatus: dest.status,
    })

    // Si el movimiento empeoró al donante hasta saturarlo, se deshace: cambiar
    // un cuello de botella por otro no es una mejora.
    if (donor.ratio > GATE_RATIO_THRESHOLDS.saturatedAbove) {
      moves.pop()
      donor.count += 1
      dest.count -= 1
      recompute(donor)
      recompute(dest)
      break
    }
  }

  return moves
}

/** Piezas que, según el histórico, dependen de los calibres saturados. */
export function piecesAtRisk(fits: CalibreFit[], history: CalibreHistory): number {
  const saturados = new Set(fits.filter((f) => f.status === 'saturado').map((f) => f.key))
  return history.rows
    .filter((r) => saturados.has(r.key))
    .reduce((sum, r) => sum + r.pieces, 0)
}
