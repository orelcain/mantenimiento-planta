import { describe, it, expect } from 'vitest'
import { piezasDeSegmento, quedarSegmentos, type SegmentosTurno } from '../guardarTurnoGrader'

type Seg = { sessionDate: string; shiftId: string; pieceRecords: Array<{ pieces: number }> }

function multi(entries: Array<[string, Seg]>): SegmentosTurno {
  return {
    entries: entries as unknown as SegmentosTurno['entries'],
    uniqueDays: 0,
    totalSegments: entries.length,
    isP0Only: false,
    segmentosSoloP0: 0,
    segmentosConPiezas: entries.length,
  } as SegmentosTurno
}

const a: Seg = { sessionDate: '2026-11-18', shiftId: 'T1', pieceRecords: [{ pieces: 5 }, { pieces: 7 }] }
const b: Seg = { sessionDate: '2026-11-18', shiftId: 'T2', pieceRecords: [{ pieces: 3 }] }
const c: Seg = { sessionDate: '2026-11-19', shiftId: 'T1', pieceRecords: [] }

describe('piezasDeSegmento', () => {
  it('suma las piezas de sus registros', () => {
    expect(piezasDeSegmento(a)).toBe(12)
    expect(piezasDeSegmento(c)).toBe(0)
  })
})

describe('quedarSegmentos (regla 1: segmentos omitidos no se escriben)', () => {
  it('quita los segmentos que no pasan y recalcula contadores', () => {
    const todo = multi([['2026-11-18|T1', a], ['2026-11-18|T2', b], ['2026-11-19|T1', c]])
    const res = quedarSegmentos(todo, (k) => k !== '2026-11-18|T1')
    expect(res.entries.map(([k]) => k)).toEqual(['2026-11-18|T2', '2026-11-19|T1'])
    expect(res.totalSegments).toBe(2)
    expect(res.uniqueDays).toBe(2)
    expect(res.segmentosSoloP0).toBe(1)
    expect(res.segmentosConPiezas).toBe(1)
  })

  it('si todos se omiten, queda vacío', () => {
    const res = quedarSegmentos(multi([['k', a]]), () => false)
    expect(res.totalSegments).toBe(0)
    expect(res.entries).toHaveLength(0)
  })
})
