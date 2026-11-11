// @vitest-environment happy-dom
import { afterEach, describe, expect, it, vi } from 'vitest'
import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import { FiltrosRepuestosSheet, type FiltrosRepuestosSheetProps } from '../FiltrosRepuestosSheet'

const base = (extra: Partial<FiltrosRepuestosSheetProps> = {}): FiltrosRepuestosSheetProps => ({
  open: true, onClose: vi.fn(),
  clases: [{ value: 'repuesto', label: 'Repuesto', count: 30 }, { value: 'insumo', label: 'Insumo', count: 0 }, { value: 'herramienta', label: 'Herramienta', count: 4 }],
  clase: 'all', onClase: vi.fn(),
  tipos: ['Rodamiento', 'Correa', 'Sello', 'Sensor', 'Resorte', 'Cuchillo'].map((t, i) => ({ value: t, label: t, count: 10 - i })),
  tipo: 'all', onTipo: vi.fn(),
  stocks: [{ value: 'ok', label: 'Disponible', count: 20 }, { value: 'low', label: 'Bajo', count: 0 }, { value: 'out', label: 'Sin stock', count: 3 }],
  stock: 'all', onStock: vi.fn(),
  despieceSinSap: 12, incluirSinSap: false, onIncluirSinSap: vi.fn(),
  listas: [], lista: 'all', onLista: vi.fn(),
  activos: 0, onLimpiar: vi.fn(), total: 41,
  ...extra,
})

afterEach(cleanup)

describe('FiltrosRepuestosSheet', () => {
  it('no ofrece opciones con 0 resultados', () => {
    render(<FiltrosRepuestosSheet {...base()} />)
    expect(screen.queryByText('Insumo')).toBeNull()
    expect(screen.getByText('Herramienta')).toBeTruthy()
    expect(screen.queryByRole('tab', { name: 'Bajo' })).toBeNull()
    expect(screen.getByRole('tab', { name: 'Sin stock' })).toBeTruthy()
  })

  it('el botón dice «Ver N repuestos» con el conteo vivo', () => {
    const { rerender } = render(<FiltrosRepuestosSheet {...base({ total: 41 })} />)
    expect(screen.getByRole('button', { name: 'Ver 41 repuestos' })).toBeTruthy()
    rerender(<FiltrosRepuestosSheet {...base({ total: 1 })} />)
    expect(screen.getByRole('button', { name: 'Ver 1 repuesto' })).toBeTruthy()
  })

  it('Tipo muestra 4 y «Ver los N»', () => {
    render(<FiltrosRepuestosSheet {...base()} />)
    expect(screen.queryByText('Resorte')).toBeNull()
    fireEvent.click(screen.getByRole('button', { name: 'Ver los 6' }))
    expect(screen.getByText('Resorte')).toBeTruthy()
    expect(screen.getByText('Cuchillo')).toBeTruthy()
  })

  it('«Limpiar» solo aparece con filtros activos', () => {
    const { rerender } = render(<FiltrosRepuestosSheet {...base({ activos: 0 })} />)
    expect(screen.queryByRole('button', { name: 'Limpiar' })).toBeNull()
    const onLimpiar = vi.fn()
    rerender(<FiltrosRepuestosSheet {...base({ activos: 2, onLimpiar })} />)
    fireEvent.click(screen.getByRole('button', { name: 'Limpiar' }))
    expect(onLimpiar).toHaveBeenCalled()
  })

  it('el interruptor de despiece sin SAP es el inverso de «solo con SAP»', () => {
    const onIncluirSinSap = vi.fn()
    render(<FiltrosRepuestosSheet {...base({ onIncluirSinSap })} />)
    const sw = screen.getByRole('switch')
    expect(sw.getAttribute('aria-checked')).toBe('false')
    expect(sw.textContent).toContain('(12)')
    fireEvent.click(sw)
    expect(onIncluirSinSap).toHaveBeenCalledWith(true)
  })
})
