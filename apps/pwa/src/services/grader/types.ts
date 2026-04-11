/**
 * Tipos del módulo "Análisis Grader"
 *
 * La grader clasifica salmones por peso (calibre) y calidad.
 * Hay 12 compuertas/gates (1..12) + Gate 0 (Punto Cero: piezas no clasificadas).
 */

// ============================================================================
// ENUMS / LITERAL TYPES
// ============================================================================

export type GraderQuality = 'D' | 'Industrial' | 'Grado' | 'Premium' | 'Unknown';

export type CalibreRange = string;

/**
 * Causas estandarizadas de Punto Cero.
 * Cada registro Gate 0 se clasifica en exactamente una de estas causas.
 */
export type PointZeroCause =
  | 'fuera_de_rango'
  | 'fuera_de_limites'
  | 'no_leido_fotocelula'
  | 'too_close_too_long'
  | 'puerta_no_preparada'
  | 'otro';

/** Rango de peso en gramos para cada calibre */
export interface CalibreWeightRange {
  calibre: string;
  label: string;
  minGrams: number;
  maxGrams: number;
}

/** Desglose de una causa de Punto Cero */
export interface PointZeroCauseBreakdown {
  cause: PointZeroCause;
  label: string;
  description: string;
  pieces: number;
  pctOfPointZero: number; // % respecto al total punto cero (suman 100%)
  pctOfTotal: number;     // % respecto al total producción
  weightKg?: number;
  /** Registros individuales para drill-down */
  records?: PointZeroDrillRecord[];
}

/** Registro individual para drill-down en P0 */
export interface PointZeroDrillRecord {
  ts: string;
  pieces: number;
  weightKg?: number;
  weightPerPieceGrams?: number;
  error: string;
  quality?: string;
  calibre?: string;
  lot?: string;
}

/** Detalle de piezas fuera de rango por distribución de peso */
export interface OutOfRangeWeightDetail {
  rangeLabel: string;  // e.g. "Bajo rango (< 0g)", "0-2 lb", "10+ lb (> 9163g)"
  pieces: number;
  pct: number;         // % del fuera de rango
  weightKg?: number;
}

/** Fila de la tabla pivote jerárquica Error × Calidad × Calibre */
export interface PointZeroHierarchyRow {
  error: string;         // Causa estandarizada (label)
  errorCause: PointZeroCause;
  quality: string;       // GraderQuality
  calibre: string;       // CalibreRange o 'Fuera de Rango'
  pieces: number;
  pctOfPointZero: number;
  pctOfTotal: number;
  weightKg?: number;
}

/** Clasificación completa del 100% de Punto Cero */
export interface PointZeroClassification {
  totalPointZeroPieces: number;
  causes: PointZeroCauseBreakdown[];
  /** Tabla pivote jerárquica Error × Calidad × Calibre */
  hierarchy: PointZeroHierarchyRow[];
  /** Para ítems "fuera_de_rango" con peso, desglose por rango de calibre */
  outOfRangeByWeight: OutOfRangeWeightDetail[];
  /** Rangos de referencia usados */
  calibreWeightRanges: CalibreWeightRange[];
}

export type MatrixFileKind =
  | 'PIEZA_PIEZA'
  | 'PUERTA_0'
  | 'PORC_CALIDAD'
  | 'TOTALES_PRODUCCION'
  | 'TOTAL_PIEZAS_POR_FOLIO'
  | 'UNKNOWN';

// ============================================================================
// ARCHIVOS CARGADOS
// ============================================================================

export interface UploadedMatrixFile {
  id: string;
  name: string;
  kind: MatrixFileKind;
  sizeBytes: number;
  parsedAt: string; // ISO
  warnings: string[];
  storagePath?: string;
  downloadURL?: string;
}

// ============================================================================
// UPLOADS PERSISTIDOS (CALENDARIO)
// ============================================================================

export interface GraderUpload {
  id: string;
  fileMeta: UploadedMatrixFile;
  inferred?: {
    startAt?: string;
    endAt?: string;
  };
  sessionDate: string; // YYYY-MM-DD
  shiftId?: string;
  deviceId?: string;
  createdBy: string;
  createdAt: string;
  updatedAt?: string;
}

