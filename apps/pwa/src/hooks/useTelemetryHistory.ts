import { useState, useEffect } from 'react'

export interface TelemetryDataPoint {
  timestamp: Date
  temperatura: number
  humedad: number
}

export type TimeRange = '1h' | '6h' | '12h' | '24h' | '48h' | '7d'

/**
 * Hook para obtener historial de telemetría
 * Por ahora genera datos simulados basados en el valor actual
 * TODO: Implementar query a Firestore collection 'telemetryHistory'
 */
export function useTelemetryHistory(
  equipmentId: string | null,
  currentTemp?: number,
  currentHumidity?: number,
  timeRange: TimeRange = '24h'
): {
  data: TelemetryDataPoint[]
  loading: boolean
  error: Error | null
} {
  const [data, setData] = useState<TelemetryDataPoint[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<Error | null>(null)

  useEffect(() => {
    // Si no hay valores actuales de temp/humedad, no hay nada que mostrar
    if (currentTemp === undefined || currentHumidity === undefined) {
      setData([])
      setLoading(false)
      return
    }

    setLoading(true)
    setError(null)

    // Simular delay de carga
    setTimeout(() => {
      try {
        // Calcular parámetros según el rango de tiempo
        const ranges = {
          '1h': { hours: 1, intervalMinutes: 2 },   // 30 puntos
          '6h': { hours: 6, intervalMinutes: 10 },  // 36 puntos
          '12h': { hours: 12, intervalMinutes: 15 }, // 48 puntos
          '24h': { hours: 24, intervalMinutes: 15 }, // 96 puntos
          '48h': { hours: 48, intervalMinutes: 30 }, // 96 puntos
          '7d': { hours: 168, intervalMinutes: 120 } // 84 puntos (2h cada punto)
        }
        
        const { hours, intervalMinutes } = ranges[timeRange]
        const now = new Date()
        const history: TelemetryDataPoint[] = []
        
        // Base values: usar valores actuales o defaults
        const baseTemp = currentTemp || 25
        const baseHumidity = currentHumidity || 50
        
        const totalPoints = Math.floor((hours * 60) / intervalMinutes)

        for (let i = totalPoints; i >= 0; i--) {
          const timestamp = new Date(now.getTime() - i * intervalMinutes * 60 * 1000)
          
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

  }, [currentTemp, currentHumidity, timeRange]) // Regenerar cuando cambien los valores actuales o el rango

  return { data, loading, error }
}
