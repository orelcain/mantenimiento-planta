import { describe, it, expect, vi, afterEach, beforeEach } from 'vitest'
import { render, screen, cleanup, fireEvent, act } from '@testing-library/react'
import { FotosHoverCard } from '../FotosHoverCard'

const B = 'https://firebasestorage.googleapis.com/v0/b/x/o/repuestos%2Fa%2F1%2F'
const FOTOS = [`${B}fotos%2Fa.webp?alt=media`, `${B}manual%2Fb.jpg?alt=media`, `${B}fotos%2Fc.webp?alt=media`]

function mockMatchMedia(pc: boolean) {
  window.matchMedia = ((q: string) => ({
    matches: q.includes('hover: hover') ? pc : false,
    media: q,
    addEventListener: () => {},
    removeEventListener: () => {},
    addListener: () => {},
    removeListener: () => {},
    onchange: null,
    dispatchEvent: () => false,
  })) as unknown as typeof window.matchMedia
}

function montar(onAbrir = vi.fn()) {
  render(
    <FotosHoverCard fotos={FOTOS} nombre="Rodamiento" onAbrir={onAbrir}>
      <button>mini</button>
    </FotosHoverCard>,
  )
  return onAbrir
}

beforeEach(() => { vi.useFakeTimers(); mockMatchMedia(true) })
afterEach(() => { cleanup(); vi.useRealTimers() })

describe('FotosHoverCard', () => {
  it('no abre antes de 300 ms y abre despues', () => {
    montar()
    fireEvent.mouseEnter(screen.getByText('mini').parentElement!)
    act(() => { vi.advanceTimersByTime(299) })
    expect(screen.queryByRole('dialog')).toBeNull()
    act(() => { vi.advanceTimersByTime(2) })
    expect(screen.getByRole('dialog', { name: 'Fotos de Rodamiento' })).toBeTruthy()
    expect(screen.getByText('1 de 3')).toBeTruthy()
  })

  it('hover en la miniatura 2 cambia la grande', () => {
    montar()
    fireEvent.mouseEnter(screen.getByText('mini').parentElement!)
    act(() => { vi.advanceTimersByTime(310) })
    fireEvent.mouseEnter(screen.getByLabelText('Ver foto 2 de 3'))
    expect(screen.getByText('2 de 3')).toBeTruthy()
    expect(screen.getByText('Manual')).toBeTruthy()
  })

  it('clic en la miniatura 2 llama onAbrir(1)', () => {
    const onAbrir = montar()
    fireEvent.mouseEnter(screen.getByText('mini').parentElement!)
    act(() => { vi.advanceTimersByTime(310) })
    fireEvent.click(screen.getByLabelText('Ver foto 2 de 3'))
    expect(onAbrir).toHaveBeenCalledWith(1)
  })

  it('en tactil no renderiza tarjeta', () => {
    mockMatchMedia(false)
    montar()
    fireEvent.mouseEnter(screen.getByText('mini').parentElement!)
    act(() => { vi.advanceTimersByTime(500) })
    expect(screen.queryByRole('dialog')).toBeNull()
    expect(screen.getByText('mini')).toBeTruthy()
  })
})
