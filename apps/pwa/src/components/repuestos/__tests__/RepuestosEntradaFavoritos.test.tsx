// @vitest-environment happy-dom
import { afterEach, describe, expect, it, vi } from 'vitest'
import { cleanup, fireEvent, render, screen, within } from '@testing-library/react'
import { RepuestosEntrada, type ListaFavoritos } from '../RepuestosEntrada'

const LISTAS: ListaFavoritos[] = [
  { nombre: 'Equipos Planta Principal', items: [{ id: 'e1', nombre: 'Marel hg' }, { id: 'e2', nombre: 'Grader' }, { id: 'e3', nombre: 'Baader 200' }, { id: 'e4', nombre: 'Knuro N3' }, { id: 'e5', nombre: 'Fishken' }, { id: 'e6', nombre: 'GEA' }] },
  { nombre: 'Cintas', items: [{ id: 'c1', nombre: 'Cinta aceleración 1 grader' }] },
]

function montar(extra: Partial<React.ComponentProps<typeof RepuestosEntrada>> = {}) {
  const props = {
    recientes: [], onAbrirReciente: vi.fn(), onLimpiarRecientes: vi.fn(),
    listasFavoritos: LISTAS, favoritosCargando: false, onAbrirEquipo: vi.fn(),
    areas: [], onAbrirArea: vi.fn(), ...extra,
  }
  render(<RepuestosEntrada {...props} />)
  fireEvent.click(screen.getByText('Ver los 7'))
  return props
}

afterEach(() => { cleanup(); localStorage.clear() })

describe('Hoja de favoritos del celular', () => {
  it('cada lista es una tarjeta plegable con conteo y primeros nombres', () => {
    montar()
    expect(screen.getByText('Marel hg, Grader y 4 más')).toBeTruthy()
    expect(screen.getByLabelText('Buscar en favoritos')).toBeTruthy()
    // sin modo Editar para quien no es admin, y sin una X por fila
    expect(screen.queryByText('Editar')).toBeNull()
    expect(screen.queryByLabelText(/^Quitar /)).toBeNull()
  })

  it('al escribir filtra sin tildes y agrupa por lista; sin resultados ofrece buscar en todo', () => {
    const p = montar({ onBuscarTodo: vi.fn() })
    fireEvent.change(screen.getByLabelText('Buscar en favoritos'), { target: { value: 'aceleracion' } })
    expect(screen.getByText(/1 de 1/)).toBeTruthy()
    expect(within(screen.getByRole('dialog')).queryByText('Marel hg')).toBeNull()
    fireEvent.change(screen.getByLabelText('Buscar en favoritos'), { target: { value: 'zzz' } })
    fireEvent.click(screen.getByText('Buscar «zzz» en todos los repuestos'))
    expect(p.onBuscarTodo).toHaveBeenCalledWith('zzz')
  })

  it('Editar (solo admin) cierra la hoja y abre la edición; ya no hay quitar rápido', () => {
    const onEditarFavoritos = vi.fn()
    montar({ onEditarFavoritos })
    expect(screen.queryByLabelText(/^Quitar /)).toBeNull()
    fireEvent.click(screen.getByText('Editar'))
    expect(onEditarFavoritos).toHaveBeenCalledTimes(1)
    expect(screen.queryByRole('dialog')).toBeNull()
  })
})
