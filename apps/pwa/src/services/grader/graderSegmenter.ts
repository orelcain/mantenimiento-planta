/**
 * Segmentador de registros Grader por día y turno.
 *
 * Toma el dump completo de PIEZA_PIEZA + PUERTA_0 (N días de datos)
 * y lo corta en segmentos {sessionDate × shiftId}, respetando
 * el turno de noche que cruza la medianoche.
 *
 * Uso típico (carga masiva histórica):
 *   1. parseFile(file) × N archivos → juntar pieceRecords + gate0Records
 *   2. segmentByDayAndShift(all, schedule) → Map de segmentos
 *   3. computeShiftSummary(segment, ...) por cada segmento → GraderDailySummary[]
 *   4. saveDailySummaryBatch(summaries) → Firestore
 */

import type { PieceRecord, Gate0Record, GraderShiftSchedule, GraderDailySummary } from './types'
import { DEFAULT_SHIFT_SCHEDULE } from './graderShiftSchedule'

// ── Helpers ──────────────────────────────────────────────────────────────────

function r(v: number, dec: number): number {
  const f = 10 ** dec
  return Math.round(v * f) / f
}

// ── Tipos internos ────────────────────────────────────────────────────────────

export interface ShiftSegment {
  sessionDate: string      // YYYY-MM-DD (fecha del turno, no del registro)
  shiftId: string
  pieceRecords: PieceRecord[]
  gate0Records: Gate0Record[]
}

type SegmentKey = string  // `${sessionDate}|${shiftId}`

// ── Asignación de turno ───────────────────────────────────────────────────────

/**
 * Dado un ISO timestamp, devuelve el turno que le corresponde y la fecha del turno.
 *
 * El turno de noche (p.ej. 23:00–07:00) cruza la medianoche:
 *   - Un registro a las 02:00 del 2025-12-15 pertenece al turno noche
 *     que EMPEZÓ el 2025-12-14 → sessionDate = '2025-12-14'.
 */
export function assignShiftAndDate(
  ts: string,
  schedule: GraderShiftSchedule[] = DEFAULT_SHIFT_SCHEDULE,
): { shiftId: string; sessionDate: string } {
  const d = new Date(ts)
  if (isNaN(d.getTime())) return { shiftId: 'Sin turno', sessionDate: ts.slice(0, 10) }

  const minutesOfDay = d.getHours() * 60 + d.getMinutes()

  for (const shift of schedule) {
    const start = shift.startHour * 60 + shift.startMinute
    const end   = shift.endHour   * 60 + shift.endMinute
    if (start === end) continue

    if (start < end) {
      // Turno normal (mismo día)
      if (minutesOfDay >= start && minutesOfDay < end) {
        return { shiftId: shift.shiftId, sessionDate: ts.slice(0, 10) }
      }
    } else {
      // Turno que cruza medianoche (ej. noche 23:00–07:00)
      if (minutesOfDay >= start) {
        // Parte vespertina (antes de medianoche) → misma fecha del registro
        return { shiftId: shift.shiftId, sessionDate: ts.slice(0, 10) }
      } else if (minutesOfDay < end) {
        // Parte madrugada (después de medianoche) → fecha del día anterior
        const prev = new Date(d)
        prev.setDate(prev.getDate() - 1)
        return { shiftId: shift.shiftId, sessionDate: prev.toISOString().slice(0, 10) }
      }
    }
  }

  return { shiftId: 'Sin turno', sessionDate: ts.slice(0, 10) }
}

// ── Segmentación ──────────────────────────────────────────────────────────────

/**
 * Agrupa todos los registros en segmentos por {sessionDate, shiftId}.
 * Los registros sin timestamp válido se descartan.
 */
export function segmentByDayAndShift(
  pieceRecords: PieceRecord[],
  gate0Records: Gate0Record[],
  schedule: GraderShiftSchedule[] = DEFAULT_SHIFT_SCHEDULE,
): Map<SegmentKey, ShiftSegment> {
  const map = new Map<SegmentKey, ShiftSegment>()

  const getOrCreate = (sessionDate: string, shiftId: string): ShiftSegment => {
    const key: SegmentKey = `${sessionDate}|${shiftId}`
    if (!map.has(key)) {
      map.set(key, { sessionDate, shiftId, pieceRecords: [], gate0Records: [] })
    }
    return map.get(key)!
  }

  for (const rec of pieceRecords) {
    if (!rec.ts) continue
    const { sessionDate, shiftId } = assignShiftAndDate(rec.ts, schedule)
    getOrCreate(sessionDate, shiftId).pieceRecords.push(rec)
  }

  for (const rec of gate0Records) {
    if (!rec.ts) continue
    const { sessionDate, shiftId } = assignShiftAndDate(rec.ts, schedule)
    getOrCreate(sessionDate, shiftId).gate0Records.push(rec)
  }

  return map
}

// ── Cómputo de resumen por turno ──────────────────────────────────────────────

/**
 * Calcula un GraderDailySummary ligero a partir de un segmento.
 * No usa computeAnalytics — es O(n) simple, válido para 230k registros totales.
 */
