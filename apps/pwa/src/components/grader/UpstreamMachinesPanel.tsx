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
  TrendingUp, TrendingDown, Timer, Pause, AlertTriangle,
} from 'lucide-react'
import type {
  UpstreamLineSnapshot,
  UpstreamMachineShift,
  UpstreamProductionInterval,
  UpstreamMachineState,
} from '@/services/shoplogix/types'

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
}

// ============================================================================
// Helpers de formato
// ============================================================================

/** Shoplogix guarda wall-clock time como UTC. Mostramos UTC tal cual. */
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
 * Genera ticks horarios entre start y end. Devuelve Date en cada hora exacta
 * del rango que tenga al menos 30 min hasta el borde.
 */
function generateHourTicks(start: Date, end: Date): Date[] {
  const ticks: Date[] = []
  // Primer tick: siguiente hora exacta a start
  const firstTick = new Date(Date.UTC(
    start.getUTCFullYear(), start.getUTCMonth(), start.getUTCDate(),
    start.getUTCHours() + (start.getUTCMinutes() > 0 ? 1 : 0), 0, 0, 0,
  ))
  for (let t = firstTick.getTime(); t < end.getTime() - 30 * 60 * 1000; t += 3600 * 1000) {
    ticks.push(new Date(t))
  }
  return ticks
}

/**
 * Gantt con leyenda + ticks horarios. Si se provee `windowStart/End`, el Gantt
 * se renderiza en ese rango (permite alineación con timeline del Grader).
 */
