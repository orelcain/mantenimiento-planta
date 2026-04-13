/**
 * Tests para useGraderDashboardAnalytics —
 * 5 views: trendForecast, shiftProgress, sensorDegradation, multiSession, shiftComparison
 */
import { describe, it, expect } from 'vitest'
import { renderHook } from '@testing-library/react'
import { useGraderDashboardAnalytics } from '../useGraderDashboardAnalytics'
import type {
  GraderAnalysisConfig,
  GraderAnalyticsResult,
  GraderSession,
  ParsedMatrixData,
} from '@/services/grader/types'

// ── Fixtures ────────────────────────────────────────────────────────────────

const SHIFT_START_ISO = '2025-07-15T02:00:00.000Z' // 22:00 hora Chile
const INTERVAL_MS = 15 * 60_000

function makeBucket(offsetIndex: number, avgWeight: number, pieces: number) {
  const ts = new Date(new Date(SHIFT_START_ISO).getTime() + offsetIndex * INTERVAL_MS)
  return {
    bucketStart: ts.toISOString(),
    avgWeightGrams: avgWeight,
    stdDevWeightGrams: 50,
    movingAvg5: avgWeight,
    pieces,
    medianWeightGrams: avgWeight,
    dominantLot: 'L1',
    cvPct: 5,
  }
}

function makeMinimalAnalytics(overrides?: Partial<GraderAnalyticsResult>): GraderAnalyticsResult {
  return {
    config: {
      deviceId: 'test',
      intervalMinutes: 15,
      timezone: 'America/Santiago',
      shiftId: 'Turno noche',
      startAt: SHIFT_START_ISO,
      endAt: new Date(new Date(SHIFT_START_ISO).getTime() + 8 * 3600_000).toISOString(),
      errorThresholds: { photocellPctWarn: 5, outOfLimitsPctWarn: 5, pointZeroPctWarn: 2 },
    },
    kpis: {
      totalPieces: 1000,
      productivePieces: 950,
      pointZeroPieces: 50,
      pointZeroPct: 5,
      avgWeightGrams: 3200,
      medianWeightGrams: 3100,
      stdDevWeightGrams: 200,
      uniqueLots: 3,
      dominantCalibre: { calibre: '6-8lb', pieces: 400, pct: 42.1 },
      dominantQuality: { quality: 'Premium', pieces: 600, pct: 63.2 },
      topPointZeroErrors: [{ error: 'Fuera de límites', pieces: 30, pct: 60 }],
      activeMinutes: 360,
    },
    weightTrendSeries: [
      makeBucket(0, 3100, 60),
      makeBucket(1, 3200, 65),
      makeBucket(2, 3150, 62),
      makeBucket(3, 3250, 70),
      makeBucket(4, 3300, 68),
    ],
    distributionByCalibre: [],
    distributionByQuality: [],
    pointZeroByError: [],
    pointZeroClassification: { causes: [], totalPointZero: 50 },
    gateBalance: [],
    gateAdvancedStats: [],
    lotAnalysis: [],
    timeSeriesPointZero: [],
    matrixEnhanced: { globalHHI: 0, imbalanceScore: 0, maxCell: null, heatmap: [], rowHHI: [], colHHI: [] },
    gateSwapSuggestions: [],
    ...overrides,
  } as GraderAnalyticsResult
}

function makeConfig(overrides?: Partial<GraderAnalysisConfig>): GraderAnalysisConfig {
  return {
    deviceId: 'test',
    intervalMinutes: 15,
    timezone: 'America/Santiago',
    shiftId: 'Turno noche',
    startAt: SHIFT_START_ISO,
    endAt: new Date(new Date(SHIFT_START_ISO).getTime() + 8 * 3600_000).toISOString(),
    errorThresholds: { photocellPctWarn: 5, outOfLimitsPctWarn: 5, pointZeroPctWarn: 2 },
    ...overrides,
  } as GraderAnalysisConfig
}

const EMPTY_PARSED: ParsedMatrixData = {
  files: [],
  pieceRecords: [],
  gate0Records: [],
  folioRecords: [],
  qualitySummary: [],
  productionSummary: [],
  inferred: {},
}

function makeSession(id: string, overrides?: Partial<GraderSession>): GraderSession {
  return {
    id,
    sessionDate: '2025-07-15',
    shiftId: 'Turno día',
    deviceId: 'test',
    createdAt: new Date().toISOString(),
    status: 'closed',
    aggregates: {
      kpis: {
        totalPieces: 800,
        pointZeroPct: 4,
        avgWeightGrams: 3100,
        pointZeroPieces: 32,
        productivePieces: 768,
        topPointZeroErrors: [{ error: 'Fuera de límites', pieces: 20, pct: 62 }],
      },
    },
    ...overrides,
  } as GraderSession
}

// ── trendForecastView ───────────────────────────────────────────────────────

