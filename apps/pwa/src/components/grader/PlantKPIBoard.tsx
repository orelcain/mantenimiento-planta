/**
 * PlantKPIBoard — OEE, A, P, Q, MTTR, MTBF con selector Día / Semana / Mes.
 *
 * - Día:    turno más reciente con actividad (auto) o día seleccionado en el calendario.
 * - Semana: 7 días hasta el día seleccionado (o hoy).
 * - Mes:    mes visible en el calendario.
 */

import { useState, useMemo } from 'react'
import { Card, CardContent, CardHeader, CardTitle, Spinner, InfoTooltip } from '@/components/ui'
import { TrendingUp, AlertTriangle, TrendingDown } from 'lucide-react'
import { cn } from '@/lib/utils'
import { Disclosure } from '@/components/piel'
import { usePlantKPIsForPeriod } from '@/hooks/usePlantKPIs'
import type { KpiPeriod } from '@/hooks/usePlantKPIs'
import type { PlantSlug } from '@/services/shoplogix/shoplogixMachines'
import { getPlantLineConfig, getMachineKind, type PlantLineId } from '@/config/plantLines'
import type { GraderDailySummary } from '@/services/grader/types'
import { KPI_CUTOFFS, OEE_GOOD } from '@/services/grader/kpiThresholds'
import { shortMachineName } from '@/services/grader/graderMachineNames'

