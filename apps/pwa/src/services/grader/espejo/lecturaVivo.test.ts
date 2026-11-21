import { describe, expect, it } from 'vitest'
import { estadoVivo, hastaPedido, hastaValido, lectorConVivo } from './lecturaVivo'

const AHORA = Date.UTC(2026, 10, 21, 17, 0, 0)
const MIN = 60_000

describe('lectura en vivo · hasta', () => {
  it('el botón pide ahora + 15 min, y nunca más de 30', () => {
    expect(hastaPedido(AHORA)).toBe(AHORA + 15 * MIN)
    expect(hastaPedido(AHORA, 90)).toBe(AHORA + 30 * MIN)
    expect(hastaPedido(AHORA, 0)).toBe(AHORA + MIN)
  })
  it('vale entre ahora (volver a 5 min) y ahora + 30 min', () => {
    expect(hastaValido(AHORA, AHORA)).toBe(true)
    expect(hastaValido(AHORA + 15 * MIN, AHORA)).toBe(true)
    expect(hastaValido(AHORA + 30 * MIN, AHORA)).toBe(true)
    expect(hastaValido(AHORA + 30 * MIN + 1, AHORA)).toBe(false)
    expect(hastaValido(AHORA - 1, AHORA)).toBe(false)
    expect(hastaValido(Number.NaN, AHORA)).toBe(false)
  })
})

describe('lectura en vivo · versión del lector', () => {
  it('e1.4 en adelante lo entiende; e1.3 y sin versión, no', () => {
    expect(lectorConVivo('e1.4')).toBe(true)
    expect(lectorConVivo('e1.4.1')).toBe(true)
    expect(lectorConVivo('e1.10')).toBe(true)
    expect(lectorConVivo('e2')).toBe(true)
    expect(lectorConVivo('e1.3')).toBe(false)
    expect(lectorConVivo('e1.3.9')).toBe(false)
    expect(lectorConVivo(undefined)).toBe(false)
    expect(lectorConVivo('x1.4')).toBe(false)
  })
})

describe('lectura en vivo · pastilla', () => {
  const base = { ahoraMs: AHORA, version: 'e1.4', latidoVivo: '' }
  it('sin pedido o vencido → cada 5 min', () => {
    expect(estadoVivo({ ...base, hastaMs: null }).modo).toBe('normal')
    expect(estadoVivo({ ...base, hastaMs: AHORA }).modo).toBe('normal')
    expect(estadoVivo({ ...base, hastaMs: AHORA - MIN, latidoVivo: '2026-11-21T14:05:00-03:00' }).modo).toBe('normal')
  })
  it('pedido que el lector aún no tomó → «pedido»; confirmado en el latido → «vivo»', () => {
    expect(estadoVivo({ ...base, hastaMs: AHORA + 10 * MIN })).toEqual({ modo: 'pedido', hastaMs: AHORA + 10 * MIN })
    expect(estadoVivo({ ...base, hastaMs: AHORA + 10 * MIN, latidoVivo: '2026-11-21T14:10:00-03:00' }).modo).toBe('vivo')
  })
  it('lector anterior a e1.4 → no lo toma nunca', () => {
    expect(estadoVivo({ ...base, version: 'e1.3', hastaMs: AHORA + 10 * MIN }).modo).toBe('sin-soporte')
  })
})