// ============================================================================
// CONFIGURACIÓN FÍSICA DE LA MÁQUINA
// ============================================================================

/** Configuración de una cinta transportadora de la grader */
export interface GraderBeltConfig {
  /** Identificador de la cinta en el flujo de la máquina */
  beltId: 'zeta' | 'accel1' | 'accel2' | 'main'
  /** Nombre visible para el operador */
  label: string
  /** Largo de la cinta en metros */
  lengthMeters: number
  /** Ancho de la cinta en metros (opcional) */
  widthMeters?: number
  /** Velocidad de la cinta en metros/segundo */
  speedMps: number
}

/** Distancia física de un flipper/compuerta respecto a la fotocélula de entrada */
export interface GraderFlipperPosition {
  /** Número de compuerta (1..12) */
  gateNumber: number
  /** Distancia desde la fotocélula al flipper en metros */
  distanceFromSensorMeters: number
}

/**
 * Parámetros físicos reales de la clasificadora grader.
 * Usado para calcular separación entre peces, timing de flippers
 * y mejorar las recomendaciones de la IA.
 *
 * Flujo del salmón (Marelec MS4/12, S/N 3943):
 *   ❶ Static Weighing System (Pockets 1-4) — referencia de pesaje del Z2
 *   ❷ Z-Conveyor (cinta elevadora, 1200mm ancho)
 *   ❸ Acceleration Belt 1 → Acceleration Belt 2 [Detection Eye ❸ al final]
 *   ❹ Grading Belt (17179mm, 300mm ancho, 12 flipper modules)
 *
 * Timing de cada flipper:
 *   t_señal = distanceFromSensorMeters / velocidad_cinta_principal
 *   t_apertura_mínima = (flipperPaddleLengthMm / 1000) / velocidad_cinta
 *   t_pez_pasa = avgSalmonLengthCm / 100 / velocidad_cinta
 *
 * Mediciones en terreno (2026-04-11):
 *   - Sensor (Detection Eye) → Gate 1 pivot: 1300 mm
 *   - Pitch entre pivots consecutivos: 1370 mm (uniforme gates 1-12)
 *   - Largo paleta flipper: 475 mm
 *
 * Nota Z2: los parámetros dis1-dis12 del controlador Z2 pueden diferir
 * de las distancias físicas porque incluyen compensación del tiempo de
 * actuación del solenoide neumático (dis1=1250 vs físico=1300: 50mm ≈ 71ms anticipo).
 */
export interface GraderPhysicalConfig {
  /** Largo promedio del salmón en centímetros */
  avgSalmonLengthCm: number
  /** Ancho promedio del salmón en centímetros (opcional) */
  avgSalmonWidthCm?: number
  /** Número de pockets de alimentación (Static Weighing System ❶) */
  pocketCount: number
  /** Configuración de las 4 cintas del sistema */
  belts: GraderBeltConfig[]
  /**
   * Distancias físicas de cada flipper desde el Detection Eye (fotocélula ❸).
   * Medidas desde el lente del sensor hasta el eje de rotación (pivot) del flipper.
   * Mediciones reales: Gate 1 = 1300mm, pitch uniforme = 1370mm.
   */
  flipperPositions: GraderFlipperPosition[]
  /**
   * Largo de la paleta del flipper en milímetros (desde eje de rotación hasta extremo).
   * Medición en terreno 2026-04-11: 475 mm.
   * t_apertura_mínima = flipperPaddleLengthMm / 1000 / velocidad_cinta
   */
  flipperPaddleLengthMm?: number
  /**
   * Distancias programadas en el controlador Marelec Z2 (parámetros dis1-dis12).
   * Leídas desde "Cambiar Parámetros" → dis1..dis12 en el Z2.
   * Son más precisas que las mediciones físicas para calcular el timing real,
   * ya que incluyen la compensación de actuación del solenoide neumático.
   * Bajar dis = flipper abre antes. Subir dis = flipper abre después.
   * Unidad: milímetros. Array de 12 valores (index 0 = Gate 1).
   */
  z2ProgrammedDistancesMm?: number[]
}

