import { afterEach, describe, expect, it, vi } from 'vitest'
import { cleanup, render, screen } from '@testing-library/react'

const { datosVacios } = vi.hoisted(() => ({ datosVacios: [] as never[] }))

vi.mock('@/services/shoplogix/jackKnife', async (orig) => {
  const real = await orig<typeof import('@/services/shoplogix/jackKnife')>()
  return { ...real, cargarTurnosCrudos: vi.fn(async () => datosVacios) }
})
vi.mock('@/services/acr/acrFirestore', () => ({
  listarAcrsConCache: vi.fn(async () => []),
}))

import { EfectoAccionesCard } from '../EfectoAccionesCard'

afterEach(cleanup)

describe('EfectoAccionesCard', () => {
  it('sin ACR muestra la cobertura en cero y el veredicto en falta de 5 causas', async () => {
    render(<EfectoAccionesCard />)
    expect(await screen.findByText('Efecto de las acciones')).toBeTruthy()
    expect(await screen.findByText(/Falta: 0 de 5 causas medidas/)).toBeTruthy()
    expect(screen.getByText('Sin hacer nada, una causa cae esto')).toBeTruthy()
    expect(screen.getByText('Aún no hay acciones fuertes hechas.')).toBeTruthy()
    expect(screen.getByText('Por causa solo se muestra el antes y el después. El veredicto es del grupo.')).toBeTruthy()
  })
})
