import { describe, expect, it } from 'vitest'
import extra from './__fixtures__/chonchi-2026-11-18-turno_1-extra.json'
import { turnoReal } from './__fixtures__/turnosReales'
import { clasificarP0 } from './motivoP0'
import type { StoredGate0Record } from '../graderGate0Store'
import { elegirFuenteP0, estadoPedidoP0, lectorConP0, parsearFilaP0, registrosP0 } from './espejoP0'

const T = '\t'
/** Fila de Puerta 0 tal como la manda el lector: 11 celdas + #n. */
const fila = (o: Partial<Record<'especie' | 'lote' | 'fecha' | 'hora' | 'turno' | 'gate' | 'cant' | 'cal' | 'peso' | 'error' | 'gr' | 'n', string>> = {}) =>
  [o.especie ?? 'SALAR', o.lote ?? 'L7', o.fecha ?? '2026-11-18', o.hora ?? '22:38:05', o.turno ?? 'A', o.gate ?? '0', o.cant ?? '1', o.cal ?? 'PREMIUM', o.peso ?? '4,32 kg', o.error ?? 'No leído por fotocélula', o.gr ?? '4320', `#${o.n ?? '0'}`].join(T)

describe('parsearFilaP0', () => {
  it('Fecha y Hora en las columnas 2 y 3, peso en kg, error y gramos', () => {
    expect(parsearFilaP0(fila())).toEqual({ ts: '2026-11-18T22:38:05.000Z', pieces: 1, error: 'No leído por fotocélula', weightKg: 4.32, weightPerPieceGrams: 4320, quality: 'PREMIUM', lot: 'L7' })
  })
  it('gramos con punto de miles y peso vacío: kg = g × piezas', () => {
    const r = parsearFilaP0(fila({ peso: '', gr: '4.320', cant: '2' }))
    expect(r?.weightPerPieceGrams).toBe(4320)
    expect(r?.weightKg).toBeCloseTo(8.64, 6)
  })
  it('peso que viene en gramos (> 5000) pasa a kg, como el parser del Excel', () => {
    expect(parsearFilaP0(fila({ peso: '6320' }))?.weightKg).toBeCloseTo(6.32, 6)
  })
  it('fila «Total», vacía o corta → null (no rompe)', () => {
    expect(parsearFilaP0(fila({ fecha: 'Total', hora: '' }))).toBeNull()
    expect(parsearFilaP0('')).toBeNull()
    expect(parsearFilaP0(['a', 'b'].join(T))).toBeNull()
    expect(parsearFilaP0(undefined as unknown as string)).toBeNull()
  })
  it('cadenas repetidas (mismo #n) cuentan una vez; #0 y #1 son dos registros', () => {
    const rs = registrosP0([fila({ n: '0' }), fila({ n: '0' }), fila({ n: '1' }), fila({ hora: '22:00:00' })])
    expect(rs.map((r) => r.ts)).toEqual(['2026-11-18T22:00:00.000Z', '2026-11-18T22:38:05.000Z', '2026-11-18T22:38:05.000Z'])
  })
})

describe('cruce con el espejo usando el texto de la grilla (18-11 Turno 1)', () => {
  const t0 = Date.parse(extra.t0)
  const coma = (kg: number) => kg.toFixed(2).replace('.', ',') + ' kg' // decimal-tecnico: así muestra Matrix el peso
  // El mismo Puerta 0 real del fixture, escrito como lo leería el lector en la grilla de Matrix.
  const vistos = new Map<string, number>()
  const cadenas = extra.puerta0.map(([s, e, g, n]) => {
    const iso = new Date(t0 + s! * 1000).toISOString()
    const base = ['SALAR', 'L1', iso.slice(0, 10), iso.slice(11, 19), 'A', '0', String(n), 'PREMIUM', coma(g! / 1000), extra.errores[e!] ?? '', String(g)].join(T)
    const k = vistos.get(base) ?? 0
    vistos.set(base, k + 1)
    return `${base}${T}#${k}`
  })
  const d = turnoReal('2026-11-18-turno_1')
  const enTurno = d.piezas.filter((p) => p.ts >= extra.t0)

  it('cruza el 100 % y reparte igual que el Excel: Mantención 78, Seteo 114', () => {
    const r = clasificarP0(enTurno, registrosP0(cadenas))
    expect(r.exactitud).toBe('exacto')
    expect(r.mantencion.pz).toBe(78)
    expect(r.seteo.pz).toBe(114)
  })
})

