import { describe, it, expect } from 'vitest'
import { computeGateMix, gateMixTotals, ANY_CALIBRE, SIN_DATO } from '../graderGateMix'
import { computeShiftSummary, type ShiftSegment } from '../graderSegmenter'
import type { GateAssignment, PieceRecord } from '../types'

const gate = (n: number, calibre: string, quality: GateAssignment['assignedQuality'], active = true): GateAssignment =>
  ({ gateNumber: n, assignedCalibre: calibre, assignedQuality: quality, active })

/** n piezas de 1 en `gate`, repartidas desde `ts` cada `stepSec` segundos. */
function pieces(
  gateNo: number, n: number, calibre: string | undefined, quality: PieceRecord['quality'],
  ts = '2026-09-07T07:20:00', stepSec = 1,
): PieceRecord[] {
  // Convención del módulo: wall-clock del Grader marcado como Z.
  const base = Date.parse(`${ts}Z`)
  return Array.from({ length: n }, (_, i) => ({
    ts: new Date(base + i * stepSec * 1000).toISOString(),
    gate: gateNo, pieces: 1, calibre, quality,
  }))
}

const GATES = [gate(5, '6-8 lb', 'Premium'), gate(6, '6-8 lb', 'Premium'), gate(12, ANY_CALIBRE, 'Industrial')]

describe('computeGateMix', () => {
  it('una puerta pura da 100 % y ningún intruso', () => {
    const mix = computeGateMix(pieces(5, 40, '6-8 lb', 'Premium'), GATES)!
    const g5 = mix.gates.find(g => g.gate === 5)!
    expect(g5.purityPct).toBe(100)
    expect(g5.matchPieces).toBe(40)
    expect(g5.topIntruder).toBeUndefined()
    expect(g5.byCalibre).toEqual({ '6-8 lb': 40 })
    expect(g5.byQuality).toEqual({ Premium: 40 })
  })

  it('la pureza exige calibre Y calidad; el intruso mayor es el que se reporta', () => {
    // G6: 70 bien · 18 con calibre 4-6 (calidad ok) · 11 Grado (calibre ok) · 1 ambos mal
    const recs = [
      ...pieces(6, 70, '6-8 lb', 'Premium'),
      ...pieces(6, 18, '4-6 lb', 'Premium'),
      ...pieces(6, 11, '6-8 lb', 'Grado'),
      ...pieces(6, 1, '4-6 lb', 'Grado'),
    ]
    const g6 = computeGateMix(recs, GATES)!.gates.find(g => g.gate === 6)!
    expect(g6.pieces).toBe(100)
    expect(g6.purityPct).toBe(70)
    expect(g6.byCalibre).toEqual({ '6-8 lb': 81, '4-6 lb': 19 })
    expect(g6.byQuality).toEqual({ Premium: 88, Grado: 12 })
    expect(g6.topIntruder).toEqual({ kind: 'calibre', value: '4-6 lb', pct: 19 })
  })

  it('assignedCalibre "Other" acepta cualquier calibre y solo compara calidad', () => {
    const recs = [
      ...pieces(12, 30, '4-6 lb', 'Industrial'),
      ...pieces(12, 20, '8-10 lb', 'Industrial'),
      ...pieces(12, 5, '6-8 lb', 'Premium'),
    ]
    const g12 = computeGateMix(recs, GATES)!.gates.find(g => g.gate === 12)!
    expect(g12.purityPct).toBe(r(50 / 55))
    expect(g12.topIntruder).toEqual({ kind: 'quality', value: 'Premium', pct: r(5 / 55) })
  })

  it('una pieza sin calibre o sin calidad no coincide y se cuenta como "Sin dato"', () => {
    const recs = [...pieces(5, 9, '6-8 lb', 'Premium'), ...pieces(5, 1, undefined, 'Premium')]
    const g5 = computeGateMix(recs, GATES)!.gates.find(g => g.gate === 5)!
    expect(g5.purityPct).toBe(90)
    expect(g5.byCalibre[SIN_DATO]).toBe(1)
  })

  it('una puerta sin asignación activa conserva los desgloses pero no tiene pureza', () => {
    const gates = [gate(5, '6-8 lb', 'Premium', false)]
    const g5 = computeGateMix(pieces(5, 10, '6-8 lb', 'Premium'), gates)!.gates[0]!
    expect(g5.purityPct).toBeNull()
    expect(g5.matchPieces).toBe(0)
    expect(g5.assignedCalibre).toBeUndefined()
    expect(g5.byCalibre).toEqual({ '6-8 lb': 10 })
    expect(g5.purityByBucket).toEqual([null])
  })

  it('los bloques de 30 min van alineados al reloj y quedan en null donde la puerta no recibió', () => {
    const recs = [
      ...pieces(5, 10, '6-8 lb', 'Premium', '2026-09-07T07:20:00'),   // bloque 07:00
      ...pieces(5, 10, '4-6 lb', 'Premium', '2026-09-07T08:05:00'),   // bloque 08:00 (mezclado)
      ...pieces(6, 4, '6-8 lb', 'Premium', '2026-09-07T07:40:00'),    // bloque 07:30
    ]
    const mix = computeGateMix(recs, GATES)!
    expect(mix.bucketsFrom).toBe('2026-09-07T07:00:00.000Z')
    expect(mix.bucketMinutes).toBe(30)
    expect(mix.bucketCount).toBe(3)
    const g5 = mix.gates.find(g => g.gate === 5)!
    const g6 = mix.gates.find(g => g.gate === 6)!
    expect(g5.purityByBucket).toEqual([100, null, 0])
    expect(g6.purityByBucket).toEqual([null, 100, null])
  })

  it('ignora gate 0 y devuelve null sin piezas productivas', () => {
    expect(computeGateMix([{ ts: '2026-09-07T07:00:00', gate: 0, pieces: 5 }], GATES)).toBeNull()
    expect(computeGateMix([], GATES)).toBeNull()
  })

  it('gateMixTotals suma solo las puertas con asignación', () => {
    const recs = [
      ...pieces(5, 90, '6-8 lb', 'Premium'),
      ...pieces(5, 10, '4-6 lb', 'Premium'),
      ...pieces(9, 50, '10-12 lb', 'Premium'), // sin asignación
    ]
    expect(gateMixTotals(computeGateMix(recs, GATES)!)).toEqual({ match: 90, pieces: 100, purityPct: 90 })
  })
})

