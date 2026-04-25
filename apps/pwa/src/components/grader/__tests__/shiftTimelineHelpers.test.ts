import { describe, it, expect } from 'vitest'
import {
  buildBaaderTimelineMarkers,
  computeProductionWindow,
  type ProductionWindow,
} from '../shiftTimelineHelpers'
import type {
  UpstreamLineSnapshot,
  UpstreamMachineShift,
  UpstreamMachineState,
} from '@/services/shoplogix/types'
import type { TimelineBucket } from '@/services/grader/types'

// ── Helpers ─────────────────────────────────────────────────────────────────

function mkState(
  startISO: string,
  endISO: string,
  type: UpstreamMachineState['type'],
  reason = '',
  color = '#ef4444',
): UpstreamMachineState {
  const start = new Date(startISO)
  const end = new Date(endISO)
  return {
    startAt: start,
    endAt: end,
    durationSec: Math.round((end.getTime() - start.getTime()) / 1000),
    type,
    name: type,
    reason,
    color,
    isCurrent: false,
  }
}

function mkShift(name: string, states: UpstreamMachineState[]): UpstreamMachineShift {
  return {
    machineid: name.replace(/\s+/g, '_'),
    machineName: name,
    machineType: 'baader_142',
    dateKey: '2026-02-26',
    shiftId: 'Turno día',
    shiftStart: new Date('2026-02-26T09:00:00Z'),
    shiftEnd: new Date('2026-02-26T17:00:00Z'),
    totalCycles: 0,
    expectedTotalCycles: 0,
    totalPieces: 0,
    expectedTotalPieces: 0,
    overallRatio: 0,
    actualRuntime: 0,
    expectedRuntime: 0,
    runtimeVariance: 0,
    shiftRuntime: 0,
    shiftRuntimeBreakdown: {
      uptimeSec: 0, breakSec: 0, downtimeSec: 0, setupSec: 0, totalTrackedSec: 0,
    },
    intervals: [],
    states,
    threshold: 15,
    productionUnit: 'Eviscerado',
    comments: [],
    source: 'shoplogix',
    sourceVersion: 1,
    syncedAt: new Date(),
  }
}

function mkSnap(shifts: UpstreamMachineShift[]): UpstreamLineSnapshot {
  return {
    dateKey: '2026-02-26',
    shiftId: 'Turno día',
    machines: shifts,
    lineThroughputActual: 0,
    lineThroughputExpected: 0,
    lineAvailability: 0,
    machinesProducing: 0,
  }
}

/** Genera array de labels HH:MM por minuto entre [startMs, endMs]. */
function mkLineTimes(startISO: string, endISO: string): string[] {
  const startMs = Date.parse(startISO)
  const endMs = Date.parse(endISO)
  const labels: string[] = []
  for (let t = startMs; t <= endMs; t += 60_000) {
    const d = new Date(t)
    const hh = String(d.getUTCHours()).padStart(2, '0')
    const mm = String(d.getUTCMinutes()).padStart(2, '0')
    labels.push(`${hh}:${mm}`)
  }
  return labels
}

const PROD_WINDOW: ProductionWindow = {
  startTs: '2026-02-26T09:10:00Z',
  endTs: '2026-02-26T16:50:00Z',
  startMs: Date.parse('2026-02-26T09:10:00Z'),
  endMs: Date.parse('2026-02-26T16:50:00Z'),
  dummyLots: new Set(),
  excludedPieces: 0,
}

// ── Tests ───────────────────────────────────────────────────────────────────

