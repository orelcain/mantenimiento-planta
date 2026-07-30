/**
 * Panel "Línea upstream" — muestra el estado de las 3 Baaders 142 evisceradoras
 * (upstream del Grader) durante el mismo turno, para correlacionar paros y
 * ritmos con los P0 del Grader.
 *
 * Diseño inspirado en la UI de Shoplogix (saas139.shoplogix.com):
 *   - Header con nombre + ritmo vs objetivo
 *   - Gantt horizontal con paros coloreados + leyenda de durations abajo
 *   - Bar chart de producción por intervalo de 5 min + línea objetivo
 *   - KPI row: piezas en verde/amarillo/rojo (%) como en Shoplogix
 *   - Expandable: click para ver detalle completo por máquina
 *
 * Data viene de Shoplogix (Cloud Function — Fase 2b). Mientras tanto,
 * en DEV usa datos sintéticos realistas (shoplogixDemoData).
 */

import { useState, useMemo, useEffect, useRef } from 'react'
import { cn } from '@/lib/utils'
import { Card, CardContent, Badge } from '@/components/ui'
import {
  ChevronDown, ChevronRight, Factory, Activity, AlertCircle, Zap,
  TrendingUp, TrendingDown, Timer, Gauge, Pause, AlertTriangle, Download, MessageSquare,
} from 'lucide-react'
import type {
  UpstreamLineSnapshot,
  UpstreamMachineShift,
  UpstreamProductionInterval,
  UpstreamMachineState,
  UpstreamShiftComment,
} from '@/services/shoplogix/types'
import type { Pause as GraderPause } from '@/services/grader/types'
import { correlatePausesWithUpstream, summarizeCorrelations } from '@/services/shoplogix/shoplogixCorrelation'
import { matchCommentsToStates } from '@/services/shoplogix/shoplogixCommentMatch'
import {
  reachedStatusFromPct,
  reachedStatusColor,
  reachedStatusLabel,
  detectMicroAnomalies,
  isStaleSync,
  varianceDirection,
  varianceLabel,
  varianceColor,
  REACHED_PCT_THRESHOLDS,
  SYNC_STALE_MINUTES,
} from '@/services/grader/graderUpstreamHealth'
import ReactECharts from 'echarts-for-react'
import { animate, stagger } from 'animejs'
import type { MachineTrendPoint } from '@/services/shoplogix/shoplogixShift.service'
import type { PlantSlug } from '@/services/shoplogix/shoplogixMachines'
import { machineTypeLabel, lineMachinesLabel } from '@/services/shoplogix/shoplogixMachines'
import { useTimelineSyncOptional } from './useTimelineSync'
import { StateTimelineEC } from './StateTimelineEC'
import { ProductionBarsEC } from './ProductionBarsEC'
import { ProductionRateLineEC } from './ProductionRateLineEC'
import { StateDetailPanel } from './StateDetailPanel'
import { LossCascadeCard } from './LossCascadeCard'
import { exportCombinedTimelinePng } from './exportCombinedTimelinePng'
import { fmtTime, fmtDurationSec } from '@/services/grader/graderTimeFormat'
import { slxStateColor } from '@/services/shoplogix/shoplogixColors'
import { logger } from '@/lib/logger'
import { softenAccentHex } from '@/lib/softenColor'

interface Props {
  snapshot: UpstreamLineSnapshot | null | undefined
  loading?: boolean
  error?: string | null
  defaultCollapsed?: boolean
  syncedAt?: Date | null
  /**
   * Ventana temporal del turno del Grader para alinear el eje X del Gantt.
   * Si se provee, el Gantt se renderiza sobre este rango (con gaps donde
   * Baader no tenga datos) — permite comparar visualmente paros Grader vs Baader.
   */
  shiftWindow?: {
    startAt: string  // ISO
    endAt: string
  } | null
  /**
   * Paros del Grader (≥5min) — usados para detectar paros coincidentes con
   * paros upstream y mostrar badge "⚠ N coincidencias" en el header (F5b).
   */
  pauses?: GraderPause[]
  /**
   * Slug de la planta — necesario para cargar la tendencia histórica de cada
   * máquina al expandirla. Default 'chonchi' si no se provee.
   */
  plantSlug?: PlantSlug
  /** true = el eje está acotado a la operación real (turno sin acotar en Shoplogix). */
  framedOnProduction?: boolean
  /** Alterna entre operación real y turno completo. Ausente = sin datos para acotar. */
  onToggleFraming?: () => void
  /**
   * Fuente de los datos: 'firestore' (real), 'demo' (sintético DEV), 'none'.
   * Se muestra badge "DEMO" cuando es demo. La detección de desfase SLX
   * se desactiva automáticamente para datos demo.
   */
  dataSource?: 'firestore' | 'demo' | 'none'
}

// ============================================================================
// Alineación pixel-perfect con el chart ECharts del Grader (ShiftTimelineView)
// ============================================================================
// El plot area del ECharts del Grader queda en:
//   - x_inicio = CardContent.paddingLeft (24px de p-6) + grid.left (40px) = 64px
//   - x_fin    = ancho_card - CardContent.paddingRight (24px) - grid.right (16px) = ancho_card - 40px
// Este panel usa CardContent con `px-4` (16px), así que para que el Gantt
// arranque/termine en los mismos píxeles X que el plot del Grader necesitamos:
//   - paddingLeft  extra del wrapper del Gantt = 64 - 16 = 48px
//   - paddingRight extra del wrapper del Gantt = 40 - 16 = 24px
// Si cambia `grid` en ShiftTimelineView o `px-*` aquí, recalcular.
const PLOT_LEFT_PAD_PX  = 48
const PLOT_RIGHT_PAD_PX = 24

// ============================================================================
// Helpers de formato
// ============================================================================

/**
 * Shoplogix guarda los timestamps como wall-clock LOCAL Chile pero formateados
 * AS-IF UTC (ej. `20260226T132711` representa las 13:27 hora Chile, NO UTC).
 * Cuando `parseShoplogixTime` los convierte a Date con sufijo `Z`, los métodos
 * `getUTCHours/Minutes` devuelven exactamente el valor wall-clock que el
 * operador ve en la planta. NO conviertas a TZ — solo extrae UTC components.
 *
 * (Verificado con datos reales Feb 26: COLACION segments en Shoplogix marcan
 * 13:27–14:39 que corresponde a la hora real de almuerzo en Chile, no 10:27.)
 */

function fmtPct(x: number, decimals = 1): string {
  if (!isFinite(x)) return '—'
  return `${(x * 100).toFixed(decimals)}%`
}

function fmtInt(n: number): string {
  if (!isFinite(n)) return '—'
  return Math.round(n).toLocaleString('es-CL')
}

// ============================================================================
// Agregados por máquina (como Shoplogix summary)
// ============================================================================

interface MachineKpis {
  greenCycles: number    // intervalos en verde
  yellowCycles: number
  redCycles: number
  greenPct: number       // del total
  yellowPct: number
  redPct: number
  totalProduced: number
  totalExpected: number
  reachedPct: number     // % de lo esperado (producido/expected)
}

function computeKpis(intervals: UpstreamProductionInterval[]): MachineKpis {
  let green = 0, yellow = 0, red = 0, total = 0, expected = 0
  for (const it of intervals) {
    if (it.expectedCycles <= 0) continue  // ignora intervalos sin objetivo
    total    += it.cycles
    expected += it.expectedCycles
    if      (it.color === 'green')  green  += it.cycles
    else if (it.color === 'yellow') yellow += it.cycles
    else if (it.color === 'red')    red    += it.cycles
  }
  const base = Math.max(1, total)
  return {
    greenCycles: green, yellowCycles: yellow, redCycles: red,
    greenPct: green / base, yellowPct: yellow / base, redPct: red / base,
    totalProduced: total, totalExpected: expected,
    reachedPct: expected > 0 ? total / expected : 0,
  }
}

/**
 * Ciclo = segundos por pescado (1 ciclo = 1 pez), la "velocidad" de la Baader.
 *   real  = tiempo REAL corriendo / piezas = uptimeSec / totalCycles
 *   ideal = 300s (bucket 5min) / piezas objetivo del bucket = 300 / expectedCycles
 * Es el mismo concepto que el Rendimiento, pero en tiempo/pieza (más intuitivo
 * para el operador: "voy 0.2s lento" en vez de "rindo 91%"). Coincide con el
 * "Ciclo" de la vista de análisis de Shoplogix. Ver project_oee_doble_conteo_shoplogix.
 */
