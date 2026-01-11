import { useMemo } from 'react'
import {
  Chart as ChartJS,
  CategoryScale,
  LinearScale,
  PointElement,
  LineElement,
  BarElement,
  Title,
  Tooltip,
  Legend,
  Filler,
  RadialLinearScale,
  TimeScale
} from 'chart.js'
import zoomPlugin from 'chartjs-plugin-zoom'
import { Line, Bar, Radar, Scatter } from 'react-chartjs-2'
import type { TelemetryDataPoint } from '../../hooks/useTelemetryHistory'

// Registrar componentes de Chart.js + plugin zoom
ChartJS.register(
  CategoryScale,
  LinearScale,
  PointElement,
  LineElement,
  BarElement,
  Title,
  Tooltip,
  Legend,
  Filler,
  RadialLinearScale,
  TimeScale,
  zoomPlugin
)

export type ChartType = 'line' | 'area' | 'dual-axis' | 'scatter' | 'bar' | 'radar'

interface TelemetryChartProps {
  data: TelemetryDataPoint[]
  type: ChartType
  height?: number
}

export function TelemetryChart({ data, type, height = 300 }: TelemetryChartProps) {
  const chartData = useMemo(() => {
    // Formatear labels según el rango de tiempo
    const labels = data.map(d => {
      const date = new Date(d.timestamp)
      const now = new Date()
      const hoursDiff = (now.getTime() - date.getTime()) / (1000 * 60 * 60)
      
      // Si es más de 24h atrás, mostrar día/mes también
      if (hoursDiff > 24) {
        const day = date.getDate().toString().padStart(2, '0')
        const month = (date.getMonth() + 1).toString().padStart(2, '0')
        const hour = date.getHours().toString().padStart(2, '0')
        const minute = date.getMinutes().toString().padStart(2, '0')
        return `${day}/${month} ${hour}:${minute}`
      } else {
        // Solo hora:minuto para últimas 24h
        const hour = date.getHours().toString().padStart(2, '0')
        const minute = date.getMinutes().toString().padStart(2, '0')
        return `${hour}:${minute}`
      }
    })

    const tempData = data.map(d => d.temperatura)
    const humidityData = data.map(d => d.humedad)

    // Configuración común de colores
    const tempColor = 'rgb(239, 68, 68)' // red-500
    const humidityColor = 'rgb(59, 130, 246)' // blue-500

    switch (type) {
      case 'line':
        // 1. Línea de tiempo clásica
        return {
          labels,
          datasets: [
            {
              label: 'Temperatura (°C)',
              data: tempData,
              borderColor: tempColor,
              backgroundColor: tempColor,
              borderWidth: 2,
              pointRadius: 0,
              tension: 0.4
            },
            {
              label: 'Humedad (%)',
              data: humidityData,
              borderColor: humidityColor,
              backgroundColor: humidityColor,
              borderWidth: 2,
              pointRadius: 0,
              tension: 0.4
            }
          ]
        }

      case 'area':
        // 2. Área suavizada con gradiente
        return {
          labels,
          datasets: [
            {
              label: 'Temperatura (°C)',
              data: tempData,
              borderColor: tempColor,
              backgroundColor: (context: any) => {
                const ctx = context.chart.ctx
                const gradient = ctx.createLinearGradient(0, 0, 0, height)
                gradient.addColorStop(0, 'rgba(239, 68, 68, 0.5)')
                gradient.addColorStop(1, 'rgba(239, 68, 68, 0.0)')
                return gradient
              },
              borderWidth: 2,
              pointRadius: 0,
              tension: 0.4,
              fill: true
            },
            {
              label: 'Humedad (%)',
              data: humidityData,
              borderColor: humidityColor,
              backgroundColor: (context: any) => {
                const ctx = context.chart.ctx
                const gradient = ctx.createLinearGradient(0, 0, 0, height)
                gradient.addColorStop(0, 'rgba(59, 130, 246, 0.5)')
                gradient.addColorStop(1, 'rgba(59, 130, 246, 0.0)')
                return gradient
              },
              borderWidth: 2,
              pointRadius: 0,
              tension: 0.4,
              fill: true
            }
          ]
        }

      case 'dual-axis':
        // 3. Doble eje Y (temperatura + humedad) ⭐
        return {
          labels,
          datasets: [
            {
              label: 'Temperatura (°C)',
              data: tempData,
              borderColor: tempColor,
              backgroundColor: tempColor,
              borderWidth: 2,
              pointRadius: 0,
              tension: 0.4,
              yAxisID: 'y-temp'
            },
            {
              label: 'Humedad (%)',
              data: humidityData,
              borderColor: humidityColor,
              backgroundColor: humidityColor,
              borderWidth: 2,
              pointRadius: 0,
              tension: 0.4,
              yAxisID: 'y-humidity'
            }
          ]
        }

      case 'scatter':
        // 4. Scatter con correlación temp vs humedad
        return {
          datasets: [
            {
              label: 'Temp vs Humedad',
              data: data.map(d => ({ x: d.temperatura, y: d.humedad })),
              backgroundColor: 'rgba(139, 92, 246, 0.6)', // violet-500
              borderColor: 'rgb(139, 92, 246)',
              borderWidth: 1,
              pointRadius: 4
            }
          ]
        }

      case 'bar':
        // 5. Barras agrupadas por hora
        const hourlyData = groupByHour(data)
        return {
          labels: Object.keys(hourlyData).map(h => `${h}:00`),
          datasets: [
            {
              label: 'Temp Promedio (°C)',
              data: Object.values(hourlyData).map(h => h.avgTemp),
              backgroundColor: 'rgba(239, 68, 68, 0.6)',
              borderColor: tempColor,
              borderWidth: 1
            },
            {
              label: 'Humedad Promedio (%)',
              data: Object.values(hourlyData).map(h => h.avgHumidity),
              backgroundColor: 'rgba(59, 130, 246, 0.6)',
              borderColor: humidityColor,
              borderWidth: 1
            }
          ]
        }

      case 'radar':
        // 6. Radar con estadísticas
        const stats = calculateStats(data)
        return {
          labels: ['Mín', 'Máx', 'Promedio', 'Mediana', 'Desv Est'],
          datasets: [
            {
              label: 'Temperatura (normalizado)',
              data: [
                normalize(stats.temp.min, 15, 35),
                normalize(stats.temp.max, 15, 35),
                normalize(stats.temp.avg, 15, 35),
                normalize(stats.temp.median, 15, 35),
                normalize(stats.temp.stdDev, 0, 5)
              ],
              backgroundColor: 'rgba(239, 68, 68, 0.2)',
              borderColor: tempColor,
              borderWidth: 2
            },
            {
              label: 'Humedad (normalizado)',
              data: [
                normalize(stats.humidity.min, 30, 70),
                normalize(stats.humidity.max, 30, 70),
                normalize(stats.humidity.avg, 30, 70),
                normalize(stats.humidity.median, 30, 70),
                normalize(stats.humidity.stdDev, 0, 10)
              ],
              backgroundColor: 'rgba(59, 130, 246, 0.2)',
              borderColor: humidityColor,
              borderWidth: 2
            }
          ]
        }

      default:
        return { labels: [], datasets: [] }
    }
  }, [data, type, height])

  const options = useMemo(() => {
    const commonOptions = {
      responsive: true,
      maintainAspectRatio: false,
      plugins: {
        legend: {
          position: 'top' as const,
          labels: {
            usePointStyle: true,
            padding: 12
          }
        },
        tooltip: {
          mode: 'index' as const,
          intersect: false
        },
        zoom: {
          pan: {
            enabled: true,
            mode: 'x' as const,
            modifierKey: 'ctrl' as const
          },
          zoom: {
            wheel: {
              enabled: true,
              speed: 0.1
            },
            pinch: {
              enabled: true
            },
            mode: 'x' as const
          },
          limits: {
            x: { min: 'original' as const, max: 'original' as const }
          }
        }
      }
    }

    switch (type) {
      case 'line':
      case 'area':
        return {
          ...commonOptions,
          scales: {
            x: {
              ticks: {
                maxTicksLimit: 12,
                maxRotation: 0
              }
            },
            y: {
              beginAtZero: false,
              ticks: {
                callback: (value: any) => `${value}°C / %`
              }
            }
          },
          interaction: {
            mode: 'nearest' as const,
            axis: 'x' as const,
            intersect: false
          }
        }

      case 'dual-axis':
        return {
          ...commonOptions,
          scales: {
            x: {
              ticks: {
                maxTicksLimit: 12,
                maxRotation: 0
              }
            },
            'y-temp': {
              type: 'linear' as const,
              position: 'left' as const,
              title: {
                display: true,
                text: 'Temperatura (°C)',
                color: 'rgb(239, 68, 68)'
              },
              ticks: {
                color: 'rgb(239, 68, 68)'
              }
            },
            'y-humidity': {
              type: 'linear' as const,
              position: 'right' as const,
              title: {
                display: true,
                text: 'Humedad (%)',
                color: 'rgb(59, 130, 246)'
              },
              ticks: {
                color: 'rgb(59, 130, 246)'
              },
              grid: {
                drawOnChartArea: false
              }
            }
          }
        }

      case 'scatter':
        return {
          ...commonOptions,
          scales: {
            x: {
              title: {
                display: true,
                text: 'Temperatura (°C)'
              }
            },
            y: {
              title: {
                display: true,
                text: 'Humedad (%)'
              }
            }
          }
        }

      case 'bar':
        return {
          ...commonOptions,
          scales: {
            x: {
              ticks: {
                maxRotation: 45,
                minRotation: 45
              }
            },
            y: {
              beginAtZero: false
            }
          }
        }

      case 'radar':
        return {
          ...commonOptions,
          scales: {
            r: {
              beginAtZero: true,
              max: 100,
              ticks: {
                stepSize: 20
              }
            }
          }
        }

      default:
        return commonOptions
    }
  }, [type])

  // Renderizar el tipo de gráfico correspondiente
  if (type === 'scatter') {
    return (
      <div style={{ height: `${height}px` }}>
        <Scatter data={chartData} options={options} />
      </div>
    )
  }

  if (type === 'bar') {
    return (
      <div style={{ height: `${height}px` }}>
        <Bar data={chartData} options={options} />
      </div>
    )
  }

  if (type === 'radar') {
    return (
      <div style={{ height: `${height}px` }}>
        <Radar data={chartData} options={options} />
      </div>
    )
  }

  // Por defecto usar Line (para line, area, dual-axis)
  return (
    <div style={{ height: `${height}px` }}>
      <Line data={chartData} options={options} />
    </div>
  )
}

