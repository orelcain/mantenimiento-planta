import { describe, it, expect } from 'vitest'
import {
  buildBaaderTimelineMarkers,
  buildCadenceMarkLines,
  buildConfigSegmentMarkAreas,
  buildScatterData,
  computeCadenceStats,
  computeProductionWindow,
  median,
  scatterBaaderMedian,
  scatterCriticalZone,
  scatterSlopeMagnitude,
  usableScatterPoints,
  verdictBandColor,
  type CadenceStats,
  type ProductionWindow,
  type ScatterSeriesData,
} from '../shiftTimelineHelpers'
import type { GateConfigSnapshot } from '@/services/grader/graderConfigSnapshot.service'
import type { SegmentVerdict } from '@/services/grader/graderP0Segmentation'
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
      uptimeSec: 0, breakSec: 0, plannedDowntimeSec: 0, downtimeSec: 0, setupSec: 0, totalTrackedSec: 0,
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

// ── buildScatterData ──────────────────────────────────────────────────────────

function mkInterval(
  startISO: string,
  cycles: number,
  expectedCycles = 40,
): import('../shiftTimelineHelpers').ScatterPoint['baaderCycles'] extends number
  ? import('@/services/shoplogix/types').UpstreamProductionInterval
  : never {
  const startAt = new Date(startISO)
  const endAt   = new Date(startAt.getTime() + 5 * 60_000)
  const ratio   = expectedCycles > 0 ? cycles / expectedCycles : 0
  return {
    startAt, endAt, cycles, expectedCycles,
    total: cycles, expectedTotal: expectedCycles, ratio,
    color: ratio >= 0.85 ? 'green' : ratio > 0 ? 'yellow' : 'red',
  }
}

function mkBucket(tsMin: string, pieces: number, p0Pieces: number): TimelineBucket {
  return { tsMin, pieces, p0Pieces }
}

// Snapshot de 1 máquina con 3 intervalos de 5 min (09:00, 09:05, 09:10)
function mkScatterSnap(cycles: number[]): UpstreamLineSnapshot {
  const intervals = cycles.map((c, i) =>
    mkInterval(`2026-02-26T${String(9).padStart(2,'0')}:${String(i * 5).padStart(2,'0')}:00Z`, c),
  )
  return mkSnap([{ ...mkShift('Evisceradora 1', []), intervals }])
}

// Buckets: 5 minutos por intervalo → 3 × 5 = 15 buckets (09:00-09:14)
function mkScatterBuckets(
  p0Pcts: number[],  // uno por intervalo (5 min)
  piecesPerMin = 10,
): TimelineBucket[] {
  const buckets: TimelineBucket[] = []
  for (let ivl = 0; ivl < p0Pcts.length; ivl++) {
    for (let m = 0; m < 5; m++) {
      const h = 9
      const min = ivl * 5 + m
      const tsMin = `2026-02-26T${String(h).padStart(2,'0')}:${String(min).padStart(2,'0')}:00Z`
      const pieces = piecesPerMin
      const p0Pieces = Math.round(pieces * p0Pcts[ivl]!)
      buckets.push(mkBucket(tsMin, pieces, p0Pieces))
    }
  }
  return buckets
}

