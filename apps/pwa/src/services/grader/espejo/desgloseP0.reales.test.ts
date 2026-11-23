/**
 * «Por qué va a P0» (recorrido del 22-11): las sublíneas de cada dueño suman su total, con el motivo exacto de Puerta 0
 * para todas, para algunas o para ninguna pieza. Turno real 18-11 Turno 1; los motivos se reparten por turno.
 */
import { describe, expect, it } from 'vitest'
import type { StoredGate0Record } from '../graderGate0Store'
import { clasificarP0, desgloseP0 } from './motivoP0'
import { turnoReal } from './__fixtures__/turnosReales'

const MOTIVOS = ['Fuera de límites', 'No leído por fotocélula', 'Puerta no preparada', 'Fuera de limites', 'Error nuevo de Matrix']
const piezas = turnoReal('2026-11-18-turno_1').piezas
const g0 = piezas.filter((p) => p.gate === 0)

/** Registros de Puerta 0 para una de cada `cada` piezas de Gate 0 (1 = todas). */
function registros(cada: number): StoredGate0Record[] {
  return g0.filter((_, i) => i % cada === 0).map((p, i) => ({ ts: p.ts, pieces: p.cantidad, weightKg: p.pesoKg ?? 0, error: MOTIVOS[i % MOTIVOS.length]! }))
}

const suma = (xs: Array<{ pz: number }>) => xs.reduce((s, x) => s + x.pz, 0)

describe('desglose de P0 por dueño', () => {
  it.each([
    ['exacto (todas con motivo)', 1],
    ['mixto (una de cada 3)', 3],
    ['estimado (sin Puerta 0)', 0],
  ])('%s: cada dueño suma su total', (_, cada) => {
    const r = clasificarP0(piezas, cada === 0 ? null : registros(cada))
    const d = desgloseP0(r)
    expect(r.mantencion.pz + r.seteo.pz).toBeGreaterThan(0)
    expect(suma(d.mantencion)).toBe(r.mantencion.pz)
    expect(suma(d.seteo)).toBe(r.seteo.pz)
  })

  it('con motivo exacto, fotocélula sale bajo Mantención y puerta bajo Seteo (23-11)', () => {
    const d = desgloseP0(clasificarP0(piezas, registros(1)))
    expect(d.mantencion.map((x) => x.rotulo)).toContain('No leído por fotocélula')
    expect(d.mantencion.map((x) => x.rotulo)).not.toContain('Puerta no preparada')
    expect(d.seteo.map((x) => x.rotulo)).toEqual(expect.arrayContaining(['Fuera de límites', 'Puerta no preparada']))
  })
})