function computeCiclo(
  shift: UpstreamMachineShift,
): { realSec: number; idealSec: number | null; deltaSec: number | null } | null {
  const uptimeSec = shift.shiftRuntimeBreakdown?.uptimeSec ?? 0
  const cycles = shift.totalCycles ?? 0
  if (uptimeSec <= 0 || cycles <= 0) return null
  const realSec = uptimeSec / cycles
  const target = shift.intervals.find((iv) => iv.expectedCycles > 0)?.expectedCycles ?? 0
  const idealSec = target > 0 ? 300 / target : null // bucket de 5 min = 300 s
  return { realSec, idealSec, deltaSec: idealSec != null ? realSec - idealSec : null }
}

/** Agrega estados por reason para la leyenda. */
interface ReasonAggregate {
  reason: string
  color: string
  durationSec: number
  count: number
}

function aggregateStatesByReason(states: UpstreamMachineState[]): ReasonAggregate[] {
  const map = new Map<string, ReasonAggregate>()
  for (const s of states) {
    if (s.type === 'uptime') continue  // solo paros
    const key = s.reason || s.name     // si no tiene reason, usa name ("Micro Detencion")
    // Color semántico (mismo helper que StateTimelineEC → leyenda siempre consistente)
    const color = slxStateColor(s.type, s.reason, s.color)
    const existing = map.get(key)
    if (existing) {
      existing.durationSec += s.durationSec
      existing.count += 1
    } else {
      map.set(key, { reason: key, color, durationSec: s.durationSec, count: 1 })
    }
  }
  return Array.from(map.values()).sort((a, b) => b.durationSec - a.durationSec)
}

/**
 * Pareto horizontal de causas de paro — muestra top 4 razones ordenadas por
 * duración con barras proporcionales al total de downtime.
 *
 * anime.js v4: anima scaleX 0→1 con stagger al montar o cuando cambian los datos
 * (nueva sincronización con Shoplogix). Respeta prefers-reduced-motion.
 * Patrón idéntico al sweep del calendario (GraderHistoricalCalendar).
 */
function DowntimeParetoBar({ reasons }: { reasons: ReasonAggregate[] }) {
  const containerRef = useRef<HTMLDivElement>(null)
  const top = reasons.slice(0, 4)
  // Denominador = suma de TODOS los paros (no solo top 4) → % correcto del total downtime
  const totalSec = reasons.reduce((a, r) => a + r.durationSec, 0)

  useEffect(() => {
    if (!containerRef.current || top.length === 0) return
    const prefersReduced =
      typeof window !== 'undefined' &&
      window.matchMedia?.('(prefers-reduced-motion: reduce)').matches
    if (prefersReduced) return
    const bars = containerRef.current.querySelectorAll<HTMLElement>('[data-pareto-bar]')
    if (bars.length === 0) return
    animate(bars, {
      scaleX: [0, 1],
      duration: 380,
      delay: stagger(55),
      ease: 'outExpo',
    })
  }, [reasons])  // re-anima cuando llegan datos nuevos de Shoplogix

  if (top.length === 0) return null

  return (
    <div ref={containerRef} className="space-y-[5px] pt-0.5">
      {top.map(r => {
        const pct = totalSec > 0 ? (r.durationSec / totalSec) * 100 : 0
        return (
          <div
            key={r.reason}
            className="flex items-center gap-1.5 text-[10px]"
            title={`${r.reason || 'Sin categoría'} · ${r.count} evento${r.count !== 1 ? 's' : ''} · ${fmtDurationSec(r.durationSec)} total`}
          >
            {/* Color del state (viene de Shoplogix, #ff0000 crudo → −50% croma) */}
            <span
              className="w-2 h-2 rounded-sm shrink-0 ring-1 ring-slate-900/60"
              style={{ backgroundColor: softenAccentHex(r.color) }}
            />
            {/* Etiqueta — desktop: width fija 7.5rem + truncate.
                Mobile: max 9rem + line-clamp-2 (puede ocupar 2 líneas). */}
            <span className="text-foreground shrink-0 w-[7.5rem] sm:w-[7.5rem] truncate sm:truncate leading-tight">
              {r.reason || 'Sin categoría'}
            </span>
            {/* Barra proporcional — transformOrigin left para el scaleX 0→1 */}
            <div className="flex-1 h-1.5 bg-muted/80 rounded-full overflow-hidden min-w-0">
              <div
                data-pareto-bar=""
                className="h-full rounded-full opacity-80"
                style={{
                  width: `${Math.max(pct, 1)}%`,
                  backgroundColor: softenAccentHex(r.color),
                  transformOrigin: 'left center',
                }}
              />
            </div>
            {/* Duración */}
            <span className="text-muted-foreground tabular-nums shrink-0 w-12 text-right">
              {fmtDurationSec(r.durationSec)}
            </span>
            {/* % del total downtime */}
            <span className="text-muted-foreground tabular-nums shrink-0 w-7 text-right">
              {pct.toFixed(0)}%
            </span>
          </div>
        )
      })}
    </div>
  )
}

/**
 * Barra apilada de disponibilidad: verde (uptime) | ámbar (breaks programados)
 * | rojo (downtime no planificado). Proporciones sobre tiempo productivo
 * (excluye post-turno plannedDowntimeSec). Reemplaza el texto "73.7% runtime"
 * con un visual compacto + número.
 *
 * Sin anime.js: la barra es estática, la animación de fill ya está en el Pareto.
 * overflow-hidden en el wrapper garantiza que los segmentos no se superpongan.
 */
function ShiftAvailabilityBar({
  breakdown,
  shiftRuntime,
}: {
  breakdown: UpstreamMachineShift['shiftRuntimeBreakdown']
  shiftRuntime: number
}) {
  const productive =
    breakdown.uptimeSec + breakdown.breakSec + breakdown.downtimeSec + breakdown.setupSec

  if (productive === 0) {
    return (
      <span className="flex items-center gap-1">
        <Timer className="w-3 h-3" /> {fmtPct(shiftRuntime)} runtime
      </span>
    )
  }

  const upPct    = (breakdown.uptimeSec   / productive) * 100
  const breakPct = (breakdown.breakSec    / productive) * 100
  const downPct  = (breakdown.downtimeSec / productive) * 100
  const setupPct = (breakdown.setupSec    / productive) * 100

  const tooltip = [
    `↑ Uptime:     ${fmtDurationSec(breakdown.uptimeSec)} (${upPct.toFixed(0)}%)`,
    `⏸ Breaks:     ${fmtDurationSec(breakdown.breakSec)} (${breakPct.toFixed(0)}%)`,
    `✕ Downtime:   ${fmtDurationSec(breakdown.downtimeSec)} (${downPct.toFixed(0)}%)`,
    breakdown.setupSec > 0
      ? `⚙ Setup:      ${fmtDurationSec(breakdown.setupSec)} (${setupPct.toFixed(0)})%`
      : null,
    `─ Post-turno: ${fmtDurationSec(breakdown.plannedDowntimeSec)} (excluido)`,
  ].filter(Boolean).join('\n')

  return (
    <span className="flex items-center gap-1.5" title={tooltip}>
      <Timer className="w-3 h-3 shrink-0" />
      {/* Barra apilada — overflow-hidden recorta los divs al borde redondeado */}
      <div className="flex h-2 w-14 rounded-full overflow-hidden bg-muted/60 shrink-0">
        {upPct    > 0 && <div className="h-full bg-emerald-500/75" style={{ width: `${upPct}%`    }} />}
        {breakPct > 0 && <div className="h-full bg-amber-500/70"   style={{ width: `${breakPct}%` }} />}
        {downPct  > 0 && <div className="h-full bg-rose-500/70"    style={{ width: `${downPct}%`  }} />}
        {setupPct > 0 && <div className="h-full bg-violet-500/60"  style={{ width: `${setupPct}%` }} />}
      </div>
      <span className="tabular-nums">{fmtPct(shiftRuntime)}</span>
    </span>
  )
}

/**
 * Gráfico de tendencia histórica de una máquina — últimos N turnos del mismo tipo.
 * Dual-line: ritmo% (sky) + uptime% (emerald dashed). Altura 80px, sin zoom.
 * Cargado lazy al expandir la MachineRow.
 */
