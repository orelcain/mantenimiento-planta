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
  /** Estado de calibración de speedMps */
  calibrationStatus?: CalibrationStatus
  /** Lectura Z2 (unidades internas) que corresponde a speedMps */
  z2Units?: number
  /**
   * Datos del variador Danfoss para esta cinta.
   * Cada cinta tiene su propio variador (foto 2026-04-11, 4 VFDs en tablero).
   * VFD labels visibles: "CintaZ", "Grader", "IF 2.", Midi Drive.
   */
  vfd?: BeltVfdData
}

/**
 * Datos del variador Danfoss (VLT) de una cinta.
 *
 * Factor clave: `effectiveMpsPerRpm` = belt_speed_mps / motor_rpm
 * Absorbe la reducción + diámetro de polea en un único número.
 * Se calibra UNA VEZ (medir RPM + velocidad simultáneamente) y queda fijo.
 *
 * Una vez calibrado: belt_speed = vfdCurrentRpm × effectiveMpsPerRpm
 */
export interface BeltVfdData {
  /** Texto o etiqueta visible en el frente del variador (ej: "Grader", "CintaZ", "IF 2.") */
  label?: string
  /**
   * Cinta a la que está asignado este variador.
   * Se puede corregir desde la app si la asignación visual de la foto era incorrecta.
   * La asignación en DEFAULT_PHYSICAL_CONFIG es ESTIMADA — confirmar en planta.
   */
  assignedBeltId?: 'zeta' | 'accel1' | 'accel2' | 'main'
  /** RPM actual mostrado en el display del variador */
  vfdCurrentRpm?: number
  /** Frecuencia actual mostrada en el display del variador (Hz) */
  vfdCurrentHz?: number
  /** Potencia actual mostrada en el display del variador (kW) */
  vfdCurrentKw?: number
  /** RPM mínimo de operación configurado en el variador */
  vfdMinRpm?: number
  /** RPM máximo de operación configurado en el variador */
  vfdMaxRpm?: number
  /**
   * Factor de transmisión efectivo: m/s de cinta por RPM de motor.
   * Derivado de: belt_speed_mps / motor_rpm en un punto de operación conocido.
   * Este único valor resume la relación de reducción + diámetro de polea.
   *
   * Ejemplos aproximados (basados en Z2 units × k + foto VFDs 2026-04-11):
   *   Sorting Belt: 1.28 m/s / 1500 RPM = 0.000853 m/(s·RPM)
   *   Accel1:       1.03 m/s / 1305 RPM = 0.000789 m/(s·RPM)
   *   Accel2:       1.23 m/s / 1470 RPM = 0.000837 m/(s·RPM)
   *   Z-Belt:       0.39 m/s / 1470 RPM = 0.000265 m/(s·RPM)  ← reductor i=24
   */
  effectiveMpsPerRpm?: number
  /** Estado de calibración del factor effectiveMpsPerRpm */
  effectiveStatus?: CalibrationStatus

  // ── Mediciones directas para verificación (ingresar con tachómetro en planta) ──

  /**
   * RPM medido en el eje de salida de la cinta con tachómetro de contacto/óptico.
   * Combinado con effectiveMpsPerRpm → permite verificar coherencia con VFD display.
   * Si el eje es accesible: pegar cinta reflectante + tachómetro óptico.
   */
  measuredShaftRpm?: number
  /**
   * Velocidad lineal medida directamente sobre la superficie de la cinta (m/s).
   * Con tachómetro de contacto (rueda sobre la cinta) o cronometrando una marca.
   * Es la medición más directa y confiable. Si difiere de Z2 y VFD → hay drift.
   */
  measuredBeltMps?: number
  /** Fecha de la medición directa para validez histórica */
  measuredAt?: string
  /**
   * Fuente de verdad seleccionada para speedMps en los cálculos.
   * 'z2'     = Z2 units × k (default actual)
   * 'vfd'    = VFD RPM × effectiveMpsPerRpm
   * 'tachShaft' = measuredShaftRpm × effectiveMpsPerRpm
   * 'tachLinear' = measuredBeltMps (medición directa)
   * 'manual' = valor ingresado manualmente en la tabla de cintas
   */
  truthSource?: 'z2' | 'vfd' | 'tachShaft' | 'tachLinear' | 'manual'
}

/**
 * Estado de calibración de un parámetro físico.
 * verified  = medido con instrumento (tachómetro, cinta métrica, cronómetro)
 * estimated = derivado de spec del fabricante o cálculo teórico
 * unknown   = no se tiene el dato, usar valor por defecto con cautela
 */
export type CalibrationStatus = 'verified' | 'estimated' | 'unknown'

