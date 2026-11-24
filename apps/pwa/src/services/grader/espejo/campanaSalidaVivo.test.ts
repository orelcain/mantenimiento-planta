/** Campana por capas y salida por calibre (tanda 2). 18-11 T1 a las 04:30 y casos armados. */
import { describe, expect, it } from 'vitest'
import { campanaDelTurno, hitosDelTurno } from './campanaPesoVivo'
import { salidaPorCalibre, textoGatesParte } from './salidaCalibreVivo'
import { seteoGatesVivo } from './seteoGatesVivo'
import { piezasHasta, turnoReal } from './__fixtures__/turnosReales'
import type { PiezaEspejo } from './espejoFilas'
import type { CalibreRange } from '../types'

const T0 = Date.parse('2026-11-19T01:00:00.000Z')
const pz = (seg: number, gate: number, kg: number | null, calibre = '8-10 lb', calidad = 'Premium'): PiezaEspejo => {
  const ts = new Date(T0 + seg * 1000).toISOString()
  return { cadena: `${ts}#${gate}#${seg}`, ts, fecha: ts.slice(0, 10), hora: ts.slice(11, 19), pesoKg: kg, cantidad: 1, lote: 'L', gate, calidad, conservacion: 'FRESCO', calibre: calibre as CalibreRange, producto: 'P', turnoMatrix: '' }
}

describe('hitos del turno', () => {
  it('turno de 7 h: dos horas en punto, al tercio y a los dos tercios', () => {
    expect(hitosDelTurno('2026-11-18T21:15:00.000Z', '2026-11-19T04:29:00.000Z').map((h) => h.slice(11, 16))).toEqual(['00:00', '02:00'])
  })
  it('con menos de una hora no hay hitos; con una hora en punto de por medio, uno', () => {
    expect(hitosDelTurno('2026-11-19T01:00:00.000Z', '2026-11-19T01:40:00.000Z')).toEqual([])
    expect(hitosDelTurno('2026-11-19T00:20:00.000Z', '2026-11-19T02:10:00.000Z').map((h) => h.slice(11, 16))).toEqual(['01:00'])
  })
})

describe('campana por capas, 18-11 T1 a las 04:30', () => {
  const t = turnoReal('2026-11-18-turno_1')
  const ps = piezasHasta(t, Date.parse('2026-11-19T04:30:00Z'))
  const s = seteoGatesVivo(ps, Date.parse('2026-11-19T04:30:00Z'))!
  const c = campanaDelTurno(ps, s.gates.map((g) => g.programa))
  it('las capas se contienen: cada una tiene más piezas y casillas que la anterior', () => {
    expect(c.capas.map((x) => x.rotulo)).toEqual(['hasta 00:00', 'hasta 02:00', 'ahora'])
    for (let i = 1; i < c.capas.length; i++) {
      expect(c.capas[i]!.piezas).toBeGreaterThan(c.capas[i - 1]!.piezas)
      c.capas[i]!.bins.forEach((v, k) => expect(v).toBeGreaterThanOrEqual(c.capas[i - 1]!.bins[k]!))
    }
  })
  it('la capa de ahora más lo que cayó fuera de 2–6 kg suma las piezas del encabezado', () => {
    const ahora = c.capas[c.capas.length - 1]!
    expect(ahora.piezas).toBe(c.piezas)
    expect(ahora.bins.reduce((a, b) => a + b, 0) + c.fuera).toBe(c.piezas)
  })
  it('es la salida sin Gate 0 y la media es de esas piezas', () => {
    const sg0 = ps.filter((p) => p.gate > 0 && p.pesoKg)
    expect(c.piezas).toBe(sg0.reduce((a, p) => a + p.cantidad, 0))
    expect(c.mediaKg!).toBeGreaterThan(4.1)
    expect(c.mediaKg!).toBeLessThan(4.4)
  })
  it('los rangos de las gates salen de sus programas, de menor a mayor, 12-UP sin tope', () => {
    expect(c.bandas.map((b) => b.rotulo)).toEqual(['2-4', '4-6', '6-8', '8-10', '10-12', '12-UP'])
    expect(c.bandas[5]!.hastaKg).toBeNull()
  })
})

