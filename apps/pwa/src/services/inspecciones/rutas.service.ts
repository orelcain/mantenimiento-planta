import { collection, doc, onSnapshot, orderBy, query, serverTimestamp, setDoc, where, type Timestamp } from 'firebase/firestore'
import { db } from '@/services/firebase'
import { RUTAS_CHONCHI } from './rutasChonchi'
import type { Recorrido, ResultadoEquipo, RutaInspeccion } from './modeloRuta'

/** Las rutas, editables: `rutasInspeccion/{rutaId}`. */
export const COLECCION_RUTAS = 'rutasInspeccion'
/**
 * Un paso por una ruta: `recorridos/{plantId}_{turnoId}_{rutaId}`.
 *
 * Id derivado, no aleatorio: si dos técnicos abren la misma ruta en el mismo turno trabajan
 * sobre EL MISMO documento en vez de crear dos recorridos que después nadie sabe cuál vale.
 */
export const COLECCION_RECORRIDOS = 'recorridos'

export const idDeRecorrido = (plantId: string, turnoId: string, rutaId: string) => `${plantId}_${turnoId}_${rutaId}`

export interface RecorridoGuardado extends Recorrido {
  actualizadoEn?: Timestamp | null
}

/**
 * Las rutas desde Firestore, con las del código como respaldo. Que exista el respaldo es lo que
 * hace que esto funcione el día uno sin sembrar nada.
 */
export function escucharRutas(alCambiar: (r: RutaInspeccion[]) => void): () => void {
  return onSnapshot(
    collection(db, COLECCION_RUTAS),
    (snap) => {
      const vivas = snap.docs
        .map((d) => d.data() as Partial<RutaInspeccion>)
        .filter((r): r is RutaInspeccion => !!r?.id && !!r.nombre && Array.isArray(r.equipos) && r.equipos.length > 0)
      alCambiar(vivas.length ? vivas : RUTAS_CHONCHI)
    },
    () => alCambiar(RUTAS_CHONCHI),
  )
}

/**
 * Los recorridos recientes de la planta, del más nuevo al más viejo.
 *
 * Se traen todos juntos y se reparten en el cliente —último por ruta, historia por equipo— en vez
 * de una consulta por ruta: son pocos documentos y así no hacen falta índices compuestos.
 */
export function escucharRecorridos(plantId: string, tope: number, alCambiar: (r: RecorridoGuardado[]) => void): () => void {
  return onSnapshot(
    query(collection(db, COLECCION_RECORRIDOS), where('plantId', '==', plantId), orderBy('iniciadoEn', 'desc')),
    (snap) => alCambiar(snap.docs.slice(0, tope).map((d) => ({ ...(d.data() as RecorridoGuardado), id: d.id }))),
    () => alCambiar([]),
  )
}

/** Abre el recorrido de una ruta en este turno. No pisa uno ya empezado. */
export async function iniciarRecorrido(base: Omit<Recorrido, 'id' | 'resultados' | 'cerradoEn'>): Promise<void> {
  const id = idDeRecorrido(base.plantId, base.turnoId, base.rutaId)
  await setDoc(
    doc(db, COLECCION_RECORRIDOS, id),
    { ...base, id, resultados: {}, cerradoEn: null, actualizadoEn: serverTimestamp() },
    { merge: true },
  )
}

/** Marca un equipo. `null` lo deja otra vez sin revisar. Guarda también CUÁNDO se marcó. */
export async function marcarEquipo(
  plantId: string,
  turnoId: string,
  rutaId: string,
  equipoId: string,
  resultado: ResultadoEquipo | null,
): Promise<void> {
  await setDoc(
    doc(db, COLECCION_RECORRIDOS, idDeRecorrido(plantId, turnoId, rutaId)),
    {
      resultados: { [equipoId]: resultado },
      marcas: { [equipoId]: resultado ? new Date().toISOString() : null },
      actualizadoEn: serverTimestamp(),
    },
    { merge: true },
  )
}

/** Lo que se vio y no amerita abrir un evento. Vacío la borra. */
export async function anotarEquipo(
  plantId: string,
  turnoId: string,
  rutaId: string,
  equipoId: string,
  nota: string,
): Promise<void> {
  await setDoc(
    doc(db, COLECCION_RECORRIDOS, idDeRecorrido(plantId, turnoId, rutaId)),
    { notas: { [equipoId]: nota.trim().slice(0, 300) || null }, actualizadoEn: serverTimestamp() },
    { merge: true },
  )
}

/**
 * Cierra el recorrido. `null` lo reabre.
 *
 * Cerrar no exige haberlo completado: una ruta entrega hallazgos, no una firma, y cuatro equipos
 * mirados valen cuatro veces más que cero.
 */
export async function cerrarRecorrido(plantId: string, turnoId: string, rutaId: string, cerrado: boolean): Promise<void> {
  await setDoc(
    doc(db, COLECCION_RECORRIDOS, idDeRecorrido(plantId, turnoId, rutaId)),
    { cerradoEn: cerrado ? new Date().toISOString() : null, actualizadoEn: serverTimestamp() },
    { merge: true },
  )
}
