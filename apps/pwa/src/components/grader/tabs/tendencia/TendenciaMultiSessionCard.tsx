/**
 * Card "Patrones Multisesión" de la tab Tendencia.
 * Muestra P0/peso/piezas vs promedio histórico + errores recurrentes.
 * Extraído de GraderTendenciaTab en el refactor iter 19 (P1.8).
 */
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui'
import { Brain, AlertTriangle } from 'lucide-react'
import { cn } from '@/lib/utils'
import type { useGraderDashboardAnalytics } from '@/hooks/useGraderDashboardAnalytics'

type DashboardViews = ReturnType<typeof useGraderDashboardAnalytics>

interface Props {
  multiSessionInsightsView: DashboardViews['multiSessionInsightsView']
}

export function TendenciaMultiSessionCard({ multiSessionInsightsView }: Props) {
  if (!multiSessionInsightsView) return null

  const m = multiSessionInsightsView
  const p0Better = m.deltaP0 < 0
  const p0Worse = m.deltaP0 > 0
  const p0Color = p0Better ? 'text-emerald-600' : p0Worse ? 'text-red-600' : 'text-muted-foreground'
  const p0BgClass = p0Better ? 'bg-emerald-500/[0.08] border-emerald-500/[0.25]' : p0Worse ? 'bg-red-500/[0.08] border-red-500/[0.25]' : 'bg-muted/20'
  const percentileLabel = m.percentileP0 >= 75 ? 'peor 25%' : m.percentileP0 >= 50 ? 'peor 50%' : m.percentileP0 >= 25 ? 'mejor 50%' : 'mejor 25%'

  return (
    <Card className="border-cat-6-tint/[0.25] bg-cat-6-tint/[0.08]">
      <CardHeader className="pb-3">
        <CardTitle className="text-sm flex items-center gap-2">
          <Brain className="h-4 w-4 text-violet-500" />
          Patrones Multisesión
        </CardTitle>
        <p className="text-xs text-muted-foreground">
          Contexto histórico basado en las últimas {m.sampleSize} sesiones guardadas.
        </p>
      </CardHeader>
      <CardContent className="space-y-3">
        {/* Resumen vs promedio histórico */}
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-2">
          <div className={cn('p-2.5 rounded-ctl border', p0BgClass)}>
            <p className="text-[10px] uppercase tracking-wide text-muted-foreground">P0 vs promedio</p>
            <p className={cn('text-lg font-bold tabular-nums', p0Color)}>
              {m.deltaP0 >= 0 ? '+' : ''}{m.deltaP0.toFixed(2)} pp
            </p>
            <p className="text-[10px] text-muted-foreground">
              hist. {m.avgP0.toFixed(2)}% · posición {percentileLabel}
            </p>
          </div>
          <div className="p-2.5 rounded-ctl border bg-muted/20">
            <p className="text-[10px] uppercase tracking-wide text-muted-foreground">Piezas vs promedio</p>
            <p className="text-lg font-bold tabular-nums">
              {m.deltaPieces >= 0 ? '+' : ''}{m.deltaPieces.toLocaleString('es-CL')}
            </p>
            <p className="text-[10px] text-muted-foreground">hist. {m.avgPieces.toLocaleString('es-CL')}</p>
          </div>
          <div className="p-2.5 rounded-ctl border bg-muted/20">
            <p className="text-[10px] uppercase tracking-wide text-muted-foreground">Peso vs promedio</p>
            <p className="text-lg font-bold tabular-nums">
              {m.deltaWeight >= 0 ? '+' : ''}{m.deltaWeight.toFixed(0)} g
            </p>
            <p className="text-[10px] text-muted-foreground">hist. {m.avgWeight.toFixed(0)} g</p>
          </div>
        </div>

        {/* Errores recurrentes */}
        {m.recurrentErrors.length > 0 && (
          <div>
            <p className="text-xs font-medium mb-1.5">Errores P0 recurrentes en el histórico</p>
            <div className="space-y-1">
              {m.recurrentErrors.map((re) => {
                const isInCurrent = m.recurrentInCurrent.some((r) => r.error === re.error)
                return (
                  <div
                    key={re.error}
                    className={cn(
                      'flex items-center justify-between gap-2 p-1.5 rounded-ctl border text-xs',
                      isInCurrent
                        ? 'border-amber-500/[0.25] bg-amber-500/[0.08]'
                        : 'border-border bg-muted/10',
                    )}
                  >
                    <div className="flex items-center gap-2 min-w-0">
                      {isInCurrent && <AlertTriangle className="h-3 w-3 text-amber-500 shrink-0" />}
                      <span className="truncate">{re.error}</span>
                    </div>
                    <span className="text-[10px] text-muted-foreground tabular-nums shrink-0">
                      {re.frequency.toFixed(0)}% sesiones · {re.totalPieces.toLocaleString('es-CL')} pz
                    </span>
                  </div>
                )
              })}
            </div>
            {m.recurrentInCurrent.length > 0 && (
              <p className="text-[10px] text-amber-600 mt-1.5">
                ⚠ {m.recurrentInCurrent.length} error{m.recurrentInCurrent.length > 1 ? 'es' : ''} recurrente{m.recurrentInCurrent.length > 1 ? 's' : ''} presente{m.recurrentInCurrent.length > 1 ? 's' : ''} en esta sesión — problema crónico.
              </p>
            )}
          </div>
        )}
      </CardContent>
    </Card>
  )
}
