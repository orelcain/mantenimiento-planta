import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { render, screen, waitFor, fireEvent, cleanup } from '@testing-library/react'
import { JackKnifeCard } from '../JackKnifeCard'
import fixture from '@/services/shoplogix/__tests__/fixtures/chonchi-ultimos-120.json'
import type { TurnoCrudo } from '@/services/shoplogix/jackKnife'

vi.mock('@/services/shoplogix/jackKnife', async (orig) => {
  const real = await orig<typeof import('@/services/shoplogix/jackKnife')>()
  return { ...real, cargarTurnosCrudos: vi.fn(async () => fixture.turnos as TurnoCrudo[]) }
})

const esperarGrafico = () => waitFor(() => expect(screen.getByRole('img', { name: 'Eventos contra MTTR por causa' })).toBeTruthy())

describe('JackKnifeCard con el fixture de Chonchi', () => {
  beforeEach(() => {
    window.location.hash = '#jk=pl=chonchi&v=30&vs=imp&cmp=ant'
  })
  afterEach(() => {
    cleanup()
    window.location.hash = ''
  })

  it('abre con los filtros del hash y compara con el período anterior', async () => {
    render(<JackKnifeCard plantSlug="chonchi" />)
    await esperarGrafico()
    expect(screen.getByText(/por turno 24,2 → 14,3 min/)).toBeTruthy()
    expect(screen.getByText(/11 causas mejoraron y 3 empeoraron/)).toBeTruthy()
    expect(screen.getAllByText(/Antes:/).length).toBeGreaterThan(0)
  })

  it('«Sin comparar» quita la comparación de la tesis y del riel', async () => {
    render(<JackKnifeCard plantSlug="chonchi" />)
    await esperarGrafico()
    fireEvent.click(screen.getByText('Sin comparar'))
    expect(screen.queryByText(/por turno 24,2/)).toBeNull()
    expect(screen.queryByText(/Antes:/)).toBeNull()
  })

  it('«Elegir a mano» muestra la segunda pareja de manijas, en color de Antes', async () => {
    render(<JackKnifeCard plantSlug="chonchi" />)
    await esperarGrafico()
    expect(screen.queryByLabelText('Primer turno de Antes')).toBeNull()
    fireEvent.click(screen.getByText('Elegir a mano'))
    expect(screen.getByLabelText('Primer turno de Antes')).toBeTruthy()
    expect(screen.getByLabelText('Último turno de Antes')).toBeTruthy()
  })

  it('«Vs. mes pasado» compara con las mismas fechas de un mes antes', async () => {
    render(<JackKnifeCard plantSlug="chonchi" />)
    await esperarGrafico()
    fireEvent.click(screen.getByText('Vs. mes pasado'))
    expect(screen.getAllByText(/Antes:/).length).toBeGreaterThan(0)
  })

  it('«Generar informe» muestra mejoraron, empeoraron y la prioridad 1', async () => {
    render(<JackKnifeCard plantSlug="chonchi" />)
    await esperarGrafico()
    fireEvent.click(screen.getByText('Generar informe'))
    expect(screen.getByText(/Mejoraron \(11\)/)).toBeTruthy()
    expect(screen.getByText(/Empeoraron o aparecieron \(3\)/)).toBeTruthy()
    expect(screen.getByText(/Prioridad 1 ahora:/)).toBeTruthy()
    expect(screen.getByText('Descargar PDF')).toBeTruthy()
  })

  it('el detalle compara por cada 10 turnos con las flechas de texto', async () => {
    render(<JackKnifeCard plantSlug="chonchi" />)
    await esperarGrafico()
    expect(screen.getAllByText(/Antes → ahora, por cada 10 turnos/).length).toBeGreaterThan(0)
  })

  it('los comentarios muestran el conteo del período y el buscador conserva lo escrito', async () => {
    render(<JackKnifeCard plantSlug="chonchi" />)
    await esperarGrafico()
    const buscador = screen.getByLabelText('Buscar en los comentarios') as HTMLInputElement
    fireEvent.change(buscador, { target: { value: 'sensor' } })
    expect(buscador.value).toBe('sensor')
    expect(screen.getAllByText(/en el período/).length).toBeGreaterThan(0)
  })
})
