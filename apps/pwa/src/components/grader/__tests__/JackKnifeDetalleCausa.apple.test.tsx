/**
 * Tarjeta Jack-Knife en la piel Apple: elegir una causa muestra su detalle sin abrir
 * «Ver detalle»; «Cerrar» vuelve a «Atacar ahora»; «Ver los N» abre «Ver detalle».
 * Sin matchMedia en jsdom, useEsPC da false: aquí el detalle sale en la hoja.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { render, screen, waitFor, within, fireEvent, cleanup } from '@testing-library/react'
import { JackKnifeCard } from '../JackKnifeCard'
import type { ResumenJK, TurnoCrudo } from '@/services/shoplogix/jackKnife'

const { DATOS } = vi.hoisted(() => {
  const resumen = (eventos: [string, number, number][], extra: Partial<ResumenJK> = {}): ResumenJK => ({
    v: 1,
    eventos,
    sinImputar: [],
    sinImputarLinea: [],
    comentarios: [],
    conCausaMin: 40,
    sinCausaMin: 10,
    uptimeMin: 480,
    ...extra,
  })
  const DATOS: TurnoCrudo[] = [
    {
      id: '2026-11-01_Turno 1',
      dateKey: '2026-11-01',
      shiftId: 'Turno 1',
      jackKnife: resumen([['Knuro', 1, 20], ['Knuro', 2, 22], ['Correas', 3, 3]], {
        comentarios: [['Knuro', 1, 'Cambié el resorte del carro']],
      }),
    },
    {
      id: '2026-11-02_Turno 2',
      dateKey: '2026-11-02',
      shiftId: 'Turno 2',
      jackKnife: resumen([['Knuro', 4, 18], ['Planta de Riles', 5, 45]]),
    },
  ]
  return { DATOS }
})

// En este entorno matchMedia responde «ancho de PC»: aquí se fuerza el celular (la hoja).
vi.mock('@/hooks/useEsPC', () => ({ useEsPC: () => false }))

vi.mock('@/services/shoplogix/jackKnife', async (orig) => {
  const real = await orig<typeof import('@/services/shoplogix/jackKnife')>()
  return { ...real, cargarTurnosCrudos: vi.fn(async () => DATOS) }
})

describe('JackKnifeCard (piel Apple): detalle de causa', () => {
  beforeEach(() => {
    document.documentElement.setAttribute('data-skin', 'apple')
  })
  afterEach(() => {
    cleanup()
    document.documentElement.removeAttribute('data-skin')
  })

  it('elegir una causa abre el detalle sin abrir «Ver detalle»; «Cerrar» vuelve a «Atacar ahora»; «Ver los N» lo abre', async () => {
    render(<JackKnifeCard plantSlug="chonchi" />)
    const punto = await screen.findByRole('button', { name: /^Knuro:/ })
    const verDetalle = screen.getByText('Ver detalle').closest('details') as HTMLDetailsElement

    fireEvent.click(punto)
    const hoja = await screen.findByRole('dialog')
    expect(within(hoja).getByRole('heading', { level: 2, name: 'Knuro' })).toBeTruthy()
    expect(verDetalle.open).toBe(false)

    fireEvent.click(within(hoja).getByRole('button', { name: 'Cerrar' }))
    await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull())
    expect(screen.getByText('Atacar ahora')).toBeTruthy()
    expect(verDetalle.open).toBe(false)

    fireEvent.click(screen.getByRole('button', { name: /^Knuro:/ }))
    fireEvent.click(within(await screen.findByRole('dialog')).getByRole('button', { name: 'Ver los 1' }))
    await waitFor(() => expect(verDetalle.open).toBe(true))
    expect(screen.queryByRole('dialog')).toBeNull()
  })
})
