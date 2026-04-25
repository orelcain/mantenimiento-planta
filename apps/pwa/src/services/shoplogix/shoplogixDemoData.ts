/**
 * Demo data sintético de las 3 Evisceradoras para mostrar el panel mientras
 * no esté lista la integración con Firestore. Solo se usa en DEV.
 *
 * Basado en los datos reales capturados de Feb 26 2026 (ver
 * scripts/fixtures/feb26-*.json) pero reducido a una muestra representativa
 * para no inflar el bundle.
 */

import type {
  UpstreamLineSnapshot,
  UpstreamMachineShift,
  UpstreamProductionInterval,
  UpstreamMachineState,
} from './types';
import { CHONCHI_EVISCERADORAS } from './shoplogixMachines';

/** 5-min interval builder. */
function makeIntervals(
  shiftStart: Date,
  count: number,
  avgCycles: number,
  variance: number,
): UpstreamProductionInterval[] {
  const expected = 38; // ~1140 partes/h / 60 * 5 min / rango típico baader 142
  return Array.from({ length: count }, (_, i) => {
    const startAt = new Date(shiftStart.getTime() + i * 5 * 60 * 1000);
    const endAt = new Date(startAt.getTime() + 5 * 60 * 1000);
    // Simula varianza real: produce ~avgCycles con ruido y paros esporádicos
    const noise = (Math.sin(i * 0.37) + Math.cos(i * 0.19)) * variance;
    const downtime = i % 13 === 0 ? 0.3 : 1; // bajón cada ~13 intervalos
    const cycles = Math.max(0, Math.round(avgCycles * downtime + noise));
    const ratio = expected > 0 ? cycles / expected : 0;
    const color: UpstreamProductionInterval['color'] =
      cycles === 0 ? 'red'
      : ratio >= 0.85 ? 'green'
      : ratio >= 0.425 ? 'yellow'
      : 'red';
    return {
      startAt, endAt,
      cycles, expectedCycles: expected,
      total: cycles * (i + 1),
      expectedTotal: expected * (i + 1),
      ratio, color,
    };
  });
}

/** States sintéticos (paros + Produciendo). */
function makeStates(shiftStart: Date, shiftEnd: Date): UpstreamMachineState[] {
  const msFor = (start: Date, end: Date) => ({
    startAt: start, endAt: end,
    durationSec: Math.round((end.getTime() - start.getTime()) / 1000),
  });
  const t = (min: number) => new Date(shiftStart.getTime() + min * 60 * 1000);
  const end = (startMin: number, durMin: number) => t(startMin + durMin);

  return [
    { ...msFor(t(0),   end(0, 15)),  type: 'break',    name: 'Detencion',       reason: 'REUNION INICIO TURNO', color: '#ff0000', isCurrent: false },
    { ...msFor(t(15),  end(15, 165)), type: 'uptime',   name: 'Produciendo',     reason: '',                     color: '#008000', isCurrent: false },
    { ...msFor(t(180), end(180, 5)),  type: 'downtime', name: 'Micro Detencion', reason: '',                     color: '#73d8ff', isCurrent: false },
    { ...msFor(t(185), end(185, 55)), type: 'uptime',   name: 'Produciendo',     reason: '',                     color: '#008000', isCurrent: false },
    { ...msFor(t(240), end(240, 60)), type: 'break',    name: 'Detencion',       reason: 'COLACION',             color: '#ff0000', isCurrent: false },
    { ...msFor(t(300), end(300, 180)), type: 'uptime',  name: 'Produciendo',     reason: '',                     color: '#008000', isCurrent: false },
    { ...msFor(t(480), end(480, 30)), type: 'break',    name: 'Detencion',       reason: 'Paro Programado',      color: '#ff0000', isCurrent: false },
    { ...msFor(t(510), end(510, (shiftEnd.getTime() - t(510).getTime()) / 60000)), type: 'uptime', name: 'Produciendo', reason: '', color: '#008000', isCurrent: false },
  ];
}

function makeShift(
  machineid: string,
  machineName: string,
  avgCycles: number,
  variance: number,
  actualRuntime: number,
): UpstreamMachineShift {
  const shiftStart = new Date('2026-02-26T09:00:00.000Z');
  const shiftEnd   = new Date('2026-02-26T18:15:00.000Z');
  const intervals = makeIntervals(shiftStart, 111, avgCycles, variance);
  const states    = makeStates(shiftStart, shiftEnd);

  const totalCycles = intervals.reduce((a, x) => a + x.cycles, 0);
  const expectedTotalCycles = intervals.reduce((a, x) => a + x.expectedCycles, 0);
  const last = intervals[intervals.length - 1]!;

  // Mismo cálculo que el normalizer real para mantener parity en demo data.
  const breakdown = {
    uptimeSec:   states.filter(s => s.type === 'uptime').reduce((a, s) => a + s.durationSec, 0),
    breakSec:    states.filter(s => s.type === 'break').reduce((a, s) => a + s.durationSec, 0),
    downtimeSec: states.filter(s => s.type === 'downtime').reduce((a, s) => a + s.durationSec, 0),
    setupSec:    states.filter(s => s.type === 'setup').reduce((a, s) => a + s.durationSec, 0),
    totalTrackedSec: 0,
  };
  breakdown.totalTrackedSec = breakdown.uptimeSec + breakdown.breakSec + breakdown.downtimeSec + breakdown.setupSec;
  const shiftRuntime = breakdown.totalTrackedSec > 0
    ? breakdown.uptimeSec / breakdown.totalTrackedSec
    : 0;

  return {
    machineid,
    machineName,
    machineType: 'baader_142',
    dateKey: '2026-02-26',
    shiftId: 'Turno día',
    shiftStart, shiftEnd,
    totalCycles, expectedTotalCycles,
    totalPieces: last.total,
    expectedTotalPieces: last.expectedTotal,
    overallRatio: expectedTotalCycles > 0 ? totalCycles / expectedTotalCycles : 0,
    actualRuntime,
    expectedRuntime: 0.92,
    runtimeVariance: actualRuntime - 0.92,
    shiftRuntime,
    shiftRuntimeBreakdown: breakdown,
    intervals, states,
    threshold: 15,
    productionUnit: 'Eviscerado',
    comments: [],
    source: 'shoplogix',
    sourceVersion: 1,
    syncedAt: new Date(),
  };
}

/** Snapshot demo para DEV — 3 Baaders con ritmos distintos. */
export function buildDemoLineSnapshot(): UpstreamLineSnapshot {
  const [ev1, ev2, ev3] = CHONCHI_EVISCERADORAS;
  const machines = [
    makeShift(ev1!.machineid, ev1!.name, 36, 3, 0.88),
    makeShift(ev2!.machineid, ev2!.name, 32, 5, 0.82),  // B2: ritmo irregular
    makeShift(ev3!.machineid, ev3!.name, 38, 2, 0.91),
  ];

  const totalCycles = machines.reduce((a, m) => a + m.totalCycles, 0);
  const expected    = machines.reduce((a, m) => a + m.expectedTotalCycles, 0);
  const durationH   = (machines[0]!.shiftEnd.getTime() - machines[0]!.shiftStart.getTime()) / 3600000;

  return {
    dateKey: '2026-02-26',
    shiftId: 'Turno día',
    machines,
    lineThroughputActual:   durationH > 0 ? totalCycles / durationH : 0,
    lineThroughputExpected: durationH > 0 ? expected    / durationH : 0,
    lineAvailability:       machines.reduce((a, m) => a + m.shiftRuntime, 0) / machines.length,
    machinesProducing:      0,
  };
}
