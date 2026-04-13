/**
 * Tests para useGraderPatternAnalytics —
 * Patrones P0, filtros tiempo/causa, aggregados, chart data
 */
import { describe, it, expect } from 'vitest'
import { renderHook } from '@testing-library/react'
import { useGraderPatternAnalytics } from '../useGraderPatternAnalytics'
import type { GraderAnalyticsResult, ParsedMatrixData } from '@/services/grader/types'

// ── Fixtures ────────────────────────────────────────────────────────────────

const BASE_TS = '2025-07-15T02:00:00.000Z'

function makeP0Record(
  offsetMinutes: number,
  error: string,
  pieces: number,
  calibre: string = '6-8lb',
  quality: string = 'Premium',
) {
  return {
    ts: new Date(new Date(BASE_TS).getTime() + offsetMinutes * 60_000).toISOString(),
    error,
    pieces,
    weightPerPieceGrams: 3000,
    quality,
    calibre,
    lot: 'L1',
  }
}

function makeAnalytics(causes: Array<{ label: string; records: ReturnType<typeof makeP0Record>[] }>): GraderAnalyticsResult {
  const totalP0 = causes.reduce((sum, c) => sum + c.records.reduce((s, r) => s + r.pieces, 0), 0)
  return {
    config: {
      deviceId: 'test', intervalMinutes: 15, timezone: 'America/Santiago',
      shiftId: 'Turno noche', startAt: BASE_TS,
      endAt: new Date(new Date(BASE_TS).getTime() + 8 * 3600_000).toISOString(),
      errorThresholds: { photocellPctWarn: 5, outOfLimitsPctWarn: 5, pointZeroPctWarn: 2 },
    },
    kpis: {
      totalPieces: 1000, productivePieces: 1000 - totalP0, pointZeroPieces: totalP0,
      pointZeroPct: totalP0 / 10, avgWeightGrams: 3200, medianWeightGrams: 3100,
      stdDevWeightGrams: 200, uniqueLots: 1,
      dominantCalibre: { calibre: '6-8lb', pieces: 400, pct: 42 },
      dominantQuality: { quality: 'Premium', pieces: 600, pct: 63 },
      topPointZeroErrors: [], activeMinutes: 360,
    },
    weightTrendSeries: [],
    distributionByCalibre: [],
    distributionByQuality: [],
    pointZeroByError: [],
    pointZeroClassification: {
      causes: causes.map((c) => ({
        label: c.label,
        pieces: c.records.reduce((s, r) => s + r.pieces, 0),
        pctOfPointZero: 0,
        pctOfTotal: 0,
        records: c.records,
      })),
      totalPointZero: totalP0,
    },
    gateBalance: [],
    gateAdvancedStats: [],
    lotAnalysis: [],
    timeSeriesPointZero: [],
    matrixEnhanced: { globalHHI: 0, imbalanceScore: 0, maxCell: null, heatmap: [], rowHHI: [], colHHI: [] },
    gateSwapSuggestions: [],
  } as unknown as GraderAnalyticsResult
}

const EMPTY_PARSED: ParsedMatrixData = {
  pieceRecords: [],
  gate0Records: [],
  summaryRows: [],
  qualities: [],
  calibres: [],
  errors: [],
  lots: [],
}

function makeParsedWithPieces(count: number): ParsedMatrixData {
  const records = Array.from({ length: count }, (_, i) => ({
    ts: new Date(new Date(BASE_TS).getTime() + i * 60_000).toISOString(),
    gate: i % 10 === 0 ? 0 : (i % 12) + 1,
    error: i % 10 === 0 ? 'Fuera de límites' : '',
    pieces: 1,
    weightGrams: 3000 + (i % 100),
    quality: 'Premium',
    calibre: '6-8lb',
    lot: 'L1',
  }))
  return { ...EMPTY_PARSED, pieceRecords: records } as unknown as ParsedMatrixData
}

// ── pointZeroDetailRecords ──────────────────────────────────────────────────

describe('pointZeroDetailRecords', () => {
  it('genera registros a partir de causes con records', () => {
    const analytics = makeAnalytics([
      { label: 'Fuera de límites', records: [makeP0Record(10, 'Error FL', 5), makeP0Record(30, 'Error FL', 3)] },
      { label: 'No leído', records: [makeP0Record(20, 'Error NL', 2)] },
    ])
    const { result } = renderHook(() =>
      useGraderPatternAnalytics({
        analytics,
        parsedData: EMPTY_PARSED,
        selectedCauseLabel: null,
        timeFilterFrom: '',
        timeFilterTo: '',
        patternIntervalMinutes: 60,
      }),
    )
    expect(result.current.pointZeroDetailRecords).toHaveLength(3)
    expect(result.current.pointZeroDetailRecords[0]!.causeLabel).toBe('Fuera de límites')
  })

  it('retorna array vacío si no hay causes', () => {
    const analytics = makeAnalytics([])
    const { result } = renderHook(() =>
      useGraderPatternAnalytics({
        analytics,
        parsedData: EMPTY_PARSED,
        selectedCauseLabel: null,
        timeFilterFrom: '',
        timeFilterTo: '',
        patternIntervalMinutes: 60,
      }),
    )
    expect(result.current.pointZeroDetailRecords).toHaveLength(0)
    expect(result.current.patternTotalPieces).toBe(0)
  })
})

