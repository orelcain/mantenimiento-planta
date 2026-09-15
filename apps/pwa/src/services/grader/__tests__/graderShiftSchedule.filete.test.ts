/**
 * Horarios de Filete: la base se había copiado de Chonchi y ningún nombre
 * coincidía con los que emite Filete («Turno Dia», «Turno Noche», «Turno Noche L»).
 * El chip de turno le aplicaba el horario de Chonchi y la config de Firestore se
 * descartaba entera, porque `normalizeShiftSchedule` comparaba literal.
 */
import { describe, it, expect } from 'vitest'
import { normalizeShiftSchedule, inferShiftIdFromSchedule } from '../graderShiftSchedule'
import { getPlantLineConfig } from '@/config/plantLines'

const BASE_FILETE = getPlantLineConfig('chonchi-filete').defaultShiftSchedule!

describe('la base de horarios de Filete', () => {
  it('trae los tres turnos que emite Filete, con sus nombres reales', () => {
    expect(BASE_FILETE.map((t) => t.shiftId)).toEqual(['Turno Dia', 'Turno Noche', 'Turno Noche L'])
  })

  it('el Turno Noche va 21:30–05:15, como lo manda Shoplogix', () => {
    const n = BASE_FILETE.find((t) => t.shiftId === 'Turno Noche')!
    expect([n.startHour, n.startMinute, n.endHour, n.endMinute]).toEqual([21, 30, 5, 15])
  })

  it('a las 19:49 Filete NO está en turno noche (arranca 21:30)', () => {
    // wall-clock-as-UTC
    expect(inferShiftIdFromSchedule('2026-09-12T19:49:00.000Z', BASE_FILETE)).not.toBe('Turno Noche')
    expect(inferShiftIdFromSchedule('2026-09-12T22:10:00.000Z', BASE_FILETE)).toBe('Turno Noche')
  })

  it('no hereda ningún turno de Chonchi', () => {
    const nombres = BASE_FILETE.map((t) => t.shiftId)
    for (const deChonchi of ['Turno día', 'Turno noche', 'Turno 1', 'Turno 2', 'Turno 1 Lunes']) {
      expect(nombres).not.toContain(deChonchi)
    }
  })
})

describe('normalizeShiftSchedule aplica la config aunque cambien mayúsculas o acentos', () => {
  it('la config «Turno Dia» sobrescribe la base «Turno día»', () => {
    const base = [{ shiftId: 'Turno día', startHour: 7, startMinute: 0, endHour: 19, endMinute: 0 }]
    const r = normalizeShiftSchedule([{ shiftId: 'Turno Dia', startHour: 7, startMinute: 45, endHour: 15, endMinute: 30 }], base)
    expect(r).toHaveLength(1)
    expect([r[0]!.startMinute, r[0]!.endHour, r[0]!.endMinute]).toEqual([45, 15, 30])
  })

  it('conserva el nombre de la BASE, que es el que buscan los consumidores', () => {
    const base = [{ shiftId: 'Turno día', startHour: 7, startMinute: 0, endHour: 19, endMinute: 0 }]
    const r = normalizeShiftSchedule([{ shiftId: 'Turno Dia', startHour: 8, startMinute: 0, endHour: 16, endMinute: 0 }], base)
    expect(r[0]!.shiftId).toBe('Turno día')
  })

  it('un turno que no está en la base se sigue descartando', () => {
    const base = [{ shiftId: 'Turno Dia', startHour: 7, startMinute: 45, endHour: 15, endMinute: 30 }]
    const r = normalizeShiftSchedule([{ shiftId: 'Turno Tarde', startHour: 15, startMinute: 0, endHour: 23, endMinute: 0 }], base)
    expect(r.map((t) => t.shiftId)).toEqual(['Turno Dia'])
  })

  it('las coincidencias exactas se comportan igual que antes', () => {
    const base = [{ shiftId: 'Turno 1', startHour: 21, startMinute: 30, endHour: 5, endMinute: 45 }]
    const r = normalizeShiftSchedule([{ shiftId: 'Turno 1', startHour: 22, startMinute: 0, endHour: 6, endMinute: 0 }], base)
    expect([r[0]!.startHour, r[0]!.endHour]).toEqual([22, 6])
  })
})
