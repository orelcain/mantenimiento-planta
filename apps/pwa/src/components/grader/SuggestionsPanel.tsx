import { cn } from '@/lib/utils'
import type { PointZeroSuggestion } from '@/services/grader/suggestions/types'
import { SuggestionCard } from './SuggestionCard'

interface Props {
  suggestions: PointZeroSuggestion[]
}

export function SuggestionsPanel({ suggestions }: Props) {
  if (suggestions.length === 0) return null

  const warnings     = suggestions.filter((s) => s.severity === 'warning')
  const recommended  = suggestions.filter((s) => s.severity === 'recommended')
  const info         = suggestions.filter((s) => s.severity === 'info')
  const ordered      = [...warnings, ...recommended, ...info]

  const countLabel = warnings.length > 0
    ? `${warnings.length} alerta${warnings.length > 1 ? 's' : ''}`
    : `${suggestions.length} sugerencia${suggestions.length > 1 ? 's' : ''}`

  const headerColor = warnings.length > 0 ? 'text-red-400' : 'text-amber-400'

  return (
    <div className="space-y-2">
      {/* Header */}
      <div className="flex items-center gap-2">
        <span className={cn('text-xs font-semibold', headerColor)}>
          🧠 Sugerencias del punto cero
        </span>
        <span className={cn(
          'text-[10px] px-2 py-0.5 rounded-full font-medium',
          warnings.length > 0
            ? 'bg-red-500/[0.08] text-red-600'
            : 'bg-amber-500/[0.08] text-amber-400',
        )}>
          {countLabel}
        </span>
        <span className="text-[10px] text-muted-foreground/60">· click para expandir</span>
      </div>

      {/* Cards */}
      <div className="space-y-1.5">
        {ordered.map((s) => (
          <SuggestionCard key={s.id} suggestion={s} />
        ))}
      </div>
    </div>
  )
}
