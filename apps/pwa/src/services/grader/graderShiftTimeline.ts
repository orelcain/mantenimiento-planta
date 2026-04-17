/**
 * Motor del timeline de turno: une uploads + acciones + piezas en una
 * estructura unificada para la vista de turno (live y closed).
 */

import type { PieceRecord, Gate0Record, MatrixP0Cause } from './types'
import type { ShiftTimeWindow } from './graderShiftStatus'
import { INTRA_SHIFT_THRESHOLDS } from './graderThresholds'

// Re-export para que graderMatrixP0Causes.ts pueda importar desde aquí
export type { MatrixP0Cause } from './types'

// ============================================================================
// TIPOS
// ============================================================================

export interface ShiftSnapshot {
  totalPieces: number
  p0Pct: number
  topCause: MatrixP0Cause | null
  throughputPzPerMin: number
}

export interface AppliedAction {
  field: string
  before: unknown
  after: unknown
  reason?: string
}

export interface ActionOutcome {
  p0BeforePct: number
  p0AfterPct: number
  piecesAfter: number
  verdict: 'improved' | 'neutral' | 'worsened' | 'insufficient-data'
}

export type TimelineCheckpoint =
  | { kind: 'upload'; at: string; by: string; fileName: string; snapshot: ShiftSnapshot }
  | { kind: 'action'; at: string; by: string; action: AppliedAction; outcome?: ActionOutcome }
  | { kind: 'shift-start'; at: string }
  | { kind: 'shift-end'; at: string }

export interface ShiftSegmentAnalysis {
  fromAt: string
  toAt: string
  totalPieces: number
  p0Pieces: number
  p0Pct: number
  topCauses: Array<{ cause: MatrixP0Cause; pieces: number; pct: number }>
  pulseByMinute?: Array<{ minute: string; p0Pct: number; pieces: number }>
}

// ============================================================================
// HELPERS INTERNOS
// ============================================================================

function parseMatrixErrorToMatrixCause(errorStr: string): MatrixP0Cause {
  const s = (errorStr ?? '').toLowerCase().trim()
  if ((s.includes('fuera de') || s.includes('fuera del')) &&
      (s.includes('límit') || s.includes('limit'))) return 'fuera_de_limites'
  if (s.includes('fotoc') || s.includes('no le') || s.includes('fotocelula')) return 'no_leido_fotocelula'
  if (s.includes('puerta') && s.includes('prepar')) return 'puerta_no_preparada'
  return 'otro'
}

function filterByWindow<T extends { ts: string }>(
  records: T[],
  fromMs: number,
  toMs: number,
): T[] {
  return records.filter(r => {
    const t = new Date(r.ts).getTime()
    return t >= fromMs && t <= toMs
  })
}

function computeSnapshot(
  pieceRecords: PieceRecord[],
  gate0Records: Gate0Record[],
  fromAt: string,
  toAt: string,
): ShiftSnapshot {
  const fromMs = new Date(fromAt).getTime()
  const toMs = new Date(toAt).getTime()
  const pieces = filterByWindow(pieceRecords, fromMs, toMs)
  const g0 = filterByWindow(gate0Records, fromMs, toMs)

  const totalPieces = pieces.reduce((s, r) => s + r.pieces, 0)
  const p0Pieces = g0.reduce((s, r) => s + r.pieces, 0)
  const p0Pct = totalPieces > 0 ? (p0Pieces / totalPieces) * 100 : 0

  const durationMin = (toMs - fromMs) / 60_000
  const throughputPzPerMin = durationMin > 0 ? totalPieces / durationMin : 0

  const causeMap = new Map<MatrixP0Cause, number>()
  for (const r of g0) {
    const c = parseMatrixErrorToMatrixCause(r.error)
    causeMap.set(c, (causeMap.get(c) ?? 0) + r.pieces)
  }

  let topCause: MatrixP0Cause | null = null
  let maxPieces = 0
  for (const [cause, cnt] of causeMap.entries()) {
    if (cnt > maxPieces) { maxPieces = cnt; topCause = cause }
  }

  return { totalPieces, p0Pct, topCause, throughputPzPerMin }
}

// ============================================================================
// API PÚBLICA
// ============================================================================

/**
 * Segmenta pieceRecords + gate0Records en una ventana temporal y calcula métricas.
 */
