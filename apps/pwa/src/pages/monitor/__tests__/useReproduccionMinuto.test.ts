/**
 * El hook de la cola de reproducción con el reloj falso: la cifra sube de a una pieza, cuadra al cerrar cada minuto, una
 * lectura repetida no la mueve, nunca pasa del contador vivo, el conteo sigue con «reducir movimiento» y el estado del reloj
 * (vivo / poniéndose / atrasado / detenida) sale con atraso, factor y última lectura.
 */
import { act, renderHook } from '@testing-library/react'
import { StrictMode } from 'react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { armarTope, type EntradaRep } from '../reproduccionMinuto'
import { useReproduccionMinuto } from '../useReproduccionMinuto'

const MIN = 60_000
const DESDE = Date.parse('2026-10-28T00:50:00.000Z')
const PULSO = Date.parse('2026-10-28T03:56:05.000Z')

const BASES = [12, 14]
/** `n` minutos de 2 Baader (12–20 pz por minuto), determinista. */
const serie = (n: number) => BASES.map((b, k) => Array.from({ length: n }, (_, i) => b + ((i * 7 + k * 3) % 5)))
const acum = (n: number) => serie(n).reduce((a, c) => a + c.reduce((x, y) => x + y, 0), 0)

function entrada(n: number, pulso = PULSO, cero: number | null = null): EntradaRep {
  const [a, b] = serie(n).map((c) => c.map((v, i) => (i === cero ? 0 : v)))
  return {
    desdeMs: DESDE, pulsoAtMs: pulso, paradas: {},
    maquinas: [
      { id: 'A', nombre: 'Evisceradora 1', modelo: 'Baader 142', esperado: 19, cycles: a! },
      { id: 'B', nombre: 'Evisceradora 2', modelo: 'Baader 142', esperado: 16, cycles: b! },
    ],
  }
}

function mockMatchMedia(reducir: boolean) {
  window.matchMedia = ((q: string) => ({
    matches: reducir && q.includes('reduce'), media: q, addEventListener: () => {}, removeEventListener: () => {}, addListener: () => {}, removeListener: () => {}, onchange: null, dispatchEvent: () => false,
  })) as typeof window.matchMedia
}

