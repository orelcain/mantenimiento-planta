import { afterEach, describe, expect, it, vi } from 'vitest'
import { cleanup, render, screen, within } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import type { Acr } from '@/services/acr/acr.types'
import { fechaLocal } from '@/services/bitacora/turnoMantencion'
import { listarAcrsConCache } from '@/services/acr/acrFirestore'

vi.mock('@/services/acr/acrFirestore', () => ({
  listarAcrsConCache: vi.fn(),
  guardarAcr: vi.fn(async () => {}),
  leerEventoAcr: vi.fn(async () => null),
}))
vi.mock('../AcrRapidoSheet', () => ({ AcrRapidoSheet: () => null }))

import { HistorialAcr } from '../HistorialAcr'

afterEach(cleanup)

const base = (over: Partial<Acr>): Acr =>
  ({
    id: 'x',
    version: 2,
    plantId: 'chonchi',
    eventoBitacoraIds: ['ev-1'],
    equipo: 'BAADER 200',
    fechaTurno: fechaLocal(new Date()),
    definicion: 'Se cortan resortes alimentación',
    minutosDetencion: 6,
    evidencias: [],
    piezaGuardada: false,
    causas: [],
    acciones: [],
    verificacion: { criterio: 'Sin repetir', dias: 30, resultado: 'pendiente' },
    estado: 'cerrado',
    createdBy: '',
    createdByNombre: '',
    createdAt: new Date(),
    updatedAt: new Date(),
    ...over,
  }) as Acr

const CON_DATOS: Acr[] = [
  base({ id: 'b', equipo: 'EVISCERADORA BAADER 142 N2', estado: 'borrador', definicion: 'Pescado quedó atrapado en expulsador' }),
  base({ id: 'v', equipo: 'BAADER 200', fechaTurno: '2020-01-05', definicion: 'Se cortan resortes alimentación 1 y 2' }),
  base({
    id: 'r',
    equipo: 'EVISCERADORA BAADER 142 N1',
    definicion: 'Se corta resorte ingreso chapaleta',
    causaJK: 'Pernos / Resortes',
    acciones: [{ id: 'a', texto: 'x', fuerza: 'fuerte', causaId: null, responsable: '', fechaLimite: null, estado: 'hecha', hechaEn: '2026-10-02' }],
  }),
]

describe('HistorialAcr', () => {
  it('con análisis muestra los grupos, las filas y las pastillas', async () => {
    vi.mocked(listarAcrsConCache).mockResolvedValue(CON_DATOS)
    render(
      <MemoryRouter>
        <HistorialAcr />
      </MemoryRouter>,
    )
    expect(await screen.findByText('Por cerrar')).toBeTruthy()
    expect(screen.getByText('Verificación vencida')).toBeTruthy()
    expect(screen.getByText('Historial')).toBeTruthy()
    // Equipos, «Borrador» y «Fuerte» también están en los <select>: se busca dentro de cada fila.
    const filaBorrador = screen.getByRole('button', { name: /EVISCERADORA BAADER 142 N2/ })
    expect(within(filaBorrador).getByText('Borrador')).toBeTruthy()
    expect(screen.getByText('Vencida')).toBeTruthy()
    const filaCausa = screen.getByRole('button', { name: /EVISCERADORA BAADER 142 N1/ })
    expect(within(filaCausa).getByText(/Acción fuerte, Pernos \/ Resortes, verifica el/)).toBeTruthy()
  })

  it('sin análisis muestra el vacío con el botón a la Bitácora', async () => {
    vi.mocked(listarAcrsConCache).mockResolvedValue([])
    render(
      <MemoryRouter>
        <HistorialAcr />
      </MemoryRouter>,
    )
    expect(await screen.findByText('Aún no hay análisis')).toBeTruthy()
    expect(screen.getByText('Un análisis parte desde una detención en la Bitácora de turno.')).toBeTruthy()
    expect(screen.getByRole('button', { name: 'Ir a la Bitácora' })).toBeTruthy()
    expect(screen.queryByText('Por cerrar')).toBeNull()
  })
})
