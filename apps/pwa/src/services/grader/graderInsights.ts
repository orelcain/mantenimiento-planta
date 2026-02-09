/**
 * Motor de insights determinísticos del módulo Grader.
 *
 * Reglas basadas en umbrales configurables que generan alertas
 * con evidencia numérica y recomendaciones.
 */

import type {
  GraderAnalyticsResult,
  DeterministicInsight,
} from './types'

let insightCounter = 0
function nextId(): string {
  return `insight-${++insightCounter}`
}

export function computeDeterministicInsights(
  result: GraderAnalyticsResult,
): DeterministicInsight[] {
  insightCounter = 0
  const insights: DeterministicInsight[] = []

  const thresholds = result.config.errorThresholds ?? {
    photocellPctWarn: 1,
    outOfLimitsPctWarn: 3,
    pointZeroPctWarn: 2,
  }

  // ——— 1. Punto Cero general ———
  if (result.kpis.pointZeroPct >= thresholds.pointZeroPctWarn) {
    // Add classification breakdown to evidence
    const classEvidence = result.pointZeroClassification.causes
      .filter((c) => c.pctOfPointZero >= 1)
      .map((c) => `  → ${c.label}: ${c.pieces.toLocaleString()} pz (${c.pctOfPointZero}% del P.Cero)`)

    insights.push({
      id: nextId(),
      severity: result.kpis.pointZeroPct >= thresholds.pointZeroPctWarn * 2 ? 'critical' : 'warn',
      title: 'Punto Cero elevado',
      evidence: [
        `Punto Cero: ${result.kpis.pointZeroPieces} piezas (${result.kpis.pointZeroPct}%)`,
        `Umbral configurado: ${thresholds.pointZeroPctWarn}%`,
        ...classEvidence,
      ],
      recommendations: [
        'Revisar las causas principales de Punto Cero.',
        'Verificar estado físico de la grader (limpieza, calibración).',
        'Considerar reconfigurar los rangos de clasificación.',
      ],
    })
  }

  // ——— 2. "No leído por fotocélula" (usando clasificación estandarizada) ———
  const photocellCause = result.pointZeroClassification.causes.find((c) => c.cause === 'no_leido_fotocelula')
  if (photocellCause && photocellCause.pctOfTotal >= thresholds.photocellPctWarn) {
    insights.push({
      id: nextId(),
      severity: photocellCause.pctOfTotal >= thresholds.photocellPctWarn * 2 ? 'critical' : 'warn',
      title: 'Error de fotocélula alto',
      evidence: [
        `${photocellCause.label}: ${photocellCause.pieces.toLocaleString()} piezas (${photocellCause.pctOfPointZero}% del P.Cero, ${photocellCause.pctOfTotal}% del total)`,
        `Umbral: ${thresholds.photocellPctWarn}%`,
      ],
      recommendations: [
        'Limpiar y verificar la posición de la fotocélula.',
        'Revisar calibración del sensor óptico.',
        'Comprobar que no haya obstrucciones en la línea.',
      ],
    })
  }

  // ——— 3. "Fuera de límites" + "Fuera de rango" (usando clasificación) ———
  const fueraLimitesCause = result.pointZeroClassification.causes.find((c) => c.cause === 'fuera_de_limites')
  const fueraRangoCause = result.pointZeroClassification.causes.find((c) => c.cause === 'fuera_de_rango')
  const combinedOOBPct = (fueraLimitesCause?.pctOfTotal ?? 0) + (fueraRangoCause?.pctOfTotal ?? 0)

  if (combinedOOBPct >= thresholds.outOfLimitsPctWarn) {
    const evidence: string[] = []
    if (fueraRangoCause) {
      evidence.push(`Fuera de rango: ${fueraRangoCause.pieces.toLocaleString()} pz (${fueraRangoCause.pctOfPointZero}% del P.Cero)`)
    }
    if (fueraLimitesCause) {
      evidence.push(`Fuera de límites: ${fueraLimitesCause.pieces.toLocaleString()} pz (${fueraLimitesCause.pctOfPointZero}% del P.Cero)`)
    }
    evidence.push(`Umbral combinado: ${thresholds.outOfLimitsPctWarn}%`)

    insights.push({
      id: nextId(),
      severity: combinedOOBPct >= thresholds.outOfLimitsPctWarn * 2 ? 'critical' : 'warn',
      title: 'Fuera de rango/límites elevado',
      evidence,
      recommendations: [
        'Revisar rangos de parametrización en Matrix.',
        'Verificar condiciones físicas del producto (tamaño/forma inusuales).',
        'Considerar ampliar los rangos si el producto cambió de especificación.',
      ],
    })
  }

  // ——— 4. Calibre dominante con pocos gates ———
  for (const gb of result.gateBalance) {
    if (gb.severity === 'critical' || gb.severity === 'warn') {
      insights.push({
        id: nextId(),
        severity: gb.severity,
        title: `Desbalance gates para ${gb.calibre}`,
        evidence: [
          `Demanda: ${gb.demandPct}% del total productivo`,
          `Gates asignados activos: ${gb.gatesAssigned}`,
          gb.message,
        ],
        recommendations: [
          `Considerar reasignar más gates al calibre ${gb.calibre}.`,
          'Verificar si otros calibres tienen gates sobrantes.',
          'Evaluar el impacto en Punto Cero por cola de espera.',
        ],
      })
    }
  }

  // ——— 5. Tendencia temporal creciente de Punto Cero ———
  if (result.timeSeriesPointZero.length >= 4) {
    const series = result.timeSeriesPointZero
    const midpoint = Math.floor(series.length / 2)
    const firstHalf = series.slice(0, midpoint)
    const secondHalf = series.slice(midpoint)

    const avgFirst = firstHalf.reduce((s, p) => s + p.pointZeroPieces, 0) / firstHalf.length
    const avgSecond = secondHalf.reduce((s, p) => s + p.pointZeroPieces, 0) / secondHalf.length

    if (avgSecond > avgFirst * 1.5 && avgFirst > 0) {
      const growthPct = Math.round(((avgSecond - avgFirst) / avgFirst) * 100)
      insights.push({
        id: nextId(),
        severity: growthPct > 100 ? 'critical' : 'warn',
        title: 'Punto Cero creciente en el tiempo',
        evidence: [
          `Promedio primera mitad del turno: ${avgFirst.toFixed(1)} piezas/intervalo`,
          `Promedio segunda mitad: ${avgSecond.toFixed(1)} piezas/intervalo`,
          `Incremento: +${growthPct}%`,
        ],
        recommendations: [
          'Posible degradación por suciedad acumulada o agua.',
          'Revisar sincronización de la grader.',
          'Programar limpieza a mitad de turno.',
        ],
      })
    }
  }

  // ——— 6. "Too close / too long" (usando clasificación) ———
  const tooCloseCause = result.pointZeroClassification.causes.find((c) => c.cause === 'too_close_too_long')
  if (tooCloseCause && tooCloseCause.pctOfTotal >= 0.5) {
    insights.push({
      id: nextId(),
      severity: tooCloseCause.pctOfTotal >= 2 ? 'warn' : 'info',
      title: 'Piezas "too close/too long"',
      evidence: [
        `${tooCloseCause.label}: ${tooCloseCause.pieces.toLocaleString()} piezas (${tooCloseCause.pctOfPointZero}% del P.Cero, ${tooCloseCause.pctOfTotal}% del total)`,
      ],
      recommendations: [
        'Verificar velocidad del alimentador y separación entre piezas.',
        'Revisar configuración de timing de la grader.',
      ],
    })
  }

  // ——— 7. "Puerta no preparada" (usando clasificación) ———
  const doorCause = result.pointZeroClassification.causes.find((c) => c.cause === 'puerta_no_preparada')
  if (doorCause && doorCause.pctOfTotal >= 0.5) {
    insights.push({
      id: nextId(),
      severity: doorCause.pctOfTotal >= 2 ? 'warn' : 'info',
      title: 'Puerta no preparada frecuente',
      evidence: [
        `${doorCause.label}: ${doorCause.pieces.toLocaleString()} piezas (${doorCause.pctOfPointZero}% del P.Cero, ${doorCause.pctOfTotal}% del total)`,
      ],
      recommendations: [
        'Verificar el mecanismo de actuación de las compuertas.',
        'Revisar tiempo de cierre/apertura de gates.',
        'Verificar velocidad de la línea vs. capacidad de las compuertas.',
      ],
    })
  }

  // ——— 8. Sin datos pieza-pieza ———
  if (result.notes.some((n) => n.includes('pieza-pieza'))) {
    insights.push({
      id: nextId(),
      severity: 'info',
      title: 'Datos incompletos',
      evidence: ['No se cargó archivo pieza-pieza.'],
      recommendations: [
        'Cargar el archivo pieza-pieza para obtener analítica completa.',
        'Sin pieza-pieza, las distribuciones y series temporales pueden ser parciales.',
      ],
    })
  }

  // ——— 9. Cambio de lote con diferencia significativa de peso ———
  if (result.lotAnalysis && result.lotAnalysis.length > 1) {
    const lots = result.lotAnalysis.filter((l) => l.avgWeightGrams > 0)
    for (let i = 1; i < lots.length; i++) {
      const prev = lots[i - 1]!
      const curr = lots[i]!
      const diff = Math.abs(curr.avgWeightGrams - prev.avgWeightGrams)
      const diffPct = prev.avgWeightGrams > 0 ? (diff / prev.avgWeightGrams) * 100 : 0
      if (diffPct >= 15) {
        insights.push({
          id: nextId(),
          severity: diffPct >= 30 ? 'critical' : 'warn',
          title: `Cambio significativo de peso entre lotes`,
          evidence: [
            `Lote "${prev.lot}": peso prom. ${prev.avgWeightGrams}g (${prev.pieces} pz)`,
            `Lote "${curr.lot}": peso prom. ${curr.avgWeightGrams}g (${curr.pieces} pz)`,
            `Diferencia: ${diff.toFixed(0)}g (${diffPct.toFixed(1)}%)`,
          ],
          recommendations: [
            'Al cambiar de lote, el peso promedio cambió significativamente.',
            'Considere agregar o reasignar compuertas para el nuevo rango de calibre.',
            'Verificar si la especie o tipo de producto cambió entre lotes.',
          ],
        })
      }
    }
  }

  // ——— 10. Tendencia de peso creciente/decreciente ———
  if (result.weightTrendSeries && result.weightTrendSeries.length >= 5) {
    const ws = result.weightTrendSeries
    const midpoint = Math.floor(ws.length / 2)
    const avgFirst = ws.slice(0, midpoint).reduce((s, w) => s + w.avgWeightGrams, 0) / midpoint
    const avgSecond = ws.slice(midpoint).reduce((s, w) => s + w.avgWeightGrams, 0) / (ws.length - midpoint)
    const diff = avgSecond - avgFirst
    const diffPct = avgFirst > 0 ? Math.abs(diff / avgFirst) * 100 : 0

    if (diffPct >= 5) {
      insights.push({
        id: nextId(),
        severity: diffPct >= 15 ? 'warn' : 'info',
        title: diff > 0 ? 'Peso promedio creciente en el turno' : 'Peso promedio decreciente en el turno',
        evidence: [
          `Primera mitad: ${avgFirst.toFixed(0)}g promedio`,
          `Segunda mitad: ${avgSecond.toFixed(0)}g promedio`,
          `Cambio: ${diff > 0 ? '+' : ''}${diff.toFixed(0)}g (${diffPct.toFixed(1)}%)`,
        ],
        recommendations: [
          'El peso promedio del producto está cambiando durante la producción.',
          'Posible cambio de materia prima o lote de origen.',
          'Evaluar si la distribución de gates sigue siendo óptima para el nuevo peso.',
        ],
      })
    }
  }

  // ——— 11. Gate con alta variabilidad ———
  if (result.gateAdvancedStats && result.gateAdvancedStats.length > 0) {
    const cvValues = result.gateAdvancedStats.map((g) => g.cv).filter((c) => c > 0)
    const avgCV = cvValues.length > 0 ? cvValues.reduce((s, c) => s + c, 0) / cvValues.length : 0
    for (const gs of result.gateAdvancedStats) {
      if (gs.cv > avgCV * 2 && gs.cv > 0.15) {
        insights.push({
          id: nextId(),
          severity: gs.cv > avgCV * 3 ? 'warn' : 'info',
          title: `Gate ${gs.gateNumber}: alta variabilidad de peso`,
          evidence: [
            `CV: ${(gs.cv * 100).toFixed(1)}% (promedio: ${(avgCV * 100).toFixed(1)}%)`,
            `Peso promedio: ${gs.avgWeightGrams}g ± ${gs.stdDevWeightGrams}g`,
            `Mismatch calibre: ${gs.mismatchPct}%`,
          ],
          recommendations: [
            `Gate ${gs.gateNumber} recibe piezas de pesos muy variables.`,
            'Verificar calibración de la compuerta o si está recibiendo múltiples calibres.',
          ],
        })
      }
    }
  }

  // ——— 12. Concentración Q×C alta ———
  if (result.matrixEnhanced && result.matrixEnhanced.globalHHI > 0.4) {
    insights.push({
      id: nextId(),
      severity: result.matrixEnhanced.globalHHI > 0.6 ? 'warn' : 'info',
      title: 'Alta concentración en Matriz Calidad×Calibre',
      evidence: [
        `HHI global: ${result.matrixEnhanced.globalHHI} (1 = completamente concentrado)`,
        result.matrixEnhanced.maxCell
          ? `Celda dominante: ${result.matrixEnhanced.maxCell.quality} × ${result.matrixEnhanced.maxCell.calibre} (${result.matrixEnhanced.maxCell.pct}%)`
          : '',
      ].filter(Boolean),
      recommendations: [
        'La producción está muy concentrada en pocas combinaciones calidad-calibre.',
        'Esto es normal si el lote es uniforme, pero puede indicar baja diversificación.',
      ],
    })
  }

  // ——— 13. Sugerencias de swap como insights ———
  if (result.gateSwapSuggestions && result.gateSwapSuggestions.length > 0) {
    for (const swap of result.gateSwapSuggestions.slice(0, 3)) {
      insights.push({
        id: nextId(),
        severity: swap.impactScore >= 50 ? 'warn' : 'info',
        title: `Sugerencia: reasignar Gate ${swap.gateNumber}`,
        evidence: swap.evidence,
        recommendations: [swap.reason],
      })
    }
  }

  return insights
}

