import {
  collection,
  doc,
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
 * Colección plana `tableros`. Circuitos y revisiones viven como arrays dentro del documento
 * (un tablero cabe holgado en el límite de 1MB). El levantamiento inicial se guarda como
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

// Listado completo (orden client-side por tag → sin índice compuesto).
export async function getTableros(): Promise<Tablero[]> {
  const snap = await getDocs(collection(db, COLLECTION))
  const tableros = snap.docs.map((d) => docToTablero(d.id, d.data() as Record<string, unknown>))
  return tableros.sort((a, b) => a.tag.localeCompare(b.tag))
}

export type TableroInput = Omit<Tablero, 'id' | 'createdAt' | 'updatedAt' | 'revisiones'>

// Crea un tablero y siembra la Revisión 0 (as-found) → punto cero del histórico.
export async function createTablero(
  input: TableroInput,
  opts?: { autor?: string; descripcionInicial?: string }
): Promise<string> {
  const id = generateId()
  const revision0 = nuevaRevision(
    'as-found',
    opts?.descripcionInicial?.trim() || 'Levantamiento inicial (as-found)',
    opts?.autor
  )
  const payload = stripUndefined({
    ...input,
    revisiones: [revision0],
    ...(opts?.autor ? { createdBy: opts.autor } : {}),
  })
  await setDoc(doc(db, COLLECTION, id), {
    ...payload,
    createdAt: serverTimestamp(),
    updatedAt: serverTimestamp(),
  })
  return id
}

// Actualiza campos del tablero (sin tocar createdAt).
export async function updateTablero(id: string, patch: Partial<TableroInput & { revisiones: RevisionTablero[] }>): Promise<void> {
  const clean = stripUndefined(patch)
  await updateDoc(doc(db, COLLECTION, id), {
    ...clean,
    updatedAt: serverTimestamp(),
  })
}

// Agrega una revisión al histórico (append-only) preservando el orden existente.
export async function addRevision(
  tablero: Tablero,
  rev: RevisionTablero
): Promise<void> {
  await updateTablero(tablero.id, { revisiones: [...tablero.revisiones, rev] })
}

export async function deleteTablero(id: string): Promise<void> {
  await deleteDoc(doc(db, COLLECTION, id))
}
