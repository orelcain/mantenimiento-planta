import { useEffect, useMemo, useState } from 'react'
import type { SensorReading, SensorSummaryNode } from '@/services/sensorsRtdb'
import { subscribeSensorReadings, subscribeSensorSummary } from '@/services/sensorsRtdb'
import { predictFailureRisk } from '@/lib/predictive/predictor'

export function useIoTPrediction(equipmentId: string | null, options?: { limit?: number }) {
  const limit = options?.limit ?? 30

  const [summary, setSummary] = useState<SensorSummaryNode | null>(null)
  const [readings, setReadings] = useState<SensorReading[]>([])
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    if (!equipmentId) return

    setError(null)

    const unsubSummary = subscribeSensorSummary(
      equipmentId,
      (data) => setSummary(data),
      () => setError('No se pudo leer el estado del sensor (RTDB).')
    )

    const unsubReadings = subscribeSensorReadings(
      equipmentId,
      limit,
      (data) => setReadings(data),
      () => setError('No se pudo leer el histórico de lecturas (RTDB).')
    )

    return () => {
      unsubSummary()
      unsubReadings()
    }
  }, [equipmentId, limit])

  const prediction = useMemo(() => {
    return predictFailureRisk({ summary, readings })
  }, [summary, readings])

  return { summary, readings, prediction, error }
}