/** @public — importado en GraderHistoricalCalendar para la vista panorámica del home */
export function MachineTrendMiniChart({ points }: { points: MachineTrendPoint[] }) {
  if (points.length < 2) {
    return (
      <p className="text-[10px] text-muted-foreground italic py-1">
        Sin suficientes turnos históricos aún (mín. 2)
      </p>
    )
  }

  const labels = points.map(p => {
    const d = new Date(`${p.dateKey}T12:00:00`)
    return d.toLocaleDateString('es-CL', { day: '2-digit', month: '2-digit' })
  })

  const option = {
    backgroundColor: 'transparent',
    grid: { left: 28, right: 6, top: 6, bottom: 20, containLabel: false },
    xAxis: {
      type:      'category' as const,
      data:      labels,
      axisLabel: { color: '#475569', fontSize: 8 },
      axisLine:  { lineStyle: { color: '#1e293b' } },
      axisTick:  { show: false },
    },
    yAxis: {
      type:  'value' as const,
      min:   0,
      max:   100,
      axisLabel: { color: '#475569', fontSize: 8, formatter: (v: number) => `${v}` },
      splitLine: { lineStyle: { color: '#1e293b', type: 'dashed' as const } },
      axisLine:  { show: false },
    },
    tooltip: {
      trigger: 'axis' as const,
      backgroundColor: '#1f2937',
      borderColor:     '#374151',
      textStyle:       { color: '#f1f5f9', fontSize: 10 },
      formatter: (params: { color: string; seriesName: string; value: number; dataIndex: number }[]) => {
        if (!params.length) return ''
        const dk = points[params[0]!.dataIndex]?.dateKey ?? ''
        const rows = params
          .map(p => `<span style="color:${p.color}">●</span> ${p.seriesName}: <b>${p.value.toFixed(0)}%</b>`)
          .join('<br/>')
        return `<div style="font-size:9px;color:#94a3b8">${dk}</div>${rows}`
      },
    },
    series: [
      {
        name:        'Ritmo',
        type:        'line' as const,
        data:        points.map(p => +(p.overallRatio * 100).toFixed(1)),
        smooth:      0.3,
        symbol:      'circle',
        symbolSize:  4,
        lineStyle:   { color: 'rgba(56,189,248,0.9)',  width: 1.5 },
        itemStyle:   { color: 'rgba(56,189,248,0.9)'  },
        areaStyle:   { color: 'rgba(56,189,248,0.06)' },
      },
      {
        name:        'Uptime',
        type:        'line' as const,
        data:        points.map(p => +(p.shiftRuntime * 100).toFixed(1)),
        smooth:      0.3,
        symbol:      'diamond',
        symbolSize:  4,
        lineStyle:   { color: 'rgba(52,211,153,0.9)', width: 1.5, type: 'dashed' as const },
        itemStyle:   { color: 'rgba(52,211,153,0.9)' },
      },
    ],
  }

  return (
    <ReactECharts
      option={option}
      style={{ height: 80, width: '100%' }}
      opts={{ renderer: 'canvas' }}
    />
  )
}

/** Promedio móvil centrado de `windowSize` puntos, ignorando huecos (null). */
function movingAverage(values: Array<number | null>, windowSize: number): Array<number | null> {
  const half = Math.floor(windowSize / 2)
  return values.map((_, i) => {
    const lo = Math.max(0, i - half)
    const hi = Math.min(values.length - 1, i + half)
    const slice = values.slice(lo, hi + 1).filter((v): v is number => v != null)
    if (slice.length === 0) return null
    return slice.reduce((a, b) => a + b, 0) / slice.length
  })
}

/**
 * Tendencia de uptime por turno — barras diarias (dato honesto: un turno sin
 * proceso es simplemente un hueco, no una línea que sugiere continuidad
 * inexistente) + línea de promedio móvil de 5 días para leer la tendencia real
 * sin que el ruido día-a-día la esconda. Opción "M" elegida por Orel 2026-07-22
 * sobre línea pura (L) y barras agrupadas sin promedio (B).
 *
 * Un solo turno a la vez (selector fuera de este componente) — comparar T2 vs
 * T3 en la misma barra confundía más de lo que aclaraba; el selector resuelve
 * lo mismo sin amontonar.
 */
export function TrendBarsWithMovingAverage({
  dateKeys,
  series,
  height = 230,
}: {
  dateKeys: string[]
  /** Una barra por serie y por día; cada serie trae su propia línea de promedio. */
  series: Array<{ name: string; color: string; points: MachineTrendPoint[] }>
  height?: number
}) {
  // Etiqueta = solo el NÚMERO de día ("02", "03"...): caben los 31 sin saltarse
  // ninguno (el pedido de Orel: "el 4 no sale" era el eje mostrando día por medio).
  const labels = dateKeys.map((dk) => dk.slice(8))
  const built = series.map((s) => {
    const byDate = new Map(s.points.map((p) => [p.dateKey, +(p.shiftRuntime * 100).toFixed(1)]))
    const values = dateKeys.map((dk) => byDate.get(dk) ?? null)
    return { ...s, values, avg: movingAverage(values, 5) }
  })
  const hasAnyData = built.some((s) => s.values.some((v) => v != null))
  if (!hasAnyData) {
    return (
      <p className="text-[10px] text-muted-foreground italic py-1">
        Sin datos de este turno en el mes aún
      </p>
    )
  }
  // Días donde NINGUNA serie tiene dato → marcador explícito "sin proceso"
  // (un guión gris al pie), para distinguir "no se procesó" de "uptime 0%".
  const emptyMarkers = dateKeys
    .map((_, i) => (built.every((s) => s.values[i] == null) ? [i, 2.5] as [number, number] : null))
    .filter((v): v is [number, number] => v !== null)
  const barSeries = built.map((s) => ({
    name: s.name,
    type: 'bar' as const,
    data: s.values,
    barMaxWidth: 14,
    itemStyle: { color: s.color, opacity: 0.55, borderRadius: [2, 2, 0, 0] as [number, number, number, number] },
  }))
  const avgSeries = built.map((s) => ({
    name: `${s.name} · promedio 5d`,
    type: 'line' as const,
    data: s.avg.map((v) => (v == null ? null : +v.toFixed(1))),
    smooth: 0.4,
    symbol: 'none' as const,
    connectNulls: true,
    lineStyle: { color: s.color, width: 2.5 },
  }))
  // Marcadores "sin proceso": guiones grises al pie del chart en los días vacíos
  const emptySeries = emptyMarkers.length > 0
    ? [{
        name: 'Sin proceso',
        type: 'scatter' as const,
        data: emptyMarkers,
        symbol: 'rect',
        symbolSize: [10, 3] as [number, number],
        itemStyle: { color: '#475569', opacity: 0.8 },
        tooltip: { show: false },
        silent: true,
      }]
    : []
  const option = {
    backgroundColor: 'transparent',
    grid: { left: 40, right: 8, top: 30, bottom: 26, containLabel: false },
    legend: {
      top: 0,
      right: 4,
      itemWidth: 12,
      itemHeight: 8,
      textStyle: { color: '#cbd5e1', fontSize: 11 },
      // Solo la leyenda de barras (el promedio comparte color, sería ruido duplicado)
      data: built.map((s) => s.name),
    },
    xAxis: {
      type: 'category' as const,
      data: labels,
      // interval 0: TODOS los días del mes llevan etiqueta — sin días fantasma
      axisLabel: { color: '#94a3b8', fontSize: 10, interval: 0 },
      axisLine: { lineStyle: { color: '#334155' } },
      axisTick: { show: false },
    },
    yAxis: {
      type: 'value' as const,
      min: 0,
      max: 100,
      axisLabel: { color: '#94a3b8', fontSize: 11, formatter: (v: number) => `${v}%` },
      splitLine: { lineStyle: { color: '#26364a', type: 'dashed' as const } },
      axisLine: { show: false },
    },
    tooltip: {
      trigger: 'axis' as const,
      axisPointer: { type: 'shadow' as const },
      backgroundColor: '#1f2937',
      borderColor: '#374151',
      textStyle: { color: '#f1f5f9', fontSize: 12 },
      formatter: (params: Array<{ seriesName: string; value: number | null; dataIndex: number; seriesType: string; color: string }>) => {
        if (!params.length) return ''
        const dk = dateKeys[params[0]!.dataIndex] ?? ''
        const bars = params.filter((p) => p.seriesType === 'bar' && p.value != null)
        const avgs = params.filter((p) => p.seriesType === 'line' && p.value != null)
        const rows = bars.map((p) => {
          const avg = avgs.find((a) => a.seriesName.startsWith(p.seriesName))
          return `<span style="color:${p.color}">●</span> ${p.seriesName}: <b>${(p.value as number).toFixed(0)}%</b>`
            + (avg ? ` <span style="color:#94a3b8">(prom 5d: ${(avg.value as number).toFixed(0)}%)</span>` : '')
        }).join('<br/>')
        return `<div style="font-size:10px;color:#94a3b8;margin-bottom:2px">${dk}</div>${rows || '<span style="color:#64748b">sin proceso este día</span>'}`
      },
    },
    series: [...barSeries, ...avgSeries, ...emptySeries],
  }
  return (
    <ReactECharts
      option={option}
      style={{ height, width: '100%' }}
      opts={{ renderer: 'canvas' }}
    />
  )
}

// ============================================================================
// Subcomponentes visuales
// ============================================================================

/**
 * Gantt con leyenda + ticks horarios. Si se provee `windowStart/End`, el Gantt
 * se renderiza en ese rango (permite alineación con timeline del Grader).
 */
