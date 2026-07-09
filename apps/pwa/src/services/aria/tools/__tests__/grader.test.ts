import { describe, it, expect } from 'vitest'
import { extractStopEvents, inferToolParams } from '../grader'
import type { UpstreamLineSnapshot, UpstreamMachineState, UpstreamMachineShift } from '@/services/shoplogix/types'

function mockState(partial: Partial<UpstreamMachineState>): UpstreamMachineState {
  return {
    startAt: new Date('2026-07-08T14:00:00Z'),
    endAt: new Date('2026-07-08T14:05:00Z'),
    durationSec: 300,
    type: 'uptime',
    name: 'Produciendo',
    reason: '',
    color: '#22c55e',
    isCurrent: false,
    ...partial,
  }
}

function mockMachine(name: string, states: UpstreamMachineState[]): UpstreamMachineShift {
  return {
    machineid: name,
    machineName: name,
    machineType: 'eviscerado',
    dateKey: '2026-07-08',
    shiftId: 'Turno 2',
    shiftStart: new Date('2026-07-08T14:45:00Z'),
    shiftEnd: new Date('2026-07-09T00:00:00Z'),
    totalCycles: 100,
    expectedTotalCycles: 100,
    totalPieces: 100,
    expectedTotalPieces: 100,
    overallRatio: 1,
    actualRuntime: 0.5,
    expectedRuntime: 1,
    runtimeVariance: 0,
    shiftRuntime: 0.5,
    intervals: [],
    states,
    threshold: 15,
    productionUnit: 'cycles',
    comments: [],
    source: 'shoplogix',
    sourceVersion: 1,
    syncedAt: new Date(),
    dataQualityIssues: [],
  } as unknown as UpstreamMachineShift
}

function mockSnapshot(machines: UpstreamMachineShift[]): UpstreamLineSnapshot {
  return {
    dateKey: '2026-07-08',
    shiftId: 'Turno 2',
    machines,
    lineThroughputActual: 0,
    lineThroughputExpected: 0,
    lineAvailability: 0.5,
    machinesProducing: 0,
  }
}

describe('extractStopEvents', () => {
  it('extrae solo states downtime, ordenados por hora de inicio', () => {
    const states = [
      mockState({ type: 'uptime', startAt: new Date('2026-07-08T14:00:00Z') }),
      mockState({
        type: 'downtime', reason: 'ENERGIA', durationSec: 900,
        startAt: new Date('2026-07-08T15:30:00Z'),
      }),
      mockState({
        type: 'break', reason: 'COLACION', durationSec: 1800,
        startAt: new Date('2026-07-08T14:10:00Z'),
      }),
      mockState({
        type: 'downtime', reason: 'ATASCAMIENTO', durationSec: 120,
        startAt: new Date('2026-07-08T14:05:00Z'),
      }),
    ]
    const snap = mockSnapshot([mockMachine('Evisceradora 1', states)])
    const events = extractStopEvents(snap)

    expect(events).toHaveLength(2) // solo downtime, no uptime ni break
    expect(events[0]!.causa).toBe('ATASCAMIENTO') // más temprano primero
    expect(events[0]!.durationSec).toBe(120)
    expect(events[1]!.causa).toBe('ENERGIA')
    expect(events[1]!.durationSec).toBe(900)
  })

  it('clasifica macro/micro vía isMaintenanceMacro/Micro', () => {
    const states = [
      mockState({
        type: 'downtime', name: 'Micro Detencion', reason: '',
        durationSec: 30, startAt: new Date('2026-07-08T14:00:00Z'),
      }),
    ]
    const snap = mockSnapshot([mockMachine('Evisceradora 1', states)])
    const events = extractStopEvents(snap)
    expect(events).toHaveLength(1)
    expect(events[0]!.micro).toBe(true)
  })

  it('sin detenciones devuelve array vacío', () => {
    const snap = mockSnapshot([mockMachine('Evisceradora 1', [mockState({ type: 'uptime' })])])
    expect(extractStopEvents(snap)).toEqual([])
  })

  it('agrega eventos de MÚLTIPLES máquinas, ordenados globalmente', () => {
    const m1 = mockMachine('Evisceradora 1', [
      mockState({ type: 'downtime', reason: 'A', durationSec: 60, startAt: new Date('2026-07-08T16:00:00Z') }),
    ])
    const m2 = mockMachine('Evisceradora 2', [
      mockState({ type: 'downtime', reason: 'B', durationSec: 60, startAt: new Date('2026-07-08T15:00:00Z') }),
    ])
    const snap = mockSnapshot([m1, m2])
    const events = extractStopEvents(snap)
    expect(events).toHaveLength(2)
    expect(events[0]!.machineName).toBe('Evisceradora 2') // 15:00 antes que 16:00
    expect(events[1]!.machineName).toBe('Evisceradora 1')
  })
})

describe('inferToolParams — fecha relativa para shift.stops', () => {
  it('"anoche" setea date = ayer para shift.stops (antes solo aplicaba a shift.dayProduction)', () => {
    const params = inferToolParams('shift.stops', 'cuánto duró la detención de anoche')
    expect(params.date).toBeDefined()
    expect(typeof params.date).toBe('string')
  })

  it('"del día" SIN ayer/anoche NO fija fecha (default = turno en curso/hoy)', () => {
    const params = inferToolParams('shift.stops', 'detenciones del turno del día')
    expect(params.date).toBeUndefined()
  })

  it('"ayer" también funciona para shift.dayProduction (regresión)', () => {
    const params = inferToolParams('shift.dayProduction', 'cuánto se procesó ayer')
    expect(params.date).toBeDefined()
  })

  it('sin mención de fecha, ningún param.date', () => {
    const params = inferToolParams('shift.stops', 'por qué está detenida la línea')
    expect(params.date).toBeUndefined()
  })
})