describe('buildScatterData', () => {
  it('retorna array vacío si no hay buckets', () => {
    const snap = mkScatterSnap([20, 30, 25])
    expect(buildScatterData(snap, [])).toEqual([])
  })

  it('retorna array vacío si no hay máquinas', () => {
    const snap: UpstreamLineSnapshot = { ...mkSnap([]), machines: [] }
    const buckets = mkScatterBuckets([0.02, 0.03, 0.01])
    expect(buildScatterData(snap, buckets)).toEqual([])
  })

  it('alinea correctamente intervalos Baader con buckets Grader', () => {
    // 3 intervalos de 5 min, 3 P0% distintos.
    // piecesPerMin=100 para evitar rounding: 100*0.02=2, 100*0.04=4, 100*0.08=8 (exactos)
    const cycles = [30, 40, 10]
    const p0Pcts = [0.02, 0.04, 0.08]
    const snap    = mkScatterSnap(cycles)
    const buckets = mkScatterBuckets(p0Pcts, 100)

    const [series] = buildScatterData(snap, buckets)
    expect(series).toBeDefined()
    expect(series!.points).toHaveLength(3)

    // Punto 0: Baader=30, Grader P0%=2%
    expect(series!.points[0]!.baaderCycles).toBe(30)
    expect(series!.points[0]!.graderP0Pct).toBeCloseTo(0.02, 3)
    expect(series!.points[0]!.graderPieces).toBe(500)  // 5 min × 100 piezas/min

    // Punto 2: Baader=10 (baja producción), P0%=8% (alto)
    expect(series!.points[2]!.baaderCycles).toBe(10)
    expect(series!.points[2]!.graderP0Pct).toBeCloseTo(0.08, 3)
  })

  it('omite puntos sin datos Grader (0 piezas en el intervalo)', () => {
    const snap    = mkScatterSnap([30, 40])
    // Primer intervalo sin piezas Grader, segundo con piezas
    const buckets = [
      ...Array.from({ length: 5 }, (_, i) =>
        mkBucket(`2026-02-26T09:${String(i).padStart(2,'0')}:00Z`, 0, 0)),
      ...Array.from({ length: 5 }, (_, i) =>
        mkBucket(`2026-02-26T09:${String(5 + i).padStart(2,'0')}:00Z`, 10, 1)),
    ]
    const [series] = buildScatterData(snap, buckets)
    // Solo el segundo intervalo tiene piezas Grader → 1 punto
    expect(series!.points).toHaveLength(1)
    expect(series!.points[0]!.baaderCycles).toBe(40)
  })

  it('calcula regresión cuando hay ≥ 3 puntos con datos', () => {
    // Correlación negativa: más ciclos Baader → menor P0%
    // piecesPerMin=100 para evitar rounding en p0Pieces: 100*0.10=10, 100*0.03=3 exactos
    const cycles = [10, 20, 30, 40, 50]
    const p0Pcts = [0.10, 0.08, 0.05, 0.03, 0.02]  // inversamente proporcional
    const snap    = mkScatterSnap(cycles)
    const buckets = mkScatterBuckets(p0Pcts, 100)

    const [series] = buildScatterData(snap, buckets)
    expect(series!.regression).not.toBeNull()
    // Pendiente negativa (más ciclos → menos P0%)
    expect(series!.regression!.slope).toBeLessThan(0)
    // R² debe ser alto (correlación casi perfecta)
    expect(series!.regression!.r2).toBeGreaterThan(0.8)
  })

  it('regression es null si hay < 3 puntos con datos', () => {
    const snap    = mkScatterSnap([20, 25])
    const buckets = mkScatterBuckets([0.02, 0.03])
    const [series] = buildScatterData(snap, buckets)
    // Solo 2 puntos → sin regresión
    expect(series!.regression).toBeNull()
  })
})

// ── Scatter analytics: zona crítica + magnitud pendiente ─────────────────────

describe('median', () => {
  it('retorna 0 para array vacío', () => {
    expect(median([])).toBe(0)
  })
  it('retorna el elemento medio en arrays impares', () => {
    expect(median([3, 1, 2])).toBe(2)
    expect(median([5, 1, 3, 2, 4])).toBe(3)
  })
  it('retorna el promedio de los 2 medios en arrays pares', () => {
    expect(median([1, 2, 3, 4])).toBe(2.5)
    expect(median([10, 20])).toBe(15)
  })
})

