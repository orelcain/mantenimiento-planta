/**
 * Detección de estado de turno: live / closed / future.
 */

import type { GraderShiftSchedule } from './types'
import { DEFAULT_SHIFT_SCHEDULE } from './graderShiftSchedule'

export type ShiftStatus = 'live' | 'closed' | 'future'

export interface ShiftTimeWindow {
  status: ShiftStatus
  /** ISO timestamp de inicio del turno */
  startAt: string
  /** ISO timestamp de cierre esperado del turno */
  endAt: string
  /** Progreso del turno en porcentaje (0-100), null si cerrado o futuro */
  progressPct: number | null
  /** Minutos transcurridos desde inicio */
  elapsedMin: number
  /** Minutos restantes al cierre (null si ya cerró o es futuro) */
  remainingMin: number | null
}

function padTwo(n: number): string {
  return String(n).padStart(2, '0')
}

function dateKeyPlusDays(dateKey: string, days: number): string {
  const d = new Date(`${dateKey}T12:00:00Z`)
  d.setUTCDate(d.getUTCDate() + days)
  return d.toISOString().slice(0, 10)
}

/**
 * Convierte un instante "real" (hora local del navegador) al marco
 * wall-clock-as-UTC que usa este módulo: toma los componentes de hora LOCAL
 * (año/mes/día/hora/min/seg) y los reinterpreta como si fueran UTC.
 *
 * Necesario porque `computeShiftTimeWindow` construye los límites del turno con
 * la convención wall-clock-as-UTC (sufijo `.000Z` sobre la hora de pizarra,
 * misma convención que Shoplogix). Si se compara contra un `now` en UTC real,
 * fuera de UTC el turno vivo queda mal clasificado por el offset del huso: p. ej.
 * 16:40 local en Chile (UTC-4) se compararían contra "19:00 UTC end" y el turno
 * día caería erróneamente como `closed`. Pasar siempre el `now` por aquí evita
 * ese sesgo. (No usar para `detectShiftStatusFromData`, que compara contra un
 * timestamp ISO real de Firestore y por tanto trabaja en UTC real.)
 */
export function nowAsWallClockUTC(now: Date = new Date()): Date {
  return new Date(Date.UTC(
    now.getFullYear(), now.getMonth(), now.getDate(),
    now.getHours(), now.getMinutes(), now.getSeconds(),
  ))
}

/**
 * Bounds REALES de un turno según Shoplogix (scheduledStart/End del doc
 * sincronizado, en el marco wall-clock-as-UTC). Cuando están disponibles,
 * MANDAN sobre cualquier schedule configurado/hardcodeado: los horarios de
 * turno los define Shoplogix y varían (decisión PR #157).
 */
export interface RealShiftBounds {
  startAt: Date
  endAt: Date
}

function windowFromBounds(startDate: Date, endDate: Date, now: Date): ShiftTimeWindow {
  const durationMin = (endDate.getTime() - startDate.getTime()) / 60_000
  const elapsedMs = now.getTime() - startDate.getTime()
  const elapsedMin = Math.max(0, elapsedMs / 60_000)

  let status: ShiftStatus
  if (now.getTime() < startDate.getTime()) status = 'future'
  else if (now.getTime() > endDate.getTime()) status = 'closed'
  else status = 'live'

  return {
    status,
    startAt: startDate.toISOString(),
    endAt: endDate.toISOString(),
    progressPct: status === 'live' && durationMin > 0
      ? Math.min(100, Math.max(0, (elapsedMin / durationMin) * 100))
      : null,
    elapsedMin,
    remainingMin: status === 'live' ? Math.max(0, durationMin - elapsedMin) : null,
  }
}

/**
 * Detecta estado del turno a partir de la fecha y el horario configurado.
 *
 * Reglas:
 *   - now < startAt → 'future'
 *   - startAt <= now <= endAt → 'live'
 *   - now > endAt → 'closed'
 *
 * Para turnos de noche que cruzan medianoche (endHour < startHour),
 * endAt se ubica en dateKey+1.
 *
 * @param realBounds — scheduledStart/End reales del doc Shoplogix. Si vienen
 *   válidos, la ventana se construye desde ellos y el `schedule` se ignora
 *   (la verdad de horarios es Shoplogix, no la config de la app).
 */
