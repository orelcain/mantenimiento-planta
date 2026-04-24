/**
 * Normalizer Shoplogix → schema interno.
 *
 * Convierte las respuestas raw de la API (query.axd?type=whiteboardproduction |
 * whiteboardsummary) a nuestro schema agnóstico `UpstreamMachineShift`.
 *
 * Lógica pura, sin dependencias externas. Todo testeable con fixtures.
 */

import type {
  ShoplogixProductionMachine,
  ShoplogixSummaryMachine,
  ShoplogixProductionInterval,
  ShoplogixMachineState,
  UpstreamMachineShift,
  UpstreamProductionInterval,
  UpstreamMachineState,
  UpstreamLineSnapshot,
  UpstreamMachineInfo,
  UpstreamColor,
} from './types';
import { parseShoplogixTime } from './shoplogixTime';
import { findMachineInfo } from './shoplogixMachines';

// ============================================================================
// Normalizer por sección
// ============================================================================

/**
 * Colorea una barra según ratio vs expected + threshold.
 * - ratio >= 1 - threshold/100 → verde
 * - 0 < ratio < 1 - threshold/100 → amarillo
 * - ratio === 0 pero hubo expected → rojo
 * - expected === 0 → gray (sin actividad esperada)
 */
export function colorFromRatio(ratio: number, hadExpected: boolean, threshold: number): UpstreamColor {
  if (!hadExpected) return 'gray';
  if (ratio === 0) return 'red';
  const greenCutoff = Math.max(0, 1 - threshold / 100);
  if (ratio >= greenCutoff) return 'green';
  if (ratio >= greenCutoff / 2) return 'yellow';
  return 'red';
}

/** Normaliza un intervalo de producción. */
export function normalizeInterval(
  raw: ShoplogixProductionInterval,
  startAt: Date,
  threshold: number,
): UpstreamProductionInterval {
  const endAt = new Date(startAt.getTime() + raw.totalDuration);
  const hadExpected = raw.expectedCycles > 0;
  const ratio = hadExpected ? raw.cycles / raw.expectedCycles : 0;
  return {
    startAt,
    endAt,
    cycles: raw.cycles,
    expectedCycles: raw.expectedCycles,
    total: raw.total,
    expectedTotal: raw.expectedTotal,
    ratio,
    color: colorFromRatio(ratio, hadExpected, threshold),
  };
}

/** Mapea el type Shoplogix al type normalizado. */
function mapStateType(rawType: string): UpstreamMachineState['type'] {
  const t = rawType.toLowerCase();
  if (t === 'uptime') return 'uptime';
  if (t === 'downtime') return 'downtime';
  if (t === 'break') return 'break';
  if (t === 'setup') return 'setup';
  // Fallback defensivo — si Shoplogix agrega un type nuevo, lo tratamos como downtime
  return 'downtime';
}

/** Normaliza un machineState. */
export function normalizeState(raw: ShoplogixMachineState): UpstreamMachineState {
  const startAt = parseShoplogixTime(raw.start);
  const endAt   = parseShoplogixTime(raw.end);
  const color   = raw.statusColor && raw.statusColor.length === 6
    ? `#${raw.statusColor}`
    : '#64748b';  // slate-500 fallback
  return {
    startAt,
    endAt,
    durationSec: Math.round(raw.durationMilli / 1000),
    type: mapStateType(raw.type),
    name: raw.name,
    reason: raw.reason || '',
    color,
    isCurrent: raw.current === true,
  };
}

// ============================================================================
// Normalizer principal — production + summary → UpstreamMachineShift
// ============================================================================

/**
 * Construye el shift combinando production (intervalos) + summary (estados + runtime).
 *
 * Ambos inputs deben ser del MISMO machineId y MISMO rango temporal.
 * Si difieren → tira error (invariante incumplida).
 */
