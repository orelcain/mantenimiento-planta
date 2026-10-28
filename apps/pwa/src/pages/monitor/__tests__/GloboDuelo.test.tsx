import { afterEach, describe, expect, it } from 'vitest'
import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import { useGloboDuelo } from '../GloboDuelo'

function Prueba() {
  const { manejadores, globo } = useGloboDuelo()
  return (
    <div {...manejadores} data-testid="raiz">
      <button type="button" data-tip="Ritmo por hora: piezas por minuto" tabIndex={0}>rotulo</button>
      <svg><g data-testid="barra" data-tip="3.ª hora · Cárdenas 38,2 pz/min" tabIndex={0}><rect width="10" height="10" /></g></svg>
      <p data-testid="sin">sin ayuda</p>
      {globo}
    </div>
  )
}

describe('GloboDuelo', () => {
  afterEach(cleanup)
  it('con el mouse muestra el texto del elemento, lo enlaza con aria-describedby y se cierra al salir', () => {
    render(<Prueba />)
    const barra = screen.getByTestId('barra')
    fireEvent.pointerMove(barra.querySelector('rect')!, { pointerType: 'mouse', clientX: 300, clientY: 300 })
    const globo = screen.getByRole('tooltip')
    expect(globo.textContent).toBe('3.ª hora · Cárdenas 38,2 pz/min')
    expect(barra.getAttribute('aria-describedby')).toBe(globo.id)
    fireEvent.pointerMove(screen.getByTestId('sin'), { pointerType: 'mouse', clientX: 10, clientY: 10 })
    expect(screen.queryByRole('tooltip')).toBeNull()
    expect(barra.getAttribute('aria-describedby')).toBeNull()
  })

  it('con un toque abre y un segundo toque fuera cierra; Escape también cierra', () => {
    render(<Prueba />)
    fireEvent.pointerDown(screen.getByText('rotulo'), { pointerType: 'touch', clientX: 50, clientY: 200 })
    expect(screen.getByRole('tooltip').textContent).toContain('piezas por minuto')
    fireEvent.pointerDown(screen.getByTestId('sin'), { pointerType: 'touch', clientX: 5, clientY: 5 })
    expect(screen.queryByRole('tooltip')).toBeNull()
    fireEvent.pointerDown(screen.getByText('rotulo'), { pointerType: 'touch', clientX: 50, clientY: 200 })
    fireEvent.keyDown(screen.getByTestId('raiz'), { key: 'Escape' })
    expect(screen.queryByRole('tooltip')).toBeNull()
  })

  it('el mouse sobre un elemento sin ayuda no abre nada', () => {
    render(<Prueba />)
    fireEvent.pointerMove(screen.getByTestId('sin'), { pointerType: 'mouse', clientX: 10, clientY: 10 })
    expect(screen.queryByRole('tooltip')).toBeNull()
  })
})
