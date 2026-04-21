/**
 * PauseKpiDashboard — KPIs de tiempo muerto del período.
 *
 * Agrega totalDeadTimeSec / pausesCount de GraderDailySummary[]
 * (campos precalculados en el doc principal, sin sub-collection queries).
 * Muestra 4 KPI cards + barras horizontales por día/semana.
 */

import { useMemo } from 'react'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui'
import { Activity, Clock, PauseCircle, TrendingDown } from 'lucide-react'
import type { GraderDailySummary } from '@/services/grader/types'

interface PauseKpiDashboardProps {
  summaries: GraderDailySummary[]
}

function fmtSec(totalSec: number): string {
  const h = Math.floor(totalSec / 3600)
  const m = Math.floor((totalSec % 3600) / 60)
  if (h === 0) return `${m}m`
  return `${h}h ${m}m`
}

function KpiCard({
  label,
  value,
  sub,
  icon,
}: {
  label: string
  value: string
  sub: string
  icon: React.ReactNode
}) {
  return (
    <div className="rounded-lg border border-border/50 bg-muted/20 px-3 py-2.5">
      <div className="flex items-center gap-1.5 text-[11px] text-muted-foreground mb-1">
        {icon}
        {label}
      </div>
      <div className="text-lg font-semibold tabular-nums leading-none">{value}</div>
      <div className="text-[10px] text-muted-foreground/60 mt-1">{sub}</div>
    </div>
  )
}

type ChartEntry = { key: string; sec: number; pct: number; label: string }

function buildChartEntries(withData: GraderDailySummary[]): { entries: ChartEntry[]; grouped: boolean } {
  const dayMap: Record<string, number> = {}
  for (const s of withData) {
    dayMap[s.dateKey] = (dayMap[s.dateKey] ?? 0) + (s.totalDeadTimeSec ?? 0)
  }
  const days = Object.keys(dayMap).sort()

  if (days.length <= 60) {
    const maxSec = Math.max(...days.map(d => dayMap[d]!), 1)
    return {
      grouped: false,
      entries: days.map(dateKey => ({
        key: dateKey,
        sec: dayMap[dateKey]!,
        pct: (dayMap[dateKey]! / maxSec) * 100,
        label: new Date(`${dateKey}T12:00:00`)
          .toLocaleDateString('es-CL', { day: 'numeric', month: 'short' })
          .replace('.', ''),
      })),
    }
  }

  // Más de 60 días → agrupar por semana (lunes)
  const weekMap: Record<string, number> = {}
  const weekLabel: Record<string, string> = {}
  for (const dateKey of days) {
    const d = new Date(`${dateKey}T12:00:00`)
    const mon = new Date(d)
    mon.setDate(d.getDate() - ((d.getDay() + 6) % 7)) // lunes
    const wk = mon.toISOString().slice(0, 10)
    weekMap[wk] = (weekMap[wk] ?? 0) + dayMap[dateKey]!
    if (!weekLabel[wk]) {
      weekLabel[wk] = mon
        .toLocaleDateString('es-CL', { day: 'numeric', month: 'short' })
        .replace('.', '')
    }
  }
  const weeks = Object.keys(weekMap).sort()
  const maxSecW = Math.max(...weeks.map(w => weekMap[w]!), 1)
  return {
    grouped: true,
    entries: weeks.map(wk => ({
      key: wk,
      sec: weekMap[wk]!,
      pct: (weekMap[wk]! / maxSecW) * 100,
      label: weekLabel[wk]!,
    })),
  }
}

