/**
 * Turnos que la tabla no reconocía y salían como «?».
 *
 * `FALLBACK_META.shortLabel` es literalmente `'?'`, así que un turno que no está
 * en la tabla se muestra como «09-10 · ?» y como «Turno desconocido». Medido
 * sobre los turnos reales de Shoplogix: Filete emite «Turno Noche» y
 * «Turno Noche L» (24 de sus 127 turnos, 19 %) y Yal emite «Turno 3*» (7).
 */
import { describe, it, expect } from 'vitest'
import { getShiftMeta, claveNormalizadaDeTurno } from '../graderShiftDisplay'

describe('getShiftMeta con los nombres reales de cada línea', () => {
  it('«Turno Noche» de Filete es el turno de noche, no un desconocido', () => {
    const m = getShiftMeta('Turno Noche')
    expect(m.shortLabel).toBe('Noche')
    expect(m.shortLabel).not.toBe('?')
    expect(m.isDayLike).toBe(false)
  })

  it('«Turno Noche L» tiene entrada propia: es la variante de los lunes', () => {
    const m = getShiftMeta('Turno Noche L')
    expect(m.shortLabel).toBe('NocheL')
    expect(m.label).toContain('Lunes')
  })

  it('«Turno 3*» de Yal es el Turno 3: el asterisco no lo vuelve desconocido', () => {
    expect(getShiftMeta('Turno 3*').shortLabel).toBe(getShiftMeta('Turno 3').shortLabel)
  })

  it('«Sin turno» se nombra, no sale como «?»', () => {
    expect(getShiftMeta('Sin turno').shortLabel).toBe('S/T')
  })

  it('los nombres que ya funcionaban siguen igual', () => {
    expect(getShiftMeta('Turno 1').shortLabel).toBe('T1')
    expect(getShiftMeta('Turno 1 Lunes').shortLabel).toBe('T1L')
    expect(getShiftMeta('Turno Dia').shortLabel).toBe(getShiftMeta('Turno día').shortLabel)
    expect(getShiftMeta('Unscheduled').shortLabel).toBe('S/T')
  })

  it('un turno que de verdad no existe sigue cayendo en el fallback', () => {
    expect(getShiftMeta('Turno 47').shortLabel).toBe('?')
    expect(getShiftMeta('').shortLabel).toBe('?')
  })
})

describe('claveNormalizadaDeTurno', () => {
  it('iguala mayúsculas, acentos y espacios de más', () => {
    expect(claveNormalizadaDeTurno('Turno Noche')).toBe('turno noche')
    expect(claveNormalizadaDeTurno('Turno día')).toBe('turno dia')
    expect(claveNormalizadaDeTurno('  Turno   2  ')).toBe('turno 2')
  })

  it('quita el asterisco de variante', () => {
    expect(claveNormalizadaDeTurno('Turno 3*')).toBe('turno 3')
    expect(claveNormalizadaDeTurno('Turno 3 *')).toBe('turno 3')
  })

  it('NO colapsa la variante de lunes, que es otro turno', () => {
    expect(claveNormalizadaDeTurno('Turno Noche L')).not.toBe(claveNormalizadaDeTurno('Turno Noche'))
  })
})
