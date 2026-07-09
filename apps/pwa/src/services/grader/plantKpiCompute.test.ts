import { describe, it, expect } from 'vitest'
import { aggregateShifts, computeMachineKPI, availabilityISO, performanceISO } from './plantKpiCompute'
import type { UpstreamMachineShift } from '@/services/shoplogix/types'
import type { GraderDailySummary } from './types'

// Máquina de prueba con tiempos y buckets REALISTAS para las fórmulas ISO:
//   uptime 3600s (60min) + downtime 600s (10min) + setup 0 + break 1800s (colación).
//   A_iso = 3600/(3600+600+0) = 0.857  (la colación NO entra al denominador)
//   Buckets: uno produciendo 80/100, uno PARADO 0/100 (no debe castigar P).
//   P_iso = 80/100 = 0.80  (solo cuenta el bucket con producción)
function fakeMachine(over: Partial<UpstreamMachineShift> = {}): UpstreamMachineShift {
  return {
    machineid: 'm1',
    machineName: 'Evisceradora 1',
    shiftRuntime: 0.5,   // valor viejo (ya NO se usa para A)
    overallRatio: 0.4,   // valor viejo (ya NO se usa para P)
    shiftRuntimeBreakdown: { uptimeSec: 3600, downtimeSec: 600, setupSec: 0, breakSec: 1800 },
    states: [], // sin averías → MTTR 0, MTBF = uptime/3600
    intervals: [
      { cycles: 80, expectedCycles: 100 }, // produciendo
      { cycles: 0, expectedCycles: 100 },  // PARADO (paro con expected>0)
    ],
    totalCycles: 80,
    ...over,
  } as unknown as UpstreamMachineShift
}

function fakeGrader(over: Partial<GraderDailySummary> = {}): GraderDailySummary {
  return { dateKey: '2026-02-27', shiftId: 'Turno día', pointZeroPct: 2, ...over } as unknown as GraderDailySummary
}

describe('availabilityISO', () => {
  it('EXCLUYE la colación/break del denominador (estándar ISO)', () => {
    // Si contara la colación: 3600/(3600+600+1800) = 0.60. ISO: 3600/4200 = 0.857
    expect(availabilityISO({ uptimeSec: 3600, downtimeSec: 600, setupSec: 0 })).toBeCloseTo(0.857, 3)
  })
  it('sin tiempo productivo → 0', () => {
    expect(availabilityISO({ uptimeSec: 0, downtimeSec: 0, setupSec: 0 })).toBe(0)
  })
})

describe('performanceISO', () => {
  it('NO castiga el tiempo de paro (solo buckets con producción)', () => {
    // Si contara el bucket parado: 80/200 = 0.40 (doble conteo). ISO: 80/100 = 0.80
    expect(performanceISO([
      { cycles: 80, expectedCycles: 100 },
      { cycles: 0, expectedCycles: 100 },
    ])).toBeCloseTo(0.8)
  })
  it('se capea a 1.0 cuando produce más rápido que el ideal', () => {
    expect(performanceISO([{ cycles: 120, expectedCycles: 100 }])).toBe(1)
  })
  it('sin producción → 0', () => {
    expect(performanceISO([{ cycles: 0, expectedCycles: 100 }])).toBe(0)
  })
})

describe('plantKpiCompute', () => {
  it('computeMachineKPI: A/P ISO + MTBF sin averías', () => {
    const k = computeMachineKPI(fakeMachine())
    expect(k.availability).toBeCloseTo(0.857, 3) // colación fuera
    expect(k.performance).toBeCloseTo(0.8)       // paro no castiga P
    expect(k.failureCount).toBe(0)
    expect(k.mttrMin).toBe(0)
    expect(k.mtbfHours).toBeCloseTo(1) // uptime 3600s / 3600
  })

  it('aggregateShifts: OEE = A × P × Q (Q = 1 − P0%)', () => {
    const shift = { dateKey: '2026-02-27', shiftId: 'Turno día', machines: [fakeMachine()] }
    const kpis = aggregateShifts([shift], 'test', [fakeGrader({ pointZeroPct: 2 })])
    expect(kpis).not.toBeNull()
    expect(kpis!.availability).toBeCloseTo(0.857, 3)
    expect(kpis!.performance).toBeCloseTo(0.8)
    expect(kpis!.quality).toBeCloseTo(0.98)
    expect(kpis!.oee).toBeCloseTo(0.857 * 0.8 * 0.98, 3)
  })

  it('aggregateShifts: agrega 2 turnos ponderando por segundos/ciclos, no promediando ratios', () => {
    const t1 = { dateKey: '2026-02-27', shiftId: 'Turno día', machines: [fakeMachine()] }
    const t2 = { dateKey: '2026-02-28', shiftId: 'Turno día', machines: [fakeMachine({
      shiftRuntimeBreakdown: { uptimeSec: 1800, downtimeSec: 1800, setupSec: 0, breakSec: 0 },
      intervals: [{ cycles: 50, expectedCycles: 100 }],
      totalCycles: 50,
    } as unknown as Partial<UpstreamMachineShift>)] }
    const kpis = aggregateShifts([t1, t2], 'test', [])
    // A ponderada = (3600+1800)/((3600+600)+(1800+1800)) = 5400/7800 = 0.692
    expect(kpis!.availability).toBeCloseTo(0.692, 3)
    // P ponderada = (80+50)/(100+100) = 0.65  (solo buckets con producción)
    expect(kpis!.performance).toBeCloseTo(0.65)
  })

  it('aggregateShifts: sin Grader → quality y oee null', () => {
    const shift = { dateKey: '2026-02-27', shiftId: 'Turno día', machines: [fakeMachine()] }
    const kpis = aggregateShifts([shift], 'test', [])
    expect(kpis!.quality).toBeNull()
    expect(kpis!.oee).toBeNull()
  })
})