// ============================================================================
// CONFIGURACION POR DISPOSITIVO (RANGOS PERSISTENTES)
// ============================================================================

export interface GraderDeviceConfig {
  id: string; // deviceId
  deviceId: string;
  customWeightRanges: CalibreWeightRange[];
  updatedBy: string;
  updatedAt: string;
}

// ============================================================================
// CONFIGURACION GLOBAL DEL MODULO
// ============================================================================

export interface GraderModuleConfig {
  id: 'global';
  customWeightRanges: CalibreWeightRange[];
  shiftSchedule?: GraderShiftSchedule[];
  /** Configuración física de la máquina grader */
  physicalConfig?: GraderPhysicalConfig;
  updatedBy: string;
  updatedAt: string;
}

export interface GraderShiftSchedule {
  shiftId: 'Turno día' | 'Turno tarde' | 'Turno noche';
  startHour: number;   // 0-23
  startMinute: number; // 0-59
  endHour: number;     // 0-23 (puede ser menor si cruza medianoche)
  endMinute: number;   // 0-59
}

// ============================================================================
// RESUMENES DIARIOS (KPIs PERSISTIDOS)
// ============================================================================

export interface GraderDailySummary {
  id: string; // `${dateKey}__${shiftId}`
  dateKey: string; // YYYY-MM-DD
  shiftId: string;
  totalPieces: number;
  pointZeroPieces: number;
  pointZeroPct: number;
  startAt?: string;
  endAt?: string;
  updatedBy: string;
  updatedAt: string;
}

// ============================================================================
// CONFIGURACIÓN DE GATES
// ============================================================================

export interface GateAssignment {
  gateNumber: number; // 1..12
  assignedQuality: GraderQuality;
  assignedCalibre: CalibreRange;
  active: boolean;
  note?: string;
}

export interface GraderAnalysisConfig {
  deviceId?: string; // e.g., STATICGRADER1
  shiftId?: string;
  startAt?: string; // ISO inferred from data
  endAt?: string;   // ISO inferred from data
  timezone?: string; // e.g., "America/Santiago"
  intervalMinutes?: 5 | 15 | 60; // for time series
  errorThresholds?: {
    photocellPctWarn: number;      // e.g., 1
    outOfLimitsPctWarn: number;    // e.g., 3
    pointZeroPctWarn: number;      // e.g., 2
    pointZeroPctCritical?: number; // e.g., 3.5
  };
  /** Rangos de peso por calibre personalizados (sobreescriben los default) */
  customWeightRanges?: CalibreWeightRange[];
  /** Parámetros físicos de la máquina (cintas, flippers, dimensiones del salmón) */
  physicalConfig?: GraderPhysicalConfig;
}

// ============================================================================
// REGISTROS PARSEADOS
// ============================================================================

export interface PieceRecord {
  ts: string; // ISO
  gate: number; // 0..12
  pieces: number;
  weightKg?: number;
  /** Peso por pieza en gramos (columna "peso en Gr" del Excel) */
  weightPerPieceGrams?: number;
  quality?: GraderQuality;
  calibre?: CalibreRange;
  error?: string; // available for gate 0 records (from pieza-pieza or Puerta 0)
  lot?: string;
  product?: string;
  raw?: Record<string, unknown>;
}

export interface Gate0Record {
  ts: string; // ISO
  gate: 0;
  pieces: number;
  weightKg?: number;
  /** Peso por pieza en gramos (columna "peso en Gr" del Excel) */
  weightPerPieceGrams?: number;
  error: string; // normalized error label
  quality?: GraderQuality;
  calibre?: CalibreRange;
  lot?: string;
  raw?: Record<string, unknown>;
}

export interface FolioRecord {
  startAt?: string; // ISO
  endAt?: string;   // ISO
  lot?: string;
  pieces?: number;
  weightKg?: number;
  avgWeightKg?: number;
  raw?: Record<string, unknown>;
}

