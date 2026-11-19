/**
 * Fecha corta del último conteo en la tabla de Bodega: «dd-mm» si es del año en curso,
 * «dd-mm-aa» si no. Fechas locales (new Date(año, mes-1, día)).
 */
import { describe, it, expect, vi } from 'vitest'

vi.mock('@/services/firebase', () => ({ db: {} }))
vi.mock('firebase/firestore', () => ({
  collection: () => ({}), doc: () => ({}), addDoc: vi.fn(), updateDoc: vi.fn(), onSnapshot: () => () => {},
  query: () => ({}), orderBy: () => ({}), serverTimestamp: () => 'TS', Timestamp: class {},
}))

import { fechaConteoCorta } from '@/pages/repuestos/datosFichaPieza'

const ahora = new Date(2026, 10, 19, 12, 0) // 19-11-2026

describe('fechaConteoCorta', () => {
  it('del año en curso → dd-mm', () => {
    expect(fechaConteoCorta(new Date(2026, 9, 2), ahora)).toBe('02-10')
  })

  it('de otro año → dd-mm-aa', () => {
    expect(fechaConteoCorta(new Date(2025, 8, 25), ahora)).toBe('25-09-25')
  })
})
