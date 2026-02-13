import { useEffect, useMemo, useRef, useState, type ChangeEvent } from 'react'
import { AlertTriangle, Bell, CalendarClock, Camera, ChevronDown, ChevronUp, FileSpreadsheet, GitBranchPlus, Link2Off, Plus, Sparkles, Trash2, Upload } from 'lucide-react'
import * as XLSX from 'xlsx'
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
import { getTechnicians } from '@/services/auth'
import { areNotificationsEnabled, showLocalNotification } from '@/services/notifications'
import { sendGanttAlert } from '@/services/ganttNotifications'
import { uploadGanttCommentPhoto } from '@/services/storage'
import { estimateGanttProgressFromComments } from '@/services/ganttAi'
import { generateId } from '@/lib/utils'
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
import { useHierarchyTree } from '@/hooks/useHierarchy'
import type { Equipment, GanttTask, GanttTaskComment, IncidentPriority, User } from '@/types'
import { HierarchyLevel, type HierarchyNode, type HierarchyNodeWithChildren } from '@/types/hierarchy'

const STATUS_OPTIONS: Array<GanttTask['status']> = ['planificada', 'en_progreso', 'bloqueada', 'completada']
const PRIORITY_OPTIONS: IncidentPriority[] = ['critica', 'alta', 'media', 'baja']
const DEPENDENCY_TYPES: Array<'FS' | 'SS' | 'FF' | 'SF'> = ['FS', 'SS', 'FF', 'SF']
const PAGE_SIZE_OPTIONS = ['10', '25', '50', '100'] as const

interface ImportedTaskDraft {
  sourceRow: number
  titulo: string
  descripcion?: string
  equipmentId?: string
  equipmentNombre?: string
  hierarchyNodeId?: string
  hierarchyPath?: string
  responsibleName?: string
  prioridad: IncidentPriority
  status: GanttTask['status']
  progress: number
  startDate: Date
  endDate: Date
  sparePartIds: string[]
}

function flattenHierarchyTree(nodes: HierarchyNodeWithChildren[]): HierarchyNode[] {
  const flat: HierarchyNode[] = []
  const walk = (rows: HierarchyNodeWithChildren[]) => {
    rows.forEach((row) => {
      flat.push(row)
      if (row.children?.length) {
        walk(row.children)
      }
    })
  }
  walk(nodes)
  return flat
}

function normalizeText(value: unknown): string {
  if (value === null || value === undefined) return ''
  return String(value).trim()
}

function normalizeKey(key: string): string {
  return key
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[\s_\-./%()]/g, '')
}

function getRowValue(row: Record<string, unknown>, candidates: string[]): unknown {
  const normalizedEntries = Object.entries(row).map(([key, value]) => [normalizeKey(key), value] as const)
  const byKey = new Map(normalizedEntries)

  for (const candidate of candidates.map(normalizeKey)) {
    if (byKey.has(candidate)) return byKey.get(candidate)
  }

  return ''
}

function parseExcelDate(value: unknown): Date | null {
  if (!value && value !== 0) return null
  if (value instanceof Date && !Number.isNaN(value.getTime())) return value

  if (typeof value === 'number' && Number.isFinite(value)) {
    const excelDate = XLSX.SSF.parse_date_code(value)
    if (excelDate) {
      const parsed = new Date(
        excelDate.y,
        Math.max(0, excelDate.m - 1),
        excelDate.d,
        excelDate.H || 0,
        excelDate.M || 0,
        excelDate.S || 0
      )
      if (!Number.isNaN(parsed.getTime())) return parsed
    }
  }

  const parsed = new Date(String(value))
  if (Number.isNaN(parsed.getTime())) return null
  return parsed
}

function parseProgress(value: unknown): number {
  const raw = normalizeText(value).replace('%', '').replace(',', '.').trim()
  const n = Number(raw)
  if (!Number.isFinite(n)) return 0
  const normalized = n <= 1 ? n * 100 : n
  return Math.max(0, Math.min(100, Math.round(normalized)))
}

function parseHours(value: unknown): number {
  const raw = normalizeText(value).replace(',', '.').trim()
  const n = Number(raw)
  if (!Number.isFinite(n)) return 0
  return Math.max(0, n)
}

function mapStatus(value: unknown): GanttTask['status'] {
  const raw = normalizeText(value).toLowerCase()
  if (raw.includes('complet') || raw.includes('finaliz') || raw.includes('done')) return 'completada'
  if (raw.includes('progreso') || raw.includes('curso') || raw.includes('ejec')) return 'en_progreso'
  if (raw.includes('bloque') || raw.includes('deten')) return 'bloqueada'
  return 'planificada'
}

function mapPriority(value: unknown): IncidentPriority {
  const raw = normalizeText(value).toLowerCase()
  if (raw.includes('crit')) return 'critica'
  if (raw.includes('alt')) return 'alta'
  if (raw.includes('baj')) return 'baja'
  return 'media'
}

function resolveEquipmentByExcel(equipment: Equipment[], equipmentLabel: string, areaLabel: string): Equipment | undefined {
  const eqLabel = normalizeKey(equipmentLabel)
  const area = normalizeKey(areaLabel)

  const candidates = equipment.filter((item) => {
    if (!eqLabel) return false
    const name = normalizeKey(item.nombre)
    const code = normalizeKey(item.codigo)
    return name === eqLabel || code === eqLabel || name.includes(eqLabel) || eqLabel.includes(name)
  })

  if (candidates.length === 0) return undefined
  if (!area) return candidates[0]

  return candidates.find((item) => normalizeKey(item.hierarchyPath ?? '').includes(area)) ?? candidates[0]
}

