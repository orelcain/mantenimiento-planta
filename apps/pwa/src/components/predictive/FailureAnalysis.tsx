import { useEffect, useState, useMemo } from 'react'
import { Card, CardContent, CardHeader, CardTitle, Badge } from '@/components/ui'
import { getIncidents } from '@/services/incidents'
import type { Incident } from '@/types'
import {
  Chart as ChartJS,
  CategoryScale,
  LinearScale,
  BarElement,
  Title,
  Tooltip,
  Legend,
  ArcElement,
} from 'chart.js'
import { Bar, Pie } from 'react-chartjs-2'
import { Loader2, BrainCircuit, AlertTriangle, CheckCircle2 } from 'lucide-react'

// Registrar componentes de ChartJS
ChartJS.register(
  CategoryScale,
  LinearScale,
  BarElement,
  Title,
  Tooltip,
  Legend,
  ArcElement
)

export function FailureAnalysis() {
  const [incidents, setIncidents] = useState<Incident[]>([])
  const [loading, setLoading] = useState(true)

  // Cargar datos al montar
  useEffect(() => {
    async function loadData() {
        try {
            // Traemos las últimas 50 incidencias para análisis
            const data = await getIncidents({ limit: 50 })
            setIncidents(data)
        } catch (error) {
            console.error(error)
        } finally {
            setLoading(false)
        }
    }
    loadData()
  }, [])

  // 1. Estadísticas de Síntomas (Top 8)
  const symptomStats = useMemo(() => {
    const stats: Record<string, number> = {}
    incidents.forEach(inc => {
        if (inc.sintomas && Array.isArray(inc.sintomas)) {
            inc.sintomas.forEach(s => {
                // Normalizar texto
                const clean = s.trim()
                stats[clean] = (stats[clean] || 0) + 1
            })
        }
    })
    return Object.entries(stats)
        .sort((a, b) => b[1] - a[1])
        .slice(0, 8) 
  }, [incidents])

  // Data para Gráfico de Barras
  const symptomData = {
    labels: symptomStats.map(s => s[0]),
    datasets: [
        {
            label: 'Ocurrencias',
            data: symptomStats.map(s => s[1]),
            backgroundColor: 'rgba(59, 130, 246, 0.7)',
            borderColor: 'rgba(59, 130, 246, 1)',
            borderWidth: 1,
            borderRadius: 4,
        }
    ]
  }

  // 2. Estadísticas de Estado
  const statusData = useMemo(() => {
    const stats: Record<string, number> = {
        'pendiente': 0,
        'en_proceso': 0,
        'cerrada': 0,
        'confirmada': 0,
        'rechazada': 0
    }
    
    incidents.forEach(inc => {
        const s = inc.status || 'pendiente'
        // Type safeguard
        if (Object.prototype.hasOwnProperty.call(stats, s)) {
            stats[s] = (stats[s] || 0) + 1
        }
    })

    return {
        labels: ['Pendiente', 'En Proceso', 'Confirmada', 'Cerrada', 'Rechazada'],
        datasets: [{
            data: [stats.pendiente, stats.en_proceso, stats.confirmada, stats.cerrada, stats.rechazada],
            backgroundColor: [
                '#fbbf24', // Pendiente (Warning)
                '#3b82f6', // En proceso (Blue)
                '#10b981', // Confirmada (Emerald)
                '#22c55e', // Cerrada (Green)
                '#ef4444', // Rechazada (Red)
            ],
            borderWidth: 0
        }]
    }
  }, [incidents])

  if (loading) {
      return (
          <div className="flex flex-col items-center justify-center p-12 text-muted-foreground">
              <Loader2 className="h-8 w-8 animate-spin mb-2" />
              <p>Analizando datos de fallas...</p>
          </div>
      )
  }

  if (incidents.length === 0) {
      return (
          <div className="p-8 text-center border rounded-lg bg-muted/20">
              <AlertTriangle className="h-10 w-10 text-muted-foreground mx-auto mb-2" />
              <p>No hay suficientes datos para realizar un análisis de fallas aún.</p>
          </div>
      )
  }

  return (
    <div className="space-y-6 animate-in fade-in duration-500">
        {/* KPI Cards */}
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
            <Card>
                <CardContent className="pt-6">
                    <div className="text-2xl font-bold">{incidents.length}</div>
                    <p className="text-xs text-muted-foreground">Incidencias Analizadas</p>
                </CardContent>
            </Card>
            <Card>
                <CardContent className="pt-6">
                    <div className="text-2xl font-bold text-blue-600 truncate">
                        {symptomStats.length > 0 && symptomStats[0] ? symptomStats[0][0] : 'N/A'}
                    </div>
                    <p className="text-xs text-muted-foreground">Síntoma Top #1</p>
                </CardContent>
            </Card>
            <Card>
                <CardContent className="pt-6">
                     {/* Calcula tasa de resolución simple */}
                    <div className="text-2xl font-bold text-green-600">
                        {incidents.length > 0 
                            ? Math.round((incidents.filter(i => i.status === 'cerrada' || i.status === 'confirmada').length / incidents.length) * 100)
                            : 0}%
                    </div>
                    <p className="text-xs text-muted-foreground">Tasa Resolución</p>
                </CardContent>
            </Card>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
            {/* Gráfico de Síntomas */}
            <Card className="col-span-1">
                <CardHeader>
                    <CardTitle className="text-base flex items-center gap-2">
                        <BrainCircuit className="h-4 w-4 text-primary" />
                        Pareto de Síntomas
                    </CardTitle>
                </CardHeader>
                <CardContent>
                    <div className="h-[300px] w-full">
                         <Bar 
                            data={symptomData} 
                            options={{ 
                                indexAxis: 'y', 
                                responsive: true,
                                maintainAspectRatio: false,
                                plugins: { legend: { display: false } },
                                scales: {
                                    x: { grid: { display: false } },
                                    y: { grid: { display: false } }
                                }
                            }} 
                         />
                    </div>
                </CardContent>
            </Card>

            {/* Gráfico de Estado */}
            <Card className="col-span-1">
                <CardHeader>
                    <CardTitle className="text-base">Distribución de Estados</CardTitle>
                </CardHeader>
                <CardContent className="flex justify-center items-center">
                    <div className="h-[250px] w-[250px] relative">
                         <Pie 
                            data={statusData}
                            options={{ 
                                responsive: true,
                                maintainAspectRatio: false,
                                plugins: { 
                                    legend: { position: 'bottom' } 
                                }
                            }} 
                         />
                    </div>
                </CardContent>
            </Card>
        </div>

        {/* Listado Reciente */}
        <Card>
            <CardHeader>
                <CardTitle className="text-base">Últimos Hallazgos Críticos</CardTitle>
            </CardHeader>
            <CardContent>
                <div className="space-y-4">
                    {incidents
                        .filter(i => i.prioridad === 'critica' || i.prioridad === 'alta')
                        .slice(0, 5)
                        .map(inc => (
                        <div key={inc.id} className="flex flex-col sm:flex-row sm:items-center justify-between border-b pb-3 last:border-0 last:pb-0 gap-2">
                            <div>
                                <div className="flex items-center gap-2">
                                    <Badge variant={inc.prioridad === 'critica' ? 'destructive' : 'warning'} className="text-[10px] px-1 py-0 h-5">
                                        {inc.prioridad.toUpperCase()}
                                    </Badge>
                                    <span className="font-medium text-sm">{inc.titulo}</span>
                                </div>
                                <p className="text-xs text-muted-foreground mt-1 line-clamp-1">
                                    {inc.descripcion}
                                </p>
                            </div>
                            <div className="flex flex-wrap gap-1">
                                {inc.sintomas?.slice(0, 3).map(s => (
                                    <Badge key={s} variant="secondary" className="text-[10px] h-5 font-normal bg-blue-50 text-blue-700 hover:bg-blue-100">
                                        {s}
                                    </Badge>
                                ))}
                            </div>
                        </div>
                    ))}
                    {incidents.filter(i => i.prioridad === 'critica' || i.prioridad === 'alta').length === 0 && (
                        <p className="text-sm text-muted-foreground text-center py-4">
                            <CheckCircle2 className="h-4 w-4 inline mr-2 text-green-500" />
                            No hay hallazgos críticos recientes.
                        </p>
                    )}
                </div>
            </CardContent>
        </Card>
    </div>
  )
}