/**
 * Datos del variador Danfoss y motoreductor de la cinta elevadora (Z-Belt).
 * Permite calcular la velocidad real de la cinta desde el setpoint RPM del variador.
 *
 * Fórmula: belt_speed_mps = (vfdCurrentRpm / gearRatio / 60) × π × (sprocketDiameterMm / 1000)
 *
 * Datos conocidos (2026-04-11):
 *   Motor: 1.5 kW, 1488 RPM nominal (placa del motor)
 *   Reducción: i = 24:1
 *   VFD Danfoss: setpoint 1400–1600 RPM en turno normal
 *   Sprocket: ~120 mm derivado (FALTA MEDIR con calibre)
 */
export interface ZetaBeltDrive {
  /** Velocidad nominal del motor (placa). Ref: 1488 RPM */
  motorNominalRpm: number
  /** Potencia del motor (placa). Ref: 1.5 kW */
  motorKw?: number
  /** Relación de reducción del motoreductor (i). Ref: 24 */
  gearRatio: number
  /**
   * Diámetro del sprocket o polea motriz en mm.
   * FALTA MEDIR: usar pie de metro/calibre en la polea de la cinta elevadora.
   * Valor derivado teórico: ~120 mm (calculado de 0.39 m/s @ 1488 RPM, i=24).
   */
  sprocketDiameterMm?: number
  /** RPM mínimo práctico del variador Danfoss. Ref: ~1400 RPM */
  vfdMinRpm?: number
  /** RPM máximo práctico del variador Danfoss. Ref: ~1600 RPM */
  vfdMaxRpm?: number
  /**
   * RPM actual que ingresa el operador al inicio del turno.
   * Leer de la pantalla del variador Danfoss.
   */
  vfdCurrentRpm?: number
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
  /**
   * Datos del variador Danfoss y motoreductor de la cinta elevadora (Z-Belt).
   * Ver interface ZetaBeltDrive para detalles.
   */
  zetaDrive?: ZetaBeltDrive
  /**
   * Tiempo de reset del cilindro neumático del flipper (segundos).
   * Tiempo desde que el salmón pasa el flipper hasta que el flipper
   * está listo para el siguiente pez.
   *
   * Estado: ESTIMADO en 0.45s.
   * Para MEDIR: cronometrar en planta a velocidad normal de turno.
   * Usado en insight #18 (timing Z2 entre gates adyacentes).
   */
  flipperResetTimeSec?: number
  /**
   * Espaciado promedio entre centros de peces en la cinta elevadora (metros).
   * Necesario para calcular el caudal (peces/min) desde la velocidad Z-Belt.
   *
   * Estado: DESCONOCIDO — medir en planta o derivar del Excel.
   * Forma de medir: contar peces/min en la salida de la elevadora a velocidad conocida.
   * Derivar del Excel: (total_piezas / duración_turno_min) / (zeta_speed / spacing)
   */
  avgFishSpacingOnZetaBeltM?: number
  /**
   * Configuración del sistema neumático para cálculo per-gate del tiempo
   * de respuesta del flipper. Si presente, reemplaza el `flipperResetTimeSec`
   * plano con un modelo físico que considera longitud de línea, caída de
   * presión y características del cilindro por cada gate individual.
   *
   * Ver `computePerGateResponseTime()` en graderGateTiming.ts para las fórmulas.
   */
  pneumaticConfig?: PneumaticConfig
  /**
   * Factor de conversión unidades Z2 → m/s.
   * Fórmula: velocidad_mps = z2Units * kFactor
   * Valor default en Marelec Z2: 0.000786 m/s por unidad.
   * Calibrar midiendo velocidad real y ajustando hasta que coincida.
   */
  kFactor?: number
  /**
   * Especie procesada. Determina los coeficientes alométricos usados para
   * estimar largo/ancho del producto a partir del peso mediano del lote.
   * - salar: Salmo salar (Salmón Atlántico)
   * - coho: Oncorhynchus kisutch (Salmón Coho/Plateado)
   */
  species?: 'salar' | 'coho'
  /**
   * Campos con sugerencia automática activa.
   * Cuando true, el valor se sincroniza automáticamente desde los datos del lote.
   */
  autoSuggestions?: {
    avgSalmonLengthCm?: boolean
    avgSalmonWidthCm?: boolean
  }

  // ── Timing flipper software Z2 ──────────────────────────────────────────
  /** Delay antes de activar el solenoide de apertura (ms). Z2: delayFlipperOpen. Default 150. */
  flipperDelayOpenMs?: number
  /** Tiempo mínimo que el flipper debe permanecer abierto (ms). Z2: minFlipperOpenTime. Default 350. */
  flipperMinOpenTimeMs?: number
  /** Delay antes de activar el solenoide de cierre (ms). Z2: delayFlipperClose. Default 150. */
  flipperDelayCloseMs?: number

