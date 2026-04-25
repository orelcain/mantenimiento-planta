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

import { useState, useMemo } from 'react'
import { Card, CardContent, Badge } from '@/components/ui'
import {
  ChevronDown, ChevronRight, Factory, Activity, AlertCircle, Zap,
  TrendingUp, TrendingDown, Timer, Pause, AlertTriangle, Download,
} from 'lucide-react'
import type {
  UpstreamLineSnapshot,
  UpstreamMachineShift,
  UpstreamProductionInterval,
  UpstreamMachineState,
} from '@/services/shoplogix/types'
import type { Pause as GraderPause } from '@/services/grader/types'
import { correlatePausesWithUpstream, summarizeCorrelations } from '@/services/shoplogix/shoplogixCorrelation'
import { useTimelineSyncOptional } from './useTimelineSync'
import { StateTimelineEC } from './StateTimelineEC'
import { ProductionBarsEC } from './ProductionBarsEC'
import { StateDetailPanel } from './StateDetailPanel'
import { exportCombinedTimelinePng } from './exportCombinedTimelinePng'

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
function fmtHHmm(d: Date): string {
  return `${String(d.getUTCHours()).padStart(2, '0')}:${String(d.getUTCMinutes()).padStart(2, '0')}`
}

function fmtPct(x: number, decimals = 1): string {
  if (!isFinite(x)) return '—'
  return `${(x * 100).toFixed(decimals)}%`
}

function fmtInt(n: number): string {
  if (!isFinite(n)) return '—'
  return Math.round(n).toLocaleString('es-CL')
}