describe('usableScatterPoints', () => {
  it('filtra puntos sin ciclos Baader', () => {
    const pts = [
      { tsMs: 0, baaderCycles: 0,  baaderRatio: 0, graderP0Pct: 0.05, graderPieces: 100, baaderColor: 'green' },
      { tsMs: 1, baaderCycles: 50, baaderRatio: 1, graderP0Pct: 0.05, graderPieces: 100, baaderColor: 'green' },
    ]
    expect(usableScatterPoints(pts)).toHaveLength(1)
  })
  it('filtra puntos con < 5 piezas Grader (poca confianza)', () => {
    const pts = [
      { tsMs: 0, baaderCycles: 50, baaderRatio: 1, graderP0Pct: 0.05, graderPieces: 4,   baaderColor: 'green' },
      { tsMs: 1, baaderCycles: 50, baaderRatio: 1, graderP0Pct: 0.05, graderPieces: 100, baaderColor: 'green' },
    ]
    expect(usableScatterPoints(pts)).toHaveLength(1)
  })
})

describe('scatterBaaderMedian', () => {
  it('retorna la mediana del ritmo Baader sobre TODAS las máquinas', () => {
    const series: ScatterSeriesData[] = [
      {
        machineid: 'm1', machineName: 'E1',
        points: [
          { tsMs: 0, baaderCycles: 10, baaderRatio: 1, graderP0Pct: 0.05, graderPieces: 100, baaderColor: 'green' },
          { tsMs: 1, baaderCycles: 30, baaderRatio: 1, graderP0Pct: 0.05, graderPieces: 100, baaderColor: 'green' },
        ],
        regression: null,
      },
      {
        machineid: 'm2', machineName: 'E2',
        points: [
          { tsMs: 2, baaderCycles: 50, baaderRatio: 1, graderP0Pct: 0.05, graderPieces: 100, baaderColor: 'green' },
          { tsMs: 3, baaderCycles: 70, baaderRatio: 1, graderP0Pct: 0.05, graderPieces: 100, baaderColor: 'green' },
        ],
        regression: null,
      },
    ]
    // Cycles agregados: [10, 30, 50, 70] → median = (30+50)/2 = 40
    expect(scatterBaaderMedian(series)).toBe(40)
  })

  it('retorna 0 cuando no hay puntos usables', () => {
    expect(scatterBaaderMedian([])).toBe(0)
  })

  it('ignora puntos no usables (sin ciclos / piezas insuficientes) en el cálculo', () => {
    const series: ScatterSeriesData[] = [
      {
        machineid: 'm1', machineName: 'E1',
        points: [
          { tsMs: 0, baaderCycles: 0,   baaderRatio: 0, graderP0Pct: 0.05, graderPieces: 100, baaderColor: 'green' },
          { tsMs: 1, baaderCycles: 100, baaderRatio: 1, graderP0Pct: 0.05, graderPieces: 100, baaderColor: 'green' },
          { tsMs: 2, baaderCycles: 200, baaderRatio: 1, graderP0Pct: 0.05, graderPieces: 4,   baaderColor: 'green' },
        ],
        regression: null,
      },
    ]
    // Solo el punto con baader=100 es usable → mediana = 100
    expect(scatterBaaderMedian(series)).toBe(100)
  })
})

describe('scatterCriticalZone', () => {
  it('cuenta puntos con P0% > umbral Y baaderCycles < mediana', () => {
    const series: ScatterSeriesData[] = [
      {
        machineid: 'm1', machineName: 'E1',
        points: [
          // Crítico: P0=5% > 3.5, ciclos=20 < 50
          { tsMs: 0, baaderCycles: 20, baaderRatio: 0.5, graderP0Pct: 0.05, graderPieces: 100, baaderColor: 'red' },
          // No crítico: P0=2% < 3.5
          { tsMs: 1, baaderCycles: 20, baaderRatio: 0.5, graderP0Pct: 0.02, graderPieces: 100, baaderColor: 'red' },
          // No crítico: ciclos=80 >= mediana
          { tsMs: 2, baaderCycles: 80, baaderRatio: 1.5, graderP0Pct: 0.05, graderPieces: 100, baaderColor: 'green' },
          // Crítico: P0=4% > 3.5, ciclos=10 < 50
          { tsMs: 3, baaderCycles: 10, baaderRatio: 0.2, graderP0Pct: 0.04, graderPieces: 100, baaderColor: 'red' },
        ],
        regression: null,
      },
    ]
    const result = scatterCriticalZone(series, 3.5, 50)
    expect(result.critical).toBe(2)
    expect(result.total).toBe(4)
    expect(result.pct).toBeCloseTo(50, 5)
  })

  it('retorna pct=0 cuando no hay puntos usables', () => {
    expect(scatterCriticalZone([], 3.5, 50)).toEqual({ critical: 0, total: 0, pct: 0 })
  })

  it('puntos justo bajo el umbral (P0=3.4%) NO cuentan como crítico', () => {
    const series: ScatterSeriesData[] = [
      {
        machineid: 'm1', machineName: 'E1',
        points: [
          // P0=3.4% (0.034 sin float-math sucio) NO es crítico
          { tsMs: 0, baaderCycles: 20, baaderRatio: 0.5, graderP0Pct: 0.034, graderPieces: 100, baaderColor: 'amber' },
        ],
        regression: null,
      },
    ]
    const result = scatterCriticalZone(series, 3.5, 50)
    expect(result.critical).toBe(0)
    expect(result.total).toBe(1)
  })
})

