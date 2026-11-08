import { describe, it, expect, vi } from 'vitest'
import { render, screen, waitFor } from '@testing-library/react'
import { JackKnifeCard } from '../JackKnifeCard'
import { marcasLog, dominioLog } from '../jackKnifeLayout'
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
    {
      id: '2026-11-03_Turno 1',
      dateKey: '2026-11-03',
      shiftId: 'Turno 1',
      jackKnife: null,
    },
  ]
  return { DATOS }
})

vi.mock('@/services/shoplogix/jackKnife', async (orig) => {
  const real = await orig<typeof import('@/services/shoplogix/jackKnife')>()
  return { ...real, cargarTurnosCrudos: vi.fn(async () => DATOS) }
})

describe('JackKnifeCard', () => {
  it('muestra la tesis, el aviso de turnos sin resumen y el gráfico con la causa', async () => {
    render(<JackKnifeCard plantSlug="chonchi" />)
    expect(await screen.findByText('Exportar para reunión')).toBeTruthy()
    await waitFor(() => expect(screen.getByRole('img', { name: 'Eventos contra MTTR por causa' })).toBeTruthy())
    expect(screen.getAllByText(/Knuro/).length).toBeGreaterThan(0)
    expect(screen.getByText(/1 turno sin resumen/)).toBeTruthy()
  })

  it('el detalle de la causa muestra su comentario con fecha y turno', async () => {
    render(<JackKnifeCard plantSlug="chonchi" />)
    await screen.findByRole('img', { name: 'Eventos contra MTTR por causa' })
    expect(screen.getAllByText(/Cambié el resorte del carro/).length).toBeGreaterThan(0)
  })
})

describe('utilidades del gráfico', () => {
  it('marcas log 1-2-5 dentro del dominio', () => {
    expect(marcasLog(0.7, 25)).toEqual([1, 2, 5, 10, 20])
  })
  it('dominio log con piso y ancho mínimo de tres veces', () => {
    const [lo, hi] = dominioLog([2, 2], 0.7)
    expect(hi / lo).toBeGreaterThanOrEqual(3)
    expect(lo).toBeGreaterThanOrEqual(0.7)
  })
})
