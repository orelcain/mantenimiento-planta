/**
 * «Entregar» una solicitud descuenta sobre BODEGA, no sobre el catálogo cargado.
 *
 * El caso que fallaba: el hub carga el catálogo por área. Una solicitud del AMORTIGUADOR
 * 1421003000 (3300054757, bodega C-18 con 3) mirada desde EVISCERADO de Chonchi —donde ese
 * repuesto no está— no encontraba la fila, se marcaba «Entregada» y el stock no se movía.
 * Acá el catálogo va VACÍO a propósito: si la salida depende de él, el test falla.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { renderHook, waitFor, act } from '@testing-library/react'

const updateDoc = vi.fn((..._a: unknown[]) => Promise.resolve())
const addDoc = vi.fn((..._a: unknown[]) => Promise.resolve({ id: 'm1' }))

vi.mock('@/services/firebase', () => ({ db: {} }))
vi.mock('@/services/storage', () => ({ uploadBodegaPhoto: vi.fn(), deleteBodegaPhoto: vi.fn() }))
vi.mock('@/store', () => ({ useAuthStore: (sel: (s: unknown) => unknown) => sel({ user: undefined }) }))
vi.mock('../useRepuestoFavoritos', () => ({ useRepuestoFavoritos: () => ({ favKeys: new Set(), toggleFav: vi.fn() }) }))
vi.mock('firebase/firestore', () => ({
  collection: (_db: unknown, ...path: string[]) => ({ path: path.join('/') }),
  collectionGroup: () => ({}),
  doc: (_db: unknown, ...path: string[]) => ({ path: path.join('/') }),
  getDocs: () =>
    Promise.resolve({
      docs: [{ id: '3300054757', data: () => ({ codigoSAP: '3300054757', stockActual: 3, stockMinimo: 1, ubicacionBodega: 'C-18', unidad: 'pzas' }) }],
    }),
  setDoc: vi.fn(),
  addDoc: (...a: unknown[]) => addDoc(...a),
  updateDoc: (...a: unknown[]) => updateDoc(...a),
  query: () => ({}),
  orderBy: () => ({}),
  limit: () => ({}),
  serverTimestamp: () => 'SERVER_TS',
  Timestamp: class {},
}))

import { useBodega, invalidateBodegaCache } from '../useBodega'

beforeEach(() => {
  updateDoc.mockClear()
  invalidateBodegaCache() // la caché de módulo sobrevive entre tests: cada uno parte con 3 en bodega
  addDoc.mockClear()
})

async function hookConBodegaCargada() {
  const hook = renderHook(() => useBodega([]))
  await waitFor(() => expect(hook.result.current.overlayDeSap('3300054757')).toBeTruthy())
  return hook
}

describe('registrarSalidaDeSolicitud', () => {
  it('descuenta aunque el repuesto NO esté en el catálogo cargado', async () => {
    const { result } = await hookConBodegaCargada()
    let plan
    await act(async () => {
      plan = await result.current.registrarSalidaDeSolicitud('3300054757', 2, 'Entrega solicitud · Danilo', 'u1', 'Orel')
    })
    expect(plan).toEqual({ accion: 'descontar', stockAntes: 3, stockDespues: 1, faltante: 0 })
    expect(updateDoc).toHaveBeenCalledWith({ path: 'bodega/3300054757' }, { stockActual: 1, updatedAt: 'SERVER_TS' })
    expect(addDoc).toHaveBeenCalledWith(
      { path: 'bodega/3300054757/movimientos' },
      expect.objectContaining({ tipo: 'salida', cantidad: 2, stockResultante: 1, motivo: 'Entrega solicitud · Danilo' }),
    )
  })

  it('entregar más de lo registrado deja la huella en el motivo', async () => {
    const { result } = await hookConBodegaCargada()
    await act(async () => {
      await result.current.registrarSalidaDeSolicitud('3300054757', 5, 'Entrega solicitud · Danilo', 'u1', 'Orel')
    })
    expect(addDoc).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({ cantidad: 5, stockResultante: 0, motivo: 'Entrega solicitud · Danilo · bodega registraba 3' }),
    )
  })

  it('un SAP sin bodega no escribe nada y lo informa', async () => {
    const { result } = await hookConBodegaCargada()
    let plan
    await act(async () => {
      plan = await result.current.registrarSalidaDeSolicitud('9999999999', 1, 'x', 'u1', 'Orel')
    })
    expect(plan).toEqual({ accion: 'sin-bodega' })
    expect(updateDoc).not.toHaveBeenCalled()
    expect(addDoc).not.toHaveBeenCalled()
  })
})
