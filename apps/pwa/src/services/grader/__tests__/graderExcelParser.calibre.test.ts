import { describe, it, expect } from 'vitest'
import { normalizeCalibre, CALIBRE_12_UP } from '../graderExcelParser'

describe('normalizeCalibre · programas 10+ y 12+ del Z2', () => {
  it('"12", "12-UP", "12+" y "12 Up" son el programa 12+, no el 10-12', () => {
    for (const v of ['12', '12-UP', '12+', '12 Up', 'HG 12', '12 lb', '14-UP']) expect(normalizeCalibre(v), v).toBe(CALIBRE_12_UP)
  })
  it('"10", "10-UP" y "10-12" siguen siendo 10-12 lb', () => {
    for (const v of ['10', '10-UP', '10+', '10 - 12 lb', 'HG10-12']) expect(normalizeCalibre(v), v).toBe('10-12 lb')
  })
  it('lo demás no cambia', () => {
    expect(normalizeCalibre('6 - 8 LB')).toBe('6-8 lb')
    expect(normalizeCalibre('Fuera de Rango')).toBe('Other')
    expect(normalizeCalibre('7')).toBe('Other')
    expect(normalizeCalibre('')).toBe('Other')
  })
})
