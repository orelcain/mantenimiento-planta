/**
 * Piezas de cada Baader (`filasDeBaader`): salen del contador vivo con la guarda de PSM (`repro.tope.porMaquina`) y, sin ella, del
 * doc del corte. En los dos casos Σ Baader = la cifra grande de «Piezas del turno» cuando esa base es la misma.
 */
import { describe, expect, it } from 'vitest'
import { filasDeBaader } from '../baadersMinuto'
import type { EjeDatos } from '../GraficoRitmoVivo'
import type { MonitorV2Props } from '../MonitorV2'

const INI = Date.UTC(2026, 9, 27, 21, 30)
const eje: EjeDatos = {
  iniMs: INI,
  finMs: INI + 450 * 60_000,
  minuto: {
    desde: new Date(INI).toISOString(),
    maquinas: [
      { id: 'a', nombre: 'Evisceradora 1', esperado: 19, cycles: [17, 18] },
      { id: 'b', nombre: 'Evisceradora 2', esperado: 16, cycles: [14, 15] },
      { id: 'c', nombre: 'Evisceradora 3', esperado: 16, cycles: [14, 15] },
    ],
  },
  primeraPiezaMs: null,
  detenidaEstado: false,
  paradas: [],
  llenado: null,
  unidad: 'carros',
}
const docs = [
  { name: 'Evisceradora 1', piezas: 2120, promedio: 15, status: 'produciendo' },
  { name: 'Evisceradora 2', piezas: 2115, promedio: 14, status: 'produciendo' },
  { name: 'Evisceradora 3', piezas: 2120, promedio: 14, status: 'produciendo' },
]
const props = (porMaquina: Record<string, number> | null): MonitorV2Props =>
  ({ cerrado: false, maquinas: docs, repro: porMaquina ? { tope: { porMaquina } } : null }) as unknown as MonitorV2Props
const suma = (xs: Array<{ piezas: number }>) => xs.reduce((a, f) => a + f.piezas, 0)

describe('filasDeBaader · piezas por Baader', () => {
  it('con la guarda del contador, cada Baader trae su parte y Σ Baader = Piezas del turno', () => {
    const filas = filasDeBaader(props({ a: 2198, b: 2160, c: 2223 }), eje)
    expect(filas.map((f) => f.piezas)).toEqual([2198, 2160, 2223])
    expect(suma(filas)).toBe(6581)
  })

  it('sin la guarda (el contador no coincide con los ciclos), cae al doc del corte', () => {
    const filas = filasDeBaader(props(null), eje)
    expect(filas.map((f) => f.piezas)).toEqual([2120, 2115, 2120])
    expect(suma(filas)).toBe(6355)
  })

  it('un valor del contador inválido en una Baader no deja NaN: usa su doc', () => {
    const filas = filasDeBaader(props({ a: 2198, b: Number.NaN, c: 2223 }), eje)
    expect(filas.map((f) => f.piezas)).toEqual([2198, 2115, 2223])
  })
})
