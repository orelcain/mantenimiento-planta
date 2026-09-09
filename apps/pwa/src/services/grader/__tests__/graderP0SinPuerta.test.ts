import { describe, it, expect } from 'vitest'
import { p0SinPuerta } from '../graderGate0Store'
import type { GateAssignment, CalibreWeightRange } from '../types'

const gate = (n: number, calibre: string, quality: GateAssignment['assignedQuality'], active = true): GateAssignment =>
  ({ gateNumber: n, assignedCalibre: calibre, assignedQuality: quality, active })
const RANGOS: CalibreWeightRange[] = [
  { calibre: '0-2 lb', label: '', minGrams: 0, maxGrams: 916 },
  { calibre: '2-4 lb', label: '', minGrams: 916, maxGrams: 1833 },
  { calibre: '8-10 lb', label: '', minGrams: 3665, maxGrams: 4990 },
]
const rec = (kg: number, ts = '2026-09-08T22:00:00.000Z') => ({ ts, pieces: 1, weightKg: kg })

describe('p0SinPuerta · rechazos por calibre que ninguna puerta tiene', () => {
  const G = [gate(2, '2-4 lb', 'Premium'), gate(8, '8-10 lb', 'Premium')]

  it('37 piezas de 0,34–0,90 kg sin puerta 0-2 lb; las de 2-4 y 8-10 no cuentan', () => {
    const recs = [...Array.from({ length: 37 }, (_, i) => rec(0.34 + (i * 0.56) / 36)), rec(1.2), rec(4.1)]
    expect(p0SinPuerta(recs, G, RANGOS)).toEqual([{ calibre: '0-2 lb', pieces: 37, minG: 340, maxG: 900 }])
  })

  it('una puerta «Other» acepta cualquier calibre; sin gates activas no hay juicio; sin peso se ignora', () => {
    expect(p0SinPuerta([rec(0.5)], [gate(12, 'Other', 'Industrial')], RANGOS)).toEqual([])
    expect(p0SinPuerta([rec(0.5)], [gate(2, '2-4 lb', 'Premium', false)], RANGOS)).toEqual([])
    expect(p0SinPuerta([{ ts: '2026-09-08T22:00:00.000Z', pieces: 1 }], G, RANGOS)).toEqual([])
  })

  it('con línea de tiempo, juzga con las gates vigentes a la hora de cada pieza', () => {
    const timeline = { configAt: (ms: number) => (ms < Date.parse('2026-09-08T23:00:00Z') ? G : [gate(1, '0-2 lb', 'Industrial'), ...G]), changeTimesMs: [] }
    expect(p0SinPuerta([rec(0.5, '2026-09-08T22:30:00.000Z'), rec(0.5, '2026-09-08T23:30:00.000Z')], timeline, RANGOS)).toEqual([{ calibre: '0-2 lb', pieces: 1, minG: 500, maxG: 500 }])
  })
})
