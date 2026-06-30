/**
 * MaintenanceImpactCard — "Lente de Mantención" del período.
 *
 * Aísla el paro ATRIBUIBLE a Mantención (pausas tagueadas falla_equipo /
 * mantencion) y muestra la confiabilidad de forma profesional: MTTR macro,
 * MTBF, disponibilidad atribuible, # fallas/intervenciones, micro-paros aparte,
 * y la tendencia del paro de mantención en el período.
 *
 * Finalidad (premisa de la app): demostrar con datos que Mantención atiende las
 * fallas y que el proceso mejora (tendencia a la baja del paro de mantención).
 *
 * Reutiliza graderReliability (cálculo) + loadPausesAggregates (vía
 * loadPausesForSummaries). Carga las pausas en mount, batched.
 */

import { useEffect, useMemo, useState } from 'react'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui'
import { Wrench, AlertTriangle, Clock, Gauge, Activity, TrendingDown, TrendingUp, Loader2, FileDown } from 'lucide-react'
import type { GraderDailySummary, Pause } from '@/services/grader/types'
import {
  loadPausesForSummaries,
  computeMaintenanceReliability,
  formatReliabilityDuration as fmt,
  type MaintenanceReliability,
} from '@/services/grader/graderReliability'
import { exportMaintenanceImpactPDF } from '@/services/grader/maintenanceImpactPdf'
import type { MaintenanceWork } from '@/services/grader/maintenanceWork'

interface Props {
  summaries: GraderDailySummary[]
  /** Etiqueta del período para el reporte PDF (ej. "Último mes"). */
  periodLabel?: string
  /** Rango de fechas para el reporte (ej. "2026-05-26 → 2026-06-25"). */
  rangeLabel?: string
  /** Trabajo de Mantención (TPM) del período — se agrega al PDF si viene. */
  work?: MaintenanceWork | null
}

function KpiCard({
  label, value, sub, icon, valueColor,
}: {
  label: string; value: string; sub: string; icon: React.ReactNode; valueColor?: string
}) {
  return (
    <div className="rounded-lg border border-border/50 bg-muted/20 px-3 py-2.5">
      <div className="flex items-center gap-1.5 text-[11px] text-muted-foreground mb-1">{icon}{label}</div>
      <div className={`text-lg font-semibold tabular-nums leading-none ${valueColor ?? ''}`}>{value}</div>
      <div className="text-[10px] text-muted-foreground/60 mt-1">{sub}</div>
    </div>
  )
}

/** Pendiente simple de la tendencia: compara la 1ª mitad vs la 2ª mitad del período. */
function trendDirection(trend: MaintenanceReliability['trend']): { down: boolean; deltaPct: number | null } {
  if (trend.length < 2) return { down: true, deltaPct: null }
  const mid = Math.floor(trend.length / 2)
  const firstAvg = trend.slice(0, mid).reduce((a, t) => a + t.downtimeSec, 0) / Math.max(1, mid)
  const secondAvg = trend.slice(mid).reduce((a, t) => a + t.downtimeSec, 0) / Math.max(1, trend.length - mid)
  if (firstAvg === 0) return { down: secondAvg <= 0, deltaPct: null }
  const deltaPct = ((secondAvg - firstAvg) / firstAvg) * 100
  return { down: deltaPct <= 0, deltaPct }
}

