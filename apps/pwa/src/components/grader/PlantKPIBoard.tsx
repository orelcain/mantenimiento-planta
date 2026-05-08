/**
 * PlantKPIBoard — OEE, A, P, Q, MTTR, MTBF con selector Día / Semana / Mes.
 *
 * - Día:    turno más reciente con actividad (auto) o día seleccionado en el calendario.
 * - Semana: 7 días hasta el día seleccionado (o hoy).
 * - Mes:    mes visible en el calendario.
 */

import { useState } from 'react'
import { Card, CardContent, CardHeader, CardTitle, Spinner, InfoTooltip } from '@/components/ui'
import { TrendingUp, AlertTriangle } from 'lucide-react'
import { cn } from '@/lib/utils'
import { usePlantKPIsForPeriod } from '@/hooks/usePlantKPIs'
import type { KpiPeriod } from '@/hooks/usePlantKPIs'
import type { PlantSlug } from '@/services/shoplogix/shoplogixMachines'
import type { GraderDailySummary } from '@/services/grader/types'

interface Props {
  plantSlug: PlantSlug
  graderSummaries: GraderDailySummary[]
  enabled?: boolean
  /** Día seleccionado en el calendario ("YYYY-MM-DD"). null = auto-último con actividad. */
  selectedDateKey?: string | null
  /** Mes visible en el calendario (para modo Mes). */
  currentMonth?: Date
}

// ── Helpers de formato ────────────────────────────────────────────────────────

function pct(v: number | null, decimals = 1): string {
  if (v === null || !Number.isFinite(v)) return '—'
  return `${(v * 100).toFixed(decimals)}%`
}

function fmtMin(v: number): string {
  if (!Number.isFinite(v) || v === 0) return '—'
  if (v < 1) return `${Math.round(v * 60)} seg`
  return `${v.toFixed(1)} min`
}

function fmtHours(v: number): string {
  if (!Number.isFinite(v) || v === 0) return '—'
  if (v < 1) return `${Math.round(v * 60)} min`
  return `${v.toFixed(1)} h`
}

// ── Colores ───────────────────────────────────────────────────────────────────

function oeeColor(v: number | null): string {
  if (v === null) return 'text-muted-foreground'
  if (v >= 0.85) return 'text-emerald-400'
  if (v >= 0.65) return 'text-sky-400'
  if (v >= 0.50) return 'text-amber-400'
  return 'text-rose-400'
}

function availColor(v: number | null): string {
  if (v === null) return 'text-muted-foreground'
  if (v >= 0.85) return 'text-emerald-400'
  if (v >= 0.70) return 'text-amber-400'
  return 'text-rose-400'
}

function perfColor(v: number | null): string {
  if (v === null) return 'text-muted-foreground'
  if (v >= 0.90) return 'text-emerald-400'
  if (v >= 0.75) return 'text-amber-400'
  return 'text-rose-400'
}

function mttrColor(min: number): string {
  if (min === 0) return 'text-muted-foreground'
  if (min <= 5)  return 'text-emerald-400'
  if (min <= 15) return 'text-amber-400'
  return 'text-rose-400'
}

function mtbfColor(h: number): string {
  if (h === 0)  return 'text-muted-foreground'
  if (h >= 2)   return 'text-emerald-400'
  if (h >= 1)   return 'text-amber-400'
  return 'text-rose-400'
}

function barWidth(v: number | null, max = 1): string {
  if (v === null || !Number.isFinite(v)) return '0%'
  return `${Math.min(100, Math.max(0, (v / max) * 100)).toFixed(1)}%`
}

// ── Tooltips ──────────────────────────────────────────────────────────────────

