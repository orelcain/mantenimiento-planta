/**
 * Tests de `isFrozenDateKey` — decide si un turno se sirve desde el caché local
 * (0 reads) en vez del servidor.
 *
 * Regla asimétrica, igual que el freeze del backend:
 *   - `true` solo cuando el turno ya no puede cambiar (>3 días desde el FIN del día).
 *   - `false` ante cualquier duda → lectura normal desde servidor.
 *
 * Un falso `true` mostraría datos viejos de un turno que el backend todavía
 * está corrigiendo. Un falso `false` solo cuesta unos reads.
 */

import { describe, it, expect, vi } from 'vitest'

// `shoplogixShift.service` importa `db` desde services/firebase, cuyo import
// inicializa Auth/Firestore reales. `isFrozenDateKey` es una función pura que no
// toca Firestore — basta con un stub del módulo.
vi.mock('@/services/firebase', () => ({ db: {}, auth: {}, storage: {}, rtdb: {} }))

import { isFrozenDateKey } from '../shoplogixShift.service'

// Ancla fija: jueves 9 jul 2026, mediodía UTC.
const NOW = Date.parse('2026-07-09T12:00:00Z')

describe('isFrozenDateKey', () => {
  it('no congela el día en curso', () => {
    expect(isFrozenDateKey('2026-07-09', NOW)).toBe(false)
  })

  it('no congela ayer: el backend lo re-sincroniza cada hora', () => {
    expect(isFrozenDateKey('2026-07-08', NOW)).toBe(false)
  })

  it('no congela hace 2 y 3 días: el backend aún los re-sincroniza a diario', () => {
    expect(isFrozenDateKey('2026-07-07', NOW)).toBe(false)
    expect(isFrozenDateKey('2026-07-06', NOW)).toBe(false)
  })

  it('congela a partir de los 3 días completos desde el fin del día', () => {
    // 05-jul cerró 23:59:59Z → 3.5 días atrás. Ya nadie lo reescribe.
    expect(isFrozenDateKey('2026-07-05', NOW)).toBe(true)
  })

  it('congela días claramente antiguos', () => {
    expect(isFrozenDateKey('2026-07-01', NOW)).toBe(true)
    expect(isFrozenDateKey('2026-06-15', NOW)).toBe(true)
    expect(isFrozenDateKey('2025-12-31', NOW)).toBe(true)
  })

  it('mide desde el FIN del día, no desde su inicio', () => {
    // Un turno con dateKey D puede terminar a las 07:45 de D+1. Anclar al inicio
    // del día lo congelaría casi un día antes de tiempo.
    const justUnder = Date.parse('2026-07-05T23:59:58Z') + 3 * 86_400_000
    expect(isFrozenDateKey('2026-07-05', justUnder)).toBe(false)

    const justOver = Date.parse('2026-07-05T23:59:59Z') + 3 * 86_400_000 + 1000
    expect(isFrozenDateKey('2026-07-05', justOver)).toBe(true)
  })

  it('no congela un dateKey inválido: cae a lectura desde servidor', () => {
    expect(isFrozenDateKey('', NOW)).toBe(false)
    expect(isFrozenDateKey('basura', NOW)).toBe(false)
    expect(isFrozenDateKey('2026-13-45', NOW)).toBe(false)
  })

  it('no congela fechas futuras', () => {
    expect(isFrozenDateKey('2026-07-20', NOW)).toBe(false)
  })

  it('la ventana de freeze del cliente es más laxa que el canal de corrección del backend', () => {
    // El backend re-sincroniza ayer (cada hora) y hace 2 y 3 días (a diario).
    // El cliente NO debe congelar ninguno de esos días, o mostraría datos que el
    // backend todavía está corrigiendo. Este test amarra ambas ventanas.
    const backendStillRewrites = ['2026-07-08', '2026-07-07', '2026-07-06']
    for (const dk of backendStillRewrites) {
      expect(isFrozenDateKey(dk, NOW), `${dk} no debe congelarse`).toBe(false)
    }
  })
})
