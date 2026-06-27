import {
  collection,
  deleteDoc,
  doc,
  setDoc,
  getDocs,
  query,
  updateDoc,
  where,
  serverTimestamp,
  Timestamp,
} from '@/services/firestoreTracked'
import { db } from './firebase'
import { generateId } from '@/lib/utils'
import type { MaintenanceLogEntry } from '@/types'

/**
 * Servicio del historial de mantenimiento NFPA 70B (Centro Técnico Documental).
 * Colección plana `maintenanceLog`, una entrada por evento, referenciada al
 * equipo por `equipmentId`. Ver `docs/PLAN_CENTRO_TECNICO_DOCUMENTAL.md`.
 */

const COLLECTION = 'maintenanceLog'

function toDate(v: unknown): Date {
  if (v instanceof Timestamp) return v.toDate()
  if (v instanceof Date) return v
  return new Date()
}

// Entradas del historial de un equipo (orden client-side → sin índice compuesto).
export async function getMaintenanceLog(equipmentId: string): Promise<MaintenanceLogEntry[]> {
  const q = query(collection(db, COLLECTION), where('equipmentId', '==', equipmentId))
  const snap = await getDocs(q)
  const entries = snap.docs.map((d) => mapEntry(d.id, d.data() as Record<string, unknown>))
  return entries.sort((a, b) => b.fecha.getTime() - a.fecha.getTime())
}

// Mapea un doc Firestore de maintenanceLog a MaintenanceLogEntry (orden por fecha lo hace el caller).
function mapEntry(id: string, data: Record<string, unknown>): MaintenanceLogEntry {
  return {
    id,
    equipmentId: String(data.equipmentId ?? ''),
    hierarchyNodeId: data.hierarchyNodeId as string | undefined,
    fecha: toDate(data.fecha),
    tipo: (data.tipo as MaintenanceLogEntry['tipo']) ?? 'inspeccion',
    tecnico: data.tecnico as string | undefined,
    hallazgo: String(data.hallazgo ?? ''),
    severidad: (data.severidad as MaintenanceLogEntry['severidad']) ?? 'verde',
    incidenciaId: data.incidenciaId as string | undefined,
    proximaInspeccion: data.proximaInspeccion as string | undefined,
    checklist: Array.isArray(data.checklist) ? (data.checklist as MaintenanceLogEntry['checklist']) : undefined,
    plantLineId: data.plantLineId as string | undefined,
    areaNodeId: data.areaNodeId as string | undefined,
    shiftId: data.shiftId as string | undefined,
    origen: data.origen as MaintenanceLogEntry['origen'],
    sapAviso: data.sapAviso as string | undefined,
    sapOrden: data.sapOrden as string | undefined,
    createdAt: toDate(data.createdAt),
  }
}

// Intervenciones registradas contra una línea/área del módulo Análisis de Turno
// (Captura Rápida). where simple sobre plantLineId → índice de campo único auto.
export async function getMaintenanceLogByPlantLine(plantLineId: string): Promise<MaintenanceLogEntry[]> {
  const q = query(collection(db, COLLECTION), where('plantLineId', '==', plantLineId))
  const snap = await getDocs(q)
  const entries = snap.docs.map((d) => mapEntry(d.id, d.data() as Record<string, unknown>))
  return entries.sort((a, b) => b.fecha.getTime() - a.fecha.getTime())
}

// Registrar una entrada en el historial.
export async function addMaintenanceLogEntry(
  entry: Omit<MaintenanceLogEntry, 'id' | 'createdAt'>
): Promise<void> {
  const id = generateId()
  const payload: Record<string, unknown> = {
    equipmentId: entry.equipmentId,
    fecha: Timestamp.fromDate(entry.fecha),
    tipo: entry.tipo,
    hallazgo: entry.hallazgo,
    severidad: entry.severidad,
    createdAt: serverTimestamp(),
  }
  if (entry.hierarchyNodeId) payload.hierarchyNodeId = entry.hierarchyNodeId
  if (entry.tecnico) payload.tecnico = entry.tecnico
  if (entry.incidenciaId) payload.incidenciaId = entry.incidenciaId
  if (entry.proximaInspeccion) payload.proximaInspeccion = entry.proximaInspeccion
  if (entry.plantLineId) payload.plantLineId = entry.plantLineId
  if (entry.areaNodeId) payload.areaNodeId = entry.areaNodeId
  if (entry.shiftId) payload.shiftId = entry.shiftId
  if (entry.origen) payload.origen = entry.origen
  if (entry.sapAviso) payload.sapAviso = entry.sapAviso
  if (entry.sapOrden) payload.sapOrden = entry.sapOrden
  if (entry.checklist && entry.checklist.length > 0) {
    // Saneado: Firestore no acepta `undefined` (omitir `valor` si no hay).
    payload.checklist = entry.checklist.map((t) => {
      const o: Record<string, unknown> = { id: t.id, tarea: t.tarea, estado: t.estado }
      if (t.valor != null && t.valor !== '') o.valor = t.valor
      if (t.detalle != null && t.detalle !== '') o.detalle = t.detalle
      return o
    })
  }
  await setDoc(doc(db, COLLECTION, id), payload)
}

// Editar una entrada. Permite cambiar fecha/hora, tipo, condición, texto, el
// equipo asignado y la trazabilidad SAP. Los campos string se pueden limpiar
// mandando '' (queda vacío → p.ej. "SAP pendiente" si se borra la OT).
export async function updateMaintenanceLogEntry(
  id: string,
  patch: Partial<Pick<MaintenanceLogEntry,
    'fecha' | 'tipo' | 'severidad' | 'tecnico' | 'hallazgo' | 'equipmentId' | 'hierarchyNodeId' | 'sapAviso' | 'sapOrden'>>,
): Promise<void> {
  const clean: Record<string, unknown> = {}
  if (patch.fecha) clean.fecha = Timestamp.fromDate(patch.fecha)
  if (patch.tipo) clean.tipo = patch.tipo
  if (patch.severidad) clean.severidad = patch.severidad
  if (patch.tecnico !== undefined) clean.tecnico = patch.tecnico
  if (patch.hallazgo !== undefined) clean.hallazgo = patch.hallazgo
  if (patch.equipmentId) clean.equipmentId = patch.equipmentId
  if (patch.hierarchyNodeId !== undefined) clean.hierarchyNodeId = patch.hierarchyNodeId
  if (patch.sapAviso !== undefined) clean.sapAviso = patch.sapAviso
  if (patch.sapOrden !== undefined) clean.sapOrden = patch.sapOrden
  await updateDoc(doc(db, COLLECTION, id), clean)
}

// Eliminar una entrada del historial (admin).
export async function deleteMaintenanceLogEntry(id: string): Promise<void> {
  await deleteDoc(doc(db, COLLECTION, id))
}
