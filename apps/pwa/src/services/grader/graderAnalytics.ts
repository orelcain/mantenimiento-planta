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
  CalibreWeightRange,
  OutOfRangeWeightDetail,
  Gate0Record,
} from './types'

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
 */
function computePointZeroClassification(
  g0Records: Array<Gate0Record | (Gate0Record & { error: string })>,
  totalPieces: number,
  pointZeroPieces: number,
): PointZeroClassification {
  // Agrupar por causa
  const causeMap = new Map<PointZeroCause, { pieces: number; weightKg: number; records: typeof g0Records }>()

  for (const r of g0Records) {
    const errorStr = 'error' in r ? r.error : 'Desconocido'
    const cause = classifyError(errorStr)
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
      return {
        cause,
        label: meta.label,
        description: meta.description,
        pieces: data?.pieces ?? 0,
        pctOfPointZero: pointZeroPieces > 0 ? pct(data?.pieces ?? 0, pointZeroPieces) : 0,
        pctOfTotal: totalPieces > 0 ? pct(data?.pieces ?? 0, totalPieces) : 0,
        weightKg: data?.weightKg || undefined,
      }
    })
    .filter((c) => c.pieces > 0) // Solo mostrar causas con piezas
    .sort((a, b) => b.pieces - a.pieces)

  // Desglose de "fuera de rango" por peso → calibre
  const outOfRangeByWeight: OutOfRangeWeightDetail[] = []
  const fueraDeRangoData = causeMap.get('fuera_de_rango')

  if (fueraDeRangoData && fueraDeRangoData.records.length > 0) {
    const weightBuckets = new Map<string, { pieces: number; weightKg: number }>()

    for (const r of fueraDeRangoData.records) {
      const piecesW = r.pieces

      let rangeLabel: string
      if (!r.weightKg || r.weightKg <= 0) {
        rangeLabel = 'Sin dato de peso'
      } else {
        // Peso por pieza en gramos
        const perPieceG = (r.weightKg / r.pieces) * 1000
        const matched = CALIBRE_WEIGHT_RANGES.find(
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

  return {
    totalPointZeroPieces: pointZeroPieces,
    causes,
    outOfRangeByWeight,
    calibreWeightRanges: CALIBRE_WEIGHT_RANGES,
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

  // ——————— TOTALES ———————
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

  // Gate 0 from explicit gate0Records (preferred)
  if (hasG0) {
    // If we already counted g0 from pieceRecords, reset and use dedicated file
    if (hasPiece) {
      // Subtract inferred g0 from pieceRecords, add from gate0Records
      const g0FromPiece = data.pieceRecords.filter((r) => r.gate === 0).reduce((s, r) => s + r.pieces, 0)
      pointZeroPieces = pointZeroPieces - g0FromPiece
      pointZeroWeightKg = 0
    }
    for (const r of data.gate0Records) {
      pointZeroPieces += r.pieces
      pointZeroWeightKg += r.weightKg ?? 0
    }
    // Add g0 pieces to total if not already from pieceRecords
    if (!hasPiece) {
      totalPieces += pointZeroPieces
      totalWeightKg += pointZeroWeightKg
    }
  }

  // ——————— PUNTO CERO POR ERROR ———————
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

  // ——————— CLASIFICACIÓN PUNTO CERO (100%) ———————
  const pointZeroClassification = computePointZeroClassification(
    g0Source as Gate0Record[],
    totalPieces,
    pointZeroPieces,
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

  // Also add gate0Records to buckets if piece data already exists
  if (hasG0 && hasPiece) {
    for (const r of data.gate0Records) {
      const bk = bucketKey(r.ts, interval)
      const cur = tsBuckets.get(bk) || { g0: 0, total: 0 }
      cur.g0 += r.pieces
      tsBuckets.set(bk, cur)
    }
  }

  const timeSeriesPointZero: TimeSeriesPoint[] = Array.from(tsBuckets.entries())
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([bucketStart, v]) => ({
      bucketStart,
      pointZeroPieces: v.g0,
      pointZeroPct: v.total > 0 ? pct(v.g0, v.total) : undefined,
      totalPieces: v.total || undefined,
    }))

  // ——————— BALANCE DE GATES ———————
  const activeGates = gates.filter((g) => g.active)
  const gateBalance: GateBalanceInsight[] = []

  for (const dist of distributionByCalibre) {
    const calibre = dist.key as CalibreRange
    const assigned = activeGates.filter((g) => g.assignedCalibre === calibre).length

    let severity: 'info' | 'warn' | 'critical' = 'info'
    let message = `Calibre ${calibre}: ${dist.pct}% demanda, ${assigned} gate(s) asignados.`

    if (dist.pct >= 40 && assigned < 3) {
      severity = 'critical'
      message = `Demanda ${dist.pct}% con solo ${assigned} gate(s) asignados: alto riesgo de congestión y Punto Cero.`
    } else if (dist.pct >= 25 && assigned < 2) {
      severity = 'warn'
      message = `Demanda ${dist.pct}% con solo ${assigned} gate(s): considere reasignar para reducir esperas.`
    } else if (dist.pct < 10 && assigned > 2) {
      severity = 'info'
      message = `Calibre ${calibre} solo ${dist.pct}% demanda pero ${assigned} gates: podría liberar gates.`
    }

    gateBalance.push({ calibre, demandPct: dist.pct, gatesAssigned: assigned, severity, message })
  }

  // ——————— DATA COMPLETENESS NOTES ———————
  if (!hasPiece) notes.push('No se cargó archivo pieza-pieza: KPIs y gráficos pueden estar incompletos.')
  if (!hasG0 && pointZeroPieces === 0) notes.push('No se detectaron datos de Punto Cero (Gate 0).')
  if (data.qualitySummary.length === 0 && !hasPiece)
    notes.push('Falta archivo % Calidad: distribución por calidad no disponible.')
  if (data.productionSummary.length === 0 && !hasPiece)
    notes.push('Falta archivo Totales Producción.')
  if (data.folioRecords.length === 0) notes.push('Falta archivo Total Piezas por Folio.')
  if (gates.length === 0) notes.push('No hay configuración de gates: balance no calculado.')

  // ——————— KPI BLOCK ———————
  const kpis: KPIBlock = {
    totalPieces,
    totalWeightKg: totalWeightKg || undefined,
    pointZeroPieces,
    pointZeroPct: pct(pointZeroPieces, totalPieces),
    topPointZeroErrors,
    dominantCalibre,
    dominantQuality,
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
    notes,
  }
}
