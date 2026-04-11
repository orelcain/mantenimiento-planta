/**
 * Vista de análisis de período del Grader.
 *
 * Recibe un `PeriodAggregate` ya calculado y renderiza:
 *  - Row de KPIs consolidados (P0% ponderado, piezas totales, peso, tasa prod, días, turnos)
 *  - Line chart con tendencia P0% diaria y líneas de referencia warn/critical
 *  - Bar chart de distribución de calibre consolidada
 *  - Bar chart de top 10 causas P0 consolidadas
 *  - 3 cards comparativas turno día/tarde/noche
 *  - Tabla ordenable de todos los turnos del rango con botón "Ver"
 */

import { useMemo, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { Card, CardContent, CardHeader, CardTitle, Badge } from '@/components/ui'
import { Bar, Line } from 'react-chartjs-2'
import {
  Chart as ChartJS,
  CategoryScale,
  LinearScale,
  BarElement,
  PointElement,
  LineElement,
  Title,
  Tooltip,
  Legend,
  Filler,
} from 'chart.js'
import { ArrowUpDown, ExternalLink, TrendingUp, AlertTriangle, CheckCircle2 } from 'lucide-react'
import { cn } from '@/lib/utils'
import type { PeriodAggregate } from '@/services/grader/graderPeriodAggregate'

ChartJS.register(CategoryScale, LinearScale, BarElement, PointElement, LineElement, Title, Tooltip, Legend, Filler)

// ── Helpers ──────────────────────────────────────────────────────────────────

function p0Color(pct: number): string {
  if (pct >= 3.5) return 'text-red-500'
  if (pct >= 2)   return 'text-amber-500'
  return 'text-emerald-600'
}

function p0BorderClass(pct: number): string {
  if (pct >= 3.5) return 'border-red-500/30'
  if (pct >= 2)   return 'border-amber-500/30'
  return 'border-emerald-500/30'
}

function formatWeight(kg: number): string {
  if (kg >= 1000) return `${(kg / 1000).toFixed(1)} t`
  return `${kg.toFixed(0)} kg`
}

function formatNumber(n: number): string {
  return n.toLocaleString('es-CL')
}

function formatDurationH(minutes: number): string {
  const h = Math.floor(minutes / 60)
  return `${h.toLocaleString('es-CL')}h`
}

function formatShortDate(dateKey: string): string {
  const [y, m, d] = dateKey.split('-')
  return `${d}/${m}/${y?.slice(2)}`
}

function shiftShortName(shiftId: string): string {
  return shiftId.replace('Turno ', '')
}

// ── Colores de gráficos ──────────────────────────────────────────────────────

const P0_LINE_COLOR = 'rgba(59, 130, 246, 1)'
const P0_FILL_COLOR = 'rgba(59, 130, 246, 0.15)'
const WARN_LINE = 'rgba(245, 158, 11, 0.5)'
const CRITICAL_LINE = 'rgba(239, 68, 68, 0.5)'
const BAR_BLUE = 'rgba(59, 130, 246, 0.7)'
const BAR_BLUE_BORDER = 'rgba(59, 130, 246, 1)'
const BAR_AMBER = 'rgba(245, 158, 11, 0.7)'
const BAR_AMBER_BORDER = 'rgba(245, 158, 11, 1)'

// ── Componente ───────────────────────────────────────────────────────────────

type SortKey = 'dateKey' | 'shiftId' | 'totalPieces' | 'pointZeroPct' | 'totalWeightKg' | 'productionRatePerHour'
type SortDir = 'asc' | 'desc'

interface Props {
  data: PeriodAggregate
}

export function GraderPeriodView({ data }: Props) {
  const navigate = useNavigate()
  const [sortKey, setSortKey] = useState<SortKey>('dateKey')
  const [sortDir, setSortDir] = useState<SortDir>('asc')

  const { stats, dailyP0Series, shiftBreakdown, calibreDistribution, topP0Causes, shifts, range } = data

  // ── Chart: tendencia P0% diaria ──────────────────────────────────────────
  const trendChartData = useMemo(() => {
    if (dailyP0Series.length === 0) return null
    return {
      labels: dailyP0Series.map((d) => formatShortDate(d.dateKey)),
      datasets: [
        {
          label: 'P0% diario',
          data: dailyP0Series.map((d) => d.p0Pct),
          borderColor: P0_LINE_COLOR,
          backgroundColor: P0_FILL_COLOR,
          fill: true,
          tension: 0.2,
          pointRadius: dailyP0Series.length > 60 ? 1 : 3,
          pointHoverRadius: 5,
        },
      ],
    }
  }, [dailyP0Series])

  const trendChartOptions = useMemo(() => ({
    responsive: true,
    maintainAspectRatio: false,
    interaction: { mode: 'index' as const, intersect: false },
    onHover: (event: any, chartElement: any[]) => {
      const target = event?.native?.target as HTMLElement | undefined
      if (target) target.style.cursor = chartElement.length > 0 ? 'pointer' : 'default'
    },
    onClick: (_event: any, elements: any[]) => {
      if (!elements || elements.length === 0) return
      const idx = elements[0].index
      const entry = dailyP0Series[idx]
      if (!entry) return
      // Navegar al home con el día seleccionado en el calendario embebido
      navigate(`/analisis-grader?goto=${entry.dateKey}`)
    },
    plugins: {
      legend: { display: false },
      tooltip: {
        callbacks: {
          title: (items: any[]) => {
            if (!items[0]) return ''
            const idx = items[0].dataIndex
            const entry = dailyP0Series[idx]
            return entry ? entry.dateKey : ''
          },
          label: (ctx: any) => {
            const idx = ctx.dataIndex
            const entry = dailyP0Series[idx]
            if (!entry) return ''
            return `${entry.p0Pct}% · ${entry.totalPieces.toLocaleString('es-CL')} piezas  ·  clic para ver día`
          },
        },
      },
      annotation: undefined,
    },
    scales: {
      y: {
        beginAtZero: true,
        ticks: { callback: (v: any) => `${v}%` },
      },
      x: {
        ticks: {
          maxRotation: 50,
          minRotation: 0,
          autoSkip: true,
          maxTicksLimit: 20,
        },
      },
    },
  }), [dailyP0Series, navigate])

  // ── Chart: calibre consolidado (top 8 horizontal) ────────────────────────
  const calibreChartData = useMemo(() => {
    if (calibreDistribution.length === 0) return null
    const top = calibreDistribution.slice(0, 8)
    return {
      labels: top.map((d) => d.key),
      datasets: [{
        label: 'Piezas',
        data: top.map((d) => d.pieces),
        backgroundColor: BAR_BLUE,
        borderColor: BAR_BLUE_BORDER,
        borderWidth: 1,
      }],
    }
  }, [calibreDistribution])

  // ── Chart: top causas P0 ─────────────────────────────────────────────────
  const causesChartData = useMemo(() => {
    if (topP0Causes.length === 0) return null
    return {
      labels: topP0Causes.map((c) => c.error),
      datasets: [{
        label: 'Piezas P0',
        data: topP0Causes.map((c) => c.pieces),
        backgroundColor: BAR_AMBER,
        borderColor: BAR_AMBER_BORDER,
        borderWidth: 1,
      }],
    }
  }, [topP0Causes])

  // ── Tabla ordenable ──────────────────────────────────────────────────────
  const sortedShifts = useMemo(() => {
    const arr = [...shifts]
    arr.sort((a, b) => {
      const aVal = a[sortKey] as number | string | undefined
      const bVal = b[sortKey] as number | string | undefined
      if (aVal == null && bVal == null) return 0
      if (aVal == null) return 1
      if (bVal == null) return -1
      const cmp = aVal < bVal ? -1 : aVal > bVal ? 1 : 0
      return sortDir === 'asc' ? cmp : -cmp
    })
    return arr
  }, [shifts, sortKey, sortDir])

  const toggleSort = (key: SortKey) => {
    if (sortKey === key) {
      setSortDir(sortDir === 'asc' ? 'desc' : 'asc')
    } else {
      setSortKey(key)
      setSortDir(key === 'dateKey' ? 'asc' : 'desc')
    }
  }

  // ── Estado vacío ─────────────────────────────────────────────────────────
  if (shifts.length === 0) {
    return (
      <Card>
        <CardContent className="pt-10 pb-10 text-center space-y-2">
          <AlertTriangle className="h-8 w-8 text-muted-foreground mx-auto" />
          <p className="text-sm font-medium">No hay turnos guardados en este rango.</p>
          <p className="text-xs text-muted-foreground">
            {range.label} ({range.start} → {range.end})
          </p>
        </CardContent>
      </Card>
    )
  }

  // ── Render ───────────────────────────────────────────────────────────────
  return (
    <div className="space-y-4">
      {/* ── Header del rango ──────────────────────────────────────────────── */}
      <Card className={cn('border-l-4', p0BorderClass(stats.p0PctWeighted))}>
        <CardContent className="pt-4 pb-4">
          <div className="flex items-start justify-between flex-wrap gap-3">
            <div>
              <p className="text-xs font-medium text-muted-foreground uppercase tracking-wide">
                Período analizado
              </p>
              <h2 className="text-lg font-bold mt-0.5">{range.label}</h2>
              <p className="text-xs text-muted-foreground mt-0.5">
                {range.start} → {range.end} · {stats.daysCount} días · {stats.shiftsCount} turnos
              </p>
            </div>
            <div className="text-right">
              <p className="text-[10px] text-muted-foreground uppercase tracking-wide">P0% ponderado</p>
              <p className={cn('text-4xl font-bold tabular-nums', p0Color(stats.p0PctWeighted))}>
                {stats.p0PctWeighted}%
              </p>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* ── KPIs row ─────────────────────────────────────────────────────── */}
      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-3">
        <Card>
          <CardContent className="pt-4 pb-3 text-center">
            <p className="text-[10px] font-medium text-muted-foreground uppercase tracking-wider">Piezas</p>
            <p className="text-xl font-bold tabular-nums mt-0.5">
              {stats.totalPieces >= 1e6
                ? `${(stats.totalPieces / 1e6).toFixed(1)}M`
                : `${(stats.totalPieces / 1e3).toFixed(1)}k`}
            </p>
            <p className="text-[9px] text-muted-foreground mt-0.5">{formatNumber(stats.totalPieces)}</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-4 pb-3 text-center">
            <p className="text-[10px] font-medium text-muted-foreground uppercase tracking-wider">P0 piezas</p>
            <p className={cn('text-xl font-bold tabular-nums mt-0.5', p0Color(stats.p0PctWeighted))}>
              {(stats.totalP0Pieces / 1e3).toFixed(1)}k
            </p>
            <p className="text-[9px] text-muted-foreground mt-0.5">{formatNumber(stats.totalP0Pieces)}</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-4 pb-3 text-center">
            <p className="text-[10px] font-medium text-muted-foreground uppercase tracking-wider">Peso total</p>
            <p className="text-xl font-bold tabular-nums mt-0.5">
              {formatWeight(stats.totalWeightKg)}
            </p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-4 pb-3 text-center">
            <p className="text-[10px] font-medium text-muted-foreground uppercase tracking-wider">Tasa promedio</p>
            <p className="text-xl font-bold tabular-nums mt-0.5">
              {formatNumber(stats.avgProductionRatePerHour)}
            </p>
            <p className="text-[9px] text-muted-foreground mt-0.5">pz/hora</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-4 pb-3 text-center">
            <p className="text-[10px] font-medium text-muted-foreground uppercase tracking-wider">Duración total</p>
            <p className="text-xl font-bold tabular-nums mt-0.5">
              {formatDurationH(stats.totalDurationMinutes)}
            </p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-4 pb-3 text-center">
            <p className="text-[10px] font-medium text-muted-foreground uppercase tracking-wider">Días · Turnos</p>
            <p className="text-xl font-bold tabular-nums mt-0.5">
              {stats.daysCount} · {stats.shiftsCount}
            </p>
          </CardContent>
        </Card>
      </div>

      {/* ── Min/Max P0 del período ───────────────────────────────────────── */}
      {(stats.minP0Day || stats.maxP0Day) && (
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          {stats.minP0Day && (
            <Card
              className="border-emerald-500/30 bg-emerald-500/5 cursor-pointer hover:bg-emerald-500/10 transition-colors"
              onClick={() => navigate(`/analisis-grader?goto=${stats.minP0Day!.dateKey}`)}
            >
              <CardContent className="pt-3 pb-3 flex items-center justify-between gap-3">
                <div className="flex items-center gap-2">
                  <CheckCircle2 className="h-5 w-5 text-emerald-500 shrink-0" />
                  <div>
                    <p className="text-[10px] uppercase tracking-wide text-muted-foreground">Mejor día</p>
                    <p className="text-sm font-semibold">{stats.minP0Day.dateKey}</p>
                  </div>
                </div>
                <p className="text-2xl font-bold tabular-nums text-emerald-600">
                  {stats.minP0Day.p0Pct}%
                </p>
              </CardContent>
            </Card>
          )}
          {stats.maxP0Day && (
            <Card
              className="border-red-500/30 bg-red-500/5 cursor-pointer hover:bg-red-500/10 transition-colors"
              onClick={() => navigate(`/analisis-grader?goto=${stats.maxP0Day!.dateKey}`)}
            >
              <CardContent className="pt-3 pb-3 flex items-center justify-between gap-3">
                <div className="flex items-center gap-2">
                  <AlertTriangle className="h-5 w-5 text-red-500 shrink-0" />
                  <div>
                    <p className="text-[10px] uppercase tracking-wide text-muted-foreground">Peor día</p>
                    <p className="text-sm font-semibold">{stats.maxP0Day.dateKey}</p>
                  </div>
                </div>
                <p className="text-2xl font-bold tabular-nums text-red-500">
                  {stats.maxP0Day.p0Pct}%
                </p>
              </CardContent>
            </Card>
          )}
        </div>
      )}

      {/* ── Tendencia P0% diaria ─────────────────────────────────────────── */}
      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-base flex items-center gap-2">
            <TrendingUp className="h-4 w-4" />
            Tendencia P0% diaria
          </CardTitle>
        </CardHeader>
        <CardContent>
          {trendChartData ? (
            <div className="h-72">
              <Line data={trendChartData} options={trendChartOptions as any} />
            </div>
          ) : (
            <p className="text-xs text-muted-foreground py-8 text-center">Sin datos diarios</p>
          )}
          <div className="flex items-center gap-4 mt-2 text-[10px] text-muted-foreground">
            <span className="flex items-center gap-1">
              <span className="inline-block w-3 h-0.5" style={{ background: WARN_LINE }} /> Warn ≥2%
            </span>
            <span className="flex items-center gap-1">
              <span className="inline-block w-3 h-0.5" style={{ background: CRITICAL_LINE }} /> Critical ≥3.5%
            </span>
          </div>
        </CardContent>
      </Card>

      {/* ── Grid 2 col: Calibre + Causas P0 ──────────────────────────────── */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        {/* Calibre consolidado */}
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-base">Distribución por Calibre (consolidada)</CardTitle>
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
                            const entry = calibreDistribution[ctx.dataIndex]
                            if (!entry) return ''
                            return `${formatNumber(entry.pieces)} piezas · ${entry.pct}%`
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
              <p className="text-xs text-muted-foreground py-8 text-center">Sin datos</p>
            )}
          </CardContent>
        </Card>

        {/* Top causas P0 */}
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-base">Top causas P0 (consolidadas)</CardTitle>
          </CardHeader>
          <CardContent>
            {causesChartData ? (
              <div className="h-64">
                <Bar
                  data={causesChartData}
                  options={{
                    indexAxis: 'y' as const,
                    responsive: true,
                    maintainAspectRatio: false,
                    plugins: {
                      legend: { display: false },
                      tooltip: {
                        callbacks: {
                          label: (ctx) => {
                            const entry = topP0Causes[ctx.dataIndex]
                            if (!entry) return ''
                            return `${formatNumber(entry.pieces)} piezas · ${entry.pct}%`
                          },
                        },
                      },
                    },
                    scales: {
                      x: { ticks: { callback: (v) => Number(v).toLocaleString('es-CL') } },
                      y: { ticks: { font: { size: 10 } } },
                    },
                  }}
                />
              </div>
            ) : (
              <p className="text-xs text-muted-foreground py-8 text-center">Sin datos</p>
            )}
          </CardContent>
        </Card>
      </div>

      {/* ── Comparativa de turnos ─────────────────────────────────────────── */}
      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-base">Comparativa por Turno</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
            {shiftBreakdown.map((g) => (
              <div
                key={g.shiftId}
                className={cn(
                  'rounded-lg border px-4 py-3',
                  p0BorderClass(g.p0PctWeighted),
                )}
              >
                <div className="flex items-start justify-between">
                  <div>
                    <p className="text-sm font-semibold">{g.shiftId}</p>
                    <p className="text-[10px] text-muted-foreground">
                      {g.count} turno{g.count !== 1 ? 's' : ''}
                    </p>
                  </div>
                  <p className={cn('text-2xl font-bold tabular-nums', p0Color(g.p0PctWeighted))}>
                    {g.p0PctWeighted}%
                  </p>
                </div>
                <div className="grid grid-cols-2 gap-2 mt-3 text-xs">
                  <div className="rounded bg-background/60 px-2 py-1">
                    <p className="text-muted-foreground">Piezas</p>
                    <p className="font-semibold">{formatNumber(g.totalPieces)}</p>
                  </div>
                  <div className="rounded bg-background/60 px-2 py-1">
                    <p className="text-muted-foreground">P0 pz</p>
                    <p className="font-semibold">{formatNumber(g.totalP0Pieces)}</p>
                  </div>
                </div>
              </div>
            ))}
          </div>
        </CardContent>
      </Card>

      {/* ── Tabla ordenable de turnos ────────────────────────────────────── */}
      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-base">Turnos del período</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="overflow-x-auto -mx-4 sm:mx-0">
            <table className="w-full text-xs">
              <thead>
                <tr className="border-b bg-muted/30">
                  <th className="text-left px-3 py-2 font-medium text-muted-foreground">
                    <button onClick={() => toggleSort('dateKey')} className="flex items-center gap-1 hover:text-foreground">
                      Fecha <ArrowUpDown className="h-3 w-3" />
                    </button>
                  </th>
                  <th className="text-left px-3 py-2 font-medium text-muted-foreground">
                    <button onClick={() => toggleSort('shiftId')} className="flex items-center gap-1 hover:text-foreground">
                      Turno <ArrowUpDown className="h-3 w-3" />
                    </button>
                  </th>
                  <th className="text-right px-3 py-2 font-medium text-muted-foreground">
                    <button onClick={() => toggleSort('totalPieces')} className="flex items-center gap-1 hover:text-foreground ml-auto">
                      Piezas <ArrowUpDown className="h-3 w-3" />
                    </button>
                  </th>
                  <th className="text-right px-3 py-2 font-medium text-muted-foreground">
                    <button onClick={() => toggleSort('pointZeroPct')} className="flex items-center gap-1 hover:text-foreground ml-auto">
                      P0% <ArrowUpDown className="h-3 w-3" />
                    </button>
                  </th>
                  <th className="text-right px-3 py-2 font-medium text-muted-foreground">
                    <button onClick={() => toggleSort('totalWeightKg')} className="flex items-center gap-1 hover:text-foreground ml-auto">
                      Peso <ArrowUpDown className="h-3 w-3" />
                    </button>
                  </th>
                  <th className="text-right px-3 py-2 font-medium text-muted-foreground">
                    <button onClick={() => toggleSort('productionRatePerHour')} className="flex items-center gap-1 hover:text-foreground ml-auto">
                      pz/h <ArrowUpDown className="h-3 w-3" />
                    </button>
                  </th>
                  <th className="px-3 py-2" />
                </tr>
              </thead>
              <tbody>
                {sortedShifts.map((s) => (
                  <tr key={s.id} className="border-b last:border-0 hover:bg-muted/20 transition-colors">
                    <td className="px-3 py-2 tabular-nums font-medium">{formatShortDate(s.dateKey)}</td>
                    <td className="px-3 py-2">
                      <Badge
                        variant="outline"
                        className={cn(
                          'text-[10px]',
                          s.shiftId === 'Turno día'   && 'border-amber-500/40 text-amber-600',
                          s.shiftId === 'Turno noche' && 'border-indigo-500/40 text-indigo-600',
                        )}
                      >
                        {shiftShortName(s.shiftId)}
                      </Badge>
                    </td>
                    <td className="px-3 py-2 text-right tabular-nums">{formatNumber(s.totalPieces)}</td>
                    <td className={cn('px-3 py-2 text-right tabular-nums font-semibold', p0Color(s.pointZeroPct))}>
                      {s.pointZeroPct}%
                    </td>
                    <td className="px-3 py-2 text-right tabular-nums text-muted-foreground">
                      {s.totalWeightKg != null ? formatWeight(s.totalWeightKg) : '—'}
                    </td>
                    <td className="px-3 py-2 text-right tabular-nums text-muted-foreground">
                      {s.productionRatePerHour != null ? formatNumber(s.productionRatePerHour) : '—'}
                    </td>
                    <td className="px-3 py-2">
                      <button
                        type="button"
                        onClick={() => navigate(`/analisis-grader/detalle?date=${s.dateKey}&shift=${encodeURIComponent(s.shiftId)}`)}
                        className="text-primary hover:underline text-[11px] flex items-center gap-1"
                      >
                        Ver <ExternalLink className="h-3 w-3" />
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <p className="text-[10px] text-muted-foreground mt-2 text-right">
            {sortedShifts.length} turnos mostrados
          </p>
        </CardContent>
      </Card>
    </div>
  )
}
