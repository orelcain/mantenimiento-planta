import { describe, it, expect } from 'vitest'
import { analyzeSegment, buildShiftTimeline } from '../graderShiftTimeline'
import type { PieceRecord, Gate0Record } from '../types'
import type { ShiftTimeWindow } from '../graderShiftStatus'

const mkPiece = (ts: string, gate: number, pieces = 10): PieceRecord => ({
  ts, gate, pieces,
})

const mkG0 = (ts: string, error: string, pieces = 5): Gate0Record => ({
  ts, gate: 0, pieces, error,
})

const WINDOW: ShiftTimeWindow = {
  status: 'closed',
  startAt: '2026-04-17T07:00:00.000Z',
  endAt: '2026-04-17T19:00:00.000Z',
  progressPct: null,
  elapsedMin: 720,
  remainingMin: null,
}

describe('analyzeSegment', () => {
  it('calcula p0Pct correctamente', () => {
    const pieces: PieceRecord[] = [
      mkPiece('2026-04-17T08:00:00.000Z', 1, 90),
      mkPiece('2026-04-17T08:00:00.000Z', 0, 10),
    ]
    const g0: Gate0Record[] = [
      mkG0('2026-04-17T08:00:00.000Z', 'Fuera de límites', 10),
    ]
    const result = analyzeSegment(pieces, g0, '2026-04-17T07:00:00.000Z', '2026-04-17T19:00:00.000Z')
    expect(result.totalPieces).toBe(100)
    expect(result.p0Pieces).toBe(10)
    expect(result.p0Pct).toBeCloseTo(10)
  })

  it('clasifica correctamente la causa Matrix dominante', () => {
    const pieces: PieceRecord[] = [mkPiece('2026-04-17T08:00:00.000Z', 1, 100)]
    const g0: Gate0Record[] = [
      mkG0('2026-04-17T08:00:00.000Z', 'No leído por fotocélula', 8),
      mkG0('2026-04-17T08:01:00.000Z', 'Fuera de límites', 2),
    ]
    const result = analyzeSegment(pieces, g0, '2026-04-17T07:00:00.000Z', '2026-04-17T19:00:00.000Z')
    const top = result.topCauses[0]
    expect(top).toBeDefined()
    expect(top?.cause).toBe('no_leido_fotocelula')
    expect(top?.pieces).toBe(8)
  })

  it('excluye registros fuera de la ventana', () => {
    const pieces: PieceRecord[] = [
      mkPiece('2026-04-16T08:00:00.000Z', 1, 100), // día anterior
    ]
    const g0: Gate0Record[] = []
    const result = analyzeSegment(pieces, g0, '2026-04-17T07:00:00.000Z', '2026-04-17T19:00:00.000Z')
    expect(result.totalPieces).toBe(0)
  })

  it('maneja caso sin piezas (p0Pct = 0)', () => {
    const result = analyzeSegment([], [], '2026-04-17T07:00:00.000Z', '2026-04-17T19:00:00.000Z')
    expect(result.p0Pct).toBe(0)
    expect(result.topCauses).toHaveLength(0)
  })
})

describe('buildShiftTimeline', () => {
  const pieces: PieceRecord[] = [
    mkPiece('2026-04-17T08:00:00.000Z', 1, 500),
    mkPiece('2026-04-17T10:00:00.000Z', 2, 500),
  ]
  const g0: Gate0Record[] = [
    mkG0('2026-04-17T08:00:00.000Z', 'Fuera de límites', 20),
  ]

  it('incluye shift-start y shift-end', () => {
    const result = buildShiftTimeline({
      dateKey: '2026-04-17',
      shiftId: 'Turno día',
      uploads: [],
      actions: [],
      pieceRecords: pieces,
      gate0Records: g0,
      shiftWindow: WINDOW,
    })
    const kinds = result.checkpoints.map(c => c.kind)
    expect(kinds).toContain('shift-start')
    expect(kinds).toContain('shift-end')
  })

  it('agrega uploads al timeline ordenado', () => {
    const result = buildShiftTimeline({
      dateKey: '2026-04-17',
      shiftId: 'Turno día',
      uploads: [{ at: '2026-04-17T09:00:00.000Z', by: 'supervisor', fileName: 'turno.xlsx' }],
      actions: [],
      pieceRecords: pieces,
      gate0Records: g0,
      shiftWindow: WINDOW,
    })
    const upload = result.checkpoints.find(c => c.kind === 'upload')
    expect(upload).toBeDefined()
    expect(upload?.kind === 'upload' && upload.fileName).toBe('turno.xlsx')
  })

  it('calcula el análisis global correctamente', () => {
    const result = buildShiftTimeline({
      dateKey: '2026-04-17',
      shiftId: 'Turno día',
      uploads: [],
      actions: [],
      pieceRecords: pieces,
      gate0Records: g0,
      shiftWindow: WINDOW,
    })
    expect(result.globalAnalysis.totalPieces).toBe(1000)
    expect(result.globalAnalysis.p0Pieces).toBe(20)
  })

  it('ordena checkpoints cronológicamente', () => {
    const result = buildShiftTimeline({
      dateKey: '2026-04-17',
      shiftId: 'Turno día',
      uploads: [{ at: '2026-04-17T11:00:00.000Z', by: 'u1', fileName: 'f1.xlsx' }],
      actions: [{ at: '2026-04-17T09:00:00.000Z', by: 'u1', action: { field: 'test', before: 1, after: 2 } }],
      pieceRecords: pieces,
      gate0Records: g0,
      shiftWindow: WINDOW,
    })
    const times = result.checkpoints.map(c => new Date(c.at).getTime())
    for (let i = 1; i < times.length; i++) {
      const prev = times[i - 1]
      const curr = times[i]
      if (prev !== undefined && curr !== undefined) {
        expect(curr).toBeGreaterThanOrEqual(prev)
      }
    }
  })
})
