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
  GanttDelaySimulationResult,
  GanttScheduleMetrics,
  GanttTask,
  GanttTaskComment,
} from '@/types'

const GANTT_TASKS_COLLECTION = 'ganttTasks'
const GANTT_COMMENTS_COLLECTION = 'ganttTaskComments'

function asDate(value: unknown): Date {
  if (!value) return new Date()
  if (value instanceof Date) return value
  if (typeof value === 'object' && value !== null && 'toDate' in value && typeof (value as { toDate: () => Date }).toDate === 'function') {
    return (value as { toDate: () => Date }).toDate()
  }
  return new Date(value as string)
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
    return normalizeTask({
      id: snap.id,
      ...data,
      startDate: asDate(data.startDate),
      endDate: asDate(data.endDate),
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

  const ref = await addDoc(collection(db, GANTT_TASKS_COLLECTION), {
    ...normalized,
    startDate: Timestamp.fromDate(normalized.startDate),
    endDate: Timestamp.fromDate(normalized.endDate),
    createdAt: serverTimestamp(),
    updatedAt: serverTimestamp(),
  })

  return ref.id
}

export async function updateGanttTask(id: string, patch: Partial<GanttTask>): Promise<void> {
  const payload: Record<string, unknown> = {
    ...patch,
    updatedAt: serverTimestamp(),
  }

  if (patch.startDate) payload.startDate = Timestamp.fromDate(patch.startDate)
  if (patch.endDate) payload.endDate = Timestamp.fromDate(patch.endDate)

  await updateDoc(doc(db, GANTT_TASKS_COLLECTION, id), payload)
}

export async function deleteGanttTask(id: string): Promise<void> {
  await deleteDoc(doc(db, GANTT_TASKS_COLLECTION, id))
}

export async function getTaskComments(taskId: string): Promise<GanttTaskComment[]> {
  const q = query(
    collection(db, GANTT_COMMENTS_COLLECTION),
    where('taskId', '==', taskId),
    orderBy('createdAt', 'desc')
  )
  const snapshot = await getDocs(q)

  return snapshot.docs.map((snap) => {
    const data = snap.data()
    return {
      id: snap.id,
      ...data,
      createdAt: asDate(data.createdAt),
    } as GanttTaskComment
  })
}

export async function addTaskComment(
  taskId: string,
  comment: Omit<GanttTaskComment, 'id' | 'taskId' | 'createdAt'>
): Promise<string> {
  const ref = await addDoc(collection(db, GANTT_COMMENTS_COLLECTION), {
    taskId,
    ...comment,
    createdAt: serverTimestamp(),
  })

  return ref.id
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
