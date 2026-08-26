/**
 * `deleteInspection` borraba solo el documento de la inspección y dejaba sus
 * ítems apuntando a un padre inexistente: hoy hay **110 de 173** así (64%), de
 * cuatro inspecciones que ya no existen.
 *
 * La garantía del test es doble: que los ítems se borran, y que se borran
 * ANTES que la inspección — si el borrado falla a mitad de camino, la
 * inspección debe seguir estando para poder reintentar.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest'

vi.mock('@/services/firebase', () => ({ db: {}, auth: {}, storage: {}, rtdb: {} }))

const deleteDoc = vi.fn()
const getDocs = vi.fn()
const orden: string[] = []

vi.mock('@/services/firestoreTracked', () => ({
  collection: vi.fn((_db: unknown, nombre: string) => ({ __col: nombre })),
  doc: vi.fn((_db: unknown, col: string, id: string) => ({ __ref: `${col}/${id}` })),
  setDoc: vi.fn(),
  getDoc: vi.fn(),
  getDocs: (...args: unknown[]) => getDocs(...args),
  updateDoc: vi.fn(),
  deleteDoc: (ref: { __ref?: string }) => {
    orden.push(ref?.__ref ?? 'item')
    return deleteDoc(ref)
  },
  query: vi.fn((col: unknown) => col),
  where: vi.fn(),
  orderBy: vi.fn(),
  serverTimestamp: vi.fn(),
  Timestamp: class {},
  limit: vi.fn(),
}))

vi.mock('firebase/storage', () => ({
  ref: vi.fn(), uploadBytes: vi.fn(), getDownloadURL: vi.fn(), deleteObject: vi.fn(),
}))

const { deleteInspection } = await import('../maps')

beforeEach(() => {
  orden.length = 0
  deleteDoc.mockClear()
  getDocs.mockReset()
})

describe('deleteInspection', () => {
  it('borra los ítems de la inspección, no solo la inspección', async () => {
    getDocs.mockResolvedValue({
      size: 3,
      docs: [1, 2, 3].map((n) => ({ ref: { __ref: `inspectionItems/item-${n}` } })),
    })

    const r = await deleteInspection('insp-1')

    expect(r.itemsBorrados).toBe(3)
    expect(deleteDoc).toHaveBeenCalledTimes(4) // 3 ítems + la inspección
    expect(orden).toEqual([
      'inspectionItems/item-1',
      'inspectionItems/item-2',
      'inspectionItems/item-3',
      'inspections/insp-1',
    ])
  })

  it('la inspección se borra AL FINAL: si falla a mitad, queda para reintentar', async () => {
    getDocs.mockResolvedValue({
      size: 2,
      docs: [{ ref: { __ref: 'inspectionItems/a' } }, { ref: { __ref: 'inspectionItems/b' } }],
    })
    deleteDoc.mockImplementationOnce(() => Promise.resolve())
      .mockImplementationOnce(() => Promise.reject(new Error('sin red')))

    await expect(deleteInspection('insp-2')).rejects.toThrow('sin red')
    expect(orden).not.toContain('inspections/insp-2')
  })

  it('una inspección sin ítems se borra igual', async () => {
    getDocs.mockResolvedValue({ size: 0, docs: [] })
    const r = await deleteInspection('insp-3')
    expect(r.itemsBorrados).toBe(0)
    expect(orden).toEqual(['inspections/insp-3'])
  })
})