export function computeShiftSummary(
  segment: ShiftSegment,
  batchUploadId: string,
  sourceFileNames: string[],
  createdBy: string,
): GraderDailySummary {
  const { sessionDate, shiftId, pieceRecords, gate0Records } = segment

  // ── Timestamps ──────────────────────────────────────────────────────────────
  const allTs = [...pieceRecords.map((x) => x.ts), ...gate0Records.map((x) => x.ts)]
    .filter(Boolean)
    .sort()
  const startAt = allTs[0] ?? `${sessionDate}T00:00:00`
  const endAt   = allTs[allTs.length - 1] ?? startAt
  const durationMinutes = allTs.length > 1
    ? Math.round((new Date(endAt).getTime() - new Date(startAt).getTime()) / 60_000)
    : 0

  // ── Piezas ─────────────────────────────────────────────────────────────────
  const totalPieces = pieceRecords.reduce((s, rec) => s + rec.pieces, 0)
  const prodRecords = pieceRecords.filter((rec) => rec.gate > 0)
  const prodPieces  = prodRecords.reduce((s, rec) => s + rec.pieces, 0)

  // P0: preferir gate0Records (de PUERTA_0) si hay, sino contar gate=0 en PIEZA_PIEZA
  const pointZeroPieces = gate0Records.length > 0
    ? gate0Records.reduce((s, rec) => s + rec.pieces, 0)
    : pieceRecords.filter((rec) => rec.gate === 0).reduce((s, rec) => s + rec.pieces, 0)
  const pointZeroPct = totalPieces > 0 ? r(pointZeroPieces / totalPieces * 100, 2) : 0

  // ── Peso ───────────────────────────────────────────────────────────────────
  const rawWeightKg = prodRecords.reduce((s, rec) => s + (rec.weightKg ?? 0), 0)
  const totalWeightKg = rawWeightKg > 0 ? r(rawWeightKg, 2) : undefined
  const avgWeightGrams = (totalWeightKg && prodPieces > 0)
    ? r(totalWeightKg * 1000 / prodPieces, 0)
    : undefined

  // ── Tasa de producción ─────────────────────────────────────────────────────
  const productionRatePerHour = (durationMinutes > 0 && prodPieces > 0)
    ? r(prodPieces / (durationMinutes / 60), 0)
    : undefined

  // ── Causas P0 ──────────────────────────────────────────────────────────────
  const p0Source: Array<{ pieces: number; error?: string }> = gate0Records.length > 0
    ? gate0Records
    : pieceRecords.filter((rec) => rec.gate === 0)

  const causeMap = new Map<string, number>()
  for (const rec of p0Source) {
    const e = rec.error || 'Sin causa'
    causeMap.set(e, (causeMap.get(e) ?? 0) + rec.pieces)
  }
  const topP0Causes = Array.from(causeMap.entries())
    .sort((a, b) => b[1] - a[1])
    .slice(0, 5)
    .map(([error, pieces]) => ({
      error,
      pieces,
      pct: r(pieces / (pointZeroPieces || 1) * 100, 1),
    }))

  // ── Distribución por calibre ───────────────────────────────────────────────
  const calibreMap = new Map<string, number>()
  for (const rec of prodRecords) {
    if (rec.calibre) calibreMap.set(rec.calibre, (calibreMap.get(rec.calibre) ?? 0) + rec.pieces)
  }
  const calibreDistribution = Array.from(calibreMap.entries())
    .sort((a, b) => b[1] - a[1])
    .slice(0, 8)
    .map(([calibre, pieces]) => ({
      calibre,
      pieces,
      pct: r(pieces / (prodPieces || 1) * 100, 1),
    }))

  // ── Distribución por calidad ───────────────────────────────────────────────
  const qualityMap = new Map<string, number>()
  for (const rec of prodRecords) {
    if (rec.quality) qualityMap.set(rec.quality, (qualityMap.get(rec.quality) ?? 0) + rec.pieces)
  }
  const qualityDistribution = Array.from(qualityMap.entries())
    .sort((a, b) => b[1] - a[1])
    .map(([quality, pieces]) => ({
      quality,
      pieces,
      pct: r(pieces / (prodPieces || 1) * 100, 1),
    }))

  // ── Distribución por gate ──────────────────────────────────────────────────
  const gateMap = new Map<number, number>()
  for (const rec of prodRecords) {
    gateMap.set(rec.gate, (gateMap.get(rec.gate) ?? 0) + rec.pieces)
  }
  const gateDistribution = Array.from(gateMap.entries())
    .sort((a, b) => a[0] - b[0])
    .map(([gate, pieces]) => ({
      gate,
      pieces,
      pct: r(pieces / (prodPieces || 1) * 100, 1),
    }))

  return {
    id: `${sessionDate}__${shiftId}`,
    dateKey: sessionDate,
    shiftId,
    totalPieces,
    pointZeroPieces,
    pointZeroPct,
    startAt,
    endAt,
    durationMinutes,
    totalWeightKg,
    avgWeightGrams,
    productionRatePerHour,
    topP0Causes,
    calibreDistribution,
    qualityDistribution,
    gateDistribution,
    sourceFileNames,
    batchUploadId,
    updatedBy: createdBy,
    updatedAt: new Date().toISOString(),
  }
}

// ── Helpers de presentación ───────────────────────────────────────────────────

/** Ordena los segmentos por fecha + turno (día → tarde → noche) */
export function sortedSegmentEntries(
  map: Map<string, ShiftSegment>,
): Array<[string, ShiftSegment]> {
  const shiftOrder: Record<string, number> = {
    'Turno día': 0,
    'Turno tarde': 1,
    'Turno noche': 2,
    'Sin turno': 3,
  }
  return Array.from(map.entries()).sort(([, a], [, b]) => {
    if (a.sessionDate !== b.sessionDate) return a.sessionDate < b.sessionDate ? -1 : 1
    return (shiftOrder[a.shiftId] ?? 9) - (shiftOrder[b.shiftId] ?? 9)
  })
}
