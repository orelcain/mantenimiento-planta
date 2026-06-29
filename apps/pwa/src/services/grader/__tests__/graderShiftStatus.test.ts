import { describe, it, expect } from 'vitest'
import { computeShiftTimeWindow, detectShiftStatusFromData } from '../graderShiftStatus'
import type { GraderShiftSchedule } from '../types'

// computeShiftTimeWindow usa la convención "wall-clock-as-UTC": construye los
// límites del turno (startHour/endHour) tratando la hora de planta como si fuera
// UTC (sufijo .000Z), alineado con Shoplogix. Por eso el `now` de estas pruebas
// se construye con sufijo `Z` — si se usara hora local (sin Z) la comparación
// quedaría corrida por el offset del huso del runner y el test sería frágil.
// El caller real (CurrentShiftChip) hace la misma conversión vía Date.UTC(...).
const SCHEDULE: GraderShiftSchedule[] = [
  { shiftId: 'Turno día', startHour: 7, startMinute: 0, endHour: 19, endMinute: 0 },
  { shiftId: 'Turno noche', startHour: 19, startMinute: 0, endHour: 7, endMinute: 0 },
]

describe('computeShiftTimeWindow — Turno día', () => {
  it('retorna live cuando now está dentro de la ventana', () => {
    const now = new Date('2026-04-17T12:00:00Z')
    const result = computeShiftTimeWindow('2026-04-17', 'Turno día', SCHEDULE, now)
    expect(result.status).toBe('live')
    expect(result.progressPct).toBeGreaterThan(0)
    expect(result.progressPct).toBeLessThan(100)
    expect(result.remainingMin).toBeGreaterThan(0)
  })

  it('retorna future cuando now es antes del inicio', () => {
    const now = new Date('2026-04-17T06:00:00Z')
    const result = computeShiftTimeWindow('2026-04-17', 'Turno día', SCHEDULE, now)
    expect(result.status).toBe('future')
    expect(result.progressPct).toBeNull()
    expect(result.remainingMin).toBeNull()
  })

  it('retorna closed cuando now es después del cierre', () => {
    const now = new Date('2026-04-17T20:00:00Z')
    const result = computeShiftTimeWindow('2026-04-17', 'Turno día', SCHEDULE, now)
    expect(result.status).toBe('closed')
    expect(result.progressPct).toBeNull()
  })
})

describe('computeShiftTimeWindow — Turno noche (cruza medianoche)', () => {
  it('retorna live a las 22:00 del mismo día', () => {
    const now = new Date('2026-04-17T22:00:00Z')
    const result = computeShiftTimeWindow('2026-04-17', 'Turno noche', SCHEDULE, now)
    expect(result.status).toBe('live')
    // endAt debe ser en el día siguiente
    expect(result.endAt).toContain('2026-04-18')
  })

  it('retorna live a las 03:00 del día siguiente', () => {
    const now = new Date('2026-04-18T03:00:00Z')
    const result = computeShiftTimeWindow('2026-04-17', 'Turno noche', SCHEDULE, now)
    expect(result.status).toBe('live')
  })

  it('retorna closed a las 09:00 del día siguiente', () => {
    const now = new Date('2026-04-18T09:00:00Z')
    const result = computeShiftTimeWindow('2026-04-17', 'Turno noche', SCHEDULE, now)
    expect(result.status).toBe('closed')
  })
})

describe('computeShiftTimeWindow — shiftId desconocido', () => {
  // Un turno fuera del schedule (ej. Turno 1/2/3 de Shoplogix) NO se trata como
  // cerrado: cae al fallback de la ventana del día de producción (08:00→08:00
  // wall-clock-as-UTC), que el frontend luego refina con scheduledStart/End.
  it('usa la ventana del día de producción (08:00→08:00) como fallback', () => {
    const now = new Date('2026-04-17T12:00:00Z')
    const result = computeShiftTimeWindow('2026-04-17', 'Turno X', SCHEDULE, now)
    expect(result.status).toBe('live')
    expect(result.startAt).toBe('2026-04-17T08:00:00.000Z')
    expect(result.endAt).toBe('2026-04-18T08:00:00.000Z')
  })

  it('en el fallback respeta future antes de 08:00 y closed tras el cierre', () => {
    const antes = computeShiftTimeWindow('2026-04-17', 'Turno X', SCHEDULE, new Date('2026-04-17T06:00:00Z'))
    expect(antes.status).toBe('future')
    const despues = computeShiftTimeWindow('2026-04-17', 'Turno X', SCHEDULE, new Date('2026-04-18T09:00:00Z'))
    expect(despues.status).toBe('closed')
  })
})

describe('detectShiftStatusFromData', () => {
  it('retorna live si el último registro fue hace menos de 30 min', () => {
    const now = new Date('2026-04-17T12:00:00Z')
    const lastTs = new Date(now.getTime() - 10 * 60_000).toISOString()
    expect(detectShiftStatusFromData(lastTs, 'Turno día', now)).toBe('live')
  })

  it('retorna closed si el último registro fue hace más de 30 min', () => {
    const now = new Date('2026-04-17T12:00:00Z')
    const lastTs = new Date(now.getTime() - 60 * 60_000).toISOString()
    expect(detectShiftStatusFromData(lastTs, 'Turno día', now)).toBe('closed')
  })

  it('retorna closed para timestamp inválido', () => {
    expect(detectShiftStatusFromData('invalid', 'Turno día')).toBe('closed')
  })
})

describe('computeShiftTimeWindow — edge cases', () => {
  it('schedule vacío usa la ventana del día de producción como fallback', () => {
    const now = new Date('2026-04-17T12:00:00Z')
    const result = computeShiftTimeWindow('2026-04-17', 'Turno día', [], now)
    expect(result.status).toBe('live')
    expect(result.startAt).toBe('2026-04-17T08:00:00.000Z')
    expect(result.endAt).toBe('2026-04-18T08:00:00.000Z')
  })

  it('progressPct es monótonamente creciente durante el turno', () => {
    const h7 = new Date('2026-04-17T07:00:00Z')
    const h12 = new Date('2026-04-17T12:00:00Z')
    const h18 = new Date('2026-04-17T18:00:00Z')
    const r7  = computeShiftTimeWindow('2026-04-17', 'Turno día', SCHEDULE, h7)
    const r12 = computeShiftTimeWindow('2026-04-17', 'Turno día', SCHEDULE, h12)
    const r18 = computeShiftTimeWindow('2026-04-17', 'Turno día', SCHEDULE, h18)
    expect(r7.progressPct).toBeLessThan(r12.progressPct!)
    expect(r12.progressPct!).toBeLessThan(r18.progressPct!)
  })

  it('remainingMin disminuye a medida que avanza la hora', () => {
    const h10 = new Date('2026-04-17T10:00:00Z')
    const h14 = new Date('2026-04-17T14:00:00Z')
    const r10 = computeShiftTimeWindow('2026-04-17', 'Turno día', SCHEDULE, h10)
    const r14 = computeShiftTimeWindow('2026-04-17', 'Turno día', SCHEDULE, h14)
    expect(r10.remainingMin!).toBeGreaterThan(r14.remainingMin!)
  })
})