describe('scatterSlopeMagnitude', () => {
  it('retorna null si ninguna serie tiene regresión', () => {
    const series: ScatterSeriesData[] = [
      { machineid: 'm1', machineName: 'E1', points: [], regression: null },
    ]
    expect(scatterSlopeMagnitude(series)).toBeNull()
  })

  it('promedio ponderado por nº puntos usables', () => {
    const series: ScatterSeriesData[] = [
      {
        machineid: 'm1', machineName: 'E1',
        points: Array.from({ length: 10 }, (_, i) => ({
          tsMs: i, baaderCycles: 20, baaderRatio: 1, graderP0Pct: 0.05, graderPieces: 100, baaderColor: 'green',
        })),
        regression: { slope: -0.05, intercept: 5, r2: 0.8 },
      },
      {
        machineid: 'm2', machineName: 'E2',
        points: Array.from({ length: 10 }, (_, i) => ({
          tsMs: i, baaderCycles: 20, baaderRatio: 1, graderP0Pct: 0.05, graderPieces: 100, baaderColor: 'green',
        })),
        regression: { slope: -0.03, intercept: 5, r2: 0.7 },
      },
    ]
    const result = scatterSlopeMagnitude(series)!
    // Promedio ponderado: (-0.05*10 + -0.03*10) / 20 = -0.04
    expect(result.avgSlope).toBeCloseTo(-0.04, 5)
    // Por -10 ciclos → +0.4 puntos P0%
    expect(result.deltaP0_per_minus10cycles).toBeCloseTo(0.4, 5)
    expect(result.direction).toBe('neg')
  })

  it('clasifica direction "flat" cuando |slope| < 0.005', () => {
    const series: ScatterSeriesData[] = [
      {
        machineid: 'm1', machineName: 'E1',
        points: Array.from({ length: 10 }, (_, i) => ({
          tsMs: i, baaderCycles: 20, baaderRatio: 1, graderP0Pct: 0.05, graderPieces: 100, baaderColor: 'green',
        })),
        regression: { slope: 0.001, intercept: 5, r2: 0.05 },
      },
    ]
    const result = scatterSlopeMagnitude(series)!
    expect(result.direction).toBe('flat')
  })

  it('clasifica direction "pos" con slope > 0.005', () => {
    const series: ScatterSeriesData[] = [
      {
        machineid: 'm1', machineName: 'E1',
        points: Array.from({ length: 10 }, (_, i) => ({
          tsMs: i, baaderCycles: 20, baaderRatio: 1, graderP0Pct: 0.05, graderPieces: 100, baaderColor: 'green',
        })),
        regression: { slope: 0.02, intercept: 5, r2: 0.5 },
      },
    ]
    const result = scatterSlopeMagnitude(series)!
    expect(result.direction).toBe('pos')
    // Slope positivo → -0.02*10 = -0.2 (P0% BAJA cuando ritmo baja, anti-intuitivo)
    expect(result.deltaP0_per_minus10cycles).toBeCloseTo(-0.2, 5)
  })

  it('ignora series con < 3 puntos usables', () => {
    const series: ScatterSeriesData[] = [
      {
        machineid: 'm1', machineName: 'E1',
        points: [
          { tsMs: 0, baaderCycles: 20, baaderRatio: 1, graderP0Pct: 0.05, graderPieces: 100, baaderColor: 'green' },
          { tsMs: 1, baaderCycles: 20, baaderRatio: 1, graderP0Pct: 0.05, graderPieces: 100, baaderColor: 'green' },
        ],
        regression: { slope: -0.1, intercept: 5, r2: 0.9 },
      },
    ]
    expect(scatterSlopeMagnitude(series)).toBeNull()
  })
})

