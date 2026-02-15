import { useCallback, useEffect, useMemo, useRef, useState, type ChangeEvent } from 'react'
import { AlertTriangle, Bell, CalendarClock, Camera, ChevronDown, ChevronUp, FileSpreadsheet, GitBranchPlus, Link2Off, Plus, Sparkles, Trash2, Upload } from 'lucide-react'
import * as XLSX from 'xlsx'
import {
  Badge,
  Button,
  Card,
  CardContent,
  CardHeader,
  CardTitle,
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
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
import { HIERARCHY_LEVEL_NAMES, HierarchyLevel, type HierarchyNode, type HierarchyNodeWithChildren } from '@/types/hierarchy'

const STATUS_OPTIONS: Array<GanttTask['status']> = ['planificada', 'en_progreso', 'bloqueada', 'completada']
const STATUS_META: Record<GanttTask['status'], { label: string; variant: 'outline' | 'secondary' | 'destructive' | 'warning' | 'success' }> = {
  planificada: { label: 'Abierto', variant: 'outline' },
  en_progreso: { label: 'En progreso', variant: 'secondary' },
  bloqueada: { label: 'Bloqueada', variant: 'warning' },
  completada: { label: 'Completada', variant: 'success' },
}
const PRIORITY_OPTIONS: IncidentPriority[] = ['critica', 'alta', 'media', 'baja']
const DEPENDENCY_TYPES: Array<'FS' | 'SS' | 'FF' | 'SF'> = ['FS', 'SS', 'FF', 'SF']
const PAGE_SIZE_OPTIONS = ['10', '25', '50', '100'] as const
const DAY_MS = 24 * 60 * 60 * 1000
const HOUR_MS = 60 * 60 * 1000
const TIMELINE_ROW_HEIGHT = 44
const TIMELINE_BAR_TOP = 10
const TIMELINE_BAR_HEIGHT_CLASS = 'h-6'
const TIMELINE_BAR_CENTER_OFFSET = 22
const TIMELINE_BASELINE_TOP = 19
const TIMELINE_BASELINE_HEIGHT_CLASS = 'h-2'
const TIMELINE_ANCHOR_RADIUS = 16

type TimelineDragMode = 'move' | 'resize-start' | 'resize-end'
type PlannerTab = 'configuracion' | 'tareas' | 'timeline' | 'carga_tecnico'

const TASK_LOCATION_LEVELS: HierarchyLevel[] = [
  HierarchyLevel.AREA,
  HierarchyLevel.SUB_AREA,
  HierarchyLevel.SISTEMA,
  HierarchyLevel.SUB_SISTEMA,
  HierarchyLevel.SECCION,
  HierarchyLevel.SUB_SECCION,
  HierarchyLevel.ELEMENTO,
]

type HierarchySelectionMap = Record<number, string>

function createEmptyHierarchySelection(): HierarchySelectionMap {
  const selection: HierarchySelectionMap = {}
  TASK_LOCATION_LEVELS.forEach((level) => {
    selection[level] = 'none'
  })
  return selection
}

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

function isWeekend(date: Date) {
  const day = date.getDay()
  return day === 0 || day === 6
}

function moveToWorkingDay(ms: number, direction: 1 | -1 = 1) {
  const next = new Date(ms)
  while (isWeekend(next)) {
    next.setDate(next.getDate() + direction)
  }
  return next.getTime()
}

function addWorkingDays(startMs: number, workDays: number) {
  const cursor = new Date(startMs)
  let remaining = Math.max(0, Math.floor(workDays))

  while (remaining > 0) {
    cursor.setDate(cursor.getDate() + 1)
    if (isWeekend(cursor)) continue
    remaining -= 1
  }

  return cursor.getTime()
}

function formatTimelineDragDate(date: Date) {
  return date.toLocaleString('es-CL', {
    day: '2-digit',
    month: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
  })
}

function formatDeltaHours(deltaHours: number) {
  const rounded = Math.round(deltaHours)
  if (rounded === 0) return '0h'
  return `${rounded > 0 ? '+' : ''}${rounded}h`
}

function resolveDependencyTypeFromAnchors(
  sourceAnchor: 'start' | 'end',
  targetAnchor: 'start' | 'end'
): 'FS' | 'SS' | 'FF' | 'SF' {
  if (sourceAnchor === 'end' && targetAnchor === 'start') return 'FS'
  if (sourceAnchor === 'start' && targetAnchor === 'start') return 'SS'
  if (sourceAnchor === 'end' && targetAnchor === 'end') return 'FF'
  return 'SF'
}

function dependencyDescription(type: 'FS' | 'SS' | 'FF' | 'SF', taskA: string, taskB: string) {
  if (type === 'FS') {
    return `FS (Finish to Start): la tarea B empieza cuando la A termina.\nA: ${taskA}\nB: ${taskB}\nEjemplo aplicado: "${taskB}" inicia cuando finaliza "${taskA}".`
  }
  if (type === 'SS') {
    return `SS (Start to Start): la tarea B empieza cuando la A empieza.\nA: ${taskA}\nB: ${taskB}\nEjemplo aplicado: "${taskB}" inicia cuando inicia "${taskA}".`
  }
  if (type === 'FF') {
    return `FF (Finish to Finish): la tarea B termina cuando la A termina.\nA: ${taskA}\nB: ${taskB}\nEjemplo aplicado: "${taskB}" termina cuando termina "${taskA}".`
  }
  return `SF (Start to Finish): la tarea B termina cuando la A empieza.\nA: ${taskA}\nB: ${taskB}\nEjemplo aplicado: "${taskB}" finaliza cuando comienza "${taskA}".`
}

function dependencyTypeLabel(type: 'FS' | 'SS' | 'FF' | 'SF') {
  if (type === 'FS') return 'FS · Fin → Inicio'
  if (type === 'SS') return 'SS · Inicio → Inicio'
  if (type === 'FF') return 'FF · Fin → Fin'
  return 'SF · Inicio → Fin'
}

function buildOrthogonalDependencyPath(fromX: number, fromY: number, toX: number, toY: number) {
  const verticalDelta = toY - fromY
  if (Math.abs(verticalDelta) < 1) {
    return `M ${fromX} ${fromY} H ${toX}`
  }

  const goingForward = toX >= fromX
  const horizontalGap = Math.abs(toX - fromX)
  if (goingForward) {
    const exitOffset = Math.max(16, Math.min(34, horizontalGap * 0.46 || 16))
    const entryOffset = Math.max(10, Math.min(20, horizontalGap * 0.32 || 10))
    const midX = Math.max(fromX + exitOffset, toX - entryOffset)
    return `M ${fromX} ${fromY} H ${midX} V ${toY} H ${toX}`
  }

  const detourOffset = Math.max(20, Math.min(38, (horizontalGap + 28) * 0.5))
  const detourX = Math.max(8, Math.min(fromX, toX) - detourOffset)
  return `M ${fromX} ${fromY} H ${detourX} V ${toY} H ${toX}`
}

function compactHierarchyPath(hierarchyPath?: string) {
  const parts = (hierarchyPath ?? '')
    .split('>')
    .map((part) => part.trim())
    .filter(Boolean)

  if (parts.length === 0) return 'Sin área'
  return parts[parts.length - 1]
}

function taskLocationSummary(task: Pick<GanttTask, 'hierarchyPath' | 'equipmentNombre'>) {
  const area = compactHierarchyPath(task.hierarchyPath)
  const equipmentName = (task.equipmentNombre ?? '').trim()
  return equipmentName ? `${area} · ${equipmentName}` : area
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
  const canEditTaskIdentity = user?.rol === 'admin' || user?.rol === 'supervisor'

  const [tasks, setTasks] = useState<GanttTask[]>([])
  const [equipment, setEquipment] = useState<Equipment[]>([])
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const [equipmentFilter, setEquipmentFilter] = useState<string>('all')
  const [areaFilter, setAreaFilter] = useState<string>('all')
  const [statusFilter, setStatusFilter] = useState<string>('all')
  const [searchText, setSearchText] = useState('')
  const [sortMode, setSortMode] = useState<'jerarquia' | 'fecha' | 'titulo'>('jerarquia')
  const [plannerTab, setPlannerTab] = useState<PlannerTab>('timeline')
  const [timelineCollapsed, setTimelineCollapsed] = useState(false)
  const [listCollapsed, setListCollapsed] = useState(false)
  const [timelinePage, setTimelinePage] = useState(1)
  const [listPage, setListPage] = useState(1)
  const [timelinePageSize, setTimelinePageSize] = useState<(typeof PAGE_SIZE_OPTIONS)[number]>('25')
  const [listPageSize, setListPageSize] = useState<(typeof PAGE_SIZE_OPTIONS)[number]>('25')
  const [timelineTableWidth, setTimelineTableWidth] = useState(420)
  const [timelineSearch, setTimelineSearch] = useState('')
  const [timelineZoom, setTimelineZoom] = useState<'day' | 'week' | 'month'>('week')
  const [timelineWorkCalendar, setTimelineWorkCalendar] = useState<'all' | 'workdays'>('all')
  const [timelineSnapHours, setTimelineSnapHours] = useState<'auto' | '1' | '6' | '12' | '24'>('auto')
  const [assignmentFilter, setAssignmentFilter] = useState<'all' | 'mine' | 'unassigned'>('all')
  const [technicians, setTechnicians] = useState<User[]>([])

  const [title, setTitle] = useState('')
  const [createHierarchySelection, setCreateHierarchySelection] = useState<HierarchySelectionMap>(() => createEmptyHierarchySelection())
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
  const [reportedDurationInput, setReportedDurationInput] = useState('')
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
  const [timelineQuickStart, setTimelineQuickStart] = useState('')
  const [timelineQuickEnd, setTimelineQuickEnd] = useState('')
  const [timelineQuickTitle, setTimelineQuickTitle] = useState('')
  const [timelineQuickHierarchySelection, setTimelineQuickHierarchySelection] = useState<HierarchySelectionMap>(() => createEmptyHierarchySelection())
  const [timelineQuickEquipmentId, setTimelineQuickEquipmentId] = useState<string>('none')
  const [timelineQuickHours, setTimelineQuickHours] = useState('')
  const [timelineQuickDays, setTimelineQuickDays] = useState('')
  const [timelineQuickDurationUnit, setTimelineQuickDurationUnit] = useState<'hours' | 'days'>('hours')
  const [timelineQuickResponsibleId, setTimelineQuickResponsibleId] = useState<string>('none')
  const [timelineQuickDependencyPredecessorId, setTimelineQuickDependencyPredecessorId] = useState<string>('none')
  const [timelineQuickDependencySearch, setTimelineQuickDependencySearch] = useState('')
  const [timelineQuickDependencyType, setTimelineQuickDependencyType] = useState<'FS' | 'SS' | 'FF' | 'SF'>('FS')
  const [timelineQuickDependencyLag, setTimelineQuickDependencyLag] = useState<number>(0)
  const [timelineQuickModalOpen, setTimelineQuickModalOpen] = useState(false)
  const [tasksCompactView, setTasksCompactView] = useState(false)
  const [timelineDrag, setTimelineDrag] = useState<{
    taskId: string
    mode: TimelineDragMode
    originClientX: number
    originStartMs: number
    originEndMs: number
    previewStartMs: number
    previewEndMs: number
  } | null>(null)
  const [timelineLinkDraft, setTimelineLinkDraft] = useState<{
    sourceTaskId: string
    sourceAnchor: 'start' | 'end'
    currentClientX: number
    currentClientY: number
    targetTaskId?: string
    targetAnchor?: 'start' | 'end'
  } | null>(null)
  const [timelineDependencyMode, setTimelineDependencyMode] = useState(false)
  const notifiedDelayedCriticalRef = useRef<Set<string>>(new Set())
  const remoteAlertSentRef = useRef<Set<string>>(new Set())
  const timelineSplitDragRef = useRef<{ startX: number; startWidth: number } | null>(null)
  const timelineQuickStartInputRef = useRef<HTMLInputElement | null>(null)
  const timelineQuickFocusPendingRef = useRef(false)
  const timelineCanvasRef = useRef<HTMLDivElement | null>(null)
  const { tree: hierarchyTree } = useHierarchyTree()
  const plannerTabStorageKey = useMemo(() => `gantt:plannerTab:${user?.id ?? 'anon'}`, [user?.id])
  const timelineTableWidthStorageKey = useMemo(() => `gantt:timelineTableWidth:${user?.id ?? 'anon'}`, [user?.id])

  const hierarchyNodes = useMemo(() => flattenHierarchyTree(hierarchyTree), [hierarchyTree])
  const hierarchyNodeById = useMemo(() => new Map(hierarchyNodes.map((node) => [node.id, node])), [hierarchyNodes])
  const areaNodes = useMemo(
    () => hierarchyNodes.filter((node) => node.nivel === HierarchyLevel.AREA && node.activo),
    [hierarchyNodes]
  )
  const selectedAreaFilter = useMemo(
    () => areaNodes.find((node) => node.id === areaFilter),
    [areaFilter, areaNodes]
  )

  const hierarchyOptionsByLevel = useCallback((selection: HierarchySelectionMap, level: HierarchyLevel) => {
    const levelNodes = hierarchyNodes
      .filter((node) => node.activo && node.nivel === level)
      .sort((left, right) => left.nombre.localeCompare(right.nombre, 'es'))

    const levelIndex = TASK_LOCATION_LEVELS.indexOf(level)
    if (levelIndex <= 0) return levelNodes

    const previousLevel = TASK_LOCATION_LEVELS[levelIndex - 1]
    if (previousLevel === undefined) return []
    const previousSelectedId = selection[previousLevel]
    if (!previousSelectedId || previousSelectedId === 'none') return []

    return levelNodes.filter((node) => node.parentId === previousSelectedId)
  }, [hierarchyNodes])

  const createSelectedHierarchyNode = useMemo(() => {
    for (let index = TASK_LOCATION_LEVELS.length - 1; index >= 0; index -= 1) {
      const level = TASK_LOCATION_LEVELS[index]
      if (level === undefined) continue
      const selectedId = createHierarchySelection[level]
      if (selectedId && selectedId !== 'none') {
        return hierarchyNodeById.get(selectedId)
      }
    }
    return undefined
  }, [createHierarchySelection, hierarchyNodeById])

  const createHierarchyOptions = useMemo(() => {
    const result = new Map<HierarchyLevel, HierarchyNode[]>()
    TASK_LOCATION_LEVELS.forEach((level) => {
      result.set(level, hierarchyOptionsByLevel(createHierarchySelection, level))
    })
    return result
  }, [createHierarchySelection, hierarchyOptionsByLevel])

  const equipmentForSelectedHierarchy = useMemo(() => {
    if (!createSelectedHierarchyNode) return equipment
    const locationKey = normalizeKey(createSelectedHierarchyNode.nombre)
    return equipment.filter((item) => {
      if (item.hierarchyNodeId && item.hierarchyNodeId === createSelectedHierarchyNode.id) return true
      return normalizeKey(item.hierarchyPath ?? '').includes(locationKey)
    })
  }, [createSelectedHierarchyNode, equipment])

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

  const load = useCallback(async () => {
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
  }, [])

  useEffect(() => {
    void load()
  }, [load])

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

  const timelineFilteredTasks = useMemo(() => {
    const query = normalizeKey(timelineSearch)
    if (!query) return sortedTasks

    return sortedTasks.filter((task) => {
      const haystack = normalizeKey([
        task.hierarchyPath ?? '',
        compactHierarchyPath(task.hierarchyPath),
        task.equipmentNombre ?? '',
        task.titulo,
        task.descripcion ?? '',
        task.responsibleName ?? '',
      ].join(' '))
      return haystack.includes(query)
    })
  }, [sortedTasks, timelineSearch])

  const timelinePageSizeNum = Number(timelinePageSize)
  const listPageSizeNum = Number(listPageSize)
  const totalTimelinePages = Math.max(1, Math.ceil(timelineFilteredTasks.length / timelinePageSizeNum))
  const totalListPages = Math.max(1, Math.ceil(sortedTasks.length / listPageSizeNum))
  const safeTimelinePage = Math.min(timelinePage, totalTimelinePages)
  const safeListPage = Math.min(listPage, totalListPages)

  const pagedTimelineTasks = useMemo(() => {
    const start = (safeTimelinePage - 1) * timelinePageSizeNum
    return timelineFilteredTasks.slice(start, start + timelinePageSizeNum)
  }, [safeTimelinePage, timelineFilteredTasks, timelinePageSizeNum])

  const pagedListTasks = useMemo(() => {
    const start = (safeListPage - 1) * listPageSizeNum
    return sortedTasks.slice(start, start + listPageSizeNum)
  }, [safeListPage, sortedTasks, listPageSizeNum])

  const timeline = useMemo(() => {
    const timelineSourceTasks = pagedTimelineTasks.length > 0 ? pagedTimelineTasks : sortedTasks
    if (timelineSourceTasks.length === 0) {
      return {
        minStart: 0,
        maxEnd: 0,
        widthPx: 0,
        todayLeftPx: 0,
        showTodayLine: false,
      }
    }

    const minStart = Math.min(...timelineSourceTasks.map((task) => (task.baselineStartDate ?? task.startDate).getTime()))
    const maxEnd = Math.max(...timelineSourceTasks.map((task) => (task.baselineEndDate ?? task.endDate).getTime()))
    const paddedStart = minStart - DAY_MS
    const paddedEnd = maxEnd + DAY_MS
    const totalDays = Math.max(2, Math.ceil((paddedEnd - paddedStart) / DAY_MS))
    const pixelsPerDay = timelineZoom === 'day' ? 120 : timelineZoom === 'week' ? 40 : 14
    const widthPx = Math.max(900, totalDays * pixelsPerDay)
    const now = Date.now()
    const todayLeftPx = ((now - paddedStart) / (paddedEnd - paddedStart)) * widthPx

    return {
      minStart: paddedStart,
      maxEnd: paddedEnd,
      widthPx,
      todayLeftPx,
      showTodayLine: now >= paddedStart && now <= paddedEnd,
    }
  }, [pagedTimelineTasks, sortedTasks, timelineZoom])

  const timelineTicks = useMemo(() => {
    const totalMs = timeline.maxEnd - timeline.minStart
    if (timeline.widthPx <= 0 || totalMs <= 0) return [] as Array<{ leftPx: number; label: string; major: boolean }>

    const minorStepMs = timelineZoom === 'day' ? DAY_MS : timelineZoom === 'week' ? DAY_MS * 2 : DAY_MS * 7
    const majorEvery = timelineZoom === 'day' ? 7 : timelineZoom === 'week' ? 3 : 4
    const alignedStart = Math.floor(timeline.minStart / minorStepMs) * minorStepMs

    const minorFormatter = new Intl.DateTimeFormat('es-CL', {
      day: '2-digit',
      month: timelineZoom === 'month' ? undefined : '2-digit',
    })

    const majorFormatter = new Intl.DateTimeFormat('es-CL', {
      day: '2-digit',
      month: '2-digit',
    })

    const ticks: Array<{ leftPx: number; label: string; major: boolean }> = []

    for (let index = 0, ms = alignedStart; ms <= timeline.maxEnd + minorStepMs && index < 800; index += 1, ms += minorStepMs) {
      const leftPx = ((ms - timeline.minStart) / totalMs) * timeline.widthPx
      if (leftPx < 0 || leftPx > timeline.widthPx) continue

      const major = index % majorEvery === 0
      ticks.push({
        leftPx,
        major,
        label: major ? majorFormatter.format(new Date(ms)) : minorFormatter.format(new Date(ms)),
      })
    }

    return ticks
  }, [timeline.maxEnd, timeline.minStart, timeline.widthPx, timelineZoom])

  const timelineDayBands = useMemo(() => {
    const totalMs = timeline.maxEnd - timeline.minStart
    if (timeline.widthPx <= 0 || totalMs <= 0) {
      return [] as Array<{ leftPx: number; widthPx: number; major: boolean; shade: boolean }>
    }

    const alignedStart = Math.floor(timeline.minStart / DAY_MS) * DAY_MS
    const bands: Array<{ leftPx: number; widthPx: number; major: boolean; shade: boolean }> = []

    for (let index = 0, ms = alignedStart; ms < timeline.maxEnd + DAY_MS && index < 1200; index += 1, ms += DAY_MS) {
      const nextMs = ms + DAY_MS
      const leftRaw = ((ms - timeline.minStart) / totalMs) * timeline.widthPx
      const rightRaw = ((nextMs - timeline.minStart) / totalMs) * timeline.widthPx

      if (rightRaw <= 0 || leftRaw >= timeline.widthPx) continue

      const leftPx = Math.max(0, leftRaw)
      const rightPx = Math.min(timeline.widthPx, rightRaw)
      const widthPx = Math.max(1, rightPx - leftPx)
      const day = new Date(ms).getDay()

      bands.push({
        leftPx,
        widthPx,
        major: day === 1,
        shade: index % 2 === 0,
      })
    }

    return bands
  }, [timeline.maxEnd, timeline.minStart, timeline.widthPx])

  const delayedCriticalTasks = useMemo(() => {
    const now = Date.now()
    const critical = new Set(cpm.criticalPath)
    return filteredTasks.filter((task) => critical.has(task.id) && task.status !== 'completada' && task.endDate.getTime() < now)
  }, [cpm.criticalPath, filteredTasks])

  const selectedTask = useMemo(
    () => (selectedTaskId === 'none' ? null : tasks.find((task) => task.id === selectedTaskId) ?? null),
    [selectedTaskId, tasks]
  )

  const canOperateTask = useCallback((task: GanttTask) => {
    if (!user?.id) return false
    return canEdit || task.responsibleUserId === user.id
  }, [canEdit, user?.id])

  const timelineRows = useMemo(() => {
    const total = Math.max(1, timeline.maxEnd - timeline.minStart)
    const widthPx = Math.max(1, timeline.widthPx)

    return pagedTimelineTasks.map((task, rowIndex) => {
      const baselineStart = (task.baselineStartDate ?? task.startDate).getTime()
      const baselineEnd = (task.baselineEndDate ?? task.endDate).getTime()
      const previewStartMs = timelineDrag?.taskId === task.id ? timelineDrag.previewStartMs : task.startDate.getTime()
      const previewEndMs = timelineDrag?.taskId === task.id ? timelineDrag.previewEndMs : task.endDate.getTime()
      const leftRaw = ((previewStartMs - timeline.minStart) / total) * widthPx
      const widthRaw = ((previewEndMs - previewStartMs) / total) * widthPx
      const baselineLeftRaw = ((baselineStart - timeline.minStart) / total) * widthPx
      const baselineWidthRaw = ((baselineEnd - baselineStart) / total) * widthPx

      const left = Number.isFinite(leftRaw) ? Math.max(0, Math.min(widthPx - 4, leftRaw)) : 0
      const width = Number.isFinite(widthRaw) ? Math.max(4, Math.min(widthPx - left, widthRaw)) : 4
      const baselineLeft = Number.isFinite(baselineLeftRaw) ? Math.max(0, Math.min(widthPx - 4, baselineLeftRaw)) : 0
      const baselineWidth = Number.isFinite(baselineWidthRaw) ? Math.max(4, Math.min(widthPx - baselineLeft, baselineWidthRaw)) : 4
      const baselineDurationHours = Math.max(1, Math.round((baselineEnd - baselineStart) / HOUR_MS))
      const realDurationHours = Math.max(1, Math.round((previewEndMs - previewStartMs) / HOUR_MS))
      const baselineDeltaHours = realDurationHours - baselineDurationHours

      return {
        task,
        rowIndex,
        left,
        width,
        baselineLeft,
        baselineWidth,
        baselineDeltaHours,
        isCritical: cpm.criticalPath.includes(task.id),
        interactive: canOperateTask(task),
      }
    })
  }, [canOperateTask, cpm.criticalPath, pagedTimelineTasks, timeline.maxEnd, timeline.minStart, timeline.widthPx, timelineDrag])

  const timelineDependencyLines = useMemo(() => {
    const byId = new Map(timelineRows.map((row) => [row.task.id, row]))
    const lines: Array<{
      key: string
      fromX: number
      fromY: number
      toX: number
      toY: number
      depType: 'FS' | 'SS' | 'FF' | 'SF'
      infoTitle: string
    }> = []

    timelineRows.forEach((row) => {
      row.task.dependencies
        .forEach((dependency, index) => {
          const predecessor = byId.get(dependency.predecessorId)
          if (!predecessor) return

          const predecessorStartX = predecessor.left
          const predecessorEndX = predecessor.left + predecessor.width
          const successorStartX = row.left
          const successorEndX = row.left + row.width

          const fromX = dependency.type === 'FS' || dependency.type === 'FF'
            ? predecessorEndX
            : predecessorStartX
          const toX = dependency.type === 'FS' || dependency.type === 'SS'
            ? successorStartX
            : successorEndX
          const fromY = predecessor.rowIndex * TIMELINE_ROW_HEIGHT + TIMELINE_BAR_CENTER_OFFSET
          const toY = row.rowIndex * TIMELINE_ROW_HEIGHT + TIMELINE_BAR_CENTER_OFFSET

          lines.push({
            key: `${row.task.id}-${dependency.predecessorId}-${dependency.type}-${index}`,
            fromX,
            fromY,
            toX,
            toY,
            depType: dependency.type,
            infoTitle: dependencyDescription(dependency.type, predecessor.task.titulo, row.task.titulo),
          })
        })
    })

    return lines
  }, [timelineRows])

  const selectedTimelineTask = useMemo(() => {
    if (selectedTaskId === 'none') return null
    return timelineFilteredTasks.find((task) => task.id === selectedTaskId) ?? selectedTask
  }, [selectedTask, selectedTaskId, timelineFilteredTasks])

  const timelineQuickSelectedHierarchyNode = useMemo(() => {
    for (let index = TASK_LOCATION_LEVELS.length - 1; index >= 0; index -= 1) {
      const level = TASK_LOCATION_LEVELS[index]
      if (level === undefined) continue
      const selectedId = timelineQuickHierarchySelection[level]
      if (selectedId && selectedId !== 'none') {
        return hierarchyNodeById.get(selectedId)
      }
    }
    return undefined
  }, [hierarchyNodeById, timelineQuickHierarchySelection])

  const timelineQuickHierarchyOptions = useMemo(() => {
    const result = new Map<HierarchyLevel, HierarchyNode[]>()
    TASK_LOCATION_LEVELS.forEach((level) => {
      result.set(level, hierarchyOptionsByLevel(timelineQuickHierarchySelection, level))
    })
    return result
  }, [hierarchyOptionsByLevel, timelineQuickHierarchySelection])

  const timelineQuickEquipmentOptions = useMemo(() => {
    if (!timelineQuickSelectedHierarchyNode) return equipment
    const locationKey = normalizeKey(timelineQuickSelectedHierarchyNode.nombre)
    return equipment.filter((item) => {
      if (item.hierarchyNodeId && item.hierarchyNodeId === timelineQuickSelectedHierarchyNode.id) return true
      return normalizeKey(item.hierarchyPath ?? '').includes(locationKey)
    })
  }, [equipment, timelineQuickSelectedHierarchyNode])

  const timelineQuickDependencyCandidates = useMemo(() => {
    if (!selectedTimelineTask) return [] as GanttTask[]
    const query = normalizeKey(timelineQuickDependencySearch)

    return tasks
      .filter((task) => task.id !== selectedTimelineTask.id)
      .filter((task) => {
        if (!query) return true
        const haystack = normalizeKey(`${task.titulo} ${taskLocationSummary(task)}`)
        return haystack.includes(query)
      })
      .slice(0, 300)
  }, [selectedTimelineTask, tasks, timelineQuickDependencySearch])

  const timelineResourceLoad = useMemo(() => {
    const totals = new Map<string, { name: string; hours: number; tasks: number }>()

    timelineFilteredTasks
      .filter((task) => task.status !== 'completada')
      .forEach((task) => {
        const key = task.responsibleUserId ?? 'unassigned'
        const name = task.responsibleName ?? 'Sin asignar'
        const row = totals.get(key) ?? { name, hours: 0, tasks: 0 }
        const durationHours = Math.max(1, Math.round((task.endDate.getTime() - task.startDate.getTime()) / HOUR_MS))
        row.hours += durationHours
        row.tasks += 1
        totals.set(key, row)
      })

    const rows = Array.from(totals.values()).sort((a, b) => b.hours - a.hours).slice(0, 8)
    const maxHours = rows.reduce((acc, row) => Math.max(acc, row.hours), 1)

    return rows.map((row) => ({
      ...row,
      pct: Math.max(6, Math.round((row.hours / maxHours) * 100)),
    }))
  }, [timelineFilteredTasks])

  const detectTimelineAnchor = useCallback((clientX: number, clientY: number, sourceTaskId: string) => {
    const canvas = timelineCanvasRef.current
    if (!canvas) return null

    const rect = canvas.getBoundingClientRect()
    const localX = clientX - rect.left
    const localY = clientY - rect.top
    let best: { taskId: string; anchor: 'start' | 'end'; distance: number } | null = null

    timelineRows.forEach((row) => {
      if (row.task.id === sourceTaskId) return
      const y = row.rowIndex * TIMELINE_ROW_HEIGHT + TIMELINE_BAR_CENTER_OFFSET
      const anchors: Array<{ anchor: 'start' | 'end'; x: number }> = [
        { anchor: 'start', x: row.left },
        { anchor: 'end', x: row.left + row.width },
      ]

      anchors.forEach((candidate) => {
        const distance = Math.hypot(localX - candidate.x, localY - y)
        if (distance > TIMELINE_ANCHOR_RADIUS) return
        if (!best || distance < best.distance) {
          best = { taskId: row.task.id, anchor: candidate.anchor, distance }
        }
      })
    })

    if (!best) return null
    const resolved = best as { taskId: string; anchor: 'start' | 'end'; distance: number }
    return { taskId: resolved.taskId, anchor: resolved.anchor }
  }, [timelineRows])

  const timelineLinkPreview = useMemo(() => {
    if (!timelineLinkDraft) return null
    const canvas = timelineCanvasRef.current
    const sourceRow = timelineRows.find((row) => row.task.id === timelineLinkDraft.sourceTaskId)
    if (!canvas || !sourceRow) return null

    const rect = canvas.getBoundingClientRect()
    const sourceX = timelineLinkDraft.sourceAnchor === 'start' ? sourceRow.left : sourceRow.left + sourceRow.width
    const sourceY = sourceRow.rowIndex * TIMELINE_ROW_HEIGHT + TIMELINE_BAR_CENTER_OFFSET

    const targetRow = timelineLinkDraft.targetTaskId
      ? timelineRows.find((row) => row.task.id === timelineLinkDraft.targetTaskId)
      : null
    const targetX = targetRow
      ? (timelineLinkDraft.targetAnchor === 'start' ? targetRow.left : targetRow.left + targetRow.width)
      : timelineLinkDraft.currentClientX - rect.left
    const targetY = targetRow
      ? targetRow.rowIndex * TIMELINE_ROW_HEIGHT + TIMELINE_BAR_CENTER_OFFSET
      : timelineLinkDraft.currentClientY - rect.top

    return {
      sourceX,
      sourceY,
      targetX,
      targetY,
      type: timelineLinkDraft.targetAnchor
        ? resolveDependencyTypeFromAnchors(timelineLinkDraft.sourceAnchor, timelineLinkDraft.targetAnchor)
        : null,
    }
  }, [timelineLinkDraft, timelineRows])

  const getTimelineSnapMs = useCallback(() => {
    if (timelineSnapHours !== 'auto') {
      return Number(timelineSnapHours) * HOUR_MS
    }
    if (timelineZoom === 'day') return HOUR_MS
    if (timelineZoom === 'week') return 6 * HOUR_MS
    return 12 * HOUR_MS
  }, [timelineSnapHours, timelineZoom])

  const alignTimelineMs = useCallback((ms: number) => {
    const snap = getTimelineSnapMs()
    const snapped = Math.round(ms / snap) * snap
    if (timelineWorkCalendar === 'workdays') {
      return moveToWorkingDay(snapped, 1)
    }
    return snapped
  }, [getTimelineSnapMs, timelineWorkCalendar])

  const updateTimelineDragPreview = useCallback((clientX: number) => {
    setTimelineDrag((current) => {
      if (!current) return current
      const totalMs = Math.max(1, timeline.maxEnd - timeline.minStart)
      const deltaMsRaw = ((clientX - current.originClientX) / Math.max(1, timeline.widthPx)) * totalMs
      const deltaMs = alignTimelineMs(deltaMsRaw)

      if (current.mode === 'move') {
        const duration = current.originEndMs - current.originStartMs
        const nextStart = alignTimelineMs(current.originStartMs + deltaMs)
        const nextEnd = nextStart + duration
        return { ...current, previewStartMs: nextStart, previewEndMs: nextEnd }
      }

      if (current.mode === 'resize-start') {
        const proposedStart = alignTimelineMs(current.originStartMs + deltaMs)
        const nextStart = Math.min(proposedStart, current.previewEndMs - HOUR_MS)
        return { ...current, previewStartMs: nextStart }
      }

      const proposedEnd = alignTimelineMs(current.originEndMs + deltaMs)
      const nextEnd = Math.max(proposedEnd, current.previewStartMs + HOUR_MS)
      return { ...current, previewEndMs: nextEnd }
    })
  }, [alignTimelineMs, timeline.maxEnd, timeline.minStart, timeline.widthPx])

  const handleUpdateTaskDates = useCallback(async (task: GanttTask, startDate: Date, endDate: Date) => {
    if (!canOperateTask(task)) return

    const byId = new Map(tasks.map((row) => [row.id, row]))
    const updates = new Map<string, { startDate: Date; endDate: Date }>()
    updates.set(task.id, { startDate, endDate })

    const queue: string[] = [task.id]
    let guard = 0

    while (queue.length > 0 && guard < 500) {
      guard += 1
      const currentId = queue.shift() as string
      const currentTask = byId.get(currentId)
      const currentWindow = updates.get(currentId)
      if (!currentTask || !currentWindow) continue

      tasks.forEach((candidate) => {
        const linkedDependencies = candidate.dependencies.filter(
          (dependency) => dependency.predecessorId === currentId
        )
        if (linkedDependencies.length === 0) return

        const candidateWindow = updates.get(candidate.id) ?? {
          startDate: candidate.startDate,
          endDate: candidate.endDate,
        }

        const durationMs = Math.max(HOUR_MS, candidateWindow.endDate.getTime() - candidateWindow.startDate.getTime())

        const requiredStarts = candidate.dependencies
          .map((dependency) => {
            const predecessorWindow = updates.get(dependency.predecessorId)
              ?? (() => {
                const predecessor = byId.get(dependency.predecessorId)
                if (!predecessor) return null
                return { startDate: predecessor.startDate, endDate: predecessor.endDate }
              })()
            if (!predecessorWindow) return candidateWindow.startDate.getTime()

            const lagMs = (dependency.lagHours ?? 0) * HOUR_MS

            if (dependency.type === 'SS') {
              return predecessorWindow.startDate.getTime() + lagMs
            }

            if (dependency.type === 'FF') {
              return predecessorWindow.endDate.getTime() + lagMs - durationMs
            }

            if (dependency.type === 'SF') {
              return predecessorWindow.startDate.getTime() + lagMs - durationMs
            }

            return predecessorWindow.endDate.getTime() + lagMs
          })

        const requiredStartMs = Math.max(...requiredStarts)
        const alignedStartMs = timelineWorkCalendar === 'workdays'
          ? moveToWorkingDay(alignTimelineMs(requiredStartMs), 1)
          : alignTimelineMs(requiredStartMs)
        if (candidateWindow.startDate.getTime() >= alignedStartMs) return

        const nextStart = new Date(alignedStartMs)
        const nextEnd = new Date(nextStart.getTime() + durationMs)

        updates.set(candidate.id, { startDate: nextStart, endDate: nextEnd })
        queue.push(candidate.id)
      })
    }

    await Promise.all(
      Array.from(updates.entries()).map(([taskId, window]) =>
        {
          const estimatedHours = Math.max(1, Math.round((window.endDate.getTime() - window.startDate.getTime()) / HOUR_MS))
          return updateGanttTask(taskId, {
            startDate: window.startDate,
            endDate: window.endDate,
            estimatedHours,
          })
        }
      )
    )

    await load()
  }, [alignTimelineMs, canOperateTask, load, tasks, timelineWorkCalendar])

  function handleTimelineDragStart(task: GanttTask, mode: TimelineDragMode, clientX: number) {
    if (!canOperateTask(task)) return
    setTimelineDrag({
      taskId: task.id,
      mode,
      originClientX: clientX,
      originStartMs: task.startDate.getTime(),
      originEndMs: task.endDate.getTime(),
      previewStartMs: task.startDate.getTime(),
      previewEndMs: task.endDate.getTime(),
    })
  }

  function handleTimelineLinkStart(
    sourceTaskId: string,
    sourceAnchor: 'start' | 'end',
    clientX: number,
    clientY: number
  ) {
    if (!canEdit || !timelineDependencyMode) return
    setTimelineLinkDraft({
      sourceTaskId,
      sourceAnchor,
      currentClientX: clientX,
      currentClientY: clientY,
    })
  }

  const handleTimelineSplitDragStart = useCallback((clientX: number) => {
    timelineSplitDragRef.current = {
      startX: clientX,
      startWidth: timelineTableWidth,
    }
  }, [timelineTableWidth])

  const handleCreateHierarchyLevelChange = useCallback((level: HierarchyLevel, value: string) => {
    setCreateHierarchySelection((current) => {
      const next = { ...current, [level]: value }
      let reset = false
      TASK_LOCATION_LEVELS.forEach((candidate) => {
        if (candidate === level) {
          reset = true
          return
        }
        if (reset) {
          next[candidate] = 'none'
        }
      })
      return next
    })
    setEquipmentId('none')
  }, [])

  const handleTimelineQuickHierarchyLevelChange = useCallback((level: HierarchyLevel, value: string) => {
    setTimelineQuickHierarchySelection((current) => {
      const next = { ...current, [level]: value }
      let reset = false
      TASK_LOCATION_LEVELS.forEach((candidate) => {
        if (candidate === level) {
          reset = true
          return
        }
        if (reset) {
          next[candidate] = 'none'
        }
      })
      return next
    })
    setTimelineQuickEquipmentId('none')
  }, [])

  const openTimelineQuickEditor = useCallback((taskId: string) => {
    timelineQuickFocusPendingRef.current = true
    setPlannerTab('timeline')
    setTimelineCollapsed(false)
    setSelectedTaskId(taskId)
    setTimelineQuickModalOpen(true)
  }, [])

  const handleTimelineQuickSaveDates = useCallback(async () => {
    if (!selectedTimelineTask) return

    const nextStart = new Date(timelineQuickStart)
    const nextEnd = new Date(timelineQuickEnd)

    if (Number.isNaN(nextStart.getTime()) || Number.isNaN(nextEnd.getTime())) {
      setError('Fechas inválidas en edición rápida')
      return
    }

    if (nextEnd.getTime() <= nextStart.getTime()) {
      setError('La fecha fin debe ser mayor al inicio')
      return
    }

    await handleUpdateTaskDates(selectedTimelineTask, nextStart, nextEnd)
  }, [handleUpdateTaskDates, selectedTimelineTask, timelineQuickEnd, timelineQuickStart])

  const handleTimelineQuickApplyHours = useCallback(async () => {
    if (!selectedTimelineTask) return

    const nextStart = new Date(timelineQuickStart)
    if (Number.isNaN(nextStart.getTime())) {
      setError('Fecha inicio inválida en edición rápida')
      return
    }

    const hours = timelineQuickDurationUnit === 'hours'
      ? Number(timelineQuickHours.replace(',', '.'))
      : Number(timelineQuickDays.replace(',', '.')) * 24

    if (!Number.isFinite(hours) || hours <= 0) {
      setError(timelineQuickDurationUnit === 'hours' ? 'Horas inválidas en edición rápida' : 'Días inválidos en edición rápida')
      return
    }

    const daysFromInput = Number(timelineQuickDays.replace(',', '.'))
    const usesWorkingDays = timelineWorkCalendar === 'workdays' && timelineQuickDurationUnit === 'days' && Number.isFinite(daysFromInput) && daysFromInput > 0
    const nextEnd = usesWorkingDays
      ? new Date(addWorkingDays(nextStart.getTime(), Math.max(1, Math.round(daysFromInput))))
      : new Date(nextStart.getTime() + hours * HOUR_MS)
    setTimelineQuickEnd(toInputDate(nextEnd))
    setTimelineQuickHours(String(Math.max(1, Math.round(hours))))
    setTimelineQuickDays(String(Math.max(1, Math.ceil(hours / 24))))
    await handleUpdateTaskDates(selectedTimelineTask, nextStart, nextEnd)
  }, [handleUpdateTaskDates, selectedTimelineTask, timelineQuickDays, timelineQuickDurationUnit, timelineQuickHours, timelineQuickStart, timelineWorkCalendar])

  async function handleTimelineQuickAssignUser() {
    if (!selectedTimelineTask) return
    await handleAssignResponsible(selectedTimelineTask, timelineQuickResponsibleId)
  }

  async function handleTimelineQuickSaveIdentity() {
    if (!selectedTimelineTask || !canEditTaskIdentity) return

    const nextTitle = timelineQuickTitle.trim()
    if (!nextTitle) {
      setError('El título de la tarea no puede quedar vacío')
      return
    }

    const selectedEquipment = timelineQuickEquipmentId === 'none'
      ? undefined
      : equipment.find((item) => item.id === timelineQuickEquipmentId)
    const selectedHierarchyNode = timelineQuickSelectedHierarchyNode

    await updateGanttTask(selectedTimelineTask.id, {
      titulo: nextTitle,
      equipmentId: selectedEquipment?.id,
      equipmentNombre: selectedEquipment?.nombre,
      hierarchyNodeId: selectedEquipment?.hierarchyNodeId ?? selectedHierarchyNode?.id,
      hierarchyPath: selectedEquipment?.hierarchyPath ?? selectedHierarchyNode?.nombre,
    })
    await load()
  }

  async function handleTimelineQuickAddDependency() {
    if (!canEdit || !selectedTimelineTask || timelineQuickDependencyPredecessorId === 'none') return
    if (selectedTimelineTask.id === timelineQuickDependencyPredecessorId) {
      setError('Una tarea no puede depender de sí misma')
      return
    }

    const alreadyExists = selectedTimelineTask.dependencies.some(
      (dependency) => dependency.predecessorId === timelineQuickDependencyPredecessorId && dependency.type === timelineQuickDependencyType
    )
    if (alreadyExists) return

    const dependencies = [
      ...selectedTimelineTask.dependencies,
      {
        predecessorId: timelineQuickDependencyPredecessorId,
        type: timelineQuickDependencyType,
        lagHours: timelineQuickDependencyLag,
      },
    ]

    await updateGanttTask(selectedTimelineTask.id, { dependencies })
    setTimelineQuickDependencyPredecessorId('none')
    setTimelineQuickDependencyType('FS')
    setTimelineQuickDependencyLag(0)
    await load()
  }

  async function handleTimelineQuickRemoveDependency(predecessorId: string, type: 'FS' | 'SS' | 'FF' | 'SF') {
    if (!canEdit || !selectedTimelineTask) return
    await handleRemoveDependency(selectedTimelineTask, predecessorId, type)
  }

  useEffect(() => {
    setTimelinePage(1)
    setListPage(1)
  }, [areaFilter, assignmentFilter, equipmentFilter, statusFilter, sortMode, searchText, timelinePageSize, listPageSize])

  useEffect(() => {
    const savedTab = window.localStorage.getItem(plannerTabStorageKey)
    if (savedTab === 'configuracion' || savedTab === 'tareas' || savedTab === 'timeline' || savedTab === 'carga_tecnico') {
      setPlannerTab(savedTab)
    }
  }, [plannerTabStorageKey])

  useEffect(() => {
    window.localStorage.setItem(plannerTabStorageKey, plannerTab)
  }, [plannerTab, plannerTabStorageKey])

  useEffect(() => {
    const stored = window.localStorage.getItem(timelineTableWidthStorageKey)
    if (!stored) return
    const value = Number(stored)
    if (Number.isFinite(value)) {
      setTimelineTableWidth(Math.max(320, Math.min(760, value)))
    }
  }, [timelineTableWidthStorageKey])

  useEffect(() => {
    window.localStorage.setItem(timelineTableWidthStorageKey, String(timelineTableWidth))
  }, [timelineTableWidth, timelineTableWidthStorageKey])

  useEffect(() => {
    const handleMouseMove = (event: MouseEvent) => {
      const drag = timelineSplitDragRef.current
      if (!drag) return
      const next = drag.startWidth + (event.clientX - drag.startX)
      setTimelineTableWidth(Math.max(320, Math.min(760, next)))
    }

    const handleMouseUp = () => {
      timelineSplitDragRef.current = null
    }

    window.addEventListener('mousemove', handleMouseMove)
    window.addEventListener('mouseup', handleMouseUp)

    return () => {
      window.removeEventListener('mousemove', handleMouseMove)
      window.removeEventListener('mouseup', handleMouseUp)
    }
  }, [])

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
      setReportedDurationInput('')
      return
    }
    setReportedProgressInput(String(selectedTask.progress))
    setReportedDurationInput('')
    if (typeof selectedTask.aiSuggestedProgress === 'number') {
      setAiProgressSuggestion(selectedTask.aiSuggestedProgress)
    }
  }, [selectedTask])

  useEffect(() => {
    if (!selectedTimelineTask) {
      setTimelineQuickStart('')
      setTimelineQuickEnd('')
      setTimelineQuickTitle('')
      setTimelineQuickHierarchySelection(createEmptyHierarchySelection())
      setTimelineQuickEquipmentId('none')
      setTimelineQuickHours('')
      setTimelineQuickDays('')
      setTimelineQuickDurationUnit('hours')
      setTimelineQuickResponsibleId('none')
      setTimelineQuickDependencyPredecessorId('none')
      setTimelineQuickDependencySearch('')
      setTimelineQuickDependencyType('FS')
      setTimelineQuickDependencyLag(0)
      setTimelineQuickModalOpen(false)
      return
    }

    setTimelineQuickStart(toInputDate(selectedTimelineTask.startDate))
    setTimelineQuickEnd(toInputDate(selectedTimelineTask.endDate))
    setTimelineQuickTitle(selectedTimelineTask.titulo)
    const hours = Math.max(1, Math.round((selectedTimelineTask.endDate.getTime() - selectedTimelineTask.startDate.getTime()) / HOUR_MS))
    setTimelineQuickHours(String(hours))
    setTimelineQuickDays(String(Math.max(1, Math.ceil(hours / 24))))
    setTimelineQuickDurationUnit(hours >= 24 && hours % 24 === 0 ? 'days' : 'hours')
    setTimelineQuickResponsibleId(selectedTimelineTask.responsibleUserId ?? 'none')
    setTimelineQuickDependencyPredecessorId('none')
    setTimelineQuickDependencySearch('')
    setTimelineQuickDependencyType('FS')
    setTimelineQuickDependencyLag(0)

    const taskEquipment = selectedTimelineTask.equipmentId
      ? equipment.find((item) => item.id === selectedTimelineTask.equipmentId)
      : equipment.find((item) => item.nombre === selectedTimelineTask.equipmentNombre)
    const nextHierarchySelection = createEmptyHierarchySelection()
    const selectedNode = selectedTimelineTask.hierarchyNodeId
      ? hierarchyNodeById.get(selectedTimelineTask.hierarchyNodeId)
      : undefined
    selectedNode?.path?.forEach((nodeId) => {
      const node = hierarchyNodeById.get(nodeId)
      if (!node) return
      if (TASK_LOCATION_LEVELS.includes(node.nivel)) {
        nextHierarchySelection[node.nivel] = node.id
      }
    })

    setTimelineQuickHierarchySelection(nextHierarchySelection)
    setTimelineQuickEquipmentId(taskEquipment?.id ?? 'none')

    if (timelineQuickFocusPendingRef.current) {
      timelineQuickFocusPendingRef.current = false
      window.setTimeout(() => {
        timelineQuickStartInputRef.current?.focus()
        timelineQuickStartInputRef.current?.scrollIntoView({ behavior: 'smooth', block: 'center' })
      }, 0)
    }
  }, [equipment, hierarchyNodeById, selectedTimelineTask])

  useEffect(() => {
    if (timelineQuickEquipmentId === 'none') return
    const existsInArea = timelineQuickEquipmentOptions.some((item) => item.id === timelineQuickEquipmentId)
    if (!existsInArea) {
      setTimelineQuickEquipmentId('none')
    }
  }, [timelineQuickEquipmentId, timelineQuickEquipmentOptions])

  useEffect(() => {
    if (equipmentId === 'none') return
    const existsForSelection = equipmentForSelectedHierarchy.some((item) => item.id === equipmentId)
    if (!existsForSelection) {
      setEquipmentId('none')
    }
  }, [equipmentForSelectedHierarchy, equipmentId])

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

  useEffect(() => {
    if (!timelineDrag) return

    const handleMouseMove = (event: MouseEvent) => {
      event.preventDefault()
      updateTimelineDragPreview(event.clientX)
    }

    const handleMouseUp = () => {
      const draft = timelineDrag
      setTimelineDrag(null)
      const task = tasks.find((row) => row.id === draft.taskId)
      if (!task) return

      const nextStart = new Date(draft.previewStartMs)
      const nextEnd = new Date(Math.max(draft.previewEndMs, draft.previewStartMs + HOUR_MS))

      if (
        Math.abs(nextStart.getTime() - task.startDate.getTime()) < HOUR_MS
        && Math.abs(nextEnd.getTime() - task.endDate.getTime()) < HOUR_MS
      ) {
        return
      }

      void handleUpdateTaskDates(task, nextStart, nextEnd)
    }

    window.addEventListener('mousemove', handleMouseMove)
    window.addEventListener('mouseup', handleMouseUp, { once: true })

    return () => {
      window.removeEventListener('mousemove', handleMouseMove)
      window.removeEventListener('mouseup', handleMouseUp)
    }
  }, [handleUpdateTaskDates, tasks, timeline.maxEnd, timeline.minStart, timeline.widthPx, timelineDrag, updateTimelineDragPreview])

  useEffect(() => {
    if (!timelineLinkDraft) return

    const handleMouseMove = (event: MouseEvent) => {
      event.preventDefault()
      setTimelineLinkDraft((current) => {
        if (!current) return current
        const target = detectTimelineAnchor(event.clientX, event.clientY, current.sourceTaskId)
        return {
          ...current,
          currentClientX: event.clientX,
          currentClientY: event.clientY,
          targetTaskId: target?.taskId,
          targetAnchor: target?.anchor,
        }
      })
    }

    const handleMouseUp = () => {
      const draft = timelineLinkDraft
      setTimelineLinkDraft(null)

      if (!draft.targetTaskId || !draft.targetAnchor || draft.targetTaskId === draft.sourceTaskId) {
        return
      }

      const successorTask = tasks.find((row) => row.id === draft.targetTaskId)
      if (!successorTask) return

      const depType = resolveDependencyTypeFromAnchors(draft.sourceAnchor, draft.targetAnchor)
      const alreadyExists = successorTask.dependencies.some(
        (dependency) => dependency.predecessorId === draft.sourceTaskId && dependency.type === depType
      )
      if (alreadyExists) return

      const dependencies = [
        ...successorTask.dependencies,
        {
          predecessorId: draft.sourceTaskId,
          type: depType,
          lagHours: 0,
        },
      ]

      void (async () => {
        await updateGanttTask(successorTask.id, { dependencies })
        await load()
      })()
    }

    window.addEventListener('mousemove', handleMouseMove)
    window.addEventListener('mouseup', handleMouseUp, { once: true })

    return () => {
      window.removeEventListener('mousemove', handleMouseMove)
      window.removeEventListener('mouseup', handleMouseUp)
    }
  }, [detectTimelineAnchor, load, tasks, timelineLinkDraft])

  useEffect(() => {
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.repeat) return
      const target = event.target as HTMLElement | null
      const tagName = target?.tagName?.toLowerCase()
      const isTypingContext = target?.isContentEditable || tagName === 'input' || tagName === 'textarea' || tagName === 'select'
      if (isTypingContext) return
      if (event.key.toLowerCase() !== 'd') return

      event.preventDefault()
      setTimelineDependencyMode((current) => {
        const next = !current
        if (!next) {
          setTimelineLinkDraft(null)
        }
        return next
      })
    }

    window.addEventListener('keydown', handleKeyDown)
    return () => {
      window.removeEventListener('keydown', handleKeyDown)
    }
  }, [])

  async function handleCreateTask() {
    if (!user?.id || !title.trim()) return

    const start = new Date(startDate)
    const end = new Date(endDate)
    if (Number.isNaN(start.getTime()) || Number.isNaN(end.getTime()) || end <= start) {
      setError('Rango de fechas inválido')
      return
    }

    const selectedEquipment = equipment.find((item) => item.id === equipmentId)
    const selectedHierarchyNode = createSelectedHierarchyNode
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
      hierarchyNodeId: selectedEquipment?.hierarchyNodeId ?? selectedHierarchyNode?.id,
      hierarchyPath: selectedEquipment?.hierarchyPath ?? selectedHierarchyNode?.nombre,
      status: 'planificada',
      prioridad: priority,
      startDate: start,
      endDate: end,
      baselineStartDate: start,
      baselineEndDate: end,
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
    setCreateHierarchySelection(createEmptyHierarchySelection())
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
    if (!canDelete && user?.rol !== 'admin') return
    await deleteGanttTask(taskId)
    if (selectedTaskId === taskId) setSelectedTaskId('none')
    await load()
  }

  function confirmDeleteFromTimelineRow(task: GanttTask) {
    const approved = window.confirm(`¿Eliminar tarea?\n\n${task.titulo}`)
    if (!approved) return
    void handleDelete(task.id)
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

    const parsedDuration = reportedDurationInput.trim().length > 0
      ? Number(reportedDurationInput.replace(',', '.'))
      : null

    const reportedDurationHours = parsedDuration !== null && Number.isFinite(parsedDuration) && parsedDuration > 0
      ? Math.max(0.25, parsedDuration)
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
        reportedDurationHours,
        photos,
      })

      if (typeof reportedProgress === 'number') {
        await handleUpdateTaskProgress(selectedTask, reportedProgress)
      }

      const plannedHours = Math.max(1, Math.round((selectedTask.endDate.getTime() - selectedTask.startDate.getTime()) / HOUR_MS))
      if (typeof reportedDurationHours === 'number' && reportedDurationHours > plannedHours) {
        const nextEnd = new Date(selectedTask.startDate.getTime() + reportedDurationHours * HOUR_MS)
        await handleUpdateTaskDates(selectedTask, selectedTask.startDate, nextEnd)
      }

      setNewComment('')
      setReportedProgressInput('')
      setReportedDurationInput('')
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
          baselineStartDate: task.startDate,
          baselineEndDate: task.endDate,
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

      <div className="flex flex-wrap gap-2">
        <Button
          size="sm"
          variant={plannerTab === 'configuracion' ? 'default' : 'outline'}
          onClick={() => setPlannerTab('configuracion')}
        >
          Configuración
        </Button>
        <Button
          size="sm"
          variant={plannerTab === 'tareas' ? 'default' : 'outline'}
          onClick={() => setPlannerTab('tareas')}
        >
          Tareas
        </Button>
        <Button
          size="sm"
          variant={plannerTab === 'timeline' ? 'default' : 'outline'}
          onClick={() => setPlannerTab('timeline')}
        >
          Timeline
        </Button>
        <Button
          size="sm"
          variant={plannerTab === 'carga_tecnico' ? 'default' : 'outline'}
          onClick={() => setPlannerTab('carga_tecnico')}
        >
          Carga por técnico
        </Button>
      </div>

      {plannerTab === 'timeline' && (
      <div className="space-y-3">
        <Card>
          <CardContent className="pt-4 space-y-3">
            <div className="grid gap-2 xl:grid-cols-[1fr_auto_auto_auto] xl:items-center">
              <div />
              <div className="flex items-center gap-1">
                <Button size="sm" variant={timelineZoom === 'day' ? 'default' : 'outline'} onClick={() => setTimelineZoom('day')}>Día</Button>
                <Button size="sm" variant={timelineZoom === 'week' ? 'default' : 'outline'} onClick={() => setTimelineZoom('week')}>Semana</Button>
                <Button size="sm" variant={timelineZoom === 'month' ? 'default' : 'outline'} onClick={() => setTimelineZoom('month')}>Mes</Button>
              </div>
              <Badge variant="outline">⚡ Auto-scheduling FS/SS/FF/SF</Badge>
              <Badge variant="outline">📍 Línea de hoy + Baseline</Badge>
            </div>

            <div className="grid gap-2 md:grid-cols-2">
              <div>
                <Label className="text-xs text-muted-foreground">Calendario</Label>
                <Select value={timelineWorkCalendar} onValueChange={(value) => setTimelineWorkCalendar(value as 'all' | 'workdays')}>
                  <SelectTrigger className="h-8"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">Todos los días</SelectItem>
                    <SelectItem value="workdays">Solo días hábiles (L-V)</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div>
                <Label className="text-xs text-muted-foreground">Snap de arrastre</Label>
                <Select value={timelineSnapHours} onValueChange={(value) => setTimelineSnapHours(value as 'auto' | '1' | '6' | '12' | '24')}>
                  <SelectTrigger className="h-8"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="auto">Auto por zoom</SelectItem>
                    <SelectItem value="1">1 hora</SelectItem>
                    <SelectItem value="6">6 horas</SelectItem>
                    <SelectItem value="12">12 horas</SelectItem>
                    <SelectItem value="24">1 día</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>

            <div className="grid gap-2 md:grid-cols-[160px_1fr_auto] md:items-end">
              <div>
                <Label className="text-xs text-muted-foreground">Tareas por página</Label>
                <Select value={timelinePageSize} onValueChange={(value) => setTimelinePageSize(value as (typeof PAGE_SIZE_OPTIONS)[number])}>
                  <SelectTrigger className="h-8"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    {PAGE_SIZE_OPTIONS.map((size) => <SelectItem key={`timeline-size-${size}`} value={size}>{size}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>
              <div className="text-xs text-muted-foreground flex items-center gap-3 pb-1">
                <span className="inline-flex items-center gap-1"><span className="h-2 w-4 rounded bg-primary" /> Barra real</span>
                <span className="inline-flex items-center gap-1"><span className="h-2 w-4 rounded bg-muted-foreground/60" /> Baseline</span>
                <span className="inline-flex items-center gap-1"><span className="h-2 w-4 rounded bg-primary/60" /> Dependencias FS/SS/FF/SF</span>
                <span className="inline-flex items-center gap-1"><span className="h-3 w-[2px] bg-red-500" /> Hoy</span>
              </div>
              <Button size="sm" variant="outline" onClick={() => setTimelineCollapsed((prev) => !prev)}>
                {timelineCollapsed ? <ChevronDown className="h-4 w-4 mr-1" /> : <ChevronUp className="h-4 w-4 mr-1" />}
                {timelineCollapsed ? 'Expandir' : 'Colapsar'}
              </Button>
            </div>

            <div className="grid gap-2 md:grid-cols-1">
              <div>
                <Label className="text-xs text-muted-foreground">Buscar en tareas (área, equipo, tarea, responsable)</Label>
                <Input
                  value={timelineSearch}
                  onChange={(event) => setTimelineSearch(event.target.value)}
                  placeholder="Ej: Acopio, Bomba, cambio de celda, Danilo"
                />
              </div>
            </div>

            <div className="rounded border p-2 text-xs text-muted-foreground flex items-center justify-between gap-2">
              <span>
                Doble clic para editar. Tecla D: {timelineDependencyMode ? 'modo dependencia ACTIVO' : 'modo dependencia inactivo'}.
              </span>
              <div className="flex items-center gap-2">
                <Button size="sm" variant="outline" onClick={() => setPlannerTab('configuracion')}>
                  <Plus className="h-4 w-4 mr-1" /> Nueva tarea
                </Button>
                {selectedTimelineTask && (
                  <Button size="sm" variant="outline" onClick={() => openTimelineQuickEditor(selectedTimelineTask.id)}>
                    Editar seleccionada
                  </Button>
                )}
              </div>
            </div>

            {timelineDependencyMode && (
              <div className="rounded border p-3 text-xs space-y-2">
                <p className="font-medium text-foreground">Guía rápida de dependencias (modo D activo)</p>
                <div className="grid gap-1 sm:grid-cols-2 text-muted-foreground">
                  <p><span className="font-semibold text-foreground">FS</span>: B inicia cuando A termina.</p>
                  <p><span className="font-semibold text-foreground">SS</span>: B inicia cuando A inicia.</p>
                  <p><span className="font-semibold text-foreground">FF</span>: B termina cuando A termina.</p>
                  <p><span className="font-semibold text-foreground">SF</span>: B termina cuando A inicia.</p>
                </div>
              </div>
            )}

          </CardContent>
        </Card>

        {!timelineCollapsed && timelineFilteredTasks.length === 0 && (
          <p className="text-sm text-muted-foreground">Sin tareas para visualizar.</p>
        )}

        {!timelineCollapsed && timelineFilteredTasks.length > 0 && (
          <div className="space-y-3 xl:space-y-0 xl:flex xl:items-stretch xl:gap-2">
            <Card className="xl:shrink-0" style={{ width: `min(100%, ${timelineTableWidth}px)` }}>
              <CardHeader className="pb-2">
                <CardTitle className="text-sm">Tabla de tareas (WBS/estado/owner)</CardTitle>
              </CardHeader>
              <CardContent className="p-0">
                <div className="grid grid-cols-[1fr_1fr_1.4fr_.8fr_.7fr_.6fr_.6fr_.42fr] gap-2 px-3 py-2 text-[11px] border-y text-muted-foreground">
                  <span>Área</span>
                  <span>Equipo</span>
                  <span>Tarea</span>
                  <span>Responsable</span>
                  <span>Estado</span>
                  <span>Avance</span>
                  <span title="Diferencia en horas entre duración real y baseline">Δ Plan (h)</span>
                  <span className="text-center">X</span>
                </div>
                <div className="max-h-[560px] overflow-auto">
                  {timelineRows.map((row) => {
                    const status = STATUS_META[row.task.status]
                    return (
                      <div
                        key={`timeline-grid-${row.task.id}`}
                        className={`grid grid-cols-[1fr_1fr_1.4fr_.8fr_.7fr_.6fr_.6fr_.42fr] gap-2 px-3 py-2 text-xs border-b h-11 items-center cursor-pointer ${selectedTaskId === row.task.id ? 'bg-primary/10' : ''}`}
                        onClick={() => setSelectedTaskId(row.task.id)}
                        onDoubleClick={() => openTimelineQuickEditor(row.task.id)}
                      >
                        <span className="truncate" title={row.task.hierarchyPath ?? 'Sin área'}>{compactHierarchyPath(row.task.hierarchyPath)}</span>
                        <span className="truncate" title={row.task.equipmentNombre ?? 'Sin equipo'}>{row.task.equipmentNombre ?? 'Sin equipo'}</span>
                        <span className="truncate" title={row.task.titulo}>{row.isCritical ? '🔴 ' : ''}{row.task.titulo}</span>
                        <span className="truncate" title={row.task.responsibleName ?? 'Sin asignar'}>{row.task.responsibleName ?? 'Sin asignar'}</span>
                        <Badge variant={status.variant}>{status.label}</Badge>
                        <span>{row.task.progress}%</span>
                        <span className={row.baselineDeltaHours > 0 ? 'text-destructive' : row.baselineDeltaHours < 0 ? 'text-foreground' : 'text-muted-foreground'}>
                          {formatDeltaHours(row.baselineDeltaHours)}
                        </span>
                        {(canDelete || user?.rol === 'admin') ? (
                          <Button
                            size="icon"
                            variant="ghost"
                            className="h-6 w-6 text-destructive hover:text-destructive"
                            onClick={(event) => {
                              event.stopPropagation()
                              confirmDeleteFromTimelineRow(row.task)
                            }}
                            title="Eliminar tarea"
                          >
                            <Trash2 className="h-3.5 w-3.5" />
                          </Button>
                        ) : (
                          <span />
                        )}
                      </div>
                    )
                  })}
                </div>
              </CardContent>
            </Card>

            <div
              className="hidden xl:flex w-2 cursor-col-resize select-none items-center justify-center rounded border bg-muted/40 hover:bg-muted"
              onMouseDown={(event) => {
                event.preventDefault()
                handleTimelineSplitDragStart(event.clientX)
              }}
              title="Arrastra para ajustar columnas"
            >
              <span className="h-10 w-[2px] rounded bg-border" />
            </div>

            <Card className="xl:flex-1 xl:min-w-0">
              <CardHeader className="pb-2">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <CardTitle className="text-sm">Timeline profesional (baseline vs real + dependencias)</CardTitle>
                  <Button
                    size="sm"
                    variant={timelineDependencyMode ? 'default' : 'outline'}
                    onClick={() => {
                      setTimelineDependencyMode((current) => {
                        const next = !current
                        if (!next) {
                          setTimelineLinkDraft(null)
                        }
                        return next
                      })
                    }}
                  >
                    <GitBranchPlus className="h-4 w-4 mr-1" />
                    Dependencias ({timelineDependencyMode ? 'ON' : 'OFF'}) · D
                  </Button>
                </div>
              </CardHeader>
              <CardContent className="p-0">
                <div className="overflow-auto">
                  <div style={{ minWidth: `${timeline.widthPx}px` }}>
                    <div className="sticky top-0 z-10 h-8 border-y bg-background/95" style={{ width: `${timeline.widthPx}px` }}>
                      {timelineDayBands.map((band, index) => (
                        <div
                          key={`day-head-${index}`}
                          className={`absolute top-0 bottom-0 pointer-events-none ${band.shade ? 'bg-muted/25' : ''} ${band.major ? 'border-l border-border/70' : 'border-l border-border/35'}`}
                          style={{ left: `${band.leftPx}px`, width: `${band.widthPx}px` }}
                        />
                      ))}
                      {timelineTicks.map((tick, index) => (
                        <div
                          key={`tick-head-${index}`}
                          className={`absolute top-0 bottom-0 ${tick.major ? 'border-l border-border/50' : 'border-l border-border/25'}`}
                          style={{ left: `${tick.leftPx}px` }}
                        >
                          <span className="absolute left-1 top-1 text-[10px] text-muted-foreground whitespace-nowrap">{tick.label}</span>
                        </div>
                      ))}
                    </div>

                    <div ref={timelineCanvasRef} className="relative" style={{ width: `${timeline.widthPx}px`, height: `${timelineRows.length * TIMELINE_ROW_HEIGHT}px` }}>
                      {timelineDayBands.map((band, index) => (
                        <div
                          key={`day-body-${index}`}
                          className={`absolute top-0 bottom-0 pointer-events-none ${band.shade ? 'bg-muted/15' : ''} ${band.major ? 'border-l border-border/60' : 'border-l border-border/30'}`}
                          style={{ left: `${band.leftPx}px`, width: `${band.widthPx}px` }}
                        />
                      ))}
                      {timelineTicks.map((tick, index) => (
                        <div
                          key={`tick-body-${index}`}
                          className={`absolute top-0 bottom-0 ${tick.major ? 'border-l border-border/40' : 'border-l border-border/20'}`}
                          style={{ left: `${tick.leftPx}px` }}
                        />
                      ))}

                      {timelineRows.map((row) => (
                        <div
                          key={`lane-${row.task.id}`}
                          className="absolute left-0 right-0 border-b"
                          style={{ top: `${row.rowIndex * TIMELINE_ROW_HEIGHT + (TIMELINE_ROW_HEIGHT - 1)}px` }}
                        />
                      ))}

                      {timelineDependencyLines.length > 0 && (
                        <svg className="pointer-events-none absolute inset-0 z-[9]" style={{ width: `${timeline.widthPx}px`, height: `${timelineRows.length * TIMELINE_ROW_HEIGHT}px` }}>
                          <defs>
                            <marker id="timeline-dep-arrow" viewBox="0 0 8 8" refX="7" refY="4" markerWidth="6" markerHeight="6" orient="auto-start-reverse">
                              <path d="M 0 0 L 8 4 L 0 8 z" fill="currentColor" />
                            </marker>
                          </defs>
                          {timelineDependencyLines.map((line) => {
                            const strokeWidth = line.depType === 'FS' ? 1.9 : 1.5
                            const depStrokeClass = line.depType === 'FS'
                              ? 'text-primary/80'
                              : line.depType === 'SS'
                                ? 'text-warning/80'
                                : line.depType === 'FF'
                                  ? 'text-success/80'
                                  : 'text-destructive/75'
                            const pathData = buildOrthogonalDependencyPath(line.fromX, line.fromY, line.toX, line.toY)

                            return (
                              <g key={`dep-path-${line.key}`} className={depStrokeClass}>
                                <path
                                  d={pathData}
                                  fill="none"
                                  stroke="currentColor"
                                  strokeOpacity="0.24"
                                  strokeWidth={strokeWidth + 2.2}
                                  strokeLinecap="round"
                                  strokeLinejoin="round"
                                />
                                <path
                                  d={pathData}
                                  fill="none"
                                  stroke="currentColor"
                                  strokeOpacity={line.depType === 'FS' ? 0.78 : 0.64}
                                  strokeWidth={strokeWidth}
                                  strokeLinecap="round"
                                  strokeLinejoin="round"
                                  markerEnd="url(#timeline-dep-arrow)"
                                >
                                  <title>{line.infoTitle}</title>
                                </path>
                              </g>
                            )
                          })}
                        </svg>
                      )}

                      {timelineLinkPreview && (
                        <>
                          <svg className="pointer-events-none absolute inset-0 z-20" style={{ width: `${timeline.widthPx}px`, height: `${timelineRows.length * TIMELINE_ROW_HEIGHT}px` }}>
                            <defs>
                              <marker id="timeline-preview-arrow" viewBox="0 0 8 8" refX="7" refY="4" markerWidth="6" markerHeight="6" orient="auto-start-reverse">
                                <path d="M 0 0 L 8 4 L 0 8 z" fill="currentColor" />
                              </marker>
                            </defs>
                            {(() => {
                              const startX = timelineLinkPreview.sourceX
                              const startY = timelineLinkPreview.sourceY
                              const endX = timelineLinkPreview.targetX
                              const endY = timelineLinkPreview.targetY
                              const pathData = buildOrthogonalDependencyPath(startX, startY, endX, endY)

                              return (
                                <path
                                  d={pathData}
                                  fill="none"
                                  stroke="currentColor"
                                  strokeOpacity="0.72"
                                  strokeWidth="2"
                                  strokeDasharray="4 3"
                                  markerEnd="url(#timeline-preview-arrow)"
                                />
                              )
                            })()}
                          </svg>
                          {timelineLinkPreview.type && (
                            <div
                              className="pointer-events-none absolute z-30 rounded border bg-background/95 px-2 py-0.5 text-[10px] font-semibold text-foreground shadow"
                              style={{
                                left: `${Math.max(6, Math.min(timeline.widthPx - 84, timelineLinkPreview.targetX + 10))}px`,
                                top: `${Math.max(2, timelineLinkPreview.targetY - 18)}px`,
                              }}
                            >
                              Tipo: {timelineLinkPreview.type}
                            </div>
                          )}
                        </>
                      )}

                      {timeline.showTodayLine && (
                        <div
                          className="absolute top-0 bottom-0 w-[2px] bg-red-500/80 z-10"
                          style={{ left: `${timeline.todayLeftPx}px` }}
                          title="Hoy"
                        />
                      )}

                      {timelineRows.map((row) => {
                        const linkDraft = timelineLinkDraft
                        const canBeTarget = !!linkDraft && linkDraft.sourceTaskId !== row.task.id
                        const isSourceStart = !!linkDraft
                          && linkDraft.sourceTaskId === row.task.id
                          && linkDraft.sourceAnchor === 'start'
                        const isSourceEnd = !!linkDraft
                          && linkDraft.sourceTaskId === row.task.id
                          && linkDraft.sourceAnchor === 'end'
                        const isTargetStart = !!linkDraft
                          && linkDraft.targetTaskId === row.task.id
                          && linkDraft.targetAnchor === 'start'
                        const isTargetEnd = !!linkDraft
                          && linkDraft.targetTaskId === row.task.id
                          && linkDraft.targetAnchor === 'end'
                        const startAnchorClass = isTargetStart
                          ? 'absolute h-5 w-5 rounded-full border-2 border-primary bg-primary/30 ring-2 ring-primary/40 cursor-crosshair'
                          : isSourceStart
                            ? 'absolute h-4 w-4 rounded-full border-2 border-primary bg-primary/20 cursor-crosshair'
                            : canBeTarget
                              ? 'absolute h-4 w-4 rounded-full border border-primary/70 bg-primary/10 cursor-crosshair'
                              : 'absolute h-4 w-4 rounded-full border bg-background cursor-crosshair'
                        const endAnchorClass = isTargetEnd
                          ? 'absolute h-5 w-5 rounded-full border-2 border-primary bg-primary/30 ring-2 ring-primary/40 cursor-crosshair'
                          : isSourceEnd
                            ? 'absolute h-4 w-4 rounded-full border-2 border-primary bg-primary/20 cursor-crosshair'
                            : canBeTarget
                              ? 'absolute h-4 w-4 rounded-full border border-primary/70 bg-primary/10 cursor-crosshair'
                              : 'absolute h-4 w-4 rounded-full border bg-background cursor-crosshair'
                        const progressPct = Math.max(0, Math.min(100, row.task.progress))
                        const rowTop = row.rowIndex * TIMELINE_ROW_HEIGHT
                        const barTop = rowTop + TIMELINE_BAR_TOP
                        const barCenterY = rowTop + TIMELINE_BAR_CENTER_OFFSET
                        const barBaseClass = row.isCritical ? 'bg-red-500/35' : 'bg-primary/35'
                        const barProgressClass = progressPct <= 30
                          ? 'bg-destructive'
                          : progressPct <= 70
                            ? 'bg-warning'
                            : 'bg-success'
                        const barTextClass = progressPct <= 30
                          ? 'text-destructive-foreground'
                          : progressPct <= 70
                            ? 'text-warning-foreground'
                            : 'text-success-foreground'

                        return (
                          <div key={`bar-${row.task.id}`}>
                            <div
                              className={`absolute ${TIMELINE_BASELINE_HEIGHT_CLASS} rounded bg-muted-foreground/60`}
                              style={{ left: `${row.baselineLeft}px`, top: `${rowTop + TIMELINE_BASELINE_TOP}px`, width: `${row.baselineWidth}px` }}
                            />
                            <div
                              className={`absolute ${TIMELINE_BAR_HEIGHT_CLASS} rounded ${barBaseClass} overflow-hidden border border-background/20`}
                              style={{ left: `${row.left}px`, top: `${barTop}px`, width: `${row.width}px` }}
                              onClick={() => setSelectedTaskId(row.task.id)}
                              onDoubleClick={() => openTimelineQuickEditor(row.task.id)}
                              onMouseDown={(event) => {
                                if (!row.interactive || timelineDependencyMode) return
                                event.preventDefault()
                                handleTimelineDragStart(row.task, 'move', event.clientX)
                              }}
                              title={!row.interactive
                                ? 'Sin permisos para mover'
                                : timelineDependencyMode
                                  ? 'Modo dependencia activo: usa anclas de inicio/fin para enlazar'
                                  : [
                                    row.task.titulo,
                                    `Avance: ${row.task.progress}%`,
                                    `Estado: ${STATUS_META[row.task.status].label}`,
                                    `Responsable: ${row.task.responsibleName ?? 'Sin asignar'}`,
                                    `Inicio: ${row.task.startDate.toLocaleString()}`,
                                    `Fin: ${row.task.endDate.toLocaleString()}`,
                                    `Dependencias: ${row.task.dependencies.length}`,
                                  ].join('\n')}
                            >
                              <div
                                className={`absolute inset-y-0 left-0 ${barProgressClass}`}
                                style={{ width: `${progressPct}%` }}
                              />
                              <span className={`absolute inset-0 px-2 text-[12px] leading-6 font-semibold drop-shadow-sm ${barTextClass} truncate`}>
                                {row.task.titulo} · {row.task.progress}%
                              </span>
                            </div>
                            {timelineDrag?.taskId === row.task.id && (
                              <div
                                className="absolute z-20 -translate-x-1/2 rounded border bg-background px-2 py-1 text-[10px] text-foreground shadow"
                                style={{ left: `${row.left + row.width / 2}px`, top: `${Math.max(0, rowTop - 8)}px` }}
                              >
                                {formatTimelineDragDate(new Date(timelineDrag.previewStartMs))} → {formatTimelineDragDate(new Date(timelineDrag.previewEndMs))}
                                {' · '}
                                {Math.max(1, Math.round((timelineDrag.previewEndMs - timelineDrag.previewStartMs) / HOUR_MS))}h
                              </div>
                            )}
                            {row.interactive && (
                              <>
                                {timelineDependencyMode && (
                                  <>
                                    <div
                                      className={startAnchorClass}
                                      style={{ left: `${Math.max(0, row.left - (isTargetStart ? 10 : 8))}px`, top: `${barCenterY - (isTargetStart ? 10 : 8)}px` }}
                                      onMouseDown={(event) => {
                                        event.preventDefault()
                                        event.stopPropagation()
                                        handleTimelineLinkStart(row.task.id, 'start', event.clientX, event.clientY)
                                      }}
                                      title="Crear dependencia desde INICIO (arrastra hacia inicio/fin de otra tarea)"
                                    />
                                    <div
                                      className={endAnchorClass}
                                      style={{ left: `${row.left + row.width - (isTargetEnd ? 10 : 8)}px`, top: `${barCenterY - (isTargetEnd ? 10 : 8)}px` }}
                                      onMouseDown={(event) => {
                                        event.preventDefault()
                                        event.stopPropagation()
                                        handleTimelineLinkStart(row.task.id, 'end', event.clientX, event.clientY)
                                      }}
                                      title="Crear dependencia desde FIN (arrastra hacia inicio/fin de otra tarea)"
                                    />
                                  </>
                                )}
                                <div
                                  className="absolute h-6 w-2 rounded bg-background border cursor-ew-resize"
                                  style={{ left: `${Math.max(0, row.left - 1)}px`, top: `${barTop}px` }}
                                  onMouseDown={(event) => {
                                    if (timelineDependencyMode) return
                                    event.preventDefault()
                                    event.stopPropagation()
                                    handleTimelineDragStart(row.task, 'resize-start', event.clientX)
                                  }}
                                  title={timelineDependencyMode ? 'Modo dependencia activo' : 'Ajustar inicio'}
                                />
                                <div
                                  className="absolute h-6 w-2 rounded bg-background border cursor-ew-resize"
                                  style={{ left: `${row.left + row.width - 1}px`, top: `${barTop}px` }}
                                  onMouseDown={(event) => {
                                    if (timelineDependencyMode) return
                                    event.preventDefault()
                                    event.stopPropagation()
                                    handleTimelineDragStart(row.task, 'resize-end', event.clientX)
                                  }}
                                  title={timelineDependencyMode ? 'Modo dependencia activo' : 'Ajustar fin'}
                                />
                              </>
                            )}
                          </div>
                        )
                      })}
                    </div>
                  </div>
                </div>

                <div className="flex flex-wrap gap-4 px-3 py-2 text-[11px] text-muted-foreground border-t">
                  <span className="inline-flex items-center gap-1"><span className="h-2 w-3 rounded bg-primary" /> Barra real</span>
                  <span className="inline-flex items-center gap-1"><span className="h-2 w-3 rounded bg-primary/35" /> Fondo barra</span>
                  <span className="inline-flex items-center gap-1"><span className="h-2 w-3 rounded bg-destructive" /> Avance 0-30%</span>
                  <span className="inline-flex items-center gap-1"><span className="h-2 w-3 rounded bg-warning" /> Avance 31-70%</span>
                  <span className="inline-flex items-center gap-1"><span className="h-2 w-3 rounded bg-success" /> Avance 71-100%</span>
                  <span className="inline-flex items-center gap-1"><span className="h-2 w-3 rounded bg-muted-foreground/60" /> Baseline</span>
                  <span className="inline-flex items-center gap-1"><span className="h-2 w-3 rounded bg-red-500" /> Crítica</span>
                  <span className="inline-flex items-center gap-1"><span className="h-2 w-3 rounded bg-primary/60" /> Dependencia FS</span>
                  <span className="inline-flex items-center gap-1"><span className="h-3 w-[2px] bg-red-500" /> Hoy</span>
                  <span className="inline-flex items-center gap-1"><span className="h-3 w-3 rounded-full border" /> Modo dependencia: tecla D</span>
                </div>
              </CardContent>
            </Card>
          </div>
        )}

        {!timelineCollapsed && timelineFilteredTasks.length > 0 && (
          <div className="flex items-center justify-between pt-1">
            <p className="text-xs text-muted-foreground">Página {safeTimelinePage} de {totalTimelinePages} · {timelineFilteredTasks.length} tareas</p>
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

        <Dialog open={timelineQuickModalOpen} onOpenChange={setTimelineQuickModalOpen}>
          <DialogContent className="max-w-[95vw] sm:max-w-2xl">
            <DialogHeader>
              <DialogTitle>Editar tarea en timeline</DialogTitle>
              <DialogDescription>
                {selectedTimelineTask
                  ? `${taskLocationSummary(selectedTimelineTask)} · ${selectedTimelineTask.titulo}`
                  : 'Selecciona una tarea para editar'}
              </DialogDescription>
            </DialogHeader>

            {selectedTimelineTask && (
              <div className="space-y-3">
                <div className="rounded border p-3 space-y-2">
                  <p className="text-xs font-medium">Datos base de la tarea</p>
                  <div className="grid gap-2 sm:grid-cols-2">
                    <div className="sm:col-span-2">
                      <Label className="text-xs text-muted-foreground">Título</Label>
                      <Input
                        value={timelineQuickTitle}
                        onChange={(event) => setTimelineQuickTitle(event.target.value)}
                        disabled={!canEditTaskIdentity}
                        placeholder="Nombre de la tarea"
                      />
                    </div>
                    {TASK_LOCATION_LEVELS.map((level) => {
                      const options = timelineQuickHierarchyOptions.get(level) ?? []
                      const levelIndex = TASK_LOCATION_LEVELS.indexOf(level)
                      const previousLevel = levelIndex > 0 ? TASK_LOCATION_LEVELS[levelIndex - 1] : null
                      const isDisabled = !canEditTaskIdentity || (!!previousLevel && timelineQuickHierarchySelection[previousLevel] === 'none')

                      return (
                        <div key={`timeline-quick-level-${level}`}>
                          <Label className="text-xs text-muted-foreground">{HIERARCHY_LEVEL_NAMES[level]}</Label>
                          <Select
                            value={timelineQuickHierarchySelection[level] ?? 'none'}
                            onValueChange={(value) => handleTimelineQuickHierarchyLevelChange(level, value)}
                            disabled={isDisabled}
                          >
                            <SelectTrigger><SelectValue /></SelectTrigger>
                            <SelectContent>
                              <SelectItem value="none">Sin selección</SelectItem>
                              {options.map((node) => (
                                <SelectItem key={`timeline-quick-level-node-${level}-${node.id}`} value={node.id}>{node.nombre}</SelectItem>
                              ))}
                            </SelectContent>
                          </Select>
                        </div>
                      )
                    })}
                    <div className="sm:col-span-2">
                      <Label className="text-xs text-muted-foreground">Equipo</Label>
                      <Select value={timelineQuickEquipmentId} onValueChange={setTimelineQuickEquipmentId} disabled={!canEditTaskIdentity}>
                        <SelectTrigger><SelectValue /></SelectTrigger>
                        <SelectContent>
                          <SelectItem value="none">Sin equipo</SelectItem>
                          {timelineQuickEquipmentOptions.map((item) => (
                            <SelectItem key={`timeline-quick-eq-${item.id}`} value={item.id}>{item.nombre}</SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </div>
                  </div>
                  <div className="flex justify-end">
                    <Button size="sm" variant="outline" onClick={() => void handleTimelineQuickSaveIdentity()} disabled={!canEditTaskIdentity}>
                      Guardar título/ubicación
                    </Button>
                  </div>
                  {!canEditTaskIdentity && (
                    <p className="text-[11px] text-muted-foreground">Solo admin y supervisor pueden editar título, área y equipo.</p>
                  )}
                </div>

                <div className="grid gap-2 sm:grid-cols-2">
                  <div>
                    <Label className="text-xs text-muted-foreground">Inicio</Label>
                    <Input ref={timelineQuickStartInputRef} type="datetime-local" value={timelineQuickStart} onChange={(event) => setTimelineQuickStart(event.target.value)} />
                  </div>
                  <div>
                    <Label className="text-xs text-muted-foreground">Fin</Label>
                    <Input type="datetime-local" value={timelineQuickEnd} onChange={(event) => setTimelineQuickEnd(event.target.value)} />
                  </div>
                </div>

                <div className="grid gap-2 sm:grid-cols-3">
                  <div>
                    <Label className="text-xs text-muted-foreground">Unidad de duración</Label>
                    <Select value={timelineQuickDurationUnit} onValueChange={(value) => setTimelineQuickDurationUnit(value as 'hours' | 'days')}>
                      <SelectTrigger><SelectValue /></SelectTrigger>
                      <SelectContent>
                        <SelectItem value="hours">Horas</SelectItem>
                        <SelectItem value="days">Días</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                  <div>
                    <Label className="text-xs text-muted-foreground">{timelineQuickDurationUnit === 'hours' ? 'Tiempo (horas)' : 'Tiempo (días)'}</Label>
                    <Input
                      type="number"
                      min={1}
                      step={timelineQuickDurationUnit === 'hours' ? 1 : 1}
                      value={timelineQuickDurationUnit === 'hours' ? timelineQuickHours : timelineQuickDays}
                      onChange={(event) => {
                        if (timelineQuickDurationUnit === 'hours') {
                          setTimelineQuickHours(event.target.value)
                        } else {
                          setTimelineQuickDays(event.target.value)
                        }
                      }}
                    />
                  </div>
                  <div>
                    <Label className="text-xs text-muted-foreground">Usuario responsable</Label>
                    <Select value={timelineQuickResponsibleId} onValueChange={setTimelineQuickResponsibleId}>
                      <SelectTrigger><SelectValue /></SelectTrigger>
                      <SelectContent>
                        <SelectItem value="none">Sin asignar</SelectItem>
                        {technicians.map((tech) => (
                          <SelectItem key={`timeline-quick-tech-${tech.id}`} value={tech.id}>
                            {tech.nombre} {tech.apellido}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                </div>

                <div className="flex flex-wrap gap-2 justify-end">
                  <Button size="sm" variant="outline" onClick={() => void handleTimelineQuickSaveDates()} disabled={!canOperateTask(selectedTimelineTask)}>
                    Guardar fechas
                  </Button>
                  <Button size="sm" variant="secondary" onClick={() => void handleTimelineQuickApplyHours()} disabled={!canOperateTask(selectedTimelineTask)}>
                    Aplicar duración
                  </Button>
                  <Button size="sm" variant="outline" onClick={() => void handleTimelineQuickAssignUser()} disabled={!canEdit}>
                    Guardar usuario
                  </Button>
                </div>

                <div className="rounded border p-3 space-y-3">
                  <div className="flex items-center justify-between gap-2">
                    <p className="text-xs font-medium">Dependencias rápidas</p>
                    <Badge variant="outline" title="FS: Fin→Inicio · SS: Inicio→Inicio · FF: Fin→Fin · SF: Inicio→Fin">FS / SS / FF / SF</Badge>
                  </div>

                  <div className="grid gap-2 sm:grid-cols-[1fr_auto] sm:items-end">
                    <div>
                      <Label className="text-xs text-muted-foreground">Buscar predecesora</Label>
                      <Input
                        value={timelineQuickDependencySearch}
                        onChange={(event) => setTimelineQuickDependencySearch(event.target.value)}
                        placeholder="Buscar por tarea, área o equipo"
                      />
                    </div>
                    <p className="text-[11px] text-muted-foreground" title="FS: B inicia cuando A termina · SS: B inicia cuando A inicia · FF: B termina cuando A termina · SF: B termina cuando A inicia">
                      Tipos: FS, SS, FF, SF
                    </p>
                  </div>

                  <div className="grid gap-2 sm:grid-cols-[1.4fr_.7fr_.6fr_auto] sm:items-end">
                    <div>
                      <Label className="text-xs text-muted-foreground">Predecesora</Label>
                      <Select value={timelineQuickDependencyPredecessorId} onValueChange={setTimelineQuickDependencyPredecessorId}>
                        <SelectTrigger><SelectValue placeholder="Seleccionar tarea" /></SelectTrigger>
                        <SelectContent>
                          <SelectItem value="none">Sin selección</SelectItem>
                          {timelineQuickDependencyCandidates
                            .map((task) => (
                              <SelectItem key={`timeline-quick-dep-${task.id}`} value={task.id}>
                                {task.titulo} · {taskLocationSummary(task)}
                              </SelectItem>
                            ))}
                        </SelectContent>
                      </Select>
                    </div>

                    <div>
                      <Label className="text-xs text-muted-foreground">Tipo</Label>
                      <Select value={timelineQuickDependencyType} onValueChange={(value) => setTimelineQuickDependencyType(value as 'FS' | 'SS' | 'FF' | 'SF')}>
                        <SelectTrigger><SelectValue /></SelectTrigger>
                        <SelectContent>
                          {DEPENDENCY_TYPES.map((dep) => <SelectItem key={`timeline-quick-dep-type-${dep}`} value={dep}>{dependencyTypeLabel(dep)}</SelectItem>)}
                        </SelectContent>
                      </Select>
                    </div>

                    <div>
                      <Label className="text-xs text-muted-foreground" title="Lag (h): horas de separación entre predecesora y sucesora. 0 = sin desfase. +8 = se retrasa 8h la relación.">Lag (h) ⓘ</Label>
                      <Input
                        type="number"
                        value={timelineQuickDependencyLag}
                        onChange={(event) => setTimelineQuickDependencyLag(Number(event.target.value) || 0)}
                      />
                    </div>

                    <Button
                      size="sm"
                      variant="outline"
                      onClick={() => void handleTimelineQuickAddDependency()}
                      disabled={!canEdit || timelineQuickDependencyPredecessorId === 'none'}
                    >
                      <GitBranchPlus className="h-4 w-4 mr-1" />
                      Agregar
                    </Button>
                  </div>

                  {selectedTimelineTask.dependencies.length > 0 && (
                    <div className="space-y-1 rounded border p-2 text-xs text-muted-foreground">
                      {selectedTimelineTask.dependencies.map((dep, index) => {
                        const predecessor = tasks.find((item) => item.id === dep.predecessorId)
                        return (
                          <div key={`timeline-quick-dep-row-${dep.predecessorId}-${dep.type}-${index}`} className="flex items-center justify-between gap-2">
                            <span>{predecessor?.titulo ?? dep.predecessorId} → {selectedTimelineTask.titulo} ({dep.type}{dep.lagHours ? ` +${dep.lagHours}h` : ''})</span>
                            {canEdit && (
                              <Button
                                size="sm"
                                variant="ghost"
                                onClick={() => void handleTimelineQuickRemoveDependency(dep.predecessorId, dep.type)}
                              >
                                <Link2Off className="h-3.5 w-3.5" />
                              </Button>
                            )}
                          </div>
                        )
                      })}
                    </div>
                  )}
                </div>
              </div>
            )}
          </DialogContent>
        </Dialog>
      </div>
      )}

      {plannerTab !== 'timeline' && (
      <div className="grid gap-3 md:grid-cols-6">
        {plannerTab === 'carga_tecnico' && (
        <Card className="md:col-span-6">
          <CardHeader className="pb-2">
            <CardTitle>Carga por técnico</CardTitle>
            <p className="text-xs text-muted-foreground">Histogramado por horas planificadas activas para detectar sobrecarga.</p>
          </CardHeader>
          <CardContent>
            {timelineResourceLoad.length === 0 ? (
              <p className="text-xs text-muted-foreground">Sin tareas activas asignadas para calcular carga.</p>
            ) : (
              <div className="space-y-2">
                {timelineResourceLoad.map((row) => (
                  <div key={`load-tab-${row.name}`} className="grid grid-cols-[160px_1fr_auto] items-center gap-2">
                    <span className="truncate text-xs">{row.name}</span>
                    <div className="h-2 rounded bg-muted overflow-hidden">
                      <div className="h-full bg-primary/80" style={{ width: `${row.pct}%` }} />
                    </div>
                    <span className="text-[11px] text-muted-foreground">{row.hours}h · {row.tasks} tarea(s)</span>
                  </div>
                ))}
              </div>
            )}
          </CardContent>
        </Card>
        )}

        {plannerTab === 'tareas' && (
        <Card className="lg:col-span-4">
          <CardHeader className="flex flex-row items-center justify-between space-y-0">
            <div>
              <CardTitle>Listado de tareas</CardTitle>
              <p className="text-xs text-muted-foreground mt-1">Vista operativa para filtrar, revisar estado y abrir detalle/comentarios.</p>
            </div>
            <div className="flex gap-2">
              <Button size="sm" variant={tasksCompactView ? 'default' : 'outline'} onClick={() => setTasksCompactView((prev) => !prev)}>
                {tasksCompactView ? 'Vista compacta ON' : 'Vista compacta OFF'}
              </Button>
              <Button size="sm" variant="outline" onClick={() => setListCollapsed((prev) => !prev)}>
                {listCollapsed ? <ChevronDown className="h-4 w-4 mr-1" /> : <ChevronUp className="h-4 w-4 mr-1" />}
                {listCollapsed ? 'Expandir' : 'Colapsar'}
              </Button>
            </div>
          </CardHeader>
          {!listCollapsed && (
          <CardContent className="space-y-4">
            <div className="rounded border p-3 space-y-3">
              <p className="text-xs font-medium">Filtros y orden</p>
              <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-4">
                <div className="xl:col-span-2">
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
            </div>

            <div className="space-y-2">
              {loading && <p className="text-sm text-muted-foreground">Cargando tareas...</p>}
              {!loading && sortedTasks.length === 0 && <p className="text-sm text-muted-foreground">Sin tareas para los filtros seleccionados.</p>}
              {pagedListTasks.map((task) => {
                const row = cpmMap.get(task.id)
                return (
                  <div key={task.id} className={`rounded-lg border ${tasksCompactView ? 'p-2 space-y-1.5' : 'p-3 space-y-2'}`}>
                    <div className="flex items-center justify-between gap-2">
                      <div>
                        <p className="text-xs text-muted-foreground" title={taskLocationSummary(task)}>{taskLocationSummary(task)}</p>
                        <p className={`${tasksCompactView ? 'text-sm font-medium' : 'font-medium'}`}>{task.titulo}</p>
                        {!tasksCompactView && <p className="text-xs text-muted-foreground">{task.startDate.toLocaleString()} → {task.endDate.toLocaleString()}</p>}
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
                      {!tasksCompactView && <span>Repuestos: {task.sparePartIds?.length ?? 0}</span>}
                    </div>
                    {canEdit && (!tasksCompactView || selectedTaskId === task.id) && (
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
                    {task.dependencies.length > 0 && !tasksCompactView && (
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
                    <div className={`flex ${tasksCompactView ? 'gap-1.5 flex-wrap' : 'gap-2'}`}>
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
        )}

        {plannerTab !== 'carga_tecnico' && (
        <div className={plannerTab === 'configuracion' ? 'md:col-span-6 grid gap-4 md:grid-cols-2' : 'lg:col-span-2 space-y-4'}>
          {plannerTab === 'configuracion' && (
          <Card className="md:col-span-2">
            <CardContent className="pt-4 text-xs text-muted-foreground flex flex-wrap items-center justify-between gap-2">
              <span>Flujo sugerido: 1) Importar o crear tarea, 2) definir dependencias, 3) simular retraso para validar impacto.</span>
              <Badge variant="outline">Configuración operativa</Badge>
            </CardContent>
          </Card>
          )}

          {plannerTab === 'configuracion' && (
          <Card>
            <CardHeader className="pb-2">
              <CardTitle>Cargar tareas desde Excel</CardTitle>
              <p className="text-xs text-muted-foreground">Importación masiva con previsualización antes de crear registros.</p>
            </CardHeader>
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
          )}

          {plannerTab === 'configuracion' && (
          <Card>
            <CardHeader className="pb-2">
              <CardTitle>Crear tarea</CardTitle>
              <p className="text-xs text-muted-foreground">Alta manual rápida con contexto de área, equipo y responsable.</p>
            </CardHeader>
            <CardContent className="space-y-3">
              <div>
                <Label>Título</Label>
                <Input value={title} onChange={(event) => setTitle(event.target.value)} placeholder="Cambio de rodamiento" />
              </div>
              <div className="grid gap-3 sm:grid-cols-2">
                {TASK_LOCATION_LEVELS.map((level) => {
                  const options = createHierarchyOptions.get(level) ?? []
                  const levelIndex = TASK_LOCATION_LEVELS.indexOf(level)
                  const previousLevel = levelIndex > 0 ? TASK_LOCATION_LEVELS[levelIndex - 1] : null
                  const isDisabled = !!previousLevel && createHierarchySelection[previousLevel] === 'none'

                  return (
                    <div key={`create-level-${level}`}>
                      <Label>{HIERARCHY_LEVEL_NAMES[level]}</Label>
                      <Select
                        value={createHierarchySelection[level] ?? 'none'}
                        onValueChange={(value) => handleCreateHierarchyLevelChange(level, value)}
                        disabled={isDisabled}
                      >
                        <SelectTrigger><SelectValue placeholder="Opcional" /></SelectTrigger>
                        <SelectContent>
                          <SelectItem value="none">Sin selección</SelectItem>
                          {options.map((node) => <SelectItem key={`create-level-node-${level}-${node.id}`} value={node.id}>{node.nombre}</SelectItem>)}
                        </SelectContent>
                      </Select>
                    </div>
                  )
                })}
                <div>
                  <Label>Equipo</Label>
                  <Select value={equipmentId} onValueChange={setEquipmentId}>
                    <SelectTrigger><SelectValue placeholder="Opcional" /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="none">Sin equipo</SelectItem>
                      {equipmentForSelectedHierarchy.map((item) => <SelectItem key={item.id} value={item.id}>{item.nombre}</SelectItem>)}
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
          )}

          {plannerTab === 'tareas' && (
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
                    <div className="rounded border p-2" title={selectedTask.hierarchyPath ?? 'Sin área'}>Área: {compactHierarchyPath(selectedTask.hierarchyPath)}</div>
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
          )}

          {plannerTab === 'configuracion' && (
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
          )}

          {plannerTab === 'configuracion' && (
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
          )}

          {plannerTab === 'tareas' && (
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
              <Input
                type="number"
                min={0}
                step={0.25}
                value={reportedDurationInput}
                onChange={(event) => setReportedDurationInput(event.target.value)}
                placeholder="Tiempo real reportado (horas, opcional)"
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
                    {typeof comment.reportedDurationHours === 'number' && (
                      <p className="text-muted-foreground mt-1">Tiempo real reportado: {comment.reportedDurationHours} h</p>
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
          )}
        </div>
        )}
      </div>
      )}
    </div>
  )
}
