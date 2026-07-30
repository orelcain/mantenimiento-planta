import { describe, it, expect } from 'vitest'
import {
  correlatePausesWithUpstream,
  upstreamCausedPauses,
  summarizeCorrelations,
  confidenceLabel,
  isPlannedBaaderReason,
  isOrganizationalGraderPause,
} from '../shoplogixCorrelation'
import type { Pause } from '@/services/grader/types'
import type { UpstreamLineSnapshot, UpstreamMachineShift, UpstreamMachineState } from '../types'

// ── Helpers de construcción ───────────────────────────────────────────────

function mkPause(id: string, startISO: string, endISO: string): Pause {
  const start = new Date(startISO)
  const end = new Date(endISO)
  return {
    id,
    startAt: startISO,
    endAt: endISO,
    durationSec: Math.round((end.getTime() - start.getTime()) / 1000),
    tier: 'pausa',
  }
}

function mkState(startISO: string, endISO: string, type: UpstreamMachineState['type'], name: string, reason = ''): UpstreamMachineState {
  const start = new Date(startISO)
  const end = new Date(endISO)
  return {
    startAt: start,
    endAt: end,
    durationSec: Math.round((end.getTime() - start.getTime()) / 1000),
    type,
    name,
    reason,
    color: '#ff0000',
    isCurrent: false,
  }
}