// ── verdictBandColor + buildConfigSegmentMarkAreas ───────────────────────────
//
// Tests del helper visual que tinta segmentos del timeline entre cambios de
// config de gates (FASE 27, refactor Fase A — sesión 2026-05-07).
// Cierra el bucle visual con `GateChangeImpactCard`: el card muestra delta
// numérico, el timeline tinta el segmento del color del verdict.

describe('verdictBandColor', () => {
  it('asigna emerald para improved', () => {
    expect(verdictBandColor('improved')).toBe('rgba(16, 185, 129, 0.07)')
  })

  it('asigna rose para worsened', () => {
    expect(verdictBandColor('worsened')).toBe('rgba(244, 63, 94, 0.07)')
  })

  it('asigna slate para neutral', () => {
    expect(verdictBandColor('neutral')).toBe('rgba(148, 163, 184, 0.04)')
  })

  it('retorna null para insufficient-data — no se tinta', () => {
    // Diseño: si no hay datos suficientes, no comunicamos un veredicto.
    expect(verdictBandColor('insufficient-data')).toBeNull()
  })
})

describe('buildConfigSegmentMarkAreas', () => {
  // Helpers locales para construir snapshots y verdicts mínimos.
  function mkSnap(id: string, atIso: string, synthetic = false): GateConfigSnapshot {
    return {
      id,
      shiftDocId: '2026-02-26__Turno día',
      at: atIso,
      changedBy: { uid: 'u', name: 'Test' },
      gates: [],
      changes: [],
      ...(synthetic ? { synthetic: true } : {}),
    } as GateConfigSnapshot
  }

  function mkVerdict(status: SegmentVerdict['status'], delta = 0): SegmentVerdict {
    return {
      beforePct: 0, afterPct: 0, afterMinutes: 0, afterPieces: 999,
      delta, status,
    }
  }

  const window: ProductionWindow = {
    startTs: '2026-02-26T09:00:00.000Z',
    endTs:   '2026-02-26T17:00:00.000Z',
    startMs: Date.parse('2026-02-26T09:00:00.000Z'),
    endMs:   Date.parse('2026-02-26T17:00:00.000Z'),
    dummyLots: new Set(),
    excludedPieces: 0,
  }

  it('retorna [] cuando no hay snapshots', () => {
    expect(buildConfigSegmentMarkAreas([], new Map(), window)).toEqual([])
    expect(buildConfigSegmentMarkAreas(undefined, new Map(), window)).toEqual([])
  })

  it('retorna [] cuando productionWindow es null', () => {
    const snaps = [mkSnap('a', '2026-02-26T10:00:00.000Z')]
    const verdicts = new Map([['a', mkVerdict('improved', -2)]])
    expect(buildConfigSegmentMarkAreas(snaps, verdicts, null)).toEqual([])
  })

  it('ignora snapshots synthetic (config inicial inferida)', () => {
    const snaps = [mkSnap('a', '2026-02-26T10:00:00.000Z', true)]
    const verdicts = new Map([['a', mkVerdict('improved', -2)]])
    // Synthetic se filtra antes de mirar verdict → 0 areas
    expect(buildConfigSegmentMarkAreas(snaps, verdicts, window)).toEqual([])
  })

  it('genera 1 area por snap manual con verdict tintable', () => {
    const snaps = [
      mkSnap('a', '2026-02-26T10:00:00.000Z'),
      mkSnap('b', '2026-02-26T13:00:00.000Z'),
    ]
    const verdicts = new Map([
      ['a', mkVerdict('improved', -2)],
      ['b', mkVerdict('worsened', 3)],
    ])
    const areas = buildConfigSegmentMarkAreas(snaps, verdicts, window)
    expect(areas).toHaveLength(2)
    // Primer area: 10:00 → 13:00 (improved → emerald)
    expect((areas[0]![0] as { xAxis: string }).xAxis).toBe('10:00')
    expect((areas[0]![1] as { xAxis: string }).xAxis).toBe('13:00')
    expect((areas[0]![0] as { itemStyle: { color: string } }).itemStyle.color).toBe('rgba(16, 185, 129, 0.07)')
    // Segundo area: 13:00 → 17:00 (worsened → rose, hasta fin de window)
    expect((areas[1]![0] as { xAxis: string }).xAxis).toBe('13:00')
    expect((areas[1]![1] as { xAxis: string }).xAxis).toBe('17:00')
    expect((areas[1]![0] as { itemStyle: { color: string } }).itemStyle.color).toBe('rgba(244, 63, 94, 0.07)')
  })

  it('descarta segmentos con status insufficient-data (sin tinte)', () => {
    const snaps = [mkSnap('a', '2026-02-26T10:00:00.000Z')]
    const verdicts = new Map([['a', mkVerdict('insufficient-data')]])
    expect(buildConfigSegmentMarkAreas(snaps, verdicts, window)).toEqual([])
  })

  it('descarta snapshots fuera del productionWindow', () => {
    // Snapshots con `at` 2 meses después del turno (caso real: registros
    // retroactivos hechos hoy sobre un turno histórico). Mi filtro los
    // descarta correctamente para no pintar bandas falsas.
    const snaps = [mkSnap('a', '2026-05-07T12:00:00.000Z')]
    const verdicts = new Map([['a', mkVerdict('improved', -2)]])
    expect(buildConfigSegmentMarkAreas(snaps, verdicts, window)).toEqual([])
  })

  it('descarta snapshots SIN verdict (Map sin entrada para el id)', () => {
    const snaps = [mkSnap('a', '2026-02-26T10:00:00.000Z')]
    // Sin entry → el helper no inventa veredicto, prefiere no tintar.
    expect(buildConfigSegmentMarkAreas(snaps, new Map(), window)).toEqual([])
  })

  it('mantiene orden cronológico aunque los snapshots vengan desordenados', () => {
    const snaps = [
      mkSnap('b', '2026-02-26T13:00:00.000Z'),
      mkSnap('a', '2026-02-26T10:00:00.000Z'),
    ]
    const verdicts = new Map([
      ['a', mkVerdict('improved', -2)],
      ['b', mkVerdict('neutral')],
    ])
    const areas = buildConfigSegmentMarkAreas(snaps, verdicts, window)
    expect((areas[0]![0] as { xAxis: string }).xAxis).toBe('10:00')
    expect((areas[1]![0] as { xAxis: string }).xAxis).toBe('13:00')
  })

  it('descarta segmentos con tA === tB (duración 0)', () => {
    // Edge case: snapshot exactamente al fin de productionWindow → tA===tB
    const snaps = [mkSnap('a', '2026-02-26T17:00:00.000Z')]
    const verdicts = new Map([['a', mkVerdict('improved', -2)]])
    // El segmento iría de 17:00 a 17:00 (fin window) → vacío, se descarta.
    expect(buildConfigSegmentMarkAreas(snaps, verdicts, window)).toEqual([])
  })
})

