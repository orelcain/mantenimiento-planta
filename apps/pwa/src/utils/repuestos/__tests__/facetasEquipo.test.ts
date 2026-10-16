import { describe, expect, it } from 'vitest'
import { facetasDeEquipo, filtraPorFaceta, ocultarFacetas } from '../facetasEquipo'

const PLANTA: Record<string, string> = {
  b1: 'PLANTA CHONCHI', b2: 'PLANTA CHONCHI', b3: 'PLANTA CHONCHI',
  k1: 'PLANTA CHONCHI', ky: 'PLANTA YAL', by: 'PLANTA YAL',
}
const plantaDe = (id: string) => PLANTA[id]
const eq = (machineId: string, machineName: string) => ({ machineId, machineName })
const B1 = eq('b1', 'EVISCERADORA BAADER 142 N1')
const B2 = eq('b2', 'EVISCERADORA BAADER 142 N2')
const B3 = eq('b3', 'EVISCERADORA BAADER 142 N3')
const K1 = eq('k1', 'KNURO N1')
const KY = eq('ky', 'KNURO N1')
const BY = eq('by', 'EVISCERADORA BAADER 142 N1')

describe('facetasDeEquipo', () => {
  it('con 2 familias ofrece chips por familia, ordenados por conteo, con filas únicas', () => {
    const rows = [
      { rowKey: 'a', equipos: [B1, B2, B3] }, // una pieza en N1+N2+N3 cuenta UNA vez
      { rowKey: 'b', equipos: [B1] },
      { rowKey: 'c', equipos: [K1] },
    ]
    const f = facetasDeEquipo(rows, plantaDe)
    expect(f.nivel).toBe('familia')
    expect(f.opciones.map((o) => [o.etiqueta, o.conteo])).toEqual([['Evisceradora Baader 142', 2], ['Knuro', 1]])
  })

  it('una pieza que está en dos familias cuenta en cada una', () => {
    const f = facetasDeEquipo([{ rowKey: 'a', equipos: [B1, K1] }], plantaDe)
    expect(f.opciones.map((o) => o.conteo)).toEqual([1, 1])
  })

  it('con una sola familia baja a planta', () => {
    const f = facetasDeEquipo([{ rowKey: 'a', equipos: [B1, BY] }, { rowKey: 'b', equipos: [B2] }], plantaDe)
    expect(f.nivel).toBe('planta')
    expect(f.opciones.map((o) => [o.etiqueta, o.conteo])).toEqual([['Chonchi', 2], ['Yal', 1]])
  })

  it('con una familia y una planta baja a unidad', () => {
    const f = facetasDeEquipo([{ rowKey: 'a', equipos: [B1, B2] }, { rowKey: 'b', equipos: [B1] }], plantaDe)
    expect(f.nivel).toBe('unidad')
    expect(f.opciones.map((o) => [o.etiqueta, o.conteo])).toEqual([['N1', 2], ['N2', 1]])
  })

  it('el mismo nombre en dos plantas son dos equipos (Knuro N1 Chonchi / Yal)', () => {
    const rows = [{ rowKey: 'a', equipos: [K1] }, { rowKey: 'b', equipos: [KY] }]
    expect(facetasDeEquipo(rows, plantaDe).nivel).toBe('planta')
  })
})

describe('filtraPorFaceta', () => {
  it('filtra por familia, planta y unidad', () => {
    const r = { rowKey: 'a', equipos: [B2, KY] }
    expect(filtraPorFaceta(r, { nivel: 'familia', clave: 'KNURO' }, plantaDe)).toBe(true)
    expect(filtraPorFaceta(r, { nivel: 'familia', clave: 'FISHKEN' }, plantaDe)).toBe(false)
    expect(filtraPorFaceta(r, { nivel: 'planta', clave: 'PLANTA YAL' }, plantaDe)).toBe(true)
    expect(filtraPorFaceta(r, { nivel: 'unidad', clave: 'N3' }, plantaDe)).toBe(false)
    expect(filtraPorFaceta(r, { nivel: 'unidad', clave: 'N2' }, plantaDe)).toBe(true)
  })
})

describe('ocultarFacetas', () => {
  const rows = (n: number) => Array.from({ length: n }, (_, i) => ({ rowKey: String(i), equipos: [B1] }))
  it('oculta con 3 filas o menos', () => {
    expect(ocultarFacetas(rows(3), { nivel: 'familia', opciones: [{ clave: 'a', etiqueta: 'a', conteo: 1 }, { clave: 'b', etiqueta: 'b', conteo: 2 }] })).toBe(true)
  })
  it('oculta con una sola opción', () => {
    expect(ocultarFacetas(rows(10), { nivel: 'unidad', opciones: [{ clave: 'N1', etiqueta: 'N1', conteo: 10 }] })).toBe(true)
  })
  it('muestra con más de 3 filas y 2 opciones', () => {
    expect(ocultarFacetas(rows(4), { nivel: 'familia', opciones: [{ clave: 'a', etiqueta: 'a', conteo: 1 }, { clave: 'b', etiqueta: 'b', conteo: 3 }] })).toBe(false)
  })
})