function StateTimeline({
  shift,
  windowStart,
  windowEnd,
  onStateClick,
}: {
  shift: UpstreamMachineShift
  windowStart?: Date
  windowEnd?: Date
  onStateClick?: (state: UpstreamMachineState) => void
}) {
  const rangeStart = windowStart ?? shift.shiftStart
  const rangeEnd   = windowEnd   ?? shift.shiftEnd
  const totalMs = rangeEnd.getTime() - rangeStart.getTime()
  const reasons = useMemo(() => aggregateStatesByReason(shift.states), [shift.states])

  if (totalMs <= 0 || shift.states.length === 0) {
    return <div className="h-5 rounded-md bg-muted/60" />
  }

  return (
    <div className="space-y-1.5">
      {/* Gantt en ECharts — sincroniza zoom y crosshair via echarts.connect()
          con el chart Grader y los demás Gantts del mismo turno (Fase 2 del
          Synchronized Timeline). Mantiene el rendering visual del HTML viejo
          pero con interactividad nativa de ECharts. */}
      <div className="rounded-md overflow-hidden bg-muted/60 border border-border/70 shadow-inner">
        <StateTimelineEC
          shift={shift}
          windowStart={windowStart}
          windowEnd={windowEnd}
          height={30}
          onStateClick={onStateClick}
        />
      </div>

      {/* El eje horario se muestra dentro de ProductionBarsEC (ECharts axisLabel)
          que está inmediatamente debajo — adapta su granularidad al zoom
          automáticamente (1 min cuando < 10 min, 5 min a 30 min, etc.). */}

      {/* Pareto de causas de paro — barras proporcionales con animación fill */}
      <DowntimeParetoBar reasons={reasons} />
    </div>
  )
}

// Nota: ProductionBars (HTML divs absolute) fue reemplazado por
// ProductionBarsEC (Fase 3 del Synchronized Timeline). Ver
// `./ProductionBarsEC.tsx`.

/** Suma de tiempos de la LÍNEA completa (3 Baaders) para el turno. */
interface LineTimeTotals {
  uptimeSec: number
  downtimeSec: number
  breakSec: number
  setupSec: number
}

function sumLineTimeTotals(machines: UpstreamMachineShift[]): LineTimeTotals {
  return machines.reduce((acc, m) => {
    const bd = m.shiftRuntimeBreakdown
    if (!bd) return acc
    acc.uptimeSec   += bd.uptimeSec   || 0
    acc.downtimeSec += bd.downtimeSec || 0
    acc.breakSec    += bd.breakSec    || 0
    acc.setupSec    += bd.setupSec    || 0
    return acc
  }, { uptimeSec: 0, downtimeSec: 0, breakSec: 0, setupSec: 0 })
}

/**
 * Resumen de TIEMPOS del turno (línea completa, suma de las 3 Baaders) en
 * texto siempre visible. Antes esta suma solo existía escondida en el title
 * (tooltip) de ShiftAvailabilityBar, una máquina a la vez — no había un total
 * de línea en ningún lado. El operador pedía "tiempos del turno" sin tener
 * que sumar a mano ni pasar el mouse.
 */
function LineTimeSummaryBadges({ totals }: { totals: LineTimeTotals }) {
  if (totals.downtimeSec === 0 && totals.uptimeSec === 0 && totals.breakSec === 0) return null
  return (
    <div className="flex items-center gap-1.5 flex-wrap" title="Suma de tiempos de las 3 Baaders (horas-máquina, no tiempo de línea)">
      <Badge
        variant="outline"
        className="bg-emerald-950/60 border-emerald-900 text-emerald-300 tabular-nums text-[11px] px-2 py-0.5 h-5"
        title="Tiempo total procesando (suma de las 3 Baaders)"
      >
        ▲ {fmtDurationSec(totals.uptimeSec)}
      </Badge>
      {totals.downtimeSec > 0 && (
        <Badge
          variant="outline"
          className="bg-rose-950/60 border-rose-900 text-rose-300 tabular-nums text-[11px] px-2 py-0.5 h-5"
          title="Tiempo total de detención/paro (suma de las 3 Baaders)"
        >
          ⏸ {fmtDurationSec(totals.downtimeSec)}
        </Badge>
      )}
      {totals.breakSec > 0 && (
        <Badge
          variant="outline"
          className="bg-amber-950/60 border-amber-900 text-amber-300 tabular-nums text-[11px] px-2 py-0.5 h-5"
          title="Pausas programadas (colación/reunión), suma de las 3 Baaders"
        >
          ☕ {fmtDurationSec(totals.breakSec)}
        </Badge>
      )}
    </div>
  )
}

/**
 * KPI row tipo Shoplogix: total / verde / amarillo / rojo.
 *
 * Colores y tooltips siguen el principio "info útil": el operador debe entender
 * QUÉ significa cada color sin tener que adivinar.
 */
function ProductionKpiRow({ kpis }: { kpis: MachineKpis }) {
  const reachedStatus = reachedStatusFromPct(kpis.reachedPct)
  const reachedColor = reachedStatusColor(reachedStatus)
  return (
    <div className="flex items-center gap-1.5 flex-wrap">
      <Badge
        variant="outline"
        className="bg-muted border-border text-muted-foreground dark:bg-slate-900/60 dark:border-slate-700 dark:text-slate-300 tabular-nums text-[11px] px-2 py-0.5 h-5"
        title={
          `Tasa alcanzada: ${fmtPct(kpis.reachedPct, 0)} del esperado · ${reachedStatusLabel(reachedStatus)}.\n` +
          `Saludable ≥${REACHED_PCT_THRESHOLDS.healthyAbove * 100}% · Crítico <${REACHED_PCT_THRESHOLDS.criticalBelow * 100}%`
        }
      >
        {fmtInt(kpis.totalProduced)} / {fmtInt(kpis.totalExpected)}
        <span className={`ml-1.5 font-semibold ${reachedColor}`}>
          ({fmtPct(kpis.reachedPct, 0)})
        </span>
      </Badge>
      <Badge
        variant="outline"
        className="bg-emerald-950/60 border-emerald-900 text-emerald-300 tabular-nums text-[11px] px-2 py-0.5 h-5"
        title="Verde: piezas en intervalos donde el ritmo cumplió el objetivo (dentro de tolerancia)"
      >
        {fmtInt(kpis.greenCycles)} ({fmtPct(kpis.greenPct, 0)})
      </Badge>
      <Badge
        variant="outline"
        className="bg-amber-950/60 border-amber-900 text-amber-300 tabular-nums text-[11px] px-2 py-0.5 h-5"
        title="Amarillo: piezas en intervalos con ritmo bajo el objetivo (dentro de tolerancia)"
      >
        {fmtInt(kpis.yellowCycles)} ({fmtPct(kpis.yellowPct, 0)})
      </Badge>
      <Badge
        variant="outline"
        className="bg-rose-950/60 border-rose-900 text-rose-300 tabular-nums text-[11px] px-2 py-0.5 h-5"
        title="Rojo: piezas en intervalos con ritmo MUY bajo el objetivo (fuera de tolerancia — atención)"
      >
        {fmtInt(kpis.redCycles)} ({fmtPct(kpis.redPct, 0)})
      </Badge>
    </div>
  )
}

// ============================================================================
// MachineRow — 1 máquina
// ============================================================================

// Mismo color por índice de máquina en TODO el panel (Gantt, dot, borde
// izquierdo) — consistente con machineColors de BaaderTrendMultiChart/
// TrendBarsWithMovingAverage (M0 sky, M1 violet, M2 amber). Antes las 3
// máquinas se separaban solo por un `divide-y` tenue — "no se ve bien dónde
// empieza una y termina la otra" (Orel 2026-07-22) — el borde de color
// resuelve eso sin depender de leer el nombre.
// `bg` = tinte tenue del color de acento (10%) mezclado sobre la superficie
// normal — "que se vea rápido" sin tener que leer el borde (Orel 2026-07-23).
const MACHINE_ACCENT = [
  { border: 'border-l-sky-500/70',    dot: 'bg-sky-400',    bg: 'bg-sky-500/10' },
  { border: 'border-l-violet-500/70', dot: 'bg-violet-400', bg: 'bg-violet-500/10' },
  { border: 'border-l-amber-500/70',  dot: 'bg-amber-400',  bg: 'bg-amber-500/10' },
] as const

