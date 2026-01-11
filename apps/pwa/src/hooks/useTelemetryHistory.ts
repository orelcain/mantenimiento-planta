import { useState, useEffect, useRef } from 'react'

export interface TelemetryDataPoint {
  timestamp: Date
  temperatura: number
  humedad: number
}

export type TimeRange = '1h' | '6h' | '12h' | '24h' | '48h' | '7d'

/**
 * Hook para obtener historial de telemetría con buffer circular (osciloscopio)
 * Los datos se agregan sin recargar todo el gráfico
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
  const error = null // Error state mantenido para compatibilidad de interfaz
  
  // Referencias para mantener estado persistente sin causar re-renders
  const lastValueRef = useRef<{ temp: number; humidity: number } | null>(null)
  const initializingRef = useRef(false)

  // Calcular límite de puntos según el rango
  const maxPoints = {
    '1h': 30,
    '6h': 36,
    '12h': 48,
    '24h': 96,
    '48h': 96,
    '7d': 84
  }[timeRange]

  // Inicialización: generar datos históricos simulados SOLO la primera vez
  useEffect(() => {
    // Validar que tengamos valores numéricos (permitir 0 como válido)
    if (initializingRef.current || typeof currentTemp !== 'number' || typeof currentHumidity !== 'number') {
      return
    }

    initializingRef.current = true
    setLoading(true)

    // Generar historial de forma asíncrona sin bloquear el render
    // Usar requestIdleCallback o setTimeout con prioridad baja
    const generateHistory = () => {
      const ranges = {
        '1h': { hours: 1, intervalMinutes: 2 },
        '6h': { hours: 6, intervalMinutes: 10 },
        '12h': { hours: 12, intervalMinutes: 15 },
        '24h': { hours: 24, intervalMinutes: 15 },
        '48h': { hours: 48, intervalMinutes: 30 },
        '7d': { hours: 168, intervalMinutes: 120 }
      }
      
      const { hours, intervalMinutes } = ranges[timeRange]
      const now = new Date()
      const history: TelemetryDataPoint[] = []
      
      const baseTemp = currentTemp
      const baseHumidity = currentHumidity
      
      const totalPoints = Math.floor((hours * 60) / intervalMinutes)

      // Agregar punto actual PRIMERO para que el gráfico muestre algo inmediatamente
      history.push({
        timestamp: now,
        temperatura: Math.round(baseTemp * 10) / 10,
        humedad: Math.round(baseHumidity * 10) / 10
      })

      // Mostrar el gráfico con el punto actual inmediatamente
      setData([...history])
      setLoading(false)

      // Generar historial en background
      setTimeout(() => {
        const historicalData: TelemetryDataPoint[] = []
        
        for (let i = totalPoints; i >= 1; i--) {
          const timestamp = new Date(now.getTime() - i * intervalMinutes * 60 * 1000)
          
          const hourOfDay = timestamp.getHours()
          const tempVariation = Math.sin((hourOfDay - 6) * Math.PI / 12) * 2
          const tempNoise = (Math.random() - 0.5) * 1.5
          const temperatura = baseTemp + tempVariation + tempNoise
          
          const humidityVariation = -tempVariation * 2
          const humidityNoise = (Math.random() - 0.5) * 3
          const humedad = baseHumidity + humidityVariation + humidityNoise

          historicalData.push({
            timestamp,
            temperatura: Math.round(temperatura * 10) / 10,
            humedad: Math.round(humedad * 10) / 10
          })
        }

        // Agregar punto actual al final
        historicalData.push({
          timestamp: now,
          temperatura: Math.round(baseTemp * 10) / 10,
          humedad: Math.round(baseHumidity * 10) / 10
        })

        setData(historicalData)
        lastValueRef.current = { temp: currentTemp, humidity: currentHumidity }
      }, 0) // Ejecutar en siguiente tick
    }

    generateHistory()
  }, [equipmentId, timeRange, currentTemp, currentHumidity])

  // Agregar nuevos puntos cuando llegan datos nuevos (efecto osciloscopio)
  useEffect(() => {
    if (!initializingRef.current || typeof currentTemp !== 'number' || typeof currentHumidity !== 'number') {
      return
    }

    const lastValue = lastValueRef.current
    
    // Solo agregar si los valores cambiaron
    if (lastValue && 
        (Math.abs(lastValue.temp - currentTemp) > 0.05 || 
         Math.abs(lastValue.humidity - currentHumidity) > 0.05)) {
      
      setData(prevData => {
        const newPoint: TelemetryDataPoint = {
          timestamp: new Date(),
          temperatura: Math.round(currentTemp * 10) / 10,
          humedad: Math.round(currentHumidity * 10) / 10
        }

        // Buffer circular: agregar al final, eliminar del principio si excede límite
        const newData = [...prevData, newPoint]
        if (newData.length > maxPoints) {
          newData.shift() // Remover el punto más antiguo
        }

        return newData
      })

      lastValueRef.current = { temp: currentTemp, humidity: currentHumidity }
    }
  }, [currentTemp, currentHumidity, maxPoints])

  // Reset cuando cambia el rango temporal o el equipo
  useEffect(() => {
    if (initializingRef.current) {
      initializingRef.current = false
      setData([])
      setLoading(true)
    }
  }, [equipmentId, timeRange])

  return { data, loading, error }
}
