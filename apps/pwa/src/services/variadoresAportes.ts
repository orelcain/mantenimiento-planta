/**
 * variadoresAportes — lo que el terreno le manda al catálogo de variadores.
 *
 * Por qué existe: los datos del catálogo viven en `@/data/variadores.ts`, o sea
 * en el repo, no en Firestore. Un técnico NO puede corregirlos desde el celular
 * — y tampoco debería: un dato que fija la protección térmica de un motor no se
 * cambia sin que alguien lo revise.
 *
 * Entonces esto no "edita" el catálogo: registra un APORTE. Alguien lo revisa y
 * lo incorpora al código. Mientras tanto el aporte queda visible en la ficha,
 * marcado como propuesto, para que el siguiente que pase ya lo tenga a mano
 * aunque todavía no esté oficializado.
 *
 * El caso más valioso no es corregir un dato malo: es rellenar uno de los 46
 * valores que hoy están «pendiente de placa». El mejor momento para capturarlos
 * es cuando el técnico está frente al motor con la placa a la vista.
 */
import {
  addDoc,
  collection,
  getDocs,
  limit,
  orderBy,
  query,
  serverTimestamp,
  where,
  type Timestamp,
} from 'firebase/firestore'
import { db } from './firebase'

export const APORTES_COLLECTION = 'variadoresAportes'

/** Qué se está aportando. */
export type TipoAporte =
  /** Rellenar un valor que estaba pendiente de placa. */
  | 'dato_faltante'
  /** El valor publicado no coincide con el equipo real. */
  | 'correccion'

export interface AporteVariador {
  id?: string
  tipo: TipoAporte
  /** id de la posición en POSICIONES (ej. 'filete-cinta'). */
  posicionId: string
  /** Nombre legible, para no depender del catálogo al listar los aportes. */
  posicionEquipo: string
  /** Código del parámetro: nCr, P-08, 1-24… */
  codigo: string
  /** Lo que el técnico leyó en la placa o en el equipo. */
  valor: string
  /** Lo que decía el catálogo cuando se hizo el aporte — para poder comparar. */
  valorAnterior?: string
  comentario?: string
  creadoPor: string
  creadoPorNombre?: string
  createdAt?: Timestamp
}

/** Registra un aporte. Requiere sesión: las reglas exigen que creadoPor sea el uid. */
export async function crearAporte(
  aporte: Omit<AporteVariador, 'id' | 'createdAt'>,
): Promise<string> {
  const ref = await addDoc(collection(db, APORTES_COLLECTION), {
    ...aporte,
    createdAt: serverTimestamp(),
  })
  return ref.id
}

/**
 * Aportes de una posición, del más nuevo al más viejo.
 * Falla en silencio (devuelve []) a propósito: si el técnico no tiene permiso o
 * está sin señal, la ficha tiene que seguir mostrando sus seteos igual. El
 * catálogo es lo importante; los aportes son un extra.
 */
export async function aportesDePosicion(posicionId: string): Promise<AporteVariador[]> {
  try {
    const q = query(
      collection(db, APORTES_COLLECTION),
      where('posicionId', '==', posicionId),
      orderBy('createdAt', 'desc'),
      limit(20),
    )
    const snap = await getDocs(q)
    return snap.docs.map((d) => ({ id: d.id, ...(d.data() as AporteVariador) }))
  } catch {
    return []
  }
}
