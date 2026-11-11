import { afterEach, describe, expect, it, vi } from 'vitest'
import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import { FilaJackKnifeRapido } from '../JackKnifeRapido'

afterEach(cleanup)

const SUGERENCIA = {
  candidatos: [
    { causa: 'Pernos / Resortes', eventos: 1, minutos: 8 },
    { causa: 'Cintas', eventos: 2, minutos: 5 },
  ],
  sugerida: 'Pernos / Resortes',
  fueraDelGrafico: false,
}

describe('FilaJackKnifeRapido (la fila de la hoja del ACR)', () => {
  it('muestra los candidatos del turno con minutos o detenciones', () => {
    render(<FilaJackKnifeRapido causaActual="Pernos / Resortes" sugerencia={SUGERENCIA} cargando={false} onElegir={vi.fn()} />)
    expect(screen.getByText('En ese turno, Shoplogix registró:')).toBeTruthy()
    expect(screen.getByRole('button', { name: 'Pernos / Resortes, 8 min' }).getAttribute('aria-pressed')).toBe('true')
    expect(screen.getByRole('button', { name: 'Cintas, 2 detenciones' })).toBeTruthy()
  })

  it('un toque en un candidato elige esa causa', () => {
    const onElegir = vi.fn()
    render(<FilaJackKnifeRapido causaActual={undefined} sugerencia={SUGERENCIA} cargando={false} onElegir={onElegir} />)
    fireEvent.click(screen.getByRole('button', { name: 'Cintas, 2 detenciones' }))
    expect(onElegir).toHaveBeenCalledWith('Cintas')
  })

  it('«No aparece» elige null', () => {
    const onElegir = vi.fn()
    render(<FilaJackKnifeRapido causaActual={undefined} sugerencia={SUGERENCIA} cargando={false} onElegir={onElegir} />)
    fireEvent.click(screen.getByRole('button', { name: 'No aparece' }))
    expect(onElegir).toHaveBeenCalledWith(null)
  })

  it('«Otra causa» despliega las causas de mantención y elige la que se toque', () => {
    const onElegir = vi.fn()
    render(<FilaJackKnifeRapido causaActual={undefined} sugerencia={null} cargando={false} onElegir={onElegir} />)
    expect(screen.queryByRole('button', { name: 'Correas' })).toBeNull()
    fireEvent.click(screen.getByRole('button', { name: 'Otra causa' }))
    fireEvent.click(screen.getByRole('button', { name: 'Correas' }))
    expect(onElegir).toHaveBeenCalledWith('Correas')
  })

  it('sin sugerencia quedan solo «Otra causa» y «No aparece»', () => {
    render(<FilaJackKnifeRapido causaActual={undefined} sugerencia={null} cargando={false} onElegir={vi.fn()} />)
    expect(screen.queryByText('En ese turno, Shoplogix registró:')).toBeNull()
    expect(screen.getByRole('button', { name: 'Otra causa' })).toBeTruthy()
    expect(screen.getByRole('button', { name: 'No aparece' })).toBeTruthy()
  })

  it('el pie explica la sugerencia', () => {
    render(<FilaJackKnifeRapido causaActual={undefined} sugerencia={SUGERENCIA} cargando={false} onElegir={vi.fn()} />)
    expect(screen.getByText('Sugerida por el turno y por la palabra del evento. Se cambia con un toque.')).toBeTruthy()
  })
})
