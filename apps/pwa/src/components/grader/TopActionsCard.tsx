import { Zap, TrendingDown, TrendingUp, Minus } from 'lucide-react'
import { cn } from '@/lib/utils'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui'
import type { AggregatedAttribution } from '@/services/grader/graderAttribution'

interface Props {
  attribution: AggregatedAttribution
}

export function TopActionsCard({ attribution }: Props) {
  const { topImpactfulActions, totalShiftsWithActions, avgImprovementPerAction } = attribution

  return (
    <Card>
      <CardHeader className="pb-2">
        <CardTitle className="text-sm font-medium flex items-center gap-2">
          <Zap className="h-4 w-4 text-muted-foreground" />
          Acciones más efectivas
          <span className="ml-auto text-xs text-muted-foreground font-normal">
            {totalShiftsWithActions} turno{totalShiftsWithActions !== 1 ? 's' : ''} con acciones
          </span>
        </CardTitle>
      </CardHeader>
      <CardContent>
        {topImpactfulActions.length === 0 ? (
          <p className="text-sm text-muted-foreground text-center py-6">
            Sin acciones con resultado evaluado en este período.
          </p>
        ) : (
          <div className="space-y-3">
            {/* Cabecera tabla */}
            <div className="grid grid-cols-[1fr_6rem_4rem_5rem] text-[10px] text-muted-foreground uppercase tracking-wide font-medium gap-2 pb-1 border-b">
              <span>Campo ajustado</span>
              <span className="text-right">Impacto total</span>
              <span className="text-right">Veces</span>
              <span className="text-right">Δ promedio</span>
            </div>

            {topImpactfulActions.map((action, i) => {
              const improved = action.totalDelta < 0
              const worsened = action.totalDelta > 0
              const Icon = improved ? TrendingDown : worsened ? TrendingUp : Minus
              const iconColor = improved
                ? 'text-emerald-500'
                : worsened
                  ? 'text-red-500'
                  : 'text-zinc-400'
              const valueColor = improved
                ? 'text-emerald-600 dark:text-emerald-400'
                : worsened
                  ? 'text-red-600 dark:text-red-400'
                  : 'text-muted-foreground'

              return (
                <div
                  key={action.field}
                  className="grid grid-cols-[1fr_6rem_4rem_5rem] items-center gap-2 text-xs"
                >
                  <div className="flex items-center gap-1.5 min-w-0">
                    <span className="text-muted-foreground shrink-0 tabular-nums w-4 text-[11px]">
                      {i + 1}.
                    </span>
                    <Icon className={cn('h-3.5 w-3.5 shrink-0', iconColor)} />
                    <span className="truncate font-mono text-[11px]">{action.field}</span>
                  </div>
                  <span className={cn('text-right font-mono font-medium', valueColor)}>
                    {action.totalDelta >= 0 ? '+' : ''}
                    {action.totalDelta.toFixed(2)} pp
                  </span>
                  <span className="text-right text-muted-foreground">{action.timesApplied}×</span>
                  <span className={cn('text-right font-mono text-[11px]', valueColor)}>
                    {action.avgDelta >= 0 ? '+' : ''}
                    {action.avgDelta.toFixed(2)}
                  </span>
                </div>
              )
            })}

            {avgImprovementPerAction !== 0 && (
              <div className="pt-2 border-t flex items-center justify-between text-xs text-muted-foreground">
                <span>Mejora promedio por acción</span>
                <span
                  className={cn(
                    'font-mono font-medium',
                    avgImprovementPerAction < 0
                      ? 'text-emerald-600 dark:text-emerald-400'
                      : 'text-red-600 dark:text-red-400',
                  )}
                >
                  {avgImprovementPerAction >= 0 ? '+' : ''}
                  {avgImprovementPerAction.toFixed(2)} pp
                </span>
              </div>
            )}
          </div>
        )}
      </CardContent>
    </Card>
  )
}
