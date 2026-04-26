/**
 * Tests para graderPauseTiers.ts — etiquetas legibles por PauseTier.
 */

import { describe, it, expect } from 'vitest'
import { PAUSE_TIER_LABEL, pauseTierLabel } from '../graderPauseTiers'

describe('PAUSE_TIER_LABEL', () => {
  it('cubre los 3 tiers canónicos con etiquetas en es-CL', () => {
    expect(PAUSE_TIER_LABEL.pausa).toBe('Pausa')
    expect(PAUSE_TIER_LABEL.larga).toBe('Pausa larga')
    expect(PAUSE_TIER_LABEL.parada).toBe('Parada')
  })
})

describe('pauseTierLabel', () => {
  it('devuelve la etiqueta del tier dado', () => {
    expect(pauseTierLabel('pausa')).toBe('Pausa')
    expect(pauseTierLabel('larga')).toBe('Pausa larga')
    expect(pauseTierLabel('parada')).toBe('Parada')
  })

  it('devuelve el valor crudo cuando el tier no es canónico (legacy fallback)', () => {
    expect(pauseTierLabel('desconocido')).toBe('desconocido')
    expect(pauseTierLabel('')).toBe('')
  })
})
