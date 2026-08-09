/**
 * Card "Degradación de Sensores" de la tab Tendencia.
 * Extraído de GraderTendenciaTab en el refactor iter 19 (P1.8).
 */
import { Card, CardContent, CardHeader, CardTitle, Badge } from '@/components/ui'
import { AlertTriangle } from 'lucide-react'
import { cn } from '@/lib/utils'
import type { useGraderDashboardAnalytics } from '@/hooks/useGraderDashboardAnalytics'

type DashboardViews = ReturnType<typeof useGraderDashboardAnalytics>

interface Props {
  sensorDegradationView: DashboardViews['sensorDegradationView']
}

export function TendenciaSensorDegradationCard({ sensorDegradationView }: Props) {
  if (!sensorDegradationView || sensorDegradationView.degradations.length === 0) return null

  return (
    <Card className="border-amber-500/[0.25] bg-amber-500/[0.15]">
      <CardHeader className="pb-3">
        <CardTitle className="text-sm flex items-center gap-2">
          <AlertTriangle className="h-4 w-4 text-amber-500" />
          Degradación de Sensores Detectada
        </CardTitle>
        <p className="text-xs text-muted-foreground">
          Errores P0 cuyo volumen crece significativamente a lo largo del turno
          ({sensorDegradationView.spanMinutes} min analizados). Posible falla progresiva de sensores o compuertas.
        </p>
      </CardHeader>
      <CardContent>
        <div className="space-y-2">
          {sensorDegradationView.degradations.map((deg) => {
            const isCritical = deg.severity === 'critical'
            return (
              <div
                key={deg.error}
                className={cn(
                  'flex flex-col sm:flex-row sm:items-center justify-between gap-2 p-2.5 rounded-ctl border',
                  isCritical ? 'border-red-500/[0.25] bg-red-500/[0.15]' : 'border-amber-500/[0.25] bg-amber-500/[0.15]',
                )}
              >
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-2 flex-wrap">
                    <Badge
                      variant="outline"
                      className={cn(
                        'text-[10px] shrink-0',
                        isCritical
                          ? 'border-red-500/[0.25] text-ink-crit'
                          : 'border-amber-500/[0.25] text-ink-warn',
                      )}
                    >
                      {isCritical ? 'CRÍTICO' : 'ALERTA'}
                    </Badge>
                    <p className="text-xs font-medium truncate">{deg.error}</p>
                  </div>
                  <p className="text-[11px] text-muted-foreground mt-1">
                    Crecimiento {deg.growthRatio.toFixed(1)}× entre inicio y fin del turno
                    · {deg.total.toLocaleString('es-CL')} piezas P0 acumuladas
                  </p>
                </div>
                {/* Mini-barras por cuarto */}
                <div className="flex items-end gap-1 h-10 shrink-0">
                  {deg.quarters.map((q, idx) => {
                    const maxQ = Math.max(...deg.quarters, 1)
                    const heightPct = (q / maxQ) * 100
                    return (
                      <div key={idx} className="flex flex-col items-center gap-0.5" title={`Q${idx + 1}: ${q} piezas`}>
                        <div
                          className={cn(
                            'w-4 rounded-ctl transition-all',
                            isCritical ? 'bg-red-500/[0.15]' : 'bg-amber-500/[0.15]',
                          )}
                          style={{ height: `${Math.max(heightPct, 4)}%` }}
                        />
                        <span className="text-[8px] text-muted-foreground tabular-nums">Q{idx + 1}</span>
                      </div>
                    )
                  })}
                </div>
              </div>
            )
          })}
        </div>
        <p className="text-[10px] text-muted-foreground mt-3">
          Análisis: turno dividido en 4 cuartos; se flagea cuando Q4 ≥ 1.5× Q1 (alerta) o ≥ 3× Q1 (crítico).
        </p>
      </CardContent>
    </Card>
  )
}
