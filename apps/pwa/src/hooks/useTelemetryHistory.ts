import { useState, useEffect } from 'react'

export interface TelemetryDataPoint {
  timestamp: Date
  temperatura: number
  humedad: number
}

/**
 * Hook para obtener historial de telemetría de las últimas 24 horas
 * Por ahora genera datos simulados basados en el valor actual
 * TODO: Implementar query a Firestore collection 'telemetryHistory'
 */
export function useTelemetryHistory(
  equipmentId: string | null,
  currentTemp?: number,
  currentHumidity?: number
): {
  data: TelemetryDataPoint[]
  loading: boolean
  error: Error | null
} {
  const [data, setData] = useState<TelemetryDataPoint[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<Error | null>(null)

  useEffect(() => {
    if (!equipmentId) {
      setData([])
      setLoading(false)
      return
    }

    setLoading(true)
    setError(null)

    // Simular delay de carga
    setTimeout(() => {
      try {
        // Generar 24 horas de datos (1 punto cada 15 minutos = 96 puntos)
        const now = new Date()
        const history: TelemetryDataPoint[] = []
        
        // Base values: usar valores actuales o defaults
        const baseTemp = currentTemp || 25
        const baseHumidity = currentHumidity || 50

        for (let i = 96; i >= 0; i--) {
          const timestamp = new Date(now.getTime() - i * 15 * 60 * 1000)
          
          // Generar variación realista:
          // - Temperatura: ±3°C con patrón sinusoidal (más calor al mediodía)
          const hourOfDay = timestamp.getHours()
          const tempVariation = Math.sin((hourOfDay - 6) * Math.PI / 12) * 2 // Pico a las 14h
          const tempNoise = (Math.random() - 0.5) * 1.5
          const temperatura = baseTemp + tempVariation + tempNoise
          
          // - Humedad: ±10% inversamente proporcional a temperatura
          const humidityVariation = -tempVariation * 2 // Menos humedad cuando más calor
          const humidityNoise = (Math.random() - 0.5) * 3
          const humedad = baseHumidity + humidityVariation + humidityNoise

          history.push({
            timestamp,
            temperatura: Math.round(temperatura * 10) / 10,
            humedad: Math.round(humedad * 10) / 10
          })
        }

        setData(history)
        setLoading(false)
      } catch (err) {
        setError(err instanceof Error ? err : new Error('Error generating data'))
        setLoading(false)
      }
    }, 500) // Simular 500ms de latency

  }, [equipmentId, currentTemp, currentHumidity])

  return { data, loading, error }
}
