/**
 * Tarjeta de resumen del turno SIN Excel del Grader (solo Shoplogix).
 *
 * Misma estructura que `HeroScorecard`: se agrupa por PREGUNTA —izquierda
 * *cuánto salió*, derecha *dónde estuvo la limitación*— y la mitad derecha es
 * literalmente el mismo componente (`ShiftMachinesHalf`). Cargar el Excel
 * completa la mitad izquierda en vez de cambiar de pantalla; antes eran dos
 * diseños sin parentesco y Orel lo leyó como "todo desordenado" (11-ago-2026).
 *
 * Usado en AnalisisGraderTurnoPage cuando !summary && upstreamLine.snapshot.
 */
import { cn } from '@/lib/utils'
import { lineMachinesLabel } from '@/services/shoplogix/shoplogixMachines'
import { shortMachineName } from '@/services/grader/graderMachineNames'
import { Badge, Card, CardContent, InfoTooltip } from '@/components/ui'
import { Activity, Clock, Sun, Sunset, Moon, Sunrise } from 'lucide-react'
import type { UpstreamLineSnapshot } from '@/services/shoplogix/types'
import type { ShiftTimeWindow } from '@/services/grader/graderShiftStatus'
import { getShiftMeta } from '@/services/grader/graderShiftDisplay'
import { fmtTime } from '@/services/grader/graderTimeFormat'
import { ShiftMachinesHalf } from './ShiftMachinesHalf'

/** Colores del reparto de ciclos entre máquinas — categóricos, no semánticos:
 *  codifican QUÉ máquina, no si está bien o mal. */
const SEG = ['bg-cat-1-ink', 'bg-cat-3-ink', 'bg-cat-7-ink', 'bg-cat-2-ink']

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
  /**
   * Piezas que la línea hizo fuera del horario del turno (ver
   * `useShiftOutsidePieces`). Shoplogix las manda a otro bucket y sin esto el
   * número grande muestra menos producción de la que hubo.
   */
  outside?: { pieces: number; ranges: Array<{ from: Date; to: Date; pieces: number; kind: 'antes' | 'despues' }> }
}

