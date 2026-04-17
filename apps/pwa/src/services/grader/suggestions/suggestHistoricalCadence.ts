import type { GraderDailySummary } from '../types'
import type { PointZeroSuggestion } from './types'

const MIN_SUMMARIES = 10

interface Params {
  summaries: GraderDailySummary[]
  currentCadence: number | null
  ignoredIds: Set<string>
}

export function suggestHistoricalCadence({
  summaries,
  currentCadence,
  ignoredIds,
}: Params): PointZeroSuggestion | null {
  const id = 'historical-cadence'
  if (ignoredIds.has(id)) return null

  // Necesitamos al menos MIN_SUMMARIES turnos con datos de throughput
  const withRate = summaries.filter(
    (s) => typeof s.productionRatePerHour === 'number' && s.productionRatePerHour > 0,
  )
  if (withRate.length < MIN_SUMMARIES) return null

  // Promedio de cadencia (pz/min) de los últimos turnos
  const rates = withRate.map((s) => s.productionRatePerHour! / 60)
  rates.sort((a, b) => a - b)
  const median = rates[Math.floor(rates.length / 2)]!
  const avg = rates.reduce((s, v) => s + v, 0) / rates.length
  // Percentil 90 = pico sostenido típico
  const p90 = rates[Math.floor(rates.length * 0.9)]!

  if (currentCadence == null) return null

  // Solo sugiere si la cadencia actual difiere del histórico en > 10%
  const diffPct = Math.abs(currentCadence - avg) / avg
  if (diffPct < 0.10) return null

  const confidence = withRate.length >= 20 ? 'high' : 'medium'
  const severity = diffPct > 0.25 ? 'recommended' : 'info'

  return {
    id,
    parameter: 'cadenciaEsperada',
    currentValue: `${currentCadence.toFixed(0)} pz/min`,
    suggestedValue: `${avg.toFixed(0)} pz/min (histórico)`,
    unit: 'pz/min',
    source: 'historical',
    sourceLabel: `Histórico ${withRate.length} turnos`,
    reasoning: `La cadencia usada actualmente (${currentCadence.toFixed(0)} pz/min) difiere un ${(diffPct * 100).toFixed(0)}% del promedio histórico de ${withRate.length} turnos (${avg.toFixed(0)} pz/min). Esto afecta el cálculo del gap libre y el análisis de pockets.`,
    formula: `avg = Σ(pz/min) / n = ${avg.toFixed(1)} pz/min  |  mediana = ${median.toFixed(1)}  |  p90 = ${p90.toFixed(1)}`,
    dataPoints: [
      { label: 'Turnos analizados', value: String(withRate.length) },
      { label: 'Cadencia promedio', value: `${avg.toFixed(1)} pz/min` },
      { label: 'Cadencia mediana', value: `${median.toFixed(1)} pz/min` },
      { label: 'Pico p90', value: `${p90.toFixed(1)} pz/min` },
      { label: 'Diferencia vs actual', value: `${(diffPct * 100).toFixed(0)}%` },
    ],
    confidence,
    confidenceReason: `Basado en ${withRate.length} turnos con datos reales de throughput.`,
    impactText: 'El gap libre calculado cambia con la cadencia. Una cadencia más precisa mejora el análisis de riesgo de solapamiento.',
    severity,
    applyFn: () => { /* La cadencia no es un campo editable — informativo */ },
  }
}
