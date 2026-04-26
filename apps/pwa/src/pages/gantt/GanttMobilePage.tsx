import { useEffect, useState } from 'react'
import { Smartphone } from 'lucide-react'
import { Badge, Button, Card, CardContent, CardHeader, CardTitle } from '@/components/ui'
import { useCan } from '@/store'
import { getGanttTasks, updateGanttTask } from '@/services/gantt'
import type { GanttTask } from '@/types'

export function GanttMobilePage() {
  const canEdit = useCan('gantt', 'editar')
  const [tasks, setTasks] = useState<GanttTask[]>([])
  const [loading, setLoading] = useState(false)

  async function load() {
    setLoading(true)
    try {
      const rows = await getGanttTasks({ onlyActive: true })
      setTasks(rows)
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    load()
  }, [])

  async function markInProgress(task: GanttTask) {
    if (!canEdit) return
    await updateGanttTask(task.id, { status: 'en_progreso', progress: Math.max(task.progress, 50) })
    await load()
  }

  async function markDone(task: GanttTask) {
    if (!canEdit) return
    await updateGanttTask(task.id, { status: 'completada', progress: 100 })
    await load()
  }

  return (
    <div className="space-y-4 max-w-xl mx-auto">
      <div>
        <h1 className="text-2xl font-bold flex items-center gap-2"><Smartphone className="h-5 w-5" /> Gantt móvil</h1>
        <p className="text-sm text-muted-foreground">Operación rápida para terreno: iniciar, bloquear o cerrar tareas</p>
      </div>

      {loading && <p className="text-sm text-muted-foreground">Cargando tareas activas...</p>}

      <div className="space-y-3">
        {tasks.length === 0 && !loading && (
          <Card><CardContent className="pt-4 text-sm text-muted-foreground">No hay tareas activas.</CardContent></Card>
        )}
        {tasks.map((task) => (
          <Card key={task.id}>
            <CardHeader className="pb-2">
              <CardTitle className="text-base flex items-center justify-between gap-2">
                <span>{task.titulo}</span>
                <Badge variant={task.status === 'bloqueada' ? 'destructive' : 'outline'}>{task.status}</Badge>
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-2">
              <p className="text-xs text-muted-foreground">{task.equipmentNombre ?? 'Sin equipo'} · {task.progress}%</p>
              <p className="text-xs text-muted-foreground">Fin: {task.endDate.toLocaleString('es-CL')}</p>
              <div className="grid grid-cols-2 gap-2">
                <Button size="sm" variant="secondary" onClick={() => markInProgress(task)} disabled={!canEdit || task.status === 'completada'}>Iniciar</Button>
                <Button size="sm" onClick={() => markDone(task)} disabled={!canEdit || task.status === 'completada'}>Cerrar</Button>
              </div>
            </CardContent>
          </Card>
        ))}
      </div>
    </div>
  )
}
