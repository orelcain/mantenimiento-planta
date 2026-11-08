/**
 * Lecturas por id para la página de un análisis (`/causa-raiz/:acrId`), la vista de PC.
 * La hoja del celular no las usa: recibe el ACR ya leído desde la franja del evento.
 */
import { doc, getDoc, onSnapshot } from 'firebase/firestore'
import { db } from '@/services/firebase'
import { logger } from '@/lib/logger'
import { BITACORA_COLECCION } from '@/config/bitacora'
import type { EventoBitacora } from '@/services/bitacora/bitacora.types'
import type { Acr } from './acr.types'
import { ACR_COLECCION, acrDesdeDoc } from './acrFirestore'

/** Escucha un ACR. `null` = el documento no existe; un error llama a `onError` y no a `cb`. */
export function escucharAcr(id: string, cb: (acr: Acr | null) => void, onError?: () => void): () => void {
  return onSnapshot(
    doc(db, ACR_COLECCION, id),
    (snap) => cb(snap.exists() ? acrDesdeDoc(snap.id, snap.data({ serverTimestamps: 'estimate' })) : null),
    (error) => {
      logger.error('No se pudo leer el análisis de causa raíz', error, { acrId: id })
      onError?.()
    },
  )
}

/** El evento de Bitácora del análisis: de él salen el enlace al turno y el editor. */
export async function leerEventoDeAcr(eventoId: string): Promise<EventoBitacora | null> {
  const snap = await getDoc(doc(db, BITACORA_COLECCION, eventoId))
  return snap.exists() ? ({ id: snap.id, ...snap.data() } as EventoBitacora) : null
}
