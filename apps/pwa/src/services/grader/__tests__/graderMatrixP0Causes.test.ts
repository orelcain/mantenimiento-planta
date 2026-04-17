import { describe, it, expect } from 'vitest'
import { toMatrixCause, parseMatrixErrorString, MATRIX_P0_CAUSES } from '../graderMatrixP0Causes'
import type { PointZeroCause } from '../types'

describe('parseMatrixErrorString', () => {
  it('clasifica "Fuera de límites" correctamente', () => {
    expect(parseMatrixErrorString('Fuera de límites')).toBe('fuera_de_limites')
    expect(parseMatrixErrorString('Fuera de Limites')).toBe('fuera_de_limites')
    expect(parseMatrixErrorString('fuera de límites')).toBe('fuera_de_limites')
  })

  it('clasifica "No leído por fotocélula" correctamente', () => {
    expect(parseMatrixErrorString('No leído por fotocélula')).toBe('no_leido_fotocelula')
    expect(parseMatrixErrorString('No leido por fotocelula')).toBe('no_leido_fotocelula')
    expect(parseMatrixErrorString('No Leído Por Fotocélula')).toBe('no_leido_fotocelula')
  })

  it('clasifica "Puerta no preparada" correctamente', () => {
    expect(parseMatrixErrorString('Puerta no preparada')).toBe('puerta_no_preparada')
    expect(parseMatrixErrorString('PUERTA NO PREPARADA')).toBe('puerta_no_preparada')
  })

  it('retorna otro para strings desconocidos', () => {
    expect(parseMatrixErrorString('Desconocido')).toBe('otro')
    expect(parseMatrixErrorString('')).toBe('otro')
    expect(parseMatrixErrorString('Error genérico')).toBe('otro')
  })
})

describe('toMatrixCause', () => {
  const cases: Array<[PointZeroCause, ReturnType<typeof toMatrixCause>]> = [
    ['fuera_de_rango',      'fuera_de_limites'],
    ['fuera_de_limites',    'fuera_de_limites'],
    ['no_leido_fotocelula', 'no_leido_fotocelula'],
    ['too_close_too_long',  'no_leido_fotocelula'],
    ['puerta_no_preparada', 'puerta_no_preparada'],
    ['otro',                'otro'],
  ]

  for (const [subCause, expected] of cases) {
    it(`mapea ${subCause} → ${expected}`, () => {
      expect(toMatrixCause(subCause)).toBe(expected)
    })
  }
})

describe('MATRIX_P0_CAUSES estructura', () => {
  it('tiene las 4 causas requeridas', () => {
    const keys = Object.keys(MATRIX_P0_CAUSES)
    expect(keys).toContain('fuera_de_limites')
    expect(keys).toContain('no_leido_fotocelula')
    expect(keys).toContain('puerta_no_preparada')
    expect(keys).toContain('otro')
  })

  it('cada causa tiene label, icon y defaultActionHint', () => {
    for (const def of Object.values(MATRIX_P0_CAUSES)) {
      expect(def.label).toBeTruthy()
      expect(def.icon).toBeTruthy()
      expect(def.defaultActionHint).toBeTruthy()
    }
  })
})
