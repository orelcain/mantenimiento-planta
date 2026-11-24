import { describe, expect, it } from 'vitest'
import { piezasFueraDeRango } from './fueraRangoGateVivo'
import type { PiezaEspejo } from './espejoFilas'
import type { GateVivo } from './seteoGatesVivo'
import type { CalibreRange } from '../types'

const REF = Date.parse('2026-11-19T04:30:00Z')

const pz = (min: number, gate: number, kg: number): PiezaEspejo => {
  const ts = new Date(REF - min * 60_000).toISOString()
  return { cadena: `${ts}#${gate}#${kg}`, ts, fecha: ts.slice(0, 10), hora: ts.slice(11, 19), pesoKg: kg, cantidad: 1, lote: 'L', gate, calidad: 'Premium', conservacion: 'FRESCO', calibre: '8-10 lb' as CalibreRange, producto: 'P', turnoMatrix: '' }
}

const gate = (n: number, programa: string): GateVivo => ({
  gate: n, programa, desdeTs: null, provisional: null, piezasHora: 0, piezasTurno: 0, pzMinHora: 0, pzMinTurno: 0, pctHora: 0, pesoKg: null, ultimaTs: null, minSinPiezas: null, apagada: false,
})

/** 20 piezas dentro del rango (3,7–4,4 kg) de una gate 8-10 Premium, más las que se indiquen. */
const base = (extra: PiezaEspejo[]) => [...Array.from({ length: 20 }, (_, i) => pz(i + 1, 9, 3.7 + (i % 8) * 0.1)), ...extra]
const g9 = [gate(9, '8-10 lb · Premium')]

describe('piezasFueraDeRango', () => {
  it('sin piezas fuera no avisa', () => {
    expect(piezasFueraDeRango(base([]), g9, REF)).toEqual([])
  })
  it('una sola pieza fuera no avisa; un par es sugerencia', () => {
    expect(piezasFueraDeRango(base([pz(3, 9, 5.3)]), g9, REF)).toEqual([])
    const r = piezasFueraDeRango(base([pz(3, 9, 5.3), pz(4, 9, 5.4)]), g9, REF)
    expect(r).toHaveLength(1)
    expect(r[0]).toMatchObject({ gate: 9, lado: 'sobre', n: 2, nivel: 'sugerencia' })
    expect(r[0]!.extremoKg).toBeCloseTo(5.4, 6)
  })
  it('varias piezas y con peso en la gate es alerta', () => {
    const extra = [5.3, 5.4, 5.5, 5.2, 5.6].map((kg, i) => pz(i + 2, 9, kg))
    const r = piezasFueraDeRango(base(extra), g9, REF)
    expect(r[0]).toMatchObject({ lado: 'sobre', n: 5, nivel: 'alerta' })
    expect(r[0]!.pct).toBeGreaterThan(5)
  })
  it('la zona compartida Premium (hasta 4,99 kg) no cuenta en una gate 8-10', () => {
    expect(piezasFueraDeRango(base([pz(3, 9, 4.8), pz(4, 9, 4.9), pz(5, 9, 4.95)]), g9, REF)).toEqual([])
  })
  it('bajo el mínimo también avisa, por el lado «bajo»', () => {
    const r = piezasFueraDeRango(base([pz(3, 9, 3.2), pz(4, 9, 3.1)]), g9, REF)
    expect(r[0]).toMatchObject({ lado: 'bajo', n: 2 })
  })
  it('12-UP no tiene tope: nada pesa «sobre»', () => {
    const r = piezasFueraDeRango([pz(2, 12, 7), pz(3, 12, 8), pz(4, 12, 6.5)], [gate(12, '12-UP lb · Premium')], REF)
    expect(r.filter((x) => x.lado === 'sobre')).toEqual([])
  })
  it('solo mira la última media hora', () => {
    expect(piezasFueraDeRango(base([pz(40, 9, 5.4), pz(41, 9, 5.5)]), g9, REF)).toEqual([])
  })
})
