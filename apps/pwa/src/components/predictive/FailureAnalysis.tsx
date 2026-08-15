import { useEffect, useState, useMemo, useRef } from 'react'
import { 
    Card, CardContent, CardHeader, CardTitle, 
    Badge, 
    Dialog, DialogContent, DialogHeader, DialogTitle 
} from '@/components/ui'
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
import { Loader2, BrainCircuit, AlertTriangle, ChevronRight, CheckCircle2, Calendar } from 'lucide-react'
import { logger } from '@/lib/logger'

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
  const [selectedSymptom, setSelectedSymptom] = useState<string | null>(null)
  const [selectedIncident, setSelectedIncident] = useState<Incident | null>(null)
  const chartRef = useRef<any>(null)

  // Cargar datos al montar
  useEffect(() => {
    async function loadData() {
        try {
            // Traemos las últimas 50 incidencias para análisis
            const data = await getIncidents({ limit: 50 })
            setIncidents(data)
        } catch (error) {
            logger.error('Error al cargar incidencias para análisis', error instanceof Error ? error : new Error(String(error)))
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
          <div className="p-8 text-center border rounded-card bg-muted">
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
            <Card 
                className="cursor-pointer hover:bg-muted/50 transition-colors relative overflow-hidden group"
                onClick={() => {
                   const topSymptom = symptomStats[0]
                   if (topSymptom) {
                      setSelectedSymptom(topSymptom[0])
                   }
                }}
            >
                <CardContent className="pt-6 relative z-10">
                    <div className="text-2xl font-bold text-blue-600 truncate flex items-center gap-2">
                        {symptomStats.length > 0 && symptomStats[0] ? symptomStats[0][0] : 'N/A'}
                        {symptomStats.length > 0 && <ChevronRight className="h-4 w-4 text-muted-foreground opacity-0 group-hover:opacity-100 transition-opacity" />}
                    </div>
                    <p className="text-xs text-muted-foreground">Síntoma Top #1 (Click para ver)</p>
                </CardContent>
                <div className="absolute right-0 top-0 h-full w-1 bg-blue-500 transform scale-y-0 group-hover:scale-y-100 transition-transform origin-bottom" />
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
                            ref={chartRef}
                            data={symptomData} 
                            options={{ 
                                indexAxis: 'y', 
                                responsive: true,
                                maintainAspectRatio: false,
                                plugins: { 
                                    legend: { display: false },
                                    tooltip: {
                                        callbacks: {
                                            label: (ctx) => `${ctx.raw} incidencias`
                                        }
                                    }
                                },
                                scales: {
                                    x: { grid: { display: false } },
                                    y: { grid: { display: false } }
                                },
                                onClick: (_evt, elements) => {
                                    if (elements.length > 0 && elements[0]) {
                                        const idx = elements[0].index
                                        const label = symptomData.labels[idx]
                                        if (label) setSelectedSymptom(label)
                                    }
                                },
                                onHover: (event, chartElement) => {
                                    // @ts-expect-error - Chart.js types definition issue with event target
                                    event.native.target.style.cursor = chartElement.length ? 'pointer' : 'default'
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
                                    legend: { position: 'bottom' },
                                    tooltip: {
                                        callbacks: {
                                            // El tooltip por defecto solo mostraba el conteo: agregamos el % sobre el total.
                                            label: (ctx) => {
                                                const total = (ctx.dataset.data as number[]).reduce((sum, v) => sum + v, 0)
                                                const value = ctx.raw as number
                                                const pct = total > 0 ? ((value / total) * 100).toFixed(0) : '0'
                                                return `${ctx.label}: ${value} (${pct}%)`
                                            }
                                        }
                                    }
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
                                    <Badge variant={inc.prioridad === 'critica' ? 'destructive' : 'warning'} className="text-caption px-1 py-0 h-5">
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
                                    <Badge key={s} variant="secondary" className="text-caption h-5 font-normal bg-blue-500/[0.15] text-ink-info hover:bg-blue-500/[0.15]">
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

        {/* Modal Detalle de Síntomas */}
        <Dialog open={!!selectedSymptom} onOpenChange={(open) => !open && setSelectedSymptom(null)}>
            <DialogContent className="max-w-2xl max-h-[85vh] overflow-y-auto w-[95%] rounded-card">
                <DialogHeader className="pb-4 border-b">
                    <DialogTitle className="flex items-center gap-2 text-xl">
                        <AlertTriangle className="h-6 w-6 text-cat-4-ink" />
                        Incidencias: <span className="text-primary">"{selectedSymptom}"</span>
                    </DialogTitle>
                </DialogHeader>
                
                <div className="space-y-4 mt-4">
                    {incidents
                        .filter(i => i.sintomas?.includes(selectedSymptom || ''))
                        .map(inc => (
                             <div 
                                key={inc.id} 
                                onClick={() => setSelectedIncident(inc)}
                                className="border rounded-card p-4 bg-card hover:bg-muted transition-colors animate-in slide-in-from-bottom-2 duration-300 cursor-pointer group"
                             >
                                <div className="flex flex-col sm:flex-row sm:justify-between sm:items-start mb-2 gap-2">
                                    <h4 className="font-semibold text-base leading-tight group-hover:text-primary transition-colors">{inc.titulo}</h4>
                                    <Badge variant={inc.prioridad === 'critica' ? 'destructive' : inc.prioridad === 'alta' ? 'warning' : 'outline'} className="w-fit">
                                        {inc.prioridad?.toUpperCase()}
                                    </Badge>
                                </div>
                                <p className="text-sm text-foreground/80 mb-3 line-clamp-2">{inc.descripcion}</p>
                                
                                <div className="flex items-center gap-4 text-xs text-muted-foreground pt-2 border-t">
                                    <div className="flex items-center gap-1.5">
                                        <Calendar className="h-3.5 w-3.5" />
                                        <span>
                                            {inc.createdAt ? new Date((inc.createdAt as any).seconds ? (inc.createdAt as any).seconds * 1000 : inc.createdAt).toLocaleDateString() : 'N/A'}
                                        </span>
                                    </div>
                                    <div className="flex items-center gap-1.5">
                                       <div className={`h-2 w-2 rounded-full ${inc.status === 'confirmada' ? 'bg-green-500' : inc.status === 'pendiente' ? 'bg-amber-500' : 'bg-muted-foreground'}`} />
                                       {inc.status?.toUpperCase()}
                                    </div>
                                    {inc.equipmentId && (
                                       <Badge variant="secondary" className="text-caption ml-auto">
                                            EQUIPO REF.
                                       </Badge>
                                    )}
                                </div>
                             </div>
                        ))
                    }
                    {incidents.filter(i => i.sintomas?.includes(selectedSymptom || '')).length === 0 && (
                        <div className="text-center py-12 text-muted-foreground flex flex-col items-center">
                            <CheckCircle2 className="h-12 w-12 mb-2 text-muted" />
                            <p>No se encontraron incidencias activas para este síntoma.</p>
                        </div>
                    )}
                </div>
            </DialogContent>
        </Dialog>

        {/* Modal Detalle de Incidencia */}
        <Dialog open={!!selectedIncident} onOpenChange={(open) => !open && setSelectedIncident(null)}>
            <DialogContent className="max-w-3xl max-h-[90vh] overflow-y-auto w-[95%] rounded-card">
                 {selectedIncident && (
                    <>
                        <DialogHeader className="pb-4 border-b">
                            <div className="flex flex-col gap-2">
                                <div className="flex justify-between items-start">
                                    <DialogTitle className="text-xl font-bold leading-tight pr-8">
                                        {selectedIncident.titulo}
                                    </DialogTitle>
                                    <Badge variant={selectedIncident.prioridad === 'critica' ? 'destructive' : selectedIncident.prioridad === 'alta' ? 'warning' : 'outline'}>
                                        {selectedIncident.prioridad?.toUpperCase()}
                                    </Badge>
                                </div>
                                <div className="flex items-center gap-3 text-sm text-muted-foreground">
                                    <div className="flex items-center gap-1">
                                        <Calendar className="h-4 w-4" />
                                        {selectedIncident.createdAt ? new Date((selectedIncident.createdAt as any).seconds ? (selectedIncident.createdAt as any).seconds * 1000 : selectedIncident.createdAt).toLocaleDateString() : 'N/A'}
                                    </div>
                                    <Badge variant="secondary" className="text-xs">
                                        {selectedIncident.status?.toUpperCase().replace('_', ' ')}
                                    </Badge>
                                </div>
                            </div>
                        </DialogHeader>

                        <div className="space-y-6 mt-4">
                            {/* Descripción */}
                            <div>
                                <h4 className="text-sm font-semibold mb-2 text-muted-foreground tracking-wider">Descripción del Hallazgo</h4>
                                <div className="p-4 bg-muted rounded-card text-sm leading-relaxed whitespace-pre-wrap">
                                    {selectedIncident.descripcion}
                                </div>
                            </div>

                            {/* Equipo y Ubicación */}
                            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                                {selectedIncident.equipmentId && (
                                    <div className="border rounded-card p-3">
                                        <div className="text-xs text-muted-foreground mb-1">Equipo Afectado</div>
                                        <div className="font-medium flex items-center gap-2">
                                            <BrainCircuit className="h-4 w-4 text-blue-500" />
                                            {selectedIncident.equipmentId}
                                        </div>
                                    </div>
                                )}
                                <div className="border rounded-card p-3">
                                    <div className="text-xs text-muted-foreground mb-1">Reportado Por</div>
                                    <div className="font-medium truncate">
                                        {selectedIncident.creadoPorNombre || 'Usuario del Sistema'}
                                    </div>
                                </div>
                            </div>

                            {/* Síntomas Detectados */}
                            {selectedIncident.sintomas && selectedIncident.sintomas.length > 0 && (
                                <div>
                                    <h4 className="text-sm font-semibold mb-2 text-muted-foreground tracking-wider">Síntomas Identificados</h4>
                                    <div className="flex flex-wrap gap-2">
                                        {selectedIncident.sintomas.map(s => (
                                            <Badge key={s} variant="secondary" className="px-3 py-1 text-secondary-foreground">
                                                {s}
                                            </Badge>
                                        ))}
                                    </div>
                                </div>
                            )}

                            {/* Evidencias / Fotos */}
                            {selectedIncident.fotos && selectedIncident.fotos.length > 0 && (
                                <div>
                                    <h4 className="text-sm font-semibold mb-2 text-muted-foreground tracking-wider">Evidencia Fotográfica</h4>
                                    <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
                                        {selectedIncident.fotos.map((foto, idx) => (
                                            <a key={idx} href={foto} target="_blank" rel="noopener noreferrer" className="relative aspect-square rounded-card overflow-hidden border group cursor-zoom-in">
                                                <img src={foto} alt={`Evidencia ${idx + 1}`} className="object-cover w-full h-full transition-transform group-hover:scale-105" />
                                            </a>
                                        ))}
                                    </div>
                                </div>
                            )}

                            {/* Resolución (si existe) */}
                            {selectedIncident.resolucion && (
                                <div className="bg-green-500/[0.15] border border-emerald-500/[0.25] rounded-card p-4">
                                    <h4 className="text-sm font-semibold mb-1 text-ink-ok flex items-center gap-2">
                                        <CheckCircle2 className="h-4 w-4" />
                                        Resolución Aplicada
                                    </h4>
                                    <p className="text-sm text-ink-ok">
                                        {selectedIncident.resolucion}
                                    </p>
                                </div>
                            )}
                        </div>
                    </>
                 )}
            </DialogContent>
        </Dialog>
    </div>
  )
}
