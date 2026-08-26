import {
  addDoc,
  collection,
  deleteDoc,
  doc,
  getDocs,
  orderBy,
  query,
  serverTimestamp,
  Timestamp,
  updateDoc,
  where,
} from '@/services/firestoreTracked'
import { db } from '@/services/firebase'
import type {
  GanttCPMResult,
  GanttCPMTask,
  GanttDelaySimulationInput,
  GanttProject,
  GanttDelaySimulationResult,
  GanttScheduleMetrics,
  GanttTask,
  GanttTaskComment,
} from '@/types'

const GANTT_TASKS_COLLECTION = 'ganttTasks'
const GANTT_COMMENTS_COLLECTION = 'ganttTaskComments'
const GANTT_PROJECTS_COLLECTION = 'ganttProjects'

export function asDate(value: unknown): Date {
  const now = new Date()
  if (!value) return now

  if (value instanceof Date) {
    return Number.isNaN(value.getTime()) ? now : value
  }

  if (typeof value === 'object' && value !== null && 'toDate' in value && typeof (value as { toDate: () => Date }).toDate === 'function') {
    const converted = (value as { toDate: () => Date }).toDate()
    return Number.isNaN(converted.getTime()) ? now : converted
  }

  // Timestamp que perdio su clase y quedo guardado como mapa plano
  // ({seconds, nanoseconds} desde el SDK web, {_seconds, _nanoseconds} desde
  // el admin SDK). Sin esto caia al `new Date(objeto)` de mas abajo, que da
  // Invalid Date, y la tarea terminaba fechada HOY. Ver `stripUndefinedDeep`.
  if (typeof value === 'object' && value !== null) {
    const raw = value as { seconds?: unknown; _seconds?: unknown; nanoseconds?: unknown; _nanoseconds?: unknown }
    const secs = typeof raw.seconds === 'number' ? raw.seconds : (typeof raw._seconds === 'number' ? raw._seconds : null)
    if (secs !== null) {
      const nanos = typeof raw.nanoseconds === 'number' ? raw.nanoseconds : (typeof raw._nanoseconds === 'number' ? raw._nanoseconds : 0)
      const fromMap = new Date(secs * 1000 + Math.round(nanos / 1e6))
      return Number.isNaN(fromMap.getTime()) ? now : fromMap
    }
  }

  // Date-only strings (YYYY-MM-DD) parse as UTC midnight — use local constructor to avoid TZ shift
  const s = value as string
  if (/^\d{4}-\d{2}-\d{2}$/.test(s)) {
    const [y, m, d] = s.split('-').map(Number)
    const local = new Date(y!, m! - 1, d!)
    return Number.isNaN(local.getTime()) ? now : local
  }
  const parsed = new Date(s)
  return Number.isNaN(parsed.getTime()) ? now : parsed
}

function toHours(start: Date, end: Date): number {
  const diff = (end.getTime() - start.getTime()) / (1000 * 60 * 60)
  return Number.isFinite(diff) ? Math.max(1, diff) : 1
}

function normalizeTask(task: GanttTask): GanttTask {
  const estimatedHours = task.estimatedHours && task.estimatedHours > 0
    ? task.estimatedHours
    : toHours(task.startDate, task.endDate)

  return {
    ...task,
    estimatedHours,
    progress: Math.max(0, Math.min(100, task.progress ?? 0)),
    dependencies: task.dependencies ?? [],
  }
}

/**
 * Solo los objetos literales se recorren. Un `Timestamp`, un `FieldValue`
 * (`serverTimestamp()`), un `Date` o cualquier otra instancia se devuelve tal
 * cual: reconstruirla campo por campo la convierte en un objeto plano y
 * Firestore la guarda como tal. Eso fue lo que paso con las tareas del Gantt
 * —`startDate` quedo como `{seconds, nanoseconds}` y `createdAt` como
 * `{_methodName: 'serverTimestamp'}`— y por eso 604 de 609 aparecian fechadas
 * hoy. (Un `Date` es peor: no tiene campos propios enumerables, se guardaba
 * como `{}`.)
 */
function isPlainObject(value: unknown): value is Record<string, unknown> {
  if (Object.prototype.toString.call(value) !== '[object Object]') return false
  const proto = Object.getPrototypeOf(value)
  return proto === Object.prototype || proto === null
}