function MachineRow({ shift, machineIndex = 0, expanded, onToggle, windowStart, windowEnd, microAlert }: {
  shift: UpstreamMachineShift
  /** Índice de la máquina en la línea (0,1,2) — define su color de acento. */
  machineIndex?: number
  expanded: boolean
  onToggle: () => void
  windowStart?: Date
  windowEnd?: Date
  /** Si es true, esta máquina tiene >50% más microparadas que el promedio de la línea. */
  microAlert?: boolean
  /** Reservado para carga lazy de tendencia histórica — no usado aún. */
  plantSlug?: PlantSlug
}) {
  // Estado seleccionado al clickear un segmento del Gantt (drill-down rico).
  // Click sobre el mismo state lo cierra (toggle).
  const [selectedState, setSelectedState] = useState<UpstreamMachineState | null>(null)
  // F5a — Mini-KPIs zoom-aware. Source of truth: context.range (idéntico al
  // panel-global). Sin esto, el badge aparecería siempre que el rango de
  // alineación con el Grader difiera del shift Baader (false positive).
  const timelineSyncRow = useTimelineSyncOptional()
  const isZoomActive = timelineSyncRow?.range != null

  const handleStateClick = (s: UpstreamMachineState) => {
    setSelectedState((prev) => {
      const closing = prev && prev.startAt.getTime() === s.startAt.getTime() && prev.name === s.name
      // Resaltar el mismo tramo en las OTRAS 2 Baader y en el chart de
      // velocidad upstream — "demostrar" cómo se comportaron ahí (Orel
      // 2026-07-22). Al cerrar (mismo segmento clickeado de nuevo), limpiar.
      timelineSyncRow?.setHighlightRanges(
        closing ? [] : [{ startMs: s.startAt.getTime(), endMs: s.endAt.getTime() }],
      )
      return closing ? null : s
    })
  }

  const kpis = useMemo(() => {
    if (!isZoomActive || !windowStart || !windowEnd) {
      return computeKpis(shift.intervals)
    }
    const wStart = windowStart.getTime()
    const wEnd = windowEnd.getTime()
    const filtered = shift.intervals.filter((it) => {
      const ts = it.startAt.getTime()
      return ts >= wStart && ts <= wEnd
    })
    return computeKpis(filtered)
  }, [shift.intervals, windowStart, windowEnd, isZoomActive])

  const breaks = shift.states.filter(s => s.type === 'break').length
  const micro  = shift.states.filter(s => s.name === 'Micro Detencion').length
  const ciclo  = computeCiclo(shift)

  // Análisis del turno UNIFICADO: eventos (paros) cronológicos + el comentario
  // de operador emparejado a cada evento (matchCommentsToStates, por razón +
  // solape temporal). Reemplaza la tabla de eventos suelta + la lista de
  // comentarios aparte → una sola tabla rica (Motivo y Comentario juntos), como
  // la vista "Análisis" de Shoplogix. Los comentarios sin evento que calce van
  // como huérfanos al final — nunca se descartan.
  const analisis = useMemo(() => {
    const eventos = shift.states
      .filter((s) => s.type !== 'uptime' && s.durationSec > 0) // sin uptime ni eventos 0s (ruido)
      .sort((a, b) => a.startAt.getTime() - b.startAt.getTime())
    const eventoSet = new Set(eventos)
    const byState = new Map<UpstreamMachineState, UpstreamShiftComment[]>()
    const orphans: UpstreamShiftComment[] = []
    for (const { comment, state } of matchCommentsToStates(shift.comments, shift.states)) {
      if (state && eventoSet.has(state)) {
        const arr = byState.get(state) ?? []
        arr.push(comment)
        byState.set(state, arr)
      } else {
        orphans.push(comment) // comentario huérfano o atado a uptime/evento no listado
      }
    }
    return { eventos, byState, orphans }
  }, [shift.states, shift.comments])

  const ratioColor =
    shift.overallRatio >= 0.85 ? 'text-emerald-400'
    : shift.overallRatio >= 0.5 ? 'text-amber-400'
    : 'text-rose-400'

  const RatioIcon = shift.runtimeVariance >= 0 ? TrendingUp : TrendingDown

  const accent = MACHINE_ACCENT[machineIndex % MACHINE_ACCENT.length]!

  return (
    <div className={cn('py-3 pl-3 pr-1 space-y-2 rounded-md border-l-4', accent.bg, accent.border)}>
      {/* Row header — clickeable para expandir */}
      <button
        onClick={onToggle}
        className="w-full flex items-center justify-between gap-2 text-left group"
        aria-expanded={expanded}
      >
        <div className="flex items-center gap-2 min-w-0">
          {expanded
            ? <ChevronDown  className="w-3.5 h-3.5 text-muted-foreground group-hover:text-foreground" />
            : <ChevronRight className="w-3.5 h-3.5 text-muted-foreground group-hover:text-foreground" />}
          <span className={cn('w-2 h-2 rounded-full shrink-0', accent.dot)} />
          <Factory className="w-4 h-4 text-muted-foreground flex-shrink-0" />
          <span className="font-medium text-sm truncate">{shift.machineName}</span>
          {machineTypeLabel(shift.machineType) && (
            <Badge variant="outline" className="text-[10px] px-1.5 py-0 h-4 border-border text-muted-foreground">
              {machineTypeLabel(shift.machineType)}
            </Badge>
          )}
          {microAlert && (
            <Badge variant="outline" className="text-[10px] px-1.5 py-0 h-4 border-amber-900/70 bg-amber-950/50 text-amber-300 flex items-center gap-1" title="Microparadas anómalas (>50% sobre promedio línea). Revisar mantención.">
              <AlertTriangle className="w-3 h-3" /> Atención
            </Badge>
          )}
        </div>
        <div className="flex items-center gap-3 text-xs flex-shrink-0">
          <span className={`font-semibold tabular-nums flex items-center gap-0.5 ${ratioColor}`} title="Ritmo vs objetivo">
            <RatioIcon className="w-3 h-3" />
            {fmtPct(shift.overallRatio)}
          </span>
          <span className="text-muted-foreground tabular-nums" title="Piezas totales">
            {fmtInt(shift.totalCycles)} pz
          </span>
        </div>
      </button>

      {/* KPI row siempre visible (verde/amarillo/rojo). Badge "del rango"
          aparece cuando hay zoom activo — los KPIs se recalculan sólo del
          rango temporal visible (F5a). */}
      <div className="flex items-center gap-2 flex-wrap">
        <ProductionKpiRow kpis={kpis} />
        {isZoomActive && (
          <Badge
            variant="outline"
            className="bg-violet-950/60 border-violet-800 text-violet-300 text-[10px] px-1.5 py-0.5 h-5 gap-1"
            title="KPIs recalculados sólo del rango temporal visible (no del turno completo)"
          >
            <span>✂</span> del rango
          </Badge>
        )}
      </div>

      {/* Wrapper con padding para alinear pixel-perfect con plot area del ECharts del Grader */}
      <div style={{ paddingLeft: PLOT_LEFT_PAD_PX, paddingRight: PLOT_RIGHT_PAD_PX }} className="space-y-2">
        {/* Gantt con leyenda — segmentos clickeables abren panel de detalle */}
        <StateTimeline
          shift={shift}
          windowStart={windowStart}
          windowEnd={windowEnd}
          onStateClick={handleStateClick}
        />

        {/* Panel de detalle del estado seleccionado (drill-down click).
            Aparece debajo del Gantt y persiste hasta que se cierre o se
            re-clickee el mismo segmento. */}
        {selectedState && (
          <StateDetailPanel
            state={selectedState}
            shift={shift}
            comments={analisis.byState.get(selectedState)}
            onClose={() => { setSelectedState(null); timelineSyncRow?.setHighlightRanges([]) }}
          />
        )}

        {/* Production bars + objetivo — versión ECharts (Fase 3 del
            Synchronized Timeline). Sincroniza zoom + axisPointer cross-chart
            con Grader y Gantts via echarts.connect. */}
        <ProductionBarsEC
          intervals={shift.intervals}
          threshold={shift.threshold}
          windowStart={windowStart ?? shift.shiftStart}
          windowEnd={windowEnd ?? shift.shiftEnd}
        />
      </div>

      {/* Mini stats footer */}
      <div className="flex items-center gap-4 text-[11px] text-muted-foreground">
        <ShiftAvailabilityBar
          breakdown={shift.shiftRuntimeBreakdown}
          shiftRuntime={shift.shiftRuntime}
        />
        <span className="flex items-center gap-1" title="Paros (Break)">
          <Pause className="w-3 h-3" /> {breaks} paros
        </span>
        {micro > 0 && (
          <span className="text-cyan-400 flex items-center gap-1" title="Micro Detenciones (<5 min)">
            <Zap className="w-3 h-3" /> {micro} micro
          </span>
        )}
        {ciclo && (
          <span
            className="flex items-center gap-1"
            title={
              ciclo.idealSec != null
                ? `Ciclo real ${ciclo.realSec.toFixed(1)}s/pescado · ideal ${ciclo.idealSec.toFixed(1)}s · ` +
                  `${ciclo.deltaSec! >= 0 ? '+' : ''}${ciclo.deltaSec!.toFixed(1)}s (${ciclo.deltaSec! > 0.05 ? 'más lento' : 'en ritmo'})`
                : `Ciclo real ${ciclo.realSec.toFixed(1)}s por pescado`
            }
          >
            <Gauge className="w-3 h-3" />
            {ciclo.realSec.toFixed(1)}s/pz
            {ciclo.idealSec != null && ciclo.deltaSec! > 0.05 && (
              <span className="text-amber-400">(+{ciclo.deltaSec!.toFixed(1)})</span>
            )}
          </span>
        )}
        <span className="ml-auto text-[10px] text-muted-foreground">
          {fmtTime(shift.shiftStart)} – {fmtTime(shift.shiftEnd)}
        </span>
      </div>

      {/* Indicador compacto de comentarios (solo colapsado) — el texto completo
          vive en la columna "Comentario" de la tabla de eventos (expandido), para
          no duplicar. Un click expande. */}
      {shift.comments.length > 0 && !expanded && (
        <button
          onClick={onToggle}
          className="flex items-center gap-1 text-[10px] text-muted-foreground hover:text-foreground transition-colors"
          title="Comentarios del operador — expandir para verlos junto a su motivo"
        >
          <MessageSquare className="w-3 h-3 shrink-0" />
          {shift.comments.length} comentario{shift.comments.length !== 1 ? 's' : ''} del operador →
        </button>
      )}

      {/* Detalle expandido */}
      {expanded && (
        <div className="mt-2 pt-2 border-t border-border/60 text-[11px] text-muted-foreground space-y-1">
          <div className="grid grid-cols-2 md:grid-cols-4 gap-2">
            <div>
              <div className="text-muted-foreground">Intervalos</div>
              <div className="text-foreground tabular-nums">{shift.intervals.length} × 5 min</div>
            </div>
            <div>
              <div className="text-muted-foreground">Eventos timeline</div>
              <div className="text-foreground tabular-nums">{shift.states.length}</div>
            </div>
            <div>
              <div className="text-muted-foreground">Unidad</div>
              <div className="text-foreground">{shift.productionUnit || '—'}</div>
            </div>
            <div>
              <div className="text-muted-foreground">Variance runtime</div>
              {(() => {
                const dir = varianceDirection(shift.runtimeVariance)
                return (
                  <div
                    className={varianceColor(dir)}
                    title={`Diferencia entre runtime real y esperado de Shoplogix. ${varianceLabel(dir)}.`}
                  >
                    {shift.runtimeVariance >= 0 ? '+' : ''}{fmtPct(shift.runtimeVariance, 2)}
                    <span className="text-[10px] opacity-70 ml-1">({varianceLabel(dir)})</span>
                  </div>
                )
              })()}
            </div>
          </div>
          {/* Análisis del turno — tabla UNIFICADA que espeja la vista "Análisis"
              de Shoplogix: cada paro con inicio → fin → duración → motivo Y el
              comentario del operador emparejado a ese evento, todo junto. Antes
              esto estaba partido (tabla de eventos + lista de comentarios aparte).
              Los huérfanos (comentario sin evento que calce) van debajo. */}
          {analisis.eventos.length > 0 && (
            <div className="mt-2">
              <div className="text-muted-foreground mb-1">Análisis del turno ({analisis.eventos.length} eventos)</div>
              <div className="max-h-64 overflow-y-auto rounded border border-border/60">
                <table className="w-full text-[10px] tabular-nums">
                  <thead className="text-muted-foreground sticky top-0 bg-muted/95 backdrop-blur">
                    <tr>
                      <th className="text-left  px-2 py-1 font-medium">Inicio</th>
                      <th className="text-left  px-2 py-1 font-medium">Fin</th>
                      <th className="text-right px-2 py-1 font-medium">Duración</th>
                      <th className="text-left  px-2 py-1 font-medium">Motivo</th>
                      <th className="text-left  px-2 py-1 font-medium">Comentario</th>
                    </tr>
                  </thead>
                  <tbody>
                    {analisis.eventos.map((s, i) => {
                      const color = slxStateColor(s.type, s.reason, s.color)
                      const motivo = s.reason || s.name || s.type
                      const coms = analisis.byState.get(s) ?? []
                      const comentario = coms.map((c) => c.text).join(' · ')
                      return (
                        <tr key={i} className="border-t border-border/40 hover:bg-muted/40 align-top">
                          <td className="px-2 py-1 text-muted-foreground whitespace-nowrap">{fmtTime(s.startAt)}</td>
                          <td className="px-2 py-1 text-muted-foreground whitespace-nowrap">{fmtTime(s.endAt)}</td>
                          <td className="px-2 py-1 text-right text-foreground whitespace-nowrap">{fmtDurationSec(s.durationSec)}</td>
                          <td className="px-2 py-1">
                            <span className="inline-flex items-center gap-1.5 min-w-0">
                              <span className="w-2 h-2 rounded-sm shrink-0" style={{ background: color }} />
                              <span className="text-foreground truncate">{motivo}</span>
                            </span>
                          </td>
                          <td className="px-2 py-1">
                            {comentario ? (
                              <span className="text-muted-foreground italic inline-flex items-start gap-1">
                                <MessageSquare className="w-2.5 h-2.5 shrink-0 mt-0.5 text-muted-foreground" />
                                <span>{comentario}</span>
                              </span>
                            ) : (
                              <span className="text-muted-foreground dark:text-slate-700">—</span>
                            )}
                          </td>
                        </tr>
                      )
                    })}
                  </tbody>
                </table>
              </div>
              {/* Comentarios sin evento que calce — nunca se descartan. */}
              {analisis.orphans.length > 0 && (
                <div className="mt-1.5 space-y-0.5">
                  <div className="flex items-center gap-1 text-[10px] text-amber-500/80">
                    <AlertTriangle className="w-2.5 h-2.5 shrink-0" />
                    Comentarios sin evento asociado
                  </div>
                  {analisis.orphans.map((c) => (
                    <p key={c.key} className="text-muted-foreground italic text-[10px] pl-3.5">
                      <MessageSquare className="w-2.5 h-2.5 inline mr-1 text-muted-foreground" />
                      {c.reasonValue ? `[${c.reasonValue}] ${c.text}` : c.text}
                    </p>
                  ))}
                </div>
              )}
            </div>
          )}
        </div>
      )}
    </div>
  )
}

