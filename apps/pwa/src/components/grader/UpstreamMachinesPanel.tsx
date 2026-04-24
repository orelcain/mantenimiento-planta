/**
 * Panel "Línea upstream" — muestra el estado de las 3 Baaders 142 evisceradoras
 * (upstream del Grader) durante el mismo turno, para correlacionar paros y
 * ritmos con los P0 del Grader.
 *
 * Data viene de Shoplogix (integración vía Cloud Function — ver
 * docs/SHOPLOGIX_INTEGRATION_PLAN.md). Mientras no esté la Cloud Function,
 * en DEV muestra data sintética realista basada en Feb 26 2026.
 *
 * UX: panel colapsable. Inicia expandido si hay al menos 1 Baader con datos.
 */

import { useState, useMemo } from 'react'
import { Card, CardContent, Badge } from '@/components/ui'
import { ChevronDown, ChevronRight, Factory, Activity, AlertCircle, Zap } from 'lucide-react'
import type {
  UpstreamLineSnapshot,
  UpstreamMachineShift,
  UpstreamProductionInterval,
} from '@/services/shoplogix/types'

interface Props {
  /** Data de la línea upstream para este turno. null si aún no carga; undefined si no hay. */
  snapshot: UpstreamLineSnapshot | null | undefined
  /** Se está cargando data real. */
  loading?: boolean
  /** Hubo error cargando. */
  error?: string | null
  /** Inicia colapsado. Default: false. */
  defaultCollapsed?: boolean
  /**
   * Timestamp del último sync exitoso. Si > 15 min → warning "desactualizado".
   */
  syncedAt?: Date | null
}

/**
 * Formatea un Date a HH:mm. Shoplogix almacena timestamps como wall-clock
 * local (aunque los devuelve con sufijo UTC). Por eso mostramos getUTCHours()
 * tal cual — así coincide con el horario que muestra la UI de Shoplogix.
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

/** Mini Gantt horizontal — renderiza una fila de segmentos por máquina. */
function MiniGantt({ shift }: { shift: UpstreamMachineShift }) {
  const totalMs = shift.shiftEnd.getTime() - shift.shiftStart.getTime()
  if (totalMs <= 0 || shift.states.length === 0) {
    return <div className="h-3 rounded bg-slate-800/60" />
  }
  return (
    <div className="flex h-3 rounded overflow-hidden bg-slate-800/60" title={`${shift.machineName} — timeline`}>
      {shift.states.map((st, i) => {
        const startOffset = Math.max(0, st.startAt.getTime() - shift.shiftStart.getTime())
        const segMs = Math.max(0, st.endAt.getTime() - st.startAt.getTime())
        const widthPct = (segMs / totalMs) * 100
        if (widthPct <= 0) return null
        const label = st.reason ? `${st.name}: ${st.reason}` : st.name
        const mins = Math.round(st.durationSec / 60)
        return (
          <div
            key={i}
            style={{ width: `${widthPct}%`, backgroundColor: st.color, marginLeft: i === 0 ? `${(startOffset / totalMs) * 100}%` : 0 }}
            className="border-r border-slate-900/40 last:border-r-0"
            title={`${label} — ${mins} min (${fmtHHmm(st.startAt)}–${fmtHHmm(st.endAt)})`}
          />
        )
      })}
    </div>
  )
}

