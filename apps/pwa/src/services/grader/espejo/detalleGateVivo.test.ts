/** Detalle de una gate (tanda 2): rango en lb y kg, hacia dónde se cargan las piezas y la tira por minuto. 18-11 T1 a las 04:30. */
import { describe, expect, it } from 'vitest'
import { detalleGate, detalleGate0, ejeDeGate, rangoLbKg, repartoEnRango, type PiezaGate0 } from './detalleGateVivo'
import { seteoGatesVivo } from './seteoGatesVivo'
import { piezasHasta, turnoReal } from './__fixtures__/turnosReales'
import type { PiezaEspejo } from './espejoFilas'
import type { CalibreRange } from '../types'

describe('rango del programa en lb y kg', () => {
  it('8-10 lb → 3,63 y 4,54 kg', () => {
    const r = rangoLbKg('8-10 lb · Premium')!
    expect([r.loLb, r.hiLb]).toEqual([8, 10])
    expect(r.loKg).toBeCloseTo(3.629, 3)
    expect(r.hiKg).toBeCloseTo(4.536, 3)
  })
  it('12-UP no tiene tope y un rótulo que no es calibre no tiene rango', () => {
    expect(rangoLbKg('12-UP lb · Premium')).toMatchObject({ loLb: 12, hiLb: null, hiKg: null })
    expect(rangoLbKg('Poco flujo')).toBeNull()
    expect(rangoLbKg(null)).toBeNull()
  })
  it('rótulo mixto «Premium + D»: toma el calibre', () => {
    expect(rangoLbKg('8-10 lb · Premium + D')?.loLb).toBe(8)
  })
})

describe('repartoEnRango: hacia el mínimo, hacia el máximo y sobre el tope', () => {
  const p = (kg: number, cantidad = 1) => ({ kg, cantidad })
  it('mitad inferior = mínimo, mitad superior = máximo, desde el tope = sobre; lo que está bajo el mínimo va al mínimo', () => {
    const r = repartoEnRango([p(3.4), p(3.7), p(4.0, 2), p(4.3), p(4.5), p(4.54), p(5)], 3.63, 4.54)!
    expect(r).toEqual({ haciaMin: 4, haciaMax: 2, sobre: 2 })
    expect(r.haciaMin + r.haciaMax + r.sobre).toBe(8)
  })
  it('sin tope no hay reparto', () => {
    expect(repartoEnRango([p(6)], 5.44, null)).toBeNull()
  })
})

describe('eje de la gate', () => {
  it('cubre el rango y la cola, con margen, en mallas de 50 g', () => {
    const [a, b] = ejeDeGate([{ kg: 3.7 }, { kg: 4.0 }, { kg: 4.9 }], rangoLbKg('8-10 lb'))
    expect(a).toBeLessThanOrEqual(3.53)
    expect(b).toBeGreaterThanOrEqual(5)
    expect(Math.round(a / 0.05) * 0.05).toBeCloseTo(a, 6)
  })
  it('sin piezas usa el rango', () => {
    const [a, b] = ejeDeGate([], rangoLbKg('8-10 lb'))
    expect(a).toBeLessThan(3.63)
    expect(b).toBeGreaterThan(4.54)
  })
})

describe('G8 del 18-11 T1 a las 04:30 (cifras del mockup aprobado)', () => {
  const t = turnoReal('2026-11-18-turno_1')
  const ps = piezasHasta(t, Date.parse('2026-11-19T04:30:00Z'))
  const s = seteoGatesVivo(ps, Date.parse('2026-11-19T04:30:00Z'))!
  const g8 = s.gates[7]!
  const d = detalleGate(ps, 8, g8.programa, g8.desdeTs, Date.parse(s.referenciaTs))

  it('453 piezas en la última hora: 165 hacia el 8, 204 hacia el 10 y 84 sobre el 10; suman el total', () => {
    expect(d.piezas).toBe(453)
    expect(d.reparto).toEqual({ haciaMin: 165, haciaMax: 204, sobre: 84 })
    expect(d.reparto!.haciaMin + d.reparto!.haciaMax + d.reparto!.sobre).toBe(d.piezas - d.sinPeso)
  })
  it('la curva suma las piezas con peso', () => {
    expect(d.curva.reduce((s, c) => s + c.n, 0)).toBe(d.piezas - d.sinPeso)
  })
  it('los minutos van del más reciente al más antiguo y suman el total', () => {
    expect(d.minutos[0]!.hora).toBe('04:29')
    expect(d.minutos[0]!.puntos.map((x) => x.kg)).toEqual([4.34, 4.42, 4.5, 4.39, 3.91, 4.03, 4.44, 3.77])
    const horas = d.minutos.map((m) => m.hora)
    expect([...horas].sort().reverse()).toEqual(horas)
    expect(d.minutos.reduce((s, m) => s + m.piezas, 0)).toBe(d.piezas)
  })
})