interface Props {
  plantSlug: PlantSlug
  graderSummaries: GraderDailySummary[]
  enabled?: boolean
  /**
   * Línea/área seleccionada. De acá salen los textos que NO son universales:
   * cómo se llaman las máquinas y qué alcance tiene el OEE. Sin esto el panel
   * decía "las 3 Baader" también en Filete, que tiene una sola máquina.
   */
  plantLineId?: PlantLineId
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

// Cortes de color centralizados en `kpiThresholds` (misma fuente que los avisos de ARIA).
// OEE tiene un 4º tono "sky" (aceptable, no alerta) entre OEE_GOOD y oee.warnBelow.

function oeeColor(v: number | null): string {
  if (v === null) return 'text-muted-foreground'
  if (v >= OEE_GOOD) return 'text-emerald-400'
  if (v >= KPI_CUTOFFS.oee.warnBelow) return 'text-sky-400'
  if (v >= KPI_CUTOFFS.oee.critBelow) return 'text-amber-400'
  return 'text-rose-400'
}

function availColor(v: number | null): string {
  if (v === null) return 'text-muted-foreground'
  if (v >= KPI_CUTOFFS.availability.warnBelow) return 'text-emerald-400'
  if (v >= KPI_CUTOFFS.availability.critBelow) return 'text-amber-400'
  return 'text-rose-400'
}

function perfColor(v: number | null): string {
  if (v === null) return 'text-muted-foreground'
  if (v >= KPI_CUTOFFS.performance.warnBelow) return 'text-emerald-400'
  if (v >= KPI_CUTOFFS.performance.critBelow) return 'text-amber-400'
  return 'text-rose-400'
}

function mttrColor(min: number): string {
  if (min === 0) return 'text-muted-foreground'
  if (min <= KPI_CUTOFFS.mttrMin.warnAbove) return 'text-emerald-400'
  if (min <= KPI_CUTOFFS.mttrMin.critAbove) return 'text-amber-400'
  return 'text-rose-400'
}

function mtbfColor(h: number): string {
  if (h === 0)  return 'text-muted-foreground'
  if (h >= KPI_CUTOFFS.mtbfHours.warnBelow) return 'text-emerald-400'
  if (h >= KPI_CUTOFFS.mtbfHours.critBelow) return 'text-amber-400'
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

/**
 * Un KPI dentro de una tarjeta es un BLOQUE DE TEXTO con aire, no otra tarjeta.
 * Antes cada baldosa traía su propio `border` + fondo: eso es lo que producía el
 * efecto "caja dentro de caja" que hacía ver la pantalla como panel denso.
 * La separación ahora la da la grilla, no el contorno.
 */
function KPICard({ label, tooltip, value, valueColor, barValue, barMax = 1, barColor, note }: KPICardProps) {
  return (
    <div className="px-1 py-1.5">
      <div className="flex items-center justify-between gap-1 mb-1">
        <div className="text-caption font-medium text-muted-foreground leading-tight truncate">{label}</div>
        <InfoTooltip text={tooltip} iconSize={11} position="top" />
      </div>
      <div className={cn('text-xl font-bold tabular-nums leading-none', valueColor)}>{value}</div>
      {barValue !== null && (
        <div className="h-1.5 bg-muted/50 rounded-full overflow-hidden mt-1.5">
          <div className={cn('h-full rounded-full transition-all', barColor ?? 'bg-primary')}
               style={{ width: barWidth(barValue, barMax) }} />
        </div>
      )}
      {note && <p className="text-caption text-muted-foreground/60 mt-1 leading-tight truncate">{note}</p>}
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
  plantLineId,
  selectedDateKey = null,
  currentMonth,
}: Props) {
  const [period, setPeriod] = useState<KpiPeriod>('day')
  const effectiveMonth = currentMonth ?? new Date()
  const lineCfg     = getPlantLineConfig(plantLineId)
  const machineKind = getMachineKind(plantLineId)
  /** Líneas que no clasifican (Yal, Filete) no tienen Calidad: no es un dato faltante. */
  const classifies  = lineCfg.isClassificationPlant !== false
  const scopeNote   = lineCfg.kpiScopeNote
    ?? 'Alcance: las 3 Baader (eviscerado de máquina) + calidad del Grader — no toda el área.'

  const { loading, error, kpis } = usePlantKPIsForPeriod(
    plantSlug,
    period,
    selectedDateKey,
    effectiveMonth,
    graderSummaries,
  )

  // Diagnóstico "¿qué Baader arrastra la línea?" — PIEZAS PERDIDAS, no A×R.
  //
  // Antes ordenábamos por OEE de máquina (A×R). Eso es inválido para comparar
  // entre sí a las 3 Baader: R se mide contra el target de cada una, y no son
  // el mismo modelo. La Evisceradora 3 es la antigua (19 pz/min); las 1 y 2 son
  // el modelo nuevo (16 pz/min). Alimentadas parejo, la Ev3 entrega MÁS piezas
  // y su R sale ~12 pts más bajo → el board acusaba justo a la mejor máquina.
  //
  // Las piezas perdidas se miden contra la cadencia de la LÍNEA (referencia
  // común), no contra el target propio: así la máquina con más capacidad no
  // queda castigada por tenerla. Ver `computeLostPieces`.
  const machineDiag = useMemo(() => {
    if (!kpis || kpis.graderOnly) return null
    const withData = kpis.machines
      .filter((m) => (m.totalCycles ?? 0) > 0)
      .map((m) => {
        const lost = m.lostBySpeed + m.lostByStops
        return {
          id: m.machineid,
          name: m.machineName,
          lost,
          lostByStops: m.lostByStops,
          stopsPct: lost > 0 ? m.lostByStops / lost : 0,
          dominant: m.lostByStops >= m.lostBySpeed ? ('paros' as const) : ('velocidad' as const),
        }
      })
    if (withData.length < 2) return null
    const sorted = [...withData].sort((x, y) => y.lost - x.lost)
    const worst = sorted[0]!
    const best = sorted[sorted.length - 1]!
    // Sin diferencia material entre máquinas (<15% sobre la mejor) → no señalar a nadie.
    if (worst.lost <= 0 || worst.lost - best.lost < worst.lost * 0.15) return null
    return { worst }
  }, [kpis])

  if (!enabled) return null

  return (
    <Card className="border-0 shadow-[0_1px_4px_rgba(0,0,0,0.05)] dark:shadow-none">
      <CardHeader className="pb-2">
        <div className="flex items-center justify-between gap-2 flex-wrap">
          <CardTitle className="text-sm flex items-center gap-2">
            <TrendingUp className="w-4 h-4 text-sky-400" />
            Indicadores de Rendimiento
            {kpis && (
              <span className="text-caption font-normal text-muted-foreground">
                · {kpis.periodLabel}
                {kpis.shiftsCount > 1 && (
                  <span className="text-muted-foreground/60"> ({kpis.shiftsCount} turnos)</span>
                )}
              </span>
            )}
          </CardTitle>

          {/* Selector Día / Semana / Mes */}
          <div className="flex gap-0.5 bg-muted rounded-ctl p-0.5">
            {PERIODS.map(p => (
              <button
                key={p.id}
                onClick={() => setPeriod(p.id)}
                className={cn(
                  'px-2 py-0.5 text-caption font-medium rounded-ctl transition-colors',
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
        <p className="text-caption text-muted-foreground/70 mt-1 leading-tight">{scopeNote}</p>
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
              <p className="text-caption text-sky-400/80 flex items-center gap-1 pb-0.5">
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
                <p className="text-caption text-amber-400/90 flex items-start gap-1 pb-0.5">
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
                  ? (kpis.oee >= OEE_GOOD ? 'bg-emerald-500' : kpis.oee >= KPI_CUTOFFS.oee.warnBelow ? 'bg-sky-500' : kpis.oee >= KPI_CUTOFFS.oee.critBelow ? 'bg-amber-500' : 'bg-rose-500')
                  : 'bg-muted'}
                note={kpis.graderOnly ? 'Sin Shoplogix' : kpis.oee === null ? (classifies ? 'Sin Q' : 'A·P solamente') : undefined}
              />
              <KPICard
                label="Disponibilidad"
                tooltip={DEFS.avail.desc}
                value={kpis.availability !== null ? pct(kpis.availability) : '—'}
                valueColor={availColor(kpis.availability)}
                barValue={kpis.availability}
                barColor={kpis.availability !== null
                  ? (kpis.availability >= KPI_CUTOFFS.availability.warnBelow ? 'bg-emerald-500' : kpis.availability >= KPI_CUTOFFS.availability.critBelow ? 'bg-amber-500' : 'bg-rose-500')
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
                  ? (kpis.performance >= KPI_CUTOFFS.performance.warnBelow ? 'bg-emerald-500' : kpis.performance >= KPI_CUTOFFS.performance.critBelow ? 'bg-amber-500' : 'bg-rose-500')
                  : undefined}
                note={kpis.graderOnly ? 'Sin Shoplogix' : undefined}
              />
              <KPICard
                label="Calidad"
                tooltip={DEFS.quality.desc}
                value={kpis.quality !== null ? pct(kpis.quality) : 'N/A'}
                valueColor={kpis.quality !== null
                  ? (kpis.quality >= KPI_CUTOFFS.quality.warnBelow ? 'text-emerald-400' : kpis.quality >= KPI_CUTOFFS.quality.critBelow ? 'text-amber-400' : 'text-rose-400')
                  : 'text-muted-foreground'}
                barValue={kpis.quality}
                barColor={kpis.quality !== null
                  ? (kpis.quality >= KPI_CUTOFFS.quality.warnBelow ? 'bg-emerald-500' : kpis.quality >= KPI_CUTOFFS.quality.critBelow ? 'bg-amber-500' : 'bg-rose-500')
                  : undefined}
                note={kpis.quality === null ? (classifies ? 'Sin Grader' : 'No clasifica') : undefined}
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
                barColor={kpis.mttrMin <= KPI_CUTOFFS.mttrMin.warnAbove ? 'bg-emerald-500' : kpis.mttrMin <= KPI_CUTOFFS.mttrMin.critAbove ? 'bg-amber-500' : 'bg-rose-500'}
              />
              <KPICard
                label="MTBF ↑"
                tooltip={DEFS.mtbf.desc}
                value={fmtHours(kpis.mtbfHours)}
                valueColor={mtbfColor(kpis.mtbfHours)}
                barValue={kpis.mtbfHours > 0 ? Math.min(1, kpis.mtbfHours / 4) : null}
                barColor={kpis.mtbfHours >= KPI_CUTOFFS.mtbfHours.warnBelow ? 'bg-emerald-500' : kpis.mtbfHours >= KPI_CUTOFFS.mtbfHours.critBelow ? 'bg-amber-500' : 'bg-rose-500'}
              />
              <div
                className="px-1 py-1.5"
                title="Averías macro: paros relevantes ≥5min (excluye micro-detenciones y paros operacionales). Son los eventos que cuentan para MTTR/MTBF."
              >
                <div className="text-caption font-medium text-muted-foreground leading-tight mb-1">Averías macro</div>
                <div className="text-xl font-bold tabular-nums leading-none">{kpis.failureCount}</div>
                <p className="text-caption text-muted-foreground/60 mt-1 leading-tight">
                  paros ≥5min · {kpis.shiftsCount > 1 ? `${kpis.shiftsCount} turnos` : 'turno'}
                </p>
              </div>
            </div>
            {/* Micro-detenciones: se reportan aparte para no inflar el MTTR */}
            {kpis.microCount > 0 && (
              <p className="text-caption text-muted-foreground/70 leading-tight px-0.5">
                + {kpis.microCount.toLocaleString('es-CL')} micro-detenciones (&lt;5min, {fmtMin(kpis.microMin)} total) — aparte, no inflan el MTTR.
              </p>
            )}
            </>
            )}

            {/* Diagnóstico: ¿qué Baader arrastra la línea? (piezas perdidas) */}
            {machineDiag && (
              <div className="flex items-start gap-1.5 rounded-ctl bg-amber-500/[0.15] px-2.5 py-2 text-caption text-ink-warn">
                <TrendingDown className="w-3 h-3 shrink-0 mt-0.5" />
                <span
                  title={`Piezas perdidas = lo que dejó de aportar a la línea, medido contra la cadencia de la propia línea:\n· por paros: minutos detenida × cadencia de la línea\n· por velocidad: solo si corre MÁS LENTO que sus pares\n\nNo se compara el Rendimiento (%) entre máquinas: las 3 Baader no tienen la misma capacidad (la Evisceradora 3 es el modelo antiguo, 19 pz/min; las otras dos el nuevo, 16 pz/min), así que su % no es comparable.`}
                >
                  <b className="font-semibold">La que más arrastra:</b> {machineDiag.worst.name} —{' '}
                  <b>{Math.round(machineDiag.worst.lost).toLocaleString('es-CL')} piezas perdidas</b>
                  {' '}({pct(machineDiag.worst.stopsPct, 0)} por paros) · pérdida dominante:{' '}
                  <b>{machineDiag.worst.dominant === 'paros' ? 'Paros (disponibilidad)' : 'Velocidad (micro-paradas / cadencia)'}</b>.
                </span>
              </div>
            )}

            {/* ── Detalle por máquina (solo con Shoplogix) ──
                Mobile: machineName más estrecho (w-16) + ocultar pz/min target
                que es info no crítica en mobile. Desktop: ancho completo.
                Cada KPI tiene tooltip explicativo (`title`) accesible vía hover
                en desktop y long-press en touch. */}
            {/* §22: los KPI de arriba responden "¿cómo va el turno?". El desglose
                POR MÁQUINA es el siguiente nivel — se consulta cuando ya se sabe
                que algo anda mal y hay que ver cuál. Va en línea para no crear
                tarjeta dentro de tarjeta (§7). */}
            {!kpis.graderOnly && (
            <Disclosure
              variant="inline"
              title="Ver detalle por máquina"
              summary={`${kpis.machines.length} máquina${kpis.machines.length === 1 ? '' : 's'}`}
              defaultOpen={false}
              storageKey="grader-detalle-maquinas"
            >
            <div className="grid gap-1 pt-0.5">
              {kpis.machines.map((m, idx) => {
                const availPctTxt = m.availability !== null ? `${(m.availability * 100).toFixed(0)}%` : 'sin datos'
                const perfPctTxt  = m.performance  !== null ? `${(m.performance  * 100).toFixed(0)}%` : 'sin datos'
                const mttrTxt     = m.mttrMin > 0 ? fmtMin(m.mttrMin) : 'sin paros'
                const isWorst     = machineDiag?.worst.id === m.machineid
                return (
                <div
                  key={m.machineid}
                  className={cn(
                    'flex items-center gap-2 rounded-ctl px-2 py-1.5 text-caption',
                    isWorst && 'ring-1 ring-amber-500/40 bg-amber-500/[0.04]',
                  )}
                  title={`${shortMachineName(m.machineName)} — ${machineKind.long}${kpis.machines.length > 1 ? ` N°${idx + 1}` : ''}\nDisponibilidad ${availPctTxt} · Rendimiento ${perfPctTxt} · MTTR ${mttrTxt} · ${m.failureCount} paros${isWorst ? '\n⚠ La que más piezas pierde del grupo' : ''}`}
                >
                  {isWorst && <AlertTriangle className="w-2.5 h-2.5 text-amber-400 shrink-0" />}
                  <span
                    className="text-muted-foreground w-14 sm:w-32 shrink-0 truncate"
                    title={`${shortMachineName(m.machineName)} — ${machineKind.long}${kpis.machines.length > 1 ? ` N°${idx + 1}` : ''}`}
                  >
                    <span className="hidden sm:inline">{shortMachineName(m.machineName)}</span>
                    <span className="sm:hidden">{machineKind.short} {idx + 1}</span>
                  </span>
                  <span
                    className={cn('w-10 sm:w-12 tabular-nums', availColor(m.availability))}
                    title={`Disponibilidad: ${availPctTxt}\n% del tiempo planificado en que la máquina estuvo activa (uptime / horario del turno).\n\n≥85% normal · 70-85% bajo · <70% crítico`}
                  >
                    A {pct(m.availability, 0)}
                  </span>
                  <span
                    className={cn('w-10 sm:w-12 tabular-nums', perfColor(m.performance))}
                    title={`Rendimiento: ${perfPctTxt}\n% de la velocidad nominal alcanzada (ciclos reales / ciclos esperados según target ${m.shoplogixTargetCpm?.toFixed(1) ?? '—'} pz/min).\n\n≥90% normal · 75-90% bajo · <75% crítico${kpis.machines.length > 1 ? '\n\n⚠ NO comparable entre máquinas: cada una se mide contra su propio target y no todas tienen la misma capacidad. Para comparar, usar piezas perdidas.' : ''}`}
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
            </div>
            </Disclosure>
            )}
          </>
        )}
      </CardContent>
    </Card>
  )
}
