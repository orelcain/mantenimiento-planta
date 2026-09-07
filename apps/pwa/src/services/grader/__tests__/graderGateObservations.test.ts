import { describe, it, expect } from 'vitest'
import {
  computeGateObservations, deriveGateMix, configTimelineFromSnapshots, realIsoToWallClockMs,
  GATE_OBS_MAX_BUCKETS, GATE_OBS_MAX_COMBOS, OTROS, classifyGateCauses,
} from '../graderGateObservations'
import { ANY_CALIBRE, SIN_DATO } from '../graderGateMix'
import type { GateConfigSnapshot } from '../graderConfigSnapshot.service'
import type { GateAssignment, PieceRecord } from '../types'

const gate = (n: number, calibre: string, quality: GateAssignment['assignedQuality'], active = true): GateAssignment =>
  ({ gateNumber: n, assignedCalibre: calibre, assignedQuality: quality, active })

/** n piezas en `gate`, una por segundo desde `ts` (wall-clock marcado como Z). */
function pieces(gateNo: number, n: number, calibre: string | undefined, quality: PieceRecord['quality'], ts: string): PieceRecord[] {
  const base = Date.parse(`${ts}Z`)
  return Array.from({ length: n }, (_, i) => ({
    ts: new Date(base + i * 1000).toISOString(), gate: gateNo, pieces: 1, calibre, quality,
  }))
}

const G0 = [gate(5, '6-8 lb', 'Premium'), gate(6, '6-8 lb', 'Premium'), gate(12, ANY_CALIBRE, 'Industrial')]
const G1 = [gate(5, '6-8 lb', 'Premium'), gate(6, '4-6 lb', 'Premium'), gate(12, ANY_CALIBRE, 'Industrial')]

/** Snapshot con `at` en hora REAL UTC. Chile en septiembre = UTC-3. */
const snap = (atWallClock: string, gates: GateAssignment[], changes = 1): GateConfigSnapshot => ({
  id: atWallClock, shiftDocId: 'x', at: new Date(Date.parse(`${atWallClock}Z`) + 3 * 3600_000).toISOString(),
  changedBy: { uid: 'u', name: 'u' }, gates, changes: Array.from({ length: changes }, () => ({ gateNumber: 6, field: 'assignedCalibre', before: '6-8 lb', after: '4-6 lb' })) as never,
})

describe('realIsoToWallClockMs', () => {
  it('convierte hora real UTC a hora de pared de Chile (UTC-3 en septiembre)', () => {
    expect(realIsoToWallClockMs('2026-09-07T13:18:00.000Z')).toBe(Date.parse('2026-09-07T10:18:00Z'))
  })
  it('en invierno Chile es UTC-4', () => {
    expect(realIsoToWallClockMs('2026-07-15T14:00:00.000Z')).toBe(Date.parse('2026-07-15T10:00:00Z'))
  })
})

describe('computeGateObservations', () => {
  it('cuenta piezas por puerta, bloque y combinación calibre|calidad', () => {
    const obs = computeGateObservations([
      ...pieces(6, 30, '6-8 lb', 'Premium', '2026-09-07T07:20:00'),
      ...pieces(6, 4, '4-6 lb', 'Premium', '2026-09-07T07:21:00'),
      ...pieces(6, 2, '6-8 lb', 'Premium', '2026-09-07T08:05:00'),
      ...pieces(5, 1, undefined, 'Premium', '2026-09-07T07:50:00'),
    ])!
    expect(obs.schema).toBe(2)
    expect(obs.bucketsFrom).toBe('2026-09-07T07:00:00.000Z')
    expect(obs.bucketCount).toBe(3)
    const g6 = obs.gates.find((g) => g.gate === 6)!
    expect(g6.pieces).toBe(36)
    expect(g6.byBucket).toEqual([{ '6-8 lb|Premium': 30, '4-6 lb|Premium': 4 }, null, { '6-8 lb|Premium': 2 }])
    const g5 = obs.gates.find((g) => g.gate === 5)!
    expect(g5.byBucket[1]).toEqual({ [`${SIN_DATO}|Premium`]: 1 })
  })

  it('tope de 8 combinaciones por bloque: el resto se suma en Otros', () => {
    const recs: PieceRecord[] = []
    const cals = ['0-2 lb', '2-4 lb', '4-6 lb', '6-8 lb', '8-10 lb', '10-12 lb']
    const quals: PieceRecord['quality'][] = ['Premium', 'Grado']
    let k = 0
    for (const c of cals) for (const q of quals) recs.push(...pieces(3, 12 - k++, c, q, '2026-09-07T07:00:00'))
    const b = computeGateObservations(recs)!.gates[0]!.byBucket[0]!
    expect(Object.keys(b)).toHaveLength(GATE_OBS_MAX_COMBOS + 1)
    expect(b[OTROS]).toBe(4 + 3 + 2 + 1)
  })

  it('tope de bloques: un timestamp basura no infla el doc', () => {
    const obs = computeGateObservations([
      ...pieces(1, 5, '4-6 lb', 'Premium', '2026-09-07T07:00:00'),
      ...pieces(1, 1, '4-6 lb', 'Premium', '2026-09-09T07:00:00'),
    ])!
    expect(obs.bucketCount).toBe(GATE_OBS_MAX_BUCKETS)
    expect(obs.gates[0]!.pieces).toBe(5)
  })

  it('ignora gate 0 y devuelve null sin piezas productivas', () => {
    expect(computeGateObservations(pieces(0, 5, undefined, undefined, '2026-09-07T07:00:00'))).toBeNull()
  })
})

