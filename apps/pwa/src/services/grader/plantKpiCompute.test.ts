import { describe, it, expect } from 'vitest'
import { aggregateShifts, computeMachineKPI } from './plantKpiCompute'
import type { UpstreamMachineShift } from '@/services/shoplogix/types'
import type { GraderDailySummary } from './types'

function fakeMachine(over: Partial<UpstreamMachineShift> = {}): UpstreamMachineShift {
  return {
    machineid: 'm1',
    machineName: 'Evisceradora 1',
    shiftRuntime: 0.5, // disponibilidad
    overallRatio: 0.4, // rendimiento
    shiftRuntimeBreakdown: { uptimeSec: 3600 },
    states: [], // sin averías → MTTR 0, MTBF = uptime/3600
    intervals: [{ expectedCycles: 100 }],
    totalCycles: 1000,
    ...over,
  } as unknown as UpstreamMachineShift
}

function fakeGrader(over: Partial<GraderDailySummary> = {}): GraderDailySummary {
  return { dateKey: '2026-02-27', shiftId: 'Turno día', pointZeroPct: 2, ...over } as unknown as GraderDailySummary
}

describe('plantKpiCompute', () => {
  it('computeMachineKPI: disponibilidad/rendimiento/MTBF sin averías', () => {
    const k = computeMachineKPI(fakeMachine())
    expect(k.availability).toBeCloseTo(0.5)
    expect(k.performance).toBeCloseTo(0.4)
    expect(k.failureCount).toBe(0)
    expect(k.mttrMin).toBe(0)
    expect(k.mtbfHours).toBeCloseTo(1) // uptime 3600s / 3600
  })

  it('performance se capea a 1.0', () => {
    expect(computeMachineKPI(fakeMachine({ overallRatio: 1.4 })).performance).toBe(1)
  })

  it('aggregateShifts: OEE = A × P × Q (Q = 1 − P0%)', () => {
    const shift = { dateKey: '2026-02-27', shiftId: 'Turno día', machines: [fakeMachine()] }
    const kpis = aggregateShifts([shift], 'test', [fakeGrader({ pointZeroPct: 2 })])
    expect(kpis).not.toBeNull()
    expect(kpis!.availability).toBeCloseTo(0.5)
    expect(kpis!.performance).toBeCloseTo(0.4)
    expect(kpis!.quality).toBeCloseTo(0.98)
    expect(kpis!.oee).toBeCloseTo(0.5 * 0.4 * 0.98) // 0.196
  })

  it('aggregateShifts: sin Grader → quality y oee null', () => {
    const shift = { dateKey: '2026-02-27', shiftId: 'Turno día', machines: [fakeMachine()] }
    const kpis = aggregateShifts([shift], 'test', [])
    expect(kpis!.quality).toBeNull()
    expect(kpis!.oee).toBeNull()
  })
})
