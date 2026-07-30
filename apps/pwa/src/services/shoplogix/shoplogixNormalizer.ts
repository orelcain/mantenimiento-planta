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
  ShoplogixRawComment,
  UpstreamMachineShift,
  UpstreamProductionInterval,
  UpstreamMachineState,
  UpstreamShiftComment,
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
    targetRate: typeof raw.rate === 'number' ? raw.rate : null,
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

/**
 * Normaliza un comentario crudo, preservando la correlación temporal/razón
 * que Shoplogix ya trae ({text, start, end, matchField, matchValue, key/displayId}).
 * Mirror de `normalizeComment` en functions/shoplogix/normalizer.js.
 */
export function normalizeComment(raw: ShoplogixRawComment): UpstreamShiftComment | null {
  if (typeof raw === 'string') {
    const text = raw.trim();
    return text ? { key: text, text, startAt: new Date(0), endAt: new Date(0), reasonField: '', reasonValue: '' } : null;
  }
  const text = (raw.text ?? raw.comment ?? raw.message ?? raw.body) as string | undefined;
  if (typeof text !== 'string' || !text.trim()) return null;
  const start = raw.start as string | undefined;
  const end = raw.end as string | undefined;
  return {
    key: String(raw.key ?? raw.displayId ?? `${text}|${start ?? ''}`),
    text,
    startAt: start ? parseShoplogixTime(start) : new Date(0),
    endAt: end ? parseShoplogixTime(end) : new Date(0),
    reasonField: String(raw.matchField ?? ''),
    reasonValue: String(raw.matchValue ?? ''),
  };
}