export interface QualitySummaryRow {
  quality: GraderQuality;
  calibre: CalibreRange;
  pieces: number;
  pct?: number;
  weightKg?: number;
  raw?: Record<string, unknown>;
}

export interface ProductionSummaryRow {
  calibre: CalibreRange;
  pieces: number;
  pct?: number;
  avgPieceWeightKg?: number;
  lotCount?: number;
  weightKg?: number;
  raw?: Record<string, unknown>;
}

// ============================================================================
// DATOS PARSEADOS COMBINADOS
// ============================================================================

export interface ParsedMatrixData {
  files: UploadedMatrixFile[];
  pieceRecords: PieceRecord[];
  gate0Records: Gate0Record[];
  folioRecords: FolioRecord[];
  qualitySummary: QualitySummaryRow[];
  productionSummary: ProductionSummaryRow[];
  inferred: {
    deviceId?: string;
    startAt?: string;
    endAt?: string;
  };
}

// ============================================================================
// KPIs Y ANALYTICS
// ============================================================================

export interface KPIBlock {
  totalPieces: number;
  totalWeightKg?: number;
  pointZeroPieces: number;
  pointZeroPct: number; // 0..100
  topPointZeroErrors: Array<{ error: string; pieces: number; pct: number }>;
  dominantCalibre?: { calibre: CalibreRange; pct: number; pieces: number };
  dominantQuality?: { quality: GraderQuality; pct: number; pieces: number };
  /** Peso promedio por pieza en gramos (productivos, gate > 0) */
  avgWeightGrams?: number;
  /** Mediana de peso por pieza en gramos */
  medianWeightGrams?: number;
  /** Cantidad de lotes únicos procesados */
  uniqueLots?: number;
  /** Tasa de producción: piezas/hora */
  productionRatePerHour?: number;
}

export interface DistributionRow {
  key: string; // calibre or quality label
  pieces: number;
  pct: number; // 0..100
  weightKg?: number;
}

export interface TimeSeriesPoint {
  bucketStart: string; // ISO
  pointZeroPieces: number;
  pointZeroPct?: number;
  totalPieces?: number;
}

export interface GateBalanceInsight {
  calibre: CalibreRange;
  demandPct: number; // 0..100
  gatesAssigned: number;
  /** Asignación ideal proporcional a demanda (largest-remainder) */
  idealGates: number;
  /** idealGates - gatesAssigned: positivo = déficit, negativo = superávit */
  gap: number;
  severity: 'info' | 'warn' | 'critical';
  message: string;
}

// ============================================================================
// ANÁLISIS POR LOTE
// ============================================================================

/** Análisis detallado por lote extraído del pieza-pieza */
export interface LotAnalysis {
  lot: string;
  firstSeen: string;       // ISO
  lastSeen: string;        // ISO
  pieces: number;
  weightKg: number;
  avgWeightGrams: number;
  medianWeightGrams: number;
  stdDevWeightGrams: number;
  pointZeroPieces: number;
  pointZeroPct: number;
  calibreDistribution: DistributionRow[];
  qualityDistribution: DistributionRow[];
}

// ============================================================================
// TENDENCIA DE PESO EN EL TIEMPO
// ============================================================================

/** Bucket temporal con estadísticas de peso */
export interface WeightTrendBucket {
  bucketStart: string;        // ISO
  avgWeightGrams: number;
  medianWeightGrams: number;
  stdDevWeightGrams: number;
  movingAvg5?: number;        // media móvil de 5 buckets
  pieces: number;
  dominantLot?: string;       // lote con más piezas en este bucket
}

// ============================================================================
// MATRIZ Q×C ENRIQUECIDA
// ============================================================================

