/**
 * Acceso a Firestore del ACR (colección `rootCauseAnalysis`, esquema v2).
 * Mismo estilo que la Bitácora (`hooks/useBitacoraTurno.ts`): `serverTimestamp()` para las
 * marcas de tiempo y lectura con `serverTimestamps: 'estimate'`.
 *
 * Reglas: `firestore.rules` → `isValidRootCauseAnalysis()`. Índice compuesto para
 * `listarAcrEnRango`: `firestore.indexes.json` (plantId + fechaTurno).
 */
import {
  collection,
  doc,
  getDocs,
  onSnapshot,
  query,
  serverTimestamp,
  setDoc,
  where,
  type DocumentData,
  type QueryDocumentSnapshot,
} from 'firebase/firestore'
import { db } from '@/services/firebase'
import { BITACORA_PLANTA } from '@/config/bitacora'
import { logger } from '@/lib/logger'
import type { Acr } from './acr.types'

export const ACR_COLECCION = 'rootCauseAnalysis'

export function nuevoIdAcr(): string {
  // Solo genera el id: no escribe nada ni necesita red.
  return doc(collection(db, ACR_COLECCION)).id
}

/** Timestamp de Firestore (o de la caché, con `serverTimestamps: 'estimate'`) → Date. */
function aFecha(v: unknown): Date {
  const conv = v as { toDate?: () => Date } | null | undefined
  return typeof conv?.toDate === 'function' ? conv.toDate() : new Date()
}

function acrDesdeDoc(id: string, data: DocumentData): Acr {
  return {
    ...(data as Omit<Acr, 'id' | 'createdAt' | 'updatedAt'>),
    id,
    createdAt: aFecha(data.createdAt),
    updatedAt: aFecha(data.updatedAt),
  }
}

function acrDeSnapshot(d: QueryDocumentSnapshot): Acr {
  return acrDesdeDoc(d.id, d.data({ serverTimestamps: 'estimate' }))
}

/**
 * Guarda el ACR completo. `updatedAt` siempre es del servidor; `createdAt` solo se pone al
 * crear. Se usa `merge` para que una actualización no borre `createdAt` (el documento
 * siempre viaja completo, así que el resultado es el mismo que un `set` entero).
 */
export async function guardarAcr(acr: Acr, esNuevo: boolean): Promise<void> {
  const { id, createdAt: _creado, updatedAt: _actualizado, ...cuerpo } = acr
  await setDoc(
    doc(db, ACR_COLECCION, id),
    {
      ...cuerpo,
      updatedAt: serverTimestamp(),
      ...(esNuevo ? { createdAt: serverTimestamp() } : {}),
    },
    { merge: true },
  )
}

/** Escucha los ACR de un evento de la Bitácora. Devuelve la función para dejar de escuchar. */
export function escucharAcrDeEvento(
  eventoId: string,
  cb: (acrs: Acr[]) => void,
  onError?: () => void,
): () => void {
  const q = query(
    collection(db, ACR_COLECCION),
    where('plantId', '==', BITACORA_PLANTA.id),
    where('eventoBitacoraIds', 'array-contains', eventoId),
  )
  return onSnapshot(
    q,
    (snap) => cb(snap.docs.map(acrDeSnapshot)),
    // Si la lectura falla no se llama a `cb`: así la pantalla no dice «Analizar causa» cuando
    // en realidad ya existe un análisis y se podría duplicar.
    (error) => {
      logger.error('No se pudo leer el análisis de causa raíz', error, { eventoId })
      onError?.()
    },
  )
}

/**
 * ACR cuyo turno cae en el rango (inclusive), de cualquier estado. Requiere el índice
 * compuesto (plantId, fechaTurno) de `firestore.indexes.json`.
 */
export async function listarAcrEnRango(start: string, end: string): Promise<Acr[]> {
  const q = query(
    collection(db, ACR_COLECCION),
    where('plantId', '==', BITACORA_PLANTA.id),
    where('fechaTurno', '>=', start),
    where('fechaTurno', '<=', end),
  )
  const snap = await getDocs(q)
  return snap.docs.map(acrDeSnapshot)
}
