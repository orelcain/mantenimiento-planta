/**
 * StateDetailPanel — panel de detalle rico al clickear un estado del Gantt Baader.
 *
 * Reemplaza el tooltip nativo (efímero, solo texto) con un panel persistente
 * que muestra:
 *   - Estado (nombre + razón categorizada)
 *   - Hora inicio / fin (HH:MM:SS Chile)
 *   - Duración formateada
 *   - % del turno que ocupa este estado
 *   - Posición en la secuencia ("estado #5 de 87")
 *   - Conteo de estados similares + tiempo total acumulado de la misma razón
 *
 * Drill-down típico:
 *   1. Operador ve un paro largo en el Gantt
 *   2. Click → panel se expande con el contexto completo
 *   3. Decide: ¿fue colación? ¿micro detención repetitiva?
 *
 * Diseño compacto (≤ 4 filas de altura) para no romper layout del MachineRow.
 */

import { Badge } from '@/components/ui'
import { X, Clock, Activity, AlertCircle, Pause, Wrench, MessageSquare } from 'lucide-react'
import type { UpstreamMachineShift, UpstreamMachineState, UpstreamShiftComment } from '@/services/shoplogix/types'
import { fmtTimeWithSec, fmtDurationSec } from '@/services/grader/graderTimeFormat'
import { softenAccentHex } from '@/lib/softenColor'

// ── Helpers de formato ────────────────────────────────────────────────────────

function fmtPct(frac: number, decimals = 1): string {
  return `${(frac * 100).toFixed(decimals)}%`
}

/** Icono según el tipo de estado. */
function StateIcon({ type }: { type: UpstreamMachineState['type'] }) {
  if (type === 'uptime') return <Activity className="w-4 h-4 text-emerald-400" />
  if (type === 'downtime') return <AlertCircle className="w-4 h-4 text-cat-5-ink" />
  if (type === 'break') return <Pause className="w-4 h-4 text-cat-7-ink" />
  return <Wrench className="w-4 h-4 text-amber-400" />
}

const TYPE_LABEL: Record<UpstreamMachineState['type'], string> = {
  uptime:   'Producción',
  downtime: 'Detención',
  break:    'Pausa programada',
  setup:    'Setup',
}

// ── Componente ────────────────────────────────────────────────────────────────

interface Props {
  /** El estado seleccionado en el Gantt. */
  state: UpstreamMachineState
  /** Shift completo — necesario para % del turno y comparación con estados similares. */
  shift: UpstreamMachineShift
  /** Comentario(s) de operador emparejados a este estado (matchCommentsToStates,
   *  por razón + solape temporal) — ya se mostraban en la tabla "Análisis del
   *  turno" de más abajo; ahora también aquí, en el detalle del click directo
   *  sobre el Gantt (pedido Orel 2026-07-22: no obligar a bajar a la tabla). */
  comments?: UpstreamShiftComment[]
  /** Cierra el panel. */
  onClose: () => void
}

