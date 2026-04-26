import { cn } from '@/lib/utils'
import { Badge, Card, CardContent } from '@/components/ui'
import { Activity, Clock } from 'lucide-react'
import { verdictFromP0Pct } from '@/services/grader/graderThresholds'
import type { ShiftTimeWindow } from '@/services/grader/graderShiftStatus'
import type { GraderDailySummary } from '@/services/grader/types'
import type { UpstreamLineSnapshot } from '@/services/shoplogix/types'
import { deriveBaaderRejection, type MarelHgCapture } from '@/services/grader/graderMarelHg.service'

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
  upstreamSnapshot?: UpstreamLineSnapshot | null
  /**
   * Captura manual Marel HG. Si está, se calcula rechazo Baader puro.
   * Si no, se cae a estimación bruta (rechazos + no-controladas Marel mezclados).
   */
  marelHgCapture?: MarelHgCapture | null
}

export function HeroScorecard({ summary, shiftWindow, upstreamSnapshot, marelHgCapture }: HeroScorecardProps) {
  const verdict = verdictFromP0Pct(summary.pointZeroPct)
  const style = VERDICT_STYLE[verdict]
  const throughputPerMin = summary.productionRatePerHour
    ? (summary.productionRatePerHour / 60).toFixed(0)
    : '—'

  const baaderTotal = upstreamSnapshot?.machines.reduce((s, m) => s + (m.totalCycles ?? 0), 0) ?? 0

  // Si hay captura Marel HG → rechazo Baader puro (Grader − Baader − Marel_no_controladas).
  // Si no hay captura → estimación bruta (Grader − Baader, mezcla rechazos + no-controladas).
  const baaderRejectionPure = deriveBaaderRejection({
    graderTotalPieces: summary.totalPieces,
    baaderTotalCycles: baaderTotal,
    marelHgCapture: marelHgCapture ?? null,
  })
  const upstreamDelta = baaderTotal > 0 ? summary.totalPieces - baaderTotal : null
  const rejectedRaw = upstreamDelta != null && upstreamDelta > 0 ? upstreamDelta : null
  const rejectedRawPct = rejectedRaw != null && baaderTotal > 0
    ? ((rejectedRaw / baaderTotal) * 100).toFixed(1)
    : null

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
        <div className="flex-1 border-l pl-6 space-y-2">
          <div className="grid grid-cols-3 gap-3">
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
          {baaderTotal > 0 && upstreamSnapshot && (
            <div className="pt-2 border-t border-border/40 space-y-1.5">
              <div className="flex items-baseline justify-between flex-wrap gap-2 text-xs">
                <div className="flex items-baseline gap-2">
                  <span className="font-semibold text-muted-foreground uppercase tracking-wider">
                    Upstream Baader
                  </span>
                  <span className="tabular-nums font-semibold text-foreground">
                    {baaderTotal.toLocaleString('es-CL')}
                  </span>
                  <span className="text-muted-foreground">ciclos</span>
                </div>
                {baaderRejectionPure != null ? (
                  <span
                    className="text-amber-400 cursor-help"
                    title={`Rechazo Baader puro = Grader_total − ΣBaader_procesadas − Marel_no_controladas (${marelHgCapture!.uncontrolled.toLocaleString('es-CL')}). Asume que rechazos Baader + no-controladas Marel vuelven al Grader vía línea manual. Para per-Baader real falta captura del bandejón.`}
                  >
                    rechazo Baader{' '}
                    <span className="tabular-nums font-semibold">
                      {baaderRejectionPure.rejected.toLocaleString('es-CL')}
                    </span>
                    <span className="text-muted-foreground"> ({baaderRejectionPure.rejectedPctOfBaader.toFixed(1)}%)</span>
                  </span>
                ) : rejectedRaw != null ? (
                  <span
                    className="text-amber-400 cursor-help"
                    title="Estimación bruta: Grader_total − ΣBaader_procesadas. Incluye rechazos Baader + no-controladas Marel HG (1-7% típico). Capturá los datos Marel HG abajo para extraer rechazo Baader puro."
                  >
                    rechazo est. (bruto){' '}
                    <span className="tabular-nums font-semibold">
                      {rejectedRaw.toLocaleString('es-CL')}
                    </span>
                    <span className="text-muted-foreground"> ({rejectedRawPct ?? '—'}%)</span>
                  </span>
                ) : null}
              </div>
              <div className="grid grid-cols-3 gap-2">
                {upstreamSnapshot.machines.map((m) => {
                  const sharePct = (m.totalCycles / baaderTotal) * 100
                  const uptimePct = (m.shiftRuntime * 100).toFixed(0)
                  return (
                    <div key={m.machineid} className="text-center">
                      <div className="text-base font-semibold tabular-nums">
                        {m.totalCycles.toLocaleString('es-CL')}
                      </div>
                      <div className="text-xs text-muted-foreground truncate" title={m.machineName}>
                        {m.machineName}
                      </div>
                      <div className="text-[10px] text-muted-foreground/70 tabular-nums">
                        {sharePct.toFixed(0)}% línea · {uptimePct}% uptime
                      </div>
                    </div>
                  )
                })}
              </div>
            </div>
          )}
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
