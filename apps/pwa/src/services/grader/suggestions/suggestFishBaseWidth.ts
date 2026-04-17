import type { GraderPhysicalConfig } from '../types'
import type { PointZeroSuggestion } from './types'

const SPECIES_ALLOMETRY = {
  salar: { label: 'Salmón Atlántico (Salar)', widthRatio: 0.20 },
  coho:  { label: 'Salmón Coho',              widthRatio: 0.18 },
} as const

interface Params {
  physicalConfig: GraderPhysicalConfig
  setPhysicalConfig: (fn: (p: GraderPhysicalConfig) => GraderPhysicalConfig) => void
  ignoredIds: Set<string>
}

export function suggestFishBaseWidth({
  physicalConfig,
  setPhysicalConfig,
  ignoredIds,
}: Params): PointZeroSuggestion | null {
  const id = 'fishbase-width'
  if (ignoredIds.has(id)) return null
  if (!physicalConfig.species) return null

  const { label, widthRatio } = SPECIES_ALLOMETRY[physicalConfig.species]
  const suggestedCm = Math.round(physicalConfig.avgSalmonLengthCm * widthRatio)
  const currentCm = physicalConfig.avgSalmonWidthCm ?? null

  if (currentCm !== null && Math.abs(suggestedCm - currentCm) < 1) return null

  return {
    id,
    parameter: 'avgSalmonWidthCm',
    currentValue: currentCm ?? '(no definido)',
    suggestedValue: suggestedCm,
    unit: 'cm',
    source: 'geometric',
    sourceLabel: `Ratio empírico — ${label}`,
    reasoning: `El ancho estimado para ${label} es aprox. ${(widthRatio * 100).toFixed(0)}% del largo total. Con ${physicalConfig.avgSalmonLengthCm} cm de largo, el ancho esperado es ${suggestedCm} cm. Este valor es empírico — validar midiendo en planta.`,
    formula: `Ancho = Largo × widthRatio = ${physicalConfig.avgSalmonLengthCm} cm × ${widthRatio} ≈ ${suggestedCm} cm`,
    dataPoints: [
      { label: 'Largo configurado', value: `${physicalConfig.avgSalmonLengthCm} cm` },
      { label: 'widthRatio', value: String(widthRatio), detail: 'Empírico — confirmar en planta' },
      { label: 'Ancho sugerido', value: `${suggestedCm} cm` },
      { label: 'Ancho actual', value: currentCm != null ? `${currentCm} cm` : '(no definido)' },
    ],
    confidence: 'low',
    confidenceReason: 'widthRatio es un estimado empírico (Salar ~0.20, Coho ~0.18). Medir en terreno para mayor precisión.',
    impactText: 'El ancho afecta el cálculo de si el pez puede pasar bajo el flipper sin colisionar con la paleta.',
    severity: currentCm == null ? 'recommended' : 'info',
    applyFn: () => setPhysicalConfig((p) => ({ ...p, avgSalmonWidthCm: suggestedCm })),
  }
}
