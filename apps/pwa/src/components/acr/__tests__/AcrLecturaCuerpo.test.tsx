import { afterEach, describe, expect, it, vi } from 'vitest'
import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import type { Acr } from '@/services/acr/acr.types'
import { fechaLocal } from '@/services/bitacora/turnoMantencion'
import { AcrLecturaCuerpo } from '../AcrLectura'
import { useUbicacionJK, type UbicacionJK } from '../useUbicacionJK'

vi.mock('../useUbicacionJK', () => ({ useUbicacionJK: vi.fn() }))

afterEach(cleanup)

const ACR = {
  id: 'acr-1',
  version: 2,
  plantId: 'chonchi',
  eventoBitacoraIds: ['ev-1'],
  equipo: 'EVISCERADORA BAADER 142 N1',
  fechaTurno: '2026-09-24',
  definicion: 'Se corta resorte ingreso chapaleta',
  minutosDetencion: 7,
  evidencias: [],
  piezaGuardada: false,
  causas: [],
  acciones: [
    { id: 'a1', texto: 'Cambio de resorte en la pauta', fuerza: 'fuerte', causaId: null, responsable: '', fechaLimite: null, estado: 'pendiente', hechaEn: null },
  ],
  verificacion: { criterio: 'Sin resortes cortados en 60 días', dias: 60, resultado: 'pendiente' },
  estado: 'cerrado',
  createdBy: '',
  createdByNombre: '',
  createdAt: new Date(),
  updatedAt: new Date(),
} as Acr

describe('AcrLecturaCuerpo con onActualizar', () => {
  it('«Marcar hecha» llama onActualizar con estado hecha y hechaEn de hoy', () => {
    const onActualizar = vi.fn()
    render(
      <MemoryRouter>
        <AcrLecturaCuerpo acr={ACR} onActualizar={onActualizar} />
      </MemoryRouter>,
    )
    fireEvent.click(screen.getByRole('button', { name: 'Marcar hecha' }))
    expect(onActualizar).toHaveBeenCalledTimes(1)
    const enviado = onActualizar.mock.calls[0]![0] as Acr
    expect(enviado.acciones[0]!.estado).toBe('hecha')
    expect(enviado.acciones[0]!.hechaEn).toBe(fechaLocal(new Date()))
  })

  it('el subtítulo de Verificación dice la fecha de vencimiento', () => {
    render(
      <MemoryRouter>
        <AcrLecturaCuerpo acr={ACR} onActualizar={vi.fn()} />
      </MemoryRouter>,
    )
    // 24-09-2026 + 60 días = 23-11-2026
    expect(screen.getByText('Vence el 23-11-2026')).toBeTruthy()
  })

  it('«Eficaz» llama onActualizar con el resultado eficaz', () => {
    const onActualizar = vi.fn()
    render(
      <MemoryRouter>
        <AcrLecturaCuerpo acr={ACR} onActualizar={onActualizar} />
      </MemoryRouter>,
    )
    fireEvent.click(screen.getByRole('button', { name: 'Eficaz' }))
    expect((onActualizar.mock.calls[0]![0] as Acr).verificacion.resultado).toBe('eficaz')
  })

  it('sin onActualizar no ofrece «Marcar hecha»', () => {
    render(
      <MemoryRouter>
        <AcrLecturaCuerpo acr={ACR} />
      </MemoryRouter>,
    )
    expect(screen.queryByRole('button', { name: 'Marcar hecha' })).toBeNull()
  })

  it('causa null muestra «No aparece en el Jack-Knife»', () => {
    render(
      <MemoryRouter>
        <AcrLecturaCuerpo acr={{ ...ACR, causaJK: null }} />
      </MemoryRouter>,
    )
    expect(screen.getByText('No aparece en el Jack-Knife')).toBeTruthy()
  })
})

describe('AcrLecturaCuerpo: grupo «En el Jack-Knife» con causa', () => {
  it('con detenciones muestra el cuadrante, los números y el nivel, con enlace al Jack-Knife', () => {
    vi.mocked(useUbicacionJK).mockReturnValue({
      estado: 'listo',
      punto: { k: 'Pernos / Resortes', ev: 15, min: 216, mttr: 14.4, q: 'agu' },
      nivel: 2,
      turnos: 148,
    } as UbicacionJK)
    render(
      <MemoryRouter>
        <AcrLecturaCuerpo acr={{ ...ACR, causaJK: 'Pernos / Resortes' }} />
      </MemoryRouter>,
    )
    expect(screen.getByText('Agudas, 15 detenciones de 14,4 min, 216 min en 148 turnos')).toBeTruthy()
    expect(screen.getByText('Nivel 2 de 5')).toBeTruthy()
    expect(screen.getByText('Abre el Jack-Knife con esta causa marcada.')).toBeTruthy()
    const enlace = screen.getByRole('link', { name: /Pernos \/ Resortes/ })
    expect(enlace.getAttribute('href')).toContain('/jack-knife#jk=')
    expect(enlace.getAttribute('href')).toContain('c=Pernos+%2F+Resortes')
  })

  it('sin detenciones en la ventana lo dice', () => {
    vi.mocked(useUbicacionJK).mockReturnValue({ estado: 'listo', punto: null, nivel: null, turnos: 148 } as UbicacionJK)
    render(
      <MemoryRouter>
        <AcrLecturaCuerpo acr={{ ...ACR, causaJK: 'Motores' }} />
      </MemoryRouter>,
    )
    expect(screen.getByText('Sin detenciones en los últimos 90 días')).toBeTruthy()
  })
})