describe('campana con poco turno', () => {
  it('a menos de una hora sale una sola capa «ahora»', () => {
    const c = campanaDelTurno([pz(0, 8, 4.0), pz(60, 8, 4.2), pz(120, 9, 4.4)])
    expect(c.capas.map((x) => x.rotulo)).toEqual(['ahora'])
    expect(c.piezas).toBe(3)
    expect(c.mediaKg!).toBeCloseTo(4.2, 6)
  })
  it('sin piezas con peso no hay capas; las de Gate 0 y sin peso no cuentan', () => {
    const c = campanaDelTurno([pz(0, 0, 4.0), pz(10, 8, null)])
    expect(c.capas).toEqual([])
    expect(c.piezas).toBe(0)
    expect(c.mediaKg).toBeNull()
  })
  it('una pieza bajo 2 kg cuenta en el total pero no en la campana', () => {
    const c = campanaDelTurno([pz(0, 2, 1.2), pz(5, 8, 4.0)])
    expect(c.piezas).toBe(2)
    expect(c.fuera).toBe(1)
  })
})

describe('salida por calibre, 18-11 T1 a las 04:30', () => {
  const t = turnoReal('2026-11-18-turno_1')
  const ps = piezasHasta(t, Date.parse('2026-11-19T04:30:00Z'))
  const s = seteoGatesVivo(ps, Date.parse('2026-11-19T04:30:00Z'))!
  const so = salidaPorCalibre(s.programas)
  it('las partes de cada calibre suman su porcentaje y los calibres suman 100 %', () => {
    for (const c of so.calibres) expect(c.partes.reduce((a, p) => a + p.pct, 0)).toBeCloseTo(c.pct, 6)
    expect(so.calibres.reduce((a, c) => a + c.pct, 0)).toBeCloseTo(100, 6)
    expect(so.calidad.reduce((a, q) => a + q.pct, 0)).toBeCloseTo(100, 6)
  })
  it('8-10, 10-12 y 6-8 salen primero; 12-UP, 4-6 y 2-4 quedan como poco flujo con 4 gates', () => {
    expect(so.principales.map((c) => c.calibre)).toEqual(['8-10 lb', '10-12 lb', '6-8 lb'])
    expect(so.poco.map((c) => c.calibre).sort()).toEqual(['12-UP lb', '2-4 lb', '4-6 lb'])
    expect(so.gatesPoco).toBe(4)
  })
  it('8-10 se parte en Premium e Industrial con sus gates; 10-12 Premium dice que G11 la tuvo hasta las 03:21', () => {
    const c810 = so.principales[0]!
    expect(c810.partes.map((p) => p.calidad)).toEqual(['Premium', 'Industrial'])
    expect(textoGatesParte(c810.partes[0]!.gates)).toBe('G8–G10, G11 desde 03:21')
    expect(textoGatesParte(c810.partes[1]!.gates)).toBe('G5')
    expect(textoGatesParte(so.principales[1]!.partes[0]!.gates)).toBe('G12, G11 hasta 03:21')
  })
  it('muestra siempre Premium, Industrial y D, aunque D tenga 0 piezas', () => {
    const cals = so.calidad.map((q) => q.calidad)
    expect(cals).toEqual(expect.arrayContaining(['Premium', 'Industrial', 'D']))
    expect(salidaPorCalibre([]).calidad.map((q) => q.calidad)).toEqual(['Premium', 'Industrial', 'D'])
    expect(so.calidad.find((q) => q.calidad === 'D')!.piezas).toBeGreaterThanOrEqual(0)
  })
  it('Premium es la mayor calidad', () => {
    expect(so.calidad[0]!.calidad).toBe('Premium')
    expect(so.calidad[0]!.pct).toBeGreaterThan(95)
  })
})
