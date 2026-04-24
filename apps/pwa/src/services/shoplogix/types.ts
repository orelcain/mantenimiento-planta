/**
 * Tipos para la integración con Shoplogix (upstream del Grader).
 *
 * Shoplogix monitorea las 3 Evisceradoras Baader 142 + Knuro de Planta Chonchi
 * (upstream del Grader). Esta integración trae los datos de producción y paros
 * para correlacionar con los P0 del Grader y apoyar decisiones de producción,
 * calidad y mantención.
 *
 * Ver: docs/SHOPLOGIX_API.md + docs/SHOPLOGIX_INTEGRATION_PLAN.md
 */

// ============================================================================
// RAW — schema de Shoplogix tal cual responde la API (query.axd)
// ============================================================================

/** Formato timestamp Shoplogix: "YYYYMMDDTHHMMSS.fff" (UTC). */
export type ShoplogixTimestamp = string;

export interface ShoplogixProductionInterval {
  cycles: number;              // piezas reales en el intervalo
  expectedCycles: number;      // piezas esperadas (tasa estándar)
  total: number;               // acumulado real
  expectedTotal: number;       // acumulado esperado
  totalDuration: number;       // ms (300000 = 5 min)
}

export interface ShoplogixProductionMachine {
  machineId: string;
  machineName: string;
  comments: string[];
  currentShiftStart: ShoplogixTimestamp;
  currentShiftEnd: ShoplogixTimestamp;
  finishedGoodUnits: string;
  inventoryUnits: string;
  lineUnits: string;
  machineProduction: ShoplogixProductionInterval[];
  productionUnits: string;     // "Eviscerado"
  threshold: number;           // 15 (% tolerancia coloreo)
  time: ShoplogixTimestamp;
}

export interface ShoplogixProductionResponse {
  version: 1;
  machines: ShoplogixProductionMachine[];
}

export interface ShoplogixMachineState {
  name: 'Produciendo' | 'Detencion' | 'Micro Detencion' | string;
  reason: string;              // "REUNION INICIO TURNO" | "COLACION" | ...
  reasonRootCause: boolean;
  reasonRootCauseName: string;
  statusColor: string;         // hex sin #: "ff0000" | "008000" | "73d8ff"
  reasonColor: string;
  acceptsReason: boolean;
  reasonExceeded: boolean;
  setupExceeded: boolean;
  type: 'Uptime' | 'Downtime' | 'Break' | string;
  current: boolean;
  start: ShoplogixTimestamp;
  end: ShoplogixTimestamp;
  startMilli: number;          // Unix ms
  endMilli: number;
  durationMilli: number;
}

export interface ShoplogixSummaryMachine {
  machineId: string;
  machineName: string;
  time: ShoplogixTimestamp;
  threshold: number;
  finishedGoodUnits: string;
  inventoryUnits: string;
  lineUnits: string;
  productionUnits: string;
  productionMachine: boolean;
  currentShiftStart: ShoplogixTimestamp;
  currentShiftEnd: ShoplogixTimestamp;
  runtimeVariance: number;     // actualRuntime - expectedRuntime
  expectedRuntime: number;     // fracción del día (0..1)
  actualRuntime: number;
  machineStates: ShoplogixMachineState[];
  comments: string[];
  cameras: unknown[];
  autoEnforceStatusReasons: boolean;
}

export interface ShoplogixSummaryResponse {
  version: 1;
  machines: ShoplogixSummaryMachine[];
}

// ============================================================================
// NORMALIZED — schema estándar interno (agnóstico de la fuente)
// ============================================================================

/**
 * Identidad de una máquina upstream. Matchea `shoplogix/chonchi/machines/{id}`
 * en Firestore (una vez implementado el sync).
 */
export interface UpstreamMachineInfo {
  machineid: string;           // UUID Shoplogix
  name: string;                // "Evisceradora 1"
  type: 'baader_142' | 'marel_hg' | 'knuro' | 'other';
  role: 'upstream' | 'inline';
  order: number;               // orden en pipeline: Marel(0) → B1,2,3(1) → Grader(2)
}

