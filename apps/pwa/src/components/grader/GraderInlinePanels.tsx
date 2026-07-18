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
        'p-3 rounded-lg border',
        insight.severity === 'critical'
          ? 'border-red-300 bg-red-50 dark:bg-red-900/10'
          : insight.severity === 'warn'
          ? 'border-amber-300 bg-amber-50 dark:bg-amber-900/10'
          : 'border-blue-200 bg-blue-50 dark:bg-blue-900/10',
      )}
    >
      <div className="flex items-center gap-2">
        <Badge
          variant={insight.severity === 'critical' ? 'destructive' : 'outline'}
          className="text-[10px]"
        >
          {insight.severity.toUpperCase()}
        </Badge>
        <span className="text-sm font-medium">{insight.title}</span>
      </div>
      <div className="mt-2 space-y-0.5">
        {insight.evidence.map((e, i) => (
          <p key={i} className="text-xs text-muted-foreground flex items-center gap-1">
            <span className="text-blue-500">📊</span> {e}
          </p>
        ))}
      </div>
      <div className="mt-2 space-y-0.5">
        {insight.recommendations.map((r, i) => (
          <p key={i} className="text-xs flex items-center gap-1">
            <span className="text-green-500">💡</span> {r}
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
      <div className="rounded-lg border border-blue-200 dark:border-blue-800 bg-blue-50/50 dark:bg-blue-900/10 p-3">
        <p className="text-[10px] font-semibold uppercase tracking-wider text-blue-600 dark:text-blue-400 mb-1.5">
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
          <p className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground mb-2">
            Causas probables
          </p>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
            {output.likelyCauses.map((c, i) => (
              <div
                key={i}
                className={cn(
                  'p-3 rounded-lg border-l-4',
                  c.confidence === 'high'
                    ? 'border-l-red-500 bg-red-50/50 dark:bg-red-900/10'
                    : c.confidence === 'medium'
                    ? 'border-l-amber-500 bg-amber-50/50 dark:bg-amber-900/10'
                    : 'border-l-blue-400 bg-muted',
                )}
              >
                <div className="flex items-center justify-between gap-2 mb-1">
                  <span className="text-sm font-semibold leading-tight">{c.cause}</span>
                  <Badge
                    variant="outline"
                    className={cn(
                      'text-[9px] shrink-0',
                      c.confidence === 'high' && 'text-red-600 border-red-300',
                      c.confidence === 'medium' && 'text-amber-600 border-amber-300',
                    )}
                  >
                    {confidenceLabel[c.confidence] || c.confidence}
                  </Badge>
                </div>
                {c.evidence.length > 0 ? (
                  <div className="space-y-0.5">
                    {c.evidence.map((e, j) => (
                      <p key={j} className="text-[11px] text-muted-foreground">{e}</p>
                    ))}
                  </div>
                ) : (
                  <p className="text-[11px] text-amber-500">Sin evidencia num&eacute;rica</p>
                )}
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Acciones recomendadas como checklist visual con prioridad */}
      {output.recommendedActions.length > 0 && (
        <div>
          <p className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground mb-2">
            Acciones recomendadas
          </p>
          <div className="space-y-1.5">
            {output.recommendedActions.map((a, i) => (
              <div
                key={i}
                className={cn(
                  'flex items-start gap-3 p-2.5 rounded-lg border',
                  a.priority === 'high'
                    ? 'border-red-200 dark:border-red-800 bg-red-50/30 dark:bg-red-900/5'
                    : a.priority === 'medium'
                    ? 'border-amber-200 dark:border-amber-800 bg-amber-50/30 dark:bg-amber-900/5'
                    : 'border-muted bg-muted',
                )}
              >
                <div
                  className={cn(
                    'flex items-center justify-center w-6 h-6 rounded-full shrink-0 text-[10px] font-bold',
                    a.priority === 'high'
                      ? 'bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-400'
                      : a.priority === 'medium'
                      ? 'bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-400'
                      : 'bg-muted text-muted-foreground',
                  )}
                >
                  {i + 1}
                </div>
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-2">
                    <span className="text-sm font-medium">{a.action}</span>
                    <Badge variant="outline" className="text-[9px] shrink-0">
                      {priorityLabel[a.priority] || a.priority}
                    </Badge>
                  </div>
                  <p className="text-[11px] text-muted-foreground mt-0.5">{a.why}</p>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Qu&eacute; verificar — card prominente con checklist */}
      {output.whatToCheckNext.length > 0 && (
        <div className="rounded-lg border-2 border-emerald-300 dark:border-emerald-700 bg-emerald-50/50 dark:bg-emerald-900/10 p-3">
          <p className="text-[10px] font-semibold uppercase tracking-wider text-emerald-600 dark:text-emerald-400 mb-2">
            Qu&eacute; verificar ahora
          </p>
          <div className="space-y-1.5">
            {output.whatToCheckNext.map((c, i) => (
              <label key={i} className="flex items-start gap-2.5 cursor-pointer group">
                <input
                  type="checkbox"
                  className="mt-1 h-4 w-4 rounded border-emerald-400 text-emerald-600 focus:ring-emerald-500 shrink-0"
                />
                <span className="text-sm group-hover:text-foreground transition-colors">{c}</span>
              </label>
            ))}
          </div>
        </div>
      )}

      {/* Advertencias */}
      {output.disclaimers && output.disclaimers.length > 0 && (
        <div className="p-2.5 bg-amber-50 dark:bg-amber-900/10 rounded-lg border border-amber-200 dark:border-amber-800">
          <p className="text-[10px] font-semibold uppercase tracking-wider text-amber-600 mb-1">Advertencias</p>
          {output.disclaimers.map((d, i) => (
            <p key={i} className="text-[11px] text-amber-700 dark:text-amber-400">{d}</p>
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
    correction: 'text-amber-600 border-amber-300',
    optimization: 'text-purple-600 border-purple-300',
    investigate: 'text-sky-600 border-sky-300',
    swap: 'text-purple-600 border-purple-300',
    reassign: 'text-blue-600 border-blue-300',
    add: 'text-green-600 border-green-300',
  }
  const typeIcons: Record<string, string> = {
    correction: '🏷️',
    optimization: '⚡',
    investigate: '🔍',
    swap: '🔄',
    reassign: '🔹',
    add: '➕',
  }

  const showArrow = suggestion.type !== 'investigate' && suggestion.currentCalibre !== suggestion.suggestedCalibre

  return (
    <div className={cn(
      'p-3 rounded-lg border',
      suggestion.impactScore >= 70 ? 'border-red-200 bg-red-50/50 dark:bg-red-900/5' :
      suggestion.impactScore >= 40 ? 'border-amber-200 bg-amber-50/50 dark:bg-amber-900/5' :
      'border-muted bg-muted',
    )}>
      <div className="flex items-center gap-2 flex-wrap">
        <Badge variant="outline" className={cn('text-[10px]', typeColors[suggestion.type])}>
          {typeIcons[suggestion.type] || ''} {typeLabels[suggestion.type] || suggestion.type}
        </Badge>
        <span className="text-sm font-medium">
          Gate {suggestion.gateNumber}: {suggestion.currentCalibre}
          {showArrow && <> → {suggestion.suggestedCalibre}</>}
        </span>
        <Badge variant={suggestion.impactScore >= 70 ? 'destructive' : 'outline'} className="text-[10px] ml-auto">
          Impacto: {suggestion.impactScore}
        </Badge>
      </div>
      <p className="text-xs text-muted-foreground mt-1">{suggestion.reason}</p>
      {suggestion.evidence.length > 0 && (
        <div className="mt-1.5 space-y-0.5">
          {suggestion.evidence.map((e, i) => (
            <p key={i} className="text-[11px] text-muted-foreground">
              {e.startsWith('⚠') ? e : `📊 ${e}`}
            </p>
          ))}
        </div>
      )}
    </div>
  )
}
