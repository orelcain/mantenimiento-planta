/**
 * Motor de sugerencias "Punto Cero" para la clasificadora Marelec MS4/12.
 *
 * Cada sugerencia es trazable: muestra QUÉ cambia, POR QUÉ, con QUÉ datos
 * y con qué nivel de confianza. El operador puede Aplicar o Ignorar.
 */

export interface PointZeroSuggestion {
  /** ID único de la sugerencia (para dedup y tracking de ignorados) */
  id: string
  /** Nombre del parámetro afectado en physicalConfig */
  parameter: string
  /** Valor actual del parámetro */
  currentValue: number | string
  /** Valor sugerido */
  suggestedValue: number | string
  /** Unidad de medida (cm, g, s, ms…) */
  unit: string
  /** Fuente del cálculo */
  source: 'fishbase' | 'historical' | 'batch' | 'geometric' | 'datasheet' | 'measurement'
  /** Etiqueta legible de la fuente */
  sourceLabel: string
  /** Explicación en lenguaje natural de por qué se sugiere el cambio */
  reasoning: string
  /** Fórmula aplicada (opcional, para el panel "🔬 Fórmula") */
  formula?: string
  /** Datos de respaldo usados en el cálculo */
  dataPoints: Array<{ label: string; value: string; detail?: string }>
  /** Nivel de confianza en la sugerencia */
  confidence: 'high' | 'medium' | 'low'
  /** Razón del nivel de confianza */
  confidenceReason: string
  /** Impacto esperado del cambio (para el panel "⚠️ Impacto") */
  impactText?: string
  /** Severidad visual */
  severity: 'info' | 'recommended' | 'warning'
  /** Aplica el cambio al physicalConfig */
  applyFn: () => void
  /** Marca la sugerencia como ignorada */
  ignoreFn?: () => void
}
