/**
 * Reclasificador histórico de turnos (FASE 26).
 *
 * Para turnos guardados antes de FASE 21 (sin las 9 causas Matrix), infiere la
 * config de gates por ventanas temporales a partir de los pieceRecords almacenados
 * y re-clasifica los registros Gate 0 con la lógica nueva.
 *
 * Limitación: FirestorePieceRecord almacenado antes de FASE 25 no tiene conservation/product.
 * El reclasificador solo mejora la descomposición calibre/calidad para esos registros.
 * Nuevos turnos (post-FASE 25) tendrán los 4 niveles completos.
 */

import { listPieceRecords, updateDailySummary } from './graderDailySummary.service'
import { listSnapshots, saveConfigSnapshot } from './graderConfigSnapshot.service'
import { classifyRecordToMatrix, CALIBRE_WEIGHT_RANGES } from './graderAnalytics'
import type { GateAssignment, GraderQuality, CalibreRange } from './types'
import type { GraderDailySummary } from './types'

export interface ReclassifyOptions {
  windowMinutes?: number       // tamaño ventana para inferencia (default 30)
  dominanceThreshold?: number  // umbral de dominancia para config confiable (default 0.75)
  minPiecesPerWindow?: number  // mín piezas por ventana para inferir (default 10)
  writeSyntheticSnapshots?: boolean
}

export interface ReclassifyResult {
  shiftDocId: string
  topP0CausesBefore: Array<{ error: string; pieces: number; pct: number }>
  topP0CausesAfter: Array<{ error: string; pieces: number; pct: number }>
  inferredSnapshotsCount: number
  confidence: 'high' | 'medium' | 'low'
  error?: string
}

/** Infiere config de gates por ventanas temporales a partir de pieceRecords productivos (gate 1-12) */
export function inferGatesHistory(
  pieceRecords: Array<{ ts: string; gate: number; pieces: number; quality?: string; calibre?: string }>,
  options: Required<Pick<ReclassifyOptions, 'windowMinutes' | 'dominanceThreshold' | 'minPiecesPerWindow'>>,
): Array<{ startTs: string; endTs: string; gates: GateAssignment[]; confidence: 'high' | 'medium' | 'low' }> {
  // Solo productivos (gates 1-12) para inferir la config
  const productive = pieceRecords.filter(r => r.gate >= 1 && r.gate <= 12)
  if (productive.length === 0) return []

  const sorted = [...productive].sort((a, b) => a.ts.localeCompare(b.ts))
  const windowMs = options.windowMinutes * 60_000

  // Dividir en ventanas temporales
  const windows: typeof sorted[] = []
  let current: typeof sorted = [sorted[0]!]
  let windowStart = new Date(sorted[0]!.ts).getTime()
  for (let i = 1; i < sorted.length; i++) {
    const t = new Date(sorted[i]!.ts).getTime()
    if (t - windowStart > windowMs) {
      windows.push(current)
      current = []
      windowStart = t
    }
    current.push(sorted[i]!)
  }
  if (current.length > 0) windows.push(current)

  const result: Array<{ startTs: string; endTs: string; gates: GateAssignment[]; confidence: 'high' | 'medium' | 'low' }> = []

  for (const w of windows) {
    if (w.length < options.minPiecesPerWindow) continue
    const gates: GateAssignment[] = []
    let windowConfidence: 'high' | 'medium' | 'low' = 'high'

    for (let gateNum = 1; gateNum <= 12; gateNum++) {
      const forGate = w.filter(p => p.gate === gateNum)
      if (forGate.length < Math.min(options.minPiecesPerWindow, 3)) continue

      const combos = new Map<string, number>()
      for (const p of forGate) {
        const key = `${p.calibre ?? 'Other'}|${p.quality ?? 'Unknown'}`
        combos.set(key, (combos.get(key) ?? 0) + 1)
      }
      const entries = [...combos.entries()].sort((a, b) => b[1] - a[1])
      const top = entries[0]
      if (!top) continue

      const dominance = top[1] / forGate.length
      const [calibre, quality] = top[0].split('|')
      gates.push({
        gateNumber: gateNum,
        assignedCalibre: (calibre ?? 'Other') as CalibreRange,
        assignedQuality: (quality ?? 'Unknown') as GraderQuality,
        active: true,
      })
      if (dominance < options.dominanceThreshold) windowConfidence = 'low'
      else if (dominance < 0.9 && windowConfidence !== 'low') windowConfidence = 'medium'
    }

    if (gates.length === 0) continue
    result.push({
      startTs: w[0]!.ts,
      endTs: w[w.length - 1]!.ts,
      gates,
      confidence: windowConfidence,
    })
  }

  return mergeContiguousWindows(result)
}