describe('elegirFuenteP0', () => {
  const r = (ts: string): StoredGate0Record => ({ ts, pieces: 1, error: 'x', weightKg: 1 })
  const v = { startMs: Date.parse('2026-11-18T19:00:00Z'), endMs: Date.parse('2026-11-19T07:00:00Z') }
  it('sin registros en ninguna → null (estimado)', () => {
    expect(elegirFuenteP0(null, [], v)).toBeNull()
    expect(elegirFuenteP0([r('2026-11-18T10:00:00.000Z')], null, v)).toBeNull()
  })
  it('una sola fuente: la que trae más registros en la ventana; empate → Excel', () => {
    const ex = [r('2026-11-18T20:00:00.000Z')]
    const es = [r('2026-11-18T20:00:00.000Z'), r('2026-11-18T21:00:00.000Z')]
    expect(elegirFuenteP0(ex, es, v)?.fuente).toBe('espejo')
    expect(elegirFuenteP0(es, ex, v)?.fuente).toBe('excel')
    expect(elegirFuenteP0(ex, ex, v)?.fuente).toBe('excel')
    expect(elegirFuenteP0(null, ex, v)?.registros).toBe(ex)
  })
})

describe('pedido «Actualizar causas P0»', () => {
  const AHORA = Date.parse('2026-11-23T15:00:00Z')
  const P = AHORA - 2 * 60_000
  const iso = new Date(P).toISOString()
  it('versión del lector: desde e1.10', () => {
    expect(lectorConP0('e1.10')).toBe(true)
    expect(lectorConP0('e1.11')).toBe(true)
    expect(lectorConP0('e1.9')).toBe(false)
    expect(lectorConP0(undefined)).toBe(false)
  })
  it('sin soporte, sin pedido, pedido en espera y pedido vencido', () => {
    expect(estadoPedidoP0({ pedidoEnMs: P, ahoraMs: AHORA, version: 'e1.9', p0: null }).modo).toBe('sin-soporte')
    expect(estadoPedidoP0({ pedidoEnMs: null, ahoraMs: AHORA, version: 'e1.10', p0: null }).modo).toBe('normal')
    expect(estadoPedidoP0({ pedidoEnMs: P, ahoraMs: AHORA, version: 'e1.10', p0: { pedido: '' } }).modo).toBe('pedido')
    expect(estadoPedidoP0({ pedidoEnMs: P, ahoraMs: P + 61 * 60_000, version: 'e1.10', p0: null }).modo).toBe('normal')
  })
  it('el lector contesta ESE pedido: atendido, apagado o fallo', () => {
    expect(estadoPedidoP0({ pedidoEnMs: P, ahoraMs: AHORA, version: 'e1.10', p0: { pedido: iso, resultado: 'leido' } }).modo).toBe('atendido')
    expect(estadoPedidoP0({ pedidoEnMs: P, ahoraMs: AHORA, version: 'e1.10', p0: { pedido: iso, resultado: 'apagado' } }).modo).toBe('apagado')
    expect(estadoPedidoP0({ pedidoEnMs: P, ahoraMs: AHORA, version: 'e1.10', p0: { pedido: iso, resultado: 'no-volvio' } }).modo).toBe('fallo')
    // Una respuesta a OTRO pedido no cuenta.
    expect(estadoPedidoP0({ pedidoEnMs: P, ahoraMs: AHORA, version: 'e1.10', p0: { pedido: '2026-11-23T10:00:00.000Z', resultado: 'leido' } }).modo).toBe('pedido')
  })
})
