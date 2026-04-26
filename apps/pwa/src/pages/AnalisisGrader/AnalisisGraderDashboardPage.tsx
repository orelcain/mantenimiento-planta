/**
 * P3) Dashboard de Análisis Grader
 *
 * KPIs, Punto Cero, distribuciones, matriz Q×C (enhanced),
 * balance de gates (enhanced), lotes, tendencia de peso,
 * insights, panel IA, exportación y guardado de sesión.
 *
 * v2.46.1 — P0 inteligente, rangos de peso, persistencia archivos, tooltips ricos, modo día/noche
 */

import { useState, useMemo, useRef, useEffect, useCallback } from 'react'
import { Card, CardContent, Button, Badge, Tabs, TabsContent, TabsList, TabsTrigger, InfoTooltip } from '@/components/ui'
import {
  Activity,
  BarChart3,
  CheckCircle,
  ChevronLeft,
  Download,
  FileSpreadsheet,
  FileText,
  Info,
  Layers,
  Loader2,
  Minus,
  Moon,
  PieChart,
  Save,
  Scale,
  Sun,
  Target,
  TrendingDown,
  TrendingUp,
  XCircle,
} from 'lucide-react'
import {
  Chart as ChartJS,
  CategoryScale,
  LinearScale,
  BarElement,
  PointElement,
  LineElement,
  ArcElement,
  Title,
  Tooltip,
  Legend,
  TimeScale,
  Filler,
} from 'chart.js'
import 'chartjs-adapter-date-fns'
import { logger } from '@/lib/logger'

import { useAuthStore } from '@/store'
import { cn } from '@/lib/utils'
import { computeAnalytics } from '@/services/grader/graderAnalytics'
import { getGradingBelt } from '@/services/grader/graderBeltHelpers'
import { computeDeterministicInsights, computePointZeroTrend } from '@/services/grader/graderInsights'
import { analyzeGrader, parseAIResponse } from '@/services/ai/aiProvider'
import { saveGraderSession, listGraderSessions } from '@/services/grader/graderSession.service'
import {
  round2,
  pctCalc,
  getCalibreByWeightGrams,
  resolveCalibreLabel,
} from '@/services/grader/graderDashboardHelpers'
import { useGraderDashboardAnalytics } from '@/hooks/useGraderDashboardAnalytics'
import { useGraderPatternAnalytics } from '@/hooks/useGraderPatternAnalytics'
import { GraderMatrizTab } from '@/components/grader/tabs/GraderMatrizTab'
import { GraderCompuertasTab } from '@/components/grader/tabs/GraderCompuertasTab'
import { GraderSugerenciasTab } from '@/components/grader/tabs/GraderSugerenciasTab'
import { GraderLotesTab } from '@/components/grader/tabs/GraderLotesTab'
import { GraderTendenciaTab } from '@/components/grader/tabs/GraderTendenciaTab'
import { GraderPuntoCeroTab } from '@/components/grader/tabs/GraderPuntoCeroTab'
import { getTooltip, getTooltipProps } from '@/services/grader/graderTooltips'
import type {
  ParsedMatrixData,
  GateAssignment,
  GraderAnalysisConfig,
  GraderAnalyticsResult,
  DeterministicInsight,
  AIGraderInput,
  AIGraderOutput,
  GraderSession,
} from '@/services/grader/types'

ChartJS.register(CategoryScale, LinearScale, BarElement, PointElement, LineElement, ArcElement, Title, Tooltip, Legend, TimeScale, Filler)

function normalizeRecommendationText(value: string): string {
  return value
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z0-9\s]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
}

function buildRecommendationTokenSet(actions: AIGraderOutput['recommendedActions']): Set<string> {
  const tokenSet = new Set<string>()
  actions.forEach((action) => {
    normalizeRecommendationText(`${action.action} ${action.why}`)
      .split(' ')
      .filter((token) => token.length > 3)
      .forEach((token) => tokenSet.add(token))
  })
  return tokenSet
}

function computeRecommendationConsistency(
  latest?: AIGraderOutput,
  previous?: AIGraderOutput,
): { score: number; level: 'alta' | 'media' | 'baja'; note: string } | null {
  if (!latest || !previous) return null
  const latestSet = buildRecommendationTokenSet(latest.recommendedActions.slice(0, 4))
  const previousSet = buildRecommendationTokenSet(previous.recommendedActions.slice(0, 4))
  const union = new Set([...latestSet, ...previousSet])
  if (union.size === 0) {
    return { score: 100, level: 'alta', note: 'Las corridas no traen acciones comparables todavía.' }
  }
  let intersectionCount = 0
  for (const token of latestSet) {
    if (previousSet.has(token)) intersectionCount += 1
  }
  const score = round2((intersectionCount / union.size) * 100)
  if (score >= 70) {
    return { score, level: 'alta', note: 'Las recomendaciones se mantienen estables entre corridas.' }
  }
  if (score >= 40) {
    return { score, level: 'media', note: 'Hay cambios parciales; conviene validar en terreno antes de aplicar.' }
  }
  return { score, level: 'baja', note: 'Cambió mucho entre corridas; tomar como hipótesis y corroborar con datos de planta.' }
}

interface AITrendRun {
  id: string
  createdAtIso: string
  output: AIGraderOutput
}

interface Props {
  parsedData: ParsedMatrixData
  gates: GateAssignment[]
  config: GraderAnalysisConfig
  onBack?: () => void
  onApplyGateSuggestion?: (payload: { gateNumber: number; calibre: string; quality: string }) => void
  onUpdatePointZeroWarnThreshold?: (value: number) => void
  onUpdatePointZeroCriticalThreshold?: (value: number) => void
  analyticsOverride?: GraderAnalyticsResult
  insightsOverride?: DeterministicInsight[]
  initialAIOutput?: AIGraderOutput | null
  /** Metadata de la sesión actual — usado para buscar sesiones hermanas (comparativa día/noche, IA multisesión) */
  currentSessionMeta?: {
    sessionId?: string
    shiftId?: string
    sessionDate?: string
  }
}

