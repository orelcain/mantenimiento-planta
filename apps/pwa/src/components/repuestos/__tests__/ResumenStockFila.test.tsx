// @vitest-environment happy-dom
import { afterEach, describe, expect, it, vi } from 'vitest'
import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import { ResumenStockFila } from '../ResumenStockFila'

afterEach(cleanup)

const base = { total: 12, ok: 9, low: 1, out: 2, comunSinStock: 1, valor: 1_234_567 }

describe('ResumenStockFila', () => {
  it('muestra total, estados y valor compacto', () => {
    render(<ResumenStockFila resumen={base} activo={null} onElegir={() => {}} />)
    expect(screen.getByText('12')).toBeTruthy()
    expect(screen.getByRole('button', { name: /9\s*disponibles/ })).toBeTruthy()
    expect(screen.getByRole('button', { name: /1\s*bajo/ })).toBeTruthy()
    expect(screen.getByRole('button', { name: /2\s*sin stock/ })).toBeTruthy()
    expect(screen.getByText('$1,2 M')).toBeTruthy()
  })

  it('oculta los chips con conteo 0 y el valor 0', () => {
    render(<ResumenStockFila resumen={{ ...base, low: 0, comunSinStock: 0, valor: 0 }} activo={null} onElegir={() => {}} />)
    expect(screen.queryByRole('button', { name: /bajo/ })).toBeNull()
    expect(screen.queryByRole('button', { name: /común/ })).toBeNull()
    expect(screen.queryByText(/valor en bodega/)).toBeNull()
  })

  it('mantiene visible el chip activo aunque quede en 0', () => {
    render(<ResumenStockFila resumen={{ ...base, low: 0 }} activo="low" onElegir={() => {}} />)
    expect(screen.getByRole('button', { name: /0\s*bajo/ }).getAttribute('aria-pressed')).toBe('true')
  })

  it('tocar un chip avisa cuál; el activo figura como presionado', () => {
    const onElegir = vi.fn()
    render(<ResumenStockFila resumen={base} activo="out" onElegir={onElegir} />)
    expect(screen.getByRole('button', { name: /2\s*sin stock/ }).getAttribute('aria-pressed')).toBe('true')
    fireEvent.click(screen.getByRole('button', { name: /9\s*disponibles/ }))
    expect(onElegir).toHaveBeenCalledWith('ok')
    fireEvent.click(screen.getByRole('button', { name: /2\s*sin stock/ }))
    expect(onElegir).toHaveBeenLastCalledWith('out')
  })

  it('común sin stock solo aparece si es > 0 y avisa al tocarlo', () => {
    const onElegir = vi.fn()
    render(<ResumenStockFila resumen={base} activo={null} onElegir={onElegir} />)
    fireEvent.click(screen.getByRole('button', { name: /1\s*común sin stock/ }))
    expect(onElegir).toHaveBeenCalledWith('comunSinStock')
  })
})