// ── computeCadenceStats / buildCadenceMarkLines ───────────────────────────────

/** Construye N buckets activos consecutivos a partir de un array de pz/min. */
function mkCadenceBuckets(piecesPerMin: number[]): TimelineBucket[] {
  return piecesPerMin.map((pieces, i) => {
    const min = String(i).padStart(2, '0')
    return mkBucket(`2026-02-26T09:${min}:00Z`, pieces, 0)
  })
}

describe('computeCadenceStats', () => {
  it('caso normal: mediana sobre minutos activos + mejor ventana móvil de 10', () => {
    // 12 minutos activos. Mediana clásica de los 12 valores = 45.
    // Mejor ventana de 10 consecutivos: los primeros 10 (suma 550) → 55 pz/min,
    // por encima de las otras 2 ventanas posibles (54.5 y 53).
    const buckets = mkCadenceBuckets([10, 20, 30, 40, 50, 60, 70, 80, 90, 100, 5, 5])
    const stats = computeCadenceStats(buckets)
    expect(stats.typicalPzMin).toBe(45)
    expect(stats.bestSustained10MinPzMin).toBe(55)
  })

  it('turno vacío: sin buckets activos → ambas líneas null (nunca NaN)', () => {
    const stats = computeCadenceStats([])
    expect(stats.typicalPzMin).toBeNull()
    expect(stats.bestSustained10MinPzMin).toBeNull()
  })

  it('turno corto (<10 min activos): mediana se calcula, sostenida se oculta', () => {
    // 5 minutos activos, mediana clásica (n impar) = 30. No hay ventana de 10
    // minutos posible → bestSustained10MinPzMin queda null (se oculta la línea).
    const buckets = mkCadenceBuckets([10, 20, 30, 40, 50])
    const stats = computeCadenceStats(buckets)
    expect(stats.typicalPzMin).toBe(30)
    expect(stats.bestSustained10MinPzMin).toBeNull()
  })

  it('exactamente 10 min activos: sostenida SÍ se calcula (borde inclusive)', () => {
    const buckets = mkCadenceBuckets([10, 10, 10, 10, 10, 10, 10, 10, 10, 10])
    const stats = computeCadenceStats(buckets)
    expect(stats.bestSustained10MinPzMin).toBe(10)
  })

  it('la mejor ventana no es necesariamente la primera', () => {
    // Ráfaga alta en el medio: la ventana de índices 2..11 (10 valores de
    // 100 consecutivos) debe ganarle a cualquier ventana que incluya un 5.
    const buckets = mkCadenceBuckets([5, 5, 100, 100, 100, 100, 100, 100, 100, 100, 100, 100, 5])
    const stats = computeCadenceStats(buckets)
    expect(stats.bestSustained10MinPzMin).toBe(100)
  })
})