describe('trendForecastView', () => {
  it('retorna null si no hay weightTrendSeries', () => {
    const analytics = makeMinimalAnalytics({ weightTrendSeries: [] })
    const { result } = renderHook(() =>
      useGraderDashboardAnalytics({
        analytics,
        parsedData: EMPTY_PARSED,
        config: makeConfig(),
        nowTs: Date.now(),
        recentSessions: [],
        siblingSessions: [],
      }),
    )
    expect(result.current.trendForecastView).toBeNull()
  })

  it('genera labels, datos observados y proyección cuando hay serie', () => {
    const analytics = makeMinimalAnalytics()
    const { result } = renderHook(() =>
      useGraderDashboardAnalytics({
        analytics,
        parsedData: EMPTY_PARSED,
        config: makeConfig(),
        nowTs: new Date(SHIFT_START_ISO).getTime() + 2 * 3600_000,
        recentSessions: [],
        siblingSessions: [],
      }),
    )
    const view = result.current.trendForecastView
    expect(view).not.toBeNull()
    expect(view!.labels.length).toBeGreaterThan(0)
    expect(view!.realAvgData.some((v) => v !== null)).toBe(true)
    expect(view!.observedBuckets).toBe(5)
    expect(view!.completionPct).toBeGreaterThan(0)
  })

  it('calcula projectedTotalPieces mayor que observedPieces', () => {
    const analytics = makeMinimalAnalytics()
    const { result } = renderHook(() =>
      useGraderDashboardAnalytics({
        analytics,
        parsedData: EMPTY_PARSED,
        config: makeConfig(),
        nowTs: new Date(SHIFT_START_ISO).getTime() + 2 * 3600_000,
        recentSessions: [],
        siblingSessions: [],
      }),
    )
    const view = result.current.trendForecastView!
    expect(view.projectedTotalPieces).toBeGreaterThanOrEqual(view.observedPieces)
  })
})

// ── shiftProgressView ───────────────────────────────────────────────────────

describe('shiftProgressView', () => {
  it('retorna null si no hay trendForecastView', () => {
    const analytics = makeMinimalAnalytics({ weightTrendSeries: [] })
    const { result } = renderHook(() =>
      useGraderDashboardAnalytics({
        analytics,
        parsedData: EMPTY_PARSED,
        config: makeConfig(),
        nowTs: Date.now(),
        recentSessions: [],
        siblingSessions: [],
      }),
    )
    expect(result.current.shiftProgressView).toBeNull()
  })

  it('calcula elapsedPct y remainingLabel correctamente', () => {
    const analytics = makeMinimalAnalytics()
    const midShiftTs = new Date(SHIFT_START_ISO).getTime() + 4 * 3600_000
    const { result } = renderHook(() =>
      useGraderDashboardAnalytics({
        analytics,
        parsedData: EMPTY_PARSED,
        config: makeConfig(),
        nowTs: midShiftTs,
        recentSessions: [],
        siblingSessions: [],
      }),
    )
    const view = result.current.shiftProgressView
    expect(view).not.toBeNull()
    expect(view!.elapsedPct).toBeGreaterThan(0)
    expect(view!.remainingLabel).toMatch(/\d+h \d+m/)
    expect(view!.isShiftClosed).toBe(false)
  })

  it('detecta tendencia de peso up/down/flat', () => {
    const analytics = makeMinimalAnalytics()
    const { result } = renderHook(() =>
      useGraderDashboardAnalytics({
        analytics,
        parsedData: EMPTY_PARSED,
        config: makeConfig(),
        nowTs: new Date(SHIFT_START_ISO).getTime() + 2 * 3600_000,
        recentSessions: [],
        siblingSessions: [],
      }),
    )
    const view = result.current.shiftProgressView!
    // Buckets van 3100→3300 (subiendo) → trend = 'up'
    expect(view.weightTrend).toBe('up')
    expect(view.weightDeltaGrams).toBeGreaterThan(0)
  })
})

// ── sensorDegradationView ───────────────────────────────────────────────────

describe('sensorDegradationView', () => {
  it('retorna null si no hay suficientes registros P0', () => {
    const { result } = renderHook(() =>
      useGraderDashboardAnalytics({
        analytics: makeMinimalAnalytics(),
        parsedData: EMPTY_PARSED,
        config: makeConfig(),
        nowTs: Date.now(),
        recentSessions: [],
        siblingSessions: [],
      }),
    )
    expect(result.current.sensorDegradationView).toBeNull()
  })

  it('detecta degradación cuando errores crecen en el tiempo', () => {
    const baseTs = new Date(SHIFT_START_ISO).getTime()
    const spanMs = 4 * 3600_000  // 4 horas
    const records = []
    // Q1: pocas piezas, Q4: muchas → growthRatio > 1.5
    for (let i = 0; i < 40; i++) {
      const quarterIdx = Math.floor(i / 10) // 0,0,...,1,1,...,2,2,...,3,3,...
      const pieces = quarterIdx === 3 ? 5 : 1  // Q4 tiene 5x más piezas
      records.push({
        ts: new Date(baseTs + (quarterIdx * spanMs / 4) + i * 60_000).toISOString(),
        gate: 0,
        error: 'Sensor fotocélula',
        pieces,
        weightGrams: 3000,
      })
    }
    const parsed: ParsedMatrixData = {
      ...EMPTY_PARSED,
      pieceRecords: records as ParsedMatrixData['pieceRecords'],
    }
    const { result } = renderHook(() =>
      useGraderDashboardAnalytics({
        analytics: makeMinimalAnalytics(),
        parsedData: parsed,
        config: makeConfig(),
        nowTs: Date.now(),
        recentSessions: [],
        siblingSessions: [],
      }),
    )
    const view = result.current.sensorDegradationView
    expect(view).not.toBeNull()
    expect(view!.degradations.length).toBeGreaterThan(0)
    expect(view!.degradations[0]!.growthRatio).toBeGreaterThan(1.5)
  })
})

