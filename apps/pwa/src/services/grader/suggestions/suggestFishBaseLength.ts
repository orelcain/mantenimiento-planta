import type { GraderPhysicalConfig } from '../types'
import { getGradingBeltSpeedMps } from '../graderBeltHelpers'
import type { PointZeroSuggestion } from './types'

const SPECIES_ALLOMETRY = {
  salar: { label: 'Salmón Atlántico (Salar)', a: 0.00977, b: 3.05, fishBaseId: 236 },
  coho:  { label: 'Salmón Coho',              a: 0.00933, b: 3.04, fishBaseId: 245 },
} as const

interface Params {
  physicalConfig: GraderPhysicalConfig
  medianWeightG: number | null
  medianSource: 'excel' | 'manual' | 'historical' | null
  setPhysicalConfig: (fn: (p: GraderPhysicalConfig) => GraderPhysicalConfig) => void
  ignoredIds: Set<string>
}

export function suggestFishBaseLength({
  physicalConfig,
  medianWeightG,
  medianSource,
  setPhysicalConfig,
  ignoredIds,
}: Params): PointZeroSuggestion | null {
  const id = 'fishbase-length'
  if (ignoredIds.has(id)) return null
  if (!physicalConfig.species || !medianWeightG) return null

  const { a, b, label, fishBaseId } = SPECIES_ALLOMETRY[physicalConfig.species]
  const suggestedCm = Math.round((medianWeightG / a) ** (1 / b))
  const currentCm = physicalConfig.avgSalmonLengthCm
  const diff = Math.abs(suggestedCm - currentCm)

  if (diff < 2) return null

  const confidence = medianSource === 'excel' ? 'high'
    : medianSource === 'historical' ? 'medium'
    : 'low'

  const confidenceReason = medianSource === 'excel'
    ? 'Peso mediano calculado de registros reales del Excel cargado'
    : medianSource === 'historical'
      ? 'Peso mediano del historial de turnos (Firestore)'
      : 'Peso ingresado manualmente — confirmar en planta'

  const severity = diff >= 8 ? 'warning' : 'recommended'

  return {
    id,
    parameter: 'avgSalmonLengthCm',
    currentValue: currentCm,
    suggestedValue: suggestedCm,
    unit: 'cm',
    source: 'fishbase',
    sourceLabel: `FishBase LWR — ${label}`,
    reasoning: `La relación Largo-Peso oficial de FishBase para ${label} indica que un pez de ${(medianWeightG / 1000).toFixed(2)} kg debería medir aprox. ${suggestedCm} cm. El valor configurado (${currentCm} cm) difiere en ${diff} cm, lo que afecta el cálculo del gap libre y el timing del flipper.`,
    formula: `L = (W / a)^(1/b) = (${medianWeightG} / ${a})^(1/${b}) ≈ ${suggestedCm} cm`,
    dataPoints: [
      { label: 'Peso mediano lote', value: `${medianWeightG.toLocaleString('es-CL')} g`, detail: `${(medianWeightG / 1000).toFixed(2)} kg` },
      { label: 'Especie', value: label },
      { label: 'Coef. a (FishBase)', value: String(a), detail: `FishBase ID ${fishBaseId}` },
      { label: 'Coef. b (FishBase)', value: String(b) },
      { label: 'Largo sugerido', value: `${suggestedCm} cm` },
      { label: 'Largo actual', value: `${currentCm} cm` },
    ],
    confidence,
    confidenceReason,
    impactText: `Gap libre cambia en ~${((diff / 100) * getGradingBeltSpeedMps(physicalConfig) * 60 / Math.max(1, 40)).toFixed(0)} cm. El timing del flipper también se ajusta.`,
    severity,
    applyFn: () => setPhysicalConfig((p) => ({ ...p, avgSalmonLengthCm: suggestedCm })),
  }
}