export function stripUndefinedDeep<T>(value: T): T {
  if (Array.isArray(value)) {
    return value
      .map((item) => stripUndefinedDeep(item))
      .filter((item) => item !== undefined) as T
  }

  if (isPlainObject(value)) {
    const result: Record<string, unknown> = {}
    Object.entries(value as Record<string, unknown>).forEach(([key, nestedValue]) => {
      if (nestedValue === undefined) return
      const cleaned = stripUndefinedDeep(nestedValue)
      if (cleaned !== undefined) {
        result[key] = cleaned
      }
    })
    return result as T
  }

  return value
}

function topologicalSort(tasks: GanttTask[]): string[] {
  const ids = new Set(tasks.map((task) => task.id))
  const inDegree = new Map<string, number>(tasks.map((task) => [task.id, 0]))
  const graph = new Map<string, string[]>()

  tasks.forEach((task) => {
    task.dependencies.forEach((dependency) => {
      if (!ids.has(dependency.predecessorId)) return
      inDegree.set(task.id, (inDegree.get(task.id) ?? 0) + 1)
      const list = graph.get(dependency.predecessorId) ?? []
      list.push(task.id)
      graph.set(dependency.predecessorId, list)
    })
  })

  const queue: string[] = []
  inDegree.forEach((degree, id) => {
    if (degree === 0) queue.push(id)
  })

  const sorted: string[] = []
  while (queue.length > 0) {
    const current = queue.shift() as string
    sorted.push(current)
    const neighbors = graph.get(current) ?? []
    neighbors.forEach((next) => {
      const nextDegree = (inDegree.get(next) ?? 0) - 1
      inDegree.set(next, nextDegree)
      if (nextDegree === 0) queue.push(next)
    })
  }

  if (sorted.length !== tasks.length) {
    return tasks.map((task) => task.id)
  }

  return sorted
}

export async function getGanttTasks(filters?: {
  hierarchyNodeId?: string
  equipmentId?: string
  onlyActive?: boolean
}): Promise<GanttTask[]> {
  const constraints: Parameters<typeof query>[1][] = [orderBy('startDate', 'asc')]

  if (filters?.hierarchyNodeId) {
    constraints.push(where('hierarchyNodeId', '==', filters.hierarchyNodeId))
  }
  if (filters?.equipmentId) {
    constraints.push(where('equipmentId', '==', filters.equipmentId))
  }
  if (filters?.onlyActive) {
    constraints.push(where('status', 'in', ['planificada', 'en_progreso', 'bloqueada']))
  }

  const q = query(collection(db, GANTT_TASKS_COLLECTION), ...constraints)
  const snapshot = await getDocs(q)

  return snapshot.docs.map((snap) => {
    const data = snap.data()
    const startDate = asDate(data.startDate)
    const parsedEndDate = asDate(data.endDate)
    const endDate = parsedEndDate.getTime() >= startDate.getTime()
      ? parsedEndDate
      : new Date(startDate.getTime() + 8 * 60 * 60 * 1000)

    return normalizeTask({
      ...data,
      id: snap.id,
      startDate,
      endDate,
      baselineStartDate: data.baselineStartDate ? asDate(data.baselineStartDate) : undefined,
      baselineEndDate: data.baselineEndDate ? asDate(data.baselineEndDate) : undefined,
      createdAt: asDate(data.createdAt),
      updatedAt: asDate(data.updatedAt),
    } as GanttTask)
  })
}

export async function createGanttTask(
  data: Omit<GanttTask, 'id' | 'createdAt' | 'updatedAt'>
): Promise<string> {
  const normalized = normalizeTask({
    ...(data as GanttTask),
    id: '',
    createdAt: new Date(),
    updatedAt: new Date(),
  })

  const {
    id: _ignoredId,
    createdAt: _ignoredCreatedAt,
    updatedAt: _ignoredUpdatedAt,
    ...persistable
  } = normalized

  const payload = stripUndefinedDeep({
    ...persistable,
    startDate: Timestamp.fromDate(normalized.startDate),
    endDate: Timestamp.fromDate(normalized.endDate),
    baselineStartDate: normalized.baselineStartDate ? Timestamp.fromDate(normalized.baselineStartDate) : undefined,
    baselineEndDate: normalized.baselineEndDate ? Timestamp.fromDate(normalized.baselineEndDate) : undefined,
    createdAt: serverTimestamp(),
    updatedAt: serverTimestamp(),
  })

  const ref = await addDoc(collection(db, GANTT_TASKS_COLLECTION), payload)

  return ref.id
}