// ============================================================================
// PREDICTIVO v1 (ligero / determinístico)
// ============================================================================

export interface PointZeroTrend {
  direction: 'increasing' | 'decreasing' | 'stable'
  slopePerHour: number
  projectedPctIn2h?: number
  anomalyBuckets: string[] // ISO timestamps de buckets anómalos
}

/**
 * Calcula tendencia de Punto Cero y detección de anomalías simples
 * basada en media ± 2σ sobre la serie temporal.
 */
export function computePointZeroTrend(
  result: GraderAnalyticsResult,
): PointZeroTrend {
  const series = result.timeSeriesPointZero
  if (series.length < 3) {
    return { direction: 'stable', slopePerHour: 0, anomalyBuckets: [] }
  }

  // Linear regression on point zero pieces
  const n = series.length
  const xs = series.map((_, i) => i)
  const ys = series.map((p) => p.pointZeroPieces)

  const meanX = xs.reduce((s, x) => s + x, 0) / n
  const meanY = ys.reduce((s, y) => s + y, 0) / n

  let num = 0
  let den = 0
  for (let i = 0; i < n; i++) {
    num += (xs[i]! - meanX) * (ys[i]! - meanY)
    den += (xs[i]! - meanX) * (xs[i]! - meanX)
  }

  const slope = den === 0 ? 0 : num / den
  const intervalMin = result.config.intervalMinutes ?? 15
  const slopePerHour = slope * (60 / intervalMin)

  // Direction
  let direction: 'increasing' | 'decreasing' | 'stable' = 'stable'
  if (slopePerHour > 1) direction = 'increasing'
  else if (slopePerHour < -1) direction = 'decreasing'

  // Anomaly detection: mean ± 2σ
  const stdDev = Math.sqrt(
    ys.reduce((s, y) => s + (y - meanY) ** 2, 0) / n,
  )
  const threshold = meanY + 2 * stdDev
  const anomalyBuckets = series
    .filter((p) => p.pointZeroPieces > threshold && threshold > 0)
    .map((p) => p.bucketStart)

  // Projection: value at current + 2h
  const stepsIn2h = Math.ceil(120 / intervalMin)
  const intercept = meanY - slope * meanX
  const projected = intercept + slope * (n - 1 + stepsIn2h)
  const lastTotalPieces = series[n - 1]?.totalPieces ?? result.kpis.totalPieces / n
  const projectedPct =
    lastTotalPieces > 0 ? Math.round((projected / lastTotalPieces) * 10000) / 100 : undefined

  return {
    direction,
    slopePerHour: Math.round(slopePerHour * 100) / 100,
    projectedPctIn2h: projectedPct != null && projectedPct >= 0 ? projectedPct : undefined,
    anomalyBuckets,
  }
}
