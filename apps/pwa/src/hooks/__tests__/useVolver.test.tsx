// @vitest-environment happy-dom
import { afterEach, describe, expect, it } from 'vitest'
import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import { MemoryRouter, useLocation } from 'react-router-dom'
import { hayHistorialInterno, useVolver } from '../useVolver'

function Prueba() {
  const volver = useVolver('/aprendizaje')
  const { pathname } = useLocation()
  return (
    <>
      <span data-testid="ruta">{pathname}</span>
      <button onClick={volver}>volver</button>
    </>
  )
}

const montar = () =>
  render(
    <MemoryRouter initialEntries={['/aprendizaje/maquina/baader-142', '/aprendizaje/baader-142/tarjeta-a3c']} initialIndex={1}>
      <Prueba />
    </MemoryRouter>,
  )

afterEach(() => {
  cleanup()
  window.history.replaceState(null, '')
})

describe('useVolver', () => {
  it('con historial interno (idx > 0) vuelve a donde se entró, no a la ruta de respaldo', () => {
    window.history.replaceState({ idx: 3 }, '')
    montar()
    fireEvent.click(screen.getByText('volver'))
    expect(screen.getByTestId('ruta').textContent).toBe('/aprendizaje/maquina/baader-142')
  })

  it('sin historial interno (enlace directo, QR, recarga: idx 0) va a la ruta de respaldo', () => {
    window.history.replaceState({ idx: 0 }, '')
    montar()
    fireEvent.click(screen.getByText('volver'))
    expect(screen.getByTestId('ruta').textContent).toBe('/aprendizaje')
  })

  it('no usa history.length: con muchas entradas previas en la pestaña pero idx 0 no hace atrás', () => {
    // Bug del HMI Grader: `history.length > 1` es true aunque la app se abriera en esta entrada.
    for (let i = 0; i < 4; i++) window.history.pushState(null, '')
    window.history.replaceState({ idx: 0 }, '')
    expect(window.history.length).toBeGreaterThan(1)
    expect(hayHistorialInterno()).toBe(false)
    montar()
    fireEvent.click(screen.getByText('volver'))
    expect(screen.getByTestId('ruta').textContent).toBe('/aprendizaje')
  })

  it('sin state en el historial cuenta como entrada inicial', () => {
    window.history.replaceState(null, '')
    expect(hayHistorialInterno()).toBe(false)
  })
})
