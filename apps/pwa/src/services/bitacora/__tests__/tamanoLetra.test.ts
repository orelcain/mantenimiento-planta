import { afterEach, describe, expect, it } from 'vitest'
import { ESCALA_MAXIMA, escalaDe, escalaDesdeCuerpoIos, guardarTamanoLetra, leerTamanoLetra } from '../tamanoLetra'

describe('tamaño de letra de la bitácora', () => {
  afterEach(() => localStorage.clear())

  it('toma el tamaño de iOS: 17 pt = normal, 21 pt = 124 %, 23 pt = 135 %', () => {
    expect(escalaDesdeCuerpoIos(17)).toBe(1)
    expect(escalaDesdeCuerpoIos(21)).toBe(1.24)
    expect(escalaDesdeCuerpoIos(23)).toBe(1.35)
  })

  it('no achica bajo lo normal (piso de 11 px) ni pasa del tope revisado', () => {
    expect(escalaDesdeCuerpoIos(14)).toBe(1)
    expect(escalaDesdeCuerpoIos(53)).toBe(ESCALA_MAXIMA)
    expect(escalaDesdeCuerpoIos(Number.NaN)).toBe(1)
    expect(escalaDesdeCuerpoIos(0)).toBe(1)
  })

  it('«Como el iPhone» sin dato del teléfono queda normal', () => {
    expect(escalaDe('telefono', null)).toBe(1)
    expect(escalaDe('telefono', 1.24)).toBe(1.24)
    expect(escalaDe('grande', 1.24)).toBe(1.18)
    expect(escalaDe('normal', 1.35)).toBe(1)
  })

  it('por defecto: sigue al iPhone donde se puede; si no, normal', () => {
    expect(leerTamanoLetra(true)).toBe('telefono')
    expect(leerTamanoLetra(false)).toBe('normal')
  })

  it('recuerda lo elegido en este teléfono', () => {
    guardarTamanoLetra('muy-grande')
    expect(leerTamanoLetra(false)).toBe('muy-grande')
  })

  it('«Como el iPhone» guardado no vale en un teléfono que no lo informa', () => {
    guardarTamanoLetra('telefono')
    expect(leerTamanoLetra(false)).toBe('normal')
    localStorage.setItem('bitacora.tamanoLetra', 'gigante')
    expect(leerTamanoLetra(true)).toBe('telefono')
  })
})
