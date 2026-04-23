/**
 * Tests para funciones de historial de pausas (M13 + P1-4).
 *
 * Cubre: loadPauseHistory — filtro server-side por pauseId (where),
 * orden ascendente (orderBy), resultado vacío, errores Firestore y
 * que el query se construye con los parámetros de ruta correctos.
 *
 * Firebase y Firestore mockeados para evitar dependencias de red.
 */

import { describe, it, expect, vi, beforeEach } from 'vitest'
import type { PauseHistoryEntry } from '../types'

// ── Mocks hoistados ───────────────────────────────────────────────────────────

const { mockGetDocs, mockCollection, mockQuery, mockOrderBy, mockWhere, mockAddDoc, mockLimitToLast } = vi.hoisted(() => {
  return {
    mockGetDocs:      vi.fn(),
    mockCollection:   vi.fn(),
    mockQuery:        vi.fn(),
    mockOrderBy:      vi.fn(),
    mockWhere:        vi.fn(),
    mockAddDoc:       vi.fn(),
    mockLimitToLast:  vi.fn(),
  }
})

// Mock @/services/firebase para evitar inicialización real de Firestore
vi.mock('@/services/firebase', () => ({
  db: {},
  auth: {},
  storage: {},
  rtdb: {},
}))

// Mock completo de firebase/firestore (incluye initializeFirestore para firebase.ts)
vi.mock('firebase/firestore', () => ({
  collection:              (...args: unknown[]) => mockCollection(...args),
  query:                   (...args: unknown[]) => mockQuery(...args),
  orderBy:                 (...args: unknown[]) => mockOrderBy(...args),
  getDocs:                 (...args: unknown[]) => mockGetDocs(...args),
  addDoc:                  (...args: unknown[]) => mockAddDoc(...args),
  doc:                     vi.fn(),
  getDoc:                  vi.fn(),
  setDoc:                  vi.fn(),
  deleteDoc:               vi.fn(),
  updateDoc:               vi.fn(),
  serverTimestamp:         vi.fn(),
  where:                   (...args: unknown[]) => mockWhere(...args),
  limitToLast:             (...args: unknown[]) => mockLimitToLast(...args),
  writeBatch:              vi.fn(() => ({ set: vi.fn(), update: vi.fn(), commit: vi.fn() })),
  documentId:              vi.fn(),
  getDocsFromCache:        vi.fn(),
  getCountFromServer:      vi.fn(),
  onSnapshot:              vi.fn(),
  initializeFirestore:     vi.fn(() => ({})),
  persistentLocalCache:    vi.fn(() => ({})),
  persistentMultipleTabManager: vi.fn(() => ({})),
}))

// Mock @/services/firestoreTracked (re-exporta firebase/firestore + wrappers)
vi.mock('@/services/firestoreTracked', () => ({
  doc:             vi.fn(),
  getDoc:          vi.fn(),
  setDoc:          vi.fn(),
  deleteDoc:       vi.fn(),
  updateDoc:       vi.fn(),
  serverTimestamp: vi.fn(),
}))

// ── Import después de mocks ───────────────────────────────────────────────────

const { loadPauseHistory } = await import('../graderDailySummary.service')

// ── Helpers ───────────────────────────────────────────────────────────────────

function makeEntry(pauseId: string, changedAt: string, action: PauseHistoryEntry['action'] = 'tag'): PauseHistoryEntry {
  return {
    pauseId,
    action,
    changedBy: 'admin@test.com',
    changedAt,
    diff: { tag: { new: 'colacion' } },
  }
}

function mockFirestoreResult(entries: PauseHistoryEntry[]) {
  mockGetDocs.mockResolvedValueOnce({
    docs: entries.map((e) => ({ data: () => e })),
  })
}

// ── Tests ────────────────────────────────────────────────────────────────────