export function AnalisisGraderDashboardPage({ parsedData, gates, config, onBack, onApplyGateSuggestion, onUpdatePointZeroWarnThreshold, onUpdatePointZeroCriticalThreshold, analyticsOverride, insightsOverride, initialAIOutput, currentSessionMeta }: Props) {
  const user = useAuthStore((s) => s.user)
  const [saving, setSaving] = useState(false)
  const [saved, setSaved] = useState(false)
  const [aiLoading, setAiLoading] = useState(false)
  const [aiOutput, setAiOutput] = useState<AIGraderOutput | null>(initialAIOutput ?? null)
  const [aiTrendRuns, setAiTrendRuns] = useState<AITrendRun[]>([])
  const [aiError, setAiError] = useState<string | null>(null)
  const [aiRawText, setAiRawText] = useState<string | null>(null)
  const [reportMode, setReportMode] = useState<'light' | 'dark'>('dark')
  const [selectedCauseLabel, setSelectedCauseLabel] = useState<string | null>(null)
  const [timeFilterFrom, setTimeFilterFrom] = useState<string>('')
  const [timeFilterTo, setTimeFilterTo] = useState<string>('')
  const [patternIntervalMinutes, setPatternIntervalMinutes] = useState<number>(60)
  const [trendWarnThreshold, setTrendWarnThreshold] = useState<number>(config.errorThresholds?.pointZeroPctWarn ?? 2)
  const [trendCriticalThreshold, setTrendCriticalThreshold] = useState<number>(config.errorThresholds?.pointZeroPctCritical ?? round2(Math.max((config.errorThresholds?.pointZeroPctWarn ?? 2) + 0.5, (config.errorThresholds?.pointZeroPctWarn ?? 2) * 1.5)))
  const [showAIHistory, setShowAIHistory] = useState(false)
  const [nowTs, setNowTs] = useState<number>(() => Date.now())
  const [weightChartMode, setWeightChartMode] = useState<'simple' | 'detailed'>('simple')
  const [showThresholds, setShowThresholds] = useState<boolean>(false)
  const [gateThresholds, setGateThresholds] = useState<NonNullable<GraderAnalysisConfig['errorThresholds']>>(() => ({
    ...(config.errorThresholds ?? { photocellPctWarn: 5, outOfLimitsPctWarn: 5, pointZeroPctWarn: 2 }),
    timingMarginOkSec: config.errorThresholds?.timingMarginOkSec ?? 0.5,
    timingMarginWarnSec: config.errorThresholds?.timingMarginWarnSec ?? 0.15,
    gateOverloadWarnPct: config.errorThresholds?.gateOverloadWarnPct ?? 35,
    gateOverloadCriticalPct: config.errorThresholds?.gateOverloadCriticalPct ?? 50,
  }))
  const [siblingSessions, setSiblingSessions] = useState<GraderSession[]>([])
  const [recentSessions, setRecentSessions] = useState<GraderSession[]>([])
  const [saveError, setSaveError] = useState<string | null>(null)
  const dashRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    const warn = config.errorThresholds?.pointZeroPctWarn ?? 2
    const critical = config.errorThresholds?.pointZeroPctCritical ?? round2(Math.max(warn + 0.5, warn * 1.5))
    setTrendWarnThreshold(warn)
    setTrendCriticalThreshold(Math.max(critical, round2(warn + 0.1)))
  }, [config.errorThresholds?.pointZeroPctCritical, config.errorThresholds?.pointZeroPctWarn])

  // Auto-actualiza el reloj cada 60s para recalcular "tiempo restante" del turno
  useEffect(() => {
    const id = window.setInterval(() => setNowTs(Date.now()), 60_000)
    return () => window.clearInterval(id)
  }, [])

  // Cargar sesiones hermanas (mismo día, turno distinto) + sesiones recientes para multisesión
  useEffect(() => {
    let cancelled = false
    const load = async () => {
      try {
        const all = await listGraderSessions(50)
        if (cancelled) return
        const currentId = currentSessionMeta?.sessionId
        const currentDate = currentSessionMeta?.sessionDate
        const currentShift = currentSessionMeta?.shiftId
        // Sesiones hermanas: mismo día, turno distinto
        const siblings = currentDate
          ? all.filter((s) =>
              s.id !== currentId &&
              s.sessionDate === currentDate &&
              (!currentShift || s.shiftId !== currentShift),
            )
          : []
        // Sesiones recientes (últimas 10 excluyendo la actual) para análisis multisesión
        const recent = all.filter((s) => s.id !== currentId).slice(0, 10)
        setSiblingSessions(siblings)
        setRecentSessions(recent)
      } catch (err) {
        logger.warn('grader: no se pudieron cargar sesiones hermanas')
      }
    }
    load()
    return () => {
      cancelled = true
    }
  }, [currentSessionMeta?.sessionId, currentSessionMeta?.sessionDate, currentSessionMeta?.shiftId])

  const pointZeroWarnThreshold = trendWarnThreshold
  const pointZeroCriticalThreshold = Math.max(trendCriticalThreshold, round2(pointZeroWarnThreshold + 0.1))

  const getPointZeroSeverity = useCallback((pct: number): 'critical' | 'warn' | 'ok' => {
    if (pct >= pointZeroCriticalThreshold) return 'critical'
    if (pct >= pointZeroWarnThreshold) return 'warn'
    return 'ok'
  }, [pointZeroCriticalThreshold, pointZeroWarnThreshold])

  const getPointZeroTextClass = useCallback((pct: number): string => {
    const severity = getPointZeroSeverity(pct)
    if (severity === 'critical') return 'text-red-600'
    if (severity === 'warn') return 'text-amber-600'
    return 'text-emerald-600'
  }, [getPointZeroSeverity])

  const getPointZeroBarColor = useCallback((pct: number): string => {
    const severity = getPointZeroSeverity(pct)
    if (severity === 'critical') return 'rgba(239,68,68,0.7)'
    if (severity === 'warn') return 'rgba(245,158,11,0.7)'
    return 'rgba(16,185,129,0.7)'
  }, [getPointZeroSeverity])

  // Compute analytics
  const computedAnalytics = useMemo<GraderAnalyticsResult>(
    () => computeAnalytics(parsedData, config, gates),
    [parsedData, config, gates],
  )

  const analytics = analyticsOverride ?? computedAnalytics

  const computedInsights = useMemo<DeterministicInsight[]>(
    () => computeDeterministicInsights(analytics),
    [analytics],
  )

  const insights = insightsOverride ?? computedInsights

  useEffect(() => {
    if (initialAIOutput) {
      setAiOutput(initialAIOutput)
    }
  }, [initialAIOutput])

  const trend = useMemo(() => computePointZeroTrend(analytics), [analytics])
  const avgWeightCalibre = useMemo(() => getCalibreByWeightGrams(analytics.kpis.avgWeightGrams), [analytics.kpis.avgWeightGrams])
  const medianWeightCalibre = useMemo(() => getCalibreByWeightGrams(analytics.kpis.medianWeightGrams), [analytics.kpis.medianWeightGrams])

  // Pattern analytics (tab Punto Cero + exportJSON)
  const {
    pointZeroDetailRecords,
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
  } = useGraderPatternAnalytics({
    analytics,
    parsedData,
    selectedCauseLabel,
    timeFilterFrom,
    timeFilterTo,
    patternIntervalMinutes,
  })

  // ——— AI ———
  const handleAnalyzeAI = async () => {
    setAiLoading(true)
    setAiError(null)
    setAiRawText(null)

    const payload: AIGraderInput = {
      version: '1.0',
      metadata: {
        deviceId: config.deviceId,
        startAt: analytics.config.startAt,
        endAt: analytics.config.endAt,
        timezone: config.timezone,
        totalPieces: analytics.kpis.totalPieces,
      },
      thresholds: config.errorThresholds,
      kpis: analytics.kpis,
      distributions: {
        byCalibre: analytics.distributionByCalibre,
        byQuality: analytics.distributionByQuality,
        pointZeroByError: analytics.pointZeroByError,
      },
      timeSeriesPointZero: analytics.timeSeriesPointZero,
      gateAssignments: gates,
      gateBalance: analytics.gateBalance,
      // Enhanced data for AI
      lotAnalysis: analytics.lotAnalysis.length > 0 ? analytics.lotAnalysis.map(l => ({
        lot: l.lot, pieces: l.pieces, avgWeightGrams: l.avgWeightGrams,
        stdDevWeightGrams: l.stdDevWeightGrams, pointZeroPct: l.pointZeroPct,
      })) : undefined,
      matrixEnhanced: analytics.matrixEnhanced.globalHHI > 0 ? {
        globalHHI: analytics.matrixEnhanced.globalHHI,
        imbalanceScore: analytics.matrixEnhanced.imbalanceScore,
        maxCell: analytics.matrixEnhanced.maxCell,
      } : undefined,
      gateAdvancedStats: analytics.gateAdvancedStats.length > 0 ? analytics.gateAdvancedStats.map(g => ({
        gateNumber: g.gateNumber, pieces: g.pieces, cv: g.cv,
        utilizationPct: g.utilizationPct, mismatchPct: g.mismatchPct,
      })) : undefined,
      gateSwapSuggestions: analytics.gateSwapSuggestions.length > 0
        ? analytics.gateSwapSuggestions.slice(0, 5)
        : undefined,
      dataCompleteness: {
        hasPieceRecords: parsedData.pieceRecords.length > 0,
        hasGate0Records: parsedData.gate0Records.length > 0,
        hasQualitySummary: parsedData.qualitySummary.length > 0,
        hasProductionSummary: parsedData.productionSummary.length > 0,
        hasFolioRecords: parsedData.folioRecords.length > 0,
        notes: analytics.notes,
      },
      patternFocus: {
        selectedCauseLabel: selectedCauseLabel ?? undefined,
        timeRange: {
          from: timeFilterFrom || undefined,
          to: timeFilterTo || undefined,
        },
        filteredTotalPieces: patternTotalPieces,
        distributionByCalibre: patternByCalibre,
        distributionByQuality: patternByQuality,
        hourlyDistribution: patternByHour,
        intervalMinutes: patternIntervalMinutes,
      },
      trendForecast: trendForecastView
        ? {
            shiftStart: trendForecastView.shiftStartIso,
            shiftEnd: trendForecastView.shiftEndIso,
            completionPct: trendForecastView.completionPct,
            observedBuckets: trendForecastView.observedBuckets,
            totalBuckets: trendForecastView.totalBuckets,
            observedPieces: trendForecastView.observedPieces,
            projectedTotalPieces: trendForecastView.projectedTotalPieces,
            projectedPointZeroPct: trendForecastView.projectedPointZeroPct,
            projectedPointZeroPieces: trendForecastView.projectedPointZeroPieces,
          }
        : undefined,
      physicalContext: (() => {
        const pc = config.physicalConfig
        if (!pc) return undefined
        const mainBelt = getGradingBelt(pc)
        if (!mainBelt || mainBelt.speedMps <= 0) return undefined
        const ratePerHour = analytics.kpis.productionRatePerHour ?? 0
        const ratePerSec = ratePerHour / 3600
        const spacingCm = ratePerSec > 0 ? (mainBelt.speedMps / ratePerSec) * 100 : 0
        const ratioToLength = spacingCm > 0 && pc.avgSalmonLengthCm > 0
          ? spacingCm / pc.avgSalmonLengthCm
          : 99
        const tooCloseRiskLevel: 'low' | 'medium' | 'high' =
          ratioToLength < 1.2 ? 'high' : ratioToLength < 1.4 ? 'medium' : 'low'
        return {
          mainBeltSpeedMps: mainBelt.speedMps,
          avgSalmonLengthCm: pc.avgSalmonLengthCm,
          estimatedSpacingCm: Math.round(spacingCm * 10) / 10,
          tooCloseRiskLevel,
          flipperTimings: pc.flipperPositions.map((fp) => ({
            gateNumber: fp.gateNumber,
            distanceMeters: fp.distanceFromSensorMeters,
            timeFromSensorSeconds: Math.round((fp.distanceFromSensorMeters / mainBelt.speedMps) * 100) / 100,
          })),
        }
      })(),
    }

    try {
      const result = await analyzeGrader(payload)
      setAiOutput(result)
      setAiTrendRuns((prev) => [{
        id: crypto.randomUUID(),
        createdAtIso: new Date().toISOString(),
        output: result,
      }, ...prev].slice(0, 5))
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err)
      // Try to parse as raw text
      const parsed = parseAIResponse(msg)
      const parsedOutput = parsed.parsed
      if (parsedOutput) {
        setAiOutput(parsedOutput)
        setAiTrendRuns((prev) => [{
          id: crypto.randomUUID(),
          createdAtIso: new Date().toISOString(),
          output: parsedOutput,
        }, ...prev].slice(0, 5))
      } else {
        setAiError(parsed.error || msg)
        setAiRawText(parsed.rawText || null)
      }
    } finally {
      setAiLoading(false)
    }
  }

  // ——— SAVE SESSION ———
  const handleSave = async () => {
    if (!user) return
    setSaving(true)
    setSaveError(null)
    try {
      // Derive sessionDate from startAt (production date from data)
      const sessionDate = analytics.config.startAt
        ? analytics.config.startAt.slice(0, 10) // YYYY-MM-DD
        : new Date().toISOString().slice(0, 10)
      await saveGraderSession({
        deviceId: config.deviceId,
        shiftId: config.shiftId,
        sessionDate,
        startAt: analytics.config.startAt,
        endAt: analytics.config.endAt,
        uploadedFilesMeta: parsedData.files,
        gatesConfigSnapshot: gates,
        aggregates: analytics,
        insights,
        aiOutput: aiOutput || undefined,
        createdBy: user.id,
      })
      setSaved(true)
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err)
      logger.error('Guardar Sesión error', new Error(msg))
      setSaveError(msg)
    } finally {
      setSaving(false)
    }
  }

  // ——— EXPORT JSON ———
  const handleExport = () => {
    const analyticsForExport = {
      ...analytics,
      pointZeroClassification: {
        ...analytics.pointZeroClassification,
        causes: analytics.pointZeroClassification.causes.map((cause) => ({
          ...cause,
          records: (cause.records ?? []).map((record) => ({
            ...record,
            calibre: resolveCalibreLabel(record.calibre, record.weightPerPieceGrams),
          })),
        })),
      },
    }
    const blob = new Blob(
      [JSON.stringify({ analytics: analyticsForExport, insights, aiOutput, trend }, null, 2)],
      { type: 'application/json' },
    )
    const a = document.createElement('a')
    a.href = URL.createObjectURL(blob)
    a.download = `grader-analysis-${new Date().toISOString().slice(0, 10)}.json`
    a.click()
  }

  // ——— EXPORT EXCEL ———
  const handleExportExcel = async () => {
    const XLSX = await import('xlsx')
    const wb = XLSX.utils.book_new()

    // KPIs sheet
    const kpiRows = [
      ['Métrica', 'Valor'],
      ['Total Piezas', kpis.totalPieces],
      ['Peso Total (kg)', kpis.totalWeightKg],
      ['Punto Cero Piezas', kpis.pointZeroPieces],
      ['Punto Cero %', kpis.pointZeroPct],
      ['Calibre Dominante', kpis.dominantCalibre ? `${kpis.dominantCalibre.calibre} (${kpis.dominantCalibre.pct}%)` : 'N/D'],
      ['Calidad Dominante', kpis.dominantQuality ? `${kpis.dominantQuality.quality} (${kpis.dominantQuality.pct}%)` : 'N/D'],
      ['Peso Promedio (g)', kpis.avgWeightGrams ?? 'N/D'],
      ['Peso Mediana (g)', kpis.medianWeightGrams ?? 'N/D'],
      ['Lotes Procesados', kpis.uniqueLots ?? 'N/D'],
      ['Piezas/Hora', kpis.productionRatePerHour ?? 'N/D'],
    ]
    XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet(kpiRows), 'KPIs')

    // Distribution by calibre
    if (analytics.distributionByCalibre.length > 0) {
      const calRows = [['Calibre', 'Piezas', '%', 'Peso (kg)'], ...analytics.distributionByCalibre.map(d => [d.key, d.pieces, d.pct, d.weightKg ?? ''])]
      XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet(calRows), 'Dist. Calibre')
    }

    // Distribution by quality
    if (analytics.distributionByQuality.length > 0) {
      const qualRows = [['Calidad', 'Piezas', '%', 'Peso (kg)'], ...analytics.distributionByQuality.map(d => [d.key, d.pieces, d.pct, d.weightKg ?? ''])]
      XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet(qualRows), 'Dist. Calidad')
    }

    // Punto Cero by error
    if (analytics.pointZeroByError.length > 0) {
      const p0Rows = [['Error', 'Piezas', '%', 'Peso (kg)'], ...analytics.pointZeroByError.map(e => [e.error, e.pieces, e.pct, e.weightKg ?? ''])]
      XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet(p0Rows), 'Punto Cero')
    }

    // Clasificación Punto Cero (100%)
    if (analytics.pointZeroClassification.causes.length > 0) {
      const classRows = [
        ['Causa', 'Piezas', '% Punto Cero', '% Total', 'Peso (kg)'],
        ...analytics.pointZeroClassification.causes.map(c => [c.label, c.pieces, c.pctOfPointZero, c.pctOfTotal, c.weightKg ?? '']),
        ['TOTAL', analytics.pointZeroClassification.totalPointZeroPieces, 100, kpis.pointZeroPct, ''],
      ]
      XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet(classRows), 'Clasif. Pto Cero')
    }

    // Detalle pieza-pieza Punto Cero
    if (pointZeroDetailRecords.length > 0) {
      const detailRows = [
        ['Hora', 'Causa', 'Error', 'Pzas', 'Peso/pza (g)', 'Calidad', 'Calibre', 'Lote'],
        ...pointZeroDetailRecords.map((r) => [
          new Date(r.ts).toLocaleTimeString('es-CL', { hour: '2-digit', minute: '2-digit', second: '2-digit', timeZone: 'UTC' }),
          r.causeLabel,
          r.error,
          r.pieces,
          r.weightPerPieceGrams != null ? Number(r.weightPerPieceGrams.toFixed(0)) : '',
          r.quality ?? '',
          r.calibre,
          r.lot ?? '',
        ]),
      ]
      XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet(detailRows), 'P0 Detalle Piezas')
    }

    // Fuera de Rango por peso
    if (analytics.pointZeroClassification.outOfRangeByWeight.length > 0) {
      const orRows = [
        ['Rango Peso', 'Piezas', '%'],
        ...analytics.pointZeroClassification.outOfRangeByWeight.map(d => [d.rangeLabel, d.pieces, d.pct]),
      ]
      XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet(orRows), 'Fuera de Rango')
    }

    // Pivote Error × Calidad × Calibre (jerárquico)
    if (analytics.pointZeroClassification.hierarchy.length > 0) {
      const pivotRows: (string | number)[][] = [['Etiquetas de fila', 'Piezas', '% P.Cero', '% Total']]
      const rows = analytics.pointZeroClassification.hierarchy
      // Group by error then quality
      const errorGroups = new Map<string, { rows: typeof rows; total: number }>()
      for (const r of rows) {
        const g = errorGroups.get(r.error) || { rows: [], total: 0 }
        g.rows.push(r)
        g.total += r.pieces
        errorGroups.set(r.error, g)
      }
      for (const [errorLabel, eg] of Array.from(errorGroups.entries())) {
        pivotRows.push([errorLabel, eg.total, pctCalc(eg.total, analytics.pointZeroClassification.totalPointZeroPieces), pctCalc(eg.total, kpis.totalPieces)])
        const qualityGroups = new Map<string, { rows: typeof rows; total: number }>()
        for (const r of eg.rows) {
          const qg = qualityGroups.get(r.quality) || { rows: [], total: 0 }
          qg.rows.push(r)
          qg.total += r.pieces
          qualityGroups.set(r.quality, qg)
        }
        for (const [qualLabel, qg] of Array.from(qualityGroups.entries())) {
          pivotRows.push([`  ${qualLabel}`, qg.total, pctCalc(qg.total, analytics.pointZeroClassification.totalPointZeroPieces), pctCalc(qg.total, kpis.totalPieces)])
          for (const r of qg.rows.sort((a, b) => b.pieces - a.pieces)) {
            pivotRows.push([`    ${r.calibre}`, r.pieces, r.pctOfPointZero, r.pctOfTotal])
          }
        }
      }
      pivotRows.push(['Total general', analytics.pointZeroClassification.totalPointZeroPieces, 100, kpis.pointZeroPct])
      XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet(pivotRows), 'Pivote Error×Cal×Calibre')
    }

    // Rangos de Calibre (referencia)
    const rangeRows = [
      ['Calibre', 'Mín (g)', 'Máx (g)'],
      ...analytics.pointZeroClassification.calibreWeightRanges.map(r => [r.calibre, r.minGrams, r.maxGrams]),
    ]
    XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet(rangeRows), 'Rangos Calibre')

    // Matrix Q×C
    if (matrixQualities.length > 0 && matrixCalibres.length > 0) {
      const header = ['Calidad \\ Calibre', ...matrixCalibres]
      const matRows = matrixQualities.map(q => {
        const row: (string | number)[] = [q]
        matrixCalibres.forEach(c => {
          const cell = analytics.matrixQualityCalibre[q]?.[c]
          row.push(cell ? cell.pieces : 0)
        })
        return row
      })
      XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet([header, ...matRows]), 'Matriz QxC')
    }

    // Gate Balance
    if (analytics.gateBalance.length > 0) {
      const gbRows = [['Calibre', 'Demanda %', 'Gates Asignados', 'Severidad', 'Mensaje'], ...analytics.gateBalance.map(g => [g.calibre, g.demandPct, g.gatesAssigned, g.severity, g.message])]
      XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet(gbRows), 'Balance Gates')
    }

    // Lot Analysis
    if (analytics.lotAnalysis.length > 0) {
      const lotRows = [
        ['Lote', 'Piezas', 'Peso (kg)', 'Prom. (g)', 'Mediana (g)', 'σ (g)', 'P0 Piezas', 'P0 %'],
        ...analytics.lotAnalysis.map(l => [l.lot, l.pieces, l.weightKg, l.avgWeightGrams, l.medianWeightGrams, l.stdDevWeightGrams, l.pointZeroPieces, l.pointZeroPct]),
      ]
      XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet(lotRows), 'Lotes')
    }

    // Weight Trend
    if (analytics.weightTrendSeries.length > 0) {
      const wtRows = [
        ['Hora', 'Piezas', 'Prom. (g)', 'Mediana (g)', 'σ (g)', 'MA(5) (g)', 'Lote'],
        ...analytics.weightTrendSeries.map(b => [b.bucketStart, b.pieces, b.avgWeightGrams, b.medianWeightGrams, b.stdDevWeightGrams, b.movingAvg5 ?? '', b.dominantLot ?? '']),
      ]
      XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet(wtRows), 'Tendencia Peso')
    }

    // Gate Advanced Stats
    if (analytics.gateAdvancedStats.length > 0) {
      const gsRows = [
        ['Gate', 'Piezas', 'Peso (kg)', 'Prom. (g)', 'σ (g)', 'CV', 'Utiliz. %', 'Calibre Asignado', 'Mismatch %'],
        ...analytics.gateAdvancedStats.map(g => [g.gateNumber, g.pieces, g.weightKg, g.avgWeightGrams, g.stdDevWeightGrams, (g.cv * 100).toFixed(1) + '%', g.utilizationPct.toFixed(1), g.assignedCalibre, g.mismatchPct.toFixed(1) + '%']),
      ]
      XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet(gsRows), 'Stats Gates')
    }

    // Swap Suggestions
    if (analytics.gateSwapSuggestions.length > 0) {
      const swapRows = [
        ['Tipo', 'Gate', 'Calibre Actual', 'Calibre Sugerido', 'Razón', 'Impacto', 'Evidencia'],
        ...analytics.gateSwapSuggestions.map(s => [s.type, s.gateNumber, s.currentCalibre, s.suggestedCalibre, s.reason, s.impactScore, s.evidence.join('; ')]),
      ]
      XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet(swapRows), 'Sugerencias Swap')
    }

    // Insights
    if (insights.length > 0) {
      const insRows = [['Severidad', 'Título', 'Evidencia', 'Recomendaciones'], ...insights.map(i => [i.severity, i.title, i.evidence.join('; '), i.recommendations.join('; ')])]
      XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet(insRows), 'Insights')
    }

    XLSX.writeFile(wb, `grader-analysis-${new Date().toISOString().slice(0, 10)}.xlsx`)
  }

  // ——— EXPORT PDF ———
  const handleExportPDF = async () => {
    const { default: jsPDF } = await import('jspdf')
    const { default: autoTable } = await import('jspdf-autotable')
    const pdfDoc = new jsPDF({ orientation: 'landscape', unit: 'mm', format: 'a4' })
    const pageW = pdfDoc.internal.pageSize.getWidth()
    let y = 15

    // Title
    pdfDoc.setFontSize(16)
    pdfDoc.text('Análisis Grader — Reporte', pageW / 2, y, { align: 'center' })
    y += 8
    pdfDoc.setFontSize(9)
    pdfDoc.text(`Generado: ${new Date().toLocaleString('es-CL')} | Dispositivo: ${config.deviceId || 'N/D'} | Período: ${analytics.config.startAt || '?'} — ${analytics.config.endAt || '?'}`, pageW / 2, y, { align: 'center' })
    y += 10

    // KPI table
    pdfDoc.setFontSize(12)
    pdfDoc.text('KPIs', 14, y)
    y += 2
    autoTable(pdfDoc, {
      startY: y,
      head: [['Métrica', 'Valor']],
      body: [
        ['Total Piezas', kpis.totalPieces.toLocaleString('es-CL')],
        ['Peso Total (kg)', kpis.totalWeightKg?.toLocaleString('es-CL') ?? 'N/D'],
        ['Punto Cero Piezas', kpis.pointZeroPieces.toLocaleString('es-CL')],
        ['Punto Cero %', `${kpis.pointZeroPct}%`],
        ['Calibre Dominante', kpis.dominantCalibre ? `${kpis.dominantCalibre.calibre} (${kpis.dominantCalibre.pct}%)` : 'N/D'],
        ['Calidad Dominante', kpis.dominantQuality ? `${kpis.dominantQuality.quality} (${kpis.dominantQuality.pct}%)` : 'N/D'],
        ['Peso Promedio (g)', kpis.avgWeightGrams?.toLocaleString('es-CL') ?? 'N/D'],
        ['Peso Mediana (g)', kpis.medianWeightGrams?.toLocaleString('es-CL') ?? 'N/D'],
        ['Lotes Procesados', kpis.uniqueLots?.toString() ?? 'N/D'],
        ['Piezas/Hora', kpis.productionRatePerHour?.toLocaleString('es-CL') ?? 'N/D'],
      ],
      theme: 'grid',
      styles: { fontSize: 8 },
      margin: { left: 14 },
    })
    y = (pdfDoc as any).lastAutoTable.finalY + 8

    // Distribution tables
    if (analytics.distributionByCalibre.length > 0) {
      if (y > 170) { pdfDoc.addPage(); y = 15 }
      pdfDoc.setFontSize(12)
      pdfDoc.text('Distribución por Calibre', 14, y)
      y += 2
      autoTable(pdfDoc, {
        startY: y,
        head: [['Calibre', 'Piezas', '%']],
        body: analytics.distributionByCalibre.map(d => [d.key, d.pieces.toLocaleString('es-CL'), `${d.pct}%`]),
        theme: 'striped',
        styles: { fontSize: 8 },
        margin: { left: 14 },
      })
      y = (pdfDoc as any).lastAutoTable.finalY + 8
    }

    // Punto Cero
    if (analytics.pointZeroByError.length > 0) {
      if (y > 170) { pdfDoc.addPage(); y = 15 }
      pdfDoc.setFontSize(12)
      pdfDoc.text('Punto Cero por Causa', 14, y)
      y += 2
      autoTable(pdfDoc, {
        startY: y,
        head: [['Error', 'Piezas', '%']],
        body: analytics.pointZeroByError.map(e => [e.error, e.pieces.toLocaleString('es-CL'), `${e.pct}%`]),
        theme: 'striped',
        styles: { fontSize: 8 },
        margin: { left: 14 },
      })
      y = (pdfDoc as any).lastAutoTable.finalY + 8
    }

    // Clasificación Punto Cero 100%
    if (analytics.pointZeroClassification.causes.length > 0) {
      if (y > 150) { pdfDoc.addPage(); y = 15 }
      pdfDoc.setFontSize(12)
      pdfDoc.text('Clasificación Punto Cero — 100%', 14, y)
      y += 2
      autoTable(pdfDoc, {
        startY: y,
        head: [['Causa', 'Piezas', '% P.Cero', '% Total']],
        body: [
          ...analytics.pointZeroClassification.causes.map(c => [c.label, c.pieces.toLocaleString('es-CL'), `${c.pctOfPointZero}%`, `${c.pctOfTotal}%`]),
          ['TOTAL', analytics.pointZeroClassification.totalPointZeroPieces.toLocaleString('es-CL'), '100%', `${kpis.pointZeroPct}%`],
        ],
        theme: 'grid',
        styles: { fontSize: 8 },
        margin: { left: 14 },
      })
      y = (pdfDoc as any).lastAutoTable.finalY + 8
    }

    // Detalle pieza-pieza Punto Cero
    if (pointZeroDetailRecords.length > 0) {
      if (y > 130) { pdfDoc.addPage(); y = 15 }
      pdfDoc.setFontSize(12)
      pdfDoc.text('Detalle Pieza-Pieza Punto Cero', 14, y)
      y += 2
      autoTable(pdfDoc, {
        startY: y,
        head: [['Hora', 'Causa', 'Error', 'Pzas', 'Peso/pza (g)', 'Calidad', 'Calibre', 'Lote']],
        body: pointZeroDetailRecords.map((r) => [
          new Date(r.ts).toLocaleTimeString('es-CL', { hour: '2-digit', minute: '2-digit', second: '2-digit', timeZone: 'UTC' }),
          r.causeLabel,
          r.error,
          r.pieces.toLocaleString('es-CL'),
          r.weightPerPieceGrams != null ? r.weightPerPieceGrams.toFixed(0) : '—',
          r.quality || '—',
          r.calibre,
          r.lot || '—',
        ]),
        theme: 'striped',
        styles: { fontSize: 6 },
        margin: { left: 14 },
      })
      y = (pdfDoc as any).lastAutoTable.finalY + 8
    }

    // Fuera de Rango por peso
    if (analytics.pointZeroClassification.outOfRangeByWeight.length > 0) {
      if (y > 160) { pdfDoc.addPage(); y = 15 }
      pdfDoc.setFontSize(12)
      pdfDoc.text('Fuera de Rango — Distribución por Peso', 14, y)
      y += 2
      autoTable(pdfDoc, {
        startY: y,
        head: [['Rango Peso', 'Piezas', '%']],
        body: analytics.pointZeroClassification.outOfRangeByWeight.map(d => [d.rangeLabel, d.pieces.toLocaleString('es-CL'), `${d.pct}%`]),
        theme: 'striped',
        styles: { fontSize: 8 },
        margin: { left: 14 },
      })
      y = (pdfDoc as any).lastAutoTable.finalY + 8
    }

    // Pivote Error × Calidad × Calibre
    if (analytics.pointZeroClassification.hierarchy.length > 0) {
      if (y > 140) { pdfDoc.addPage(); y = 15 }
      pdfDoc.setFontSize(12)
      pdfDoc.text('Pivote Error × Calidad × Calibre', 14, y)
      y += 2
      const pivotBody: string[][] = []
      const hRows = analytics.pointZeroClassification.hierarchy
      const eGroups = new Map<string, { rows: typeof hRows; total: number }>()
      for (const r of hRows) {
        const g = eGroups.get(r.error) || { rows: [], total: 0 }
        g.rows.push(r)
        g.total += r.pieces
        eGroups.set(r.error, g)
      }
      for (const [eLabel, eg] of Array.from(eGroups.entries())) {
        pivotBody.push([eLabel, eg.total.toLocaleString('es-CL'), `${pctCalc(eg.total, analytics.pointZeroClassification.totalPointZeroPieces)}%`, `${pctCalc(eg.total, kpis.totalPieces)}%`])
        const qGroups = new Map<string, { rows: typeof hRows; total: number }>()
        for (const r of eg.rows) {
          const qg = qGroups.get(r.quality) || { rows: [], total: 0 }
          qg.rows.push(r)
          qg.total += r.pieces
          qGroups.set(r.quality, qg)
        }
        for (const [qLabel, qg] of Array.from(qGroups.entries())) {
          pivotBody.push([`  ${qLabel}`, qg.total.toLocaleString('es-CL'), `${pctCalc(qg.total, analytics.pointZeroClassification.totalPointZeroPieces)}%`, `${pctCalc(qg.total, kpis.totalPieces)}%`])
          for (const r of qg.rows.sort((a, b) => b.pieces - a.pieces)) {
            pivotBody.push([`    ${r.calibre}`, r.pieces.toLocaleString('es-CL'), `${r.pctOfPointZero}%`, `${r.pctOfTotal}%`])
          }
        }
      }
      pivotBody.push(['Total general', analytics.pointZeroClassification.totalPointZeroPieces.toLocaleString('es-CL'), '100%', `${kpis.pointZeroPct}%`])
      autoTable(pdfDoc, {
        startY: y,
        head: [['Etiquetas de fila', 'Piezas', '% P.Cero', '% Total']],
        body: pivotBody,
        theme: 'grid',
        styles: { fontSize: 7 },
        margin: { left: 14 },
      })
      y = (pdfDoc as any).lastAutoTable.finalY + 8
    }

    // Matrix Q×C
    if (matrixQualities.length > 0 && matrixCalibres.length > 0) {
      if (y > 140) { pdfDoc.addPage(); y = 15 }
      pdfDoc.setFontSize(12)
      pdfDoc.text('Matriz Calidad × Calibre', 14, y)
      y += 2
      autoTable(pdfDoc, {
        startY: y,
        head: [['Calidad', ...matrixCalibres]],
        body: matrixQualities.map(q => {
          const cells: string[] = [q]
          matrixCalibres.forEach(c => {
            const cell = analytics.matrixQualityCalibre[q]?.[c]
            cells.push(cell ? `${cell.pieces} (${cell.pct}%)` : '—')
          })
          return cells
        }),
        theme: 'grid',
        styles: { fontSize: 7 },
        margin: { left: 14 },
      })
      y = (pdfDoc as any).lastAutoTable.finalY + 8
    }

    // Insights
    if (insights.length > 0) {
      if (y > 150) { pdfDoc.addPage(); y = 15 }
      pdfDoc.setFontSize(12)
      pdfDoc.text('Alertas Automáticas', 14, y)
      y += 2
      autoTable(pdfDoc, {
        startY: y,
        head: [['Severidad', 'Título', 'Evidencia', 'Recomendaciones']],
        body: insights.map(i => [i.severity.toUpperCase(), i.title, i.evidence.join('; '), i.recommendations.join('; ')]),
        theme: 'striped',
        styles: { fontSize: 7, cellWidth: 'wrap' },
        columnStyles: { 2: { cellWidth: 80 }, 3: { cellWidth: 80 } },
        margin: { left: 14 },
      })
    }

    pdfDoc.save(`grader-analysis-${new Date().toISOString().slice(0, 10)}.pdf`)
  }

  const { kpis } = analytics

  // Collect all unique qualities and calibres for matrix
  const matrixQualities = Object.keys(analytics.matrixQualityCalibre)
  const matrixCalibresSet = new Set<string>()
  for (const q of matrixQualities) {
    const row = analytics.matrixQualityCalibre[q]
    if (row) {
      for (const c of Object.keys(row)) {
        matrixCalibresSet.add(c)
      }
    }
  }
  const matrixCalibres = Array.from(matrixCalibresSet)

  const lotAnalysisView = useMemo(() => {
    return analytics.lotAnalysis.map((lot) => ({
      ...lot,
      pointZeroPctChecked: lot.pieces > 0 ? Math.round((lot.pointZeroPieces / lot.pieces) * 10000) / 100 : 0,
    }))
  }, [analytics.lotAnalysis])

  const getCvSignal = useCallback((cv: number) => {
    if (cv >= 20) return { emoji: '🔴', label: 'alta', cls: 'text-red-600', bar: 'rgba(239,68,68,0.75)' }
    if (cv >= 12) return { emoji: '🟠', label: 'media-alta', cls: 'text-amber-600', bar: 'rgba(245,158,11,0.75)' }
    if (cv >= 8) return { emoji: '🟡', label: 'media', cls: 'text-yellow-500', bar: 'rgba(234,179,8,0.75)' }
    return { emoji: '🟢', label: 'baja', cls: 'text-emerald-600', bar: 'rgba(16,185,129,0.75)' }
  }, [])

  const lotDispersionView = useMemo(() => {
    return lotAnalysisView.map((lot) => {
      const cvPct = lot.avgWeightGrams > 0 ? Math.round((lot.stdDevWeightGrams / lot.avgWeightGrams) * 10000) / 100 : 0
      return {
        ...lot,
        cvPct,
        cvSignal: getCvSignal(cvPct),
      }
    })
  }, [lotAnalysisView, getCvSignal])

  const lotDispersionSummary = useMemo(() => {
    const high = lotDispersionView.filter((lot) => lot.cvPct >= 20)
    const mostVariable = [...lotDispersionView].sort((a, b) => b.cvPct - a.cvPct)[0]
    return { high, mostVariable }
  }, [lotDispersionView])

  const suggestedQualityByCalibre = useMemo(() => {
    const qualityCountByCalibre = new Map<string, Map<string, number>>()
    for (const gate of gates) {
      if (!gate.active) continue
      const byQuality = qualityCountByCalibre.get(gate.assignedCalibre) ?? new Map<string, number>()
      byQuality.set(gate.assignedQuality, (byQuality.get(gate.assignedQuality) ?? 0) + 1)
      qualityCountByCalibre.set(gate.assignedCalibre, byQuality)
    }

    const suggested = new Map<string, string>()
    for (const [calibre, qualityMap] of qualityCountByCalibre.entries()) {
      const best = Array.from(qualityMap.entries()).sort((a, b) => b[1] - a[1])[0]
      if (best) suggested.set(calibre, best[0])
    }
    return suggested
  }, [gates])

  const directGateActions = useMemo(() => {
    return analytics.gateSwapSuggestions.slice(0, 3).map((suggestion) => {
      const gateCfg = gates.find((gate) => gate.gateNumber === suggestion.gateNumber)
      const currentQuality = gateCfg?.assignedQuality ?? 'Unknown'
      const targetQuality = (suggestedQualityByCalibre.get(suggestion.suggestedCalibre) ?? currentQuality) as string

      if (suggestion.type === 'investigate') {
        return {
          gateNumber: suggestion.gateNumber,
          suggestedCalibre: suggestion.currentCalibre,
          suggestedQuality: currentQuality,
          canApply: false,
          isApplied: false,
          text: `Gate ${suggestion.gateNumber}: mantener calibre ${suggestion.currentCalibre} y calidad ${currentQuality}; revisar variabilidad/mismatch (${suggestion.impactScore}%).`,
        }
      }

      const qualityText = targetQuality !== currentQuality
        ? `${currentQuality} → ${targetQuality}`
        : `${currentQuality} (mantener)`

      const isApplied = (gateCfg?.assignedCalibre === suggestion.suggestedCalibre)
        && (gateCfg?.assignedQuality === targetQuality)

      return {
        gateNumber: suggestion.gateNumber,
        suggestedCalibre: suggestion.suggestedCalibre,
        suggestedQuality: targetQuality,
        canApply: true,
        isApplied,
        text: `Gate ${suggestion.gateNumber}: cambiar calibre ${suggestion.currentCalibre} → ${suggestion.suggestedCalibre} y calidad ${qualityText}.`,
      }
    })
  }, [analytics.gateSwapSuggestions, gates, suggestedQualityByCalibre])

  const handleApplyGateAction = (action: { gateNumber: number; suggestedCalibre: string; suggestedQuality: string; canApply: boolean; isApplied?: boolean }) => {
    if (!action.canApply || action.isApplied || !onApplyGateSuggestion) return
    onApplyGateSuggestion({
      gateNumber: action.gateNumber,
      calibre: action.suggestedCalibre,
      quality: action.suggestedQuality,
    })
  }

  const lotStdDevTooltipProps = useMemo(() => {
    const base = getTooltipProps('lot.stdDev')
    return {
      ...base,
      text: 'Mide cuánto se dispersan los pesos respecto a la media. En esta tabla se calcula con todos los pesos de cada lote; por eso cada fila tiene un σ distinto. Semáforo por CV: 🟢 <8%, 🟡 8-11.9%, 🟠 12-19.9%, 🔴 ≥20%.',
      example: 'Pase el mouse sobre cada valor σ de la fila para ver su explicación exacta con datos reales de ese lote.',
    }
  }, [])

  const wtStdDevTooltipProps = useMemo(() => {
    const base = getTooltipProps('wt.stdDev')
    return {
      ...base,
      text: 'Mide la variabilidad del peso en cada intervalo de tiempo. Se calcula con todas las piezas del intervalo, por eso el σ cambia fila a fila. Semáforo por CV: 🟢 <8%, 🟡 8-11.9%, 🟠 12-19.9%, 🔴 ≥20%.',
      example: 'Pase el mouse sobre cada valor σ del intervalo para ver su explicación exacta con datos reales de esa fila.',
    }
  }, [])

  const weightTrendByTs = useMemo(
    () => new Map(
      analytics.weightTrendSeries
        .map((bucket) => [new Date(bucket.bucketStart).getTime(), bucket] as const)
        .filter(([ts]) => Number.isFinite(ts)),
    ),
    [analytics.weightTrendSeries],
  )

  // Los 5 views de análisis extraídos al hook custom useGraderDashboardAnalytics
  const {
    trendForecastView,
    shiftProgressView,
    sensorDegradationView,
    multiSessionInsightsView,
    shiftComparisonView,
  } = useGraderDashboardAnalytics({
    analytics,
    parsedData,
    config,
    nowTs,
    recentSessions,
    siblingSessions,
    currentSessionMeta,
  })

  const trendAutoRecommendations = useMemo(() => {
    if (!trendForecastView) return [] as Array<{
      gateNumber: number
      suggestedCalibre: string
      suggestedQuality: string
      text: string
      canApply: boolean
      isApplied: boolean
      urgency: 'high' | 'medium' | 'low'
    }>

    const warnThreshold = pointZeroWarnThreshold
    const criticalThreshold = pointZeroCriticalThreshold
    const severity = getPointZeroSeverity(trendForecastView.projectedPointZeroPct)
    const urgency: 'high' | 'medium' | 'low' = severity === 'critical'
      ? 'high'
      : severity === 'warn'
      ? 'medium'
      : 'low'

    const prefix = urgency === 'high'
      ? 'Prioridad alta'
      : urgency === 'medium'
      ? 'Prioridad media'
      : 'Prioridad preventiva'

    return directGateActions
      .filter((action) => action.canApply)
      .slice(0, 2)
      .map((action) => ({
        ...action,
        urgency,
        text: `${prefix}: ${action.text} (proyección cierre P0 ${trendForecastView.projectedPointZeroPct.toFixed(2)}%, umbral ${warnThreshold.toFixed(2)}%, crítico ${criticalThreshold.toFixed(2)}%).`,
      }))
  }, [directGateActions, getPointZeroSeverity, pointZeroCriticalThreshold, pointZeroWarnThreshold, trendForecastView])

  const trendAIRuns = useMemo(() => {
    return aiTrendRuns.slice(0, 3).map((run, index) => ({
      ...run,
      runLabel: `Corrida ${aiTrendRuns.length - index}`,
      recommendations: run.output.recommendedActions.slice(0, 3),
    }))
  }, [aiTrendRuns])

  const trendAIConsistency = useMemo(() => {
    const latest = aiTrendRuns[0]?.output
    const previous = aiTrendRuns[1]?.output
    return computeRecommendationConsistency(latest, previous)
  }, [aiTrendRuns])

  const trendAIDiffRows = useMemo(() => {
    if (aiTrendRuns.length < 2) return [] as Array<{
      slot: string
      prevAction: string
      newAction: string
      prevWhy: string
      newWhy: string
      changeType: 'igual' | 'ajustada' | 'nueva' | 'eliminada'
    }>

    const latest = aiTrendRuns[0]?.output.recommendedActions ?? []
    const previous = aiTrendRuns[1]?.output.recommendedActions ?? []
    const maxItems = Math.min(3, Math.max(latest.length, previous.length))

    const rows = Array.from({ length: maxItems }).map((_, idx) => {
      const prev = previous[idx]
      const next = latest[idx]

      const prevActionText = prev
        ? `(${prev.priority}) ${prev.action}`
        : '—'
      const newActionText = next
        ? `(${next.priority}) ${next.action}`
        : '—'

      const prevWhyText = prev?.why ?? '—'
      const newWhyText = next?.why ?? '—'

      let changeType: 'igual' | 'ajustada' | 'nueva' | 'eliminada' = 'igual'
      if (!prev && next) {
        changeType = 'nueva'
      } else if (prev && !next) {
        changeType = 'eliminada'
      } else {
        const actionChanged = normalizeRecommendationText(prev?.action ?? '') !== normalizeRecommendationText(next?.action ?? '')
        const whyChanged = normalizeRecommendationText(prev?.why ?? '') !== normalizeRecommendationText(next?.why ?? '')
        if (actionChanged || whyChanged) {
          changeType = 'ajustada'
        }
      }

      return {
        slot: `Acción ${idx + 1}`,
        prevAction: prevActionText,
        newAction: newActionText,
        prevWhy: prevWhyText,
        newWhy: newWhyText,
        changeType,
      }
    })

    return rows
  }, [aiTrendRuns])

  return (
    <div
      ref={dashRef}
      className={cn('space-y-4 max-w-screen-xl mx-auto', reportMode === 'light' && 'grader-light-mode')}
    >
      {/* Top actions */}
      <div className={cn('flex items-center flex-wrap gap-2', onBack ? 'justify-between' : 'justify-end')}>
        {onBack && (
          <Button variant="outline" size="sm" onClick={onBack}>
            <ChevronLeft className="h-4 w-4 mr-1" />
            Volver a Config
          </Button>
        )}
        <div className="flex gap-2 flex-wrap items-center">
          <Button size="sm" onClick={handleSave} disabled={saving || saved}>
            {saving ? (
              <Loader2 className="h-4 w-4 animate-spin mr-1" />
            ) : saved ? (
              <CheckCircle className="h-4 w-4 mr-1" />
            ) : (
              <Save className="h-4 w-4 mr-1" />
            )}
            {saved ? 'Guardado' : 'Guardar Sesión'}
          </Button>
          <div className="w-px h-5 bg-border mx-1" />
          <Button variant="outline" size="sm" onClick={handleExportExcel}>
            <FileSpreadsheet className="h-4 w-4 mr-1" />
            Excel
          </Button>
          <Button variant="outline" size="sm" onClick={handleExportPDF}>
            <FileText className="h-4 w-4 mr-1" />
            PDF
          </Button>
          <Button variant="outline" size="sm" onClick={handleExport} title="Exportar JSON">
            <Download className="h-4 w-4" />
          </Button>
          <Button
            variant="outline"
            size="sm"
            onClick={() => setReportMode(reportMode === 'dark' ? 'light' : 'dark')}
            title={reportMode === 'dark' ? 'Cambiar a modo día' : 'Cambiar a modo noche'}
          >
            {reportMode === 'dark' ? <Sun className="h-4 w-4" /> : <Moon className="h-4 w-4" />}
          </Button>
        </div>
        {saveError && (
          <div className="text-xs text-destructive bg-destructive/10 border border-destructive/30 rounded px-3 py-2 flex items-start gap-2">
            <XCircle className="h-4 w-4 shrink-0 mt-0.5" />
            <span>Error al guardar: {saveError}</span>
          </div>
        )}
      </div>

      {/* Data notes */}
      {analytics.notes.length > 0 && (
        <Card className="border-amber-300 bg-amber-50 dark:bg-amber-900/10">
          <CardContent className="pt-4">
            <div className="flex items-start gap-2">
              <Info className="h-4 w-4 text-amber-600 mt-0.5 shrink-0" />
              <div className="text-xs text-amber-700 dark:text-amber-400 space-y-0.5">
                {analytics.notes.map((n, i) => (
                  <p key={i}>{n}</p>
                ))}
              </div>
            </div>
          </CardContent>
        </Card>
      )}

      {/* ——— KPIs ——— */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        <KPICard label="Total Piezas" value={kpis.totalPieces.toLocaleString('es-CL')} icon={BarChart3} tooltip={getTooltip('kpi.totalPieces')} />
        <KPICard
          label="Punto Cero"
          value={`${kpis.pointZeroPieces.toLocaleString('es-CL')} (${kpis.pointZeroPct}%)`}
          icon={Target}
          severity={getPointZeroSeverity(kpis.pointZeroPct)}
          tooltip={getTooltip('kpi.pointZero')}
        />
        <KPICard
          label="Calibre Dominante"
          value={kpis.dominantCalibre ? `${kpis.dominantCalibre.calibre} (${kpis.dominantCalibre.pct}%)` : 'N/D'}
          icon={BarChart3}
          tooltip={getTooltip('kpi.calibreDominante')}
        />
        <KPICard
          label="Calidad Dominante"
          value={kpis.dominantQuality ? `${kpis.dominantQuality.quality} (${kpis.dominantQuality.pct}%)` : 'N/D'}
          icon={PieChart}
          tooltip={getTooltip('kpi.calidadDominante')}
        />
      </div>

      {/* KPIs extendidos (peso, lotes, tasa) */}
      {(kpis.avgWeightGrams != null || kpis.uniqueLots != null) && (
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
          {kpis.avgWeightGrams != null && (
            <KPICard
              label="Peso Promedio"
              value={`${kpis.avgWeightGrams.toLocaleString('es-CL')} g`}
              secondaryText={`Calibre eq.: ${avgWeightCalibre}`}
              statusBadge={
                getPointZeroSeverity(kpis.pointZeroPct) === 'critical'
                  ? { label: 'CRÍTICO', severity: 'critical' }
                  : getPointZeroSeverity(kpis.pointZeroPct) === 'warn'
                  ? { label: 'WARN', severity: 'warn' }
                  : { label: 'OK', severity: 'ok' }
              }
              icon={Scale}
              tooltip={getTooltip('kpi.avgWeight')}
            />
          )}
          {kpis.medianWeightGrams != null && (
            <KPICard
              label="Peso Mediana"
              value={`${kpis.medianWeightGrams.toLocaleString('es-CL')} g`}
              secondaryText={`Calibre eq.: ${medianWeightCalibre}`}
              statusBadge={
                getPointZeroSeverity(kpis.pointZeroPct) === 'critical'
                  ? { label: 'CRÍTICO', severity: 'critical' }
                  : getPointZeroSeverity(kpis.pointZeroPct) === 'warn'
                  ? { label: 'WARN', severity: 'warn' }
                  : { label: 'OK', severity: 'ok' }
              }
              icon={Scale}
              tooltip={getTooltip('kpi.medianWeight')}
            />
          )}
          {kpis.uniqueLots != null && kpis.uniqueLots > 0 && (
            <KPICard label="Lotes Procesados" value={kpis.uniqueLots.toString()} icon={Layers} tooltip={getTooltip('kpi.uniqueLots')} />
          )}
          {kpis.productionRatePerHour != null && kpis.productionRatePerHour > 0 && (
            <KPICard label="Piezas/Hora" value={kpis.productionRatePerHour.toLocaleString('es-CL')} icon={Activity} tooltip={getTooltip('kpi.productionRate')} />
          )}
        </div>
      )}

      {/* Trend summary */}
      {analytics.timeSeriesPointZero.length >= 3 && (
        <Card>
          <CardContent className="pt-4 flex items-center gap-3">
            {trend.direction === 'increasing' ? (
              <TrendingUp className="h-5 w-5 text-red-500" />
            ) : trend.direction === 'decreasing' ? (
              <TrendingDown className="h-5 w-5 text-green-500" />
            ) : (
              <Minus className="h-5 w-5 text-muted-foreground" />
            )}
            <div className="text-sm">
              <span className="font-medium">Tendencia Punto Cero: </span>
              {trend.direction === 'increasing'
                ? `Creciente (+${trend.slopePerHour} pz/hora)`
                : trend.direction === 'decreasing'
                ? `Decreciente (${trend.slopePerHour} pz/hora)`
                : 'Estable'}
              {trend.projectedPctIn2h != null && (
                <span className="text-muted-foreground ml-2">
                  | Proyección 2h: {trend.projectedPctIn2h}%
                </span>
              )}
              {trend.anomalyBuckets.length > 0 && (
                <Badge variant="destructive" className="ml-2 text-[10px]">
                  {trend.anomalyBuckets.length} anomalía(s)
                </Badge>
              )}
            </div>
          </CardContent>
        </Card>
      )}

      {/* ——— TABS ——— */}
      <Tabs defaultValue="punto-cero" className="w-full">
        <TabsList className="w-full flex gap-1 overflow-x-auto whitespace-nowrap">
          <TabsTrigger value="punto-cero" className="text-xs shrink-0">Punto Cero</TabsTrigger>
          <TabsTrigger value="lotes" className="text-xs shrink-0">Lotes</TabsTrigger>
          <TabsTrigger value="tendencia" className="text-xs shrink-0">Tendencia</TabsTrigger>
          <TabsTrigger value="matriz" className="text-xs shrink-0">Matriz Q×C</TabsTrigger>
          <TabsTrigger value="balance" className="text-xs shrink-0">Compuertas</TabsTrigger>
          <TabsTrigger value="insights" className="text-xs shrink-0">Sugerencias</TabsTrigger>
        </TabsList>

        {/* PUNTO CERO */}
        <TabsContent value="punto-cero" className="space-y-4">
          <GraderPuntoCeroTab
            analytics={analytics}
            kpis={kpis}
            config={config}
            patternByCalibre={patternByCalibre}
            patternByQuality={patternByQuality}
            patternByHour={patternByHour}
            patternTotalPieces={patternTotalPieces}
            patternCalibreChartData={patternCalibreChartData}
            patternQualityChartData={patternQualityChartData}
            patternHourChartData={patternHourChartData}
            patternCauseTrend={patternCauseTrend}
            patternCauseTrendChartData={patternCauseTrendChartData}
            patternIntervalDetailsByLabel={patternIntervalDetailsByLabel}
            selectedCauseLabel={selectedCauseLabel}
            onSelectedCauseLabelChange={setSelectedCauseLabel}
            timeFilterFrom={timeFilterFrom}
            onTimeFilterFromChange={setTimeFilterFrom}
            timeFilterTo={timeFilterTo}
            onTimeFilterToChange={setTimeFilterTo}
            patternIntervalMinutes={patternIntervalMinutes}
            onPatternIntervalMinutesChange={setPatternIntervalMinutes}
          />
        </TabsContent>

        {/* LOTES */}
        <TabsContent value="lotes" className="space-y-4 relative z-10">
          <GraderLotesTab
            lotAnalysisView={lotAnalysisView}
            lotDispersionView={lotDispersionView}
            lotDispersionSummary={lotDispersionSummary}
            directGateActions={directGateActions}
            lotStdDevTooltipProps={lotStdDevTooltipProps}
            getCvSignal={getCvSignal}
            getCalibreByWeightGrams={getCalibreByWeightGrams}
            getPointZeroTextClass={getPointZeroTextClass}
            getPointZeroBarColor={getPointZeroBarColor}
            onApplyGateAction={handleApplyGateAction}
            onApplyGateSuggestion={onApplyGateSuggestion}
          />
        </TabsContent>


        {/* TENDENCIA DE PESO */}
        <TabsContent value="tendencia" className="space-y-4">
          <GraderTendenciaTab
            analytics={analytics}
            config={config}
            siblingSessions={siblingSessions}
            weightTrendByTs={weightTrendByTs}
            wtStdDevTooltipProps={wtStdDevTooltipProps}
            getCvSignal={getCvSignal}
            trendForecastView={trendForecastView}
            shiftProgressView={shiftProgressView}
            sensorDegradationView={sensorDegradationView}
            multiSessionInsightsView={multiSessionInsightsView}
            shiftComparisonView={shiftComparisonView}
            trendAutoRecommendations={trendAutoRecommendations}
            trendAIRuns={trendAIRuns}
            trendAIConsistency={trendAIConsistency}
            trendAIDiffRows={trendAIDiffRows}
            aiLoading={aiLoading}
            pointZeroWarnThreshold={pointZeroWarnThreshold}
            pointZeroCriticalThreshold={pointZeroCriticalThreshold}
            trendWarnThreshold={trendWarnThreshold}
            trendCriticalThreshold={trendCriticalThreshold}
            showThresholds={showThresholds}
            onToggleThresholds={() => setShowThresholds((v) => !v)}
            onUpdateTrendWarnThreshold={(v) => {
              setTrendWarnThreshold(v)
              onUpdatePointZeroWarnThreshold?.(v)
            }}
            onUpdateTrendCriticalThreshold={(v) => {
              setTrendCriticalThreshold(v)
              onUpdatePointZeroCriticalThreshold?.(v)
            }}
            onUpdatePointZeroWarnThreshold={onUpdatePointZeroWarnThreshold}
            onUpdatePointZeroCriticalThreshold={onUpdatePointZeroCriticalThreshold}
            weightChartMode={weightChartMode}
            onSetWeightChartMode={setWeightChartMode}
            showAIHistory={showAIHistory}
            onToggleAIHistory={() => setShowAIHistory((v) => !v)}
            getPointZeroSeverity={getPointZeroSeverity}
            onApplyGateAction={handleApplyGateAction}
            onAnalyzeAI={handleAnalyzeAI}
            onApplyGateSuggestion={onApplyGateSuggestion}
            pieceRecords={parsedData.pieceRecords}
            shiftId={config.shiftId ?? currentSessionMeta?.shiftId ?? 'Sin turno'}
            dateKey={currentSessionMeta?.sessionDate ?? analytics.config.startAt?.slice(0, 10) ?? ''}
          />
        </TabsContent>

        {/* MATRIZ Q×C */}
        <TabsContent value="matriz" className="space-y-4">
          <GraderMatrizTab
            analytics={analytics}
            matrixQualities={matrixQualities}
            matrixCalibres={matrixCalibres}
          />
        </TabsContent>

        {/* BALANCE GATES */}
        <TabsContent value="balance" className="space-y-4">
          <GraderCompuertasTab
            analytics={analytics}
            physicalConfig={config.physicalConfig}
            gates={gates}
            errorThresholds={gateThresholds}
            onThresholdsChange={(patch) => setGateThresholds((prev) => ({ ...prev, ...patch }))}
          />
        </TabsContent>

        {/* DIAGNÓSTICO */}
        <TabsContent value="insights" className="space-y-4">
          <GraderSugerenciasTab
            insights={insights}
            aiLoading={aiLoading}
            aiOutput={aiOutput}
            aiError={aiError}
            aiRawText={aiRawText}
            onAnalyzeAI={handleAnalyzeAI}
          />
        </TabsContent>
      </Tabs>
    </div>
  )
}

