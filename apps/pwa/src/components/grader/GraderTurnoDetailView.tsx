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

import { useMemo } from 'react'
import { useNavigate } from 'react-router-dom'
import { Card, CardContent, CardHeader, CardTitle, Button, Badge } from '@/components/ui'
import { ArrowRight, Clock, Database } from 'lucide-react'
import { Bar, Doughnut } from 'react-chartjs-2'
import {
  Chart as ChartJS,
  CategoryScale,
  LinearScale,
  BarElement,
  ArcElement,
  Title,
  Tooltip,
  Legend,
} from 'chart.js'
import { cn } from '@/lib/utils'
import type { GraderDailySummary } from '@/services/grader/types'

// Registrar los elementos de Chart.js necesarios (idempotente si ya están)
ChartJS.register(CategoryScale, LinearScale, BarElement, ArcElement, Title, Tooltip, Legend)

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
  /** Si true, oculta el botón "Abrir dashboard completo" (útil si se embebe donde no tiene sentido navegar). */
  hideDashboardButton?: boolean
}

export function GraderTurnoDetailView({ summary, hideDashboardButton }: Props) {
  const navigate = useNavigate()

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