describe('buildBaaderTimelineMarkers', () => {
  const lineTimes = mkLineTimes('2026-02-26T09:10:00Z', '2026-02-26T16:50:00Z')

  it('devuelve estructura vacía si snapshot es null', () => {
    expect(buildBaaderTimelineMarkers(null, lineTimes, PROD_WINDOW)).toEqual({
      lanes: [],
      bands: [],
    })
    expect(buildBaaderTimelineMarkers(undefined, lineTimes, PROD_WINDOW)).toEqual({
      lanes: [],
      bands: [],
    })
  })

  it('devuelve estructura vacía si lineTimes está vacío', () => {
    const snap = mkSnap([mkShift('Evisceradora 1', [
      mkState('2026-02-26T13:00:00Z', '2026-02-26T13:30:00Z', 'break', 'COLACION'),
    ])])
    expect(buildBaaderTimelineMarkers(snap, [], PROD_WINDOW)).toEqual({
      lanes: [],
      bands: [],
    })
  })

  it('omite estados type=uptime (es el fondo)', () => {
    const snap = mkSnap([mkShift('Evisceradora 1', [
      mkState('2026-02-26T09:30:00Z', '2026-02-26T11:00:00Z', 'uptime', '', '#10b981'),
      mkState('2026-02-26T13:00:00Z', '2026-02-26T13:30:00Z', 'break', 'COLACION', '#94a3b8'),
    ])])
    const result = buildBaaderTimelineMarkers(snap, lineTimes, PROD_WINDOW)
    expect(result.lanes).toEqual([{ machineName: 'Evisceradora 1' }])
    expect(result.bands).toHaveLength(1)
    expect(result.bands[0]!.stateType).toBe('break')
    expect(result.bands[0]!.reason).toBe('COLACION')
  })

  it('genera una banda por cada estado downtime/break/setup de cada máquina', () => {
    const snap = mkSnap([
      mkShift('Evisceradora 1', [
        mkState('2026-02-26T11:00:00Z', '2026-02-26T11:05:00Z', 'downtime', 'Micro Detencion'),
        mkState('2026-02-26T13:27:00Z', '2026-02-26T13:57:00Z', 'break', 'COLACION'),
      ]),
      mkShift('Evisceradora 2', [
        mkState('2026-02-26T13:30:00Z', '2026-02-26T14:00:00Z', 'break', 'COLACION'),
      ]),
      mkShift('Evisceradora 3', [
        mkState('2026-02-26T15:00:00Z', '2026-02-26T15:08:00Z', 'setup', 'Cambio molde'),
      ]),
    ])
    const result = buildBaaderTimelineMarkers(snap, lineTimes, PROD_WINDOW)
    expect(result.lanes).toHaveLength(3)
    expect(result.lanes.map((l) => l.machineName)).toEqual([
      'Evisceradora 1', 'Evisceradora 2', 'Evisceradora 3',
    ])
    expect(result.bands).toHaveLength(4)
    const e1Bands = result.bands.filter((b) => b.machineName === 'Evisceradora 1')
    expect(e1Bands).toHaveLength(2)
    expect(e1Bands[1]!.tA).toBe('13:27')
    expect(e1Bands[1]!.tB).toBe('13:57')
    expect(e1Bands[1]!.durationMin).toBe(30)
  })

  it('descarta bandas completamente fuera de productionWindow', () => {
    const snap = mkSnap([mkShift('Evisceradora 1', [
      // Antes del rango de producción
      mkState('2026-02-26T08:00:00Z', '2026-02-26T08:30:00Z', 'break', 'pre-turno'),
      // Dentro del rango
      mkState('2026-02-26T13:00:00Z', '2026-02-26T13:30:00Z', 'break', 'COLACION'),
      // Después del rango
      mkState('2026-02-26T17:30:00Z', '2026-02-26T18:00:00Z', 'break', 'post-turno'),
    ])])
    const result = buildBaaderTimelineMarkers(snap, lineTimes, PROD_WINDOW)
    expect(result.bands).toHaveLength(1)
    expect(result.bands[0]!.reason).toBe('COLACION')
  })

  it('recorta tA/tB al rango del axis cuando la banda lo excede', () => {
    // Banda 13:00 → 13:30, axis empieza recién a 13:15
    const narrowAxis = mkLineTimes('2026-02-26T13:15:00Z', '2026-02-26T16:00:00Z')
    const snap = mkSnap([mkShift('Evisceradora 1', [
      mkState('2026-02-26T13:00:00Z', '2026-02-26T13:30:00Z', 'break', 'COLACION'),
    ])])
    const result = buildBaaderTimelineMarkers(snap, narrowAxis, null)
    expect(result.bands).toHaveLength(1)
    // tA=13:00 no existe en axis → recortado al primer label (13:15)
    expect(result.bands[0]!.tA).toBe('13:15')
    expect(result.bands[0]!.tB).toBe('13:30')
  })

  it('omite bandas que tras recorte colapsan a punto único', () => {
    // Axis arranca a 13:30. Banda 13:00→13:30 → tras recorte tA=13:30, tB=13:30 → skip
    const axis = mkLineTimes('2026-02-26T13:30:00Z', '2026-02-26T16:00:00Z')
    const snap = mkSnap([mkShift('Evisceradora 1', [
      mkState('2026-02-26T13:00:00Z', '2026-02-26T13:30:00Z', 'break', 'edge'),
    ])])
    const result = buildBaaderTimelineMarkers(snap, axis, null)
    expect(result.bands).toHaveLength(0)
  })

  it('respeta el orden de máquinas del snapshot para las lanes', () => {
    const snap = mkSnap([
      mkShift('Evisceradora 3', [mkState('2026-02-26T13:00:00Z', '2026-02-26T13:10:00Z', 'break', 'a')]),
      mkShift('Evisceradora 1', [mkState('2026-02-26T13:00:00Z', '2026-02-26T13:10:00Z', 'break', 'b')]),
      mkShift('Evisceradora 2', [mkState('2026-02-26T13:00:00Z', '2026-02-26T13:10:00Z', 'break', 'c')]),
    ])
    const result = buildBaaderTimelineMarkers(snap, lineTimes, PROD_WINDOW)
    expect(result.lanes.map((l) => l.machineName)).toEqual([
      'Evisceradora 3', 'Evisceradora 1', 'Evisceradora 2',
    ])
  })

  it('convierte color hex a rgba con alpha en fill', () => {
    const snap = mkSnap([mkShift('Evisceradora 1', [
      mkState('2026-02-26T13:00:00Z', '2026-02-26T13:30:00Z', 'break', 'x', '#ff0000'),
    ])])
    const result = buildBaaderTimelineMarkers(snap, lineTimes, PROD_WINDOW)
    expect(result.bands[0]!.fill).toMatch(/^rgba\(255,\s*0,\s*0,\s*0?\.\d+\)$/)
    expect(result.bands[0]!.stroke).toMatch(/^rgba\(255,\s*0,\s*0,\s*0?\.\d+\)$/)
  })
})

describe('computeProductionWindow (sanity)', () => {
  it('retorna null para array vacío', () => {
    const buckets: TimelineBucket[] = []
    expect(computeProductionWindow(buckets)).toBeNull()
  })
})
