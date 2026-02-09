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
    insights.push({
      id: nextId(),
      severity: result.kpis.pointZeroPct >= thresholds.pointZeroPctWarn * 2 ? 'critical' : 'warn',
      title: 'Punto Cero elevado',
      evidence: [
        `Punto Cero: ${result.kpis.pointZeroPieces} piezas (${result.kpis.pointZeroPct}%)`,
        `Umbral configurado: ${thresholds.pointZeroPctWarn}%`,
      ],
      recommendations: [
        'Revisar las causas principales de Punto Cero.',
        'Verificar estado físico de la grader (limpieza, calibración).',
        'Considerar reconfigurar los rangos de clasificación.',
      ],
    })
  }

  // ——— 2. "No leído por fotocélula" ———
  const photocellErr = result.pointZeroByError.find((e) =>
    e.error.toLowerCase().includes('fotoc') ||
    e.error.toLowerCase().includes('photocell') ||
    e.error.toLowerCase().includes('no leido') ||
    e.error.toLowerCase().includes('not read'),
  )
  if (photocellErr && photocellErr.pct >= thresholds.photocellPctWarn) {
    insights.push({
      id: nextId(),
      severity: photocellErr.pct >= thresholds.photocellPctWarn * 2 ? 'critical' : 'warn',
      title: 'Error de fotocélula alto',
      evidence: [
        `"${photocellErr.error}": ${photocellErr.pieces} piezas (${photocellErr.pct}%)`,
        `Umbral: ${thresholds.photocellPctWarn}%`,
      ],
      recommendations: [
        'Limpiar y verificar la posición de la fotocélula.',
        'Revisar calibración del sensor óptico.',
        'Comprobar que no haya obstrucciones en la línea.',
      ],
    })
  }

  // ——— 3. "Fuera de límites" ———
  const oobErr = result.pointZeroByError.find((e) =>
    e.error.toLowerCase().includes('fuera de lim') ||
    e.error.toLowerCase().includes('out of limit') ||
    e.error.toLowerCase().includes('fuera de rango'),
  )
  if (oobErr && oobErr.pct >= thresholds.outOfLimitsPctWarn) {
    insights.push({
      id: nextId(),
      severity: oobErr.pct >= thresholds.outOfLimitsPctWarn * 2 ? 'critical' : 'warn',
      title: '"Fuera de límites" alto',
      evidence: [
        `"${oobErr.error}": ${oobErr.pieces} piezas (${oobErr.pct}%)`,
        `Umbral: ${thresholds.outOfLimitsPctWarn}%`,
      ],
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

  // ——— 6. "Too close / too long" ———
  const tooCloseErr = result.pointZeroByError.find((e) =>
    e.error.toLowerCase().includes('too close') ||
    e.error.toLowerCase().includes('too long') ||
    e.error.toLowerCase().includes('muy cerca') ||
    e.error.toLowerCase().includes('muy largo'),
  )
  if (tooCloseErr && tooCloseErr.pct >= 0.5) {
    insights.push({
      id: nextId(),
      severity: tooCloseErr.pct >= 2 ? 'warn' : 'info',
      title: 'Piezas "too close/too long"',
      evidence: [
        `"${tooCloseErr.error}": ${tooCloseErr.pieces} piezas (${tooCloseErr.pct}%)`,
      ],
      recommendations: [
        'Verificar velocidad del alimentador y separación entre piezas.',
        'Revisar configuración de timing de la grader.',
      ],
    })
  }

  // ——— 7. "Puerta no preparada" ———
  const doorNotReady = result.pointZeroByError.find((e) =>
    e.error.toLowerCase().includes('puerta no preparada') ||
    e.error.toLowerCase().includes('door not ready') ||
    e.error.toLowerCase().includes('gate not ready'),
  )
  if (doorNotReady && doorNotReady.pct >= 0.5) {
    insights.push({
      id: nextId(),
      severity: doorNotReady.pct >= 2 ? 'warn' : 'info',
      title: 'Puerta no preparada frecuente',
      evidence: [
        `"${doorNotReady.error}": ${doorNotReady.pieces} piezas (${doorNotReady.pct}%)`,
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
