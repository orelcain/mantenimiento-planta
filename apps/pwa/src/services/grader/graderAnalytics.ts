/**
 * Motor de analítica del módulo Grader.
 *
 * Calcula KPIs, distribuciones, series temporales, balance de gates,
 * y matriz Calidad×Calibre a partir de los datos parseados.
 */

import type {
  ParsedMatrixData,
  GraderAnalysisConfig,
  GateAssignment,
  GraderAnalyticsResult,
  KPIBlock,
  DistributionRow,
  TimeSeriesPoint,
  GateBalanceInsight,
  CalibreRange,
  GraderQuality,
  PointZeroCause,
  PointZeroCauseBreakdown,
  PointZeroClassification,
  PointZeroHierarchyRow,
  CalibreWeightRange,
  OutOfRangeWeightDetail,
  Gate0Record,
  PointZeroDrillRecord,
  LotAnalysis,
  WeightTrendBucket,
  MatrixQCEnhanced,
  GateAdvancedStats,
  GateSwapSuggestion,
} from './types'

import {
  median as calcMedian,
  stdDev as calcStdDev,
  mean as calcMean,
  movingAverage,
  herfindahlIndex,
  coefficientOfVariation,
  round,
} from './graderStats'

// ============================================================================
// CONSTANTES — RANGOS DE CALIBRE POR PESO
// ============================================================================

/** Rangos de peso en gramos para cada calibre (datos de la tabla de calibración) */
export const CALIBRE_WEIGHT_RANGES: CalibreWeightRange[] = [
  { calibre: '0-2 lb',   label: '0-2 lb (0–916 g)',       minGrams: 0,    maxGrams: 916  },
  { calibre: '2-4 lb',   label: '2-4 lb (916–1833 g)',    minGrams: 916,  maxGrams: 1833 },
  { calibre: '4-6 lb',   label: '4-6 lb (1833–2749 g)',   minGrams: 1833, maxGrams: 2749 },
  { calibre: '6-8 lb',   label: '6-8 lb (2749–3665 g)',   minGrams: 2749, maxGrams: 3665 },
  { calibre: '8-10 lb',  label: '8-10 lb (3665–4581 g)',  minGrams: 3665, maxGrams: 4581 },
  { calibre: '10-12 lb', label: '10+ lb (4581–9163 g)',   minGrams: 4581, maxGrams: 9163 },
]

/** Causas estandarizadas con labels y descripciones */
const CAUSE_META: Record<PointZeroCause, { label: string; description: string }> = {
  fuera_de_rango:       { label: 'Fuera de rango',          description: 'Pieza con peso fuera de los rangos de calibre definidos' },
  fuera_de_limites:     { label: 'Fuera de límites',        description: 'Pieza fuera de dimensiones o parámetros del sistema' },
  no_leido_fotocelula:  { label: 'No leído por fotocélula', description: 'Sensor óptico no detectó correctamente la pieza' },
  too_close_too_long:   { label: 'Too close or too long',   description: 'Piezas demasiado cerca entre sí o longitud fuera de rango' },
  puerta_no_preparada:  { label: 'Puerta no preparada',     description: 'Compuerta no estaba lista al momento de operar' },
  otro:                 { label: 'Otro / Desconocido',      description: 'Causa no clasificada en las categorías estándar' },
}

// ============================================================================
// HELPERS
// ============================================================================

function pct(part: number, total: number): number {
  if (total === 0) return 0
  return Math.round((part / total) * 10000) / 100
}

function bucketKey(isoTs: string, intervalMinutes: number): string {
  const d = new Date(isoTs)
  if (isNaN(d.getTime())) return isoTs
  const mins = d.getMinutes()
  const bucketed = new Date(d)
  bucketed.setMinutes(Math.floor(mins / intervalMinutes) * intervalMinutes, 0, 0)
  return bucketed.toISOString()
}

// ============================================================================
// CLASIFICACIÓN PUNTO CERO
// ============================================================================

/** Clasifica un string de error en una causa estandarizada */
function classifyError(error: string): PointZeroCause {
  const s = error.toLowerCase().trim()

  // Fuera de rango / Out of range
  if (s.includes('fuera de rango') || s.includes('out of range') || s.includes('fuera de rangos')
    || s.includes('fuera rango') || s.includes('out range')) {
    return 'fuera_de_rango'
  }

  // Fuera de límites / Out of limits
  if (s.includes('fuera de limite') || s.includes('fuera de límite') || s.includes('out of limit')
    || s.includes('fuera limites') || s.includes('fuera límites')) {
    return 'fuera_de_limites'
  }

  // No leído por fotocélula / Not read by photocell
  if (s.includes('fotoc') || s.includes('photocell') || s.includes('no leido')
    || s.includes('no leído') || s.includes('not read') || s.includes('fotocelula')
    || s.includes('fotocélula')) {
    return 'no_leido_fotocelula'
  }

  // Too close or too long
  if (s.includes('too close') || s.includes('too long') || s.includes('demasiado cerca')
    || s.includes('demasiado largo') || s.includes('close or') || s.includes('too short')) {
    return 'too_close_too_long'
  }

  // Puerta no preparada / Door not ready / Gate not ready
  if (s.includes('puerta no preparada') || s.includes('puerta no lista')
    || s.includes('door not ready') || s.includes('gate not ready')
    || s.includes('not ready') || s.includes('no preparada')) {
    return 'puerta_no_preparada'
  }

  return 'otro'
}

/**
 * Construye la clasificación completa del 100% del Punto Cero.
 * Agrupa Gate0Records por causa estandarizada y, para "fuera_de_rango"
 * con datos de peso, calcula a qué calibre pertenecerían.
 *
 * v2.46.1 — Re-clasifica errores inferidos tomando en cuenta los gates
 * activos: si no hay gate activo para un calibre, la pieza se considera
 * "Fuera de Rango" en vez de "Fuera de límites".
 */