function mergeContiguousWindows(
  windows: Array<{ startTs: string; endTs: string; gates: GateAssignment[]; confidence: 'high' | 'medium' | 'low' }>,
): typeof windows {
  if (windows.length <= 1) return windows
  const merged = [windows[0]!]
  for (let i = 1; i < windows.length; i++) {
    const prev = merged[merged.length - 1]!
    const curr = windows[i]!
    if (gatesConfigEqual(prev.gates, curr.gates)) {
      prev.endTs = curr.endTs
      if (curr.confidence === 'low') prev.confidence = 'low'
      else if (curr.confidence === 'medium' && prev.confidence !== 'low') prev.confidence = 'medium'
    } else {
      merged.push(curr)
    }
  }
  return merged
}

function gatesConfigEqual(a: GateAssignment[], b: GateAssignment[]): boolean {
  if (a.length !== b.length) return false
  const byNum = new Map(a.map(g => [g.gateNumber, g]))
  for (const g of b) {
    const other = byNum.get(g.gateNumber)
    if (!other) return false
    if (
      other.assignedCalibre !== g.assignedCalibre ||
      other.assignedQuality !== g.assignedQuality
    ) return false
  }
  return true
}

/**
 * Reclasifica un turno completo: infiere config de gates desde pieceRecords
 * y recalcula `topP0Causes` con la lógica de 9 causas Matrix.
 */
export async function reclassifyShift(
  summaryId: string,
  options: ReclassifyOptions = {},
): Promise<ReclassifyResult> {
  const opts: Required<ReclassifyOptions> = {
    windowMinutes: options.windowMinutes ?? 30,
    dominanceThreshold: options.dominanceThreshold ?? 0.75,
    minPiecesPerWindow: options.minPiecesPerWindow ?? 10,
    writeSyntheticSnapshots: options.writeSyntheticSnapshots ?? false,
  }

  // 1) Cargar pieceRecords del turno
  const allRecords = await listPieceRecords(summaryId)
  if (allRecords.length === 0) {
    return {
      shiftDocId: summaryId,
      topP0CausesBefore: [],
      topP0CausesAfter: [],
      inferredSnapshotsCount: 0,
      confidence: 'low',
      error: 'No hay pieceRecords almacenados para este turno',
    }
  }

  // 2) Separar productivos (gates 1-12) y gate0
  const g0Records = allRecords.filter(r => r.gate === 0)

  // 3) Preferir snapshots reales (FASE 27) si existen
  let snapshots = await listSnapshots(summaryId)
  let inferredCount = 0

  if (snapshots.length === 0) {
    const inferred = inferGatesHistory(allRecords, opts)
    if (opts.writeSyntheticSnapshots && inferred.length > 0) {
      for (const w of inferred) {
        await saveConfigSnapshot(
          summaryId,
          w.gates,
          { uid: 'system', name: 'Reclasificador FASE 26' },
          `Inferido FASE 26 (confidence=${w.confidence})`,
        )
        inferredCount++
      }
      snapshots = await listSnapshots(summaryId)
    } else {
      // Solo en memoria — no persiste a Firestore
      snapshots = inferred.map((w, i) => ({
        id: `inferred-${i}`,
        shiftDocId: summaryId,
        at: w.startTs,
        changedBy: { uid: 'system', name: 'Reclasificador FASE 26' },
        gates: w.gates,
        changes: [],
        synthetic: true,
      }))
      inferredCount = inferred.length
    }
  }

  // 4) Resolver gates por timestamp
  const getGatesAtTs = (ts: string): GateAssignment[] => {
    const eligible = snapshots.filter(s => s.at <= ts)
    const last = eligible[eligible.length - 1]
    return last?.gates ?? []
  }

  // 5) Reclasificar cada gate0Record
  const causeCount = new Map<string, number>()
  let totalG0Pieces = 0
  for (const r of g0Records) {
    const gatesAtTs = getGatesAtTs(r.ts).filter(g => g.active)
    const cause = classifyRecordToMatrix(
      { ...r, error: r.error ?? 'Fuera de límites', gate: 0 as const },
      gatesAtTs,
      CALIBRE_WEIGHT_RANGES,
    )
    causeCount.set(cause, (causeCount.get(cause) ?? 0) + r.pieces)
    totalG0Pieces += r.pieces
  }

  // 6) Construir topP0Causes nuevo (formato igual al existente en GraderDailySummary)
  const topP0CausesAfter = [...causeCount.entries()]
    .sort((a, b) => b[1] - a[1])
    .map(([error, pieces]) => ({
      error,
      pieces,
      pct: totalG0Pieces > 0 ? +((pieces / totalG0Pieces) * 100).toFixed(2) : 0,
    }))

  // 7) Guardar en Firestore (patch parcial)
  await updateDailySummary(summaryId, {
    topP0Causes: topP0CausesAfter,
    reclassifiedAt: new Date().toISOString(),
  } as Partial<GraderDailySummary> & Record<string, unknown>)

  const confidence = snapshots.length > 0 && snapshots.some(s => !s.synthetic)
    ? 'high'
    : inferredCount > 0
      ? 'medium'
      : 'low'

  return {
    shiftDocId: summaryId,
    topP0CausesBefore: [],  // no pre-cargamos para ahorrar reads
    topP0CausesAfter,
    inferredSnapshotsCount: inferredCount,
    confidence,
  }
}
