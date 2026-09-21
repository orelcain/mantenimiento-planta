import { collection, doc, onSnapshot, query, serverTimestamp, setDoc, where, type Timestamp } from 'firebase/firestore'
import { db } from '@/services/firebase'
import { BITACORA_COLECCION } from '@/config/bitacora'
import type { EventoBitacora } from '@/services/bitacora/bitacora.types'
import { PAUTA_POST_ASEO, type Inspeccion, type Liberacion, type PautaInspeccion, type ResultadoCriterio } from './modeloInspeccion'

/**
 * Una inspección por turno: `inspecciones/{plantId}_{turnoId}`. Id derivado, no aleatorio —
 * así dos técnicos que la abran a la vez trabajan sobre el MISMO documento en vez de crear dos.
 */
export const COLECCION_INSPECCIONES = 'inspecciones'
/** La pauta, editable: `pautasInspeccion/{pautaId}`. */
export const COLECCION_PAUTAS = 'pautasInspeccion'

export const idDeInspeccion = (plantId: string, turnoId: string) => `${plantId}_${turnoId}`

export interface InspeccionGuardada extends Inspeccion {
  actualizadoEn?: Timestamp | null
}

/**
 * La pauta desde Firestore, con la del código como respaldo. Que exista el respaldo es lo que
 * hace que esto funcione el día uno, sin sembrar nada: se edita después si hace falta.
 */
export function escucharPauta(pautaId: string, alCambiar: (p: PautaInspeccion) => void): () => void {
  return onSnapshot(
    doc(db, COLECCION_PAUTAS, pautaId),
    (snap) => {
      const d = snap.data() as Partial<PautaInspeccion> | undefined
      if (!snap.exists() || !Array.isArray(d?.criterios) || !d.criterios.length) {
        alCambiar(PAUTA_POST_ASEO)
        return
      }
      alCambiar({
        id: pautaId,
        nombre: d.nombre ?? PAUTA_POST_ASEO.nombre,
        version: typeof d.version === 'number' ? d.version : 1,
        criterios: d.criterios.map((c) => ({ id: c.id, titulo: c.titulo, ayuda: c.ayuda ?? '' })),
      })
    },
    // Sin permisos o sin red: la del código igual deja trabajar.
    () => alCambiar(PAUTA_POST_ASEO),
  )
}

/** La inspección de un turno; `null` mientras no exista. */
export function escucharInspeccion(
  plantId: string,
  turnoId: string,
  alCambiar: (i: InspeccionGuardada | null) => void,
): () => void {
  return onSnapshot(
    doc(db, COLECCION_INSPECCIONES, idDeInspeccion(plantId, turnoId)),
    (snap) => {
      if (!snap.exists()) {
        alCambiar(null)
        return
      }
      const d = snap.data() as Partial<InspeccionGuardada>
      alCambiar({
        id: snap.id,
        plantId: d.plantId ?? plantId,
        turnoId: d.turnoId ?? turnoId,
        fechaTurno: d.fechaTurno ?? '',
        banda: d.banda ?? '',
        pautaId: d.pautaId ?? PAUTA_POST_ASEO.id,
        pautaVersion: d.pautaVersion ?? 1,
        iniciadaEn: d.iniciadaEn ?? '',
        iniciadaPorNombre: d.iniciadaPorNombre ?? '',
        resultados: d.resultados ?? {},
        notas: d.notas ?? {},
        marcas: d.marcas ?? {},
        liberacion: d.liberacion ?? null,
        actualizadoEn: d.actualizadoEn ?? null,
      })
    },
    () => alCambiar(null),
  )
}

/** Abre la inspección del turno. No pisa una ya empezada. */
export async function iniciarInspeccion(base: Omit<Inspeccion, 'id' | 'resultados' | 'liberacion'>): Promise<void> {
  const id = idDeInspeccion(base.plantId, base.turnoId)
  await setDoc(
    doc(db, COLECCION_INSPECCIONES, id),
    { ...base, id, resultados: {}, liberacion: null, actualizadoEn: serverTimestamp() },
    // `merge` para que dos técnicos a la vez no se borren los resultados del otro.
    { merge: true },
  )
}

/**
 * Marca un punto de la pauta. `null` lo deja otra vez sin revisar.
 *
 * Guarda también CUÁNDO se marcó: siete marcas repartidas en media hora son un recorrido,
 * siete en el mismo minuto son una firma de un tirón. No se le pide nada al técnico.
 */
export async function marcarCriterio(
  plantId: string,
  turnoId: string,
  criterioId: string,
  resultado: ResultadoCriterio | null,
): Promise<void> {
  await setDoc(
    doc(db, COLECCION_INSPECCIONES, idDeInspeccion(plantId, turnoId)),
    // Campo anidado: el merge de Firestore no pisa los demás resultados.
    {
      resultados: { [criterioId]: resultado },
      marcas: { [criterioId]: resultado ? new Date().toISOString() : null },
      actualizadoEn: serverTimestamp(),
    },
    { merge: true },
  )
}

/** «Conforme, pero…»: lo menor que no amerita abrir una desviación. Vacío la borra. */
export async function anotarCriterio(plantId: string, turnoId: string, criterioId: string, nota: string): Promise<void> {
  await setDoc(
    doc(db, COLECCION_INSPECCIONES, idDeInspeccion(plantId, turnoId)),
    { notas: { [criterioId]: nota.trim().slice(0, 300) || null }, actualizadoEn: serverTimestamp() },
    { merge: true },
  )
}

/**
 * Las desviaciones de una inspección, buscadas por la INSPECCIÓN y no por el turno.
 *
 * ⚠ Filtrarlas entre los eventos del turno parecía equivalente y no lo es: un evento se puede
 * mover de turno (se anotó en el equivocado), y al moverlo desaparecía del registro §8 sin que
 * nadie se enterara — el informe quedaba incompleto en silencio.
 */
export function escucharDesviaciones(inspeccionId: string, alCambiar: (e: EventoBitacora[]) => void): () => void {
  return onSnapshot(
    query(collection(db, BITACORA_COLECCION), where('inspeccion.id', '==', inspeccionId)),
    (snap) => alCambiar(snap.docs.map((d) => ({ ...(d.data() as EventoBitacora), id: d.id }))),
    () => alCambiar([]),
  )
}

/** Entrega la planta. `null` deshace la entrega (se volvió a encontrar algo). */
export async function liberarPlanta(plantId: string, turnoId: string, liberacion: Liberacion | null): Promise<void> {
  await setDoc(
    doc(db, COLECCION_INSPECCIONES, idDeInspeccion(plantId, turnoId)),
    { liberacion, actualizadoEn: serverTimestamp() },
    { merge: true },
  )
}