beforeEach(() => {
  vi.clearAllMocks()
  mockCollection.mockReturnValue('col-ref')
  mockQuery.mockReturnValue('query-ref')
  mockOrderBy.mockReturnValue('orderby-ref')
  mockWhere.mockReturnValue('where-ref')
  mockLimitToLast.mockReturnValue('limittolast-ref')
})

describe('loadPauseHistory — filtrado server-side por pauseId (M13 + P1-4)', () => {
  it('devuelve las entradas que retorna Firestore (filtro delegado al servidor)', async () => {
    // El mock simula que Firestore devuelve solo las entradas del pauseId pedido
    const e1 = makeEntry('p-1000-10m', '2024-01-15T10:05:00.000Z')
    mockFirestoreResult([e1])

    const result = await loadPauseHistory('2024-01-15__Turno día', 'p-1000-10m')

    expect(result).toHaveLength(1)
    expect(result[0]!.pauseId).toBe('p-1000-10m')
  })

  it('retorna array vacío cuando Firestore no devuelve documentos (ningún match)', async () => {
    mockGetDocs.mockResolvedValueOnce({ docs: [] })

    const result = await loadPauseHistory('2024-01-15__Turno día', 'p-1000-10m')

    expect(result).toHaveLength(0)
  })

  it('retorna múltiples entradas en el orden devuelto por Firestore (ASC changedAt)', async () => {
    const e1 = makeEntry('p-1000-10m', '2024-01-15T10:05:00.000Z', 'tag')
    const e2 = makeEntry('p-1000-10m', '2024-01-15T10:10:00.000Z', 'range')
    const e3 = makeEntry('p-1000-10m', '2024-01-15T10:15:00.000Z', 'clear_tag')
    mockFirestoreResult([e1, e2, e3])

    const result = await loadPauseHistory('2024-01-15__Turno día', 'p-1000-10m')

    expect(result).toHaveLength(3)
    expect(result.map(e => e.action)).toEqual(['tag', 'range', 'clear_tag'])
  })

  it('incluye la acción clear_tag correctamente', async () => {
    const e = makeEntry('p-1000-10m', '2024-01-15T10:05:00.000Z', 'clear_tag')
    mockFirestoreResult([e])

    const result = await loadPauseHistory('2024-01-15__Turno día', 'p-1000-10m')

    expect(result[0]!.action).toBe('clear_tag')
  })

  it('lanza error cuando Firestore falla', async () => {
    mockGetDocs.mockRejectedValueOnce(new Error('Firestore offline'))

    await expect(loadPauseHistory('2024-01-15__Turno día', 'p-1000-10m'))
      .rejects.toThrow('Firestore offline')
  })

  it('llama a where() con pauseId para filtrar en el servidor (P1-4)', async () => {
    mockFirestoreResult([])

    await loadPauseHistory('2024-01-15__Turno día', 'p-1234-7m')

    expect(mockWhere).toHaveBeenCalledWith('pauseId', '==', 'p-1234-7m')
  })

  it('llama a orderBy() con changedAt ascendente', async () => {
    mockFirestoreResult([])

    await loadPauseHistory('2024-01-15__Turno día', 'p-1234-7m')

    expect(mockOrderBy).toHaveBeenCalledWith('changedAt', 'asc')
  })

  it('llama a collection con los parámetros de ruta correctos', async () => {
    mockFirestoreResult([])

    await loadPauseHistory('2024-01-15__Turno día', 'p-1234-7m')

    expect(mockCollection).toHaveBeenCalledWith(
      expect.anything(),        // db
      'graderDailySummaries',
      '2024-01-15__Turno día',
      'pauseHistory',
    )
  })

  it('llama a limitToLast(50) para limitar el audit log a los últimos 50 cambios (P2-3)', async () => {
    mockFirestoreResult([])

    await loadPauseHistory('2024-01-15__Turno día', 'p-1234-7m')

    expect(mockLimitToLast).toHaveBeenCalledWith(50)
  })
})