  // ── Reset mecánico cilindro neumático ────────────────────────────────────
  /**
   * Tiempo de reset mecánico del cilindro neumático (segundos) — medido con slow-mo.
   * Distinto de flipperResetTimeSec (que es el tiempo usado en cálculos legacy).
   * Medir: Servicio → Probar salidas [8620], grabar 240fps, contar frames / fps.
   */
  flipperMechanicalResetS?: number
  /** Timestamp (ms epoch) de la última medición slow-mo del reset mecánico. */
  flipperMechanicalMeasuredAt?: number

  // ── Paleta flipper ───────────────────────────────────────────────────────
  /** Altura de la paleta sobre la cinta (mm). Afecta si el pez puede pasar por debajo. Default 0.5. */
  flipperHeightAboveBeltMm?: number

  // ── Gate/batch timing Z2 ────────────────────────────────────────────────
  /** Delay antes del cierre del gate de destino (ms). Z2: delayBeforeGateClose. Default 400. */
  delayBeforeGateCloseMs?: number
  /** Duración del pulso de cierre del gate (ms). Z2: delayGateClose. Default 500. */
  delayGateCloseMs?: number
  /** Tiempo mínimo que el gate debe estar abierto (ms). Z2: minGateOpen. Default 0. */
  minGateOpenMs?: number
  /** Peso máximo de un bin antes de cerrar automáticamente (g). Z2: maxBinWeight. Default 25000. */
  maxBinWeightG?: number
}

/**
 * Configuración del sistema neumático de la clasificadora.
 *
 * El manifold (bloque de electroválvulas) alimenta las 12 compuertas vía
 * tubos de poliuretano. Cada gate tiene una longitud de línea diferente,
 * lo que causa distintos tiempos de respuesta y caídas de presión.
 *
 * Modelo: t_respuesta(gate) = t_válvula + t_carga_línea(L) + t_carrera_cilindro(P_eff)
 */
export interface PneumaticConfig {
  /** Presión de suministro en el FRL (Filter-Regulator-Lubricator) en bar.
   *  Medir en el manómetro del regulador. Típico: 5-7 bar. */
  supplyPressureBar: number
  /** Tiempo de conmutación del solenoide de la electroválvula 5/2 en segundos.
   *  Dato del datasheet de la válvula. Típico: 0.020-0.050s. */
  valveSwitchTimeSec: number
  /** Diámetro INTERNO del tubo neumático en mm (no el OD).
   *  Tubo estándar 6mm OD = 4mm ID; 8mm OD = 5.5mm ID.
   *  Flujo escala con d⁴ → pequeños cambios tienen gran efecto. */
  tubeInnerDiameterMm: number
  /** Diámetro del bore (pistón) del cilindro del flipper en mm.
   *  Determina la fuerza de actuación: F = P × π(d/2)². Típico: 25-50mm. */
  cylinderBoreMm: number
  /** Carrera del cilindro (distancia de viaje del pistón) en mm.
   *  Típico para flippers de grader: 30-80mm. */
  cylinderStrokeMm: number
  /** Coeficiente de flujo de la electroválvula (Cv, adimensional).
   *  Dato del datasheet. Típico para válvulas 1/4": 0.5-1.2. */
  valveCv: number
  /** Factor de eficiencia del cilindro (fricción de sellos, carga).
   *  0.85 = típico para cilindros estándar con sellos nuevos.
   *  Bajar si hay fricción alta o sellos desgastados. */
  cylinderEfficiency?: number
  /** Largo de línea neumática desde el manifold hasta cada flipper (metros).
   *  Gate 1 = línea más corta (manifold cerca del sensor), Gate 12 = más larga.
   *  Medir en planta o estimar: ~1.5m + gateNumber × 1.5m. */
  gateLineLengthsM: Partial<Record<number, number>>
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
  shiftId: 'Turno día' | 'Turno noche';
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

