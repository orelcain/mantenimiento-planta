import { describe, it, expect } from 'vitest'
import {
  computeGateObservations, deriveGateMix, configTimelineFromSnapshots, realIsoToWallClockMs,
  GATE_OBS_MAX_BUCKETS, GATE_OBS_MAX_COMBOS, OTROS, classifyGateCauses, derivePesoPorPuerta, detectSolapesDeRango, inferirSeteoFaltante,
  detectCambiosDePrograma, wallClockMsToRealIso, rangesFingerprint, normalizarCalibre, CALIBRE_12_UP,
  deriveMezcla, mapaPesoDePuerta,
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

describe('seteo ≠ máquina (medido 07-09: 5 de 11 puertas)', () => {
  const G = [gate(3, '4-6 lb', 'Premium'), gate(5, '6-8 lb', 'Premium'), gate(6, '6-8 lb', 'Premium')]
  // G3: la máquina manda 6-8 Premium el 98 % de las veces; el seteo dice 4-6.
  const recs = [
    ...pieces(3, 98, '6-8 lb', 'Premium', '2026-09-07T09:00:00'),
    ...pieces(3, 2, '2-4 lb', 'Premium', '2026-09-07T09:05:00'),
    // G6: mezcla real, 70/30
    ...pieces(6, 70, '6-8 lb', 'Premium', '2026-09-07T09:00:00'),
    ...pieces(6, 30, '4-6 lb', 'Premium', '2026-09-07T09:05:00'),
  ]
  const obs = computeGateObservations(recs)!
  const timeline = configTimelineFromSnapshots([], G)

  it('detecta la puerta con seteo distinto y no la que está mezclada', () => {
    const mix = deriveGateMix(obs, timeline)
    expect(mix.seteoDistinto).toEqual({ 3: { calibre: '6-8 lb', quality: 'Premium', pct: 98 } })
    expect(mix.gates.find((g) => g.gate === 3)!.purityPct).toBe(0)
    expect(mix.gates.find((g) => g.gate === 6)!.purityPct).toBe(70)
  })

  it('en las causales la combinación dominante sale como seteo_distinto, con a qué gate iba según la app', () => {
    const c = classifyGateCauses(obs, 3, timeline)!
    expect(c.groups[0]).toMatchObject({ tipo: 'seteo_distinto', value: '6-8 lb · Premium', pieces: 98, debiaIr: [5, 6] })
    expect(c.groups[1]).toMatchObject({ tipo: 'calibre_vecino', value: '2-4 lb', pieces: 2 })
    expect(c.byTipoByBucket.seteo_distinto[0]).toBe(98)
  })

  it('una puerta que coincide con la máquina no se marca aunque tenga 100 % dominante', () => {
    const ok = computeGateObservations(pieces(5, 50, '6-8 lb', 'Premium', '2026-09-07T09:00:00'))!
    expect(deriveGateMix(ok, timeline).seteoDistinto).toEqual({})
  })

  it('la etiqueta Other del Excel es "calibre que la app no conoce", no un lejano', () => {
    const o = computeGateObservations([...pieces(5, 90, '6-8 lb', 'Premium', '2026-09-07T09:00:00'), ...pieces(5, 10, ANY_CALIBRE, 'Premium', '2026-09-07T09:05:00')])!
    const c = classifyGateCauses(o, 5, timeline)!
    expect(c.groups[0]).toMatchObject({ tipo: 'calibre_no_reconocido', pieces: 10 })
    expect(deriveGateMix(o, timeline).seteoDistinto).toEqual({})
  })
})

describe('mezcla física por peso (ronda 2)', () => {
  const RANGES = [
    { calibre: '6-8 lb', label: '', minGrams: 2749, maxGrams: 3665 },
    { calibre: '8-10 lb', label: '', minGrams: 3665, maxGrams: 4581 },
  ]
  const conPeso = (g: number, n: number, gateNo = 8, ts = '2026-09-07T09:00:00') =>
    pieces(gateNo, n, '8-10 lb', 'Premium', ts).map((r) => ({ ...r, weightPerPieceGrams: g }))

  it('guarda el histograma de peso por bloque en bins de 100 g, con el ancho en el doc', () => {
    const obs = computeGateObservations([...conPeso(4120, 3), ...conPeso(4700, 2), ...conPeso(4500, 1)])!
    expect(obs.weightBinGrams).toBe(100)
    expect(obs.gates[0]!.weightByBucket).toEqual([{ '4100': 3, '4700': 2, '4500': 1 }])
  })

  it('un doc viejo sin weightBinGrams se lee con bins de 250 g', () => {
    const obs = computeGateObservations(conPeso(4120, 10))!
    const legacy = { ...obs, weightBinGrams: undefined, gates: [{ ...obs.gates[0]!, weightByBucket: [{ '4500': 10 }] }] }
    const p = derivePesoPorPuerta(legacy, configTimelineFromSnapshots([], [gate(8, '8-10 lb', 'Premium')]), RANGES)[8]!
    // 4.500–4.750 cruza el techo 4.581 → al límite; con 100 g sería fuera.
    expect(p).toMatchObject({ alLimite: 10, fueraArriba: 0, binGrams: 250 })
  })

  it('juzga contra el rango del seteo: dentro, al límite (bin que cruza) y fuera con los kilos', () => {
    const obs = computeGateObservations([...conPeso(4120, 80), ...conPeso(4500, 8), ...conPeso(4800, 10), ...conPeso(4900, 2)])!
    const p = derivePesoPorPuerta(obs, configTimelineFromSnapshots([], [gate(8, '8-10 lb', 'Premium')]), RANGES)[8]!
    expect(p).toMatchObject({ conPeso: 100, dentro: 80, alLimite: 8, fueraArriba: 12, fueraAbajo: 0, pctFuera: 12, binGrams: 100 })
    expect(p.gramosArriba).toEqual([4800, 5000])
    expect(p.rango).toEqual({ calibre: '8-10 lb', minGrams: 3665, maxGrams: 4581 })
  })

  it('la etiqueta no importa: el peso se juzga contra el calibre ASIGNADO en cada bloque', () => {
    const obs = computeGateObservations(conPeso(4120, 10))!
    const p = derivePesoPorPuerta(obs, configTimelineFromSnapshots([], [gate(8, '6-8 lb', 'Premium')]), RANGES)[8]!
    expect(p).toMatchObject({ fueraArriba: 10, pctFuera: 100 })
  })

  it('sin rango conocido, con Other asignado o sin peso guardado no juzga', () => {
    const obs = computeGateObservations(conPeso(4120, 10))!
    expect(derivePesoPorPuerta(obs, configTimelineFromSnapshots([], [gate(8, ANY_CALIBRE, 'Premium')]), RANGES)).toEqual({})
    expect(derivePesoPorPuerta(obs, configTimelineFromSnapshots([], [gate(8, '2-4 lb', 'Premium')]), RANGES)).toEqual({})
    const sinPeso = computeGateObservations(pieces(8, 5, '8-10 lb', 'Premium', '2026-09-07T09:00:00'))!
    expect(sinPeso.gates[0]!.weightByBucket).toBeUndefined()
    expect(derivePesoPorPuerta(sinPeso, configTimelineFromSnapshots([], [gate(8, '8-10 lb', 'Premium')]), RANGES)).toEqual({})
  })
})

describe('etiqueta Other dominante = calibre no reconocido, no mezcla (G12 hoy: 38 pz de 5,5 kg)', () => {
  it('marca noReconocido y no ofrece seteo_distinto', () => {
    const obs = computeGateObservations(pieces(12, 38, ANY_CALIBRE, 'Premium', '2026-09-07T09:00:00'))!
    const timeline = configTimelineFromSnapshots([], [gate(12, '10-12 lb', 'Premium')])
    expect(deriveGateMix(obs, timeline).seteoDistinto).toEqual({ 12: { calibre: ANY_CALIBRE, quality: 'Premium', pct: 100, noReconocido: true } })
    expect(classifyGateCauses(obs, 12, timeline)!.groups[0]).toMatchObject({ tipo: 'calibre_no_reconocido', pieces: 38 })
  })
})

describe('programas de calibre solapados en el Z2 (medido hoy: 8-10 hasta 4,98 kg y 10-12 desde 4,59 kg)', () => {
  const G = [gate(8, '8-10 lb', 'Premium'), gate(10, '10-12 lb', 'Premium')]
  const w = (gateNo: number, cal: string, g: number, n: number) =>
    pieces(gateNo, n, cal, 'Premium', '2026-09-07T09:00:00').map((r) => ({ ...r, weightPerPieceGrams: g }))

  it('detecta el tramo en común entre dos calibres consecutivos con los percentiles 2–98', () => {
    const obs = computeGateObservations([
      ...w(8, '8-10 lb', 3800, 40), ...w(8, '8-10 lb', 4200, 40), ...w(8, '8-10 lb', 4700, 15), ...w(8, '8-10 lb', 4900, 5),
      ...w(10, '10-12 lb', 4600, 20), ...w(10, '10-12 lb', 5100, 40), ...w(10, '10-12 lb', 5400, 20),
    ])!
    const s = detectSolapesDeRango(obs, configTimelineFromSnapshots([], G))
    expect(s).toHaveLength(1)
    expect(s[0]).toMatchObject({ calibreA: '8-10 lb', calibreB: '10-12 lb', hastaA: 5000, desdeB: 4600, gramos: 400, piezasA: 20, piezasB: 20 })
  })

  it('no avisa cuando el corte es limpio ni con menos de 30 piezas', () => {
    const limpio = computeGateObservations([...w(8, '8-10 lb', 4200, 50), ...w(8, '8-10 lb', 4500, 10), ...w(10, '10-12 lb', 4700, 50)])!
    expect(detectSolapesDeRango(limpio, configTimelineFromSnapshots([], G))).toEqual([])
    const pocas = computeGateObservations([...w(8, '8-10 lb', 4900, 10), ...w(10, '10-12 lb', 4600, 10)])!
    expect(detectSolapesDeRango(pocas, configTimelineFromSnapshots([], G))).toEqual([])
  })
})

describe('P0 con los rangos configurados de la app', () => {
  it('con el 8-10 hasta 5.000 g, una pieza de 4,8 kg deja de ser "fuera de calibre"', async () => {
    const { classifyGate0Records } = await import('../graderGate0Store')
    const gates = [gate(8, '8-10 lb', 'Industrial')]
    const rec = { ts: '2026-09-07T09:00:00.000Z', pieces: 5, error: 'Fuera de límites', weightPerPieceGrams: 4800, quality: 'Industrial' }
    const constantes = classifyGate0Records([rec], gates, 5)
    expect(constantes.find((c) => c.error === 'fuera_de_calibre')?.pieces).toBe(5)
    const ranges = [{ calibre: '8-10 lb', label: '', minGrams: 3665, maxGrams: 5000 }]
    const alineado = classifyGate0Records([rec], gates, 5, ranges)
    expect(alineado.find((c) => c.error === 'fuera_de_calibre')).toBeUndefined()
  })
})

describe('seteo inferido y solape por programa (ronda 5)', () => {
  const w = (gateNo: number, cal: string, g: number, n: number, q: PieceRecord['quality'] = 'Premium') =>
    pieces(gateNo, n, cal, q, '2026-09-07T09:00:00').map((r) => ({ ...r, weightPerPieceGrams: g }))

  it('sin seteo guardado, la puerta toma lo que el Z2 etiqueta como asignación inferida y se juzga igual', () => {
    const obs = computeGateObservations([...w(8, '8-10 lb', 4100, 95), ...w(8, '6-8 lb', 3400, 5)])!
    const { timeline, inferidas } = inferirSeteoFaltante(obs, configTimelineFromSnapshots([], []))
    expect(inferidas).toEqual({ 8: { calibre: '8-10 lb', quality: 'Premium', pct: 95 } })
    const g8 = deriveGateMix(obs, timeline).gates[0]!
    expect(g8.assignedCalibre).toBe('8-10 lb')
    expect(g8.purityPct).toBe(95)
    // con seteo guardado no se infiere nada
    expect(inferirSeteoFaltante(obs, configTimelineFromSnapshots([], [gate(8, '8-10 lb', 'Premium')])).inferidas).toEqual({})
  })

  it('el solape se mide por el programa que etiqueta el Z2, no por un seteo de la app equivocado', () => {
    // Puertas 8 y 10: el Z2 etiqueta 8-10 hasta 4,9 kg y 10-12 desde 4,6 kg.
    // El seteo de la app (borrador) dice que la 8 es 4-6 y la 10 es 6-8: basura.
    const obs = computeGateObservations([
      ...w(8, '8-10 lb', 4200, 60), ...w(8, '8-10 lb', 4800, 20),
      ...w(10, '10-12 lb', 4600, 20), ...w(10, '10-12 lb', 5200, 60),
    ])!
    const mal = configTimelineFromSnapshots([], [gate(8, '4-6 lb', 'Premium'), gate(10, '6-8 lb', 'Premium')])
    const s = detectSolapesDeRango(obs, mal)
    expect(s).toHaveLength(1)
    expect(s[0]).toMatchObject({ calibreA: '8-10 lb', calibreB: '10-12 lb', gramos: 300 })
  })
})

describe('etiquetas crudas de Excel viejos (febrero: "2 - 4 LB")', () => {
  it('se normalizan al leer, y así calzan con rangos, distancia y programa', () => {
    const obs = computeGateObservations(pieces(4, 50, '2 - 4 LB', 'Premium', '2026-02-25T09:00:00').map((r) => ({ ...r, weightPerPieceGrams: 1500 })))!
    expect(Object.keys(obs.gates[0]!.byBucket[0]!)[0]).toBe('2 - 4 LB|Premium') // crudo en el doc
    const { inferidas, timeline } = inferirSeteoFaltante(obs, configTimelineFromSnapshots([], []))
    expect(inferidas[4]?.calibre).toBe('2-4 lb')
    const peso = derivePesoPorPuerta(obs, timeline, [{ calibre: '2-4 lb', label: '', minGrams: 916, maxGrams: 1833 }])[4]!
    expect(peso).toMatchObject({ dentro: 50, pctFuera: 0 })
    expect(deriveGateMix(obs, timeline).gates[0]!.byCalibre).toEqual({ '2-4 lb': 50 })
  })
})

describe('cambio de programa del Z2 dentro del turno (G10 hoy: 10-12 hasta las 23:30, 8-10 después)', () => {
  const w = (gateNo: number, cal: string, g: number, n: number, ts: string) =>
    pieces(gateNo, n, cal, 'Premium', ts).map((r) => ({ ...r, weightPerPieceGrams: g }))
  const G = [gate(8, '8-10 lb', 'Premium'), gate(10, '10-12 lb', 'Premium')]
  const obs = computeGateObservations([
    ...w(10, '10-12 lb', 5200, 40, '2026-09-07T21:30:00'), ...w(10, '10-12 lb', 5200, 40, '2026-09-07T22:30:00'),
    ...w(10, '8-10 lb', 4200, 60, '2026-09-07T23:30:00'), ...w(10, '8-10 lb', 4200, 60, '2026-09-08T00:30:00'), ...w(10, '8-10 lb', 4200, 60, '2026-09-08T01:30:00'),
    ...w(8, '8-10 lb', 4100, 50, '2026-09-07T21:30:00'), ...w(8, '8-10 lb', 4100, 50, '2026-09-08T01:30:00'),
  ])!
  const timeline = configTimelineFromSnapshots([], G)

  it('detecta desde qué bloque cambió, con qué programa y cuántas piezas', () => {
    const c = detectCambiosDePrograma(obs, timeline)
    expect(c).toHaveLength(1)
    expect(c[0]).toMatchObject({ gate: 10, asignado: { calibre: '10-12 lb', quality: 'Premium' }, nuevo: { calibre: '8-10 lb', quality: 'Premium', pct: 100 }, piezasDesde: 180, piezasNuevo: 180 })
    expect(new Date(c[0]!.desdeMs).toISOString()).toBe('2026-09-07T23:30:00.000Z')
    // sin bloques que coincidan antes, no es "cambio": es seteo ≠ máquina
    const nunca = computeGateObservations(w(10, '8-10 lb', 4200, 60, '2026-09-07T23:30:00'))!
    expect(detectCambiosDePrograma(nunca, timeline)).toEqual([])
  })

  it('el solape se atribuye por el programa de cada bloque: la G10 mezclada no inventa un solape', () => {
    expect(detectSolapesDeRango(obs, timeline)).toEqual([])
  })

  it('registrado el cambio a esa hora, la puerta queda pura antes y después', () => {
    const snap = (atWall: string, gates: GateAssignment[], changes = 1): GateConfigSnapshot => ({
      id: atWall, shiftDocId: 'x', at: wallClockMsToRealIso(Date.parse(atWall + 'Z')), changedBy: { uid: 'u', name: 'u' }, gates,
      changes: Array.from({ length: changes }, () => ({ gateNumber: 10, field: 'assignedCalibre', before: '10-12 lb', after: '8-10 lb' })) as never,
    })
    const tl = configTimelineFromSnapshots([snap('2026-09-07T23:30:00', [gate(8, '8-10 lb', 'Premium'), gate(10, '8-10 lb', 'Premium')])], G)
    const g10 = deriveGateMix(obs, tl).gates.find((g) => g.gate === 10)!
    expect(g10.purityPct).toBe(100)
    expect(detectCambiosDePrograma(obs, tl)).toEqual([])
  })
})

describe('wallClockMsToRealIso es la inversa de realIsoToWallClockMs', () => {
  it('ida y vuelta en verano (UTC-3) e invierno (UTC-4) de Chile', () => {
    for (const wall of ['2026-09-07T23:30:00Z', '2026-07-15T10:00:00Z']) {
      const real = wallClockMsToRealIso(Date.parse(wall))
      expect(realIsoToWallClockMs(real)).toBe(Date.parse(wall))
    }
    expect(wallClockMsToRealIso(Date.parse('2026-09-07T23:30:00Z'))).toBe('2026-09-08T02:30:00.000Z')
  })
})

describe('rangesFingerprint', () => {
  it('cambia si cambia cualquier límite y no depende del orden', () => {
    const a = [{ calibre: '8-10 lb', label: '', minGrams: 3665, maxGrams: 4581 }, { calibre: '10-12 lb', label: '', minGrams: 4581, maxGrams: 5900 }]
    const b = [a[1]!, a[0]!]
    const c = [{ ...a[0]!, maxGrams: 4990 }, { ...a[1]!, minGrams: 4990 }]
    expect(rangesFingerprint(a)).toBe(rangesFingerprint(b))
    expect(rangesFingerprint(a)).not.toBe(rangesFingerprint(c))
  })
})

describe('configTimelineFromSnapshots · antes del snapshot inicial rige el inicial, no gatesUsed', () => {
  it('gatesUsed es la config MÁS RECIENTE; el tramo previo al inicial (sin cambios) usa el inicial', () => {
    const inicial: GateConfigSnapshot = {
      id: 'ini', shiftDocId: 'x', at: '2026-09-08T02:38:55.000Z', changedBy: { uid: 'u', name: 'u' },
      gates: [gate(4, '8-10 lb', 'Industrial')], changes: [],
    }
    const tl = configTimelineFromSnapshots([inicial], [gate(4, '6-8 lb', 'Premium')])
    expect(tl.configAt(Date.parse('2026-09-07T21:15:00Z'))?.[0]?.assignedCalibre).toBe('8-10 lb')
    // si el primero es un cambio real (turno viejo sin inicial), sigue rigiendo el fallback
    const cambio = { ...inicial, changes: [{ gateNumber: 4, field: 'assignedCalibre', before: 'x', after: 'y' }] as never }
    expect(configTimelineFromSnapshots([cambio], [gate(4, '6-8 lb', 'Premium')]).configAt(Date.parse('2026-09-07T21:15:00Z'))?.[0]?.assignedCalibre).toBe('6-8 lb')
  })
})

describe('normalizarCalibre · etiquetas crudas de febrero', () => {
  it('"10" y "12" son 10-12 lb y 12-UP lb; el solape "10 vs 10-12" de febrero desaparece', () => {
    expect(normalizarCalibre('10')).toBe('10-12 lb')
    expect(normalizarCalibre('12')).toBe(CALIBRE_12_UP)
    expect(normalizarCalibre('12-UP lb ')).toBe(CALIBRE_12_UP)
    expect(normalizarCalibre('10 - 12 lb')).toBe('10-12 lb')
    expect(normalizarCalibre('2 - 4 LB')).toBe('2-4 lb')
  })
})

describe('detectCambiosDePrograma · piso de piezas', () => {
  it('un barrido de fin de turno con 30 piezas no es un cambio de programa', () => {
    const w = (cal: string, n: number, ts: string) => pieces(5, n, cal, 'Premium', ts)
    const obs = computeGateObservations([
      ...w('4-6 lb', 200, '2026-02-26T00:30:00'), ...w('4-6 lb', 200, '2026-02-26T01:30:00'), ...w('4-6 lb', 200, '2026-02-26T02:30:00'),
      ...w('6-8 lb', 15, '2026-02-26T04:00:00'), ...w('6-8 lb', 15, '2026-02-26T04:30:00'),
    ])!
    const tl = configTimelineFromSnapshots([], [gate(5, '4-6 lb', 'Premium')])
    expect(detectCambiosDePrograma(obs, tl)).toEqual([])
    const grande = computeGateObservations([
      ...w('4-6 lb', 200, '2026-02-26T00:30:00'), ...w('4-6 lb', 200, '2026-02-26T01:30:00'),
      ...w('6-8 lb', 60, '2026-02-26T04:00:00'), ...w('6-8 lb', 60, '2026-02-26T04:30:00'),
    ])!
    expect(detectCambiosDePrograma(grande, tl)).toHaveLength(1)
  })
})

describe('deriveMezcla · los tres ejes, conservación contra la dominante del bloque', () => {
  const pc = (n: number, cal: string, cons: string, ts: string) =>
    pieces(8, n, cal, 'Premium', ts).map((r) => ({ ...r, conservation: cons as PieceRecord['conservation'] }))
  const G = [gate(8, '8-10 lb', 'Premium'), gate(10, '10-12 lb', 'Premium')]
  const tl = configTimelineFromSnapshots([], G)

  it('un cambio de lote fresco→congelado entre bloques NO es mezcla', () => {
    const obs = computeGateObservations([
      ...pc(300, '8-10 lb', 'FRESCO', '2026-09-07T21:30:00'), ...pc(300, '8-10 lb', 'FRESCO', '2026-09-07T22:30:00'),
      ...pc(300, '8-10 lb', 'CONGELADO', '2026-09-08T00:30:00'), ...pc(300, '8-10 lb', 'CONGELADO', '2026-09-08T01:30:00'),
    ])!
    const m = deriveMezcla(obs, tl)[8]!
    expect(m.pct).toBe(100)
    expect(m.peorIntruso).toBeUndefined()
    expect(m.fijaConservacion).toBe(false)
    expect(m.composicion.map((c) => [c.conservation, c.intrusa])).toEqual([['FRESCO', false], ['CONGELADO', false]])
  })

  it('dos conservaciones en el MISMO bloque sí: la minoritaria es la intrusa, con su dimensión', () => {
    const obs = computeGateObservations([
      ...pc(300, '8-10 lb', 'CONGELADO', '2026-09-07T21:30:00'), ...pc(100, '8-10 lb', 'FRESCO', '2026-09-07T21:40:00'),
    ])!
    const m = deriveMezcla(obs, tl)[8]!
    expect(m.pct).toBe(75)
    expect(m.peorIntruso).toEqual({ dim: 'conservacion', value: 'FRESCO', pieces: 100, pct: 25 })
    expect(m.dominante).toMatchObject({ calibre: '8-10 lb', quality: 'Premium', conservation: 'CONGELADO', pieces: 300 })
  })

  it('el calibre manda sobre la conservación en la precedencia, y el seteo con conservación fija la referencia', () => {
    const obs = computeGateObservations([
      ...pc(300, '8-10 lb', 'CONGELADO', '2026-09-07T21:30:00'), ...pc(50, '10-12 lb', 'FRESCO', '2026-09-07T21:40:00'),
    ])!
    const m = deriveMezcla(obs, tl)[8]!
    expect(m.peorIntruso).toEqual({ dim: 'calibre', value: '10-12 lb', pieces: 50, pct: 14.3 })
    const fija = configTimelineFromSnapshots([], [{ ...gate(8, '8-10 lb', 'Premium'), assignedConservation: 'FRESCO' } as GateAssignment])
    const m2 = deriveMezcla(obs, fija)[8]!
    expect(m2.fijaConservacion).toBe(true)
    expect(m2.pct).toBe(0)
  })

  it('sin seteo no hay juicio, pero sí composición', () => {
    const obs = computeGateObservations(pc(40, '8-10 lb', 'FRESCO', '2026-09-07T21:30:00'))!
    const m = deriveMezcla(obs, configTimelineFromSnapshots([], []))[8]!
    expect(m.pct).toBeNull()
    expect(m.composicion).toHaveLength(1)
  })
})

describe('mapaPesoDePuerta · nivel 1 sin lecturas', () => {
  it('arma celdas bloque × bin con extremos y máximo', () => {
    const w = (n: number, g: number, ts: string) => pieces(11, n, '10-12 lb', 'Premium', ts).map((r) => ({ ...r, weightPerPieceGrams: g }))
    const obs = computeGateObservations([...w(10, 4650, '2026-09-07T21:30:00'), ...w(30, 5050, '2026-09-07T21:40:00'), ...w(5, 5250, '2026-09-07T22:30:00')])!
    const m = mapaPesoDePuerta(obs, 11)!
    expect(m.binGrams).toBe(100)
    expect([m.minG, m.maxG, m.max, m.pieces]).toEqual([4600, 5200, 30, 45])
    expect(m.celdas[0]).toEqual({ 4600: 10, 5000: 30 })
    expect(m.celdas[2]).toEqual({ 5200: 5 })
    expect(mapaPesoDePuerta(obs, 3)).toBeNull()
  })
})
