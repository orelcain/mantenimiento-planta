import { useState, useEffect, useMemo } from 'react'
import { logger } from '@/lib/logger'
import { debounce } from '@/lib/utils'
import {
  createPreventiveTaskSchema,
  updatePreventiveTaskSchema,
  executePreventiveTaskSchema,
  formatZodErrors,
} from '@/lib/validation'
import {
  Calendar,
  Plus,
  Clock,
  AlertTriangle,
  CheckCircle2,
  ChevronLeft,
  ChevronRight,
  Filter,
  Play,
  Wrench,
  ClipboardCheck,
  Trash2,
  Edit,
} from 'lucide-react'
import {
  Button,
  Card,
  CardContent,
  CardHeader,
  CardTitle,
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
  Input,
  Label,
  Badge,
  Textarea,
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
  Checkbox,
  Tabs,
  TabsContent,
  TabsList,
  TabsTrigger,
} from '@/components/ui'
import {
  getPreventiveTasks,
  createPreventiveTask,
  updatePreventiveTask,
  deletePreventiveTask,
  createExecution,
  getExecutions,
  getPreventiveStats,
  TASK_TYPES,
  FRECUENCIA_OPCIONES,
} from '@/services/preventive'
import { getEquipments } from '@/services/equipment'
import { useAuthStore } from '@/store'
import type { PreventiveTask, PreventiveExecution, Equipment } from '@/types'
import { cn } from '@/lib/utils'

