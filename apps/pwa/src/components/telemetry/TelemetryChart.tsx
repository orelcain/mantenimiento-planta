import { useMemo, useRef } from 'react'
import 'chartjs-adapter-date-fns'
import {
  Chart as ChartJS,
  CategoryScale,
  LinearScale,
  PointElement,
  LineElement,
  BarElement,
  ArcElement,
  Title,
  Tooltip,
  Legend,
  Filler,
  RadialLinearScale,
  TimeScale
} from 'chart.js'
import zoomPlugin from 'chartjs-plugin-zoom'
import { Bar, Chart, Doughnut, Line, Radar, Scatter } from 'react-chartjs-2'
import { MatrixController, MatrixElement } from 'chartjs-chart-matrix'
import {
  CandlestickController,
  CandlestickElement,
  OhlcController,
  OhlcElement
} from 'chartjs-chart-financial'
import type { TelemetryDataPoint } from '../../hooks/useTelemetryHistory'

// Registrar componentes de Chart.js + plugin zoom
ChartJS.register(
  CategoryScale,
  LinearScale,
  PointElement,
  LineElement,
  BarElement,
  ArcElement,
  Title,
  Tooltip,
  Legend,
  Filler,
  RadialLinearScale,
  TimeScale,
  MatrixController,
  MatrixElement,
  CandlestickController,
  CandlestickElement,
  OhlcController,
  OhlcElement,
  zoomPlugin
)

export type ChartType =
  | 'line'
  | 'area'
  | 'dual-axis'
  | 'scatter'
  | 'bar'
  | 'radar'
  | 'gauge'
  | 'heatmap'
  | 'candlestick'
  | 'mixed'

interface TelemetryChartProps {
  data: TelemetryDataPoint[]
  type: ChartType
  height?: number
}

