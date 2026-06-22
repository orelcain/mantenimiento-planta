import {
  collection,
  doc,
  getDocs,
  query,
  serverTimestamp,
  setDoc,
  Timestamp,
  where,
} from '@/services/firestoreTracked'
import { db } from './firebase'
import { generateId } from '@/lib/utils'
import type { Medicion } from '@/types'

/**
 * Servicio de mediciones de comportamiento (Centro Técnico Documental).
 * Colección plana `mediciones`, un doc por lectura, referenciada al equipo por
 * `equipmentId`. Bitácora oportunista (sin cadencia) → base de las tendencias.
 * Regla en `firestore.rules` (read activeUser / create+update technician /
 * delete admin), patrón `maintenanceLog`/`workOrders`.
 */

const COLLECTION = 'mediciones'

function toDate(v: unknown): Date {
  if (v instanceof Timestamp) return v.toDate()
  if (v instanceof Date) return v
  return new Date()
}

// Mediciones de un equipo, en orden ascendente por fecha (para graficar la serie).
export async function getMediciones(equipmentId: string): Promise<Medicion[]> {
  const q = query(collection(db, COLLECTION), where('equipmentId', '==', equipmentId))
  const snap = await getDocs(q)
  const rows: Medicion[] = snap.docs.map((d) => {
    const data = d.data() as Record<string, unknown>
    const valoresRaw = (data.valores ?? {}) as Record<string, unknown>
    const valores: Record<string, number> = {}
    for (const [k, v] of Object.entries(valoresRaw)) if (typeof v === 'number') valores[k] = v
    return {
      id: d.id,
      equipmentId: String(data.equipmentId ?? ''),
      hierarchyNodeId: data.hierarchyNodeId as string | undefined,
      fecha: toDate(data.fecha),
      contexto: (data.contexto as Medicion['contexto']) ?? 'proceso',
      tecnico: data.tecnico as string | undefined,
      valores,
      nota: data.nota as string | undefined,
      createdAt: toDate(data.createdAt),
    }
  })
  return rows.sort((a, b) => a.fecha.getTime() - b.fecha.getTime())
}

export async function addMedicion(entry: Omit<Medicion, 'id' | 'createdAt'>): Promise<void> {
  const id = generateId()
  const payload: Record<string, unknown> = {
    equipmentId: entry.equipmentId,
    fecha: Timestamp.fromDate(entry.fecha),
    contexto: entry.contexto,
    valores: entry.valores,
    createdAt: serverTimestamp(),
  }
  if (entry.hierarchyNodeId) payload.hierarchyNodeId = entry.hierarchyNodeId
  if (entry.tecnico) payload.tecnico = entry.tecnico
  if (entry.nota) payload.nota = entry.nota
  await setDoc(doc(db, COLLECTION, id), payload)
}