function computePointZeroClassification(
  g0Records: Array<Gate0Record | (Gate0Record & { error: string })>,
  totalPieces: number,
  pointZeroPieces: number,
  activeGates?: GateAssignment[],
  weightRanges: CalibreWeightRange[] = CALIBRE_WEIGHT_RANGES,
  hasRealP0Data = false,
): PointZeroClassification {
  // Calibres con al menos un gate activo
  const activeCalibres = new Set<string>(
    (activeGates || [])
      .filter((g) => g.active)
      .map((g) => g.assignedCalibre),
  )

  // Agrupar por causa — con re-clasificación inteligente usando gates activos
  const causeMap = new Map<PointZeroCause, { pieces: number; weightKg: number; records: typeof g0Records }>()

  function inferCauseFromWeight(r: Gate0Record | (Gate0Record & { error: string })): PointZeroCause {
    let perPieceG = ('weightPerPieceGrams' in r) ? (r as any).weightPerPieceGrams : undefined
    if (!perPieceG && r.weightKg && r.pieces > 0) {
      perPieceG = (r.weightKg / r.pieces) * 1000
    }
    if (perPieceG == null || perPieceG < 10) return 'no_leido_fotocelula'

    const matchedRange = weightRanges.find(
      (rng) => perPieceG >= rng.minGrams && perPieceG < rng.maxGrams,
    )
    if (!matchedRange) return 'fuera_de_rango'
    // Si hay gates activos configurados, usar eso como referencia
    if (activeCalibres.size > 0 && !activeCalibres.has(matchedRange.calibre)) return 'fuera_de_rango'
    return 'fuera_de_limites'
  }

  for (const r of g0Records) {
    const errorStr = 'error' in r ? r.error : 'Desconocido'
    let cause = classifyError(errorStr)

    // Reglas de clasificación estricta: no dejar "otro".
    // Si el error viene vacío/desconocido o no calza en categorías estándar,
    // inferir por peso/rangos para que el desglose sea 100% siempre.
    if (cause === 'otro') {
      cause = inferCauseFromWeight(r)
    }

    // Re-clasificar "fuera_de_limites" si no hay gate activo para su calibre
    // Solo para datos inferidos — cuando hay P0 real, confiamos en la columna Error
    if (!hasRealP0Data && cause === 'fuera_de_limites' && activeCalibres.size > 0) {
      // Determinar calibre real por peso
      let perPieceG = ('weightPerPieceGrams' in r) ? (r as any).weightPerPieceGrams : undefined
      if (!perPieceG && r.weightKg && r.pieces > 0) {
        perPieceG = (r.weightKg / r.pieces) * 1000
      }
      if (perPieceG && perPieceG > 0) {
        const matchedRange = weightRanges.find(
          (rng) => perPieceG >= rng.minGrams && perPieceG < rng.maxGrams,
        )
        if (matchedRange && !activeCalibres.has(matchedRange.calibre)) {
          // Peso cae en un calibre sin gate activo → es "fuera de rango" del configurado
          cause = 'fuera_de_rango'
        }
      }
    }

    // Re-clasificar piezas sin peso como "no leído por fotocélula"
    // Solo para datos inferidos — cuando hay P0 real, respetar columna Error
    if (!hasRealP0Data && (cause === 'otro' || cause === 'fuera_de_limites' || cause === 'fuera_de_rango')) {
      let perPieceG = ('weightPerPieceGrams' in r) ? (r as any).weightPerPieceGrams : undefined
      if (!perPieceG && r.weightKg && r.pieces > 0) {
        perPieceG = (r.weightKg / r.pieces) * 1000
      }
      if (perPieceG == null || perPieceG < 10) {
        cause = 'no_leido_fotocelula'
      }
    }

    const cur = causeMap.get(cause) || { pieces: 0, weightKg: 0, records: [] }
    cur.pieces += r.pieces
    cur.weightKg += r.weightKg ?? 0
    cur.records.push(r)
    causeMap.set(cause, cur)
  }

  // Construir breakdown ordenado por piezas desc
  const allCauses: PointZeroCause[] = [
    'fuera_de_rango', 'fuera_de_limites', 'no_leido_fotocelula',
    'too_close_too_long', 'puerta_no_preparada', 'otro',
  ]

  const causes: PointZeroCauseBreakdown[] = allCauses
    .map((cause) => {
      const data = causeMap.get(cause)
      const meta = CAUSE_META[cause]

      // Build drill-down records from raw gate0 records
      const drillRecords: PointZeroDrillRecord[] = (data?.records ?? []).map((r) => ({
        ts: r.ts,
        pieces: r.pieces,
        weightKg: r.weightKg,
        weightPerPieceGrams: ('weightPerPieceGrams' in r) ? (r as any).weightPerPieceGrams : undefined,
        error: 'error' in r ? (r as any).error : 'Desconocido',
        quality: r.quality,
        calibre: r.calibre,
        lot: r.lot,
      }))

      return {
        cause,
        label: meta.label,
        description: meta.description,
        pieces: data?.pieces ?? 0,
        pctOfPointZero: pointZeroPieces > 0 ? pct(data?.pieces ?? 0, pointZeroPieces) : 0,
        pctOfTotal: totalPieces > 0 ? pct(data?.pieces ?? 0, totalPieces) : 0,
        weightKg: data?.weightKg || undefined,
        records: drillRecords.length > 0 ? drillRecords : undefined,
      }
    })
    .sort((a, b) => b.pieces - a.pieces)

  // Desglose de "fuera de rango" por peso → calibre
  const outOfRangeByWeight: OutOfRangeWeightDetail[] = []
  const fueraDeRangoData = causeMap.get('fuera_de_rango')

  if (fueraDeRangoData && fueraDeRangoData.records.length > 0) {
    const weightBuckets = new Map<string, { pieces: number; weightKg: number }>()

    for (const r of fueraDeRangoData.records) {
      const piecesW = r.pieces

      let rangeLabel: string
      // Prefer per-piece weight in grams if available
      let perPieceGCandidate = ('weightPerPieceGrams' in r) ? (r as any).weightPerPieceGrams : undefined
      if (!perPieceGCandidate && r.weightKg && r.pieces > 0) {
        perPieceGCandidate = (r.weightKg / r.pieces) * 1000
      }
      if (!perPieceGCandidate || perPieceGCandidate <= 0) {
        rangeLabel = 'Sin dato de peso'
      } else {
        // Peso por pieza en gramos
        const perPieceG = perPieceGCandidate
        const matched = weightRanges.find(
          (rng) => perPieceG >= rng.minGrams && perPieceG < rng.maxGrams,
        )
        if (matched) {
          rangeLabel = matched.label
        } else if (perPieceG < 0) {
          rangeLabel = 'Peso negativo (error)'
        } else if (perPieceG >= 9163) {
          rangeLabel = 'Sobre 10+ lb (> 9163 g)'
        } else {
          rangeLabel = 'Sin clasificar'
        }
      }

      const cur = weightBuckets.get(rangeLabel) || { pieces: 0, weightKg: 0 }
      cur.pieces += piecesW
      cur.weightKg += r.weightKg ?? 0
      weightBuckets.set(rangeLabel, cur)
    }

    const fueraTotal = fueraDeRangoData.pieces
    for (const [rangeLabel, v] of Array.from(weightBuckets.entries()).sort((a, b) => b[1].pieces - a[1].pieces)) {
      outOfRangeByWeight.push({
        rangeLabel,
        pieces: v.pieces,
        pct: pct(v.pieces, fueraTotal),
        weightKg: v.weightKg || undefined,
      })
    }
  }

  // ——————— TABLA PIVOTE: Error × Calidad × Calibre ———————
  const hierarchyMap = new Map<string, { cause: PointZeroCause; causeLabel: string; quality: string; calibre: string; pieces: number; weightKg: number }>()

  for (const r of g0Records) {
    const errorStr = 'error' in r ? r.error : 'Desconocido'
    let cause = classifyError(errorStr)

    // Re-clasificar igual que arriba para coherencia
    let perPieceG = ('weightPerPieceGrams' in r) ? (r as any).weightPerPieceGrams : undefined
    if (!perPieceG && r.weightKg && r.pieces > 0) {
      perPieceG = (r.weightKg / r.pieces) * 1000
    }

    if (!hasRealP0Data && cause === 'fuera_de_limites' && activeCalibres.size > 0 && perPieceG && perPieceG > 0) {
      const matchedRange = weightRanges.find(
        (rng) => perPieceG >= rng.minGrams && perPieceG < rng.maxGrams,
      )
      if (matchedRange && !activeCalibres.has(matchedRange.calibre)) {
        cause = 'fuera_de_rango'
      }
    }
    if (!hasRealP0Data && (cause === 'otro' || cause === 'fuera_de_limites' || cause === 'fuera_de_rango') && (perPieceG == null || perPieceG < 10)) {
      cause = 'no_leido_fotocelula'
    }

    const meta = CAUSE_META[cause]
    const quality = r.quality || 'Unknown'

    // Determine display calibre: use per-piece weight to compute actual calibre
    let displayCalibre: string

    if (perPieceG && perPieceG > 0) {
      const matchedRange = weightRanges.find(
        (rng) => perPieceG >= rng.minGrams && perPieceG < rng.maxGrams,
      )
      if (matchedRange) {
        displayCalibre = `HG ${matchedRange.calibre.replace(' lb', '')}`
      } else {
        displayCalibre = 'Fuera de Rango'
      }
    } else {
      // Fallback to raw calibre from Excel
      const rawCalibre = r.raw?.rawCalibre as string | undefined
      if (rawCalibre && rawCalibre !== 'Sin dato') {
        displayCalibre = rawCalibre
      } else if (r.calibre && r.calibre !== 'Other') {
        displayCalibre = `HG ${r.calibre.replace(' lb', '')}`
      } else {
        displayCalibre = 'Sin dato'
      }
    }

    const key = `${cause}|${quality}|${displayCalibre}`
    const cur = hierarchyMap.get(key) || { cause, causeLabel: meta.label, quality, calibre: displayCalibre, pieces: 0, weightKg: 0 }
    cur.pieces += r.pieces
    cur.weightKg += r.weightKg ?? 0
    hierarchyMap.set(key, cur)
  }

  const hierarchy: PointZeroHierarchyRow[] = Array.from(hierarchyMap.values())
    .map((v) => ({
      error: v.causeLabel,
      errorCause: v.cause,
      quality: v.quality,
      calibre: v.calibre,
      pieces: v.pieces,
      pctOfPointZero: pct(v.pieces, pointZeroPieces),
      pctOfTotal: pct(v.pieces, totalPieces),
      weightKg: v.weightKg || undefined,
    }))
    .sort((a, b) => {
      // Sort by error label, then quality, then calibre
      if (a.error !== b.error) return a.error.localeCompare(b.error)
      if (a.quality !== b.quality) return a.quality.localeCompare(b.quality)
      return b.pieces - a.pieces
    })

  return {
    totalPointZeroPieces: pointZeroPieces,
    causes,
    hierarchy,
    outOfRangeByWeight,
    calibreWeightRanges: weightRanges,
  }
}

