/**
 * Hook custom que centraliza los 5 "views" de análisis del Dashboard del Grader:
 *   - trendForecastView        — proyección del turno (labels, datos observados y proyectados)
 *   - shiftProgressView        — progreso del turno en tiempo real (tiempo restante, tendencia peso)
 *   - sensorDegradationView    — detección de errores P0 con crecimiento temporal
 *   - multiSessionInsightsView — contexto histórico vs últimas N sesiones guardadas
 *   - shiftComparisonView      — comparativa vs sesión hermana (mismo día, turno distinto)
 *
 * Extraído de AnalisisGraderDashboardPage.tsx en la iteración de refactor 2026-04-10
 * para reducir la complejidad del componente principal (de 67 hooks → 40).
 */
import { useMemo } from 'react'
import type {
  ParsedMatrixData,
  GraderAnalysisConfig,
  GraderAnalyticsResult,
  GraderSession,
} from '@/services/grader/types'
import {
  round2,
  formatDateToHHMM,
  buildShiftWindow,
  linearRegressionPredict,
} from '@/services/grader/graderDashboardHelpers'

interface UseGraderDashboardAnalyticsArgs {
  analytics: GraderAnalyticsResult
  parsedData: ParsedMatrixData
  config: GraderAnalysisConfig
  nowTs: number
  recentSessions: GraderSession[]
  siblingSessions: GraderSession[]
  currentSessionMeta?: { sessionId?: string; shiftId?: string; sessionDate?: string }
}

