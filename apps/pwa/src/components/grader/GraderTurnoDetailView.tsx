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

import { useMemo, useState, useCallback } from 'react'
import { useNavigate } from 'react-router-dom'
import { Card, CardContent, CardHeader, CardTitle, Button, Badge } from '@/components/ui'
import { ArrowRight, Clock, Database, Brain, Loader2, XCircle, Zap, AlertTriangle, Info, TrendingUp } from 'lucide-react'
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
import type { GraderDailySummary } from '@/services/grader/types'
import type { AIGraderOutput } from '@/services/grader/types'
import { computeInsightsFromSummary } from '@/services/grader/graderSummaryInsights'
import { analyzeGraderFromSummary } from '@/services/grader/graderSummaryAI'
import { AIOutputPanel } from '@/components/grader/GraderInlinePanels'

// Registrar los elementos de Chart.js necesarios (idempotente si ya están)
ChartJS.register(
  CategoryScale, LinearScale, BarElement, PointElement, LineElement,
  ArcElement, Title, Tooltip, Legend, Filler,
)

// ── Helpers ──────────────────────────────────────────────────────────────────

function p0Color(pct: number): string {
  if (pct >= 3.5) return 'text-red-500'
  if (pct >= 2)   return 'text-amber-500'
  return 'text-emerald-600'
}