export async function getGanttProjects(): Promise<GanttProject[]> {
  const q = query(collection(db, GANTT_PROJECTS_COLLECTION), orderBy('createdAt', 'desc'))
  const snapshot = await getDocs(q)

  return snapshot.docs.map((snap) => {
    const data = snap.data()
    return {
      id: snap.id,
      name: String(data.name ?? '').trim(),
      description: typeof data.description === 'string' ? data.description : undefined,
      active: data.active !== false,
      createdBy: String(data.createdBy ?? ''),
      createdByName: typeof data.createdByName === 'string' ? data.createdByName : undefined,
      createdAt: asDate(data.createdAt),
      updatedAt: asDate(data.updatedAt),
    } as GanttProject
  })
}

export async function createGanttProject(data: {
  name: string
  description?: string
  createdBy: string
  createdByName?: string
}): Promise<string> {
  const payload = stripUndefinedDeep({
    name: data.name.trim(),
    description: data.description?.trim() || undefined,
    active: true,
    createdBy: data.createdBy,
    createdByName: data.createdByName,
    createdAt: serverTimestamp(),
    updatedAt: serverTimestamp(),
  })

  const ref = await addDoc(collection(db, GANTT_PROJECTS_COLLECTION), payload)
  return ref.id
}

export async function updateGanttTask(id: string, patch: Partial<GanttTask>): Promise<void> {
  const payload: Record<string, unknown> = stripUndefinedDeep({
    ...patch,
    updatedAt: serverTimestamp(),
  })

  if ('id' in payload) delete payload.id

  if (patch.startDate) payload.startDate = Timestamp.fromDate(patch.startDate)
  if (patch.endDate) payload.endDate = Timestamp.fromDate(patch.endDate)
  if (patch.baselineStartDate) payload.baselineStartDate = Timestamp.fromDate(patch.baselineStartDate)
  if (patch.baselineEndDate) payload.baselineEndDate = Timestamp.fromDate(patch.baselineEndDate)

  await updateDoc(doc(db, GANTT_TASKS_COLLECTION, id), payload)
}

export async function deleteGanttTask(id: string): Promise<void> {
  await deleteDoc(doc(db, GANTT_TASKS_COLLECTION, id))
}

export async function getTaskComments(taskId: string): Promise<GanttTaskComment[]> {
  const q = query(
    collection(db, GANTT_COMMENTS_COLLECTION),
    where('taskId', '==', taskId)
  )
  const snapshot = await getDocs(q)

  const rows = snapshot.docs.map((snap) => {
    const data = snap.data()
    return {
      id: snap.id,
      ...data,
      createdAt: asDate(data.createdAt),
    } as GanttTaskComment
  })

  rows.sort((left, right) => right.createdAt.getTime() - left.createdAt.getTime())
  return rows
}

export async function addTaskComment(
  taskId: string,
  comment: Omit<GanttTaskComment, 'id' | 'taskId' | 'createdAt'>
): Promise<string> {
  const payload = stripUndefinedDeep({
    taskId,
    ...comment,
    createdAt: serverTimestamp(),
  })

  const ref = await addDoc(collection(db, GANTT_COMMENTS_COLLECTION), payload)

  return ref.id
}

export async function updateTaskComment(
  commentId: string,
  patch: Partial<Pick<GanttTaskComment, 'content' | 'reportedProgress' | 'reportedDurationHours' | 'photos' | 'aiSuggestedProgress'>>
): Promise<void> {
  const payload: Record<string, unknown> = stripUndefinedDeep({
    ...patch,
    updatedAt: serverTimestamp(),
  })

  await updateDoc(doc(db, GANTT_COMMENTS_COLLECTION, commentId), payload)
}

