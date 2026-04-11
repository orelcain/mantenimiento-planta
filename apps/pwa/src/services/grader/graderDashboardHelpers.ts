/**
 * Helpers compartidos por el Dashboard del Grader y sus hooks de análisis.
 * Extraídos de AnalisisGraderDashboardPage.tsx en las iteraciones de refactor 2026-04-10
 * (iter 2) y ampliados con helpers de patterns/calibres en iter 5.
 */
import { CALIBRE_WEIGHT_RANGES } from './graderAnalytics'
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

/** Porcentaje con 2 decimales. */
export function pctCalc(part: number, total: number): number {
  return total === 0 ? 0 : Math.round((part / total) * 10000) / 100
}

/** Devuelve el calibre al que pertenece un peso según los rangos oficiales. */
export function getCalibreByWeightGrams(weightGrams?: number | null): string {
  if (weightGrams == null || !Number.isFinite(weightGrams) || weightGrams <= 0) return 'N/D'
  const match = CALIBRE_WEIGHT_RANGES.find((rng) => weightGrams >= rng.minGrams && weightGrams < rng.maxGrams)
  if (match) return match.calibre
  const lastRange = CALIBRE_WEIGHT_RANGES[CALIBRE_WEIGHT_RANGES.length - 1]
  if (lastRange && weightGrams >= lastRange.maxGrams) return 'Sobre rango'
  return 'Fuera de rango'
}

/**
 * Devuelve el label de calibre crudo si está definido, o lo infiere desde
 * el peso si el valor crudo está vacío o es un guion.
 */
export function resolveCalibreLabel(rawCalibre?: string | null, weightGrams?: number | null): string {
  const normalizedCalibre = (rawCalibre ?? '').trim()
  if (normalizedCalibre && normalizedCalibre !== '-' && normalizedCalibre !== '—') {
    return normalizedCalibre
  }
  return getCalibreByWeightGrams(weightGrams)
}

/** Convierte un string HH:MM en minutos desde medianoche, o null si es inválido. */
export function parseTimeHHMMToMinutes(value?: string): number | null {
  if (!value) return null
  const m = value.match(/^(\d{2}):(\d{2})$/)
  if (!m) return null
  const hh = Number(m[1])
  const mm = Number(m[2])
  if (!Number.isFinite(hh) || !Number.isFinite(mm) || hh < 0 || hh > 23 || mm < 0 || mm > 59) return null
  return (hh * 60) + mm
}

/**
 * Determina si un minuto del día cae dentro de un rango [from, to] expresado
 * en minutos desde medianoche. Soporta rangos que cruzan medianoche.
 */
export function isMinuteWithinRange(minuteOfDay: number, fromMinute: number | null, toMinute: number | null): boolean {
  if (fromMinute == null && toMinute == null) return true
  if (fromMinute != null && toMinute != null) {
    if (fromMinute <= toMinute) {
      return minuteOfDay >= fromMinute && minuteOfDay <= toMinute
    }
    return minuteOfDay >= fromMinute || minuteOfDay <= toMinute
  }
  if (fromMinute != null) return minuteOfDay >= fromMinute
  return minuteOfDay <= (toMinute as number)
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