function p0BorderClass(pct: number): string {
  if (pct >= 3.5) return 'border-red-500/30 bg-red-500/5'
  if (pct >= 2)   return 'border-amber-500/30 bg-amber-500/5'
  return 'border-emerald-500/30 bg-emerald-500/5'
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
const BAR_BLUE = 'rgba(59, 130, 246, 0.7)'
const BAR_BLUE_BORDER = 'rgba(59, 130, 246, 1)'
const DOUGHNUT_COLORS = [
  'rgba(16, 185, 129, 0.75)',  // emerald
  'rgba(59, 130, 246, 0.75)',  // blue
  'rgba(245, 158, 11, 0.75)',  // amber
  'rgba(239, 68, 68, 0.75)',   // red
  'rgba(139, 92, 246, 0.75)',  // violet
  'rgba(107, 114, 128, 0.75)', // gray
]

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
    return {
      labels: sorted.map((d) => d.calibre),
      datasets: [{
        label: 'Piezas',
        data: sorted.map((d) => d.pieces),
        backgroundColor: BAR_BLUE,
        borderColor: BAR_BLUE_BORDER,
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
    return {
      labels: sorted.map((d) => `G${d.gate}`),
      datasets: [{
        label: 'Piezas',
        data: sorted.map((d) => d.pieces),
        backgroundColor: sorted.map((d) =>
          d.gate === 0 ? 'rgba(239, 68, 68, 0.7)' : BAR_BLUE,
        ),
        borderColor: sorted.map((d) =>
          d.gate === 0 ? 'rgba(239, 68, 68, 1)' : BAR_BLUE_BORDER,
        ),
        borderWidth: 1,
      }],
    }
  }, [summary.gateDistribution])

  const timeRangeLabel = useMemo(() => {
    if (!summary.startAt || !summary.endAt) return null
    const s = new Date(summary.startAt).toLocaleTimeString('es-CL', { hour: '2-digit', minute: '2-digit' })
    const e = new Date(summary.endAt).toLocaleTimeString('es-CL', { hour: '2-digit', minute: '2-digit' })
    return `${s} – ${e}`
  }, [summary.startAt, summary.endAt])

  // ── Tendencia P0% (turnos recientes + actual) ────────────────────────────
  const tendenciaChartData = useMemo(() => {
    const prior = (recentTurns ?? [])
      .filter((t) => t.totalPieces >= 200)
      .sort((a, b) => a.dateKey.localeCompare(b.dateKey) || a.shiftId.localeCompare(b.shiftId))
      .slice(-19) // últimos 19 + actual = 20 puntos máx

    const points = [...prior, summary]
    if (points.length < 2) return null

    const labels = points.map((t) => {
      const d = new Date(`${t.dateKey}T12:00:00`)
      const dayLabel = d.toLocaleDateString('es-CL', { day: '2-digit', month: 'short' })
      const shiftShort = t.shiftId.includes('día') ? 'D' : 'N'
      return `${dayLabel} ${shiftShort}`
    })

    const isCurrentIndex = points.length - 1

    return {
      labels,
      datasets: [
        {
          label: 'P0%',
          data: points.map((t) => t.pointZeroPct),
          borderColor: 'rgba(99,102,241,0.7)',
          backgroundColor: 'rgba(99,102,241,0.08)',
          pointBackgroundColor: points.map((_, i) =>
            i === isCurrentIndex ? 'rgba(239,68,68,1)' : 'rgba(99,102,241,0.9)'
          ),
          pointBorderColor: points.map((_, i) =>
            i === isCurrentIndex ? 'rgba(239,68,68,1)' : 'rgba(99,102,241,0.9)'
          ),
          pointRadius: points.map((_, i) => (i === isCurrentIndex ? 8 : 4)),
          tension: 0.3,
          fill: true,
        },
      ],
    }
  }, [recentTurns, summary])

  // ── Render ───────────────────────────────────────────────────────────────

  return (
    <div className="space-y-4">
      {/* ── Header con fecha + turno + indicadores de completitud ─────────── */}
      <Card className={cn('border-2', p0BorderClass(summary.pointZeroPct))}>
        <CardContent className="pt-4 pb-4">
          <div className="flex items-start justify-between flex-wrap gap-3">
            <div>
              <p className="text-xs font-medium text-muted-foreground uppercase tracking-wide flex items-center gap-1.5">
                <Database className="h-3 w-3" />
                Detalle del turno
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
                {summary.durationMinutes != null && summary.durationMinutes > 0 && (
                  <span className="ml-2">· {formatDuration(summary.durationMinutes)}</span>
                )}
              </p>
              {/* Indicadores de completitud */}
              {(summary.hasPieceData === false || summary.hasGate0Data === false) && (
                <div className="flex gap-1.5 mt-2">
                  {summary.hasPieceData === false && (
                    <Badge className="text-[10px] bg-red-500/15 text-red-600 border-red-500/30">
                      Falta PIEZA_PIEZA
                    </Badge>
                  )}
                  {summary.hasGate0Data === false && (
                    <Badge className="text-[10px] bg-red-500/15 text-red-600 border-red-500/30">
                      Falta PUERTA_0
                    </Badge>
                  )}
                </div>
              )}
            </div>
            <div className="text-right">
              <p className="text-xs text-muted-foreground uppercase tracking-wide">P0%</p>
              <p className={cn('text-5xl font-bold tabular-nums', p0Color(summary.pointZeroPct))}>
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
              {summary.productionRatePerHour != null
                ? summary.productionRatePerHour.toLocaleString('es-CL')
                : '—'}
            </p>
            <p className="text-[10px] text-muted-foreground mt-0.5">pz/hora</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-4 pb-3 text-center">
            <p className="text-[10px] font-medium text-muted-foreground uppercase tracking-wider">Duración turno</p>
            <p className="text-2xl font-bold tabular-nums mt-0.5">
              {formatDuration(summary.durationMinutes)}
            </p>
            {summary.durationMinutes != null && summary.durationMinutes > 0 && (
              <p className="text-[10px] text-muted-foreground mt-0.5">
                {summary.durationMinutes} min
              </p>
            )}
          </CardContent>
        </Card>
      </div>

      {/* ── Tendencia P0% (últimos turnos) ───────────────────────────────────── */}
      {tendenciaChartData && (
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-base flex items-center gap-2">
              <TrendingUp className="h-4 w-4 text-muted-foreground" />
              Tendencia P0% — últimos turnos
            </CardTitle>
            <p className="text-xs text-muted-foreground">
              Punto rojo = turno actual. Escala: warn {'>'}2%, crítico {'>'}3.5%
            </p>
          </CardHeader>
          <CardContent>
            <div className="h-52">
              <Line
                data={tendenciaChartData}
                options={{
                  responsive: true,
                  maintainAspectRatio: false,
                  plugins: {
                    legend: { display: false },
                    tooltip: {
                      callbacks: {
                        label: (ctx) => `P0%: ${ctx.parsed.y}%`,
                      },
                    },
                  },
                  scales: {
                    y: {
                      min: 0,
                      suggestedMax: Math.max(5, summary.pointZeroPct + 1),
                      ticks: { callback: (v) => `${v}%` },
                    },
                    x: {
                      ticks: { font: { size: 10 }, maxRotation: 45 },
                    },
                  },
                }}
              />
            </div>
            {/* Líneas de referencia como leyenda visual */}
            <div className="flex items-center gap-4 mt-2 text-xs text-muted-foreground">
              <span className="flex items-center gap-1">
                <span className="inline-block w-4 h-0.5 bg-amber-400" />
                Warn 2%
              </span>
              <span className="flex items-center gap-1">
                <span className="inline-block w-4 h-0.5 bg-red-500" />
                Crítico 3.5%
              </span>
            </div>
          </CardContent>
        </Card>
      )}

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
          <CardContent className="space-y-3">
            {insights.map((ins) => {
              const sev = ins.severity
              const borderCls = sev === 'critical' ? 'border-red-400/40 bg-red-500/5'
                : sev === 'warn' ? 'border-amber-400/40 bg-amber-500/5'
                : 'border-blue-400/30 bg-blue-500/5'
              const icon = sev === 'critical' ? <AlertTriangle className="h-3.5 w-3.5 text-red-500 shrink-0 mt-0.5" />
                : sev === 'warn' ? <AlertTriangle className="h-3.5 w-3.5 text-amber-500 shrink-0 mt-0.5" />
                : <Info className="h-3.5 w-3.5 text-blue-500 shrink-0 mt-0.5" />
              return (
                <div key={ins.id} className={cn('rounded-md border p-3 space-y-1.5', borderCls)}>
                  <div className="flex items-start gap-2">
                    {icon}
                    <p className="text-sm font-medium">{ins.title}</p>
                  </div>
                  <ul className="pl-5 space-y-0.5">
                    {ins.evidence.map((e, i) => (
                      <li key={i} className="text-xs text-muted-foreground list-disc">{e}</li>
                    ))}
                  </ul>
                  {ins.recommendations.length > 0 && (
                    <ul className="pl-5 space-y-0.5 pt-1 border-t border-dashed border-muted">
                      {ins.recommendations.map((r, i) => (
                        <li key={i} className="text-xs list-disc">{r}</li>
                      ))}
                    </ul>
                  )}
                </div>
              )
            })}
          </CardContent>
        </Card>
      )}

      {/* ── Distribuciones en grid ─────────────────────────────────────────── */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        {/* Distribución por Calibre */}
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-base">Distribución por Calibre</CardTitle>
          </CardHeader>
          <CardContent>
            {calibreChartData ? (
              <div className="h-64">
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
                      x: { ticks: { callback: (v) => Number(v).toLocaleString('es-CL') } },
                      y: { ticks: { font: { size: 11 } } },
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
          <CardHeader className="pb-2">
            <CardTitle className="text-base">Distribución por Calidad</CardTitle>
          </CardHeader>
          <CardContent>
            {qualityChartData ? (
              <div className="h-64 flex items-center justify-center">
                <Doughnut
                  data={qualityChartData}
                  options={{
                    responsive: true,
                    maintainAspectRatio: false,
                    plugins: {
                      legend: {
                        position: 'right' as const,
                        labels: { font: { size: 11 }, boxWidth: 12 },
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
              <p className="text-xs text-muted-foreground py-8 text-center">Sin datos de calidad</p>
            )}
          </CardContent>
        </Card>

        {/* Distribución por Compuerta */}
        <Card className="lg:col-span-2">
          <CardHeader className="pb-2">
            <CardTitle className="text-base">Distribución por Compuerta (G0–G12)</CardTitle>
          </CardHeader>
          <CardContent>
            {gateChartData ? (
              <div className="h-56">
                <Bar
                  data={gateChartData}
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
                      y: { ticks: { callback: (v) => Number(v).toLocaleString('es-CL') } },
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

      {/* ── Top causas P0 ─────────────────────────────────────────────────── */}
      {summary.topP0Causes && summary.topP0Causes.length > 0 && (
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-base flex items-center gap-2">
              Top causas de Punto Cero
              <Badge variant="outline" className="text-[10px]">
                {summary.pointZeroPieces.toLocaleString('es-CL')} piezas
              </Badge>
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-2">
            {summary.topP0Causes.map((cause, i) => {
              const color = cause.pct >= 50 ? 'bg-red-500' : cause.pct >= 25 ? 'bg-amber-500' : 'bg-blue-500'
              return (
                <div key={i} className="space-y-1">
                  <div className="flex items-center justify-between text-xs">
                    <span className="font-medium truncate max-w-[70%]">{cause.error}</span>
                    <span className="tabular-nums">
                      <span className="font-semibold">{cause.pct}%</span>
                      <span className="text-muted-foreground ml-2">
                        ({cause.pieces.toLocaleString('es-CL')} pz)
                      </span>
                    </span>
                  </div>
                  <div className="h-2 rounded-full bg-muted overflow-hidden">
                    <div
                      className={cn('h-full rounded-full', color)}
                      style={{ width: `${Math.min(100, cause.pct)}%` }}
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
            <div className="p-3 rounded-lg bg-red-50 dark:bg-red-900/10 border border-red-300 text-sm">
              <div className="flex items-center gap-2 text-red-600">
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
            onClick={() => navigate(`/analisis-grader?date=${summary.dateKey}&shift=${encodeURIComponent(summary.shiftId)}&autoload=1`)}
          >
            Abrir dashboard completo
            <ArrowRight className="h-4 w-4 ml-1.5" />
          </Button>
        </div>
      )}
    </div>
  )
}
