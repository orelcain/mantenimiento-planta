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
  limit,
  onSnapshot,
  query,
  serverTimestamp,
  setDoc,
  where,
  type DocumentData,
  type QueryDocumentSnapshot,
} from 'firebase/firestore'
import { db } from '@/services/firebase'
import { BITACORA_COLECCION, BITACORA_PLANTA } from '@/config/bitacora'
import type { EventoRepeticion } from './repeticion'
import { logger } from '@/lib/logger'
import { fechaLocal } from '@/services/bitacora/turnoMantencion'
import type { EventoBitacora } from '@/services/bitacora/bitacora.types'
import type { Acr } from './acr.types'
import { MAX_IDS_POR_CONSULTA, trocear } from './acrLogica'

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

export function acrDesdeDoc(id: string, data: DocumentData): Acr {
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
 * Escucha los ACR de varios eventos a la vez (`array-contains-any`, en tandas de 30 ids, el
 * límite de Firestore). Entrega la lista unida, sin repetir un ACR que toca dos tandas.
 * Devuelve la función para dejar de escuchar todas las tandas.
 */
export function escucharAcrDeEventos(
  eventoIds: string[],
  alCambiar: (acrs: Acr[]) => void,
  alError?: () => void,
): () => void {
  const tandas = trocear(eventoIds, MAX_IDS_POR_CONSULTA)
  if (tandas.length === 0) {
    alCambiar([])
    return () => {}
  }
  const porTanda: Acr[][] = tandas.map(() => [])
  const emitir = () => {
    const unicos = new Map(porTanda.flat().map((a) => [a.id, a] as const))
    alCambiar([...unicos.values()])
  }
  const quitar = tandas.map((ids, i) => {
    const q = query(
      collection(db, ACR_COLECCION),
      where('plantId', '==', BITACORA_PLANTA.id),
      where('eventoBitacoraIds', 'array-contains-any', ids),
    )
    return onSnapshot(
      q,
      (snap) => {
        porTanda[i] = snap.docs.map(acrDeSnapshot)
        emitir()
      },
      (error) => {
        logger.error('No se pudo leer el análisis de causa raíz de la lista del turno', error, { tanda: i })
        alError?.()
      },
    )
  })
  return () => quitar.forEach((f) => f())
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

/** Tope de eventos por consulta: con 30 días de turnos sobra; evita una lectura desmedida. */
const TOPE_EVENTOS_RECIENTES = 1000

/**
 * Eventos de la Bitácora de los últimos `dias` días (hoy incluido), sin borradores. Un solo
 * `where` por rango de `fechaTurno`: no pide índice compuesto. Igual que `useHistorialBitacora`,
 * el `plantId` se filtra en el cliente.
 */
/** Minutos que se reutiliza la lectura de los eventos recientes: son hasta 1000 documentos. */
const MINUTOS_CACHE_RECIENTES = 15
let cacheRecientes: { dias: number; vence: number; lista: Promise<EventoRepeticion[]> } | null = null

/**
 * Igual que `listarEventosRecientes`, pero reutiliza la lectura durante 15 minutos: abrir la
 * Bitácora o cada evento no vuelve a leer los 30 días. Si la lectura falla, no se guarda.
 */
export function eventosRecientesConCache(dias: number): Promise<EventoRepeticion[]> {
  const ahora = Date.now()
  if (cacheRecientes && cacheRecientes.dias === dias && cacheRecientes.vence > ahora) return cacheRecientes.lista
  const lista = listarEventosRecientes(dias).catch((e: unknown) => {
    cacheRecientes = null
    throw e
  })
  cacheRecientes = { dias, vence: ahora + MINUTOS_CACHE_RECIENTES * 60_000, lista }
  return lista
}

export async function listarEventosRecientes(dias: number, hoy: Date = new Date()): Promise<EventoBitacora[]> {
  const desde = fechaLocal(new Date(hoy.getFullYear(), hoy.getMonth(), hoy.getDate() - dias))
  const snap = await getDocs(
    query(
      collection(db, BITACORA_COLECCION),
      where('fechaTurno', '>=', desde),
      where('fechaTurno', '<=', fechaLocal(hoy)),
      limit(TOPE_EVENTOS_RECIENTES),
    ),
  )
  return snap.docs
    .map((d) => ({ id: d.id, ...d.data() }) as EventoBitacora)
    .filter((e) => e.plantId === BITACORA_PLANTA.id && e.estado !== 'borrador')
}
