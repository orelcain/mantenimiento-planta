import { describe, it, expect } from 'vitest'
import { computeShiftTimeWindow, detectShiftStatusFromData, nowAsWallClockUTC } from '../graderShiftStatus'
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
  it('retorna closed para shift no encontrado (fuera de la ventana de 24h)', () => {
    // shiftId desconocido → branch !entry usa la ventana del día de producción
    // (08:00→08:00, 24h). `now` dos días después cae fuera → closed. Con margen
    // amplio para no depender del huso del runner.
    const now = new Date('2026-04-19T12:00:00')
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

describe('computeShiftTimeWindow — edge cases', () => {
  it('schedule vacío retorna closed (fuera de la ventana de 24h)', () => {
    // schedule vacío → branch !entry (ventana 08:00→08:00); `now` fuera → closed.
    const now = new Date('2026-04-19T12:00:00')
    const result = computeShiftTimeWindow('2026-04-17', 'Turno día', [], now)
    expect(result.status).toBe('closed')
  })

  it('progressPct es monótonamente creciente durante el turno', () => {
    const h7 = new Date('2026-04-17T07:00:00')
    const h12 = new Date('2026-04-17T12:00:00')
    const h18 = new Date('2026-04-17T18:00:00')
    const r7  = computeShiftTimeWindow('2026-04-17', 'Turno día', SCHEDULE, h7)
    const r12 = computeShiftTimeWindow('2026-04-17', 'Turno día', SCHEDULE, h12)
    const r18 = computeShiftTimeWindow('2026-04-17', 'Turno día', SCHEDULE, h18)
    expect(r7.progressPct).toBeLessThan(r12.progressPct!)
    expect(r12.progressPct!).toBeLessThan(r18.progressPct!)
  })

  it('remainingMin disminuye a medida que avanza la hora', () => {
    const h10 = new Date('2026-04-17T10:00:00')
    const h14 = new Date('2026-04-17T14:00:00')
    const r10 = computeShiftTimeWindow('2026-04-17', 'Turno día', SCHEDULE, h10)
    const r14 = computeShiftTimeWindow('2026-04-17', 'Turno día', SCHEDULE, h14)
    expect(r10.remainingMin!).toBeGreaterThan(r14.remainingMin!)
  })
})

describe('nowAsWallClockUTC', () => {
  it('reinterpreta los componentes de hora LOCAL como si fueran UTC', () => {
    // Independiente del huso del runner: los getUTC* del resultado deben
    // coincidir con los getLocal* de la entrada.
    const real = new Date('2026-04-17T16:40:30')
    const wall = nowAsWallClockUTC(real)
    expect(wall.getUTCFullYear()).toBe(real.getFullYear())
    expect(wall.getUTCMonth()).toBe(real.getMonth())
    expect(wall.getUTCDate()).toBe(real.getDate())
    expect(wall.getUTCHours()).toBe(real.getHours())
    expect(wall.getUTCMinutes()).toBe(real.getMinutes())
    expect(wall.getUTCSeconds()).toBe(real.getSeconds())
  })

  it('hace que la detección de turno vivo sea correcta fuera de UTC (regresión Chile UTC-4)', () => {
    // 16:40 "de pizarra" cae dentro del turno día (07:00–19:00). Sin la
    // conversión, en Chile (UTC-4) ese instante se compararía contra "19:00 UTC
    // end" y el turno día caería erróneamente como `closed`.
    const wall = nowAsWallClockUTC(new Date('2026-04-17T16:40:00'))
    const tw = computeShiftTimeWindow('2026-04-17', 'Turno día', SCHEDULE, wall)
    expect(tw.status).toBe('live')
  })
})
