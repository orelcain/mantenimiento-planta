/**
 * Helpers compartidos por el Dashboard del Grader y sus hooks de análisis.
 * Extraídos de AnalisisGraderDashboardPage.tsx en la iteración de refactor 2026-04-10.
 */
import { DEFAULT_SHIFT_SCHEDULE } from './graderShiftSchedule'
import type { GraderAnalysisConfig } from './types'

export function round2(value: number): number {
  return Math.round(value * 100) / 100
}

export function formatDateToHHMM(value: Date): string {
  const hh = String(value.getHours()).padStart(2, '0')
  const mm = String(value.getMinutes()).padStart(2, '0')
  return `${hh}:${mm}`
}

/**
 * Determina la ventana horaria del turno a partir del config del análisis.
 * Retorna null si no hay fecha de referencia válida.
 */
export function buildShiftWindow(
  config: GraderAnalysisConfig,
  fallbackStartIso?: string,
): { start: Date; end: Date } | null {
  const refIso = config.startAt || fallbackStartIso
  if (!refIso) return null

  const ref = new Date(refIso)
  if (!Number.isFinite(ref.getTime())) return null

  const schedule = DEFAULT_SHIFT_SCHEDULE.find((item) => item.shiftId === (config.shiftId || 'Turno noche'))
  if (!schedule) {
    const start = new Date(ref)
    const end = new Date(start.getTime() + (8 * 60 * 60 * 1000))
    return { start, end }
  }

  const start = new Date(ref)
  start.setHours(schedule.startHour, schedule.startMinute, 0, 0)

  const end = new Date(ref)
  end.setHours(schedule.endHour, schedule.endMinute, 0, 0)

  const crossesMidnight = schedule.endHour < schedule.startHour
    || (schedule.endHour === schedule.startHour && schedule.endMinute < schedule.startMinute)

  if (end.getTime() <= start.getTime()) {
    end.setDate(end.getDate() + 1)
  }

  if (crossesMidnight && ref.getTime() < start.getTime()) {
    start.setDate(start.getDate() - 1)
    end.setDate(end.getDate() - 1)
  }

  return { start, end }
}

/**
 * Predice un valor `y` en la posición `x` usando regresión lineal simple
 * sobre los puntos dados. Retorna 0 si no hay puntos, o el último `y` si
 * hay colinealidad vertical.
 */
export function linearRegressionPredict(points: Array<{ x: number; y: number }>, x: number): number {
  if (points.length === 0) return 0
  if (points.length === 1) return points[0]?.y ?? 0

  const n = points.length
  const sumX = points.reduce((s, p) => s + p.x, 0)
  const sumY = points.reduce((s, p) => s + p.y, 0)
  const sumXY = points.reduce((s, p) => s + (p.x * p.y), 0)
  const sumXX = points.reduce((s, p) => s + (p.x * p.x), 0)

  const denominator = (n * sumXX) - (sumX * sumX)
  if (denominator === 0) return points[n - 1]?.y ?? 0

  const slope = ((n * sumXY) - (sumX * sumY)) / denominator
  const intercept = (sumY - (slope * sumX)) / n
  return intercept + (slope * x)
}