describe('buildCadenceMarkLines', () => {
  it('caso normal: 2 líneas con el valor y label esperados', () => {
    const stats: CadenceStats = { typicalPzMin: 45, bestSustained10MinPzMin: 55 }
    const lines = buildCadenceMarkLines(stats) as Array<{ name: string; yAxis: number; label: { formatter: string } }>
    expect(lines).toHaveLength(2)
    expect(lines[0]!.name).toBe('Ritmo típico')
    expect(lines[0]!.yAxis).toBe(45)
    expect(lines[0]!.label.formatter).toBe('típico 45')
    expect(lines[1]!.name).toBe('Máx sostenida (10min)')
    expect(lines[1]!.yAxis).toBe(55)
    expect(lines[1]!.label.formatter).toBe('máx 10min 55')
  })

  it('turno vacío: sin stats → sin líneas (nunca NaN visible)', () => {
    const stats: CadenceStats = { typicalPzMin: null, bestSustained10MinPzMin: null }
    expect(buildCadenceMarkLines(stats)).toEqual([])
  })

  it('turno corto: solo la línea de ritmo típico, sostenida oculta', () => {
    const stats: CadenceStats = { typicalPzMin: 30, bestSustained10MinPzMin: null }
    const lines = buildCadenceMarkLines(stats) as Array<{ name: string }>
    expect(lines).toHaveLength(1)
    expect(lines[0]!.name).toBe('Ritmo típico')
  })
})
