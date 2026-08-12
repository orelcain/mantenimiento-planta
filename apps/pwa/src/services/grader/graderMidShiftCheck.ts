/**
 * graderMidShiftCheck.ts — el corte de control a mitad de turno.
 *
 * Es la misma pregunta de `graderCalibreHistory` (¿las gates aguantan el
 * reparto de calibres?) con OTRA fuente: en vez de los turnos anteriores, lo
 * que va corriendo de ÉSTE. Por eso reusa `compareGatesVsHistory` y
 * `suggestGateMoves` en vez de reimplementar los ratios: los umbrales de
 * saturado/sobredimensionado tienen que ser los mismos en las tres vistas
 * (post-turno, pre-turno y mitad de turno) o el mismo caso se clasifica
 * distinto según dónde lo mires.
 *
 * ── Qué hace falta para que esto exista ─────────────────────────────────────
 *
 * Un Excel PARCIAL: Matrix exporta cuando se le pida, y la app ya entiende un
 * archivo que cubre solo un tramo (`GraderCoverageBar` distingue "sin datos del
 * Grader" de "línea parada"). Sin esa exportación no hay corte de control
 * posible — la Grader no tiene feed automático.
 *
 * ── La proyección es una regla de tres, y se dice ───────────────────────────
 *
 * "Quedan ≈N piezas de 8-10 lb por pasar" = ritmo medido × horas que faltan ×
 * la parte que ese calibre se llevó hasta ahora. NO se afirma cuántas piezas
 * "se clasificarían mejor": eso depende de a dónde caen las que desbordan, que
 * el Excel no dice. Prometer una mejora medida que no se puede medir es la
 * forma más rápida de que nadie vuelva a creerle a la tarjeta.
 */

import {
  compareGatesVsHistory,
  suggestGateMoves,
  calibreKey,
  type CalibreHistory,
  type CalibreFit,
  type GateMove,
} from './graderCalibreHistory'
import type { GateAssignment, GraderDailySummary } from './types'

/** Ritmo mínimo para proyectar. Debajo de esto la regla de tres es ruido. */
const MIN_RATE_PER_HOUR = 1

/**
 * El reparto de calibres de ESTE turno con la forma de `CalibreHistory`, para
 * poder pasarlo por la misma maquinaria que el histórico.
 *
 * No usa `aggregateCalibreHistory` porque aquél exige un mínimo de turnos —
 * correcto para un promedio histórico, sin sentido para el turno en curso.
 */
export function distributionFromShift(summary: GraderDailySummary): CalibreHistory | null {
  const rows = summary.calibreDistribution ?? []
  if (rows.length === 0) return null

  const pieces = new Map<string, number>()
  const labels = new Map<string, string>()
  let totalPieces = 0
  for (const c of rows) {
    const key = calibreKey(c.calibre)
    if (!key) continue
    pieces.set(key, (pieces.get(key) ?? 0) + c.pieces)
    if (!labels.has(key)) labels.set(key, c.calibre)
    totalPieces += c.pieces
  }
  if (totalPieces === 0) return null

  return {
    shiftIds: [summary.id ?? `${summary.dateKey}__${summary.shiftId}`],
    fromDateKey: summary.dateKey,
    toDateKey: summary.dateKey,
    totalPieces,
    rows: [...pieces.entries()]
      .map(([key, p]) => ({ key, label: labels.get(key) ?? key, pieces: p, pct: (p / totalPieces) * 100 }))
      .sort((a, b) => b.pieces - a.pieces),
  }
}

export interface MidShiftCheck {
  /** Reparto y ratios de lo que va del turno. */
  soFar: CalibreHistory
  fits: CalibreFit[]
  saturated: CalibreFit[]
  moves: GateMove[]
  /** Minutos que le quedan al turno. */
  remainingMin: number
  /** Piezas que se estiman para lo que queda, al ritmo medido. null si no se puede. */
  estRemainingPieces: number | null
  /**
   * De esas, las que según el reparto actual serían de un calibre apretado.
   * null cuando no hay proyección o no hay nada apretado.
   */
  estPiecesOnSaturated: number | null
}

/**
 * Corte de control. Devuelve null cuando no hay nada honesto que decir: sin
 * Excel, sin gates, o con el turno ya cerrado (ahí manda el análisis post-turno,
 * que trabaja sobre el turno completo y no sobre un tramo).
 */
export function buildMidShiftCheck(args: {
  summary: GraderDailySummary | null
  gates: GateAssignment[]
  remainingMin: number | null
  /** Piezas/hora medidas en el tramo que cubre el Excel. */
  ratePerHour?: number | null
}): MidShiftCheck | null {
  const { summary, gates, remainingMin, ratePerHour } = args
  if (!summary || remainingMin == null || remainingMin <= 0) return null

  const activeGates = gates.filter((g) => g.active)
  if (activeGates.length === 0) return null

  const soFar = distributionFromShift(summary)
  if (!soFar) return null

  const fits = compareGatesVsHistory(gates, soFar)
  const saturated = fits.filter((f) => f.status === 'saturado')
  const moves = suggestGateMoves(fits, activeGates.length)

  const rate = ratePerHour ?? summary.productionRatePerHour ?? null
  const estRemainingPieces =
    rate != null && rate >= MIN_RATE_PER_HOUR ? Math.round((rate * remainingMin) / 60) : null

  const saturatedPct = saturated.reduce((sum, f) => sum + f.productionPct, 0)
  const estPiecesOnSaturated =
    estRemainingPieces != null && saturatedPct > 0
      ? Math.round((estRemainingPieces * saturatedPct) / 100)
      : null

  return { soFar, fits, saturated, moves, remainingMin, estRemainingPieces, estPiecesOnSaturated }
}

/**
 * Hasta qué hora cubre el Excel y cuánto hace que no se actualiza.
 *
 * `endAt` del resumen es la última pieza que trae el archivo. Comparado con el
 * "ahora" de planta da el hueco: si son 3 horas, lo que dice la tarjeta describe
 * un turno de hace 3 horas y hay que exportar de nuevo antes de decidir nada.
 */
export function excelGapMinutes(summary: GraderDailySummary | null, nowWallClock: Date): number | null {
  if (!summary?.endAt) return null
  const end = new Date(summary.endAt).getTime()
  if (Number.isNaN(end)) return null
  const gap = (nowWallClock.getTime() - end) / 60_000
  return gap > 0 ? Math.round(gap) : 0
}
