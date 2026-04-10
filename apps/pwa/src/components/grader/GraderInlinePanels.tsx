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
  return (
    <div className="space-y-4">
      {/* Summary */}
      <div>
        <h4 className="text-sm font-medium mb-2">Resumen</h4>
        <ul className="space-y-1">
          {output.summaryBullets.map((b, i) => (
            <li key={i} className="text-sm text-muted-foreground flex gap-2">
              <span className="shrink-0">•</span>
              {b}
            </li>
          ))}
        </ul>
      </div>

      {/* Causes */}
      {output.likelyCauses.length > 0 && (
        <div>
          <h4 className="text-sm font-medium mb-2">Causas Probables</h4>
          <div className="space-y-2">
            {output.likelyCauses.map((c, i) => (
              <div key={i} className="p-2 rounded-lg bg-muted/50">
                <div className="flex items-center gap-2">
                  <Badge
                    variant="outline"
                    className={cn(
                      'text-[10px]',
                      c.confidence === 'high' && 'text-red-600',
                      c.confidence === 'medium' && 'text-amber-600',
                    )}
                  >
                    {c.confidence}
                  </Badge>
                  <span className="text-sm font-medium">{c.cause}</span>
                </div>
                {c.evidence.length > 0 ? (
                  <div className="mt-1 space-y-0.5">
                    {c.evidence.map((e, j) => (
                      <p key={j} className="text-xs text-muted-foreground ml-4">📊 {e}</p>
                    ))}
                  </div>
                ) : (
                  <p className="text-xs text-amber-500 mt-1 ml-4">
                    ⚠ Sin evidencia numérica
                  </p>
                )}
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Recommended Actions */}
      {output.recommendedActions.length > 0 && (
        <div>
          <h4 className="text-sm font-medium mb-2">Acciones Recomendadas</h4>
          <div className="space-y-2">
            {output.recommendedActions.map((a, i) => (
              <div key={i} className="flex items-start gap-2 text-sm">
                <Badge
                  variant="outline"
                  className={cn(
                    'text-[10px] mt-0.5',
                    a.priority === 'high' && 'text-red-600 border-red-300',
                    a.priority === 'medium' && 'text-amber-600 border-amber-300',
                  )}
                >
                  {a.priority}
                </Badge>
                <div>
                  <span className="font-medium">{a.action}</span>
                  <p className="text-xs text-muted-foreground">{a.why}</p>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Checklist */}
      {output.whatToCheckNext.length > 0 && (
        <div>
          <h4 className="text-sm font-medium mb-2">Qué Verificar</h4>
          <ul className="space-y-1">
            {output.whatToCheckNext.map((c, i) => (
              <li key={i} className="text-sm text-muted-foreground flex gap-2">
                <span>☐</span> {c}
              </li>
            ))}
          </ul>
        </div>
      )}

      {/* Disclaimers */}
      {output.disclaimers && output.disclaimers.length > 0 && (
        <div className="p-2 bg-amber-50 dark:bg-amber-900/10 rounded-lg">
          <p className="text-xs font-medium text-amber-700 mb-1">Advertencias:</p>
          {output.disclaimers.map((d, i) => (
            <p key={i} className="text-xs text-amber-600">{d}</p>
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
      'border-muted bg-muted/20',
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
