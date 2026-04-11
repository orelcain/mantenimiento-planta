/**
 * Hook que agrupa todos los memos de análisis de patrones del tab "Punto Cero"
 * del Dashboard del Grader. Extraído en iter 5 del refactor 2026-04-10 para
 * bajar la cantidad de hooks directos del componente principal.
 *
 * Consume datos crudos (analytics + parsedData) + estados de filtros y devuelve:
 *  - Agregados: pointZeroDetailRecords, filteredPatternRecords, patternTotalPieces,
 *    patternByCalibre/Quality/Hour, patternIntervalDetailsByLabel, patternCauseTrend
 *  - Datos para charts: patternCalibreChartData, patternQualityChartData,
 *    patternHourChartData, patternCauseTrendChartData
 *
 * Los consumidores son:
 *  - AnalisisGraderDashboardPage (para exportJSON)
 *  - GraderPuntoCeroTab (todos los charts y tablas del tab)
 */
import { useMemo } from 'react'
import type { ChartData } from 'chart.js'
import {
  formatDateToHHMM,
  isMinuteWithinRange,
  parseTimeHHMMToMinutes,
  resolveCalibreLabel,
} from '@/services/grader/graderDashboardHelpers'
import type { GraderAnalyticsResult, ParsedMatrixData } from '@/services/grader/types'

// ─── Tipos de salida ───────────────────────────────────────────────────────

export interface PointZeroDetailRecord {
  causeLabel: string
  ts: string
  error: string
  pieces: number
  weightPerPieceGrams?: number
  quality?: string
  calibre: string
  lot?: string
}

export interface PatternRow {
  key: string
  pieces: number
  pct: number
}

export interface PatternHourRow {
  key: string
  hour: string
  rangeLabel: string
  pieces: number
  pct: number
}

export interface PatternIntervalDetail {
  totalPieces: number
  calibres: Array<{ key: string; pieces: number }>
  qualities: Array<{ key: string; pieces: number }>
}

export interface PatternCauseTrendView {
  labels: string[]
  ranges: string[]
  bucketKeys: number[]
  intervalTotals: number[]
  cumulativeTotals: number[]
  series: Array<{
    label: string
    pctCumulative: number[]
    piecesInterval: number[]
    piecesCumulative: number[]
  }>
}

export interface GraderPatternAnalyticsView {
  pointZeroDetailRecords: PointZeroDetailRecord[]
  filteredPatternRecords: PointZeroDetailRecord[]
  patternTotalPieces: number
  patternByCalibre: PatternRow[]
  patternByQuality: PatternRow[]
  patternByHour: PatternHourRow[]
  patternIntervalDetailsByLabel: Map<string, PatternIntervalDetail>
  patternCalibreChartData: ChartData<'bar'>
  patternQualityChartData: ChartData<'bar'>
  patternHourChartData: ChartData<'line'>
  patternCauseTrend: PatternCauseTrendView
  patternCauseTrendChartData: ChartData<'line'>
}

interface Params {
  analytics: GraderAnalyticsResult
  parsedData: ParsedMatrixData
  selectedCauseLabel: string | null
  timeFilterFrom: string
  timeFilterTo: string
  patternIntervalMinutes: number
}

// ─── Hook ──────────────────────────────────────────────────────────────────

