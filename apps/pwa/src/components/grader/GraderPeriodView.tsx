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

import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
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
import zoomPlugin from 'chartjs-plugin-zoom'
import { ArrowUpDown, ExternalLink, TrendingUp, AlertTriangle, CheckCircle2, RotateCcw, Clock, Download } from 'lucide-react'
import { cn } from '@/lib/utils'
import type { PeriodAggregate, PeriodStats } from '@/services/grader/graderPeriodAggregate'
import { computeStatsFromSummaries } from '@/services/grader/graderPeriodAggregate'
import type { GraderDailySummary } from '@/services/grader/types'

ChartJS.register(CategoryScale, LinearScale, BarElement, PointElement, LineElement, Title, Tooltip, Legend, Filler, zoomPlugin)

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

function formatNumber(n: number | undefined | null): string {
  if (n == null) return '—'
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

function exportToCSV(shifts: GraderDailySummary[], rangeLabel: string): void {
  const header = ['Fecha', 'Turno', 'Piezas', 'P0 piezas', 'P0%', 'Peso kg', 'Tasa pz/h', 'Duracion min']
  const rows = shifts.map((s) => [
    s.dateKey,
    s.shiftId,
    s.totalPieces,
    s.pointZeroPieces,
    s.pointZeroPct,
    s.totalWeightKg ?? '',
    s.productionRatePerHour ?? '',
    s.durationMinutes ?? '',
  ])
  const csv = [header, ...rows].map((r) => r.join(',')).join('\n')
  const blob = new Blob(['\ufeff' + csv], { type: 'text/csv;charset=utf-8;' })
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = `grader-${rangeLabel.replace(/[^a-zA-Z0-9-]/g, '-').toLowerCase()}.csv`
  a.click()
  URL.revokeObjectURL(url)
}

function shiftShortName(shiftId: string): string {
  return shiftId.replace('Turno ', '')
}

// ── Colores de gráficos ──────────────────────────────────────────────────────

// Turno día = ámbar (asociado al sol), turno noche = índigo (asociado a la noche)
const DIA_LINE_COLOR = 'rgba(251, 191, 36, 1)'
const DIA_FILL_COLOR = 'rgba(251, 191, 36, 0.12)'
const NOCHE_LINE_COLOR = 'rgba(129, 140, 248, 1)'
const NOCHE_FILL_COLOR = 'rgba(129, 140, 248, 0.12)'
const WARN_LINE = 'rgba(245, 158, 11, 0.5)'
const CRITICAL_LINE = 'rgba(239, 68, 68, 0.5)'
const BAR_BLUE = 'rgba(59, 130, 246, 0.7)'
const BAR_BLUE_BORDER = 'rgba(59, 130, 246, 1)'
const BAR_AMBER = 'rgba(245, 158, 11, 0.7)'
const BAR_AMBER_BORDER = 'rgba(245, 158, 11, 1)'

// ── Componente ───────────────────────────────────────────────────────────────

type SortKey = 'dateKey' | 'shiftId' | 'totalPieces' | 'pointZeroPct' | 'totalWeightKg' | 'productionRatePerHour'
type SortDir = 'asc' | 'desc'
const PAGE_SIZE = 25

interface Props {
  data: PeriodAggregate
}

export function GraderPeriodView({ data }: Props) {
  const navigate = useNavigate()
  const [sortKey, setSortKey] = useState<SortKey>('dateKey')
  const [sortDir, setSortDir] = useState<SortDir>('asc')
  const [page, setPage] = useState(0)
  const trendChartRef = useRef<any>(null)

  // Rango visible del chart tras zoom/pan (null = rango completo)
  const [visibleIdxRange, setVisibleIdxRange] = useState<{ start: number; end: number } | null>(null)

  const { stats, dailyP0Series, hourlySeries, shiftBreakdown, calibreDistribution, topP0Causes, shifts, range } = data

  // Reset de zoom cuando cambia el rango del padre (nuevo preset)
  useEffect(() => {
    setVisibleIdxRange(null)
  }, [range.start, range.end, range.label])

  const updateVisibleRange = useCallback(() => {
    const chart = trendChartRef.current
    if (!chart) return
    const scale = chart.scales?.x
    if (!scale) return
    const rawMin = typeof scale.min === 'number' ? scale.min : 0
    const rawMax = typeof scale.max === 'number' ? scale.max : dailyP0Series.length - 1
    const start = Math.max(0, Math.round(rawMin))
    const end = Math.min(dailyP0Series.length - 1, Math.round(rawMax))
    if (start <= 0 && end >= dailyP0Series.length - 1) {
      setVisibleIdxRange(null)
    } else {
      setVisibleIdxRange({ start, end })
    }
  }, [dailyP0Series.length])

  // Summaries filtrados al rango visible (para KPIs dinámicos)
  const visibleSummaries = useMemo(() => {
    if (!visibleIdxRange) return shifts
    const startDate = dailyP0Series[visibleIdxRange.start]?.dateKey
    const endDate = dailyP0Series[visibleIdxRange.end]?.dateKey
    if (!startDate || !endDate) return shifts
    return shifts.filter((s) => s.dateKey >= startDate && s.dateKey <= endDate)
  }, [shifts, dailyP0Series, visibleIdxRange])

  // Stats recalculados al rango visible (o los originales si no hay zoom)
  const visibleStats: PeriodStats = useMemo(() => {
    if (!visibleIdxRange) return stats
    return computeStatsFromSummaries(visibleSummaries)
  }, [stats, visibleSummaries, visibleIdxRange])

  // Días visibles tras zoom (para decidir drill-down hourly)
  const visibleDaysSpan = visibleIdxRange
    ? visibleIdxRange.end - visibleIdxRange.start + 1
    : dailyP0Series.length

  // Activar drill-down cuando zoom ≤ 2 días Y hay hourlyBuckets en esos días
  const hourlyFiltered = useMemo(() => {
    if (!visibleIdxRange || visibleDaysSpan > 2 || hourlySeries.length === 0) return []
    const startDate = dailyP0Series[visibleIdxRange.start]?.dateKey
    const endDate = dailyP0Series[visibleIdxRange.end]?.dateKey
    if (!startDate || !endDate) return []
    return hourlySeries.filter((h) => h.dateKey >= startDate && h.dateKey <= endDate)
  }, [visibleIdxRange, visibleDaysSpan, hourlySeries, dailyP0Series])

  const useHourlyView = hourlyFiltered.length > 0

  // ── Chart: tendencia P0% diaria SEPARADA por turno día/noche ─────────────
  const trendChartData = useMemo(() => {
    if (dailyP0Series.length === 0) return null
    const isMobile = typeof window !== 'undefined' && window.innerWidth < 768
    const showPoints = dailyP0Series.length <= 60

    // Media móvil 7 días — promedio de todos los turnos (día + noche) por ventana
    const rolling7: (number | null)[] = dailyP0Series.map((_, i) => {
      const window7 = dailyP0Series.slice(Math.max(0, i - 6), i + 1)
      const vals = window7.flatMap((d) => [d.dia?.p0Pct, d.noche?.p0Pct].filter((v): v is number => v != null))
      return vals.length > 0 ? Math.round((vals.reduce((a, b) => a + b, 0) / vals.length) * 100) / 100 : null
    })

    return {
      labels: dailyP0Series.map((d) => formatShortDate(d.dateKey)),
      datasets: [
        {
          label: 'Turno día',
          data: dailyP0Series.map((d) => d.dia ? d.dia.p0Pct : null),
          borderColor: DIA_LINE_COLOR,
          backgroundColor: DIA_FILL_COLOR,
          borderWidth: isMobile ? 1.5 : 2,
          fill: false,
          tension: 0.2,
          pointRadius: showPoints ? (isMobile ? 2 : 3) : 0,
          pointHoverRadius: 4,
          spanGaps: true,
          order: 2,
        },
        {
          label: 'Turno noche',
          data: dailyP0Series.map((d) => d.noche ? d.noche.p0Pct : null),
          borderColor: NOCHE_LINE_COLOR,
          backgroundColor: NOCHE_FILL_COLOR,
          borderWidth: isMobile ? 1.5 : 2,
          fill: false,
          tension: 0.2,
          pointRadius: showPoints ? (isMobile ? 2 : 3) : 0,
          pointHoverRadius: 4,
          spanGaps: true,
          order: 2,
        },
        ...(dailyP0Series.length > 14 ? [{
          label: 'Media 7d',
          data: rolling7,
          borderColor: 'rgba(156, 163, 175, 0.9)',
          backgroundColor: 'transparent',
          borderWidth: 2,
          borderDash: [5, 3],
          fill: false,
          tension: 0.4,
          pointRadius: 0,
          pointHoverRadius: 3,
          spanGaps: true,
          order: 1,
        }] : []),
      ],
    }
  }, [dailyP0Series])

  const trendChartOptions = useMemo(() => ({
    responsive: true,
    maintainAspectRatio: false,
    interaction: { mode: 'nearest' as const, intersect: false, axis: 'x' as const },
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
      legend: {
        display: true,
        position: 'top' as const,
        labels: { font: { size: 11 }, usePointStyle: true, boxWidth: 10 },
      },
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
            const isDia = ctx.datasetIndex === 0
            const shift = isDia ? entry.dia : entry.noche
            if (!shift) return `${ctx.dataset.label}: sin datos`
            return `${ctx.dataset.label}: ${shift.p0Pct}% · ${shift.totalPieces.toLocaleString('es-CL')} pz`
          },
          afterBody: () => 'clic para ver día en calendario',
        },
      },
      zoom: {
        pan: {
          enabled: true,
          mode: 'x' as const,
          modifierKey: undefined,
          onPanComplete: () => updateVisibleRange(),
        },
        zoom: {
          wheel: { enabled: true, speed: 0.1 },
          pinch: { enabled: true },
          drag: { enabled: false },
          mode: 'x' as const,
          onZoomComplete: () => updateVisibleRange(),
        },
        limits: {
          x: { min: 'original' as const, max: 'original' as const, minRange: 1 },
        },
      },
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
  }), [dailyP0Series, navigate, updateVisibleRange])

  // ── Chart hourly (drill-down cuando zoom ≤ 2 días) ───────────────────────
  const hourlyChartData = useMemo(() => {
    if (!useHourlyView) return null
    return {
      labels: hourlyFiltered.map((h) => h.label),
      datasets: [
        {
          label: 'P0% por hora',
          data: hourlyFiltered.map((h) => h.p0Pct),
          borderColor: 'rgba(168, 85, 247, 1)',
          backgroundColor: 'rgba(168, 85, 247, 0.15)',
          borderWidth: typeof window !== 'undefined' && window.innerWidth < 768 ? 1.5 : 2,
          fill: true,
          tension: 0.25,
          pointRadius: typeof window !== 'undefined' && window.innerWidth < 768 ? 3 : 4,
          pointHoverRadius: 5,
          pointBackgroundColor: hourlyFiltered.map((h) =>
            h.shiftId === 'Turno día' ? DIA_LINE_COLOR : NOCHE_LINE_COLOR,
          ),
          pointBorderColor: hourlyFiltered.map((h) =>
            h.shiftId === 'Turno día' ? DIA_LINE_COLOR : NOCHE_LINE_COLOR,
          ),
        },
      ],
    }
  }, [useHourlyView, hourlyFiltered])

  const hourlyChartOptions = useMemo(() => ({
    responsive: true,
    maintainAspectRatio: false,
    interaction: { mode: 'nearest' as const, intersect: false, axis: 'x' as const },
    plugins: {
      legend: { display: false },
      tooltip: {
        callbacks: {
          title: (items: any[]) => {
            const idx = items[0]?.dataIndex
            const entry = typeof idx === 'number' ? hourlyFiltered[idx] : undefined
            return entry ? `${entry.dateKey} · ${entry.hour.toString().padStart(2, '0')}:00 - ${entry.hour.toString().padStart(2, '0')}:59 · ${entry.shiftId}` : ''
          },
          label: (ctx: any) => {
            const entry = hourlyFiltered[ctx.dataIndex]
            if (!entry) return ''
            return `P0%: ${entry.p0Pct}% · ${entry.totalPieces.toLocaleString('es-CL')} piezas · P0: ${entry.p0Pieces.toLocaleString('es-CL')} piezas`
          },
          afterLabel: () => 'Detalle minuto a minuto requiere cargar Excel del turno',
        },
      },
      zoom: {
        pan: { enabled: true, mode: 'x' as const },
        zoom: {
          wheel: { enabled: true, speed: 0.1 },
          pinch: { enabled: true },
          drag: { enabled: false },
          mode: 'x' as const,
        },
        limits: {
          x: { min: 'original' as const, max: 'original' as const, minRange: 1 },
        },
      },
    },
    scales: {
      y: {
        beginAtZero: true,
        ticks: { callback: (v: any) => `${v}%` },
      },
      x: {
        ticks: {
          maxRotation: 50,
          minRotation: 20,
          autoSkip: true,
          maxTicksLimit: typeof window !== 'undefined' && window.innerWidth < 768 ? 8 : 16,
          font: { size: typeof window !== 'undefined' && window.innerWidth < 768 ? 9 : 10 },
        },
      },
    },
  }), [hourlyFiltered])

  const handleResetZoom = () => {
    trendChartRef.current?.resetZoom?.()
    setVisibleIdxRange(null)
  }

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

  const totalPages = Math.ceil(sortedShifts.length / PAGE_SIZE)
  const pagedShifts = sortedShifts.slice(page * PAGE_SIZE, (page + 1) * PAGE_SIZE)

  const toggleSort = (key: SortKey) => {
    if (sortKey === key) {
      setSortDir(sortDir === 'asc' ? 'desc' : 'asc')
    } else {
      setSortKey(key)
      setSortDir(key === 'dateKey' ? 'asc' : 'desc')
    }
    setPage(0)
  }

  // Rango visible en fechas legibles (para el badge del header)
  // Debe declararse ANTES del early return para respetar rules of hooks.
  const visibleRangeLabel = useMemo(() => {
    if (!visibleIdxRange) return null
    const startDate = dailyP0Series[visibleIdxRange.start]?.dateKey
    const endDate = dailyP0Series[visibleIdxRange.end]?.dateKey
    if (!startDate || !endDate) return null
    return startDate === endDate ? startDate : `${startDate} → ${endDate}`
  }, [visibleIdxRange, dailyP0Series])

  // ── Insights automáticos ─────────────────────────────────────────────────
  const insights = useMemo(() => {
    if (dailyP0Series.length < 7) return null
    const avg = (arr: number[]) =>
      arr.length > 0 ? arr.reduce((a, b) => a + b, 0) / arr.length : 0

    // Tendencia: primera semana vs última semana del período
    const firstAvg = avg(dailyP0Series.slice(0, 7).map((d) => d.p0Pct))
    const lastAvg = avg(dailyP0Series.slice(-7).map((d) => d.p0Pct))
    const delta = Math.round((lastAvg - firstAvg) * 100) / 100
    const trendDir: 'better' | 'worse' | 'stable' =
      delta < -0.3 ? 'better' : delta > 0.3 ? 'worse' : 'stable'

    // Días críticos (P0% >= 3.5%) y racha máxima consecutiva
    let criticalCount = 0
    let maxStreak = 0
    let streak = 0
    for (const d of dailyP0Series) {
      if (d.p0Pct >= 3.5) {
        criticalCount++
        streak++
        if (streak > maxStreak) maxStreak = streak
      } else {
        streak = 0
      }
    }

    // Promedio P0% por tipo de turno
    const diaVals = dailyP0Series.flatMap((d) => (d.dia ? [d.dia.p0Pct] : []))
    const nocheVals = dailyP0Series.flatMap((d) => (d.noche ? [d.noche.p0Pct] : []))
    const diaAvg = diaVals.length > 0 ? Math.round(avg(diaVals) * 100) / 100 : null
    const nocheAvg = nocheVals.length > 0 ? Math.round(avg(nocheVals) * 100) / 100 : null

    // Semana de 7 días consecutivos con menor P0% promedio
    let bestWeekStart = ''
    let bestWeekAvg = Infinity
    for (let i = 0; i <= dailyP0Series.length - 7; i++) {
      const wAvg = avg(dailyP0Series.slice(i, i + 7).map((d) => d.p0Pct))
      if (wAvg < bestWeekAvg) {
        bestWeekAvg = wAvg
        bestWeekStart = dailyP0Series[i]?.dateKey ?? ''
      }
    }

    return {
      trendDir,
      firstAvg: Math.round(firstAvg * 100) / 100,
      lastAvg: Math.round(lastAvg * 100) / 100,
      delta,
      criticalCount,
      criticalPct: Math.round((criticalCount / dailyP0Series.length) * 100),
      maxStreak,
      diaAvg,
      nocheAvg,
      bestWeekStart,
      bestWeekAvg: Math.round(bestWeekAvg * 100) / 100,
      totalDays: dailyP0Series.length,
    }
  }, [dailyP0Series])

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
      <Card className={cn('border-l-4', p0BorderClass(visibleStats.p0PctWeighted))}>
        <CardContent className="pt-4 pb-4">
          <div className="flex items-start justify-between flex-wrap gap-3">
            <div className="min-w-0">
              <p className="text-xs font-medium text-muted-foreground uppercase tracking-wide">
                Período analizado
              </p>
              <h2 className="text-lg font-bold mt-0.5">{range.label}</h2>
              <p className="text-xs text-muted-foreground mt-0.5">
                {range.start} → {range.end} · {stats.daysCount} días · {stats.shiftsCount} turnos
              </p>
              {visibleRangeLabel && (
                <div className="mt-1.5 flex items-center gap-1.5 flex-wrap">
                  <Badge variant="outline" className="text-[10px] border-purple-500/40 text-purple-600 dark:text-purple-400">
                    🔍 Filtrado a zoom: {visibleRangeLabel}
                  </Badge>
                  <span className="text-[10px] text-muted-foreground">
                    {visibleStats.daysCount} día{visibleStats.daysCount !== 1 ? 's' : ''} · {visibleStats.shiftsCount} turno{visibleStats.shiftsCount !== 1 ? 's' : ''}
                  </span>
                  <button
                    type="button"
                    onClick={handleResetZoom}
                    className="text-[10px] text-purple-600 dark:text-purple-400 hover:underline"
                  >
                    limpiar
                  </button>
                </div>
              )}
            </div>
            <div className="text-right shrink-0">
              <p className="text-[10px] text-muted-foreground uppercase tracking-wide">P0% ponderado</p>
              <p className={cn('text-4xl font-bold tabular-nums', p0Color(visibleStats.p0PctWeighted))}>
                {visibleStats.p0PctWeighted}%
              </p>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* ── KPIs row (dinámicos según zoom visible) ────────────────────────── */}
      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-3">
        <Card>
          <CardContent className="pt-4 pb-3 text-center">
            <p className="text-[10px] font-medium text-muted-foreground uppercase tracking-wider">Piezas</p>
            <p className="text-xl font-bold tabular-nums mt-0.5">
              {visibleStats.totalPieces >= 1e6
                ? `${(visibleStats.totalPieces / 1e6).toFixed(1)}M`
                : `${(visibleStats.totalPieces / 1e3).toFixed(1)}k`}
            </p>
            <p className="text-[9px] text-muted-foreground mt-0.5">{formatNumber(visibleStats.totalPieces)}</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-4 pb-3 text-center">
            <p className="text-[10px] font-medium text-muted-foreground uppercase tracking-wider">P0 piezas</p>
            <p className={cn('text-xl font-bold tabular-nums mt-0.5', p0Color(visibleStats.p0PctWeighted))}>
              {(visibleStats.totalP0Pieces / 1e3).toFixed(1)}k
            </p>
            <p className="text-[9px] text-muted-foreground mt-0.5">{formatNumber(visibleStats.totalP0Pieces)}</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-4 pb-3 text-center">
            <p className="text-[10px] font-medium text-muted-foreground uppercase tracking-wider">Peso total</p>
            <p className="text-xl font-bold tabular-nums mt-0.5">
              {formatWeight(visibleStats.totalWeightKg)}
            </p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-4 pb-3 text-center">
            <p className="text-[10px] font-medium text-muted-foreground uppercase tracking-wider">Tasa promedio</p>
            <p className="text-xl font-bold tabular-nums mt-0.5">
              {formatNumber(visibleStats.avgProductionRatePerHour)}
            </p>
            <p className="text-[9px] text-muted-foreground mt-0.5">pz/hora</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-4 pb-3 text-center">
            <p className="text-[10px] font-medium text-muted-foreground uppercase tracking-wider">Duración total</p>
            <p className="text-xl font-bold tabular-nums mt-0.5">
              {formatDurationH(visibleStats.totalDurationMinutes)}
            </p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-4 pb-3 text-center">
            <p className="text-[10px] font-medium text-muted-foreground uppercase tracking-wider">Días · Turnos</p>
            <p className="text-xl font-bold tabular-nums mt-0.5">
              {visibleStats.daysCount} · {visibleStats.shiftsCount}
            </p>
          </CardContent>
        </Card>
      </div>

      {/* ── Min/Max P0 del período (dinámicos según zoom) ──────────────────── */}
      {(visibleStats.minP0Day || visibleStats.maxP0Day) && (
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          {visibleStats.minP0Day && (
            <Card
              className="border-emerald-500/30 bg-emerald-500/5 cursor-pointer hover:bg-emerald-500/10 transition-colors"
              onClick={() => navigate(`/analisis-grader?goto=${visibleStats.minP0Day!.dateKey}`)}
            >
              <CardContent className="pt-3 pb-3 flex items-center justify-between gap-3">
                <div className="flex items-center gap-2">
                  <CheckCircle2 className="h-5 w-5 text-emerald-500 shrink-0" />
                  <div>
                    <p className="text-[10px] uppercase tracking-wide text-muted-foreground">Mejor día</p>
                    <p className="text-sm font-semibold">{visibleStats.minP0Day.dateKey}</p>
                  </div>
                </div>
                <p className="text-2xl font-bold tabular-nums text-emerald-600">
                  {visibleStats.minP0Day.p0Pct}%
                </p>
              </CardContent>
            </Card>
          )}
          {visibleStats.maxP0Day && (
            <Card
              className="border-red-500/30 bg-red-500/5 cursor-pointer hover:bg-red-500/10 transition-colors"
              onClick={() => navigate(`/analisis-grader?goto=${visibleStats.maxP0Day!.dateKey}`)}
            >
              <CardContent className="pt-3 pb-3 flex items-center justify-between gap-3">
                <div className="flex items-center gap-2">
                  <AlertTriangle className="h-5 w-5 text-red-500 shrink-0" />
                  <div>
                    <p className="text-[10px] uppercase tracking-wide text-muted-foreground">Peor día</p>
                    <p className="text-sm font-semibold">{visibleStats.maxP0Day.dateKey}</p>
                  </div>
                </div>
                <p className="text-2xl font-bold tabular-nums text-red-500">
                  {visibleStats.maxP0Day.p0Pct}%
                </p>
              </CardContent>
            </Card>
          )}
        </div>
      )}

      {/* ── Panel de insights automáticos ───────────────────────────────── */}
      {insights && (
        <Card className="border-blue-500/20 bg-blue-500/5">
          <CardHeader className="pb-1">
            <CardTitle className="text-sm text-blue-600 dark:text-blue-400 flex items-center gap-2">
              <TrendingUp className="h-4 w-4" />
              Insights automáticos · {insights.totalDays} días analizados
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 text-xs">
              {/* Tendencia */}
              <div className="rounded-lg border border-border/50 bg-background/60 px-3 py-2">
                <p className="text-[10px] text-muted-foreground uppercase tracking-wider mb-1">Tendencia período</p>
                <p className={cn(
                  'font-semibold text-sm',
                  insights.trendDir === 'better' && 'text-emerald-600',
                  insights.trendDir === 'worse'  && 'text-red-500',
                  insights.trendDir === 'stable' && 'text-muted-foreground',
                )}>
                  {insights.trendDir === 'better' ? '↓ Mejorando' : insights.trendDir === 'worse' ? '↑ Empeorando' : '→ Estable'}
                </p>
                <p className="text-[10px] text-muted-foreground mt-0.5">
                  inicio {insights.firstAvg}% → fin {insights.lastAvg}%
                  {' '}({insights.delta > 0 ? '+' : ''}{insights.delta}pp)
                </p>
              </div>
              {/* Días críticos */}
              <div className="rounded-lg border border-border/50 bg-background/60 px-3 py-2">
                <p className="text-[10px] text-muted-foreground uppercase tracking-wider mb-1">Días críticos ≥3.5%</p>
                <p className={cn('font-semibold text-sm', insights.criticalCount > 0 ? 'text-red-500' : 'text-emerald-600')}>
                  {insights.criticalCount} / {insights.totalDays}
                </p>
                <p className="text-[10px] text-muted-foreground mt-0.5">
                  {insights.criticalPct}% del período
                  {insights.maxStreak > 1 && ` · racha máx ${insights.maxStreak}d`}
                </p>
              </div>
              {/* Día vs Noche */}
              {insights.diaAvg !== null && insights.nocheAvg !== null && (
                <div className="rounded-lg border border-border/50 bg-background/60 px-3 py-2">
                  <p className="text-[10px] text-muted-foreground uppercase tracking-wider mb-1">Día vs Noche (prom.)</p>
                  <p className="font-semibold text-sm">
                    <span className="text-amber-500">{insights.diaAvg}%</span>
                    <span className="text-muted-foreground mx-1">/</span>
                    <span className="text-indigo-400">{insights.nocheAvg}%</span>
                  </p>
                  <p className="text-[10px] text-muted-foreground mt-0.5">
                    {Math.abs(insights.diaAvg - insights.nocheAvg) < 0.2
                      ? 'Turnos parejos'
                      : insights.diaAvg < insights.nocheAvg
                        ? `Día es ${(insights.nocheAvg - insights.diaAvg).toFixed(2)}pp mejor`
                        : `Noche es ${(insights.diaAvg - insights.nocheAvg).toFixed(2)}pp mejor`}
                  </p>
                </div>
              )}
              {/* Mejor semana */}
              {insights.bestWeekStart && (
                <div className="rounded-lg border border-border/50 bg-background/60 px-3 py-2">
                  <p className="text-[10px] text-muted-foreground uppercase tracking-wider mb-1">Mejor semana</p>
                  <p className="font-semibold text-sm text-emerald-600">{insights.bestWeekAvg}% P0 prom.</p>
                  <p className="text-[10px] text-muted-foreground mt-0.5">
                    semana del {formatShortDate(insights.bestWeekStart)}
                  </p>
                </div>
              )}
            </div>
          </CardContent>
        </Card>
      )}

      {/* ── Tendencia P0% diaria ─────────────────────────────────────────── */}
      <Card>
        <CardHeader className="pb-2">
          <div className="flex items-center justify-between flex-wrap gap-2">
            <CardTitle className="text-base flex items-center gap-2">
              {useHourlyView ? (
                <>
                  <Clock className="h-4 w-4 text-purple-500" />
                  Drill-down horario · P0% por hora del día
                </>
              ) : (
                <>
                  <TrendingUp className="h-4 w-4" />
                  Tendencia P0% diaria · día vs noche
                </>
              )}
            </CardTitle>
            <div className="flex items-center gap-2 text-[10px] text-muted-foreground">
              <span>Scroll para zoom · arrastra para panear</span>
              <button
                type="button"
                onClick={handleResetZoom}
                className="inline-flex items-center gap-1 rounded border border-muted-foreground/20 px-2 py-0.5 hover:bg-muted/40 transition-colors"
              >
                <RotateCcw className="h-3 w-3" />
                Reset zoom
              </button>
            </div>
          </div>
          {useHourlyView && (
            <p className="text-[11px] text-muted-foreground mt-1">
              <Clock className="inline h-3 w-3 mr-1" />
              Vista horaria activada — {hourlyFiltered.length} horas en rango. Zoom y panea para navegar. Para detalle minuto a minuto, abre el turno con "Ver detalle".
            </p>
          )}
        </CardHeader>
        <CardContent>
          {useHourlyView && hourlyChartData ? (
            <div className="h-64 lg:h-80">
              <Line data={hourlyChartData} options={hourlyChartOptions as any} />
            </div>
          ) : trendChartData ? (
            <div className="h-64 lg:h-80">
              <Line ref={trendChartRef} data={trendChartData} options={trendChartOptions as any} />
            </div>
          ) : (
            <p className="text-xs text-muted-foreground py-8 text-center">Sin datos diarios</p>
          )}
          <div className="flex items-center gap-4 mt-2 text-[10px] text-muted-foreground flex-wrap">
            {useHourlyView ? (
              <>
                <span className="flex items-center gap-1">
                  <span className="inline-block w-2.5 h-2.5 rounded-full" style={{ background: DIA_LINE_COLOR }} /> Turno día
                </span>
                <span className="flex items-center gap-1">
                  <span className="inline-block w-2.5 h-2.5 rounded-full" style={{ background: NOCHE_LINE_COLOR }} /> Turno noche
                </span>
                <span>{hourlyFiltered.length > 0 ? `${Math.round(hourlyFiltered.reduce((a, h) => a + h.totalPieces, 0) / 1000)}k piezas en rango` : ''}</span>
              </>
            ) : (
              <>
                <span className="flex items-center gap-1">
                  <span className="inline-block w-3 h-0.5" style={{ background: WARN_LINE }} /> Warn ≥2%
                </span>
                <span className="flex items-center gap-1">
                  <span className="inline-block w-3 h-0.5" style={{ background: CRITICAL_LINE }} /> Critical ≥3.5%
                </span>
                {hourlySeries.length > 0 && (
                  <span className="text-purple-600 dark:text-purple-400">
                    💡 Haz zoom ≤ 2 días para ver drill-down horario
                  </span>
                )}
              </>
            )}
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
          <div className="flex items-center justify-between gap-2">
            <CardTitle className="text-base">Turnos del período</CardTitle>
            <button
              type="button"
              onClick={() => exportToCSV(sortedShifts, range.label)}
              className="inline-flex items-center gap-1.5 text-[11px] text-muted-foreground hover:text-foreground border border-border/50 rounded px-2 py-1 hover:bg-muted/40 transition-colors shrink-0"
            >
              <Download className="h-3 w-3" />
              Exportar CSV
            </button>
          </div>
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
                {pagedShifts.map((s) => (
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
          {totalPages > 1 && (
            <div className="flex items-center justify-between mt-3 pt-2 border-t">
              <p className="text-[11px] text-muted-foreground">
                {page * PAGE_SIZE + 1}–{Math.min((page + 1) * PAGE_SIZE, sortedShifts.length)} de {sortedShifts.length} turnos
              </p>
              <div className="flex items-center gap-1">
                <button
                  type="button"
                  onClick={() => setPage(p => Math.max(0, p - 1))}
                  disabled={page === 0}
                  className="px-2.5 py-1 rounded text-xs border border-border bg-background hover:bg-muted/50 disabled:opacity-40 disabled:cursor-not-allowed"
                >
                  ‹ Anterior
                </button>
                <span className="text-[11px] text-muted-foreground px-2">
                  {page + 1} / {totalPages}
                </span>
                <button
                  type="button"
                  onClick={() => setPage(p => Math.min(totalPages - 1, p + 1))}
                  disabled={page >= totalPages - 1}
                  className="px-2.5 py-1 rounded text-xs border border-border bg-background hover:bg-muted/50 disabled:opacity-40 disabled:cursor-not-allowed"
                >
                  Siguiente ›
                </button>
              </div>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  )
}
