import { beforeEach, describe, expect, it, vi } from 'vitest'

const addDoc = vi.fn(async (..._a: unknown[]) => ({}))
const auth: { currentUser: { uid: string } | null } = { currentUser: { uid: 'u1' } }

vi.mock('@/services/firebase', () => ({ auth, db: { __db: true } }))
vi.mock('firebase/firestore', () => ({
  addDoc: (...a: unknown[]) => addDoc(...a),
  collection: (_db: unknown, name: string) => ({ name }),
  serverTimestamp: () => 'TS',
}))

import { claveVista, diaSantiago, registrarVista } from './registrarVista'

beforeEach(() => {
  sessionStorage.clear()
  addDoc.mockClear()
  auth.currentUser = { uid: 'u1' }
})

describe('diaSantiago', () => {
  it('cerca de la medianoche UTC sigue siendo el día de Chile', () => {
    // 2026-10-25 02:30 UTC = 24-10 23:30 en Santiago (UTC-3 en verano austral).
    expect(diaSantiago(new Date('2026-10-25T02:30:00Z'))).toBe('2026-10-24')
    // 03:30 UTC = 00:30 del 25 en Santiago.
    expect(diaSantiago(new Date('2026-10-25T03:30:00Z'))).toBe('2026-10-25')
  })
  it('en invierno (UTC-4) el corte es a las 04:00 UTC', () => {
    expect(diaSantiago(new Date('2026-07-10T03:30:00Z'))).toBe('2026-07-09')
    expect(diaSantiago(new Date('2026-07-10T04:30:00Z'))).toBe('2026-07-10')
  })
})

describe('claveVista', () => {
  it('arma la clave y recorta la vista a 40', () => {
    expect(claveVista('turno', 'resumen', '2026-10-25')).toBe('vista:turno:resumen:2026-10-25')
    expect(claveVista('monitor', 'x'.repeat(60), 'd')).toBe(`vista:monitor:${'x'.repeat(40)}:d`)
  })
})

describe('registrarVista', () => {
  it('escribe una vez y deduplica la misma pestaña el mismo día', async () => {
    await registrarVista('turno', 'resumen', { plantLineId: 'principal' })
    await registrarVista('turno', 'resumen', { plantLineId: 'principal' })
    expect(addDoc).toHaveBeenCalledTimes(1)
    const doc = addDoc.mock.calls[0][1] as Record<string, unknown>
    expect(doc).toMatchObject({
      plantId: 'chonchi', pantalla: 'turno', vista: 'resumen', plantLineId: 'principal', uid: 'u1', ts: 'TS',
    })
    expect(doc.dia).toMatch(/^\d{4}-\d{2}-\d{2}$/)
  })
  it('otra pestaña sí escribe, y sin plantLineId no manda la clave', async () => {
    await registrarVista('turno', 'resumen')
    await registrarVista('turno', 'calidad')
    expect(addDoc).toHaveBeenCalledTimes(2)
    expect(addDoc.mock.calls[1][1]).not.toHaveProperty('plantLineId')
  })
  it('sin sesión no escribe ni marca el dedupe', async () => {
    auth.currentUser = null
    await registrarVista('monitor', 'chonchi')
    expect(addDoc).not.toHaveBeenCalled()
    expect(sessionStorage.length).toBe(0)
  })
  it('si Firestore falla no lanza', async () => {
    addDoc.mockRejectedValueOnce(new Error('permission-denied'))
    await expect(registrarVista('periodo', 'yal')).resolves.toBeUndefined()
  })
})
