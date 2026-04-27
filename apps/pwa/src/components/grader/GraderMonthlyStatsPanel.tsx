/**
 * Panel lateral de KPIs mensuales del Grader.
 * Se muestra siempre en desktop junto al calendario histórico.
 * Recibe los summaries ya cargados por el calendario (sin query extra).
 */
import { useMemo } from 'react'
import { Card, CardContent } from '@/components/ui'
import { TrendingDown, TrendingUp, AlertTriangle, BarChart3, Sun, Moon } from 'lucide-react'
import type { GraderDailySummary } from '@/services/grader/types'
import { getCauseLabel } from '@/services/grader/graderMatrixP0Causes'
import { p0StatusFromPct, p0StatusColor } from '@/services/grader/graderP0Thresholds'
import { fmt, fmtDec } from '@/lib/format'

const MONTH_NAMES = [
  'Enero', 'Febrero', 'Marzo', 'Abril', 'Mayo', 'Junio',
  'Julio', 'Agosto', 'Septiembre', 'Octubre', 'Noviembre', 'Diciembre',
]

interface Props {
  currentMonth: Date
  summaries: GraderDailySummary[]
}

export function GraderMonthlyStatsPanel({ currentMonth, summaries }: Props) {
  const monthLabel = `${MONTH_NAMES[currentMonth.getMonth()]} ${currentMonth.getFullYear()}`

  const stats = useMemo(() => {
    const valid = summaries.filter(s => s.totalPieces > 0)
    if (valid.length === 0) return null

    const totalPieces = valid.reduce((s, d) => s + d.totalPieces, 0)
    const totalP0 = valid.reduce((s, d) => s + d.pointZeroPieces, 0)
    const p0Avg = totalPieces > 0 ? (totalP0 / totalPieces) * 100 : 0
    const totalWeightKg = valid.reduce((s, d) => s + (d.totalWeightKg ?? 0), 0)

    const sorted = [...valid].sort((a, b) => a.pointZeroPct - b.pointZeroPct)
    const best = sorted[0]!
    const worst = sorted[sorted.length - 1]!

    // Top causa del mes: suma de piezas por tipo de error
    const causaMap = new Map<string, number>()
    for (const s of valid) {
      for (const c of s.topP0Causes ?? []) {
        causaMap.set(c.error, (causaMap.get(c.error) ?? 0) + c.pieces)
      }
    }
    const topCausa = [...causaMap.entries()].sort((a, b) => b[1] - a[1])[0]?.[0] ?? null

    const uniqueDays = new Set(valid.map(s => s.dateKey)).size
    const dayShifts = valid.filter(s => s.shiftId === 'Turno día').length
    const nightShifts = valid.length - dayShifts

    return { turnos: valid.length, uniqueDays, dayShifts, nightShifts, totalPieces, totalWeightKg, p0Avg, best, worst, topCausa }
  }, [summaries])

  const shiftLabel = (s: GraderDailySummary) => s.shiftId === 'Turno día' ? 'Día' : 'Noche'

  if (!stats) {
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
                title="Días con al menos un turno iniciado en ese día calendario · Turnos totales con datos"
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
              {stats.best.dateKey.slice(5)} · {shiftLabel(stats.best)}
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
              {stats.worst.dateKey.slice(5)} · {shiftLabel(stats.worst)}
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
    </div>
  )
}
