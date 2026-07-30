/**
 * Velocidad real vs objetivo del sensor en el gráfico de tasa (pz/min).
 *
 * Los datos del turno son los REALES de la Baader 200 de Filete el 2026-07-28
 * (`shoplogix/filete/shifts/2026-07-28_Turno Dia`). Ese turno tiene justo los
 * dos casos que el gráfico debe leer bien:
 *   - buckets PARCIALES de arranque, donde el sensor escala el objetivo (5, 1…)
 *     y por eso el objetivo nominal NO puede salir del primer bucket
 *   - buckets con objetivo 20 pz/min y producción 0: máquina parada con el
 *     objetivo corriendo, que es lo que el sombreado tiene que marcar
 */
import { describe, it, expect } from 'vitest'
import { buildRateSeries, regroupRates } from '../ProductionRateLineEC'
import type { UpstreamMachineShift, UpstreamProductionInterval } from '@/services/shoplogix/types'

const BUCKET_MS = 5 * 60_000

function iv(startISO: string, cycles: number, targetRate: number | null): UpstreamProductionInterval {
  const startAt = new Date(startISO)
  return {
    startAt,
    endAt: new Date(startAt.getTime() + BUCKET_MS),
    cycles,
    expectedCycles: targetRate != null ? targetRate * 5 : 0,
    total: 0,
    expectedTotal: 0,
    ratio: 0,
    color: cycles > 0 ? 'green' : 'red',
    targetRate,
  }
}

/** Serie real del 28-jul: (hora, piezas, objetivo del sensor). */
const REAL_28_JUL: Array<[string, number, number | null]> = [
  ['2026-07-28T09:55:00Z',  5,  5],
  ['2026-07-28T14:30:00Z',  1,  1],
  ['2026-07-28T14:35:00Z',  1,  1],
  ['2026-07-28T14:45:00Z',  1,  1],
  ['2026-07-28T15:10:00Z', 16, 10.93],
  ['2026-07-28T15:15:00Z',  7,  7.07],
  ['2026-07-28T15:20:00Z', 11,  7.94],
  ['2026-07-28T15:45:00Z',  0, 20],   // ← parada con objetivo
  ['2026-07-28T15:50:00Z',  0, 20],   // ← parada con objetivo
  ['2026-07-28T15:55:00Z',  0, 20],   // ← parada con objetivo
  ['2026-07-28T16:00:00Z',  0, 20],   // ← parada con objetivo
  ['2026-07-28T16:05:00Z', 13, 19.03],
  ['2026-07-28T16:10:00Z',  4,  3],
]

function baader200(): UpstreamMachineShift {
  const intervals = REAL_28_JUL.map(([t, c, r]) => iv(t, c, r))
  return {
    machineid: '3c0581da-9f19-49f0-aa15-b1596ae94dbd',
    machineName: 'Linea 1',
    machineType: 'baader_200',
    dateKey: '2026-07-28',
    shiftId: 'Turno Dia',
    shiftStart: new Date('2026-07-28T08:00:00Z'),
    shiftEnd: new Date('2026-07-29T08:00:00Z'),
    scheduledStart: new Date('2026-07-28T08:00:00Z'),
    scheduledEnd: new Date('2026-07-29T08:00:00Z'),
    scheduleSource: 'intervals',
    totalCycles: 59,
    expectedTotalCycles: 680,
    totalPieces: 59,
    expectedTotalPieces: 680,
    overallRatio: 0.087,
    actualRuntime: 0,
    expectedRuntime: 0,
    runtimeVariance: 0,
    shiftRuntime: 0.33,
    shiftRuntimeBreakdown: {
      uptimeSec: 675, breakSec: 0, plannedDowntimeSec: 84360, downtimeSec: 1368,
      setupSec: 0, totalTrackedSec: 86400,
    },
    intervals,
    states: [],
    threshold: 15,
    productionUnit: 'Filetes',
    comments: [],
    source: 'shoplogix',
    sourceVersion: 4,
    syncedAt: new Date('2026-07-30T00:00:00Z'),
  }
}