const DEFS = {
  oee:     { desc: 'Mide el % del tiempo planificado en que la planta produce a velocidad y calidad óptimas.\n\nOEE = Disponibilidad × Rendimiento × Calidad\n\n< 50% crítico · 50‒65% aceptable · 65‒85% bueno · ≥ 85% clase mundial' },
  avail:   { desc: 'Porcentaje del tiempo productivo en que la máquina estuvo operativa.\n\nA = Uptime / (Uptime + Downtime)\n\nCalculado desde los estados Shoplogix de las Baaders.' },
  perf:    { desc: 'Velocidad real respecto a la velocidad objetivo configurada en Shoplogix.\n\nP = Ciclos reales / Ciclos esperados (máx. 100%)' },
  quality: { desc: 'Porcentaje de piezas buenas sobre el total.\n\nQ = 1 − P0% del Grader\n\nSolo disponible cuando hay datos del Grader para ese período.' },
  mttr:    { desc: 'Duración promedio de cada paro.\n\nMTTR = Σ duración / N° paros\n\n< 5 min excelente · 5‒15 min aceptable · > 15 min crítico' },
  mtbf:    { desc: 'Tiempo promedio entre paros.\n\nMTBF = Uptime / N° paros\n\n> 2 h excelente · 1‒2 h aceptable · < 1 h bajo' },
}

// ── KPICard ───────────────────────────────────────────────────────────────────

interface KPICardProps {
  label: string
  tooltip: string
  value: string
  valueColor: string
  barValue: number | null
  barMax?: number
  barColor?: string
  note?: string
}

function KPICard({ label, tooltip, value, valueColor, barValue, barMax = 1, barColor, note }: KPICardProps) {
  return (
    <div className="bg-muted/20 rounded-md px-2 py-1.5 border border-border/30">
      <div className="flex items-center justify-between gap-1">
        <div className="text-[10px] font-medium leading-tight truncate">{label}</div>
        <InfoTooltip text={tooltip} iconSize={11} position="top" />
      </div>
      <div className={cn('text-base font-bold tabular-nums leading-tight', valueColor)}>{value}</div>
      {barValue !== null && (
        <div className="h-1 bg-muted/40 rounded-full overflow-hidden mt-1">
          <div className={cn('h-full rounded-full transition-all', barColor ?? 'bg-primary')}
               style={{ width: barWidth(barValue, barMax) }} />
        </div>
      )}
      {note && <p className="text-[9px] text-muted-foreground/60 mt-0.5 leading-tight truncate">{note}</p>}
    </div>
  )
}

// ── Selector de período ───────────────────────────────────────────────────────

const PERIODS: { id: KpiPeriod; label: string }[] = [
  { id: 'day',   label: 'Día' },
  { id: 'week',  label: 'Semana' },
  { id: 'month', label: 'Mes' },
]

// ── Componente principal ──────────────────────────────────────────────────────