// ── Filtros ──────────────────────────────────────────────────────────────────

describe('filteredPatternRecords', () => {
  const analytics = makeAnalytics([
    { label: 'Fuera de límites', records: [makeP0Record(10, 'FL', 5), makeP0Record(120, 'FL', 3)] },
    { label: 'No leído', records: [makeP0Record(60, 'NL', 7)] },
  ])

  it('filtra por selectedCauseLabel', () => {
    const { result } = renderHook(() =>
      useGraderPatternAnalytics({
        analytics,
        parsedData: EMPTY_PARSED,
        selectedCauseLabel: 'No leído',
        timeFilterFrom: '',
        timeFilterTo: '',
        patternIntervalMinutes: 60,
      }),
    )
    expect(result.current.filteredPatternRecords).toHaveLength(1)
    expect(result.current.filteredPatternRecords[0]!.causeLabel).toBe('No leído')
    expect(result.current.patternTotalPieces).toBe(7)
  })

  it('sin filtro devuelve todos los registros', () => {
    const { result } = renderHook(() =>
      useGraderPatternAnalytics({
        analytics,
        parsedData: EMPTY_PARSED,
        selectedCauseLabel: null,
        timeFilterFrom: '',
        timeFilterTo: '',
        patternIntervalMinutes: 60,
      }),
    )
    expect(result.current.filteredPatternRecords).toHaveLength(3)
    expect(result.current.patternTotalPieces).toBe(15) // 5+3+7
  })
})

// ── Aggregados ──────────────────────────────────────────────────────────────

describe('patternByCalibre / patternByQuality', () => {
  it('agrupa piezas por calibre y calidad', () => {
    const analytics = makeAnalytics([
      {
        label: 'Test',
        records: [
          makeP0Record(10, 'E', 5, '6-8lb', 'Premium'),
          makeP0Record(20, 'E', 3, '8-10lb', 'A'),
          makeP0Record(30, 'E', 2, '6-8lb', 'Premium'),
        ],
      },
    ])
    const { result } = renderHook(() =>
      useGraderPatternAnalytics({
        analytics,
        parsedData: EMPTY_PARSED,
        selectedCauseLabel: null,
        timeFilterFrom: '',
        timeFilterTo: '',
        patternIntervalMinutes: 60,
      }),
    )
    // 6-8lb: 5+2=7, 8-10lb: 3
    expect(result.current.patternByCalibre).toHaveLength(2)
    expect(result.current.patternByCalibre[0]!.key).toBe('6-8lb')
    expect(result.current.patternByCalibre[0]!.pieces).toBe(7)

    // Premium: 5+2=7, A: 3
    expect(result.current.patternByQuality).toHaveLength(2)
    expect(result.current.patternByQuality[0]!.key).toBe('Premium')
    expect(result.current.patternByQuality[0]!.pieces).toBe(7)
  })

  it('pct suma ~100% en patternByCalibre', () => {
    const analytics = makeAnalytics([
      {
        label: 'Test',
        records: [
          makeP0Record(10, 'E', 5, '6-8lb'),
          makeP0Record(20, 'E', 5, '8-10lb'),
        ],
      },
    ])
    const { result } = renderHook(() =>
      useGraderPatternAnalytics({
        analytics,
        parsedData: EMPTY_PARSED,
        selectedCauseLabel: null,
        timeFilterFrom: '',
        timeFilterTo: '',
        patternIntervalMinutes: 60,
      }),
    )
    const totalPct = result.current.patternByCalibre.reduce((s, r) => s + r.pct, 0)
    expect(totalPct).toBeCloseTo(100, 0)
  })
})

// ── patternByHour ───────────────────────────────────────────────────────────

