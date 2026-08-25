import { describe, it, expect } from 'vitest'
import { minDe, maxDe } from '../minMaxSeguro'

describe('minDe / maxDe', () => {
  it('coincide con Math.min/max en arrays chicos', () => {
    const xs = [5, -3, 0, 12, 7]
    expect(minDe(xs)).toBe(Math.min(...xs))
    expect(maxDe(xs)).toBe(Math.max(...xs))
  })

  it('devuelve null con array vacío', () => {
    expect(minDe([])).toBeNull()
    expect(maxDe([])).toBeNull()
  })

  it('aguanta 278.000 valores — donde Math.min(...) revienta', () => {
    // Tamaño real: el Excel pieza-a-pieza de 15 días trae 277.841 piezas.
    const xs = Array.from({ length: 278_000 }, (_, i) => i)
    expect(() => Math.min(...xs)).toThrow(RangeError)
    expect(minDe(xs)).toBe(0)
    expect(maxDe(xs)).toBe(277_999)
  })
})