export function calculateCPM(tasks: GanttTask[]): GanttCPMResult {
  const normalizedTasks = tasks.map(normalizeTask)
  const byId = new Map(normalizedTasks.map((task) => [task.id, task]))
  const sorted = topologicalSort(normalizedTasks)

  const earliestStart = new Map<string, number>()
  const earliestFinish = new Map<string, number>()

  for (const id of sorted) {
    const task = byId.get(id)
    if (!task) continue

    let maxPredFinish = 0
    for (const dep of task.dependencies) {
      const predFinish = earliestFinish.get(dep.predecessorId) ?? 0
      const lag = dep.lagHours ?? 0
      maxPredFinish = Math.max(maxPredFinish, predFinish + lag)
    }

    const es = Math.max(0, maxPredFinish)
    const ef = es + task.estimatedHours
    earliestStart.set(id, es)
    earliestFinish.set(id, ef)
  }

  const projectDuration = sorted.reduce((acc, id) => Math.max(acc, earliestFinish.get(id) ?? 0), 0)

  const latestStart = new Map<string, number>()
  const latestFinish = new Map<string, number>()

  const successors = new Map<string, string[]>()
  normalizedTasks.forEach((task) => {
    task.dependencies.forEach((dep) => {
      const list = successors.get(dep.predecessorId) ?? []
      list.push(task.id)
      successors.set(dep.predecessorId, list)
    })
  })

  const reverse = [...sorted].reverse()
  for (const id of reverse) {
    const task = byId.get(id)
    if (!task) continue

    const next = successors.get(id) ?? []
    if (next.length === 0) {
      latestFinish.set(id, projectDuration)
      latestStart.set(id, projectDuration - task.estimatedHours)
      continue
    }

    let minLs = Number.POSITIVE_INFINITY
    for (const succId of next) {
      const succTask = byId.get(succId)
      if (!succTask) continue
      const succLs = latestStart.get(succId)
      if (typeof succLs !== 'number') continue

      const dep = succTask.dependencies.find((d) => d.predecessorId === id)
      const lag = dep?.lagHours ?? 0
      minLs = Math.min(minLs, succLs - lag)
    }

    if (!Number.isFinite(minLs)) {
      minLs = projectDuration
    }

    latestFinish.set(id, minLs)
    latestStart.set(id, minLs - task.estimatedHours)
  }

  const cpmTasks: GanttCPMTask[] = sorted.map((id) => {
    const es = earliestStart.get(id) ?? 0
    const ef = earliestFinish.get(id) ?? 0
    const ls = latestStart.get(id) ?? es
    const lf = latestFinish.get(id) ?? ef
    const slack = Number((ls - es).toFixed(2))

    return {
      taskId: id,
      earliestStart: es,
      earliestFinish: ef,
      latestStart: ls,
      latestFinish: lf,
      slack,
      isCritical: Math.abs(slack) < 0.001,
    }
  })

  return {
    tasks: cpmTasks,
    criticalPath: cpmTasks.filter((item) => item.isCritical).map((item) => item.taskId),
    projectDurationHours: Number(projectDuration.toFixed(2)),
  }
}

export function simulateDelay(
  tasks: GanttTask[],
  input: GanttDelaySimulationInput
): GanttDelaySimulationResult {
  const base = calculateCPM(tasks)
  const simulatedTasks = tasks.map((task) => {
    if (task.id !== input.taskId) return task
    return {
      ...task,
      estimatedHours: Math.max(1, task.estimatedHours + input.extraHours),
      endDate: new Date(task.endDate.getTime() + input.extraHours * 60 * 60 * 1000),
    }
  })

  const simulated = calculateCPM(simulatedTasks)
  const impacted = simulated.tasks
    .filter((entry) => {
      const previous = base.tasks.find((item) => item.taskId === entry.taskId)
      if (!previous) return true
      return Math.abs(entry.earliestFinish - previous.earliestFinish) > 0.01
    })
    .map((entry) => entry.taskId)

  return {
    baseDurationHours: base.projectDurationHours,
    simulatedDurationHours: simulated.projectDurationHours,
    impactHours: Number((simulated.projectDurationHours - base.projectDurationHours).toFixed(2)),
    impactedTaskIds: impacted,
  }
}

export function buildGanttMetrics(tasks: GanttTask[]): GanttScheduleMetrics {
  const now = Date.now()
  const cpm = calculateCPM(tasks)
  const criticalSet = new Set(cpm.criticalPath)

  const totalTasks = tasks.length
  const completedTasks = tasks.filter((task) => task.status === 'completada').length
  const delayedTasks = tasks.filter((task) => task.status !== 'completada' && task.endDate.getTime() < now).length
  const averageProgress = totalTasks === 0
    ? 0
    : Number((tasks.reduce((acc, task) => acc + (task.progress || 0), 0) / totalTasks).toFixed(1))

  return {
    totalTasks,
    completedTasks,
    delayedTasks,
    criticalTasks: criticalSet.size,
    averageProgress,
    estimatedDurationHours: cpm.projectDurationHours,
  }
}