/** Intervalo de producción normalizado (5 min fijos). */
export interface UpstreamProductionInterval {
  startAt: Date;
  endAt: Date;
  cycles: number;
  expectedCycles: number;
  total: number;
  expectedTotal: number;
  ratio: number;               // cycles / expectedCycles (0..1+)
  color: 'green' | 'yellow' | 'red' | 'gray';  // según threshold
}

/** Estado/paro en timeline Gantt. */
export interface UpstreamMachineState {
  startAt: Date;
  endAt: Date;
  durationSec: number;
  type: 'uptime' | 'downtime' | 'break' | 'setup';
  name: string;                // "Produciendo" | "Detencion" | "Micro Detencion"
  reason: string;              // "COLACION" | "REUNION INICIO TURNO" | "" (sin categorizar)
  color: string;               // "#ff0000" (con #, listo para CSS)
  isCurrent: boolean;
}

/** Datos de un turno para una máquina upstream. */
export interface UpstreamMachineShift {
  machineid: string;
  machineName: string;
  machineType: UpstreamMachineInfo['type'];
  dateKey: string;             // "2026-02-26"
  shiftId: string;             // "Turno día" | "Turno noche"
  shiftStart: Date;
  shiftEnd: Date;

  // Agregados (calculados en normalizer)
  totalCycles: number;
  expectedTotalCycles: number;
  totalPieces: number;
  expectedTotalPieces: number;
  overallRatio: number;        // productividad total (0..1+)
  /**
   * Campo crudo de Shoplogix — fracción de tiempo Uptime sobre un denominador
   * INCONSISTENTE (no es la duración del turno; observado 11.2% cuando el
   * Uptime real era 46% del turno). Usar `shiftRuntime` para el % real.
   */
  actualRuntime: number;
  expectedRuntime: number;
  runtimeVariance: number;
  /**
   * % del turno en estado Uptime, calculado por nosotros desde los states:
   *   Σ duración(state.type === 'uptime') / (shiftEnd − shiftStart)
   * Es el número que tiene sentido para operadores ("la máquina produjo X%
   * del turno"). Distinto al `actualRuntime` crudo de Shoplogix.
   */
  shiftRuntime: number;
  /** Suma de duraciones (en segundos) por categoría de state, calculada nosotros. */
  shiftRuntimeBreakdown: {
    uptimeSec: number;
    breakSec: number;       // Break (Colación, Reunión, Planned Downtime, etc.)
    downtimeSec: number;    // Downtime (Micro Detención, Limpieza, etc.)
    setupSec: number;
    totalTrackedSec: number;
  };

  // Detalle
  intervals: UpstreamProductionInterval[];
  states: UpstreamMachineState[];

  // Meta
  threshold: number;           // % tolerancia coloreo de barras
  productionUnit: string;      // "Eviscerado"
  comments: string[];

  // Sync
  source: 'shoplogix';
  sourceVersion: number;
  syncedAt: Date;
}

/**
 * Vista de la línea upstream para un turno (resumen de las 3 Baaders juntas).
 * Es lo que consume el `UpstreamMachinesPanel`.
 */
export interface UpstreamLineSnapshot {
  dateKey: string;
  shiftId: string;
  machines: UpstreamMachineShift[];

  // KPIs de la línea (suma/promedio de las 3)
  lineThroughputActual: number;     // cycles/hora promedio
  lineThroughputExpected: number;
  lineAvailability: number;         // promedio actualRuntime (0..1)
  machinesProducing: number;        // cuántas de las 3 están actualmente en Uptime
}

// ============================================================================
// HELPERS — tipos para uso interno
// ============================================================================

export type UpstreamStateType = UpstreamMachineState['type'];
export type UpstreamColor = UpstreamProductionInterval['color'];