export function useGraderDashboardAnalytics({
  analytics,
  parsedData,
  config,
  nowTs,
  recentSessions,
  siblingSessions,
  currentSessionMeta,
}: UseGraderDashboardAnalyticsArgs) {
  const trendForecastView = useMemo(() => {
    const series = analytics.weightTrendSeries
    if (series.length === 0) return null

    const intervalMinutes = config.intervalMinutes ?? 15
    const firstBucket = series[0]?.bucketStart
    const shiftWindow = buildShiftWindow(config, firstBucket)
    if (!shiftWindow) return null

    const shiftStartMs = shiftWindow.start.getTime()
    const shiftEndMs = shiftWindow.end.getTime()
    if (!Number.isFinite(shiftStartMs) || !Number.isFinite(shiftEndMs) || shiftEndMs <= shiftStartMs) return null

    const intervalMs = intervalMinutes * 60_000
    const labels: string[] = []
    for (let ts = shiftStartMs; ts <= shiftEndMs; ts += intervalMs) {
      labels.push(new Date(ts).toISOString())
    }
    if (labels.length === 0) return null

    const valuesByTs = new Map<number, { avgWeightGrams: number; stdDevWeightGrams: number; movingAvg5?: number; pieces: number }>()
    for (const bucket of series) {
      const ts = new Date(bucket.bucketStart).getTime()
      if (!Number.isFinite(ts)) continue
      valuesByTs.set(ts, {
        avgWeightGrams: bucket.avgWeightGrams,
        stdDevWeightGrams: bucket.stdDevWeightGrams,
        movingAvg5: bucket.movingAvg5,
        pieces: bucket.pieces,
      })
    }

    const allPoints = labels.map((iso, idx) => ({ idx, ts: new Date(iso).getTime(), iso }))
    const observedIdx = allPoints.filter((pt) => valuesByTs.has(pt.ts)).map((pt) => pt.idx)
    const observedBuckets = observedIdx.length
    const totalBuckets = allPoints.length
    if (observedBuckets === 0) return null

    const lastObservedIdx = observedIdx[observedIdx.length - 1] ?? 0

    const observedAvgPoints: Array<{ x: number; y: number }> = []
    const observedPiecePoints: Array<{ x: number; y: number }> = []
    for (const idx of observedIdx) {
      const point = allPoints[idx]
      if (!point) continue
      const source = valuesByTs.get(point.ts)
      if (!source) continue
      observedAvgPoints.push({ x: idx, y: source.avgWeightGrams })
      observedPiecePoints.push({ x: idx, y: source.pieces })
    }

    const realAvgData: Array<number | null> = labels.map((iso) => {
      const source = valuesByTs.get(new Date(iso).getTime())
      return source ? source.avgWeightGrams : null
    })
    const realPiecesData: Array<number | null> = labels.map((iso) => {
      const source = valuesByTs.get(new Date(iso).getTime())
      return source ? source.pieces : null
    })
    const realMovingAvgData: Array<number | null> = labels.map((iso) => {
      const source = valuesByTs.get(new Date(iso).getTime())
      return source?.movingAvg5 ?? null
    })

    const projectedAvgData: Array<number | null> = labels.map((_, idx) => {
      if (idx <= lastObservedIdx) return null
      const predicted = linearRegressionPredict(observedAvgPoints, idx)
      return round2(Math.max(0, predicted))
    })
    const projectedPiecesData: Array<number | null> = labels.map((_, idx) => {
      if (idx <= lastObservedIdx) return null
      const predicted = linearRegressionPredict(observedPiecePoints, idx)
      return Math.max(0, Math.round(predicted))
    })

    const observedPieces = observedPiecePoints.reduce((sum, p) => sum + p.y, 0)
    const projectedFuturePieces = projectedPiecesData.reduce<number>((sum, value) => sum + (value ?? 0), 0)
    const projectedTotalPieces = Math.round(observedPieces + projectedFuturePieces)

    const pointZeroRate = analytics.kpis.totalPieces > 0
      ? analytics.kpis.pointZeroPieces / analytics.kpis.totalPieces
      : 0
    const projectedPointZeroPieces = Math.round(projectedTotalPieces * pointZeroRate)
    const projectedPointZeroPct = projectedTotalPieces > 0
      ? round2((projectedPointZeroPieces / projectedTotalPieces) * 100)
      : 0

    const completionPct = round2((observedBuckets / totalBuckets) * 100)

    const realUpperBand: Array<number | null> = labels.map((iso) => {
      const source = valuesByTs.get(new Date(iso).getTime())
      return source ? source.avgWeightGrams + source.stdDevWeightGrams : null
    })
    const realLowerBand: Array<number | null> = labels.map((iso) => {
      const source = valuesByTs.get(new Date(iso).getTime())
      return source ? Math.max(0, source.avgWeightGrams - source.stdDevWeightGrams) : null
    })

    return {
      labels,
      realAvgData,
      projectedAvgData,
      realPiecesData,
      realMovingAvgData,
      projectedPiecesData,
      realUpperBand,
      realLowerBand,
      completionPct,
      observedBuckets,
      totalBuckets,
      observedPieces,
      projectedTotalPieces,
      projectedPointZeroPct,
      projectedPointZeroPieces,
      hasProjection: projectedPiecesData.some((v) => v != null),
      shiftStartLabel: formatDateToHHMM(shiftWindow.start),
      shiftEndLabel: formatDateToHHMM(shiftWindow.end),
      shiftStartIso: shiftWindow.start.toISOString(),
      shiftEndIso: shiftWindow.end.toISOString(),
      shiftStartMs,
      shiftEndMs,
      observedAvgPoints,
    }
  }, [analytics.kpis.pointZeroPieces, analytics.kpis.totalPieces, analytics.weightTrendSeries, config])

  // Progreso del turno en tiempo real
  const shiftProgressView = useMemo(() => {
    if (!trendForecastView) return null
    const { shiftStartMs, shiftEndMs, observedAvgPoints } = trendForecastView
    const totalMs = shiftEndMs - shiftStartMs
    if (totalMs <= 0) return null

    const clampedNow = Math.min(Math.max(nowTs, shiftStartMs), shiftEndMs)
    const elapsedMs = clampedNow - shiftStartMs
    const remainingMs = Math.max(0, shiftEndMs - clampedNow)
    const elapsedPct = round2((elapsedMs / totalMs) * 100)

    const remainingHours = Math.floor(remainingMs / 3_600_000)
    const remainingMinutes = Math.floor((remainingMs % 3_600_000) / 60_000)
    const remainingLabel = remainingMs === 0
      ? 'Turno cerrado'
      : `${remainingHours}h ${remainingMinutes.toString().padStart(2, '0')}m`

    let weightTrend: 'up' | 'down' | 'flat' = 'flat'
    let weightDeltaGrams = 0
    let weightDeltaPct = 0
    if (observedAvgPoints.length >= 2) {
      const first = observedAvgPoints[0]
      const last = observedAvgPoints[observedAvgPoints.length - 1]
      if (first && last) {
        weightDeltaGrams = round2(last.y - first.y)
        weightDeltaPct = first.y > 0 ? round2((weightDeltaGrams / first.y) * 100) : 0
        if (weightDeltaPct > 0.5) weightTrend = 'up'
        else if (weightDeltaPct < -0.5) weightTrend = 'down'
        else weightTrend = 'flat'
      }
    }

    return {
      remainingMs,
      remainingLabel,
      elapsedPct,
      weightTrend,
      weightDeltaGrams,
      weightDeltaPct,
      isShiftClosed: remainingMs === 0,
    }
  }, [trendForecastView, nowTs])

  // Degradación de sensores: errores P0 con crecimiento en el tiempo
  const sensorDegradationView = useMemo(() => {
    const errorRecords: Array<{ ts: number; error: string; pieces: number }> = []
    for (const r of parsedData.pieceRecords) {
      if (r.gate !== 0 || !r.error) continue
      const ts = new Date(r.ts).getTime()
      if (Number.isFinite(ts)) errorRecords.push({ ts, error: r.error, pieces: r.pieces })
    }
    if (errorRecords.length === 0) {
      for (const r of parsedData.gate0Records) {
        const ts = new Date(r.ts).getTime()
        if (Number.isFinite(ts) && r.error) errorRecords.push({ ts, error: r.error, pieces: r.pieces })
      }
    }
    if (errorRecords.length < 8) return null

    const minTs = Math.min(...errorRecords.map((r) => r.ts))
    const maxTs = Math.max(...errorRecords.map((r) => r.ts))
    const spanMs = maxTs - minTs
    if (spanMs < 30 * 60_000) return null

    const quarterMs = spanMs / 4
    const byErrorQuarter = new Map<string, [number, number, number, number]>()
    for (const r of errorRecords) {
      const q = Math.min(3, Math.max(0, Math.floor((r.ts - minTs) / quarterMs))) as 0 | 1 | 2 | 3
      const cur: [number, number, number, number] = byErrorQuarter.get(r.error) ?? [0, 0, 0, 0]
      cur[q] = cur[q] + r.pieces
      byErrorQuarter.set(r.error, cur)
    }

    const degradations: Array<{
      error: string
      quarters: [number, number, number, number]
      total: number
      growthRatio: number
      severity: 'warn' | 'critical'
    }> = []
    for (const [error, quarters] of byErrorQuarter.entries()) {
      const q1 = quarters[0]
      const q4 = quarters[3]
      const total = quarters.reduce((s, v) => s + v, 0)
      if (total < 8 || q4 < 5) continue
      const baseline = Math.max(q1, 1)
      const ratio = q4 / baseline
      if (ratio < 1.5) continue
      const severity: 'warn' | 'critical' = ratio >= 3 ? 'critical' : 'warn'
      degradations.push({ error, quarters, total, growthRatio: round2(ratio), severity })
    }
    degradations.sort((a, b) => {
      if (a.severity !== b.severity) return a.severity === 'critical' ? -1 : 1
      return b.growthRatio - a.growthRatio
    })

    return {
      degradations,
      spanMinutes: Math.round(spanMs / 60_000),
      startIso: new Date(minTs).toISOString(),
      endIso: new Date(maxTs).toISOString(),
    }
  }, [parsedData.pieceRecords, parsedData.gate0Records])

  // Patrones multisesión: contexto histórico
  const multiSessionInsightsView = useMemo(() => {
    if (recentSessions.length < 2) return null

    const withAggregates = recentSessions.filter((s) => s.aggregates != null)
    if (withAggregates.length === 0) return null

    const avgP0 = withAggregates.reduce((sum, s) => sum + (s.aggregates.kpis.pointZeroPct ?? 0), 0) / withAggregates.length
    const avgPieces = withAggregates.reduce((sum, s) => sum + (s.aggregates.kpis.totalPieces ?? 0), 0) / withAggregates.length
    const avgWeight = withAggregates.reduce((sum, s) => sum + (s.aggregates.kpis.avgWeightGrams ?? 0), 0) / withAggregates.length

    const currentP0 = analytics.kpis.pointZeroPct
    const currentPieces = analytics.kpis.totalPieces
    const currentWeight = analytics.kpis.avgWeightGrams ?? 0

    const errorFrequency = new Map<string, { sessions: number; totalPieces: number }>()
    for (const s of withAggregates) {
      const topErrors = s.aggregates.kpis.topPointZeroErrors ?? []
      for (const err of topErrors) {
        const cur = errorFrequency.get(err.error) ?? { sessions: 0, totalPieces: 0 }
        cur.sessions += 1
        cur.totalPieces += err.pieces
        errorFrequency.set(err.error, cur)
      }
    }
    const recurrentErrors = Array.from(errorFrequency.entries())
      .filter(([, v]) => v.sessions >= 2)
      .map(([error, v]) => ({
        error,
        sessions: v.sessions,
        totalPieces: v.totalPieces,
        frequency: round2((v.sessions / withAggregates.length) * 100),
      }))
      .sort((a, b) => b.frequency - a.frequency)
      .slice(0, 5)

    const currentTopErrors = analytics.kpis.topPointZeroErrors ?? []
    const recurrentInCurrent = recurrentErrors.filter((re) =>
      currentTopErrors.some((ce) => ce.error === re.error),
    )

    const sortedP0 = [...withAggregates.map((s) => s.aggregates.kpis.pointZeroPct ?? 0)].sort((a, b) => a - b)
    const worseThanCurrent = sortedP0.filter((p) => p < currentP0).length
    const percentileP0 = round2((worseThanCurrent / sortedP0.length) * 100)

    const deltaP0 = round2(currentP0 - avgP0)
    const deltaPieces = Math.round(currentPieces - avgPieces)
    const deltaWeight = round2(currentWeight - avgWeight)

    return {
      sampleSize: withAggregates.length,
      avgP0: round2(avgP0),
      avgPieces: Math.round(avgPieces),
      avgWeight: round2(avgWeight),
      deltaP0,
      deltaPieces,
      deltaWeight,
      percentileP0,
      recurrentErrors,
      recurrentInCurrent,
    }
  }, [recentSessions, analytics.kpis])

  // Comparativa turno día/noche
  const shiftComparisonView = useMemo(() => {
    if (siblingSessions.length === 0) return null
    const sibling = siblingSessions[0]
    if (!sibling) return null
    const siblingAgg = sibling.aggregates
    if (!siblingAgg) return null

    const currentP0 = analytics.kpis.pointZeroPct
    const siblingP0 = siblingAgg.kpis.pointZeroPct
    const currentPieces = analytics.kpis.totalPieces
    const siblingPieces = siblingAgg.kpis.totalPieces
    const currentAvgWeight = analytics.kpis.avgWeightGrams ?? 0
    const siblingAvgWeight = siblingAgg.kpis.avgWeightGrams ?? 0
    const currentCalibre = analytics.kpis.dominantCalibre?.calibre ?? '—'
    const siblingCalibre = siblingAgg.kpis.dominantCalibre?.calibre ?? '—'

    const deltaP0 = round2(currentP0 - siblingP0)
    const deltaPieces = currentPieces - siblingPieces
    const deltaAvgWeight = round2(currentAvgWeight - siblingAvgWeight)
    const deltaAvgWeightPct = siblingAvgWeight > 0 ? round2((deltaAvgWeight / siblingAvgWeight) * 100) : 0

    const isCurrentDay = (currentSessionMeta?.shiftId ?? '').toLowerCase().includes('dia') || (currentSessionMeta?.shiftId ?? '').toLowerCase().includes('day')
    const currentLabel = isCurrentDay ? 'Día (actual)' : currentSessionMeta?.shiftId ? `${currentSessionMeta.shiftId} (actual)` : 'Actual'
    const siblingLabel = sibling.shiftId
      ? sibling.shiftId.toLowerCase().includes('dia') || sibling.shiftId.toLowerCase().includes('day') ? 'Día'
      : sibling.shiftId.toLowerCase().includes('noche') || sibling.shiftId.toLowerCase().includes('night') ? 'Noche'
      : sibling.shiftId
      : 'Turno hermano'

    return {
      currentLabel,
      siblingLabel,
      sessionDate: sibling.sessionDate,
      siblingId: sibling.id,
      current: {
        p0: currentP0,
        pieces: currentPieces,
        avgWeight: currentAvgWeight,
        calibre: currentCalibre,
      },
      sibling: {
        p0: siblingP0,
        pieces: siblingPieces,
        avgWeight: siblingAvgWeight,
        calibre: siblingCalibre,
      },
      delta: {
        p0: deltaP0,
        pieces: deltaPieces,
        avgWeight: deltaAvgWeight,
        avgWeightPct: deltaAvgWeightPct,
      },
    }
  }, [siblingSessions, analytics.kpis, currentSessionMeta?.shiftId])

  return {
    trendForecastView,
    shiftProgressView,
    sensorDegradationView,
    multiSessionInsightsView,
    shiftComparisonView,
  }
}
