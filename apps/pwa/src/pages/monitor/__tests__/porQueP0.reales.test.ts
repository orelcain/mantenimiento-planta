/**
 * «Por qué va a P0» con el cierre del 18-11 Turno 1 real: piezas del espejo con su hueco de 23:39 a 00:28 y la
 * Puerta 0 completa del turno (sin las piezas de prueba anteriores a las 21:15).
 */
import { describe, expect, it } from 'vitest'
import extra from '@/services/grader/espejo/__fixtures__/chonchi-2026-11-18-turno_1-extra.json'
import { turnoReal } from '@/services/grader/espejo/__fixtures__/turnosReales'
import { clasificarP0 } from '@/services/grader/espejo/motivoP0'
import type { StoredGate0Record } from '@/services/grader/graderGate0Store'
import { arbolP0, detalleMinuto, resumenFila } from '../porQueP0Datos'

const t0 = Date.parse(extra.t0)
const PUERTA0: StoredGate0Record[] = extra.puerta0
  .map(([s, e, g, n]) => ({ ts: new Date(t0 + s! * 1000).toISOString(), pieces: n!, error: extra.errores[e!] ?? '', weightKg: g! / 1000 }))
  .filter((r) => r.ts >= extra.t0)
const HUECO = ['2026-11-18T23:39:26', '2026-11-19T00:28:51'] as const
const PIEZAS = turnoReal('2026-11-18-turno_1').piezas.filter((p) => p.ts >= extra.t0 && !(p.ts >= HUECO[0] && p.ts < HUECO[1]))

const fila = (a: ReturnType<typeof arbolP0>, k: string) => {
  const f = a.filas.find((x) => x.clave === k)!
  return f.piezas === null ? null : f.piezas.reduce((s, x) => s + x.cantidad, 0)
}

describe('Por qué va a P0, cierre 18-11 T1', () => {
  const r = clasificarP0(PIEZAS, PUERTA0)
  const a = arbolP0(r, PUERTA0)

  it('la raíz es la Puerta 0: 192 = fuera de límites 102 + fotocélula 78 + too close 0 + puerta 12', () => {
    expect(a.exacto).toBe(true)
    expect([a.total, fila(a, 'fdl'), fila(a, 'foto'), fila(a, 'tooclose'), fila(a, 'puerta')]).toEqual([192, 102, 78, 0, 12])
  })

  it('los hijos de fuera de límites suman el padre; conservación y producto van sin dato', () => {
    expect(fila(a, 'calibre')! + fila(a, 'calidad')! + fila(a, 'sinexp')!).toBe(fila(a, 'fdl'))
    expect(fila(a, 'consprod')).toBeNull()
  })

  it('hijos: sin gate de calibre 16, de calidad 72, sin explicación 14; 21 en el hueco (171 de 192 cruzadas)', () => {
    // Hallazgo: el mockup decía 17 / 72 / 13. Una pieza que el mockup daba sin gate de calibre (seteo ±30 min) tenía
    // gate según `SeteoInferido` (seteo vigente) y queda sin explicación.
    expect([fila(a, 'calibre'), fila(a, 'calidad'), fila(a, 'sinexp'), a.sinLectura]).toEqual([16, 72, 14, 21])
  })

  it('Mantención 78 y Seteo 114', () => {
    expect([a.mant, a.seteo]).toEqual([78, 114])
  })

  it('las piezas que el espejo no leyó van a la raíz igual, con la gate «sin lectura»', () => {
    expect(a.sinLectura).toBeGreaterThan(0)
    const sinexp = a.filas.find((x) => x.clave === 'sinexp')!
    expect(sinexp.piezas!.some((x) => x.gate === 'sin lectura')).toBe(true)
    expect(sinexp.nota).toBe('sin lectura')
  })

  it('sin Puerta 0 el árbol es estimado y no separa fotocélula de puerta', () => {
    const e = arbolP0(clasificarP0(PIEZAS, null), null)
    expect(e.exacto).toBe(false)
    expect(e.filas[0]!.corto).toBe('Fotocélula o puerta')
    expect(e.mant + e.seteo).toBeLessThanOrEqual(e.total)
  })

  it('la hoja de fotocélula: por gate, por hora y kg', () => {
    const f = resumenFila(a.filas.find((x) => x.clave === 'foto')!.piezas!)
    expect(f.porHora.reduce((s, x) => s + x.n, 0)).toBe(78)
    expect(f.kg).toBeGreaterThan(200)
  })

  it('el minuto 22:40 tiene piezas por gate y P0 de fotocélula exacto', () => {
    const m = detalleMinuto(PIEZAS, r.porPieza, '2026-11-18T22:40')
    expect(m.leidas).toBeGreaterThan(0)
    expect(m.mant.find((x) => x.rotulo === 'No leído por fotocélula')?.n ?? 0).toBeGreaterThan(0)
    expect(m.estimado).toBe(false)
  })
})
