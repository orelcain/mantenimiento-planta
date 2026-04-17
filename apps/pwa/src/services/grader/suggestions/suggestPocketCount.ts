import type { GraderPhysicalConfig } from '../types'
import type { PointZeroSuggestion } from './types'

interface Params {
  physicalConfig: GraderPhysicalConfig
  lengthToSpacingRatio: number
  overlapping: boolean
  cadencePiecesPerMin: number
  cadenceSource: 'excel' | 'historical' | 'theoretical'
  setPhysicalConfig: (fn: (p: GraderPhysicalConfig) => GraderPhysicalConfig) => void
  ignoredIds: Set<string>
}

export function suggestPocketCount({
  physicalConfig,
  lengthToSpacingRatio,
  overlapping,
  cadencePiecesPerMin,
  cadenceSource,
  setPhysicalConfig,
  ignoredIds,
}: Params): PointZeroSuggestion | null {
  const currentCount = physicalConfig.pocketCount
  const speedMps = physicalConfig.belts.find((b) => b.beltId === 'main')?.speedMps ?? 0.7
  const salmonLengthM = physicalConfig.avgSalmonLengthCm / 100

  // Caso 1: solapamiento → sugerir menos pockets si hay ≥ 3
  if (overlapping && currentCount >= 3) {
    const id = 'pocket-count-overlap'
    if (ignoredIds.has(id)) return null
    const suggested = currentCount - 1
    const cadenceAlt = cadencePiecesPerMin * (suggested / currentCount)
    const spacingAlt = speedMps * (60 / cadenceAlt)
    const gapAlt = Math.max(0, spacingAlt - salmonLengthM)
    return {
      id,
      parameter: 'pocketCount',
      currentValue: currentCount,
      suggestedValue: suggested,
      unit: 'pockets',
      source: 'batch',
      sourceLabel: `Análisis de flujo — ${cadenceSource}`,
      reasoning: `Con ${currentCount} pockets activos y la cadencia actual (${cadencePiecesPerMin.toFixed(0)} pz/min), los peces se solapan en la cinta (ratio ${lengthToSpacingRatio.toFixed(2)} ≥ 1.0). Reducir a ${suggested} pockets baja la cadencia y crea un gap libre de ~${(gapAlt * 100).toFixed(0)} cm.`,
      dataPoints: [
        { label: 'Ratio pez/paso actual', value: lengthToSpacingRatio.toFixed(2), detail: '≥ 1.0 = solapamiento' },
        { label: 'Cadencia actual', value: `${cadencePiecesPerMin.toFixed(0)} pz/min`, detail: cadenceSource },
        { label: `Gap libre con ${suggested} pockets`, value: `${(gapAlt * 100).toFixed(0)} cm` },
        { label: `Cadencia con ${suggested} pockets`, value: `${cadenceAlt.toFixed(0)} pz/min` },
      ],
      confidence: cadenceSource === 'excel' ? 'high' : cadenceSource === 'historical' ? 'medium' : 'low',
      confidenceReason: cadenceSource === 'theoretical' ? 'Cadencia teórica — cargar Excel o seleccionar turno para mayor precisión.' : `Cadencia ${cadenceSource} usada.`,
      impactText: `Producción baja ~${(((currentCount - suggested) / currentCount) * 100).toFixed(0)}%, pero se eliminan los falsos "fuera de límites" que pierde la fotocélula al ver dos peces como uno.`,
      severity: 'warning',
      applyFn: () => setPhysicalConfig((p) => ({ ...p, pocketCount: suggested })),
    }
  }

  // Caso 2: gap estrecho pero no solapamiento → sugerir menos pockets (advertencia)
  if (!overlapping && lengthToSpacingRatio > 0.7 && currentCount >= 3) {
    const id = 'pocket-count-tight'
    if (ignoredIds.has(id)) return null
    const suggested = currentCount - 1
    const cadenceAlt = cadencePiecesPerMin * (suggested / currentCount)
    const spacingAlt = speedMps * (60 / cadenceAlt)
    const gapAlt = Math.max(0, spacingAlt - salmonLengthM)
    return {
      id,
      parameter: 'pocketCount',
      currentValue: currentCount,
      suggestedValue: suggested,
      unit: 'pockets',
      source: 'batch',
      sourceLabel: `Análisis de flujo — ${cadenceSource}`,
      reasoning: `El pez ocupa el ${(lengthToSpacingRatio * 100).toFixed(0)}% del paso entre peces consecutivos (ratio ${lengthToSpacingRatio.toFixed(2)}). El margen operativo es estrecho: cualquier variación en velocidad o cadencia puede provocar solapamientos. Con ${suggested} pockets el gap libre sube a ~${(gapAlt * 100).toFixed(0)} cm.`,
      dataPoints: [
        { label: 'Ratio pez/paso', value: lengthToSpacingRatio.toFixed(2), detail: '> 0.7 = margen estrecho' },
        { label: `Gap con ${suggested} pockets`, value: `${(gapAlt * 100).toFixed(0)} cm` },
      ],
      confidence: cadenceSource === 'excel' ? 'high' : 'medium',
      confidenceReason: 'Basado en la cadencia observada. Ratio > 0.7 indica riesgo de solapamiento.',
      severity: 'recommended',
      applyFn: () => setPhysicalConfig((p) => ({ ...p, pocketCount: suggested })),
    }
  }

  return null
}
