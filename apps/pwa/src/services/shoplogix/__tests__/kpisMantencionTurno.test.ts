/**
 * Espejo cliente de `functions/shoplogix/__tests__/kpisMantencion.test.js`:
 * misma historia (el 26-08 de Eviscerado P. Principal) y mismas reglas.
 * Si un caso cambia acá, cambiarlo allá — los dos módulos deben contar lo mismo.
 */
import { describe, it, expect } from 'vitest'
import {
  clasificaCausa, sanearStates, encadenarFallas, kpisDeMaquina,
  velocidadDesdeIntervals, targetSospechoso, kpisDeTurno,
} from '../kpisMantencionTurno'
import type { UpstreamLineSnapshot, UpstreamMachineState } from '../types'

const st = (o: {
  startAt: string
  endAt: string
  type?: UpstreamMachineState['type']
  name?: string
  reason?: string
}): UpstreamMachineState => ({
  type: o.type ?? 'downtime',
  name: o.name ?? 'Detencion',
  reason: o.reason ?? '',
  color: '#f00',
  isCurrent: false,
  startAt: new Date(o.startAt),
  endAt: new Date(o.endAt),
  durationSec: (Date.parse(o.endAt) - Date.parse(o.startAt)) / 1000,
})

describe('clasificaCausa', () => {
  it.each([
    [{ type: 'uptime', name: 'Produciendo', reason: '' }, 'produccion'],
    [{ type: 'break', name: 'Detencion', reason: 'COLACION' }, 'planificado'],
    [{ type: 'break', name: 'Detencion', reason: 'EJERCICIO  COMPENSATORIO - Paro' }, 'planificado'],
    [{ type: 'downtime', name: 'Detencion Excedido', reason: 'COLACION' }, 'excedido'],
    [{ type: 'downtime', name: 'Detencion', reason: 'ACUMULACION RECHAZO' }, 'externo'],
    [{ type: 'downtime', name: 'Micro Detencion', reason: '' }, 'micro'],
    [{ type: 'downtime', name: 'Detencion', reason: 'KNURO' }, 'falla'],
    [{ type: 'downtime', name: 'Detencion', reason: '' }, 'sin-imputar'],
  ] as const)('%o → %s', (state, esperado) => {
    expect(clasificaCausa(state as never)).toBe(esperado)
  })
})

describe('sanearStates — las dos trampas del 26-08', () => {
  const ventana = { start: new Date('2026-08-26T07:15:00Z'), end: new Date('2026-08-26T15:10:00Z') }

  it('⚠ el Unscheduled repite states: dedupe por clave', () => {
    const knuro = st({ reason: 'KNURO', startAt: '2026-08-26T09:19:53Z', endAt: '2026-08-26T09:59:53Z' })
    const out = sanearStates([knuro, { ...knuro }], ventana)
    expect(out).toHaveLength(1)
    expect(out[0]!.durationSec).toBe(2400)
  })

  it('⚠ un state que sigue corriendo se recorta a la ventana', () => {
    const cierre = st({ type: 'break', reason: 'DETENCION PROGRAMADA', startAt: '2026-08-26T15:09:00Z', endAt: '2026-08-26T17:49:00Z' })
    const out = sanearStates([cierre], ventana)
    expect(out[0]!.durationSec).toBe(60)
  })
})

describe('encadenarFallas — la crisis KNURO es UN evento', () => {
  const f = (desde: string, hasta: string, causa = 'KNURO') => ({
    desde: new Date(desde), hasta: new Date(hasta), sec: (Date.parse(hasta) - Date.parse(desde)) / 1000, causa,
  })
  const fallas = [
    f('2026-08-26T08:51:38Z', '2026-08-26T08:57:08Z'),
    f('2026-08-26T08:57:23Z', '2026-08-26T09:08:38Z'),
    f('2026-08-26T09:19:53Z', '2026-08-26T09:59:53Z'), // re-cae a los 11m15s
    f('2026-08-26T12:18:54Z', '2026-08-26T12:26:54Z', 'LOGICA'),
  ]

  it('huecos de hasta 11m15s encadenan (gap 12 min); LOGICA queda aparte', () => {
    const ev = encadenarFallas(fallas)
    expect(ev).toHaveLength(2)
    expect(ev[0]!.paros).toBe(3)
    expect(ev[1]!.causas).toEqual(['LOGICA'])
  })

  it('con gap chico solo encadena lo pegado (las dos primeras van a 15 s)', () => {
    expect(encadenarFallas(fallas, 60_000)).toHaveLength(3)
  })
})