/** "3600s" → "1 h" | "900s" → "15 min" */
function fmtDuration(sec: number): string {
  const min = Math.round(sec / 60)
  if (min < 60) return `${min} min`
  const h = Math.floor(min / 60)
  const rm = min % 60
  return rm > 0 ? `${h} h ${rm} min` : `${h} h`
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
    const existing = map.get(key)
    if (existing) {
      existing.durationSec += s.durationSec
      existing.count += 1
    } else {
      map.set(key, { reason: key, color: s.color, durationSec: s.durationSec, count: 1 })
    }
  }
  return Array.from(map.values()).sort((a, b) => b.durationSec - a.durationSec)
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

      {/* Leyenda condensada — top 6 razones por duración */}
      {reasons.length > 0 && (
        <div className="flex flex-wrap gap-x-3 gap-y-1 text-[10px] text-slate-400 pt-0.5">
          {reasons.slice(0, 6).map(r => (
            <div key={r.reason} className="flex items-center gap-1.5" title={`${r.count} evento${r.count !== 1 ? 's' : ''}`}>
              <span className="w-2.5 h-2.5 rounded-sm shrink-0 ring-1 ring-slate-900/50" style={{ backgroundColor: r.color }} />
              <span className="text-slate-300">{r.reason}</span>
              <span className="text-slate-500 tabular-nums">{fmtDuration(r.durationSec)}</span>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}

// Nota: ProductionBars (HTML divs absolute) fue reemplazado por
// ProductionBarsEC (Fase 3 del Synchronized Timeline). Ver
// `./ProductionBarsEC.tsx`.

/** KPI row tipo Shoplogix: total / verde / amarillo / rojo. */
function ProductionKpiRow({ kpis }: { kpis: MachineKpis }) {
  return (
    <div className="flex items-center gap-1.5 flex-wrap">
      <Badge variant="outline" className="bg-slate-900/60 border-slate-700 text-slate-300 tabular-nums text-[11px] px-2 py-0.5 h-5">
        {fmtInt(kpis.totalProduced)} / {fmtInt(kpis.totalExpected)}
        <span className="text-slate-500 ml-1.5">({fmtPct(kpis.reachedPct, 0)})</span>
      </Badge>
      <Badge variant="outline" className="bg-emerald-950/60 border-emerald-900 text-emerald-300 tabular-nums text-[11px] px-2 py-0.5 h-5">
        {fmtInt(kpis.greenCycles)} ({fmtPct(kpis.greenPct, 0)})
      </Badge>
      <Badge variant="outline" className="bg-amber-950/60 border-amber-900 text-amber-300 tabular-nums text-[11px] px-2 py-0.5 h-5">
        {fmtInt(kpis.yellowCycles)} ({fmtPct(kpis.yellowPct, 0)})
      </Badge>
      <Badge variant="outline" className="bg-rose-950/60 border-rose-900 text-rose-300 tabular-nums text-[11px] px-2 py-0.5 h-5">
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
        <span
          className="flex items-center gap-1"
          title={`% del tiempo productivo en Uptime (excluye post-turno).\nUptime: ${fmtDuration(shift.shiftRuntimeBreakdown.uptimeSec)}\nBreak (dentro turno): ${fmtDuration(shift.shiftRuntimeBreakdown.breakSec)}\nPost-turno (excl.): ${fmtDuration(shift.shiftRuntimeBreakdown.plannedDowntimeSec)}\nDowntime: ${fmtDuration(shift.shiftRuntimeBreakdown.downtimeSec)}`}
        >
          <Timer className="w-3 h-3" /> {fmtPct(shift.shiftRuntime)} runtime
        </span>
        <span className="flex items-center gap-1" title="Paros (Break)">
          <Pause className="w-3 h-3" /> {breaks} paros
        </span>
        {micro > 0 && (
          <span className="text-cyan-400 flex items-center gap-1" title="Micro Detenciones (<5 min)">
            <Zap className="w-3 h-3" /> {micro} micro
          </span>
        )}
        <span className="ml-auto text-[10px] text-slate-600">
          {fmtHHmm(shift.shiftStart)} – {fmtHHmm(shift.shiftEnd)}
        </span>
      </div>

      {/* Detalle expandido (futuro: aquí iría el drill-down tipo Shoplogix completo) */}
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
              <div className={shift.runtimeVariance >= 0 ? 'text-emerald-400' : 'text-rose-400'}>
                {shift.runtimeVariance >= 0 ? '+' : ''}{fmtPct(shift.runtimeVariance, 2)}
              </div>
            </div>
          </div>
          {shift.comments.length > 0 && (
            <div className="mt-2">
              <div className="text-slate-600 mb-0.5">Comentarios del turno</div>
              <ul className="list-disc list-inside text-slate-300 space-y-0.5">
                {shift.comments.slice(0, 5).map((c, i) => <li key={i}>{c}</li>)}
              </ul>
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
}: Props) {
  const [collapsed, setCollapsed] = useState(defaultCollapsed)
  const [expandedMachines, setExpandedMachines] = useState<Set<string>>(new Set())

  const isStale = useMemo(() => {
    if (!syncedAt) return false
    const ageMin = (Date.now() - syncedAt.getTime()) / 60000
    return ageMin > 15
  }, [syncedAt])

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

  // Detector de microparadas anómalas. Marca una máquina si:
  //   (a) tiene el conteo más alto de la línea, Y
  //   (b) está ≥25% sobre el promedio Y al menos 15 eventos absolutos
  // (evita falsos positivos en turnos con muy pocas microparadas totales).
  const microAlertSet = useMemo<Set<string>>(() => {
    const set = new Set<string>()
    if (!snapshot || snapshot.machines.length < 2) return set
    const counts = snapshot.machines.map(m =>
      m.states.filter(s => s.name === 'Micro Detencion').length,
    )
    const max = Math.max(...counts)
    if (max < 15) return set  // umbral absoluto
    const avg = counts.reduce((a, x) => a + x, 0) / counts.length
    if (avg <= 0) return set
    snapshot.machines.forEach((m, i) => {
      const n = counts[i] ?? 0
      if (n === max && n > avg * 1.25) set.add(m.machineid)
    })
    return set
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
            {isStale && <span className="text-amber-400">Desactualizado</span>}
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
                  }).catch((err) => console.error('Export combinado falló:', err))
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