export function MaintenanceImpactCard({ summaries, periodLabel, rangeLabel, work }: Props) {
  const [loaded, setLoaded] = useState<Array<{ summary: GraderDailySummary; pauses: Pause[] }> | null>(null)
  const [progress, setProgress] = useState<{ done: number; total: number } | null>(null)
  const [exporting, setExporting] = useState(false)

  // ¿Hay turnos con pausas que cargar?
  const hasPauses = useMemo(() => summaries.some((s) => (s.pausesCount ?? 0) > 0), [summaries])

  useEffect(() => {
    let cancelled = false
    setLoaded(null)
    if (!hasPauses) { setLoaded([]); return }
    setProgress({ done: 0, total: 0 })
    loadPausesForSummaries(summaries, (done, total) => {
      if (!cancelled) setProgress({ done, total })
    }).then((res) => {
      if (!cancelled) { setLoaded(res); setProgress(null) }
    }).catch(() => { if (!cancelled) { setLoaded([]); setProgress(null) } })
    return () => { cancelled = true }
  }, [summaries, hasPauses])

  const rel = useMemo(
    () => (loaded ? computeMaintenanceReliability(summaries, loaded) : null),
    [summaries, loaded],
  )

  const dir = useMemo(() => (rel ? trendDirection(rel.trend) : null), [rel])
  const maxTrend = useMemo(() => (rel ? Math.max(...rel.trend.map((t) => t.downtimeSec), 1) : 1), [rel])

  const handleExport = async () => {
    if (!rel || rel.eventsCount === 0) return
    setExporting(true)
    try {
      await exportMaintenanceImpactPDF(rel, {
        periodLabel: periodLabel || 'Período',
        rangeLabel,
        lineLabel: 'Análisis de Turno',
      }, work ?? undefined)
    } finally {
      setExporting(false)
    }
  }

  // Cargando
  if (loaded === null) {
    return (
      <Card>
        <CardHeader className="pb-2 pt-4">
          <CardTitle className="text-sm flex items-center gap-2">
            <Wrench className="w-4 h-4 text-orange-500" /> Impacto de Mantención
          </CardTitle>
        </CardHeader>
        <CardContent className="pb-6 flex items-center gap-2 text-sm text-muted-foreground">
          <Loader2 className="w-4 h-4 animate-spin" />
          Cargando paros del período{progress && progress.total ? ` — ${progress.done}/${progress.total} turnos…` : '…'}
        </CardContent>
      </Card>
    )
  }

  const noMaintenanceData = !rel || rel.eventsCount === 0

  return (
    <Card>
      <CardHeader className="pb-2 pt-4">
        <div className="flex items-center justify-between gap-2">
          <CardTitle className="text-sm flex items-center gap-2 min-w-0">
            <Wrench className="w-4 h-4 shrink-0 text-orange-500" />
            <span className="truncate">Impacto de Mantención</span>
            {rel && (
              <span className="text-[11px] font-normal text-muted-foreground ml-1 hidden sm:inline">
                confiabilidad del período · {rel.shiftsWithData} turnos
              </span>
            )}
          </CardTitle>
          {rel && rel.eventsCount > 0 && (
            <button
              onClick={handleExport}
              disabled={exporting}
              className="shrink-0 inline-flex items-center gap-1.5 rounded-md border border-orange-500/40 bg-orange-500/10 px-2.5 py-1 text-[11px] font-medium text-orange-500 transition hover:bg-orange-500/20 disabled:opacity-50"
              title="Descargar reporte PDF de impacto de mantención"
            >
              {exporting ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <FileDown className="h-3.5 w-3.5" />}
              Reporte
            </button>
          )}
        </div>
      </CardHeader>

      <CardContent className="pb-4 space-y-4">
        {noMaintenanceData ? (
          <p className="text-sm text-muted-foreground">
            Sin paros clasificados como <span className="text-orange-400">falla de equipo</span> o{' '}
            <span className="text-orange-400">intervención de mantención</span> en el período.
            {rel && rel.unclassifiedPauses > 0 && (
              <> Hay <span className="font-medium text-foreground">{rel.unclassifiedPauses}</span> pausas sin clasificar — clasifícalas en “Tiempo muerto del período” para medir el impacto.</>
            )}
          </p>
        ) : (
          <>
            {/* Frase de demostración */}
            <div className="rounded-lg border border-orange-500/30 bg-orange-500/5 px-3 py-2 text-xs text-foreground/90">
              Mantención atendió <span className="font-semibold text-orange-400">{rel!.eventsCount}</span> paros
              ({rel!.fallasCount} fallas · {rel!.intervencionesCount} intervenciones) por{' '}
              <span className="font-semibold">{fmt(rel!.maintenanceDowntimeSec)}</span> en el período.
              {dir && dir.deltaPct != null && (
                <> El paro de mantención{' '}
                  <span className={dir.down ? 'text-emerald-400 font-medium' : 'text-rose-400 font-medium'}>
                    {dir.down ? 'bajó' : 'subió'} {Math.abs(dir.deltaPct).toFixed(0)}%
                  </span>{' '}entre la 1ª y la 2ª mitad.
                </>
              )}
            </div>

            {/* KPIs de confiabilidad */}
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
              <KpiCard
                label="MTTR (macro)"
                value={fmt(rel!.mttrMacroSec)}
                sub={`${rel!.eventsCount} eventos ≥5min`}
                icon={<Clock className="w-3.5 h-3.5" />}
              />
              <KpiCard
                label="MTBF"
                value={rel!.mtbfSec > 0 ? fmt(rel!.mtbfSec) : '—'}
                sub={rel!.fallasCount > 0 ? `${rel!.fallasCount} fallas` : 'sin fallas tagueadas'}
                icon={<Gauge className="w-3.5 h-3.5" />}
              />
              <KpiCard
                label="Disponibilidad"
                value={rel!.availabilityPct != null ? `${rel!.availabilityPct.toFixed(1)}%` : '—'}
                sub="atribuible a mantención"
                icon={<Activity className="w-3.5 h-3.5" />}
                valueColor={
                  rel!.availabilityPct == null ? undefined
                    : rel!.availabilityPct >= 98 ? 'text-emerald-400'
                    : rel!.availabilityPct >= 95 ? 'text-amber-400' : 'text-rose-400'
                }
              />
              <KpiCard
                label="Paro de mantención"
                value={fmt(rel!.maintenanceDowntimeSec)}
                sub={rel!.maintenanceShareOfDeadPct != null ? `${rel!.maintenanceShareOfDeadPct.toFixed(0)}% del muerto total` : 'del período'}
                icon={<Wrench className="w-3.5 h-3.5" />}
                valueColor="text-orange-400"
              />
            </div>

            {/* Micro-detenciones — aparte, poco accionables */}
            {rel!.microCount > 0 && (
              <div className="flex items-center gap-2 rounded-md bg-muted/20 px-3 py-2 text-[11px] text-muted-foreground">
                <AlertTriangle className="w-3.5 h-3.5 shrink-0 text-amber-400/70" />
                <span>
                  Aparte: <span className="tabular-nums font-medium text-foreground">{rel!.microCount.toLocaleString('es-CL')}</span> micro-detenciones
                  (interferencias &lt;5min, MTTR {fmt(rel!.mttrMicroSec)}) por {fmt(rel!.microSec)} — poco accionables individualmente, no inflan el MTTR macro.
                </span>
              </div>
            )}

            {/* Tendencia del paro de mantención */}
            {rel!.trend.length > 0 && (
              <div className="pt-1">
                <div className="flex items-center gap-1.5 text-[11px] text-muted-foreground mb-2">
                  {dir?.down ? <TrendingDown className="w-3.5 h-3.5 text-emerald-400" /> : <TrendingUp className="w-3.5 h-3.5 text-rose-400" />}
                  Tendencia del paro de mantención {rel!.trend[0]?.grouped ? '· por semana' : '· por día'}
                </div>
                <div className="space-y-0.5 max-h-44 overflow-y-auto pr-1">
                  {rel!.trend.map((t) => (
                    <div key={t.key} className="flex items-center gap-2 text-xs">
                      <span className="w-12 shrink-0 text-right text-[11px] text-muted-foreground tabular-nums">{t.label}</span>
                      <div className="flex-1 h-3 bg-muted/30 rounded-sm overflow-hidden">
                        <div
                          className="h-full rounded-sm bg-orange-500/60 transition-all duration-300"
                          style={{ width: `${(t.downtimeSec / maxTrend) * 100}%` }}
                          title={`${fmt(t.downtimeSec)} · ${t.events} eventos`}
                        />
                      </div>
                      <span className="w-12 shrink-0 text-[11px] text-muted-foreground tabular-nums">{fmt(t.downtimeSec)}</span>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </>
        )}
      </CardContent>
    </Card>
  )
}