describe('kpisDeMaquina', () => {
  it('MTTR/MTBF por EVENTO; la colación no castiga la disponibilidad técnica', () => {
    const states = [
      st({ type: 'uptime', name: 'Produciendo', startAt: '2026-08-26T07:15:00Z', endAt: '2026-08-26T08:51:00Z' }),
      st({ reason: 'KNURO', startAt: '2026-08-26T08:51:00Z', endAt: '2026-08-26T08:57:00Z' }),
      st({ reason: 'KNURO', startAt: '2026-08-26T09:00:00Z', endAt: '2026-08-26T09:40:00Z' }),
      st({ type: 'uptime', name: 'Produciendo', startAt: '2026-08-26T09:40:00Z', endAt: '2026-08-26T11:40:00Z' }),
      st({ type: 'break', reason: 'COLACION', startAt: '2026-08-26T11:40:00Z', endAt: '2026-08-26T12:25:00Z' }),
      st({ type: 'uptime', name: 'Produciendo', startAt: '2026-08-26T12:25:00Z', endAt: '2026-08-26T15:00:00Z' }),
    ]
    const k = kpisDeMaquina(states)
    expect(k.eventosFalla).toHaveLength(1)
    expect(Math.round(k.mttrMin!)).toBe(46)
    expect(Math.round(k.mtbfMin!)).toBe(371)
    expect(k.dispTecnicaPct!).toBeGreaterThan(88)
    expect(k.dispTecnicaPct!).toBeLessThan(90)
  })

  it('sin fallas: 100% y MTTR/MTBF null (las Ev2/Ev3 del 26-08)', () => {
    const k = kpisDeMaquina([
      st({ type: 'uptime', name: 'Produciendo', startAt: '2026-08-26T07:15:00Z', endAt: '2026-08-26T15:00:00Z' }),
    ])
    expect(k.dispTecnicaPct).toBe(100)
    expect(k.mttrMin).toBeNull()
  })
})

describe('velocidadDesdeIntervals + targetSospechoso', () => {
  const iv = (cycles: number, expectedCycles: number) => ({
    startAt: new Date(), endAt: new Date(), cycles, expectedCycles,
    total: cycles, expectedTotal: expectedCycles, ratio: expectedCycles ? cycles / expectedCycles : 0,
    color: 'green' as const, targetRate: null,
  })

  it('solo evalúa intervalos ANDANDO con esperado', () => {
    const v = velocidadDesdeIntervals([iv(75, 80), iv(40, 80), iv(0, 80), iv(50, 0)])
    expect(v.nAndando).toBe(2)
    expect(Math.round(v.pctLleno!)).toBe(50)
  })

  it('⚠ la Ev1 del 26-08: mediana 13-15 contra esperado 19 → target sospechoso', () => {
    // 20 intervalos a ~14 pz/min con esperado 19: ninguno llega al 90%.
    const v = velocidadDesdeIntervals(Array.from({ length: 20 }, () => iv(70, 95)))
    expect(targetSospechoso(v)).toBe(true)
  })

  it('una máquina sana no dispara el aviso', () => {
    const v = velocidadDesdeIntervals(Array.from({ length: 20 }, (_, i) => iv(i % 3 ? 78 : 60, 80)))
    expect(targetSospechoso(v)).toBe(false)
  })
})

describe('kpisDeTurno', () => {
  it('caída de línea: e=0 en todas = planta sin operar, no cuenta como no-planificada', () => {
    const mk = (cycles: number[], expected: number[]): UpstreamLineSnapshot['machines'][number] => ({
      machineid: 'x', machineName: 'Ev', machineType: 'baader_142',
      dateKey: '2026-08-26', shiftId: 'Turno 2',
      shiftStart: new Date('2026-08-26T07:15:00Z'), shiftEnd: new Date('2026-08-26T15:00:00Z'),
      scheduledStart: new Date('2026-08-26T07:15:00Z'), scheduledEnd: new Date('2026-08-26T15:00:00Z'),
      totalCycles: 0, expectedTotalCycles: 0, totalPieces: 0, expectedTotalPieces: 0,
      overallRatio: 0, actualRuntime: 0, expectedRuntime: 0, runtimeVariance: 0,
      shiftRuntime: 0,
      shiftRuntimeBreakdown: { uptimeSec: 0, breakSec: 0, plannedDowntimeSec: 0, downtimeSec: 0, setupSec: 0, totalTrackedSec: 0 },
      intervals: cycles.map((c, i) => ({
        startAt: new Date(), endAt: new Date(), cycles: c, expectedCycles: expected[i]!,
        total: c, expectedTotal: expected[i]!, ratio: 0, color: 'gray', targetRate: null,
      })),
      states: [],
      threshold: 15, productionUnit: 'Eviscerado', comments: [],
      source: 'shoplogix', sourceVersion: 4, syncedAt: new Date(),
    })
    const snap = {
      dateKey: '2026-08-26', shiftId: 'Turno 2',
      machines: [mk([0, 0, 5], [19, 0, 19]), mk([0, 0, 0], [16, 0, 16])],
      lineThroughputActual: 0, lineThroughputExpected: 0, lineWindowHours: 0,
      lineWindowSource: 'shift', lineAvailability: 0, machinesProducing: 0,
    } as unknown as UpstreamLineSnapshot
    const k = kpisDeTurno(snap)!
    expect(k.linea.caidaTotalMin).toBe(10)          // intervalos 0 y 1
    expect(k.linea.caidaNoPlanificadaMin).toBe(5)   // solo el 0 (e>0)
  })
})
