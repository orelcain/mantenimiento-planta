/**
 * Tab "Tendencia de Peso" — el más rico del dashboard.
 * Incluye las 5 cards P0: proyección de turno, comparativa día/noche,
 * patrones multisesión, degradación sensores, reacción temprana + IA,
 * y el gran chart de tendencia de peso + tabla detalle.
 *
 * Extraído en la iter 3 de refactor 2026-04-10.
 * Refactor iter 19 (P1.8): dividido en 6 sub-cards bajo `tabs/tendencia/`.
 * De 1053 líneas a ~90 líneas (orquestador puro).
 */
import { Card, CardContent } from '@/components/ui'
import { getTooltipProps } from '@/services/grader/graderTooltips'
import type {
  GraderAnalysisConfig,
  GraderAnalyticsResult,
  GraderSession,
  PieceRecord,
  WeightTrendBucket,
} from '@/services/grader/types'
import type { useGraderDashboardAnalytics } from '@/hooks/useGraderDashboardAnalytics'
import { TendenciaShiftForecastCard } from './tendencia/TendenciaShiftForecastCard'
import { TendenciaShiftComparisonCard } from './tendencia/TendenciaShiftComparisonCard'
import { TendenciaMultiSessionCard } from './tendencia/TendenciaMultiSessionCard'
import { TendenciaSensorDegradationCard } from './tendencia/TendenciaSensorDegradationCard'
import { TendenciaEarlyReactionCard } from './tendencia/TendenciaEarlyReactionCard'
import { TendenciaWeightCard } from './tendencia/TendenciaWeightCard'
import { TendenciaTimelineCard } from './tendencia/TendenciaTimelineCard'

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

type CvSignal = { cls: string; label: string; bar: string }

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
  // Timeline segundo a segundo
  pieceRecords?: PieceRecord[]
  shiftId?: string
  dateKey?: string
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
  pieceRecords,
  shiftId,
  dateKey,
}: Props) {
  if (analytics.weightTrendSeries.length === 0) {
    return (
      <Card>
        <CardContent className="py-8">
          <p className="text-sm text-muted-foreground text-center">
            Sin datos de peso por pieza. Cargue un archivo pieza-pieza con columna &quot;peso en Gr&quot;.
          </p>
        </CardContent>
      </Card>
    )
  }

  return (
    <>
      <TendenciaShiftForecastCard
        trendForecastView={trendForecastView}
        shiftProgressView={shiftProgressView}
        pointZeroWarnThreshold={pointZeroWarnThreshold}
        pointZeroCriticalThreshold={pointZeroCriticalThreshold}
        getPointZeroSeverity={getPointZeroSeverity}
      />
      <TendenciaShiftComparisonCard
        shiftComparisonView={shiftComparisonView}
        siblingSessions={siblingSessions}
      />
      <TendenciaMultiSessionCard
        multiSessionInsightsView={multiSessionInsightsView}
      />
      <TendenciaSensorDegradationCard
        sensorDegradationView={sensorDegradationView}
      />
      <TendenciaEarlyReactionCard
        pointZeroWarnThreshold={pointZeroWarnThreshold}
        pointZeroCriticalThreshold={pointZeroCriticalThreshold}
        trendWarnThreshold={trendWarnThreshold}
        trendCriticalThreshold={trendCriticalThreshold}
        showThresholds={showThresholds}
        onToggleThresholds={onToggleThresholds}
        onUpdateTrendWarnThreshold={onUpdateTrendWarnThreshold}
        onUpdateTrendCriticalThreshold={onUpdateTrendCriticalThreshold}
        onUpdatePointZeroWarnThreshold={onUpdatePointZeroWarnThreshold}
        onUpdatePointZeroCriticalThreshold={onUpdatePointZeroCriticalThreshold}
        trendAutoRecommendations={trendAutoRecommendations}
        onApplyGateAction={onApplyGateAction}
        onApplyGateSuggestion={onApplyGateSuggestion}
        trendAIRuns={trendAIRuns}
        trendAIConsistency={trendAIConsistency}
        trendAIDiffRows={trendAIDiffRows}
        aiLoading={aiLoading}
        onAnalyzeAI={onAnalyzeAI}
        showAIHistory={showAIHistory}
        onToggleAIHistory={onToggleAIHistory}
      />
      <TendenciaWeightCard
        analytics={analytics}
        config={config}
        weightTrendByTs={weightTrendByTs}
        wtStdDevTooltipProps={wtStdDevTooltipProps}
        getCvSignal={getCvSignal}
        trendForecastView={trendForecastView}
        weightChartMode={weightChartMode}
        onSetWeightChartMode={onSetWeightChartMode}
        getPointZeroSeverity={getPointZeroSeverity}
      />
      {pieceRecords && pieceRecords.length > 0 && shiftId && dateKey && (
        <TendenciaTimelineCard
          pieceRecords={pieceRecords}
          shiftId={shiftId}
          dateKey={dateKey}
        />
      )}
    </>
  )
}