describe('deriveGateMix', () => {
  const recs = [
    ...pieces(6, 60, '6-8 lb', 'Premium', '2026-09-07T09:00:00'),
    ...pieces(6, 5, '4-6 lb', 'Premium', '2026-09-07T09:10:00'),
    ...pieces(6, 60, '4-6 lb', 'Premium', '2026-09-07T10:40:00'),
    ...pieces(6, 5, '6-8 lb', 'Premium', '2026-09-07T10:50:00'),
    ...pieces(12, 10, '4-6 lb', 'Industrial', '2026-09-07T09:00:00'),
  ]
  const obs = computeGateObservations(recs)!

  it('con una sola config reproduce el juicio de v1', () => {
    const mix = deriveGateMix(obs, configTimelineFromSnapshots([], G0))
    const g6 = mix.gates.find((g) => g.gate === 6)!
    expect(g6.purityByBucket).toEqual([92.3, null, null, 7.7])
    expect(g6.purityPct).toBe(50)
    expect(g6.topIntruder).toEqual({ kind: 'calibre', value: '4-6 lb', pct: 50 })
    expect(mix.changeBuckets).toEqual([])
  })

  it('con el cambio de gate a las 10:18 juzga cada bloque con su config y marca el bloque del cambio', () => {
    const mix = deriveGateMix(obs, configTimelineFromSnapshots([snap('2026-09-07T07:15:00', G0, 0), snap('2026-09-07T10:18:00', G1)], G0))
    const g6 = mix.gates.find((g) => g.gate === 6)!
    expect(g6.purityByBucket).toEqual([92.3, null, null, 92.3])
    expect(g6.purityPct).toBe(92.3)
    expect(g6.assignedCalibre).toBe('4-6 lb')
    // el intruso se acumula contra la config de cada bloque: 5 de 4-6 antes + 5 de 6-8 después
    expect(g6.topIntruder).toEqual({ kind: 'calibre', value: '4-6 lb', pct: 3.8 })
    expect(mix.changeBuckets).toEqual([2])
  })

  it('Other acepta cualquier calibre y solo compara calidad', () => {
    const g12 = deriveGateMix(obs, configTimelineFromSnapshots([], G0)).gates.find((g) => g.gate === 12)!
    expect(g12.purityPct).toBe(100)
  })

  it('una puerta sin asignación conserva los desgloses y queda sin pureza', () => {
    const mix = deriveGateMix(obs, configTimelineFromSnapshots([], [gate(5, '6-8 lb', 'Premium')]))
    const g6 = mix.gates.find((g) => g.gate === 6)!
    expect(g6.purityPct).toBeNull()
    expect(g6.assignedCalibre).toBeUndefined()
    expect(g6.byCalibre).toEqual({ '6-8 lb': 65, '4-6 lb': 65 })
    expect(g6.purityByBucket).toEqual([null, null, null, null])
  })

  it('Otros nunca coincide', () => {
    const o = { ...obs, gates: [{ gate: 6, pieces: 10, byBucket: [{ '6-8 lb|Premium': 8, [OTROS]: 2 }] }], bucketCount: 1 }
    const g6 = deriveGateMix(o, configTimelineFromSnapshots([], G0)).gates[0]!
    expect(g6.purityPct).toBe(80)
  })
})

