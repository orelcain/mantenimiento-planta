import type { GraderPhysicalConfig } from '../types'
import type { PointZeroSuggestion } from './types'

const STALE_DAYS = 30

interface Params {
  physicalConfig: GraderPhysicalConfig
  ignoredIds: Set<string>
}

export function suggestResetFreshness({
  physicalConfig,
  ignoredIds,
}: Params): PointZeroSuggestion | null {
  const id = 'reset-freshness'
  if (ignoredIds.has(id)) return null

  const measuredAt = physicalConfig.flipperMechanicalMeasuredAt
  const now = Date.now()

  // Si nunca se midió
  if (measuredAt == null) {
    return {
      id,
      parameter: 'flipperMechanicalResetS',
      currentValue: physicalConfig.flipperMechanicalResetS ?? 0.45,
      suggestedValue: 'Medir en terreno',
      unit: 's',
      source: 'measurement',
      sourceLabel: 'Medición slow-mo pendiente',
      reasoning: 'El tiempo de reset mecánico del cilindro neumático nunca ha sido medido. Se está usando el valor estimado de 0.45s. Esto puede causar errores en el análisis de timing entre gates adyacentes.',
      dataPoints: [
        { label: 'Valor actual', value: `${(physicalConfig.flipperMechanicalResetS ?? 0.45).toFixed(2)} s`, detail: 'Estimado (no medido)' },
        { label: 'Método de medición', value: 'Slow-mo iPhone 240fps' },
        { label: 'Acceso Z2', value: 'Servicio → Probar salidas [8620]' },
      ],
      confidence: 'high',
      confidenceReason: 'La falta de medición real es un hecho objetivo.',
      impactText: 'El tiempo real puede diferir significativamente de 0.45s según la presión del compresor y el estado del regulador de caudal.',
      severity: 'recommended',
      applyFn: () => { /* No-op: la acción es abrir el modal slow-mo */ },
    }
  }

  // Si la medición tiene más de STALE_DAYS días
  const daysSince = (now - measuredAt) / (1000 * 60 * 60 * 24)
  if (daysSince >= STALE_DAYS) {
    const dateStr = new Date(measuredAt).toLocaleDateString('es-CL')
    return {
      id,
      parameter: 'flipperMechanicalResetS',
      currentValue: physicalConfig.flipperMechanicalResetS ?? 0.45,
      suggestedValue: 'Remedir en terreno',
      unit: 's',
      source: 'measurement',
      sourceLabel: `Última medición hace ${Math.floor(daysSince)} días`,
      reasoning: `La última medición del reset mecánico fue el ${dateStr} (hace ${Math.floor(daysSince)} días). El desgaste del regulador de caudal neumático puede haber variado el tiempo de reset. Se recomienda remedir cada ${STALE_DAYS} días.`,
      dataPoints: [
        { label: 'Última medición', value: dateStr },
        { label: 'Días transcurridos', value: `${Math.floor(daysSince)} días` },
        { label: 'Valor medido', value: `${(physicalConfig.flipperMechanicalResetS ?? 0.45).toFixed(3)} s` },
      ],
      confidence: 'medium',
      confidenceReason: `Han pasado ${Math.floor(daysSince)} días desde la última medición. El desgaste mecánico puede haberlo cambiado.`,
      severity: 'info',
      applyFn: () => { /* No-op: la acción es abrir el modal slow-mo */ },
    }
  }

  return null
}
