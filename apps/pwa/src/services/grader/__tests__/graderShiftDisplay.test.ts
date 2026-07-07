import { describe, it, expect } from 'vitest'
import {
  isMidnightShift,
  getShiftDisplayDateKey,
  getCfDateKeyForDisplayDay,
  slxKeyForVisualShift,
  getShiftMeta,
} from '../graderShiftDisplay'

describe('isMidnightShift — dateKey del CF = día calendario (verificado vs prod)', () => {
  it('Turno 3 NUNCA desplaza: su dateKey ya es el día calendario del turno', () => {
    // Regresión: el T3 real arranca 00:00 y shiftDateKeyFromStart guarda
    // dateKey = día de inicio. El desplazamiento +1 (convención vieja del CF,
    // sin docs vivos) mostraba 2026-07-07_Turno 3 como del 8 de julio.
    expect(isMidnightShift('Turno 3', '2026-07-07')).toBe(false)
    expect(isMidnightShift('Turno 3', '2026-04-27')).toBe(false)
    expect(isMidnightShift('Turno 3')).toBe(false)
  })

  it('otros turnos tampoco desplazan', () => {
    expect(isMidnightShift('Turno 1', '2026-04-26')).toBe(false)
    expect(isMidnightShift('Turno 1 Lunes', '2026-07-06')).toBe(false)
    expect(isMidnightShift('Unscheduled', '2026-04-26')).toBe(false)
  })
})

describe('getShiftDisplayDateKey / getCfDateKeyForDisplayDay — identidad', () => {
  it('display = dateKey CF para todos los turnos', () => {
    expect(getShiftDisplayDateKey('2026-07-07', 'Turno 3')).toBe('2026-07-07')
    expect(getShiftDisplayDateKey('2026-04-27', 'Turno 3')).toBe('2026-04-27')
    expect(getShiftDisplayDateKey('2026-07-06', 'Turno 2')).toBe('2026-07-06')
  })

  it('la inversa también es identidad', () => {
    expect(getCfDateKeyForDisplayDay('2026-07-07', 'Turno 3')).toBe('2026-07-07')
    expect(getCfDateKeyForDisplayDay('2026-07-06', 'Turno 1 Lunes')).toBe('2026-07-06')
  })

  it('slxKeyForVisualShift arma la clave con el mismo día', () => {
    expect(slxKeyForVisualShift('2026-07-07', 'Turno 3')).toBe('2026-07-07__Turno 3')
    expect(slxKeyForVisualShift('2026-07-06', 'Turno 2')).toBe('2026-07-06__Turno 2')
  })
})

describe('getShiftMeta — nombres que emite Shoplogix', () => {
  it('conoce "Turno 1 Lunes" (variante chonchi 2026-07)', () => {
    const meta = getShiftMeta('Turno 1 Lunes')
    expect(meta.shortLabel).toBe('T1L')
    expect(meta.isDayLike).toBe(false)
  })

  it('muestra "Unscheduled" como "Sin turno asignado" (registro fiel, PR #157)', () => {
    const meta = getShiftMeta('Unscheduled')
    expect(meta.label).toBe('Sin turno asignado')
  })

  it('nombre desconocido cae al fallback sin romper', () => {
    expect(getShiftMeta('Turno Nuevo X').shortLabel).toBe('?')
  })
})