export function TelemetryChart({ data, type, height = 300 }: TelemetryChartProps) {
  // Mostrar indicador de carga si hay muy pocos datos
  const isLoading = data.length < 3

  const chartRef = useRef<ChartJS | null>(null)

  const supportsRealtimeZoom =
    type === 'line' ||
    type === 'area' ||
    type === 'dual-axis' ||
    type === 'candlestick' ||
    type === 'mixed'

  const visibleSummary = useMemo(() => {
    if (data.length === 0) return null

    const latest = data[data.length - 1]
    if (!latest) return null
    const temps = data.map((point) => point.temperatura)
    const hums = data.map((point) => point.humedad)
    const average = (values: number[]) => values.reduce((acc, n) => acc + n, 0) / values.length

    return {
      points: data.length,
      latestAt: latest.timestamp,
      temp: {
        latest: latest.temperatura,
        avg: average(temps),
        min: Math.min(...temps),
        max: Math.max(...temps),
      },
      hum: {
        latest: latest.humedad,
        avg: average(hums),
        min: Math.min(...hums),
        max: Math.max(...hums),
      },
    }
  }, [data])

  const recentReadings = useMemo(() => {
    if (data.length === 0) return []
    return [...data].slice(-5).reverse()
  }, [data])

  const zoomToNow = () => {
    const chart = chartRef.current as any
    if (!chart) return

    const now = Date.now()
    const windowPastMs = 30 * 60 * 1000
    const windowFutureMs = 2 * 60 * 1000
    const min = now - windowPastMs
    const max = now + windowFutureMs

    // Preferir API del plugin si está disponible
    if (typeof chart.zoomScale === 'function') {
      try {
        chart.zoomScale('x', { min, max }, 'none')
        chart.update('none')
        return
      } catch {
        // fallback abajo
      }
    }

    const scales = chart.options?.scales
    if (scales?.x) {
      scales.x.min = min
      scales.x.max = max
    }
    chart.update('none')
  }

  const resetZoom = () => {
    const chart = chartRef.current as any
    if (!chart) return

    if (typeof chart.resetZoom === 'function') {
      try {
        chart.resetZoom()
      } catch {
        // ignore
      }
    }

    const scales = chart.options?.scales
    if (scales?.x) {
      delete scales.x.min
      delete scales.x.max
    }
    chart.update('none')
  }

  const chartData = useMemo(() => {
    const tempSeries = data.map(d => ({ x: d.timestamp, y: d.temperatura }))
    const humiditySeries = data.map(d => ({ x: d.timestamp, y: d.humedad }))

    // Configuración común de colores
    const tempColor = 'rgb(239, 68, 68)' // red-500
    const humidityColor = 'rgb(59, 130, 246)' // blue-500

    switch (type) {
      case 'line':
        // 1. Línea de tiempo clásica
        return {
          datasets: [
            {
              label: 'Temperatura (°C)',
              data: tempSeries,
              borderColor: tempColor,
              backgroundColor: 'rgba(239, 68, 68, 0.08)',
              borderWidth: 2,
              pointRadius: 0,
              tension: 0.4
            },
            {
              label: 'Humedad (%)',
              data: humiditySeries,
              borderColor: humidityColor,
              backgroundColor: 'rgba(59, 130, 246, 0.08)',
              borderWidth: 2,
              pointRadius: 0,
              tension: 0.4
            }
          ]
        }

      case 'area':
        // 2. Área suavizada con gradiente
        return {
          datasets: [
            {
              label: 'Temperatura (°C)',
              data: tempSeries,
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
              data: humiditySeries,
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
          datasets: [
            {
              label: 'Temperatura (°C)',
              data: tempSeries,
              borderColor: tempColor,
              backgroundColor: tempColor,
              borderWidth: 2,
              pointRadius: 0,
              tension: 0.4,
              yAxisID: 'y-temp'
            },
            {
              label: 'Humedad (%)',
              data: humiditySeries,
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
        {
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
        }

      case 'radar':
        // 6. Radar de Estado Actual (como el demo)
        {
          const stats = calculateStats(data)
          const latest = data[data.length - 1]
          const stability = 100 - normalize(stats.temp.stdDev ?? 0, 0, 3) // menor desviación => mejor
          const precision = Math.min(100, (data.length / 96) * 100)
          const reliability = Math.max(0, Math.min(100, 100 - missingRatio(data) * 100))

          return {
            labels: ['Temperatura', 'Humedad', 'Estabilidad', 'Precisión', 'Confiabilidad'],
            datasets: [
              {
                label: 'Estado Actual',
                data: [
                  clamp100(normalize(latest?.temperatura ?? stats.temp.avg ?? 0, 15, 35)),
                  clamp100(normalize(latest?.humedad ?? stats.humidity.avg ?? 0, 30, 70)),
                  clamp100(stability),
                  clamp100(precision),
                  clamp100(reliability)
                ],
                borderColor: '#667eea',
                backgroundColor: 'rgba(102, 126, 234, 0.2)',
                pointBackgroundColor: '#667eea',
                pointBorderColor: '#fff',
                pointRadius: 5
              }
            ]
          }
        }

      case 'gauge': {
        // 7. Gauge semicircular
        const latest = data[data.length - 1]
        const current = latest?.temperatura ?? 0
        const maxTemp = 40
        const clamped = Math.max(0, Math.min(maxTemp, current))
        return {
          labels: ['Temperatura Actual', 'Margen'],
          datasets: [
            {
              data: [clamped, Math.max(0, maxTemp - clamped)],
              backgroundColor: ['#667eea', '#e9ecef'],
              borderWidth: 0
            }
          ]
        }
      }

      case 'heatmap':
        // 8. Heatmap Temporal (matrix) - Día vs Hora
        return {
          datasets: [
            {
              label: 'Temperatura (°C)',
              data: buildHeatmapMatrix(data),
              width: ({ chart }: any) => {
                const area = chart.chartArea
                return area ? (area.right - area.left) / 24 - 1 : 10
              },
              height: ({ chart }: any) => {
                const area = chart.chartArea
                return area ? (area.bottom - area.top) / 7 - 1 : 10
              },
              borderWidth: 1,
              borderColor: 'rgba(0,0,0,0.08)',
              backgroundColor: (ctx: any) => {
                const v = ctx.raw?.v
                if (typeof v !== 'number') return 'rgba(102,126,234,0.2)'
                const t = Math.max(0, Math.min(1, (v - 20) / 15))
                const r = Math.round(255 * t)
                const g = Math.round(120 + (255 - 120) * (1 - t))
                const b = Math.round(255 * (1 - t))
                return `rgba(${r},${g},${b},0.75)`
              }
            } as any
          ]
        }

      case 'candlestick':
        // 9. Candlestick (OHLC) real
        return {
          datasets: [
            {
              label: 'OHLC Temp (°C)',
              data: buildCandles(data),
              color: {
                up: '#51cf66',
                down: '#ff6b6b',
                unchanged: '#adb5bd'
              }
            } as any
          ]
        }

      case 'mixed':
        // 10. Mixed chart (línea temp + barra lecturas + área humedad)
        return {
          datasets: [
            {
              type: 'line',
              label: 'Temperatura (°C)',
              data: tempSeries,
              borderColor: '#ff6b6b',
              backgroundColor: 'rgba(255, 107, 107, 0.1)',
              tension: 0.4,
              pointRadius: 0,
              yAxisID: 'y'
            } as any,
            {
              type: 'bar',
              label: 'Lecturas',
              data: data.map(d => ({ x: d.timestamp, y: 1 })),
              backgroundColor: 'rgba(102, 126, 234, 0.5)',
              yAxisID: 'y1'
            } as any,
            {
              type: 'line',
              label: 'Humedad (%)',
              data: humiditySeries,
              borderColor: '#4ecdc4',
              backgroundColor: 'rgba(78, 205, 196, 0.2)',
              tension: 0.4,
              pointRadius: 0,
              fill: true,
              yAxisID: 'y'
            } as any
          ]
        }

      default:
        return { labels: [], datasets: [] }
    }
  }, [data, type, height])

  const options = useMemo(() => {
    const dayLabels = ['Dom', 'Lun', 'Mar', 'Mié', 'Jue', 'Vie', 'Sáb']

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
              type: 'time' as const,
              time: {
                unit: 'hour' as const
              }
            },
            y: {
              beginAtZero: false
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
              type: 'time' as const,
              time: {
                unit: 'hour' as const
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

      case 'gauge':
        return {
          ...commonOptions,
          circumference: 180,
          rotation: -90,
          plugins: {
            ...commonOptions.plugins,
            legend: { display: false },
            tooltip: {
              callbacks: {
                label: (ctx: any) => (ctx.label === 'Temperatura Actual' ? `${ctx.parsed}°C` : '')
              }
            }
          }
        }

      case 'heatmap':
        return {
          ...commonOptions,
          plugins: {
            ...commonOptions.plugins,
            zoom: undefined,
            tooltip: {
              callbacks: {
                title: (items: any[]) => {
                  const raw = items?.[0]?.raw
                  if (!raw) return ''
                  return `${dayLabels[raw.y]} · ${String(raw.x).padStart(2, '0')}:00`
                },
                label: (item: any) => {
                  const raw = item.raw
                  return `Temp: ${Number(raw.v).toFixed(1)}°C`
                }
              }
            }
          },
          scales: {
            x: {
              type: 'linear' as const,
              min: 0,
              max: 23,
              ticks: {
                stepSize: 3,
                callback: (v: any) => `${String(v).padStart(2, '0')}h`
              },
              title: { display: true, text: 'Hora del día' }
            },
            y: {
              type: 'linear' as const,
              min: 0,
              max: 6,
              ticks: {
                stepSize: 1,
                callback: (v: any) => dayLabels[v] ?? v
              },
              title: { display: true, text: 'Día' }
            }
          }
        }

      case 'candlestick':
        return {
          ...commonOptions,
          scales: {
            x: {
              type: 'time' as const,
              time: { unit: 'hour' as const },
              title: { display: true, text: 'Tiempo' }
            },
            y: {
              title: { display: true, text: 'Temperatura (°C)' }
            }
          },
          plugins: {
            ...commonOptions.plugins,
            tooltip: {
              callbacks: {
                label: (ctx: any) => {
                  const r = ctx.raw
                  return `O:${r.o.toFixed(1)} H:${r.h.toFixed(1)} L:${r.l.toFixed(1)} C:${r.c.toFixed(1)} °C`
                }
              }
            }
          }
        }

      case 'mixed':
        return {
          ...commonOptions,
          scales: {
            x: {
              type: 'time' as const,
              time: { unit: 'hour' as const }
            },
            y: {
              type: 'linear' as const,
              position: 'left' as const,
              beginAtZero: false
            },
            y1: {
              type: 'linear' as const,
              position: 'right' as const,
              beginAtZero: true,
              grid: { drawOnChartArea: false }
            }
          }
        }

      default:
        return commonOptions
    }
  }, [type])

  // Mostrar skeleton mientras carga
  if (isLoading) {
    return (
      <div style={{ height: `${height}px` }} className="relative bg-muted-foreground/[0.10] rounded-card dark:border-border overflow-hidden">
        <div className="absolute inset-0 flex items-center justify-center">
          <div className="flex flex-col items-center gap-3">
            <div className="w-12 h-12 border-4 border-blue-500/[0.25] border-t-blue-600 rounded-full animate-spin" />
            <p className="text-sm text-muted-foreground animate-pulse">
              Generando historial...
            </p>
          </div>
        </div>
        {/* Skeleton del gráfico */}
        <div className="absolute inset-4">
          <div className="h-full flex items-end gap-1 opacity-20">
            {Array.from({ length: 20 }).map((_, i) => (
              <div 
                key={i} 
                className="flex-1 bg-gradient-to-t from-blue-300 to-blue-500 rounded-t animate-pulse"
                style={{ 
                  height: `${30 + Math.random() * 60}%`,
                  animationDelay: `${i * 50}ms`
                }}
              />
            ))}
          </div>
        </div>
      </div>
    )
  }

  const chartElement = (() => {
    if (type === 'scatter') {
      return <Scatter ref={chartRef as any} data={chartData as any} options={options as any} />
    }

    if (type === 'bar') {
      return <Bar ref={chartRef as any} data={chartData as any} options={options as any} />
    }

    if (type === 'radar') {
      return <Radar ref={chartRef as any} data={chartData as any} options={options as any} />
    }

    if (type === 'gauge') {
      return <Doughnut ref={chartRef as any} data={chartData as any} options={options as any} />
    }

    if (type === 'heatmap') {
      return <Chart ref={chartRef as any} type="matrix" data={chartData as any} options={options as any} />
    }

    if (type === 'candlestick') {
      return <Chart ref={chartRef as any} type="candlestick" data={chartData as any} options={options as any} />
    }

    if (type === 'mixed') {
      return <Chart ref={chartRef as any} type="line" data={chartData as any} options={options as any} />
    }

    // Por defecto usar Line (para line, area, dual-axis)
    return <Line ref={chartRef as any} data={chartData as any} options={options as any} />
  })()

  const chartHeight = Math.max(220, visibleSummary ? height - 130 : height)

  return (
    <div className="space-y-3">
      {visibleSummary && (
        <div className="grid grid-cols-2 lg:grid-cols-5 gap-2">
          <div className="rounded-ctl border p-2 bg-card/40">
            <div className="text-caption text-muted-foreground">Temperatura actual</div>
            <div className="text-sm font-semibold">{visibleSummary.temp.latest.toFixed(1)} °C</div>
          </div>
          <div className="rounded-ctl border p-2 bg-card/40">
            <div className="text-caption text-muted-foreground">Humedad actual</div>
            <div className="text-sm font-semibold">{visibleSummary.hum.latest.toFixed(1)} %</div>
          </div>
          <div className="rounded-ctl border p-2 bg-card/40">
            <div className="text-caption text-muted-foreground">Temp prom. / min-max</div>
            <div className="text-sm font-semibold">
              {visibleSummary.temp.avg.toFixed(1)}
              <span className="text-xs text-muted-foreground"> °C · {visibleSummary.temp.min.toFixed(1)}-{visibleSummary.temp.max.toFixed(1)}</span>
            </div>
          </div>
          <div className="rounded-ctl border p-2 bg-card/40">
            <div className="text-caption text-muted-foreground">Hum prom. / min-max</div>
            <div className="text-sm font-semibold">
              {visibleSummary.hum.avg.toFixed(1)}
              <span className="text-xs text-muted-foreground"> % · {visibleSummary.hum.min.toFixed(1)}-{visibleSummary.hum.max.toFixed(1)}</span>
            </div>
          </div>
          <div className="rounded-ctl border p-2 bg-card/40">
            <div className="text-caption text-muted-foreground">Lecturas visibles</div>
            <div className="text-sm font-semibold">{visibleSummary.points.toLocaleString('es-CL')}</div>
          </div>
          <div className="col-span-2 lg:col-span-5 text-caption text-muted-foreground">
            Última lectura: {visibleSummary.latestAt.toLocaleString('es-CL')}
          </div>
        </div>
      )}

      <div style={{ height: `${chartHeight}px` }} className="relative">
        {supportsRealtimeZoom && (
          <div className="absolute right-2 top-2 z-10 flex gap-2">
            <button
              type="button"
              onClick={zoomToNow}
              className="px-2 py-1 text-xs rounded-ctl border border-border bg-white/90 shadow-sm hover:bg-white dark:border-border dark:bg-muted-foreground/[0.10] dark:hover:bg-muted"
              title="Zoom al tiempo actual"
            >
              Ahora
            </button>
            <button
              type="button"
              onClick={resetZoom}
              className="px-2 py-1 text-xs rounded-ctl border border-border bg-white/90 shadow-sm hover:bg-white dark:border-border dark:bg-muted-foreground/[0.10] dark:hover:bg-muted"
              title="Restablecer zoom"
            >
              Reset
            </button>
          </div>
        )}
        {chartElement}
      </div>

      {recentReadings.length > 0 && (
        <div className="rounded-ctl border overflow-x-auto">
          <table className="w-full text-xs">
            <thead>
              <tr className="border-b bg-muted">
                <th className="py-1.5 px-2 text-left">Hora</th>
                <th className="py-1.5 px-2 text-right">Temperatura</th>
                <th className="py-1.5 px-2 text-right">Humedad</th>
              </tr>
            </thead>
            <tbody>
              {recentReadings.map((reading, index) => (
                <tr key={`${reading.timestamp.getTime()}-${index}`} className="border-b last:border-b-0 hover:bg-muted/20">
                  <td className="py-1.5 px-2 text-muted-foreground">{reading.timestamp.toLocaleString('es-CL')}</td>
                  <td className="py-1.5 px-2 text-right font-medium">{reading.temperatura.toFixed(1)} °C</td>
                  <td className="py-1.5 px-2 text-right font-medium">{reading.humedad.toFixed(1)} %</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
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
    const entry = grouped[hour]!
    entry.avgTemp = Math.round((entry.avgTemp / entry.count) * 10) / 10
    entry.avgHumidity = Math.round((entry.avgHumidity / entry.count) * 10) / 10
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

function clamp100(value: number): number {
  if (!Number.isFinite(value)) return 0
  return Math.max(0, Math.min(100, value))
}

function missingRatio(data: TelemetryDataPoint[]): number {
  if (data.length === 0) return 1
  let missing = 0
  for (const d of data) {
    if (!Number.isFinite(d.temperatura) || !Number.isFinite(d.humedad)) missing++
  }
  return missing / data.length
}

function buildHeatmapMatrix(data: TelemetryDataPoint[]) {
  // Matriz 7x24: promedio temperatura por día/hora
  const buckets: Record<string, { sum: number; count: number }> = {}

  for (const d of data) {
    const day = d.timestamp.getDay() // 0-6
    const hour = d.timestamp.getHours() // 0-23
    const key = `${day}-${hour}`
    if (!buckets[key]) buckets[key] = { sum: 0, count: 0 }
    buckets[key].sum += d.temperatura
    buckets[key].count++
  }

  const out: Array<{ x: number; y: number; v: number }> = []
  for (let day = 0; day < 7; day++) {
    for (let hour = 0; hour < 24; hour++) {
      const key = `${day}-${hour}`
      const b = buckets[key]
      const v = b ? b.sum / b.count : NaN
      out.push({ x: hour, y: day, v: Number.isFinite(v) ? v : 0 })
    }
  }

  return out
}

function buildCandles(data: TelemetryDataPoint[]) {
  // OHLC por 2 horas
  const MS_2H = 2 * 60 * 60 * 1000
  const sorted = [...data].sort((a, b) => a.timestamp.getTime() - b.timestamp.getTime())
  if (sorted.length === 0) return []

  const firstTs = sorted[0]!.timestamp.getTime()
  const buckets: Record<number, TelemetryDataPoint[]> = {}

  for (const d of sorted) {
    const bucket = Math.floor((d.timestamp.getTime() - firstTs) / MS_2H)
    if (!buckets[bucket]) buckets[bucket] = []
    buckets[bucket].push(d)
  }

  return Object.keys(buckets)
    .map(k => Number(k))
    .sort((a, b) => a - b)
    .map(bucket => {
      const points = buckets[bucket]!
      const open = points[0]!.temperatura
      const close = points[points.length - 1]!.temperatura
      const high = Math.max(...points.map(p => p.temperatura), open, close)
      const low = Math.min(...points.map(p => p.temperatura), open, close)
      return { x: points[0]!.timestamp, o: open, h: high, l: low, c: close }
    })
}