/** Normaliza y dedupea comentarios crudos por su `key`/`displayId` estable. */
export function normalizeComments(rawComments: ShoplogixRawComment[] | undefined): UpstreamShiftComment[] {
  const byKey = new Map<string, UpstreamShiftComment>();
  for (const raw of rawComments ?? []) {
    const c = normalizeComment(raw);
    if (!c) continue;
    if (!byKey.has(c.key)) byKey.set(c.key, c);
  }
  return [...byKey.values()];
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
  /**
   * Override del bound de inicio del turno. RECOMENDADO siempre — el
   * `currentShiftStart` que devuelve Shoplogix corresponde al turno en
   * curso AHORA, no al turno consultado (bug observado al sincronizar
   * Feb 26 cuando today=Feb 28).
   */
  shiftStartAt?: Date;
  /** Override del bound de fin del turno. Mismo motivo. */
  shiftEndAt?: Date;
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

  // Shift bounds — preferimos overrides explícitos del caller (cloud function
  // pasa el shiftWindow del schedule). Fallback a currentShiftStart/End de
  // Shoplogix solo si no hay override (legacy / sin schedule).
  const shiftStart = params.shiftStartAt
    ?? parseShoplogixTime(summary.currentShiftStart || production.currentShiftStart);
  const shiftEnd   = params.shiftEndAt
    ?? parseShoplogixTime(summary.currentShiftEnd || production.currentShiftEnd);

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

  // shiftRuntime: % del tiempo programado para producir en estado Uptime.
  //
  // "Planned Downtime" (reason='Planned Downtime', type='Break') = período
  // POST-TURNO capturado por la ventana de consulta (09:00-22:00). Se
  // separa de breakSec y se EXCLUYE del denominador porque no es tiempo
  // productivo programado — es tiempo fuera del turno.
  //
  // Observado en Feb 26: start=17:15, end=21:30, 255 min, idéntico en las 3
  // máquinas. Con esta corrección: 46.3% → ~69% (valor real de disponibilidad).
  //
  // El `actualRuntime` crudo de Shoplogix usa un denominador opaco (ej. 11.2%
  // cuando el Uptime real era 46% del turno Feb 26 E1) — no usar.
  // Shoplogix cambió el idioma del reason entre feb-2026 ("DETENCION PROGRAMADA",
  // 45 states reales de ese mes) y jul-2026 ("Planned Downtime") — aceptar ambos
  // o los turnos de feb deflactan la disponibilidad contándolos como break.
  const isPlannedDT = (s: UpstreamMachineState) => {
    if (s.type !== 'break') return false;
    const r = s.reason.toLowerCase();
    return r.includes('planned downtime') || r.includes('detencion programada') || r.includes('detención programada');
  };

  const shiftRuntimeBreakdown = {
    uptimeSec:          states.filter(s => s.type === 'uptime').reduce((a, s) => a + s.durationSec, 0),
    breakSec:           states.filter(s => s.type === 'break' && !isPlannedDT(s)).reduce((a, s) => a + s.durationSec, 0),
    plannedDowntimeSec: states.filter(isPlannedDT).reduce((a, s) => a + s.durationSec, 0),
    downtimeSec:        states.filter(s => s.type === 'downtime').reduce((a, s) => a + s.durationSec, 0),
    setupSec:           states.filter(s => s.type === 'setup').reduce((a, s) => a + s.durationSec, 0),
    totalTrackedSec:    0,
  };
  shiftRuntimeBreakdown.totalTrackedSec =
    shiftRuntimeBreakdown.uptimeSec + shiftRuntimeBreakdown.breakSec +
    shiftRuntimeBreakdown.plannedDowntimeSec +
    shiftRuntimeBreakdown.downtimeSec + shiftRuntimeBreakdown.setupSec;
  // Denominador excluye plannedDowntimeSec (post-turno no es tiempo productivo)
  const productiveSec = shiftRuntimeBreakdown.totalTrackedSec - shiftRuntimeBreakdown.plannedDowntimeSec;
  const shiftRuntime = productiveSec > 0
    ? shiftRuntimeBreakdown.uptimeSec / productiveSec
    : 0;

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
    shiftRuntime,
    shiftRuntimeBreakdown,
    intervals,
    states,
    threshold,
    productionUnit: summary.productionUnits || production.productionUnits || '',
    comments: normalizeComments([...(summary.comments ?? []), ...(production.comments ?? [])]),
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

  // Throughput promedio (cycles/hora) sobre la ventana REAL de operación:
  // de la primera a la última pieza del turno. Antes se dividía por la ventana
  // del turno, lo que asume que el turno está acotado en Shoplogix. En Filete
  // no lo está ("Turno Dia" abarca 24 h) y el resultado era 2 pz/h para un
  // turno que corrió 6,25 h. En Eviscerado ambas ventanas casi coinciden, así
  // que sus números no se mueven.
  let firstMs = Infinity, lastMs = -Infinity;
  for (const m of machines) {
    for (const iv of m.intervals) {
      if ((iv.cycles ?? 0) <= 0) continue;
      firstMs = Math.min(firstMs, iv.startAt.getTime());
      lastMs  = Math.max(lastMs,  iv.endAt.getTime());
    }
  }
  const effectiveHours = Number.isFinite(firstMs) && lastMs > firstMs
    ? (lastMs - firstMs) / (3600 * 1000)
    : 0;
  const shiftDurationHours = machines[0]
    ? (machines[0].shiftEnd.getTime() - machines[0].shiftStart.getTime()) / (3600 * 1000)
    : 0;
  const lineWindowSource: UpstreamLineSnapshot['lineWindowSource'] = effectiveHours > 0 ? 'effective' : 'shift';
  const lineWindowHours = effectiveHours > 0 ? effectiveHours : shiftDurationHours;

  const lineThroughputActual   = lineWindowHours > 0 ? totalCycles / lineWindowHours : 0;
  const lineThroughputExpected = lineWindowHours > 0 ? expectedCycles / lineWindowHours : 0;

  // Promedio del shiftRuntime real (no el `actualRuntime` opaco de Shoplogix).
  const lineAvailability = machines.length > 0
    ? machines.reduce((a, m) => a + m.shiftRuntime, 0) / machines.length
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
    lineWindowHours,
    lineWindowSource,
    lineAvailability,
    machinesProducing,
  };
}
