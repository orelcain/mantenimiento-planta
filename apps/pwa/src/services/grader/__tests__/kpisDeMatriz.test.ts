import { describe, it, expect } from 'vitest'
import { kpisDeMatriz, MATRIX_KPIS, DEFAULT_MATRIX_KPI } from '../graderShiftMatrixKpi'

describe('kpisDeMatriz', () => {
  it('una línea sin Grader no ofrece los indicadores del Excel', () => {
    const ids = kpisDeMatriz(false).map((k) => k.id)
    expect(ids).toEqual(['cycles', 'uptime'])
  })

  it('con Grader están los cuatro de siempre', () => {
    expect(kpisDeMatriz(true)).toEqual(MATRIX_KPIS)
  })

  it('el default sigue disponible en las dos', () => {
    for (const tiene of [true, false]) {
      expect(kpisDeMatriz(tiene).some((k) => k.id === DEFAULT_MATRIX_KPI)).toBe(true)
    }
  })
})