// ============================================================================
// MAIN FUNCTION
// ============================================================================

export function computeAnalytics(
  data: ParsedMatrixData,
  config: GraderAnalysisConfig,
  gates: GateAssignment[],
): GraderAnalyticsResult {
  const notes: string[] = []
  const interval = config.intervalMinutes ?? 15

  // Rangos de peso: custom (editados por usuario) o default
  const weightRanges = config.customWeightRanges && config.customWeightRanges.length > 0
    ? config.customWeightRanges
    : CALIBRE_WEIGHT_RANGES

  // ——————— TOTALES ———————
  // PP (pieceRecords) = FUENTE DE VERDAD para TODOS los conteos.
  // Incluye gates 1-12 y gate 0. El total del PP ES el total real de la máquina.
  // gate0Records = SOLO para clasificación de errores (por qué fueron a gate 0).
  // NUNCA se suman al total (ya están contados en pieceRecords).
  const hasPiece = data.pieceRecords.length > 0
  const hasG0 = data.gate0Records.length > 0
  const hasProdSummary = data.productionSummary.length > 0

  let totalPieces = 0
  let totalWeightKg = 0
  let pointZeroPieces = 0
  let pointZeroWeightKg = 0

  if (hasPiece) {
    for (const r of data.pieceRecords) {
      totalPieces += r.pieces
      totalWeightKg += r.weightKg ?? 0
      // Contar gate=0 para el porcentaje de punto cero
      if (r.gate === 0) {
        pointZeroPieces += r.pieces
        pointZeroWeightKg += r.weightKg ?? 0
      }
    }
  } else if (hasProdSummary) {
    for (const r of data.productionSummary) {
      totalPieces += r.pieces
      totalWeightKg += r.weightKg ?? 0
    }
    notes.push('Totales calculados desde resumen de producción (sin detalle pieza-pieza).')
  } else if (data.folioRecords.length > 0) {
    for (const r of data.folioRecords) {
      totalPieces += r.pieces ?? 0
      totalWeightKg += r.weightKg ?? 0
    }
    notes.push('Totales calculados desde registros por folio.')
  }

  // gate0Records NO se suma al total — solo es para clasificación de errores
  const errorMap = new Map<string, { pieces: number; weightKg: number }>()

  const g0Source = hasG0
    ? data.gate0Records
    : data.pieceRecords
        .filter((r) => r.gate === 0)
        .map((r) => ({ ...r, error: 'Sin clasificar (inferido)' }))

  for (const r of g0Source) {
    const key = 'error' in r ? r.error : 'Sin clasificar'
    const cur = errorMap.get(key) || { pieces: 0, weightKg: 0 }
    cur.pieces += r.pieces
    cur.weightKg += r.weightKg ?? 0
    errorMap.set(key, cur)
  }

  const pointZeroByError = Array.from(errorMap.entries())
    .map(([error, v]) => ({
      error,
      pieces: v.pieces,
      pct: pct(v.pieces, totalPieces),
      weightKg: v.weightKg || undefined,
    }))
    .sort((a, b) => b.pieces - a.pieces)

  const topPointZeroErrors = pointZeroByError.slice(0, 5).map(({ error, pieces, pct: p }) => ({
    error,
    pieces,
    pct: p,
  }))

  // Detectar si los datos P0 vienen de un archivo real (con columna Error)
  const hasRealP0Data = data.files.some((f) => f.kind === 'PUERTA_0')

  // ——————— CLASIFICACIÓN PUNTO CERO (100%) ———————
  const pointZeroClassification = computePointZeroClassification(
    g0Source as Gate0Record[],
    totalPieces,
    pointZeroPieces,
    gates,
    weightRanges,
    hasRealP0Data,
  )

  // ——————— DISTRIBUCIÓN POR CALIBRE ———————
  const calibreMap = new Map<string, { pieces: number; weightKg: number }>()

  if (hasPiece) {
    for (const r of data.pieceRecords) {
      if (r.gate === 0) continue // exclude gate 0
      const key = r.calibre || 'Other'
      const cur = calibreMap.get(key) || { pieces: 0, weightKg: 0 }
      cur.pieces += r.pieces
      cur.weightKg += r.weightKg ?? 0
      calibreMap.set(key, cur)
    }
  } else if (hasProdSummary) {
    for (const r of data.productionSummary) {
      const key = r.calibre || 'Other'
      const cur = calibreMap.get(key) || { pieces: 0, weightKg: 0 }
      cur.pieces += r.pieces
      cur.weightKg += r.weightKg ?? 0
      calibreMap.set(key, cur)
    }
  }

  const productivePieces = Array.from(calibreMap.values()).reduce((s, v) => s + v.pieces, 0)

  const distributionByCalibre: DistributionRow[] = Array.from(calibreMap.entries())
    .map(([key, v]) => ({
      key,
      pieces: v.pieces,
      pct: pct(v.pieces, productivePieces || totalPieces),
      weightKg: v.weightKg || undefined,
    }))
    .sort((a, b) => b.pieces - a.pieces)

  // ——————— DISTRIBUCIÓN POR CALIDAD ———————
  const qualityMap = new Map<string, { pieces: number; weightKg: number }>()

  if (hasPiece) {
    for (const r of data.pieceRecords) {
      if (r.gate === 0) continue
      const key = r.quality || 'Unknown'
      const cur = qualityMap.get(key) || { pieces: 0, weightKg: 0 }
      cur.pieces += r.pieces
      cur.weightKg += r.weightKg ?? 0
      qualityMap.set(key, cur)
    }
  } else if (data.qualitySummary.length > 0) {
    for (const r of data.qualitySummary) {
      const key = r.quality || 'Unknown'
      const cur = qualityMap.get(key) || { pieces: 0, weightKg: 0 }
      cur.pieces += r.pieces
      cur.weightKg += r.weightKg ?? 0
      qualityMap.set(key, cur)
    }
  }

  const distributionByQuality: DistributionRow[] = Array.from(qualityMap.entries())
    .map(([key, v]) => ({
      key,
      pieces: v.pieces,
      pct: pct(v.pieces, productivePieces || totalPieces),
      weightKg: v.weightKg || undefined,
    }))
    .sort((a, b) => b.pieces - a.pieces)

  // ——————— DOMINANT ———————
  const topCalibre = distributionByCalibre[0]
  const dominantCalibre = topCalibre
    ? {
        calibre: topCalibre.key as CalibreRange,
        pct: topCalibre.pct,
        pieces: topCalibre.pieces,
      }
    : undefined

  const topQuality = distributionByQuality[0]
  const dominantQuality = topQuality
    ? {
        quality: topQuality.key as GraderQuality,
        pct: topQuality.pct,
        pieces: topQuality.pieces,
      }
    : undefined

  // ——————— MATRIX QUALITY × CALIBRE ———————
  const matrix: Record<string, Record<string, { pieces: number; pct: number }>> = {}

  if (hasPiece) {
    for (const r of data.pieceRecords) {
      if (r.gate === 0) continue
      const q = r.quality || 'Unknown'
      const c = r.calibre || 'Other'
      if (!matrix[q]) matrix[q] = {}
      if (!matrix[q][c]) matrix[q][c] = { pieces: 0, pct: 0 }
      matrix[q][c].pieces += r.pieces
    }
  } else if (data.qualitySummary.length > 0) {
    for (const r of data.qualitySummary) {
      const q = r.quality || 'Unknown'
      const c = r.calibre || 'Other'
      if (!matrix[q]) matrix[q] = {}
      if (!matrix[q][c]) matrix[q][c] = { pieces: 0, pct: 0 }
      matrix[q][c].pieces += r.pieces
    }
  }

  // Calculate % in matrix
  const matrixTotal = Object.values(matrix).reduce(
    (sum, row) => sum + Object.values(row).reduce((s, cell) => s + cell.pieces, 0),
    0,
  )
  for (const q of Object.keys(matrix)) {
    const row = matrix[q]
    if (!row) continue
    for (const c of Object.keys(row)) {
      const cell = row[c]
      if (cell) cell.pct = pct(cell.pieces, matrixTotal)
    }
  }

  // ——————— SERIE TEMPORAL PUNTO CERO ———————
  const tsBuckets = new Map<string, { g0: number; total: number }>()

  if (hasPiece) {
    for (const r of data.pieceRecords) {
      const bk = bucketKey(r.ts, interval)
      const cur = tsBuckets.get(bk) || { g0: 0, total: 0 }
      cur.total += r.pieces
      if (r.gate === 0) cur.g0 += r.pieces
      tsBuckets.set(bk, cur)
    }
  }

  if (hasG0 && !hasPiece) {
    for (const r of data.gate0Records) {
      const bk = bucketKey(r.ts, interval)
      const cur = tsBuckets.get(bk) || { g0: 0, total: 0 }
      cur.g0 += r.pieces
      tsBuckets.set(bk, cur)
    }
  }
  // Si hay pieceRecords (PP), NO sumar gate0Records: representan las mismas piezas.

  const timeSeriesPointZero: TimeSeriesPoint[] = Array.from(tsBuckets.entries())
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([bucketStart, v]) => ({
      bucketStart,
      pointZeroPieces: v.g0,
      pointZeroPct: v.total > 0 ? pct(v.g0, v.total) : undefined,
      totalPieces: v.total || undefined,
    }))

  // ——————— BALANCE DE GATES (con asignación ideal) ———————
  const activeGates = gates.filter((g) => g.active)
  const totalActive = activeGates.length
  const gateBalance: GateBalanceInsight[] = []

  // Largest-remainder method para asignación ideal proporcional a demanda
  const idealRaw = distributionByCalibre.map((d) => ({
    calibre: d.key as CalibreRange,
    demandPct: d.pct,
    exact: (d.pct / 100) * totalActive,
    floor: Math.floor((d.pct / 100) * totalActive),
    remainder: ((d.pct / 100) * totalActive) % 1,
  }))
  let totalFloor = idealRaw.reduce((s, r) => s + r.floor, 0)
  const sorted = [...idealRaw].sort((a, b) => b.remainder - a.remainder)
  for (const r of sorted) {
    if (totalFloor >= totalActive) break
    r.floor += 1
    totalFloor += 1
  }
  const idealMap = new Map(idealRaw.map((r) => [r.calibre, r.floor]))

  for (const dist of distributionByCalibre) {
    const calibre = dist.key as CalibreRange
    const assigned = activeGates.filter((g) => g.assignedCalibre === calibre).length
    const ideal = idealMap.get(calibre) ?? 0
    const gap = ideal - assigned // positivo = déficit

    let severity: 'info' | 'warn' | 'critical' = 'info'
    let message = `Calibre ${calibre}: ${dist.pct}% demanda, ${assigned}/${ideal} gate(s).`

    if (gap >= 2) {
      severity = 'critical'
      message = `Déficit de ${gap} gate(s): demanda ${dist.pct}% necesita ~${ideal} pero tiene ${assigned}. Alto riesgo de congestión.`
    } else if (gap === 1 && dist.pct >= 15) {
      severity = 'warn'
      message = `Falta 1 gate: demanda ${dist.pct}% necesita ~${ideal} pero tiene ${assigned}. Esperas potenciales.`
    } else if (gap <= -2) {
      severity = 'info'
      message = `Superávit de ${-gap} gate(s): demanda ${dist.pct}% necesita ~${ideal} pero tiene ${assigned}. Podría liberar gates.`
    } else if (gap === -1 && dist.pct < 10) {
      severity = 'info'
      message = `Calibre ${calibre} solo ${dist.pct}% demanda pero ${assigned} gates (ideal: ${ideal}): podría liberar 1 gate.`
    }

    gateBalance.push({ calibre, demandPct: dist.pct, gatesAssigned: assigned, idealGates: ideal, gap, severity, message })
  }

  // Allocation quality score (100 = perfect proportional match)
  let allocationScore = 100
  if (totalActive > 0) {
    const totalDeviation = gateBalance.reduce((sum, gb) => {
      const currentPct = (gb.gatesAssigned / totalActive) * 100
      return sum + Math.abs(currentPct - gb.demandPct)
    }, 0)
    allocationScore = round(Math.max(0, 100 - totalDeviation / 2))
  }

  // ——————— ANÁLISIS POR LOTE ———————
  const lotAnalysis: LotAnalysis[] = []
  if (hasPiece) {
    const lotMap = new Map<string, { pieces: number; g0Pieces: number; weightKg: number; weights: number[]; timestamps: string[]; calibres: Map<string, number>; qualities: Map<string, number> }>()

    for (const r of data.pieceRecords) {
      const lotKey = r.lot || 'Sin lote'
      const cur = lotMap.get(lotKey) || { pieces: 0, g0Pieces: 0, weightKg: 0, weights: [] as number[], timestamps: [] as string[], calibres: new Map<string, number>(), qualities: new Map<string, number>() }
      cur.pieces += r.pieces
      if (r.gate === 0) cur.g0Pieces += r.pieces
      cur.weightKg += r.weightKg ?? 0
      cur.timestamps.push(r.ts)

      // Collect per-piece weights for statistics
      const wpg = r.weightPerPieceGrams ?? (r.weightKg && r.pieces > 0 ? (r.weightKg / r.pieces) * 1000 : undefined)
      if (wpg && wpg > 0) {
        for (let i = 0; i < r.pieces; i++) cur.weights.push(wpg)
      }

      if (r.gate !== 0) {
        const cKey = r.calibre || 'Other'
        cur.calibres.set(cKey, (cur.calibres.get(cKey) || 0) + r.pieces)
        const qKey = r.quality || 'Unknown'
        cur.qualities.set(qKey, (cur.qualities.get(qKey) || 0) + r.pieces)
      }
      lotMap.set(lotKey, cur)
    }

    for (const [lot, d] of lotMap) {
      const prodPieces = d.pieces - d.g0Pieces
      const tsSorted = [...d.timestamps].sort()
      const calDist: DistributionRow[] = Array.from(d.calibres.entries())
        .map(([key, p]) => ({ key, pieces: p, pct: pct(p, prodPieces || d.pieces) }))
        .sort((a, b) => b.pieces - a.pieces)
      const qualDist: DistributionRow[] = Array.from(d.qualities.entries())
        .map(([key, p]) => ({ key, pieces: p, pct: pct(p, prodPieces || d.pieces) }))
        .sort((a, b) => b.pieces - a.pieces)

      lotAnalysis.push({
        lot,
        firstSeen: tsSorted[0] || '',
        lastSeen: tsSorted[tsSorted.length - 1] || '',
        pieces: d.pieces,
        weightKg: d.weightKg,
        avgWeightGrams: d.weights.length > 0 ? round(calcMean(d.weights)) : 0,
        medianWeightGrams: d.weights.length > 0 ? round(calcMedian(d.weights)) : 0,
        stdDevWeightGrams: d.weights.length > 1 ? round(calcStdDev(d.weights)) : 0,
        pointZeroPieces: d.g0Pieces,
        pointZeroPct: pct(d.g0Pieces, d.pieces),
        calibreDistribution: calDist,
        qualityDistribution: qualDist,
      })
    }
    lotAnalysis.sort((a, b) => a.firstSeen.localeCompare(b.firstSeen))
  }

  // ——————— TENDENCIA DE PESO EN EL TIEMPO ———————
  const weightTrendSeries: WeightTrendBucket[] = []
  if (hasPiece) {
    const wtBuckets = new Map<string, { weights: number[]; pieces: number; lots: Map<string, number> }>()

    for (const r of data.pieceRecords) {
      if (r.gate === 0) continue
      const bk = bucketKey(r.ts, interval)
      const cur = wtBuckets.get(bk) || { weights: [] as number[], pieces: 0, lots: new Map<string, number>() }
      cur.pieces += r.pieces
      const wpg = r.weightPerPieceGrams ?? (r.weightKg && r.pieces > 0 ? (r.weightKg / r.pieces) * 1000 : undefined)
      if (wpg && wpg > 0) {
        for (let i = 0; i < r.pieces; i++) cur.weights.push(wpg)
      }
      const lotKey = r.lot || 'Sin lote'
      cur.lots.set(lotKey, (cur.lots.get(lotKey) || 0) + r.pieces)
      wtBuckets.set(bk, cur)
    }

    const sortedKeys = Array.from(wtBuckets.keys()).sort()
    const avgValues: number[] = []

    for (const bk of sortedKeys) {
      const d = wtBuckets.get(bk)!
      if (d.weights.length === 0) continue
      const avg = round(calcMean(d.weights))
      avgValues.push(avg)
      // Find dominant lot
      let domLot: string | undefined
      let maxLotPieces = 0
      for (const [l, p] of d.lots) {
        if (p > maxLotPieces) { maxLotPieces = p; domLot = l }
      }
      weightTrendSeries.push({
        bucketStart: bk,
        avgWeightGrams: avg,
        medianWeightGrams: round(calcMedian(d.weights)),
        stdDevWeightGrams: round(calcStdDev(d.weights)),
        pieces: d.pieces,
        dominantLot: domLot,
      })
    }

    // Apply moving average
    if (avgValues.length >= 5) {
      const ma = movingAverage(avgValues, 5)
      for (let i = 0; i < weightTrendSeries.length; i++) {
        if (ma[i] != null) weightTrendSeries[i]!.movingAvg5 = round(ma[i]!)
      }
    }
  }

  // ——————— MATRIZ Q×C ENRIQUECIDA ———————
  const hhiByQuality: MatrixQCEnhanced['hhiByQuality'] = []
  const hhiByCalibre: MatrixQCEnhanced['hhiByCalibre'] = []
  const avgWeightByCell: Record<string, Record<string, number>> = {}
  let maxCell: MatrixQCEnhanced['maxCell']

  // HHI by quality row
  for (const q of Object.keys(matrix)) {
    const row = matrix[q]
    if (!row) continue
    const rowPieces = Object.values(row).reduce((s, c) => s + c.pieces, 0)
    const shares = Object.values(row).map((c) => c.pieces / (rowPieces || 1))
    hhiByQuality.push({ quality: q, hhi: round(herfindahlIndex(shares), 3), pieces: rowPieces })
  }

  // HHI by calibre column
  const allCalibresInMatrix = new Set<string>()
  for (const row of Object.values(matrix)) {
    if (row) for (const c of Object.keys(row)) allCalibresInMatrix.add(c)
  }
  for (const c of allCalibresInMatrix) {
    const colPieces: number[] = []
    let total = 0
    for (const q of Object.keys(matrix)) {
      const cell = matrix[q]?.[c]
      if (cell) { colPieces.push(cell.pieces); total += cell.pieces }
    }
    const shares = colPieces.map((p) => p / (total || 1))
    hhiByCalibre.push({ calibre: c, hhi: round(herfindahlIndex(shares), 3), pieces: total })
  }

  // Global HHI and max cell
  const allCellPieces: number[] = []
  let maxP = 0
  for (const q of Object.keys(matrix)) {
    const row = matrix[q]
    if (!row) continue
    for (const c of Object.keys(row)) {
      const cell = row[c]
      if (cell) {
        allCellPieces.push(cell.pieces)
        if (cell.pieces > maxP) {
          maxP = cell.pieces
          maxCell = { quality: q, calibre: c, pieces: cell.pieces, pct: cell.pct }
        }
      }
    }
  }
  const globalShares = allCellPieces.map((p) => p / (matrixTotal || 1))
  const globalHHI = round(herfindahlIndex(globalShares), 3)

  // Avg weight per Q×C cell
  if (hasPiece) {
    const cellWeights = new Map<string, number[]>()
    for (const r of data.pieceRecords) {
      if (r.gate === 0) continue
      const q = r.quality || 'Unknown'
      const c = r.calibre || 'Other'
      const key = `${q}|${c}`
      const wpg = r.weightPerPieceGrams ?? (r.weightKg && r.pieces > 0 ? (r.weightKg / r.pieces) * 1000 : undefined)
      if (wpg && wpg > 0) {
        const arr = cellWeights.get(key) || []
        arr.push(wpg)
        cellWeights.set(key, arr)
      }
    }
    for (const [key, ws] of cellWeights) {
      const [q, c] = key.split('|')
      if (!q || !c) continue
      if (!avgWeightByCell[q]) avgWeightByCell[q] = {}
      avgWeightByCell[q]![c] = round(calcMean(ws))
    }
  }

  // Imbalance score: difference between max HHI and ideal uniform distribution
  const idealHHI = matrixTotal > 0 ? 1 / allCellPieces.length : 0
  const imbalanceScore = round(Math.min(1, (globalHHI - idealHHI) / (1 - idealHHI + 0.001)), 3)

  const matrixEnhanced: MatrixQCEnhanced = {
    hhiByQuality,
    hhiByCalibre,
    globalHHI,
    maxCell,
    imbalanceScore: isNaN(imbalanceScore) ? 0 : imbalanceScore,
    avgWeightByCell,
  }

  // ——————— ESTADÍSTICAS AVANZADAS POR GATE ———————
  const gateAdvancedStats: GateAdvancedStats[] = []
  if (hasPiece && gates.length > 0) {
    const gateDataMap = new Map<number, { pieces: number; weightKg: number; weights: number[]; calibres: Map<string, number> }>()

    for (const r of data.pieceRecords) {
      if (r.gate === 0) continue
      const cur = gateDataMap.get(r.gate) || { pieces: 0, weightKg: 0, weights: [] as number[], calibres: new Map<string, number>() }
      cur.pieces += r.pieces
      cur.weightKg += r.weightKg ?? 0
      const wpg = r.weightPerPieceGrams ?? (r.weightKg && r.pieces > 0 ? (r.weightKg / r.pieces) * 1000 : undefined)
      if (wpg && wpg > 0) cur.weights.push(wpg)
      const cKey = r.calibre || 'Other'
      cur.calibres.set(cKey, (cur.calibres.get(cKey) || 0) + r.pieces)
      gateDataMap.set(r.gate, cur)
    }

    for (const g of gates) {
      const d = gateDataMap.get(g.gateNumber)
      if (!d) continue
      const calibreBreakdown: Record<string, number> = {}
      for (const [c, p] of d.calibres) calibreBreakdown[c] = p
      const matchPieces = d.calibres.get(g.assignedCalibre) || 0
      const mismatchPct = d.pieces > 0 ? round(((d.pieces - matchPieces) / d.pieces) * 100) : 0

      gateAdvancedStats.push({
        gateNumber: g.gateNumber,
        pieces: d.pieces,
        weightKg: d.weightKg,
        avgWeightGrams: d.weights.length > 0 ? round(calcMean(d.weights)) : 0,
        stdDevWeightGrams: d.weights.length > 1 ? round(calcStdDev(d.weights)) : 0,
        cv: d.weights.length > 1 ? round(coefficientOfVariation(d.weights), 3) : 0,
        utilizationPct: round(pct(d.pieces, productivePieces)),
        assignedCalibre: g.assignedCalibre,
        assignedQuality: g.assignedQuality,
        mismatchPct,
        calibreBreakdown,
      })
    }
    gateAdvancedStats.sort((a, b) => b.pieces - a.pieces)
  }

  // ——————— SUGERENCIAS DE REASIGNACIÓN DE GATES (v2 — robust) ———————
  // Tres categorías:
  //  1. CORRECTION: Etiqueta del sistema ≠ comportamiento real de la máquina
  //  2. OPTIMIZATION: Redistribuir gates según demanda (déficit↔superávit)
  //  3. INVESTIGATE: Anomalías (alta variabilidad) que requieren verificación
  const gateSwapSuggestions: GateSwapSuggestion[] = []

  if (gateAdvancedStats.length > 0 && distributionByCalibre.length > 0) {
    // Pre-compute lookup de balance
    const balanceMap = new Map(gateBalance.map((gb) => [gb.calibre, gb]))

    // Track gates already suggested to avoid duplicates
    const suggestedGates = new Set<number>()

    // ——— 1. CORRECTIONS: mismatch de etiqueta ———
    for (const gs of gateAdvancedStats) {
      if (gs.mismatchPct <= 50) continue // solo sugerir si >50% de piezas no coinciden

      // Encontrar calibre real dominante
      let topCal = gs.assignedCalibre as string
      let topCalPieces = 0
      for (const [c, p] of Object.entries(gs.calibreBreakdown)) {
        if (p > topCalPieces) { topCalPieces = p; topCal = c }
      }
      if (topCal === gs.assignedCalibre) continue // no hay conflicto

      const currentBal = balanceMap.get(gs.assignedCalibre)
      const targetBal = balanceMap.get(topCal as CalibreRange)

      // Evaluar si cambiar la etiqueta mejora la asignación
      const currentCalHasSurplus = currentBal ? currentBal.gap < 0 : false
      const targetCalHasDeficit = targetBal ? targetBal.gap > 0 : false

      let reason: string
      let impactScore: number
      const evidence: string[] = [
        `Mismatch: ${gs.mismatchPct}% de piezas no son ${gs.assignedCalibre}`,
        `Calibre real dominante: ${topCal} (${topCalPieces} pz de ${gs.pieces})`,
      ]

      if (currentCalHasSurplus && targetCalHasDeficit) {
        // Caso ideal: corregir etiqueta Y mejora el balance
        reason = `Gate ${gs.gateNumber} etiquetado como ${gs.assignedCalibre} pero la máquina envía ${topCal} (${round(100 - gs.mismatchPct)}% coinciden). `
          + `Corregir la etiqueta beneficia el balance: ${gs.assignedCalibre} tiene superávit y ${topCal} tiene déficit.`
        impactScore = round(Math.min(100, gs.mismatchPct * 0.8 + 20))
        evidence.push(
          `${gs.assignedCalibre}: ${currentBal?.gatesAssigned}/${currentBal?.idealGates} gates (superávit)`,
          `${topCal}: ${targetBal?.gatesAssigned}/${targetBal?.idealGates} gates (déficit)`,
        )
      } else if (currentBal && currentBal.gap > 0) {
        // Eliminar un gate de un calibre con DÉFICIT → peligroso
        reason = `⚠️ Gate ${gs.gateNumber} etiquetado como ${gs.assignedCalibre} pero recibe ${topCal}. `
          + `Sin embargo, ${gs.assignedCalibre} tiene DÉFICIT de gates (${currentBal.gatesAssigned}/${currentBal.idealGates}). `
          + `Verifique la configuración de la máquina: puede que el gate deba recibir ${gs.assignedCalibre} y no lo está haciendo.`
        impactScore = round(Math.min(100, gs.mismatchPct * 0.6))
        evidence.push(
          `⚠ ${gs.assignedCalibre}: demanda ${currentBal.demandPct}% con ${currentBal.gatesAssigned} gates (necesita ${currentBal.idealGates})`,
          `Acción recomendada: revisar por qué la máquina no envía ${gs.assignedCalibre} a este gate`,
        )
      } else {
        // Caso neutral: la corrección no empeora pero tampoco optimiza
        reason = `Gate ${gs.gateNumber} etiquetado como ${gs.assignedCalibre} pero la máquina envía ${topCal} (${round(100 - gs.mismatchPct)}%). `
          + `Corrija la etiqueta en el sistema o verifique la configuración de la máquina.`
        impactScore = round(Math.min(80, gs.mismatchPct * 0.5))
      }

      gateSwapSuggestions.push({
        type: 'correction',
        gateNumber: gs.gateNumber,
        currentCalibre: gs.assignedCalibre,
        suggestedCalibre: topCal as CalibreRange,
        reason,
        impactScore,
        evidence,
      })
      suggestedGates.add(gs.gateNumber)
    }

    // ——— 2. OPTIMIZATION: redistribuir según demanda ———
    // Solo sugerir mover gates de calibres con superávit a calibres con déficit
    const deficitCals = gateBalance
      .filter((gb) => gb.gap > 0)
      .sort((a, b) => b.gap - a.gap || b.demandPct - a.demandPct)

    const surplusCals = gateBalance
      .filter((gb) => gb.gap < 0)
      .sort((a, b) => a.gap - b.gap) // mayor superávit primero (gap más negativo)

    for (const deficit of deficitCals) {
      if (deficit.gap <= 0) continue

      for (const surplus of surplusCals) {
        if (surplus.gap >= 0) continue // ya fue donado todo el superávit

        // Buscar el gate candidato en el calibre con superávit:
        // preferir gate con menor utilización (menos impacto al moverlo)
        const candidates = gateAdvancedStats
          .filter((g) => g.assignedCalibre === surplus.calibre && !suggestedGates.has(g.gateNumber))
          .sort((a, b) => a.utilizationPct - b.utilizationPct)

        const donor = candidates[0]
        if (!donor) continue

        const diffDemand = deficit.demandPct - surplus.demandPct

        gateSwapSuggestions.push({
          type: 'optimization',
          gateNumber: donor.gateNumber,
          currentCalibre: surplus.calibre,
          suggestedCalibre: deficit.calibre,
          reason: `Reasignar Gate ${donor.gateNumber} de ${surplus.calibre} a ${deficit.calibre}: `
            + `${deficit.calibre} tiene ${deficit.demandPct}% demanda con ${deficit.gatesAssigned} gates (necesita ${deficit.idealGates}), `
            + `${surplus.calibre} tiene ${surplus.demandPct}% demanda con ${surplus.gatesAssigned} gates (necesita ${surplus.idealGates}).`,
          impactScore: round(Math.min(100, Math.max(10, diffDemand * 1.5))),
          evidence: [
            `Déficit ${deficit.calibre}: ${deficit.gatesAssigned}/${deficit.idealGates} gates (${deficit.demandPct}% demanda)`,
            `Superávit ${surplus.calibre}: ${surplus.gatesAssigned}/${surplus.idealGates} gates (${surplus.demandPct}% demanda)`,
            `Gate ${donor.gateNumber}: utilización ${donor.utilizationPct}% (menor impacto al reasignar)`,
          ],
        })
        suggestedGates.add(donor.gateNumber)
        // Ajustar contadores virtuales para no sugerir de más
        surplus.gap += 1
        deficit.gap -= 1
        if (deficit.gap <= 0) break
      }
    }

    // ——— 3. INVESTIGATE: alta variabilidad ———
    const globalAvgCV = gateAdvancedStats.length > 0
      ? calcMean(gateAdvancedStats.map((g) => g.cv))
      : 0

    for (const gs of gateAdvancedStats) {
      if (suggestedGates.has(gs.gateNumber)) continue
      if (gs.cv > globalAvgCV * 2 && gs.cv > 0.15) {
        gateSwapSuggestions.push({
          type: 'investigate',
          gateNumber: gs.gateNumber,
          currentCalibre: gs.assignedCalibre,
          suggestedCalibre: gs.assignedCalibre, // no sugiere cambio, solo investigación
          reason: `Gate ${gs.gateNumber} tiene variabilidad de peso anormalmente alta (CV=${(gs.cv * 100).toFixed(1)}%). `
            + `Puede estar recibiendo piezas de calibres mixtos o tener un problema mecánico.`,
          impactScore: round(Math.min(60, gs.cv * 150)),
          evidence: [
            `CV: ${(gs.cv * 100).toFixed(1)}% (promedio global: ${(globalAvgCV * 100).toFixed(1)}%)`,
            `StdDev: ${gs.stdDevWeightGrams}g, Avg: ${gs.avgWeightGrams}g`,
            `Acción: verificar sensores y calibración de este gate`,
          ],
        })
      }
    }

    gateSwapSuggestions.sort((a, b) => b.impactScore - a.impactScore)
  }

  // ——————— DATA COMPLETENESS NOTES ———————
  if (!hasPiece) notes.push('No se cargó archivo pieza-pieza: KPIs y gráficos pueden estar incompletos.')
  if (!hasG0 && pointZeroPieces === 0) notes.push('No se detectaron datos de Punto Cero (Gate 0).')
  if (data.qualitySummary.length === 0 && !hasPiece)
    notes.push('Falta archivo % Calidad: distribución por calidad no disponible.')
  if (data.productionSummary.length === 0 && !hasPiece)
    notes.push('Falta archivo Totales Producción.')
  if (data.folioRecords.length === 0 && lotAnalysis.length === 0)
    notes.push('Falta archivo Total Piezas por Folio (datos de lotes extraídos desde pieza-pieza).')
  if (gates.length === 0) notes.push('No hay configuración de gates: balance no calculado.')
  if (lotAnalysis.length > 0)
    notes.push(`Datos de ${lotAnalysis.length} lote(s) extraídos desde archivo pieza-pieza.`)

  // ——————— KPI BLOCK (extended) ———————
  // Compute aggregate weight stats from productive pieces
  const allProductiveWeights: number[] = []
  if (hasPiece) {
    for (const r of data.pieceRecords) {
      if (r.gate === 0) continue
      const wpg = r.weightPerPieceGrams ?? (r.weightKg && r.pieces > 0 ? (r.weightKg / r.pieces) * 1000 : undefined)
      if (wpg && wpg > 0) allProductiveWeights.push(wpg)
    }
  }
  const uniqueLots = lotAnalysis.length > 0 ? lotAnalysis.filter((l) => l.lot !== 'Sin lote').length : undefined

  // Production rate: pieces per hour
  let productionRatePerHour: number | undefined
  const startTs = config.startAt || data.inferred.startAt
  const endTs = config.endAt || data.inferred.endAt
  if (startTs && endTs) {
    const durationHours = (new Date(endTs).getTime() - new Date(startTs).getTime()) / 3600000
    if (durationHours > 0) productionRatePerHour = round(totalPieces / durationHours, 0)
  }

  const kpis: KPIBlock = {
    totalPieces,
    totalWeightKg: totalWeightKg || undefined,
    pointZeroPieces,
    pointZeroPct: pct(pointZeroPieces, totalPieces),
    topPointZeroErrors,
    dominantCalibre,
    dominantQuality,
    avgWeightGrams: allProductiveWeights.length > 0 ? round(calcMean(allProductiveWeights)) : undefined,
    medianWeightGrams: allProductiveWeights.length > 0 ? round(calcMedian(allProductiveWeights)) : undefined,
    uniqueLots,
    productionRatePerHour,
  }

  return {
    config: {
      ...config,
      startAt: config.startAt || data.inferred.startAt,
      endAt: config.endAt || data.inferred.endAt,
    },
    gates,
    kpis,
    distributionByCalibre,
    distributionByQuality,
    pointZeroByError,
    pointZeroClassification,
    matrixQualityCalibre: matrix,
    timeSeriesPointZero,
    gateBalance,
    lotAnalysis,
    weightTrendSeries,
    matrixEnhanced,
    gateAdvancedStats,
    gateSwapSuggestions,
    allocationScore,
    notes,
  }
}
