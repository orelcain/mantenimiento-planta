/**
 * PlantKPIBoard — panel de indicadores de rendimiento industrial por planta.
 *
 * Muestra OEE, Disponibilidad, Rendimiento, Calidad, MTTR y MTBF
 * calculados desde el último turno Shoplogix disponible.
 *
 * Cada métrica incluye:
 *   - Valor numérico con barra de color
 *   - Nombre en español + inglés
 *   - Tooltip explicativo (qué es, cómo se calcula, valores de referencia)
 *
 * OEE thresholds (industria pesquera/cárnica):
 *   ≥ 65% → bueno   ≥ 85% → clase mundial   < 50% → crítico
 */

import { useMemo } from 'react'
import { Card, CardContent, CardHeader, CardTitle, Spinner, InfoTooltip } from '@/components/ui'
import { TrendingUp, AlertTriangle } from 'lucide-react'
import { cn } from '@/lib/utils'
import { usePlantKPIs } from '@/hooks/usePlantKPIs'
import type { PlantSlug } from '@/services/shoplogix/shoplogixMachines'
import type { GraderDailySummary } from '@/services/grader/types'

interface Props {
  plantSlug: PlantSlug
  /** Summaries ya cargados en el padre (evita fetch doble). */
  graderSummaries: GraderDailySummary[]
  /** Si false, no mostrar el panel (planta comingSoon). */
  enabled?: boolean
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

// ── Colores por umbral ────────────────────────────────────────────────────────

function oeeColor(v: number | null): string {
  if (v === null) return 'text-muted-foreground'
  if (v >= 0.85) return 'text-emerald-400'
  if (v >= 0.65) return 'text-sky-400'
  if (v >= 0.50) return 'text-amber-400'
  return 'text-rose-400'
}

function availColor(v: number): string {
  if (v >= 0.85) return 'text-emerald-400'
  if (v >= 0.70) return 'text-amber-400'
  return 'text-rose-400'
}

function perfColor(v: number): string {
  if (v >= 0.90) return 'text-emerald-400'
  if (v >= 0.75) return 'text-amber-400'
  return 'text-rose-400'
}

function mttrColor(minutos: number): string {
  if (minutos === 0) return 'text-muted-foreground'
  if (minutos <= 5) return 'text-emerald-400'
  if (minutos <= 15) return 'text-amber-400'
  return 'text-rose-400'
}

function mtbfColor(horas: number): string {
  if (horas === 0) return 'text-muted-foreground'
  if (horas >= 2) return 'text-emerald-400'
  if (horas >= 1) return 'text-amber-400'
  return 'text-rose-400'
}

function barWidth(v: number | null, max = 1): string {
  if (v === null || !Number.isFinite(v)) return '0%'
  return `${Math.min(100, Math.max(0, (v / max) * 100)).toFixed(1)}%`
}

// ── Definiciones bilingües ────────────────────────────────────────────────────

const DEFS = {
  oee: {
    es: 'OEE — Eficiencia Global del Equipo',
    en: 'OEE — Overall Equipment Effectiveness',
    desc: 'Mide el % del tiempo planificado en que la planta produce a velocidad y calidad óptimas.\n\nOEE = Disponibilidad × Rendimiento × Calidad\n\nReferencia industrial:\n  < 50% → crítico\n  50‒65% → aceptable\n  65‒85% → bueno\n  ≥ 85% → clase mundial',
  },
  avail: {
    es: 'Disponibilidad (A)',
    en: 'Availability (A)',
    desc: 'Porcentaje del tiempo productivo programado en que la máquina estuvo operativa.\n\nA = Tiempo de Uptime / (Uptime + Downtime)\n\nCalculado desde los estados Shoplogix de las 3 Baaders.',
  },
  perf: {
    es: 'Rendimiento (P)',
    en: 'Performance (P)',
    desc: 'Velocidad real de producción respecto a la velocidad objetivo configurada en Shoplogix.\n\nP = Ciclos reales / Ciclos esperados (máx. 100%)\n\nSi el objetivo Shoplogix está sobre-configurado, el rendimiento aparecerá artificialmente bajo.',
  },
  quality: {
    es: 'Calidad (Q)',
    en: 'Quality (Q)',
    desc: 'Porcentaje de piezas buenas sobre el total producido.\n\nQ = 1 − P0% del Grader\n(P0% = % de piezas clasificadas en calibre cero / sin valor)\n\nSolo disponible cuando hay datos del Grader para ese turno.',
  },
  mttr: {
    es: 'MTTR — Tiempo Medio de Reparación',
    en: 'MTTR — Mean Time To Repair',
    desc: 'Duración promedio de cada evento de paro (downtime) en la línea.\n\nMTTR = Σ duración de paros / N° de paros\n\nMTTR menor → reparaciones más rápidas → mayor disponibilidad.\n\nReferencia: < 5 min excelente, 5‒15 min aceptable, > 15 min crítico.',
  },
  mtbf: {
    es: 'MTBF — Tiempo Medio Entre Fallos',
    en: 'MTBF — Mean Time Between Failures',
    desc: 'Tiempo promedio que la línea opera sin interrupciones entre un paro y el siguiente.\n\nMTBF = Tiempo de Uptime / N° de paros\n\nMTBF mayor → mayor confiabilidad del equipo.\n\nReferencia: > 2 h excelente, 1‒2 h aceptable, < 1 h bajo.',
  },
}

// ── Sub-componentes ───────────────────────────────────────────────────────────

interface KPICardProps {
  esLabel: string
  enLabel: string
  tooltip: string
  value: string
  valueColor: string
  barValue: number | null
  barMax?: number
  barColor?: string
  note?: string
}

function KPICard({ esLabel, enLabel, tooltip, value, valueColor, barValue, barMax = 1, barColor, note }: KPICardProps) {
  const width = barWidth(barValue, barMax)
  return (
    <div className="bg-muted/20 rounded-lg p-3 space-y-2 border border-border/30">
      <div className="flex items-start justify-between gap-1">
        <div className="min-w-0">
          <div className="text-xs font-medium leading-tight">{esLabel}</div>
          <div className="text-[10px] text-muted-foreground/70 leading-tight">{enLabel}</div>
        </div>
        <InfoTooltip text={tooltip} iconSize={13} position="top" />
      </div>
      <div className={cn('text-2xl font-bold tabular-nums', valueColor)}>{value}</div>
      {barValue !== null && (
        <div className="h-1.5 bg-muted/40 rounded-full overflow-hidden">
          <div
            className={cn('h-full rounded-full transition-all', barColor ?? 'bg-primary')}
            style={{ width }}
          />
        </div>
      )}
      {note && <p className="text-[10px] text-muted-foreground/60">{note}</p>}
    </div>
  )
}

// ── Componente principal ──────────────────────────────────────────────────────

export function PlantKPIBoard({ plantSlug, graderSummaries, enabled = true }: Props) {
  const { loading, error, kpis } = usePlantKPIs(plantSlug, graderSummaries)

  const shiftLabel = useMemo(() => {
    if (!kpis) return null
    const d = new Date(`${kpis.dateKey}T12:00:00`)
    const dayName = d.toLocaleDateString('es-CL', { weekday: 'short' }).replace('.', '')
    const dayNum  = d.getDate()
    const month   = d.toLocaleDateString('es-CL', { month: 'short' }).replace('.', '')
    return `${dayName} ${dayNum} ${month} · ${kpis.shiftId}`
  }, [kpis])

  if (!enabled) return null

  return (
    <Card className="border-border/40">
      <CardHeader className="pb-2">
        <CardTitle className="text-sm flex items-center gap-2">
          <TrendingUp className="w-4 h-4 text-sky-400" />
          Indicadores de Rendimiento
          {shiftLabel && (
            <span className="text-[10px] font-normal text-muted-foreground ml-1">
              · turno base: {shiftLabel}
            </span>
          )}
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        {loading && (
          <div className="flex items-center gap-2 text-muted-foreground text-sm py-2">
            <Spinner /> Cargando…
          </div>
        )}

        {error && (
          <p className="text-xs text-rose-400 flex items-center gap-1">
            <AlertTriangle className="w-3.5 h-3.5" /> {error}
          </p>
        )}

        {!loading && !error && !kpis && (
          <p className="text-xs text-muted-foreground/60 py-2">
            Sin datos Shoplogix disponibles para los últimos 3 días.
          </p>
        )}

        {!loading && kpis && (
          <>
            {/* ── OEE principal ── */}
            <div>
              <KPICard
                esLabel={DEFS.oee.es}
                enLabel={DEFS.oee.en}
                tooltip={DEFS.oee.desc}
                value={kpis.oee !== null ? pct(kpis.oee, 1) : `${pct(kpis.availability)} × ${pct(kpis.performance)} × Q?`}
                valueColor={oeeColor(kpis.oee)}
                barValue={kpis.oee}
                barColor={kpis.oee !== null
                  ? (kpis.oee >= 0.85 ? 'bg-emerald-500' : kpis.oee >= 0.65 ? 'bg-sky-500' : kpis.oee >= 0.5 ? 'bg-amber-500' : 'bg-rose-500')
                  : 'bg-muted'}
                note={kpis.oee === null ? '⚠ Calidad (Q) no disponible — carga el Excel del Grader para completar el OEE' : undefined}
              />
            </div>

            {/* ── A, P, Q ── */}
            <div className="grid grid-cols-3 gap-2">
              <KPICard
                esLabel={DEFS.avail.es}
                enLabel={DEFS.avail.en}
                tooltip={DEFS.avail.desc}
                value={pct(kpis.availability)}
                valueColor={availColor(kpis.availability)}
                barValue={kpis.availability}
                barColor={kpis.availability >= 0.85 ? 'bg-emerald-500' : kpis.availability >= 0.70 ? 'bg-amber-500' : 'bg-rose-500'}
              />
              <KPICard
                esLabel={DEFS.perf.es}
                enLabel={DEFS.perf.en}
                tooltip={DEFS.perf.desc}
                value={pct(kpis.performance)}
                valueColor={perfColor(kpis.performance)}
                barValue={kpis.performance}
                barColor={kpis.performance >= 0.90 ? 'bg-emerald-500' : kpis.performance >= 0.75 ? 'bg-amber-500' : 'bg-rose-500'}
              />
              <KPICard
                esLabel={DEFS.quality.es}
                enLabel={DEFS.quality.en}
                tooltip={DEFS.quality.desc}
                value={kpis.quality !== null ? pct(kpis.quality) : 'N/A'}
                valueColor={kpis.quality !== null
                  ? (kpis.quality >= 0.95 ? 'text-emerald-400' : kpis.quality >= 0.85 ? 'text-amber-400' : 'text-rose-400')
                  : 'text-muted-foreground'}
                barValue={kpis.quality}
                barColor={kpis.quality !== null
                  ? (kpis.quality >= 0.95 ? 'bg-emerald-500' : kpis.quality >= 0.85 ? 'bg-amber-500' : 'bg-rose-500')
                  : undefined}
                note={kpis.quality === null ? 'Sin Grader' : undefined}
              />
            </div>

            {/* ── MTTR, MTBF, N° paros ── */}
            <div className="grid grid-cols-3 gap-2">
              <KPICard
                esLabel={DEFS.mttr.es}
                enLabel={DEFS.mttr.en}
                tooltip={DEFS.mttr.desc}
                value={fmtMin(kpis.mttrMin)}
                valueColor={mttrColor(kpis.mttrMin)}
                barValue={kpis.mttrMin > 0 ? Math.min(1, kpis.mttrMin / 30) : null}
                barColor={kpis.mttrMin <= 5 ? 'bg-emerald-500' : kpis.mttrMin <= 15 ? 'bg-amber-500' : 'bg-rose-500'}
                note="↓ mejor"
              />
              <KPICard
                esLabel={DEFS.mtbf.es}
                enLabel={DEFS.mtbf.en}
                tooltip={DEFS.mtbf.desc}
                value={fmtHours(kpis.mtbfHours)}
                valueColor={mtbfColor(kpis.mtbfHours)}
                barValue={kpis.mtbfHours > 0 ? Math.min(1, kpis.mtbfHours / 4) : null}
                barColor={kpis.mtbfHours >= 2 ? 'bg-emerald-500' : kpis.mtbfHours >= 1 ? 'bg-amber-500' : 'bg-rose-500'}
                note="↑ mejor"
              />
              <div className="bg-muted/20 rounded-lg p-3 space-y-2 border border-border/30">
                <div className="flex items-start justify-between gap-1">
                  <div>
                    <div className="text-xs font-medium">N° Paros</div>
                    <div className="text-[10px] text-muted-foreground/70">Failure Count</div>
                  </div>
                </div>
                <div className="text-2xl font-bold tabular-nums text-foreground">
                  {kpis.failureCount}
                </div>
                <p className="text-[10px] text-muted-foreground/60">Eventos downtime · turno</p>
              </div>
            </div>

            {/* ── Detalle por máquina ── */}
            <div className="space-y-1">
              <p className="text-[10px] text-muted-foreground/60 uppercase tracking-wider">Detalle por máquina</p>
              <div className="grid gap-1.5">
                {kpis.machines.map((m) => (
                  <div
                    key={m.machineid}
                    className="flex items-center gap-2 text-xs bg-muted/10 rounded-md px-2.5 py-1.5 border border-border/20"
                  >
                    <span className="text-muted-foreground w-28 shrink-0 truncate">{m.machineName}</span>
                    <span className={cn('w-14 tabular-nums', availColor(m.availability))}>
                      A: {pct(m.availability, 0)}
                    </span>
                    <span className={cn('w-14 tabular-nums', perfColor(m.performance))}>
                      P: {pct(m.performance, 0)}
                    </span>
                    <span className={cn('w-20 tabular-nums', mttrColor(m.mttrMin))}>
                      MTTR: {fmtMin(m.mttrMin)}
                    </span>
                    <span className="text-muted-foreground/60 tabular-nums">
                      {m.failureCount} paro{m.failureCount !== 1 ? 's' : ''}
                    </span>
                    {m.shoplogixTargetCpm !== null && (
                      <span className="ml-auto text-muted-foreground/50 tabular-nums">
                        obj: {m.shoplogixTargetCpm.toFixed(1)} pz/min
                      </span>
                    )}
                  </div>
                ))}
              </div>
            </div>
          </>
        )}
      </CardContent>
    </Card>
  )
}
