/**
 * Vista de detalle de un turno específico del Grader.
 *
 * Recibe un `GraderDailySummary` ya cargado (desde `getDailySummary`) y
 * renderiza:
 *  - Header con la fecha + turno
 *  - Row de KPIs destacados (P0%, piezas, peso, pz/h, duración)
 *  - Distribución por calibre (bar horizontal)
 *  - Distribución por calidad (doughnut)
 *  - Distribución por compuerta 1-12 (bar vertical)
 *  - Top causas P0 (lista con barras de progreso)
 *  - Botón "Abrir dashboard completo" que navega al Wizard con autoload
 *
 * Toda la data viene del summary guardado en Firestore — no re-parsea Excel.
 */

import { useMemo, useState, useCallback, useRef, useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import { Card, CardContent, CardHeader, CardTitle, Button, Badge } from '@/components/ui'
import { ArrowRight, ChevronLeft, ChevronRight, Clock, Brain, Loader2, XCircle, Zap, AlertTriangle, Info, TrendingUp } from 'lucide-react'
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
  Filler,
} from 'chart.js'
import { cn } from '@/lib/utils'
import type { GraderDailySummary, TimelineBucket } from '@/services/grader/types'
import type { AIGraderOutput } from '@/services/grader/types'
import { computeInsightsFromSummary } from '@/services/grader/graderSummaryInsights'
import { analyzeGraderFromSummary } from '@/services/grader/graderSummaryAI'
import { AIOutputPanel } from '@/components/grader/GraderInlinePanels'
import { listPieceRecords, loadTimelineAggregates, type FirestorePieceRecord } from '@/services/grader/graderDailySummary.service'
import { GraderTimelineChart } from '@/components/grader/GraderTimelineChart'
import { p0StatusFromPct, p0StatusColor, p0StatusBgBorderClass, p0StatusHex } from '@/services/grader/graderP0Thresholds'

// Registrar los elementos de Chart.js necesarios (idempotente si ya están)
ChartJS.register(
  CategoryScale, LinearScale, BarElement, PointElement, LineElement,
  ArcElement, Title, Tooltip, Legend, Filler,
)

// ── Helpers ──────────────────────────────────────────────────────────────────

/** Duración defensiva: si durationMinutes > 1440 (anomalía por merge),
 *  deriva de endAt–startAt con máximo de 720 min (12h = turno completo). */
function safeMinutes(summary: { durationMinutes?: number; startAt?: string; endAt?: string }): number | undefined {
  const dm = summary.durationMinutes
  if (dm == null || dm <= 0) return undefined
  if (dm > 1440 && summary.startAt && summary.endAt) {
    const span = Math.round(
      (new Date(summary.endAt).getTime() - new Date(summary.startAt).getTime()) / 60_000,
    )
    if (span > 0 && span <= 1440) return span
    return undefined
  }
  return dm
}

function formatDuration(minutes?: number): string {
  if (minutes == null || minutes <= 0) return '—'
  const h = Math.floor(minutes / 60)
  const m = minutes % 60
  return h > 0 ? `${h}h ${m}m` : `${m}m`
}

function formatWeight(kg?: number): string {
  if (kg == null) return '—'
  if (kg >= 1000) return `${(kg / 1000).toFixed(1)} t`
  return `${kg.toFixed(0)} kg`
}

function formatFullDate(dateKey: string): string {
  const d = new Date(`${dateKey}T12:00:00`)
  return d.toLocaleDateString('es-CL', {
    weekday: 'long',
    day: '2-digit',
    month: 'long',
    year: 'numeric',
  })
}

// Paleta para gráficos (consistente con el dashboard principal del Grader)
const DOUGHNUT_COLORS = [
  'rgba(16, 185, 129, 0.75)',  // emerald
  'rgba(59, 130, 246, 0.75)',  // blue
  'rgba(245, 158, 11, 0.75)',  // amber
  'rgba(239, 68, 68, 0.75)',   // red
  'rgba(139, 92, 246, 0.75)',  // violet
  'rgba(107, 114, 128, 0.75)', // gray
]

/**
 * Gradiente mapa de calor: AZUL (valor bajo) → VERDE (medio) → ROJO (valor alto)
 * t=0 → azul frío (59,130,246)
 * t=0.5 → verde (16,185,129)
 * t=1 → rojo caliente (239,68,68)
 */
function heatColor(value: number, min: number, max: number, alpha = 0.78): string {
  const t = max > min ? Math.max(0, Math.min(1, (value - min) / (max - min))) : 0.5
  let r: number, g: number, b: number
  if (t <= 0.5) {
    // azul → verde
    const s = t / 0.5
    r = Math.round(59 * (1 - s) + 16 * s)
    g = Math.round(130 * (1 - s) + 185 * s)
    b = Math.round(246 * (1 - s) + 129 * s)
  } else {
    // verde → rojo
    const s = (t - 0.5) / 0.5
    r = Math.round(16 * (1 - s) + 239 * s)
    g = Math.round(185 * (1 - s) + 68 * s)
    b = Math.round(129 * (1 - s) + 68 * s)
  }
  return `rgba(${r},${g},${b},${alpha})`
}