function resolveAreaNodeByExcel(areaNodes: HierarchyNode[], areaLabel: string): HierarchyNode | undefined {
  const area = normalizeKey(areaLabel)
  if (!area) return undefined
  return areaNodes.find((node) => {
    const name = normalizeKey(node.nombre)
    const code = normalizeKey(node.codigo)
    return name === area || code === area || name.includes(area) || area.includes(name)
  })
}

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
  const [areaFilter, setAreaFilter] = useState<string>('all')
  const [statusFilter, setStatusFilter] = useState<string>('all')
  const [searchText, setSearchText] = useState('')
  const [sortMode, setSortMode] = useState<'jerarquia' | 'fecha' | 'titulo'>('jerarquia')
  const [timelineCollapsed, setTimelineCollapsed] = useState(false)
  const [listCollapsed, setListCollapsed] = useState(false)
  const [timelinePage, setTimelinePage] = useState(1)
  const [listPage, setListPage] = useState(1)
  const [timelinePageSize, setTimelinePageSize] = useState<(typeof PAGE_SIZE_OPTIONS)[number]>('25')
  const [listPageSize, setListPageSize] = useState<(typeof PAGE_SIZE_OPTIONS)[number]>('25')
  const [assignmentFilter, setAssignmentFilter] = useState<'all' | 'mine' | 'unassigned'>('all')
  const [technicians, setTechnicians] = useState<User[]>([])

  const [title, setTitle] = useState('')
  const [areaId, setAreaId] = useState<string>('none')
  const [equipmentId, setEquipmentId] = useState<string>('none')
  const [priority, setPriority] = useState<IncidentPriority>('media')
  const [startDate, setStartDate] = useState(toInputDate(new Date()))
  const [endDate, setEndDate] = useState(toInputDate(new Date(Date.now() + 8 * 60 * 60 * 1000)))
  const [sparePartIdsText, setSparePartIdsText] = useState('')
  const [createResponsibleId, setCreateResponsibleId] = useState<string>('self')

  const [selectedTaskId, setSelectedTaskId] = useState<string>('none')
  const [dependencyTaskId, setDependencyTaskId] = useState<string>('none')
  const [dependencyPredecessorId, setDependencyPredecessorId] = useState<string>('none')
  const [dependencyType, setDependencyType] = useState<'FS' | 'SS' | 'FF' | 'SF'>('FS')
  const [dependencyLag, setDependencyLag] = useState<number>(0)

  const [delayHours, setDelayHours] = useState<number>(4)
  const [simulationText, setSimulationText] = useState<string>('')

  const [comments, setComments] = useState<GanttTaskComment[]>([])
  const [newComment, setNewComment] = useState('')
  const [reportedProgressInput, setReportedProgressInput] = useState('')
  const [commentPhotos, setCommentPhotos] = useState<File[]>([])
  const [commentPhotoPreviews, setCommentPhotoPreviews] = useState<string[]>([])
  const [commentBusy, setCommentBusy] = useState(false)
  const [progressBusy, setProgressBusy] = useState(false)
  const [aiProgressSuggestion, setAiProgressSuggestion] = useState<number | null>(null)
  const [aiProgressReason, setAiProgressReason] = useState('')
  const [importFile, setImportFile] = useState<File | null>(null)
  const [importPreview, setImportPreview] = useState<ImportedTaskDraft[]>([])
  const [importErrors, setImportErrors] = useState<string[]>([])
  const [importBusy, setImportBusy] = useState(false)
  const [importMessage, setImportMessage] = useState<string | null>(null)
  const notifiedDelayedCriticalRef = useRef<Set<string>>(new Set())
  const remoteAlertSentRef = useRef<Set<string>>(new Set())
  const { tree: hierarchyTree } = useHierarchyTree()

  const hierarchyNodes = useMemo(() => flattenHierarchyTree(hierarchyTree), [hierarchyTree])
  const areaNodes = useMemo(
    () => hierarchyNodes.filter((node) => node.nivel === HierarchyLevel.AREA && node.activo),
    [hierarchyNodes]
  )
  const selectedArea = useMemo(
    () => areaNodes.find((node) => node.id === areaId),
    [areaId, areaNodes]
  )
  const selectedAreaFilter = useMemo(
    () => areaNodes.find((node) => node.id === areaFilter),
    [areaFilter, areaNodes]
  )

  const equipmentForSelectedArea = useMemo(() => {
    if (areaId === 'none') return equipment
    const areaName = normalizeKey(selectedArea?.nombre ?? '')
    return equipment.filter((item) => normalizeKey(item.hierarchyPath ?? '').includes(areaName))
  }, [areaId, equipment, selectedArea?.nombre])

  const technicianLookupByName = useMemo(() => {
    const map = new Map<string, User>()
    technicians.forEach((tech) => {
      map.set(normalizeKey(`${tech.nombre} ${tech.apellido}`), tech)
      map.set(normalizeKey(tech.nombre), tech)
      map.set(normalizeKey(tech.apellido), tech)
      map.set(normalizeKey(tech.email), tech)
    })
    return map
  }, [technicians])

  async function load() {
    setLoading(true)
    setError(null)
    try {
      const [rows, eq, techs] = await Promise.all([
        getGanttTasks(),
        getEquipments().catch(() => [] as Equipment[]),
        getTechnicians().catch(() => [] as User[]),
      ])
      setTasks(rows)
      setEquipment(eq)
      setTechnicians(techs)
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
    const query = searchText.trim().toLowerCase()
    return tasks.filter((task) => {
      if (areaFilter !== 'all') {
        const areaName = normalizeKey(selectedAreaFilter?.nombre ?? '')
        const matchById = task.hierarchyNodeId === areaFilter
        const matchByPath = areaName.length > 0 && normalizeKey(task.hierarchyPath ?? '').includes(areaName)
        if (!matchById && !matchByPath) return false
      }
      if (equipmentFilter !== 'all' && task.equipmentId !== equipmentFilter) return false
      if (statusFilter !== 'all' && task.status !== statusFilter) return false
      if (assignmentFilter === 'mine') {
        if (!user?.id || task.responsibleUserId !== user.id) return false
      }
      if (assignmentFilter === 'unassigned' && task.responsibleUserId) return false
      if (query) {
        const haystack = [
          task.titulo,
          task.descripcion ?? '',
          task.equipmentNombre ?? '',
          task.hierarchyPath ?? '',
          task.responsibleName ?? '',
        ].join(' ').toLowerCase()
        if (!haystack.includes(query)) return false
      }
      return true
    })
  }, [areaFilter, assignmentFilter, equipmentFilter, searchText, selectedAreaFilter?.nombre, statusFilter, tasks, user?.id])

  const sortedTasks = useMemo(() => {
    const rows = [...filteredTasks]
    rows.sort((left, right) => {
      if (sortMode === 'titulo') {
        return left.titulo.localeCompare(right.titulo, 'es')
      }

      if (sortMode === 'fecha') {
        const byStart = left.startDate.getTime() - right.startDate.getTime()
        if (byStart !== 0) return byStart
        return left.titulo.localeCompare(right.titulo, 'es')
      }

      const leftHierarchy = (left.hierarchyPath ?? '').trim()
      const rightHierarchy = (right.hierarchyPath ?? '').trim()
      const byHierarchy = leftHierarchy.localeCompare(rightHierarchy, 'es')
      if (byHierarchy !== 0) return byHierarchy

      const leftEquipment = (left.equipmentNombre ?? '').trim()
      const rightEquipment = (right.equipmentNombre ?? '').trim()
      const byEquipment = leftEquipment.localeCompare(rightEquipment, 'es')
      if (byEquipment !== 0) return byEquipment

      return left.titulo.localeCompare(right.titulo, 'es')
    })
    return rows
  }, [filteredTasks, sortMode])

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

  const timelinePageSizeNum = Number(timelinePageSize)
  const listPageSizeNum = Number(listPageSize)
  const totalTimelinePages = Math.max(1, Math.ceil(sortedTasks.length / timelinePageSizeNum))
  const totalListPages = Math.max(1, Math.ceil(sortedTasks.length / listPageSizeNum))
  const safeTimelinePage = Math.min(timelinePage, totalTimelinePages)
  const safeListPage = Math.min(listPage, totalListPages)

  const pagedTimelineTasks = useMemo(() => {
    const start = (safeTimelinePage - 1) * timelinePageSizeNum
    return sortedTasks.slice(start, start + timelinePageSizeNum)
  }, [safeTimelinePage, sortedTasks, timelinePageSizeNum])

  const pagedListTasks = useMemo(() => {
    const start = (safeListPage - 1) * listPageSizeNum
    return sortedTasks.slice(start, start + listPageSizeNum)
  }, [safeListPage, sortedTasks, listPageSizeNum])

  const selectedTask = useMemo(
    () => (selectedTaskId === 'none' ? null : tasks.find((task) => task.id === selectedTaskId) ?? null),
    [selectedTaskId, tasks]
  )

  const canOperateTask = (task: GanttTask) => {
    if (!user?.id) return false
    return canEdit || task.responsibleUserId === user.id
  }

  useEffect(() => {
    setTimelinePage(1)
    setListPage(1)
  }, [areaFilter, assignmentFilter, equipmentFilter, statusFilter, sortMode, searchText, timelinePageSize, listPageSize])

  useEffect(() => {
    if (timelinePage > totalTimelinePages) {
      setTimelinePage(totalTimelinePages)
    }
  }, [timelinePage, totalTimelinePages])

  useEffect(() => {
    if (listPage > totalListPages) {
      setListPage(totalListPages)
    }
  }, [listPage, totalListPages])

  useEffect(() => {
    if (!selectedTask) {
      setReportedProgressInput('')
      return
    }
    setReportedProgressInput(String(selectedTask.progress))
    if (typeof selectedTask.aiSuggestedProgress === 'number') {
      setAiProgressSuggestion(selectedTask.aiSuggestedProgress)
    }
  }, [selectedTask])

  useEffect(() => {
    if (selectedTaskId === 'none') {
      setComments([])
      setAiProgressSuggestion(null)
      setAiProgressReason('')
      return
    }
    getTaskComments(selectedTaskId).then(setComments).catch(() => setComments([]))
  }, [selectedTaskId])

  useEffect(() => {
    return () => {
      commentPhotoPreviews.forEach((url) => URL.revokeObjectURL(url))
    }
  }, [commentPhotoPreviews])

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
    const selectedTechnician = createResponsibleId !== 'self' && createResponsibleId !== 'none'
      ? technicians.find((tech) => tech.id === createResponsibleId)
      : undefined
    const responsibleUserId = createResponsibleId === 'none'
      ? undefined
      : createResponsibleId === 'self'
        ? user.id
        : selectedTechnician?.id
    const responsibleName = createResponsibleId === 'none'
      ? undefined
      : createResponsibleId === 'self'
        ? `${user.nombre} ${user.apellido}`
        : selectedTechnician
          ? `${selectedTechnician.nombre} ${selectedTechnician.apellido}`
          : undefined
    const sparePartIds = sparePartIdsText
      .split(',')
      .map((value) => value.trim())
      .filter(Boolean)

    await createGanttTask({
      titulo: title.trim(),
      descripcion: '',
      equipmentId: equipmentId === 'none' ? undefined : equipmentId,
      equipmentNombre: selectedEquipment?.nombre,
      hierarchyNodeId: selectedEquipment?.hierarchyNodeId ?? (areaId === 'none' ? undefined : areaId),
      hierarchyPath: selectedEquipment?.hierarchyPath ?? selectedArea?.nombre,
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
      responsibleUserId,
      responsibleName,
    })

    setTitle('')
    setSparePartIdsText('')
    setEquipmentId('none')
    setCreateResponsibleId('self')
    await load()
  }

  async function handleAdvance(task: GanttTask) {
    if (!canOperateTask(task)) return

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

  async function handleUpdateTaskProgress(task: GanttTask, progress: number) {
    if (!canOperateTask(task)) return
    const nextProgress = Math.max(0, Math.min(100, Math.round(progress)))
    const nextStatus: GanttTask['status'] = nextProgress >= 100
      ? 'completada'
      : nextProgress > 0 && task.status === 'planificada'
        ? 'en_progreso'
        : task.status

    setProgressBusy(true)
    try {
      await updateGanttTask(task.id, {
        progress: nextProgress,
        status: nextStatus,
      })
      await load()
      setReportedProgressInput(String(nextProgress))
    } finally {
      setProgressBusy(false)
    }
  }

  async function handleDelete(taskId: string) {
    if (!canDelete) return
    await deleteGanttTask(taskId)
    if (selectedTaskId === taskId) setSelectedTaskId('none')
    await load()
  }

  async function handleAssignResponsible(task: GanttTask, technicianId: string) {
    if (!canEdit || technicianId === 'none') return
    const technician = technicians.find((row) => row.id === technicianId)
    if (!technician) return

    await updateGanttTask(task.id, {
      responsibleUserId: technician.id,
      responsibleName: `${technician.nombre} ${technician.apellido}`,
    })
    await load()
  }

  async function handleEstimateProgressWithAI(baseComments?: GanttTaskComment[]) {
    if (!selectedTask) return

    const sourceComments = (baseComments ?? comments).slice(0, 12)
    const result = await estimateGanttProgressFromComments({
      taskTitle: selectedTask.titulo,
      taskDescription: selectedTask.descripcion,
      currentProgress: selectedTask.progress,
      comments: sourceComments.map((comment) => ({
        content: comment.content,
        reportedProgress: comment.reportedProgress,
        createdByName: comment.createdByName,
        createdAt: comment.createdAt,
      })),
    })

    setAiProgressSuggestion(result.suggestedProgress)
    setAiProgressReason(result.rationale)

    await updateGanttTask(selectedTask.id, {
      aiSuggestedProgress: result.suggestedProgress,
    })
  }

  async function handleApplyAISuggestion() {
    if (!selectedTask || aiProgressSuggestion === null) return
    await handleUpdateTaskProgress(selectedTask, aiProgressSuggestion)
  }

  function handleSelectCommentPhotos(event: ChangeEvent<HTMLInputElement>) {
    const files = Array.from(event.target.files ?? [])
    if (files.length === 0) return

    const limited = [...commentPhotos, ...files].slice(0, 5)
    setCommentPhotos(limited)

    commentPhotoPreviews.forEach((url) => URL.revokeObjectURL(url))
    const previews = limited.map((file) => URL.createObjectURL(file))
    setCommentPhotoPreviews(previews)

    event.target.value = ''
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
    if (!user?.id || selectedTaskId === 'none' || !selectedTask || !newComment.trim()) return
    if (!canOperateTask(selectedTask)) {
      setError('Solo el técnico asignado o un usuario con permisos de edición puede reportar avance')
      return
    }

    const parsedProgress = reportedProgressInput.trim().length > 0
      ? Number(reportedProgressInput.replace(',', '.'))
      : null

    const reportedProgress = parsedProgress !== null && Number.isFinite(parsedProgress)
      ? Math.max(0, Math.min(100, Math.round(parsedProgress)))
      : undefined

    setCommentBusy(true)
    setError(null)
    try {
      const draftId = generateId()
      let photos: string[] | undefined

      if (commentPhotos.length > 0) {
        photos = await Promise.all(
          commentPhotos.map((file) => uploadGanttCommentPhoto(selectedTaskId, draftId, file))
        )
      }

      await addTaskComment(selectedTaskId, {
        content: newComment.trim(),
        createdBy: user.id,
        createdByName: `${user.nombre} ${user.apellido}`,
        reportedProgress,
        photos,
      })

      if (typeof reportedProgress === 'number') {
        await handleUpdateTaskProgress(selectedTask, reportedProgress)
      }

      setNewComment('')
      setReportedProgressInput('')
      setCommentPhotos([])
      commentPhotoPreviews.forEach((url) => URL.revokeObjectURL(url))
      setCommentPhotoPreviews([])

      const rows = await getTaskComments(selectedTaskId)
      setComments(rows)
      await handleEstimateProgressWithAI(rows)
    } finally {
      setCommentBusy(false)
    }
  }

  async function handleParseImportFile() {
    if (!importFile) return

    setImportBusy(true)
    setImportMessage(null)
    setImportErrors([])
    try {
      const buffer = await importFile.arrayBuffer()
      const workbook = XLSX.read(buffer, { type: 'array', cellDates: false })
      const tareasSheetName = workbook.SheetNames.find((name) => normalizeKey(name).includes('tareas')) ?? workbook.SheetNames[0]

      if (!tareasSheetName) {
        setImportPreview([])
        setImportErrors(['El archivo no contiene hojas para importar.'])
        return
      }

      const sheet = workbook.Sheets[tareasSheetName]
      if (!sheet) {
        setImportPreview([])
        setImportErrors(['No se pudo leer la hoja de tareas del archivo.'])
        return
      }

      const rows = XLSX.utils.sheet_to_json<Record<string, unknown>>(sheet, { defval: '' })
      if (rows.length === 0) {
        setImportPreview([])
        setImportErrors(['La hoja de tareas está vacía.'])
        return
      }

      const drafts: ImportedTaskDraft[] = []
      const parseErrors: string[] = []

      rows.forEach((row, index) => {
        const sourceRow = index + 2
        const titulo = normalizeText(
          getRowValue(row, ['tarea', 'titulo', 'title', 'actividad', 'nombre'])
        )

        if (!titulo) {
          parseErrors.push(`Fila ${sourceRow}: falta título/tarea`)
          return
        }

        const equipmentLabel = normalizeText(
          getRowValue(row, ['equipo', 'maquina', 'asset', 'equipment'])
        )
        const areaLabel = normalizeText(
          getRowValue(row, ['area', 'área', 'linea', 'línea', 'seccion', 'sección'])
        )
        const responsibleName = normalizeText(
          getRowValue(row, ['responsable', 'asignado', 'owner', 'encargado'])
        )
        const descripcion = normalizeText(
          getRowValue(row, ['descripcion', 'descripción', 'descipacion', 'detalle'])
        )

        const start = parseExcelDate(getRowValue(row, ['inicio', 'fechainicio', 'start', 'inicioreal'])) ?? new Date()
        let end = parseExcelDate(getRowValue(row, ['fin', 'fechafin', 'end', 'termino', 'final']))
        const durationHours = parseHours(getRowValue(row, ['duracion', 'duración', 'horas', 'durationhours']))

        if (!end && durationHours > 0) {
          end = new Date(start.getTime() + durationHours * 60 * 60 * 1000)
        }
        if (!end || end <= start) {
          end = new Date(start.getTime() + 60 * 60 * 1000)
        }

        const status = mapStatus(getRowValue(row, ['estado', 'status']))
        const progress = parseProgress(getRowValue(row, ['avance', 'porcentajeavance', 'progress', '%avance']))
        const prioridad = mapPriority(getRowValue(row, ['prioridad', 'priority']))
        const sparePartIds = normalizeText(getRowValue(row, ['repuestos', 'repuestosids', 'spares', 'spareparts']))
          .split(',')
          .map((value) => value.trim())
          .filter(Boolean)

        const matchedEquipment = resolveEquipmentByExcel(equipment, equipmentLabel, areaLabel)
        const matchedArea = resolveAreaNodeByExcel(areaNodes, areaLabel)

        drafts.push({
          sourceRow,
          titulo,
          descripcion: descripcion || undefined,
          equipmentId: matchedEquipment?.id,
          equipmentNombre: matchedEquipment?.nombre ?? (equipmentLabel || undefined),
          hierarchyNodeId: matchedEquipment?.hierarchyNodeId ?? matchedArea?.id,
          hierarchyPath: matchedEquipment?.hierarchyPath ?? matchedArea?.nombre ?? (areaLabel || undefined),
          responsibleName: responsibleName || undefined,
          prioridad,
          status,
          progress,
          startDate: start,
          endDate: end,
          sparePartIds,
        })
      })

      setImportPreview(drafts)
      setImportErrors(parseErrors)
      setImportMessage(`Pre-carga lista: ${drafts.length} tarea(s) válida(s), ${parseErrors.length} fila(s) descartada(s).`)
    } catch (e) {
      const message = e instanceof Error ? e.message : 'No se pudo procesar el archivo'
      setImportPreview([])
      setImportErrors([message])
    } finally {
      setImportBusy(false)
    }
  }

  async function handleImportPreviewTasks() {
    if (!user?.id || !canCreate || importPreview.length === 0) return

    setImportBusy(true)
    setImportMessage(null)
    setError(null)
    try {
      for (const task of importPreview) {
        const matchedResponsible = task.responsibleName
          ? technicianLookupByName.get(normalizeKey(task.responsibleName))
          : undefined

        await createGanttTask({
          titulo: task.titulo,
          descripcion: task.descripcion ?? '',
          equipmentId: task.equipmentId,
          equipmentNombre: task.equipmentNombre,
          hierarchyNodeId: task.hierarchyNodeId,
          hierarchyPath: task.hierarchyPath,
          status: task.status,
          prioridad: task.prioridad,
          startDate: task.startDate,
          endDate: task.endDate,
          progress: task.progress,
          estimatedHours: Math.max(1, (task.endDate.getTime() - task.startDate.getTime()) / (1000 * 60 * 60)),
          dependencies: [],
          sparePartIds: task.sparePartIds,
          createdBy: user.id,
          responsibleUserId: matchedResponsible?.id,
          responsibleName: matchedResponsible
            ? `${matchedResponsible.nombre} ${matchedResponsible.apellido}`
            : task.responsibleName,
        })
      }

      setImportMessage(`Importación completada: ${importPreview.length} tarea(s) creadas.`)
      setImportPreview([])
      setImportFile(null)
      await load()
    } catch (e) {
      setError(e instanceof Error ? e.message : 'No se pudo importar la pre-carga')
    } finally {
      setImportBusy(false)
    }
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
        <CardHeader className="flex flex-row items-center justify-between space-y-0">
          <CardTitle>Vista temporal y dependencias</CardTitle>
          <Button size="sm" variant="outline" onClick={() => setTimelineCollapsed((prev) => !prev)}>
            {timelineCollapsed ? <ChevronDown className="h-4 w-4 mr-1" /> : <ChevronUp className="h-4 w-4 mr-1" />}
            {timelineCollapsed ? 'Expandir' : 'Colapsar'}
          </Button>
        </CardHeader>
        {!timelineCollapsed && (
          <CardContent className="space-y-3">
            <div className="flex items-center justify-between gap-2">
              <Label className="text-xs text-muted-foreground">Tareas por página (timeline)</Label>
              <Select value={timelinePageSize} onValueChange={(value) => setTimelinePageSize(value as (typeof PAGE_SIZE_OPTIONS)[number])}>
                <SelectTrigger className="w-24 h-8"><SelectValue /></SelectTrigger>
                <SelectContent>
                  {PAGE_SIZE_OPTIONS.map((size) => <SelectItem key={`timeline-size-${size}`} value={size}>{size}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>

            {sortedTasks.length === 0 && (
              <p className="text-sm text-muted-foreground">Sin tareas para visualizar.</p>
            )}

            {pagedTimelineTasks.map((task) => {
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

            {sortedTasks.length > 0 && (
              <div className="flex items-center justify-between pt-1">
                <p className="text-xs text-muted-foreground">Página {safeTimelinePage} de {totalTimelinePages} · {sortedTasks.length} tareas</p>
                <div className="flex gap-2">
                  <Button
                    size="sm"
                    variant="outline"
                    onClick={() => setTimelinePage((prev) => Math.max(1, prev - 1))}
                    disabled={safeTimelinePage <= 1}
                  >
                    Anterior
                  </Button>
                  <Button
                    size="sm"
                    variant="outline"
                    onClick={() => setTimelinePage((prev) => Math.min(totalTimelinePages, prev + 1))}
                    disabled={safeTimelinePage >= totalTimelinePages}
                  >
                    Siguiente
                  </Button>
                </div>
              </div>
            )}
          </CardContent>
        )}
      </Card>

      <div className="grid gap-3 md:grid-cols-6">
        <Card className="lg:col-span-2">
          <CardHeader className="flex flex-row items-center justify-between space-y-0">
            <CardTitle>Listado de tareas</CardTitle>
            <Button size="sm" variant="outline" onClick={() => setListCollapsed((prev) => !prev)}>
              {listCollapsed ? <ChevronDown className="h-4 w-4 mr-1" /> : <ChevronUp className="h-4 w-4 mr-1" />}
              {listCollapsed ? 'Expandir' : 'Colapsar'}
            </Button>
          </CardHeader>
          {!listCollapsed && (
          <CardContent className="space-y-4">
            <div className="grid gap-3 md:grid-cols-4">
              <div>
                <Label>Buscar tarea</Label>
                <Input
                  value={searchText}
                  onChange={(event) => setSearchText(event.target.value)}
                  placeholder="Título, equipo, área, responsable..."
                />
              </div>
              <div>
                <Label>Filtro área</Label>
                <Select value={areaFilter} onValueChange={setAreaFilter}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">Todas</SelectItem>
                    {areaNodes.map((node) => <SelectItem key={`area-filter-${node.id}`} value={node.id}>{node.nombre}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>
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
              <div>
                <Label>Asignación</Label>
                <Select value={assignmentFilter} onValueChange={(value) => setAssignmentFilter(value as 'all' | 'mine' | 'unassigned')}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">Todas</SelectItem>
                    <SelectItem value="mine">Mis tareas</SelectItem>
                    <SelectItem value="unassigned">Sin cuenta asociada</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div>
                <Label>Orden</Label>
                <Select value={sortMode} onValueChange={(value) => setSortMode(value as 'jerarquia' | 'fecha' | 'titulo')}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="jerarquia">Jerarquía</SelectItem>
                    <SelectItem value="fecha">Fecha inicio</SelectItem>
                    <SelectItem value="titulo">Título</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div>
                <Label>Tareas por página</Label>
                <Select value={listPageSize} onValueChange={(value) => setListPageSize(value as (typeof PAGE_SIZE_OPTIONS)[number])}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    {PAGE_SIZE_OPTIONS.map((size) => <SelectItem key={`list-size-${size}`} value={size}>{size}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>
            </div>

            <div className="space-y-2">
              {loading && <p className="text-sm text-muted-foreground">Cargando tareas...</p>}
              {!loading && sortedTasks.length === 0 && <p className="text-sm text-muted-foreground">Sin tareas para los filtros seleccionados.</p>}
              {pagedListTasks.map((task) => {
                const row = cpmMap.get(task.id)
                return (
                  <div key={task.id} className="rounded-lg border p-3 space-y-2">
                    <div className="flex items-center justify-between gap-2">
                      <div>
                        <p className="font-medium">{task.titulo}</p>
                        <p className="text-xs text-muted-foreground">{task.hierarchyPath ?? 'Sin área'} · {task.equipmentNombre ?? 'Sin equipo'} · {task.startDate.toLocaleString()} → {task.endDate.toLocaleString()}</p>
                      </div>
                      <div className="flex items-center gap-2">
                        {row?.isCritical && <Badge variant="destructive">Crítica</Badge>}
                        {task.predictiveRiskLevel && <Badge variant="warning">Riesgo {task.predictiveRiskLevel}</Badge>}
                        {typeof task.aiSuggestedProgress === 'number' && <Badge variant="secondary">IA {task.aiSuggestedProgress}%</Badge>}
                        <Badge variant="outline">{task.status}</Badge>
                      </div>
                    </div>
                    <div className="flex flex-wrap gap-2 text-xs text-muted-foreground">
                      <span>Avance: {task.progress}%</span>
                      <span>Responsable: {task.responsibleName ?? 'Sin asignar'}</span>
                      <span>Holgura: {row?.slack ?? 0}h</span>
                      <span>Dependencias: {task.dependencies.length}</span>
                      <span>Repuestos: {task.sparePartIds?.length ?? 0}</span>
                    </div>
                    {canEdit && (
                      <div>
                        <Label className="text-xs">Asignar técnico (cuenta)</Label>
                        <Select
                          value={task.responsibleUserId ?? 'none'}
                          onValueChange={(value) => handleAssignResponsible(task, value)}
                        >
                          <SelectTrigger className="h-8"><SelectValue placeholder="Seleccionar técnico" /></SelectTrigger>
                          <SelectContent>
                            <SelectItem value="none">Seleccionar técnico</SelectItem>
                            {technicians.map((tech) => (
                              <SelectItem key={`task-tech-${task.id}-${tech.id}`} value={tech.id}>
                                {tech.nombre} {tech.apellido}
                              </SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                      </div>
                    )}
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
                      <Button size="sm" variant="outline" onClick={() => setSelectedTaskId(task.id)}>Detalle</Button>
                      {canOperateTask(task) && task.status !== 'completada' && (
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

              {sortedTasks.length > 0 && (
                <div className="flex items-center justify-between pt-1">
                  <p className="text-xs text-muted-foreground">Página {safeListPage} de {totalListPages} · {sortedTasks.length} tareas</p>
                  <div className="flex gap-2">
                    <Button
                      size="sm"
                      variant="outline"
                      onClick={() => setListPage((prev) => Math.max(1, prev - 1))}
                      disabled={safeListPage <= 1}
                    >
                      Anterior
                    </Button>
                    <Button
                      size="sm"
                      variant="outline"
                      onClick={() => setListPage((prev) => Math.min(totalListPages, prev + 1))}
                      disabled={safeListPage >= totalListPages}
                    >
                      Siguiente
                    </Button>
                  </div>
                </div>
              )}
            </div>
          </CardContent>
          )}
        </Card>

        <div className="space-y-4">
          <Card>
            <CardHeader><CardTitle>Cargar tareas desde Excel</CardTitle></CardHeader>
            <CardContent className="space-y-3">
              <div>
                <Label>Archivo (.xlsx, .xls, .xlsm)</Label>
                <Input
                  type="file"
                  accept=".xlsx,.xls,.xlsm"
                  onChange={(event) => {
                    const file = event.target.files?.[0] ?? null
                    setImportFile(file)
                    setImportPreview([])
                    setImportErrors([])
                    setImportMessage(null)
                  }}
                />
                <p className="text-xs text-muted-foreground mt-1">
                  Hoja esperada: <strong>Tareas</strong>. Se intentan mapear columnas de tarea, equipo, área, estado, prioridad, fechas y avance.
                </p>
              </div>

              <div className="flex gap-2">
                <Button
                  variant="outline"
                  className="flex-1"
                  onClick={handleParseImportFile}
                  disabled={!importFile || importBusy}
                >
                  <FileSpreadsheet className="h-4 w-4 mr-1" /> Previsualizar
                </Button>
                <Button
                  className="flex-1"
                  onClick={handleImportPreviewTasks}
                  disabled={!canCreate || importPreview.length === 0 || importBusy}
                >
                  <Upload className="h-4 w-4 mr-1" /> Importar
                </Button>
              </div>

              {importMessage && <p className="text-xs text-muted-foreground">{importMessage}</p>}

              {importPreview.length > 0 && (
                <div className="rounded border p-2 max-h-36 overflow-auto text-xs space-y-1">
                  {importPreview.slice(0, 8).map((item) => (
                    <p key={`import-preview-${item.sourceRow}`}>
                      Fila {item.sourceRow}: {item.titulo} · {item.equipmentNombre ?? item.hierarchyPath ?? 'Sin equipo/área'}
                    </p>
                  ))}
                  {importPreview.length > 8 && (
                    <p className="text-muted-foreground">+{importPreview.length - 8} tareas más en pre-carga</p>
                  )}
                </div>
              )}

              {importErrors.length > 0 && (
                <div className="rounded border border-destructive/40 p-2 max-h-32 overflow-auto text-xs text-destructive space-y-1">
                  {importErrors.slice(0, 8).map((item, index) => <p key={`import-error-${index}`}>{item}</p>)}
                  {importErrors.length > 8 && <p>+{importErrors.length - 8} errores más</p>}
                </div>
              )}
            </CardContent>
          </Card>

          <Card>
            <CardHeader><CardTitle>Crear tarea</CardTitle></CardHeader>
            <CardContent className="space-y-3">
              <div>
                <Label>Título</Label>
                <Input value={title} onChange={(event) => setTitle(event.target.value)} placeholder="Cambio de rodamiento" />
              </div>
              <div>
                <Label>Área</Label>
                <Select value={areaId} onValueChange={(value) => {
                  setAreaId(value)
                  setEquipmentId('none')
                }}>
                  <SelectTrigger><SelectValue placeholder="Opcional" /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="none">Sin área</SelectItem>
                    {areaNodes.map((node) => <SelectItem key={`area-create-${node.id}`} value={node.id}>{node.nombre}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>
              <div>
                <Label>Equipo</Label>
                <Select value={equipmentId} onValueChange={setEquipmentId}>
                  <SelectTrigger><SelectValue placeholder="Opcional" /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="none">Sin equipo</SelectItem>
                    {equipmentForSelectedArea.map((item) => <SelectItem key={item.id} value={item.id}>{item.nombre}</SelectItem>)}
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
                <Label>Asignar a</Label>
                <Select value={createResponsibleId} onValueChange={setCreateResponsibleId}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="self">Yo ({user?.nombre} {user?.apellido})</SelectItem>
                    <SelectItem value="none">Sin asignar</SelectItem>
                    {technicians
                      .filter((tech) => tech.id !== user?.id)
                      .map((tech) => (
                        <SelectItem key={`create-tech-${tech.id}`} value={tech.id}>
                          {tech.nombre} {tech.apellido}
                        </SelectItem>
                      ))}
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
            <CardHeader><CardTitle>Detalle de tarea</CardTitle></CardHeader>
            <CardContent className="space-y-3">
              {!selectedTask && <p className="text-sm text-muted-foreground">Selecciona una tarea en el listado para ver detalle y avance.</p>}
              {selectedTask && (
                <>
                  <div>
                    <p className="font-medium">{selectedTask.titulo}</p>
                    <p className="text-xs text-muted-foreground">{selectedTask.descripcion?.trim() || 'Sin descripción'}</p>
                  </div>
                  <div className="grid grid-cols-2 gap-2 text-xs">
                    <div className="rounded border p-2">Estado: {selectedTask.status}</div>
                    <div className="rounded border p-2">Avance: {selectedTask.progress}%</div>
                    <div className="rounded border p-2">Área: {selectedTask.hierarchyPath ?? 'Sin área'}</div>
                    <div className="rounded border p-2">Equipo: {selectedTask.equipmentNombre ?? 'Sin equipo'}</div>
                    <div className="rounded border p-2 col-span-2">Responsable: {selectedTask.responsibleName ?? 'Sin asignar'}</div>
                    <div className="rounded border p-2 col-span-2">
                      Fechas: {selectedTask.startDate.toLocaleString()} → {selectedTask.endDate.toLocaleString()}
                    </div>
                  </div>
                  <p className="text-xs text-muted-foreground">
                    Avanzar mueve la tarea de planificada → en progreso → completada y ajusta el avance mínimo automáticamente.
                  </p>
                  <div className="grid grid-cols-2 gap-2">
                    <div>
                      <Label className="text-xs">% avance técnico</Label>
                      <Input
                        type="number"
                        min={0}
                        max={100}
                        value={reportedProgressInput}
                        onChange={(event) => setReportedProgressInput(event.target.value)}
                        placeholder={String(selectedTask.progress)}
                      />
                    </div>
                    <div className="flex items-end">
                      <Button
                        className="w-full"
                        variant="outline"
                        disabled={progressBusy || reportedProgressInput.trim().length === 0 || !canOperateTask(selectedTask)}
                        onClick={() => {
                          const value = Number(reportedProgressInput.replace(',', '.'))
                          if (!Number.isFinite(value)) return
                          void handleUpdateTaskProgress(selectedTask, value)
                        }}
                      >
                        Guardar %
                      </Button>
                    </div>
                  </div>

                  <div className="rounded border p-2 space-y-2">
                    <div className="flex items-center justify-between">
                      <p className="text-xs text-muted-foreground">Sugerencia IA (Grok)</p>
                      <Button size="sm" variant="outline" onClick={() => handleEstimateProgressWithAI()}>
                        <Sparkles className="h-3.5 w-3.5 mr-1" /> Estimar
                      </Button>
                    </div>
                    {aiProgressSuggestion !== null ? (
                      <>
                        <p className="text-sm font-medium">{aiProgressSuggestion}% sugerido</p>
                        {aiProgressReason && <p className="text-xs text-muted-foreground">{aiProgressReason}</p>}
                        <Button
                          size="sm"
                          className="w-full"
                          variant="secondary"
                          disabled={!canOperateTask(selectedTask)}
                          onClick={handleApplyAISuggestion}
                        >
                          Aplicar sugerencia IA
                        </Button>
                      </>
                    ) : (
                      <p className="text-xs text-muted-foreground">Aún sin estimación IA para esta tarea.</p>
                    )}
                  </div>

                  {canOperateTask(selectedTask) && selectedTask.status !== 'completada' && (
                    <Button variant="secondary" className="w-full" onClick={() => handleAdvance(selectedTask)}>
                      <CalendarClock className="h-4 w-4 mr-1" /> Avanzar estado
                    </Button>
                  )}
                </>
              )}
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
              <Input value={newComment} onChange={(event) => setNewComment(event.target.value)} placeholder="Comentario operativo para seguimiento" />
              <Input
                type="number"
                min={0}
                max={100}
                value={reportedProgressInput}
                onChange={(event) => setReportedProgressInput(event.target.value)}
                placeholder="% avance reportado por técnico (opcional)"
              />
              <div className="space-y-2">
                <Label className="text-xs">Fotos de evidencia (máx. 5)</Label>
                <Input type="file" accept="image/*" multiple onChange={handleSelectCommentPhotos} />
                {commentPhotoPreviews.length > 0 && (
                  <div className="grid grid-cols-5 gap-2">
                    {commentPhotoPreviews.map((preview, index) => (
                      <img key={`comment-preview-${index}`} src={preview} alt={`evidencia ${index + 1}`} className="h-16 w-full rounded border object-cover" />
                    ))}
                  </div>
                )}
              </div>
              <Button
                variant="outline"
                className="w-full"
                onClick={handleAddComment}
                disabled={selectedTaskId === 'none' || !newComment.trim() || commentBusy || !selectedTask || !canOperateTask(selectedTask)}
              >
                <Camera className="h-4 w-4 mr-1" /> {commentBusy ? 'Guardando...' : 'Agregar comentario + evidencia'}
              </Button>
              <div className="space-y-2 max-h-44 overflow-auto">
                {comments.map((comment) => (
                  <div key={comment.id} className="rounded border p-2 text-xs">
                    <p>{comment.content}</p>
                    {typeof comment.reportedProgress === 'number' && (
                      <p className="text-muted-foreground mt-1">Reporte técnico: {comment.reportedProgress}%</p>
                    )}
                    {comment.photos && comment.photos.length > 0 && (
                      <div className="mt-2 grid grid-cols-4 gap-2">
                        {comment.photos.map((photo, index) => (
                          <a key={`${comment.id}-photo-${index}`} href={photo} target="_blank" rel="noreferrer">
                            <img src={photo} alt={`foto comentario ${index + 1}`} className="h-16 w-full rounded border object-cover" />
                          </a>
                        ))}
                      </div>
                    )}
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
