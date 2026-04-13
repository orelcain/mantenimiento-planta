/**
 * Tab "Punto Cero" del Dashboard del Grader.
 * Extraído de AnalisisGraderDashboardPage.tsx en la iter 4 de refactor 2026-04-10.
 *
 * Refactor iter 19 (P1.8): dividido en 5 sub-cards bajo `tabs/puntocero/`.
 * De 1157 líneas a ~80 líneas (orquestador puro).
 */
import type { ChartData } from 'chart.js'
import type { GraderAnalyticsResult, GraderAnalysisConfig } from '@/services/grader/types'
import type { PatternCauseTrendView } from '@/hooks/useGraderPatternAnalytics'
import { PuntoCeroClasificacionCard } from './puntocero/PuntoCeroClasificacionCard'
import { PuntoCeroPatronesCard } from './puntocero/PuntoCeroPatronesCard'
import { PuntoCeroPivoteCard } from './puntocero/PuntoCeroPivoteCard'
import { PuntoCeroFueraRangoCard } from './puntocero/PuntoCeroFueraRangoCard'
import { PuntoCeroSerieTemporalCard } from './puntocero/PuntoCeroSerieTemporalCard'

// ─── Tipos pattern (shape exacto del padre) ─────────────────────────────
type PatternRow = { key: string; pieces: number; pct: number }
type PatternHourRow = { key: string; hour: string; rangeLabel: string; pieces: number; pct: number }
type PatternIntervalDetail = {
  calibres: Array<{ key: string; pieces: number }>
  qualities: Array<{ key: string; pieces: number }>
}

// ─── Props del componente ──────────────────────────────────────────────────

interface Props {
  analytics: GraderAnalyticsResult
  kpis: GraderAnalyticsResult['kpis']
  config: GraderAnalysisConfig
  // Memos derivados calculados en el padre (compartidos con export JSON)
  patternByCalibre: PatternRow[]
  patternByQuality: PatternRow[]
  patternByHour: PatternHourRow[]
  patternTotalPieces: number
  patternCalibreChartData: ChartData<'bar'>
  patternQualityChartData: ChartData<'bar'>
  patternHourChartData: ChartData<'line'>
  patternCauseTrend: PatternCauseTrendView
  patternCauseTrendChartData: ChartData<'line'>
  patternIntervalDetailsByLabel: Map<string, PatternIntervalDetail>
  // Estados compartidos con export JSON (viven en el padre)
  selectedCauseLabel: string | null
  onSelectedCauseLabelChange: (value: string | null) => void
  timeFilterFrom: string
  onTimeFilterFromChange: (value: string) => void
  timeFilterTo: string
  onTimeFilterToChange: (value: string) => void
  patternIntervalMinutes: number
  onPatternIntervalMinutesChange: (value: number) => void
}

// ─── Componente ────────────────────────────────────────────────────────────

export function GraderPuntoCeroTab({
  analytics,
  kpis,
  config,
  patternByCalibre,
  patternByQuality,
  patternByHour,
  patternTotalPieces,
  patternCalibreChartData,
  patternQualityChartData,
  patternHourChartData,
  patternCauseTrend,
  patternCauseTrendChartData,
  patternIntervalDetailsByLabel,
  selectedCauseLabel,
  onSelectedCauseLabelChange,
  timeFilterFrom,
  onTimeFilterFromChange,
  timeFilterTo,
  onTimeFilterToChange,
  patternIntervalMinutes,
  onPatternIntervalMinutesChange,
}: Props) {
  return (
    <>
      <PuntoCeroClasificacionCard
        analytics={analytics}
        kpis={kpis}
        selectedCauseLabel={selectedCauseLabel}
        onSelectedCauseLabelChange={onSelectedCauseLabelChange}
      />
      <PuntoCeroPatronesCard
        analytics={analytics}
        patternByCalibre={patternByCalibre}
        patternByQuality={patternByQuality}
        patternByHour={patternByHour}
        patternTotalPieces={patternTotalPieces}
        patternCalibreChartData={patternCalibreChartData}
        patternQualityChartData={patternQualityChartData}
        patternHourChartData={patternHourChartData}
        patternCauseTrend={patternCauseTrend}
        patternCauseTrendChartData={patternCauseTrendChartData}
        patternIntervalDetailsByLabel={patternIntervalDetailsByLabel}
        selectedCauseLabel={selectedCauseLabel}
        onSelectedCauseLabelChange={onSelectedCauseLabelChange}
        timeFilterFrom={timeFilterFrom}
        onTimeFilterFromChange={onTimeFilterFromChange}
        timeFilterTo={timeFilterTo}
        onTimeFilterToChange={onTimeFilterToChange}
        patternIntervalMinutes={patternIntervalMinutes}
        onPatternIntervalMinutesChange={onPatternIntervalMinutesChange}
      />
      <PuntoCeroPivoteCard analytics={analytics} />
      <PuntoCeroFueraRangoCard analytics={analytics} />
      <PuntoCeroSerieTemporalCard analytics={analytics} config={config} />
    </>
  )
}