export function useGraderPatternAnalytics({
  analytics,
  parsedData,
  selectedCauseLabel,
  timeFilterFrom,
  timeFilterTo,
  patternIntervalMinutes,
}: Params): GraderPatternAnalyticsView {
  const pointZeroDetailRecords = useMemo<PointZeroDetailRecord[]>(() => {
    return analytics.pointZeroClassification.causes.flatMap((cause) => {
      const rows = cause.records ?? []
      return rows.map((record) => ({
        causeLabel: cause.label,
        ts: record.ts,
        error: record.error,
        pieces: record.pieces,
        weightPerPieceGrams: record.weightPerPieceGrams,
        quality: record.quality,
        calibre: resolveCalibreLabel(record.calibre, record.weightPerPieceGrams),
        lot: record.lot,
      }))
    })
  }, [analytics.pointZeroClassification.causes])

  const filteredPatternRecords = useMemo(() => {
    const fromMinute = parseTimeHHMMToMinutes(timeFilterFrom)
    const toMinute = parseTimeHHMMToMinutes(timeFilterTo)

    return pointZeroDetailRecords.filter((record) => {
      if (selectedCauseLabel && record.causeLabel !== selectedCauseLabel) return false
      const dt = new Date(record.ts)
      if (!Number.isFinite(dt.getTime())) return false
      const minuteOfDay = dt.getHours() * 60 + dt.getMinutes()
      return isMinuteWithinRange(minuteOfDay, fromMinute, toMinute)
    })
  }, [pointZeroDetailRecords, selectedCauseLabel, timeFilterFrom, timeFilterTo])

  const patternTotalPieces = useMemo(
    () => filteredPatternRecords.reduce((sum, r) => sum + r.pieces, 0),
    [filteredPatternRecords],
  )

  const patternByCalibre = useMemo<PatternRow[]>(() => {
    const map = new Map<string, number>()
    for (const r of filteredPatternRecords) {
      const key = r.calibre || 'N/D'
      map.set(key, (map.get(key) ?? 0) + r.pieces)
    }
    return Array.from(map.entries())
      .map(([key, pieces]) => ({
        key,
        pieces,
        pct: patternTotalPieces > 0 ? Math.round((pieces / patternTotalPieces) * 10000) / 100 : 0,
      }))
      .sort((a, b) => b.pieces - a.pieces)
  }, [filteredPatternRecords, patternTotalPieces])

  const patternByQuality = useMemo<PatternRow[]>(() => {
    const map = new Map<string, number>()
    for (const r of filteredPatternRecords) {
      const key = r.quality || 'Unknown'
      map.set(key, (map.get(key) ?? 0) + r.pieces)
    }
    return Array.from(map.entries())
      .map(([key, pieces]) => ({
        key,
        pieces,
        pct: patternTotalPieces > 0 ? Math.round((pieces / patternTotalPieces) * 10000) / 100 : 0,
      }))
      .sort((a, b) => b.pieces - a.pieces)
  }, [filteredPatternRecords, patternTotalPieces])

  const patternByHour = useMemo<PatternHourRow[]>(() => {
    const safeInterval = Math.min(60, Math.max(1, Math.round(patternIntervalMinutes || 60)))
    const intervalMs = safeInterval * 60_000
    const validTimestamps = filteredPatternRecords
      .map((record) => new Date(record.ts).getTime())
      .filter((value) => Number.isFinite(value))

    if (validTimestamps.length === 0) return []

    const anchorMs = Math.min(...validTimestamps)
    const map = new Map<number, number>()
    for (const r of filteredPatternRecords) {
      const dt = new Date(r.ts)
      const ts = dt.getTime()
      if (!Number.isFinite(ts)) continue
      const bucketIndex = Math.floor((ts - anchorMs) / intervalMs)
      const bucketStartMs = anchorMs + (bucketIndex * intervalMs)
      map.set(bucketStartMs, (map.get(bucketStartMs) ?? 0) + r.pieces)
    }
    return Array.from(map.entries())
      .sort((a, b) => a[0] - b[0])
      .map(([bucketStartMs, pieces]) => {
        const bucketEndMs = bucketStartMs + intervalMs
        const startDate = new Date(bucketStartMs)
        const endDate = new Date(bucketEndMs)
        return {
          key: String(bucketStartMs),
          hour: formatDateToHHMM(endDate),
          rangeLabel: `${formatDateToHHMM(startDate)} - ${formatDateToHHMM(endDate)}`,
          pieces,
          pct: patternTotalPieces > 0 ? Math.round((pieces / patternTotalPieces) * 10000) / 100 : 0,
        }
      })
  }, [filteredPatternRecords, patternIntervalMinutes, patternTotalPieces])

  const patternIntervalDetailsByLabel = useMemo<Map<string, PatternIntervalDetail>>(() => {
    const safeInterval = Math.min(60, Math.max(1, Math.round(patternIntervalMinutes || 60)))
    const intervalMs = safeInterval * 60_000
    const validTimestamps = filteredPatternRecords
      .map((record) => new Date(record.ts).getTime())
      .filter((value) => Number.isFinite(value))

    if (validTimestamps.length === 0) return new Map<string, PatternIntervalDetail>()

    const anchorMs = Math.min(...validTimestamps)
    const bucketMap = new Map<string, { totalPieces: number; calibreMap: Map<string, number>; qualityMap: Map<string, number> }>()

    for (const r of filteredPatternRecords) {
      const dt = new Date(r.ts)
      const ts = dt.getTime()
      if (!Number.isFinite(ts)) continue
      const bucketIndex = Math.floor((ts - anchorMs) / intervalMs)
      const bucketStartMs = anchorMs + (bucketIndex * intervalMs)
      const bucketKey = String(bucketStartMs)

      const bucket = bucketMap.get(bucketKey) || { totalPieces: 0, calibreMap: new Map<string, number>(), qualityMap: new Map<string, number>() }
      bucket.totalPieces += r.pieces

      const calibreKey = r.calibre || 'N/D'
      bucket.calibreMap.set(calibreKey, (bucket.calibreMap.get(calibreKey) ?? 0) + r.pieces)

      const qualityKey = r.quality || 'Unknown'
      bucket.qualityMap.set(qualityKey, (bucket.qualityMap.get(qualityKey) ?? 0) + r.pieces)

      bucketMap.set(bucketKey, bucket)
    }

    const detailMap = new Map<string, PatternIntervalDetail>()
    for (const [label, bucket] of bucketMap.entries()) {
      const calibres = Array.from(bucket.calibreMap.entries())
        .map(([key, pieces]) => ({ key, pieces }))
        .sort((a, b) => b.pieces - a.pieces)
      const qualities = Array.from(bucket.qualityMap.entries())
        .map(([key, pieces]) => ({ key, pieces }))
        .sort((a, b) => b.pieces - a.pieces)
      detailMap.set(label, { totalPieces: bucket.totalPieces, calibres, qualities })
    }
    return detailMap
  }, [filteredPatternRecords, patternIntervalMinutes])

  const patternCalibreChartData = useMemo<ChartData<'bar'>>(() => ({
    labels: patternByCalibre.map((d) => d.key),
    datasets: [
      {
        label: '% por calibre',
        data: patternByCalibre.map((d) => d.pct),
        backgroundColor: 'rgba(59,130,246,0.75)',
        borderRadius: 6,
      },
    ],
  }), [patternByCalibre])

  const patternQualityChartData = useMemo<ChartData<'bar'>>(() => ({
    labels: patternByQuality.map((d) => d.key),
    datasets: [
      {
        label: '% por calidad',
        data: patternByQuality.map((d) => d.pct),
        backgroundColor: 'rgba(16,185,129,0.75)',
        borderRadius: 6,
      },
    ],
  }), [patternByQuality])

  const patternHourChartData = useMemo<ChartData<'line'>>(() => ({
    labels: patternByHour.map((d) => d.hour),
    datasets: [
      {
        label: 'Piezas',
        data: patternByHour.map((d) => d.pieces),
        borderColor: 'rgba(239,68,68,0.9)',
        backgroundColor: 'rgba(239,68,68,0.2)',
        fill: true,
        tension: 0.3,
      },
    ],
  }), [patternByHour])

  const patternCauseTrend = useMemo<PatternCauseTrendView>(() => {
    const safeInterval = Math.min(60, Math.max(1, Math.round(patternIntervalMinutes || 60)))
    const intervalMs = safeInterval * 60_000
    const fromMinute = parseTimeHHMMToMinutes(timeFilterFrom)
    const toMinute = parseTimeHHMMToMinutes(timeFilterTo)

    const pieceRecordsInRange = parsedData.pieceRecords.filter((record) => {
      const dt = new Date(record.ts)
      if (!Number.isFinite(dt.getTime())) return false
      const minuteOfDay = dt.getHours() * 60 + dt.getMinutes()
      return isMinuteWithinRange(minuteOfDay, fromMinute, toMinute)
    })

    if (pieceRecordsInRange.length === 0) {
      return {
        labels: [],
        ranges: [],
        bucketKeys: [],
        intervalTotals: [],
        cumulativeTotals: [],
        series: [],
      }
    }

    const anchorMs = Math.min(...pieceRecordsInRange.map((record) => new Date(record.ts).getTime()))
    const totalByBucket = new Map<number, number>()
    for (const record of pieceRecordsInRange) {
      const ts = new Date(record.ts).getTime()
      if (!Number.isFinite(ts)) continue
      const bucketIndex = Math.floor((ts - anchorMs) / intervalMs)
      const bucketStartMs = anchorMs + (bucketIndex * intervalMs)
      totalByBucket.set(bucketStartMs, (totalByBucket.get(bucketStartMs) ?? 0) + record.pieces)
    }

    const causeRecordsInRange = pointZeroDetailRecords.filter((record) => {
      const dt = new Date(record.ts)
      if (!Number.isFinite(dt.getTime())) return false
      const minuteOfDay = dt.getHours() * 60 + dt.getMinutes()
      return isMinuteWithinRange(minuteOfDay, fromMinute, toMinute)
    })

    const causeByBucket = new Map<string, Map<number, number>>()
    for (const record of causeRecordsInRange) {
      const ts = new Date(record.ts).getTime()
      if (!Number.isFinite(ts)) continue
      const bucketIndex = Math.floor((ts - anchorMs) / intervalMs)
      const bucketStartMs = anchorMs + (bucketIndex * intervalMs)
      const row = causeByBucket.get(record.causeLabel) ?? new Map<number, number>()
      row.set(bucketStartMs, (row.get(bucketStartMs) ?? 0) + record.pieces)
      causeByBucket.set(record.causeLabel, row)
    }

    const bucketKeys = Array.from(totalByBucket.keys()).sort((a, b) => a - b)
    const intervalLabels = bucketKeys.map((bucketStartMs) => formatDateToHHMM(new Date(bucketStartMs + intervalMs)))
    const intervalRanges = bucketKeys.map((bucketStartMs) => {
      const start = formatDateToHHMM(new Date(bucketStartMs))
      const end = formatDateToHHMM(new Date(bucketStartMs + intervalMs))
      return `${start} - ${end}`
    })
    const totals = bucketKeys.map((bucketStartMs) => totalByBucket.get(bucketStartMs) ?? 0)

    const cumulativeTotals: number[] = []
    let runningTotal = 0
    for (const total of totals) {
      runningTotal += total
      cumulativeTotals.push(runningTotal)
    }

    const labels = [formatDateToHHMM(new Date(anchorMs)), ...intervalLabels]
    const ranges = ['Inicio turno', ...intervalRanges]
    const intervalTotals = [0, ...totals]
    const cumulativeTotalsWithStart = [0, ...cumulativeTotals]

    const series = analytics.pointZeroClassification.causes
      .map((cause) => cause.label)
      .filter((label) => (causeByBucket.get(label)?.size ?? 0) > 0)
      .map((label) => {
        const piecesByBucket = causeByBucket.get(label) ?? new Map<number, number>()
        const piecesInterval = bucketKeys.map((bucketStartMs) => piecesByBucket.get(bucketStartMs) ?? 0)

        const piecesCumulativeRaw: number[] = []
        let runningCause = 0
        for (const pieces of piecesInterval) {
          runningCause += pieces
          piecesCumulativeRaw.push(runningCause)
        }

        const pctCumulativeRaw = piecesCumulativeRaw.map((p, idx) => {
          const total = cumulativeTotals[idx] ?? 0
          return total > 0 ? Math.round((p / total) * 10000) / 100 : 0
        })

        return {
          label,
          piecesInterval: [0, ...piecesInterval],
          piecesCumulative: [0, ...piecesCumulativeRaw],
          pctCumulative: [0, ...pctCumulativeRaw],
        }
      })

    return { labels, ranges, bucketKeys, intervalTotals, cumulativeTotals: cumulativeTotalsWithStart, series }
  }, [analytics.pointZeroClassification.causes, parsedData.pieceRecords, patternIntervalMinutes, pointZeroDetailRecords, timeFilterFrom, timeFilterTo])

  const patternCauseTrendChartData = useMemo<ChartData<'line'>>(() => ({
    labels: patternCauseTrend.labels,
    datasets: patternCauseTrend.series.map((cause, idx) => {
      const lc = cause.label.toLowerCase()
      const palette = [
        { border: 'rgba(239,68,68,0.95)', bg: 'rgba(239,68,68,0.15)' },
        { border: 'rgba(245,158,11,0.95)', bg: 'rgba(245,158,11,0.15)' },
        { border: 'rgba(139,92,246,0.95)', bg: 'rgba(139,92,246,0.15)' },
        { border: 'rgba(16,185,129,0.95)', bg: 'rgba(16,185,129,0.15)' },
        { border: 'rgba(59,130,246,0.95)', bg: 'rgba(59,130,246,0.15)' },
      ]

      let color = palette[idx % palette.length] ?? { border: 'rgba(239,68,68,0.95)', bg: 'rgba(239,68,68,0.15)' }
      if (lc.includes('no leído') || lc.includes('fotoc')) color = { border: 'rgba(234,179,8,0.95)', bg: 'rgba(234,179,8,0.15)' }
      else if (lc.includes('fuera de límites')) color = { border: 'rgba(239,68,68,0.95)', bg: 'rgba(239,68,68,0.15)' }
      else if (lc.includes('puerta no preparada')) color = { border: 'rgba(16,185,129,0.95)', bg: 'rgba(16,185,129,0.15)' }
      else if (lc.includes('fuera de rango')) color = { border: 'rgba(59,130,246,0.95)', bg: 'rgba(59,130,246,0.15)' }

      return {
        label: cause.label,
        data: cause.pctCumulative,
        borderColor: color.border,
        backgroundColor: color.bg,
        pointRadius: 2,
        pointHoverRadius: 4,
        borderWidth: 2,
        tension: 0.25,
        fill: false,
      }
    }),
  }), [patternCauseTrend])

  return {
    pointZeroDetailRecords,
    filteredPatternRecords,
    patternTotalPieces,
    patternByCalibre,
    patternByQuality,
    patternByHour,
    patternIntervalDetailsByLabel,
    patternCalibreChartData,
    patternQualityChartData,
    patternHourChartData,
    patternCauseTrend,
    patternCauseTrendChartData,
  }
}
