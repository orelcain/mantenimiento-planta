/**
 * Tab "Sugerencias" (Diagnóstico): insights determinísticos + panel IA.
 * Extraído en la iter 3 de refactor 2026-04-10.
 */
import { Card, CardContent, CardHeader, CardTitle, Button, InfoTooltip } from '@/components/ui'
import { Zap, Brain, Loader2, XCircle } from 'lucide-react'
import { getTooltipProps } from '@/services/grader/graderTooltips'
import { InsightCard, AIOutputPanel } from '@/components/grader/GraderInlinePanels'
import type { DeterministicInsight, AIGraderOutput } from '@/services/grader/types'

interface Props {
  insights: DeterministicInsight[]
  aiLoading: boolean
  aiOutput: AIGraderOutput | null
  aiError: string | null
  aiRawText: string | null
  onAnalyzeAI: () => void
}

export function GraderSugerenciasTab({
  insights,
  aiLoading,
  aiOutput,
  aiError,
  aiRawText,
  onAnalyzeAI,
}: Props) {
  return (
    <>
      {/* Deterministic insights */}
      <Card>
        <CardHeader>
          <CardTitle className="text-sm flex items-center gap-2">
            <Zap className="h-4 w-4" />
            Alertas Automáticas ({insights.length})
            <InfoTooltip {...getTooltipProps('insights.deterministic')} />
          </CardTitle>
          <p className="text-xs text-muted-foreground">
            Alertas generadas por reglas estadísticas sobre los datos cargados
          </p>
        </CardHeader>
        <CardContent className="space-y-3">
          {insights.length === 0 && (
            <p className="text-sm text-muted-foreground text-center py-4">
              No se detectaron alertas con los umbrales actuales.
            </p>
          )}
          {insights.map((ins) => (
            <InsightCard key={ins.id} insight={ins} />
          ))}
        </CardContent>
      </Card>

      {/* AI Panel */}
      <Card>
        <CardHeader className="flex flex-row items-center justify-between">
          <div>
            <CardTitle className="text-sm flex items-center gap-2">
              <Brain className="h-4 w-4" />
              Diagnóstico IA (Groq)
              <InfoTooltip {...getTooltipProps('insights.ai')} />
            </CardTitle>
            <p className="text-xs text-muted-foreground mt-1">
              Análisis profundo con inteligencia artificial: causas raíz, correlaciones y plan de acción
            </p>
          </div>
          <Button
            size="sm"
            onClick={onAnalyzeAI}
            disabled={aiLoading}
          >
            {aiLoading ? (
              <Loader2 className="h-4 w-4 animate-spin mr-1" />
            ) : (
              <Brain className="h-4 w-4 mr-1" />
            )}
            {aiLoading ? 'Analizando...' : 'Analizar con IA'}
          </Button>
        </CardHeader>
        <CardContent>
          {!aiOutput && !aiError && !aiLoading && (
            <p className="text-sm text-muted-foreground text-center py-6">
              Presiona "Analizar con IA" para obtener un diagnóstico basado en los datos cargados.
            </p>
          )}

          {aiError && (
            <div className="p-3 rounded-lg bg-red-50 dark:bg-red-900/10 border border-red-300 text-sm">
              <div className="flex items-center gap-2 text-red-600">
                <XCircle className="h-4 w-4" />
                <span className="font-medium">Error de parseo IA</span>
              </div>
              <p className="mt-1 text-xs text-red-500">{aiError}</p>
              {aiRawText && (
                <pre className="mt-2 p-2 bg-muted rounded text-xs overflow-auto max-h-40">
                  {aiRawText}
                </pre>
              )}
            </div>
          )}

          {aiOutput && <AIOutputPanel output={aiOutput} />}
        </CardContent>
      </Card>
    </>
  )
}
