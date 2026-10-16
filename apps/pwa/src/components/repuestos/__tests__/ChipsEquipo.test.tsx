// @vitest-environment happy-dom
import { afterEach, describe, expect, it, vi } from 'vitest'
import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import { ChipsEquipo } from '../ChipsEquipo'

const PLANTA: Record<string, string> = { b1: 'PLANTA CHONCHI', b2: 'PLANTA CHONCHI', b3: 'PLANTA CHONCHI', k1: 'PLANTA CHONCHI', by: 'PLANTA QUELLON' }
const plantaDe = (id: string) => PLANTA[id]
const eq = (machineId: string, machineName: string) => ({ machineId, machineName })
const B1 = eq('b1', 'EVISCERADORA BAADER 142 N1')
const B2 = eq('b2', 'EVISCERADORA BAADER 142 N2')
const B3 = eq('b3', 'EVISCERADORA BAADER 142 N3')
const BY = eq('by', 'EVISCERADORA BAADER 142 N1')
const K1 = eq('k1', 'KNURO N1')

afterEach(cleanup)

describe('ChipsEquipo', () => {
  it('cuenta filas únicas por familia y filtra al tocar', () => {
    const rows = [
      { rowKey: 'a', equipos: [B1, B2, B3] }, // N1+N2+N3 = una pieza
      { rowKey: 'b', equipos: [B1] },
      { rowKey: 'c', equipos: [B2] },
      { rowKey: 'd', equipos: [K1] },
    ]
    const onChange = vi.fn()
    render(<ChipsEquipo rows={rows} plantaDe={plantaDe} faceta={null} onChange={onChange} />)
    expect(screen.getByRole('button', { name: /Todos\s*4/ })).toBeTruthy()
    expect(screen.getByRole('button', { name: /Evisceradora Baader 142\s*3/ })).toBeTruthy()
    expect(screen.getByRole('button', { name: /Knuro\s*1/ })).toBeTruthy()
    fireEvent.click(screen.getByRole('button', { name: /Knuro/ }))
    expect(onChange).toHaveBeenCalledWith({ nivel: 'familia', clave: 'KNURO' })
  })

  it('con una sola familia baja a plantas', () => {
    const rows = [
      { rowKey: 'a', equipos: [B1] }, { rowKey: 'b', equipos: [B2] },
      { rowKey: 'c', equipos: [B3] }, { rowKey: 'd', equipos: [BY] },
    ]
    render(<ChipsEquipo rows={rows} plantaDe={plantaDe} faceta={null} onChange={vi.fn()} />)
    expect(screen.getByRole('button', { name: /Chonchi\s*3/ })).toBeTruthy()
    expect(screen.getByRole('button', { name: /Quellón\s*1/ })).toBeTruthy()
  })

  it('se oculta con 3 filas o menos', () => {
    const rows = [{ rowKey: 'a', equipos: [B1] }, { rowKey: 'b', equipos: [K1] }, { rowKey: 'c', equipos: [K1] }]
    const { container } = render(<ChipsEquipo rows={rows} plantaDe={plantaDe} faceta={null} onChange={vi.fn()} />)
    expect(container.firstChild).toBeNull()
  })

  it('marca activo el chip de la faceta elegida', () => {
    const rows = [
      { rowKey: 'a', equipos: [B1] }, { rowKey: 'b', equipos: [B2] },
      { rowKey: 'c', equipos: [K1] }, { rowKey: 'd', equipos: [K1] },
    ]
    render(<ChipsEquipo rows={rows} plantaDe={plantaDe} faceta={{ nivel: 'familia', clave: 'KNURO' }} onChange={vi.fn()} />)
    expect(screen.getByRole('button', { name: /Knuro/ }).getAttribute('aria-pressed')).toBe('true')
    expect(screen.getByRole('button', { name: /Todos/ }).getAttribute('aria-pressed')).toBe('false')
  })
})