describe('computeShiftSummary + gateMix', () => {
  const segment = (records: PieceRecord[]): ShiftSegment => ({
    sessionDate: '2026-09-07', shiftId: 'Turno 1', pieceRecords: records, gate0Records: [],
  })

  it('guarda gateMix cuando hay gates activas', () => {
    const s = computeShiftSummary(segment(pieces(6, 20, '4-6 lb', 'Premium')), 'b', [], 'u', GATES)
    expect(s.gateMix?.gates.find(g => g.gate === 6)?.purityPct).toBe(0)
    expect(s.gateMix?.gates.find(g => g.gate === 6)?.topIntruder?.value).toBe('4-6 lb')
  })

  it('no agrega gateMix sin config de gates (plantas que no clasifican)', () => {
    const s = computeShiftSummary(segment(pieces(6, 20, '4-6 lb', 'Premium')), 'b', [], 'u')
    expect(s.gateMix).toBeUndefined()
  })
})

function r(frac: number): number {
  return Math.round(frac * 1000) / 10
}

describe('computeShiftSummary · causas P0 con la config de cada hora', () => {
  it('usa configAt por pieza cuando se le pasa', async () => {
    const { configTimelineFromSnapshots } = await import('../graderGateObservations')
    const antes = [{ gateNumber: 1, assignedCalibre: '4-6 lb', assignedQuality: 'Industrial', active: true }] as GateAssignment[]
    const despues = [{ gateNumber: 1, assignedCalibre: '2-4 lb', assignedQuality: 'Industrial', active: true }] as GateAssignment[]
    const snaps = [
      { id: 'a', shiftDocId: 'x', at: '2026-09-07T10:15:00.000Z', changedBy: { uid: 'u', name: 'u' }, gates: antes, changes: [] },
      { id: 'b', shiftDocId: 'x', at: '2026-09-07T13:18:00.000Z', changedBy: { uid: 'u', name: 'u' }, gates: despues, changes: [{ gateNumber: 1, field: 'assignedCalibre', before: '4-6 lb', after: '2-4 lb' }] },
    ] as never
    const timeline = configTimelineFromSnapshots(snaps, antes)
    const p0 = (ts: string, n: number) => ({ ts, gate: 0 as const, pieces: n, error: 'Fuera de límites', weightPerPieceGrams: 2000, quality: 'Industrial' as const })
    const segment: ShiftSegment = {
      sessionDate: '2026-09-07', shiftId: 'Turno 1', pieceRecords: [],
      gate0Records: [p0('2026-09-07T09:00:00.000Z', 10), p0('2026-09-07T11:00:00.000Z', 7)],
    }
    const s = computeShiftSummary(segment, 'b', [], 'u', despues, timeline.configAt)
    const pz = (k: string) => s.topP0Causes?.find((c) => c.error === k)?.pieces ?? 0
    expect(pz('fuera_de_limites')).toBe(10)
    expect(pz('fuera_de_calibre')).toBe(7)
    expect(s.gatesUsed).toEqual(despues)
  })
})
