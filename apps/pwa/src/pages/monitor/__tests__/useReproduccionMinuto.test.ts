/**
 * El hook de la reproducción con el reloj falso: la cifra sube de a una pieza dentro del minuto, cuadra al cerrarlo,
 * una lectura repetida no la mueve y nunca pasa del contador vivo.
 */
import { act, renderHook } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { armarTope, type EntradaRep } from '../reproduccionMinuto'
import { useReproduccionMinuto } from '../useReproduccionMinuto'

const MIN = 60_000
const DESDE = Date.parse('2026-10-28T00:50:00.000Z')
const PULSO = Date.parse('2026-10-28T03:56:05.000Z')

function entrada(a: number[], b: number[], pulso = PULSO): EntradaRep {
  return {
    desdeMs: DESDE, pulsoAtMs: pulso, paradas: {},
    maquinas: [
      { id: 'A', nombre: 'Evisceradora 1', modelo: 'Baader 142', esperado: 19, cycles: a },
      { id: 'B', nombre: 'Evisceradora 2', modelo: 'Baader 142', esperado: 16, cycles: b },
    ],
  }
}

describe('useReproduccionMinuto', () => {
  beforeEach(() => {
    vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout', 'setInterval', 'clearInterval', 'requestAnimationFrame', 'cancelAnimationFrame', 'performance'] })
    window.matchMedia = ((q: string) => ({
      matches: false, media: q, addEventListener: () => {}, removeEventListener: () => {}, addListener: () => {}, removeListener: () => {}, onchange: null, dispatchEvent: () => false,
    })) as typeof window.matchMedia
  })
  afterEach(() => { vi.useRealTimers() })

  const montar = (e: EntradaRep | null) =>
    renderHook(({ en }: { en: EntradaRep | null }) => useReproduccionMinuto(en, armarTope(1000, null)), { initialProps: { en: e } })

  it('la primera vista cae entera; el minuto nuevo sube de a una pieza y cuadra exacto al cerrar', () => {
    const { result, rerender } = montar(entrada([10, 12], [16, 15]))
    expect(result.current.activa).toBe(true)
    expect(result.current.reloj.cuadro().valor).toBe(53)
    act(() => { vi.advanceTimersByTime(MIN) })
    rerender({ en: entrada([10, 12, 15], [16, 15, 16], PULSO + MIN) })
    expect(result.current.reloj.cuadro().valor).toBe(53)
    const vistos: number[] = []
    const baja = result.current.reloj.alCuadro((c) => { if (c.valor != null) vistos.push(c.valor) })
    act(() => { vi.advanceTimersByTime(MIN + 5000) })
    baja()
    expect(vistos.length).toBeGreaterThan(30)
    for (let i = 1; i < vistos.length; i++) {
      expect(vistos[i]! - vistos[i - 1]!).toBeGreaterThanOrEqual(0)
      expect(vistos[i]! - vistos[i - 1]!).toBeLessThanOrEqual(2)
    }
    expect(result.current.reloj.cuadro().valor).toBe(53 + 15 + 16)
    expect(result.current.minuto?.maquinas.map((m) => m.n)).toEqual([15, 16])
  })

  it('una lectura repetida (mismo minuto cerrado) no cambia la versión ni el valor', () => {
    const { result, rerender } = montar(entrada([10, 12], [16, 15]))
    const v = result.current.reloj.version
    rerender({ en: entrada([10, 12], [16, 15], PULSO + MIN) })
    expect(result.current.reloj.version).toBe(v)
    expect(result.current.reloj.cuadro().valor).toBe(53)
  })

  it('sin entrada no está activa y no hay valor', () => {
    const { result } = montar(null)
    expect(result.current.activa).toBe(false)
    expect(result.current.reloj.cuadro().valor).toBeNull()
  })

  it('si la lectura se atrasa, queda quieta en el total cerrado y avisa', () => {
    const { result, rerender } = montar(entrada([10, 12], [16, 15]))
    rerender({ en: entrada([10, 12, 15], [16, 15, 16], PULSO + MIN) })
    act(() => { vi.advanceTimersByTime(MIN * 5) })
    const c = result.current.reloj.cuadro()
    expect(c.valor).toBe(84)
    expect(c.atrasada).toBe(true)
  })
})