  // ── Campos enriquecidos — generados por carga masiva histórica ──────────────
  /** Duración del turno en minutos (del primer al último registro) */
  durationMinutes?: number;
  /** Peso clasificado (gates 1-12) en kg */
  totalWeightKg?: number;
  /** Peso promedio por pieza en gramos */
  avgWeightGrams?: number;
  /** Piezas producidas por hora (excluye P0) */
  productionRatePerHour?: number;
  /** Top causas de P0 con conteo y % */
  topP0Causes?: Array<{ error: string; pieces: number; pct: number }>;
  /** Distribución por calibre (gates 1-12) */
  calibreDistribution?: Array<{ calibre: string; pieces: number; pct: number }>;
  /** Distribución por calidad (gates 1-12) */
  qualityDistribution?: Array<{ quality: string; pieces: number; pct: number }>;
  /** Distribución de piezas por gate */
  gateDistribution?: Array<{ gate: number; pieces: number; pct: number }>;
  /** Nombres de los archivos Excel fuente */
  sourceFileNames?: string[];
  /** ID del lote de carga masiva que generó este resumen */
  batchUploadId?: string;
  /** Si el segmento contiene registros PIEZA_PIEZA (para indicador de completitud) */
  hasPieceData?: boolean;
  /** Si el segmento contiene registros PUERTA_0 (para indicador de completitud) */
  hasGate0Data?: boolean;
  /**
   * Buckets por hora del día (0-23) con piezas totales y piezas P0.
   * Permite drill-down "dentro del turno" en el gráfico de tendencia
   * sin tener que re-parsear el Excel original.
   * Solo incluye horas con actividad.
   */
  hourlyBuckets?: Array<{
    /** Hora del día en formato HH (0-23) */
    hour: number;
    totalPieces: number;
    p0Pieces: number;
  }>;
  // NOTA: Los agregados por minuto para el timeline chart NO viven en este
  // doc. Están en la sub-collection `graderDailySummaries/{id}/meta/timeline`
  // (ver saveTimelineAggregates / loadTimelineAggregates). Motivo: las queries
  // por rango (listDailySummariesByRange) descargarían ~60 KB por summary si
  // estuvieran acá, haciendo que el calendario y la vista de período bajen
  // 10× más data de la necesaria. El cliente web Firestore no soporta
  // field projection, por eso van en sub-coll separada.
}

/**
 * Bucket pre-computed por minuto para el timeline chart.
 * Contiene todas las señales que el `GraderTimelineChart` necesita para
 * renderizar sus 7 capas (pesos, p0%, errores, producción, gates, etc.)
 * sin tocar los `pieceRecords` raw.
 *
 * Se persiste en `graderDailySummaries/{id}/meta/timeline` (sub-collection),
 * NO en el doc del summary, para evitar inflar las queries por rango.
 */
export interface TimelineBucket {
  /** Inicio del minuto en ISO (truncado: `YYYY-MM-DDTHH:MM:00.000Z`) */
  tsMin: string;
  /** Piezas totales en el minuto (incluye P0) */
  pieces: number;
  /** Piezas P0 (gate 0) en el minuto */
  p0Pieces: number;
  /** Peso total producción (kg) — solo gates 1-12 con peso válido */
  weightKg?: number;
  /** Cuántas piezas aportaron peso válido (para promediar) */
  weightCount?: number;
  /** Peso min por pieza (gramos) */
  weightMinGrams?: number;
  /** Peso mediano por pieza (gramos) */
  weightP50Grams?: number;
  /** Peso max por pieza (gramos) */
  weightMaxGrams?: number;
  /**
   * Conteo de piezas P0 por tipo de error.
   * Key = error string normalizado, value = piezas.
   * Usar para renderizar markLines y tooltip de errores en el timeline.
   */
  errorCounts?: Record<string, number>;
  /**
   * Piezas por gate (solo gates productivos 1-12).
   * Key = gate number como string (Firestore no acepta number keys).
   * Se usa para el stacked area chart de gates a lo largo del turno.
   */
  gateCounts?: Record<string, number>;
  /** Calibre dominante del minuto (el más frecuente) */
  dominantCalibre?: string;
  /**
   * Lote dominante del minuto (más frecuente).
   * Cambios entre minutos consecutivos marcan un cambio de lote en el chart.
   */
  lot?: string;
}

// ============================================================================
// CONFIGURACIÓN DE GATES
// ============================================================================

export interface GateAssignment {
  gateNumber: number; // 1..12
  assignedQuality: GraderQuality;
  assignedCalibre: CalibreRange;
  active: boolean;
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
    /** Margen timing semáforo verde (segundos). Default: 0.5 */
    timingMarginOkSec?: number;
    /** Margen timing semáforo amarillo (segundos). Default: 0.15 */
    timingMarginWarnSec?: number;
    /** Umbral gate sobrecargada warn (%). Default: 35 */
    gateOverloadWarnPct?: number;
    /** Umbral gate sobrecargada critical (%). Default: 50 */
    gateOverloadCriticalPct?: number;
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
  /** Turno leído directo de la columna "Turno" del Excel (ej: "A", "B", "Turno A") */
  shift?: string;
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
  /** Turno leído directo de la columna "Turno" del Excel (ej: "A", "B", "Turno A") */
  shift?: string;
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
