import { describe, it, expect } from 'vitest'
import { contarEquiposPorSubarbol, etiquetaEquipos, type NodoConHijos } from '../contarEquipos'

const eq = (n: number) => ({ length: n })

describe('contarEquiposPorSubarbol', () => {
  it('suma lo propio más todo lo que cuelga abajo', () => {
    const arbol: NodoConHijos[] = [{
      id: 'planta',
      children: [{
        id: 'proceso',
        children: [{ id: 'chiller', children: [{ id: 'bomba' }] }],
      }],
    }]
    const equipos = new Map([['chiller', eq(1)], ['bomba', eq(1)]])
    const total = contarEquiposPorSubarbol(arbol, equipos)
    expect(total.get('planta')).toBe(2)
    expect(total.get('proceso')).toBe(2)
    expect(total.get('chiller')).toBe(2)
    expect(total.get('bomba')).toBe(1)
  })

  it('un nodo sin nada abajo cuenta 0', () => {
    expect(contarEquiposPorSubarbol([{ id: 'a' }], new Map()).get('a')).toBe(0)
  })

  it('el caso real: cada equipo en su propia hoja, el área los suma todos', () => {
    const hojas: NodoConHijos[] = []
    const equipos = new Map<string, { length: number }>()
    for (let i = 0; i < 552; i++) {
      hojas.push({ id: `hoja-${i}` })
      equipos.set(`hoja-${i}`, eq(1))
    }
    const total = contarEquiposPorSubarbol([{ id: 'area', children: hojas }], equipos)
    expect(total.get('area')).toBe(552)
    expect(total.get('hoja-0')).toBe(1)
  })

  it('un nodo repetido no se cuenta dos veces', () => {
    const repetido: NodoConHijos = { id: 'repe' }
    const arbol: NodoConHijos[] = [{ id: 'raiz', children: [repetido, repetido] }]
    const total = contarEquiposPorSubarbol(arbol, new Map([['repe', eq(1)]]))
    expect(total.get('raiz')).toBe(1)
  })
})

describe('etiquetaEquipos', () => {
  it('no dice "1 equipos"', () => {
    expect(etiquetaEquipos(1)).toBe('1 equipo')
    expect(etiquetaEquipos(0)).toBe('0 equipos')
    expect(etiquetaEquipos(48)).toBe('48 equipos')
  })
})
