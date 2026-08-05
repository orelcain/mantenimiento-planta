/**
 * Scorecard para modo Shoplogix-only (sin Excel Grader).
 * Replica el patrón visual de HeroScorecard: card con borde coloreado,
 * hero metric grande, KPIs secundarios y breakdown por máquina.
 *
 * Usado en AnalisisGraderTurnoPage cuando !summary && upstreamLine.snapshot.
 */
import { cn } from '@/lib/utils'
import { lineMachinesLabel, machineShortLabel } from '@/services/shoplogix/shoplogixMachines'
import { Badge, Card, CardContent, InfoTooltip } from '@/components/ui'
import { Activity, Clock, Sun, Sunset, Moon, Sunrise } from 'lucide-react'
import type { UpstreamLineSnapshot } from '@/services/shoplogix/types'
import type { ShiftTimeWindow } from '@/services/grader/graderShiftStatus'
import { getShiftMeta } from '@/services/grader/graderShiftDisplay'
import { shortMachineName } from '@/services/grader/graderMachineNames'

const VERDICT_STYLE = {
  ok: {
    border: 'border-emerald-500',
    bg: 'bg-emerald-500/15',
    numColor: 'text-emerald-400',
    label: 'Línea en buen rendimiento',
  },
  warn: {
    border: 'border-amber-500',
    bg: 'bg-amber-500/15',
    numColor: 'text-amber-400',
    label: 'Línea con oportunidades de mejora',
  },
  critical: {
    border: 'border-red-500',
    bg: 'bg-red-500/15',
    numColor: 'text-red-400',
    label: 'Línea con bajo rendimiento',
  },
}

/** Veredicto POR MÁQUINA — combina disponibilidad (uptime) Y ritmo (ciclos
 *  reales vs objetivo Shoplogix): "qué tan óptimo va cada Baader", no solo si
 *  estuvo prendida. Pedido de Orel 2026-07-23: un vistazo rápido por Baader,
 *  no dos números sueltos que hay que leer e interpretar. Manda el peor de
 *  los dos ejes (si el ritmo es bueno pero el uptime es crítico, es crítico).
 *  Umbrales calcados de los ya usados en el resto del módulo: uptime 70/40
 *  (`uptimeTextColor` acá mismo), ritmo 85/50 (`UpstreamMachinesPanel.tsx`). */
const MACHINE_VERDICT_STYLE = {
  ok:       { dot: 'bg-emerald-400', text: 'text-emerald-400', border: 'border-emerald-500/40', bg: 'bg-emerald-500/10', label: 'Óptimo' },
  warn:     { dot: 'bg-amber-400',   text: 'text-amber-400',   border: 'border-amber-500/40',   bg: 'bg-amber-500/10',   label: 'Regular' },
  critical: { dot: 'bg-red-400',     text: 'text-red-400',     border: 'border-red-500/40',      bg: 'bg-red-500/10',     label: 'Crítico' },
} as const

function machineVerdict(uptimePct: number, ratio: number): keyof typeof MACHINE_VERDICT_STYLE {
  const uptimeTier = uptimePct >= 70 ? 2 : uptimePct >= 40 ? 1 : 0
  const ratioTier  = ratio >= 0.85 ? 2 : ratio >= 0.5 ? 1 : 0
  const worst = Math.min(uptimeTier, ratioTier)
  return worst >= 2 ? 'ok' : worst === 1 ? 'warn' : 'critical'
}


interface Props {
  snapshot: UpstreamLineSnapshot
  /**
   * Piezas que planta pide por turno (target de PLANIFICACIÓN de la línea, no la
   * cadencia del sensor). Con esto el turno se lee como cumplimiento y no solo
   * como un número suelto de ciclos.
   */
  plannedTargetPieces?: number
  shiftWindow: ShiftTimeWindow | null
  shiftLabel: string
  dateKey: string
}

