import {
  collection,
  doc,
  getDoc,
  getDocs,
  setDoc,
  updateDoc,
  deleteDoc,
  query,
  where,
  orderBy,
  limit,
  onSnapshot,
  serverTimestamp,
  Timestamp,
  QueryConstraint,
} from 'firebase/firestore'
import { db } from './firebase'
import type { Incident, IncidentStatus, IncidentPriority, MaintenanceType } from '@/types'
import { generateId } from '@/lib/utils'

const COLLECTION = 'incidents'

// Crear incidencia
export async function createIncident(
  data: Omit<Incident, 'id' | 'createdAt' | 'updatedAt'>
): Promise<Incident> {
  const id = generateId()
  
  const incident: Incident = {
    ...data,
    id,
    createdAt: new Date(),
    updatedAt: new Date(),
  }

  await setDoc(doc(db, COLLECTION, id), {
    ...incident,
    createdAt: serverTimestamp(),
    updatedAt: serverTimestamp(),
  })

  return incident
}

// Obtener incidencia por ID
export async function getIncidentById(id: string): Promise<Incident | null> {
  const docRef = doc(db, COLLECTION, id)
  const docSnap = await getDoc(docRef)
  
  if (!docSnap.exists()) {
    return null
  }

  return parseIncidentDoc(docSnap)
}

// Obtener todas las incidencias
export async function getIncidents(filters?: {
  status?: IncidentStatus
  prioridad?: IncidentPriority
  tipo?: MaintenanceType
  zoneId?: string
  equipmentId?: string
  reportadoPor?: string
  asignadoA?: string
  limit?: number
}): Promise<Incident[]> {
  const constraints: QueryConstraint[] = []

  if (filters?.status) {
    constraints.push(where('status', '==', filters.status))
  }
  if (filters?.prioridad) {
    constraints.push(where('prioridad', '==', filters.prioridad))
  }
  if (filters?.tipo) {
    constraints.push(where('tipo', '==', filters.tipo))
  }
  if (filters?.zoneId) {
    constraints.push(where('zoneId', '==', filters.zoneId))
  }
  if (filters?.equipmentId) {
    constraints.push(where('equipmentId', '==', filters.equipmentId))
  }
  if (filters?.reportadoPor) {
    constraints.push(where('reportadoPor', '==', filters.reportadoPor))
  }
  if (filters?.asignadoA) {
    constraints.push(where('asignadoA', '==', filters.asignadoA))
  }

  constraints.push(orderBy('createdAt', 'desc'))

  if (filters?.limit) {
    constraints.push(limit(filters.limit))
  }

  const q = query(collection(db, COLLECTION), ...constraints)
  const snapshot = await getDocs(q)

  return snapshot.docs.map(parseIncidentDoc)
}

// Actualizar incidencia
export async function updateIncident(
  id: string,
  data: Partial<Omit<Incident, 'id' | 'createdAt'>>
): Promise<void> {
  const docRef = doc(db, COLLECTION, id)
  await updateDoc(docRef, {
    ...data,
    updatedAt: serverTimestamp(),
  })
}

// Confirmar incidencia (supervisor)
export async function confirmIncident(
  id: string,
  validatedBy: string
): Promise<void> {
  await updateIncident(id, {
    status: 'confirmada',
    validatedBy,
    validatedAt: new Date(),
    confirmedAt: new Date(),
  })
}

// Rechazar incidencia (supervisor)
export async function rejectIncident(
  id: string,
  validatedBy: string,
  rejectionReason: string
): Promise<void> {
  await updateIncident(id, {
    status: 'rechazada',
    validatedBy,
    validatedAt: new Date(),
    rejectionReason,
  })
}

// Asignar técnico
export async function assignTechnician(
  id: string,
  technicianId: string
): Promise<void> {
  await updateIncident(id, {
    asignadoA: technicianId,
    status: 'en_proceso',
  })
}

// Cerrar incidencia
export async function closeIncident(
  id: string,
  resolucion: string,
  repuestosUsados?: { repuestoId: string; cantidad: number }[],
  firmaCierre?: string
): Promise<void> {
  const incident = await getIncidentById(id)
  if (!incident) throw new Error('Incidencia no encontrada')

  const now = new Date()
  const tiempoResolucion = incident.confirmedAt
    ? Math.round((now.getTime() - incident.confirmedAt.getTime()) / 60000)
    : undefined

  await updateIncident(id, {
    status: 'cerrada',
    resolucion,
    closedAt: now,
    tiempoResolucionMinutos: tiempoResolucion,
    repuestosUsados,
    firmaCierre,
  })
}

// Eliminar incidencia
export async function deleteIncident(id: string): Promise<void> {
  await deleteDoc(doc(db, COLLECTION, id))
}

// Escuchar cambios en tiempo real
export function subscribeToIncidents(
  callback: (incidents: Incident[]) => void,
  filters?: {
    status?: IncidentStatus[]
  }
): () => void {
  const constraints: QueryConstraint[] = []

  if (filters?.status && filters.status.length > 0) {
    constraints.push(where('status', 'in', filters.status))
  }

  constraints.push(orderBy('createdAt', 'desc'))
  constraints.push(limit(100))

  const q = query(collection(db, COLLECTION), ...constraints)
  
  return onSnapshot(q, (snapshot) => {
    const incidents = snapshot.docs.map(parseIncidentDoc)
    callback(incidents)
  })
}

// Helper para parsear documentos
function parseIncidentDoc(doc: any): Incident {
  const data = doc.data()
  return {
    ...data,
    id: doc.id,
    createdAt: toDate(data.createdAt),
    updatedAt: toDate(data.updatedAt),
    confirmedAt: toDate(data.confirmedAt),
    closedAt: toDate(data.closedAt),
    validatedAt: toDate(data.validatedAt),
  } as Incident
}

function toDate(value: any): Date | undefined {
  if (!value) return undefined
  if (value instanceof Timestamp) return value.toDate()
  if (value instanceof Date) return value
  return new Date(value)
}
