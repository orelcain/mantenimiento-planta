import {
  collection,
  doc,
  getDocs,
  query,
  serverTimestamp,
  setDoc,
  Timestamp,
  updateDoc,
  where,
} from '@/services/firestoreTracked'
import { db } from './firebase'
import { generateId } from '@/lib/utils'
import type { WorkOrder } from '@/types'

/**
 * Servicio de órdenes de trabajo (Centro Técnico Documental).
 * Colección plana `workOrders`, una OT por documento, referenciada al equipo
 * por `equipmentId`. Regla en `firestore.rules` (read activeUser / create+update
 * technician / delete admin), igual que `maintenanceLog`.
 */

const COLLECTION = 'workOrders'

function toDate(v: unknown): Date {
  if (v instanceof Timestamp) return v.toDate()
  if (v instanceof Date) return v
  return new Date()
}

const ESTADO_RANK: Record<WorkOrder['estado'], number> = {
  en_proceso: 0,
  abierta: 1,
  cerrada: 2,
  cancelada: 3,
}

function mapWorkOrder(id: string, data: Record<string, unknown>): WorkOrder {
  return {
    id,
    equipmentId: String(data.equipmentId ?? ''),
    hierarchyNodeId: data.hierarchyNodeId as string | undefined,
    titulo: String(data.titulo ?? ''),
    descripcion: data.descripcion as string | undefined,
    tipo: (data.tipo as WorkOrder['tipo']) ?? 'correctivo',
    prioridad: (data.prioridad as WorkOrder['prioridad']) ?? 'media',
    estado: (data.estado as WorkOrder['estado']) ?? 'abierta',
    asignadoA: data.asignadoA as string | undefined,
    fechaProgramada: data.fechaProgramada as string | undefined,
    fechaCierre: data.fechaCierre as string | undefined,
    costo: typeof data.costo === 'number' ? data.costo : undefined,
    notaCierre: data.notaCierre as string | undefined,
    createdAt: toDate(data.createdAt),
    updatedAt: toDate(data.updatedAt),
  }
}

function sortWorkOrders(rows: WorkOrder[]): WorkOrder[] {
  return rows.sort(
    (a, b) => ESTADO_RANK[a.estado] - ESTADO_RANK[b.estado] || b.createdAt.getTime() - a.createdAt.getTime(),
  )
}

// OTs de un equipo (orden client-side → sin índice compuesto).
export async function getWorkOrders(equipmentId: string): Promise<WorkOrder[]> {
  const q = query(collection(db, COLLECTION), where('equipmentId', '==', equipmentId))
  const snap = await getDocs(q)
  return sortWorkOrders(snap.docs.map((d) => mapWorkOrder(d.id, d.data() as Record<string, unknown>)))
}

// Todas las OT abiertas / en proceso (nivel programa: Agenda y KPIs del CTD).
export async function getOpenWorkOrders(): Promise<WorkOrder[]> {
  const q = query(collection(db, COLLECTION), where('estado', 'in', ['abierta', 'en_proceso']))
  const snap = await getDocs(q)
  return sortWorkOrders(snap.docs.map((d) => mapWorkOrder(d.id, d.data() as Record<string, unknown>)))
}

export async function createWorkOrder(input: Omit<WorkOrder, 'id' | 'createdAt' | 'updatedAt'>): Promise<void> {
  const id = generateId()
  const payload: Record<string, unknown> = {
    equipmentId: input.equipmentId,
    titulo: input.titulo,
    tipo: input.tipo,
    prioridad: input.prioridad,
    estado: input.estado,
    createdAt: serverTimestamp(),
    updatedAt: serverTimestamp(),
  }
  if (input.hierarchyNodeId) payload.hierarchyNodeId = input.hierarchyNodeId
  if (input.descripcion) payload.descripcion = input.descripcion
  if (input.asignadoA) payload.asignadoA = input.asignadoA
  if (input.fechaProgramada) payload.fechaProgramada = input.fechaProgramada
  if (input.fechaCierre) payload.fechaCierre = input.fechaCierre
  if (typeof input.costo === 'number') payload.costo = input.costo
  if (input.notaCierre) payload.notaCierre = input.notaCierre
  await setDoc(doc(db, COLLECTION, id), payload)
}

export async function updateWorkOrder(
  id: string,
  patch: Partial<Omit<WorkOrder, 'id' | 'createdAt' | 'equipmentId'>>,
): Promise<void> {
  const clean: Record<string, unknown> = { updatedAt: serverTimestamp() }
  for (const [k, v] of Object.entries(patch)) {
    if (v !== undefined) clean[k] = v
  }
  await updateDoc(doc(db, COLLECTION, id), clean)
}
