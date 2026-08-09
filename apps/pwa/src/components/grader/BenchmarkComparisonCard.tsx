import { TrendingUp, TrendingDown, Minus, BarChart2 } from 'lucide-react'
import { cn } from '@/lib/utils'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui'
import { MATRIX_P0_CAUSES } from '@/services/grader/graderMatrixP0Causes'
import type { MatrixP0Cause } from '@/services/grader/types'
import type { PeriodAggregate } from '@/services/grader/graderPeriodAggregate'
import type { SeasonBenchmark, BenchmarkComparison } from '@/services/grader/graderBenchmarks'

interface Props {
  period: PeriodAggregate
  benchmark: SeasonBenchmark
  comparison: BenchmarkComparison
}

const CAUSE_KEYS: MatrixP0Cause[] = [
  'fuera_de_limites',
  'no_leido_fotocelula',
  'too_close_too_long',
  'puerta_no_preparada',
  'fuera_de_calibre',
  'fuera_de_calidad',
  'fuera_de_conservacion',
  'fuera_de_producto',
  'otro',
]

const VERDICT_CONFIG = {
  better: {
    label: 'Mejor que la temporada',
    Icon: TrendingDown,
    color: 'text-emerald-600',
    bg: 'bg-emerald-500/[0.08] border-emerald-200 dark:border-emerald-800',
  },
  similar: {
    label: 'Similar a la temporada',
    Icon: Minus,
    color: 'text-amber-600',
    bg: 'bg-amber-500/[0.08] border-amber-200 dark:border-amber-800',
  },
  worse: {
    label: 'Por encima del histórico',
    Icon: TrendingUp,
    color: 'text-red-600',
    bg: 'bg-red-500/[0.08] border-red-200 dark:border-red-800',
  },
}

const DOT_COLOR: Record<string, string> = {
  red: 'bg-red-500',
  orange: 'bg-orange-500',
  purple: 'bg-purple-500',
  cyan: 'bg-cyan-500',
  emerald: 'bg-emerald-500',
  amber: 'bg-amber-500',
  brown: 'bg-amber-800',
  blue: 'bg-blue-500',
  zinc: 'bg-zinc-400',
}

export function BenchmarkComparisonCard({ period, benchmark, comparison }: Props) {
  const { overallDelta, verdict, byMatrixCauseDelta } = comparison
  const { label, Icon, color, bg } = VERDICT_CONFIG[verdict]

  return (
    <Card>
      <CardHeader className="pb-2">
        <CardTitle className="text-sm font-medium flex items-center gap-2">
          <BarChart2 className="h-4 w-4 text-muted-foreground" />
          Comparativa vs. temporada {benchmark.seasonKey}
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        {/* Veredicto global */}
        <div className={cn('flex items-start gap-3 p-3 rounded-card border', bg)}>
          <Icon className={cn('h-5 w-5 shrink-0 mt-0.5', color)} />
          <div className="space-y-0.5">
            <p className={cn('font-semibold text-sm', color)}>{label}</p>
            <p className="text-xs text-muted-foreground">
              {'P0% período: '}
              <span className="font-mono font-medium">
                {period.stats.p0PctWeighted.toFixed(2)}%
              </span>
              {'  ·  base temporada: '}
              <span className="font-mono font-medium">{benchmark.p0Pct.toFixed(2)}%</span>
              {'  '}
              <span
                className={cn(
                  'font-mono font-medium',
                  overallDelta < 0
                    ? 'text-emerald-600'
                    : overallDelta > 0
                      ? 'text-red-600'
                      : 'text-muted-foreground',
                )}
              >
                ({overallDelta >= 0 ? '+' : ''}{overallDelta.toFixed(2)} pp)
              </span>
            </p>
          </div>
        </div>

        {/* Divergencia por causa */}
        <div className="space-y-2">
          <p className="text-[10px] font-medium text-muted-foreground uppercase tracking-wide">
            Participación por causa en el P0
          </p>
          {CAUSE_KEYS.map((cause) => {
            const def = MATRIX_P0_CAUSES[cause]
            const delta = byMatrixCauseDelta[cause]
            const periodEntry = period.topP0Causes.find((c) => c.error === cause)
            const periodPct = periodEntry?.pct ?? 0

            return (
              <div key={cause} className="flex items-center gap-2 text-xs">
                <div className={cn('w-2 h-2 rounded-full shrink-0', DOT_COLOR[def.color])} />
                <span className="w-36 truncate text-muted-foreground" title={def.label}>{def.label}</span>
                <div className="flex-1 h-1.5 bg-muted rounded-full overflow-hidden">
                  <div
                    className="h-full bg-primary/60 rounded-full transition-all"
                    style={{ width: `${Math.min(periodPct, 100)}%` }}
                  />
                </div>
                <span className="w-10 text-right font-mono">{periodPct.toFixed(1)}%</span>
                <span
                  className={cn(
                    'w-16 text-right font-mono',
                    delta < -2
                      ? 'text-emerald-600'
                      : delta > 2
                        ? 'text-red-600'
                        : 'text-muted-foreground',
                  )}
                >
                  {delta >= 0 ? '+' : ''}
                  {delta.toFixed(1)} pp
                </span>
              </div>
            )
          })}
          <p className="text-[10px] text-muted-foreground pt-1">
            Base temporada: {benchmark.totalPieces.toLocaleString('es-CL')} pp ·{' '}
            {benchmark.totalP0.toLocaleString('es-CL')} P0
          </p>
        </div>
      </CardContent>
    </Card>
  )
}