export function PauseKpiDashboard({ summaries }: PauseKpiDashboardProps) {
  const withData = useMemo(
    () => summaries.filter(s => s.totalDeadTimeSec !== undefined),
    [summaries],
  )

  const kpis = useMemo(() => {
    if (withData.length === 0) return null
    const totalDeadSec = withData.reduce((sum, s) => sum + (s.totalDeadTimeSec ?? 0), 0)
    const totalPauses  = withData.reduce((sum, s) => sum + (s.pausesCount ?? 0), 0)
    const avgDeadSec   = totalDeadSec / withData.length
    const withDuration = withData.filter(s => (s.durationMinutes ?? 0) > 0)
    const avgDeadPct   = withDuration.length > 0
      ? withDuration.reduce(
          (sum, s) => sum + (s.totalDeadTimeSec ?? 0) / ((s.durationMinutes!) * 60) * 100,
          0,
        ) / withDuration.length
      : null
    return { totalDeadSec, totalPauses, avgDeadSec, avgDeadPct }
  }, [withData])

  const chart = useMemo(() => buildChartEntries(withData), [withData])

  if (withData.length === 0) {
    return (
      <Card>
        <CardHeader className="pb-2 pt-4">
          <CardTitle className="text-sm flex items-center gap-2 text-muted-foreground">
            <PauseCircle className="w-4 h-4" />
            Tiempo muerto del período
          </CardTitle>
        </CardHeader>
        <CardContent className="pb-6 text-center text-sm text-muted-foreground">
          Sin datos de tiempo muerto en el rango seleccionado.
        </CardContent>
      </Card>
    )
  }

  return (
    <Card>
      <CardHeader className="pb-2 pt-4">
        <CardTitle className="text-sm flex items-center gap-2">
          <PauseCircle className="w-4 h-4 text-muted-foreground" />
          Tiempo muerto del período
          <span className="text-[11px] font-normal text-muted-foreground ml-1">
            {withData.length}/{summaries.length} turnos con datos
          </span>
        </CardTitle>
      </CardHeader>

      <CardContent className="pb-4 space-y-4">
        {/* KPI strip */}
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
          <KpiCard
            label="Total tiempo muerto"
            value={fmtSec(kpis!.totalDeadSec)}
            sub="suma del período"
            icon={<Clock className="w-3.5 h-3.5" />}
          />
          <KpiCard
            label="Pausas ≥5 min"
            value={kpis!.totalPauses.toLocaleString('es-CL')}
            sub="pausa · larga · parada"
            icon={<PauseCircle className="w-3.5 h-3.5" />}
          />
          <KpiCard
            label="Promedio por turno"
            value={fmtSec(kpis!.avgDeadSec)}
            sub={`sobre ${withData.length} turnos`}
            icon={<TrendingDown className="w-3.5 h-3.5" />}
          />
          <KpiCard
            label="% muerto del turno"
            value={kpis!.avgDeadPct != null ? `${kpis!.avgDeadPct.toFixed(1)}%` : '—'}
            sub="promedio del período"
            icon={<Activity className="w-3.5 h-3.5" />}
          />
        </div>

        {/* Bar chart */}
        {chart.entries.length > 0 && (
          <div className="pt-1">
            {chart.grouped && (
              <p className="text-[11px] text-muted-foreground mb-2">
                Agrupado por semana · período largo
              </p>
            )}
            <div className="space-y-0.5 max-h-56 overflow-y-auto pr-1">
              {chart.entries.map(d => (
                <div key={d.key} className="flex items-center gap-2 text-xs">
                  <span className="w-12 shrink-0 text-right text-[11px] text-muted-foreground tabular-nums">
                    {d.label}
                  </span>
                  <div className="flex-1 h-3 bg-muted/30 rounded-sm overflow-hidden">
                    <div
                      className="h-full rounded-sm bg-amber-500/60 transition-all duration-300"
                      style={{ width: `${d.pct}%` }}
                      title={fmtSec(d.sec)}
                    />
                  </div>
                  <span className="w-12 shrink-0 text-[11px] text-muted-foreground tabular-nums">
                    {fmtSec(d.sec)}
                  </span>
                </div>
              ))}
            </div>
          </div>
        )}
      </CardContent>
    </Card>
  )
}
