import { describe, it, expect } from 'vitest'
import { resolveOeeTileMode } from '../oeeSinCalidad'

describe('resolveOeeTileMode', () => {
  it('con calidad: OEE completo, nada cambia', () => {
    const r = resolveOeeTileMode({ availability: 0.8, performance: 0.9, quality: 0.95, oee: 0.684 })
    expect(r).toEqual({ mode: 'completo', value: 0.684 })
  })

  it('sin calidad: D × R con los mismos D y R de los tiles', () => {
    const r = resolveOeeTileMode({ availability: 0.806, performance: 0.825, quality: null, oee: null })
    expect(r.mode).toBe('sin-calidad')
    if (r.mode !== 'sin-calidad') return
    expect(r.value).toBeCloseTo(0.66495, 5)
    expect(r.availability).toBe(0.806)
    expect(r.performance).toBe(0.825)
  })

  it('sin Shoplogix (solo Grader): no inventa D × R', () => {
    const r = resolveOeeTileMode({ availability: null, performance: null, quality: 0.9, oee: null, graderOnly: true })
    expect(r).toEqual({ mode: 'sin-datos', value: null })
  })

  it('sin calidad y sin D o R: sin datos', () => {
    expect(resolveOeeTileMode({ availability: 0.8, performance: null, quality: null, oee: null }).mode).toBe('sin-datos')
    expect(resolveOeeTileMode({ availability: NaN, performance: 0.8, quality: null, oee: null }).mode).toBe('sin-datos')
  })

  it('calidad 0 cuenta como calidad (no es ausencia)', () => {
    expect(resolveOeeTileMode({ availability: 0.8, performance: 0.8, quality: 0, oee: 0 }).mode).toBe('completo')
  })
})
