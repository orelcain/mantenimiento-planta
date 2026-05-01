/**
 * Panel lateral de KPIs mensuales unificado.
 * Layout idéntico para todas las plantas — mismas secciones, mismo orden.
 * Muestra "—" cuando faltan datos (sin Excel Grader o sin Shoplogix).
 */
import { useMemo } from 'react'
import { Card, CardContent } from '@/components/ui'
import { TrendingDown, TrendingUp, AlertTriangle, BarChart3, Sun, Moon } from 'lucide-react'
import type { GraderDailySummary } from '@/services/grader/types'
import { getCauseLabel } from '@/services/grader/graderMatrixP0Causes'
import { p0StatusFromPct, p0StatusColor } from '@/services/grader/graderP0Thresholds'
import { aggregateByCalendarDay } from '@/services/grader/graderCalendarAggregation'
import { fmt, fmtDec } from '@/lib/format'
import type { SlxMonthlyStats } from './GraderHistoricalCalendar'

const MONTH_NAMES = [
  'Enero', 'Febrero', 'Marzo', 'Abril', 'Mayo', 'Junio',
  'Julio', 'Agosto', 'Septiembre', 'Octubre', 'Noviembre', 'Diciembre',
]

interface Props {
  currentMonth: Date
  summaries: GraderDailySummary[]
  slxStats?: SlxMonthlyStats | null
}

