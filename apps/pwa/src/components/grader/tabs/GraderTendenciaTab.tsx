/**
 * Tab "Tendencia de Peso" — el más rico del dashboard.
 * Incluye las 5 cards P0: proyección de turno, comparativa día/noche,
 * patrones multisesión, degradación sensores, reacción temprana + IA.
 *
 * Extraído en la iter 3 de refactor 2026-04-10.
 */
import { Card, CardContent, CardHeader, CardTitle, Button, Badge, InfoTooltip, Input } from '@/components/ui'
import { Line } from 'react-chartjs-2'
import {
  AlertTriangle,
  TrendingUp,
  TrendingDown,
  Minus,
  Brain,
  Target,
  Loader2,
  Activity,
  ArrowRightLeft,
  ChevronDown,
} from 'lucide-react'
import { cn } from '@/lib/utils'
import { round2 } from '@/services/grader/graderDashboardHelpers'
import { getTooltipProps } from '@/services/grader/graderTooltips'
import type {
  GraderAnalysisConfig,
  GraderAnalyticsResult,
  GraderSession,
  WeightTrendBucket,
} from '@/services/grader/types'
import type { useGraderDashboardAnalytics } from '@/hooks/useGraderDashboardAnalytics'

type DashboardViews = ReturnType<typeof useGraderDashboardAnalytics>

type TrendAIRun = {
  id: string
  createdAtIso: string
  runLabel: string
  recommendations: Array<{ priority: 'high' | 'medium' | 'low'; action: string; why: string }>
}

type GateAction = {
  gateNumber: number
  suggestedCalibre: string
  suggestedQuality: string
  text: string
  canApply: boolean
  isApplied: boolean
}

type CvSignal = { cls: string; emoji: string; label: string; bar: string }

interface Props {
  analytics: GraderAnalyticsResult
  config: GraderAnalysisConfig
  siblingSessions: GraderSession[]
  weightTrendByTs: Map<number, WeightTrendBucket>
  wtStdDevTooltipProps: ReturnType<typeof getTooltipProps>
  getCvSignal: (cv: number) => CvSignal
  // Views del hook
  trendForecastView: DashboardViews['trendForecastView']
  shiftProgressView: DashboardViews['shiftProgressView']
  sensorDegradationView: DashboardViews['sensorDegradationView']
  multiSessionInsightsView: DashboardViews['multiSessionInsightsView']
  shiftComparisonView: DashboardViews['shiftComparisonView']
  // Auto-recomendaciones y IA
  trendAutoRecommendations: GateAction[]
  trendAIRuns: TrendAIRun[]
  trendAIConsistency: { level: 'alta' | 'media' | 'baja'; score: number; note: string } | null
  trendAIDiffRows: Array<{ slot: string; prevAction: string; prevWhy: string; newAction: string; newWhy: string; changeType: 'igual' | 'ajustada' | 'nueva' | 'eliminada' }>
  aiLoading: boolean
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
  // UI state
  weightChartMode: 'simple' | 'detailed'
  onSetWeightChartMode: (mode: 'simple' | 'detailed') => void
  showAIHistory: boolean
  onToggleAIHistory: () => void
  // Callbacks
  getPointZeroSeverity: (pct: number) => 'critical' | 'warn' | 'ok'
  onApplyGateAction: (action: GateAction) => void
  onAnalyzeAI: () => void
  onApplyGateSuggestion?: (payload: { gateNumber: number; calibre: string; quality: string }) => void
}

