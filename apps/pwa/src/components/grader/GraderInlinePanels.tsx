/**
 * Componentes presentacionales del Dashboard del Grader.
 * Extraídos de AnalisisGraderDashboardPage.tsx en la iteración de refactor 2026-04-10
 * para reducir el tamaño del componente principal.
 *
 * - InsightCard: tarjeta de insight determinístico (severidad + evidencia + recomendaciones)
 * - AIOutputPanel: panel de resultados de análisis IA (resumen + causas + acciones + checklist)
 * - SwapSuggestionCard: tarjeta de sugerencia de intercambio de gates
 */
import { Badge } from '@/components/ui'
import { Tag, Zap, Search, RefreshCw, MoveRight, Plus, BarChart3, Lightbulb } from 'lucide-react'
import type { LucideIcon } from 'lucide-react'
import { cn } from '@/lib/utils'
import type {
  DeterministicInsight,
  AIGraderOutput,
  GateSwapSuggestion,
} from '@/services/grader/types'

export function InsightCard({ insight }: { insight: DeterministicInsight }) {
  return (
    <div
      className={cn(
        'p-3 rounded-card border',
        insight.severity === 'critical'
          ? 'border-red-500/[0.25] bg-red-500/[0.15]'
          : insight.severity === 'warn'
          ? 'border-amber-500/[0.25] bg-amber-500/[0.15]'
          : 'border-blue-500/[0.25] bg-primary/[0.15]',
      )}
    >
      <div className="flex items-center gap-2">
        <Badge
          variant={insight.severity === 'critical' ? 'destructive' : 'outline'}
          className="text-caption"
        >
          {insight.severity.toUpperCase()}
        </Badge>
        <span className="text-sm font-medium">{insight.title}</span>
      </div>
      <div className="mt-2 space-y-0.5">
        {insight.evidence.map((e, i) => (
          <p key={i} className="text-xs text-muted-foreground flex items-center gap-1">
            <BarChart3 className="inline size-3.5 text-ink-info" /> {e}
          </p>
        ))}
      </div>
      <div className="mt-2 space-y-0.5">
        {insight.recommendations.map((r, i) => (
          <p key={i} className="text-xs flex items-center gap-1">
            <Lightbulb className="inline size-3.5 text-ink-ok" /> {r}
          </p>
        ))}
      </div>
    </div>
  )
}

