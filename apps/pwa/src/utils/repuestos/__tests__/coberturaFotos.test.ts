import { describe, expect, it } from 'vitest'
import { claseFotos, coberturaFotos, ordenarSinFoto, portada } from '../coberturaFotos'

const BODEGA = 'https://x/o/repuestos%2Fa%2F1%2Ffotos%2Fb.jpg?alt=media'
const MANUAL = 'https://x/o/repuestos%2Fa%2F1%2Fmanual%2Fm.png?alt=media'
const OTRA = 'https://x/o/otra/c.jpg'

describe('claseFotos', () => {
  it('sin fotos', () => expect(claseFotos([])).toBe('sin'))
  it('solo manual', () => expect(claseFotos([MANUAL, MANUAL])).toBe('manual'))
  it('bodega u otra cuentan como real', () => {
    expect(claseFotos([BODEGA])).toBe('real')
    expect(claseFotos([OTRA])).toBe('real')
    expect(claseFotos([MANUAL, BODEGA])).toBe('real')
  })
})

describe('portada', () => {
  it('prefiere la primera no manual', () => expect(portada([MANUAL, BODEGA])).toBe(BODEGA))
  it('si todas son manual, la primera', () => expect(portada([MANUAL, MANUAL + '2'])).toBe(MANUAL))
  it('sin fotos', () => expect(portada([])).toBeUndefined())
})

describe('coberturaFotos', () => {
  it('cuenta y redondea', () => {
    const rows = [[BODEGA], [MANUAL], [], [], [], []]
    const c = coberturaFotos(rows, (r) => r)
    expect(c).toEqual({ total: 6, real: 1, manual: 1, sin: 4, pctReal: 17 })
  })
  it('vacío no divide por cero', () => {
    expect(coberturaFotos([], () => []).pctReal).toBe(0)
  })
})

describe('ordenarSinFoto', () => {
  it('comunes, luego con stock, luego el resto; estable', () => {
    const rows = [
      { rowKey: 'a', stockActual: 0 },
      { rowKey: 'b', stockActual: 5 },
      { rowKey: 'c', stockActual: 0, comunEn: [{}] },
      { rowKey: 'd', stockActual: 0 },
      { rowKey: 'e', stockActual: 2 },
    ]
    expect(ordenarSinFoto(rows).map((r) => r.rowKey)).toEqual(['c', 'b', 'e', 'a', 'd'])
  })
})
