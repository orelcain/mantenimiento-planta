import { describe, expect, it } from 'vitest'
import type { PlanoAparicion } from '@/hooks/usePlano'
import {
  MAX_RECIENTES, indiceInicial, leerRecientes, marcaEnHoja, ordenarPuntos, paso, sumarReciente,
} from '../recorridoPlano'

const pt = (h: number, x: number, y: number): PlanoAparicion => ({ h, c: 0, b: [x, y, 10, 10] })

describe('ordenarPuntos', () => {
  it('ordena por hoja y dentro de la hoja de arriba abajo', () => {
    const r = ordenarPuntos([pt(9, 0, 0), pt(3, 50, 80), pt(3, 10, 20)])
    expect(r.map((p) => [p.h, p.b[1]])).toEqual([[3, 20], [3, 80], [9, 0]])
  })
})

describe('indiceInicial', () => {
  const puntos = [pt(2, 0, 0), pt(5, 0, 0), pt(5, 0, 100)]
  it('prefiere la caja exacta', () => expect(indiceInicial(puntos, 5, [0, 100, 10, 10])).toBe(2))
  it('si no, la hoja abierta', () => expect(indiceInicial(puntos, 5)).toBe(1))
  it('si no, la primera', () => expect(indiceInicial(puntos, 99)).toBe(0))
})

describe('paso', () => {
  it('avanza y da la vuelta', () => {
    expect(paso(4, 6, 1)).toBe(5)
    expect(paso(5, 6, 1)).toBe(0)
    expect(paso(0, 6, -1)).toBe(5)
    expect(paso(0, 0, 1)).toBe(0)
  })
})

describe('marcaEnHoja', () => {
  it('numera solo cuando la hoja se repite', () => {
    const p = [pt(1, 0, 0), pt(4, 0, 0), pt(4, 0, 9)]
    expect(marcaEnHoja(p, 0)).toBeNull()
    expect(marcaEnHoja(p, 2)).toBe(2)
  })
})

describe('historial', () => {
  it('lee el formato viejo de códigos sueltos y descarta basura', () => {
    expect(leerRecientes('["518057", 3, {"c":"513497","n":"Polea"}]'))
      .toEqual([{ c: '518057' }, { c: '513497', n: 'Polea' }])
    expect(leerRecientes('no-json')).toEqual([])
    expect(leerRecientes(null)).toEqual([])
  })
  it('pone al frente sin duplicar y conserva el nombre conocido', () => {
    const l = sumarReciente([{ c: 'A', n: 'Rodillo' }, { c: 'B' }], { c: 'A' })
    expect(l).toEqual([{ c: 'A', n: 'Rodillo' }, { c: 'B' }])
  })
  it(`guarda como máximo ${MAX_RECIENTES}`, () => {
    let l: ReturnType<typeof sumarReciente> = []
    for (let i = 0; i < 12; i++) l = sumarReciente(l, { c: String(i) })
    expect(l).toHaveLength(MAX_RECIENTES)
    expect(l[0]!.c).toBe('11')
  })
})
