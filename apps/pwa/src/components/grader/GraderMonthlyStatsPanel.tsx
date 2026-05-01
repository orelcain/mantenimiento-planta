/**
 * Panel lateral de KPIs mensuales del Grader.
 * Se muestra siempre en desktop junto al calendario histórico.
 * Recibe los summaries ya cargados por el calendario (sin query extra).
 */
import { useMemo } from 'react'
import { Card, CardContent } from '@/components/ui'
import { TrendingDown, TrendingUp, AlertTriangle, BarChart3, Sun, Moon, Activity } from 'lucide-react'
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
  /** Stats Shoplogix del mes — mostradas cuando no hay summaries Grader */
  slxStats?: SlxMonthlyStats | null
}

export function GraderMonthlyStatsPanel({ currentMonth, summaries, slxStats }: Props) {
  const monthLabel = `${MONTH_NAMES[currentMonth.getMonth()]} ${currentMonth.getFullYear()}`

  const stats = useMemo(() => {
    const valid = summaries.filter(s => s.totalPieces > 0)
    if (valid.length === 0) return null

    const totalPieces = valid.reduce((s, d) => s + d.totalPieces, 0)
    const totalP0 = valid.reduce((s, d) => s + d.pointZeroPieces, 0)
    const p0Avg = totalPieces > 0 ? (totalP0 / totalPieces) * 100 : 0
    const totalWeightKg = valid.reduce((s, d) => s + (d.totalWeightKg ?? 0), 0)

    const sorted = [...valid].sort((a, b) => a.pointZeroPct - b.pointZeroPct)
    const bestSummary = sorted[0]!
    const worstSummary = sorted[sorted.length - 1]!

    // Top causa del mes: suma de piezas por tipo de error
    const causaMap = new Map<string, number>()
    for (const s of valid) {
      for (const c of s.topP0Causes ?? []) {
        causaMap.set(c.error, (causaMap.get(c.error) ?? 0) + c.pieces)
      }
    }
    const topCausa = [...causaMap.entries()].sort((a, b) => b[1] - a[1])[0]?.[0] ?? null

    // Días con AL MENOS un turno iniciado en ese día calendario (legacy: cuenta
    // domingo si arrancó turno noche dom 22h, aunque la mayoría del peso fue lunes).
    const startedDays = new Set(valid.map(s => s.dateKey)).size

    // Días con actividad calendárico-real: usa hourlyBuckets para repartir el
    // turno noche entre día de inicio y siguiente. Resuelve la mentira simétrica
    // (lunes que estaban invisibles porque su madrugada se atribuía al domingo).
    // Ver project_grader_night_shift_attribution.md (Opción D).
    const calendarAgg = aggregateByCalendarDay({ summaries: valid })
    const uniqueDays = calendarAgg.size

    // Fecha calendárica primary de cada summary (donde más cargó realmente).
    // Usado por mejor/peor turno para mostrar la fecha real, no la legacy.
    const primaryDateKeyBySummary = new Map<string, string>()
    for (const day of calendarAgg.values()) {
      for (const c of day.contributingShifts) {
        if (c.isPrimary) primaryDateKeyBySummary.set(c.summaryId, c.dateKey)
      }
    }
    const enrichWithPrimary = (s: GraderDailySummary) => ({
      ...s,
      primaryDateKey: primaryDateKeyBySummary.get(s.id) ?? s.dateKey,
    })
    const best = enrichWithPrimary(bestSummary)
    const worst = enrichWithPrimary(worstSummary)

    const dayShifts = valid.filter(s => s.shiftId === 'Turno día').length
    const nightShifts = valid.length - dayShifts

    return { turnos: valid.length, uniqueDays, startedDays, dayShifts, nightShifts, totalPieces, totalWeightKg, p0Avg, best, worst, topCausa }
  }, [summaries])

  const shiftLabel = (s: GraderDailySummary) => s.shiftId === 'Turno día' ? 'Día' : 'Noche'

  if (!stats) {
    // Vista Shoplogix-only: sin Grader summaries pero con datos Shoplogix
    if (slxStats) {
      const uptimeColor =
        slxStats.avgUptimePct >= 70 ? 'text-emerald-400'
        : slxStats.avgUptimePct >= 40 ? 'text-amber-400'
        : 'text-red-400'
      const shiftLabel2 = (s: { shiftId: string }) =>
        s.shiftId === 'Turno día' ? 'Día' : 'Noche'
      return (
        <div className="space-y-3 lg:sticky lg:top-4">
          <div>
            <p className="text-[11px] text-muted-foreground font-semibold uppercase tracking-wide">Resumen del mes</p>
            <p className="text-base font-bold leading-tight">{monthLabel}</p>
            <p className="text-[10px] text-sky-400 flex items-center gap-1 mt-0.5">
              <Activity className="w-3 h-3" />
              Solo Shoplogix · sin Excel Grader
            </p>
          </div>

          {/* KPI principal — total ciclos */}
          <Card>
            <CardContent className="pt-3 pb-3 px-4">
              <div className="flex items-end justify-between gap-2">
                <div>
                  <p className="text-xs text-muted-foreground mb-0.5">Ciclos totales línea</p>
                  <p className="text-4xl font-bold leading-none text-sky-400">
                    {slxStats.totalCycles.toLocaleString('es-CL')}
                  </p>
                </div>
                <div className="text-right space-y-0.5">
                  <p className={`text-xl font-bold ${uptimeColor}`}>
                    {fmtDec(slxStats.avgUptimePct, 0)}%
                    <span className="text-xs font-normal text-muted-foreground ml-1">uptime</span>
                  </p>
                  <p className="text-xs text-muted-foreground">
                    {slxStats.daysWithData} días · {slxStats.turnosWithData} turnos
                  </p>
                </div>
              </div>
            </CardContent>
          </Card>

          {/* Mejor / Peor turno por uptime */}
          <div className="grid grid-cols-2 gap-2">
            {slxStats.bestShift && (
              <Card className="border-emerald-500/20 bg-emerald-500/5">
                <CardContent className="pt-2 pb-2 px-3">
                  <div className="flex items-center gap-1 mb-0.5">
                    <TrendingDown className="w-3 h-3 text-emerald-500" />
                    <p className="text-[11px] text-emerald-600 dark:text-emerald-400 font-medium">Mejor uptime</p>
                  </div>
                  <p className="text-xl font-bold text-emerald-600 dark:text-emerald-400 leading-none">
                    {fmtDec(slxStats.bestShift.uptimePct, 0)}%
                  </p>
                  <p className="text-[11px] text-muted-foreground mt-0.5">
                    {slxStats.bestShift.dateKey.slice(5)} · {shiftLabel2(slxStats.bestShift)}
                  </p>
                </CardContent>
              </Card>
            )}
            {slxStats.worstShift && (
              <Card className="border-rose-500/20 bg-rose-500/5">
                <CardContent className="pt-2 pb-2 px-3">
                  <div className="flex items-center gap-1 mb-0.5">
                    <TrendingUp className="w-3 h-3 text-rose-500" />
                    <p className="text-[11px] text-rose-600 dark:text-rose-400 font-medium">Peor uptime</p>
                  </div>
                  <p className="text-xl font-bold text-rose-600 dark:text-rose-400 leading-none">
                    {fmtDec(slxStats.worstShift.uptimePct, 0)}%
                  </p>
                  <p className="text-[11px] text-muted-foreground mt-0.5">
                    {slxStats.worstShift.dateKey.slice(5)} · {shiftLabel2(slxStats.worstShift)}
                  </p>
                </CardContent>
              </Card>
            )}
          </div>

          {/* Distribución Día / Noche */}
          <Card>
            <CardContent className="py-2 px-4">
              <p className="text-[10px] text-muted-foreground uppercase tracking-wide text-center mb-1.5">
                Turnos con datos
              </p>
              <div className="flex justify-around text-center">
                <div>
                  <p className="text-2xl font-bold leading-none">{slxStats.dayShiftsWithData}</p>
                  <p className="text-xs text-muted-foreground mt-1 flex items-center justify-center gap-1">
                    <Sun className="w-3 h-3 text-amber-500" />
                    Día
                  </p>
                </div>
                <div className="w-px bg-border" />
                <div>
                  <p className="text-2xl font-bold leading-none">{slxStats.nightShiftsWithData}</p>
                  <p className="text-xs text-muted-foreground mt-1 flex items-center justify-center gap-1">
                    <Moon className="w-3 h-3 text-indigo-400" />
                    Noche
                  </p>
                </div>
              </div>
            </CardContent>
          </Card>
        </div>
      )
    }

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

  const p0Color = p0StatusColor(p0StatusFromPct(stats.p0Avg))

  return (
    <div className="space-y-3 lg:sticky lg:top-4">
      {/* Header */}
      <div>
        <p className="text-[11px] text-muted-foreground font-semibold uppercase tracking-wide">Resumen del mes</p>
        <p className="text-base font-bold leading-tight">{monthLabel}</p>
      </div>

      {/* KPI principal — P0% ponderado */}
      <Card>
        <CardContent className="pt-3 pb-3 px-4">
          <div className="flex items-end justify-between gap-2">
            <div>
              <p className="text-xs text-muted-foreground mb-0.5">P0% prom. ponderado</p>
              <p className={`text-4xl font-bold leading-none ${p0Color}`}>{fmtDec(stats.p0Avg, 2)}%</p>
            </div>
            <div className="text-right space-y-0.5">
              <p className="text-sm font-semibold">
                {fmt(stats.totalPieces)} <span className="text-xs font-normal text-muted-foreground">pz</span>
              </p>
              {stats.totalWeightKg > 0 && (
                <p className="text-xs text-muted-foreground">{fmtDec(stats.totalWeightKg / 1000, 1)} t</p>
              )}
              <p
                className="text-xs text-muted-foreground"
                title={`Días calendario con actividad real (incluye lunes que reciben madrugada del turno noche del domingo) · Turnos totales con datos${
                  stats.startedDays !== stats.uniqueDays
                    ? ` · ${stats.startedDays} días iniciaron turno`
                    : ''
                }`}
              >
                {stats.uniqueDays} días · {stats.turnos} turnos
              </p>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Mejor / Peor turno */}
      <div className="grid grid-cols-2 gap-2">
        <Card className="border-emerald-500/20 bg-emerald-500/5">
          <CardContent className="pt-2 pb-2 px-3">
            <div className="flex items-center gap-1 mb-0.5">
              <TrendingDown className="w-3 h-3 text-emerald-500" />
              <p className="text-[11px] text-emerald-600 dark:text-emerald-400 font-medium">Mejor turno</p>
            </div>
            <p className="text-xl font-bold text-emerald-600 dark:text-emerald-400 leading-none">
              {fmtDec(stats.best.pointZeroPct, 2)}%
            </p>
            <p className="text-[11px] text-muted-foreground mt-0.5">
              <span title={stats.best.primaryDateKey !== stats.best.dateKey ? `Schedule original: ${stats.best.dateKey}` : undefined}>
                {stats.best.primaryDateKey.slice(5)} · {shiftLabel(stats.best)}
              </span>
            </p>
          </CardContent>
        </Card>
        <Card className="border-rose-500/20 bg-rose-500/5">
          <CardContent className="pt-2 pb-2 px-3">
            <div className="flex items-center gap-1 mb-0.5">
              <TrendingUp className="w-3 h-3 text-rose-500" />
              <p className="text-[11px] text-rose-600 dark:text-rose-400 font-medium">Peor turno</p>
            </div>
            <p className="text-xl font-bold text-rose-600 dark:text-rose-400 leading-none">
              {fmtDec(stats.worst.pointZeroPct, 2)}%
            </p>
            <p className="text-[11px] text-muted-foreground mt-0.5">
              <span title={stats.worst.primaryDateKey !== stats.worst.dateKey ? `Schedule original: ${stats.worst.dateKey}` : undefined}>
                {stats.worst.primaryDateKey.slice(5)} · {shiftLabel(stats.worst)}
              </span>
            </p>
          </CardContent>
        </Card>
      </div>

      {/* Distribución Día / Noche */}
      <Card>
        <CardContent className="py-2 px-4">
          <p className="text-[10px] text-muted-foreground uppercase tracking-wide text-center mb-1.5">
            Turnos
          </p>
          <div className="flex justify-around text-center">
            <div>
              <p className="text-2xl font-bold leading-none">{stats.dayShifts}</p>
              <p className="text-xs text-muted-foreground mt-1 flex items-center justify-center gap-1">
                <Sun className="w-3 h-3 text-amber-500" />
                Día
              </p>
            </div>
            <div className="w-px bg-border" />
            <div>
              <p className="text-2xl font-bold leading-none">{stats.nightShifts}</p>
              <p className="text-xs text-muted-foreground mt-1 flex items-center justify-center gap-1">
                <Moon className="w-3 h-3 text-indigo-400" />
                Noche
              </p>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Top causa del mes */}
      {stats.topCausa && (
        <Card>
          <CardContent className="py-2 px-4 flex items-center gap-3">
            <AlertTriangle className="w-4 h-4 text-amber-500 shrink-0" />
            <div className="min-w-0">
              <p className="text-[11px] text-muted-foreground">Causa P0 dominante</p>
              <p className="text-sm font-semibold truncate">{getCauseLabel(stats.topCausa)}</p>
            </div>
          </CardContent>
        </Card>
      )}

      {/* ── Sección Shoplogix (cuando hay datos de línea upstream) ── */}
      {slxStats && (
        <>
          <div className="flex items-center gap-2 pt-1">
            <div className="flex-1 h-px bg-border/60" />
            <p className="text-[10px] text-muted-foreground/60 uppercase tracking-wider flex items-center gap-1">
              <Activity className="w-3 h-3" /> Línea upstream
            </p>
            <div className="flex-1 h-px bg-border/60" />
          </div>
          <Card>
            <CardContent className="pt-2 pb-2 px-4">
              <div className="flex items-center justify-between gap-2">
                <div>
                  <p className="text-[10px] text-muted-foreground">Ciclos Baader</p>
                  <p className="text-lg font-bold leading-none text-sky-400">
                    {slxStats.totalCycles >= 1000
                      ? `${(slxStats.totalCycles / 1000).toFixed(1)}k`
                      : slxStats.totalCycles.toLocaleString('es-CL')}
                  </p>
                </div>
                <div className="text-right">
                  <p className="text-[10px] text-muted-foreground">Uptime prom.</p>
                  <p className={`text-lg font-bold leading-none ${
                    slxStats.avgUptimePct >= 70 ? 'text-emerald-400'
                    : slxStats.avgUptimePct >= 40 ? 'text-amber-400' : 'text-rose-400'
                  }`}>
                    {slxStats.avgUptimePct.toFixed(0)}%
                  </p>
                </div>
              </div>
              {(slxStats.bestShift || slxStats.worstShift) && (
                <div className="flex items-center gap-2 mt-1.5 text-[10px] text-muted-foreground">
                  {slxStats.bestShift && (
                    <span className="text-emerald-400">
                      ↑{slxStats.bestShift.uptimePct.toFixed(0)}%
                      <span className="text-muted-foreground/60 ml-0.5">{slxStats.bestShift.dateKey.slice(5)}</span>
                    </span>
                  )}
                  {slxStats.bestShift && slxStats.worstShift && <span className="text-border">·</span>}
                  {slxStats.worstShift && (
                    <span className="text-rose-400">
                      ↓{slxStats.worstShift.uptimePct.toFixed(0)}%
                      <span className="text-muted-foreground/60 ml-0.5">{slxStats.worstShift.dateKey.slice(5)}</span>
                    </span>
                  )}
                </div>
              )}
            </CardContent>
          </Card>
        </>
      )}
    </div>
  )
}
