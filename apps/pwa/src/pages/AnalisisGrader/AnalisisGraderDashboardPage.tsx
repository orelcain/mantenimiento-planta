/**
 * P3) Dashboard de Análisis Grader
 *
 * KPIs, Punto Cero, distribuciones, matriz Q×C (enhanced),
 * balance de gates (enhanced), lotes, tendencia de peso,
 * insights, panel IA, exportación y guardado de sesión.
 *
 * v2.46.1 — P0 inteligente, rangos de peso, persistencia archivos, tooltips ricos, modo día/noche
 */

import { useState, useMemo, useRef, Fragment, useEffect } from 'react'
import { Card, CardContent, CardHeader, CardTitle, Button, Badge, Tabs, TabsContent, TabsList, TabsTrigger, InfoTooltip } from '@/components/ui'
import {
  ChevronLeft,
  Download,
  Save,
  AlertTriangle,
  TrendingUp,
  TrendingDown,
  Minus,
  Info,
  Brain,
  BarChart3,
  PieChart,
  Table2,
  Target,
  Zap,
  Loader2,
  CheckCircle,
  XCircle,
  FileSpreadsheet,
  FileText,
  Layers,
  Activity,
  ArrowRightLeft,
  Scale,
  Sun,
  Moon,
  ChevronDown,
  Eye,
} from 'lucide-react'
import { Bar, Doughnut, Line } from 'react-chartjs-2'
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

import { useAuthStore } from '@/store'
import { cn } from '@/lib/utils'
import { CALIBRE_WEIGHT_RANGES, computeAnalytics } from '@/services/grader/graderAnalytics'
import { computeDeterministicInsights, computePointZeroTrend } from '@/services/grader/graderInsights'
import { analyzeGrader, parseAIResponse } from '@/services/ai/aiProvider'
import { saveGraderSession } from '@/services/grader/graderSession.service'
import { getTooltip, getTooltipProps } from '@/services/grader/graderTooltips'
import type {
  ParsedMatrixData,
  GateAssignment,
  GraderAnalysisConfig,
  GraderAnalyticsResult,
  DeterministicInsight,
  AIGraderInput,
  AIGraderOutput,
  GateSwapSuggestion,
} from '@/services/grader/types'

ChartJS.register(CategoryScale, LinearScale, BarElement, PointElement, LineElement, ArcElement, Title, Tooltip, Legend, TimeScale, Filler)

/** Helper: porcentaje con 2 decimales */
function pctCalc(part: number, total: number): number {
  return total === 0 ? 0 : Math.round((part / total) * 10000) / 100
}

function getCalibreByWeightGrams(weightGrams?: number | null): string {
  if (weightGrams == null || !Number.isFinite(weightGrams) || weightGrams <= 0) return 'N/D'
  const match = CALIBRE_WEIGHT_RANGES.find((rng) => weightGrams >= rng.minGrams && weightGrams < rng.maxGrams)
  if (match) return match.calibre
  const lastRange = CALIBRE_WEIGHT_RANGES[CALIBRE_WEIGHT_RANGES.length - 1]
  if (lastRange && weightGrams >= lastRange.maxGrams) return 'Sobre rango'
  return 'Fuera de rango'
}

function resolveCalibreLabel(rawCalibre?: string | null, weightGrams?: number | null): string {
  const normalizedCalibre = (rawCalibre ?? '').trim()
  if (normalizedCalibre && normalizedCalibre !== '-' && normalizedCalibre !== '—') {
    return normalizedCalibre
  }
  return getCalibreByWeightGrams(weightGrams)
}

function parseTimeHHMMToMinutes(value?: string): number | null {
  if (!value) return null
  const m = value.match(/^(\d{2}):(\d{2})$/)
  if (!m) return null
  const hh = Number(m[1])
  const mm = Number(m[2])
  if (!Number.isFinite(hh) || !Number.isFinite(mm) || hh < 0 || hh > 23 || mm < 0 || mm > 59) return null
  return (hh * 60) + mm
}

function isMinuteWithinRange(minuteOfDay: number, fromMinute: number | null, toMinute: number | null): boolean {
  if (fromMinute == null && toMinute == null) return true
  if (fromMinute != null && toMinute != null) {
    if (fromMinute <= toMinute) {
      return minuteOfDay >= fromMinute && minuteOfDay <= toMinute
    }
    return minuteOfDay >= fromMinute || minuteOfDay <= toMinute
  }
  if (fromMinute != null) return minuteOfDay >= fromMinute
  return minuteOfDay <= (toMinute as number)
}

function formatMinuteOfDayLabel(minuteOfDay: number): string {
  const normalized = ((minuteOfDay % 1440) + 1440) % 1440
  const hh = Math.floor(normalized / 60)
  const mm = normalized % 60
  return `${String(hh).padStart(2, '0')}:${String(mm).padStart(2, '0')}`
}

interface Props {
  parsedData: ParsedMatrixData
  gates: GateAssignment[]
  config: GraderAnalysisConfig
  onBack: () => void
}

interface PinnedPatternPoint {
  id: string
  label: string
  dataIndex: number
  pieces: number
  pct: number
  calibres: Array<{ key: string; pieces: number }>
  qualities: Array<{ key: string; pieces: number }>
  x: number
  y: number
}

