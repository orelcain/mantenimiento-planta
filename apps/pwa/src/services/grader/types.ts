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

export type CalibreRange =
  | '0-2 lb'
  | '2-4 lb'
  | '4-6 lb'
  | '6-8 lb'
  | '8-10 lb'
  | '10-12 lb'
  | 'Other';

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
  };
  /** Rangos de peso por calibre personalizados (sobreescriben los default) */
  customWeightRanges?: CalibreWeightRange[];
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
