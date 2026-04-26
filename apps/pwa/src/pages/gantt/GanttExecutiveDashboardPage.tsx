import { useEffect, useMemo, useState } from 'react'
import { AlertTriangle, Clock3, Gauge, Target } from 'lucide-react'
import { Badge, Card, CardContent, CardHeader, CardTitle } from '@/components/ui'
import { buildGanttMetrics, calculateCPM, getGanttTasks } from '@/services/gantt'
import type { GanttTask } from '@/types'

interface ResourceLoadRow {
  responsible: string
  activeTasks: number
  criticalTasks: number
  delayedTasks: number
  workloadHours: number
  status: 'balanceado' | 'alto' | 'sobrecargado'
}

export function GanttExecutiveDashboardPage() {
  const [tasks, setTasks] = useState<GanttTask[]>([])
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    async function load() {
      setLoading(true)
      setError(null)
      try {
        setTasks(await getGanttTasks())
      } catch (e) {
        setError(e instanceof Error ? e.message : 'Error cargando dashboard ejecutivo')
      } finally {
        setLoading(false)
      }
    }
    load()
  }, [])

  const metrics = useMemo(() => buildGanttMetrics(tasks), [tasks])
  const cpm = useMemo(() => calculateCPM(tasks), [tasks])
  const criticalSet = useMemo(() => new Set(cpm.criticalPath), [cpm.criticalPath])

  const delayedCritical = useMemo(() => {
    const now = Date.now()
    return tasks.filter((task) => criticalSet.has(task.id) && task.status !== 'completada' && task.endDate.getTime() < now)
  }, [criticalSet, tasks])

  const resourceLoad = useMemo<ResourceLoadRow[]>(() => {
    const now = Date.now()
    const grouped = new Map<string, ResourceLoadRow>()

    tasks
      .filter((task) => task.status !== 'completada')
      .forEach((task) => {
        const responsible = task.responsibleName || 'Sin asignar'
        const current = grouped.get(responsible) ?? {
          responsible,
          activeTasks: 0,
          criticalTasks: 0,
          delayedTasks: 0,
          workloadHours: 0,
          status: 'balanceado',
        }

        current.activeTasks += 1
        current.workloadHours += task.estimatedHours || 0
        if (criticalSet.has(task.id)) current.criticalTasks += 1
        if (task.endDate.getTime() < now) current.delayedTasks += 1

        grouped.set(responsible, current)
      })

    return Array.from(grouped.values())
      .map((row) => {
        const status: ResourceLoadRow['status'] = row.workloadHours > 48
          ? 'sobrecargado'
          : row.workloadHours > 32
            ? 'alto'
            : 'balanceado'
        return { ...row, workloadHours: Number(row.workloadHours.toFixed(1)), status }
      })
      .sort((a, b) => b.workloadHours - a.workloadHours)
  }, [criticalSet, tasks])

  const overloadedResources = useMemo(
    () => resourceLoad.filter((row) => row.status === 'sobrecargado').length,
    [resourceLoad]
  )

  const riskByPredictive = useMemo(() => {
    return {
      critico: tasks.filter((task) => task.predictiveRiskLevel === 'critico').length,
      alto: tasks.filter((task) => task.predictiveRiskLevel === 'alto').length,
    }
  }, [tasks])

  return (
    <div className="space-y-4">
      <div>
        <h1 className="text-2xl font-bold">Gantt Ejecutivo</h1>
        <p className="text-sm text-muted-foreground">Vista de temporada baja con foco en riesgo, ruta crítica y cumplimiento</p>
      </div>

      {error && <p className="text-sm text-destructive">{error}</p>}
      {loading && <p className="text-sm text-muted-foreground">Cargando indicadores...</p>}

      <div className="grid gap-4 md:grid-cols-4">
        <Card>
          <CardHeader className="pb-2"><CardTitle className="text-sm flex items-center gap-2"><Gauge className="h-4 w-4" /> Avance promedio</CardTitle></CardHeader>
          <CardContent className="text-2xl font-bold">{metrics.averageProgress}%</CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-2"><CardTitle className="text-sm flex items-center gap-2"><Clock3 className="h-4 w-4" /> Duración estimada</CardTitle></CardHeader>
          <CardContent className="text-2xl font-bold">{metrics.estimatedDurationHours}h</CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-2"><CardTitle className="text-sm flex items-center gap-2"><Target className="h-4 w-4" /> Tareas críticas</CardTitle></CardHeader>
          <CardContent className="text-2xl font-bold">{metrics.criticalTasks}</CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-2"><CardTitle className="text-sm flex items-center gap-2"><AlertTriangle className="h-4 w-4" /> Críticas atrasadas</CardTitle></CardHeader>
          <CardContent className="text-2xl font-bold">{delayedCritical.length}</CardContent>
        </Card>
      </div>

      <div className="grid gap-4 md:grid-cols-3">
        <Card>
          <CardHeader className="pb-2"><CardTitle className="text-sm">Recursos sobrecargados</CardTitle></CardHeader>
          <CardContent className="text-2xl font-bold">{overloadedResources}</CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-2"><CardTitle className="text-sm">Riesgo predictivo crítico</CardTitle></CardHeader>
          <CardContent className="text-2xl font-bold">{riskByPredictive.critico}</CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-2"><CardTitle className="text-sm">Riesgo predictivo alto</CardTitle></CardHeader>
          <CardContent className="text-2xl font-bold">{riskByPredictive.alto}</CardContent>
        </Card>
      </div>

      <Card>
        <CardHeader><CardTitle>Ruta crítica</CardTitle></CardHeader>
        <CardContent className="space-y-2">
          {cpm.criticalPath.length === 0 && <p className="text-sm text-muted-foreground">Sin ruta crítica calculada.</p>}
          {cpm.criticalPath.map((taskId) => {
            const task = tasks.find((item) => item.id === taskId)
            if (!task) return null
            return (
              <div key={task.id} className="rounded border p-3 flex flex-col gap-1">
                <div className="flex items-center justify-between">
                  <p className="font-medium">{task.titulo}</p>
                  <Badge variant={task.status === 'completada' ? 'success' : 'destructive'}>{task.status}</Badge>
                </div>
                <p className="text-xs text-muted-foreground">{task.equipmentNombre ?? 'Sin equipo'} · progreso {task.progress}%</p>
              </div>
            )
          })}
        </CardContent>
      </Card>

      <Card>
        <CardHeader><CardTitle>Alertas de riesgo</CardTitle></CardHeader>
        <CardContent className="space-y-2">
          {delayedCritical.length === 0 && <p className="text-sm text-muted-foreground">No hay atrasos críticos en este momento.</p>}
          {delayedCritical.map((task) => (
            <div key={task.id} className="rounded border border-destructive/40 p-3">
              <p className="font-medium text-destructive">{task.titulo}</p>
              <p className="text-xs text-muted-foreground">Fin planificado: {task.endDate.toLocaleString('es-CL')} · Responsable: {task.responsibleName ?? 'Sin asignar'}</p>
            </div>
          ))}
        </CardContent>
      </Card>

      <Card>
        <CardHeader><CardTitle>Carga de recursos</CardTitle></CardHeader>
        <CardContent className="space-y-2">
          {resourceLoad.length === 0 && <p className="text-sm text-muted-foreground">No hay carga activa para analizar.</p>}
          {resourceLoad.map((row) => (
            <div key={row.responsible} className="rounded border p-3">
              <div className="flex items-center justify-between gap-2">
                <p className="font-medium">{row.responsible}</p>
                <Badge variant={row.status === 'sobrecargado' ? 'destructive' : row.status === 'alto' ? 'warning' : 'success'}>
                  {row.status}
                </Badge>
              </div>
              <p className="text-xs text-muted-foreground mt-1">
                Horas activas: {row.workloadHours}h · tareas: {row.activeTasks} · críticas: {row.criticalTasks} · atrasadas: {row.delayedTasks}
              </p>
            </div>
          ))}
        </CardContent>
      </Card>
    </div>
  )
}