function heatBorder(value: number, min: number, max: number): string {
  return heatColor(value, min, max, 1)
}

// ── Componente ───────────────────────────────────────────────────────────────

interface Props {
  summary: GraderDailySummary
  /** Turnos anteriores para contexto de tendencia e insights. */
  recentTurns?: GraderDailySummary[]
  /** Si true, oculta el botón "Abrir dashboard completo" (útil si se embebe donde no tiene sentido navegar). */
  hideDashboardButton?: boolean
}

export function GraderTurnoDetailView({ summary, recentTurns, hideDashboardButton }: Props) {
  const navigate = useNavigate()

  // ── Estado IA ────────────────────────────────────────────────────────────
  const [aiLoading, setAiLoading] = useState(false)
  const [aiOutput, setAiOutput] = useState<AIGraderOutput | null>(null)
  const [aiError, setAiError] = useState<string | null>(null)

  // ── Estado timeline pieza a pieza ───────────────────────────────────────
  const [timelineRecords, setTimelineRecords] = useState<FirestorePieceRecord[] | null>(null)
  const [timelineLoading, setTimelineLoading] = useState(false)

  // Fase 2: aggregates pre-computados (~40-60 KB) desde sub-collection.
  // Carga automática al montar — es instantáneo en 2da visita gracias al
  // cache persistente de Firestore (IndexedDB).
  const [timelineAggregates, setTimelineAggregates] = useState<TimelineBucket[] | null>(null)

  useEffect(() => {
    let cancelled = false
    const summaryId = `${summary.dateKey}__${summary.shiftId}`
    setTimelineAggregates(null)
    loadTimelineAggregates(summaryId)
      .then((aggs) => {
        if (!cancelled) setTimelineAggregates(aggs)
      })
      .catch(() => {
        if (!cancelled) setTimelineAggregates(null)
      })
    return () => {
      cancelled = true
    }
  }, [summary.dateKey, summary.shiftId])

  const handleLoadTimeline = useCallback(async () => {
    const summaryId = `${summary.dateKey}__${summary.shiftId}`
    setTimelineLoading(true)
    try {
      const recs = await listPieceRecords(summaryId)
      setTimelineRecords(recs)
    } catch {
      setTimelineRecords([])
    } finally {
      setTimelineLoading(false)
    }
  }, [summary.dateKey, summary.shiftId])

  const handleAnalyzeAI = useCallback(async () => {
    setAiLoading(true)
    setAiError(null)
    try {
      const result = await analyzeGraderFromSummary(summary, recentTurns)
      setAiOutput(result)
    } catch (err) {
      setAiError(err instanceof Error ? err.message : 'Error al analizar con IA')
    } finally {
      setAiLoading(false)
    }
  }, [summary, recentTurns])

  // ── Insights determinísticos ─────────────────────────────────────────────
  const insights = useMemo(
    () => computeInsightsFromSummary(summary, recentTurns),
    [summary, recentTurns],
  )

  // ── Datos de gráficos (memoizados) ───────────────────────────────────────

  const calibreChartData = useMemo(() => {
    const dist = summary.calibreDistribution ?? []
    if (dist.length === 0) return null
    const sorted = [...dist].sort((a, b) => b.pieces - a.pieces).slice(0, 10)
    const values = sorted.map((d) => d.pieces)
    const min = Math.min(...values)
    const max = Math.max(...values)
    return {
      labels: sorted.map((d) => d.calibre),
      datasets: [{
        label: 'Piezas',
        data: values,
        backgroundColor: values.map((v) => heatColor(v, min, max)),
        borderColor: values.map((v) => heatBorder(v, min, max)),
        borderWidth: 1,
      }],
    }
  }, [summary.calibreDistribution])

  const qualityChartData = useMemo(() => {
    const dist = summary.qualityDistribution ?? []
    if (dist.length === 0) return null
    const sorted = [...dist].sort((a, b) => b.pieces - a.pieces)
    return {
      labels: sorted.map((d) => d.quality),
      datasets: [{
        label: 'Piezas',
        data: sorted.map((d) => d.pieces),
        backgroundColor: sorted.map((_, i) => DOUGHNUT_COLORS[i % DOUGHNUT_COLORS.length]),
        borderWidth: 2,
      }],
    }
  }, [summary.qualityDistribution])

  const gateChartData = useMemo(() => {
    const dist = summary.gateDistribution ?? []
    if (dist.length === 0) return null
    const sorted = [...dist].sort((a, b) => a.gate - b.gate)
    const values = sorted.map((d) => d.pieces)
    const nonZeroValues = sorted.filter((d) => d.gate !== 0).map((d) => d.pieces)
    const min = nonZeroValues.length > 0 ? Math.min(...nonZeroValues) : 0
    const max = nonZeroValues.length > 0 ? Math.max(...nonZeroValues) : 1
    return {
      labels: sorted.map((d) => `G${d.gate}`),
      datasets: [{
        label: 'Piezas',
        data: values,
        backgroundColor: sorted.map((d) =>
          d.gate === 0 ? 'rgba(239, 68, 68, 0.7)' : heatColor(d.pieces, min, max),
        ),
        borderColor: sorted.map((d) =>
          d.gate === 0 ? 'rgba(239, 68, 68, 1)' : heatBorder(d.pieces, min, max),
        ),
        borderWidth: 1,
      }],
    }
  }, [summary.gateDistribution])

  const displayMinutes = useMemo(() => safeMinutes(summary), [summary])
  const displayRate = useMemo(() => {
    if (displayMinutes && displayMinutes > 0) return Math.round(summary.totalPieces / (displayMinutes / 60))
    return summary.productionRatePerHour
  }, [summary, displayMinutes])

  const timeRangeLabel = useMemo(() => {
    if (!summary.startAt || !summary.endAt) return null
    const s = new Date(summary.startAt).toLocaleTimeString('es-CL', { hour: '2-digit', minute: '2-digit', timeZone: 'UTC', hour12: false })
    const e = new Date(summary.endAt).toLocaleTimeString('es-CL', { hour: '2-digit', minute: '2-digit', timeZone: 'UTC', hour12: false })
    return `${s} – ${e}`
  }, [summary.startAt, summary.endAt])

  // tendenciaChartData eliminado — reemplazado por gráfico horario unificado

  // ── Render ───────────────────────────────────────────────────────────────

  // ── Navegación prev/next entre turnos ────────────────────────────────
  const sortedAllTurns = useMemo(() => {
    const all = [...(recentTurns ?? []), summary]
      .filter((t, i, arr) => arr.findIndex(x => x.dateKey === t.dateKey && x.shiftId === t.shiftId) === i)
      .sort((a, b) => a.dateKey.localeCompare(b.dateKey) || a.shiftId.localeCompare(b.shiftId))
    return all
  }, [recentTurns, summary])

  const currentIdx = sortedAllTurns.findIndex(t => t.dateKey === summary.dateKey && t.shiftId === summary.shiftId)
  const prevTurn = currentIdx > 0 ? sortedAllTurns[currentIdx - 1] : null
  const nextTurn = currentIdx < sortedAllTurns.length - 1 ? sortedAllTurns[currentIdx + 1] : null

  const goToTurn = (turn: GraderDailySummary) => {
    navigate(`/analisis-grader/turno/${turn.dateKey}__${encodeURIComponent(turn.shiftId)}`)
  }

  // ── Swipe touch para navegar turnos en mobile ─────────────────────────
  const touchStartX = useRef<number | null>(null)
  const handleTouchStart = useCallback((e: React.TouchEvent) => {
    touchStartX.current = e.touches[0]?.clientX ?? null
  }, [])
  const handleTouchEnd = useCallback((e: React.TouchEvent) => {
    if (touchStartX.current === null) return
    const dx = (e.changedTouches[0]?.clientX ?? touchStartX.current) - touchStartX.current
    touchStartX.current = null
    const MIN_SWIPE = 60
    if (dx > MIN_SWIPE && prevTurn) goToTurn(prevTurn)
    else if (dx < -MIN_SWIPE && nextTurn) goToTurn(nextTurn)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [prevTurn, nextTurn])

  return (
    <div className="space-y-4" onTouchStart={handleTouchStart} onTouchEnd={handleTouchEnd}>
      {/* ── Navegación entre turnos (mas visible + swipe) ──────────── */}
      {sortedAllTurns.length > 1 && (
        <div className="flex items-center justify-between bg-muted rounded-card px-2 py-1.5">
          <button
            type="button"
            disabled={!prevTurn}
            onClick={() => prevTurn && goToTurn(prevTurn)}
            className={cn('flex items-center gap-1.5 text-sm px-3 py-2 rounded-card font-medium transition-all', prevTurn ? 'text-foreground hover:bg-background/80 active:scale-95' : 'opacity-20 cursor-not-allowed')}
          >
            <ChevronLeft className="h-5 w-5" />
            <span className="hidden sm:inline">{prevTurn ? `${prevTurn.shiftId.includes('día') ? '☀️' : '🌙'} ${prevTurn.dateKey.slice(5)} ${prevTurn.shiftId.replace('Turno ', '')}` : ''}</span>
            <span className="sm:hidden">Anterior</span>
          </button>
          <span className="text-xs text-muted-foreground tabular-nums font-medium">
            {currentIdx + 1} de {sortedAllTurns.length}
          </span>
          <button
            type="button"
            disabled={!nextTurn}
            onClick={() => nextTurn && goToTurn(nextTurn)}
            className={cn('flex items-center gap-1.5 text-sm px-3 py-2 rounded-card font-medium transition-all', nextTurn ? 'text-foreground hover:bg-background/80 active:scale-95' : 'opacity-20 cursor-not-allowed')}
          >
            <span className="hidden sm:inline">{nextTurn ? `${nextTurn.shiftId.includes('día') ? '☀️' : '🌙'} ${nextTurn.dateKey.slice(5)} ${nextTurn.shiftId.replace('Turno ', '')}` : ''}</span>
            <span className="sm:hidden">{nextTurn ? 'Siguiente' : 'Final'}</span>
            <ChevronRight className="h-5 w-5" />
          </button>
        </div>
      )}

      {/* ── Header con fecha + turno + icono dia/noche ────────────────────── */}
      <Card className={cn('border-2', p0StatusBgBorderClass(p0StatusFromPct(summary.pointZeroPct)))}>
        <CardContent className="pt-4 pb-4">
          <div className="flex items-start justify-between flex-wrap gap-3">
            <div>
              <p className="text-xs font-medium text-muted-foreground uppercase tracking-wide flex items-center gap-1.5">
                <span className="text-base">{summary.shiftId.includes('día') ? '☀️' : '🌙'}</span>
                {summary.shiftId} · {summary.totalPieces.toLocaleString('es-CL')} piezas
              </p>
              <h2 className="text-xl font-bold capitalize mt-0.5">
                {formatFullDate(summary.dateKey)}
              </h2>
              <p className="text-sm text-muted-foreground mt-0.5">
                {summary.shiftId}
                {timeRangeLabel && (
                  <span className="ml-2">
                    <Clock className="inline h-3 w-3 mr-1" />
                    {timeRangeLabel}
                  </span>
                )}
                {displayMinutes != null && displayMinutes > 0 && (
                  <span className="ml-2">· {formatDuration(displayMinutes)}</span>
                )}
              </p>
              {/* Indicadores de completitud */}
              {(summary.hasPieceData === false || summary.hasGate0Data === false) && (
                <div className="flex gap-1.5 mt-2">
                  {summary.hasPieceData === false && (
                    <Badge className="text-[10px] bg-red-500/[0.15] text-ink-crit border-red-500/[0.25]">
                      Falta PIEZA_PIEZA
                    </Badge>
                  )}
                  {summary.hasGate0Data === false && (
                    <Badge className="text-[10px] bg-red-500/[0.15] text-ink-crit border-red-500/[0.25]">
                      Falta PUERTA_0
                    </Badge>
                  )}
                </div>
              )}
            </div>
            <div className="text-right">
              <p className="text-xs text-muted-foreground uppercase tracking-wide">P0%</p>
              <p className={cn('text-5xl font-bold tabular-nums', p0StatusColor(p0StatusFromPct(summary.pointZeroPct)))}>
                {summary.pointZeroPct}%
              </p>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* ── Row de KPIs destacados ────────────────────────────────────────── */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        <Card>
          <CardContent className="pt-4 pb-3 text-center">
            <p className="text-[10px] font-medium text-muted-foreground uppercase tracking-wider">Piezas totales</p>
            <p className="text-2xl font-bold tabular-nums mt-0.5">
              {summary.totalPieces.toLocaleString('es-CL')}
            </p>
            <p className="text-[10px] text-muted-foreground mt-0.5">
              {summary.pointZeroPieces.toLocaleString('es-CL')} en P0
            </p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-4 pb-3 text-center">
            <p className="text-[10px] font-medium text-muted-foreground uppercase tracking-wider">Peso clasificado</p>
            <p className="text-2xl font-bold tabular-nums mt-0.5">
              {formatWeight(summary.totalWeightKg)}
            </p>
            {summary.avgWeightGrams != null && (
              <p className="text-[10px] text-muted-foreground mt-0.5">
                ~{summary.avgWeightGrams} g/pza
              </p>
            )}
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-4 pb-3 text-center">
            <p className="text-[10px] font-medium text-muted-foreground uppercase tracking-wider">Tasa producción</p>
            <p className="text-2xl font-bold tabular-nums mt-0.5">
              {displayRate != null ? displayRate.toLocaleString('es-CL') : '—'}
            </p>
            <p className="text-[10px] text-muted-foreground mt-0.5">pz/hora</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-4 pb-3 text-center">
            <p className="text-[10px] font-medium text-muted-foreground uppercase tracking-wider">Duración turno</p>
            <p className="text-2xl font-bold tabular-nums mt-0.5">
              {formatDuration(displayMinutes)}
            </p>
            {displayMinutes != null && displayMinutes > 0 && (
              <p className="text-[10px] text-muted-foreground mt-0.5">
                {displayMinutes} min
              </p>
            )}
          </CardContent>
        </Card>
      </div>

      {/* ── Timeline segundo a segundo ──────────────────────────────────
          Prioridad:
          1. `timelineRecords` raw (si el usuario cargó manualmente para zoom extremo)
          2. `summary.timelineAggregates` pre-computados (Fase 2: pinta al instante)
          3. Fallback: card con botón "Cargar timeline" para summaries legacy
             sin aggregates backfilled. */}
      {timelineRecords !== null && timelineRecords.length > 0 ? (
        <GraderTimelineChart
          records={timelineRecords}
          shiftId={summary.shiftId}
          dateKey={summary.dateKey}
        />
      ) : timelineAggregates && timelineAggregates.length > 0 ? (
        <GraderTimelineChart
          aggregates={timelineAggregates}
          shiftId={summary.shiftId}
          dateKey={summary.dateKey}
        />
      ) : (
        <Card>
          <CardContent className="pt-4 pb-4 flex items-center justify-between flex-wrap gap-3">
            <div>
              <p className="text-sm font-medium">Timeline segundo a segundo</p>
              <p className="text-xs text-muted-foreground">
                {timelineRecords === null
                  ? 'Carga los registros pieza a pieza desde Firestore'
                  : 'Este turno no tiene registros pieza a pieza guardados'}
              </p>
            </div>
            {timelineRecords === null && (
              <Button
                size="sm"
                variant="outline"
                onClick={handleLoadTimeline}
                disabled={timelineLoading}
              >
                {timelineLoading ? (
                  <><Loader2 className="h-3.5 w-3.5 animate-spin mr-1.5" />Cargando...</>
                ) : (
                  'Cargar timeline'
                )}
              </Button>
            )}
          </CardContent>
        </Card>
      )}

      {/* ── Gráfico principal del turno — P0% horario + producción + causas ── */}
      {summary.hourlyBuckets && summary.hourlyBuckets.length > 0 && (() => {
        const buckets = summary.hourlyBuckets!
        const hourLabels = buckets.map(b => `${b.hour.toString().padStart(2, '0')}:00`)
        const p0PctData = buckets.map(b => b.totalPieces > 0 ? +((b.p0Pieces / b.totalPieces) * 100).toFixed(1) : 0)
        const topCauses = summary.topP0Causes ?? []

        return (
          <Card>
            <CardHeader className="pb-2">
              <div className="flex items-center justify-between flex-wrap gap-2">
                <div>
                  <CardTitle className="text-base flex items-center gap-2">
                    <TrendingUp className="h-4 w-4 text-primary" />
                    Análisis del turno — hora por hora
                  </CardTitle>
                  <p className="text-xs text-muted-foreground mt-0.5">
                    {summary.shiftId} · {buckets.length} horas con actividad · {summary.totalPieces.toLocaleString('es-CL')} piezas
                  </p>
                </div>
              </div>
              {/* Causas P0 como badges informativos */}
              {topCauses.length > 0 && (
                <div className="flex items-center gap-1.5 flex-wrap mt-2">
                  <span className="text-[10px] text-muted-foreground">Causas P0:</span>
                  {topCauses.slice(0, 4).map((c, i) => {
                    const pctTotal = summary.totalPieces > 0 ? +((c.pieces / summary.totalPieces) * 100).toFixed(2) : 0
                    return (
                      <Badge
                        key={i}
                        variant="outline"
                        className={cn(
                          'text-[9px] py-0',
                          c.pct >= 50 ? 'border-red-500/[0.25] text-red-500' :
                          c.pct >= 25 ? 'border-amber-500/[0.25] text-amber-500' :
                          'border-muted-foreground/30 text-muted-foreground'
                        )}
                      >
                        {c.error} {pctTotal}% del total ({c.pct}% del P0)
                      </Badge>
                    )
                  })}
                </div>
              )}
            </CardHeader>
            <CardContent>
              <div className="h-60 lg:h-80">
                <Line
                  data={{
                    labels: hourLabels,
                    datasets: [
                      {
                        label: 'P0%',
                        data: p0PctData,
                        borderColor: 'rgba(239, 68, 68, 1)',
                        backgroundColor: 'rgba(239, 68, 68, 0.1)',
                        borderWidth: 2.5,
                        fill: true,
                        tension: 0.3,
                        pointRadius: 5,
                        pointHoverRadius: 7,
                        pointBackgroundColor: p0PctData.map(v => p0StatusHex(p0StatusFromPct(v))),
                        pointBorderColor: 'rgba(255,255,255,0.8)',
                        pointBorderWidth: 2,
                        yAxisID: 'yP0',
                      },
                      {
                        label: 'Piezas/hora',
                        data: buckets.map(b => b.totalPieces),
                        borderColor: 'rgba(59, 130, 246, 0.6)',
                        backgroundColor: 'rgba(59, 130, 246, 0.08)',
                        borderWidth: 1.5,
                        fill: true,
                        tension: 0.3,
                        pointRadius: 3,
                        pointHoverRadius: 5,
                        yAxisID: 'yProd',
                      },
                      {
                        label: 'Piezas P0',
                        data: buckets.map(b => b.p0Pieces),
                        borderColor: 'rgba(239, 68, 68, 0.4)',
                        backgroundColor: 'transparent',
                        borderWidth: 1,
                        borderDash: [4, 4],
                        tension: 0.3,
                        pointRadius: 2,
                        pointHoverRadius: 4,
                        yAxisID: 'yProd',
                      },
                    ],
                  }}
                  options={{
                    responsive: true,
                    maintainAspectRatio: false,
                    interaction: { mode: 'index' as const, intersect: false },
                    plugins: {
                      legend: {
                        display: true,
                        position: 'top' as const,
                        labels: { font: { size: 10 }, boxWidth: 10, usePointStyle: true },
                      },
                      tooltip: {
                        callbacks: {
                          afterBody: (items) => {
                            const idx = items[0]?.dataIndex
                            if (typeof idx !== 'number') return ''
                            const bucket = buckets[idx]
                            if (!bucket) return ''
                            const lines = [`Hora: ${bucket.hour.toString().padStart(2, '0')}:00 - ${bucket.hour.toString().padStart(2, '0')}:59`]
                            if (topCauses.length > 0) {
                              lines.push('', 'Causas P0 del turno:')
                              topCauses.slice(0, 3).forEach(c => lines.push(`  ${c.error}: ${c.pct}% (${c.pieces} pz)`))
                            }
                            return lines
                          },
                        },
                      },
                    },
                    scales: {
                      yP0: {
                        type: 'linear' as const,
                        position: 'left' as const,
                        min: 0,
                        suggestedMax: Math.max(5, Math.max(...p0PctData) + 1),
                        ticks: { callback: (v: any) => `${v}%`, font: { size: 10 } },
                        title: { display: true, text: 'P0%', font: { size: 10 } },
                        grid: { color: 'rgba(239, 68, 68, 0.08)' },
                      },
                      yProd: {
                        type: 'linear' as const,
                        position: 'right' as const,
                        min: 0,
                        ticks: { callback: (v: any) => Number(v).toLocaleString('es-CL'), font: { size: 10 } },
                        title: { display: true, text: 'Piezas', font: { size: 10 } },
                        grid: { display: false },
                      },
                      x: {
                        ticks: { font: { size: 10 } },
                      },
                    },
                  }}
                />
              </div>
              {/* Leyenda de colores P0 */}
              <div className="flex items-center gap-4 mt-2 text-[10px] text-muted-foreground flex-wrap">
                <span className="flex items-center gap-1">
                  <span className="inline-block w-2.5 h-2.5 rounded-full bg-emerald-500" />
                  P0% {'<'} 2% (OK)
                </span>
                <span className="flex items-center gap-1">
                  <span className="inline-block w-2.5 h-2.5 rounded-full bg-amber-500" />
                  2-3.5% (Warn)
                </span>
                <span className="flex items-center gap-1">
                  <span className="inline-block w-2.5 h-2.5 rounded-full bg-red-500" />
                  {'>'} 3.5% (Crítico)
                </span>
                <span className="text-muted-foreground/50 ml-auto">Detalle pieza a pieza disponible en "Abrir dashboard completo"</span>
              </div>
            </CardContent>
          </Card>
        )
      })()}

      {/* ── Alertas automáticas (insights determinísticos) ───────────────────── */}
      {insights.length > 0 && (
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-base flex items-center gap-2">
              <Zap className="h-4 w-4 text-muted-foreground" />
              Alertas automáticas
              <Badge variant="outline" className="text-[10px] ml-auto">
                {insights.length} alerta{insights.length !== 1 ? 's' : ''}
              </Badge>
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-3">
            {insights.map((ins) => {
              const sev = ins.severity
              const borderCls = sev === 'critical' ? 'border-red-500/[0.25] bg-red-500/[0.15]'
                : sev === 'warn' ? 'border-amber-500/[0.25] bg-amber-500/[0.15]'
                : 'border-primary/[0.25] bg-primary/[0.15]'
              const icon = sev === 'critical' ? <AlertTriangle className="h-3.5 w-3.5 text-red-500 shrink-0 mt-0.5" />
                : sev === 'warn' ? <AlertTriangle className="h-3.5 w-3.5 text-amber-500 shrink-0 mt-0.5" />
                : <Info className="h-3.5 w-3.5 text-blue-500 shrink-0 mt-0.5" />
              return (
                <div key={ins.id} className={cn('rounded-card border p-3 space-y-1.5', borderCls)}>
                  <div className="flex items-start gap-2">
                    {icon}
                    <p className="text-xs font-semibold">{ins.title}</p>
                  </div>
                  <ul className="pl-5 space-y-0.5">
                    {ins.evidence.map((e, i) => (
                      <li key={i} className="text-[11px] text-muted-foreground list-disc">{e}</li>
                    ))}
                  </ul>
                  {ins.recommendations.length > 0 && (
                    <ul className="pl-5 space-y-0.5 pt-1 border-t border-dashed border-muted">
                      {ins.recommendations.map((r, i) => (
                        <li key={i} className="text-[11px] list-disc">{r}</li>
                      ))}
                    </ul>
                  )}
                </div>
              )
            })}
            </div>
          </CardContent>
        </Card>
      )}

      {/* ── Distribuciones en grid (mejoradas) ─────────────────────────────── */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
        {/* Distribución por Calibre */}
        <Card className="lg:col-span-2">
          <CardHeader className="pb-1">
            <CardTitle className="text-sm flex items-center gap-2">Distribución por Calibre
              <Badge variant="outline" className="text-[10px] font-normal">{summary.totalPieces.toLocaleString('es-CL')} pz</Badge>
            </CardTitle>
          </CardHeader>
          <CardContent>
            {calibreChartData ? (
              <div className="h-52 lg:h-64">
                <Bar
                  data={calibreChartData}
                  options={{
                    indexAxis: 'y' as const,
                    responsive: true,
                    maintainAspectRatio: false,
                    plugins: {
                      legend: { display: false },
                      tooltip: {
                        callbacks: {
                          label: (ctx) => {
                            const value = Number(ctx.parsed.x ?? 0)
                            const total = summary.totalPieces || 1
                            const pct = ((value / total) * 100).toFixed(1)
                            return `${value.toLocaleString('es-CL')} piezas (${pct}%)`
                          },
                        },
                      },
                    },
                    scales: {
                      x: { ticks: { callback: (v) => Number(v).toLocaleString('es-CL') }, grid: { color: 'rgba(255,255,255,0.04)' } },
                      y: { ticks: { font: { size: 11, weight: 'bold' as const } } },
                    },
                  }}
                />
              </div>
            ) : (
              <p className="text-xs text-muted-foreground py-8 text-center">Sin datos de calibre</p>
            )}
          </CardContent>
        </Card>

        {/* Distribución por Calidad */}
        <Card>
          <CardHeader className="pb-1">
            <CardTitle className="text-sm">Calidad</CardTitle>
          </CardHeader>
          <CardContent>
            {qualityChartData ? (
              <div className="h-52 lg:h-64 flex items-center justify-center">
                <Doughnut
                  data={{
                    ...qualityChartData,
                    datasets: qualityChartData.datasets.map((ds: any) => ({
                      ...ds,
                      borderWidth: 2,
                      borderColor: 'rgba(0,0,0,0.3)',
                      hoverBorderWidth: 3,
                      hoverOffset: 8,
                    })),
                  }}
                  options={{
                    responsive: true,
                    maintainAspectRatio: false,
                    cutout: '55%',
                    plugins: {
                      legend: {
                        position: 'bottom' as const,
                        labels: { font: { size: 11 }, boxWidth: 12, padding: 12 },
                      },
                      tooltip: {
                        callbacks: {
                          label: (ctx) => {
                            const value = ctx.parsed
                            const total = summary.totalPieces || 1
                            const pct = ((value / total) * 100).toFixed(1)
                            return `${ctx.label}: ${value.toLocaleString('es-CL')} (${pct}%)`
                          },
                        },
                      },
                    },
                  }}
                />
              </div>
            ) : (
              <p className="text-xs text-muted-foreground py-8 text-center">Sin datos</p>
            )}
          </CardContent>
        </Card>

        {/* Distribución por Compuerta — full width con colores por gate */}
        <Card className="lg:col-span-3">
          <CardHeader className="pb-1">
            <CardTitle className="text-sm flex items-center gap-2">Distribución por Compuerta (G1–G12)
              <Badge variant="outline" className="text-[10px] font-normal">12 gates</Badge>
            </CardTitle>
          </CardHeader>
          <CardContent>
            {gateChartData ? (
              <div className="h-48 lg:h-56">
                <Bar
                  data={{
                    ...gateChartData,
                    datasets: gateChartData.datasets.map((ds: any) => ({
                      ...ds,
                      borderWidth: 1,
                      borderRadius: 4,
                    })),
                  }}
                  options={{
                    responsive: true,
                    maintainAspectRatio: false,
                    plugins: {
                      legend: { display: false },
                      tooltip: {
                        callbacks: {
                          label: (ctx) => {
                            const value = Number(ctx.parsed.y ?? 0)
                            const total = summary.totalPieces || 1
                            const pct = ((value / total) * 100).toFixed(1)
                            return `${value.toLocaleString('es-CL')} piezas (${pct}%)`
                          },
                        },
                      },
                    },
                    scales: {
                      y: { ticks: { callback: (v) => Number(v).toLocaleString('es-CL') }, grid: { color: 'rgba(255,255,255,0.04)' } },
                      x: { ticks: { font: { size: 11, weight: 'bold' as const } } },
                    },
                  }}
                />
              </div>
            ) : (
              <p className="text-xs text-muted-foreground py-8 text-center">Sin datos de compuertas</p>
            )}
          </CardContent>
        </Card>
      </div>

      {/* ── Top causas P0 (% del total, no % del P0) ────────────────────── */}
      {summary.topP0Causes && summary.topP0Causes.length > 0 && (
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm flex items-center gap-2">
              Desglose Punto Cero
              <Badge variant="outline" className="text-[10px]">
                P0: {summary.pointZeroPct}% ({summary.pointZeroPieces.toLocaleString('es-CL')} de {summary.totalPieces.toLocaleString('es-CL')})
              </Badge>
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            {summary.topP0Causes.map((cause, i) => {
              // % del TOTAL de piezas (no del P0)
              const pctOfTotal = summary.totalPieces > 0 ? +((cause.pieces / summary.totalPieces) * 100).toFixed(2) : 0
              const pctOfP0 = cause.pct
              const barColor = pctOfTotal >= 2 ? 'bg-red-500' : pctOfTotal >= 1 ? 'bg-amber-500' : 'bg-blue-500'
              return (
                <div key={i} className="space-y-1">
                  <div className="flex items-center justify-between text-xs gap-2">
                    <span className="font-medium truncate">{cause.error}</span>
                    <span className="tabular-nums shrink-0 text-right">
                      <span className="font-bold">{pctOfTotal}%</span>
                      <span className="text-muted-foreground ml-1">del total</span>
                      <span className="text-muted-foreground ml-2">
                        ({pctOfP0}% del P0 · {cause.pieces.toLocaleString('es-CL')} pz)
                      </span>
                    </span>
                  </div>
                  <div className="h-1.5 rounded-full bg-muted overflow-hidden">
                    <div
                      className={cn('h-full rounded-full transition-all', barColor)}
                      style={{ width: `${Math.min(100, pctOfTotal * 20)}%` }}
                    />
                  </div>
                </div>
              )
            })}
          </CardContent>
        </Card>
      )}

      {/* ── Diagnóstico IA ────────────────────────────────────────────────────── */}
      <Card>
        <CardHeader className="flex flex-row items-start justify-between gap-3 flex-wrap pb-2">
          <div>
            <CardTitle className="text-base flex items-center gap-2">
              <Brain className="h-4 w-4 text-muted-foreground" />
              Diagnóstico IA — Sugerencias de configuración
            </CardTitle>
            <p className="text-xs text-muted-foreground mt-1">
              Analiza causas raíz de P0%, balance de compuertas y plan de acción con inteligencia artificial
            </p>
          </div>
          <Button
            size="sm"
            onClick={handleAnalyzeAI}
            disabled={aiLoading}
            className="shrink-0"
          >
            {aiLoading
              ? <><Loader2 className="h-3.5 w-3.5 animate-spin mr-1.5" />Analizando…</>
              : <><Brain className="h-3.5 w-3.5 mr-1.5" />Analizar con IA</>
            }
          </Button>
        </CardHeader>
        <CardContent>
          {!aiOutput && !aiError && !aiLoading && (
            <p className="text-sm text-muted-foreground text-center py-6">
              Presiona "Analizar con IA" para obtener diagnóstico y recomendaciones de configuración.
            </p>
          )}
          {aiError && (
            <div className="p-3 rounded-card bg-red-500/[0.15] border border-red-300 text-sm">
              <div className="flex items-center gap-2 text-ink-crit">
                <XCircle className="h-4 w-4" />
                <span className="font-medium">Error de análisis IA</span>
              </div>
              <p className="mt-1 text-xs text-red-500">{aiError}</p>
            </div>
          )}
          {aiOutput && <AIOutputPanel output={aiOutput} />}
        </CardContent>
      </Card>

      {/* ── Botón opcional de dashboard completo ───────────────────────────── */}
      {!hideDashboardButton && (
        <div className="flex justify-end pt-2">
          <Button
            variant="outline"
            onClick={() => navigate(`/analisis-grader/turno/${summary.dateKey}__${encodeURIComponent(summary.shiftId)}`)}
          >
            Abrir dashboard completo
            <ArrowRight className="h-4 w-4 ml-1.5" />
          </Button>
        </div>
      )}
    </div>
  )
}
