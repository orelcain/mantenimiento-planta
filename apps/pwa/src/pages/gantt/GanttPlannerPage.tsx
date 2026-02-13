import { useEffect, useMemo, useRef, useState } from 'react'
import { AlertTriangle, Bell, CalendarClock, GitBranchPlus, Link2Off, Plus, Trash2 } from 'lucide-react'
import {
  Badge,
  Button,
  Card,
  CardContent,
  CardHeader,
  CardTitle,
  Input,
  Label,
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui'
import { useAuthStore, useCan } from '@/store'
import { getEquipments } from '@/services/equipment'
import { areNotificationsEnabled, showLocalNotification } from '@/services/notifications'
import { sendGanttAlert } from '@/services/ganttNotifications'
import {
  addTaskComment,
  buildGanttMetrics,
  calculateCPM,
  createGanttTask,
  deleteGanttTask,
  getGanttTasks,
  getTaskComments,
  simulateDelay,
  updateGanttTask,
} from '@/services/gantt'
import type { Equipment, GanttTask, GanttTaskComment, IncidentPriority } from '@/types'

const STATUS_OPTIONS: Array<GanttTask['status']> = ['planificada', 'en_progreso', 'bloqueada', 'completada']
const PRIORITY_OPTIONS: IncidentPriority[] = ['critica', 'alta', 'media', 'baja']
const DEPENDENCY_TYPES: Array<'FS' | 'SS' | 'FF' | 'SF'> = ['FS', 'SS', 'FF', 'SF']

function toInputDate(date: Date) {
  const local = new Date(date.getTime() - date.getTimezoneOffset() * 60_000)
  return local.toISOString().slice(0, 16)
}

function suggestedRiskForEquipmentStatus(estado?: Equipment['estado']): GanttTask['predictiveRiskLevel'] {
  if (estado === 'fuera_servicio') return 'critico'
  if (estado === 'en_mantenimiento') return 'alto'
  return 'medio'
}

export function GanttPlannerPage() {
  const user = useAuthStore((state) => state.user)
  const canCreate = useCan('gantt', 'crear')
  const canEdit = useCan('gantt', 'editar')
  const canDelete = useCan('gantt', 'eliminar')

  const [tasks, setTasks] = useState<GanttTask[]>([])
  const [equipment, setEquipment] = useState<Equipment[]>([])
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const [equipmentFilter, setEquipmentFilter] = useState<string>('all')
  const [statusFilter, setStatusFilter] = useState<string>('all')

  const [title, setTitle] = useState('')
  const [equipmentId, setEquipmentId] = useState<string>('none')
  const [priority, setPriority] = useState<IncidentPriority>('media')
  const [startDate, setStartDate] = useState(toInputDate(new Date()))
  const [endDate, setEndDate] = useState(toInputDate(new Date(Date.now() + 8 * 60 * 60 * 1000)))
  const [sparePartIdsText, setSparePartIdsText] = useState('')

  const [selectedTaskId, setSelectedTaskId] = useState<string>('none')
  const [dependencyTaskId, setDependencyTaskId] = useState<string>('none')
  const [dependencyPredecessorId, setDependencyPredecessorId] = useState<string>('none')
  const [dependencyType, setDependencyType] = useState<'FS' | 'SS' | 'FF' | 'SF'>('FS')
  const [dependencyLag, setDependencyLag] = useState<number>(0)

  const [delayHours, setDelayHours] = useState<number>(4)
  const [simulationText, setSimulationText] = useState<string>('')

  const [comments, setComments] = useState<GanttTaskComment[]>([])
  const [newComment, setNewComment] = useState('')
  const notifiedDelayedCriticalRef = useRef<Set<string>>(new Set())
  const remoteAlertSentRef = useRef<Set<string>>(new Set())

  async function load() {
    setLoading(true)
    setError(null)
    try {
      const [rows, eq] = await Promise.all([getGanttTasks(), getEquipments()])
      setTasks(rows)
      setEquipment(eq)
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Error cargando planificador')
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    load()
  }, [])

  const filteredTasks = useMemo(() => {
    return tasks.filter((task) => {
      if (equipmentFilter !== 'all' && task.equipmentId !== equipmentFilter) return false
      if (statusFilter !== 'all' && task.status !== statusFilter) return false
      return true
    })
  }, [equipmentFilter, statusFilter, tasks])

  const cpm = useMemo(() => calculateCPM(filteredTasks), [filteredTasks])
  const cpmMap = useMemo(() => new Map(cpm.tasks.map((row) => [row.taskId, row])), [cpm.tasks])
  const metrics = useMemo(() => buildGanttMetrics(filteredTasks), [filteredTasks])

  const timeline = useMemo(() => {
    if (filteredTasks.length === 0) return { minStart: 0, maxEnd: 0 }
    const minStart = Math.min(...filteredTasks.map((task) => task.startDate.getTime()))
    const maxEnd = Math.max(...filteredTasks.map((task) => task.endDate.getTime()))
    return { minStart, maxEnd }
  }, [filteredTasks])

  const delayedCriticalTasks = useMemo(() => {
    const now = Date.now()
    const critical = new Set(cpm.criticalPath)
    return filteredTasks.filter((task) => critical.has(task.id) && task.status !== 'completada' && task.endDate.getTime() < now)
  }, [cpm.criticalPath, filteredTasks])

  useEffect(() => {
    if (selectedTaskId === 'none') {
      setComments([])
      return
    }
    getTaskComments(selectedTaskId).then(setComments).catch(() => setComments([]))
  }, [selectedTaskId])

  useEffect(() => {
    if (!areNotificationsEnabled()) return

    delayedCriticalTasks.forEach((task) => {
      if (notifiedDelayedCriticalRef.current.has(task.id)) return
      showLocalNotification('⛔ Tarea crítica atrasada', {
        body: `${task.titulo} (${task.equipmentNombre ?? 'sin equipo'})`,
        data: { url: '/gantt?tab=planificador' },
      })
      notifiedDelayedCriticalRef.current.add(task.id)
    })
  }, [delayedCriticalTasks])

  useEffect(() => {
    if (!user?.id) return

    delayedCriticalTasks.forEach((task) => {
      if (remoteAlertSentRef.current.has(task.id)) return
      remoteAlertSentRef.current.add(task.id)

      sendGanttAlert({
        taskId: task.id,
        title: '⛔ Tarea Gantt crítica atrasada',
        body: `${task.titulo} requiere atención inmediata`,
        responsibleUserId: task.responsibleUserId,
        severity: 'critical_delay',
        url: '/mantenimiento-planta/gantt?tab=planificador',
      }).catch(() => {
        remoteAlertSentRef.current.delete(task.id)
      })
    })
  }, [delayedCriticalTasks, user?.id])

  async function handleCreateTask() {
    if (!user?.id || !title.trim()) return

    const start = new Date(startDate)
    const end = new Date(endDate)
    if (Number.isNaN(start.getTime()) || Number.isNaN(end.getTime()) || end <= start) {
      setError('Rango de fechas inválido')
      return
    }

    const selectedEquipment = equipment.find((item) => item.id === equipmentId)
    const sparePartIds = sparePartIdsText
      .split(',')
      .map((value) => value.trim())
      .filter(Boolean)

    await createGanttTask({
      titulo: title.trim(),
      descripcion: '',
      equipmentId: equipmentId === 'none' ? undefined : equipmentId,
      equipmentNombre: selectedEquipment?.nombre,
      hierarchyNodeId: selectedEquipment?.hierarchyNodeId,
      hierarchyPath: selectedEquipment?.hierarchyPath,
      status: 'planificada',
      prioridad: priority,
      startDate: start,
      endDate: end,
      progress: 0,
      estimatedHours: Math.max(1, (end.getTime() - start.getTime()) / (1000 * 60 * 60)),
      dependencies: [],
      sparePartIds,
      predictiveRiskLevel: suggestedRiskForEquipmentStatus(selectedEquipment?.estado),
      createdBy: user.id,
      responsibleUserId: user.id,
      responsibleName: `${user.nombre} ${user.apellido}`,
    })

    setTitle('')
    setSparePartIdsText('')
    await load()
  }

  async function handleAdvance(task: GanttTask) {
    if (!canEdit) return

    const nextStatus: GanttTask['status'] = task.status === 'planificada'
      ? 'en_progreso'
      : task.status === 'en_progreso'
        ? 'completada'
        : task.status

    const nextProgress = nextStatus === 'completada' ? 100 : Math.max(task.progress, 45)

    await updateGanttTask(task.id, {
      status: nextStatus,
      progress: nextProgress,
    })
    await load()
  }

  async function handleDelete(taskId: string) {
    if (!canDelete) return
    await deleteGanttTask(taskId)
    if (selectedTaskId === taskId) setSelectedTaskId('none')
    await load()
  }

  async function handleAddDependency() {
    if (!canEdit || dependencyTaskId === 'none' || dependencyPredecessorId === 'none') return
    if (dependencyTaskId === dependencyPredecessorId) {
      setError('Una tarea no puede depender de sí misma')
      return
    }

    const task = tasks.find((item) => item.id === dependencyTaskId)
    if (!task) return

    const alreadyExists = task.dependencies.some(
      (dependency) => dependency.predecessorId === dependencyPredecessorId && dependency.type === dependencyType
    )
    if (alreadyExists) return

    const dependencies = [
      ...task.dependencies,
      { predecessorId: dependencyPredecessorId, type: dependencyType, lagHours: dependencyLag },
    ]

    await updateGanttTask(task.id, { dependencies })
    await load()
  }

  async function handleRemoveDependency(task: GanttTask, predecessorId: string, type: 'FS' | 'SS' | 'FF' | 'SF') {
    if (!canEdit) return
    const dependencies = task.dependencies.filter(
      (dependency) => !(dependency.predecessorId === predecessorId && dependency.type === type)
    )
    await updateGanttTask(task.id, { dependencies })
    await load()
  }

  async function handleSimulate() {
    if (selectedTaskId === 'none' || delayHours <= 0) return
    const result = simulateDelay(tasks, { taskId: selectedTaskId, extraHours: delayHours })
    setSimulationText(
      `Duración base: ${result.baseDurationHours}h · simulada: ${result.simulatedDurationHours}h · impacto: +${result.impactHours}h · tareas impactadas: ${result.impactedTaskIds.length}`
    )
  }

  async function handleAddComment() {
    if (!user?.id || selectedTaskId === 'none' || !newComment.trim()) return
    await addTaskComment(selectedTaskId, {
      content: newComment.trim(),
      createdBy: user.id,
      createdByName: `${user.nombre} ${user.apellido}`,
    })
    setNewComment('')
    const rows = await getTaskComments(selectedTaskId)
    setComments(rows)
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between gap-2">
        <Badge variant="secondary">Duración proyecto: {cpm.projectDurationHours}h</Badge>
        <Badge variant={areNotificationsEnabled() ? 'success' : 'outline'}>
          <Bell className="h-3.5 w-3.5 mr-1" />
          {areNotificationsEnabled() ? 'Alertas activas' : 'Alertas desactivadas'}
        </Badge>
      </div>

      {error && (
        <Card className="border-destructive/40">
          <CardContent className="pt-4 text-sm text-destructive flex items-center gap-2">
            <AlertTriangle className="h-4 w-4" />
            {error}
          </CardContent>
        </Card>
      )}

      <div className="grid gap-4 md:grid-cols-4">
        <Card>
          <CardHeader className="pb-2"><CardTitle className="text-sm">Total tareas</CardTitle></CardHeader>
          <CardContent className="text-2xl font-bold">{metrics.totalTasks}</CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-2"><CardTitle className="text-sm">Completadas</CardTitle></CardHeader>
          <CardContent className="text-2xl font-bold">{metrics.completedTasks}</CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-2"><CardTitle className="text-sm">Atrasadas</CardTitle></CardHeader>
          <CardContent className="text-2xl font-bold">{metrics.delayedTasks}</CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-2"><CardTitle className="text-sm">Ruta crítica</CardTitle></CardHeader>
          <CardContent className="text-2xl font-bold">{metrics.criticalTasks}</CardContent>
        </Card>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Vista temporal y dependencias</CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          {filteredTasks.length === 0 && (
            <p className="text-sm text-muted-foreground">Sin tareas para visualizar.</p>
          )}

          {filteredTasks.map((task) => {
            const total = Math.max(1, timeline.maxEnd - timeline.minStart)
            const left = ((task.startDate.getTime() - timeline.minStart) / total) * 100
            const width = Math.max(2, ((task.endDate.getTime() - task.startDate.getTime()) / total) * 100)
            const isCritical = cpm.criticalPath.includes(task.id)

            return (
              <div key={`timeline-${task.id}`} className="space-y-1">
                <div className="flex items-center justify-between text-xs">
                  <span className="font-medium">{task.titulo}</span>
                  <span className="text-muted-foreground">{task.dependencies.length} dep.</span>
                </div>
                <div className="h-3 w-full rounded bg-muted/60 relative overflow-hidden">
                  <div
                    className={`absolute top-0 h-3 rounded ${isCritical ? 'bg-red-500' : 'bg-primary'}`}
                    style={{ left: `${left}%`, width: `${width}%` }}
                  />
                </div>
              </div>
            )
          })}
        </CardContent>
      </Card>

      <div className="grid gap-4 lg:grid-cols-3">
        <Card className="lg:col-span-2">
          <CardHeader>
            <CardTitle>Listado de tareas</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="grid gap-3 md:grid-cols-2">
              <div>
                <Label>Filtro equipo</Label>
                <Select value={equipmentFilter} onValueChange={setEquipmentFilter}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">Todos</SelectItem>
                    {equipment.map((item) => <SelectItem key={item.id} value={item.id}>{item.nombre}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>
              <div>
                <Label>Filtro estado</Label>
                <Select value={statusFilter} onValueChange={setStatusFilter}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">Todos</SelectItem>
                    {STATUS_OPTIONS.map((option) => <SelectItem key={option} value={option}>{option}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>
            </div>

            <div className="space-y-2">
              {loading && <p className="text-sm text-muted-foreground">Cargando tareas...</p>}
              {!loading && filteredTasks.length === 0 && <p className="text-sm text-muted-foreground">Sin tareas para los filtros seleccionados.</p>}
              {filteredTasks.map((task) => {
                const row = cpmMap.get(task.id)
                return (
                  <div key={task.id} className="rounded-lg border p-3 space-y-2">
                    <div className="flex items-center justify-between gap-2">
                      <div>
                        <p className="font-medium">{task.titulo}</p>
                        <p className="text-xs text-muted-foreground">{task.equipmentNombre ?? 'Sin equipo'} · {task.startDate.toLocaleString()} → {task.endDate.toLocaleString()}</p>
                      </div>
                      <div className="flex items-center gap-2">
                        {row?.isCritical && <Badge variant="destructive">Crítica</Badge>}
                        {task.predictiveRiskLevel && <Badge variant="warning">Riesgo {task.predictiveRiskLevel}</Badge>}
                        <Badge variant="outline">{task.status}</Badge>
                      </div>
                    </div>
                    <div className="flex flex-wrap gap-2 text-xs text-muted-foreground">
                      <span>Avance: {task.progress}%</span>
                      <span>Holgura: {row?.slack ?? 0}h</span>
                      <span>Dependencias: {task.dependencies.length}</span>
                      <span>Repuestos: {task.sparePartIds?.length ?? 0}</span>
                    </div>
                    {task.dependencies.length > 0 && (
                      <div className="text-xs text-muted-foreground rounded border p-2 space-y-1">
                        {task.dependencies.map((dep, index) => {
                          const predecessor = tasks.find((item) => item.id === dep.predecessorId)
                          return (
                            <div key={`${task.id}-${dep.predecessorId}-${dep.type}-${index}`} className="flex items-center justify-between gap-2">
                              <span>{predecessor?.titulo ?? dep.predecessorId} → {task.titulo} ({dep.type}{dep.lagHours ? ` +${dep.lagHours}h` : ''})</span>
                              {canEdit && (
                                <Button
                                  size="sm"
                                  variant="ghost"
                                  onClick={() => handleRemoveDependency(task, dep.predecessorId, dep.type)}
                                >
                                  <Link2Off className="h-3.5 w-3.5" />
                                </Button>
                              )}
                            </div>
                          )
                        })}
                      </div>
                    )}
                    <div className="flex gap-2">
                      {canEdit && task.status !== 'completada' && (
                        <Button size="sm" variant="secondary" onClick={() => handleAdvance(task)}>
                          <CalendarClock className="h-4 w-4 mr-1" /> Avanzar
                        </Button>
                      )}
                      {canDelete && (
                        <Button size="sm" variant="ghost" onClick={() => handleDelete(task.id)}>
                          <Trash2 className="h-4 w-4 mr-1" /> Eliminar
                        </Button>
                      )}
                      <Button size="sm" variant="outline" onClick={() => setSelectedTaskId(task.id)}>Comentarios</Button>
                    </div>
                  </div>
                )
              })}
            </div>
          </CardContent>
        </Card>

        <div className="space-y-4">
          <Card>
            <CardHeader><CardTitle>Crear tarea</CardTitle></CardHeader>
            <CardContent className="space-y-3">
              <div>
                <Label>Título</Label>
                <Input value={title} onChange={(event) => setTitle(event.target.value)} placeholder="Cambio de rodamiento" />
              </div>
              <div>
                <Label>Equipo</Label>
                <Select value={equipmentId} onValueChange={setEquipmentId}>
                  <SelectTrigger><SelectValue placeholder="Opcional" /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="none">Sin equipo</SelectItem>
                    {equipment.map((item) => <SelectItem key={item.id} value={item.id}>{item.nombre}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>
              <div>
                <Label>Prioridad</Label>
                <Select value={priority} onValueChange={(value) => setPriority(value as IncidentPriority)}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    {PRIORITY_OPTIONS.map((p) => <SelectItem key={p} value={p}>{p}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>
              <div>
                <Label>Inicio</Label>
                <Input type="datetime-local" value={startDate} onChange={(event) => setStartDate(event.target.value)} />
              </div>
              <div>
                <Label>Fin</Label>
                <Input type="datetime-local" value={endDate} onChange={(event) => setEndDate(event.target.value)} />
              </div>
              <div>
                <Label>Repuestos vinculados (IDs/códigos, separados por coma)</Label>
                <Input value={sparePartIdsText} onChange={(event) => setSparePartIdsText(event.target.value)} placeholder="REP-001, REP-045" />
              </div>
              <Button className="w-full" onClick={handleCreateTask} disabled={!canCreate || !title.trim()}>
                <Plus className="h-4 w-4 mr-1" /> Crear
              </Button>
            </CardContent>
          </Card>

          <Card>
            <CardHeader><CardTitle>Dependencias</CardTitle></CardHeader>
            <CardContent className="space-y-3">
              <div>
                <Label>Tarea sucesora</Label>
                <Select value={dependencyTaskId} onValueChange={setDependencyTaskId}>
                  <SelectTrigger><SelectValue placeholder="Selecciona tarea" /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="none">Sin selección</SelectItem>
                    {tasks.map((task) => <SelectItem key={`dep-task-${task.id}`} value={task.id}>{task.titulo}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>
              <div>
                <Label>Tarea predecesora</Label>
                <Select value={dependencyPredecessorId} onValueChange={setDependencyPredecessorId}>
                  <SelectTrigger><SelectValue placeholder="Selecciona predecesora" /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="none">Sin selección</SelectItem>
                    {tasks.map((task) => <SelectItem key={`dep-pred-${task.id}`} value={task.id}>{task.titulo}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>
              <div>
                <Label>Tipo de dependencia</Label>
                <Select value={dependencyType} onValueChange={(value) => setDependencyType(value as 'FS' | 'SS' | 'FF' | 'SF')}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    {DEPENDENCY_TYPES.map((type) => <SelectItem key={type} value={type}>{type}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>
              <div>
                <Label>Lag (horas)</Label>
                <Input type="number" value={dependencyLag} onChange={(event) => setDependencyLag(Number(event.target.value) || 0)} />
              </div>
              <Button variant="outline" className="w-full" onClick={handleAddDependency}>
                <GitBranchPlus className="h-4 w-4 mr-1" /> Vincular dependencia
              </Button>
            </CardContent>
          </Card>

          <Card>
            <CardHeader><CardTitle>Simulación de retraso</CardTitle></CardHeader>
            <CardContent className="space-y-3">
              <div>
                <Label>Tarea</Label>
                <Select value={selectedTaskId} onValueChange={setSelectedTaskId}>
                  <SelectTrigger><SelectValue placeholder="Selecciona una tarea" /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="none">Sin selección</SelectItem>
                    {tasks.map((task) => <SelectItem key={task.id} value={task.id}>{task.titulo}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>
              <div>
                <Label>Horas extra</Label>
                <Input type="number" min={1} value={delayHours} onChange={(event) => setDelayHours(Number(event.target.value) || 1)} />
              </div>
              <Button variant="secondary" className="w-full" onClick={handleSimulate}>Simular</Button>
              {simulationText && <p className="text-xs text-muted-foreground">{simulationText}</p>}
              {delayedCriticalTasks.length > 0 && (
                <div className="rounded border border-destructive/40 p-2 text-xs text-destructive">
                  {delayedCriticalTasks.length} tarea(s) crítica(s) con atraso
                </div>
              )}
            </CardContent>
          </Card>

          <Card>
            <CardHeader><CardTitle>Comentarios de tarea</CardTitle></CardHeader>
            <CardContent className="space-y-3">
              <Input value={newComment} onChange={(event) => setNewComment(event.target.value)} placeholder="Comentario operativo" />
              <Button variant="outline" className="w-full" onClick={handleAddComment} disabled={selectedTaskId === 'none' || !newComment.trim()}>
                Agregar comentario
              </Button>
              <div className="space-y-2 max-h-44 overflow-auto">
                {comments.map((comment) => (
                  <div key={comment.id} className="rounded border p-2 text-xs">
                    <p>{comment.content}</p>
                    <p className="text-muted-foreground mt-1">{comment.createdByName ?? comment.createdBy} · {comment.createdAt.toLocaleString()}</p>
                  </div>
                ))}
              </div>
            </CardContent>
          </Card>
        </div>
      </div>
    </div>
  )
}
