/**
 * Tab "Compuertas" (balance de gates + stats avanzadas + sugerencias swap)
 * del Dashboard del Grader. Extraído en la iter 3 de refactor 2026-04-10.
 */
import { Card, CardContent, CardHeader, CardTitle, Badge, InfoTooltip } from '@/components/ui'
import { AlertTriangle, Info, Zap, BarChart3, ArrowRightLeft } from 'lucide-react'
import { Bar } from 'react-chartjs-2'
import { cn } from '@/lib/utils'
import { getTooltipProps } from '@/services/grader/graderTooltips'
import { SwapSuggestionCard } from '@/components/grader/GraderInlinePanels'
import type { GraderAnalyticsResult } from '@/services/grader/types'

interface Props {
  analytics: GraderAnalyticsResult
}

export function GraderCompuertasTab({ analytics }: Props) {
  return (
    <>
      {/* Allocation Score KPI */}
      <div className="flex items-center gap-3 p-3 rounded-lg border bg-muted/30">
        <div className={cn(
          'text-2xl font-bold',
          analytics.allocationScore >= 80 ? 'text-emerald-600' :
          analytics.allocationScore >= 60 ? 'text-amber-600' : 'text-red-600',
        )}>
          {analytics.allocationScore ?? '—'}
        </div>
        <div>
          <p className="text-sm font-medium">Score de Asignación</p>
          <p className="text-xs text-muted-foreground">
            {(analytics.allocationScore ?? 0) >= 80 ? 'Buena distribución de gates relativa a demanda' :
             (analytics.allocationScore ?? 0) >= 60 ? 'Distribución mejorable — revisar sugerencias' :
             'Distribución muy desbalanceada — acción recomendada'}
          </p>
        </div>
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="text-sm flex items-center gap-2">
            <Zap className="h-4 w-4" />
            Balance Demanda vs Gates Asignados
            <InfoTooltip {...getTooltipProps('gate.balance')} />
          </CardTitle>
        </CardHeader>
        <CardContent>
          {analytics.gateBalance.length > 0 ? (
            <div className="space-y-3">
              {analytics.gateBalance.map((gb, i) => (
                <div
                  key={i}
                  className={cn(
                    'p-3 rounded-lg border flex items-start gap-3',
                    gb.severity === 'critical'
                      ? 'border-red-300 bg-red-50 dark:bg-red-900/10'
                      : gb.severity === 'warn'
                      ? 'border-amber-300 bg-amber-50 dark:bg-amber-900/10'
                      : 'border-muted bg-muted/30',
                  )}
                >
                  {gb.severity === 'critical' ? (
                    <AlertTriangle className="h-5 w-5 text-red-500 shrink-0 mt-0.5" />
                  ) : gb.severity === 'warn' ? (
                    <AlertTriangle className="h-5 w-5 text-amber-500 shrink-0 mt-0.5" />
                  ) : (
                    <Info className="h-5 w-5 text-muted-foreground shrink-0 mt-0.5" />
                  )}
                  <div className="flex-1">
                    <div className="flex items-center gap-2 flex-wrap">
                      <Badge variant="outline" className="text-xs">{gb.calibre}</Badge>
                      <span className="text-sm font-medium">
                        Demanda {gb.demandPct}% — {gb.gatesAssigned}/{gb.idealGates} gate(s)
                      </span>
                      {gb.gap > 0 && (
                        <Badge variant="destructive" className="text-[10px]">-{gb.gap} gate(s)</Badge>
                      )}
                      {gb.gap < 0 && (
                        <Badge variant="outline" className="text-[10px] text-emerald-600 border-emerald-300">
                          +{-gb.gap} extra
                        </Badge>
                      )}
                    </div>
                    <p className="text-xs text-muted-foreground mt-1">{gb.message}</p>
                  </div>
                </div>
              ))}

              {/* Bar chart: demand vs gates */}
              <div className="mt-4">
                <Bar
                  data={{
                    labels: analytics.gateBalance.map((g) => g.calibre),
                    datasets: [
                      {
                        label: 'Demanda (%)',
                        data: analytics.gateBalance.map((g) => g.demandPct),
                        backgroundColor: 'rgba(59,130,246,0.7)',
                      },
                      {
                        label: 'Gates Asignados',
                        data: analytics.gateBalance.map((g) => g.gatesAssigned),
                        backgroundColor: 'rgba(16,185,129,0.7)',
                      },
                      {
                        label: 'Gates Ideal',
                        data: analytics.gateBalance.map((g) => g.idealGates),
                        backgroundColor: 'rgba(168,85,247,0.4)',
                        borderColor: 'rgba(168,85,247,0.8)',
                        borderWidth: 1,
                      },
                    ],
                  }}
                  options={{
                    responsive: true,
                    plugins: { legend: { position: 'bottom' } },
                    scales: { y: { beginAtZero: true } },
                  }}
                />
              </div>
            </div>
          ) : (
            <p className="text-sm text-muted-foreground text-center py-8">
              Configure los gates para ver el balance de demanda.
            </p>
          )}
        </CardContent>
      </Card>

      {/* Gate Advanced Stats Table */}
      {analytics.gateAdvancedStats.length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle className="text-sm flex items-center gap-2">
              <BarChart3 className="h-4 w-4 text-blue-500" />
              Estadísticas por Compuerta
              <InfoTooltip {...getTooltipProps('gate.stats')} />
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b text-left">
                    <th className="py-2 px-2">Gate</th>
                    <th className="py-2 px-2 text-right">Piezas</th>
                    <th className="py-2 px-2 text-right">
                      <span className="flex items-center justify-end gap-1">
                        Prom. (g)
                        <InfoTooltip {...getTooltipProps('gate.avgWeight')} iconSize={11} />
                      </span>
                    </th>
                    <th className="py-2 px-2 text-right">
                      <span className="flex items-center justify-end gap-1">
                        σ (g)
                        <InfoTooltip {...getTooltipProps('gate.stdDev')} iconSize={11} />
                      </span>
                    </th>
                    <th className="py-2 px-2 text-right">
                      <span className="flex items-center justify-end gap-1">
                        CV
                        <InfoTooltip {...getTooltipProps('gate.cv')} iconSize={11} />
                      </span>
                    </th>
                    <th className="py-2 px-2 text-right">
                      <span className="flex items-center justify-end gap-1">
                        Utiliz.
                        <InfoTooltip {...getTooltipProps('gate.utilization')} iconSize={11} />
                      </span>
                    </th>
                    <th className="py-2 px-2">Asignado</th>
                    <th className="py-2 px-2 text-right">
                      <span className="flex items-center justify-end gap-1">
                        Mismatch
                        <InfoTooltip {...getTooltipProps('gate.mismatch')} iconSize={11} />
                      </span>
                    </th>
                  </tr>
                </thead>
                <tbody>
                  {analytics.gateAdvancedStats.map((gs) => (
                    <tr key={gs.gateNumber} className={cn(
                      'border-b hover:bg-muted/30',
                      gs.cv > 0.15 && 'bg-amber-50/50 dark:bg-amber-900/5',
                      gs.mismatchPct > 30 && 'bg-red-50/50 dark:bg-red-900/5',
                    )}>
                      <td className="py-2 px-2 font-medium">Gate {gs.gateNumber}</td>
                      <td className="py-2 px-2 text-right">{gs.pieces.toLocaleString()}</td>
                      <td className="py-2 px-2 text-right">{gs.avgWeightGrams.toLocaleString()}</td>
                      <td className="py-2 px-2 text-right">{gs.stdDevWeightGrams.toLocaleString()}</td>
                      <td className="py-2 px-2 text-right">
                        <span className={cn(
                          'font-medium',
                          gs.cv > 0.2 && 'text-red-600',
                          gs.cv > 0.15 && gs.cv <= 0.2 && 'text-amber-600',
                        )}>
                          {(gs.cv * 100).toFixed(1)}%
                        </span>
                      </td>
                      <td className="py-2 px-2 text-right">{gs.utilizationPct.toFixed(1)}%</td>
                      <td className="py-2 px-2">
                        <Badge variant="outline" className="text-[10px]">
                          {gs.assignedCalibre}
                        </Badge>
                      </td>
                      <td className="py-2 px-2 text-right">
                        <span className={cn(
                          'font-medium',
                          gs.mismatchPct > 30 && 'text-red-600',
                          gs.mismatchPct > 15 && gs.mismatchPct <= 30 && 'text-amber-600',
                        )}>
                          {gs.mismatchPct.toFixed(1)}%
                        </span>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            {/* CV comparison chart */}
            <div className="mt-4">
              <p className="text-xs font-medium mb-2">Coeficiente de Variación por Gate</p>
              <Bar
                data={{
                  labels: analytics.gateAdvancedStats.map(g => `Gate ${g.gateNumber}`),
                  datasets: [{
                    label: 'CV (%)',
                    data: analytics.gateAdvancedStats.map(g => g.cv * 100),
                    backgroundColor: analytics.gateAdvancedStats.map(g =>
                      g.cv > 0.2 ? 'rgba(239,68,68,0.7)' :
                      g.cv > 0.15 ? 'rgba(245,158,11,0.7)' :
                      'rgba(16,185,129,0.7)'
                    ),
                  }],
                }}
                options={{
                  responsive: true,
                  plugins: { legend: { display: false } },
                  scales: { y: { beginAtZero: true, title: { display: true, text: 'CV (%)' } } },
                }}
              />
            </div>
          </CardContent>
        </Card>
      )}

      {/* Gate Swap Suggestions */}
      {analytics.gateSwapSuggestions.length > 0 && (
        <Card className="border-purple-200">
          <CardHeader>
            <CardTitle className="text-sm flex items-center gap-2">
              <ArrowRightLeft className="h-4 w-4 text-purple-500" />
              Sugerencias de Reasignación
              <InfoTooltip {...getTooltipProps('gate.swap')} />
            </CardTitle>
            <p className="text-xs text-muted-foreground">
              Basadas en asignación ideal proporcional a demanda, mismatch real vs etiqueta, y variabilidad
            </p>
          </CardHeader>
          <CardContent className="space-y-3">
            {analytics.gateSwapSuggestions.map((s, i) => (
              <SwapSuggestionCard key={i} suggestion={s} />
            ))}
          </CardContent>
        </Card>
      )}
    </>
  )
}
