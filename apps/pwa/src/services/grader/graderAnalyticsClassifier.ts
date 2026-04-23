/**
 * Clasificadores de Punto Cero para el módulo Grader.
 *
 * Extraído de graderAnalytics.ts (M14 — 2026-04-22) para reducir su tamaño
 * y permitir tests unitarios de la lógica de clasificación sin cargar el
 * motor de analítica completo.
 *
 * Exports:
 *  - pct                          → helper porcentaje redondeado
 *  - classifyError                → string de error → PointZeroCause (legacy)
 *  - classifyRecordToMatrix       → Gate0Record → MatrixP0Cause (9 causas)
 *  - computePointZeroClassification → clasificación completa del 100% del P0
 */

import type {
  PointZeroCause,
  PointZeroCauseBreakdown,
  PointZeroClassification,
  PointZeroHierarchyRow,
  CalibreWeightRange,
  OutOfRangeWeightDetail,
  Gate0Record,
  PointZeroDrillRecord,
  MatrixP0Cause,
  GateAssignment,
} from './types'

import { CALIBRE_WEIGHT_RANGES, MARELEC_MS4_12_SPECS } from './graderAnalyticsThroughput'
import { toMatrixCause, parseMatrixErrorString, MATRIX_CAUSE_ORDER_ALL } from './graderMatrixP0Causes'

// ============================================================================
// METADATOS DE CAUSAS
// ============================================================================

/**
 * Causas estandarizadas de rechazo a Gate 0 / Punto Cero.
 *
 * Las 4 causas principales provienen directamente de la pantalla "Resultados Clasificación"
 * del controlador Z2 (Marelec MS4/12). Se muestran como porcentaje del total de piezas
 * sin clasificar ("Total unsorted pcs").
 *
 * Ejemplo real registrado en planta (14/07/2025):
 *   Fuera de límites: 10.27% | No leído fotocélula: 1.73%
 *   Too close or too long: 0.00% | Puerta no preparada: 0.13%
 *   Total unsorted pcs: 287 | Peso total clasificado: 7488 kg | Cajas: 12
 */
const CAUSE_META: Record<PointZeroCause, { label: string; description: string }> = {
  fuera_de_rango: {
    label: 'Fuera de rango',
    description: 'Pieza con peso fuera de todos los rangos de calibre configurados en las compuertas activas.',
  },
  fuera_de_limites: {
    label: 'Fuera de límites',
    description: `Objeto fuera de los parámetros dimensionales del sistema (máx. ${MARELEC_MS4_12_SPECS.maxProductDimensions.lengthMm}mm largo, ${MARELEC_MS4_12_SPECS.maxProductDimensions.widthMm}mm ancho). La pieza va directo a Gate 0. Causas típicas: pez demasiado largo, salmón mal alineado, doble pieza.`,
  },
  no_leido_fotocelula: {
    label: 'No leído por fotocélula',
    description: 'El Detection Eye (fotocélula al final de Accel Belt 2) no detectó correctamente la pieza. Puede deberse a suciedad en el lente del sensor, mala calibración, o posicionamiento incorrecto de la pieza. La pieza pasa sin clasificar y va a Gate 0.',
  },
  too_close_too_long: {
    label: 'Too close or too long',
    description: `Piezas demasiado cerca entre sí en la cinta (superan el mínimo de separación del sistema), o la pieza supera la longitud máxima admitida (${MARELEC_MS4_12_SPECS.maxProductDimensions.lengthMm}mm). Alta tasa indica congestionamiento: reducir alimentación de pockets o aumentar velocidad de cintas de aceleración.`,
  },
  puerta_no_preparada: {
    label: 'Puerta no preparada',
    description: 'Una compuerta (flipper) no estaba lista cuando el sistema intentó activarla. Ocurre cuando la pieza anterior aún está pasando por el flipper (problema de timing/sincronización), o por falla mecánica del cilindro neumático. La pieza va a Gate 0 o a la siguiente compuerta.',
  },
  otro: {
    label: 'Otro / Desconocido',
    description: 'Causa de rechazo no clasificada en las categorías estándar del Z2.',
  },
}