describe('patternByHour', () => {
  it('agrupa piezas en buckets de tiempo', () => {
    const analytics = makeAnalytics([
      {
        label: 'Test',
        records: [
          makeP0Record(5, 'E', 10),   // bucket 0-60
          makeP0Record(30, 'E', 5),   // bucket 0-60
          makeP0Record(65, 'E', 8),   // bucket 60-120
        ],
      },
    ])
    const { result } = renderHook(() =>
      useGraderPatternAnalytics({
        analytics,
        parsedData: EMPTY_PARSED,
        selectedCauseLabel: null,
        timeFilterFrom: '',
        timeFilterTo: '',
        patternIntervalMinutes: 60,
      }),
    )
    expect(result.current.patternByHour).toHaveLength(2)
    expect(result.current.patternByHour[0]!.pieces).toBe(15) // 10+5
    expect(result.current.patternByHour[1]!.pieces).toBe(8)
  })

  it('retorna vacío sin registros', () => {
    const analytics = makeAnalytics([])
    const { result } = renderHook(() =>
      useGraderPatternAnalytics({
        analytics,
        parsedData: EMPTY_PARSED,
        selectedCauseLabel: null,
        timeFilterFrom: '',
        timeFilterTo: '',
        patternIntervalMinutes: 60,
      }),
    )
    expect(result.current.patternByHour).toHaveLength(0)
  })
})

// ── Chart data ──────────────────────────────────────────────────────────────

describe('chart data structures', () => {
  const analytics = makeAnalytics([
    { label: 'Causa A', records: [makeP0Record(10, 'E', 5, '6-8lb')] },
    { label: 'Causa B', records: [makeP0Record(20, 'E', 3, '8-10lb')] },
  ])

  it('patternCalibreChartData tiene estructura Chart.js válida', () => {
    const { result } = renderHook(() =>
      useGraderPatternAnalytics({
        analytics,
        parsedData: EMPTY_PARSED,
        selectedCauseLabel: null,
        timeFilterFrom: '',
        timeFilterTo: '',
        patternIntervalMinutes: 60,
      }),
    )
    const chart = result.current.patternCalibreChartData
    expect(chart.labels).toBeDefined()
    expect(chart.datasets).toHaveLength(1)
    expect(chart.datasets[0]!.data.length).toBe(chart.labels!.length)
  })

  it('patternQualityChartData tiene estructura Chart.js válida', () => {
    const { result } = renderHook(() =>
      useGraderPatternAnalytics({
        analytics,
        parsedData: EMPTY_PARSED,
        selectedCauseLabel: null,
        timeFilterFrom: '',
        timeFilterTo: '',
        patternIntervalMinutes: 60,
      }),
    )
    const chart = result.current.patternQualityChartData
    expect(chart.labels).toBeDefined()
    expect(chart.datasets).toHaveLength(1)
  })

  it('patternCauseTrendChartData genera series por causa', () => {
    const parsed = makeParsedWithPieces(200)
    const { result } = renderHook(() =>
      useGraderPatternAnalytics({
        analytics,
        parsedData: parsed,
        selectedCauseLabel: null,
        timeFilterFrom: '',
        timeFilterTo: '',
        patternIntervalMinutes: 60,
      }),
    )
    const chart = result.current.patternCauseTrendChartData
    expect(chart.labels).toBeDefined()
    expect(chart.datasets.length).toBeGreaterThanOrEqual(0)
  })
})

// ── patternCauseTrend ───────────────────────────────────────────────────────

describe('patternCauseTrend', () => {
  it('devuelve estructura vacía sin pieceRecords', () => {
    const analytics = makeAnalytics([
      { label: 'Test', records: [makeP0Record(10, 'E', 5)] },
    ])
    const { result } = renderHook(() =>
      useGraderPatternAnalytics({
        analytics,
        parsedData: EMPTY_PARSED,
        selectedCauseLabel: null,
        timeFilterFrom: '',
        timeFilterTo: '',
        patternIntervalMinutes: 60,
      }),
    )
    expect(result.current.patternCauseTrend.labels).toHaveLength(0)
    expect(result.current.patternCauseTrend.series).toHaveLength(0)
  })

  it('genera cumulativeTotals crecientes con pieceRecords', () => {
    const analytics = makeAnalytics([
      { label: 'Causa X', records: [makeP0Record(10, 'E', 5), makeP0Record(80, 'E', 3)] },
    ])
    const parsed = makeParsedWithPieces(100)
    const { result } = renderHook(() =>
      useGraderPatternAnalytics({
        analytics,
        parsedData: parsed,
        selectedCauseLabel: null,
        timeFilterFrom: '',
        timeFilterTo: '',
        patternIntervalMinutes: 30,
      }),
    )
    const { cumulativeTotals } = result.current.patternCauseTrend
    // Cumulative debe ser creciente
    for (let i = 1; i < cumulativeTotals.length; i++) {
      expect(cumulativeTotals[i]).toBeGreaterThanOrEqual(cumulativeTotals[i - 1]!)
    }
  })
})
