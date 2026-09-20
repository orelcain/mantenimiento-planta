import { describe, expect, it } from 'vitest'
import { PREFIJO_GRUPO, pesosPorLinea, type GrafoLineas, type GrupoParalelo } from '../modeloLineas'

/**
 * El Acopio como lo describe Orel (19-09-2026): los peces van de la jaula al ducto de
 * succión, de ahí a los dos estanques de bombeo, y del hidróforo al ducto de descarga.
 * Las dos bombas de vacío no reciben peces: HABILITAN la succión, y hacen falta las DOS.
 * El compresor habilita la salida de los estanques hacia el hidróforo.
 */
const acopio = (grupos: GrupoParalelo[], habilitan: [string, string][]): GrafoLineas => ({
  version: 1,
  lineas: [{ id: 'acopio', nombre: 'Acopio', zona: { x: 0, y: 0, w: 2000, h: 900 } }],
  nodos: [
    { id: 'in:acopio', x: 0, y: 0, zona: 'acopio' },
    { id: 'ducto', x: 200, y: 0, zona: 'acopio' },
    { id: 'estanqueA', x: 400, y: 0, zona: 'acopio' },
    { id: 'estanqueB', x: 400, y: 200, zona: 'acopio' },
    { id: 'hidroforo', x: 600, y: 0, zona: 'acopio' },
    { id: 'descarga', x: 800, y: 0, zona: 'acopio' },
    { id: 'bombaN1', x: 200, y: 400, zona: 'acopio' },
    { id: 'bombaN2', x: 200, y: 560, zona: 'acopio' },
    { id: 'compresor', x: 600, y: 400, zona: 'acopio' },
  ],
  aristas: [
    ['in:acopio', 'ducto'],
    ['ducto', 'estanqueA'],
    ['ducto', 'estanqueB'],
    ['estanqueA', 'hidroforo'],
    ['estanqueB', 'hidroforo'],
    ['hidroforo', 'descarga'],
  ],
  grupos,
  habilitan,
})

const bombas = (modo: GrupoParalelo['modo']): GrupoParalelo => ({ id: 'bombas', miembros: ['bombaN1', 'bombaN2'], nombre: 'Bombas de vacío', modo })

describe('el camino del producto no cambia', () => {
  it('el ducto y el hidróforo llevan el 100 %, los estanques la mitad cada uno', () => {
    const p = pesosPorLinea(acopio([bombas('todas')], [[`${PREFIJO_GRUPO}bombas`, 'ducto']]))
    expect(p.get('ducto')?.peso).toBe(1)
    expect(p.get('hidroforo')?.peso).toBe(1)
    expect(p.get('estanqueA')?.peso).toBe(0.5)
    expect(p.get('estanqueB')?.peso).toBe(0.5)
    // Y no se marcan como habilitadores: por ellos sí pasa el producto.
    expect(p.get('ducto')?.habilita).toBeUndefined()
  })
})

describe('grupo que habilita', () => {
  it('si se necesitan las DOS, cada bomba vale lo mismo que la succión entera', () => {
    const p = pesosPorLinea(acopio([bombas('todas')], [[`${PREFIJO_GRUPO}bombas`, 'ducto']]))
    expect(p.get('bombaN1')?.peso).toBe(1)
    expect(p.get('bombaN2')?.peso).toBe(1)
    expect(p.get('bombaN1')?.habilita).toBe(true)
    expect(p.get('bombaN1')?.lineaId).toBe('acopio')
  })

  it('si se repartieran, cada una valdría la mitad', () => {
    const p = pesosPorLinea(acopio([bombas('reparte')], [[`${PREFIJO_GRUPO}bombas`, 'ducto']]))
    expect(p.get('bombaN1')?.peso).toBe(0.5)
    expect(p.get('bombaN2')?.peso).toBe(0.5)
  })

  it('un habilitador solo se lleva la cuota entera de lo que habilita', () => {
    const p = pesosPorLinea(acopio([], [['compresor', 'hidroforo']]))
    expect(p.get('compresor')?.peso).toBe(1)
    expect(p.get('compresor')?.habilita).toBe(true)
  })

  it('habilitar no le saca cuota a nadie', () => {
    const sin = pesosPorLinea(acopio([], []))
    const con = pesosPorLinea(acopio([bombas('todas')], [[`${PREFIJO_GRUPO}bombas`, 'ducto']]))
    for (const id of ['ducto', 'estanqueA', 'estanqueB', 'hidroforo', 'descarga']) {
      expect(con.get(id)?.peso).toBe(sin.get(id)?.peso)
    }
  })

  it('sin flecha de habilitación, las bombas quedan fuera de la línea', () => {
    const p = pesosPorLinea(acopio([bombas('todas')], []))
    expect(p.get('bombaN1')).toBeUndefined()
    expect(p.get('bombaN2')).toBeUndefined()
  })

  it('habilitar algo que está fuera de la línea no inventa cuota', () => {
    const p = pesosPorLinea(acopio([], [['compresor', 'noExiste']]))
    expect(p.get('compresor')).toBeUndefined()
  })

  it('en cadena: quien habilita al habilitador hereda la misma cuota', () => {
    const p = pesosPorLinea(acopio([], [['compresor', 'hidroforo'], ['bombaN1', 'compresor']]))
    expect(p.get('compresor')?.peso).toBe(1)
    expect(p.get('bombaN1')?.peso).toBe(1)
  })
})

describe('grupo dentro del camino del producto', () => {
  it('una sola flecha al grupo reparte 1/N entre sus miembros', () => {
    const g = acopio([{ id: 'estanques', miembros: ['estanqueA', 'estanqueB'] }], [])
    const conGrupo: GrafoLineas = {
      ...g,
      aristas: [
        ['in:acopio', 'ducto'],
        ['ducto', `${PREFIJO_GRUPO}estanques`],
        [`${PREFIJO_GRUPO}estanques`, 'hidroforo'],
        ['hidroforo', 'descarga'],
      ],
    }
    const p = pesosPorLinea(conGrupo)
    expect(p.get('estanqueA')?.peso).toBe(0.5)
    expect(p.get('estanqueB')?.peso).toBe(0.5)
    // Lo que sale del grupo vuelve a ser el 100 %.
    expect(p.get('hidroforo')?.peso).toBe(1)
  })

  it('y si se necesitan todas, cada una vale el 100 %', () => {
    const g = acopio([{ id: 'estanques', miembros: ['estanqueA', 'estanqueB'], modo: 'todas' }], [])
    const conGrupo: GrafoLineas = {
      ...g,
      aristas: [
        ['in:acopio', 'ducto'],
        ['ducto', `${PREFIJO_GRUPO}estanques`],
        [`${PREFIJO_GRUPO}estanques`, 'hidroforo'],
        ['hidroforo', 'descarga'],
      ],
    }
    const p = pesosPorLinea(conGrupo)
    expect(p.get('estanqueA')?.peso).toBe(1)
    expect(p.get('estanqueB')?.peso).toBe(1)
  })
})