// ============================================================================
// HELPERS
// ============================================================================

/** Porcentaje redondeado a 2 decimales (retorna 0 si total === 0). */
export function pct(part: number, total: number): number {
  if (total === 0) return 0
  return Math.round((part / total) * 10000) / 100
}

// ============================================================================
// CLASIFICACIÓN PUNTO CERO
// ============================================================================

/** Clasifica un string de error en una causa estandarizada */
export function classifyError(error: string): PointZeroCause {
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

/**
 * Clasifica un Gate0Record a las 9 causas Matrix (4 oficiales + 5 derivadas).
 *
 * Flujo:
 *  1) Si el error string indica una causa oficial NO-"fuera de límites"
 *     (no leído, too close, puerta no preparada), respetarla.
 *  2) Si el error es "fuera de límites" (explícito o default), descomponer:
 *     a) ¿el peso encaja en algún calibre configurado? → si no: fuera_de_calibre
 *     b) ¿hay gate activa para ese calibre?            → si no: fuera_de_calibre
 *     c) ¿hay gate activa con (calibre × calidad)?     → si no: fuera_de_calidad
 *     d) [futuro] (calibre × calidad × conservación)   → fuera_de_conservacion
 *     e) [futuro] (calibre × calidad × conservación × producto) → fuera_de_producto
 *     f) Residual físico (peso raro, sensor loco)     → fuera_de_limites
 */
export function classifyRecordToMatrix(
  record: Gate0Record | (Gate0Record & { error: string }),
  activeGates: GateAssignment[],
  weightRanges: CalibreWeightRange[],
): MatrixP0Cause {
  const errorStr = 'error' in record ? (record as { error: string }).error : ''

  // (1) Respetar causas oficiales Matrix que no son "fuera de límites"
  const parsed = parseMatrixErrorString(errorStr)
  if (parsed === 'no_leido_fotocelula') return 'no_leido_fotocelula'
  if (parsed === 'too_close_too_long') return 'too_close_too_long'
  if (parsed === 'puerta_no_preparada') return 'puerta_no_preparada'

  // (2) "Fuera de límites" — intentar descomposición derivada
  let perPieceG = ('weightPerPieceGrams' in record)
    ? (record as { weightPerPieceGrams?: number }).weightPerPieceGrams
    : undefined
  if (!perPieceG && record.weightKg && record.pieces > 0) {
    perPieceG = (record.weightKg / record.pieces) * 1000
  }
  // Peso anómalo (<10g) — probable fallo de sensor
  if (perPieceG == null || perPieceG < 10) return 'no_leido_fotocelula'

  // (2a) Peso no encaja en ningún calibre configurado
  const matchedRange = weightRanges.find(
    r => perPieceG! >= r.minGrams && perPieceG! < r.maxGrams,
  )
  if (!matchedRange) return 'fuera_de_calibre'

  // (2b) Si hay gates activas pero ninguna tiene ese calibre → fuera_de_calibre
  if (activeGates.length > 0) {
    const calibreActive = activeGates.some(g => g.assignedCalibre === matchedRange.calibre)
    if (!calibreActive) return 'fuera_de_calibre'

    // (2c) Calibre OK pero calidad no encaja en ninguna gate con ese calibre
    if (record.quality) {
      const comboActive = activeGates.some(
        g => g.assignedCalibre === matchedRange.calibre && g.assignedQuality === record.quality,
      )
      if (!comboActive) return 'fuera_de_calidad'
    }
    // (2d) Calidad OK — chequear conservación si alguna gate la tiene configurada
    if (record.conservation) {
      const anyGateHasConservation = activeGates.some(g => g.assignedConservation != null)
      if (anyGateHasConservation) {
        const conservationActive = activeGates.some(
          g => g.assignedCalibre === matchedRange.calibre
            && g.assignedQuality === record.quality
            && g.assignedConservation === record.conservation,
        )
        if (!conservationActive) return 'fuera_de_conservacion'
      }
    }

    // (2e) Conservación OK — chequear producto si alguna gate lo tiene configurado
    if (record.product) {
      const anyGateHasProduct = activeGates.some(g => g.assignedProduct != null)
      if (anyGateHasProduct) {
        const productActive = activeGates.some(
          g => g.assignedCalibre === matchedRange.calibre
            && g.assignedQuality === record.quality
            && (!record.conservation || g.assignedConservation === record.conservation)
            && g.assignedProduct === record.product,
        )
        if (!productActive) return 'fuera_de_producto'
      }
    }
  }

  // (2f) Residual físico genuino
  return 'fuera_de_limites'
}

/** Clasificación completa del 100% del Punto Cero — ver jsdoc en classifyRecordToMatrix. */
export function computePointZeroClassification(
  g0Records: Array<Gate0Record | (Gate0Record & { error: string })>,
  totalPieces: number,
  pointZeroPieces: number,
  activeGates?: GateAssignment[],
  weightRanges: CalibreWeightRange[] = CALIBRE_WEIGHT_RANGES,
  hasRealP0Data = false,
  getGatesAtTs?: (ts: string) => GateAssignment[],
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

  // ── Clasificación Matrix fina (9 causas) por cada record individual ─────
  // Esto descompone "fuera de límites" oficial de Matrix en 5 sub-causas
  // derivadas (calibre / calidad / conservación / producto / residual) usando
  // la config de gates activas + los datos por pieza (quality/calibre del Excel).
  const matrixMap = new Map<MatrixP0Cause, { pieces: number; subs: Array<{ cause: PointZeroCause; pieces: number; pct: number }> }>(
    MATRIX_CAUSE_ORDER_ALL.map(mc => [mc, { pieces: 0, subs: [] }]),
  )
  const activeList = (activeGates || []).filter(g => g.active)
  for (const r of g0Records) {
    // Si hay resolver por timestamp (FASE 27), usarlo; si no, config final del turno
    const gatesForRecord = getGatesAtTs ? getGatesAtTs(r.ts).filter(g => g.active) : activeList
    const matrixCause = classifyRecordToMatrix(r, gatesForRecord, weightRanges)
    const entry = matrixMap.get(matrixCause)!
    entry.pieces += r.pieces
  }
  // Construir sub-causes para drill-down manteniendo compat con el viewer
  for (const c of causes) {
    if (c.pieces === 0) continue
    const mc = toMatrixCause(c.cause)
    // Si es "fuera_de_limites" del mapeo viejo, redistribuir proporcionalmente
    // solo si no hay records individuales (no rompemos la nueva clasificación)
    const entry = matrixMap.get(mc)
    if (entry) {
      entry.subs.push({ cause: c.cause, pieces: c.pieces, pct: c.pctOfPointZero })
    }
  }
  const byMatrixCause = Object.fromEntries(
    MATRIX_CAUSE_ORDER_ALL.map(mc => {
      const v = matrixMap.get(mc)!
      return [mc, {
        pieces: v.pieces,
        pct: pointZeroPieces > 0 ? pct(v.pieces, pointZeroPieces) : 0,
        subCauses: v.subs.sort((a, b) => b.pieces - a.pieces),
      }]
    }),
  ) as Record<MatrixP0Cause, { pieces: number; pct: number; subCauses: Array<{ cause: PointZeroCause; pieces: number; pct: number }> }>

  return {
    totalPointZeroPieces: pointZeroPieces,
    causes,
    hierarchy,
    outOfRangeByWeight,
    calibreWeightRanges: weightRanges,
    byMatrixCause,
  }
}
