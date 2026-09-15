import { describe, it, expect } from 'vitest'
import { camposDeTraza, duracionLegible } from '../trazaDeSolicitud'

describe('camposDeTraza', () => {
  it('cada paso deja su autor con nombre y uid', () => {
    expect(camposDeTraza('aprobada', 'u1', 'Danilo')).toEqual({ aprobadaPor: 'Danilo', aprobadaPorUid: 'u1' })
    expect(camposDeTraza('entregada', 'u2', 'Bodega')).toEqual({ entregadaPor: 'Bodega', entregadaPorUid: 'u2' })
  })

  it('sin nombre no escribe vacío (Firestore sin ignoreUndefinedProperties)', () => {
    expect(camposDeTraza('aprobada', 'u1', '')).toEqual({ aprobadaPor: 'Usuario', aprobadaPorUid: 'u1' })
  })
})

describe('duracionLegible', () => {
  const t0 = new Date('2026-09-15T08:00:00')
  const mas = (min: number) => new Date(t0.getTime() + min * 60000)

  it('minutos, horas y días', () => {
    expect(duracionLegible(t0, mas(40))).toBe('40 min')
    expect(duracionLegible(t0, mas(190))).toBe('3 h 10 min')
    expect(duracionLegible(t0, mas(120))).toBe('2 h')
    expect(duracionLegible(t0, mas(52 * 60))).toBe('2 d 4 h')
    expect(duracionLegible(t0, mas(48 * 60))).toBe('2 d')
  })

  it('sin una de las fechas (la solicitud de mayo) no inventa una duración', () => {
    expect(duracionLegible(t0, undefined)).toBeNull()
    expect(duracionLegible(undefined, t0)).toBeNull()
  })

  it('un orden imposible no muestra un tiempo negativo', () => {
    expect(duracionLegible(mas(10), t0)).toBeNull()
  })
})
