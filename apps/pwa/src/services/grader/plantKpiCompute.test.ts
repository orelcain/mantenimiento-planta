import { describe, it, expect } from 'vitest'
import { aggregateShifts, computeMachineKPI, availabilityISO, performanceISO, targetCpmFromIntervals, computeLostPieces, cadenceCpm, lineCadenceCpm, computeOfficialCompliance } from './plantKpiCompute'
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

describe('targetCpmFromIntervals', () => {
  it('IGNORA el bucket parcial de arranque y toma el bucket completo', () => {
    // Caso real yal 2026-07-09 Turno 3, Evisceradora 1: el primer bucket con
    // expected>0 es parcial (37.95) → tomarlo daba 7.6 pz/min en vez de 16.0.
    expect(targetCpmFromIntervals([
      { expectedCycles: 37.9528 }, // arranque parcial
      { expectedCycles: 0 },
      { expectedCycles: 62.0992 }, // parcial
      { expectedCycles: 80 },      // bucket completo → el target real
      { expectedCycles: 80 },
    ])).toBeCloseTo(16.0)
  })
  it('sin buckets con producción esperada → null', () => {
    expect(targetCpmFromIntervals([{ expectedCycles: 0 }, { expectedCycles: 0 }])).toBeNull()
  })
  it('lista vacía → null', () => {
    expect(targetCpmFromIntervals([])).toBeNull()
  })
})

describe('cadenceCpm / lineCadenceCpm', () => {
  it('cadencia = ciclos / minutos en marcha', () => {
    expect(cadenceCpm(1600, 100 * 60)).toBeCloseTo(16)
    expect(cadenceCpm(100, 0)).toBe(0) // sin uptime → 0, no Infinity
  })
  it('la cadencia de línea es la mediana de las máquinas activas', () => {
    expect(lineCadenceCpm([15.4, 16.2, 15.4])).toBeCloseTo(15.4)
    expect(lineCadenceCpm([16, 0, 14])).toBeCloseTo(15) // ignora las que no produjeron
    expect(lineCadenceCpm([0, 0])).toBeNull()
    expect(lineCadenceCpm([])).toBeNull()
  })
})

describe('computeLostPieces', () => {
  const H = 3600 // 1 hora en segundos

  it('la máquina más lenta que la línea pierde por velocidad', () => {
    // corre a 14 pz/min con la línea a 16 → 2 pz/min × 60 min = 120 piezas
    const r = computeLostPieces(14 * 60, H, 0, 16)
    expect(r.lostBySpeed).toBeCloseTo(120)
    expect(r.lostByStops).toBe(0)
  })

  it('la máquina más RÁPIDA que la línea no pierde nada por velocidad', () => {
    const r = computeLostPieces(18 * 60, H, 0, 16)
    expect(r.lostBySpeed).toBe(0)
  })

  it('el downtime se valora a la cadencia de la línea', () => {
    // 30 min parado × 16 pz/min = 480 piezas
    expect(computeLostPieces(0, 0, 30 * 60, 16).lostByStops).toBeCloseTo(480)
  })

  it('sin línea de referencia usa su propia cadencia → no pierde por velocidad', () => {
    const r = computeLostPieces(16 * 60, H, 30 * 60, null)
    expect(r.lostBySpeed).toBe(0)
    expect(r.lostByStops).toBeCloseTo(480) // su cadencia es 16
  })

  // EL CASO QUE MOTIVÓ EL CAMBIO. Contra el target propio, la Baader antigua
  // (19 pz/min) "perdía" el doble que las nuevas pese a correr más rápido.
  it('la Baader antigua corre más rápido que sus pares → 0 piezas perdidas por velocidad', () => {
    const linea = lineCadenceCpm([15.4, 15.4, 16.2])! // mediana = 15.4

    const antigua = computeLostPieces(16.2 * 60, H, 0, linea) // Ev3, target 19
    const nueva   = computeLostPieces(15.4 * 60, H, 0, linea) // Ev1, target 16

    expect(antigua.lostBySpeed).toBe(0)
    expect(nueva.lostBySpeed).toBeCloseTo(0)
    // Y la antigua entrega MÁS piezas que la nueva.
    expect(16.2 * 60).toBeGreaterThan(15.4 * 60)
  })

  it('a igual cadencia, la que más para es la que más arrastra', () => {
    const antigua = computeLostPieces(16 * 60, H, 60 * 60, 16) // 60 min parada
    const nueva   = computeLostPieces(16 * 60, H, 30 * 60, 16) // 30 min parada
    expect(antigua.lostByStops).toBeCloseTo(960)
    expect(nueva.lostByStops).toBeCloseTo(480)
    expect(antigua.lostByStops).toBeGreaterThan(nueva.lostByStops)
  })

  it('un paro largo domina sobre la pérdida de velocidad', () => {
    const r = computeLostPieces(15 * 60, H, 20 * 60, 16)
    expect(r.lostBySpeed).toBeCloseTo(60)   // 1 pz/min × 60 min
    expect(r.lostByStops).toBeCloseTo(320)  // 20 min × 16
    expect(r.lostByStops).toBeGreaterThan(r.lostBySpeed)
  })
})

