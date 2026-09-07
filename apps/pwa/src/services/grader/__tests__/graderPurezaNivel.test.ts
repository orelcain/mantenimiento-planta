import { describe, it, expect } from 'vitest'
import { nivelDePureza, bloqueDeCaida, promedioHasta } from '../graderPurezaNivel'

describe('nivelDePureza', () => {
  it('aplica los umbrales 95 / 85 y trata null como sin asignación', () => {
    expect(nivelDePureza(100)).toBe('ok')
    expect(nivelDePureza(95)).toBe('ok')
    expect(nivelDePureza(94.9)).toBe('warn')
    expect(nivelDePureza(85)).toBe('warn')
    expect(nivelDePureza(84.9)).toBe('crit')
    expect(nivelDePureza(null)).toBe('none')
    expect(nivelDePureza(undefined)).toBe('none')
  })
})

describe('bloqueDeCaida', () => {
  it('encuentra el bloque desde el que la puerta no se recupera', () => {
    expect(bloqueDeCaida([96, 97, 95, 96, 94, 96, 88, 62, 55, 58, 61])).toBe(7)
  })

  it('ignora un bloque malo aislado si después vuelve a estar bien', () => {
    expect(bloqueDeCaida([96, 40, 97, 96, 98])).toBeNull()
  })

  it('salta los bloques sin piezas', () => {
    expect(bloqueDeCaida([null, 96, null, 60, null, 55])).toBe(3)
  })

  it('devuelve 0 si estuvo mezclada desde el inicio y null si nunca cayó', () => {
    expect(bloqueDeCaida([60, 55, 70])).toBe(0)
    expect(bloqueDeCaida([96, 99, 95])).toBeNull()
    expect(bloqueDeCaida([])).toBeNull()
  })
})

describe('promedioHasta', () => {
  it('promedia solo los bloques con dato anteriores al índice', () => {
    expect(promedioHasta([96, null, 94, 60], 3)).toBe(95)
    expect(promedioHasta([null, null], 2)).toBeNull()
  })
})