export function StateDetailPanel({ state, shift, comments, onClose }: Props) {
  const shiftDurationMs = shift.shiftEnd.getTime() - shift.shiftStart.getTime()
  const shiftDurationSec = shiftDurationMs / 1000

  // Posición del estado en la secuencia
  const stateIndex = shift.states.findIndex((s) => s.startAt.getTime() === state.startAt.getTime() && s.name === state.name)

  // Conteo + duración acumulada de estados similares (misma razón)
  const similarStates = shift.states.filter((s) =>
    s.name === state.name && (s.reason || '') === (state.reason || ''),
  )
  const similarTotalSec = similarStates.reduce((acc, s) => acc + s.durationSec, 0)

  // % del turno
  const pctOfShift = shiftDurationSec > 0 ? state.durationSec / shiftDurationSec : 0
  const pctSimilarOfShift = shiftDurationSec > 0 ? similarTotalSec / shiftDurationSec : 0

  const reasonLabel = state.reason && state.reason.trim().length > 0
    ? state.reason
    : <span className="text-muted-foreground italic">sin categorizar</span>

  return (
    <div
      className="rounded-ctl border border-border/80 bg-muted/80 backdrop-blur-sm p-3 space-y-2"
      role="region"
      aria-label="Detalle de estado seleccionado"
    >
      {/* Header */}
      <div className="flex items-start justify-between gap-2">
        <div className="flex items-center gap-2 min-w-0">
          <span
            className="w-3 h-3 rounded-ctl shrink-0 ring-1 ring-foreground/50"
            style={{ backgroundColor: softenAccentHex(state.color) }}
          />
          <StateIcon type={state.type} />
          <div className="min-w-0">
            <div className="flex items-center gap-2 flex-wrap">
              <span className="font-semibold text-sm text-foreground">{state.name}</span>
              <Badge variant="outline" className="text-caption px-1.5 py-0 h-4 border-border text-muted-foreground">
                {TYPE_LABEL[state.type] ?? state.type}
              </Badge>
              {state.isCurrent && (
                <Badge variant="outline" className="text-caption px-1.5 py-0 h-4 border-emerald-500/[0.25] bg-emerald-500/[0.15] text-ink-ok dark:border-emerald-500/[0.25] dark:bg-emerald-500/[0.15] dark:text-ink-ok">
                  En curso
                </Badge>
              )}
            </div>
            <div className="text-xs text-foreground mt-0.5 truncate">{reasonLabel}</div>
          </div>
        </div>
        <button
          onClick={onClose}
          className="text-muted-foreground hover:text-foreground transition-colors shrink-0"
          aria-label="Cerrar detalle"
          data-testid="state-detail-close"
        >
          <X className="w-4 h-4" />
        </button>
      </div>

      {/* Datos en grid 2-col */}
      <div className="grid grid-cols-2 gap-x-4 gap-y-1.5 text-xs">
        <DataRow
          icon={<Clock className="w-3 h-3" />}
          label="Inicio"
          value={fmtTimeWithSec(state.startAt)}
        />
        <DataRow
          icon={<Clock className="w-3 h-3" />}
          label="Fin"
          value={fmtTimeWithSec(state.endAt)}
        />
        <DataRow
          label="Duración"
          value={<span className="font-semibold text-foreground tabular-nums">{fmtDurationSec(state.durationSec)}</span>}
        />
        <DataRow
          label="% del turno"
          value={<span className="tabular-nums">{fmtPct(pctOfShift)}</span>}
        />
        {stateIndex >= 0 && (
          <DataRow
            label="Posición"
            value={<span className="tabular-nums">#{stateIndex + 1} de {shift.states.length}</span>}
          />
        )}
        {similarStates.length > 1 && (
          <DataRow
            label="Similares"
            value={
              <span className="tabular-nums" title={`Estados con misma categoría "${state.name}${state.reason ? ' / ' + state.reason : ''}" en el turno`}>
                {similarStates.length} × {fmtDurationSec(similarTotalSec)}{' '}
                <span className="text-muted-foreground">({fmtPct(pctSimilarOfShift)})</span>
              </span>
            }
          />
        )}
      </div>

      {/* Comentario(s) de operador emparejados a este evento — mismo match que
          la tabla "Análisis del turno" (matchCommentsToStates), visible acá
          para no obligar a bajar a buscarlo. */}
      {comments && comments.length > 0 && (
        <div className="pt-1.5 border-t border-border/60 space-y-1">
          {comments.map((c) => (
            <div key={c.key} className="flex items-start gap-1.5 text-xs">
              <MessageSquare className="w-3 h-3 text-muted-foreground shrink-0 mt-0.5" />
              <span className="text-foreground italic">{c.text}</span>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}

// ── Sub-helpers ───────────────────────────────────────────────────────────────

function DataRow({
  icon, label, value,
}: {
  icon?: React.ReactNode
  label: string
  value: React.ReactNode
}) {
  return (
    <div className="flex items-center gap-1.5">
      {icon && <span className="text-muted-foreground">{icon}</span>}
      <span className="text-muted-foreground shrink-0">{label}:</span>
      <span className="text-foreground truncate">{value}</span>
    </div>
  )
}