export function AIOutputPanel({ output }: { output: AIGraderOutput }) {
  const confidenceLabel: Record<string, string> = { high: 'Alta', medium: 'Media', low: 'Baja' }
  const priorityLabel: Record<string, string> = { high: 'Alta', medium: 'Media', low: 'Baja' }

  return (
    <div className="space-y-4">
      {/* Resumen compacto en card destacada */}
      <div className="rounded-card border border-blue-500/[0.25] bg-primary/[0.15] p-3">
        <p className="text-caption font-semibold tracking-wider text-primary mb-1.5">
          Resumen del an&aacute;lisis
        </p>
        <ul className="space-y-1">
          {output.summaryBullets.map((b, i) => (
            <li key={i} className="text-sm flex gap-2">
              <span className="text-blue-500 shrink-0 mt-0.5">&#8226;</span>
              <span>{b}</span>
            </li>
          ))}
        </ul>
      </div>

      {/* Causas probables en grid 2 cols */}
      {output.likelyCauses.length > 0 && (
        <div>
          <p className="text-caption font-semibold tracking-wider text-muted-foreground mb-2">
            Causas probables
          </p>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
            {output.likelyCauses.map((c, i) => (
              <div
                key={i}
                className={cn(
                  'p-3 rounded-card border-l-4',
                  c.confidence === 'high'
                    ? 'border-l-red-500 bg-red-500/[0.15]'
                    : c.confidence === 'medium'
                    ? 'border-l-amber-500 bg-amber-500/[0.15]'
                    : 'border-l-blue-400 bg-muted',
                )}
              >
                <div className="flex items-center justify-between gap-2 mb-1">
                  <span className="text-sm font-semibold leading-tight">{c.cause}</span>
                  <Badge
                    variant="outline"
                    className={cn(
                      'text-caption shrink-0',
                      c.confidence === 'high' && 'text-ink-crit border-red-500/[0.25]',
                      c.confidence === 'medium' && 'text-ink-warn border-amber-500/[0.25]',
                    )}
                  >
                    {confidenceLabel[c.confidence] || c.confidence}
                  </Badge>
                </div>
                {c.evidence.length > 0 ? (
                  <div className="space-y-0.5">
                    {c.evidence.map((e, j) => (
                      <p key={j} className="text-caption text-muted-foreground">{e}</p>
                    ))}
                  </div>
                ) : (
                  <p className="text-caption text-amber-500">Sin evidencia num&eacute;rica</p>
                )}
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Acciones recomendadas como checklist visual con prioridad */}
      {output.recommendedActions.length > 0 && (
        <div>
          <p className="text-caption font-semibold tracking-wider text-muted-foreground mb-2">
            Acciones recomendadas
          </p>
          <div className="space-y-1.5">
            {output.recommendedActions.map((a, i) => (
              <div
                key={i}
                className={cn(
                  'flex items-start gap-3 p-2.5 rounded-card border',
                  a.priority === 'high'
                    ? 'border-red-500/[0.25] bg-red-500/[0.15]'
                    : a.priority === 'medium'
                    ? 'border-amber-500/[0.25] bg-amber-500/[0.15]'
                    : 'border-muted bg-muted',
                )}
              >
                <div
                  className={cn(
                    'flex items-center justify-center w-6 h-6 rounded-full shrink-0 text-caption font-bold',
                    a.priority === 'high'
                      ? 'bg-red-500/[0.15] text-ink-crit'
                      : a.priority === 'medium'
                      ? 'bg-amber-500/[0.15] text-ink-warn'
                      : 'bg-muted text-muted-foreground',
                  )}
                >
                  {i + 1}
                </div>
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-2">
                    <span className="text-sm font-medium">{a.action}</span>
                    <Badge variant="outline" className="text-caption shrink-0">
                      {priorityLabel[a.priority] || a.priority}
                    </Badge>
                  </div>
                  <p className="text-caption text-muted-foreground mt-0.5">{a.why}</p>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Qu&eacute; verificar — card prominente con checklist */}
      {output.whatToCheckNext.length > 0 && (
        <div className="rounded-card border-2 border-emerald-500/[0.25] bg-emerald-500/[0.15] p-3">
          <p className="text-caption font-semibold tracking-wider text-ink-ok mb-2">
            Qu&eacute; verificar ahora
          </p>
          <div className="space-y-1.5">
            {output.whatToCheckNext.map((c, i) => (
              <label key={i} className="flex items-start gap-2.5 cursor-pointer group">
                <input
                  type="checkbox"
                  className="mt-1 h-4 w-4 rounded-ctl border-emerald-400 text-ink-ok focus:ring-emerald-500 shrink-0"
                />
                <span className="text-sm group-hover:text-foreground transition-colors">{c}</span>
              </label>
            ))}
          </div>
        </div>
      )}

      {/* Advertencias */}
      {output.disclaimers && output.disclaimers.length > 0 && (
        <div className="p-2.5 bg-amber-500/[0.15] rounded-card dark:border-amber-500/[0.25]">
          <p className="text-caption font-semibold tracking-wider text-ink-warn mb-1">Advertencias</p>
          {output.disclaimers.map((d, i) => (
            <p key={i} className="text-caption text-ink-warn">{d}</p>
          ))}
        </div>
      )}
    </div>
  )
}

export function SwapSuggestionCard({ suggestion }: { suggestion: GateSwapSuggestion }) {
  const typeLabels: Record<string, string> = {
    correction: 'Corrección',
    optimization: 'Optimización',
    investigate: 'Investigar',
    swap: 'Intercambiar',
    reassign: 'Reasignar',
    add: 'Agregar',
  }
  const typeColors: Record<string, string> = {
    correction: 'text-ink-warn border-amber-500/[0.25]',
    optimization: 'text-cat-6-ink border-cat-6-tint',
    investigate: 'text-ink-info border-blue-500/[0.25]',
    swap: 'text-cat-6-ink border-cat-6-tint',
    reassign: 'text-blue-600 border-blue-500/[0.25]',
    add: 'text-ink-ok border-emerald-500/[0.25]',
  }
  /** Ícono por tipo de sugerencia: componente, no emoji (§17). */
  const typeIcons: Record<string, LucideIcon> = {
    correction: Tag,
    optimization: Zap,
    investigate: Search,
    swap: RefreshCw,
    reassign: MoveRight,
    add: Plus,
  }

  const showArrow = suggestion.type !== 'investigate' && suggestion.currentCalibre !== suggestion.suggestedCalibre

  return (
    <div className={cn(
      'p-3 rounded-card border',
      suggestion.impactScore >= 70 ? 'border-red-500/[0.25] bg-red-500/[0.15]' :
      suggestion.impactScore >= 40 ? 'border-amber-500/[0.25] bg-amber-500/[0.15]' :
      'border-muted bg-muted',
    )}>
      <div className="flex items-center gap-2 flex-wrap">
        <Badge variant="outline" className={cn('text-caption', typeColors[suggestion.type])}>
          {(() => { const I = typeIcons[suggestion.type]; return I ? <I className="inline size-3.5" /> : null })()} {typeLabels[suggestion.type] || suggestion.type}
        </Badge>
        <span className="text-sm font-medium">
          Gate {suggestion.gateNumber}: {suggestion.currentCalibre}
          {showArrow && <> → {suggestion.suggestedCalibre}</>}
        </span>
        <Badge variant={suggestion.impactScore >= 70 ? 'destructive' : 'outline'} className="text-caption ml-auto">
          Impacto: {suggestion.impactScore}
        </Badge>
      </div>
      <p className="text-xs text-muted-foreground mt-1">{suggestion.reason}</p>
      {suggestion.evidence.length > 0 && (
        <div className="mt-1.5 space-y-0.5">
          {suggestion.evidence.map((e, i) => (
            <p key={i} className="text-caption text-muted-foreground">
              {e}
            </p>
          ))}
        </div>
      )}
    </div>
  )
}