export function PreventivePage() {
  const user = useAuthStore((state) => state.user)
  const [tasks, setTasks] = useState<PreventiveTask[]>([])
  const [executions, setExecutions] = useState<PreventiveExecution[]>([])
  const [equipment, setEquipment] = useState<Equipment[]>([])
  const [loading, setLoading] = useState(true)
  const [stats, setStats] = useState({
    totalTasks: 0,
    overdue: 0,
    upcoming7Days: 0,
    completedThisMonth: 0,
  })
  const [currentMonth, setCurrentMonth] = useState(new Date())
  const [selectedDate, setSelectedDate] = useState<Date | null>(null)
  const [showTaskDialog, setShowTaskDialog] = useState(false)
  const [showExecuteDialog, setShowExecuteDialog] = useState(false)
  const [editingTask, setEditingTask] = useState<PreventiveTask | null>(null)
  const [executingTask, setExecutingTask] = useState<PreventiveTask | null>(null)
  const [filterEquipment, setFilterEquipment] = useState<string>('all')
  const [searchQuery, setSearchQuery] = useState('')
  const [debouncedSearch, setDebouncedSearch] = useState('')

  const debouncedSetSearch = useMemo(
    () => debounce((value: string) => setDebouncedSearch(value), 300),
    []
  )

  useEffect(() => {
    debouncedSetSearch(searchQuery)
  }, [searchQuery, debouncedSetSearch])

  useEffect(() => {
    loadData()
  }, [])

  const loadData = async () => {
    setLoading(true)
    try {
      const [tasksData, equipmentData, statsData, executionsData] = await Promise.all([
        getPreventiveTasks(),
        getEquipments(),
        getPreventiveStats(),
        getExecutions(),
      ])
      setTasks(tasksData)
      setEquipment(equipmentData)
      setStats(statsData)
      setExecutions(executionsData)
    } catch (error) {
      logger.error('Error loading preventive maintenance data', error instanceof Error ? error : new Error(String(error)))
    } finally {
      setLoading(false)
    }
  }

  // Calendar helpers
  const getDaysInMonth = (date: Date) => {
    const year = date.getFullYear()
    const month = date.getMonth()
    const firstDay = new Date(year, month, 1)
    const lastDay = new Date(year, month + 1, 0)
    const daysInMonth = lastDay.getDate()
    const startDayOfWeek = firstDay.getDay()

    const days: (Date | null)[] = []
    
    // Días vacíos al inicio
    for (let i = 0; i < startDayOfWeek; i++) {
      days.push(null)
    }
    
    // Días del mes
    for (let i = 1; i <= daysInMonth; i++) {
      days.push(new Date(year, month, i))
    }

    return days
  }

  const days = getDaysInMonth(currentMonth)

  // Tareas por día
  const getTasksForDay = (date: Date) => {
    return tasks.filter((task) => {
      if (!task.activo) return false
      const taskDate = new Date(task.proximaEjecucion)
      return (
        taskDate.getDate() === date.getDate() &&
        taskDate.getMonth() === date.getMonth() &&
        taskDate.getFullYear() === date.getFullYear()
      )
    })
  }

  const filteredTasks = useMemo(() => {
    return tasks.filter((t) => {
      if (filterEquipment !== 'all' && t.equipmentId !== filterEquipment) return false
      
      if (debouncedSearch) {
        const searchLower = debouncedSearch.toLowerCase()
        const matchesSearch =
          t.titulo.toLowerCase().includes(searchLower) ||
          (t.descripcion?.toLowerCase().includes(searchLower) ?? false)
        if (!matchesSearch) return false
      }
      
      return true
    })
  }, [tasks, filterEquipment, debouncedSearch])

  const overdueTasks = filteredTasks.filter(
    (t) => t.activo && t.proximaEjecucion < new Date()
  )

  const upcomingTasks = filteredTasks.filter((t) => {
    if (!t.activo) return false
    const now = new Date()
    const diff = t.proximaEjecucion.getTime() - now.getTime()
    const days = diff / (1000 * 60 * 60 * 24)
    return days >= 0 && days <= 7
  })

  const handlePrevMonth = () => {
    setCurrentMonth(new Date(currentMonth.getFullYear(), currentMonth.getMonth() - 1))
  }

  const handleNextMonth = () => {
    setCurrentMonth(new Date(currentMonth.getFullYear(), currentMonth.getMonth() + 1))
  }

  const handleDeleteTask = async (taskId: string) => {
    if (!confirm('¿Estás seguro de eliminar esta tarea?')) return
    try {
      await deletePreventiveTask(taskId)
      logger.info('Preventive task deleted', { taskId })
      loadData()
    } catch (error) {
      logger.error('Error deleting preventive task', error instanceof Error ? error : new Error(String(error)), { taskId })
    }
  }

  const isToday = (date: Date) => {
    const today = new Date()
    return (
      date.getDate() === today.getDate() &&
      date.getMonth() === today.getMonth() &&
      date.getFullYear() === today.getFullYear()
    )
  }

  const monthNames = [
    'Enero', 'Febrero', 'Marzo', 'Abril', 'Mayo', 'Junio',
    'Julio', 'Agosto', 'Septiembre', 'Octubre', 'Noviembre', 'Diciembre'
  ]

  const dayNames = ['Dom', 'Lun', 'Mar', 'Mié', 'Jue', 'Vie', 'Sáb']

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary" />
      </div>
    )
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold">Mantenimiento Preventivo</h1>
          <p className="text-muted-foreground">
            Planifica y ejecuta tareas de mantenimiento programado
          </p>
        </div>
        <Dialog open={showTaskDialog} onOpenChange={setShowTaskDialog}>
          <DialogTrigger asChild>
            <Button onClick={() => setEditingTask(null)}>
              <Plus className="h-4 w-4 mr-2" />
              Nueva Tarea
            </Button>
          </DialogTrigger>
          <TaskDialog
            task={editingTask}
            equipment={equipment}
            onClose={() => {
              setShowTaskDialog(false)
              setEditingTask(null)
            }}
            onSave={loadData}
          />
        </Dialog>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <Card>
          <CardContent className="p-4">
            <div className="flex items-center gap-3">
              <div className="p-2 bg-blue-500/10 rounded-lg">
                <ClipboardCheck className="h-5 w-5 text-blue-500" />
              </div>
              <div>
                <p className="text-sm text-muted-foreground">Total Tareas</p>
                <p className="text-2xl font-bold">{stats.totalTasks}</p>
              </div>
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-4">
            <div className="flex items-center gap-3">
              <div className="p-2 bg-red-500/10 rounded-lg">
                <AlertTriangle className="h-5 w-5 text-red-500" />
              </div>
              <div>
                <p className="text-sm text-muted-foreground">Vencidas</p>
                <p className="text-2xl font-bold text-red-500">{stats.overdue}</p>
              </div>
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-4">
            <div className="flex items-center gap-3">
              <div className="p-2 bg-yellow-500/10 rounded-lg">
                <Clock className="h-5 w-5 text-yellow-500" />
              </div>
              <div>
                <p className="text-sm text-muted-foreground">Próximos 7 días</p>
                <p className="text-2xl font-bold">{stats.upcoming7Days}</p>
              </div>
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-4">
            <div className="flex items-center gap-3">
              <div className="p-2 bg-green-500/10 rounded-lg">
                <CheckCircle2 className="h-5 w-5 text-green-500" />
              </div>
              <div>
                <p className="text-sm text-muted-foreground">Completadas (mes)</p>
                <p className="text-2xl font-bold">{stats.completedThisMonth}</p>
              </div>
            </div>
          </CardContent>
        </Card>
      </div>

      <Tabs defaultValue="calendar" className="space-y-4">
        <TabsList>
          <TabsTrigger value="calendar">
            <Calendar className="h-4 w-4 mr-2" />
            Calendario
          </TabsTrigger>
          <TabsTrigger value="list">
            <ClipboardCheck className="h-4 w-4 mr-2" />
            Lista de Tareas
          </TabsTrigger>
          <TabsTrigger value="history">
            <Clock className="h-4 w-4 mr-2" />
            Historial
          </TabsTrigger>
        </TabsList>

        {/* Calendar Tab */}
        <TabsContent value="calendar" className="space-y-4">
          <Card>
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-4">
              <div className="flex items-center gap-4">
                <Button variant="outline" size="icon" onClick={handlePrevMonth}>
                  <ChevronLeft className="h-4 w-4" />
                </Button>
                <CardTitle className="text-lg">
                  {monthNames[currentMonth.getMonth()]} {currentMonth.getFullYear()}
                </CardTitle>
                <Button variant="outline" size="icon" onClick={handleNextMonth}>
                  <ChevronRight className="h-4 w-4" />
                </Button>
              </div>
              <div className="flex gap-2">
                <Input
                  placeholder="Buscar tareas..."
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  className="max-w-xs"
                />
                <Select value={filterEquipment} onValueChange={setFilterEquipment}>
                  <SelectTrigger className="w-48">
                    <Filter className="h-4 w-4 mr-2" />
                    <SelectValue placeholder="Filtrar por equipo" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">Todos los equipos</SelectItem>
                    {equipment.map((eq) => (
                      <SelectItem key={eq.id} value={eq.id}>
                        {eq.nombre}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </CardHeader>
            <CardContent>
              {/* Day names */}
              <div className="grid grid-cols-7 gap-1 mb-2">
                {dayNames.map((day) => (
                  <div
                    key={day}
                    className="text-center text-sm font-medium text-muted-foreground py-2"
                  >
                    {day}
                  </div>
                ))}
              </div>
              {/* Calendar grid */}
              <div className="grid grid-cols-7 gap-1">
                {days.map((day, index) => {
                  if (!day) {
                    return <div key={`empty-${index}`} className="h-24" />
                  }

                  const dayTasks = getTasksForDay(day)
                  const hasOverdue = dayTasks.some((t) => t.proximaEjecucion < new Date())

                  return (
                    <div
                      key={day.toISOString()}
                      className={cn(
                        'h-24 p-1 border rounded-lg overflow-hidden cursor-pointer transition-colors',
                        isToday(day) && 'bg-primary/5 border-primary',
                        selectedDate?.toDateString() === day.toDateString() && 'ring-2 ring-primary'
                      )}
                      onClick={() => setSelectedDate(day)}
                    >
                      <div className="flex items-center justify-between mb-1">
                        <span
                          className={cn(
                            'text-sm font-medium',
                            isToday(day) && 'text-primary'
                          )}
                        >
                          {day.getDate()}
                        </span>
                        {hasOverdue && (
                          <AlertTriangle className="h-3 w-3 text-red-500" />
                        )}
                      </div>
                      <div className="space-y-0.5 overflow-y-auto max-h-16">
                        {dayTasks.slice(0, 3).map((task) => (
                          <div
                            key={task.id}
                            className={cn(
                              'text-xs px-1 py-0.5 rounded truncate',
                              task.proximaEjecucion < new Date()
                                ? 'bg-red-500/20 text-red-500'
                                : 'bg-blue-500/20 text-blue-500'
                            )}
                          >
                            {task.nombre}
                          </div>
                        ))}
                        {dayTasks.length > 3 && (
                          <div className="text-xs text-muted-foreground px-1">
                            +{dayTasks.length - 3} más
                          </div>
                        )}
                      </div>
                    </div>
                  )
                })}
              </div>
            </CardContent>
          </Card>

          {/* Selected day tasks */}
          {selectedDate && (
            <Card>
              <CardHeader>
                <CardTitle className="text-lg">
                  Tareas del {selectedDate.getDate()} de {monthNames[selectedDate.getMonth()]}
                </CardTitle>
              </CardHeader>
              <CardContent>
                {getTasksForDay(selectedDate).length === 0 ? (
                  <p className="text-muted-foreground text-center py-4">
                    No hay tareas programadas para este día
                  </p>
                ) : (
                  <div className="space-y-2">
                    {getTasksForDay(selectedDate).map((task) => (
                      <TaskCard
                        key={task.id}
                        task={task}
                        equipment={equipment}
                        onEdit={() => {
                          setEditingTask(task)
                          setShowTaskDialog(true)
                        }}
                        onExecute={() => {
                          setExecutingTask(task)
                          setShowExecuteDialog(true)
                        }}
                        onDelete={() => handleDeleteTask(task.id)}
                      />
                    ))}
                  </div>
                )}
              </CardContent>
            </Card>
          )}
        </TabsContent>

        {/* List Tab */}
        <TabsContent value="list" className="space-y-4">
          {/* Overdue */}
          {overdueTasks.length > 0 && (
            <Card className="border-red-500/50">
              <CardHeader>
                <CardTitle className="text-lg flex items-center gap-2 text-red-500">
                  <AlertTriangle className="h-5 w-5" />
                  Tareas Vencidas ({overdueTasks.length})
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-2">
                {overdueTasks.map((task) => (
                  <TaskCard
                    key={task.id}
                    task={task}
                    equipment={equipment}
                    onEdit={() => {
                      setEditingTask(task)
                      setShowTaskDialog(true)
                    }}
                    onExecute={() => {
                      setExecutingTask(task)
                      setShowExecuteDialog(true)
                    }}
                    onDelete={() => handleDeleteTask(task.id)}
                  />
                ))}
              </CardContent>
            </Card>
          )}

          {/* Upcoming */}
          <Card>
            <CardHeader>
              <CardTitle className="text-lg flex items-center gap-2">
                <Clock className="h-5 w-5 text-yellow-500" />
                Próximos 7 días ({upcomingTasks.length})
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-2">
              {upcomingTasks.length === 0 ? (
                <p className="text-muted-foreground text-center py-4">
                  No hay tareas programadas para los próximos 7 días
                </p>
              ) : (
                upcomingTasks.map((task) => (
                  <TaskCard
                    key={task.id}
                    task={task}
                    equipment={equipment}
                    onEdit={() => {
                      setEditingTask(task)
                      setShowTaskDialog(true)
                    }}
                    onExecute={() => {
                      setExecutingTask(task)
                      setShowExecuteDialog(true)
                    }}
                    onDelete={() => handleDeleteTask(task.id)}
                  />
                ))
              )}
            </CardContent>
          </Card>

          {/* All Tasks */}
          <Card>
            <CardHeader>
              <CardTitle className="text-lg">Todas las Tareas</CardTitle>
            </CardHeader>
            <CardContent className="space-y-2">
              {filteredTasks.filter((t) => t.activo).length === 0 ? (
                <p className="text-muted-foreground text-center py-4">
                  No hay tareas activas
                </p>
              ) : (
                filteredTasks
                  .filter((t) => t.activo)
                  .map((task) => (
                    <TaskCard
                      key={task.id}
                      task={task}
                      equipment={equipment}
                      onEdit={() => {
                        setEditingTask(task)
                        setShowTaskDialog(true)
                      }}
                      onExecute={() => {
                        setExecutingTask(task)
                        setShowExecuteDialog(true)
                      }}
                      onDelete={() => handleDeleteTask(task.id)}
                    />
                  ))
              )}
            </CardContent>
          </Card>
        </TabsContent>

        {/* History Tab */}
        <TabsContent value="history">
          <Card>
            <CardHeader>
              <CardTitle className="text-lg">Historial de Ejecuciones</CardTitle>
            </CardHeader>
            <CardContent>
              {executions.length === 0 ? (
                <p className="text-muted-foreground text-center py-8">
                  No hay ejecuciones registradas
                </p>
              ) : (
                <div className="space-y-3">
                  {executions.map((exec) => {
                    const task = tasks.find((t) => t.id === exec.taskId)
                    const eq = equipment.find((e) => e.id === exec.equipmentId)
                    return (
                      <div
                        key={exec.id}
                        className="flex items-center justify-between p-3 bg-muted/50 rounded-lg"
                      >
                        <div className="flex items-center gap-3">
                          <div className="p-2 bg-green-500/10 rounded-lg">
                            <CheckCircle2 className="h-4 w-4 text-green-500" />
                          </div>
                          <div>
                            <p className="font-medium">{task?.nombre || 'Tarea eliminada'}</p>
                            <p className="text-sm text-muted-foreground">
                              {eq?.nombre || 'Equipo'} • {exec.duracionMinutos} min
                            </p>
                          </div>
                        </div>
                        <div className="text-right">
                          <p className="text-sm">
                            {exec.fechaEjecucion.toLocaleDateString('es-ES')}
                          </p>
                          <p className="text-xs text-muted-foreground">
                            {exec.fechaEjecucion.toLocaleTimeString('es-ES', {
                              hour: '2-digit',
                              minute: '2-digit',
                            })}
                          </p>
                        </div>
                      </div>
                    )
                  })}
                </div>
              )}
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>

      {/* Execute Dialog */}
      <Dialog open={showExecuteDialog} onOpenChange={setShowExecuteDialog}>
        <DialogContent className="max-w-lg">
          {executingTask && (
            <ExecuteTaskDialog
              task={executingTask}
              equipment={equipment}
              userId={user?.id || ''}
              onClose={() => {
                setShowExecuteDialog(false)
                setExecutingTask(null)
              }}
              onSave={loadData}
            />
          )}
        </DialogContent>
      </Dialog>
    </div>
  )
}

// Task Card Component
function TaskCard({
  task,
  equipment,
  onEdit,
  onExecute,
  onDelete,
}: {
  task: PreventiveTask
  equipment: Equipment[]
  onEdit: () => void
  onExecute: () => void
  onDelete: () => void
}) {
  const eq = equipment.find((e) => e.id === task.equipmentId)
  const isOverdue = task.proximaEjecucion < new Date()
  const taskType = TASK_TYPES.find((t) => t.value === task.tipo)

  return (
    <div
      className={cn(
        'flex items-center justify-between p-3 rounded-lg border',
        isOverdue ? 'border-red-500/50 bg-red-500/5' : 'bg-muted/50'
      )}
    >
      <div className="flex items-center gap-3">
        <div
          className={cn(
            'p-2 rounded-lg',
            isOverdue ? 'bg-red-500/10' : 'bg-blue-500/10'
          )}
        >
          <Wrench className={cn('h-4 w-4', isOverdue ? 'text-red-500' : 'text-blue-500')} />
        </div>
        <div>
          <p className="font-medium">{task.nombre}</p>
          <div className="flex items-center gap-2 text-sm text-muted-foreground">
            <span>{eq?.nombre || 'Sin equipo'}</span>
            <span>•</span>
            <Badge variant="outline" className="text-xs">
              {taskType?.label || task.tipo}
            </Badge>
          </div>
          <p className="text-xs text-muted-foreground mt-0.5">
            Próxima: {task.proximaEjecucion.toLocaleDateString('es-ES')}
            {task.ultimaEjecucion && (
              <> • Última: {task.ultimaEjecucion.toLocaleDateString('es-ES')}</>
            )}
          </p>
        </div>
      </div>
      <div className="flex items-center gap-1">
        <Button variant="ghost" size="icon" onClick={onExecute} title="Ejecutar">
          <Play className="h-4 w-4 text-green-500" />
        </Button>
        <Button variant="ghost" size="icon" onClick={onEdit} title="Editar">
          <Edit className="h-4 w-4" />
        </Button>
        <Button variant="ghost" size="icon" onClick={onDelete} title="Eliminar">
          <Trash2 className="h-4 w-4 text-destructive" />
        </Button>
      </div>
    </div>
  )
}

// Task Dialog Component
function TaskDialog({
  task,
  equipment,
  onClose,
  onSave,
}: {
  task: PreventiveTask | null
  equipment: Equipment[]
  onClose: () => void
  onSave: () => void
}) {
  const getInitialProximaEjecucion = (): string => {
    if (task?.proximaEjecucion) {
      const parts = task.proximaEjecucion.toISOString().split('T')
      return parts[0] || new Date().toISOString().substring(0, 10)
    }
    return new Date().toISOString().substring(0, 10)
  }

  const [formData, setFormData] = useState<{
    equipmentId: string
    tipo: string
    nombre: string
    descripcion: string
    frecuenciaDias: number
    proximaEjecucion: string
    asignadoA: string
    checklist: { id: string; tarea: string; completado: boolean }[]
  }>({
    equipmentId: task?.equipmentId || '',
    tipo: task?.tipo || '',
    nombre: task?.nombre || '',
    descripcion: task?.descripcion || '',
    frecuenciaDias: task?.frecuenciaDias || 30,
    proximaEjecucion: getInitialProximaEjecucion(),
    asignadoA: task?.asignadoA || '',
    checklist: task?.checklist?.map(c => ({ id: c.id, tarea: c.tarea, completado: c.completado })) || [{ id: '1', tarea: '', completado: false }],
  })
  const [saving, setSaving] = useState(false)
  const [errors, setErrors] = useState<Record<string, string>>({})

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setErrors({})
    setSaving(true)

    try {
      const data = {
        ...formData,
        proximaEjecucion: new Date(formData.proximaEjecucion),
        checklist: formData.checklist.filter((c) => c.tarea.trim() !== ''),
        activo: true,
      }

      // Validación con Zod
      const schema = task ? updatePreventiveTaskSchema : createPreventiveTaskSchema
      const validation = schema.safeParse(data)

      if (!validation.success) {
        const formattedErrors = formatZodErrors(validation.error)
        setErrors(formattedErrors)
        logger.warn('Preventive task validation failed', { errors: formattedErrors, taskId: task?.id })
        return
      }

      if (task) {
        await updatePreventiveTask(task.id, validation.data)
      } else {
        // Para crear, validation.data tiene todos los campos requeridos
        await createPreventiveTask(validation.data as Omit<PreventiveTask, 'id' | 'createdAt' | 'updatedAt'>)
      }

      logger.info('Preventive task saved', { taskId: task?.id, isNew: !task })
      onSave()
      onClose()
    } catch (error) {
      logger.error('Error saving preventive task', error instanceof Error ? error : new Error(String(error)), { taskId: task?.id })
    } finally {
      setSaving(false)
    }
  }

  const addChecklistItem = () => {
    setFormData({
      ...formData,
      checklist: [
        ...formData.checklist,
        { id: String(Date.now()), tarea: '', completado: false },
      ],
    })
  }

  const updateChecklistItem = (index: number, value: string) => {
    const newChecklist = [...formData.checklist]
    const item = newChecklist[index]
    if (item) {
      newChecklist[index] = { id: item.id, tarea: value, completado: item.completado }
      setFormData({ ...formData, checklist: newChecklist })
    }
  }

  const removeChecklistItem = (index: number) => {
    setFormData({
      ...formData,
      checklist: formData.checklist.filter((_, i) => i !== index),
    })
  }

  return (
    <DialogContent className="max-w-lg max-h-[90vh] overflow-y-auto">
      <DialogHeader>
        <DialogTitle>{task ? 'Editar Tarea' : 'Nueva Tarea Preventiva'}</DialogTitle>
      </DialogHeader>

      <form onSubmit={handleSubmit} className="space-y-4">
        {Object.keys(errors).length > 0 && (
          <div className="bg-red-50 border border-red-200 text-red-800 px-4 py-3 rounded-md">
            <p className="font-medium">Por favor corrige los siguientes errores:</p>
            <ul className="mt-2 list-disc list-inside text-sm">
              {Object.values(errors).map((error, index) => (
                <li key={index}>{error}</li>
              ))}
            </ul>
          </div>
        )}

        <div className="space-y-2">
          <Label>Equipo *</Label>
          <Select
            value={formData.equipmentId}
            onValueChange={(v) => setFormData({ ...formData, equipmentId: v })}
            required
          >
            <SelectTrigger>
              <SelectValue placeholder="Seleccionar equipo" />
            </SelectTrigger>
            <SelectContent>
              {equipment.map((eq) => (
                <SelectItem key={eq.id} value={eq.id}>
                  {eq.nombre} ({eq.codigo})
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          {errors.equipmentId && (
            <p className="text-sm text-red-600">{errors.equipmentId}</p>
          )}
        </div>

        <div className="grid grid-cols-2 gap-4">
          <div className="space-y-2">
            <Label>Tipo de Tarea *</Label>
            <Select
              value={formData.tipo}
              onValueChange={(v) => setFormData({ ...formData, tipo: v })}
              required
            >
              <SelectTrigger>
                <SelectValue placeholder="Seleccionar tipo" />
              </SelectTrigger>
              <SelectContent>
                {TASK_TYPES.map((type) => (
                  <SelectItem key={type.value} value={type.value}>
                    {type.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            {errors.tipo && (
              <p className="text-sm text-red-600">{errors.tipo}</p>
            )}
          </div>

          <div className="space-y-2">
            <Label>Frecuencia *</Label>
            <Select
              value={String(formData.frecuenciaDias)}
              onValueChange={(v) =>
                setFormData({ ...formData, frecuenciaDias: Number(v) })
              }
            >
              <SelectTrigger>
                <SelectValue placeholder="Seleccionar" />
              </SelectTrigger>
              <SelectContent>
                {FRECUENCIA_OPCIONES.map((freq) => (
                  <SelectItem key={freq.value} value={String(freq.value)}>
                    {freq.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            {errors.frecuenciaDias && (
              <p className="text-sm text-red-600">{errors.frecuenciaDias}</p>
            )}
          </div>
        </div>

        <div className="space-y-2">
          <Label>Nombre de la Tarea *</Label>
          <Input
            value={formData.nombre}
            onChange={(e) => setFormData({ ...formData, nombre: e.target.value })}
            placeholder="Ej: Lubricación de rodamientos"
            required
          />
          {errors.nombre && (
            <p className="text-sm text-red-600">{errors.nombre}</p>
          )}
        </div>

        <div className="space-y-2">
          <Label>Descripción</Label>
          <Textarea
            value={formData.descripcion}
            onChange={(e) => setFormData({ ...formData, descripcion: e.target.value })}
            placeholder="Instrucciones adicionales..."
            rows={2}
          />
          {errors.descripcion && (
            <p className="text-sm text-red-600">{errors.descripcion}</p>
          )}
        </div>

        <div className="space-y-2">
          <Label>Próxima Ejecución *</Label>
          <Input
            type="date"
            value={formData.proximaEjecucion}
            onChange={(e) =>
              setFormData({ ...formData, proximaEjecucion: e.target.value })
            }
            required
          />
          {errors.proximaEjecucion && (
            <p className="text-sm text-red-600">{errors.proximaEjecucion}</p>
          )}
        </div>

        <div className="space-y-2">
          <Label>Checklist de Tareas</Label>
          <div className="space-y-2">
            {formData.checklist.map((item, index) => (
              <div key={item.id} className="flex gap-2">
                <Input
                  value={item.tarea}
                  onChange={(e) => updateChecklistItem(index, e.target.value)}
                  placeholder={`Paso ${index + 1}`}
                />
                {formData.checklist.length > 1 && (
                  <Button
                    type="button"
                    variant="ghost"
                    size="icon"
                    onClick={() => removeChecklistItem(index)}
                  >
                    <Trash2 className="h-4 w-4" />
                  </Button>
                )}
              </div>
            ))}
          </div>
          <Button
            type="button"
            variant="outline"
            size="sm"
            onClick={addChecklistItem}
            className="w-full"
          >
            <Plus className="h-4 w-4 mr-2" />
            Agregar tarea
          </Button>
          {errors.checklist && (
            <p className="text-sm text-red-600">{errors.checklist}</p>
          )}
        </div>

        <div className="space-y-2">
          <Label>Asignado a (Email)</Label>
          <Input
            type="email"
            value={formData.asignadoA}
            onChange={(e) => setFormData({ ...formData, asignadoA: e.target.value })}
            placeholder="usuario@empresa.com"
          />
          {errors.asignadoA && (
            <p className="text-sm text-red-600">{errors.asignadoA}</p>
          )}
        </div>

        <div className="flex justify-end gap-2 pt-4">
          <Button type="button" variant="outline" onClick={onClose}>
            Cancelar
          </Button>
          <Button type="submit" disabled={saving}>
            {saving ? 'Guardando...' : task ? 'Actualizar' : 'Crear Tarea'}
          </Button>
        </div>
      </form>
    </DialogContent>
  )
}

// Execute Task Dialog
function ExecuteTaskDialog({
  task,
  equipment,
  userId,
  onClose,
  onSave,
}: {
  task: PreventiveTask
  equipment: Equipment[]
  userId: string
  onClose: () => void
  onSave: () => void
}) {
  const eq = equipment.find((e) => e.id === task.equipmentId)
  const [checklist, setChecklist] = useState(
    task.checklist.map((c) => ({ ...c, completado: false, observacion: '' }))
  )
  const [observaciones, setObservaciones] = useState('')
  const [duracion, setDuracion] = useState(30)
  const [saving, setSaving] = useState(false)
  const [errors, setErrors] = useState<Record<string, string>>({})

  const allCompleted = checklist.every((c) => c.completado)

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setErrors({})
    setSaving(true)

    try {
      const data = {
        taskId: task.id,
        equipmentId: task.equipmentId,
        ejecutadoPor: userId,
        checklistCompletado: checklist,
        observaciones,
        duracionMinutos: duracion,
      }

      // Validación con Zod
      const validation = executePreventiveTaskSchema.safeParse(data)

      if (!validation.success) {
        const formattedErrors = formatZodErrors(validation.error)
        setErrors(formattedErrors)
        logger.warn('Execute task validation failed', { errors: formattedErrors, taskId: task.id })
        setSaving(false)
        return
      }

      await createExecution({
        ...validation.data,
        fechaEjecucion: new Date(),
        fotos: [],
      })

      logger.info('Preventive task executed', { taskId: task.id, equipmentId: task.equipmentId })
      onSave()
      onClose()
    } catch (error) {
      logger.error('Error executing preventive task', error instanceof Error ? error : new Error(String(error)), { taskId: task.id })
    } finally {
      setSaving(false)
    }
  }

  return (
    <>
      <DialogHeader>
        <DialogTitle>Ejecutar: {task.nombre}</DialogTitle>
      </DialogHeader>

      <div className="text-sm text-muted-foreground mb-4">
        Equipo: <span className="font-medium text-foreground">{eq?.nombre}</span>
      </div>

      <form onSubmit={handleSubmit} className="space-y-4">
        {Object.keys(errors).length > 0 && (
          <div className="bg-red-50 border border-red-200 text-red-800 px-4 py-3 rounded-md">
            <p className="font-medium">Por favor corrige los siguientes errores:</p>
            <ul className="mt-2 list-disc list-inside text-sm">
              {Object.values(errors).map((error, index) => (
                <li key={index}>{error}</li>
              ))}
            </ul>
          </div>
        )}

        <div className="space-y-2">
          <Label>Checklist</Label>
          <div className="space-y-2 border rounded-lg p-3">
            {checklist.map((item, index) => (
              <div key={item.id} className="space-y-1">
                <div className="flex items-center gap-2">
                  <Checkbox
                    id={`check-${item.id}`}
                    checked={item.completado}
                    onCheckedChange={(checked) => {
                      const newChecklist = [...checklist]
                      newChecklist[index] = { ...item, completado: checked as boolean }
                      setChecklist(newChecklist)
                    }}
                  />
                  <label
                    htmlFor={`check-${item.id}`}
                    className={cn(
                      'text-sm cursor-pointer',
                      item.completado && 'line-through text-muted-foreground'
                    )}
                  >
                    {item.tarea}
                  </label>
                </div>
                {item.completado && (
                  <Input
                    placeholder="Observación (opcional)"
                    value={item.observacion}
                    onChange={(e) => {
                      const newChecklist = [...checklist]
                      newChecklist[index] = { ...item, observacion: e.target.value }
                      setChecklist(newChecklist)
                    }}
                    className="ml-6 text-xs h-8"
                  />
                )}
              </div>
            ))}
          </div>
          {errors.checklistCompletado && (
            <p className="text-sm text-red-600">{errors.checklistCompletado}</p>
          )}
        </div>

        <div className="space-y-2">
          <Label>Duración (minutos)</Label>
          <Input
            type="number"
            value={duracion}
            onChange={(e) => setDuracion(Number(e.target.value))}
            min={1}
          />
          {errors.duracionMinutos && (
            <p className="text-sm text-red-600">{errors.duracionMinutos}</p>
          )}
        </div>

        <div className="space-y-2">
          <Label>Observaciones generales</Label>
          <Textarea
            value={observaciones}
            onChange={(e) => setObservaciones(e.target.value)}
            placeholder="Notas adicionales..."
            rows={3}
          />
          {errors.observaciones && (
            <p className="text-sm text-red-600">{errors.observaciones}</p>
          )}
        </div>

        <div className="flex justify-end gap-2 pt-4">
          <Button type="button" variant="outline" onClick={onClose}>
            Cancelar
          </Button>
          <Button type="submit" disabled={saving || !allCompleted}>
            {saving ? 'Guardando...' : 'Completar Ejecución'}
          </Button>
        </div>
      </form>
    </>
  )
}