/** Índices de concentración para la matriz Calidad×Calibre */
export interface MatrixQCEnhanced {
  /** Índice HHI por fila de calidad (nombre → HHI 0-1) */
  hhiByQuality: Array<{ quality: string; hhi: number; pieces: number }>;
  /** Índice HHI por columna de calibre (nombre → HHI 0-1) */
  hhiByCalibre: Array<{ calibre: string; hhi: number; pieces: number }>;
  /** HHI global de la matriz completa */
  globalHHI: number;
  /** Celda con mayor concentración */
  maxCell?: { quality: string; calibre: string; pieces: number; pct: number };
  /** Score de desbalance: 0=perfectamente equilibrado, 1=todo concentrado */
  imbalanceScore: number;
  /** Peso promedio por celda Q×C */
  avgWeightByCell: Record<string, Record<string, number>>;
}

// ============================================================================
// ESTADÍSTICAS AVANZADAS POR GATE
// ============================================================================

/** Estadísticas detalladas por gate individual */
export interface GateAdvancedStats {
  gateNumber: number;
  pieces: number;
  weightKg: number;
  avgWeightGrams: number;
  stdDevWeightGrams: number;
  cv: number;                 // coeficiente de variación
  utilizationPct: number;     // % del total productivo
  assignedCalibre: CalibreRange;
  assignedQuality: GraderQuality;
  /** % de piezas que NO coinciden con el calibre asignado */
  mismatchPct: number;
  calibreBreakdown: Record<string, number>;
}

/** Sugerencia de reasignación de gate */
export interface GateSwapSuggestion {
  /** correction: etiqueta del sistema no coincide con la máquina;
   *  optimization: redistribuir gates según demanda;
   *  investigate: anomalía que requiere verificación */
  type: 'correction' | 'optimization' | 'investigate' | 'swap' | 'reassign' | 'add';
  gateNumber: number;
  currentCalibre: CalibreRange;
  suggestedCalibre: CalibreRange;
  reason: string;
  impactScore: number;        // 0-100, mayor = más urgente
  evidence: string[];
}

// ============================================================================
// RESULTADO COMPLETO (extendido)
// ============================================================================

export interface GraderAnalyticsResult {
  config: GraderAnalysisConfig;
  gates: GateAssignment[];
  kpis: KPIBlock;
  distributionByCalibre: DistributionRow[];
  distributionByQuality: DistributionRow[];
  pointZeroByError: Array<{ error: string; pieces: number; pct: number; weightKg?: number }>;
  /** Clasificación estandarizada del 100% de Punto Cero */
  pointZeroClassification: PointZeroClassification;
  matrixQualityCalibre: Record<string, Record<string, { pieces: number; pct: number }>>;
  timeSeriesPointZero: TimeSeriesPoint[];
  gateBalance: GateBalanceInsight[];
  /** Análisis por lote extraído desde pieza-pieza */
  lotAnalysis: LotAnalysis[];
  /** Tendencia de peso en el tiempo */
  weightTrendSeries: WeightTrendBucket[];
  /** Matriz Q×C enriquecida con índices de concentración */
  matrixEnhanced: MatrixQCEnhanced;
  /** Estadísticas avanzadas por gate */
  gateAdvancedStats: GateAdvancedStats[];
  /** Sugerencias de reasignación de gates */
  gateSwapSuggestions: GateSwapSuggestion[];
  /** Score de calidad de asignación 0-100 (100 = asignación perfecta proporcional a demanda) */
  allocationScore: number;
  notes: string[];
}

// ============================================================================
// INSIGHTS DETERMINÍSTICOS
// ============================================================================

export interface DeterministicInsight {
  id: string;
  severity: 'info' | 'warn' | 'critical';
  title: string;
  evidence: string[]; // MUST contain numeric facts
  recommendations: string[];
}

// ============================================================================
// IA (input / output)
// ============================================================================

