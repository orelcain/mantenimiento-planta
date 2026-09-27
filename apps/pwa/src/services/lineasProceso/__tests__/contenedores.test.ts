import { describe, expect, it } from 'vitest'
import { cajaNueva, idDeContenedor } from '../modeloLineas'

describe('idDeContenedor', () => {
  it('saca los acentos y los espacios', () => {
    expect(idDeContenedor('Empaque secundario', [])).toBe('empaque-secundario')
    expect(idDeContenedor('Línea manual HG', [])).toBe('linea-manual-hg')
  })

  it('no choca con un id que ya existe', () => {
    expect(idDeContenedor('Filete', ['filete'])).toBe('filete-2')
    expect(idDeContenedor('Filete', ['filete', 'filete-2'])).toBe('filete-3')
  })

  it('un nombre sin letras ni números igual da un id usable', () => {
    expect(idDeContenedor('···', [])).toBe('linea')
    expect(idDeContenedor('···', ['linea'])).toBe('linea-2')
  })
})

describe('cajaNueva', () => {
  it('la pone a la derecha de todo y a la altura de la más alta', () => {
    const caja = cajaNueva([
      { x: 0, y: 40, w: 800, h: 720 },
      { x: 820, y: 0, w: 1800, h: 720 },
    ])
    expect(caja).toEqual({ x: 2700, y: 0, w: 560, h: 360 })
  })

  it('la primera nace en el origen', () => {
    expect(cajaNueva([])).toEqual({ x: 0, y: 0, w: 560, h: 360 })
  })
})