export function analyzeSegment(
  pieceRecords: PieceRecord[],
  gate0Records: Gate0Record[],
  fromAt: string,
  toAt: string,
): ShiftSegmentAnalysis {
  const fromMs = new Date(fromAt).getTime()
  const toMs = new Date(toAt).getTime()

  const pieces = filterByWindow(pieceRecords, fromMs, toMs)
  const g0 = filterByWindow(gate0Records, fromMs, toMs)

  const totalPieces = pieces.reduce((s, r) => s + r.pieces, 0)
  const p0Pieces = g0.reduce((s, r) => s + r.pieces, 0)
  const p0Pct = totalPieces > 0 ? (p0Pieces / totalPieces) * 100 : 0

  const causeMap = new Map<MatrixP0Cause, number>()
  for (const r of g0) {
    const c = parseMatrixErrorToMatrixCause(r.error)
    causeMap.set(c, (causeMap.get(c) ?? 0) + r.pieces)
  }

  const topCauses = Array.from(causeMap.entries())
    .map(([cause, cnt]) => ({
      cause,
      pieces: cnt,
      pct: p0Pieces > 0 ? (cnt / p0Pieces) * 100 : 0,
    }))
    .sort((a, b) => b.pieces - a.pieces)
    .slice(0, 3)

  return { fromAt, toAt, totalPieces, p0Pieces, p0Pct, topCauses }
}

/**
 * Construye el timeline unificado de un turno combinando uploads, acciones y
 * registros de piezas.
 */
export function buildShiftTimeline(input: {
  dateKey: string
  shiftId: string
  uploads: Array<{ at: string; by: string; fileName: string }>
  actions: Array<{ at: string; by: string; action: AppliedAction }>
  pieceRecords: PieceRecord[]
  gate0Records: Gate0Record[]
  shiftWindow: ShiftTimeWindow
}): {
  checkpoints: TimelineCheckpoint[]
  globalAnalysis: ShiftSegmentAnalysis
  segmentsPrePostActions: ShiftSegmentAnalysis[]
} {
  const { uploads, actions, pieceRecords, gate0Records, shiftWindow } = input

  const checkpoints: TimelineCheckpoint[] = []

  checkpoints.push({ kind: 'shift-start', at: shiftWindow.startAt })

  for (const u of uploads) {
    const snapshot = computeSnapshot(pieceRecords, gate0Records, shiftWindow.startAt, u.at)
    checkpoints.push({ kind: 'upload', at: u.at, by: u.by, fileName: u.fileName, snapshot })
  }

  for (const a of actions) {
    checkpoints.push({ kind: 'action', at: a.at, by: a.by, action: a.action })
  }

  if (shiftWindow.status === 'closed') {
    checkpoints.push({ kind: 'shift-end', at: shiftWindow.endAt })
  }

  checkpoints.sort((a, b) => new Date(a.at).getTime() - new Date(b.at).getTime())

  type ActionCp = Extract<TimelineCheckpoint, { kind: 'action' }>

  // Calcular outcomes para cada acción usando filter tipado
  const allActionCps = checkpoints.filter((cp): cp is ActionCp => cp.kind === 'action')

  for (const actionCp of allActionCps) {
    const idx = checkpoints.indexOf(actionCp)
    const prevAt = idx > 0 ? (checkpoints[idx - 1]?.at ?? shiftWindow.startAt) : shiftWindow.startAt
    const nextAt = idx < checkpoints.length - 1 ? (checkpoints[idx + 1]?.at ?? shiftWindow.endAt) : shiftWindow.endAt

    const preAnalysis = analyzeSegment(pieceRecords, gate0Records, prevAt, actionCp.at)
    const postAnalysis = analyzeSegment(pieceRecords, gate0Records, actionCp.at, nextAt)

    let verdict: ActionOutcome['verdict'] = 'insufficient-data'
    if (postAnalysis.totalPieces >= INTRA_SHIFT_THRESHOLDS.minPiecesPostAction) {
      const delta = postAnalysis.p0Pct - preAnalysis.p0Pct
      if (delta <= -INTRA_SHIFT_THRESHOLDS.improvementDeltaPct) verdict = 'improved'
      else if (delta >= INTRA_SHIFT_THRESHOLDS.deteriorationDeltaPct) verdict = 'worsened'
      else verdict = 'neutral'
    }

    actionCp.outcome = {
      p0BeforePct: preAnalysis.p0Pct,
      p0AfterPct: postAnalysis.p0Pct,
      piecesAfter: postAnalysis.totalPieces,
      verdict,
    }
  }

  const globalAnalysis = analyzeSegment(
    pieceRecords,
    gate0Records,
    shiftWindow.startAt,
    shiftWindow.endAt,
  )

  // Segmentos pre/post por cada acción
  const actionCps = allActionCps

  const segmentsPrePostActions: ShiftSegmentAnalysis[] = []
  for (let i = 0; i < actionCps.length; i++) {
    const action = actionCps[i] as ActionCp
    const prevAt = i === 0 ? shiftWindow.startAt : (actionCps[i - 1]?.at ?? shiftWindow.startAt)
    const nextAt = i < actionCps.length - 1 ? (actionCps[i + 1]?.at ?? shiftWindow.endAt) : shiftWindow.endAt

    segmentsPrePostActions.push(
      analyzeSegment(pieceRecords, gate0Records, prevAt, action.at),
      analyzeSegment(pieceRecords, gate0Records, action.at, nextAt),
    )
  }

  return { checkpoints, globalAnalysis, segmentsPrePostActions }
}