describe('useReproduccionMinuto', () => {
  beforeEach(() => {
    vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout', 'setInterval', 'clearInterval', 'requestAnimationFrame', 'cancelAnimationFrame', 'performance'] })
    mockMatchMedia(false)
  })
  afterEach(() => { vi.useRealTimers() })

  const montar = (e: EntradaRep | null, tope = armarTope(100000, null)) =>
    renderHook(({ en }: { en: EntradaRep | null }) => useReproduccionMinuto(en, tope), { initialProps: { en: e } })

  it('arranca con 2 minutos en cola; sube de a una pieza por Baader, nunca salta ni baja, y cuadra exacto al vaciar la cola', () => {
    const { result } = montar(entrada(6))
    expect(result.current.activa).toBe(true)
    expect(result.current.reloj.cuadro().valor).toBe(acum(4))
    const vistos: number[] = []
    const baader: number[][] = []
    const baja = result.current.reloj.alCuadro((c) => {
      if (c.valor == null) return
      vistos.push(c.valor)
      baader.push((c.rep?.porMaquina ?? []).map((m) => m.valor))
      expect(c.valor).toBe(c.rep!.porMaquina.reduce((a, m) => a + m.valor, 0))
    })
    act(() => { vi.advanceTimersByTime(2 * MIN + 2000) })
    baja()
    expect(vistos.length).toBeGreaterThan(100)
    for (let i = 1; i < vistos.length; i++) {
      expect(vistos[i]! - vistos[i - 1]!).toBeGreaterThanOrEqual(0)
      expect(vistos[i]! - vistos[i - 1]!).toBeLessThanOrEqual(2)
      baader[i]!.forEach((v, k) => { expect(v - baader[i - 1]![k]!).toBeLessThanOrEqual(1) })
    }
    expect(result.current.reloj.cuadro().valor).toBe(acum(6))
    expect(result.current.minuto?.maquinas.map((m) => m.n)).toEqual([serie(6)[0]![5], serie(6)[1]![5]])
  })

  it('un minuto nuevo entra a la cola y se reproduce en orden: el reloj no salta aunque lleguen dos de golpe', () => {
    const { result, rerender } = montar(entrada(6))
    act(() => { vi.advanceTimersByTime(MIN) })
    const antes = result.current.reloj.cuadro().valor!
    rerender({ en: entrada(8, PULSO + MIN) })
    expect(result.current.reloj.cuadro().valor).toBe(antes)
    const vistos: number[] = []
    const baja = result.current.reloj.alCuadro((c) => { if (c.valor != null) vistos.push(c.valor) })
    act(() => { vi.advanceTimersByTime(4 * MIN) })
    baja()
    for (let i = 1; i < vistos.length; i++) expect(vistos[i]! - vistos[i - 1]!).toBeLessThanOrEqual(2)
    expect(result.current.reloj.cuadro().valor).toBe(acum(8))
  })

  it('React se entera una vez por minuto que corre, no por cuadro', () => {
    const { result } = montar(entrada(8))
    const v0 = result.current.reloj.version
    act(() => { vi.advanceTimersByTime(2 * MIN - 1000) })
    const v1 = result.current.reloj.version
    expect(v1 - v0).toBeGreaterThanOrEqual(1)
    expect(v1 - v0).toBeLessThanOrEqual(2)
  })

  it('una lectura repetida (mismo minuto cerrado) no cambia la versión ni el valor', () => {
    const { result, rerender } = montar(entrada(4))
    const v = result.current.reloj.version
    const valor = result.current.reloj.cuadro().valor
    rerender({ en: entrada(4, PULSO + MIN) })
    expect(result.current.reloj.version).toBe(v)
    expect(result.current.reloj.cuadro().valor).toBe(valor)
  })

  it('sin entrada no está activa y no hay valor', () => {
    const { result } = montar(null)
    expect(result.current.activa).toBe(false)
    expect(result.current.reloj.cuadro().valor).toBeNull()
  })

  it('con la cola vacía el reloj queda congelado y, pasado un pulso, el estado es «atrasado» (sin que llegue nada nuevo)', () => {
    const { result } = montar(entrada(4))
    const estados: string[] = []
    const baja = result.current.reloj.alCuadro((c) => { if (c.rep) estados.push(c.rep.estado) })
    act(() => { vi.advanceTimersByTime(2 * MIN + 30_000) })
    expect(result.current.reloj.cuadro().rep?.estado).toBe('vivo')
    expect(result.current.reloj.cuadro().atrasada).toBe(false)
    act(() => { vi.advanceTimersByTime(35_000) })
    baja()
    const c = result.current.reloj.cuadro()
    expect(c.valor).toBe(acum(4))
    expect(c.atrasada).toBe(true)
    expect(c.rep).toMatchObject({ estado: 'atrasado', atrasoS: 0, factor: 1, ultimaLecturaHHMM: '00:56', animando: false })
    expect(estados).toContain('atrasado')
  })

  it('«poniéndose al día»: con 3 minutos de golpe expone el atraso en s y un factor mayor que 1', () => {
    const { result, rerender } = montar(entrada(6))
    act(() => { vi.advanceTimersByTime(MIN) })
    rerender({ en: entrada(9, PULSO + MIN) })
    const c = result.current.reloj.cuadro().rep!
    expect(c.estado).toBe('poniendose')
    expect(c.atrasoS).toBeCloseTo(60 + 180, 0)
    expect(c.factor).toBeGreaterThanOrEqual(1.12)
  })

  it('un minuto con 0 piezas: estado «detenida» mientras corre y el valor no sube', () => {
    const { result } = montar(entrada(6, PULSO, 5))
    act(() => { vi.advanceTimersByTime(MIN + 30_000) })
    const c = result.current.reloj.cuadro()
    expect(c.rep).toMatchObject({ estado: 'detenida', minutoIdx: 5 })
    const v = c.valor
    act(() => { vi.advanceTimersByTime(10_000) })
    expect(result.current.reloj.cuadro().valor).toBe(v)
  })

  it('el contador vivo es el techo: la cifra jamás lo pasa y las Baader siguen sumando la línea', () => {
    const { result } = montar(entrada(6), armarTope(acum(5), null))
    const baja = result.current.reloj.alCuadro((c) => {
      expect(c.valor!).toBeLessThanOrEqual(acum(5))
      expect(c.valor).toBe(c.rep!.porMaquina.reduce((a, m) => a + m.valor, 0))
    })
    act(() => { vi.advanceTimersByTime(3 * MIN) })
    baja()
    expect(result.current.reloj.cuadro().valor).toBe(acum(5))
  })

  it('con «reducir movimiento» el conteo SIGUE pieza a pieza (es dato): no cae entero', () => {
    mockMatchMedia(true)
    const { result } = montar(entrada(6))
    expect(result.current.reloj.reducido).toBe(true)
    const vistos: number[] = []
    const baja = result.current.reloj.alCuadro((c) => { if (c.valor != null) vistos.push(c.valor) })
    act(() => { vi.advanceTimersByTime(MIN + 2000) })
    baja()
    /* 30 piezas en el minuto 4 (las dos Baader coinciden en el instante: el total sube de a 2) */
    expect(new Set(vistos).size).toBeGreaterThan(12)
    for (let i = 1; i < vistos.length; i++) expect(vistos[i]! - vistos[i - 1]!).toBeLessThanOrEqual(2)
    expect(result.current.reloj.cuadro().valor).toBeGreaterThan(acum(4))
  })

  it('el cuadro lleva lo que la UI necesita: estado, atraso, factor, última lectura y, por Baader, cadencia y progreso', () => {
    const { result } = montar(entrada(8))
    act(() => { vi.advanceTimersByTime(MIN + 15_000) })
    const c = result.current.reloj.cuadro().rep!
    expect(c).toMatchObject({ estado: 'vivo', factor: 1, ultimaLecturaHHMM: '00:56' })
    expect(c.atrasoS).toBeCloseTo(45, 0)
    c.porMaquina.forEach((m, k) => {
      expect(m.cadenciaS).toBeCloseTo(60 / serie(8)[k]![c.minutoIdx - 1]!, 10)
      expect(m.progreso).toBeCloseTo(c.frac, 10)
    })
  })

  it('en React StrictMode (monta, desmonta y vuelve a montar) el reloj sigue corriendo: la cifra no queda congelada hasta el minuto siguiente', () => {
    const { result } = renderHook(({ en }: { en: EntradaRep | null }) => useReproduccionMinuto(en, armarTope(100000, null)), {
      initialProps: { en: entrada(6) as EntradaRep | null },
      wrapper: StrictMode,
    })
    const antes = result.current.reloj.cuadro().valor!
    const vistos: number[] = []
    const baja = result.current.reloj.alCuadro((c) => { if (c.valor != null) vistos.push(c.valor) })
    act(() => { vi.advanceTimersByTime(20_000) })
    baja()
    /* Con el rAF muerto no hay cuadros: `alCuadro` solo entrega el cuadro inicial y el valor no se mueve hasta un minuto nuevo. */
    expect(vistos.length).toBeGreaterThan(10)
    expect(result.current.reloj.cuadro().valor!).toBeGreaterThan(antes)
  })
})
