/**
 * Scorecard para modo Shoplogix-only (sin Excel Grader).
 * Replica el patrón visual de HeroScorecard: card con borde coloreado,
 * hero metric grande, KPIs secundarios y breakdown por máquina.
 *
 * Usado en AnalisisGraderTurnoPage cuando !summary && upstreamLine.snapshot.
 */
import { cn } from '@/lib/utils'
import { Badge, Card, CardContent } from '@/components/ui'
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

interface MetricTileProps {
  label: string
  value: string
  sub?: string
}

function MetricTile({ label, value, sub }: MetricTileProps) {
  return (
    <div className="text-center">
      <div className="text-lg font-semibold tabular-nums">{value}</div>
      <div className="text-xs text-muted-foreground">{label}</div>
      {sub && <div className="text-xs text-muted-foreground/70">{sub}</div>}
    </div>
  )
}

interface Props {
  snapshot: UpstreamLineSnapshot
  shiftWindow: ShiftTimeWindow | null
  shiftLabel: string
  dateKey: string
}

export function ShoplogixOnlyScorecard({ snapshot, shiftWindow, shiftLabel, dateKey }: Props) {
  const totalCycles = snapshot.machines.reduce((s, m) => s + (m.totalCycles ?? 0), 0)

  const avgUptime =
    snapshot.machines.length > 0
      ? snapshot.machines.reduce((s, m) => s + (m.shiftRuntime ?? 0), 0) /
        snapshot.machines.length
      : 0

  const verdict: keyof typeof VERDICT_STYLE =
    avgUptime >= 0.7 ? 'ok' : avgUptime >= 0.4 ? 'warn' : 'critical'
  const style = VERDICT_STYLE[verdict]

  // Duración real del turno desde datos de máquina (evita el elapsedMin huge en turnos cerrados)
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

  return (
    <Card className={cn('border-2 overflow-hidden', style.border)}>
      {/* ── Header ─────────────────────────────────────────────────────── */}
      <div className="flex items-center justify-between px-4 py-2 bg-muted/30 border-b">
        <div className="flex items-center gap-2 flex-wrap">
          <span className="font-medium text-sm">{shiftLabel}</span>
          <span className="text-muted-foreground text-sm">· {dateKey}</span>
          {shiftWindow?.status === 'live' && (
            <Badge className="bg-red-500 text-white animate-pulse text-xs px-2 py-0">
              <Activity className="w-3 h-3 mr-1" />
              EN VIVO
            </Badge>
          )}
          {shiftWindow?.status === 'closed' && (
            <Badge variant="outline" className="text-xs px-2 py-0">
              CERRADO
            </Badge>
          )}
          <Badge
            variant="outline"
            className="text-xs px-2 py-0 text-sky-400 border-sky-500/40"
          >
            Solo Shoplogix
          </Badge>
        </div>
        <div className="flex items-center gap-1 text-xs text-muted-foreground">
          <Clock className="w-3 h-3" />
          {durationLabel}
        </div>
      </div>

      {/* ── Body ───────────────────────────────────────────────────────── */}
      <CardContent className={cn('p-4 flex items-center gap-6', style.bg)}>
        {/* Hero metric: total ciclos */}
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
        <div className="flex-1 border-l pl-6 space-y-2">
          <div className="grid grid-cols-3 gap-3">
            <MetricTile
              label="Uptime prom."
              value={`${(avgUptime * 100).toFixed(0)}%`}
            />
            <MetricTile
              label="ciclos/hr"
              value={
                snapshot.lineThroughputActual > 0
                  ? snapshot.lineThroughputActual.toFixed(0)
                  : '—'
              }
            />
            <MetricTile
              label="máq. activas"
              value={`${snapshot.machinesProducing}/${snapshot.machines.length}`}
            />
          </div>

          {/* Per-machine breakdown — mismo patrón que HeroScorecard */}
          {snapshot.machines.length > 0 && (
            <div className="pt-2 border-t border-border/40 space-y-1.5">
              <div className="flex items-baseline gap-2 text-xs flex-wrap">
                <span className="font-semibold text-muted-foreground uppercase tracking-wider">
                  Evisceradoras Baader 142
                </span>
                <span className="tabular-nums font-semibold text-foreground">
                  {totalCycles.toLocaleString('es-CL')}
                </span>
                <span className="text-muted-foreground">ciclos totales</span>
              </div>
              <div className="grid grid-cols-3 gap-2">
                {snapshot.machines.map((m) => {
                  const sharePct =
                    totalCycles > 0
                      ? ((m.totalCycles / totalCycles) * 100).toFixed(0)
                      : '0'
                  const uptimePct = (m.shiftRuntime * 100).toFixed(0)
                  return (
                    <div key={m.machineid} className="text-center">
                      <div className="text-base font-semibold tabular-nums">
                        {m.totalCycles.toLocaleString('es-CL')}
                      </div>
                      <div
                        className="text-xs text-muted-foreground truncate"
                        title={m.machineName}
                      >
                        {m.machineName}
                      </div>
                      <div className="text-[10px] text-muted-foreground/70 tabular-nums">
                        {sharePct}% línea · {uptimePct}% uptime
                      </div>
                    </div>
                  )
                })}
              </div>
            </div>
          )}
        </div>

        {/* Barra de progreso si está en vivo */}
        {shiftWindow?.status === 'live' && shiftWindow.progressPct != null && (
          <div className="shrink-0 w-16 flex flex-col items-center gap-1">
            <div className="text-xs text-muted-foreground">Progreso</div>
            <div className="text-sm font-semibold">
              {shiftWindow.progressPct.toFixed(0)}%
            </div>
            <div className="w-full h-2 bg-muted rounded-full overflow-hidden">
              <div
                className="h-full bg-primary rounded-full transition-all"
                style={{ width: `${shiftWindow.progressPct}%` }}
              />
            </div>
          </div>
        )}
      </CardContent>
    </Card>
  )
}