// ── multiSessionInsightsView ────────────────────────────────────────────────

describe('multiSessionInsightsView', () => {
  it('retorna null con < 2 sesiones recientes', () => {
    const { result } = renderHook(() =>
      useGraderDashboardAnalytics({
        analytics: makeMinimalAnalytics(),
        parsedData: EMPTY_PARSED,
        config: makeConfig(),
        nowTs: Date.now(),
        recentSessions: [makeSession('s1')],
        siblingSessions: [],
      }),
    )
    expect(result.current.multiSessionInsightsView).toBeNull()
  })

  it('calcula promedios y deltas con sesiones históricas', () => {
    const sessions = [
      makeSession('s1'),
      makeSession('s2', { aggregates: { kpis: { totalPieces: 1200, pointZeroPct: 3, avgWeightGrams: 3300, pointZeroPieces: 36, productivePieces: 1164, topPointZeroErrors: [] } } } as unknown as Partial<GraderSession>),
      makeSession('s3', { aggregates: { kpis: { totalPieces: 900, pointZeroPct: 6, avgWeightGrams: 2900, pointZeroPieces: 54, productivePieces: 846, topPointZeroErrors: [] } } } as unknown as Partial<GraderSession>),
    ]
    const { result } = renderHook(() =>
      useGraderDashboardAnalytics({
        analytics: makeMinimalAnalytics(),
        parsedData: EMPTY_PARSED,
        config: makeConfig(),
        nowTs: Date.now(),
        recentSessions: sessions,
        siblingSessions: [],
      }),
    )
    const view = result.current.multiSessionInsightsView
    expect(view).not.toBeNull()
    expect(view!.sampleSize).toBe(3)
    expect(view!.avgP0).toBeGreaterThan(0)
    expect(view!.avgPieces).toBeGreaterThan(0)
    expect(typeof view!.deltaP0).toBe('number')
    expect(typeof view!.percentileP0).toBe('number')
  })

  it('detecta errores recurrentes entre sesiones', () => {
    const sessions = [
      makeSession('s1'),
      makeSession('s2'),  // ambos tienen 'Fuera de límites' en topPointZeroErrors
    ]
    const { result } = renderHook(() =>
      useGraderDashboardAnalytics({
        analytics: makeMinimalAnalytics(),
        parsedData: EMPTY_PARSED,
        config: makeConfig(),
        nowTs: Date.now(),
        recentSessions: sessions,
        siblingSessions: [],
      }),
    )
    const view = result.current.multiSessionInsightsView!
    expect(view.recurrentErrors.length).toBeGreaterThan(0)
    expect(view.recurrentErrors[0]!.error).toBe('Fuera de límites')
    expect(view.recurrentErrors[0]!.sessions).toBe(2)
  })
})

// ── shiftComparisonView ─────────────────────────────────────────────────────

describe('shiftComparisonView', () => {
  it('retorna null sin sesiones hermanas', () => {
    const { result } = renderHook(() =>
      useGraderDashboardAnalytics({
        analytics: makeMinimalAnalytics(),
        parsedData: EMPTY_PARSED,
        config: makeConfig(),
        nowTs: Date.now(),
        recentSessions: [],
        siblingSessions: [],
      }),
    )
    expect(result.current.shiftComparisonView).toBeNull()
  })

  it('calcula deltas entre turno actual y hermano', () => {
    const sibling = makeSession('sibling', {
      shiftId: 'Turno día',
      aggregates: {
        kpis: {
          totalPieces: 1100, pointZeroPct: 3,
          avgWeightGrams: 3000, pointZeroPieces: 33,
          productivePieces: 1067,
          dominantCalibre: { calibre: '8-10lb', pieces: 500, pct: 45 },
        },
      },
    } as unknown as Partial<GraderSession>)
    const { result } = renderHook(() =>
      useGraderDashboardAnalytics({
        analytics: makeMinimalAnalytics(),
        parsedData: EMPTY_PARSED,
        config: makeConfig(),
        nowTs: Date.now(),
        recentSessions: [],
        siblingSessions: [sibling],
        currentSessionMeta: { sessionId: 'current', shiftId: 'Turno noche' },
      }),
    )
    const view = result.current.shiftComparisonView
    expect(view).not.toBeNull()
    expect(view!.delta.p0).toBe(2) // 5% - 3%
    expect(view!.delta.pieces).toBe(-100) // 1000 - 1100
    // 'Turno día' no matchea includes('dia') por el acento → pasa el shiftId raw
    expect(view!.siblingLabel).toBe('Turno día')
  })
})
