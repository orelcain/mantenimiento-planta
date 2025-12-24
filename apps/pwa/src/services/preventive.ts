import {
  collection,
  doc,
  getDocs,
  getDoc,
  addDoc,
  updateDoc,
  deleteDoc,
  query,
  where,
  orderBy,
  Timestamp,
  serverTimestamp,
} from 'firebase/firestore'
import { db } from '@/services/firebase'
import type { PreventiveTask, PreventiveExecution } from '@/types'

const TASKS_COLLECTION = 'preventiveTasks'
const EXECUTIONS_COLLECTION = 'preventiveExecutions'

// ==================== TAREAS ====================

export async function getPreventiveTasks(equipmentId?: string): Promise<PreventiveTask[]> {
  let q = query(
    collection(db, TASKS_COLLECTION),
    orderBy('proximaEjecucion', 'asc')
  )

  if (equipmentId) {
    q = query(
      collection(db, TASKS_COLLECTION),
      where('equipmentId', '==', equipmentId),
      orderBy('proximaEjecucion', 'asc')
    )
  }

  const snapshot = await getDocs(q)
  return snapshot.docs.map((doc) => ({
    id: doc.id,
    ...doc.data(),
    ultimaEjecucion: doc.data().ultimaEjecucion?.toDate(),
    proximaEjecucion: doc.data().proximaEjecucion.toDate(),
    createdAt: doc.data().createdAt.toDate(),
    updatedAt: doc.data().updatedAt.toDate(),
  })) as PreventiveTask[]
}

export async function getPreventiveTask(id: string): Promise<PreventiveTask | null> {
  const docRef = doc(db, TASKS_COLLECTION, id)
  const docSnap = await getDoc(docRef)

  if (!docSnap.exists()) return null

  const data = docSnap.data()
  return {
    id: docSnap.id,
    ...data,
    ultimaEjecucion: data.ultimaEjecucion?.toDate(),
    proximaEjecucion: data.proximaEjecucion.toDate(),
    createdAt: data.createdAt.toDate(),
    updatedAt: data.updatedAt.toDate(),
  } as PreventiveTask
}

export async function getOverdueTasks(): Promise<PreventiveTask[]> {
  const now = new Date()
  const q = query(
    collection(db, TASKS_COLLECTION),
    where('activo', '==', true),
    where('proximaEjecucion', '<=', Timestamp.fromDate(now)),
    orderBy('proximaEjecucion', 'asc')
  )

  const snapshot = await getDocs(q)
  return snapshot.docs.map((doc) => ({
    id: doc.id,
    ...doc.data(),
    ultimaEjecucion: doc.data().ultimaEjecucion?.toDate(),
    proximaEjecucion: doc.data().proximaEjecucion.toDate(),
    createdAt: doc.data().createdAt.toDate(),
    updatedAt: doc.data().updatedAt.toDate(),
  })) as PreventiveTask[]
}

export async function getUpcomingTasks(days: number = 7): Promise<PreventiveTask[]> {
  const now = new Date()
  const futureDate = new Date()
  futureDate.setDate(now.getDate() + days)

  const q = query(
    collection(db, TASKS_COLLECTION),
    where('activo', '==', true),
    where('proximaEjecucion', '>', Timestamp.fromDate(now)),
    where('proximaEjecucion', '<=', Timestamp.fromDate(futureDate)),
    orderBy('proximaEjecucion', 'asc')
  )

  const snapshot = await getDocs(q)
  return snapshot.docs.map((doc) => ({
    id: doc.id,
    ...doc.data(),
    ultimaEjecucion: doc.data().ultimaEjecucion?.toDate(),
    proximaEjecucion: doc.data().proximaEjecucion.toDate(),
    createdAt: doc.data().createdAt.toDate(),
    updatedAt: doc.data().updatedAt.toDate(),
  })) as PreventiveTask[]
}

export async function createPreventiveTask(
  data: Omit<PreventiveTask, 'id' | 'createdAt' | 'updatedAt'>
): Promise<string> {
  const docRef = await addDoc(collection(db, TASKS_COLLECTION), {
    ...data,
    proximaEjecucion: Timestamp.fromDate(data.proximaEjecucion),
    ultimaEjecucion: data.ultimaEjecucion
      ? Timestamp.fromDate(data.ultimaEjecucion)
      : null,
    createdAt: serverTimestamp(),
    updatedAt: serverTimestamp(),
  })
  return docRef.id
}

export async function updatePreventiveTask(
  id: string,
  data: Partial<PreventiveTask>
): Promise<void> {
  const docRef = doc(db, TASKS_COLLECTION, id)
  const updateData: Record<string, unknown> = {
    ...data,
    updatedAt: serverTimestamp(),
  }

  if (data.proximaEjecucion) {
    updateData.proximaEjecucion = Timestamp.fromDate(data.proximaEjecucion)
  }
  if (data.ultimaEjecucion) {
    updateData.ultimaEjecucion = Timestamp.fromDate(data.ultimaEjecucion)
  }

  await updateDoc(docRef, updateData)
}

