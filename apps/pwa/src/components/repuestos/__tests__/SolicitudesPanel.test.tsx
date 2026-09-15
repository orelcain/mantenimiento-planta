/**
 * Solicitudes de repuesto — la traza de cada paso.
 *
 * Avanzar escribía solo `{ estado }`: la única solicitud real dice «Entregada» sin quién ni cuándo.
 * Estos tests cubren lo que no se puede probar en el navegador sin escribir en producción
 * (y sin mandar un aviso al grupo de Telegram): qué se escribe al aprobar/entregar y qué se ve.
 */
import { describe, it, expect, vi, afterEach } from 'vitest'
import { render, screen, cleanup, renderHook } from '@testing-library/react'

const updateDoc = vi.fn(() => Promise.resolve())

vi.mock('@/services/firebase', () => ({ db: {} }))
vi.mock('firebase/firestore', () => ({
  collection: () => ({}),
  doc: (_db: unknown, col: string, id: string) => ({ path: `${col}/${id}` }),
  addDoc: vi.fn(),
  updateDoc: (...args: unknown[]) => updateDoc(...(args as [])),
  onSnapshot: () => () => {},
  query: () => ({}),
  orderBy: () => ({}),
  serverTimestamp: () => 'SERVER_TS',
  Timestamp: class {},
}))

import { SolicitudesPanel } from '../SolicitudesPanel'
import { useSolicitudes, type SolicitudRepuesto } from '@/hooks/repuestos/useSolicitudes'

afterEach(() => {
  cleanup()
  updateDoc.mockClear()
})

const base: SolicitudRepuesto = {
  id: 's1',
  codigoSAP: '3300054757',
  textoBreve: 'AMORTIGUADOR 1421003000',
  cantidad: 2,
  estado: 'entregada',
  solicitadoPor: 'u1',
  solicitadoPorNombre: 'Danilo',
  createdAt: new Date('2026-09-15T08:00:00'),
}

const panel = (solicitudes: SolicitudRepuesto[]) =>
  render(<SolicitudesPanel open onOpenChange={() => {}} solicitudes={solicitudes} loading={false} onAvanzar={() => Promise.resolve()} />)

describe('lo que se escribe al avanzar', () => {
  it('aprobar deja quién y cuándo, no solo el estado', async () => {
    const { result } = renderHook(() => useSolicitudes())
    await result.current.avanzarEstado('s1', 'aprobada', 'uid-7', 'Orel')
    expect(updateDoc).toHaveBeenCalledWith(
      { path: 'solicitudes_repuestos/s1' },
      { estado: 'aprobada', aprobadaPor: 'Orel', aprobadaPorUid: 'uid-7', aprobadaAt: 'SERVER_TS' },
    )
  })

  it('entregar deja su propia traza', async () => {
    const { result } = renderHook(() => useSolicitudes())
    await result.current.avanzarEstado('s1', 'entregada', 'uid-8', 'Bodega')
    expect(updateDoc).toHaveBeenCalledWith(
      { path: 'solicitudes_repuestos/s1' },
      { estado: 'entregada', entregadaPor: 'Bodega', entregadaPorUid: 'uid-8', entregadaAt: 'SERVER_TS' },
    )
  })
})

describe('lo que se ve en el panel', () => {
  it('una entregada con traza dice quién y cuánto tardó desde que se pidió', () => {
    panel([{ ...base, entregadaPor: 'Bodega', entregadaAt: new Date('2026-09-15T11:10:00') }])
    expect(screen.getByText('por Bodega · en 3 h 10 min')).toBeTruthy()
  })

  it('una aprobada dice quién la aprobó', () => {
    panel([{ ...base, estado: 'aprobada', aprobadaPor: 'Orel', aprobadaAt: new Date('2026-09-15T09:30:00') }])
    expect(screen.getByText(/^por Orel · /)).toBeTruthy()
  })

  it('la solicitud de mayo, sin traza, NO inventa autor ni duración', () => {
    panel([base])
    expect(screen.queryByText(/^por /)).toBeNull()
    expect(screen.getByText('Entregada')).toBeTruthy()
  })
})