function mkShift(id: string, name: string, states: UpstreamMachineState[]): UpstreamMachineShift {
  return {
    machineid: id,
    machineName: name,
    machineType: 'baader_142',
    dateKey: '2026-02-26',
    shiftId: 'Turno día',
    shiftStart: new Date('2026-02-26T07:00:00Z'),
    shiftEnd: new Date('2026-02-26T19:00:00Z'),
    totalCycles: 0,
    expectedTotalCycles: 0,
    totalPieces: 0,
    expectedTotalPieces: 0,
    overallRatio: 0,
    actualRuntime: 0,
    expectedRuntime: 0,
    runtimeVariance: 0,
    shiftRuntime: 0,
    shiftRuntimeBreakdown: { uptimeSec: 0, breakSec: 0, plannedDowntimeSec: 0, downtimeSec: 0, setupSec: 0, totalTrackedSec: 0 },
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

function mkSnapshot(shifts: UpstreamMachineShift[]): UpstreamLineSnapshot {
  return {
    dateKey: '2026-02-26',
    shiftId: 'Turno día',
    machines: shifts,
    lineThroughputActual: 0,
    lineThroughputExpected: 0,
    lineWindowHours: 8,
    lineWindowSource: 'effective' as const,
    lineAvailability: 0,
    machinesProducing: 0,
  }
}

// ── Tests ─────────────────────────────────────────────────────────────────

describe('correlatePausesWithUpstream', () => {
  it('retorna lista vacía si no hay snapshot', () => {
    const pauses = [mkPause('p1', '2026-02-26T10:00:00Z', '2026-02-26T10:10:00Z')]
    expect(correlatePausesWithUpstream(pauses, null)).toEqual([])
    expect(correlatePausesWithUpstream(pauses, undefined)).toEqual([])
  })

  it('clasifica como upstream_global cuando las 3 Baaders están paradas (operacional)', () => {
    // Razón operacional (no planned) — falta de materia prima / avería
    const state1 = mkState('2026-02-26T09:55:00Z', '2026-02-26T10:15:00Z', 'downtime', 'Detencion', 'Falta MP')
    const snap = mkSnapshot([
      mkShift('A', 'Evisceradora 1', [state1]),
      mkShift('B', 'Evisceradora 2', [state1]),
      mkShift('C', 'Evisceradora 3', [state1]),
    ])
    const pause = mkPause('p1', '2026-02-26T10:00:00Z', '2026-02-26T10:10:00Z')
    const [corr] = correlatePausesWithUpstream([pause], snap)
    expect(corr!.kind).toBe('upstream_global')
    expect(corr!.confidence).toBeGreaterThan(0.5)
    expect(corr!.contributors).toHaveLength(3)
    expect(corr!.hypothesis).toContain('Falta MP')
  })

  it('clasifica como upstream_majority con 2/3 Baaders paradas', () => {
    const stopState = mkState('2026-02-26T09:55:00Z', '2026-02-26T10:15:00Z', 'downtime', 'Micro Detencion')
    const runningState = mkState('2026-02-26T09:50:00Z', '2026-02-26T10:20:00Z', 'uptime', 'Produciendo')
    const snap = mkSnapshot([
      mkShift('A', 'E1', [stopState]),
      mkShift('B', 'E2', [stopState]),
      mkShift('C', 'E3', [runningState]),
    ])
    const pause = mkPause('p1', '2026-02-26T10:00:00Z', '2026-02-26T10:10:00Z')
    const [corr] = correlatePausesWithUpstream([pause], snap)
    expect(corr!.kind).toBe('upstream_majority')
    expect(corr!.contributors).toHaveLength(2)
  })

  it('clasifica como upstream_single con 1/3 Baader parada', () => {
    const stop = mkState('2026-02-26T09:55:00Z', '2026-02-26T10:15:00Z', 'break', 'Detencion', 'Limpieza de Ducto')
    const run  = mkState('2026-02-26T09:00:00Z', '2026-02-26T11:00:00Z', 'uptime', 'Produciendo')
    const snap = mkSnapshot([
      mkShift('A', 'E1', [stop]),
      mkShift('B', 'E2', [run]),
      mkShift('C', 'E3', [run]),
    ])
    const pause = mkPause('p1', '2026-02-26T10:00:00Z', '2026-02-26T10:10:00Z')
    const [corr] = correlatePausesWithUpstream([pause], snap)
    expect(corr!.kind).toBe('upstream_single')
    expect(corr!.hypothesis).toContain('Limpieza de Ducto')
  })

  it('clasifica como no_correlation cuando todas corren', () => {
    const run = mkState('2026-02-26T09:00:00Z', '2026-02-26T11:00:00Z', 'uptime', 'Produciendo')
    const snap = mkSnapshot([
      mkShift('A', 'E1', [run]),
      mkShift('B', 'E2', [run]),
      mkShift('C', 'E3', [run]),
    ])
    const pause = mkPause('p1', '2026-02-26T10:00:00Z', '2026-02-26T10:10:00Z')
    const [corr] = correlatePausesWithUpstream([pause], snap)
    expect(corr!.kind).toBe('no_correlation')
    expect(corr!.confidence).toBe(0)
    expect(corr!.contributors).toHaveLength(0)
  })

  it('respeta leadWindowSec — paros muy anteriores no cuentan', () => {
    // Baader paró 30 min antes del paro Grader → fuera de ventana default (10 min)
    const oldStop = mkState('2026-02-26T09:00:00Z', '2026-02-26T09:20:00Z', 'break', 'Detencion', 'COLACION')
    const snap = mkSnapshot([
      mkShift('A', 'E1', [oldStop]),
      mkShift('B', 'E2', [oldStop]),
      mkShift('C', 'E3', [oldStop]),
    ])
    const pause = mkPause('p1', '2026-02-26T10:00:00Z', '2026-02-26T10:10:00Z')
    const [corr] = correlatePausesWithUpstream([pause], snap)
    expect(corr!.kind).toBe('no_correlation')
  })

  it('respeta minOverlapSec — overlaps de <1 min se ignoran', () => {
    // Baader paró por 30 seg — debajo del umbral
    const tinyStop = mkState('2026-02-26T09:59:30Z', '2026-02-26T10:00:00Z', 'downtime', 'Micro Detencion')
    const snap = mkSnapshot([
      mkShift('A', 'E1', [tinyStop]),
      mkShift('B', 'E2', [tinyStop]),
      mkShift('C', 'E3', [tinyStop]),
    ])
    const pause = mkPause('p1', '2026-02-26T10:00:00Z', '2026-02-26T10:05:00Z')
    const [corr] = correlatePausesWithUpstream([pause], snap)
    expect(corr!.kind).toBe('no_correlation')
  })

  it('leadSec negativo cuando Baader paró antes que el Grader', () => {
    const stop = mkState('2026-02-26T09:55:00Z', '2026-02-26T10:15:00Z', 'break', 'Detencion')
    const snap = mkSnapshot([mkShift('A', 'E1', [stop]), mkShift('B', 'E2', [stop]), mkShift('C', 'E3', [stop])])
    const pause = mkPause('p1', '2026-02-26T10:00:00Z', '2026-02-26T10:10:00Z')
    const [corr] = correlatePausesWithUpstream([pause], snap)
    expect(corr!.contributors[0]!.leadSec).toBe(-300)  // Baader paró 5 min antes
  })

  it('filtra Baader states que empezaron MUCHO después del Grader (no pueden ser causa)', () => {
    // Grader paró a las 10:00, Baader "paró" recién a las 11:30 — no puede ser causa raíz
    const lateStop = mkState('2026-02-26T11:30:00Z', '2026-02-26T11:45:00Z', 'break', 'Detencion', 'COLACION')
    const snap = mkSnapshot([
      mkShift('A', 'E1', [lateStop]),
      mkShift('B', 'E2', [lateStop]),
      mkShift('C', 'E3', [lateStop]),
    ])
    const pause = mkPause('p1', '2026-02-26T10:00:00Z', '2026-02-26T10:10:00Z')
    const [corr] = correlatePausesWithUpstream([pause], snap)
    // Baader paró 90 min DESPUÉS del Grader → no puede ser causa
    expect(corr!.kind).toBe('no_correlation')
  })

  // ── NUEVO (v2.99.1): no contar coincidencias organizacionales como upstream ──

  it('clasifica como coincidental_planned cuando las 3 Baaders están en COLACION', () => {
    // Caso real: 13:00-14:00 todos paran por colación organizacional, NO causal
    const colacion = mkState('2026-02-26T12:55:00Z', '2026-02-26T14:00:00Z', 'break', 'Detencion', 'COLACION')
    const snap = mkSnapshot([
      mkShift('A', 'Evisceradora 1', [colacion]),
      mkShift('B', 'Evisceradora 2', [colacion]),
      mkShift('C', 'Evisceradora 3', [colacion]),
    ])
    const pause = mkPause('p1', '2026-02-26T13:00:00Z', '2026-02-26T14:00:00Z')
    const [corr] = correlatePausesWithUpstream([pause], snap)
    expect(corr!.kind).toBe('coincidental_planned')
    expect(corr!.confidence).toBeLessThan(0.5)
    expect(corr!.hypothesis).toContain('organizacional')
    expect(corr!.hypothesis).toContain('COLACION')
  })

  it('coincidental_planned con REUNION INICIO TURNO en las 3 Baaders', () => {
    const reunion = mkState('2026-02-26T07:00:00Z', '2026-02-26T07:15:00Z', 'break', 'Detencion', 'REUNION INICIO TURNO')
    const snap = mkSnapshot([
      mkShift('A', 'E1', [reunion]),
      mkShift('B', 'E2', [reunion]),
      mkShift('C', 'E3', [reunion]),
    ])
    const pause = mkPause('p1', '2026-02-26T07:00:00Z', '2026-02-26T07:10:00Z')
    const [corr] = correlatePausesWithUpstream([pause], snap)
    expect(corr!.kind).toBe('coincidental_planned')
  })

  it('si AL MENOS 1 Baader es operacional (sin reason planned), evalúa upstream_single solo con ella', () => {
    // 2 Baaders en COLACION (planned) + 1 en avería real → upstream_single
    const colacion = mkState('2026-02-26T09:55:00Z', '2026-02-26T10:15:00Z', 'break', 'Detencion', 'COLACION')
    const averia   = mkState('2026-02-26T09:55:00Z', '2026-02-26T10:15:00Z', 'downtime', 'Detencion', 'Falla mecánica')
    const snap = mkSnapshot([
      mkShift('A', 'E1', [averia]),
      mkShift('B', 'E2', [colacion]),
      mkShift('C', 'E3', [colacion]),
    ])
    const pause = mkPause('p1', '2026-02-26T10:00:00Z', '2026-02-26T10:10:00Z')
    const [corr] = correlatePausesWithUpstream([pause], snap)
    expect(corr!.kind).toBe('upstream_single')
    // Contributors operacionales solamente — sin las dos en colación
    expect(corr!.contributors).toHaveLength(1)
    expect(corr!.contributors[0]!.machineName).toBe('E1')
    expect(corr!.hypothesis).toContain('Falla mecánica')
  })

  it('si el paro Grader tiene tag organizacional (colacion), retorna no_correlation sin evaluar', () => {
    const colacion = mkState('2026-02-26T09:55:00Z', '2026-02-26T10:15:00Z', 'break', 'Detencion', 'COLACION')
    const snap = mkSnapshot([
      mkShift('A', 'E1', [colacion]),
      mkShift('B', 'E2', [colacion]),
      mkShift('C', 'E3', [colacion]),
    ])
    // Pausa con tag manual = colacion
    const pause = { ...mkPause('p1', '2026-02-26T10:00:00Z', '2026-02-26T10:10:00Z'), tag: 'colacion' }
    const [corr] = correlatePausesWithUpstream([pause], snap)
    expect(corr!.kind).toBe('no_correlation')
    expect(corr!.hypothesis).toContain('organizacional')
    expect(corr!.contributors).toHaveLength(0)
  })

  it('autoTag organizacional (sin tag manual) también dispara la regla', () => {
    const averia = mkState('2026-02-26T09:55:00Z', '2026-02-26T10:15:00Z', 'downtime', 'Detencion', 'Falla')
    const snap = mkSnapshot([
      mkShift('A', 'E1', [averia]),
      mkShift('B', 'E2', [averia]),
      mkShift('C', 'E3', [averia]),
    ])
    // El detector asignó autoTag=cambio_lote — paro organizacional
    // `as const` para que el literal se preserve y satisfaga PauseAutoTag
    const pause = { ...mkPause('p1', '2026-02-26T10:00:00Z', '2026-02-26T10:10:00Z'), autoTag: 'cambio_lote' as const }
    const [corr] = correlatePausesWithUpstream([pause], snap)
    expect(corr!.kind).toBe('no_correlation')
  })

  it('acepta Baader states que empezaron hasta 2 min después (tolerancia de sensor)', () => {
    // Baader paró 1 min después del Grader (puede ser lag de sensor)
    const slightlyLate = mkState('2026-02-26T10:01:00Z', '2026-02-26T10:15:00Z', 'break', 'Detencion')
    const snap = mkSnapshot([
      mkShift('A', 'E1', [slightlyLate]),
      mkShift('B', 'E2', [slightlyLate]),
      mkShift('C', 'E3', [slightlyLate]),
    ])
    const pause = mkPause('p1', '2026-02-26T10:00:00Z', '2026-02-26T10:10:00Z')
    const [corr] = correlatePausesWithUpstream([pause], snap)
    expect(corr!.kind).toBe('upstream_global')
    expect(corr!.contributors[0]!.leadSec).toBe(60)
  })
})

describe('summarizeCorrelations', () => {
  it('cuenta paros con causa upstream', () => {
    const corr = [
      { kind: 'upstream_global' } as Parameters<typeof summarizeCorrelations>[0][number],
      { kind: 'upstream_single' } as Parameters<typeof summarizeCorrelations>[0][number],
      { kind: 'no_correlation' } as Parameters<typeof summarizeCorrelations>[0][number],
    ]
    const s = summarizeCorrelations(corr)
    expect(s.total).toBe(3)
    expect(s.upstreamCaused).toBe(2)
    expect(s.upstreamPct).toBeCloseTo(2 / 3, 2)
  })

  it('pct 0 cuando no hay paros', () => {
    expect(summarizeCorrelations([]).upstreamPct).toBe(0)
  })
})

describe('upstreamCausedPauses', () => {
  it('filtra correctamente', () => {
    const arr = [
      { kind: 'upstream_global' } as Parameters<typeof upstreamCausedPauses>[0][number],
      { kind: 'no_correlation' } as Parameters<typeof upstreamCausedPauses>[0][number],
    ]
    expect(upstreamCausedPauses(arr)).toHaveLength(1)
  })
})

// ── Nuevas métricas accionables: tiempo + breakdown por máquina ───────────────

describe('summarizeCorrelations — accionables (v2.99)', () => {
  type Corr = Parameters<typeof summarizeCorrelations>[0][number]
  type Contrib = Corr['contributors'][number]

  function mkContrib(machineid: string, machineName: string, overlapSec: number): Contrib {
    return {
      machineid,
      machineName,
      stateName: 'Detencion',
      reason: '',
      stateStart: new Date('2026-02-26T13:00:00Z'),
      stateEnd:   new Date('2026-02-26T13:05:00Z'),
      overlapSec,
      leadSec: 0,
    }
  }

  function mkCorr(opts: {
    pauseId: string
    kind: Corr['kind']
    pauseDurSec: number
    contributors?: Contrib[]
  }): Corr {
    return {
      pauseId: opts.pauseId,
      pauseStart: new Date('2026-02-26T13:00:00Z'),
      pauseEnd:   new Date('2026-02-26T13:05:00Z'),
      pauseDurSec: opts.pauseDurSec,
      kind: opts.kind,
      confidence: 0.8,
      hypothesis: 'test',
      contributors: opts.contributors ?? [],
    }
  }

  it('upstreamCausedDurSec = suma de pauseDurSec de paros con correlación upstream', () => {
    const arr = [
      mkCorr({ pauseId: 'a', kind: 'upstream_global',   pauseDurSec: 600 }),
      mkCorr({ pauseId: 'b', kind: 'upstream_majority', pauseDurSec: 300 }),
      mkCorr({ pauseId: 'c', kind: 'no_correlation',    pauseDurSec: 1000 }),  // NO suma
    ]
    expect(summarizeCorrelations(arr).upstreamCausedDurSec).toBe(900)
  })

  it('byMachine agrupa contributors por machineid sumando overlap y paros', () => {
    const arr = [
      mkCorr({
        pauseId: 'a', kind: 'upstream_global', pauseDurSec: 600,
        contributors: [
          mkContrib('e1-uuid', 'Evisceradora 1', 200),
          mkContrib('e2-uuid', 'Evisceradora 2', 500),
        ],
      }),
      mkCorr({
        pauseId: 'b', kind: 'upstream_majority', pauseDurSec: 300,
        contributors: [
          mkContrib('e2-uuid', 'Evisceradora 2', 250),
        ],
      }),
    ]
    const s = summarizeCorrelations(arr)
    expect(s.byMachine).toHaveLength(2)
    // E2 lidera: 500 + 250 = 750 overlap, 2 paros
    expect(s.byMachine[0]!.machineid).toBe('e2-uuid')
    expect(s.byMachine[0]!.totalOverlapSec).toBe(750)
    expect(s.byMachine[0]!.pauseCount).toBe(2)
    // E1: 200 overlap, 1 paro
    expect(s.byMachine[1]!.machineid).toBe('e1-uuid')
    expect(s.byMachine[1]!.totalOverlapSec).toBe(200)
    expect(s.byMachine[1]!.pauseCount).toBe(1)
  })

  it('byMachine ignora contributors de paros no_correlation', () => {
    const arr = [
      mkCorr({
        pauseId: 'a', kind: 'no_correlation', pauseDurSec: 600,
        contributors: [mkContrib('e1-uuid', 'Evisceradora 1', 999)],
      }),
    ]
    expect(summarizeCorrelations(arr).byMachine).toHaveLength(0)
  })

  it('byMachine vacío y upstreamCausedDurSec=0 si no hay correlaciones upstream', () => {
    const arr = [
      mkCorr({ pauseId: 'a', kind: 'no_correlation', pauseDurSec: 1000 }),
    ]
    const s = summarizeCorrelations(arr)
    expect(s.byMachine).toEqual([])
    expect(s.upstreamCausedDurSec).toBe(0)
  })
})

describe('confidenceLabel', () => {
  it('alta cuando >= 0.7', () => {
    expect(confidenceLabel(0.7).text).toBe('alta')
    expect(confidenceLabel(1).text).toBe('alta')
  })
  it('media en [0.4, 0.7)', () => {
    expect(confidenceLabel(0.4).text).toBe('media')
    expect(confidenceLabel(0.69).text).toBe('media')
  })
  it('baja en < 0.4', () => {
    expect(confidenceLabel(0.39).text).toBe('baja')
    expect(confidenceLabel(0).text).toBe('baja')
  })
})

// ── Filtros anti-falso-positivo: planned + organizational ────────────────────

describe('isPlannedBaaderReason', () => {
  it('detecta COLACION (case insensitive + trim)', () => {
    expect(isPlannedBaaderReason('COLACION')).toBe(true)
    expect(isPlannedBaaderReason('colacion')).toBe(true)
    expect(isPlannedBaaderReason('  colacion  ')).toBe(true)
  })
  it('detecta REUNION INICIO/FIN TURNO por prefijo', () => {
    expect(isPlannedBaaderReason('REUNION INICIO TURNO')).toBe(true)
    expect(isPlannedBaaderReason('REUNION FIN TURNO')).toBe(true)
    expect(isPlannedBaaderReason('Reunion equipo')).toBe(true)
  })
  it('detecta Planned Downtime', () => {
    expect(isPlannedBaaderReason('Planned Downtime')).toBe(true)
    expect(isPlannedBaaderReason('PLANNED DOWNTIME')).toBe(true)
  })
  it('detecta LIMPIEZA exacta (programada) pero NO "Limpieza de Ducto" (operacional)', () => {
    expect(isPlannedBaaderReason('LIMPIEZA')).toBe(true)
    expect(isPlannedBaaderReason('Limpieza de Ducto')).toBe(false)
  })
  it('NO detecta razones operacionales', () => {
    expect(isPlannedBaaderReason('Falla mecánica')).toBe(false)
    expect(isPlannedBaaderReason('Falta MP')).toBe(false)
    expect(isPlannedBaaderReason('Micro Detencion')).toBe(false)
  })
  it('reason vacío / null / undefined retornan false', () => {
    expect(isPlannedBaaderReason('')).toBe(false)
    expect(isPlannedBaaderReason(null)).toBe(false)
    expect(isPlannedBaaderReason(undefined)).toBe(false)
  })
})

describe('isOrganizationalGraderPause', () => {
  type Pause = Parameters<typeof isOrganizationalGraderPause>[0]
  const base: Pause = {
    id: 'p1', startAt: '2026-02-26T10:00:00Z', endAt: '2026-02-26T10:10:00Z',
    durationSec: 600, tier: 'parada' as const,
  }
  it('detecta tag manual organizacional', () => {
    expect(isOrganizationalGraderPause({ ...base, tag: 'colacion' })).toBe(true)
    expect(isOrganizationalGraderPause({ ...base, tag: 'ejercicios' })).toBe(true)
    expect(isOrganizationalGraderPause({ ...base, tag: 'cambio_lote' })).toBe(true)
    expect(isOrganizationalGraderPause({ ...base, tag: 'limpieza' })).toBe(true)
  })
  it('detecta autoTag organizacional cuando no hay tag manual', () => {
    expect(isOrganizationalGraderPause({ ...base, autoTag: 'colacion' })).toBe(true)
  })
  it('tag manual gana sobre autoTag', () => {
    // tag manual = falla_equipo (operacional) → NO organizacional aunque autoTag sea colacion
    expect(isOrganizationalGraderPause({ ...base, tag: 'falla_equipo', autoTag: 'colacion' })).toBe(false)
  })
  it('tags operacionales NO disparan la regla', () => {
    expect(isOrganizationalGraderPause({ ...base, tag: 'falla_equipo' })).toBe(false)
    expect(isOrganizationalGraderPause({ ...base, tag: 'mantencion' })).toBe(false)
    expect(isOrganizationalGraderPause({ ...base, tag: 'espera_mp' })).toBe(false)
  })
  it('sin tag ni autoTag retorna false', () => {
    expect(isOrganizationalGraderPause(base)).toBe(false)
  })
})
