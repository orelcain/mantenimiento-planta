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
  /** Inicio del intervalo ("20260728T120000.000"). Lo manda la API real. */
  start?: ShoplogixTimestamp;
  /** Turno al que Shoplogix atribuye el intervalo ("Turno Dia", "Unscheduled"). */
  shift?: string;
  /** Velocidad del intervalo según Shoplogix. No viene en todos los intervalos. */
  rate?: number;
  /** Piezas dentro del uptime / dentro del turno programado. Opcionales igual que `rate`. */
  uptimeCycles?: number;
  scheduledCycles?: number;
  /** Rechazo por causa. Nunca observado poblado — ver aggregateScrapReasons en el sync. */
  scrapReasons?: Array<Record<string, unknown>>;
}

/**
 * Comentario crudo de Shoplogix. En la práctica siempre viene como objeto rico
 * ({text, start, end, matchField:"reason", matchValue:"FALTA MMPP", key/displayId, ...})
 * pero se tipa como unknown para tolerar el shape string[] legado que también
 * se ha visto en docs viejos. Ver `UpstreamShiftComment` para el tipo normalizado.
 */
export type ShoplogixRawComment = string | Record<string, unknown>;

export interface ShoplogixProductionMachine {
  machineId: string;
  machineName: string;
  comments: ShoplogixRawComment[];
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
  comments: ShoplogixRawComment[];
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
  type: 'baader_142' | 'baader_200' | 'marel_hg' | 'knuro' | 'other';
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
  /**
   * Velocidad del intervalo calculada por Shoplogix (misma cifra que ve el
   * operador en el whiteboard). null en docs viejos (sourceVersion < 4) o
   * cuando el sensor no la reporta — nunca 0, que significaría "parada".
   */
  rate: number | null;
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

/**
 * Comentario de operador normalizado, con la correlación temporal/razón que
 * Shoplogix ya trae de fábrica (antes se descartaba y quedaba solo el texto,
 * lo que hacía imposible saber a qué paro/razón pertenecía cada comentario).
 * `startAt`/`endAt`/`reasonValue` pueden faltar en comentarios legado
 * (docs sincronizados antes de este fix, guardados como string plano) — en
 * ese caso se rellenan con los bounds del turno como placeholder (ver
 * deserializeComment en shoplogixShift.service.ts) y el comentario se trata
 * como "huérfano" al intentar emparejarlo con un state.
 */
export interface UpstreamShiftComment {
  /** Id estable para dedupe (raw.key ?? raw.displayId, o sintético si faltan ambos). */
  key: string;
  text: string;
  startAt: Date;
  endAt: Date;
  /** raw.matchField — típicamente "reason". Vacío si no viene. */
  reasonField: string;
  /** raw.matchValue — la razón/estado que este comentario justifica (ej "FALTA MMPP"). */
  reasonValue: string;
}

/** Datos de un turno para una máquina upstream. */
export interface UpstreamMachineShift {
  machineid: string;
  machineName: string;
  machineType: UpstreamMachineInfo['type'];
  dateKey: string;             // "2026-02-26"
  shiftId: string;             // "Turno día" | "Turno noche" | "Turno 1" | "Turno 2" | "Turno 3"
  shiftStart: Date;
  shiftEnd: Date;
  /**
   * Horario real del turno derivado del campo `shift` en los intervalos de producción.
   * En docs syncDay (scheduleSource='intervals'): refleja el horario real de Shoplogix.
   * En docs legacy (scheduleSource='legacy'): igual a shiftStart/End (bounds de consulta).
   * Usar scheduledStart/End para posicionar bloques en el timeline.
   * Opcionales por backward compat — ausentes en docs v1 (deserializeShift usa shiftStart/End como fallback).
   */
  scheduledStart?: Date;
  scheduledEnd?: Date;
  scheduleSource?: 'intervals' | 'legacy';

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
   * Piezas contadas por el sensor DENTRO del uptime y DENTRO del turno
   * programado. Permiten un Rendimiento honesto (contra el tiempo que la
   * máquina realmente corrió vs contra el turno completo). 0 en docs con
   * sourceVersion < 4.
   */
  uptimeCycles?: number;
  scheduledCycles?: number;
  /**
   * Rechazo reportado por el sensor, agregado por causa. En Filete es la única
   * fuente posible de CALIDAD (no hay Grader). Lista vacía = sin rechazo
   * reportado; ⚠ nunca se ha visto poblado, validar con un turno real.
   */
  scrapByReason?: Array<{ reason: string; qty: number }>;
  scrapTotal?: number;
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
    breakSec: number;            // Break dentro del turno: Colación, Reunión, etc.
    /**
     * Tiempo POST-TURNO capturado por la ventana de consulta (09:00-22:00).
     * Shoplogix lo registra como state name='Detencion', type='Break',
     * reason='Planned Downtime'. Es idéntico en las 3 máquinas (confirma que
     * es schedule-level, no machine-specific).
     *
     * Se EXCLUYE del denominador de shiftRuntime porque no es tiempo
     * productivo programado — es tiempo fuera del turno.
     *
     * Observado en Feb 26 Turno día: 17:15-21:30 = 255 min (4h 15min).
     */
    plannedDowntimeSec: number;
    downtimeSec: number;         // Downtime (Micro Detención, Limpieza, etc.)
    setupSec: number;
    totalTrackedSec: number;     // Incluye plannedDowntimeSec (suma de todas las categorías)
  };

  // Detalle
  intervals: UpstreamProductionInterval[];
  states: UpstreamMachineState[];

  // Meta
  threshold: number;           // % tolerancia coloreo de barras
  productionUnit: string;      // "Eviscerado"
  comments: UpstreamShiftComment[];

  // Sync
  source: 'shoplogix';
  sourceVersion: number;
  syncedAt: Date;

  /**
   * Problemas de calidad detectados por la Capa 1 (Cloud Function post-sync)
   * o por la Capa 2 (deserialización cliente). Ausente o vacío = datos OK.
   * La UI puede mostrar un badge "⚠ datos parciales" cuando tenga entradas.
   */
  dataQualityIssues?: string[];
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
  /**
   * Horas usadas como denominador del throughput y de dónde salen:
   *   'effective' = de la primera a la última pieza (ventana real de operación)
   *   'shift'     = la ventana del turno (fallback si no hubo producción)
   * Importa cuando el turno no está acotado en Shoplogix: en Filete el turno
   * "Turno Dia" abarca 24 h, así que dividir por la ventana del turno daba
   * 2 pz/h para un turno que realmente corrió 6,25 h.
   */
  lineWindowHours: number;
  lineWindowSource: 'effective' | 'shift';
  lineAvailability: number;         // promedio actualRuntime (0..1)
  machinesProducing: number;        // cuántas de las 3 están actualmente en Uptime
}

// ============================================================================
// HELPERS — tipos para uso interno
// ============================================================================

export type UpstreamStateType = UpstreamMachineState['type'];
export type UpstreamColor = UpstreamProductionInterval['color'];
