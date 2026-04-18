import { describe, it, expect } from 'vitest'
import { toMatrixCause, parseMatrixErrorString, MATRIX_P0_CAUSES } from '../graderMatrixP0Causes'
import type { PointZeroCause } from '../types'

describe('parseMatrixErrorString', () => {
  it('clasifica "Fuera de límites" como fuera_de_limites (oficial Matrix)', () => {
    expect(parseMatrixErrorString('Fuera de límites')).toBe('fuera_de_limites')
    expect(parseMatrixErrorString('Fuera de Limites')).toBe('fuera_de_limites')
    expect(parseMatrixErrorString('fuera de límites')).toBe('fuera_de_limites')
    // La descomposición fina (fuera_de_calibre/calidad/etc) se hace en graderAnalytics
    // cuando hay pieceRecords con contexto. El parser sin contexto devuelve oficial.
    expect(parseMatrixErrorString('Fuera de rango')).toBe('fuera_de_limites')
  })

  it('clasifica "No leído por fotocélula" correctamente', () => {
    expect(parseMatrixErrorString('No leído por fotocélula')).toBe('no_leido_fotocelula')
    expect(parseMatrixErrorString('No leido por fotocelula')).toBe('no_leido_fotocelula')
    expect(parseMatrixErrorString('No Leído Por Fotocélula')).toBe('no_leido_fotocelula')
    expect(parseMatrixErrorString('Not read by photocell')).toBe('no_leido_fotocelula')
  })

  it('clasifica "Too close or too long" como causa oficial independiente', () => {
    expect(parseMatrixErrorString('Too close or too long')).toBe('too_close_too_long')
    expect(parseMatrixErrorString('too close')).toBe('too_close_too_long')
    expect(parseMatrixErrorString('Demasiado cerca')).toBe('too_close_too_long')
  })

  it('clasifica "Puerta no preparada" correctamente', () => {
    expect(parseMatrixErrorString('Puerta no preparada')).toBe('puerta_no_preparada')
    expect(parseMatrixErrorString('PUERTA NO PREPARADA')).toBe('puerta_no_preparada')
    expect(parseMatrixErrorString('Door not ready')).toBe('puerta_no_preparada')
  })

  it('retorna otro para strings desconocidos', () => {
    expect(parseMatrixErrorString('Desconocido')).toBe('otro')
    expect(parseMatrixErrorString('')).toBe('otro')
    expect(parseMatrixErrorString('Error genérico')).toBe('otro')
  })
})

describe('toMatrixCause', () => {
  const cases: Array<[PointZeroCause, ReturnType<typeof toMatrixCause>]> = [
    // fuera_de_rango ahora mapea a fuera_de_calibre (causa derivada dedicada)
    ['fuera_de_rango',      'fuera_de_calibre'],
    ['fuera_de_limites',    'fuera_de_limites'],
    ['no_leido_fotocelula', 'no_leido_fotocelula'],
    // too_close_too_long ahora es causa oficial Matrix independiente
    ['too_close_too_long',  'too_close_too_long'],
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
  it('tiene las 4 causas oficiales Matrix + 5 derivadas', () => {
    const keys = Object.keys(MATRIX_P0_CAUSES)
    // Oficiales
    expect(keys).toContain('fuera_de_limites')
    expect(keys).toContain('no_leido_fotocelula')
    expect(keys).toContain('too_close_too_long')
    expect(keys).toContain('puerta_no_preparada')
    // Derivadas
    expect(keys).toContain('fuera_de_calibre')
    expect(keys).toContain('fuera_de_calidad')
    expect(keys).toContain('fuera_de_conservacion')
    expect(keys).toContain('fuera_de_producto')
    // Residual
    expect(keys).toContain('otro')
  })

  it('cada causa tiene metadata completa (label, translation, icon, actionHint, etc)', () => {
    for (const def of Object.values(MATRIX_P0_CAUSES)) {
      expect(def.label).toBeTruthy()
      expect(def.translation).toBeTruthy()
      expect(def.icon).toBeTruthy()
      expect(def.color).toBeTruthy()
      expect(def.level).toMatch(/^(official|derived)$/)
      expect(def.shortDescription).toBeTruthy()
      expect(def.howDetected).toBeTruthy()
      expect(def.actionHint).toBeTruthy()
      expect(def.exampleTrigger).toBeTruthy()
    }
  })

  it('marca las 4 oficiales Matrix con level=official', () => {
    expect(MATRIX_P0_CAUSES.fuera_de_limites.level).toBe('official')
    expect(MATRIX_P0_CAUSES.no_leido_fotocelula.level).toBe('official')
    expect(MATRIX_P0_CAUSES.too_close_too_long.level).toBe('official')
    expect(MATRIX_P0_CAUSES.puerta_no_preparada.level).toBe('official')
  })

  it('marca las derivadas con level=derived', () => {
    expect(MATRIX_P0_CAUSES.fuera_de_calibre.level).toBe('derived')
    expect(MATRIX_P0_CAUSES.fuera_de_calidad.level).toBe('derived')
    expect(MATRIX_P0_CAUSES.fuera_de_conservacion.level).toBe('derived')
    expect(MATRIX_P0_CAUSES.fuera_de_producto.level).toBe('derived')
  })
})
