/**
 * Dueño del P0 con la Puerta 0 REAL del 18-11 Turno 1 (el turno del mockup v4): 192 piezas = 102 fuera de límites
 * + 78 fotocélula + 12 puerta no preparada. Con la puerta en Seteo (decisión 23-11): Mantención 78, Seteo 114.
 */
import { describe, expect, it } from 'vitest'
import extra from './__fixtures__/chonchi-2026-11-18-turno_1-extra.json'
import { turnoReal } from './__fixtures__/turnosReales'
import { clasificarP0, desgloseP0, rafagaFotocelula } from './motivoP0'
import type { StoredGate0Record } from '../graderGate0Store'

const t0 = Date.parse(extra.t0)
const PUERTA0: StoredGate0Record[] = extra.puerta0.map(([s, e, g, n]) => ({
  ts: new Date(t0 + s! * 1000).toISOString(),
  pieces: n!,
  error: extra.errores[e!] ?? '',
  weightKg: g! / 1000,
}))

describe('motivo P0 exacto, 18-11 Turno 1', () => {
  const d = turnoReal('2026-11-18-turno_1')
  // El Excel trae 13 piezas de Gate 0 de prueba antes del turno (19:43 y 20:09): el monitor solo mira desde las 21:15.
  const enTurno = d.piezas.filter((p) => p.ts >= extra.t0)
  const r = clasificarP0(enTurno, PUERTA0)

  it('la Puerta 0 del fixture suma 192 = 102 + 78 + 12', () => {
    const c: Record<string, number> = {}
    for (const x of PUERTA0) c[x.error] = (c[x.error] ?? 0) + x.pieces
    expect(c).toEqual({ 'Fuera de límites': 102, 'No leído por fotocélula': 78, 'Puerta no preparada': 12 })
  })

  it('Mantención 78 (solo fotocélula) y Seteo 114 (fuera de límites + puerta)', () => {
    expect(r.exactitud).toBe('exacto')
    expect(r.mantencion.pz).toBe(78)
    expect(r.seteo.pz).toBe(114)
    const de = desgloseP0(r)
    expect(de.mantencion).toEqual([{ rotulo: 'No leído por fotocélula', pz: 78 }])
    expect(de.seteo).toEqual([{ rotulo: 'Fuera de límites', pz: 102 }, { rotulo: 'Puerta no preparada', pz: 12 }])
  })

  it('la ráfaga de fotocélula ya no cuenta piezas de puerta', () => {
    const f = rafagaFotocelula(r.porPieza)
    expect(f).not.toBeNull()
    const enVentana = r.porPieza.filter((p) => Date.parse(p.ts) >= f!.desdeMs && Date.parse(p.ts) <= f!.hastaMs && p.motivo === 'Puerta no preparada')
    expect(f!.pz).toBe(r.porPieza.filter((p) => p.dueno === 'mantencion' && Date.parse(p.ts) >= f!.desdeMs && Date.parse(p.ts) <= f!.hastaMs).reduce((s, p) => s + p.cantidad, 0))
    expect(enVentana.every((p) => p.dueno === 'seteo')).toBe(true)
  })
})
