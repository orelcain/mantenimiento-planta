// src/components/equipment/TelemetryChart.tsx
import { useEffect, useMemo, useState } from 'react'
import { Line } from 'react-chartjs-2'
import {
  Chart as ChartJS,
  CategoryScale,
  LinearScale,
  PointElement,
  LineElement,
  Title,
  Tooltip,
  Legend,
  TimeScale,
  TooltipItem,
} from 'chart.js'
import 'chartjs-adapter-date-fns'
import { es } from 'date-fns/locale'
import { Card, CardContent, CardHeader, CardTitle, Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui'
import { fetchSensorHistory, type SensorReading } from '@/services/sensorsRtdb'
import { Loader2 } from 'lucide-react'
import { logger } from '@/lib/logger'

ChartJS.register(
  CategoryScale,
  LinearScale,
  PointElement,
  LineElement,
  Title,
  Tooltip,
  Legend,
  TimeScale
)

interface TelemetryChartProps {
  equipmentId: string
}

type TimeRange = '1h' | '6h' | '24h' | '7d'

export function TelemetryChart({ equipmentId }: TelemetryChartProps) {
  const [timeRange, setTimeRange] = useState<TimeRange>('24h')
  const [loading, setLoading] = useState(false)
  const [data, setData] = useState<SensorReading[]>([])

  useEffect(() => {
    let isActive = true
    const loadData = async () => {
      setLoading(true)
      try {
        // Calcular timestamp de inicio según rango
        const now = Date.now()
        let startTs = now
        switch (timeRange) {
          case '1h': startTs = now - 60 * 60 * 1000; break;
          case '6h': startTs = now - 6 * 60 * 60 * 1000; break;
          case '24h': startTs = now - 24 * 60 * 60 * 1000; break;
          case '7d': startTs = now - 7 * 24 * 60 * 60 * 1000; break;
        }

        const history = await fetchSensorHistory(equipmentId, startTs, now)
        if (isActive) {
          setData(history)
        }
      } catch (error) {
        logger.error('Error loading telemetry', error instanceof Error ? error : new Error(String(error)))
      } finally {
        if (isActive) setLoading(false)
      }
    }

    loadData()
    return () => { isActive = false }
  }, [equipmentId, timeRange])

  const chartData = useMemo(() => {
    return {
        datasets: [
          {
            label: 'Temperatura (°C)',
            data: data.map(d => ({ x: d.timestamp, y: d.temperature })),
            borderColor: 'rgb(255, 99, 132)',
            backgroundColor: 'rgba(255, 99, 132, 0.5)',
            yAxisID: 'y',
            tension: 0.3,
            pointRadius: data.length > 50 ? 0 : 3, // Ocultar puntos si hay muchos datos
            pointHitRadius: 10,
          },
          {
            label: 'Humedad (%)',
            data: data.map(d => ({ x: d.timestamp, y: d.humidity })),
            borderColor: 'rgb(53, 162, 235)',
            backgroundColor: 'rgba(53, 162, 235, 0.5)',
            yAxisID: 'y1',
            tension: 0.3,
            pointRadius: data.length > 50 ? 0 : 3,
            pointHitRadius: 10,
          }
        ]
      }
  }, [data])

  const visibleStats = useMemo(() => {
    if (data.length === 0) return null

    const latest = data[data.length - 1]
    if (!latest) return null
    const temperatures = data.map((point) => point.temperature)
    const humidities = data.map((point) => point.humidity)

    const avg = (values: number[]) => values.reduce((acc, n) => acc + n, 0) / values.length

    return {
      latestAt: latest.timestamp,
      temp: {
        latest: latest.temperature,
        avg: avg(temperatures),
        min: Math.min(...temperatures),
        max: Math.max(...temperatures),
      },
      hum: {
        latest: latest.humidity,
        avg: avg(humidities),
        min: Math.min(...humidities),
        max: Math.max(...humidities),
      },
    }
  }, [data])

  const options: any = {
    responsive: true,
    maintainAspectRatio: false,
    interaction: {
      mode: 'index' as const,
      intersect: false,
    },
    stacked: false,
    plugins: {
      legend: {
        position: 'top' as const,
      },
      tooltip: {
        callbacks: {
            title: (items: TooltipItem<any>[]) => {
                if (!items.length || !items[0]?.parsed) return ''
                const date = new Date(items[0].parsed.x)
                return date.toLocaleString('es-CL')
            }
        }
      }
    },
    scales: {
      x: {
        type: 'time',
        time: {
            unit: timeRange === '1h' ? 'minute' : (timeRange === '7d' ? 'day' : 'hour'),
            displayFormats: {
                minute: 'HH:mm',
                hour: 'HH:mm',
                day: 'dd/MM'
            },
            tooltipFormat: 'dd MMM HH:mm'
        },
        adapters: {
            date: {
                locale: es
            }
        },
        grid: {
            display: false
        }
      },
      y: {
        type: 'linear' as const,
        display: true,
        position: 'left' as const,
        title: {
            display: true,
            text: 'Temperatura (°C)'
        }
      },
      y1: {
        type: 'linear' as const,
        display: true,
        position: 'right' as const,
        grid: {
          drawOnChartArea: false,
        },
        title: {
            display: true,
            text: 'Humedad (%)'
        },
        min: 0,
        max: 100
      },
    },
  }

  return (
    <Card className="h-full flex flex-col">
      <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
        <CardTitle className="text-base font-normal">Historial de Telemetría</CardTitle>
        <Select value={timeRange} onValueChange={(v: TimeRange) => setTimeRange(v)}>
          <SelectTrigger className="w-[120px] h-8 text-xs">
            <SelectValue placeholder="Rango" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="1h">1 Hora</SelectItem>
            <SelectItem value="6h">6 Horas</SelectItem>
            <SelectItem value="24h">24 Horas</SelectItem>
            <SelectItem value="7d">7 Días</SelectItem>
          </SelectContent>
        </Select>
      </CardHeader>
      <CardContent className="flex-1 min-h-[300px] relative">
        {visibleStats && (
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-2 mb-3">
            <div className="rounded-md border p-2 bg-muted">
              <div className="text-[10px] text-muted-foreground">Temperatura actual</div>
              <div className="text-sm font-semibold">{visibleStats.temp.latest.toFixed(1)} °C</div>
            </div>
            <div className="rounded-md border p-2 bg-muted">
              <div className="text-[10px] text-muted-foreground">Humedad actual</div>
              <div className="text-sm font-semibold">{visibleStats.hum.latest.toFixed(1)} %</div>
            </div>
            <div className="rounded-md border p-2 bg-muted">
              <div className="text-[10px] text-muted-foreground">Temp promedio / min-max</div>
              <div className="text-sm font-semibold">
                {visibleStats.temp.avg.toFixed(1)} °C
                <span className="text-xs text-muted-foreground"> · {visibleStats.temp.min.toFixed(1)}-{visibleStats.temp.max.toFixed(1)}</span>
              </div>
            </div>
            <div className="rounded-md border p-2 bg-muted">
              <div className="text-[10px] text-muted-foreground">Hum promedio / min-max</div>
              <div className="text-sm font-semibold">
                {visibleStats.hum.avg.toFixed(1)} %
                <span className="text-xs text-muted-foreground"> · {visibleStats.hum.min.toFixed(1)}-{visibleStats.hum.max.toFixed(1)}</span>
              </div>
            </div>
            <div className="col-span-2 lg:col-span-4 text-[10px] text-muted-foreground">
              Última lectura: {new Date(visibleStats.latestAt).toLocaleString('es-CL')}
            </div>
          </div>
        )}
        {loading && (
            <div className="absolute inset-0 flex items-center justify-center bg-background/50 z-10">
                <Loader2 className="h-8 w-8 animate-spin text-primary" />
            </div>
        )}
        {data.length > 0 ? (
            <div className="h-[300px] w-full">
                <Line options={options} data={chartData} />
            </div>
        ) : (
            <div className="h-full flex items-center justify-center text-muted-foreground text-sm">
                {!loading && "No hay datos disponibles para este periodo"}
            </div>
        )}
      </CardContent>
    </Card>
  )
}