describe('plantKpiCompute', () => {
  it('computeMachineKPI: target = bucket completo, no el primero', () => {
    const k = computeMachineKPI(fakeMachine({
      intervals: [
        { cycles: 20, expectedCycles: 38 }, // arranque parcial
        { cycles: 80, expectedCycles: 100 },
      ],
    } as unknown as Partial<UpstreamMachineShift>))
    expect(k.shoplogixTargetCpm).toBeCloseTo(20.0) // 100/5, no 38/5 = 7.6
  })

  it('aggregateShifts: target toma el máximo entre TODOS los turnos del período', () => {
    // El turno que va primero cronológicamente arrancó con bucket parcial.
    const parcial = fakeMachine({ intervals: [{ cycles: 20, expectedCycles: 38 }] } as unknown as Partial<UpstreamMachineShift>)
    const completo = fakeMachine({ intervals: [{ cycles: 80, expectedCycles: 100 }] } as unknown as Partial<UpstreamMachineShift>)
    const agg = aggregateShifts(
      [
        { dateKey: '2026-02-27', shiftId: 'Turno noche', machines: [parcial] },
        { dateKey: '2026-02-27', shiftId: 'Turno día', machines: [completo] },
      ],
      'día',
      [],
    )
    expect(agg!.machines[0]!.shoplogixTargetCpm).toBeCloseTo(20.0)
  })

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

describe('computeOfficialCompliance', () => {
  const machines = [
    { machineid: 'a', totalCycles: 1109 },
    { machineid: 'b', totalCycles: 900 },
    { machineid: 'c', totalCycles: 934 },
  ]
  const targets = { a: 1109.4195, b: 934.248, c: 934.248 } // caso real chonchi Turno 1 COHO

  it('sin rollup (turno histórico) → null, no inventa target', () => {
    expect(computeOfficialCompliance(machines, null)).toBeNull()
    expect(computeOfficialCompliance(machines, undefined)).toBeNull()
  })

  it('targetTotal 0 → null (no dividir por cero)', () => {
    expect(computeOfficialCompliance(machines, { a: 0, b: 0 })).toBeNull()
  })

  it('calcula % y nivel igual que componerBriefFinTurno (umbrales 95/75)', () => {
    const r = computeOfficialCompliance(machines, targets)
    expect(r).not.toBeNull()
    expect(r!.totalCycles).toBe(2943)
    expect(r!.targetTotal).toBeCloseTo(2977.9155, 2)
    expect(r!.pct).toBeCloseTo(0.9883, 3) // ~99% → ok
    expect(r!.level).toBe('ok')
  })

  it('nivel warn entre 75% y 95%', () => {
    const r = computeOfficialCompliance([{ machineid: 'a', totalCycles: 800 }], { a: 1000 })
    expect(r!.level).toBe('warn')
  })

  it('nivel critical bajo 75% (caso brief: 20% del target → rojo)', () => {
    const r = computeOfficialCompliance([{ machineid: 'a', totalCycles: 1000 }], { a: 5000 })
    expect(r!.pct).toBeCloseTo(0.2, 3)
    expect(r!.level).toBe('critical')
  })

  it('puede superar 100% (sin techo)', () => {
    const r = computeOfficialCompliance([{ machineid: 'a', totalCycles: 1200 }], { a: 1000 })
    expect(r!.pct).toBeCloseTo(1.2, 3)
    expect(r!.level).toBe('ok')
  })
})
