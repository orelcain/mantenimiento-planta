import { cn } from '@/lib/utils'
import { Badge, Card, CardContent } from '@/components/ui'
import { Activity, Clock } from 'lucide-react'
import { verdictFromP0Pct } from '@/services/grader/graderThresholds'
import type { ShiftTimeWindow } from '@/services/grader/graderShiftStatus'
import type { GraderDailySummary } from '@/services/grader/types'

const VERDICT_STYLE = {
  ok: {
    border: 'border-emerald-500',
    bg: 'bg-emerald-500/5',
    numColor: 'text-emerald-400',
    label: 'Turno en rango',
  },
  warn: {
    border: 'border-amber-500',
    bg: 'bg-amber-500/5',
    numColor: 'text-amber-400',
    label: 'Turno con oportunidades',
  },
  critical: {
    border: 'border-red-500',
    bg: 'bg-red-500/5',
    numColor: 'text-red-400',
    label: 'Turno fuera de rango',
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

interface HeroScorecardProps {
  summary: GraderDailySummary
  shiftWindow: ShiftTimeWindow
}

export function HeroScorecard({ summary, shiftWindow }: HeroScorecardProps) {
  const verdict = verdictFromP0Pct(summary.pointZeroPct)
  const style = VERDICT_STYLE[verdict]
  const throughputPerMin = summary.productionRatePerHour
    ? (summary.productionRatePerHour / 60).toFixed(0)
    : '—'

  const durationLabel = shiftWindow.status === 'live' && shiftWindow.remainingMin != null
    ? `${Math.round(shiftWindow.elapsedMin)} min · faltan ${Math.round(shiftWindow.remainingMin)} min`
    : summary.durationMinutes
      ? `${summary.durationMinutes} min`
      : '—'

  return (
    <Card className={cn('border-2 overflow-hidden', style.border)}>
      {/* Header */}
      <div className="flex items-center justify-between px-4 py-2 bg-muted/30 border-b">
        <div className="flex items-center gap-2 flex-wrap">
          <span className="font-medium text-sm">{summary.shiftId}</span>
          <span className="text-muted-foreground text-sm">· {summary.dateKey}</span>
          {shiftWindow.status === 'live' && (
            <Badge className="bg-red-500 text-white animate-pulse text-xs px-2 py-0">
              <Activity className="w-3 h-3 mr-1" />
              EN VIVO
            </Badge>
          )}
          {shiftWindow.status === 'closed' && (
            <Badge variant="outline" className="text-xs px-2 py-0">CERRADO</Badge>
          )}
        </div>
        <div className="flex items-center gap-1 text-xs text-muted-foreground">
          <Clock className="w-3 h-3" />
          {durationLabel}
        </div>
      </div>

      {/* Hero metric */}
      <CardContent className={cn('p-4 flex items-center gap-6', style.bg)}>
        {/* P0% grande */}
        <div className="shrink-0">
          <div className={cn('text-5xl font-bold tabular-nums', style.numColor)}>
            {summary.pointZeroPct.toFixed(1)}%
          </div>
          <div className="text-xs uppercase tracking-wider text-muted-foreground mt-1">
            P0 · Punto Cero
          </div>
          <div className="text-xs mt-1 font-medium">{style.label}</div>
        </div>

        {/* KPIs secundarios */}
        <div className="flex-1 grid grid-cols-3 gap-3 border-l pl-6">
          <MetricTile
            label="Piezas"
            value={summary.totalPieces.toLocaleString('es-CL')}
          />
          <MetricTile
            label="pz/min"
            value={throughputPerMin}
          />
          <MetricTile
            label="Peso kg"
            value={summary.totalWeightKg != null ? summary.totalWeightKg.toFixed(0) : '—'}
          />
        </div>

        {/* Barra de progreso si live */}
        {shiftWindow.status === 'live' && shiftWindow.progressPct != null && (
          <div className="shrink-0 w-16 flex flex-col items-center gap-1">
            <div className="text-xs text-muted-foreground">Progreso</div>
            <div className="text-sm font-semibold">{shiftWindow.progressPct.toFixed(0)}%</div>
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