function StateTimeline({
  shift,
  windowStart,
  windowEnd,
}: {
  shift: UpstreamMachineShift
  windowStart?: Date
  windowEnd?: Date
}) {
  const rangeStart = windowStart ?? shift.shiftStart
  const rangeEnd   = windowEnd   ?? shift.shiftEnd
  const totalMs = rangeEnd.getTime() - rangeStart.getTime()
  const reasons = useMemo(() => aggregateStatesByReason(shift.states), [shift.states])
  const ticks = useMemo(() => generateHourTicks(rangeStart, rangeEnd), [rangeStart, rangeEnd])

  if (totalMs <= 0 || shift.states.length === 0) {
    return <div className="h-4 rounded bg-slate-800/60" />
  }

  return (
    <div className="space-y-1">
      {/* Gantt + overlay de ticks */}
      <div className="relative">
        <div className="flex h-4 rounded overflow-hidden bg-slate-800/60 border border-slate-800">
          {shift.states.map((st, i) => {
            // Recorta el estado al windowStart/End si lo excede
            const segStart = Math.max(st.startAt.getTime(), rangeStart.getTime())
            const segEnd   = Math.min(st.endAt.getTime(),   rangeEnd.getTime())
            if (segEnd <= segStart) return null
            const startOffsetPct = ((segStart - rangeStart.getTime()) / totalMs) * 100
            const widthPct       = ((segEnd - segStart) / totalMs) * 100
            const label = st.reason ? `${st.name}: ${st.reason}` : st.name
            const mins = Math.round(st.durationSec / 60)
            return (
              <div
                key={i}
                style={{
                  position: 'absolute',
                  left: `${startOffsetPct}%`,
                  width: `${widthPct}%`,
                  height: '100%',
                  backgroundColor: st.color,
                }}
                className="border-r border-slate-900/40"
                title={`${label} — ${mins} min (${fmtHHmm(st.startAt)}–${fmtHHmm(st.endAt)})`}
              />
            )
          })}
        </div>

        {/* Ticks verticales de hora — sutiles, sobre el gantt */}
        {ticks.map((t, i) => {
          const leftPct = ((t.getTime() - rangeStart.getTime()) / totalMs) * 100
          return (
            <div
              key={`tick-${i}`}
              className="absolute top-0 bottom-0 border-l border-white/25 pointer-events-none"
              style={{ left: `${leftPct}%` }}
            />
          )
        })}
      </div>

      {/* Eje horario debajo del gantt */}
      {ticks.length > 0 && (
        <div className="relative h-3 text-[9px] text-slate-500 tabular-nums">
          <span className="absolute left-0">{fmtHHmm(rangeStart)}</span>
          {ticks.map((t, i) => {
            const leftPct = ((t.getTime() - rangeStart.getTime()) / totalMs) * 100
            return (
              <span
                key={`label-${i}`}
                className="absolute"
                style={{ left: `${leftPct}%`, transform: 'translateX(-50%)' }}
              >
                {fmtHHmm(t)}
              </span>
            )
          })}
          <span className="absolute right-0">{fmtHHmm(rangeEnd)}</span>
        </div>
      )}

      {/* Leyenda condensada — top 6 razones por duración */}
      {reasons.length > 0 && (
        <div className="flex flex-wrap gap-x-3 gap-y-1 text-[10px] text-slate-400">
          {reasons.slice(0, 6).map(r => (
            <div key={r.reason} className="flex items-center gap-1" title={`${r.count} eventos`}>
              <span className="w-2 h-2 rounded-sm" style={{ backgroundColor: r.color }} />
              <span className="text-slate-300">{r.reason}</span>
              <span className="text-slate-500 tabular-nums">{fmtDuration(r.durationSec)}</span>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}

/** Bar chart de producción por intervalo con línea objetivo visible. */
function ProductionBars({ intervals, threshold }: { intervals: UpstreamProductionInterval[]; threshold: number }) {
  if (intervals.length === 0) {
    return <div className="h-16 rounded bg-slate-800/40" />
  }
  const maxValue = Math.max(1, ...intervals.map(x => Math.max(x.cycles, x.expectedCycles)))
  const expected = intervals.find(x => x.expectedCycles > 0)?.expectedCycles ?? 0
  const expectedPct = (expected / maxValue) * 100

  const colorMap: Record<UpstreamProductionInterval['color'], string> = {
    green:  'bg-emerald-500/90',
    yellow: 'bg-amber-500/90',
    red:    'bg-rose-500/90',
    gray:   'bg-slate-700/60',
  }

  return (
    <div className="relative h-16 bg-slate-950/60 rounded px-1.5 py-1 border border-slate-800">
      {/* Línea objetivo — absolute dentro del contenedor relativo */}
      <div
        className="absolute left-1.5 right-1.5 border-t border-dashed border-violet-400/70 z-10 pointer-events-none"
        style={{ bottom: `${4 + (expectedPct * (64 - 8)) / 100}px` }}
      />

      {/* Barras: flex row con altura completa */}
      <div className="flex gap-[2px] h-full">
        {intervals.map((it, i) => {
          const heightPct = (it.cycles / maxValue) * 100
          return (
            <div
              key={i}
              className="flex-1 min-w-[2px] h-full flex flex-col justify-end relative group"
              title={`${fmtHHmm(it.startAt)}: ${it.cycles}/${Math.round(it.expectedCycles)} pz (${fmtPct(it.ratio)})`}
            >
              <div
                className={`${colorMap[it.color]} rounded-sm transition-all w-full`}
                style={{ height: `${Math.max(4, heightPct)}%` }}
              />
            </div>
          )
        })}
      </div>

      {/* Etiqueta "Objetivo" */}
      <div className="absolute right-2 top-1 text-[9px] text-violet-400/80 bg-slate-900/90 px-1.5 rounded z-20">
        Objetivo {Math.round(expected)} ± {threshold}%
      </div>
    </div>
  )
}

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
  const kpis   = useMemo(() => computeKpis(shift.intervals), [shift.intervals])
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

      {/* KPI row siempre visible (verde/amarillo/rojo) */}
      <ProductionKpiRow kpis={kpis} />

      {/* Gantt con leyenda */}
      <StateTimeline shift={shift} windowStart={windowStart} windowEnd={windowEnd} />

      {/* Production bars + objetivo */}
      <ProductionBars intervals={shift.intervals} threshold={shift.threshold} />

      {/* Mini stats footer */}
      <div className="flex items-center gap-4 text-[11px] text-slate-500">
        <span className="flex items-center gap-1" title="Runtime del turno">
          <Timer className="w-3 h-3" /> {fmtPct(shift.actualRuntime)} runtime
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
}: Props) {
  const [collapsed, setCollapsed] = useState(defaultCollapsed)
  const [expandedMachines, setExpandedMachines] = useState<Set<string>>(new Set())

  const isStale = useMemo(() => {
    if (!syncedAt) return false
    const ageMin = (Date.now() - syncedAt.getTime()) / 60000
    return ageMin > 15
  }, [syncedAt])

  // Ventana temporal a usar para alinear el Gantt. Si el Grader provee
  // shiftWindow, lo respetamos. Sino, cada máquina usa su propio shiftStart/End.
  const [windowStart, windowEnd] = useMemo<[Date | undefined, Date | undefined]>(() => {
    if (!shiftWindow?.startAt || !shiftWindow?.endAt) return [undefined, undefined]
    const s = new Date(shiftWindow.startAt)
    const e = new Date(shiftWindow.endAt)
    if (isNaN(s.getTime()) || isNaN(e.getTime())) return [undefined, undefined]
    return [s, e]
  }, [shiftWindow?.startAt, shiftWindow?.endAt])

  // Agregado de toda la línea (para header)
  const lineKpis = useMemo(() => {
    if (!snapshot || snapshot.machines.length === 0) return null
    const all = snapshot.machines.flatMap(m => m.intervals)
    return computeKpis(all)
  }, [snapshot])

  // Detector de microparadas anómalas por máquina: marca la máquina si tiene
  // >50% más microparadas que el promedio de la línea (útil para mantención
  // predictiva — ej: E3 con 61 vs prom 44 = +39% → atención).
  const microAlertSet = useMemo<Set<string>>(() => {
    const set = new Set<string>()
    if (!snapshot || snapshot.machines.length < 2) return set
    const counts = snapshot.machines.map(m =>
      m.states.filter(s => s.name === 'Micro Detencion').length,
    )
    const avg = counts.reduce((a, x) => a + x, 0) / counts.length
    if (avg <= 0) return set
    snapshot.machines.forEach((m, i) => {
      if ((counts[i] ?? 0) > avg * 1.5) set.add(m.machineid)
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
        {/* Header del panel */}
        <button
          onClick={() => setCollapsed(c => !c)}
          className="w-full flex items-center justify-between gap-2 group"
          aria-expanded={!collapsed}
        >
          <div className="flex items-center gap-2">
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
          </div>
          <div className="flex items-center gap-2 text-xs text-slate-500">
            {loading && <span>Cargando…</span>}
            {error && <span className="text-rose-400 flex items-center gap-1"><AlertCircle className="w-3 h-3" /> Error</span>}
            {isStale && <span className="text-amber-400">Desactualizado</span>}
            {snapshot && !loading && (
              <span className="tabular-nums">
                <Activity className="w-3 h-3 inline mr-1" />
                {fmtInt(snapshot.lineThroughputActual)} / {fmtInt(snapshot.lineThroughputExpected)} pz/h
              </span>
            )}
          </div>
        </button>

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

            {snapshot && snapshot.machines.length > 0 && lineKpis && (
              <>
                {/* Línea-wide KPI row (suma de las 3) */}
                <div className="mb-3 pb-3 border-b border-slate-800/60">
                  <div className="text-[11px] text-slate-500 mb-1.5">Totales línea completa</div>
                  <ProductionKpiRow kpis={lineKpis} />
                </div>

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
              </>
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
