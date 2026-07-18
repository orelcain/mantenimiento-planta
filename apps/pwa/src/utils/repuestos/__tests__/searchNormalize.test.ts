import { describe, it, expect } from 'vitest'
import { normalizeForSearch, termVariants, haystackMatchesAll } from '../searchNormalize'

describe('termVariants', () => {
  it('plural simple: agrega la variante sin -s', () => {
    expect(termVariants('guantes')).toContain('guante')
    expect(termVariants('rodamientos')).toContain('rodamiento')
  })

  it('plural en -es: agrega variantes sin -s y sin -es', () => {
    expect(termVariants('motores')).toContain('motore')
    expect(termVariants('motores')).toContain('motor')
  })

  it('plural en -ces: agrega la variante en -z', () => {
    expect(termVariants('luces')).toContain('luz')
  })

  it('conserva siempre el término original', () => {
    expect(termVariants('guantes')[0]).toBe('guantes')
    expect(termVariants('sello')).toEqual(['sello'])
  })

  it('términos cortos no se des-pluralizan', () => {
    expect(termVariants('los')).toEqual(['los'])
    expect(termVariants('des')).toEqual(['des'])
  })
})

describe('haystackMatchesAll (singular/plural)', () => {
  const hay = (s: string) => normalizeForSearch(s)

  it('query plural encuentra ítems en singular', () => {
    expect(haystackMatchesAll(hay('GUANTE ANTICORTE METALICO'), ['guantes'])).toBe(true)
    expect(haystackMatchesAll(hay('MOTOR ELECTRICO 5HP'), ['motores'])).toBe(true)
  })

  it('query singular sigue encontrando plural (substring)', () => {
    expect(haystackMatchesAll(hay('GUANTES DE NITRILO'), ['guante'])).toBe(true)
  })

  it('multi-término AND: todos deben matchear', () => {
    expect(haystackMatchesAll(hay('GUANTE ANTICORTE VERDE'), ['guantes', 'anticorte'])).toBe(true)
    expect(haystackMatchesAll(hay('GUANTE ANTICORTE VERDE'), ['guantes', 'azul'])).toBe(false)
  })

  it('no matchea lo que no corresponde', () => {
    expect(haystackMatchesAll(hay('SELLO MECANICO'), ['guantes'])).toBe(false)
  })
})
