/**
 * Card "Proyección de Turno en Curso" de la tab Tendencia.
 * 4 KPI tiles: tiempo restante, P0 al cierre, piezas al cierre, tendencia peso.
 * Extraído de GraderTendenciaTab en el refactor iter 19 (P1.8).
 */
import { Card, CardContent, CardHeader, CardTitle, Badge } from '@/components/ui'
import { Target, TrendingUp, TrendingDown, Minus } from 'lucide-react'
import { cn } from '@/lib/utils'
import type { useGraderDashboardAnalytics } from '@/hooks/useGraderDashboardAnalytics'

type DashboardViews = ReturnType<typeof useGraderDashboardAnalytics>

interface Props {
  trendForecastView: DashboardViews['trendForecastView']
  shiftProgressView: DashboardViews['shiftProgressView']
  pointZeroWarnThreshold: number
  pointZeroCriticalThreshold: number
  getPointZeroSeverity: (pct: number) => 'critical' | 'warn' | 'ok'
}

export function TendenciaShiftForecastCard({
  trendForecastView,
  shiftProgressView,
  pointZeroWarnThreshold,
  pointZeroCriticalThreshold,
  getPointZeroSeverity,
}: Props) {
  if (!trendForecastView || !shiftProgressView) return null

  const severity = getPointZeroSeverity(trendForecastView.projectedPointZeroPct)
  const severityBorder =
    severity === 'critical' ? 'border-red-500/[0.25] bg-red-500/[0.15]' :
    severity === 'warn' ? 'border-amber-500/[0.25] bg-amber-500/[0.15]' :
    'border-emerald-500/[0.25] bg-emerald-500/[0.15]'
  const severityText =
    severity === 'critical' ? 'text-ink-crit' :
    severity === 'warn' ? 'text-ink-warn' :
    'text-ink-ok'
  const severityLabel =
    severity === 'critical' ? 'CRÍTICO' :
    severity === 'warn' ? 'ALERTA' :
    'OK'
  const TrendIcon =
    shiftProgressView.weightTrend === 'up' ? TrendingUp :
    shiftProgressView.weightTrend === 'down' ? TrendingDown :
    Minus
  const trendColor =
    shiftProgressView.weightTrend === 'up' ? 'text-primary' :
    shiftProgressView.weightTrend === 'down' ? 'text-cat-4-ink' :
    'text-muted-foreground'
  const trendLabel =
    shiftProgressView.weightTrend === 'up' ? 'Subiendo' :
    shiftProgressView.weightTrend === 'down' ? 'Bajando' :
    'Estable'

  return (
    <Card className={cn('border-2', severityBorder)}>
      <CardHeader className="pb-3">
        <CardTitle className="text-sm flex items-center gap-2">
          <Target className="h-4 w-4 text-purple-500" />
          Proyección de Turno en Curso
        </CardTitle>
        <p className="text-xs text-muted-foreground">
          {trendForecastView.shiftStartLabel} → {trendForecastView.shiftEndLabel} · Cobertura {trendForecastView.completionPct.toFixed(1)}%
        </p>
      </CardHeader>
      <CardContent>
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
          {/* Tiempo restante */}
          <div className="flex flex-col gap-1 p-3 rounded-card bg-background border">
            <p className="text-caption text-muted-foreground tracking-wide">Tiempo restante</p>
            <p className="text-2xl font-bold tabular-nums">{shiftProgressView.remainingLabel}</p>
            <div className="h-1.5 w-full bg-muted rounded-full overflow-hidden mt-1">
              <div
                className="h-full bg-purple-500 transition-all"
                style={{ width: `${Math.min(100, shiftProgressView.elapsedPct)}%` }}
              />
            </div>
            <p className="text-caption text-muted-foreground">{shiftProgressView.elapsedPct.toFixed(0)}% del turno</p>
          </div>

          {/* P0 proyectado al cierre */}
          <div className={cn('flex flex-col gap-1 p-3 rounded-card bg-background border-2', severityBorder)}>
            <div className="flex items-center justify-between">
              <p className="text-caption text-muted-foreground tracking-wide">P0 al cierre</p>
              <Badge variant="outline" className={cn('text-caption px-1.5 py-0', severityText, 'border-current')}>
                {severityLabel}
              </Badge>
            </div>
            <p className={cn('text-2xl font-bold tabular-nums', severityText)}>
              {trendForecastView.projectedPointZeroPct.toFixed(2)}%
            </p>
            <p className="text-caption text-muted-foreground">
              {trendForecastView.projectedPointZeroPieces.toLocaleString('es-CL')} piezas proyectadas
            </p>
            <p className="text-caption text-muted-foreground">
              umbral warn {pointZeroWarnThreshold}% / crítico {pointZeroCriticalThreshold}%
            </p>
          </div>

          {/* Piezas proyectadas al cierre */}
          <div className="flex flex-col gap-1 p-3 rounded-card bg-background border">
            <p className="text-caption text-muted-foreground tracking-wide">Piezas al cierre</p>
            <p className="text-2xl font-bold tabular-nums">
              {trendForecastView.projectedTotalPieces.toLocaleString('es-CL')}
            </p>
            <p className="text-caption text-muted-foreground">
              observadas: {trendForecastView.observedPieces.toLocaleString('es-CL')}
            </p>
            <p className="text-caption text-muted-foreground">
              proyectadas: {(trendForecastView.projectedTotalPieces - trendForecastView.observedPieces).toLocaleString('es-CL')}
            </p>
          </div>

          {/* Tendencia del peso */}
          <div className="flex flex-col gap-1 p-3 rounded-card bg-background border">
            <p className="text-caption text-muted-foreground tracking-wide">Tendencia peso</p>
            <div className="flex items-center gap-2">
              <TrendIcon className={cn('h-6 w-6', trendColor)} />
              <p className={cn('text-2xl font-bold', trendColor)}>{trendLabel}</p>
            </div>
            <p className="text-caption text-muted-foreground">
              Δ {shiftProgressView.weightDeltaGrams >= 0 ? '+' : ''}{shiftProgressView.weightDeltaGrams.toFixed(1)} g
              {' '}({shiftProgressView.weightDeltaPct >= 0 ? '+' : ''}{shiftProgressView.weightDeltaPct.toFixed(2)}%)
            </p>
            <p className="text-caption text-muted-foreground">inicio vs último observado</p>
          </div>
        </div>
      </CardContent>
    </Card>
  )
}
