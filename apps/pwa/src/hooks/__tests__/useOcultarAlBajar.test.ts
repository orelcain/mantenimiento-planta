/**
 * useOcultarAlBajar: el botón flotante se oculta al bajar, vuelve al subir y vuelve
 * solo cuando el scroll se detiene. Escucha cualquier contenedor, no solo window.
 */
import { describe, it, expect, afterEach, beforeEach, vi } from 'vitest'
import { renderHook, act } from '@testing-library/react'
import { useOcultarAlBajar } from '../useOcultarAlBajar'

function scrollDe(el: HTMLElement, top: number) {
  el.scrollTop = top
  el.dispatchEvent(new Event('scroll'))
}

describe('useOcultarAlBajar', () => {
  let contenedor: HTMLDivElement

  beforeEach(() => {
    vi.useFakeTimers()
    contenedor = document.createElement('div')
    document.body.appendChild(contenedor)
  })
  afterEach(() => {
    vi.useRealTimers()
    contenedor.remove()
  })

  it('empieza visible', () => {
    const { result } = renderHook(() => useOcultarAlBajar())
    expect(result.current).toBe(false)
  })

  it('se oculta al bajar y vuelve al subir', () => {
    const { result } = renderHook(() => useOcultarAlBajar())
    act(() => scrollDe(contenedor, 0))
    act(() => scrollDe(contenedor, 200))
    expect(result.current).toBe(true)
    act(() => scrollDe(contenedor, 120))
    expect(result.current).toBe(false)
  })

  it('vuelve tras ~600 ms sin scroll', () => {
    const { result } = renderHook(() => useOcultarAlBajar())
    act(() => scrollDe(contenedor, 0))
    act(() => scrollDe(contenedor, 300))
    expect(result.current).toBe(true)
    act(() => {
      vi.advanceTimersByTime(600)
    })
    expect(result.current).toBe(false)
  })

  it('un movimiento menor al umbral no lo oculta', () => {
    const { result } = renderHook(() => useOcultarAlBajar())
    act(() => scrollDe(contenedor, 0))
    act(() => scrollDe(contenedor, 3))
    expect(result.current).toBe(false)
  })

  it('reconoce el scroll de un contenedor que no es window', () => {
    // El evento no sube por el árbol: la captura en document es la que lo recibe.
    const otro = document.createElement('section')
    contenedor.appendChild(otro)
    const { result } = renderHook(() => useOcultarAlBajar())
    act(() => scrollDe(otro, 0))
    act(() => scrollDe(otro, 500))
    expect(result.current).toBe(true)
  })

  it('al desmontarse deja de escuchar', () => {
    const { result, unmount } = renderHook(() => useOcultarAlBajar())
    unmount()
    act(() => scrollDe(contenedor, 0))
    act(() => scrollDe(contenedor, 400))
    expect(result.current).toBe(false)
  })
})
