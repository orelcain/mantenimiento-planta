// @vitest-environment happy-dom
import { useState } from 'react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import { SegmentedControl } from '../SegmentedControl'

const SEGMENTOS = [
  { value: 'a', label: 'Plano' },
  { value: 'b', label: 'Placa' },
  { value: 'c', label: 'Corte' },
] as const

function Montado({ inicial = 'a', onCambio }: { inicial?: string; onCambio?: (v: string) => void }) {
  const [v, setV] = useState(inicial)
  return (
    <SegmentedControl
      ariaLabel="Vista de prueba"
      value={v}
      onChange={x => { setV(x); onCambio?.(x) }}
      segments={SEGMENTOS}
    />
  )
}

const tab = (n: string) => screen.getByRole('tab', { name: n })

afterEach(cleanup)

describe('SegmentedControl · teclado (APG Tabs)', () => {
  it('solo el segmento elegido es tabulable', () => {
    render(<Montado inicial="b" />)
    expect(tab('Plano').getAttribute('tabindex')).toBe('-1')
    expect(tab('Placa').getAttribute('tabindex')).toBe('0')
    expect(tab('Corte').getAttribute('tabindex')).toBe('-1')
  })

  it('si ningún valor coincide, el primero es el tabulable', () => {
    render(<Montado inicial="zzz" />)
    expect(tab('Plano').getAttribute('tabindex')).toBe('0')
    expect(tab('Placa').getAttribute('tabindex')).toBe('-1')
  })

  it('flecha derecha cambia al vecino, mueve el foco y el tabindex acompaña', () => {
    const onCambio = vi.fn()
    render(<Montado onCambio={onCambio} />)
    tab('Plano').focus()
    fireEvent.keyDown(tab('Plano'), { key: 'ArrowRight' })
    expect(onCambio).toHaveBeenCalledWith('b')
    expect(tab('Placa').getAttribute('aria-selected')).toBe('true')
    expect(document.activeElement).toBe(tab('Placa'))
    expect(tab('Placa').getAttribute('tabindex')).toBe('0')
    expect(tab('Plano').getAttribute('tabindex')).toBe('-1')
  })

  it('flecha izquierda retrocede', () => {
    render(<Montado inicial="c" />)
    fireEvent.keyDown(tab('Corte'), { key: 'ArrowLeft' })
    expect(tab('Placa').getAttribute('aria-selected')).toBe('true')
    expect(document.activeElement).toBe(tab('Placa'))
  })

  it('da la vuelta circular en ambos extremos', () => {
    render(<Montado inicial="c" />)
    fireEvent.keyDown(tab('Corte'), { key: 'ArrowRight' })
    expect(tab('Plano').getAttribute('aria-selected')).toBe('true')
    expect(document.activeElement).toBe(tab('Plano'))
    fireEvent.keyDown(tab('Plano'), { key: 'ArrowLeft' })
    expect(tab('Corte').getAttribute('aria-selected')).toBe('true')
    expect(document.activeElement).toBe(tab('Corte'))
  })

  it('Inicio y Fin van al primero y al último', () => {
    render(<Montado inicial="b" />)
    fireEvent.keyDown(tab('Placa'), { key: 'End' })
    expect(tab('Corte').getAttribute('aria-selected')).toBe('true')
    expect(document.activeElement).toBe(tab('Corte'))
    fireEvent.keyDown(tab('Corte'), { key: 'Home' })
    expect(tab('Plano').getAttribute('aria-selected')).toBe('true')
    expect(document.activeElement).toBe(tab('Plano'))
  })

  it('el clic sigue funcionando', () => {
    const onCambio = vi.fn()
    render(<Montado onCambio={onCambio} />)
    fireEvent.click(tab('Corte'))
    expect(onCambio).toHaveBeenCalledWith('c')
    expect(tab('Corte').getAttribute('aria-selected')).toBe('true')
    expect(tab('Corte').getAttribute('tabindex')).toBe('0')
  })

  it('con Ctrl, Alt o Meta no hace nada', () => {
    const onCambio = vi.fn()
    render(<Montado onCambio={onCambio} />)
    for (const mod of [{ ctrlKey: true }, { altKey: true }, { metaKey: true }]) {
      fireEvent.keyDown(tab('Plano'), { key: 'ArrowRight', ...mod })
      fireEvent.keyDown(tab('Plano'), { key: 'End', ...mod })
    }
    expect(onCambio).not.toHaveBeenCalled()
    expect(tab('Plano').getAttribute('aria-selected')).toBe('true')
  })

  it('otras teclas no cambian nada ni se capturan', () => {
    const onCambio = vi.fn()
    render(<Montado onCambio={onCambio} />)
    const permitido = fireEvent.keyDown(tab('Plano'), { key: 'ArrowDown' })
    expect(permitido).toBe(true)
    expect(onCambio).not.toHaveBeenCalled()
  })
})