export function computeShiftTimeWindow(
  dateKey: string,
  shiftId: string,
  schedule: GraderShiftSchedule[] = DEFAULT_SHIFT_SCHEDULE,
  now: Date = nowAsWallClockUTC(),
  realBounds?: RealShiftBounds | null,
): ShiftTimeWindow {
  if (
    realBounds &&
    !isNaN(realBounds.startAt.getTime()) &&
    !isNaN(realBounds.endAt.getTime()) &&
    realBounds.endAt.getTime() > realBounds.startAt.getTime()
  ) {
    return windowFromBounds(realBounds.startAt, realBounds.endAt, now)
  }

  const entry = schedule.find(s => s.shiftId === shiftId)

  if (!entry) {
    // Turno no reconocido en el schedule (ej. Turno 1/2/3 de Shoplogix).
    // Usamos la ventana del día de producción (08:00→08:00) como bounds.
    // El frontend refina con scheduledStart/End de Shoplogix cuando llegan.
    const prodStart = new Date(`${dateKey}T08:00:00.000Z`)
    const nextDayKey = dateKeyPlusDays(dateKey, 1)
    const prodEnd   = new Date(`${nextDayKey}T08:00:00.000Z`)
    const durationMin = 24 * 60
    const elapsedMs = now.getTime() - prodStart.getTime()
    const elapsedMin = Math.max(0, elapsedMs / 60_000)
    let status: ShiftStatus
    if (now.getTime() < prodStart.getTime()) status = 'future'
    else if (now.getTime() > prodEnd.getTime()) status = 'closed'
    else status = 'live'
    return {
      status,
      startAt: prodStart.toISOString(),
      endAt:   prodEnd.toISOString(),
      progressPct: status === 'live' ? Math.min(100, Math.max(0, (elapsedMin / durationMin) * 100)) : null,
      elapsedMin,
      remainingMin: status === 'live' ? Math.max(0, durationMin - elapsedMin) : null,
    }
  }

  const startTimeStr = `${padTwo(entry.startHour)}:${padTwo(entry.startMinute)}:00`
  const endTimeStr = `${padTwo(entry.endHour)}:${padTwo(entry.endMinute)}:00`

  // Determinar si el turno cruza medianoche
  const crossesMidnight =
    entry.endHour < entry.startHour ||
    (entry.endHour === entry.startHour && entry.endMinute < entry.startMinute)

  const endDateKey = crossesMidnight ? dateKeyPlusDays(dateKey, 1) : dateKey

  // Wall-clock-as-UTC: misma convención que Shoplogix (hora local tratada como si fuera UTC)
  const startDate = new Date(`${dateKey}T${startTimeStr}.000Z`)
  const endDate = new Date(`${endDateKey}T${endTimeStr}.000Z`)

  const startAt = startDate.toISOString()
  const endAt = endDate.toISOString()

  const durationMin = (endDate.getTime() - startDate.getTime()) / 60_000
  const elapsedMs = now.getTime() - startDate.getTime()
  const elapsedMin = Math.max(0, elapsedMs / 60_000)

  let status: ShiftStatus
  if (now.getTime() < startDate.getTime()) {
    status = 'future'
  } else if (now.getTime() > endDate.getTime()) {
    status = 'closed'
  } else {
    status = 'live'
  }

  const progressPct = status === 'live'
    ? Math.min(100, Math.max(0, (elapsedMin / durationMin) * 100))
    : null

  const remainingMin = status === 'live'
    ? Math.max(0, durationMin - elapsedMin)
    : null

  return { status, startAt, endAt, progressPct, elapsedMin, remainingMin }
}

/**
 * Detecta si un turno sigue vivo a partir del último timestamp de pieza.
 * Heurística: si el último registro fue hace < 30 min → probablemente vivo.
 */
export function detectShiftStatusFromData(
  lastPieceRecordTs: string,
  _shiftId: string,
  now: Date = new Date(),
): ShiftStatus {
  const lastTs = new Date(lastPieceRecordTs)
  if (isNaN(lastTs.getTime())) return 'closed'
  const elapsedMinutes = (now.getTime() - lastTs.getTime()) / 60_000
  return elapsedMinutes < 30 ? 'live' : 'closed'
}
