/**
 * «¿Hay que hacer algo?» con el 18-11 Turno 1 real (piezas del espejo con su hueco de 23:39 a 00:28 y la Puerta 0
 * hasta cada momento), en los tres momentos del mockup v4: 21:45, 22:45 y 04:30.
 */
import { describe, expect, it } from 'vitest'
import extra from '@/services/grader/espejo/__fixtures__/chonchi-2026-11-18-turno_1-extra.json'
import { turnoReal } from '@/services/grader/espejo/__fixtures__/turnosReales'
import { clasificarP0 } from '@/services/grader/espejo/motivoP0'
import { loteVivo } from '@/services/grader/espejo/pescaVivo'
import type { StoredGate0Record } from '@/services/grader/graderGate0Store'
import { compararLote, hayQueHacer, rotuloCalibres } from '../hayQueHacerDatos'

const t0 = Date.parse(extra.t0)
const PUERTA0: StoredGate0Record[] = extra.puerta0.map(([s, e, g, n]) => ({
  ts: new Date(t0 + s! * 1000).toISOString(),
  pieces: n!,
  error: extra.errores[e!] ?? '',
  weightKg: g! / 1000,
}))
const HUECO = ['2026-11-18T23:39:26', '2026-11-19T00:28:51'] as const

function momento(hhmm: string, conP0 = true) {
  const d = turnoReal('2026-11-18-turno_1')
  const dia = hhmm >= '12:00' ? '2026-11-18' : '2026-11-19'
  const lim = `${dia}T${hhmm}:00`
  const pz = d.piezas.filter((p) => p.ts >= extra.t0 && p.ts < lim && !(p.ts >= HUECO[0] && p.ts < HUECO[1]))
  const r = clasificarP0(pz, conP0 ? PUERTA0.filter((x) => x.ts < lim) : null)
  return hayQueHacer(r, loteVivo(pz), Date.parse(pz[pz.length - 1]!.ts))
}

describe('¿Hay que hacer algo?, 18-11 T1', () => {
  it('21:45: todo en orden', () => {
    expect(momento('21:45').acciones).toEqual([])
  })

  it('22:45: limpiar fotocélula, con el motivo exacto', () => {
    const a = momento('22:45').acciones
    expect(a.map((x) => x.titulo)).toEqual(['Limpiar fotocélula'])
    expect(a[0]).toMatchObject({ dueno: 'mantencion', estimado: false })
    expect(a[0]!.detalle).toMatch(/^\d+ pz en 15 min · \d+ kg a P0$/)
  })

  it('22:45: 36 pz y 149 kg, como el mockup', () => {
    expect(momento('22:45').acciones[0]!.detalle).toBe('36 pz en 15 min · 149 kg a P0')
  })

  it('04:30: revisar gates por el lote, agregar gate 10-12 Industrial y repartir 10-12 por la puerta', () => {
    const a = momento('04:30').acciones
    expect(a.map((x) => [x.titulo, x.detalle])).toEqual([
      // Calibre por peso (como el mockup, 50 % → 60 %); por etiqueta de Matrix daría 59 % → 74 %.
      ['Revisar gates de 8-10 lb', 'lote …738 distinto: 8-10 lb pasa a 61 % (antes 50 %)'],
      ['Agregar gate 10-12 lb Industrial', '134 kg a P0 (26 pz) en el turno'],
      // El mockup decía «gates 11 y 12» fijo; G11 pasó a 8-10 a las 03:21, así que a las 04:30 solo G12 tiene 10-12.
      ['Repartir 10-12 lb en más gates', '9 pz de puerta no preparada en 15 min (gate 12)'],
    ])
    expect(a.map((x) => x.dueno)).toEqual(['seteo', 'seteo', 'seteo'])
  })

  it('sin Puerta 0 no se pide repartir (la puerta exige el motivo exacto)', () => {
    expect(momento('04:30', false).acciones.some((x) => x.clave === 'puerta')).toBe(false)
  })

  it('el lote 738 es distinto del 737 por +10 puntos en 8-10 lb', () => {
    const d = turnoReal('2026-11-18-turno_1')
    const pz = d.piezas.filter((p) => p.ts >= extra.t0 && p.ts < '2026-11-19T04:30:00')
    expect(compararLote(loteVivo(pz))).toMatchObject({ distinto: true, sube: { calibre: '8-10 lb' } })
  })

  it('rótulos de calibre', () => {
    expect(rotuloCalibres(['8-10 lb', '10-12 lb'])).toBe('8-10 / 10-12 lb')
    expect(rotuloCalibres(['12-UP lb'])).toBe('12+ lb')
    expect(rotuloCalibres([])).toBe('bajo 2 lb')
  })

  it('kg a P0 del turno por dueño a las 04:30 (Mantención solo fotocélula)', () => {
    const h = momento('04:30')
    expect([Math.round(h.kgMantencion), Math.round(h.kgSeteo)]).toEqual([225, 319])
  })
})
