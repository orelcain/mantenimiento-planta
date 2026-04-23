/**
 * Tests para updatePauseRange — validaciones M6 + happy path.
 *
 * Cubre:
 *   - Duración < 60s  → rechaza antes de tocar Firestore
 *   - meta/pauses no encontrado
 *   - pauseId no encontrado en el doc
 *   - Solape con otra pausa (mensaje con HH:MM)
 *   - Happy path: setDoc llamado con datos correctos
 *
 * Firestore mockeado con vi.mock para evitar conexión real.
 */

import { vi, describe, it, expect, beforeEach } from 'vitest'

// ── Mocks de Firebase (deben declararse antes del import del módulo) ──────────

vi.mock('@/services/firestoreTracked', () => ({
  doc: vi.fn(() => 'mock-doc-ref'),
  getDoc: vi.fn(),
  setDoc: vi.fn(() => Promise.resolve()),
  deleteDoc: vi.fn(),
  updateDoc: vi.fn(),
  serverTimestamp: vi.fn(() => null),
}))

vi.mock('firebase/firestore', () => ({
  collection: vi.fn(),
  doc: vi.fn(),
  query: vi.fn(),
  where: vi.fn(),
  orderBy: vi.fn(),
  getDocs: vi.fn(),
  getDocsFromCache: vi.fn(() => Promise.reject(new Error('cache miss'))),
  writeBatch: vi.fn(() => ({ set: vi.fn(), commit: vi.fn(() => Promise.resolve()) })),
  documentId: vi.fn(),
  getCountFromServer: vi.fn(),
}))

// Ruta relativa desde __tests__/ hacia services/firebase
vi.mock('../../firebase', () => ({ db: {} }))

// ── Imports del módulo bajo prueba (DESPUÉS de los mocks) ─────────────────────

import { getDoc, setDoc } from '@/services/firestoreTracked'
import { updatePauseRange } from '../graderDailySummary.service'

// ── Helpers ───────────────────────────────────────────────────────────────────

const mockGetDoc = vi.mocked(getDoc)
const mockSetDoc = vi.mocked(setDoc)

/** Pausa base de 15 min para usar en los docs de mock */
const BASE_PAUSE = {
  id: 'p-1000-15m',
  startAt: '2024-01-15T10:00:00.000Z',
  endAt:   '2024-01-15T10:15:00.000Z',
  durationSec: 900,
  tier: 'pausa' as const,
}

/** Pausa separada (13:00–13:30) que no solapa con el rango 10:00–10:15 */
const OTHER_PAUSE = {
  id: 'p-1300-30m',
  startAt: '2024-01-15T13:00:00.000Z',
  endAt:   '2024-01-15T13:30:00.000Z',
  durationSec: 1800,
  tier: 'larga' as const,
}

function mockDocExists(pauses: typeof BASE_PAUSE[]) {
  mockGetDoc.mockResolvedValueOnce({
    exists: () => true,
    data: () => ({
      pauses,
      microDetentions: { count: 0, totalSec: 0, byHour: {} },
      updatedAt: '2024-01-15T10:00:00.000Z',
      schemaVersion: 1,
    }),
  } as ReturnType<typeof getDoc> extends Promise<infer T> ? T : never)
}

function mockDocMissing() {
  mockGetDoc.mockResolvedValueOnce({
    exists: () => false,
    data: () => undefined,
  } as ReturnType<typeof getDoc> extends Promise<infer T> ? T : never)
}

beforeEach(() => {
  vi.clearAllMocks()
})

// ── Validación de duración (antes de Firestore) ───────────────────────────────

describe('updatePauseRange — validación de duración', () => {
  it('lanza si la duración es menor a 60s (30s)', async () => {
    await expect(
      updatePauseRange('summary-1', 'p-1000-15m', {
        startAt:    '2024-01-15T10:00:00.000Z',
        endAt:      '2024-01-15T10:00:30.000Z', // 30s
        adjustedBy: 'admin',
      }),
    ).rejects.toThrow('La pausa debe durar al menos 1 minuto')
  })

  it('lanza si endAt es igual a startAt (duración 0)', async () => {
    await expect(
      updatePauseRange('summary-1', 'p-1000-15m', {
        startAt:    '2024-01-15T10:00:00.000Z',
        endAt:      '2024-01-15T10:00:00.000Z',
        adjustedBy: 'admin',
      }),
    ).rejects.toThrow('La pausa debe durar al menos 1 minuto')
  })

  it('lanza si endAt es anterior a startAt (duración negativa)', async () => {
    await expect(
      updatePauseRange('summary-1', 'p-1000-15m', {
        startAt:    '2024-01-15T10:01:00.000Z',
        endAt:      '2024-01-15T10:00:00.000Z', // invertido
        adjustedBy: 'admin',
      }),
    ).rejects.toThrow('La pausa debe durar al menos 1 minuto')
  })

  it('no llama a getDoc cuando la duración es inválida', async () => {
    await expect(
      updatePauseRange('summary-1', 'p-1000-15m', {
        startAt: '2024-01-15T10:00:00.000Z',
        endAt:   '2024-01-15T10:00:30.000Z',
        adjustedBy: 'admin',
      }),
    ).rejects.toThrow()
    expect(mockGetDoc).not.toHaveBeenCalled()
  })
})

