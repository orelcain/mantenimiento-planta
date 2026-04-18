import type { MatrixP0Cause } from './types'
import type { PeriodAggregate } from './graderPeriodAggregate'
import benchmarkData from '@/data/benchmarks/temporada-2025-2026.json'

export interface SeasonBenchmark {
  seasonKey: string
  totalPieces: number
  totalP0: number
  p0Pct: number
  byMatrixCause: Record<MatrixP0Cause, { pieces: number; pct: number }>
  bySpecies: Record<'COHO' | 'SALAR', { pieces: number; p0Pct: number }>
  byCalibre: Record<string, { pieces: number; p0Pct: number }>
  byShift: Record<'A' | 'B', { pieces: number; p0Pct: number }>
  byMonth: Record<string, { pieces: number; p0Pct: number }>
}

export interface BenchmarkComparison {
  overallDelta: number
  byMatrixCauseDelta: Record<MatrixP0Cause, number>
  verdict: 'better' | 'similar' | 'worse'
  /** Causa con mayor divergencia respecto al benchmark */
  strongestDivergence: MatrixP0Cause | null
}

const CAUSE_KEYS: MatrixP0Cause[] = [
  'fuera_de_rangos',
  'fuera_de_limites',
  'no_leido_fotocelula',
  'puerta_no_preparada',
  'otro',
]

export async function loadSeasonBenchmark(seasonKey: string): Promise<SeasonBenchmark | null> {
  if (seasonKey === '2025-2026') {
    return benchmarkData as SeasonBenchmark
  }
  return null
}

/**
 * Compara un período contra el benchmark de temporada.
 * overallDelta en puntos porcentuales: negativo = mejor que la temporada.
 * byMatrixCauseDelta: diferencia en participación de cada causa dentro del P0.
 */
export function compareAgainstBenchmark(
  period: PeriodAggregate,
  benchmark: SeasonBenchmark,
): BenchmarkComparison {
  const overallDelta = +(period.stats.p0PctWeighted - benchmark.p0Pct).toFixed(2)

  const byMatrixCauseDelta = {} as Record<MatrixP0Cause, number>
  for (const cause of CAUSE_KEYS) {
    const periodEntry = period.topP0Causes.find((c) => c.error === cause)
    const periodPct = periodEntry?.pct ?? 0
    const benchmarkPct = benchmark.byMatrixCause[cause]?.pct ?? 0
    byMatrixCauseDelta[cause] = +(periodPct - benchmarkPct).toFixed(2)
  }

  let verdict: 'better' | 'similar' | 'worse'
  if (overallDelta <= -0.3) verdict = 'better'
  else if (overallDelta >= 0.3) verdict = 'worse'
  else verdict = 'similar'

  const strongestDivergence = CAUSE_KEYS.reduce<MatrixP0Cause | null>((best, cause) => {
    if (!best) return cause
    return Math.abs(byMatrixCauseDelta[cause]) > Math.abs(byMatrixCauseDelta[best]) ? cause : best
  }, null)

  return { overallDelta, byMatrixCauseDelta, verdict, strongestDivergence }
}