// Helpers
function groupByHour(data: TelemetryDataPoint[]) {
  const grouped: Record<string, { avgTemp: number; avgHumidity: number; count: number }> = {}

  data.forEach(d => {
    const hour = d.timestamp.getHours().toString()
    if (!grouped[hour]) {
      grouped[hour] = { avgTemp: 0, avgHumidity: 0, count: 0 }
    }
    grouped[hour].avgTemp += d.temperatura
    grouped[hour].avgHumidity += d.humedad
    grouped[hour].count++
  })

  // Calcular promedios
  Object.keys(grouped).forEach(hour => {
    grouped[hour].avgTemp = Math.round((grouped[hour].avgTemp / grouped[hour].count) * 10) / 10
    grouped[hour].avgHumidity = Math.round((grouped[hour].avgHumidity / grouped[hour].count) * 10) / 10
  })

  return grouped
}

function calculateStats(data: TelemetryDataPoint[]) {
  const temps = data.map(d => d.temperatura).sort((a, b) => a - b)
  const humidities = data.map(d => d.humedad).sort((a, b) => a - b)

  const calcStats = (arr: number[]) => {
    const min = arr[0]
    const max = arr[arr.length - 1]
    const avg = arr.reduce((sum, v) => sum + v, 0) / arr.length
    const median = arr[Math.floor(arr.length / 2)]
    const variance = arr.reduce((sum, v) => sum + Math.pow(v - avg, 2), 0) / arr.length
    const stdDev = Math.sqrt(variance)
    return { min, max, avg, median, stdDev }
  }

  return {
    temp: calcStats(temps),
    humidity: calcStats(humidities)
  }
}

function normalize(value: number, min: number, max: number): number {
  return ((value - min) / (max - min)) * 100
}
