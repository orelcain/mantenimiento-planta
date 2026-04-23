/**
 * Tests para funciones de historial de pausas (M13).
 *
 * Cubre: loadPauseHistory — filtrado por pauseId, orden ascendente,
 * resultado vacío, y propagación de errores Firestore.
 *
 * Firebase y Firestore mockeados para evitar dependencias de red.
 */

import { describe, it, expect, vi, beforeEach } from 'vitest'
import type { PauseHistoryEntry } from '../types'

// ── Mocks hoistados ───────────────────────────────────────────────────────────

const { mockGetDocs, mockCollection, mockQuery, mockOrderBy, mockAddDoc } = vi.hoisted(() => {
  return {
    mockGetDocs:  vi.fn(),
    mockCollection: vi.fn(),
    mockQuery:    vi.fn(),
    mockOrderBy:  vi.fn(),
    mockAddDoc:   vi.fn(),
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
  where:                   vi.fn(),
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
})

describe('loadPauseHistory — filtrado por pauseId (M13)', () => {
  it('retorna solo las entradas del pauseId pedido', async () => {
    const target = makeEntry('p-1000-10m', '2024-01-15T10:05:00.000Z')
    const other  = makeEntry('p-1100-5m',  '2024-01-15T11:05:00.000Z')
    mockFirestoreResult([target, other])

    const result = await loadPauseHistory('2024-01-15__Turno día', 'p-1000-10m')

    expect(result).toHaveLength(1)
    expect(result[0]!.pauseId).toBe('p-1000-10m')
  })

  it('retorna array vacío si ningún doc coincide con pauseId', async () => {
    const entry = makeEntry('p-1100-5m', '2024-01-15T11:05:00.000Z')
    mockFirestoreResult([entry])

    const result = await loadPauseHistory('2024-01-15__Turno día', 'p-1000-10m')

    expect(result).toHaveLength(0)
  })

  it('retorna array vacío si la subcollection está vacía', async () => {
    mockGetDocs.mockResolvedValueOnce({ docs: [] })

    const result = await loadPauseHistory('2024-01-15__Turno día', 'p-1000-10m')

    expect(result).toHaveLength(0)
  })

  it('retorna múltiples entradas del mismo pauseId en orden asc (por changedAt)', async () => {
    const e1 = makeEntry('p-1000-10m', '2024-01-15T10:05:00.000Z', 'tag')
    const e2 = makeEntry('p-1000-10m', '2024-01-15T10:10:00.000Z', 'range')
    const e3 = makeEntry('p-1000-10m', '2024-01-15T10:15:00.000Z', 'clear_tag')
    // Firestore devuelve ya ordenados por orderBy('changedAt', 'asc')
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
})
