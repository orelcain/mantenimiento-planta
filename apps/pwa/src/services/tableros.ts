import {
  collection,
  doc,
  getDoc,
  setDoc,
  updateDoc,
  deleteDoc,
  getDocs,
  serverTimestamp,
  Timestamp,
} from '@/services/firestoreTracked'
import { db } from './firebase'
import { generateId } from '@/lib/utils'
import type { RevisionTablero, Tablero, TipoRevision } from '@/types/tableros'

/**
 * Servicio del levantamiento de tableros eléctricos (Centro Técnico Documental / NFPA 70B).
 * El tablero ES un equipo: el documento vive en la colección `tableros` con **doc id = equipmentId**
 * (1:1), de modo que el levantamiento es una sección del expediente del equipo (no un módulo aparte).
 * Circuitos y revisiones viven como arrays dentro del doc. El levantamiento inicial se guarda como
 * Revisión 0 (as-found). Ver docs/LEVANTAMIENTO_TABLEROS.md.
 */

const COLLECTION = 'tableros'

function toDate(v: unknown): Date {
  if (v instanceof Timestamp) return v.toDate()
  if (v instanceof Date) return v
  return new Date()
}

// Firestore rechaza `undefined`; limpiamos recursivamente antes de escribir.
function stripUndefined<T>(value: T): T {
  if (Array.isArray(value)) return value.map((v) => stripUndefined(v)) as unknown as T
  if (value && typeof value === 'object' && !(value instanceof Date)) {
    const out: Record<string, unknown> = {}
    for (const [k, v] of Object.entries(value as Record<string, unknown>)) {
      if (v === undefined) continue
      out[k] = stripUndefined(v)
    }
    return out as T
  }
  return value
}

function docToTablero(id: string, data: Record<string, unknown>): Tablero {
  return {
    id,
    equipmentId: (data.equipmentId as string | undefined) ?? id,
    tag: String(data.tag ?? ''),
    nombre: String(data.nombre ?? ''),
    tipo: (data.tipo as Tablero['tipo']) ?? 'otro',
    hierarchyNodeId: data.hierarchyNodeId as string | undefined,
    areaNombre: data.areaNombre as string | undefined,
    ubicacionFisica: data.ubicacionFisica as string | undefined,
    tensionV: data.tensionV as number | undefined,
    fases: data.fases as Tablero['fases'],
    iccDisponibleKA: data.iccDisponibleKA as number | undefined,
    alimentadoDesde: data.alimentadoDesde as string | undefined,
    principal: data.principal as Tablero['principal'],
    barraTensionV: data.barraTensionV as number | undefined,
    barraCorrienteA: data.barraCorrienteA as number | undefined,
    condicionGeneral: (data.condicionGeneral as Tablero['condicionGeneral']) ?? 1,
    circuitos: Array.isArray(data.circuitos) ? (data.circuitos as Tablero['circuitos']) : [],
    revisiones: Array.isArray(data.revisiones) ? (data.revisiones as Tablero['revisiones']) : [],
    fotos: Array.isArray(data.fotos) ? (data.fotos as string[]) : undefined,
    observaciones: data.observaciones as string | undefined,
    createdAt: toDate(data.createdAt),
    updatedAt: toDate(data.updatedAt),
    createdBy: data.createdBy as string | undefined,
  }
}

export function nuevaRevision(tipo: TipoRevision, descripcion: string, autor?: string): RevisionTablero {
  return {
    id: generateId(),
    fecha: new Date().toISOString(),
    tipo,
    descripcion,
    ...(autor ? { autor } : {}),
  }
}

// Datos del levantamiento (sin las claves que maneja el servicio).
export type TableroInput = Omit<Tablero, 'id' | 'equipmentId' | 'createdAt' | 'updatedAt' | 'revisiones'>

// Listado completo (para un filtro "Tableros" en Equipos). Orden client-side por tag.
export async function getTableros(): Promise<Tablero[]> {
  const snap = await getDocs(collection(db, COLLECTION))
  const tableros = snap.docs.map((d) => docToTablero(d.id, d.data() as Record<string, unknown>))
  return tableros.sort((a, b) => a.tag.localeCompare(b.tag))
}

// El levantamiento de un equipo (doc id = equipmentId), o null si aún no se levantó.
export async function getTableroByEquipment(equipmentId: string): Promise<Tablero | null> {
  const snap = await getDoc(doc(db, COLLECTION, equipmentId))
  if (!snap.exists()) return null
  return docToTablero(snap.id, snap.data() as Record<string, unknown>)
}

/**
 * Crea o actualiza el levantamiento de un equipo. La primera vez siembra la Revisión 0 (as-found)
 * → punto cero del histórico. En ediciones, si se pasa `revisionNota`, agrega una revisión "cambio".
 */
export async function saveTableroForEquipment(
  equipmentId: string,
  input: TableroInput,
  opts?: { autor?: string; revisionNota?: string }
): Promise<void> {
  const ref = doc(db, COLLECTION, equipmentId)
  const existing = await getDoc(ref)
  if (!existing.exists()) {
    const revision0 = nuevaRevision('as-found', 'Levantamiento inicial (as-found)', opts?.autor)
    const payload = stripUndefined({
      ...input,
      equipmentId,
      revisiones: [revision0],
      ...(opts?.autor ? { createdBy: opts.autor } : {}),
    })
    await setDoc(ref, { ...payload, createdAt: serverTimestamp(), updatedAt: serverTimestamp() })
  } else {
    const prev = docToTablero(existing.id, existing.data() as Record<string, unknown>)
    const revisiones = [...prev.revisiones]
    if (opts?.revisionNota?.trim()) {
      revisiones.push(nuevaRevision('cambio', opts.revisionNota.trim(), opts?.autor))
    }
    const payload = stripUndefined({ ...input, equipmentId, revisiones })
    await updateDoc(ref, { ...payload, updatedAt: serverTimestamp() })
  }
}

export async function deleteTablero(equipmentId: string): Promise<void> {
  await deleteDoc(doc(db, COLLECTION, equipmentId))
}