// ── Validaciones con Firestore mockeado ───────────────────────────────────────

describe('updatePauseRange — doc no encontrado', () => {
  it('lanza si meta/pauses no existe en Firestore', async () => {
    mockDocMissing()
    await expect(
      updatePauseRange('summary-1', 'p-1000-15m', {
        startAt:    '2024-01-15T10:00:00.000Z',
        endAt:      '2024-01-15T10:05:00.000Z', // 5 min
        adjustedBy: 'admin',
      }),
    ).rejects.toThrow('No existe meta/pauses para summary-1')
  })

  it('lanza si el pauseId no existe en el doc', async () => {
    mockDocExists([OTHER_PAUSE])
    await expect(
      updatePauseRange('summary-1', 'p-XXXX-15m', {
        startAt:    '2024-01-15T10:00:00.000Z',
        endAt:      '2024-01-15T10:05:00.000Z',
        adjustedBy: 'admin',
      }),
    ).rejects.toThrow('Pausa p-XXXX-15m no encontrada en summary-1')
  })
})

// ── Validación de solape ──────────────────────────────────────────────────────

describe('updatePauseRange — validación de solape (M6)', () => {
  it('lanza si el nuevo rango solapa con otra pausa', async () => {
    // BASE_PAUSE: 10:00–10:15, OTHER_PAUSE: 13:00–13:30
    // Intentamos mover BASE_PAUSE a 12:50–13:10 → solapa con OTHER_PAUSE
    mockDocExists([BASE_PAUSE, OTHER_PAUSE])
    await expect(
      updatePauseRange('summary-1', BASE_PAUSE.id, {
        startAt:    '2024-01-15T12:50:00.000Z',
        endAt:      '2024-01-15T13:10:00.000Z', // 20 min, solapa con OTHER_PAUSE
        adjustedBy: 'admin',
      }),
    ).rejects.toThrow('El rango se solapa con otra pausa (13:00–13:30)')
  })

  it('no lanza cuando el nuevo rango NO solapa (están separados)', async () => {
    // BASE_PAUSE: 10:00–10:15, OTHER_PAUSE: 13:00–13:30
    // Movemos BASE_PAUSE a 11:00–11:20 → sin solape
    mockDocExists([BASE_PAUSE, OTHER_PAUSE])
    mockSetDoc.mockResolvedValueOnce(undefined)
    await expect(
      updatePauseRange('summary-1', BASE_PAUSE.id, {
        startAt:    '2024-01-15T11:00:00.000Z',
        endAt:      '2024-01-15T11:20:00.000Z', // 20 min, sin solape
        adjustedBy: 'admin',
      }),
    ).resolves.toBeUndefined()
  })

  it('no considera solape consigo mismo', async () => {
    // Solo hay BASE_PAUSE → ajustarlo no puede solapar consigo mismo
    mockDocExists([BASE_PAUSE])
    mockSetDoc.mockResolvedValueOnce(undefined)
    await expect(
      updatePauseRange('summary-1', BASE_PAUSE.id, {
        startAt:    '2024-01-15T10:00:00.000Z',
        endAt:      '2024-01-15T10:20:00.000Z', // extender 5 min más
        adjustedBy: 'admin',
      }),
    ).resolves.toBeUndefined()
  })
})

// ── Happy path ────────────────────────────────────────────────────────────────

describe('updatePauseRange — happy path', () => {
  it('llama setDoc con startAt, endAt, durationSec, adjustedBy actualizados', async () => {
    mockDocExists([BASE_PAUSE])
    mockSetDoc.mockResolvedValueOnce(undefined)

    await updatePauseRange('summary-1', BASE_PAUSE.id, {
      startAt:    '2024-01-15T10:00:00.000Z',
      endAt:      '2024-01-15T10:20:00.000Z', // 20 min = 1200s
      adjustedBy: 'operador-x',
    })

    expect(mockSetDoc).toHaveBeenCalledOnce()
    const [, payload] = mockSetDoc.mock.calls[0]!
    // El payload tiene { pauses: [...], microDetentions: ..., ... }
    const updatedPause = (payload as { pauses: typeof BASE_PAUSE[] }).pauses.find(
      p => p.id === BASE_PAUSE.id,
    )
    expect(updatedPause?.startAt).toBe('2024-01-15T10:00:00.000Z')
    expect(updatedPause?.endAt).toBe('2024-01-15T10:20:00.000Z')
    expect(updatedPause?.durationSec).toBe(1200)
    expect((updatedPause as typeof BASE_PAUSE & { adjustedBy?: string })?.adjustedBy).toBe('operador-x')
  })
})
