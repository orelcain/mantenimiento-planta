import {
  collection,
  deleteDoc,
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
import type { ParoEtapa } from '@/types'

/**
 * Servicio de paros de etapa (colección plana `paros`). Captura manual de
 * detenciones de las etapas no instrumentadas de la línea, para cuantificar la
 * disponibilidad del área. Ver docs/OEE_AREA_ROADMAP.md (Fase B).
 */

const COLLECTION = 'paros'

function toDate(v: unknown): Date {
  if (v instanceof Timestamp) return v.toDate()
  if (v instanceof Date) return v
  return new Date()
}

function mapParo(id: string, data: Record<string, unknown>): ParoEtapa {
  return {
    id,
    plantLineId: String(data.plantLineId ?? ''),
    etapa: String(data.etapa ?? ''),
    duracionMin: Number(data.duracionMin) || 0,
    causa: String(data.causa ?? ''),
    fecha: toDate(data.fecha),
    tecnico: data.tecnico as string | undefined,
    shiftId: data.shiftId as string | undefined,
    createdAt: toDate(data.createdAt),
  }
}

// Paros de una línea/área (where simple sobre plantLineId → índice de campo único auto).
export async function getParosByPlantLine(plantLineId: string): Promise<ParoEtapa[]> {
  const q = query(collection(db, COLLECTION), where('plantLineId', '==', plantLineId))
  const snap = await getDocs(q)
  const paros = snap.docs.map((d) => mapParo(d.id, d.data() as Record<string, unknown>))
  return paros.sort((a, b) => b.fecha.getTime() - a.fecha.getTime())
}

// Registrar un paro de etapa.
export async function addParo(entry: Omit<ParoEtapa, 'id' | 'createdAt'>): Promise<void> {
  const id = generateId()
  const payload: Record<string, unknown> = {
    plantLineId: entry.plantLineId,
    etapa: entry.etapa,
    duracionMin: entry.duracionMin,
    causa: entry.causa,
    fecha: Timestamp.fromDate(entry.fecha),
    createdAt: serverTimestamp(),
  }
  if (entry.tecnico) payload.tecnico = entry.tecnico
  if (entry.shiftId) payload.shiftId = entry.shiftId
  await setDoc(doc(db, COLLECTION, id), payload)
}

// Eliminar un paro (admin).
export async function deleteParo(id: string): Promise<void> {
  await deleteDoc(doc(db, COLLECTION, id))
}
