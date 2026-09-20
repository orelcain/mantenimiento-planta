import { describe, expect, it } from 'vitest'
import { cierraCiclo, puentesAlQuitar } from '../modeloLineas'

const A: [string, string][] = [
  ['in:ev', 'cinta'],
  ['cinta', 'b1'],
  ['cinta', 'b2'],
  ['b1', 'chiller'],
  ['b2', 'chiller'],
]

describe('cierraCiclo', () => {
  it('avisa cuando el destino ya llega al origen', () => {
    expect(cierraCiclo(A, 'chiller', 'cinta')).toBe(true)
    expect(cierraCiclo(A, 'chiller', 'b1')).toBe(true)
  })

  it('deja pasar una flecha que sigue el flujo', () => {
    expect(cierraCiclo(A, 'chiller', 'empaque')).toBe(false)
    expect(cierraCiclo(A, 'cinta', 'b3')).toBe(false)
  })

  it('una flecha a sí misma es un círculo', () => {
    expect(cierraCiclo(A, 'b1', 'b1')).toBe(true)
  })

  it('no se cuelga con un grafo que ya tiene un círculo', () => {
    const conVuelta: [string, string][] = [...A, ['chiller', 'cinta']]
    expect(cierraCiclo(conVuelta, 'b1', 'b2')).toBe(true)
    expect(cierraCiclo(conVuelta, 'chiller', 'empaque')).toBe(false)
  })
})

describe('puentesAlQuitar', () => {
  it('en serie, al sacar el del medio se unen los extremos', () => {
    const serie: [string, string][] = [
      ['a', 'b'],
      ['b', 'c'],
    ]
    expect(puentesAlQuitar(serie, ['b'])).toEqual([['a', 'c']])
  })

  it('cruza varios seguidos', () => {
    const serie: [string, string][] = [
      ['a', 'b'],
      ['b', 'c'],
      ['c', 'd'],
    ]
    expect(puentesAlQuitar(serie, ['b', 'c'])).toEqual([['a', 'd']])
  })

  it('al sacar una rama en paralelo, el reparto queda entre las que quedan', () => {
    // Se va b1: cinta sigue unida a b2 y a chiller no se le inventa nada nuevo.
    expect(puentesAlQuitar(A, ['b1'])).toEqual([['cinta', 'chiller']])
  })

  it('no repite una flecha que ya existe', () => {
    const conAtajo: [string, string][] = [
      ['a', 'b'],
      ['b', 'c'],
      ['a', 'c'],
    ]
    expect(puentesAlQuitar(conAtajo, ['b'])).toEqual([])
  })

  it('no arma un círculo al puentear', () => {
    const conVuelta: [string, string][] = [
      ['a', 'b'],
      ['b', 'a'],
      ['b', 'c'],
      ['c', 'a'],
    ]
    // Puentear a → c cerraría el círculo con c → a: no se pone.
    expect(puentesAlQuitar(conVuelta, ['b'])).toEqual([])
  })

  it('sacar una punta no puentea nada', () => {
    const serie: [string, string][] = [
      ['a', 'b'],
      ['b', 'c'],
    ]
    expect(puentesAlQuitar(serie, ['c'])).toEqual([])
    expect(puentesAlQuitar(serie, ['a'])).toEqual([])
  })
})