export async function deletePreventiveTask(id: string): Promise<void> {
  await deleteDoc(doc(db, TASKS_COLLECTION, id))
}

// ==================== EJECUCIONES ====================

export async function getExecutions(taskId?: string): Promise<PreventiveExecution[]> {
  let q = query(
    collection(db, EXECUTIONS_COLLECTION),
    orderBy('fechaEjecucion', 'desc')
  )

  if (taskId) {
    q = query(
      collection(db, EXECUTIONS_COLLECTION),
      where('taskId', '==', taskId),
      orderBy('fechaEjecucion', 'desc')
    )
  }

  const snapshot = await getDocs(q)
  return snapshot.docs.map((doc) => ({
    id: doc.id,
    ...doc.data(),
    fechaEjecucion: doc.data().fechaEjecucion.toDate(),
  })) as PreventiveExecution[]
}

export async function createExecution(
  data: Omit<PreventiveExecution, 'id'>
): Promise<string> {
  // Crear la ejecución
  const docRef = await addDoc(collection(db, EXECUTIONS_COLLECTION), {
    ...data,
    fechaEjecucion: Timestamp.fromDate(data.fechaEjecucion),
  })

  // Actualizar la tarea con la nueva fecha de próxima ejecución
  const task = await getPreventiveTask(data.taskId)
  if (task) {
    const proximaEjecucion = new Date(data.fechaEjecucion)
    proximaEjecucion.setDate(proximaEjecucion.getDate() + task.frecuenciaDias)

    await updatePreventiveTask(data.taskId, {
      ultimaEjecucion: data.fechaEjecucion,
      proximaEjecucion,
    })
  }

  return docRef.id
}

export async function getEquipmentExecutionHistory(
  equipmentId: string,
  limit: number = 10
): Promise<PreventiveExecution[]> {
  const q = query(
    collection(db, EXECUTIONS_COLLECTION),
    where('equipmentId', '==', equipmentId),
    orderBy('fechaEjecucion', 'desc')
  )

  const snapshot = await getDocs(q)
  return snapshot.docs.slice(0, limit).map((doc) => ({
    id: doc.id,
    ...doc.data(),
    fechaEjecucion: doc.data().fechaEjecucion.toDate(),
  })) as PreventiveExecution[]
}

// ==================== ESTADÍSTICAS ====================

export async function getPreventiveStats() {
  const tasks = await getPreventiveTasks()
  const now = new Date()

  const overdue = tasks.filter(
    (t) => t.activo && t.proximaEjecucion < now
  ).length

  const upcoming7Days = tasks.filter((t) => {
    if (!t.activo) return false
    const diff = t.proximaEjecucion.getTime() - now.getTime()
    const days = diff / (1000 * 60 * 60 * 24)
    return days > 0 && days <= 7
  }).length

  const completedThisMonth = await getExecutionsThisMonth()

  return {
    totalTasks: tasks.filter((t) => t.activo).length,
    overdue,
    upcoming7Days,
    completedThisMonth: completedThisMonth.length,
  }
}

async function getExecutionsThisMonth(): Promise<PreventiveExecution[]> {
  const now = new Date()
  const startOfMonth = new Date(now.getFullYear(), now.getMonth(), 1)

  const q = query(
    collection(db, EXECUTIONS_COLLECTION),
    where('fechaEjecucion', '>=', Timestamp.fromDate(startOfMonth)),
    orderBy('fechaEjecucion', 'desc')
  )

  const snapshot = await getDocs(q)
  return snapshot.docs.map((doc) => ({
    id: doc.id,
    ...doc.data(),
    fechaEjecucion: doc.data().fechaEjecucion.toDate(),
  })) as PreventiveExecution[]
}

// ==================== TIPOS PREDEFINIDOS ====================

export const TASK_TYPES = [
  { value: 'inspeccion', label: 'Inspección visual' },
  { value: 'lubricacion', label: 'Lubricación' },
  { value: 'limpieza', label: 'Limpieza' },
  { value: 'calibracion', label: 'Calibración' },
  { value: 'cambio_filtro', label: 'Cambio de filtro' },
  { value: 'cambio_aceite', label: 'Cambio de aceite' },
  { value: 'ajuste', label: 'Ajuste/Torque' },
  { value: 'verificacion_electrica', label: 'Verificación eléctrica' },
  { value: 'verificacion_neumatica', label: 'Verificación neumática' },
  { value: 'revision_seguridad', label: 'Revisión de seguridad' },
  { value: 'otro', label: 'Otro' },
]

export const FRECUENCIA_OPCIONES = [
  { value: 1, label: 'Diario' },
  { value: 7, label: 'Semanal' },
  { value: 14, label: 'Quincenal' },
  { value: 30, label: 'Mensual' },
  { value: 60, label: 'Bimestral' },
  { value: 90, label: 'Trimestral' },
  { value: 180, label: 'Semestral' },
  { value: 365, label: 'Anual' },
]