// ============================================================================
// Panel principal
// ============================================================================

export function UpstreamMachinesPanel({
  snapshot,
  loading = false,
  error = null,
  defaultCollapsed = false,
  syncedAt = null,
  shiftWindow = null,
  pauses = [],
  plantSlug = 'chonchi',
  dataSource = 'none',
  framedOnProduction = false,
  onToggleFraming,
}: Props) {
  const [collapsed, setCollapsed] = useState(defaultCollapsed)
  const [expandedMachines, setExpandedMachines] = useState<Set<string>>(new Set())
  // Capa opcional del gráfico de tasa: cuánto faltó para el objetivo en cada
  // tramo. Apagada por default — en un turno normal casi todo está cerca del
  // objetivo y el sombreado sería ruido.
  const [showRateGap, setShowRateGap] = useState(false)

  const isStale = useMemo(() => isStaleSync(syncedAt), [syncedAt])

  // Ventana temporal a usar para alinear el Gantt.
  // Prioridad de fuentes (Synchronized Timeline):
  //   1. Context `useTimelineSync().range` — si hay zoom activo del Grader,
  //      ese zoom se propaga al panel via este state global.
  //   2. SLX scheduled bounds (snapshot.machines[0]) — la ventana COMPLETA
  //      del turno Shoplogix. Esto es la fuente preferida porque Shoplogix
  //      registra continuamente y el Grader Excel se sube manualmente y
  //      varias veces durante el turno; la ventana SLX no debe encogerse
  //      al sub-rango Grader. Más uploads Grader durante el turno se ven
  //      como "islas" de datos dentro del eje SLX completo.
  //   3. Prop `shiftWindow` legacy — fallback cuando no hay snapshot SLX
  //      (turno sin datos upstream o pre-suscripción).
  const timelineSync = useTimelineSyncOptional()
  const [windowStart, windowEnd] = useMemo<[Date | undefined, Date | undefined]>(() => {
    // 1. Context (zoom del Grader sincronizado)
    if (timelineSync?.range) {
      return [new Date(timelineSync.range.startMs), new Date(timelineSync.range.endMs)]
    }
    // 2. SLX bounds — preferido cuando hay snapshot. Usamos shiftStart/End
    // (rango real con datos, crece conforme avanza el turno) en vez de
    // scheduledStart/End (planeado, deja huecos vacíos cuando el turno aún
    // no termina o las máquinas pararon antes).
    const slxMachine = snapshot?.machines[0]
    if (slxMachine) {
      const s = slxMachine.shiftStart
      const e = slxMachine.shiftEnd
      if (s && e && !isNaN(s.getTime()) && !isNaN(e.getTime())) return [s, e]
    }
    // 3. Prop legacy (fallback sin snapshot)
    if (shiftWindow?.startAt && shiftWindow?.endAt) {
      const s = new Date(shiftWindow.startAt)
      const e = new Date(shiftWindow.endAt)
      if (!isNaN(s.getTime()) && !isNaN(e.getTime())) return [s, e]
    }
    // 4. Cada máquina usa su propio shiftStart/End downstream
    return [undefined, undefined]
  }, [timelineSync?.range, snapshot, shiftWindow?.startAt, shiftWindow?.endAt])

  // ¿Hay zoom activo? Source of truth: context.range. null = no zoom (vista
  // completa del turno alineada al Grader). Cualquier valor = zoom activo.
  const isLineZoomActive = timelineSync?.range != null

  // Detección de desfase SLX: si la primera máquina tiene shiftStart >24h fuera
  // del schedule esperado del turno (prop `shiftWindow`), el doc Firestore tiene
  // datos de OTRO DÍA (bug CF).
  //
  // Comparamos contra `shiftWindow` (schedule de la planta) y NO contra
  // `windowStart` — porque `windowStart` ahora se deriva del propio snapshot
  // SLX, así que comparar contra él daría siempre gap=0.
  //
  // Threshold 24h: por debajo es legítimo (e.g. Yal Turno día Grader 7:00-14:45
  // mapea a SLX Turno 2 15:15-00:00 → gap 8h, válido). Bug real tiene gap ≥ 24h.
  // No aplica a datos demo — esos tienen timestamps fijos intencionalmente.
  const slxWindowMismatch = useMemo(() => {
    if (dataSource === 'demo') return null
    if (!snapshot || snapshot.machines.length === 0) return null
    if (!shiftWindow?.startAt) return null
    const m = snapshot.machines[0]!
    const expectedStartMs = new Date(shiftWindow.startAt).getTime()
    if (isNaN(expectedStartMs)) return null
    const gapHours = Math.abs(m.shiftStart.getTime() - expectedStartMs) / 3_600_000
    if (gapHours <= 24) return null
    return { actualStart: m.shiftStart, actualEnd: m.shiftEnd }
  }, [dataSource, snapshot, shiftWindow?.startAt])

  // Cuando hay desfase, los charts usan su propio rango (auto-scale)
  // para que el supervisor pueda ver los datos aunque no correspondan al turno.
  const chartWindowStart = slxWindowMismatch ? undefined : windowStart
  const chartWindowEnd   = slxWindowMismatch ? undefined : windowEnd

  // F5b — Correlación paros Grader ↔ Baaders. Si un paro del Grader tiene
  // 2+ Baaders paradas dentro de la ventana de tolerancia, lo marcamos como
  // "coincidente". Banner en header alerta al supervisor del posible upstream
  // root cause sin tener que ir al UpstreamCorrelationCard de abajo.
  const correlationSummary = useMemo(() => {
    if (!snapshot || pauses.length === 0) return null
    const correlations = correlatePausesWithUpstream(pauses, snapshot)
    return summarizeCorrelations(correlations)
  }, [snapshot, pauses])

  // Agregado de toda la línea (para header). Zoom-aware F5a: filtra
  // intervals al rango visible cuando hay zoom activo.
  const lineKpis = useMemo(() => {
    if (!snapshot || snapshot.machines.length === 0) return null
    const all = snapshot.machines.flatMap(m => m.intervals)
    if (!isLineZoomActive || !windowStart || !windowEnd) {
      return computeKpis(all)
    }
    const wStart = windowStart.getTime()
    const wEnd = windowEnd.getTime()
    const filtered = all.filter((it) => {
      const ts = it.startAt.getTime()
      return ts >= wStart && ts <= wEnd
    })
    return computeKpis(filtered)
  }, [snapshot, windowStart, windowEnd, isLineZoomActive])

  // Tiempos de línea (uptime/paro/break) — suma de las 3 Baaders. No es
  // zoom-aware (a diferencia de lineKpis): shiftRuntimeBreakdown es un
  // agregado del turno completo, no por-intervalo.
  const lineTimeTotals = useMemo(() => {
    if (!snapshot || snapshot.machines.length === 0) return null
    return sumLineTimeTotals(snapshot.machines)
  }, [snapshot])

  // Detector de microparadas anómalas — usa helper testable + umbrales
  // exportados (ver MICRO_ANOMALY_THRESHOLDS en graderUpstreamHealth.ts).
  const microAlertSet = useMemo<Set<string>>(() => {
    if (!snapshot) return new Set()
    return detectMicroAnomalies(
      snapshot.machines.map(m => ({
        machineid: m.machineid,
        microCount: m.states.filter(s => s.name === 'Micro Detencion').length,
      })),
    )
  }, [snapshot])

  const empty = !loading && !error && (!snapshot || snapshot.machines.length === 0)

  // Modelo de las máquinas del turno, derivado de los datos: en Filete la
  // máquina es una Baader 200 y el header decía "Baader 142" igual.
  const lineLabel = snapshot ? lineMachinesLabel(snapshot.machines) : ''

  const toggleMachine = (id: string) => {
    setExpandedMachines(prev => {
      const next = new Set(prev)
      if (next.has(id)) next.delete(id); else next.add(id)
      return next
    })
  }

  return (
    <Card className="border-border bg-muted/50">
      <CardContent className="py-3 px-4">
        {/* Header del panel — colapsable + KPIs línea-completa siempre visibles */}
        <div className="w-full flex items-center justify-between gap-3 flex-wrap">
          <button
            onClick={() => setCollapsed(c => !c)}
            className="flex items-center gap-2 group min-w-0 flex-1 flex-wrap"
            aria-expanded={!collapsed}
          >
            {collapsed
              ? <ChevronRight className="w-4 h-4 text-muted-foreground shrink-0" />
              : <ChevronDown  className="w-4 h-4 text-muted-foreground shrink-0" />}
            <Zap className="w-4 h-4 text-violet-400 shrink-0" />
            {/* 2 niveles:
                - <sm (mobile portrait): "Línea Baader 142"
                - sm+ (landscape mobile / tablet / desktop): "Línea upstream Baader 142"
                Versiones más largas no caben sin truncate cuando hay KPIs +
                badges al lado. La denominación "Evisceradoras" es redundante:
                un Baader 142 es ya implícitamente una evisceradora. */}
            <span className="font-medium text-sm truncate text-left">
              <span className="hidden sm:inline">
                {lineLabel ? `Línea upstream ${lineLabel}` : 'Línea upstream'}
              </span>
              <span className="sm:hidden">{lineLabel ? `Línea ${lineLabel}` : 'Línea'}</span>
            </span>
            {snapshot && (
              <Badge variant="outline" className="text-[10px] px-1.5 py-0 h-4 border-violet-900/60 text-violet-400 shrink-0">
                {snapshot.machines.length} máq
              </Badge>
            )}
            {dataSource === 'demo' && (
              <Badge
                variant="outline"
                className="text-[10px] px-1.5 py-0 h-4 border-amber-700/60 text-amber-400 bg-amber-950/30"
                title="Datos sintéticos de demostración — no hay datos reales de Shoplogix para este turno en Firestore"
              >
                DEMO
              </Badge>
            )}
          </button>

          {/* Encuadre del eje. Va FUERA del botón colapsable: un <button> dentro
              de otro <button> es HTML inválido (React lo reporta como
              validateDOMNesting) y el click quedaba ambiguo. */}
          {onToggleFraming && (
            <button
              type="button"
              onClick={onToggleFraming}
              title={framedOnProduction
                ? 'El eje muestra solo las horas con producción. Click para ver el turno completo.'
                : 'El eje muestra el turno completo. Click para acotarlo a las horas con producción.'}
              className={cn(
                'text-[10px] px-1.5 py-0.5 rounded border shrink-0 transition-colors',
                framedOnProduction
                  ? 'border-primary/50 bg-primary/15 text-primary hover:bg-primary/25'
                  : 'border-border text-muted-foreground hover:text-foreground hover:bg-muted',
              )}
            >
              {framedOnProduction ? 'operación real' : 'turno completo'}
            </button>
          )}
          <div className="flex items-center gap-3 text-xs text-muted-foreground ml-auto flex-wrap justify-end">
            {/* KPIs totales línea completa — siempre visibles, también en collapsed */}
            {lineKpis && <ProductionKpiRow kpis={lineKpis} />}
            {lineTimeTotals && <LineTimeSummaryBadges totals={lineTimeTotals} />}
            {isLineZoomActive && (
              <Badge
                variant="outline"
                className="bg-violet-950/60 border-violet-800 text-violet-300 text-[10px] px-1.5 py-0.5 h-5 gap-1"
                title="KPIs recalculados sólo del rango temporal visible"
              >
                <span>✂</span> del rango
              </Badge>
            )}
            {/* F5b — Badge paros coincidentes: aparece cuando ≥1 paro del
                Grader tiene causa upstream (≥2 Baaders paradas en ±2 min).
                Llama atención al supervisor: posible root cause upstream. */}
            {correlationSummary && correlationSummary.upstreamCaused > 0 && (
              <Badge
                variant="outline"
                className="bg-orange-950/60 border-orange-800 text-orange-300 text-[10px] px-2 py-0.5 h-5 gap-1 cursor-help"
                title={
                  `${correlationSummary.upstreamCaused} de ${correlationSummary.total} paros del Grader coinciden con paros upstream (±2 min). ` +
                  `Probable root cause en línea Baader. Ver detalle en card de correlación abajo.`
                }
              >
                <AlertTriangle className="w-3 h-3" />
                {correlationSummary.upstreamCaused} {correlationSummary.upstreamCaused === 1 ? 'paro' : 'paros'} coincidente{correlationSummary.upstreamCaused !== 1 ? 's' : ''}
              </Badge>
            )}
            {loading && <span>Cargando…</span>}
            {error && <span className="text-rose-400 flex items-center gap-1"><AlertCircle className="w-3 h-3" /> Error</span>}
            {isStale && syncedAt && (
              <span
                className="text-amber-400 cursor-help"
                title={
                  `Datos sincronizados hace ${Math.round((Date.now() - syncedAt.getTime()) / 60000)} min. ` +
                  `Umbral: ${SYNC_STALE_MINUTES} min. ` +
                  `Si el problema persiste, revisar conexión Cloud Function ↔ Shoplogix.`
                }
              >
                Desactualizado
              </span>
            )}
            {slxWindowMismatch && (
              <Badge
                variant="outline"
                className="bg-rose-950/60 border-rose-800 text-rose-300 text-[10px] px-2 py-0.5 h-5 gap-1 cursor-help"
                title={
                  `Datos SLX fuera de ventana: rango real ${fmtTime(slxWindowMismatch.actualStart.getTime())}–${fmtTime(slxWindowMismatch.actualEnd.getTime())} ` +
                  `no coincide con el turno actual. Probable causa: documento Firestore con datos de otro turno. ` +
                  `Los charts muestran el rango real de los datos.`
                }
              >
                <AlertTriangle className="w-3 h-3" />
                SLX desfasado
              </Badge>
            )}
            {snapshot && !loading && (
              <span className="tabular-nums">
                <Activity className="w-3 h-3 inline mr-1" />
                {fmtInt(snapshot.lineThroughputActual)} / {fmtInt(snapshot.lineThroughputExpected)} pz/h
              </span>
            )}
            {/* F5c — Botón export PNG combinado: captura Grader + 3 Gantts +
                3 ProductionBars en un solo PNG vertical, listo para
                compartir (Slack, ticket, email). Sólo visible cuando hay
                snapshot cargado y echarts.connect activo. */}
            {snapshot && !loading && timelineSync && (
              <button
                onClick={() => {
                  if (!snapshot) return
                  const subtitle = correlationSummary && correlationSummary.upstreamCaused > 0
                    ? `${correlationSummary.upstreamCaused} de ${correlationSummary.total} paros del Grader coinciden con paros upstream`
                    : `${snapshot.machines.length} máquinas — sincronizado al Grader`
                  void exportCombinedTimelinePng(timelineSync.connectGroupId, {
                    title: `Análisis de Turno · ${snapshot.dateKey} · ${snapshot.shiftId}`,
                    subtitle,
                    filenameSuffix: `${snapshot.dateKey}_${snapshot.shiftId.replace(/\s+/g, '_').toLowerCase()}`,
                  }).catch((err) => logger.error('Export combinado falló', err instanceof Error ? err : new Error(String(err))))
                }}
                className="flex items-center gap-1 text-[10px] text-muted-foreground hover:text-foreground transition-colors px-1.5 py-1 rounded border border-border hover:border-foreground/30"
                title="Exportar timeline completo (Grader + 3 Baaders) como PNG único"
              >
                <Download className="w-3 h-3" />
                <span>PNG</span>
              </button>
            )}
          </div>
        </div>

        {/* Body */}
        {!collapsed && (
          <div className="mt-3 pt-3 border-t border-border">
            {loading && (
              <div className="text-sm text-muted-foreground py-4 text-center">
                Cargando datos de Shoplogix…
              </div>
            )}

            {error && (
              <div className="text-sm text-rose-400 py-4 flex items-center gap-2">
                <AlertCircle className="w-4 h-4" />
                <span>No se pudo cargar: {error}</span>
              </div>
            )}

            {empty && (
              <div className="text-xs text-muted-foreground py-3 space-y-1">
                <p>📡 <strong className="text-foreground">Sin datos Shoplogix para este turno.</strong></p>
                <p className="text-muted-foreground">
                  {plantSlug === 'filete'
                    ? 'Todavía no hay turnos de la Línea 1 de Filete sincronizados desde Shoplogix para esta fecha. Cuando el sync los traiga, se verá acá el estado en vivo, paros y micro-detenciones de la línea.'
                    : 'Cuando la integración esté lista, mostrará estado en vivo de las 3 Baaders 142, paros, Micro Detenciones y correlación con los P0 del Grader.'}
                </p>
              </div>
            )}

            {/* ── Gráfico tasa pz/min por Baader + promedio ─────────────────────
                Siempre visible cuando hay datos. Permite ver de un vistazo
                qué máquina bajó primero y cuánto difiere del promedio. */}
            {snapshot && snapshot.machines.length > 0 && (
              <div className="mb-3 pb-3 border-b border-border/60">
                <div className="flex items-center justify-between gap-2 mb-1.5 flex-wrap">
                  <p className="text-[10px] text-muted-foreground uppercase tracking-wider">
                    Tasa de producción por máquina · pz/min
                  </p>
                  <button
                    type="button"
                    onClick={() => setShowRateGap((v) => !v)}
                    title="Apila sobre cada barra lo que faltó para llegar al objetivo de ese tramo."
                    className={cn(
                      'text-[10px] px-1.5 py-0.5 rounded border transition-colors',
                      showRateGap
                        ? 'border-rose-500/45 bg-rose-500/12 text-rose-700 dark:text-rose-300'
                        : 'border-border text-muted-foreground hover:text-foreground hover:bg-muted',
                    )}
                  >
                    {showRateGap ? 'ocultar brecha' : 'ver brecha al objetivo'}
                  </button>
                </div>
                {slxWindowMismatch && (
                  <p className="text-[10px] text-rose-400/70 mb-1">
                    ⚠ Datos del rango {fmtTime(slxWindowMismatch.actualStart.getTime())}–{fmtTime(slxWindowMismatch.actualEnd.getTime())} · no coincide con la ventana del turno
                  </p>
                )}
                <ProductionRateLineEC
                  machines={snapshot.machines}
                  windowStart={chartWindowStart}
                  windowEnd={chartWindowEnd}
                  showGap={showRateGap}
                />
              </div>
            )}

            {/* Cascada de pérdidas del turno — quién limitó la producción y
                cuántas piezas costó cada causal. Ver LossCascadeCard. */}
            {snapshot && snapshot.machines.length > 0 && (
              <LossCascadeCard machines={snapshot.machines} />
            )}

            {snapshot && snapshot.machines.length > 0 && (
              <div className="space-y-2">
                {/* Filtro fino de la Cascada del turno (Ev1/Ev2/Ev3 dentro de
                    una causal) aísla esa Baader: las otras 2 se OCULTAN (no
                    solo dejan de resaltarse) para verla sin bajar con scroll
                    a buscarla entre las 3 (Orel 2026-07-23). machineIndex se
                    calcula sobre la lista COMPLETA (no la filtrada) para que
                    el color de cada máquina no cambie al aislar/desaislar. */}
                {snapshot.machines
                  .map((m, idx) => ({ m, idx }))
                  .filter(({ m }) => !timelineSync?.isolatedMachineId || m.machineid === timelineSync.isolatedMachineId)
                  .map(({ m, idx }) => (
                    <MachineRow
                      key={m.machineid}
                      shift={m}
                      machineIndex={idx}
                      expanded={expandedMachines.has(m.machineid)}
                      onToggle={() => toggleMachine(m.machineid)}
                      windowStart={chartWindowStart}
                      windowEnd={chartWindowEnd}
                      microAlert={microAlertSet.has(m.machineid)}
                      plantSlug={plantSlug}
                    />
                  ))}
              </div>
            )}

            {snapshot && syncedAt && (
              <div className="mt-2 pt-2 border-t border-border text-[11px] text-muted-foreground text-right">
                Sincronizado: {syncedAt.toLocaleString('es-CL')}
              </div>
            )}
          </div>
        )}
      </CardContent>
    </Card>
  )
}
