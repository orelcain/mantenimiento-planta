// @vitest-environment happy-dom
import type { ComponentProps } from 'react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import { MemoryRouter, useLocation } from 'react-router-dom'

const estado = vi.hoisted(() => ({ autenticado: true, aria: true }))
const abrirAria = vi.hoisted(() => vi.fn())

vi.mock('@/store', () => ({
  useAuthStore: (sel: (s: { isAuthenticated: boolean }) => unknown) => sel({ isAuthenticated: estado.autenticado }),
  usePermissionsStore: () => ({ canSee: () => estado.aria }),
}))
vi.mock('@/lib/pantallaCompletaMovil', () => ({ abrirAria }))

import { EncabezadoHerramienta } from '../EncabezadoHerramienta'
import { SegmentedControl } from '../SegmentedControl'

function Ruta() {
  return <span data-testid="ruta">{useLocation().pathname}</span>
}

const montar = (props: Partial<ComponentProps<typeof EncabezadoHerramienta>> = {}) =>
  render(
    <MemoryRouter initialEntries={['/aprendizaje/hmi-grader']}>
      <EncabezadoHerramienta etiquetaVolver="Aprendizaje" volverA="/aprendizaje" titulo="HMI Grader" subtitulo="Simulador" {...props} />
      <Ruta />
    </MemoryRouter>,
  )

beforeEach(() => {
  estado.autenticado = true
  estado.aria = true
  abrirAria.mockClear()
  window.history.replaceState({ idx: 0 }, '')
})
afterEach(cleanup)

describe('EncabezadoHerramienta', () => {
  it('muestra título, subtítulo y el control debajo', () => {
    montar({
      control: <SegmentedControl tamano="herramienta" ariaLabel="Vista" value="a" onChange={() => {}} segments={[{ value: 'a', label: 'Uno' }, { value: 'b', label: 'Dos' }]} />,
    })
    expect(screen.getByRole('heading', { name: 'HMI Grader' })).toBeTruthy()
    expect(screen.getByText('Simulador')).toBeTruthy()
    expect(screen.getByRole('tablist', { name: 'Vista' }).className).toContain('h-[48px]')
  })

  it('el chevron vuelve a la ruta de respaldo cuando no hay historial interno', () => {
    montar()
    fireEvent.click(screen.getByRole('button', { name: 'Volver a Aprendizaje' }))
    expect(screen.getByTestId('ruta').textContent).toBe('/aprendizaje')
  })

  it('onVolver reemplaza al historial (vistas internas como la ficha de Variadores)', () => {
    const onVolver = vi.fn()
    montar({ onVolver })
    fireEvent.click(screen.getByRole('button', { name: 'Volver a Aprendizaje' }))
    expect(onVolver).toHaveBeenCalledTimes(1)
    expect(screen.getByTestId('ruta').textContent).toBe('/aprendizaje/hmi-grader')
  })

  it('Preguntar a ARIA abre el chat con el contexto de la herramienta', () => {
    montar({ contextoAria: 'Estoy en el HMI Grader. ' })
    fireEvent.click(screen.getByRole('button', { name: 'Preguntar a ARIA' }))
    expect(abrirAria).toHaveBeenCalledWith('Estoy en el HMI Grader. ')
  })

  it('Más, Ir al inicio: sale de la herramienta aunque no haya barra inferior', () => {
    montar()
    fireEvent.click(screen.getByRole('button', { name: 'Más' }))
    fireEvent.click(screen.getByRole('button', { name: /Ir al inicio/ }))
    expect(screen.getByTestId('ruta').textContent).toBe('/')
  })

  it('Más lista las entradas propias de la herramienta y las ejecuta', () => {
    const alRecargar = vi.fn()
    montar({ itemsMas: [{ key: 'r', label: 'Recargar simulador', icon: <i />, onClick: alRecargar }] })
    fireEvent.click(screen.getByRole('button', { name: 'Más' }))
    fireEvent.click(screen.getByRole('button', { name: /Recargar simulador/ }))
    expect(alRecargar).toHaveBeenCalledTimes(1)
  })

  it('sin sesión no hay ARIA (no hay chat al que abrir) y Más ofrece el Centro de aprendizaje', () => {
    estado.autenticado = false
    montar()
    expect(screen.queryByRole('button', { name: 'Preguntar a ARIA' })).toBeNull()
    fireEvent.click(screen.getByRole('button', { name: 'Más' }))
    fireEvent.click(screen.getByRole('button', { name: /Ir al Centro de aprendizaje/ }))
    expect(screen.getByTestId('ruta').textContent).toBe('/aprendizaje')
  })

  it('sin permiso de ARIA tampoco aparece', () => {
    estado.aria = false
    montar()
    expect(screen.queryByRole('button', { name: 'Preguntar a ARIA' })).toBeNull()
  })

  it('el chevron y las acciones miden 48 px literales', () => {
    montar()
    for (const n of ['Volver a Aprendizaje', 'Preguntar a ARIA', 'Más']) {
      expect(screen.getByRole('button', { name: n }).className).toContain('size-[48px]')
    }
  })
})