export function ShoplogixOnlyScorecard({ snapshot, shiftWindow, shiftLabel, dateKey, plannedTargetPieces, outside }: Props) {
  const cyclesEnTurno = snapshot.machines.reduce((s, m) => s + (m.totalCycles ?? 0), 0)
  const outsidePieces = outside?.pieces ?? 0
  // El número grande es la JORNADA: lo que la línea produjo, sin importar dónde
  // lo archivó Shoplogix. El desglose va abajo para que cuadre con sus reportes.
  const totalCycles = cyclesEnTurno + outsidePieces

  const avgUptime =
    snapshot.machines.length > 0
      ? snapshot.machines.reduce((s, m) => s + (m.shiftRuntime ?? 0), 0) / snapshot.machines.length
      : 0

  const shiftDurationMin =
    snapshot.machines[0]
      ? Math.round(
          (snapshot.machines[0].shiftEnd.getTime() - snapshot.machines[0].shiftStart.getTime()) / 60_000,
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
    <Card className="overflow-hidden">
      {/* ── Header ─────────────────────────────────────────────────────── */}
      <div className="flex items-center justify-between px-4 py-2 bg-muted border-b border-border">
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
        </div>
        <div className="flex items-center gap-1 text-xs text-muted-foreground">
          <Clock className="w-3 h-3" />
          {durationLabel}
        </div>
      </div>

      {/* ── Body: las mismas dos preguntas que con Grader ───────────────── */}
      <CardContent className="p-4 grid grid-cols-1 md:grid-cols-2 gap-4 md:gap-6">
        {/* ── Mitad 1 · Cuánto salió ──────────────────────────────────── */}
        <div className="md:border-r md:border-border md:pr-6 min-w-0">
          <div className="text-caption tracking-wider text-muted-foreground">Cuánto salió</div>

          <div className="flex items-baseline gap-2 mt-0.5">
            <span className="text-4xl font-bold tabular-nums leading-none">
              {totalCycles.toLocaleString('es-CL')}
            </span>
            <span className="text-xs text-muted-foreground">
              ciclos · {lineMachinesLabel(snapshot.machines) || 'línea'}
            </span>
          </div>

          {/* Sin Excel no hay P0: se dice, en vez de dejar el hueco. */}
          <div className="mt-2">
            <span className="inline-flex items-center rounded-full border border-border bg-secondary px-2 py-0.5 text-xs text-muted-foreground">
              P0 — se calcula con el Excel del Grader
            </span>
          </div>

          {outsidePieces > 0 && (
            <div className="text-caption mt-2 flex items-center gap-x-1.5 gap-y-0.5 flex-wrap">
              <span className="tabular-nums text-muted-foreground">
                {cyclesEnTurno.toLocaleString('es-CL')} en el turno
              </span>
              <span className="text-muted-foreground/40">+</span>
              <span className="rounded-full border border-ink-warn/[0.45] bg-amber-500/[0.15] px-1.5 tabular-nums text-ink-warn">
                {outsidePieces.toLocaleString('es-CL')} fuera del horario
              </span>
              {(outside?.ranges ?? []).map(r => (
                <span key={r.from.toISOString()} className="tabular-nums text-muted-foreground/70">
                  ({r.kind === 'antes' ? 'antes: ' : ''}{fmtTime(r.from.getTime())}–{fmtTime(r.to.getTime())})
                </span>
              ))}
            </div>
          )}

          {/* Reparto de ciclos entre máquinas: el mismo lugar que ocupa la
              composición Baader/manual cuando hay Grader. */}
          {snapshot.machines.length > 1 && totalCycles > 0 && (
            <div className="mt-3 space-y-1.5">
              <div className="flex h-2 rounded-ctl overflow-hidden bg-secondary">
                {snapshot.machines.map((m, i) => (
                  <div
                    key={m.machineid}
                    className={cn('h-full', SEG[i % SEG.length])}
                    style={{ width: `${(m.totalCycles / totalCycles) * 100}%` }}
                  />
                ))}
              </div>
              <div className="space-y-0.5 text-caption">
                {snapshot.machines.map((m, i) => (
                  <div key={m.machineid} className="flex items-center gap-1.5">
                    <span className={cn('w-2 h-2 rounded-[2px] shrink-0', SEG[i % SEG.length])} />
                    {/* El nombre de LA máquina, no el modelo de la línea:
                        `lineMachinesLabel` devolvía "Baader 142" para las tres. */}
                    <span className="text-muted-foreground truncate">{shortMachineName(m.machineName) || `Máquina ${i + 1}`}</span>
                    <b className="tabular-nums ml-auto">{m.totalCycles.toLocaleString('es-CL')}</b>
                    <span className="text-muted-foreground tabular-nums w-12 text-right">
                      {((m.totalCycles / totalCycles) * 100).toFixed(1)}%
                    </span>
                  </div>
                ))}
              </div>
            </div>
          )}

          <div className="mt-3 flex items-center gap-4 text-xs text-muted-foreground flex-wrap">
            {snapshot.lineThroughputActual > 0 && (
              <span className="flex items-center gap-1">
                <b className="tabular-nums text-foreground">{snapshot.lineThroughputActual.toFixed(0)}</b> ciclos/h
                <InfoTooltip
                  text={`Ritmo de producción sobre ${
                    snapshot.lineWindowSource === 'effective'
                      ? `la ventana REAL de operación (de la primera a la última pieza, ${snapshot.lineWindowHours.toFixed(1)} h)`
                      : `la ventana del turno (${snapshot.lineWindowHours.toFixed(1)} h)`
                  }.`}
                  iconSize={10} position="top"
                />
              </span>
            )}
            {/* Cumplimiento vs lo PLANIFICADO por producción. Se rotula como
                "planificadas" para no confundirlo con el target de cadencia que
                reporta el sensor: son dos números distintos. */}
            {plannedTargetPieces != null && plannedTargetPieces > 0 && (() => {
              const pct = (totalCycles / plannedTargetPieces) * 100
              const cls = pct >= 95 ? 'text-ink-ok' : pct >= 75 ? 'text-ink-warn' : 'text-ink-crit'
              return (
                <span className="flex items-center gap-1">
                  <b className={cn('tabular-nums', cls)}>{pct.toFixed(0)}%</b>
                  de {plannedTargetPieces.toLocaleString('es-CL')} planificadas
                  <InfoTooltip
                    text={`Cumplimiento contra las piezas que producción pide por turno en esta línea (${plannedTargetPieces.toLocaleString('es-CL')}).

No es el target de cadencia del sensor: ese mide velocidad instantánea, este mide el compromiso del turno.`}
                    iconSize={10} position="top"
                  />
                </span>
              )
            })()}
            {shiftWindow?.status === 'live' && shiftWindow.progressPct != null && (
              <span className="ml-auto tabular-nums">{shiftWindow.progressPct.toFixed(0)}% del turno</span>
            )}
          </div>
        </div>

        {/* ── Mitad 2 · idéntica a la del turno con Grader ────────────────── */}
        <ShiftMachinesHalf machines={snapshot.machines} avgUptime={avgUptime} />
      </CardContent>
    </Card>
  )
}
