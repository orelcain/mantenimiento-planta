import {
  collection,
  getDocs,
  limit,
  orderBy,
  query,
  where,
} from 'firebase/firestore'
import { db } from './firebase'
import { createIncident } from './incidents'
import type {
  Equipment,
  Incident,
  IncidentPriority,
  IncidentStatus,
} from '@/types'
import type { PredictiveResult } from '@/lib/predictive/predictor'
import type { SensorReading } from './sensorsRtdb'

const COLLECTION = 'incidents'

const ACTIVE_STATUSES: IncidentStatus[] = ['pendiente', 'confirmada', 'en_proceso']

function riskToPriority(risk: PredictiveResult['nivelRiesgo']): IncidentPriority {
  switch (risk) {
    case 'critico':
      return 'critica'
    case 'alto':
      return 'alta'
    case 'medio':
      return 'media'
    default:
      return 'baja'
  }
}

export async function ensurePredictiveIncident(params: {
  equipment: Pick<Equipment, 'id' | 'nombre' | 'codigo' | 'hierarchyNodeId'>
  prediction: PredictiveResult
  lastReading?: SensorReading
  reportedByUserId: string
  minConfidence?: number
}): Promise<Incident | null> {
  const minConfidence = params.minConfidence ?? 0.55

  // No crear incidencias si el predictor no está confiado.
  if (params.prediction.confianza < minConfidence) return null

  // Solo auto-crear para alto/critico
  if (params.prediction.nivelRiesgo !== 'alto' && params.prediction.nivelRiesgo !== 'critico') {
    return null
  }

  // Evitar duplicados: si ya existe una incidencia predictiva activa para el equipo, no crear otra.
  const q = query(
    collection(db, COLLECTION),
    where('tipo', '==', 'predictivo'),
    where('equipmentId', '==', params.equipment.id),
    where('status', 'in', ACTIVE_STATUSES),
    orderBy('createdAt', 'desc'),
    limit(1)
  )

  const snapshot = await getDocs(q)
  if (!snapshot.empty) {
    return null
  }

  const priority = riskToPriority(params.prediction.nivelRiesgo)

  const readingText = params.lastReading
    ? `Última lectura: ${params.lastReading.temperature.toFixed(1)}°C, ${params.lastReading.humidity.toFixed(1)}% (fuente: ${params.lastReading.source ?? '—'})`
    : 'Sin lectura reciente disponible.'

  const titulo = `Riesgo ${params.prediction.nivelRiesgo} detectado (IoT)`
  const descripcion = [
    `Equipo: ${params.equipment.nombre} (${params.equipment.codigo})`,
    readingText,
    `Confianza: ${Math.round(params.prediction.confianza * 100)}%`,
    '',
    'Indicadores:',
    ...params.prediction.indicadores.map((i) => `- ${i}`),
    '',
    `Recomendación: ${params.prediction.recomendacion}`,
  ].join('\n')

  return createIncident({
    tipo: 'predictivo',
    titulo,
    descripcion,
    equipmentId: params.equipment.id,
    hierarchyNodeId: params.equipment.hierarchyNodeId,
    prioridad: priority,
    status: 'pendiente',
    fotos: [],
    reportadoPor: params.reportedByUserId,
    requiresValidation: true,
  })
}