export function GraderTendenciaTab({
  analytics,
  config,
  siblingSessions,
  weightTrendByTs,
  wtStdDevTooltipProps,
  getCvSignal,
  trendForecastView,
  shiftProgressView,
  sensorDegradationView,
  multiSessionInsightsView,
  shiftComparisonView,
  trendAutoRecommendations,
  trendAIRuns,
  trendAIConsistency,
  trendAIDiffRows,
  aiLoading,
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
  weightChartMode,
  onSetWeightChartMode,
  showAIHistory,
  onToggleAIHistory,
  getPointZeroSeverity,
  onApplyGateAction,
  onAnalyzeAI,
  onApplyGateSuggestion,
}: Props) {
  return analytics.weightTrendSeries.length > 0 ? (
            <>
              {/* Panel de proyección de turno — KPIs en tiempo real */}
              {trendForecastView && shiftProgressView && (() => {
                const severity = getPointZeroSeverity(trendForecastView.projectedPointZeroPct)
                const severityBorder =
                  severity === 'critical' ? 'border-red-500/60 bg-red-500/5' :
                  severity === 'warn' ? 'border-amber-500/60 bg-amber-500/5' :
                  'border-emerald-500/60 bg-emerald-500/5'
                const severityText =
                  severity === 'critical' ? 'text-red-600 dark:text-red-400' :
                  severity === 'warn' ? 'text-amber-600 dark:text-amber-400' :
                  'text-emerald-600 dark:text-emerald-400'
                const severityLabel =
                  severity === 'critical' ? 'CRÍTICO' :
                  severity === 'warn' ? 'ALERTA' :
                  'OK'
                const TrendIcon =
                  shiftProgressView.weightTrend === 'up' ? TrendingUp :
                  shiftProgressView.weightTrend === 'down' ? TrendingDown :
                  Minus
                const trendColor =
                  shiftProgressView.weightTrend === 'up' ? 'text-blue-600 dark:text-blue-400' :
                  shiftProgressView.weightTrend === 'down' ? 'text-orange-600 dark:text-orange-400' :
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
                        <div className="flex flex-col gap-1 p-3 rounded-lg bg-background/60 border">
                          <p className="text-[11px] text-muted-foreground uppercase tracking-wide">Tiempo restante</p>
                          <p className="text-2xl font-bold tabular-nums">{shiftProgressView.remainingLabel}</p>
                          <div className="h-1.5 w-full bg-muted rounded-full overflow-hidden mt-1">
                            <div
                              className="h-full bg-purple-500 transition-all"
                              style={{ width: `${Math.min(100, shiftProgressView.elapsedPct)}%` }}
                            />
                          </div>
                          <p className="text-[10px] text-muted-foreground">{shiftProgressView.elapsedPct.toFixed(0)}% del turno</p>
                        </div>

                        {/* P0 proyectado al cierre */}
                        <div className={cn('flex flex-col gap-1 p-3 rounded-lg bg-background/60 border-2', severityBorder)}>
                          <div className="flex items-center justify-between">
                            <p className="text-[11px] text-muted-foreground uppercase tracking-wide">P0 al cierre</p>
                            <Badge variant="outline" className={cn('text-[9px] px-1.5 py-0', severityText, 'border-current')}>
                              {severityLabel}
                            </Badge>
                          </div>
                          <p className={cn('text-2xl font-bold tabular-nums', severityText)}>
                            {trendForecastView.projectedPointZeroPct.toFixed(2)}%
                          </p>
                          <p className="text-[10px] text-muted-foreground">
                            {trendForecastView.projectedPointZeroPieces.toLocaleString('es-CL')} piezas proyectadas
                          </p>
                          <p className="text-[9px] text-muted-foreground">
                            umbral warn {pointZeroWarnThreshold}% / crítico {pointZeroCriticalThreshold}%
                          </p>
                        </div>

                        {/* Piezas proyectadas al cierre */}
                        <div className="flex flex-col gap-1 p-3 rounded-lg bg-background/60 border">
                          <p className="text-[11px] text-muted-foreground uppercase tracking-wide">Piezas al cierre</p>
                          <p className="text-2xl font-bold tabular-nums">
                            {trendForecastView.projectedTotalPieces.toLocaleString('es-CL')}
                          </p>
                          <p className="text-[10px] text-muted-foreground">
                            observadas: {trendForecastView.observedPieces.toLocaleString('es-CL')}
                          </p>
                          <p className="text-[10px] text-muted-foreground">
                            proyectadas: {(trendForecastView.projectedTotalPieces - trendForecastView.observedPieces).toLocaleString('es-CL')}
                          </p>
                        </div>

                        {/* Tendencia del peso */}
                        <div className="flex flex-col gap-1 p-3 rounded-lg bg-background/60 border">
                          <p className="text-[11px] text-muted-foreground uppercase tracking-wide">Tendencia peso</p>
                          <div className="flex items-center gap-2">
                            <TrendIcon className={cn('h-6 w-6', trendColor)} />
                            <p className={cn('text-2xl font-bold', trendColor)}>{trendLabel}</p>
                          </div>
                          <p className="text-[10px] text-muted-foreground">
                            Δ {shiftProgressView.weightDeltaGrams >= 0 ? '+' : ''}{shiftProgressView.weightDeltaGrams.toFixed(1)} g
                            {' '}({shiftProgressView.weightDeltaPct >= 0 ? '+' : ''}{shiftProgressView.weightDeltaPct.toFixed(2)}%)
                          </p>
                          <p className="text-[9px] text-muted-foreground">inicio vs último observado</p>
                        </div>
                      </div>
                    </CardContent>
                  </Card>
                )
              })()}

              {/* Comparativa turno día/noche: muestra diferencias con una sesión hermana */}
              {shiftComparisonView && (() => {
                const cmp = shiftComparisonView
                const p0Dir = cmp.delta.p0 > 0 ? 'up' : cmp.delta.p0 < 0 ? 'down' : 'flat'
                const weightDir = cmp.delta.avgWeightPct > 0 ? 'up' : cmp.delta.avgWeightPct < 0 ? 'down' : 'flat'
                // Para P0, subir es malo (rojo), bajar es bueno (verde)
                const p0Color = p0Dir === 'up' ? 'text-red-600 dark:text-red-400' : p0Dir === 'down' ? 'text-emerald-600 dark:text-emerald-400' : 'text-muted-foreground'
                const weightColor = weightDir === 'up' ? 'text-blue-600 dark:text-blue-400' : weightDir === 'down' ? 'text-orange-600 dark:text-orange-400' : 'text-muted-foreground'
                const P0Icon = p0Dir === 'up' ? TrendingUp : p0Dir === 'down' ? TrendingDown : Minus
                const WeightIcon = weightDir === 'up' ? TrendingUp : weightDir === 'down' ? TrendingDown : Minus
                return (
                  <Card className="border-sky-500/40 bg-sky-500/5">
                    <CardHeader className="pb-3">
                      <CardTitle className="text-sm flex items-center gap-2">
                        <ArrowRightLeft className="h-4 w-4 text-sky-500" />
                        Comparativa con Turno Hermano
                      </CardTitle>
                      <p className="text-xs text-muted-foreground">
                        {cmp.currentLabel} vs {cmp.siblingLabel} · {cmp.sessionDate ?? 'mismo día'}
                      </p>
                    </CardHeader>
                    <CardContent>
                      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
                        {/* P0 */}
                        <div className="flex flex-col gap-1 p-3 rounded-lg bg-background/60 border">
                          <p className="text-[11px] text-muted-foreground uppercase tracking-wide">Punto Cero</p>
                          <div className="flex items-baseline gap-1.5">
                            <p className="text-xl font-bold tabular-nums">{cmp.current.p0.toFixed(2)}%</p>
                            <P0Icon className={cn('h-4 w-4', p0Color)} />
                          </div>
                          <p className="text-[10px] text-muted-foreground">
                            {cmp.siblingLabel}: {cmp.sibling.p0.toFixed(2)}%
                          </p>
                          <p className={cn('text-[10px] font-medium tabular-nums', p0Color)}>
                            Δ {cmp.delta.p0 >= 0 ? '+' : ''}{cmp.delta.p0.toFixed(2)} pp
                          </p>
                        </div>
                        {/* Piezas */}
                        <div className="flex flex-col gap-1 p-3 rounded-lg bg-background/60 border">
                          <p className="text-[11px] text-muted-foreground uppercase tracking-wide">Piezas</p>
                          <p className="text-xl font-bold tabular-nums">{cmp.current.pieces.toLocaleString('es-CL')}</p>
                          <p className="text-[10px] text-muted-foreground">
                            {cmp.siblingLabel}: {cmp.sibling.pieces.toLocaleString('es-CL')}
                          </p>
                          <p className="text-[10px] text-muted-foreground tabular-nums">
                            Δ {cmp.delta.pieces >= 0 ? '+' : ''}{cmp.delta.pieces.toLocaleString('es-CL')}
                          </p>
                        </div>
                        {/* Peso promedio */}
                        <div className="flex flex-col gap-1 p-3 rounded-lg bg-background/60 border">
                          <p className="text-[11px] text-muted-foreground uppercase tracking-wide">Peso promedio</p>
                          <div className="flex items-baseline gap-1.5">
                            <p className="text-xl font-bold tabular-nums">{cmp.current.avgWeight.toFixed(0)} g</p>
                            <WeightIcon className={cn('h-4 w-4', weightColor)} />
                          </div>
                          <p className="text-[10px] text-muted-foreground">
                            {cmp.siblingLabel}: {cmp.sibling.avgWeight.toFixed(0)} g
                          </p>
                          <p className={cn('text-[10px] font-medium tabular-nums', weightColor)}>
                            Δ {cmp.delta.avgWeight >= 0 ? '+' : ''}{cmp.delta.avgWeight.toFixed(0)} g ({cmp.delta.avgWeightPct >= 0 ? '+' : ''}{cmp.delta.avgWeightPct.toFixed(1)}%)
                          </p>
                        </div>
                        {/* Calibre dominante */}
                        <div className="flex flex-col gap-1 p-3 rounded-lg bg-background/60 border">
                          <p className="text-[11px] text-muted-foreground uppercase tracking-wide">Calibre dominante</p>
                          <p className="text-xl font-bold tabular-nums">{cmp.current.calibre}</p>
                          <p className="text-[10px] text-muted-foreground">
                            {cmp.siblingLabel}: {cmp.sibling.calibre}
                          </p>
                          {cmp.current.calibre !== cmp.sibling.calibre && (
                            <p className="text-[10px] text-amber-600 dark:text-amber-400 font-medium">Diferente</p>
                          )}
                        </div>
                      </div>
                      {siblingSessions.length > 1 && (
                        <p className="text-[10px] text-muted-foreground mt-2">
                          Mostrando vs 1 de {siblingSessions.length} sesiones hermanas disponibles.
                        </p>
                      )}
                    </CardContent>
                  </Card>
                )
              })()}

              {/* Patrones multisesión: contexto histórico de la sesión actual */}
              {multiSessionInsightsView && (() => {
                const m = multiSessionInsightsView
                const p0Better = m.deltaP0 < 0
                const p0Worse = m.deltaP0 > 0
                const p0Color = p0Better ? 'text-emerald-600 dark:text-emerald-400' : p0Worse ? 'text-red-600 dark:text-red-400' : 'text-muted-foreground'
                const p0BgClass = p0Better ? 'bg-emerald-500/10 border-emerald-500/40' : p0Worse ? 'bg-red-500/10 border-red-500/40' : 'bg-muted/20'
                const percentileLabel = m.percentileP0 >= 75 ? 'peor 25%' : m.percentileP0 >= 50 ? 'peor 50%' : m.percentileP0 >= 25 ? 'mejor 50%' : 'mejor 25%'
                return (
                  <Card className="border-violet-500/40 bg-violet-500/5">
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
                        <div className={cn('p-2.5 rounded-md border', p0BgClass)}>
                          <p className="text-[10px] uppercase tracking-wide text-muted-foreground">P0 vs promedio</p>
                          <p className={cn('text-lg font-bold tabular-nums', p0Color)}>
                            {m.deltaP0 >= 0 ? '+' : ''}{m.deltaP0.toFixed(2)} pp
                          </p>
                          <p className="text-[10px] text-muted-foreground">
                            hist. {m.avgP0.toFixed(2)}% · posición {percentileLabel}
                          </p>
                        </div>
                        <div className="p-2.5 rounded-md border bg-muted/20">
                          <p className="text-[10px] uppercase tracking-wide text-muted-foreground">Piezas vs promedio</p>
                          <p className="text-lg font-bold tabular-nums">
                            {m.deltaPieces >= 0 ? '+' : ''}{m.deltaPieces.toLocaleString('es-CL')}
                          </p>
                          <p className="text-[10px] text-muted-foreground">hist. {m.avgPieces.toLocaleString('es-CL')}</p>
                        </div>
                        <div className="p-2.5 rounded-md border bg-muted/20">
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
                                    'flex items-center justify-between gap-2 p-1.5 rounded border text-xs',
                                    isInCurrent
                                      ? 'border-amber-500/50 bg-amber-500/10'
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
                            <p className="text-[10px] text-amber-600 dark:text-amber-400 mt-1.5">
                              ⚠ {m.recurrentInCurrent.length} error{m.recurrentInCurrent.length > 1 ? 'es' : ''} recurrente{m.recurrentInCurrent.length > 1 ? 's' : ''} presente{m.recurrentInCurrent.length > 1 ? 's' : ''} en esta sesión — problema crónico.
                            </p>
                          )}
                        </div>
                      )}
                    </CardContent>
                  </Card>
                )
              })()}

              {/* Degradación de sensores: alertas de errores P0 crecientes en el tiempo */}
              {sensorDegradationView && sensorDegradationView.degradations.length > 0 && (
                <Card className="border-amber-500/40 bg-amber-500/5">
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
                              'flex flex-col sm:flex-row sm:items-center justify-between gap-2 p-2.5 rounded-md border',
                              isCritical ? 'border-red-500/50 bg-red-500/10' : 'border-amber-500/40 bg-amber-500/5',
                            )}
                          >
                            <div className="min-w-0 flex-1">
                              <div className="flex items-center gap-2 flex-wrap">
                                <Badge
                                  variant="outline"
                                  className={cn(
                                    'text-[10px] shrink-0',
                                    isCritical
                                      ? 'border-red-500/60 text-red-600 dark:text-red-400'
                                      : 'border-amber-500/60 text-amber-600 dark:text-amber-400',
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
                                        'w-4 rounded-sm transition-all',
                                        isCritical ? 'bg-red-500/70' : 'bg-amber-500/70',
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
              )}

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
                  <div className="rounded-md border bg-muted/20">
                    <button
                      type="button"
                      onClick={() => onToggleThresholds()}
                      className="w-full flex items-center justify-between gap-2 px-3 py-2 text-left hover:bg-muted/30 transition-colors rounded-md"
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
                          <Badge variant="outline" className="text-[11px] border-emerald-500/40 text-emerald-600">
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
                      <p className="text-xs text-muted-foreground">Sin análisis IA — presiona "Analizar ahora".</p>
                    ) : (
                      <div className="space-y-2">
                        {(() => {
                          const run = trendAIRuns[0]
                          if (!run) return null
                          return (
                            <div className="rounded-md border bg-muted/20 p-2 space-y-1.5">
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
                                  <div className="flex flex-wrap items-center gap-2 rounded-md border bg-muted/20 px-2 py-1.5">
                                    <Badge variant="outline" className={cn(
                                      'text-[10px]',
                                      trendAIConsistency.level === 'alta' && 'border-emerald-500/40 text-emerald-600',
                                      trendAIConsistency.level === 'media' && 'border-amber-500/40 text-amber-600',
                                      trendAIConsistency.level === 'baja' && 'border-red-500/40 text-red-600',
                                    )}>
                                      Consistencia: {trendAIConsistency.level.toUpperCase()} ({trendAIConsistency.score}%)
                                    </Badge>
                                    <p className="text-[11px] text-muted-foreground">{trendAIConsistency.note}</p>
                                  </div>
                                )}
                                {trendAIDiffRows.length > 0 && (
                                  <div className="rounded-md border bg-muted/20 p-2">
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
                                                  row.changeType === 'igual' && 'border-emerald-500/40 text-emerald-600',
                                                  row.changeType === 'ajustada' && 'border-amber-500/40 text-amber-600',
                                                  row.changeType === 'nueva' && 'border-sky-500/40 text-sky-600',
                                                  row.changeType === 'eliminada' && 'border-red-500/40 text-red-600',
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
                                  <div key={run.id} className="rounded-md border bg-muted/20 p-2 space-y-1.5">
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

              <Card>
                <CardHeader>
                  <div className="flex items-start justify-between gap-2 flex-wrap">
                    <div className="min-w-0">
                      <CardTitle className="text-sm flex items-center gap-2">
                        <Activity className="h-4 w-4 text-purple-500" />
                        Tendencia de Peso en el Tiempo
                        <InfoTooltip {...getTooltipProps('wt.trend')} />
                      </CardTitle>
                      <p className="text-xs text-muted-foreground mt-1">
                        {weightChartMode === 'simple'
                          ? 'Modo simple: solo peso observado + proyección'
                          : 'Modo detallado: incluye media móvil y bandas ±1σ'}
                      </p>
                    </div>
                    <div className="inline-flex rounded-md border bg-muted/30 p-0.5 shrink-0">
                      <button
                        type="button"
                        onClick={() => onSetWeightChartMode('simple')}
                        className={cn(
                          'px-2.5 py-1 text-[11px] rounded transition-colors',
                          weightChartMode === 'simple'
                            ? 'bg-background shadow-sm font-medium'
                            : 'text-muted-foreground hover:text-foreground',
                        )}
                      >
                        Simple
                      </button>
                      <button
                        type="button"
                        onClick={() => onSetWeightChartMode('detailed')}
                        className={cn(
                          'px-2.5 py-1 text-[11px] rounded transition-colors',
                          weightChartMode === 'detailed'
                            ? 'bg-background shadow-sm font-medium'
                            : 'text-muted-foreground hover:text-foreground',
                        )}
                      >
                        Detallado
                      </button>
                    </div>
                  </div>
                  {trendForecastView && (
                    <div className="flex flex-wrap gap-2 mt-2">
                      <Badge variant="outline" className="text-[10px]">
                        Cobertura: {trendForecastView.completionPct.toFixed(1)}% ({trendForecastView.observedBuckets}/{trendForecastView.totalBuckets} intervalos)
                      </Badge>
                      <Badge variant="outline" className="text-[10px]">
                        Turno: {trendForecastView.shiftStartLabel} → {trendForecastView.shiftEndLabel}
                      </Badge>
                      <Badge variant="outline" className="text-[10px]">
                        Piezas proyectadas cierre: {trendForecastView.projectedTotalPieces.toLocaleString('es-CL')}
                      </Badge>
                    </div>
                  )}
                </CardHeader>
                <CardContent>
                  <Line
                    data={{
                      labels: trendForecastView?.labels ?? analytics.weightTrendSeries.map((b) => b.bucketStart),
                      datasets: [
                        {
                          label: 'Peso observado (g)',
                          data: trendForecastView?.realAvgData ?? analytics.weightTrendSeries.map((b) => b.avgWeightGrams),
                          borderColor: 'rgba(59,130,246,0.9)',
                          backgroundColor: 'rgba(59,130,246,0.05)',
                          fill: false,
                          tension: 0.3,
                          pointRadius: 3,
                        },
                        ...(trendForecastView?.hasProjection
                          ? [{
                              label: 'Peso proyectado (g)',
                              data: trendForecastView.projectedAvgData,
                              borderColor: 'rgba(168,85,247,0.95)',
                              borderDash: [6, 4],
                              fill: false,
                              tension: 0.25,
                              pointRadius: 2,
                            }]
                          : []),
                        ...(weightChartMode === 'detailed' ? [
                          {
                            label: 'Media Móvil 5',
                            data: trendForecastView?.realMovingAvgData ?? analytics.weightTrendSeries.map((b) => b.movingAvg5 ?? null),
                            borderColor: 'rgba(139,92,246,0.8)',
                            borderDash: [6, 3],
                            fill: false,
                            tension: 0.4,
                            pointRadius: 0,
                          },
                          {
                            label: '+1σ',
                            data: trendForecastView?.realUpperBand ?? analytics.weightTrendSeries.map((b) => b.avgWeightGrams + b.stdDevWeightGrams),
                            borderColor: 'rgba(16,185,129,0.3)',
                            backgroundColor: 'rgba(16,185,129,0.05)',
                            fill: '+1' as const,
                            tension: 0.3,
                            pointRadius: 0,
                            borderWidth: 1,
                          },
                          {
                            label: '−1σ',
                            data: trendForecastView?.realLowerBand ?? analytics.weightTrendSeries.map((b) => Math.max(0, b.avgWeightGrams - b.stdDevWeightGrams)),
                            borderColor: 'rgba(16,185,129,0.3)',
                            fill: false,
                            tension: 0.3,
                            pointRadius: 0,
                            borderWidth: 1,
                          },
                        ] : []),
                      ],
                    }}
                    options={{
                      responsive: true,
                      plugins: {
                        legend: { position: 'bottom', labels: { font: { size: 11 } } },
                        tooltip: {
                          callbacks: {
                            afterBody: (items) => {
                              const idx = items[0]?.dataIndex
                              if (idx == null) return ''
                              const bucketKey = trendForecastView?.labels?.[idx] ?? analytics.weightTrendSeries[idx]?.bucketStart
                              const bucketTs = bucketKey ? new Date(bucketKey).getTime() : NaN
                              const bucket = Number.isFinite(bucketTs) ? weightTrendByTs.get(bucketTs) : undefined
                              if (!bucket) return ''
                              const lines = [`Mediana: ${bucket.medianWeightGrams.toLocaleString()} g`, `σ: ${bucket.stdDevWeightGrams.toLocaleString()} g`, `Piezas: ${bucket.pieces.toLocaleString()}`]
                              if (bucket.dominantLot) lines.push(`Lote: ${bucket.dominantLot}`)
                              return lines
                            },
                          },
                        },
                      },
                      scales: {
                        x: {
                          type: 'time',
                          time: { unit: config.intervalMinutes === 60 ? 'hour' : 'minute' },
                        },
                        y: { beginAtZero: false, title: { display: true, text: 'Peso (g)' } },
                      },
                    }}
                  />
                  {trendForecastView?.hasProjection && (
                    <p className="text-[11px] text-muted-foreground mt-2">
                      La línea punteada muestra tendencia probable del resto del turno usando el comportamiento observado hasta ahora.
                    </p>
                  )}
                </CardContent>
              </Card>

              {trendForecastView && (() => {
                const projSeverity = getPointZeroSeverity(trendForecastView.projectedPointZeroPct)
                const projBadgeClass =
                  projSeverity === 'critical' ? 'border-red-500/60 text-red-600 dark:text-red-400 bg-red-500/10' :
                  projSeverity === 'warn' ? 'border-amber-500/60 text-amber-600 dark:text-amber-400 bg-amber-500/10' :
                  'border-emerald-500/60 text-emerald-600 dark:text-emerald-400 bg-emerald-500/10'
                return (
                  <Card>
                    <CardHeader>
                      <div className="flex items-start justify-between gap-3 flex-wrap">
                        <div className="min-w-0">
                          <CardTitle className="text-sm">Proyección de Piezas por Intervalo</CardTitle>
                          <p className="text-xs text-muted-foreground mt-1">
                            Si cargó 1-2 horas, se mantiene el eje completo del turno y se proyecta el tramo faltante.
                          </p>
                        </div>
                        <div className={cn(
                          'flex flex-col items-end gap-0.5 px-3 py-1.5 rounded-lg border-2 shrink-0',
                          projBadgeClass,
                        )}>
                          <p className="text-[9px] uppercase tracking-wide opacity-80">P0 al cierre</p>
                          <p className="text-lg font-bold tabular-nums leading-none">
                            {trendForecastView.projectedPointZeroPct.toFixed(2)}%
                          </p>
                          <p className="text-[10px] tabular-nums opacity-90">
                            {trendForecastView.projectedPointZeroPieces.toLocaleString('es-CL')} piezas
                          </p>
                        </div>
                      </div>
                    </CardHeader>
                    <CardContent>
                      <Line
                        data={{
                          labels: trendForecastView.labels,
                          datasets: [
                            {
                              label: 'Piezas observadas',
                              data: trendForecastView.realPiecesData,
                              borderColor: 'rgba(37,99,235,0.95)',
                              backgroundColor: 'rgba(37,99,235,0.12)',
                              fill: false,
                              tension: 0.25,
                              pointRadius: 2,
                            },
                            {
                              label: 'Piezas proyectadas',
                              data: trendForecastView.projectedPiecesData,
                              borderColor: 'rgba(217,70,239,0.95)',
                              borderDash: [6, 4],
                              fill: false,
                              tension: 0.2,
                              pointRadius: 2,
                            },
                          ],
                        }}
                        options={{
                          responsive: true,
                          plugins: {
                            legend: { position: 'bottom', labels: { font: { size: 11 } } },
                          },
                          scales: {
                            x: { type: 'time', time: { unit: config.intervalMinutes === 60 ? 'hour' : 'minute' } },
                            y: { beginAtZero: true, title: { display: true, text: 'Piezas / intervalo' } },
                          },
                        }}
                      />
                    </CardContent>
                  </Card>
                )
              })()}

              {/* Weight trend table */}
              <Card>
                <CardHeader>
                  <CardTitle className="text-sm">Detalle por Intervalo</CardTitle>
                  <p className="text-[11px] text-muted-foreground flex flex-wrap items-center gap-x-2 gap-y-1">
                    <span className="font-medium">Semáforo CV:</span>
                    <span>🟢 &lt;8%</span>
                    <span>🟡 8-11.9%</span>
                    <span>🟠 12-19.9%</span>
                    <span>🔴 ≥20%</span>
                  </p>
                </CardHeader>
                <CardContent>
                  <div className="overflow-x-auto max-h-[400px] overflow-y-auto">
                    <table className="w-full text-sm">
                      <thead className="sticky top-0 bg-background">
                        <tr className="border-b text-left">
                          <th className="py-2 px-2">Hora</th>
                          <th className="py-2 px-2 text-right">Piezas</th>
                          <th className="py-2 px-2 text-right">
                            <span className="flex items-center justify-end gap-1">
                              Promedio (g)
                              <InfoTooltip {...getTooltipProps('wt.avgWeight')} iconSize={12} />
                            </span>
                          </th>
                          <th className="py-2 px-2 text-right">
                            <span className="flex items-center justify-end gap-1">
                              Mediana (g)
                              <InfoTooltip {...getTooltipProps('wt.medianWeight')} iconSize={12} />
                            </span>
                          </th>
                          <th className="py-2 px-2 text-right">
                            <span className="flex items-center justify-end gap-1">
                              σ (g)
                              <InfoTooltip {...wtStdDevTooltipProps} iconSize={12} />
                            </span>
                          </th>
                          <th className="py-2 px-2 text-right">
                            <span className="flex items-center justify-end gap-1">
                              CV %
                              <InfoTooltip {...getTooltipProps('wt.cv')} iconSize={12} />
                            </span>
                          </th>
                          <th className="py-2 px-2 text-right">
                            <span className="flex items-center justify-end gap-1">
                              MA(5) (g)
                              <InfoTooltip {...getTooltipProps('wt.movingAvg')} iconSize={12} />
                            </span>
                          </th>
                          <th className="py-2 px-2">
                            <span className="flex items-center gap-1">
                              Lote
                              <InfoTooltip {...getTooltipProps('wt.dominantLot')} iconSize={12} />
                            </span>
                          </th>
                        </tr>
                      </thead>
                      <tbody>
                        {analytics.weightTrendSeries.map((b, i) => (
                          <tr key={i} className="border-b hover:bg-muted/30">
                            <td className="py-1.5 px-2 text-xs">{new Date(b.bucketStart).toLocaleTimeString()}</td>
                            <td className="py-1.5 px-2 text-right">{b.pieces.toLocaleString()}</td>
                            <td className="py-1.5 px-2 text-right font-medium">{b.avgWeightGrams.toLocaleString()}</td>
                            <td className="py-1.5 px-2 text-right">{b.medianWeightGrams.toLocaleString()}</td>
                            <td className="py-1.5 px-2 text-right">
                              {(() => {
                                const cv = b.avgWeightGrams > 0 ? (b.stdDevWeightGrams / b.avgWeightGrams) * 100 : 0
                                const signal = getCvSignal(cv)
                                const minBand = Math.max(0, b.avgWeightGrams - b.stdDevWeightGrams)
                                const maxBand = b.avgWeightGrams + b.stdDevWeightGrams
                                return (
                                  <span className="inline-flex items-center justify-end gap-1">
                                    <span className={cn('font-medium tabular-nums', signal.cls)}>
                                      {b.stdDevWeightGrams.toLocaleString('es-CL', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                                    </span>
                                    <span aria-hidden>{signal.emoji}</span>
                                    <InfoTooltip
                                      iconSize={11}
                                      title={`σ intervalo ${new Date(b.bucketStart).toLocaleTimeString('es-CL', { hour: '2-digit', minute: '2-digit', timeZone: 'UTC' })}`}
                                      text="Este valor sale al medir qué tan alejados están los pesos del intervalo respecto a su media."
                                      formula="σ = √[ Σ(xᵢ − x̄)² / N ]"
                                      example={`x̄=${b.avgWeightGrams.toLocaleString('es-CL', { maximumFractionDigits: 2 })}g, σ=${b.stdDevWeightGrams.toLocaleString('es-CL', { maximumFractionDigits: 2 })}g, N=${b.pieces.toLocaleString('es-CL')}. Rango típico aprox.: ${minBand.toLocaleString('es-CL', { maximumFractionDigits: 0 })}g a ${maxBand.toLocaleString('es-CL', { maximumFractionDigits: 0 })}g. CV≈${cv.toLocaleString('es-CL', { maximumFractionDigits: 1 })}% (${signal.emoji} dispersión ${signal.label}).`}
                                    />
                                  </span>
                                )
                              })()}
                            </td>
                            <td className="py-1.5 px-2 text-right">
                              {(() => {
                                const cv = b.avgWeightGrams > 0 ? (b.stdDevWeightGrams / b.avgWeightGrams) * 100 : 0
                                const signal = getCvSignal(cv)
                                return (
                                  <span className={cn('inline-flex items-center justify-end gap-1 font-medium tabular-nums', signal.cls)}>
                                    {cv.toLocaleString('es-CL', { maximumFractionDigits: 1 })}%
                                    <span aria-hidden>{signal.emoji}</span>
                                  </span>
                                )
                              })()}
                            </td>
                            <td className="py-1.5 px-2 text-right text-purple-600">
                              {b.movingAvg5 != null ? b.movingAvg5.toLocaleString() : '—'}
                            </td>
                            <td className="py-1.5 px-2 text-xs">{b.dominantLot || '—'}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </CardContent>
              </Card>
            </>
          ) : (
            <Card>
              <CardContent className="py-8">
                <p className="text-sm text-muted-foreground text-center">
                  Sin datos de peso por pieza. Cargue un archivo pieza-pieza con columna &quot;peso en Gr&quot;.
                </p>
              </CardContent>
            </Card>
          )
}
