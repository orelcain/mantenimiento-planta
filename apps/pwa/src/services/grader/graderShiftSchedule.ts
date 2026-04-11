/**
 * Helpers para horarios de turnos (dia, tarde, noche).
 * Soporta hora + minuto (HH:MM).
 */

import type { GraderShiftSchedule } from './types'

/**
 * Horarios por defecto de turnos del Grader.
 *
 * La planta opera con 2 turnos (A y B) que cubren las ~24h sin solapamiento:
 *   - Turno día (A):   ~09:00 – 17:30 real, ventana ancha 07:00 – 19:00
 *   - Turno noche (B): ~21:00 – 06:00 real, ventana ancha 19:00 – 07:00
 *
 * La ventana ancha absorbe variaciones (±1h) en las horas reales de operación
 * sin fragmentar un turno en dos IDs distintos en Firestore. Un registro de
 * las 18:00 cae naturalmente en "día"; uno de las 19:30 cae en "noche".
 *
 * Nota: NO hay "Turno tarde". Si un Excel legacy tiene ese label se remapea a
 * "Turno noche" desde `normalizeShiftLabel`, y los documentos antiguos en
 * Firestore se pueden consolidar con `migrateTardeShiftsToNoche()`.
 */
export const DEFAULT_SHIFT_SCHEDULE: GraderShiftSchedule[] = [
  { shiftId: 'Turno día', startHour: 7, startMinute: 0, endHour: 19, endMinute: 0 },
  { shiftId: 'Turno noche', startHour: 19, startMinute: 0, endHour: 7, endMinute: 0 },
]

function clampHour(value: number): number {
  if (Number.isNaN(value)) return 0
  return Math.min(23, Math.max(0, Math.round(value)))
}

function clampMinute(value: number): number {
  if (Number.isNaN(value)) return 0
  return Math.min(59, Math.max(0, Math.round(value)))
}

/** Convierte hora+minuto a minutos totales del día (0-1439) */
function toMinutesOfDay(hour: number, minute: number): number {
  return hour * 60 + minute
}

/** Formatea hora:minuto como "HH:MM" */
export function formatShiftTime(hour: number, minute: number): string {
  return `${String(hour).padStart(2, '0')}:${String(minute).padStart(2, '0')}`
}

/** Parsea "HH:MM" → { hour, minute } */
export function parseShiftTime(value: string): { hour: number; minute: number } {
  const [h, m] = value.split(':').map(Number)
  return { hour: clampHour(h || 0), minute: clampMinute(m || 0) }
}

export function normalizeShiftSchedule(schedule?: Partial<GraderShiftSchedule>[]): GraderShiftSchedule[] {
  const map = new Map<string, GraderShiftSchedule>()
  for (const item of DEFAULT_SHIFT_SCHEDULE) {
    map.set(item.shiftId, { ...item })
  }
  for (const item of schedule || []) {
    if (!item.shiftId || !map.has(item.shiftId)) continue
    map.set(item.shiftId, {
      shiftId: item.shiftId,
      startHour: clampHour(item.startHour ?? 0),
      startMinute: clampMinute(item.startMinute ?? 0),
      endHour: clampHour(item.endHour ?? 0),
      endMinute: clampMinute(item.endMinute ?? 0),
    })
  }
  return DEFAULT_SHIFT_SCHEDULE.map((item) => map.get(item.shiftId)!).map((item) => ({ ...item }))
}

export function inferShiftIdFromSchedule(startAt: string | undefined, schedule?: GraderShiftSchedule[]): GraderShiftSchedule['shiftId'] {
  if (!startAt) return 'Turno noche'
  const d = new Date(startAt)
  const minutesOfDay = d.getHours() * 60 + d.getMinutes()
  const normalized = normalizeShiftSchedule(schedule)

  for (const item of normalized) {
    const start = toMinutesOfDay(item.startHour, item.startMinute)
    const end = toMinutesOfDay(item.endHour, item.endMinute)
    if (start === end) continue
    if (start < end) {
      if (minutesOfDay >= start && minutesOfDay < end) return item.shiftId
    } else {
      // cruza medianoche
      if (minutesOfDay >= start || minutesOfDay < end) return item.shiftId
    }
  }

  return 'Turno noche'
}

export function shiftIdToKey(shiftId?: string): string {
  if (shiftId === 'Turno día') return 'dia'
  return 'noche'
}
