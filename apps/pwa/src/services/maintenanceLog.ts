import {
  collection,
  doc,
  setDoc,
  getDocs,
  query,
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
  const entries: MaintenanceLogEntry[] = snap.docs.map((d) => {
    const data = d.data() as Record<string, unknown>
    return {
      id: d.id,
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
      createdAt: toDate(data.createdAt),
    }
  })
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
  if (entry.checklist && entry.checklist.length > 0) {
    // Saneado: Firestore no acepta `undefined` (omitir `valor` si no hay).
    payload.checklist = entry.checklist.map((t) =>
      t.valor != null && t.valor !== '' ? { id: t.id, tarea: t.tarea, estado: t.estado, valor: t.valor } : { id: t.id, tarea: t.tarea, estado: t.estado },
    )
  }
  await setDoc(doc(db, COLLECTION, id), payload)
}