describe('casos borde', () => {
  const T0 = Date.parse('2026-11-19T01:00:00.000Z')
  const pz = (seg: number, gate: number, kg: number | null, calibre = '8-10 lb', cantidad = 1): PiezaEspejo => {
    const ts = new Date(T0 + seg * 1000).toISOString()
    return { cadena: `${ts}#${gate}#${seg}`, ts, fecha: ts.slice(0, 10), hora: ts.slice(11, 19), pesoKg: kg, cantidad, lote: 'L', gate, calidad: 'Premium', conservacion: 'FRESCO', calibre: calibre as CalibreRange, producto: 'P', turnoMatrix: '' }
  }
  it('una pieza sin peso cuenta como pieza pero no entra en la curva ni en los puntos', () => {
    const d = detalleGate([pz(0, 8, 4.3), pz(10, 8, null), pz(20, 8, 3.0)], 8, '8-10 lb · Premium', null, T0 + 60_000)
    expect(d.piezas).toBe(3)
    expect(d.sinPeso).toBe(1)
    expect(d.curva.reduce((s, c) => s + c.n, 0)).toBe(2)
    expect(d.minutos[0]!.puntos).toHaveLength(2)
    expect(d.minutos[0]!.piezas).toBe(3)
    // 3,0 kg está bajo el mínimo de 8 lb: va hacia el mínimo.
    expect(d.reparto).toEqual({ haciaMin: 1, haciaMax: 1, sobre: 0 })
  })
  it('una gate 12-UP o sin programa no trae reparto', () => {
    expect(detalleGate([pz(0, 7, 6.0, '12-UP lb')], 7, '12-UP lb · Premium', null, T0 + 60_000).reparto).toBeNull()
    expect(detalleGate([pz(0, 7, 6.0)], 7, null, null, T0 + 60_000).reparto).toBeNull()
  })
  it('solo cuenta la última hora y desde que la gate tiene el programa vigente', () => {
    const ps = [pz(0, 8, 4.0), pz(3600, 8, 4.1), pz(3700, 8, 4.2)]
    const ref = T0 + 3700_000
    expect(detalleGate(ps, 8, '8-10 lb · Premium', null, ref).piezas).toBe(2)
    expect(detalleGate(ps, 8, '8-10 lb · Premium', ps[2]!.ts, ref).piezas).toBe(1)
  })
})

describe('Gate 0 (eje de 0,5 a 6 kg, con el dueño de cada pieza)', () => {
  const T0 = Date.parse('2026-11-19T04:00:00.000Z')
  const g = (min: number, kg: number, dueno: PiezaGate0['dueno'], motivo: string | null = null, cantidad = 1): PiezaGate0 => ({ ts: new Date(T0 + min * 60_000).toISOString(), cantidad, kg, dueno, motivo, calidad: 'Premium' })
  const d = detalleGate0([g(0, 1.6, 'mantencion', 'Fotocélula'), g(5, 4.9, 'seteo', 'Puerta no preparada'), g(6, 5.0, 'seteo'), g(7, 5.1, 'sin-reparto'), g(8, 0, 'sin-reparto')], T0 + 10 * 60_000)
  it('usa el eje fijo y no tiene reparto', () => {
    expect(d.eje).toEqual([0.5, 6])
    expect(d.reparto).toBeNull()
  })
  it('conserva dueño y motivo; la pieza sin peso cuenta aparte', () => {
    expect(d.piezas).toBe(5)
    expect(d.sinPeso).toBe(1)
    const m = d.minutos.find((x) => x.hora === '04:00')!
    expect(m.puntos[0]).toMatchObject({ kg: 1.6, dueno: 'mantencion', motivo: 'Fotocélula' })
    expect(d.minutos.find((x) => x.hora === '04:07')!.puntos[0]!.dueno).toBeNull()
  })
  it('agrupa por calibre de peso: los dos mayores y «otras»; suman las piezas con peso', () => {
    expect(d.porCalibre.reduce((s, c) => s + c.n, 0)).toBe(4)
    expect(d.porCalibre[0]).toEqual({ rotulo: '10-12 lb', n: 3 })
  })
})
