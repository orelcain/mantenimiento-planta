/**
 * Card "Reacción temprana (automática + IA)" de la tab Tendencia.
 * Contiene:
 *  - Umbrales P0 colapsables (warn/crítico)
 *  - Sugerencias automáticas basadas en proyección de turno
 *  - Análisis IA (Grok) con historial colapsable y comparación entre corridas
 * Extraído de GraderTendenciaTab en el refactor iter 19 (P1.8).
 */
import { Card, CardContent, CardHeader, CardTitle, Badge, Button, Input } from '@/components/ui'
import { TrendingUp, Brain, Loader2, ChevronDown } from 'lucide-react'
import { cn } from '@/lib/utils'
import { round2 } from '@/services/grader/graderDashboardHelpers'

type GateAction = {
  gateNumber: number
  suggestedCalibre: string
  suggestedQuality: string
  text: string
  canApply: boolean
  isApplied: boolean
}

type TrendAIRun = {
  id: string
  createdAtIso: string
  runLabel: string
  recommendations: Array<{ priority: 'high' | 'medium' | 'low'; action: string; why: string }>
}

interface Props {
  // Thresholds
  pointZeroWarnThreshold: number
  pointZeroCriticalThreshold: number
  trendWarnThreshold: number
  trendCriticalThreshold: number
  showThresholds: boolean
  onToggleThresholds: () => void
  onUpdateTrendWarnThreshold: (value: number) => void
  onUpdateTrendCriticalThreshold: (value: number) => void
  onUpdatePointZeroWarnThreshold?: (value: number) => void
  onUpdatePointZeroCriticalThreshold?: (value: number) => void
  // Auto
  trendAutoRecommendations: GateAction[]
  onApplyGateAction: (action: GateAction) => void
  onApplyGateSuggestion?: (payload: { gateNumber: number; calibre: string; quality: string }) => void
  // IA
  trendAIRuns: TrendAIRun[]
  trendAIConsistency: { level: 'alta' | 'media' | 'baja'; score: number; note: string } | null
  trendAIDiffRows: Array<{ slot: string; prevAction: string; prevWhy: string; newAction: string; newWhy: string; changeType: 'igual' | 'ajustada' | 'nueva' | 'eliminada' }>
  aiLoading: boolean
  onAnalyzeAI: () => void
  showAIHistory: boolean
  onToggleAIHistory: () => void
}

