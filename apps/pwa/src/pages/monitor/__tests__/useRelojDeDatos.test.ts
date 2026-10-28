/**
 * El hook del reloj de datos con el reloj falso: la cifra sube en línea recta entre dos lecturas reales,
 * nunca pasa de la última, se queda quieta si la siguiente no llega y salta con «reducir movimiento».
 */
import { act, renderHook } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { useRelojDeDatos } from '../useRelojDeDatos'
import type { Lectura } from '../relojDeDatos'

const MIN = 60_000

function montar(inicial: Lectura | null, semilla?: number[]) {
  return renderHook(({ l, t }: { l: Lectura | null; t?: string }) => useRelojDeDatos(l, semilla, t), { initialProps: { l: inicial, t: undefined } as { l: Lectura | null; t?: string } })
}

describe('useRelojDeDatos', () => {
  beforeEach(() => {
    vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout', 'requestAnimationFrame', 'cancelAnimationFrame', 'performance'] })
    window.matchMedia = ((q: string) => ({
      matches: false, media: q, addEventListener: () => {}, removeEventListener: () => {}, addListener: () => {}, removeListener: () => {}, onchange: null, dispatchEvent: () => false,
    })) as typeof window.matchMedia
  })
  afterEach(() => { vi.useRealTimers() })

  it('sube en línea recta entre dos lecturas y llega a la última sin pasarla', () => {
    const { result, rerender } = montar({ valor: 1000, atMs: 0 })
    expect(result.current.cuadro().valor).toBe(1000)
    act(() => { vi.advanceTimersByTime(MIN) })
    rerender({ l: { valor: 1040, atMs: MIN } })
    expect(result.current.cuadro().valor).toBe(1000)
    act(() => { vi.advanceTimersByTime(MIN / 2) })
    const medio = result.current.cuadro().valor!
    expect(medio).toBeGreaterThan(1015)
    expect(medio).toBeLessThan(1025)
    act(() => { vi.advanceTimersByTime(MIN * 5) })
    expect(result.current.cuadro().valor).toBe(1040)
    expect(result.current.cuadro().atrasada).toBe(true)
  })

  it('avisa a quien dibuja en cada cuadro y los valores nunca bajan ni pasan de la última', () => {
    const { result, rerender } = montar({ valor: 500, atMs: 0 })
    const vistos: number[] = []
    const baja = result.current.alCuadro((c) => { if (c.valor != null) vistos.push(c.valor) })
    rerender({ l: { valor: 540, atMs: MIN } })
    act(() => { vi.advanceTimersByTime(MIN * 2) })
    baja()
    expect(vistos.length).toBeGreaterThan(10)
    for (let i = 1; i < vistos.length; i++) expect(vistos[i]!).toBeGreaterThanOrEqual(vistos[i - 1]!)
    expect(Math.max(...vistos)).toBe(540)
  })

  it('dos lecturas seguidas sin piezas marcan la línea como detenida', () => {
    const { result, rerender } = montar({ valor: 100, atMs: 0 }, [60, 100])
    expect(result.current.detenida).toBe(false)
    rerender({ l: { valor: 100, atMs: MIN } })
    expect(result.current.detenida).toBe(false)
    rerender({ l: { valor: 100, atMs: 2 * MIN } })
    expect(result.current.detenida).toBe(true)
    rerender({ l: { valor: 130, atMs: 3 * MIN } })
    expect(result.current.detenida).toBe(false)
  })

  it('al cambiar de TURNO la cifra salta directo a la primera lectura del turno nuevo (sin contar desde el otro turno)', () => {
    const { result, rerender } = montar({ valor: 8370, atMs: 100 * MIN })
    rerender({ l: { valor: 8370, atMs: 100 * MIN }, t: 'turno-vivo' })
    act(() => { vi.advanceTimersByTime(MIN) })
    /* El usuario pasa con «Anterior» a un turno cerrado: 15.479, de otra hora. Sin la clave del turno era una recta de segundos. */
    rerender({ l: { valor: 15479, atMs: 5 * MIN }, t: 'turno-cerrado' })
    expect(result.current.cuadro().valor).toBe(15479)
    expect(result.current.cuadro().frac).toBe(1)
    expect(result.current.cuadro().previa).toBeNull()
    act(() => { vi.advanceTimersByTime(3_000) })
    expect(result.current.cuadro().valor).toBe(15479)
    /* La recta sigue valiendo para piezas nuevas del MISMO turno. */
    rerender({ l: { valor: 15500, atMs: 6 * MIN }, t: 'turno-cerrado' })
    expect(result.current.cuadro().valor).toBe(15479)
    act(() => { vi.advanceTimersByTime(MIN / 2) })
    const medio = result.current.cuadro().valor!
    expect(medio).toBeGreaterThan(15479)
    expect(medio).toBeLessThan(15500)
  })

  it('sin clave de turno (el Duelo) el reloj se comporta como siempre', () => {
    const { result, rerender } = montar({ valor: 1000, atMs: 0 })
    rerender({ l: { valor: 1040, atMs: MIN } })
    expect(result.current.cuadro().valor).toBe(1000)
    act(() => { vi.advanceTimersByTime(MIN / 2) })
    expect(result.current.cuadro().valor).toBeGreaterThan(1015)
  })

  it('con «reducir movimiento» salta directo a la última lectura', () => {
    window.matchMedia = ((q: string) => ({
      matches: q.includes('reduce'), media: q, addEventListener: () => {}, removeEventListener: () => {}, addListener: () => {}, removeListener: () => {}, onchange: null, dispatchEvent: () => false,
    })) as typeof window.matchMedia
    const { result, rerender } = montar({ valor: 1000, atMs: 0 })
    rerender({ l: { valor: 1040, atMs: MIN } })
    expect(result.current.reducido).toBe(true)
    expect(result.current.cuadro().valor).toBe(1040)
    expect(result.current.cuadro().frac).toBe(1)
  })
})
