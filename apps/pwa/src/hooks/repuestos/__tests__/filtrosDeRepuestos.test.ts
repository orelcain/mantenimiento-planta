import { describe, it, expect } from 'vitest'
import { esComun, esDespiece, esFavoritoDe, contarCon, type FilaFiltrable } from '../filtrosDeRepuestos'

const fila = (p: Partial<FilaFiltrable>): FilaFiltrable => ({ rowKey: 'k1', codigoSAP: '3300011612', ...p })

describe('esDespiece', () => {
  it('es despiece lo que no tiene código SAP', () => {
    expect(esDespiece(fila({ codigoSAP: null }))).toBe(true)
    expect(esDespiece(fila({ codigoSAP: '' }))).toBe(true)
    expect(esDespiece(fila({ codigoSAP: '3300011612' }))).toBe(false)
  })

  it('es el complemento exacto del foco SAP', () => {
    // El hub muestra `!esDespiece(r)` y cuenta `esDespiece(r)`: entre los dos, toda la lista.
    const lista = [fila({ codigoSAP: 'A' }), fila({ codigoSAP: null }), fila({ codigoSAP: 'B' })]
    expect(contarCon(lista, esDespiece) + lista.filter((r) => !esDespiece(r)).length).toBe(lista.length)
  })
})

describe('esComun', () => {
  it('cuenta el marcado como común en su equipo', () => {
    expect(esComun(fila({ comunEn: ['equipo-1'] }))).toBe(true)
    expect(esComun(fila({ comunEn: [] }))).toBe(false)
    expect(esComun(fila({ comunEn: null }))).toBe(false)
  })

  it('no revienta sin el campo', () => {
    expect(esComun({ rowKey: 'x' })).toBe(false)
  })
})

describe('esFavoritoDe', () => {
  it('mira la clave de fila del usuario', () => {
    const cumple = esFavoritoDe(new Set(['k1', 'k9']))
    expect(cumple(fila({ rowKey: 'k1' }))).toBe(true)
    expect(cumple(fila({ rowKey: 'k2' }))).toBe(false)
  })

  it('sin favoritos no cumple ninguno', () => {
    const cumple = esFavoritoDe(new Set())
    expect([fila({ rowKey: 'a' }), fila({ rowKey: 'b' })].filter(cumple)).toHaveLength(0)
  })
})

describe('contarCon coincide con filter', () => {
  const lista = [
    fila({ rowKey: 'a', codigoSAP: 'A', comunEn: ['e1'] }),
    fila({ rowKey: 'b', codigoSAP: null }),
    fila({ rowKey: 'c', codigoSAP: 'C' }),
  ]
  const favs = esFavoritoDe(new Set(['a', 'c']))

  it.each([
    ['esComun', esComun],
    ['esDespiece', esDespiece],
    ['favoritos', favs],
  ] as const)('%s: el conteo es el largo del filtrado', (_n, pred) => {
    expect(contarCon(lista, pred)).toBe(lista.filter(pred).length)
  })
})
