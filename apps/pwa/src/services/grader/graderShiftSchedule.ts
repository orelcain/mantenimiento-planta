/**
 * Helpers para horarios de turnos (dia, tarde, noche).
 */

import type { GraderShiftSchedule } from './types'

export const DEFAULT_SHIFT_SCHEDULE: GraderShiftSchedule[] = [
  { shiftId: 'Turno día', startHour: 7, endHour: 15 },
  { shiftId: 'Turno tarde', startHour: 15, endHour: 23 },
  { shiftId: 'Turno noche', startHour: 23, endHour: 7 },
]

function clampHour(value: number): number {
  if (Number.isNaN(value)) return 0
  return Math.min(23, Math.max(0, Math.round(value)))
}

export function normalizeShiftSchedule(schedule?: GraderShiftSchedule[]): GraderShiftSchedule[] {
  const map = new Map<string, GraderShiftSchedule>()
  for (const item of DEFAULT_SHIFT_SCHEDULE) {
    map.set(item.shiftId, { ...item })
  }
  for (const item of schedule || []) {
    if (!map.has(item.shiftId)) continue
    map.set(item.shiftId, {
      shiftId: item.shiftId,
      startHour: clampHour(item.startHour),
      endHour: clampHour(item.endHour),
    })
  }
  return DEFAULT_SHIFT_SCHEDULE.map((item) => map.get(item.shiftId)!).map((item) => ({ ...item }))
}

export function inferShiftIdFromSchedule(startAt: string | undefined, schedule?: GraderShiftSchedule[]): GraderShiftSchedule['shiftId'] {
  if (!startAt) return 'Turno noche'
  const hour = new Date(startAt).getHours()
  const normalized = normalizeShiftSchedule(schedule)

  for (const item of normalized) {
    if (item.startHour === item.endHour) continue
    if (item.startHour < item.endHour) {
      if (hour >= item.startHour && hour < item.endHour) return item.shiftId
    } else {
      if (hour >= item.startHour || hour < item.endHour) return item.shiftId
    }
  }

  return 'Turno noche'
}

export function shiftIdToKey(shiftId?: string): string {
  if (shiftId === 'Turno día') return 'dia'
  if (shiftId === 'Turno tarde') return 'tarde'
  return 'noche'
}
