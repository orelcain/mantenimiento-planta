/**
 * Scorecard para modo Shoplogix-only (sin Excel Grader).
 * Replica el patrón visual de HeroScorecard: card con borde coloreado,
 * hero metric grande, KPIs secundarios y breakdown por máquina.
 *
 * Usado en AnalisisGraderTurnoPage cuando !summary && upstreamLine.snapshot.
 */
import { cn } from '@/lib/utils'
import { Badge, Card, CardContent, InfoTooltip } from '@/components/ui'
import { Activity, Clock } from 'lucide-react'
import type { UpstreamLineSnapshot } from '@/services/shoplogix/types'
import type { ShiftTimeWindow } from '@/services/grader/graderShiftStatus'

const VERDICT_STYLE = {
  ok: {
    border: 'border-emerald-500',
    bg: 'bg-emerald-500/5',
    numColor: 'text-emerald-400',
    label: 'Línea en buen rendimiento',
  },
  warn: {
    border: 'border-amber-500',
    bg: 'bg-amber-500/5',
    numColor: 'text-amber-400',
    label: 'Línea con oportunidades de mejora',
  },
  critical: {
    border: 'border-red-500',
    bg: 'bg-red-500/5',
    numColor: 'text-red-400',
    label: 'Línea con bajo rendimiento',
  },
}


interface Props {
  snapshot: UpstreamLineSnapshot
  shiftWindow: ShiftTimeWindow | null
  shiftLabel: string
  dateKey: string
}

export function ShoplogixOnlyScorecard({ snapshot, shiftWindow, shiftLabel, dateKey }: Props) {
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

  const durationLabel =
    shiftWindow?.status === 'live' && shiftWindow.remainingMin != null
      ? `${Math.round(shiftWindow.elapsedMin)} min · faltan ${Math.round(shiftWindow.remainingMin)} min`
      : shiftDurationMin != null
        ? `${shiftDurationMin} min`
        : '—'

  const uptimeBarColor = (pct: number) =>
    pct >= 70 ? 'bg-emerald-500' : pct >= 40 ? 'bg-amber-500' : 'bg-red-500'
  const uptimeTextColor = (pct: number) =>
    pct >= 70 ? 'text-emerald-400' : pct >= 40 ? 'text-amber-400' : 'text-red-400'

  return (
    <Card className={cn('border-2 overflow-hidden', style.border)}>
      {/* ── Header ─────────────────────────────────────────────────────── */}
      <div className="flex items-center justify-between px-4 py-2 bg-muted/30 border-b">
        <div className="flex items-center gap-2 flex-wrap">
          <span className="font-medium text-sm">{shiftLabel}</span>
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
      <CardContent className={cn('p-4 space-y-4', style.bg)}>

        {/* Fila 1: hero ciclos + KPIs principales */}
        <div className="flex items-center gap-6">
          {/* Hero */}
          <div className="shrink-0">
            <div className={cn('text-5xl font-bold tabular-nums', style.numColor)}>
              {totalCycles.toLocaleString('es-CL')}
            </div>
            <div className="text-xs uppercase tracking-wider text-muted-foreground mt-1">
              ciclos · línea total
            </div>
            <div className="text-xs mt-1 font-medium">{style.label}</div>
          </div>

          {/* KPIs secundarios */}
          <div className="flex-1 border-l pl-6 grid grid-cols-3 gap-3">
            {/* Uptime promedio */}
            <div className="text-center">
              <div className="flex items-center justify-center gap-1 mb-0.5">
                <div className="text-xs text-muted-foreground">Uptime prom.</div>
                <InfoTooltip
                  text={`% promedio del turno en que las máquinas estuvieron activas.\n\n≥ 70% normal · 40–70% bajo · < 40% crítico\n\nPromedio de las ${snapshot.machines.length} evisceradoras.`}
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
                  text="Ritmo de producción: piezas procesadas por hora durante el tiempo activo del turno."
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
                  {isClosed ? 'máq. con datos' : 'máq. activas'}
                </div>
                <InfoTooltip
                  text={isClosed
                    ? 'Cantidad de evisceradoras que registraron actividad durante este turno cerrado.'
                    : 'Evisceradoras produciendo en este momento.'}
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
                Evisceradoras Baader 142
              </span>
              <span className="tabular-nums font-semibold">{totalCycles.toLocaleString('es-CL')}</span>
              <span className="text-muted-foreground">ciclos totales</span>
            </div>
            <div className="grid grid-cols-3 gap-3">
              {snapshot.machines.map((m) => {
                const sharePct = totalCycles > 0 ? (m.totalCycles / totalCycles) * 100 : 0
                const uptimePct = (m.shiftRuntime ?? 0) * 100
                return (
                  <div key={m.machineid} className="rounded-md bg-muted/20 border border-border/30 px-3 py-2">
                    <div className="text-[11px] text-muted-foreground truncate mb-1" title={m.machineName}>
                      {m.machineName}
                    </div>
                    <div className="text-base font-semibold tabular-nums">
                      {m.totalCycles.toLocaleString('es-CL')}
                      <span className="text-[10px] text-muted-foreground font-normal ml-1">
                        ({sharePct.toFixed(0)}%)
                      </span>
                    </div>
                    <div className="mt-1.5 space-y-0.5">
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