export function GraderMonthlyStatsPanel({ currentMonth, summaries, slxStats }: Props) {
  const monthLabel = `${MONTH_NAMES[currentMonth.getMonth()]} ${currentMonth.getFullYear()}`

  const stats = useMemo(() => {
    const valid = summaries.filter(s => s.totalPieces > 0)
    if (valid.length === 0) return null

    const totalPieces   = valid.reduce((s, d) => s + d.totalPieces, 0)
    const totalP0       = valid.reduce((s, d) => s + d.pointZeroPieces, 0)
    const p0Avg         = totalPieces > 0 ? (totalP0 / totalPieces) * 100 : 0
    const totalWeightKg = valid.reduce((s, d) => s + (d.totalWeightKg ?? 0), 0)

    const sorted      = [...valid].sort((a, b) => a.pointZeroPct - b.pointZeroPct)
    const bestSummary = sorted[0]!
    const worstSummary = sorted[sorted.length - 1]!

    const causaMap = new Map<string, number>()
    for (const s of valid) {
      for (const c of s.topP0Causes ?? []) {
        causaMap.set(c.error, (causaMap.get(c.error) ?? 0) + c.pieces)
      }
    }
    const topCausa = [...causaMap.entries()].sort((a, b) => b[1] - a[1])[0]?.[0] ?? null

    const calendarAgg = aggregateByCalendarDay({ summaries: valid })
    const uniqueDays  = calendarAgg.size
    const startedDays = new Set(valid.map(s => s.dateKey)).size

    const primaryDateKeyBySummary = new Map<string, string>()
    for (const day of calendarAgg.values()) {
      for (const c of day.contributingShifts) {
        if (c.isPrimary) primaryDateKeyBySummary.set(c.summaryId, c.dateKey)
      }
    }
    const enrich = (s: GraderDailySummary) => ({ ...s, primaryDateKey: primaryDateKeyBySummary.get(s.id) ?? s.dateKey })

    const dayShifts   = valid.filter(s => s.shiftId === 'Turno día').length
    const nightShifts = valid.length - dayShifts

    return {
      turnos: valid.length, uniqueDays, startedDays,
      dayShifts, nightShifts,
      totalPieces, totalWeightKg, p0Avg, topCausa,
      best:  enrich(bestSummary),
      worst: enrich(worstSummary),
    }
  }, [summaries])

  const noData = !stats && !slxStats

  if (noData) {
    return (
      <Card className="h-fit">
        <CardContent className="py-10 text-center">
          <BarChart3 className="w-8 h-8 text-muted-foreground/30 mx-auto mb-3" />
          <p className="text-sm font-medium text-muted-foreground">{monthLabel}</p>
          <p className="text-xs text-muted-foreground mt-1">Sin datos registrados</p>
        </CardContent>
      </Card>
    )
  }

  const shiftLabel = (s: GraderDailySummary) => s.shiftId === 'Turno día' ? 'Día' : 'Noche'
  const p0Color    = stats ? p0StatusColor(p0StatusFromPct(stats.p0Avg)) : 'text-muted-foreground'

  // Mejor/Peor: preferir Grader (P0%), fallback Shoplogix (uptime)
  const best = stats
    ? { value: `${fmtDec(stats.best.pointZeroPct, 2)}%`,  metric: 'P0%',   date: `${stats.best.primaryDateKey.slice(5)}  · ${shiftLabel(stats.best)}` }
    : slxStats?.bestShift
      ? { value: `${slxStats.bestShift.uptimePct.toFixed(0)}%`, metric: 'uptime', date: `${slxStats.bestShift.dateKey.slice(5)} · ${slxStats.bestShift.shiftId === 'Turno día' ? 'Día' : 'Noche'}` }
      : null

  const worst = stats
    ? { value: `${fmtDec(stats.worst.pointZeroPct, 2)}%`, metric: 'P0%',   date: `${stats.worst.primaryDateKey.slice(5)} · ${shiftLabel(stats.worst)}` }
    : slxStats?.worstShift
      ? { value: `${slxStats.worstShift.uptimePct.toFixed(0)}%`, metric: 'uptime', date: `${slxStats.worstShift.dateKey.slice(5)} · ${slxStats.worstShift.shiftId === 'Turno día' ? 'Día' : 'Noche'}` }
      : null

  const dayShifts   = stats?.dayShifts   ?? slxStats?.dayShiftsWithData   ?? 0
  const nightShifts = stats?.nightShifts ?? slxStats?.nightShiftsWithData ?? 0
  const daysCount   = stats?.uniqueDays  ?? slxStats?.daysWithData        ?? 0
  const turnosCount = stats?.turnos      ?? slxStats?.turnosWithData      ?? 0

  return (
    <div className="space-y-2 lg:sticky lg:top-4">

      {/* ── Header ── */}
      <div>
        <p className="text-[10px] text-muted-foreground font-semibold uppercase tracking-wide">Resumen del mes</p>
        <p className="text-sm font-bold leading-tight">{monthLabel}</p>
        <p className="text-[10px] text-muted-foreground/60 mt-0">
          {daysCount} días · {turnosCount} turnos
        </p>
      </div>

      {/* ── Fila 1: Grader KPI | Shoplogix KPI ── */}
      <div className="grid grid-cols-2 gap-2">
        {/* Grader */}
        <Card className={stats ? '' : 'opacity-40'}>
          <CardContent className="pt-2 pb-2 px-3">
            <p className="text-[10px] text-muted-foreground mb-0.5">P0% promedio</p>
            <p className={`text-xl font-bold leading-none ${p0Color}`}>
              {stats ? `${fmtDec(stats.p0Avg, 2)}%` : '—'}
            </p>
            {stats && (
              <p className="text-[10px] text-muted-foreground mt-0.5 leading-snug">
                {fmt(stats.totalPieces)} pz
                {stats.totalWeightKg > 0 && <> · {fmtDec(stats.totalWeightKg / 1000, 1)} t</>}
              </p>
            )}
          </CardContent>
        </Card>

        {/* Shoplogix */}
        <Card className={slxStats ? '' : 'opacity-40'}>
          <CardContent className="pt-2 pb-2 px-3">
            <p className="text-[10px] text-muted-foreground mb-0.5">Ciclos Baader</p>
            <p className={`text-xl font-bold leading-none ${slxStats ? 'text-sky-400' : 'text-muted-foreground'}`}>
              {slxStats
                ? (slxStats.totalCycles >= 1000
                    ? `${(slxStats.totalCycles / 1000).toFixed(1)}k`
                    : slxStats.totalCycles.toLocaleString('es-CL'))
                : '—'}
            </p>
            {slxStats && (
              <p className={`text-[10px] mt-0.5 ${
                slxStats.avgUptimePct >= 70 ? 'text-emerald-400'
                : slxStats.avgUptimePct >= 40 ? 'text-amber-400' : 'text-rose-400'
              }`}>
                {slxStats.avgUptimePct.toFixed(0)}% uptime
              </p>
            )}
          </CardContent>
        </Card>
      </div>

      {/* ── Fila 2: Mejor / Peor turno ── */}
      <div className="grid grid-cols-2 gap-2">
        <Card className={`border-emerald-500/20 bg-emerald-500/5 ${!best ? 'opacity-40' : ''}`}>
          <CardContent className="pt-1.5 pb-1.5 px-3">
            <div className="flex items-center gap-1 mb-0.5">
              <TrendingDown className="w-3 h-3 text-emerald-500" />
              <p className="text-[11px] text-emerald-600 dark:text-emerald-400 font-medium">
                Mejor · {best?.metric ?? '—'}
              </p>
            </div>
            <p className="text-lg font-bold text-emerald-600 dark:text-emerald-400 leading-none">
              {best?.value ?? '—'}
            </p>
            {best && <p className="text-[10px] text-muted-foreground mt-0.5">{best.date}</p>}
          </CardContent>
        </Card>

        <Card className={`border-rose-500/20 bg-rose-500/5 ${!worst ? 'opacity-40' : ''}`}>
          <CardContent className="pt-1.5 pb-1.5 px-3">
            <div className="flex items-center gap-1 mb-0.5">
              <TrendingUp className="w-3 h-3 text-rose-500" />
              <p className="text-[11px] text-rose-600 dark:text-rose-400 font-medium">
                Peor · {worst?.metric ?? '—'}
              </p>
            </div>
            <p className="text-lg font-bold text-rose-600 dark:text-rose-400 leading-none">
              {worst?.value ?? '—'}
            </p>
            {worst && <p className="text-[10px] text-muted-foreground mt-0.5">{worst.date}</p>}
          </CardContent>
        </Card>
      </div>

      {/* ── Fila 3: Distribución Día / Noche ── */}
      <Card>
        <CardContent className="py-1.5 px-4">
          <p className="text-[10px] text-muted-foreground uppercase tracking-wide text-center mb-1">Turnos</p>
          <div className="flex justify-around text-center">
            <div>
              <p className="text-xl font-bold leading-none">{dayShifts}</p>
              <p className="text-[11px] text-muted-foreground mt-0.5 flex items-center justify-center gap-1">
                <Sun className="w-3 h-3 text-amber-500" /> Día
              </p>
            </div>
            <div className="w-px bg-border" />
            <div>
              <p className="text-xl font-bold leading-none">{nightShifts}</p>
              <p className="text-[11px] text-muted-foreground mt-0.5 flex items-center justify-center gap-1">
                <Moon className="w-3 h-3 text-indigo-400" /> Noche
              </p>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* ── Fila 4: Causa P0 dominante (solo si hay Grader) ── */}
      {stats?.topCausa && (
        <Card>
          <CardContent className="py-1.5 px-3 flex items-center gap-2">
            <AlertTriangle className="w-3.5 h-3.5 text-amber-500 shrink-0" />
            <div className="min-w-0">
              <p className="text-[10px] text-muted-foreground">Causa P0 dominante</p>
              <p className="text-xs font-semibold truncate">{getCauseLabel(stats.topCausa)}</p>
            </div>
          </CardContent>
        </Card>
      )}

    </div>
  )
}
