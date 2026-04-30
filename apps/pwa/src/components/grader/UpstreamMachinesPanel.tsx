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
import { Card, CardContent, Badge } from '@/components/ui'
import {
  ChevronDown, ChevronRight, Factory, Activity, AlertCircle, Zap,
  TrendingUp, TrendingDown, Timer, Pause, AlertTriangle, Download, MessageSquare,
} from 'lucide-react'
import type {
  UpstreamLineSnapshot,
  UpstreamMachineShift,
  UpstreamProductionInterval,
  UpstreamMachineState,
} from '@/services/shoplogix/types'
import type { Pause as GraderPause } from '@/services/grader/types'
import { correlatePausesWithUpstream, summarizeCorrelations } from '@/services/shoplogix/shoplogixCorrelation'
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
import { useTimelineSyncOptional } from './useTimelineSync'
import { StateTimelineEC } from './StateTimelineEC'
import { ProductionBarsEC } from './ProductionBarsEC'
import { ProductionRateLineEC } from './ProductionRateLineEC'
import { StateDetailPanel } from './StateDetailPanel'
import { exportCombinedTimelinePng } from './exportCombinedTimelinePng'
import { fmtTime, fmtDurationSec } from '@/services/grader/graderTimeFormat'
import { slxStateColor } from '@/services/shoplogix/shoplogixColors'
import { logger } from '@/lib/logger'

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
            title={`${r.count} evento${r.count !== 1 ? 's' : ''} · ${fmtDurationSec(r.durationSec)} total`}
          >
            {/* Color del state (viene de Shoplogix) */}
            <span
              className="w-2 h-2 rounded-sm shrink-0 ring-1 ring-slate-900/60"
              style={{ backgroundColor: r.color }}
            />
            {/* Etiqueta — ancho fijo para alinear las barras */}
            <span className="text-slate-300 truncate shrink-0 w-[7.5rem]">
              {r.reason || 'Sin categoría'}
            </span>
            {/* Barra proporcional — transformOrigin left para el scaleX 0→1 */}
            <div className="flex-1 h-1.5 bg-slate-800/80 rounded-full overflow-hidden min-w-0">
              <div
                data-pareto-bar=""
                className="h-full rounded-full opacity-80"
                style={{
                  width: `${Math.max(pct, 1)}%`,
                  backgroundColor: r.color,
                  transformOrigin: 'left center',
                }}
              />
            </div>
            {/* Duración */}
            <span className="text-slate-500 tabular-nums shrink-0 w-12 text-right">
              {fmtDurationSec(r.durationSec)}
            </span>
            {/* % del total downtime */}
            <span className="text-slate-600 tabular-nums shrink-0 w-7 text-right">
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
      <div className="flex h-2 w-14 rounded-full overflow-hidden bg-slate-800/60 shrink-0">
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
      <p className="text-[10px] text-slate-600 italic py-1">
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
    return <div className="h-5 rounded-md bg-slate-800/60" />
  }

  return (
    <div className="space-y-1.5">
      {/* Gantt en ECharts — sincroniza zoom y crosshair via echarts.connect()
          con el chart Grader y los demás Gantts del mismo turno (Fase 2 del
          Synchronized Timeline). Mantiene el rendering visual del HTML viejo
          pero con interactividad nativa de ECharts. */}
      <div className="rounded-md overflow-hidden bg-slate-800/60 border border-slate-700/70 shadow-inner">
        <StateTimelineEC
          shift={shift}
          windowStart={windowStart}
          windowEnd={windowEnd}
          height={20}
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
        className="bg-slate-900/60 border-slate-700 text-slate-300 tabular-nums text-[11px] px-2 py-0.5 h-5"
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

function MachineRow({ shift, expanded, onToggle, windowStart, windowEnd, microAlert }: {
  shift: UpstreamMachineShift
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

  const handleStateClick = (s: UpstreamMachineState) => {
    setSelectedState((prev) =>
      prev && prev.startAt.getTime() === s.startAt.getTime() && prev.name === s.name
        ? null
        : s,
    )
  }
  // F5a — Mini-KPIs zoom-aware. Source of truth: context.range (idéntico al
  // panel-global). Sin esto, el badge aparecería siempre que el rango de
  // alineación con el Grader difiera del shift Baader (false positive).
  const timelineSyncRow = useTimelineSyncOptional()
  const isZoomActive = timelineSyncRow?.range != null

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

  const ratioColor =
    shift.overallRatio >= 0.85 ? 'text-emerald-400'
    : shift.overallRatio >= 0.5 ? 'text-amber-400'
    : 'text-rose-400'

  const RatioIcon = shift.runtimeVariance >= 0 ? TrendingUp : TrendingDown

  return (
    <div className="py-3 space-y-2">
      {/* Row header — clickeable para expandir */}
      <button
        onClick={onToggle}
        className="w-full flex items-center justify-between gap-2 text-left group"
        aria-expanded={expanded}
      >
        <div className="flex items-center gap-2 min-w-0">
          {expanded
            ? <ChevronDown  className="w-3.5 h-3.5 text-slate-500 group-hover:text-slate-300" />
            : <ChevronRight className="w-3.5 h-3.5 text-slate-500 group-hover:text-slate-300" />}
          <Factory className="w-4 h-4 text-slate-400 flex-shrink-0" />
          <span className="font-medium text-sm truncate">{shift.machineName}</span>
          <Badge variant="outline" className="text-[10px] px-1.5 py-0 h-4 border-slate-700 text-slate-400">
            Baader 142
          </Badge>
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
          <span className="text-slate-400 tabular-nums" title="Piezas totales">
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
            onClose={() => setSelectedState(null)}
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
      <div className="flex items-center gap-4 text-[11px] text-slate-500">
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
        <span className="ml-auto text-[10px] text-slate-600">
          {fmtTime(shift.shiftStart)} – {fmtTime(shift.shiftEnd)}
        </span>
      </div>

      {/* Comentarios de operador — siempre visibles si existen (max 2).
          Si hay más, el botón "y N más" abre el detalle expandido.
          Permite leer anotaciones del turno sin hacer clic extra. */}
      {shift.comments.length > 0 && (
        <div className="flex items-start gap-1.5 text-[10px]">
          <MessageSquare className="w-3 h-3 text-slate-500 shrink-0 mt-px" />
          <div className="min-w-0 space-y-0.5">
            {shift.comments.slice(0, 2).map((c, i) => (
              <p key={i} className="text-slate-400 italic truncate" title={c}>
                {c}
              </p>
            ))}
            {shift.comments.length > 2 && !expanded && (
              <button
                onClick={onToggle}
                className="text-slate-600 hover:text-slate-300 transition-colors"
              >
                y {shift.comments.length - 2} más →
              </button>
            )}
          </div>
        </div>
      )}

      {/* Detalle expandido */}
      {expanded && (
        <div className="mt-2 pt-2 border-t border-slate-800/60 text-[11px] text-slate-500 space-y-1">
          <div className="grid grid-cols-2 md:grid-cols-4 gap-2">
            <div>
              <div className="text-slate-600">Intervalos</div>
              <div className="text-slate-300 tabular-nums">{shift.intervals.length} × 5 min</div>
            </div>
            <div>
              <div className="text-slate-600">Eventos timeline</div>
              <div className="text-slate-300 tabular-nums">{shift.states.length}</div>
            </div>
            <div>
              <div className="text-slate-600">Unidad</div>
              <div className="text-slate-300">{shift.productionUnit || '—'}</div>
            </div>
            <div>
              <div className="text-slate-600">Variance runtime</div>
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
          {/* Comentarios completos en expanded (cuando hay más de 2) */}
          {shift.comments.length > 2 && (
            <div className="mt-2 space-y-0.5">
              <div className="text-slate-600 mb-0.5">Todos los comentarios</div>
              {shift.comments.map((c, i) => (
                <p key={i} className="text-slate-300 italic text-[10px]">
                  <MessageSquare className="w-2.5 h-2.5 inline mr-1 text-slate-500" />
                  {c}
                </p>
              ))}
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
}: Props) {
  const [collapsed, setCollapsed] = useState(defaultCollapsed)
  const [expandedMachines, setExpandedMachines] = useState<Set<string>>(new Set())

  const isStale = useMemo(() => isStaleSync(syncedAt), [syncedAt])

  // Ventana temporal a usar para alinear el Gantt.
  // Prioridad de fuentes (Synchronized Timeline):
  //   1. Context `useTimelineSync().range` — si la página está dentro de un
  //      <TimelineSyncProvider>, el zoom del Grader se propaga al panel via
  //      este state global. NUNCA cae a shift.shiftStart por máquina.
  //   2. Prop `shiftWindow` legacy — uso anterior (compatibilidad).
  //   3. Sin source: cada máquina usa su propio shift.shiftStart/End.
  const timelineSync = useTimelineSyncOptional()
  const [windowStart, windowEnd] = useMemo<[Date | undefined, Date | undefined]>(() => {
    // 1. Context (prioridad máxima cuando está disponible y no es null)
    if (timelineSync?.range) {
      return [new Date(timelineSync.range.startMs), new Date(timelineSync.range.endMs)]
    }
    // 2. Prop legacy
    if (shiftWindow?.startAt && shiftWindow?.endAt) {
      const s = new Date(shiftWindow.startAt)
      const e = new Date(shiftWindow.endAt)
      if (!isNaN(s.getTime()) && !isNaN(e.getTime())) return [s, e]
    }
    // 3. Fallback: cada máquina usa su propio shiftStart/End downstream
    return [undefined, undefined]
  }, [timelineSync?.range, shiftWindow?.startAt, shiftWindow?.endAt])

  // ¿Hay zoom activo? Source of truth: context.range. null = no zoom (vista
  // completa del turno alineada al Grader). Cualquier valor = zoom activo.
  const isLineZoomActive = timelineSync?.range != null

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

  const toggleMachine = (id: string) => {
    setExpandedMachines(prev => {
      const next = new Set(prev)
      if (next.has(id)) next.delete(id); else next.add(id)
      return next
    })
  }

  return (
    <Card className="border-slate-800 bg-slate-950/50">
      <CardContent className="py-3 px-4">
        {/* Header del panel — colapsable + KPIs línea-completa siempre visibles */}
        <div className="w-full flex items-center justify-between gap-3 flex-wrap">
          <button
            onClick={() => setCollapsed(c => !c)}
            className="flex items-center gap-2 group shrink-0"
            aria-expanded={!collapsed}
          >
            {collapsed
              ? <ChevronRight className="w-4 h-4 text-slate-400" />
              : <ChevronDown  className="w-4 h-4 text-slate-400" />}
            <Zap className="w-4 h-4 text-violet-400" />
            <span className="font-medium text-sm">Línea upstream — Evisceradoras Baader 142</span>
            {snapshot && (
              <Badge variant="outline" className="text-[10px] px-1.5 py-0 h-4 border-violet-900/60 text-violet-400">
                {snapshot.machines.length} máquinas
              </Badge>
            )}
          </button>
          <div className="flex items-center gap-3 text-xs text-slate-500 ml-auto flex-wrap justify-end">
            {/* KPIs totales línea completa — siempre visibles, también en collapsed */}
            {lineKpis && <ProductionKpiRow kpis={lineKpis} />}
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
                className="flex items-center gap-1 text-[10px] text-slate-400 hover:text-slate-200 transition-colors px-1.5 py-1 rounded border border-slate-700 hover:border-slate-500"
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
          <div className="mt-3 pt-3 border-t border-slate-800">
            {loading && (
              <div className="text-sm text-slate-500 py-4 text-center">
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
              <div className="text-xs text-slate-500 py-3 space-y-1">
                <p>📡 <strong className="text-slate-300">Integración con Shoplogix en desarrollo.</strong></p>
                <p className="text-slate-600">
                  Próximamente: estado en vivo de las 3 Baaders 142, paros, Micro Detenciones
                  y correlación con los P0 del Grader. Ver <code className="text-slate-400">docs/SHOPLOGIX_INTEGRATION_PLAN.md</code>.
                </p>
              </div>
            )}

            {/* ── Gráfico tasa pz/min por Baader + promedio ─────────────────────
                Siempre visible cuando hay datos. Permite ver de un vistazo
                qué máquina bajó primero y cuánto difiere del promedio. */}
            {snapshot && snapshot.machines.length > 0 && (
              <div className="mb-3 pb-3 border-b border-slate-800/60">
                <p className="text-[10px] text-slate-500 uppercase tracking-wider mb-1.5">
                  Tasa de producción por máquina · pz/min
                </p>
                <ProductionRateLineEC
                  machines={snapshot.machines}
                  windowStart={windowStart}
                  windowEnd={windowEnd}
                />
              </div>
            )}

            {snapshot && snapshot.machines.length > 0 && (
              <div className="divide-y divide-slate-800/60">
                {snapshot.machines.map(m => (
                  <MachineRow
                    key={m.machineid}
                    shift={m}
                    expanded={expandedMachines.has(m.machineid)}
                    onToggle={() => toggleMachine(m.machineid)}
                    windowStart={windowStart}
                    windowEnd={windowEnd}
                    microAlert={microAlertSet.has(m.machineid)}
                    plantSlug={plantSlug}
                  />
                ))}
              </div>
            )}

            {snapshot && syncedAt && (
              <div className="mt-2 pt-2 border-t border-slate-800 text-[11px] text-slate-600 text-right">
                Sincronizado: {syncedAt.toLocaleString('es-CL')}
              </div>
            )}
          </div>
        )}
      </CardContent>
    </Card>
  )
}
