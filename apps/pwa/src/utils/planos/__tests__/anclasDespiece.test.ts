import { describe, expect, it } from 'vitest'
import { aplicarAIndice, aplicarATags, cajaDeToque, colaRevision, hechasHoy, idAncla, type AnclaDespiece } from '../anclasDespiece'

const VB = new Map<number, number[]>([[45, [595, 842]], [20, [595, 842]]])
const RESPALDO: [number, number, number, number] = [148.8, 210.5, 297.5, 421.0]

describe('anclasDespiece', () => {
  it('el toque deja una caja de número de globo centrada', () => {
    expect(cajaDeToque(100, 200)).toEqual([93, 193, 14, 14])
  })

  it('id estable por plano, hoja y posición', () => {
    expect(idAncla('baader-200-despiece', 45, '8')).toBe('baader-200-despiece__45__8')
  })

  it('el ancla reemplaza la marca vieja de su posición en esa hoja', () => {
    const tags = [{ t: '8', b: [1, 1, 5, 5] as [number, number, number, number] }, { t: '9', b: [2, 2, 5, 5] as [number, number, number, number] }]
    const anclas: AnclaDespiece[] = [{ hoja: 45, pos: '8', b: [10, 10, 14, 14], estado: 'ubicada' }]
    expect(aplicarATags(tags, 45, anclas)).toEqual([{ t: '9', b: [2, 2, 5, 5] }, { t: '8', b: [10, 10, 14, 14] }])
    expect(aplicarATags(tags, 20, anclas)).toEqual(tags)
  })

  it('corrige el índice por código y saca la ubicación de la cola', () => {
    const indice = { '1890312000': [{ h: 20, c: 0, b: [369, 393, 9, 8] as [number, number, number, number] }, { h: 45, c: 0, b: RESPALDO }] }
    const sap = { '1890312000': { s: '3300012202' } }
    expect(colaRevision(indice, sap, VB, [])).toEqual([{ codigo: '1890312000', h: 45 }])
    const anclas: AnclaDespiece[] = [{ hoja: 45, pos: '8', codigo: '1890312000', b: [10, 10, 14, 14], estado: 'ubicada' }]
    const corregido = aplicarAIndice(indice, VB, anclas)
    expect(corregido['1890312000']![1]!.b).toEqual([10, 10, 14, 14])
    expect(indice['1890312000'][1]!.b).toEqual(RESPALDO) // no muta el original
    expect(colaRevision(corregido, sap, VB, anclas)).toEqual([])
  })

  it('«no está en este dibujo» también sale de la cola; sin SAP nunca entra', () => {
    const indice = { A: [{ h: 45, c: 0, b: RESPALDO }], B: [{ h: 45, c: 0, b: RESPALDO }] }
    const anclas: AnclaDespiece[] = [{ hoja: 45, pos: '3', codigo: 'A', b: null, estado: 'no-esta' }]
    expect(colaRevision(indice, { A: {} }, VB, anclas)).toEqual([])
    expect(colaRevision(indice, { A: {}, B: {} }, VB, anclas)).toEqual([{ codigo: 'B', h: 45 }])
  })

  it('cuenta lo hecho hoy', () => {
    const ahora = new Date(2026, 9, 16, 15).getTime()
    const anclas: AnclaDespiece[] = [
      { hoja: 1, pos: '1', b: [0, 0, 1, 1], estado: 'ubicada', en: ahora - 1000 },
      { hoja: 1, pos: '2', b: null, estado: 'no-esta', en: ahora - 2000 },
      { hoja: 1, pos: '3', b: [0, 0, 1, 1], estado: 'ubicada', en: ahora - 86_400_000 },
    ]
    expect(hechasHoy(anclas, ahora)).toEqual({ ubicadas: 1, noEsta: 1 })
  })
})
