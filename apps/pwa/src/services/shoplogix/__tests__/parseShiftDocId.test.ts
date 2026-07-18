/**
 * Tests de `parseShiftDocId` — parsea los doc IDs `${dateKey}_${shiftId}` que
 * devuelve la query de rango que reemplazó al fan-out de una query por día.
 *
 * El punto delicado: los shiftId REALES de Shoplogix traen espacios, asteriscos
 * y palabras extra ("Turno 1 Lunes", "Turno 3*"), y el separador `_` no es único
 * en la cadena si el nombre del turno lo tuviera. Por eso el split es por el
 * PRIMER `_` tras un dateKey de largo fijo, no por el último.
 */

import { describe, it, expect, vi } from 'vitest'

vi.mock('@/services/firebase', () => ({ db: {}, auth: {}, storage: {}, rtdb: {} }))

import { parseShiftDocId } from '../shoplogixShift.service'

describe('parseShiftDocId', () => {
  it('parsea un turno simple', () => {
    expect(parseShiftDocId('2026-07-08_Turno 2')).toEqual({
      dateKey: '2026-07-08', shiftId: 'Turno 2',
    })
  })

  it('conserva espacios y asteriscos del nombre real de Shoplogix', () => {
    expect(parseShiftDocId('2026-07-08_Turno 3*')).toEqual({
      dateKey: '2026-07-08', shiftId: 'Turno 3*',
    })
    expect(parseShiftDocId('2026-07-06_Turno 1 Lunes')).toEqual({
      dateKey: '2026-07-06', shiftId: 'Turno 1 Lunes',
    })
  })

  it('parsea Unscheduled', () => {
    expect(parseShiftDocId('2026-07-02_Unscheduled')).toEqual({
      dateKey: '2026-07-02', shiftId: 'Unscheduled',
    })
  })

  it('corta por el PRIMER separador, no por el último', () => {
    // Un shiftId que contuviera '_' no debe romper el dateKey.
    expect(parseShiftDocId('2026-07-08_Turno_raro')).toEqual({
      dateKey: '2026-07-08', shiftId: 'Turno_raro',
    })
  })

  it('devuelve null si no hay dateKey válido al inicio', () => {
    expect(parseShiftDocId('Turno 2')).toBeNull()
    expect(parseShiftDocId('2026-7-8_Turno 2')).toBeNull()   // sin padding
    expect(parseShiftDocId('')).toBeNull()
  })

  it('devuelve null si falta el shiftId', () => {
    expect(parseShiftDocId('2026-07-08')).toBeNull()
    expect(parseShiftDocId('2026-07-08_')).toBeNull()
  })
})