export function normalizeShift(params: {
  production: ShoplogixProductionMachine;
  summary: ShoplogixSummaryMachine;
  dateKey: string;
  shiftId: string;
  /** Tamaño del intervalo en ms. Default 5 min. */
  intervalMs?: number;
  /** Override de start del turno (si no se infiere de currentShift). */
  shiftStartAt?: Date;
  syncedAt?: Date;
}): UpstreamMachineShift {
  const { production, summary, dateKey, shiftId } = params;

  if (production.machineId !== summary.machineId) {
    throw new Error(
      `normalizeShift: machineId mismatch ${production.machineId} vs ${summary.machineId}`,
    );
  }

  const intervalMs = params.intervalMs ?? 5 * 60 * 1000;
  const threshold = summary.threshold ?? production.threshold ?? 15;

  // Shift bounds — preferimos currentShiftStart/End del summary, luego production
  const shiftStart = params.shiftStartAt
    ?? parseShoplogixTime(summary.currentShiftStart || production.currentShiftStart);
  const shiftEnd   = parseShoplogixTime(summary.currentShiftEnd || production.currentShiftEnd);

  // Intervalos (5 min cada uno, empezando desde shiftStart)
  const intervals: UpstreamProductionInterval[] = production.machineProduction.map((raw, i) => {
    const intervalStart = new Date(shiftStart.getTime() + i * intervalMs);
    return normalizeInterval(raw, intervalStart, threshold);
  });

  // Agregados
  const totalCycles = intervals.reduce((a, x) => a + x.cycles, 0);
  const expectedTotalCycles = intervals.reduce((a, x) => a + x.expectedCycles, 0);
  const lastInterval = intervals[intervals.length - 1];
  const totalPieces = lastInterval?.total ?? 0;
  const expectedTotalPieces = lastInterval?.expectedTotal ?? 0;
  const overallRatio = expectedTotalCycles > 0 ? totalCycles / expectedTotalCycles : 0;

  // Estados / paros
  const states: UpstreamMachineState[] = summary.machineStates.map(normalizeState);

  // Info de la máquina (type) — si no está en registry, default 'other'
  const info: UpstreamMachineInfo | undefined = findMachineInfo(production.machineId);
  const machineType = info?.type ?? 'other';

  return {
    machineid: production.machineId,
    machineName: production.machineName,
    machineType,
    dateKey,
    shiftId,
    shiftStart,
    shiftEnd,
    totalCycles,
    expectedTotalCycles,
    totalPieces,
    expectedTotalPieces,
    overallRatio,
    actualRuntime: summary.actualRuntime,
    expectedRuntime: summary.expectedRuntime,
    runtimeVariance: summary.runtimeVariance,
    intervals,
    states,
    threshold,
    productionUnit: summary.productionUnits || production.productionUnits || '',
    comments: [...(summary.comments ?? []), ...(production.comments ?? [])],
    source: 'shoplogix',
    sourceVersion: 1,
    syncedAt: params.syncedAt ?? new Date(),
  };
}

// ============================================================================
// Agregado de línea (3 Baaders juntas)
// ============================================================================

/**
 * Combina varios shifts de máquinas en un snapshot de línea.
 * Útil para el header "Línea de procesamiento" del dashboard.
 */
export function buildLineSnapshot(params: {
  dateKey: string;
  shiftId: string;
  machines: UpstreamMachineShift[];
}): UpstreamLineSnapshot {
  const { dateKey, shiftId, machines } = params;

  const totalCycles = machines.reduce((a, m) => a + m.totalCycles, 0);
  const expectedCycles = machines.reduce((a, m) => a + m.expectedTotalCycles, 0);

  // Throughput promedio (cycles/hora) sobre la duración de turno
  const shiftDurationHours = machines[0]
    ? (machines[0].shiftEnd.getTime() - machines[0].shiftStart.getTime()) / (3600 * 1000)
    : 0;

  const lineThroughputActual   = shiftDurationHours > 0 ? totalCycles / shiftDurationHours : 0;
  const lineThroughputExpected = shiftDurationHours > 0 ? expectedCycles / shiftDurationHours : 0;

  const lineAvailability = machines.length > 0
    ? machines.reduce((a, m) => a + m.actualRuntime, 0) / machines.length
    : 0;

  const machinesProducing = machines.filter(m => {
    const last = m.states[m.states.length - 1];
    return last?.isCurrent && last.type === 'uptime';
  }).length;

  return {
    dateKey,
    shiftId,
    machines,
    lineThroughputActual,
    lineThroughputExpected,
    lineAvailability,
    machinesProducing,
  };
}