export function AnalisisGraderDashboardPage({ parsedData, gates, config, onBack }: Props) {
  const user = useAuthStore((s) => s.user)
  const [saving, setSaving] = useState(false)
  const [saved, setSaved] = useState(false)
  const [aiLoading, setAiLoading] = useState(false)
  const [aiOutput, setAiOutput] = useState<AIGraderOutput | null>(null)
  const [aiError, setAiError] = useState<string | null>(null)
  const [aiRawText, setAiRawText] = useState<string | null>(null)
  const [reportMode, setReportMode] = useState<'light' | 'dark'>('dark')
  const [expandedCause, setExpandedCause] = useState<string | null>(null)
  const [p0ErrorFilter, setP0ErrorFilter] = useState<string | null>(null)
  const [selectedCauseLabel, setSelectedCauseLabel] = useState<string | null>(null)
  const [timeFilterFrom, setTimeFilterFrom] = useState<string>('')
  const [timeFilterTo, setTimeFilterTo] = useState<string>('')
  const [patternIntervalMinutes, setPatternIntervalMinutes] = useState<number>(60)
  const [pinnedPatternPoints, setPinnedPatternPoints] = useState<PinnedPatternPoint[]>([])
  const [draggingPinnedId, setDraggingPinnedId] = useState<string | null>(null)
  const dashRef = useRef<HTMLDivElement>(null)
  const patternLineChartRef = useRef<ChartJS<'line'> | null>(null)
  const patternChartContainerRef = useRef<HTMLDivElement>(null)
  const draggingPinnedOffsetRef = useRef<{ id: string; offsetX: number; offsetY: number } | null>(null)

  // Compute analytics
  const analytics = useMemo<GraderAnalyticsResult>(
    () => computeAnalytics(parsedData, config, gates),
    [parsedData, config, gates],
  )

  const insights = useMemo<DeterministicInsight[]>(
    () => computeDeterministicInsights(analytics),
    [analytics],
  )

  const trend = useMemo(() => computePointZeroTrend(analytics), [analytics])
  const avgWeightCalibre = useMemo(() => getCalibreByWeightGrams(analytics.kpis.avgWeightGrams), [analytics.kpis.avgWeightGrams])
  const medianWeightCalibre = useMemo(() => getCalibreByWeightGrams(analytics.kpis.medianWeightGrams), [analytics.kpis.medianWeightGrams])
  const pointZeroDetailRecords = useMemo(() => {
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

  const patternByCalibre = useMemo(() => {
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

  const patternByQuality = useMemo(() => {
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

  const patternByHour = useMemo(() => {
    const safeInterval = Math.min(60, Math.max(1, Math.round(patternIntervalMinutes || 60)))
    const map = new Map<number, number>()
    for (const r of filteredPatternRecords) {
      const dt = new Date(r.ts)
      if (!Number.isFinite(dt.getTime())) continue
      const minuteOfDay = dt.getHours() * 60 + dt.getMinutes()
      const bucketMinute = Math.floor(minuteOfDay / safeInterval) * safeInterval
      map.set(bucketMinute, (map.get(bucketMinute) ?? 0) + r.pieces)
    }
    return Array.from(map.entries())
      .sort((a, b) => a[0] - b[0])
      .map(([bucketMinute, pieces]) => ({
        hour: formatMinuteOfDayLabel(bucketMinute),
        pieces,
        pct: patternTotalPieces > 0 ? Math.round((pieces / patternTotalPieces) * 10000) / 100 : 0,
      }))
  }, [filteredPatternRecords, patternIntervalMinutes, patternTotalPieces])

  const patternIntervalDetailsByLabel = useMemo(() => {
    const safeInterval = Math.min(60, Math.max(1, Math.round(patternIntervalMinutes || 60)))
    const bucketMap = new Map<string, { totalPieces: number; calibreMap: Map<string, number>; qualityMap: Map<string, number> }>()

    for (const r of filteredPatternRecords) {
      const dt = new Date(r.ts)
      if (!Number.isFinite(dt.getTime())) continue
      const minuteOfDay = dt.getHours() * 60 + dt.getMinutes()
      const bucketMinute = Math.floor(minuteOfDay / safeInterval) * safeInterval
      const label = formatMinuteOfDayLabel(bucketMinute)

      const bucket = bucketMap.get(label) || { totalPieces: 0, calibreMap: new Map<string, number>(), qualityMap: new Map<string, number>() }
      bucket.totalPieces += r.pieces

      const calibreKey = r.calibre || 'N/D'
      bucket.calibreMap.set(calibreKey, (bucket.calibreMap.get(calibreKey) ?? 0) + r.pieces)

      const qualityKey = r.quality || 'Unknown'
      bucket.qualityMap.set(qualityKey, (bucket.qualityMap.get(qualityKey) ?? 0) + r.pieces)

      bucketMap.set(label, bucket)
    }

    const detailMap = new Map<string, { totalPieces: number; calibres: Array<{ key: string; pieces: number }>; qualities: Array<{ key: string; pieces: number }> }>()
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

  const topPatternCalibre = patternByCalibre[0]
  const topPatternQuality = patternByQuality[0]
  const peakPatternHour = patternByHour.reduce<{ hour: string; pieces: number; pct: number } | null>(
    (acc, cur) => (acc == null || cur.pieces > acc.pieces ? cur : acc),
    null,
  )

  const patternCalibreChartData = {
    labels: patternByCalibre.map((d) => d.key),
    datasets: [
      {
        label: '% por calibre',
        data: patternByCalibre.map((d) => d.pct),
        backgroundColor: 'rgba(59,130,246,0.75)',
        borderRadius: 6,
      },
    ],
  }

  const patternQualityChartData = {
    labels: patternByQuality.map((d) => d.key),
    datasets: [
      {
        label: '% por calidad',
        data: patternByQuality.map((d) => d.pct),
        backgroundColor: 'rgba(16,185,129,0.75)',
        borderRadius: 6,
      },
    ],
  }

  const patternHourChartData = {
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
  }

  const getPatternPointPixels = (dataIndex: number): { x: number; y: number } | null => {
    const chart = patternLineChartRef.current
    if (!chart) return null
    const meta = chart.getDatasetMeta(0)
    const pointEl = meta?.data?.[dataIndex]
    if (!pointEl) return null
    const point = pointEl.getProps(['x', 'y'], true)
    if (!Number.isFinite(point.x) || !Number.isFinite(point.y)) return null
    return { x: point.x, y: point.y }
  }

  const handlePinPatternPoint = (dataIndex: number) => {
    const bucket = patternByHour[dataIndex]
    if (!bucket) return

    const detail = patternIntervalDetailsByLabel.get(bucket.hour)
    const pointPixels = getPatternPointPixels(dataIndex)

    setPinnedPatternPoints((prev) => {
      const existingIdx = prev.findIndex((p) => p.label === bucket.hour)
      const existingPin = existingIdx >= 0 ? prev[existingIdx] : null
      const defaultX = pointPixels ? pointPixels.x + 14 : 16
      const defaultY = pointPixels ? Math.max(8, pointPixels.y - 12) : 16
      const nextPin: PinnedPatternPoint = {
        id: existingPin ? existingPin.id : `${bucket.hour}-${dataIndex}`,
        label: bucket.hour,
        dataIndex,
        pieces: bucket.pieces,
        pct: bucket.pct,
        calibres: detail?.calibres ?? [],
        qualities: detail?.qualities ?? [],
        x: existingPin ? existingPin.x : defaultX,
        y: existingPin ? existingPin.y : defaultY,
      }

      if (existingIdx >= 0) {
        const copy = [...prev]
        copy[existingIdx] = nextPin
        return copy
      }

      return [...prev, nextPin]
    })
  }

  const removePinnedPatternPoint = (id: string) => {
    setPinnedPatternPoints((prev) => prev.filter((pin) => pin.id !== id))
  }

  const startDraggingPinnedPoint = (event: React.MouseEvent<HTMLDivElement>, pinId: string) => {
    const target = event.currentTarget
    const rect = target.getBoundingClientRect()
    draggingPinnedOffsetRef.current = {
      id: pinId,
      offsetX: event.clientX - rect.left,
      offsetY: event.clientY - rect.top,
    }
    setDraggingPinnedId(pinId)
  }

  useEffect(() => {
    if (!draggingPinnedId) return

    const onMouseMove = (event: MouseEvent) => {
      const dragInfo = draggingPinnedOffsetRef.current
      const container = patternChartContainerRef.current
      if (!dragInfo || !container || dragInfo.id !== draggingPinnedId) return

      const containerRect = container.getBoundingClientRect()
      const rawX = event.clientX - containerRect.left - dragInfo.offsetX
      const rawY = event.clientY - containerRect.top - dragInfo.offsetY

      setPinnedPatternPoints((prev) => prev.map((pin) => (pin.id === draggingPinnedId ? { ...pin, x: rawX, y: rawY } : pin)))
    }

    const onMouseUp = () => {
      draggingPinnedOffsetRef.current = null
      setDraggingPinnedId(null)
    }

    window.addEventListener('mousemove', onMouseMove)
    window.addEventListener('mouseup', onMouseUp)
    return () => {
      window.removeEventListener('mousemove', onMouseMove)
      window.removeEventListener('mouseup', onMouseUp)
    }
  }, [draggingPinnedId])

  useEffect(() => {
    setPinnedPatternPoints((prev) => {
      return prev.flatMap((pin) => {
        const newIndex = patternByHour.findIndex((bucket) => bucket.hour === pin.label)
        if (newIndex < 0) return []
        const bucket = patternByHour[newIndex]
        if (!bucket) return []
        const detail = patternIntervalDetailsByLabel.get(bucket.hour)
        return [{
          ...pin,
          dataIndex: newIndex,
          pieces: bucket.pieces,
          pct: bucket.pct,
          calibres: detail?.calibres ?? [],
          qualities: detail?.qualities ?? [],
        }]
      })
    })
  }, [patternByHour, patternIntervalDetailsByLabel])

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
    }

    try {
      const result = await analyzeGrader(payload)
      setAiOutput(result)
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err)
      // Try to parse as raw text
      const parsed = parseAIResponse(msg)
      if (parsed.parsed) {
        setAiOutput(parsed.parsed)
      } else {
        setAiError(parsed.error || msg)
        setAiRawText(parsed.rawText || null)
      }
    } finally {
      setAiLoading(false)
    }
  }

  // ——— SAVE SESSION ———
  const [saveError, setSaveError] = useState<string | null>(null)
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
      console.error('[Guardar Sesión] Error:', msg)
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
          new Date(r.ts).toLocaleTimeString('es-CL', { hour: '2-digit', minute: '2-digit', second: '2-digit' }),
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
    pdfDoc.text(`Generado: ${new Date().toLocaleString()} | Dispositivo: ${config.deviceId || 'N/D'} | Período: ${analytics.config.startAt || '?'} — ${analytics.config.endAt || '?'}`, pageW / 2, y, { align: 'center' })
    y += 10

    // KPI table
    pdfDoc.setFontSize(12)
    pdfDoc.text('KPIs', 14, y)
    y += 2
    autoTable(pdfDoc, {
      startY: y,
      head: [['Métrica', 'Valor']],
      body: [
        ['Total Piezas', kpis.totalPieces.toLocaleString()],
        ['Peso Total (kg)', kpis.totalWeightKg?.toLocaleString() ?? 'N/D'],
        ['Punto Cero Piezas', kpis.pointZeroPieces.toLocaleString()],
        ['Punto Cero %', `${kpis.pointZeroPct}%`],
        ['Calibre Dominante', kpis.dominantCalibre ? `${kpis.dominantCalibre.calibre} (${kpis.dominantCalibre.pct}%)` : 'N/D'],
        ['Calidad Dominante', kpis.dominantQuality ? `${kpis.dominantQuality.quality} (${kpis.dominantQuality.pct}%)` : 'N/D'],
        ['Peso Promedio (g)', kpis.avgWeightGrams?.toLocaleString() ?? 'N/D'],
        ['Peso Mediana (g)', kpis.medianWeightGrams?.toLocaleString() ?? 'N/D'],
        ['Lotes Procesados', kpis.uniqueLots?.toString() ?? 'N/D'],
        ['Piezas/Hora', kpis.productionRatePerHour?.toLocaleString() ?? 'N/D'],
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
        body: analytics.distributionByCalibre.map(d => [d.key, d.pieces.toLocaleString(), `${d.pct}%`]),
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
        body: analytics.pointZeroByError.map(e => [e.error, e.pieces.toLocaleString(), `${e.pct}%`]),
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
          ...analytics.pointZeroClassification.causes.map(c => [c.label, c.pieces.toLocaleString(), `${c.pctOfPointZero}%`, `${c.pctOfTotal}%`]),
          ['TOTAL', analytics.pointZeroClassification.totalPointZeroPieces.toLocaleString(), '100%', `${kpis.pointZeroPct}%`],
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
          new Date(r.ts).toLocaleTimeString('es-CL', { hour: '2-digit', minute: '2-digit', second: '2-digit' }),
          r.causeLabel,
          r.error,
          r.pieces.toLocaleString(),
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
        body: analytics.pointZeroClassification.outOfRangeByWeight.map(d => [d.rangeLabel, d.pieces.toLocaleString(), `${d.pct}%`]),
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
        pivotBody.push([eLabel, eg.total.toLocaleString(), `${pctCalc(eg.total, analytics.pointZeroClassification.totalPointZeroPieces)}%`, `${pctCalc(eg.total, kpis.totalPieces)}%`])
        const qGroups = new Map<string, { rows: typeof hRows; total: number }>()
        for (const r of eg.rows) {
          const qg = qGroups.get(r.quality) || { rows: [], total: 0 }
          qg.rows.push(r)
          qg.total += r.pieces
          qGroups.set(r.quality, qg)
        }
        for (const [qLabel, qg] of Array.from(qGroups.entries())) {
          pivotBody.push([`  ${qLabel}`, qg.total.toLocaleString(), `${pctCalc(qg.total, analytics.pointZeroClassification.totalPointZeroPieces)}%`, `${pctCalc(qg.total, kpis.totalPieces)}%`])
          for (const r of qg.rows.sort((a, b) => b.pieces - a.pieces)) {
            pivotBody.push([`    ${r.calibre}`, r.pieces.toLocaleString(), `${r.pctOfPointZero}%`, `${r.pctOfTotal}%`])
          }
        }
      }
      pivotBody.push(['Total general', analytics.pointZeroClassification.totalPointZeroPieces.toLocaleString(), '100%', `${kpis.pointZeroPct}%`])
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

  // ——— CHART DATA ———
  const calibreChartData = {
    labels: analytics.distributionByCalibre.map((d) => d.key),
    datasets: [
      {
        label: 'Piezas',
        data: analytics.distributionByCalibre.map((d) => d.pieces),
        backgroundColor: [
          'rgba(59,130,246,0.7)',
          'rgba(16,185,129,0.7)',
          'rgba(245,158,11,0.7)',
          'rgba(139,92,246,0.7)',
          'rgba(239,68,68,0.7)',
          'rgba(107,114,128,0.7)',
        ],
      },
    ],
  }

  const qualityChartData = {
    labels: analytics.distributionByQuality.map((d) => d.key),
    datasets: [
      {
        label: 'Piezas',
        data: analytics.distributionByQuality.map((d) => d.pieces),
        backgroundColor: [
          'rgba(16,185,129,0.7)',
          'rgba(59,130,246,0.7)',
          'rgba(245,158,11,0.7)',
          'rgba(239,68,68,0.7)',
          'rgba(107,114,128,0.7)',
        ],
      },
    ],
  }

  // Classification donut for Punto Cero
  const classificationColors = [
    'rgba(239,68,68,0.8)',   // fuera_de_rango (red)
    'rgba(245,158,11,0.8)',  // fuera_de_limites (amber)
    'rgba(139,92,246,0.8)',  // no_leido_fotocelula (purple)
    'rgba(59,130,246,0.8)',  // too_close_too_long (blue)
    'rgba(16,185,129,0.8)',  // puerta_no_preparada (green)
    'rgba(107,114,128,0.8)', // otro (gray)
  ]

  const classificationChartData = {
    labels: analytics.pointZeroClassification.causes.map((c) => c.label),
    datasets: [
      {
        data: analytics.pointZeroClassification.causes.map((c) => c.pieces),
        backgroundColor: analytics.pointZeroClassification.causes.map((_, i) => classificationColors[i % classificationColors.length]),
      },
    ],
  }

  const timeSeriesData = {
    labels: analytics.timeSeriesPointZero.map((p) => p.bucketStart),
    datasets: [
      {
        label: 'Punto Cero (piezas)',
        data: analytics.timeSeriesPointZero.map((p) => p.pointZeroPieces),
        borderColor: 'rgba(239,68,68,0.9)',
        backgroundColor: 'rgba(239,68,68,0.1)',
        fill: true,
        tension: 0.3,
      },
    ],
  }

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

  return (
    <div
      ref={dashRef}
      className={cn('space-y-4 max-w-screen-xl mx-auto', reportMode === 'light' && 'grader-light-mode')}
    >
      {/* Top actions */}
      <div className="flex items-center justify-between flex-wrap gap-2">
        <Button variant="outline" size="sm" onClick={onBack}>
          <ChevronLeft className="h-4 w-4 mr-1" />
          Volver a Config
        </Button>
        <div className="flex gap-2 flex-wrap">
          <Button
            variant="outline"
            size="sm"
            onClick={() => setReportMode(reportMode === 'dark' ? 'light' : 'dark')}
            title={reportMode === 'dark' ? 'Cambiar a modo día' : 'Cambiar a modo noche'}
          >
            {reportMode === 'dark' ? <Sun className="h-4 w-4" /> : <Moon className="h-4 w-4" />}
          </Button>
          <Button variant="outline" size="sm" onClick={handleExport}>
            <Download className="h-4 w-4 mr-1" />
            JSON
          </Button>
          <Button variant="outline" size="sm" onClick={handleExportExcel}>
            <FileSpreadsheet className="h-4 w-4 mr-1" />
            Excel
          </Button>
          <Button variant="outline" size="sm" onClick={handleExportPDF}>
            <FileText className="h-4 w-4 mr-1" />
            PDF
          </Button>
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
        <KPICard label="Total Piezas" value={kpis.totalPieces.toLocaleString()} icon={BarChart3} tooltip={getTooltip('kpi.totalPieces')} />
        <KPICard
          label="Punto Cero"
          value={`${kpis.pointZeroPieces.toLocaleString()} (${kpis.pointZeroPct}%)`}
          icon={Target}
          severity={kpis.pointZeroPct > 3 ? 'critical' : kpis.pointZeroPct > 1.5 ? 'warn' : 'ok'}
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
            <KPICard label="Peso Promedio" value={`${kpis.avgWeightGrams.toLocaleString()} g`} icon={Scale} tooltip={getTooltip('kpi.avgWeight')} />
          )}
          {kpis.avgWeightGrams != null && (
            <KPICard label="Calibre por Peso Prom." value={avgWeightCalibre} icon={Scale} tooltip="Calibre equivalente según rango de peso promedio." />
          )}
          {kpis.medianWeightGrams != null && (
            <KPICard label="Peso Mediana" value={`${kpis.medianWeightGrams.toLocaleString()} g`} icon={Scale} tooltip={getTooltip('kpi.medianWeight')} />
          )}
          {kpis.medianWeightGrams != null && (
            <KPICard label="Calibre por Peso Med." value={medianWeightCalibre} icon={Scale} tooltip="Calibre equivalente según rango de peso mediana." />
          )}
          {kpis.uniqueLots != null && kpis.uniqueLots > 0 && (
            <KPICard label="Lotes Procesados" value={kpis.uniqueLots.toString()} icon={Layers} tooltip={getTooltip('kpi.uniqueLots')} />
          )}
          {kpis.productionRatePerHour != null && kpis.productionRatePerHour > 0 && (
            <KPICard label="Piezas/Hora" value={kpis.productionRatePerHour.toLocaleString()} icon={Activity} tooltip={getTooltip('kpi.productionRate')} />
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
          <TabsTrigger value="distribuciones" className="text-xs shrink-0">Distribuciones</TabsTrigger>
          <TabsTrigger value="lotes" className="text-xs shrink-0">Lotes</TabsTrigger>
          <TabsTrigger value="tendencia" className="text-xs shrink-0">Tendencia</TabsTrigger>
          <TabsTrigger value="matriz" className="text-xs shrink-0">Matriz Q×C</TabsTrigger>
          <TabsTrigger value="balance" className="text-xs shrink-0">Balance Gates</TabsTrigger>
          <TabsTrigger value="insights" className="text-xs shrink-0">Diagnóstico</TabsTrigger>
        </TabsList>

        {/* PUNTO CERO */}
        <TabsContent value="punto-cero" className="space-y-4">
          {/* Clasificación 100% Punto Cero */}
          {analytics.pointZeroClassification.causes.length > 0 && (
            <Card className="border-red-200">
              <CardHeader>
                <CardTitle className="text-sm flex items-center gap-2">
                  <Target className="h-4 w-4 text-red-500" />
                  Clasificación Punto Cero — 100%
                  <InfoTooltip {...getTooltipProps('pz.clasificacion')} />
                </CardTitle>
                <p className="text-xs text-muted-foreground">
                  {analytics.pointZeroClassification.totalPointZeroPieces.toLocaleString()} piezas totales en Punto Cero
                </p>
              </CardHeader>
              <CardContent>
                <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
                  {/* Donut chart */}
                  <div className="flex items-center justify-center">
                    <div className="w-full max-w-[280px]">
                      <Doughnut
                        data={classificationChartData}
                        options={{
                          responsive: true,
                          plugins: {
                            legend: { position: 'bottom', labels: { font: { size: 11 } } },
                            tooltip: {
                              callbacks: {
                                label: (ctx) => {
                                  const cause = analytics.pointZeroClassification.causes[ctx.dataIndex]
                                  return cause
                                    ? `${cause.label}: ${cause.pieces.toLocaleString()} pz (${cause.pctOfPointZero}%)`
                                    : ''
                                },
                              },
                            },
                          },
                        }}
                      />
                    </div>
                  </div>

                  {/* Table */}
                  <div className="overflow-x-auto overflow-y-visible">
                    <table className="w-full text-sm">
                      <thead>
                        <tr className="border-b text-left">
                          <th className="py-2 px-2 w-6"></th>
                          <th className="py-2 px-2">Causa</th>
                          <th className="py-2 px-2 text-right">Piezas</th>
                          <th className="py-2 px-2 text-right">% P.Cero</th>
                          <th className="py-2 px-2 text-right">% Total</th>
                          <th className="py-2 px-2 text-right">Peso (kg)</th>
                        </tr>
                      </thead>
                      <tbody>
                        {analytics.pointZeroClassification.causes.map((c, i) => {
                          const isExpanded = expandedCause === c.cause
                          const hasRecords = c.records && c.records.length > 0
                          return (
                            <Fragment key={i}>
                              <tr
                                className={cn(
                                  'border-b hover:bg-muted/30',
                                  hasRecords && 'cursor-pointer',
                                  isExpanded && 'bg-muted/20',
                                )}
                                onClick={() => {
                                  if (!hasRecords) return
                                  setExpandedCause(isExpanded ? null : c.cause)
                                  setSelectedCauseLabel((prev) => (prev === c.label ? null : c.label))
                                }}
                              >
                                <td className="py-2 px-1 text-center">
                                  {hasRecords && (
                                    <ChevronDown className={cn('h-3.5 w-3.5 text-muted-foreground transition-transform', isExpanded && 'rotate-180')} />
                                  )}
                                </td>
                                <td className="py-2 px-2">
                                  <div>
                                    <span className="font-medium">{c.label}</span>
                                    <p className="text-[10px] text-muted-foreground">{c.description}</p>
                                  </div>
                                </td>
                                <td className="py-2 px-2 text-right font-medium">{c.pieces.toLocaleString()}</td>
                                <td className="py-2 px-2 text-right">
                                  <span className={cn(
                                    'font-medium',
                                    c.pctOfPointZero >= 50 && 'text-red-600',
                                    c.pctOfPointZero >= 10 && c.pctOfPointZero < 50 && 'text-amber-600',
                                  )}>
                                    {c.pctOfPointZero}%
                                  </span>
                                </td>
                                <td className="py-2 px-2 text-right text-muted-foreground">{c.pctOfTotal}%</td>
                                <td className="py-2 px-2 text-right">{c.weightKg ? c.weightKg.toLocaleString() : '—'}</td>
                              </tr>
                              {/* Drill-down rows */}
                              {isExpanded && c.records && (
                                <tr>
                                  <td colSpan={6} className="p-0">
                                    <div className="bg-muted/10 border-l-4 border-primary/30 px-3 py-2 max-h-[300px] overflow-y-auto">
                                      <p className="text-xs font-medium mb-2 flex items-center gap-1">
                                        <Eye className="h-3 w-3" />
                                        Detalle pieza-pieza ({c.records.length} registros)
                                      </p>
                                      <table className="w-full text-xs">
                                        <thead>
                                          <tr className="border-b text-left text-muted-foreground">
                                            <th className="py-1 px-1">Hora</th>
                                            <th className="py-1 px-1">Error</th>
                                            <th className="py-1 px-1 text-right">Pzas</th>
                                            <th className="py-1 px-1 text-right">Peso/pza (g)</th>
                                            <th className="py-1 px-1">Calidad</th>
                                            <th className="py-1 px-1">Calibre</th>
                                            <th className="py-1 px-1">Lote</th>
                                          </tr>
                                        </thead>
                                        <tbody>
                                          {c.records.map((r, j) => (
                                            <tr key={j} className="border-b border-muted/30 hover:bg-muted/20">
                                              <td className="py-0.5 px-1 font-mono text-muted-foreground">
                                                {new Date(r.ts).toLocaleTimeString('es-CL', { hour: '2-digit', minute: '2-digit', second: '2-digit' })}
                                              </td>
                                              <td className="py-0.5 px-1">{r.error}</td>
                                              <td className="py-0.5 px-1 text-right">{r.pieces}</td>
                                              <td className="py-0.5 px-1 text-right font-mono">
                                                {r.weightPerPieceGrams ? r.weightPerPieceGrams.toFixed(0) : '—'}
                                              </td>
                                              <td className="py-0.5 px-1">{r.quality || '—'}</td>
                                              <td className="py-0.5 px-1">{resolveCalibreLabel(r.calibre, r.weightPerPieceGrams)}</td>
                                              <td className="py-0.5 px-1 text-muted-foreground">{r.lot || '—'}</td>
                                            </tr>
                                          ))}
                                        </tbody>
                                      </table>
                                    </div>
                                  </td>
                                </tr>
                              )}
                            </Fragment>
                          )
                        })}
                        {/* Total row */}
                        <tr className="border-t-2 font-bold bg-muted/50">
                          <td className="py-2 px-1"></td>
                          <td className="py-2 px-2">TOTAL</td>
                          <td className="py-2 px-2 text-right">{analytics.pointZeroClassification.totalPointZeroPieces.toLocaleString()}</td>
                          <td className="py-2 px-2 text-right">100%</td>
                          <td className="py-2 px-2 text-right">{kpis.pointZeroPct}%</td>
                          <td className="py-2 px-2 text-right">—</td>
                        </tr>
                      </tbody>
                    </table>
                  </div>
                </div>
              </CardContent>
            </Card>
          )}

          <Card>
            <CardHeader>
              <CardTitle className="text-sm flex items-center gap-2">
                <Activity className="h-4 w-4 text-cyan-500" />
                Patrones Punto Cero (Causa + Horario)
                <InfoTooltip {...getTooltipProps('pz.pivote')} />
              </CardTitle>
              <p className="text-xs text-muted-foreground">
                Filtra por causa y rango horario para identificar concentraciones por calibre, calidad y hora.
              </p>
              <div className="grid grid-cols-1 md:grid-cols-5 gap-3 mt-2">
                <div className="md:col-span-2">
                  <label className="text-[11px] text-muted-foreground block mb-1">Causa</label>
                  <select
                    className="w-full bg-background border rounded px-2 py-1.5 text-xs"
                    value={selectedCauseLabel ?? ''}
                    onChange={(e) => setSelectedCauseLabel(e.target.value || null)}
                  >
                    <option value="">Todas</option>
                    {analytics.pointZeroClassification.causes
                      .filter((c) => (c.records?.length ?? 0) > 0)
                      .map((c) => (
                        <option key={c.label} value={c.label}>
                          {c.label}
                        </option>
                      ))}
                  </select>
                </div>
                <div>
                  <label className="text-[11px] text-muted-foreground block mb-1">Desde</label>
                  <input
                    type="time"
                    className="w-full bg-background border rounded px-2 py-1.5 text-xs"
                    value={timeFilterFrom}
                    onChange={(e) => setTimeFilterFrom(e.target.value)}
                  />
                </div>
                <div>
                  <label className="text-[11px] text-muted-foreground block mb-1">Hasta</label>
                  <input
                    type="time"
                    className="w-full bg-background border rounded px-2 py-1.5 text-xs"
                    value={timeFilterTo}
                    onChange={(e) => setTimeFilterTo(e.target.value)}
                  />
                </div>
                <div>
                  <label className="text-[11px] text-muted-foreground block mb-1">Intervalo (min)</label>
                  <input
                    type="range"
                    min={1}
                    max={60}
                    step={1}
                    className="w-full"
                    value={patternIntervalMinutes}
                    onChange={(e) => setPatternIntervalMinutes(Math.min(60, Math.max(1, Number(e.target.value) || 60)))}
                  />
                  <div className="text-[10px] text-muted-foreground mt-1">{patternIntervalMinutes} min</div>
                </div>
              </div>
              <div className="flex items-center gap-2 mt-2">
                <Badge variant="outline" className="text-[11px]">Piezas filtradas: {patternTotalPieces.toLocaleString()}</Badge>
                {topPatternCalibre && <Badge variant="secondary" className="text-[11px]">Top calibre: {topPatternCalibre.key} ({topPatternCalibre.pct}%)</Badge>}
                {topPatternQuality && <Badge variant="secondary" className="text-[11px]">Top calidad: {topPatternQuality.key} ({topPatternQuality.pct}%)</Badge>}
                {peakPatternHour && <Badge variant="secondary" className="text-[11px]">Hora pico: {peakPatternHour.hour} ({peakPatternHour.pct}%)</Badge>}
                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  className="text-xs ml-auto"
                  onClick={() => {
                    setSelectedCauseLabel(null)
                    setTimeFilterFrom('')
                    setTimeFilterTo('')
                    setPatternIntervalMinutes(60)
                    setPinnedPatternPoints([])
                  }}
                >
                  Limpiar filtros
                </Button>
              </div>
            </CardHeader>
            <CardContent className="space-y-5">
              {patternTotalPieces === 0 ? (
                <p className="text-xs text-muted-foreground">No hay registros para el filtro seleccionado.</p>
              ) : (
                <>
                  <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
                    <div className="border rounded p-3">
                      <p className="text-xs font-medium mb-2">% por calibre</p>
                      <div className="w-full" style={{ height: Math.max(180, patternByCalibre.length * 34) }}>
                        <Bar
                          data={patternCalibreChartData}
                          options={{
                            indexAxis: 'y',
                            responsive: true,
                            maintainAspectRatio: false,
                            plugins: {
                              legend: { display: false },
                              tooltip: {
                                callbacks: {
                                  label: (ctx) => {
                                    const d = patternByCalibre[ctx.dataIndex]
                                    return d ? `${d.pieces.toLocaleString()} pz (${d.pct}%)` : ''
                                  },
                                },
                              },
                            },
                            scales: {
                              x: { beginAtZero: true, max: 100 },
                              y: { grid: { display: false } },
                            },
                          }}
                        />
                      </div>
                    </div>

                    <div className="border rounded p-3">
                      <p className="text-xs font-medium mb-2">% por calidad</p>
                      <div className="w-full" style={{ height: Math.max(180, patternByQuality.length * 34) }}>
                        <Bar
                          data={patternQualityChartData}
                          options={{
                            indexAxis: 'y',
                            responsive: true,
                            maintainAspectRatio: false,
                            plugins: {
                              legend: { display: false },
                              tooltip: {
                                callbacks: {
                                  label: (ctx) => {
                                    const d = patternByQuality[ctx.dataIndex]
                                    return d ? `${d.pieces.toLocaleString()} pz (${d.pct}%)` : ''
                                  },
                                },
                              },
                            },
                            scales: {
                              x: { beginAtZero: true, max: 100 },
                              y: { grid: { display: false } },
                            },
                          }}
                        />
                      </div>
                    </div>
                  </div>

                  <div className="border rounded p-3">
                    <div className="flex items-center justify-between mb-2 gap-2">
                      <p className="text-xs font-medium">Patrón por intervalo ({patternIntervalMinutes} min)</p>
                      <p className="text-[10px] text-muted-foreground">Click para fijar, arrastra para comparar, X para quitar</p>
                    </div>
                    <div ref={patternChartContainerRef} className="w-full relative" style={{ height: 220 }}>
                      <Line
                        ref={patternLineChartRef}
                        data={patternHourChartData}
                        options={{
                          responsive: true,
                          maintainAspectRatio: false,
                          onClick: (_event, elements) => {
                            const first = elements?.[0]
                            if (!first) return
                            handlePinPatternPoint(first.index)
                          },
                          plugins: {
                            legend: { display: false },
                            tooltip: {
                              callbacks: {
                                label: (ctx) => {
                                  const bucket = patternByHour[ctx.dataIndex]
                                  return bucket ? `Piezas: ${bucket.pieces.toLocaleString()} (${bucket.pct}%)` : ''
                                },
                                afterBody: (items) => {
                                  const first = items?.[0]
                                  if (!first) return []
                                  const detail = patternIntervalDetailsByLabel.get(String(first.label))
                                  if (!detail) return []

                                  const lines: string[] = []
                                  lines.push('')
                                  lines.push('Calibre:')
                                  for (const c of detail.calibres) {
                                    lines.push(`- ${c.key}: ${c.pieces.toLocaleString()} pz`)
                                  }
                                  lines.push('')
                                  lines.push('Calidad:')
                                  for (const q of detail.qualities) {
                                    lines.push(`- ${q.key}: ${q.pieces.toLocaleString()} pz`)
                                  }
                                  return lines
                                },
                              },
                            },
                          },
                          scales: {
                            y: { beginAtZero: true },
                            x: { grid: { color: 'rgba(128,128,128,0.1)' } },
                          },
                        }}
                      />

                      <svg className="absolute inset-0 pointer-events-none text-muted-foreground" width="100%" height="100%">
                        {pinnedPatternPoints.map((pin) => {
                          const point = getPatternPointPixels(pin.dataIndex)
                          if (!point) return null
                          const lineEndX = pin.x > point.x ? pin.x : pin.x + 224
                          const lineEndY = pin.y + 18
                          return (
                            <line
                              key={`line-${pin.id}`}
                              x1={point.x}
                              y1={point.y}
                              x2={lineEndX}
                              y2={lineEndY}
                              stroke="currentColor"
                              strokeOpacity="0.65"
                              strokeWidth="1.5"
                              strokeDasharray="4 3"
                            />
                          )
                        })}
                      </svg>

                      {pinnedPatternPoints.map((pin) => (
                        <div
                          key={pin.id}
                          className={cn(
                            'absolute z-20 w-56 rounded border bg-card/95 shadow-sm p-2 text-[11px] cursor-move select-none',
                            draggingPinnedId === pin.id && 'ring-1 ring-primary/60',
                          )}
                          style={{ left: pin.x, top: pin.y }}
                          onMouseDown={(event) => startDraggingPinnedPoint(event, pin.id)}
                        >
                          <div className="flex items-start justify-between gap-2">
                            <div>
                              <p className="font-semibold">{pin.label}</p>
                              <p className="text-muted-foreground">{pin.pieces.toLocaleString()} pz ({pin.pct}%)</p>
                            </div>
                            <button
                              type="button"
                              className="text-muted-foreground hover:text-foreground leading-none"
                              onMouseDown={(event) => event.stopPropagation()}
                              onClick={(event) => {
                                event.stopPropagation()
                                removePinnedPatternPoint(pin.id)
                              }}
                              aria-label={`Quitar comparación ${pin.label}`}
                            >
                              ✕
                            </button>
                          </div>

                          <div className="mt-1">
                            <p className="font-medium">Calibre</p>
                            {pin.calibres.map((row) => (
                              <p key={`${pin.id}-c-${row.key}`} className="text-muted-foreground">- {row.key}: {row.pieces.toLocaleString()} pz</p>
                            ))}
                          </div>

                          <div className="mt-1">
                            <p className="font-medium">Calidad</p>
                            {pin.qualities.map((row) => (
                              <p key={`${pin.id}-q-${row.key}`} className="text-muted-foreground">- {row.key}: {row.pieces.toLocaleString()} pz</p>
                            ))}
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>

                  <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
                    <div className="overflow-x-auto">
                      <table className="w-full text-xs">
                        <thead>
                          <tr className="border-b">
                            <th className="py-1.5 px-2 text-left">Calibre</th>
                            <th className="py-1.5 px-2 text-right">Piezas</th>
                            <th className="py-1.5 px-2 text-right">%</th>
                          </tr>
                        </thead>
                        <tbody>
                          {patternByCalibre.map((row) => (
                            <tr key={row.key} className="border-b">
                              <td className="py-1 px-2">{row.key}</td>
                              <td className="py-1 px-2 text-right">{row.pieces.toLocaleString()}</td>
                              <td className="py-1 px-2 text-right">{row.pct}%</td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>

                    <div className="overflow-x-auto">
                      <table className="w-full text-xs">
                        <thead>
                          <tr className="border-b">
                            <th className="py-1.5 px-2 text-left">Calidad</th>
                            <th className="py-1.5 px-2 text-right">Piezas</th>
                            <th className="py-1.5 px-2 text-right">%</th>
                          </tr>
                        </thead>
                        <tbody>
                          {patternByQuality.map((row) => (
                            <tr key={row.key} className="border-b">
                              <td className="py-1 px-2">{row.key}</td>
                              <td className="py-1 px-2 text-right">{row.pieces.toLocaleString()}</td>
                              <td className="py-1 px-2 text-right">{row.pct}%</td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  </div>
                </>
              )}
            </CardContent>
          </Card>

          {/* Tabla Pivote: Error × Calidad × Calibre */}
          {analytics.pointZeroClassification.hierarchy.length > 0 && (() => {
            const allRows = analytics.pointZeroClassification.hierarchy
            const filteredRows = p0ErrorFilter
              ? allRows.filter((r) => r.error === p0ErrorFilter)
              : allRows

            // Unique error labels for filter chips
            const uniqueErrors = Array.from(new Set(allRows.map((r) => r.error)))

            // Filtered total
            const filteredTotal = filteredRows.reduce((sum, r) => sum + r.pieces, 0)

            // Build grouped bar chart: one dataset per error type, grouped by calibre
            const allCalibres = Array.from(new Set(filteredRows.map((r) => r.calibre))).sort()

            const errorColorMap: Record<string, string> = {
              'Fuera de rango': 'rgba(239,68,68,0.75)',
              'Fuera de límites': 'rgba(245,158,11,0.75)',
              'No leído por fotocélula': 'rgba(139,92,246,0.75)',
              'Too close or too long': 'rgba(59,130,246,0.75)',
              'Puerta no preparada': 'rgba(16,185,129,0.75)',
              'Otro / Desconocido': 'rgba(107,114,128,0.75)',
            }

            // One dataset per error label
            const pivotBarDatasets = uniqueErrors.map((errorLabel) => {
              const data = allCalibres.map((cal) => {
                return filteredRows
                  .filter((r) => r.error === errorLabel && r.calibre === cal)
                  .reduce((sum, r) => sum + r.pieces, 0)
              })
              return {
                label: errorLabel,
                data,
                backgroundColor: errorColorMap[errorLabel] || 'rgba(107,114,128,0.6)',
                borderColor: errorColorMap[errorLabel]?.replace('0.75', '1') || 'rgba(107,114,128,1)',
                borderWidth: 1,
              }
            })

            return (
            <Card>
              <CardHeader>
                <CardTitle className="text-sm flex items-center gap-2">
                  <Table2 className="h-4 w-4 text-purple-500" />
                  Pivote Error × Calidad × Calibre
                  <InfoTooltip {...getTooltipProps('pz.pivote')} />
                </CardTitle>
                <p className="text-xs text-muted-foreground">
                  Desglose jerárquico: Error → Calidad → Calibre. Filtra por tipo de error.
                </p>
                {/* Filtros por tipo de error */}
                <div className="flex flex-wrap gap-2 mt-2">
                  <Badge
                    variant={p0ErrorFilter === null ? 'default' : 'outline'}
                    className="cursor-pointer text-xs"
                    onClick={() => setP0ErrorFilter(null)}
                  >
                    Todos ({analytics.pointZeroClassification.totalPointZeroPieces.toLocaleString()})
                  </Badge>
                  {uniqueErrors.map((errorLabel) => {
                    const errorTotal = allRows.filter((r) => r.error === errorLabel).reduce((s, r) => s + r.pieces, 0)
                    return (
                      <Badge
                        key={errorLabel}
                        variant={p0ErrorFilter === errorLabel ? 'default' : 'outline'}
                        className="cursor-pointer text-xs"
                        onClick={() => setP0ErrorFilter(p0ErrorFilter === errorLabel ? null : errorLabel)}
                      >
                        {errorLabel} ({errorTotal.toLocaleString()})
                      </Badge>
                    )
                  })}
                </div>
              </CardHeader>
              <CardContent className="space-y-6">
                {/* Gráfico de barras agrupadas */}
                {allCalibres.length > 0 && pivotBarDatasets.length > 0 && (
                  <div className="w-full" style={{ minHeight: 250 }}>
                    <Bar
                      data={{ labels: allCalibres, datasets: pivotBarDatasets }}
                      options={{
                        responsive: true,
                        maintainAspectRatio: false,
                        interaction: { mode: 'index', intersect: false },
                        plugins: {
                          legend: {
                            position: 'bottom',
                            labels: { font: { size: 10 }, boxWidth: 14 },
                          },
                          tooltip: {
                            callbacks: {
                              label: (ctx) => {
                                const v = ctx.parsed.y
                                if (!v) return ''
                                const pct = filteredTotal > 0 ? ((v / filteredTotal) * 100).toFixed(1) : '0'
                                return `${ctx.dataset.label}: ${v.toLocaleString()} pz (${pct}%)`
                              },
                            },
                          },
                        },
                        scales: {
                          x: {
                            ticks: { font: { size: 10 } },
                            grid: { color: 'rgba(128,128,128,0.1)' },
                          },
                          y: {
                            beginAtZero: true,
                            grid: { color: 'rgba(128,128,128,0.1)' },
                          },
                        },
                      }}
                      height={280}
                    />
                  </div>
                )}

                {/* Tabla pivote */}
                <div className="overflow-x-auto">
                  <table className="w-full text-sm">
                    <thead>
                      <tr className="border-b text-left">
                        <th className="py-2 px-2">Etiquetas de fila</th>
                        <th className="py-2 px-2 text-right">Piezas</th>
                        <th className="py-2 px-2 text-right">% P.Cero</th>
                        <th className="py-2 px-2 text-right">% Total</th>
                      </tr>
                    </thead>
                    <tbody>
                      {(() => {
                        // Group by error then quality
                        const errorGroups = new Map<string, { cause: string; rows: typeof filteredRows; total: number }>()
                        for (const r of filteredRows) {
                          const g = errorGroups.get(r.error) || { cause: r.error, rows: [], total: 0 }
                          g.rows.push(r)
                          g.total += r.pieces
                          errorGroups.set(r.error, g)
                        }
                        const elements: React.ReactNode[] = []
                        for (const [errorLabel, eg] of Array.from(errorGroups.entries())) {
                          // Error header row
                          elements.push(
                            <tr key={`e-${errorLabel}`} className="bg-muted/60 font-bold border-b">
                              <td className="py-2 px-2">{errorLabel}</td>
                              <td className="py-2 px-2 text-right">{eg.total.toLocaleString()}</td>
                              <td className="py-2 px-2 text-right">{pctCalc(eg.total, analytics.pointZeroClassification.totalPointZeroPieces)}%</td>
                              <td className="py-2 px-2 text-right text-muted-foreground">{pctCalc(eg.total, analytics.kpis.totalPieces)}%</td>
                            </tr>
                          )
                          // Group by quality within this error
                          const qualityGroups = new Map<string, { rows: typeof filteredRows; total: number }>()
                          for (const r of eg.rows) {
                            const qg = qualityGroups.get(r.quality) || { rows: [], total: 0 }
                            qg.rows.push(r)
                            qg.total += r.pieces
                            qualityGroups.set(r.quality, qg)
                          }
                          for (const [qualLabel, qg] of Array.from(qualityGroups.entries())) {
                            // Quality sub-header row
                            elements.push(
                              <tr key={`q-${errorLabel}-${qualLabel}`} className="font-semibold border-b hover:bg-muted/20">
                                <td className="py-1.5 px-2 pl-6">{qualLabel}</td>
                                <td className="py-1.5 px-2 text-right">{qg.total.toLocaleString()}</td>
                                <td className="py-1.5 px-2 text-right">{pctCalc(qg.total, analytics.pointZeroClassification.totalPointZeroPieces)}%</td>
                                <td className="py-1.5 px-2 text-right text-muted-foreground">{pctCalc(qg.total, analytics.kpis.totalPieces)}%</td>
                              </tr>
                            )
                            // Calibre detail rows
                            for (const r of qg.rows.sort((a, b) => b.pieces - a.pieces)) {
                              elements.push(
                                <tr key={`c-${errorLabel}-${qualLabel}-${r.calibre}`} className="border-b hover:bg-muted/10 text-muted-foreground">
                                  <td className="py-1 px-2 pl-12">{r.calibre}</td>
                                  <td className="py-1 px-2 text-right">{r.pieces.toLocaleString()}</td>
                                  <td className="py-1 px-2 text-right">{r.pctOfPointZero}%</td>
                                  <td className="py-1 px-2 text-right">{r.pctOfTotal}%</td>
                                </tr>
                              )
                            }
                          }
                        }
                        return elements
                      })()}
                      {/* Grand total */}
                      <tr className="border-t-2 font-bold bg-muted/50">
                        <td className="py-2 px-2">{p0ErrorFilter ? `Total ${p0ErrorFilter}` : 'Total general'}</td>
                        <td className="py-2 px-2 text-right">{filteredTotal.toLocaleString()}</td>
                        <td className="py-2 px-2 text-right">{pctCalc(filteredTotal, analytics.pointZeroClassification.totalPointZeroPieces)}%</td>
                        <td className="py-2 px-2 text-right">{pctCalc(filteredTotal, analytics.kpis.totalPieces)}%</td>
                      </tr>
                    </tbody>
                  </table>
                </div>
              </CardContent>
            </Card>
            )
          })()}

          {/* Fuera de Rango — Distribución por Peso */}
          {analytics.pointZeroClassification.outOfRangeByWeight.length > 0 && (
            <Card>
              <CardHeader>
                <CardTitle className="text-sm flex items-center gap-2">
                  <AlertTriangle className="h-4 w-4 text-amber-500" />
                  Fuera de Rango — Distribución por Peso
                  <InfoTooltip {...getTooltipProps('pz.fueraRango')} />
                </CardTitle>
                <p className="text-xs text-muted-foreground">
                  Piezas clasificadas como &quot;fuera de rango&quot; agrupadas por el calibre al que pertenecerían según su peso
                </p>
              </CardHeader>
              <CardContent>
                <div className="space-y-6">
                  {/* Bar chart — horizontal, contained height */}
                  <div className="w-full" style={{ maxHeight: 220 }}>
                    <Bar
                      data={{
                        labels: analytics.pointZeroClassification.outOfRangeByWeight.map((d) => d.rangeLabel),
                        datasets: [
                          {
                            label: 'Piezas fuera de rango',
                            data: analytics.pointZeroClassification.outOfRangeByWeight.map((d) => d.pieces),
                            backgroundColor: analytics.pointZeroClassification.outOfRangeByWeight.map((_, i, arr) => {
                              // Gradiente de color por posición
                              const t = arr.length > 1 ? i / (arr.length - 1) : 0
                              const r = Math.round(239 + (245 - 239) * t)
                              const g = Math.round(68 + (158 - 68) * t)
                              const b = Math.round(68 + (11 - 68) * t)
                              return `rgba(${r},${g},${b},0.75)`
                            }),
                            borderRadius: 4,
                            barThickness: 24,
                          },
                        ],
                      }}
                      options={{
                        indexAxis: 'y',
                        responsive: true,
                        maintainAspectRatio: false,
                        plugins: {
                          legend: { display: false },
                          tooltip: {
                            callbacks: {
                              label: (ctx) => {
                                const d = analytics.pointZeroClassification.outOfRangeByWeight[ctx.dataIndex]
                                return d ? `${d.pieces.toLocaleString()} piezas (${d.pct}%)` : ''
                              },
                            },
                          },
                        },
                        scales: {
                          x: { beginAtZero: true, grid: { color: 'rgba(128,128,128,0.1)' } },
                          y: { ticks: { font: { size: 11 } } },
                        },
                      }}
                      height={Math.max(80, analytics.pointZeroClassification.outOfRangeByWeight.length * 40)}
                    />
                  </div>

                  {/* Tables side by side */}
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    {/* Weight ranges reference table */}
                    <div>
                      <p className="text-xs font-medium mb-2">Rangos de Calibre (referencia)</p>
                      <table className="w-full text-xs">
                        <thead>
                          <tr className="border-b">
                            <th className="py-1 px-2 text-left">Calibre</th>
                            <th className="py-1 px-2 text-right">Mín (g)</th>
                            <th className="py-1 px-2 text-right">Máx (g)</th>
                          </tr>
                        </thead>
                        <tbody>
                          {analytics.pointZeroClassification.calibreWeightRanges.map((r, i) => (
                            <tr key={i} className="border-b">
                              <td className="py-1 px-2">{r.calibre}</td>
                              <td className="py-1 px-2 text-right font-mono">{r.minGrams.toLocaleString()}</td>
                              <td className="py-1 px-2 text-right font-mono">{r.maxGrams.toLocaleString()}</td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>

                    {/* Out of range detail table */}
                    <div>
                      <p className="text-xs font-medium mb-2">Desglose Fuera de Rango</p>
                      <table className="w-full text-xs">
                        <thead>
                          <tr className="border-b">
                            <th className="py-1 px-2 text-left">Rango</th>
                            <th className="py-1 px-2 text-right">Piezas</th>
                            <th className="py-1 px-2 text-right">%</th>
                          </tr>
                        </thead>
                        <tbody>
                          {analytics.pointZeroClassification.outOfRangeByWeight.map((d, i) => (
                            <tr key={i} className="border-b hover:bg-muted/30">
                              <td className="py-1 px-2">{d.rangeLabel}</td>
                              <td className="py-1 px-2 text-right font-medium">{d.pieces.toLocaleString()}</td>
                              <td className="py-1 px-2 text-right">{d.pct}%</td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  </div>
                </div>
              </CardContent>
            </Card>
          )}

          {/* Serie temporal Punto Cero */}
          <Card>
            <CardHeader><CardTitle className="text-sm">Punto Cero en el Tiempo</CardTitle></CardHeader>
            <CardContent>
              {analytics.timeSeriesPointZero.length > 0 ? (
                <div className="w-full h-[260px] sm:h-[320px]">
                  <Line
                    data={timeSeriesData}
                    options={{
                      responsive: true,
                      maintainAspectRatio: false,
                      plugins: { legend: { display: false } },
                      scales: {
                        x: {
                          type: 'time',
                          time: { unit: config.intervalMinutes === 60 ? 'hour' : 'minute' },
                          ticks: { maxRotation: 0, autoSkip: true },
                        },
                        y: { beginAtZero: true },
                      },
                    }}
                  />
                </div>
              ) : (
                <p className="text-sm text-muted-foreground text-center py-8">Sin serie temporal</p>
              )}
            </CardContent>
          </Card>
        </TabsContent>

        {/* DISTRIBUCIONES */}
        <TabsContent value="distribuciones" className="space-y-4">
          <Card className="border-primary/20">
            <CardContent className="pt-4 text-xs text-muted-foreground">
              Vista optimizada para lectura rápida: se prioriza dato expuesto (tablas y porcentajes visibles) y el hover queda como apoyo.
            </CardContent>
          </Card>
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
            <Card>
              <CardHeader><CardTitle className="text-sm">Distribución por Calibre</CardTitle></CardHeader>
              <CardContent>
                {analytics.distributionByCalibre.length > 0 ? (
                  <div className="space-y-4">
                    <div className="w-full h-[260px] sm:h-[320px]">
                      <Doughnut
                        data={calibreChartData}
                        options={{
                          responsive: true,
                          maintainAspectRatio: false,
                          plugins: {
                            legend: { position: 'bottom', labels: { boxWidth: 10, font: { size: 11 } } },
                            tooltip: {
                              callbacks: {
                                label: (ctx) => {
                                  const row = analytics.distributionByCalibre[ctx.dataIndex]
                                  if (!row) return ''
                                  return `${row.key}: ${row.pieces.toLocaleString()} pz (${row.pct}%)`
                                },
                              },
                            },
                          },
                        }}
                      />
                    </div>
                    <div className="overflow-x-auto">
                      <table className="w-full text-xs">
                        <thead>
                          <tr className="border-b">
                            <th className="py-1 px-2 text-left">Calibre</th>
                            <th className="py-1 px-2 text-right">Piezas</th>
                            <th className="py-1 px-2 text-right">%</th>
                            <th className="py-1 px-2 text-right">Peso (kg)</th>
                          </tr>
                        </thead>
                        <tbody>
                          {analytics.distributionByCalibre.map((d) => (
                            <tr key={d.key} className="border-b hover:bg-muted/30">
                              <td className="py-1 px-2">{d.key}</td>
                              <td className="py-1 px-2 text-right font-medium">{d.pieces.toLocaleString()}</td>
                              <td className="py-1 px-2 text-right">{d.pct}%</td>
                              <td className="py-1 px-2 text-right">{d.weightKg != null ? d.weightKg.toLocaleString() : '—'}</td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  </div>
                ) : (
                  <p className="text-sm text-muted-foreground text-center py-8">Sin datos</p>
                )}
              </CardContent>
            </Card>
            <Card>
              <CardHeader><CardTitle className="text-sm">Distribución por Calidad</CardTitle></CardHeader>
              <CardContent>
                {analytics.distributionByQuality.length > 0 ? (
                  <div className="space-y-4">
                    <div className="w-full h-[260px] sm:h-[320px]">
                      <Doughnut
                        data={qualityChartData}
                        options={{
                          responsive: true,
                          maintainAspectRatio: false,
                          plugins: {
                            legend: { position: 'bottom', labels: { boxWidth: 10, font: { size: 11 } } },
                            tooltip: {
                              callbacks: {
                                label: (ctx) => {
                                  const row = analytics.distributionByQuality[ctx.dataIndex]
                                  if (!row) return ''
                                  return `${row.key}: ${row.pieces.toLocaleString()} pz (${row.pct}%)`
                                },
                              },
                            },
                          },
                        }}
                      />
                    </div>
                    <div className="overflow-x-auto">
                      <table className="w-full text-xs">
                        <thead>
                          <tr className="border-b">
                            <th className="py-1 px-2 text-left">Calidad</th>
                            <th className="py-1 px-2 text-right">Piezas</th>
                            <th className="py-1 px-2 text-right">%</th>
                            <th className="py-1 px-2 text-right">Peso (kg)</th>
                          </tr>
                        </thead>
                        <tbody>
                          {analytics.distributionByQuality.map((d) => (
                            <tr key={d.key} className="border-b hover:bg-muted/30">
                              <td className="py-1 px-2">{d.key}</td>
                              <td className="py-1 px-2 text-right font-medium">{d.pieces.toLocaleString()}</td>
                              <td className="py-1 px-2 text-right">{d.pct}%</td>
                              <td className="py-1 px-2 text-right">{d.weightKg != null ? d.weightKg.toLocaleString() : '—'}</td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  </div>
                ) : (
                  <p className="text-sm text-muted-foreground text-center py-8">Sin datos</p>
                )}
              </CardContent>
            </Card>
          </div>
        </TabsContent>

        {/* LOTES */}
        <TabsContent value="lotes" className="space-y-4">
          {analytics.lotAnalysis.length > 0 ? (
            <>
              <Card>
                <CardHeader>
                  <CardTitle className="text-sm flex items-center gap-2">
                    <Layers className="h-4 w-4 text-blue-500" />
                    Análisis por Lote
                    <InfoTooltip {...getTooltipProps('lot.analysis')} />
                  </CardTitle>
                  <p className="text-xs text-muted-foreground">
                    {analytics.lotAnalysis.length} lote(s) detectados en pieza-pieza
                  </p>
                </CardHeader>
                <CardContent>
                  {/* Bar chart: avg weight per lot */}
                  <Bar
                    data={{
                      labels: analytics.lotAnalysis.map(l => l.lot),
                      datasets: [
                        {
                          label: 'Peso Promedio (g)',
                          data: analytics.lotAnalysis.map(l => l.avgWeightGrams),
                          backgroundColor: 'rgba(59,130,246,0.7)',
                          borderRadius: 6,
                        },
                        {
                          label: 'Mediana (g)',
                          data: analytics.lotAnalysis.map(l => l.medianWeightGrams),
                          backgroundColor: 'rgba(16,185,129,0.5)',
                          borderRadius: 6,
                        },
                      ],
                    }}
                    options={{
                      responsive: true,
                      plugins: {
                        legend: { position: 'bottom' },
                        tooltip: {
                          callbacks: {
                            afterBody: (items) => {
                              const idx = items[0]?.dataIndex
                              if (idx == null) return ''
                              const lot = analytics.lotAnalysis[idx]
                              if (!lot) return ''
                              return [
                                `Calibre prom.: ${getCalibreByWeightGrams(lot.avgWeightGrams)}`,
                                `Calibre med.: ${getCalibreByWeightGrams(lot.medianWeightGrams)}`,
                              ]
                            },
                          },
                        },
                      },
                      scales: { y: { beginAtZero: false, title: { display: true, text: 'Peso (g)' } } },
                    }}
                  />
                </CardContent>
              </Card>

              {/* Lot comparison table */}
              <Card>
                <CardHeader>
                  <CardTitle className="text-sm">Comparativa de Lotes</CardTitle>
                </CardHeader>
                <CardContent>
                  <div className="overflow-x-auto overflow-y-visible">
                    <table className="w-full text-sm">
                      <thead>
                        <tr className="border-b text-left">
                          <th className="py-2 px-2">Lote</th>
                          <th className="py-2 px-2 text-right">
                            Piezas
                          </th>
                          <th className="py-2 px-2 text-right">
                            <span className="flex items-center justify-end gap-1">
                              Peso Prom. (g)
                              <InfoTooltip {...getTooltipProps('lot.avgWeight')} iconSize={12} />
                            </span>
                          </th>
                          <th className="py-2 px-2 text-right">
                            <span className="flex items-center justify-end gap-1">
                              Mediana (g)
                              <InfoTooltip {...getTooltipProps('lot.medianWeight')} iconSize={12} />
                            </span>
                          </th>
                          <th className="py-2 px-2 text-right">
                            <span className="flex items-center justify-end gap-1">
                              σ (g)
                              <InfoTooltip {...getTooltipProps('lot.stdDev')} iconSize={12} />
                            </span>
                          </th>
                          <th className="py-2 px-2 text-right">Peso (kg)</th>
                          <th className="py-2 px-2 text-right">Calibre (Prom)</th>
                          <th className="py-2 px-2 text-right">Calibre (Med)</th>
                          <th className="py-2 px-2 text-right">
                            <span className="flex items-center justify-end gap-1">
                              P0 %
                              <InfoTooltip {...getTooltipProps('lot.p0pct')} iconSize={12} />
                            </span>
                          </th>
                          <th className="py-2 px-2">Calibre Top</th>
                        </tr>
                      </thead>
                      <tbody>
                        {analytics.lotAnalysis.map((lot, i) => {
                          const topCalibre = lot.calibreDistribution.length > 0
                            ? lot.calibreDistribution.reduce((a, b) => a.pieces > b.pieces ? a : b)
                            : null
                          return (
                            <tr key={i} className="border-b hover:bg-muted/30">
                              <td className="py-2 px-2 font-medium">{lot.lot}</td>
                              <td className="py-2 px-2 text-right">{lot.pieces.toLocaleString()}</td>
                              <td className="py-2 px-2 text-right">{lot.avgWeightGrams.toLocaleString()}</td>
                              <td className="py-2 px-2 text-right">{lot.medianWeightGrams.toLocaleString()}</td>
                              <td className="py-2 px-2 text-right">{lot.stdDevWeightGrams.toLocaleString()}</td>
                              <td className="py-2 px-2 text-right">{lot.weightKg.toLocaleString()}</td>
                              <td className="py-2 px-2 text-right">{getCalibreByWeightGrams(lot.avgWeightGrams)}</td>
                              <td className="py-2 px-2 text-right">{getCalibreByWeightGrams(lot.medianWeightGrams)}</td>
                              <td className="py-2 px-2 text-right">
                                <span className={cn(
                                  'font-medium',
                                  lot.pointZeroPct > 5 && 'text-red-600',
                                  lot.pointZeroPct > 2 && lot.pointZeroPct <= 5 && 'text-amber-600',
                                )}>
                                  {lot.pointZeroPct}%
                                </span>
                              </td>
                              <td className="py-2 px-2">
                                {topCalibre ? `${topCalibre.key} (${topCalibre.pct}%)` : '—'}
                              </td>
                            </tr>
                          )
                        })}
                      </tbody>
                    </table>
                  </div>
                </CardContent>
              </Card>

              {/* Point Zero per lot */}
              <Card>
                <CardHeader>
                  <CardTitle className="text-sm">Punto Cero por Lote</CardTitle>
                </CardHeader>
                <CardContent>
                  <Bar
                    data={{
                      labels: analytics.lotAnalysis.map(l => l.lot),
                      datasets: [
                        {
                          label: 'P0 %',
                          data: analytics.lotAnalysis.map(l => l.pointZeroPct),
                          backgroundColor: analytics.lotAnalysis.map(l =>
                            l.pointZeroPct > 5 ? 'rgba(239,68,68,0.7)' :
                            l.pointZeroPct > 2 ? 'rgba(245,158,11,0.7)' :
                            'rgba(16,185,129,0.7)'
                          ),
                        },
                      ],
                    }}
                    options={{
                      responsive: true,
                      plugins: { legend: { display: false } },
                      scales: { y: { beginAtZero: true, title: { display: true, text: 'Punto Cero %' } } },
                    }}
                  />
                </CardContent>
              </Card>
            </>
          ) : (
            <Card>
              <CardContent className="py-8">
                <p className="text-sm text-muted-foreground text-center">
                  Sin datos de lotes. Cargue un archivo pieza-pieza con columna de lote.
                </p>
              </CardContent>
            </Card>
          )}
        </TabsContent>

        {/* TENDENCIA DE PESO */}
        <TabsContent value="tendencia" className="space-y-4">
          {analytics.weightTrendSeries.length > 0 ? (
            <>
              <Card>
                <CardHeader>
                  <CardTitle className="text-sm flex items-center gap-2">
                    <Activity className="h-4 w-4 text-purple-500" />
                    Tendencia de Peso en el Tiempo
                    <InfoTooltip {...getTooltipProps('wt.trend')} />
                  </CardTitle>
                  <p className="text-xs text-muted-foreground">
                    Peso promedio por pieza a lo largo del turno con media móvil
                  </p>
                </CardHeader>
                <CardContent>
                  <Line
                    data={{
                      labels: analytics.weightTrendSeries.map(b => b.bucketStart),
                      datasets: [
                        {
                          label: 'Peso Promedio (g)',
                          data: analytics.weightTrendSeries.map(b => b.avgWeightGrams),
                          borderColor: 'rgba(59,130,246,0.9)',
                          backgroundColor: 'rgba(59,130,246,0.05)',
                          fill: false,
                          tension: 0.3,
                          pointRadius: 3,
                        },
                        {
                          label: 'Media Móvil 5',
                          data: analytics.weightTrendSeries.map(b => b.movingAvg5 ?? null),
                          borderColor: 'rgba(139,92,246,0.8)',
                          borderDash: [6, 3],
                          fill: false,
                          tension: 0.4,
                          pointRadius: 0,
                        },
                        {
                          label: '+1σ',
                          data: analytics.weightTrendSeries.map(b => b.avgWeightGrams + b.stdDevWeightGrams),
                          borderColor: 'rgba(16,185,129,0.3)',
                          backgroundColor: 'rgba(16,185,129,0.05)',
                          fill: '+1',
                          tension: 0.3,
                          pointRadius: 0,
                          borderWidth: 1,
                        },
                        {
                          label: '−1σ',
                          data: analytics.weightTrendSeries.map(b => Math.max(0, b.avgWeightGrams - b.stdDevWeightGrams)),
                          borderColor: 'rgba(16,185,129,0.3)',
                          fill: false,
                          tension: 0.3,
                          pointRadius: 0,
                          borderWidth: 1,
                        },
                      ],
                    }}
                    options={{
                      responsive: true,
                      plugins: {
                        legend: { position: 'bottom', labels: { font: { size: 11 } } },
                        tooltip: {
                          callbacks: {
                            afterBody: (items) => {
                              const idx = items[0]?.dataIndex
                              if (idx == null) return ''
                              const bucket = analytics.weightTrendSeries[idx]
                              if (!bucket) return ''
                              const lines = [`Mediana: ${bucket.medianWeightGrams.toLocaleString()} g`, `σ: ${bucket.stdDevWeightGrams.toLocaleString()} g`, `Piezas: ${bucket.pieces.toLocaleString()}`]
                              if (bucket.dominantLot) lines.push(`Lote: ${bucket.dominantLot}`)
                              return lines
                            },
                          },
                        },
                      },
                      scales: {
                        x: {
                          type: 'time',
                          time: { unit: config.intervalMinutes === 60 ? 'hour' : 'minute' },
                        },
                        y: { beginAtZero: false, title: { display: true, text: 'Peso (g)' } },
                      },
                    }}
                  />
                </CardContent>
              </Card>

              {/* Weight trend table */}
              <Card>
                <CardHeader>
                  <CardTitle className="text-sm">Detalle por Intervalo</CardTitle>
                </CardHeader>
                <CardContent>
                  <div className="overflow-x-auto max-h-[400px] overflow-y-auto">
                    <table className="w-full text-sm">
                      <thead className="sticky top-0 bg-background">
                        <tr className="border-b text-left">
                          <th className="py-2 px-2">Hora</th>
                          <th className="py-2 px-2 text-right">Piezas</th>
                          <th className="py-2 px-2 text-right">Promedio (g)</th>
                          <th className="py-2 px-2 text-right">Mediana (g)</th>
                          <th className="py-2 px-2 text-right">
                            <span className="flex items-center justify-end gap-1">
                              σ (g)
                              <InfoTooltip {...getTooltipProps('wt.stdDev')} iconSize={12} />
                            </span>
                          </th>
                          <th className="py-2 px-2 text-right">
                            <span className="flex items-center justify-end gap-1">
                              MA(5) (g)
                              <InfoTooltip {...getTooltipProps('wt.movingAvg')} iconSize={12} />
                            </span>
                          </th>
                          <th className="py-2 px-2">
                            <span className="flex items-center gap-1">
                              Lote
                              <InfoTooltip {...getTooltipProps('wt.dominantLot')} iconSize={12} />
                            </span>
                          </th>
                        </tr>
                      </thead>
                      <tbody>
                        {analytics.weightTrendSeries.map((b, i) => (
                          <tr key={i} className="border-b hover:bg-muted/30">
                            <td className="py-1.5 px-2 text-xs">{new Date(b.bucketStart).toLocaleTimeString()}</td>
                            <td className="py-1.5 px-2 text-right">{b.pieces.toLocaleString()}</td>
                            <td className="py-1.5 px-2 text-right font-medium">{b.avgWeightGrams.toLocaleString()}</td>
                            <td className="py-1.5 px-2 text-right">{b.medianWeightGrams.toLocaleString()}</td>
                            <td className="py-1.5 px-2 text-right">{b.stdDevWeightGrams.toLocaleString()}</td>
                            <td className="py-1.5 px-2 text-right text-purple-600">
                              {b.movingAvg5 != null ? b.movingAvg5.toLocaleString() : '—'}
                            </td>
                            <td className="py-1.5 px-2 text-xs">{b.dominantLot || '—'}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </CardContent>
              </Card>
            </>
          ) : (
            <Card>
              <CardContent className="py-8">
                <p className="text-sm text-muted-foreground text-center">
                  Sin datos de peso por pieza. Cargue un archivo pieza-pieza con columna &quot;peso en Gr&quot;.
                </p>
              </CardContent>
            </Card>
          )}
        </TabsContent>

        {/* MATRIZ Q×C */}
        <TabsContent value="matriz" className="space-y-4">
          <Card>
            <CardHeader>
              <CardTitle className="text-sm flex items-center gap-2">
                <Table2 className="h-4 w-4" />
                Matriz Calidad × Calibre
                <InfoTooltip {...getTooltipProps('matrix.qc')} />
              </CardTitle>
              {analytics.matrixEnhanced.globalHHI > 0 && (
                <div className="flex flex-wrap gap-2 mt-1">
                  <Badge variant="outline" className="text-[10px]">
                    HHI Global: {analytics.matrixEnhanced.globalHHI.toFixed(3)}
                    <InfoTooltip {...getTooltipProps('matrix.hhi')} iconSize={11} className="ml-1" />
                  </Badge>
                  <Badge variant="outline" className={cn(
                    'text-[10px]',
                    analytics.matrixEnhanced.imbalanceScore > 0.6 && 'text-red-600 border-red-300',
                    analytics.matrixEnhanced.imbalanceScore > 0.3 && analytics.matrixEnhanced.imbalanceScore <= 0.6 && 'text-amber-600 border-amber-300',
                  )}>
                    Desbalance: {(analytics.matrixEnhanced.imbalanceScore * 100).toFixed(1)}%
                    <InfoTooltip {...getTooltipProps('matrix.imbalance')} iconSize={11} className="ml-1" />
                  </Badge>
                  {analytics.matrixEnhanced.maxCell && (
                    <Badge variant="outline" className="text-[10px]">
                      Celda Max: {analytics.matrixEnhanced.maxCell.quality}×{analytics.matrixEnhanced.maxCell.calibre} ({analytics.matrixEnhanced.maxCell.pct}%)
                      <InfoTooltip {...getTooltipProps('matrix.maxCell')} iconSize={11} className="ml-1" />
                    </Badge>
                  )}
                </div>
              )}
            </CardHeader>
            <CardContent>
              {matrixQualities.length > 0 && matrixCalibres.length > 0 ? (
                <div className="overflow-x-auto">
                  <table className="w-full text-sm">
                    <thead>
                      <tr className="border-b">
                        <th className="py-2 px-2 text-left">Calidad \ Calibre</th>
                        {matrixCalibres.map((c) => (
                          <th key={c} className="py-2 px-2 text-center">{c}</th>
                        ))}
                        <th className="py-2 px-2 text-center">
                          <span className="flex items-center justify-center gap-1">
                            HHI
                            <InfoTooltip {...getTooltipProps('matrix.hhiQuality')} iconSize={11} />
                          </span>
                        </th>
                      </tr>
                    </thead>
                    <tbody>
                      {matrixQualities.map((q) => {
                        const hhiRow = analytics.matrixEnhanced.hhiByQuality.find(h => h.quality === q)
                        return (
                          <tr key={q} className="border-b hover:bg-muted/30">
                            <td className="py-2 px-2 font-medium">{q}</td>
                            {matrixCalibres.map((c) => {
                              const cell = analytics.matrixQualityCalibre[q]?.[c]
                              const isMax = analytics.matrixEnhanced.maxCell?.quality === q && analytics.matrixEnhanced.maxCell?.calibre === c
                              const avgW = analytics.matrixEnhanced.avgWeightByCell[q]?.[c]
                              return (
                                <td key={c} className={cn(
                                  'py-2 px-2 text-center',
                                  isMax && 'bg-blue-50 dark:bg-blue-900/20 ring-1 ring-blue-300',
                                  cell && cell.pct >= 20 && !isMax && 'bg-blue-50/50 dark:bg-blue-900/10',
                                )}>
                                  {cell ? (
                                    <div>
                                      <span className="font-medium">{cell.pieces.toLocaleString()}</span>
                                      <span className="text-muted-foreground text-xs ml-1">({cell.pct}%)</span>
                                      {avgW != null && (
                                        <p className="text-[10px] text-muted-foreground">{avgW.toLocaleString()}g</p>
                                      )}
                                    </div>
                                  ) : (
                                    <span className="text-muted-foreground">—</span>
                                  )}
                                </td>
                              )
                            })}
                            <td className="py-2 px-2 text-center text-xs">
                              {hhiRow ? (
                                <span className={cn(
                                  hhiRow.hhi > 0.5 && 'text-red-600 font-medium',
                                  hhiRow.hhi > 0.25 && hhiRow.hhi <= 0.5 && 'text-amber-600',
                                )}>
                                  {hhiRow.hhi.toFixed(3)}
                                </span>
                              ) : '—'}
                            </td>
                          </tr>
                        )
                      })}
                      {/* HHI by calibre row */}
                      {analytics.matrixEnhanced.hhiByCalibre.length > 0 && (
                        <tr className="border-t-2 bg-muted/30">
                          <td className="py-2 px-2 font-medium text-xs">
                            <span className="flex items-center gap-1">
                              HHI
                              <InfoTooltip {...getTooltipProps('matrix.hhiCalibre')} iconSize={11} />
                            </span>
                          </td>
                          {matrixCalibres.map(c => {
                            const hhiCol = analytics.matrixEnhanced.hhiByCalibre.find(h => h.calibre === c)
                            return (
                              <td key={c} className="py-2 px-2 text-center text-xs">
                                {hhiCol ? (
                                  <span className={cn(
                                    hhiCol.hhi > 0.5 && 'text-red-600 font-medium',
                                    hhiCol.hhi > 0.25 && hhiCol.hhi <= 0.5 && 'text-amber-600',
                                  )}>
                                    {hhiCol.hhi.toFixed(3)}
                                  </span>
                                ) : '—'}
                              </td>
                            )
                          })}
                          <td className="py-2 px-2 text-center text-xs font-bold">
                            {analytics.matrixEnhanced.globalHHI.toFixed(3)}
                          </td>
                        </tr>
                      )}
                    </tbody>
                  </table>
                </div>
              ) : (
                <p className="text-sm text-muted-foreground text-center py-8">
                  Matriz no disponible. Cargue archivo pieza-pieza o % Calidad.
                </p>
              )}
            </CardContent>
          </Card>
        </TabsContent>

        {/* BALANCE GATES */}
        <TabsContent value="balance" className="space-y-4">
          {/* Allocation Score KPI */}
          <div className="flex items-center gap-3 p-3 rounded-lg border bg-muted/30">
            <div className={cn(
              'text-2xl font-bold',
              analytics.allocationScore >= 80 ? 'text-emerald-600' :
              analytics.allocationScore >= 60 ? 'text-amber-600' : 'text-red-600',
            )}>
              {analytics.allocationScore ?? '—'}
            </div>
            <div>
              <p className="text-sm font-medium">Score de Asignación</p>
              <p className="text-xs text-muted-foreground">
                {(analytics.allocationScore ?? 0) >= 80 ? 'Buena distribución de gates relativa a demanda' :
                 (analytics.allocationScore ?? 0) >= 60 ? 'Distribución mejorable — revisar sugerencias' :
                 'Distribución muy desbalanceada — acción recomendada'}
              </p>
            </div>
          </div>

          <Card>
            <CardHeader>
              <CardTitle className="text-sm flex items-center gap-2">
                <Zap className="h-4 w-4" />
                Balance Demanda vs Gates Asignados
                <InfoTooltip {...getTooltipProps('gate.balance')} />
              </CardTitle>
            </CardHeader>
            <CardContent>
              {analytics.gateBalance.length > 0 ? (
                <div className="space-y-3">
                  {analytics.gateBalance.map((gb, i) => (
                    <div
                      key={i}
                      className={cn(
                        'p-3 rounded-lg border flex items-start gap-3',
                        gb.severity === 'critical'
                          ? 'border-red-300 bg-red-50 dark:bg-red-900/10'
                          : gb.severity === 'warn'
                          ? 'border-amber-300 bg-amber-50 dark:bg-amber-900/10'
                          : 'border-muted bg-muted/30',
                      )}
                    >
                      {gb.severity === 'critical' ? (
                        <AlertTriangle className="h-5 w-5 text-red-500 shrink-0 mt-0.5" />
                      ) : gb.severity === 'warn' ? (
                        <AlertTriangle className="h-5 w-5 text-amber-500 shrink-0 mt-0.5" />
                      ) : (
                        <Info className="h-5 w-5 text-muted-foreground shrink-0 mt-0.5" />
                      )}
                      <div className="flex-1">
                        <div className="flex items-center gap-2 flex-wrap">
                          <Badge variant="outline" className="text-xs">{gb.calibre}</Badge>
                          <span className="text-sm font-medium">
                            Demanda {gb.demandPct}% — {gb.gatesAssigned}/{gb.idealGates} gate(s)
                          </span>
                          {gb.gap > 0 && (
                            <Badge variant="destructive" className="text-[10px]">-{gb.gap} gate(s)</Badge>
                          )}
                          {gb.gap < 0 && (
                            <Badge variant="outline" className="text-[10px] text-emerald-600 border-emerald-300">
                              +{-gb.gap} extra
                            </Badge>
                          )}
                        </div>
                        <p className="text-xs text-muted-foreground mt-1">{gb.message}</p>
                      </div>
                    </div>
                  ))}

                  {/* Bar chart: demand vs gates */}
                  <div className="mt-4">
                    <Bar
                      data={{
                        labels: analytics.gateBalance.map((g) => g.calibre),
                        datasets: [
                          {
                            label: 'Demanda (%)',
                            data: analytics.gateBalance.map((g) => g.demandPct),
                            backgroundColor: 'rgba(59,130,246,0.7)',
                          },
                          {
                            label: 'Gates Asignados',
                            data: analytics.gateBalance.map((g) => g.gatesAssigned),
                            backgroundColor: 'rgba(16,185,129,0.7)',
                          },
                          {
                            label: 'Gates Ideal',
                            data: analytics.gateBalance.map((g) => g.idealGates),
                            backgroundColor: 'rgba(168,85,247,0.4)',
                            borderColor: 'rgba(168,85,247,0.8)',
                            borderWidth: 1,
                          },
                        ],
                      }}
                      options={{
                        responsive: true,
                        plugins: { legend: { position: 'bottom' } },
                        scales: { y: { beginAtZero: true } },
                      }}
                    />
                  </div>
                </div>
              ) : (
                <p className="text-sm text-muted-foreground text-center py-8">
                  Configure los gates para ver el balance de demanda.
                </p>
              )}
            </CardContent>
          </Card>

          {/* Gate Advanced Stats Table */}
          {analytics.gateAdvancedStats.length > 0 && (
            <Card>
              <CardHeader>
                <CardTitle className="text-sm flex items-center gap-2">
                  <BarChart3 className="h-4 w-4 text-blue-500" />
                  Estadísticas por Compuerta
                  <InfoTooltip {...getTooltipProps('gate.stats')} />
                </CardTitle>
              </CardHeader>
              <CardContent>
                <div className="overflow-x-auto">
                  <table className="w-full text-sm">
                    <thead>
                      <tr className="border-b text-left">
                        <th className="py-2 px-2">Gate</th>
                        <th className="py-2 px-2 text-right">Piezas</th>
                        <th className="py-2 px-2 text-right">
                          <span className="flex items-center justify-end gap-1">
                            Prom. (g)
                            <InfoTooltip {...getTooltipProps('gate.avgWeight')} iconSize={11} />
                          </span>
                        </th>
                        <th className="py-2 px-2 text-right">
                          <span className="flex items-center justify-end gap-1">
                            σ (g)
                            <InfoTooltip {...getTooltipProps('gate.stdDev')} iconSize={11} />
                          </span>
                        </th>
                        <th className="py-2 px-2 text-right">
                          <span className="flex items-center justify-end gap-1">
                            CV
                            <InfoTooltip {...getTooltipProps('gate.cv')} iconSize={11} />
                          </span>
                        </th>
                        <th className="py-2 px-2 text-right">
                          <span className="flex items-center justify-end gap-1">
                            Utiliz.
                            <InfoTooltip {...getTooltipProps('gate.utilization')} iconSize={11} />
                          </span>
                        </th>
                        <th className="py-2 px-2">Asignado</th>
                        <th className="py-2 px-2 text-right">
                          <span className="flex items-center justify-end gap-1">
                            Mismatch
                            <InfoTooltip {...getTooltipProps('gate.mismatch')} iconSize={11} />
                          </span>
                        </th>
                      </tr>
                    </thead>
                    <tbody>
                      {analytics.gateAdvancedStats.map((gs) => (
                        <tr key={gs.gateNumber} className={cn(
                          'border-b hover:bg-muted/30',
                          gs.cv > 0.15 && 'bg-amber-50/50 dark:bg-amber-900/5',
                          gs.mismatchPct > 30 && 'bg-red-50/50 dark:bg-red-900/5',
                        )}>
                          <td className="py-2 px-2 font-medium">Gate {gs.gateNumber}</td>
                          <td className="py-2 px-2 text-right">{gs.pieces.toLocaleString()}</td>
                          <td className="py-2 px-2 text-right">{gs.avgWeightGrams.toLocaleString()}</td>
                          <td className="py-2 px-2 text-right">{gs.stdDevWeightGrams.toLocaleString()}</td>
                          <td className="py-2 px-2 text-right">
                            <span className={cn(
                              'font-medium',
                              gs.cv > 0.2 && 'text-red-600',
                              gs.cv > 0.15 && gs.cv <= 0.2 && 'text-amber-600',
                            )}>
                              {(gs.cv * 100).toFixed(1)}%
                            </span>
                          </td>
                          <td className="py-2 px-2 text-right">{gs.utilizationPct.toFixed(1)}%</td>
                          <td className="py-2 px-2">
                            <Badge variant="outline" className="text-[10px]">
                              {gs.assignedCalibre}
                            </Badge>
                          </td>
                          <td className="py-2 px-2 text-right">
                            <span className={cn(
                              'font-medium',
                              gs.mismatchPct > 30 && 'text-red-600',
                              gs.mismatchPct > 15 && gs.mismatchPct <= 30 && 'text-amber-600',
                            )}>
                              {gs.mismatchPct.toFixed(1)}%
                            </span>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>

                {/* CV comparison chart */}
                <div className="mt-4">
                  <p className="text-xs font-medium mb-2">Coeficiente de Variación por Gate</p>
                  <Bar
                    data={{
                      labels: analytics.gateAdvancedStats.map(g => `Gate ${g.gateNumber}`),
                      datasets: [{
                        label: 'CV (%)',
                        data: analytics.gateAdvancedStats.map(g => g.cv * 100),
                        backgroundColor: analytics.gateAdvancedStats.map(g =>
                          g.cv > 0.2 ? 'rgba(239,68,68,0.7)' :
                          g.cv > 0.15 ? 'rgba(245,158,11,0.7)' :
                          'rgba(16,185,129,0.7)'
                        ),
                      }],
                    }}
                    options={{
                      responsive: true,
                      plugins: { legend: { display: false } },
                      scales: { y: { beginAtZero: true, title: { display: true, text: 'CV (%)' } } },
                    }}
                  />
                </div>
              </CardContent>
            </Card>
          )}

          {/* Gate Swap Suggestions */}
          {analytics.gateSwapSuggestions.length > 0 && (
            <Card className="border-purple-200">
              <CardHeader>
                <CardTitle className="text-sm flex items-center gap-2">
                  <ArrowRightLeft className="h-4 w-4 text-purple-500" />
                  Sugerencias de Reasignación
                  <InfoTooltip {...getTooltipProps('gate.swap')} />
                </CardTitle>
                <p className="text-xs text-muted-foreground">
                  Basadas en asignación ideal proporcional a demanda, mismatch real vs etiqueta, y variabilidad
                </p>
              </CardHeader>
              <CardContent className="space-y-3">
                {analytics.gateSwapSuggestions.map((s, i) => (
                  <SwapSuggestionCard key={i} suggestion={s} />
                ))}
              </CardContent>
            </Card>
          )}
        </TabsContent>

        {/* DIAGNÓSTICO */}
        <TabsContent value="insights" className="space-y-4">
          {/* Deterministic insights */}
          <Card>
            <CardHeader>
              <CardTitle className="text-sm flex items-center gap-2">
                <Zap className="h-4 w-4" />
                Alertas Automáticas ({insights.length})
                <InfoTooltip {...getTooltipProps('insights.deterministic')} />
              </CardTitle>
              <p className="text-xs text-muted-foreground">
                Alertas generadas por reglas estadísticas sobre los datos cargados
              </p>
            </CardHeader>
            <CardContent className="space-y-3">
              {insights.length === 0 && (
                <p className="text-sm text-muted-foreground text-center py-4">
                  No se detectaron alertas con los umbrales actuales.
                </p>
              )}
              {insights.map((ins) => (
                <InsightCard key={ins.id} insight={ins} />
              ))}
            </CardContent>
          </Card>

          {/* AI Panel */}
          <Card>
            <CardHeader className="flex flex-row items-center justify-between">
              <div>
                <CardTitle className="text-sm flex items-center gap-2">
                  <Brain className="h-4 w-4" />
                  Diagnóstico IA (Groq)
                  <InfoTooltip {...getTooltipProps('insights.ai')} />
                </CardTitle>
                <p className="text-xs text-muted-foreground mt-1">
                  Análisis profundo con inteligencia artificial: causas raíz, correlaciones y plan de acción
                </p>
              </div>
              <Button
                size="sm"
                onClick={handleAnalyzeAI}
                disabled={aiLoading}
              >
                {aiLoading ? (
                  <Loader2 className="h-4 w-4 animate-spin mr-1" />
                ) : (
                  <Brain className="h-4 w-4 mr-1" />
                )}
                {aiLoading ? 'Analizando...' : 'Analizar con IA'}
              </Button>
            </CardHeader>
            <CardContent>
              {!aiOutput && !aiError && !aiLoading && (
                <p className="text-sm text-muted-foreground text-center py-6">
                  Presiona "Analizar con IA" para obtener un diagnóstico basado en los datos cargados.
                </p>
              )}

              {aiError && (
                <div className="p-3 rounded-lg bg-red-50 dark:bg-red-900/10 border border-red-300 text-sm">
                  <div className="flex items-center gap-2 text-red-600">
                    <XCircle className="h-4 w-4" />
                    <span className="font-medium">Error de parseo IA</span>
                  </div>
                  <p className="mt-1 text-xs text-red-500">{aiError}</p>
                  {aiRawText && (
                    <pre className="mt-2 p-2 bg-muted rounded text-xs overflow-auto max-h-40">
                      {aiRawText}
                    </pre>
                  )}
                </div>
              )}

              {aiOutput && <AIOutputPanel output={aiOutput} />}
            </CardContent>
          </Card>
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
  icon: Icon,
  severity,
  tooltip,
}: {
  label: string
  value: string
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
        </div>
        <p
          className={cn(
            'text-lg font-bold',
            severity === 'critical' && 'text-red-600',
            severity === 'warn' && 'text-amber-600',
          )}
        >
          {value}
        </p>
      </CardContent>
    </Card>
  )
}

function InsightCard({ insight }: { insight: DeterministicInsight }) {
  return (
    <div
      className={cn(
        'p-3 rounded-lg border',
        insight.severity === 'critical'
          ? 'border-red-300 bg-red-50 dark:bg-red-900/10'
          : insight.severity === 'warn'
          ? 'border-amber-300 bg-amber-50 dark:bg-amber-900/10'
          : 'border-blue-200 bg-blue-50 dark:bg-blue-900/10',
      )}
    >
      <div className="flex items-center gap-2">
        <Badge
          variant={insight.severity === 'critical' ? 'destructive' : 'outline'}
          className="text-[10px]"
        >
          {insight.severity.toUpperCase()}
        </Badge>
        <span className="text-sm font-medium">{insight.title}</span>
      </div>
      <div className="mt-2 space-y-0.5">
        {insight.evidence.map((e, i) => (
          <p key={i} className="text-xs text-muted-foreground flex items-center gap-1">
            <span className="text-blue-500">📊</span> {e}
          </p>
        ))}
      </div>
      <div className="mt-2 space-y-0.5">
        {insight.recommendations.map((r, i) => (
          <p key={i} className="text-xs flex items-center gap-1">
            <span className="text-green-500">💡</span> {r}
          </p>
        ))}
      </div>
    </div>
  )
}

function AIOutputPanel({ output }: { output: AIGraderOutput }) {
  return (
    <div className="space-y-4">
      {/* Summary */}
      <div>
        <h4 className="text-sm font-medium mb-2">Resumen</h4>
        <ul className="space-y-1">
          {output.summaryBullets.map((b, i) => (
            <li key={i} className="text-sm text-muted-foreground flex gap-2">
              <span className="shrink-0">•</span>
              {b}
            </li>
          ))}
        </ul>
      </div>

      {/* Causes */}
      {output.likelyCauses.length > 0 && (
        <div>
          <h4 className="text-sm font-medium mb-2">Causas Probables</h4>
          <div className="space-y-2">
            {output.likelyCauses.map((c, i) => (
              <div key={i} className="p-2 rounded-lg bg-muted/50">
                <div className="flex items-center gap-2">
                  <Badge
                    variant="outline"
                    className={cn(
                      'text-[10px]',
                      c.confidence === 'high' && 'text-red-600',
                      c.confidence === 'medium' && 'text-amber-600',
                    )}
                  >
                    {c.confidence}
                  </Badge>
                  <span className="text-sm font-medium">{c.cause}</span>
                </div>
                {c.evidence.length > 0 ? (
                  <div className="mt-1 space-y-0.5">
                    {c.evidence.map((e, j) => (
                      <p key={j} className="text-xs text-muted-foreground ml-4">📊 {e}</p>
                    ))}
                  </div>
                ) : (
                  <p className="text-xs text-amber-500 mt-1 ml-4">
                    ⚠ Sin evidencia numérica
                  </p>
                )}
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Recommended Actions */}
      {output.recommendedActions.length > 0 && (
        <div>
          <h4 className="text-sm font-medium mb-2">Acciones Recomendadas</h4>
          <div className="space-y-2">
            {output.recommendedActions.map((a, i) => (
              <div key={i} className="flex items-start gap-2 text-sm">
                <Badge
                  variant="outline"
                  className={cn(
                    'text-[10px] mt-0.5',
                    a.priority === 'high' && 'text-red-600 border-red-300',
                    a.priority === 'medium' && 'text-amber-600 border-amber-300',
                  )}
                >
                  {a.priority}
                </Badge>
                <div>
                  <span className="font-medium">{a.action}</span>
                  <p className="text-xs text-muted-foreground">{a.why}</p>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Checklist */}
      {output.whatToCheckNext.length > 0 && (
        <div>
          <h4 className="text-sm font-medium mb-2">Qué Verificar</h4>
          <ul className="space-y-1">
            {output.whatToCheckNext.map((c, i) => (
              <li key={i} className="text-sm text-muted-foreground flex gap-2">
                <span>☐</span> {c}
              </li>
            ))}
          </ul>
        </div>
      )}

      {/* Disclaimers */}
      {output.disclaimers && output.disclaimers.length > 0 && (
        <div className="p-2 bg-amber-50 dark:bg-amber-900/10 rounded-lg">
          <p className="text-xs font-medium text-amber-700 mb-1">Advertencias:</p>
          {output.disclaimers.map((d, i) => (
            <p key={i} className="text-xs text-amber-600">{d}</p>
          ))}
        </div>
      )}
    </div>
  )
}

function SwapSuggestionCard({ suggestion }: { suggestion: GateSwapSuggestion }) {
  const typeLabels: Record<string, string> = {
    correction: 'Corrección',
    optimization: 'Optimización',
    investigate: 'Investigar',
    swap: 'Intercambiar',
    reassign: 'Reasignar',
    add: 'Agregar',
  }
  const typeColors: Record<string, string> = {
    correction: 'text-amber-600 border-amber-300',
    optimization: 'text-purple-600 border-purple-300',
    investigate: 'text-sky-600 border-sky-300',
    swap: 'text-purple-600 border-purple-300',
    reassign: 'text-blue-600 border-blue-300',
    add: 'text-green-600 border-green-300',
  }
  const typeIcons: Record<string, string> = {
    correction: '🏷️',
    optimization: '⚡',
    investigate: '🔍',
    swap: '🔄',
    reassign: '🔹',
    add: '➕',
  }

  const showArrow = suggestion.type !== 'investigate' && suggestion.currentCalibre !== suggestion.suggestedCalibre

  return (
    <div className={cn(
      'p-3 rounded-lg border',
      suggestion.impactScore >= 70 ? 'border-red-200 bg-red-50/50 dark:bg-red-900/5' :
      suggestion.impactScore >= 40 ? 'border-amber-200 bg-amber-50/50 dark:bg-amber-900/5' :
      'border-muted bg-muted/20',
    )}>
      <div className="flex items-center gap-2 flex-wrap">
        <Badge variant="outline" className={cn('text-[10px]', typeColors[suggestion.type])}>
          {typeIcons[suggestion.type] || ''} {typeLabels[suggestion.type] || suggestion.type}
        </Badge>
        <span className="text-sm font-medium">
          Gate {suggestion.gateNumber}: {suggestion.currentCalibre}
          {showArrow && <> → {suggestion.suggestedCalibre}</>}
        </span>
        <Badge variant={suggestion.impactScore >= 70 ? 'destructive' : 'outline'} className="text-[10px] ml-auto">
          Impacto: {suggestion.impactScore}
        </Badge>
      </div>
      <p className="text-xs text-muted-foreground mt-1">{suggestion.reason}</p>
      {suggestion.evidence.length > 0 && (
        <div className="mt-1.5 space-y-0.5">
          {suggestion.evidence.map((e, i) => (
            <p key={i} className="text-[11px] text-muted-foreground">
              {e.startsWith('⚠') ? e : `📊 ${e}`}
            </p>
          ))}
        </div>
      )}
    </div>
  )
}
