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
  oee:     { desc: 'OEE de las EVISCERADORAS (Baader 142) — no de toda el área.\n\nMide el % del tiempo planificado en que las Baader producen a velocidad y calidad óptimas.\n\nOEE = Disponibilidad × Rendimiento × Calidad\n(A·R de las Baader · Q = calidad del Grader)\n\nNO incluye: bombeo, chiller, desangrador, cintas, Marel, corte ni etiquetado.\n\n< 50% crítico · 50‒65% aceptable · 65‒85% bueno · ≥ 85% clase mundial\n(el 85% es para una máquina/cuello de botella, no para un OEE de línea).' },
  avail:   { desc: 'Porcentaje del tiempo productivo en que la máquina estuvo operativa.\n\nA = Uptime / (Uptime + Downtime)\n\nCalculado desde los estados Shoplogix de las Baaders.' },
  perf:    { desc: 'Velocidad real respecto a la velocidad objetivo configurada en Shoplogix.\n\nP = Ciclos reales / Ciclos esperados (máx. 100%)' },
  quality: { desc: 'Porcentaje de piezas buenas sobre el total.\n\nQ = 1 − P0% del Grader\n\nSolo disponible cuando hay datos del Grader para ese período.' },
  mttr:    { desc: 'Tiempo medio de reparación de una avería MACRO (paro relevante ≥5min).\n\nMTTR = Σ duración averías macro / N° averías macro\n\nExcluye micro-detenciones (<5min) para no distorsionar el indicador.\n< 5 min excelente · 5‒15 min aceptable · > 15 min crítico' },
  mtbf:    { desc: 'Tiempo medio entre averías macro.\n\nMTBF = Uptime / N° averías macro\n\n> 2 h excelente · 1‒2 h aceptable · < 1 h bajo' },
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
    <div className="bg-muted/20 rounded-lg px-2.5 py-2 border border-border/40 hover:border-border/70 transition-colors">
      <div className="flex items-center justify-between gap-1 mb-1">
        <div className="text-[10px] font-medium text-muted-foreground leading-tight truncate">{label}</div>
        <InfoTooltip text={tooltip} iconSize={11} position="top" />
      </div>
      <div className={cn('text-xl font-bold tabular-nums leading-none', valueColor)}>{value}</div>
      {barValue !== null && (
        <div className="h-1.5 bg-muted/50 rounded-full overflow-hidden mt-1.5">
          <div className={cn('h-full rounded-full transition-all', barColor ?? 'bg-primary')}
               style={{ width: barWidth(barValue, barMax) }} />
        </div>
      )}
      {note && <p className="text-[9px] text-muted-foreground/60 mt-1 leading-tight truncate">{note}</p>}
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
        {/* Alcance honesto del OEE: es de las evisceradoras, no de toda el área. */}
        <p className="text-[10px] text-muted-foreground/70 mt-1 leading-tight">
          Alcance: las 3 Baader (eviscerado de máquina) + calidad del Grader — <b className="font-medium">no toda el área</b>.
        </p>
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

            {/* ── Fila 1: OEE + A + P + Q ── 2x2 mobile, 4col desde sm */}
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-1.5">
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

            {/* ── Fila 2: MTTR · MTBF · Averías macro (ocultar si solo Grader) ── */}
            {!kpis.graderOnly && (
            <>
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
              <div
                className="bg-muted/20 rounded-lg px-2.5 py-2 border border-border/40 hover:border-border/70 transition-colors"
                title="Averías macro: paros relevantes ≥5min (excluye micro-detenciones y paros operacionales). Son los eventos que cuentan para MTTR/MTBF."
              >
                <div className="text-[10px] font-medium text-muted-foreground leading-tight mb-1">Averías macro</div>
                <div className="text-xl font-bold tabular-nums leading-none">{kpis.failureCount}</div>
                <p className="text-[9px] text-muted-foreground/60 mt-1 leading-tight">
                  paros ≥5min · {kpis.shiftsCount > 1 ? `${kpis.shiftsCount} turnos` : 'turno'}
                </p>
              </div>
            </div>
            {/* Micro-detenciones: se reportan aparte para no inflar el MTTR */}
            {kpis.microCount > 0 && (
              <p className="text-[10px] text-muted-foreground/70 leading-tight px-0.5">
                + {kpis.microCount.toLocaleString('es-CL')} micro-detenciones (&lt;5min, {fmtMin(kpis.microMin)} total) — aparte, no inflan el MTTR.
              </p>
            )}
            </>
            )}

            {/* ── Detalle por máquina (solo con Shoplogix) ──
                Mobile: machineName más estrecho (w-16) + ocultar pz/min target
                que es info no crítica en mobile. Desktop: ancho completo.
                Cada KPI tiene tooltip explicativo (`title`) accesible vía hover
                en desktop y long-press en touch. */}
            {!kpis.graderOnly && <div className="grid gap-1 pt-0.5">
              {kpis.machines.map((m, idx) => {
                const availPctTxt = m.availability !== null ? `${(m.availability * 100).toFixed(0)}%` : 'sin datos'
                const perfPctTxt  = m.performance  !== null ? `${(m.performance  * 100).toFixed(0)}%` : 'sin datos'
                const mttrTxt     = m.mttrMin > 0 ? fmtMin(m.mttrMin) : 'sin paros'
                return (
                <div
                  key={m.machineid}
                  className="flex items-center gap-2 text-[11px] bg-muted/10 rounded px-2 py-1 border border-border/20"
                  title={`${m.machineName} — Baader 142 N°${idx + 1}\nDisponibilidad ${availPctTxt} · Rendimiento ${perfPctTxt} · MTTR ${mttrTxt} · ${m.failureCount} paros`}
                >
                  <span
                    className="text-muted-foreground w-14 sm:w-32 shrink-0 truncate"
                    title={`${m.machineName} — Evisceradora Baader 142 N°${idx + 1}`}
                  >
                    <span className="hidden sm:inline">{m.machineName}</span>
                    <span className="sm:hidden">Ev {idx + 1}</span>
                  </span>
                  <span
                    className={cn('w-10 sm:w-12 tabular-nums', availColor(m.availability))}
                    title={`Disponibilidad: ${availPctTxt}\n% del tiempo planificado en que la máquina estuvo activa (uptime / horario del turno).\n\n≥85% normal · 70-85% bajo · <70% crítico`}
                  >
                    A {pct(m.availability, 0)}
                  </span>
                  <span
                    className={cn('w-10 sm:w-12 tabular-nums', perfColor(m.performance))}
                    title={`Rendimiento: ${perfPctTxt}\n% de la velocidad nominal alcanzada (ciclos reales / ciclos esperados según target ${m.shoplogixTargetCpm?.toFixed(1) ?? '—'} pz/min).\n\n≥90% normal · 75-90% bajo · <75% crítico`}
                  >
                    P {pct(m.performance, 0)}
                  </span>
                  <span
                    className={cn('w-14 sm:w-16 tabular-nums', mttrColor(m.mttrMin))}
                    title={`MTTR (Mean Time To Repair): ${mttrTxt}\nDuración promedio de cada paro. Solo cuenta paros tipo 'Break' (≥5 min).\n\n<5 min excelente · 5-15 min aceptable · >15 min crítico`}
                  >
                    {fmtMin(m.mttrMin)}
                  </span>
                  <span
                    className="text-muted-foreground/60 tabular-nums"
                    title={`Paros: ${m.failureCount} eventos\nCantidad de paros detectados por Shoplogix (intervalos de tipo 'Break' ≥5 min). No incluye micro-detenciones (<5 min).`}
                  >
                    {m.failureCount} <span className="hidden sm:inline">paro{m.failureCount !== 1 ? 's' : ''}</span>
                    <span className="sm:hidden">par</span>
                  </span>
                  {m.shoplogixTargetCpm !== null && (
                    <span
                      className="ml-auto text-muted-foreground/50 tabular-nums hidden sm:inline"
                      title={`Target nominal: ${m.shoplogixTargetCpm.toFixed(1)} piezas/min\nVelocidad de referencia configurada en Shoplogix para esta máquina. Driver del cálculo de Rendimiento (P).`}
                    >
                      {m.shoplogixTargetCpm.toFixed(1)} pz/min
                    </span>
                  )}
                </div>
                )
              })}
            </div>}
          </>
        )}
      </CardContent>
    </Card>
  )
}