export function PlantKPIBoard({
  plantSlug,
  graderSummaries,
  enabled = true,
  selectedDateKey = null,
  currentMonth,
}: Props) {
  const [period, setPeriod] = useState<KpiPeriod>('day')
  const effectiveMonth = currentMonth ?? new Date()

  const { loading, error, kpis } = usePlantKPIsForPeriod(
    plantSlug,
    period,
    selectedDateKey,
    effectiveMonth,
    graderSummaries,
  )

  if (!enabled) return null

  return (
    <Card className="border-border/40">
      <CardHeader className="pb-2">
        <div className="flex items-center justify-between gap-2 flex-wrap">
          <CardTitle className="text-sm flex items-center gap-2">
            <TrendingUp className="w-4 h-4 text-sky-400" />
            Indicadores de Rendimiento
            {kpis && (
              <span className="text-[10px] font-normal text-muted-foreground">
                · {kpis.periodLabel}
                {kpis.shiftsCount > 1 && (
                  <span className="text-muted-foreground/60"> ({kpis.shiftsCount} turnos)</span>
                )}
              </span>
            )}
          </CardTitle>

          {/* Selector Día / Semana / Mes */}
          <div className="flex gap-0.5 bg-muted/40 rounded-md p-0.5">
            {PERIODS.map(p => (
              <button
                key={p.id}
                onClick={() => setPeriod(p.id)}
                className={cn(
                  'px-2 py-0.5 text-[11px] font-medium rounded transition-colors',
                  period === p.id
                    ? 'bg-background text-foreground shadow-sm'
                    : 'text-muted-foreground hover:text-foreground',
                )}
              >
                {p.label}
              </button>
            ))}
          </div>
        </div>
      </CardHeader>

      <CardContent className="space-y-2 pb-3">
        {loading && (
          <div className="flex items-center gap-2 text-muted-foreground text-xs py-1">
            <Spinner /> Cargando…
          </div>
        )}

        {error && (
          <p className="text-xs text-rose-400 flex items-center gap-1">
            <AlertTriangle className="w-3.5 h-3.5" /> {error}
          </p>
        )}

        {!loading && !error && !kpis && (
          <p className="text-xs text-muted-foreground/60 py-1">
            Sin datos Shoplogix disponibles para este período.
          </p>
        )}

        {!loading && kpis && (
          <>
            {/* Banner informativo cuando solo hay calidad Grader */}
            {kpis.graderOnly && (
              <p className="text-[10px] text-sky-400/80 flex items-center gap-1 pb-0.5">
                <AlertTriangle className="w-3 h-3 shrink-0" />
                Sin datos Shoplogix para este período — solo calidad Grader
              </p>
            )}

            {/* Banner: producción mínima → KPIs no representativos.
                Caso real Yal día 8-may: 10 cycles totales (8+2+0) — el A=100% y
                pz/min de cada Baader son matemáticamente válidos pero no
                describen un día productivo. */}
            {(() => {
              if (kpis.graderOnly) return null
              const totalCycles = kpis.machines.reduce((a, m) => a + (m.totalCycles ?? 0), 0)
              const SIGNIFICANT_CYCLES_THRESHOLD = 100
              if (totalCycles >= SIGNIFICANT_CYCLES_THRESHOLD) return null
              return (
                <p className="text-[10px] text-amber-400/90 flex items-start gap-1 pb-0.5">
                  <AlertTriangle className="w-3 h-3 shrink-0 mt-0.5" />
                  <span>
                    Período sin producción significativa ({totalCycles.toLocaleString('es-CL')} ciclos totales).
                    Los KPIs son matemáticamente válidos pero no describen un período productivo.
                  </span>
                </p>
              )
            })()}

            {/* ── Fila 1: OEE + A + P + Q ── */}
            <div className="grid grid-cols-4 gap-1.5">
              <KPICard
                label="OEE"
                tooltip={DEFS.oee.desc}
                value={kpis.oee !== null ? pct(kpis.oee) : '—'}
                valueColor={oeeColor(kpis.oee)}
                barValue={kpis.oee}
                barColor={kpis.oee !== null
                  ? (kpis.oee >= 0.85 ? 'bg-emerald-500' : kpis.oee >= 0.65 ? 'bg-sky-500' : kpis.oee >= 0.5 ? 'bg-amber-500' : 'bg-rose-500')
                  : 'bg-muted'}
                note={kpis.graderOnly ? 'Sin Shoplogix' : kpis.oee === null ? (plantSlug === 'yal' ? 'A·P solamente' : 'Sin Q') : undefined}
              />
              <KPICard
                label="Disponibilidad"
                tooltip={DEFS.avail.desc}
                value={kpis.availability !== null ? pct(kpis.availability) : '—'}
                valueColor={availColor(kpis.availability)}
                barValue={kpis.availability}
                barColor={kpis.availability !== null
                  ? (kpis.availability >= 0.85 ? 'bg-emerald-500' : kpis.availability >= 0.70 ? 'bg-amber-500' : 'bg-rose-500')
                  : undefined}
                note={kpis.graderOnly ? 'Sin Shoplogix' : undefined}
              />
              <KPICard
                label="Rendimiento"
                tooltip={DEFS.perf.desc}
                value={kpis.performance !== null ? pct(kpis.performance) : '—'}
                valueColor={perfColor(kpis.performance)}
                barValue={kpis.performance}
                barColor={kpis.performance !== null
                  ? (kpis.performance >= 0.90 ? 'bg-emerald-500' : kpis.performance >= 0.75 ? 'bg-amber-500' : 'bg-rose-500')
                  : undefined}
                note={kpis.graderOnly ? 'Sin Shoplogix' : undefined}
              />
              <KPICard
                label="Calidad"
                tooltip={DEFS.quality.desc}
                value={kpis.quality !== null ? pct(kpis.quality) : 'N/A'}
                valueColor={kpis.quality !== null
                  ? (kpis.quality >= 0.95 ? 'text-emerald-400' : kpis.quality >= 0.85 ? 'text-amber-400' : 'text-rose-400')
                  : 'text-muted-foreground'}
                barValue={kpis.quality}
                barColor={kpis.quality !== null
                  ? (kpis.quality >= 0.95 ? 'bg-emerald-500' : kpis.quality >= 0.85 ? 'bg-amber-500' : 'bg-rose-500')
                  : undefined}
                note={kpis.quality === null ? (plantSlug === 'yal' ? 'No clasifica' : 'Sin Grader') : undefined}
              />
            </div>

            {/* ── Fila 2: MTTR · MTBF · Paros (ocultar si solo Grader) ── */}
            {!kpis.graderOnly && (
            <div className="grid grid-cols-3 gap-1.5">
              <KPICard
                label="MTTR ↓"
                tooltip={DEFS.mttr.desc}
                value={fmtMin(kpis.mttrMin)}
                valueColor={mttrColor(kpis.mttrMin)}
                barValue={kpis.mttrMin > 0 ? Math.min(1, kpis.mttrMin / 30) : null}
                barColor={kpis.mttrMin <= 5 ? 'bg-emerald-500' : kpis.mttrMin <= 15 ? 'bg-amber-500' : 'bg-rose-500'}
              />
              <KPICard
                label="MTBF ↑"
                tooltip={DEFS.mtbf.desc}
                value={fmtHours(kpis.mtbfHours)}
                valueColor={mtbfColor(kpis.mtbfHours)}
                barValue={kpis.mtbfHours > 0 ? Math.min(1, kpis.mtbfHours / 4) : null}
                barColor={kpis.mtbfHours >= 2 ? 'bg-emerald-500' : kpis.mtbfHours >= 1 ? 'bg-amber-500' : 'bg-rose-500'}
              />
              <div className="bg-muted/20 rounded-md px-2 py-1.5 border border-border/30">
                <div className="text-[10px] font-medium leading-tight">N° Paros</div>
                <div className="text-base font-bold tabular-nums leading-tight">{kpis.failureCount}</div>
                <p className="text-[9px] text-muted-foreground/60 mt-0.5 leading-tight">
                  eventos · {kpis.shiftsCount > 1 ? `${kpis.shiftsCount} turnos` : 'turno'}
                </p>
              </div>
            </div>
            )}

            {/* ── Detalle por máquina (solo con Shoplogix) ── */}
            {!kpis.graderOnly && <div className="grid gap-1 pt-0.5">
              {kpis.machines.map((m) => (
                <div
                  key={m.machineid}
                  className="flex items-center gap-2 text-[11px] bg-muted/10 rounded px-2 py-1 border border-border/20"
                >
                  <span className="text-muted-foreground w-32 shrink-0 truncate" title={m.machineName}>{m.machineName}</span>
                  <span className={cn('w-12 tabular-nums', availColor(m.availability))}>
                    A {pct(m.availability, 0)}
                  </span>
                  <span className={cn('w-12 tabular-nums', perfColor(m.performance))}>
                    P {pct(m.performance, 0)}
                  </span>
                  <span className={cn('w-16 tabular-nums', mttrColor(m.mttrMin))}>
                    {fmtMin(m.mttrMin)}
                  </span>
                  <span className="text-muted-foreground/60 tabular-nums">
                    {m.failureCount} paro{m.failureCount !== 1 ? 's' : ''}
                  </span>
                  {m.shoplogixTargetCpm !== null && (
                    <span className="ml-auto text-muted-foreground/50 tabular-nums">
                      {m.shoplogixTargetCpm.toFixed(1)} pz/min
                    </span>
                  )}
                </div>
              ))}
            </div>}
          </>
        )}
      </CardContent>
    </Card>
  )
}