describe('buildRateSeries · objetivo del sensor', () => {
  it('el objetivo nominal sale del MÁXIMO por bucket, no del primero (que es parcial)', () => {
    const { expectedRate } = buildRateSeries([baader200()])
    expect(expectedRate).toBeCloseTo(20, 1)   // con el primer bucket daría 5
  })

  it('dibuja el objetivo por bucket, no una constante', () => {
    const { timeAxis, targetSeries } = buildRateSeries([baader200()])
    expect(targetSeries).toHaveLength(timeAxis.length)
    const distintos = new Set(targetSeries.filter((v): v is number => v != null))
    expect(distintos.size).toBeGreaterThan(3)
  })

  it('marca como "parada con objetivo" los 20 min de 15:45 a 16:05 (un solo bloque)', () => {
    const { stoppedWithTarget } = buildRateSeries([baader200()])
    expect(stoppedWithTarget).toHaveLength(1)
    const [from, to] = stoppedWithTarget[0]!
    expect(new Date(from).toISOString()).toBe('2026-07-28T15:45:00.000Z')
    expect((to - from) / 60_000).toBe(20)
  })

  it('la velocidad real es piezas ÷ minutos, nunca el objetivo del sensor', () => {
    const { timeAxis, series, targetSeries } = buildRateSeries([baader200()])
    const i = timeAxis.indexOf(new Date('2026-07-28T15:45:00Z').getTime())
    expect(i).toBeGreaterThanOrEqual(0)
    // El bucket parado: objetivo 20, real 0. Confundirlos pintaría 20 pz/min
    // en un tramo sin una sola pieza producida.
    expect(targetSeries[i]).toBeCloseTo(20, 1)
    expect(series[0]!.data[i]).toBe(0)
    // Y el bucket de 15:10: 16 piezas en 5 min = 3,2 pz/min.
    const j = timeAxis.indexOf(new Date('2026-07-28T15:10:00Z').getTime())
    expect(series[0]!.data[j]).toBeCloseTo(3.2, 1)
  })

  it('sin objetivo del sensor (docs viejos) cae a expectedCycles y no revienta', () => {
    const m = baader200()
    m.intervals = m.intervals.map((x) => ({ ...x, targetRate: null }))
    const { expectedRate, targetSeries } = buildRateSeries([m])
    expect(expectedRate).toBeCloseTo(20, 1)
    expect(targetSeries.some((v) => v != null)).toBe(true)
  })

  it('sin objetivo ni expectedCycles no inventa objetivo', () => {
    const m = baader200()
    m.intervals = m.intervals.map((x) => ({ ...x, targetRate: null, expectedCycles: 0 }))
    const { expectedRate, targetSeries, stoppedWithTarget } = buildRateSeries([m])
    expect(expectedRate).toBe(0)
    expect(targetSeries.every((v) => v === null)).toBe(true)
    expect(stoppedWithTarget).toHaveLength(0)
  })
})

// ── Agrupación a tramos más anchos ───────────────────────────────────────────
// Con más de ~4 h a la vista, los tramos de 5 min quedan de 1-2 px. Al agrupar,
// lo que NO puede pasar es afirmar producción cero donde solo falta el dato.

describe('regroupRates', () => {
  const T = (hhmm: string) => new Date(`2026-07-28T${hhmm}:00Z`).getTime()

  it('promedia los sub-tramos CON dato dentro del mismo grupo', () => {
    // Los grupos son [15:00,15:15) y [15:15,15:30): 15:00+15:05+15:10 caen juntos.
    const r = regroupRates([T('15:00'), T('15:05'), T('15:10')], [3.2, 1.4, 2.2], 15 * 60_000)
    expect(r.timeAxis).toHaveLength(1)
    expect(r.values[0]).toBeCloseTo(2.3, 1)
  })

  it('respeta los límites del grupo (15:10 y 15:15 NO son el mismo tramo)', () => {
    const r = regroupRates([T('15:10'), T('15:15')], [3.2, 1.4], 15 * 60_000)
    expect(r.timeAxis).toHaveLength(2)
    expect(r.values).toEqual([3.2, 1.4])
  })

  it('un sub-tramo con dato entre dos vacíos NO se diluye a un tercio', () => {
    const r = regroupRates([T('15:00'), T('15:05'), T('15:10')], [null, 3, null], 15 * 60_000)
    expect(r.values[0]).toBe(3)
  })

  it('un tramo sin ningún dato queda hueco (null), no en cero', () => {
    const r = regroupRates([T('12:00'), T('12:05'), T('12:10')], [null, null, null], 15 * 60_000)
    expect(r.values[0]).toBeNull()
  })

  it('separa los tramos en grupos de 15 min y los ordena', () => {
    const r = regroupRates([T('16:10'), T('15:00'), T('15:20')], [1, 2, 3], 15 * 60_000)
    expect(r.timeAxis).toHaveLength(3)
    expect(r.timeAxis[0]).toBeLessThan(r.timeAxis[1]!)
    expect(r.values).toEqual([2, 3, 1])
  })

  it('no toca nada con serie vacía o grupo inválido', () => {
    expect(regroupRates([], [], 15 * 60_000).values).toEqual([])
    const same = regroupRates([T('15:00')], [5], 0)
    expect(same.values).toEqual([5])
  })
})