// ============================================================================
// SUB-COMPONENTS
// ============================================================================

function KPICard({
  label,
  value,
  secondaryText,
  statusBadge,
  icon: Icon,
  severity,
  tooltip,
}: {
  label: string
  value: string
  secondaryText?: string
  statusBadge?: { label: string; severity: 'ok' | 'warn' | 'critical' }
  icon: React.ElementType
  severity?: 'ok' | 'warn' | 'critical'
  tooltip?: string
}) {
  return (
    <Card
      className={cn(
        severity === 'critical' && 'border-red-300',
        severity === 'warn' && 'border-amber-300',
      )}
    >
      <CardContent className="pt-4">
        <div className="flex items-center gap-2 mb-1">
          <Icon className="h-4 w-4 text-muted-foreground" />
          <span className="text-xs text-muted-foreground">{label}</span>
          {tooltip && <InfoTooltip text={tooltip} iconSize={12} />}
          {statusBadge && (
            <Badge
              variant="outline"
              className={cn(
                'text-[9px] px-1.5 py-0 h-4 ml-auto',
                statusBadge.severity === 'critical' && 'text-red-600 border-red-300',
                statusBadge.severity === 'warn' && 'text-amber-600 border-amber-300',
                statusBadge.severity === 'ok' && 'text-emerald-600 border-emerald-300',
              )}
            >
              {statusBadge.label}
            </Badge>
          )}
        </div>
        <p
          className={cn(
            'text-xl font-bold tabular-nums leading-tight',
            severity === 'critical' && 'text-red-600',
            severity === 'warn' && 'text-amber-600',
          )}
        >
          {value}
        </p>
        {secondaryText && (
          <p className="text-[11px] text-muted-foreground mt-1">{secondaryText}</p>
        )}
      </CardContent>
    </Card>
  )
}

