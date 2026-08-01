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
    // `Z` (UTC) para que sea independiente del huso del runner: computeShiftTimeWindow
    // compara contra límites wall-clock-as-UTC, así 06:00 < 07:00 (inicio) → future.
    const now = new Date('2026-04-17T06:00:00Z')
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

  // Los dos casos de abajo fijan la ventana EXACTA del fallback, no solo que
  // esté cerrado: un turno fuera del schedule (los "Turno 1/2/3" que manda
  // Shoplogix) no se trata como cerrado, cae a la ventana del día de producción
  // 08:00→08:00 wall-clock-as-UTC, que el frontend refina después con
  // scheduledStart/End. Sin esto, un cambio que devolviera `closed` siempre —o
  // que corriera los bordes— pasaría verde. Usan sufijo `Z` por la misma razón
  // que el bloque de progressPct: sin él el resultado depende del huso del runner.
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

  it('schedule vacío usa la ventana del día de producción como fallback', () => {
    // Mismo branch que el caso de arriba, pero dentro de la ventana: con el
    // schedule vacío el turno sigue vivo entre 08:00 y 08:00 del día siguiente.
    const now = new Date('2026-04-17T12:00:00Z')
    const result = computeShiftTimeWindow('2026-04-17', 'Turno día', [], now)
    expect(result.status).toBe('live')
    expect(result.startAt).toBe('2026-04-17T08:00:00.000Z')
    expect(result.endAt).toBe('2026-04-18T08:00:00.000Z')
  })

  it('progressPct es monótonamente creciente durante el turno', () => {
    // `Z` (UTC): los tres caen dentro del turno día (07:00–19:00) en cualquier huso,
    // así el progreso es monótono (sin `Z`, fuera de UTC h18 se salía de la ventana).
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
    const h10 = new Date('2026-04-17T10:00:00')
    const h14 = new Date('2026-04-17T14:00:00')
    const r10 = computeShiftTimeWindow('2026-04-17', 'Turno día', SCHEDULE, h10)
    const r14 = computeShiftTimeWindow('2026-04-17', 'Turno día', SCHEDULE, h14)
    expect(r10.remainingMin!).toBeGreaterThan(r14.remainingMin!)
  })
})

describe('computeShiftTimeWindow — realBounds (horario real Shoplogix manda)', () => {
  // Caso real 2026-07: chonchi "Turno 2" según Shoplogix es 09:00–17:15, pero
  // el schedule de la app decía otra cosa. Con realBounds la ventana viene de
  // los scheduledStart/End sincronizados y el schedule se ignora.
  const bounds = {
    startAt: new Date('2026-07-06T09:00:00.000Z'),
    endAt:   new Date('2026-07-06T17:15:00.000Z'),
  }

  it('usa los bounds reales aunque el schedule diga otra cosa', () => {
    const now = new Date('2026-07-06T10:00:00Z')
    const r = computeShiftTimeWindow('2026-07-06', 'Turno 2', SCHEDULE, now, bounds)
    expect(r.status).toBe('live')
    expect(r.startAt).toBe('2026-07-06T09:00:00.000Z')
    expect(r.endAt).toBe('2026-07-06T17:15:00.000Z')
  })

  it('closed pasado el fin real (aunque el schedule lo tendría vivo)', () => {
    // 18:00: dentro del "Turno día" 07–19 del SCHEDULE, pero el turno real
    // (09:00–17:15) ya cerró → debe ganar la realidad.
    const now = new Date('2026-07-06T18:00:00Z')
    const r = computeShiftTimeWindow('2026-07-06', 'Turno 2', SCHEDULE, now, bounds)
    expect(r.status).toBe('closed')
  })

  it('future antes del inicio real', () => {
    const now = new Date('2026-07-06T08:00:00Z')
    const r = computeShiftTimeWindow('2026-07-06', 'Turno 2', SCHEDULE, now, bounds)
    expect(r.status).toBe('future')
  })

  it('funciona para nombres que el schedule NO conoce (ej. "Turno 1 Lunes")', () => {
    const t1l = {
      startAt: new Date('2026-07-06T00:00:00.000Z'),
      endAt:   new Date('2026-07-06T06:56:00.000Z'),
    }
    const now = new Date('2026-07-06T03:00:00Z')
    const r = computeShiftTimeWindow('2026-07-06', 'Turno 1 Lunes', SCHEDULE, now, t1l)
    expect(r.status).toBe('live')
    expect(r.progressPct).toBeGreaterThan(30)
    expect(r.progressPct).toBeLessThan(60)
  })

  it('bounds inválidos (end <= start) caen al schedule', () => {
    const bad = { startAt: new Date('2026-07-06T09:00:00Z'), endAt: new Date('2026-07-06T09:00:00Z') }
    const now = new Date('2026-07-06T12:00:00Z')
    const r = computeShiftTimeWindow('2026-07-06', 'Turno día', SCHEDULE, now, bad)
    // schedule "Turno día" 07–19 → live
    expect(r.status).toBe('live')
    expect(r.endAt).toContain('19:00')
  })

  it('null se comporta igual que omitir el parámetro', () => {
    const now = new Date('2026-07-06T12:00:00Z')
    const a = computeShiftTimeWindow('2026-07-06', 'Turno día', SCHEDULE, now, null)
    const b = computeShiftTimeWindow('2026-07-06', 'Turno día', SCHEDULE, now)
    expect(a).toEqual(b)
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
