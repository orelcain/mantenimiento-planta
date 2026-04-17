import { describe, it, expect } from 'vitest'
import { computeShiftTimeWindow, detectShiftStatusFromData } from '../graderShiftStatus'
import type { GraderShiftSchedule } from '../types'

const SCHEDULE: GraderShiftSchedule[] = [
  { shiftId: 'Turno día', startHour: 7, startMinute: 0, endHour: 19, endMinute: 0 },
  { shiftId: 'Turno noche', startHour: 19, startMinute: 0, endHour: 7, endMinute: 0 },
]

describe('computeShiftTimeWindow — Turno día', () => {
  it('retorna live cuando now está dentro de la ventana', () => {
    const now = new Date('2026-04-17T12:00:00')
    const result = computeShiftTimeWindow('2026-04-17', 'Turno día', SCHEDULE, now)
    expect(result.status).toBe('live')
    expect(result.progressPct).toBeGreaterThan(0)
    expect(result.progressPct).toBeLessThan(100)
    expect(result.remainingMin).toBeGreaterThan(0)
  })

  it('retorna future cuando now es antes del inicio', () => {
    const now = new Date('2026-04-17T06:00:00')
    const result = computeShiftTimeWindow('2026-04-17', 'Turno día', SCHEDULE, now)
    expect(result.status).toBe('future')
    expect(result.progressPct).toBeNull()
    expect(result.remainingMin).toBeNull()
  })

  it('retorna closed cuando now es después del cierre', () => {
    const now = new Date('2026-04-17T20:00:00')
    const result = computeShiftTimeWindow('2026-04-17', 'Turno día', SCHEDULE, now)
    expect(result.status).toBe('closed')
    expect(result.progressPct).toBeNull()
  })
})

describe('computeShiftTimeWindow — Turno noche (cruza medianoche)', () => {
  it('retorna live a las 22:00 del mismo día', () => {
    const now = new Date('2026-04-17T22:00:00')
    const result = computeShiftTimeWindow('2026-04-17', 'Turno noche', SCHEDULE, now)
    expect(result.status).toBe('live')
    // endAt debe ser en el día siguiente
    expect(result.endAt).toContain('2026-04-18')
  })

  it('retorna live a las 03:00 del día siguiente', () => {
    const now = new Date('2026-04-18T03:00:00')
    const result = computeShiftTimeWindow('2026-04-17', 'Turno noche', SCHEDULE, now)
    expect(result.status).toBe('live')
  })

  it('retorna closed a las 09:00 del día siguiente', () => {
    const now = new Date('2026-04-18T09:00:00')
    const result = computeShiftTimeWindow('2026-04-17', 'Turno noche', SCHEDULE, now)
    expect(result.status).toBe('closed')
  })
})

describe('computeShiftTimeWindow — shiftId desconocido', () => {
  it('retorna closed para shift no encontrado', () => {
    const now = new Date('2026-04-17T12:00:00')
    const result = computeShiftTimeWindow('2026-04-17', 'Turno X', SCHEDULE, now)
    expect(result.status).toBe('closed')
  })
})

describe('detectShiftStatusFromData', () => {
  it('retorna live si el último registro fue hace menos de 30 min', () => {
    const now = new Date('2026-04-17T12:00:00')
    const lastTs = new Date(now.getTime() - 10 * 60_000).toISOString()
    expect(detectShiftStatusFromData(lastTs, 'Turno día', now)).toBe('live')
  })

  it('retorna closed si el último registro fue hace más de 30 min', () => {
    const now = new Date('2026-04-17T12:00:00')
    const lastTs = new Date(now.getTime() - 60 * 60_000).toISOString()
    expect(detectShiftStatusFromData(lastTs, 'Turno día', now)).toBe('closed')
  })

  it('retorna closed para timestamp inválido', () => {
    expect(detectShiftStatusFromData('invalid', 'Turno día')).toBe('closed')
  })
})