/** Mini barras de producción — 1 barra por intervalo de 5 min. */
function MiniBars({ intervals }: { intervals: UpstreamProductionInterval[] }) {
  if (intervals.length === 0) {
    return <div className="h-10 rounded bg-slate-800/40" />
  }
  const maxCycles = Math.max(1, ...intervals.map(x => Math.max(x.cycles, x.expectedCycles)))
  const colorMap: Record<UpstreamProductionInterval['color'], string> = {
    green:  'bg-emerald-500',
    yellow: 'bg-amber-500',
    red:    'bg-rose-500',
    gray:   'bg-slate-700',
  }
  return (
    <div className="flex items-end gap-[1px] h-10 bg-slate-900/40 rounded px-1 py-1">
      {intervals.map((it, i) => {
        const heightPct = (it.cycles / maxCycles) * 100
        const expectedPct = (it.expectedCycles / maxCycles) * 100
        return (
          <div
            key={i}
            className="flex-1 min-w-[2px] flex flex-col justify-end relative"
            title={`${fmtHHmm(it.startAt)}: ${it.cycles}/${Math.round(it.expectedCycles)} (${fmtPct(it.ratio)})`}
          >
            {/* Línea del objetivo (tenue) */}
            <div
              className="absolute left-0 right-0 border-t border-dashed border-slate-500/50"
              style={{ bottom: `${expectedPct}%` }}
            />
            {/* Barra real */}
            <div
              className={`${colorMap[it.color]} rounded-sm`}
              style={{ height: `${Math.max(2, heightPct)}%` }}
            />
          </div>
        )
      })}
    </div>
  )
}

/** Fila por máquina con KPIs + mini-timeline + mini-bars. */
function MachineRow({ shift }: { shift: UpstreamMachineShift }) {
  const stops = shift.states.filter(s => s.type !== 'uptime')
  const breaks = stops.filter(s => s.type === 'break').length
  const micro  = shift.states.filter(s => s.name === 'Micro Detencion').length

  const ratioColor =
    shift.overallRatio >= 0.85 ? 'text-emerald-400'
    : shift.overallRatio >= 0.5 ? 'text-amber-400'
    : 'text-rose-400'

  return (
    <div className="space-y-1.5 py-2">
      <div className="flex items-center justify-between gap-2">
        <div className="flex items-center gap-2 min-w-0">
          <Factory className="w-4 h-4 text-slate-400 flex-shrink-0" />
          <span className="font-medium text-sm truncate">{shift.machineName}</span>
          <Badge variant="outline" className="text-[10px] px-1.5 py-0 h-4 border-slate-700 text-slate-400">
            Baader 142
          </Badge>
        </div>
        <div className="flex items-center gap-3 text-xs">
          <span className={`font-semibold tabular-nums ${ratioColor}`} title="Ritmo vs objetivo">
            {fmtPct(shift.overallRatio)}
          </span>
          <span className="text-slate-400 tabular-nums" title="Piezas totales">
            {fmtInt(shift.totalCycles)}
          </span>
        </div>
      </div>

      <MiniGantt shift={shift} />
      <MiniBars intervals={shift.intervals} />

      <div className="flex items-center gap-4 text-[11px] text-slate-500">
        <span title="Runtime del turno">⏱ {fmtPct(shift.actualRuntime)}</span>
        <span title="Paros programados (Break)">⏸ {breaks}</span>
        {micro > 0 && (
          <span className="text-cyan-400" title="Micro Detenciones">⚡ {micro}</span>
        )}
      </div>
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
}: Props) {
  const [collapsed, setCollapsed] = useState(defaultCollapsed)

  const isStale = useMemo(() => {
    if (!syncedAt) return false
    const ageMin = (Date.now() - syncedAt.getTime()) / 60000
    return ageMin > 15
  }, [syncedAt])

  // Estado vacío: sin integración aún
  const empty = !loading && !error && (!snapshot || snapshot.machines.length === 0)

  return (
    <Card className="border-slate-800 bg-slate-950/50">
      <CardContent className="py-3 px-4">
        {/* Header */}
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
                <p>
                  📡 <strong className="text-slate-300">Integración con Shoplogix en desarrollo.</strong>
                </p>
                <p className="text-slate-600">
                  Próximamente: estado en vivo de las 3 Baaders 142 (Evisceradora 1, 2, 3), paros, Micro Detenciones
                  y correlación con los P0 del Grader. Ver{' '}
                  <code className="text-slate-400">docs/SHOPLOGIX_INTEGRATION_PLAN.md</code>.
                </p>
              </div>
            )}

            {snapshot && snapshot.machines.length > 0 && (
              <div className="divide-y divide-slate-800/60">
                {snapshot.machines.map(m => (
                  <MachineRow key={m.machineid} shift={m} />
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