export interface AIGraderInput {
  version: '1.0';
  metadata: {
    deviceId?: string;
    startAt?: string;
    endAt?: string;
    timezone?: string;
    totalPieces?: number;
  };
  thresholds?: GraderAnalysisConfig['errorThresholds'];
  kpis: KPIBlock;
  distributions: {
    byCalibre: DistributionRow[];
    byQuality: DistributionRow[];
    pointZeroByError: Array<{ error: string; pieces: number; pct: number }>;
  };
  timeSeriesPointZero: TimeSeriesPoint[];
  gateAssignments: GateAssignment[];
  gateBalance: GateBalanceInsight[];
  /** Resumen estadístico por lote (opcional, para enriquecer el análisis IA) */
  lotAnalysis?: Array<{
    lot: string;
    pieces: number;
    avgWeightGrams: number;
    stdDevWeightGrams: number;
    pointZeroPct: number;
  }>;
  /** Índices de concentración de la matriz Q×C */
  matrixEnhanced?: {
    globalHHI: number;
    imbalanceScore: number;
    maxCell?: { quality: string; calibre: string; pieces: number; pct: number };
  };
  /** Estadísticas avanzadas por gate (resumen) */
  gateAdvancedStats?: Array<{
    gateNumber: number;
    pieces: number;
    cv: number;
    utilizationPct: number;
    mismatchPct: number;
  }>;
  /** Sugerencias de reasignación de gates */
  gateSwapSuggestions?: GateSwapSuggestion[];
  dataCompleteness: {
    hasPieceRecords: boolean;
    hasGate0Records: boolean;
    hasQualitySummary: boolean;
    hasProductionSummary: boolean;
    hasFolioRecords: boolean;
    notes: string[];
  };
  /** Foco opcional de patrones en Punto Cero (filtro por causa/horario) */
  patternFocus?: {
    selectedCauseLabel?: string;
    timeRange?: { from?: string; to?: string };
    intervalMinutes?: number;
    filteredTotalPieces: number;
    distributionByCalibre: Array<{ key: string; pieces: number; pct: number }>;
    distributionByQuality: Array<{ key: string; pieces: number; pct: number }>;
    hourlyDistribution?: Array<{ hour: string; pieces: number; pct: number }>;
  };
  /**
   * Contexto físico de la máquina — enriquece las recomendaciones de la IA
   * con métricas derivadas de la configuración física real.
   */
  physicalContext?: {
    /** Velocidad de la cinta clasificadora principal (m/s) */
    mainBeltSpeedMps: number
    /** Largo promedio del salmón configurado (cm) */
    avgSalmonLengthCm: number
    /** Separación estimada entre peces en la cinta principal (cm) */
    estimatedSpacingCm: number
    /** Nivel de riesgo de errores "too close": low (<40% margen), medium, high (>80% saturación) */
    tooCloseRiskLevel: 'low' | 'medium' | 'high'
    /** Tiempo desde fotocélula hasta cada flipper a la velocidad actual */
    flipperTimings: Array<{
      gateNumber: number
      distanceMeters: number
      timeFromSensorSeconds: number
    }>
  }
  /** Proyección opcional de cierre de turno basada en datos parciales */
  trendForecast?: {
    shiftStart: string;
    shiftEnd: string;
    completionPct: number;
    observedBuckets: number;
    totalBuckets: number;
    observedPieces: number;
    projectedTotalPieces: number;
    projectedPointZeroPct: number;
    projectedPointZeroPieces: number;
  };
}

export interface AIGraderOutput {
  version: '1.0';
  summaryBullets: string[]; // 3-6
  likelyCauses: Array<{
    cause: string;
    confidence: 'low' | 'medium' | 'high';
    evidence: string[];
  }>;
  recommendedActions: Array<{
    action: string;
    priority: 'low' | 'medium' | 'high';
    why: string;
  }>;
  whatToCheckNext: string[];
  disclaimers?: string[];
}

// ============================================================================
// SESIÓN PERSISTIDA EN FIRESTORE
// ============================================================================

export interface GraderSession {
  id: string;
  deviceId?: string;
  shiftId?: string;          // turno: "Turno noche", "Turno día", etc.
  sessionDate?: string;      // YYYY-MM-DD — fecha de producción (de los datos)
  startAt?: string;
  endAt?: string;
  uploadedFilesMeta: UploadedMatrixFile[];
  gatesConfigSnapshot: GateAssignment[];
  aggregates: GraderAnalyticsResult;
  insights: DeterministicInsight[];
  aiOutput?: AIGraderOutput;
  createdBy: string;
  createdAt: string; // ISO
  updatedAt?: string;
}
