/**
 * El patrón exprés / ampliado del monitor v2.
 *
 * Lo que se protege: (1) la cifra cuenta SOLO cuando el dato cambia de verdad —nunca al montar ni en un refresco
 * con el mismo valor— y con «reducir movimiento» cambia en seco; (2) el botón «Ampliar» abre la capa (PC) o la
 * hoja (celular) y el foco vuelve al botón; (3) Esc cierra; (4) la página queda inerte detrás de la capa.
 * jsdom no trae `matchMedia` ni `Element.animate`: se simulan.
 */
import { act, cleanup, fireEvent, render, renderHook, screen } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { Tarjeta } from '../AmpliarV2'
import { useCuentaCifra } from '../ampliarHooks'

let pc = true
let reducido = false
beforeEach(() => {
  pc = true
  reducido = false
  window.matchMedia = ((q: string) => ({
    matches: q.includes('min-width: 1024px') ? pc : q.includes('prefers-reduced-motion') ? reducido : false,
    media: q,
    addEventListener: () => {},
    removeEventListener: () => {},
    addListener: () => {},
    removeListener: () => {},
    onchange: null,
    dispatchEvent: () => false,
  })) as unknown as typeof window.matchMedia
  /* La animación «termina» al instante: lo que importa es lo que pasa después. */
  Element.prototype.animate = (() => {
    const a = { cancel: () => {}, set onfinish(f: (() => void) | null) { if (f) setTimeout(f, 0) } }
    return a
  }) as unknown as typeof Element.prototype.animate
  const raiz = document.createElement('div')
  raiz.id = 'root'
  document.body.appendChild(raiz)
})
afterEach(() => {
  cleanup()
  vi.useRealTimers()
  document.getElementById('root')?.remove()
  document.documentElement.removeAttribute('data-v2-capa')
})

describe('useCuentaCifra', () => {
  it('al montar muestra el valor tal cual: nunca cuenta desde cero', () => {
    const { result } = renderHook(() => useCuentaCifra(11673))
    expect(result.current).toBe(11673)
  })

  it('un refresco con el MISMO valor no anima', () => {
    const { result, rerender } = renderHook(({ v }) => useCuentaCifra(v), { initialProps: { v: 100 } })
    rerender({ v: 100 })
    expect(result.current).toBe(100)
  })

  it('cuando el dato cambia cuenta del anterior al nuevo en ~600 ms y termina exacto', () => {
    vi.useFakeTimers({ toFake: ['requestAnimationFrame', 'cancelAnimationFrame', 'performance', 'setTimeout', 'clearTimeout'] })
    const { result, rerender } = renderHook(({ v }) => useCuentaCifra(v), { initialProps: { v: 100 } })
    rerender({ v: 200 })
    act(() => { vi.advanceTimersByTime(250) })
    expect(result.current).toBeGreaterThan(100)
    expect(result.current).toBeLessThan(200)
    act(() => { vi.advanceTimersByTime(600) })
    expect(result.current).toBe(200)
  })

  it('con reducir movimiento cambia en seco', () => {
    reducido = true
    const { result, rerender } = renderHook(({ v }) => useCuentaCifra(v), { initialProps: { v: 100 } })
    rerender({ v: 250 })
    expect(result.current).toBe(250)
  })
})

describe('Tarjeta con ampliado', () => {
  const montar = () => render(
    <Tarjeta titulo="Ritmo en vivo" sub="últimos 15 minutos" ampliado={<p>detalle completo</p>}>
      <p>resumen</p>
    </Tarjeta>,
  )

  it('el botón «Ampliar» dice su estado y la tarjeta ya no es un botón entero', () => {
    montar()
    const b = screen.getByRole('button', { name: 'Ampliar Ritmo en vivo' })
    expect(b.getAttribute('aria-expanded')).toBe('false')
    expect(document.querySelector('section[role=button]')).toBeNull()
  })

  it('PC: abre la capa con foco en «Reducir», deja la página inerte y Esc la cierra devolviendo el foco', async () => {
    vi.useFakeTimers()
    montar()
    const b = screen.getByRole('button', { name: 'Ampliar Ritmo en vivo' })
    fireEvent.click(b)
    const dlg = screen.getByRole('dialog')
    expect(dlg.getAttribute('aria-modal')).toBe('true')
    expect(screen.getByText('detalle completo')).toBeTruthy()
    expect(b.getAttribute('aria-expanded')).toBe('true')
    expect(document.activeElement?.getAttribute('aria-label')).toBe('Reducir Ritmo en vivo')
    expect(document.getElementById('root')?.hasAttribute('inert')).toBe(true)
    expect(document.documentElement.hasAttribute('data-v2-capa')).toBe(true)

    fireEvent.keyDown(document, { key: 'Escape' })
    await act(async () => { vi.advanceTimersByTime(50) })
    expect(screen.queryByRole('dialog')).toBeNull()
    expect(b.getAttribute('aria-expanded')).toBe('false')
    expect(document.activeElement).toBe(b)
    expect(document.getElementById('root')?.hasAttribute('inert')).toBe(false)
    expect(document.documentElement.hasAttribute('data-v2-capa')).toBe(false)
  })

  it('PC: «Reducir» y el clic afuera también cierran', async () => {
    vi.useFakeTimers()
    montar()
    fireEvent.click(screen.getByRole('button', { name: 'Ampliar Ritmo en vivo' }))
    fireEvent.click(screen.getByRole('button', { name: 'Reducir Ritmo en vivo' }))
    await act(async () => { vi.advanceTimersByTime(50) })
    expect(screen.queryByRole('dialog')).toBeNull()

    fireEvent.click(screen.getByRole('button', { name: 'Ampliar Ritmo en vivo' }))
    fireEvent.click(document.querySelector('.v2-capa-velo')!)
    await act(async () => { vi.advanceTimersByTime(50) })
    expect(screen.queryByRole('dialog')).toBeNull()
  })

  it('celular: «Ampliar» abre la hoja, con su «Reducir» a mano', () => {
    pc = false
    montar()
    fireEvent.click(screen.getByRole('button', { name: 'Ampliar Ritmo en vivo' }))
    expect(screen.getByRole('dialog')).toBeTruthy()
    expect(screen.getByText('detalle completo')).toBeTruthy()
    expect(screen.getByRole('button', { name: 'Reducir Ritmo en vivo' })).toBeTruthy()
    expect(document.querySelector('.v2-capa')).toBeNull()
  })

  it('sin ampliado, con onAbrir: sigue siendo la tarjeta tocable de siempre (bajar a una fila)', () => {
    const abrir = vi.fn()
    render(<Tarjeta titulo="Al cierre" onAbrir={abrir}><p>x</p></Tarjeta>)
    fireEvent.click(screen.getByRole('button', { name: 'Al cierre: ver detalle' }))
    expect(abrir).toHaveBeenCalledOnce()
    expect(screen.queryByRole('button', { name: /Ampliar/ })).toBeNull()
  })
})
