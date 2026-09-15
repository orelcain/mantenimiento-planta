import { describe, it, expect } from 'vitest'
import { ritmoParaPiezasPerdidas } from '../kpisMantencionTurno'
import type { UpstreamProductionInterval } from '../types'

/** Intervalos de 5 min: solo importan ciclos y esperado. */
const iv = (cycles: number, expectedCycles: number) =>
  ({ cycles, expectedCycles }) as unknown as UpstreamProductionInterval

describe('ritmoParaPiezasPerdidas', () => {
  it('Filete: valoriza al ritmo demostrado, no al target del sensor', () => {
    // Forma real de la Línea 1 de Filete: target 20 pz/min, anda a ~10.
    const intervals = [iv(50, 100), iv(48, 100), iv(52, 100), iv(0, 100), iv(49, 100)]
    const ritmo = ritmoParaPiezasPerdidas(intervals)!
    expect(ritmo).toBeCloseTo(10, 0)
    // 5 min de paro: ~50 pz, no las 100 del target.
    expect(Math.round(5 * ritmo)).toBeLessThan(60)
  })

  it('los intervalos parados no bajan el ritmo', () => {
    expect(ritmoParaPiezasPerdidas([iv(90, 95), iv(0, 95), iv(0, 95), iv(90, 95)])).toBe(18)
  })

  it('sin intervalos andando cae al target, mejor que no decir nada', () => {
    expect(ritmoParaPiezasPerdidas([iv(0, 95), iv(0, 100)])).toBe(20)
  })

  it('sin target ni ciclos no hay ritmo', () => {
    expect(ritmoParaPiezasPerdidas([])).toBeNull()
    expect(ritmoParaPiezasPerdidas([iv(0, 0)])).toBeNull()
  })
})