export function ShoplogixOnlyScorecard({ snapshot, shiftWindow, shiftLabel, dateKey, plannedTargetPieces }: Props) {
  const totalCycles = snapshot.machines.reduce((s, m) => s + (m.totalCycles ?? 0), 0)
  const isClosed = shiftWindow?.status === 'closed' || shiftWindow?.status == null

  const avgUptime =
    snapshot.machines.length > 0
      ? snapshot.machines.reduce((s, m) => s + (m.shiftRuntime ?? 0), 0) /
        snapshot.machines.length
      : 0

  // Para turno cerrado: máquinas que tuvieron uptime > 0
  const machinesWithData = snapshot.machines.filter(m => (m.shiftRuntime ?? 0) > 0).length

  const verdict: keyof typeof VERDICT_STYLE =
    avgUptime >= 0.7 ? 'ok' : avgUptime >= 0.4 ? 'warn' : 'critical'
  const style = VERDICT_STYLE[verdict]

  const shiftDurationMin =
    snapshot.machines[0]
      ? Math.round(
          (snapshot.machines[0].shiftEnd.getTime() -
            snapshot.machines[0].shiftStart.getTime()) /
            60_000,
        )
      : null

  // Duración: si el turno NO está acotado en Shoplogix (Filete: "Turno Dia"
  // abarca 24 h), la ventana del turno no describe nada. Cuando la ventana real
  // de operación es mucho más corta, se muestra ESA y se dice que es la real.
  const effectiveMin = snapshot.lineWindowSource === 'effective' && snapshot.lineWindowHours > 0
    ? Math.round(snapshot.lineWindowHours * 60)
    : null
  const useEffectiveDuration =
    effectiveMin != null && shiftDurationMin != null && effectiveMin < shiftDurationMin * 0.75

  const durationLabel =
    shiftWindow?.status === 'live' && shiftWindow.remainingMin != null
      ? `${Math.round(shiftWindow.elapsedMin)} min · faltan ${Math.round(shiftWindow.remainingMin)} min`
      : useEffectiveDuration
        ? `${effectiveMin} min reales`
        : shiftDurationMin != null
          ? `${shiftDurationMin} min`
          : '—'

  const uptimeBarColor = (pct: number) =>
    pct >= 70 ? 'bg-emerald-500' : pct >= 40 ? 'bg-amber-500' : 'bg-red-500'
  const uptimeTextColor = (pct: number) =>
    pct >= 70 ? 'text-emerald-400' : pct >= 40 ? 'text-amber-400' : 'text-red-400'

  // Metadata canónica del turno (label + ícono + color) — single source of truth.
  // Horario real de Shoplogix (scheduledStart) → período/ícono por HORA, no por nombre.
  const shiftMeta = getShiftMeta(
    shiftLabel,
    snapshot.machines[0]?.scheduledStart ?? snapshot.machines[0]?.shiftStart ?? shiftWindow?.startAt,
  )
  const ShiftIcon = shiftMeta.iconName === 'Sun' ? Sun
    : shiftMeta.iconName === 'Sunset' ? Sunset
    : shiftMeta.iconName === 'Moon' ? Moon
    : shiftMeta.iconName === 'Sunrise' ? Sunrise
    : null

  return (
    <Card className={cn('border-2 overflow-hidden', style.border)}>
      {/* ── Header ─────────────────────────────────────────────────────── */}
      <div className="flex items-center justify-between px-4 py-2 bg-muted border-b">
        <div className="flex items-center gap-2 flex-wrap">
          {ShiftIcon && <ShiftIcon className={cn('w-3.5 h-3.5 shrink-0', shiftMeta.textColorClass)} />}
          <span className="font-medium text-sm" title={shiftMeta.label}>{shiftMeta.label}</span>
          <span className="text-muted-foreground text-sm">· {dateKey}</span>
          {shiftWindow?.status === 'live' && (
            <Badge className="bg-red-500 text-white animate-pulse text-xs px-2 py-0">
              <Activity className="w-3 h-3 mr-1" />EN VIVO
            </Badge>
          )}
          {shiftWindow?.status === 'closed' && (
            <Badge variant="outline" className="text-xs px-2 py-0">CERRADO</Badge>
          )}
          <Badge variant="outline" className="text-xs px-2 py-0 text-sky-400 border-sky-500/40">
            Solo Shoplogix
          </Badge>
        </div>
        <div className="flex items-center gap-1 text-xs text-muted-foreground">
          <Clock className="w-3 h-3" />
          {durationLabel}
        </div>
      </div>

      {/* ── Body ───────────────────────────────────────────────────────── */}
      <CardContent className={cn('p-3 sm:p-4 space-y-3 sm:space-y-4', style.bg)}>

        {/* Fila 1: hero ciclos + KPIs principales.
            Mobile: hero arriba (full width) + KPIs abajo en grid-3.
            Desktop: hero a la izquierda + KPIs al centro con borde. */}
        <div className="flex flex-col sm:flex-row sm:items-center gap-3 sm:gap-6">
          {/* Hero */}
          <div className="shrink-0">
            <div className={cn('text-4xl sm:text-5xl font-bold tabular-nums leading-none', style.numColor)}>
              {totalCycles.toLocaleString('es-CL')}
            </div>
            <div className="text-xs uppercase tracking-wider text-muted-foreground mt-1">
              ciclos · línea total
            </div>
            {/* Cumplimiento vs lo PLANIFICADO por producción. Se rotula como
                "planificadas" para no confundirlo con el target de cadencia que
                reporta el sensor: son dos números distintos. */}
            {plannedTargetPieces != null && plannedTargetPieces > 0 && (() => {
              const pct = (totalCycles / plannedTargetPieces) * 100
              const cls = pct >= 95 ? 'text-emerald-600 dark:text-emerald-400'
                : pct >= 75 ? 'text-amber-600 dark:text-amber-400'
                : 'text-rose-600 dark:text-rose-400'
              return (
                <div className="text-[11px] mt-1 flex items-center gap-1 flex-wrap">
                  <span className={cn('font-semibold tabular-nums', cls)}>{pct.toFixed(0)}%</span>
                  <span className="text-muted-foreground">
                    de {plannedTargetPieces.toLocaleString('es-CL')} planificadas
                  </span>
                  <InfoTooltip
                    text={`Cumplimiento contra las piezas que producción pide por turno en esta línea (${plannedTargetPieces.toLocaleString('es-CL')}).

No es el target de cadencia del sensor: ese mide velocidad instantánea, este mide el compromiso del turno.`}
                    iconSize={10} position="top"
                  />
                </div>
              )
            })()}
            <div className="text-xs mt-1 font-medium">{style.label}</div>
          </div>

          {/* KPIs secundarios — borde solo en desktop (en mobile rompe línea) */}
          <div className="flex-1 sm:border-l sm:pl-6 grid grid-cols-3 gap-2 sm:gap-3">
            {/* Uptime promedio */}
            <div className="text-center">
              <div className="flex items-center justify-center gap-1 mb-0.5">
                <div className="text-xs text-muted-foreground">
                  <span className="hidden sm:inline">Uptime prom.</span>
                  <span className="sm:hidden">Uptime</span>
                </div>
                <InfoTooltip
                  text={`% promedio del turno en que las máquinas estuvieron activas.\n\n≥ 70% normal · 40–70% bajo · < 40% crítico\n\nPromedio de ${snapshot.machines.length} ${snapshot.machines.length === 1 ? 'máquina' : 'máquinas'}${lineMachinesLabel(snapshot.machines) ? ` ${lineMachinesLabel(snapshot.machines)}` : ''}.`}
                  iconSize={10} position="top"
                />
              </div>
              <div className={cn('text-lg font-semibold tabular-nums', uptimeTextColor(avgUptime * 100))}>
                {(avgUptime * 100).toFixed(0)}%
              </div>
              <div className="h-1.5 bg-muted/60 rounded-full overflow-hidden mt-1">
                <div className={cn('h-full rounded-full', uptimeBarColor(avgUptime * 100))}
                     style={{ width: `${(avgUptime * 100).toFixed(1)}%` }} />
              </div>
            </div>

            {/* Ciclos/hr */}
            <div className="text-center">
              <div className="flex items-center justify-center gap-1 mb-0.5">
                <div className="text-xs text-muted-foreground">ciclos/hr</div>
                <InfoTooltip
                  text={`Ritmo de producción: piezas por hora sobre ${
                    snapshot.lineWindowSource === 'effective'
                      ? `la ventana REAL de operación (de la primera a la última pieza, ${snapshot.lineWindowHours.toFixed(1)} h)`
                      : `la ventana del turno (${snapshot.lineWindowHours.toFixed(1)} h)`
                  }.`}
                  iconSize={10} position="top"
                />
              </div>
              <div className="text-lg font-semibold tabular-nums">
                {snapshot.lineThroughputActual > 0 ? snapshot.lineThroughputActual.toFixed(0) : '—'}
              </div>
            </div>

            {/* Máquinas con registro (cerrado) / activas (live) */}
            <div className="text-center">
              <div className="flex items-center justify-center gap-1 mb-0.5">
                <div className="text-xs text-muted-foreground">
                  <span className="hidden sm:inline">{isClosed ? 'máq. con datos' : 'máq. activas'}</span>
                  <span className="sm:hidden">{isClosed ? 'máq.' : 'activas'}</span>
                </div>
                <InfoTooltip
                  text={isClosed
                    ? 'Cantidad de máquinas de la línea que registraron actividad durante este turno cerrado.'
                    : 'Máquinas de la línea produciendo en este momento.'}
                  iconSize={10} position="top"
                />
              </div>
              <div className="text-lg font-semibold tabular-nums">
                {isClosed
                  ? `${machinesWithData}/${snapshot.machines.length}`
                  : `${snapshot.machinesProducing}/${snapshot.machines.length}`}
              </div>
            </div>
          </div>

          {/* Barra progreso si está en vivo */}
          {shiftWindow?.status === 'live' && shiftWindow.progressPct != null && (
            <div className="shrink-0 w-16 flex flex-col items-center gap-1">
              <div className="text-xs text-muted-foreground">Progreso</div>
              <div className="text-sm font-semibold">{shiftWindow.progressPct.toFixed(0)}%</div>
              <div className="w-full h-2 bg-muted rounded-full overflow-hidden">
                <div className="h-full bg-primary rounded-full transition-all"
                     style={{ width: `${shiftWindow.progressPct}%` }} />
              </div>
            </div>
          )}
        </div>

        {/* Fila 2: breakdown por máquina */}
        {snapshot.machines.length > 0 && (
          <div className="border-t border-border/40 pt-3 space-y-2">
            <div className="flex items-baseline gap-2 text-xs">
              <span className="font-semibold text-muted-foreground uppercase tracking-wider">
                {lineMachinesLabel(snapshot.machines) || 'Máquinas de la línea'}
              </span>
              <span className="tabular-nums font-semibold">{totalCycles.toLocaleString('es-CL')}</span>
              <span className="text-muted-foreground">ciclos totales</span>
            </div>
            <div className="grid grid-cols-3 gap-2 sm:gap-3">
              {snapshot.machines.map((m, idx) => {
                const sharePct = totalCycles > 0 ? (m.totalCycles / totalCycles) * 100 : 0
                const uptimePct = (m.shiftRuntime ?? 0) * 100
                const ratioPct = (m.overallRatio ?? 0) * 100
                const vStyle = MACHINE_VERDICT_STYLE[machineVerdict(uptimePct, m.overallRatio ?? 0)]
                // Label corto en mobile. Sale del MODELO de la máquina, no de un
                // "Ev" fijo: en Filete la máquina es una Baader 200 y aparecía
                // como "Ev 1" (de evisceradora).
                // Con una sola máquina el número no aporta ("B200 1" → "B200").
                const shortLabel = snapshot.machines.length > 1
                  ? `${machineShortLabel(m.machineType)} ${idx + 1}`
                  : machineShortLabel(m.machineType)
                return (
                  <div key={m.machineid} className={cn('rounded-md border px-2 sm:px-3 py-1.5 sm:py-2', vStyle.bg, vStyle.border)}>
                    <div className="flex items-center justify-between gap-1 mb-1">
                      <div className="text-[11px] text-muted-foreground truncate" title={shortMachineName(m.machineName)}>
                        <span className="hidden sm:inline">{shortMachineName(m.machineName)}</span>
                        <span className="sm:hidden">{shortLabel}</span>
                      </div>
                      {/* Veredicto de un vistazo: combina uptime + ritmo vs objetivo
                          (no solo si estuvo prendida — también si rindió al ritmo
                          esperado). Pedido Orel 2026-07-23. */}
                      <span
                        className={cn('flex items-center gap-1 text-[9px] font-semibold uppercase tracking-wide shrink-0', vStyle.text)}
                        title="Combina disponibilidad (uptime) y ritmo vs objetivo — manda el peor de los dos."
                      >
                        <span className={cn('w-1.5 h-1.5 rounded-full', vStyle.dot)} />
                        {vStyle.label}
                      </span>
                    </div>
                    <div className="text-base font-semibold tabular-nums">
                      {m.totalCycles.toLocaleString('es-CL')}
                      <span className="text-[10px] text-muted-foreground font-normal ml-1">
                        ({sharePct.toFixed(0)}%)
                      </span>
                    </div>
                    <div className="mt-1.5 space-y-1">
                      <div>
                        <div className="flex items-center justify-between text-[10px]">
                          <span className="text-muted-foreground">uptime</span>
                          <span className={cn('font-semibold tabular-nums', uptimeTextColor(uptimePct))}>
                            {uptimePct.toFixed(0)}%
                          </span>
                        </div>
                        <div className="h-1 bg-muted/60 rounded-full overflow-hidden">
                          <div className={cn('h-full rounded-full', uptimeBarColor(uptimePct))}
                               style={{ width: `${uptimePct.toFixed(1)}%` }} />
                        </div>
                      </div>
                      <div>
                        <div className="flex items-center justify-between text-[10px]">
                          <span className="text-muted-foreground" title="Ciclos reales vs objetivo Shoplogix para este turno">ritmo vs objetivo</span>
                          <span className={cn('font-semibold tabular-nums', ratioPct >= 85 ? 'text-emerald-400' : ratioPct >= 50 ? 'text-amber-400' : 'text-red-400')}>
                            {ratioPct.toFixed(0)}%
                          </span>
                        </div>
                        <div className="h-1 bg-muted/60 rounded-full overflow-hidden">
                          <div className={cn('h-full rounded-full', ratioPct >= 85 ? 'bg-emerald-500' : ratioPct >= 50 ? 'bg-amber-500' : 'bg-red-500')}
                               style={{ width: `${Math.min(100, ratioPct).toFixed(1)}%` }} />
                        </div>
                      </div>
                    </div>
                  </div>
                )
              })}
            </div>
          </div>
        )}
      </CardContent>
    </Card>
  )
}
