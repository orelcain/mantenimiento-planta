/**
 * Bloque «Grader» del día en Análisis de turno (estructura fija, mockup `analisis.html`).
 * Shoplogix es la base; el grader es un extra que SIEMPRE ocupa su lugar: con datos
 * muestra Puerta 0 por turno, sin datos deja el hueco «Sin datos del grader este día».
 *
 * Horas: hora de planta marcada como UTC (`getUTC*`), igual que el resto del grader.
 */
import type { GraderDailySummary } from './types'
import { hhmm } from './graderCobertura'

export interface TurnoGraderDelDia {
  shiftId: string
  piezas: number
  p0Pct: number
  /** «07:15–14:58», o null si el resumen no trae horas. */
  ventana: string | null
}

export interface GraderDelDia {
  turnos: TurnoGraderDelDia[]
  piezas: number
  /** Puerta 0 ponderada por piezas; null sin piezas. */
  p0Pct: number | null
}

function ventana(s: Pick<GraderDailySummary, 'startAt' | 'endAt'>): string | null {
  const a = s.startAt ? Date.parse(s.startAt) : NaN
  const b = s.endAt ? Date.parse(s.endAt) : NaN
  if (!Number.isFinite(a) || !Number.isFinite(b)) return null
  return `${hhmm(a)}–${hhmm(b)}`
}

/** Resúmenes con piezas del día `dateKey`, en orden de inicio. null = no hay grader ese día. */
export function graderDelDia(summaries: GraderDailySummary[], dateKey: string): GraderDelDia | null {
  const delDia = summaries
    .filter((s) => s.dateKey === dateKey && (s.totalPieces ?? 0) > 0)
    .sort((x, y) => (x.startAt ?? x.shiftId).localeCompare(y.startAt ?? y.shiftId))
  if (delDia.length === 0) return null
  const piezas = delDia.reduce((n, s) => n + s.totalPieces, 0)
  const p0 = delDia.reduce((n, s) => n + (s.pointZeroPieces ?? 0), 0)
  return {
    turnos: delDia.map((s) => ({ shiftId: s.shiftId, piezas: s.totalPieces, p0Pct: s.pointZeroPct, ventana: ventana(s) })),
    piezas,
    p0Pct: piezas > 0 ? (p0 / piezas) * 100 : null,
  }
}