describe('classifyGateCauses · ¿por qué cayó acá?', () => {
  const ALL = [
    gate(2, '4-6 lb', 'Premium'), gate(5, '6-8 lb', 'Premium'), gate(6, '6-8 lb', 'Premium'),
    gate(8, '8-10 lb', 'Premium'), gate(9, '2-4 lb', 'Premium'), gate(11, '6-8 lb', 'Grado'),
  ]
  const recs = [
    ...pieces(6, 80, '6-8 lb', 'Premium', '2026-09-07T09:00:00'),
    ...pieces(6, 10, '4-6 lb', 'Premium', '2026-09-07T09:10:00'),   // vecino, debía ir a G2 (atrás)
    ...pieces(6, 4, '2-4 lb', 'Premium', '2026-09-07T09:20:00'),    // lejano, debía ir a G9 (adelante)
    ...pieces(6, 5, '6-8 lb', 'Grado', '2026-09-07T10:00:00'),      // calidad, debía ir a G11
    ...pieces(6, 1, undefined, 'Premium', '2026-09-07T10:05:00'),   // sin dato
  ]
  const obs = computeGateObservations(recs)!
  const causes = classifyGateCauses(obs, 6, configTimelineFromSnapshots([], ALL))!

  it('agrupa por causal y valor, ordenado por piezas, con a qué gate debía ir', () => {
    expect(causes.judged).toBe(100)
    expect(causes.groups.map((g) => [g.tipo, g.value, g.pieces, g.pct, g.debiaIr, g.origen])).toEqual([
      ['calibre_vecino', '4-6 lb', 10, 10, [2], 'atras'],
      ['calidad', 'Grado', 5, 5, [11], 'adelante'],
      ['calibre_lejano', '2-4 lb', 4, 4, [9], 'adelante'],
      ['sin_dato', SIN_DATO, 1, 1, [], 'ninguna'],
    ])
  })

  it('dice en qué bloques se concentra cada causal', () => {
    const vecino = causes.groups.find((g) => g.tipo === 'calibre_vecino')!
    expect([vecino.desde, vecino.hasta, vecino.parejo]).toEqual([0, 0, false])
    expect(causes.okByBucket).toEqual([80, 0, 0])
    expect(causes.byTipoByBucket.calidad).toEqual([0, 0, 5])
  })

  it('la conservación entra a la clave solo si el Excel la trae, y se compara solo si la gate la tiene asignada', () => {
    const recsC: PieceRecord[] = [
      ...pieces(5, 9, '6-8 lb', 'Premium', '2026-09-07T09:00:00').map((r) => ({ ...r, conservation: 'FRESCO' as const })),
      ...pieces(5, 1, '6-8 lb', 'Premium', '2026-09-07T09:00:00').map((r) => ({ ...r, conservation: 'CONGELADO' as const })),
    ]
    const o = computeGateObservations(recsC)!
    expect(Object.keys(o.gates[0]!.byBucket[0]!)).toEqual(['6-8 lb|Premium|FRESCO', '6-8 lb|Premium|CONGELADO'])
    const sinCons = deriveGateMix(o, configTimelineFromSnapshots([], [gate(5, '6-8 lb', 'Premium')])).gates[0]!
    expect(sinCons.purityPct).toBe(100)
    const conCons = deriveGateMix(o, configTimelineFromSnapshots([], [{ ...gate(5, '6-8 lb', 'Premium'), assignedConservation: 'FRESCO' }])).gates[0]!
    expect(conCons.purityPct).toBe(90)
    const c = classifyGateCauses(o, 5, configTimelineFromSnapshots([], [{ ...gate(5, '6-8 lb', 'Premium'), assignedConservation: 'FRESCO' }]))!
    expect(c.groups[0]).toMatchObject({ tipo: 'conservacion', value: 'CONGELADO', pieces: 1 })
  })

  it('devuelve null si la puerta no tiene piezas', () => {
    expect(classifyGateCauses(obs, 3, configTimelineFromSnapshots([], ALL))).toBeNull()
  })
})