export function TendenciaEarlyReactionCard({
  pointZeroWarnThreshold,
  pointZeroCriticalThreshold,
  trendWarnThreshold,
  trendCriticalThreshold,
  showThresholds,
  onToggleThresholds,
  onUpdateTrendWarnThreshold,
  onUpdateTrendCriticalThreshold,
  onUpdatePointZeroWarnThreshold,
  onUpdatePointZeroCriticalThreshold,
  trendAutoRecommendations,
  onApplyGateAction,
  onApplyGateSuggestion,
  trendAIRuns,
  trendAIConsistency,
  trendAIDiffRows,
  aiLoading,
  onAnalyzeAI,
  showAIHistory,
  onToggleAIHistory,
}: Props) {
  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-sm flex items-center gap-2">
          <TrendingUp className="h-4 w-4 text-emerald-500" />
          Reacción temprana (automática + IA)
        </CardTitle>
        <p className="text-xs text-muted-foreground">
          Sugerencias para ajustar gates anticipadamente usando la proyección de turno en curso.
        </p>
      </CardHeader>
      <CardContent className="space-y-3">
        <div className="rounded-ctl border bg-muted/20">
          <button
            type="button"
            onClick={() => onToggleThresholds()}
            className="w-full flex items-center justify-between gap-2 px-3 py-2 text-left hover:bg-muted/30 transition-colors rounded-ctl"
          >
            <div className="flex items-center gap-2">
              <ChevronDown className={cn('h-3.5 w-3.5 transition-transform', showThresholds && 'rotate-180')} />
              <span className="text-[11px] font-medium">Ajustar umbrales P0</span>
            </div>
            <span className="text-[10px] text-muted-foreground tabular-nums">
              warn {pointZeroWarnThreshold}% · crítico {pointZeroCriticalThreshold}%
            </span>
          </button>
          {showThresholds && (
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 p-2 border-t">
              <div>
                <label className="text-[11px] text-muted-foreground">Umbral P0 Warn (%)</label>
                <Input
                  type="number"
                  min={0}
                  max={100}
                  step={0.1}
                  value={trendWarnThreshold}
                  onChange={(e) => {
                    const next = Number(e.target.value)
                    if (!Number.isFinite(next)) return
                    const clamped = round2(Math.min(100, Math.max(0, next)))
                    onUpdateTrendWarnThreshold(clamped)
                    onUpdatePointZeroWarnThreshold?.(clamped)
                  }}
                  className="h-8 text-xs"
                />
              </div>
              <div>
                <label className="text-[11px] text-muted-foreground">Umbral P0 Crítico (%)</label>
                <Input
                  type="number"
                  min={0}
                  max={100}
                  step={0.1}
                  value={trendCriticalThreshold}
                  onChange={(e) => {
                    const next = Number(e.target.value)
                    if (!Number.isFinite(next)) return
                    const clamped = round2(Math.min(100, Math.max(0, next)))
                    onUpdateTrendCriticalThreshold(clamped)
                    onUpdatePointZeroCriticalThreshold?.(clamped)
                  }}
                  className="h-8 text-xs"
                />
              </div>
            </div>
          )}
        </div>

        <div className="space-y-1.5">
          <p className="text-xs font-medium">Automática (proyección)</p>
          {trendAutoRecommendations.length > 0 ? trendAutoRecommendations.map((action) => (
            <div key={`trend-auto-${action.gateNumber}`} className="flex items-start justify-between gap-2 text-xs">
              <p>• {action.text}</p>
              {action.isApplied ? (
                <Badge variant="outline" className="text-[11px] border-emerald-500/[0.25] text-emerald-600">
                  Aplicada
                </Badge>
              ) : (
                onApplyGateSuggestion && (
                  <Button
                    size="sm"
                    variant="outline"
                    onClick={() => onApplyGateAction(action)}
                    className="h-7 px-2 text-[11px]"
                  >
                    Aplicar
                  </Button>
                )
              )}
            </div>
          )) : (
            <p className="text-xs text-muted-foreground">Sin acciones automáticas por ahora.</p>
          )}
        </div>

        <div className="space-y-1.5">
          <div className="flex items-center justify-between gap-2">
            <p className="text-xs font-medium">IA (Grok)</p>
            <Button size="sm" variant="outline" onClick={onAnalyzeAI} disabled={aiLoading} className="h-7 px-2 text-[11px]">
              {aiLoading ? <Loader2 className="h-3.5 w-3.5 animate-spin mr-1" /> : <Brain className="h-3.5 w-3.5 mr-1" />}
              {trendAIRuns.length > 0 ? 'Analizar otra vez' : 'Analizar ahora'}
            </Button>
          </div>

          {/* Última corrida — siempre visible */}
          {trendAIRuns.length === 0 ? (
            <p className="text-xs text-muted-foreground">Sin análisis IA — presiona &quot;Analizar ahora&quot;.</p>
          ) : (
            <div className="space-y-2">
              {(() => {
                const run = trendAIRuns[0]
                if (!run) return null
                return (
                  <div className="rounded-ctl border bg-muted/20 p-2 space-y-1.5">
                    <p className="text-[11px] text-muted-foreground font-medium">
                      Última corrida · {new Date(run.createdAtIso).toLocaleTimeString('es-CL', { hour: '2-digit', minute: '2-digit' })}
                    </p>
                    {run.recommendations.length > 0 ? (
                      run.recommendations.map((action, idx) => {
                        const pr = action.priority === 'high' ? 'alta' : action.priority === 'medium' ? 'media' : 'baja'
                        return (
                          <div key={`last-${idx}`} className="text-xs space-y-0.5">
                            <p>• Prioridad {pr}: {action.action}</p>
                            <p className="text-muted-foreground">{action.why}</p>
                          </div>
                        )
                      })
                    ) : (
                      <p className="text-xs text-muted-foreground">Sin acciones sugeridas.</p>
                    )}
                  </div>
                )
              })()}

              {/* Historial + comparación — colapsable */}
              {trendAIRuns.length >= 2 && (
                <div>
                  <button
                    type="button"
                    className="text-[11px] text-muted-foreground hover:text-foreground flex items-center gap-1 transition-colors mt-1"
                    onClick={() => onToggleAIHistory()}
                  >
                    <ChevronDown className={cn('h-3 w-3 transition-transform', showAIHistory && 'rotate-180')} />
                    {showAIHistory ? 'Ocultar historial' : `Ver historial (${trendAIRuns.length - 1} corrida${trendAIRuns.length > 2 ? 's' : ''} anterior${trendAIRuns.length > 2 ? 'es' : ''})`}
                  </button>
                  {showAIHistory && (
                    <div className="space-y-2 mt-2">
                      {trendAIConsistency && (
                        <div className="flex flex-wrap items-center gap-2 rounded-ctl border bg-muted/20 px-2 py-1.5">
                          <Badge variant="outline" className={cn(
                            'text-[10px]',
                            trendAIConsistency.level === 'alta' && 'border-emerald-500/[0.25] text-emerald-600',
                            trendAIConsistency.level === 'media' && 'border-amber-500/[0.25] text-amber-600',
                            trendAIConsistency.level === 'baja' && 'border-red-500/[0.25] text-red-600',
                          )}>
                            Consistencia: {trendAIConsistency.level.toUpperCase()} ({trendAIConsistency.score}%)
                          </Badge>
                          <p className="text-[11px] text-muted-foreground">{trendAIConsistency.note}</p>
                        </div>
                      )}
                      {trendAIDiffRows.length > 0 && (
                        <div className="rounded-ctl border bg-muted/20 p-2">
                          <p className="text-[11px] font-medium mb-1">Comparación corrida anterior vs actual</p>
                          <div className="overflow-x-auto">
                            <table className="w-full text-[11px]">
                              <thead>
                                <tr className="border-b text-left text-muted-foreground">
                                  <th className="py-1 px-1.5">Ítem</th>
                                  <th className="py-1 px-1.5">Anterior</th>
                                  <th className="py-1 px-1.5">Actual</th>
                                  <th className="py-1 px-1.5">Cambio</th>
                                </tr>
                              </thead>
                              <tbody>
                                {trendAIDiffRows.map((row) => (
                                  <tr key={row.slot} className="border-b align-top">
                                    <td className="py-1 px-1.5 font-medium whitespace-nowrap">{row.slot}</td>
                                    <td className="py-1 px-1.5">
                                      <p>{row.prevAction}</p>
                                      <p className="text-muted-foreground">{row.prevWhy}</p>
                                    </td>
                                    <td className="py-1 px-1.5">
                                      <p>{row.newAction}</p>
                                      <p className="text-muted-foreground">{row.newWhy}</p>
                                    </td>
                                    <td className="py-1 px-1.5">
                                      <Badge variant="outline" className={cn(
                                        'text-[10px]',
                                        row.changeType === 'igual' && 'border-emerald-500/[0.25] text-emerald-600',
                                        row.changeType === 'ajustada' && 'border-amber-500/[0.25] text-amber-600',
                                        row.changeType === 'nueva' && 'border-primary/[0.25] text-sky-600',
                                        row.changeType === 'eliminada' && 'border-red-500/[0.25] text-red-600',
                                      )}>
                                        {row.changeType}
                                      </Badge>
                                    </td>
                                  </tr>
                                ))}
                              </tbody>
                            </table>
                          </div>
                        </div>
                      )}
                      {trendAIRuns.slice(1).map((run) => (
                        <div key={run.id} className="rounded-ctl border bg-muted/20 p-2 space-y-1.5">
                          <p className="text-[11px] text-muted-foreground">
                            {run.runLabel} · {new Date(run.createdAtIso).toLocaleTimeString('es-CL', { hour: '2-digit', minute: '2-digit' })}
                          </p>
                          {run.recommendations.map((action, idx) => {
                            const pr = action.priority === 'high' ? 'alta' : action.priority === 'medium' ? 'media' : 'baja'
                            return (
                              <div key={`${run.id}-${idx}`} className="text-xs space-y-0.5">
                                <p>• Prioridad {pr}: {action.action}</p>
                                <p className="text-muted-foreground">{action.why}</p>
                              </div>
                            )
                          })}
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              )}
            </div>
          )}
        </div>
      </CardContent>
    </Card>
  )
}
