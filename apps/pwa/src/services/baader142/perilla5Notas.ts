/**
 * baader142Notas — anotaciones del equipo sobre las figuras del manual.
 *
 * Qué resuelve: la herramienta guardaba las notas en el localStorage del teléfono,
 * así que lo que anotaba un técnico frente a la máquina no lo veía el del turno
 * siguiente. Acá viven compartidas: quien anota una cota medida en terreno o
 * fotografía cómo quedó una pieza, se lo deja al resto.
 *
 * La foto NO se guarda en el documento: va a Storage y en Firestore queda su URL.
 * Con la foto embebida en base64, traer las notas de todas las figuras costaría
 * decenas de MB; así cada doc pesa medio kilobyte y la foto se descarga solo al
 * abrirla.
 *
 * El iframe de la herramienta no hereda la sesión de Firebase (storage
 * particionado), por eso todo esto lo ejecuta la página React como PUENTE
 * — mismo patrón que PlanosAguasPage.
 */
import {
  addDoc,
  collection,
  deleteDoc,
  doc,
  getDocs,
  limit,
  orderBy,
  query,
  serverTimestamp,
  updateDoc,
  where,
  type Timestamp,
} from 'firebase/firestore'
import { ref as storageRef, uploadString, getDownloadURL, deleteObject } from 'firebase/storage'
import { db, storage } from '../firebase'

export const NOTAS_COLLECTION = 'baader142Notas'
export const NOTAS_STORAGE_PREFIX = 'baader142Notas'

export type TipoNota = 'nota' | 'cota' | 'foto'

export interface NotaFigura {
  id?: string
  plantId: string
  /** Clave de la figura: 'dib-30', 'tabla-ajustes', 'foto-prismas'… */
  figura: string
  tipo: TipoNota
  /** Posición relativa (0-1) sobre la figura: sobrevive a cualquier zoom o pantalla. */
  x: number
  y: number
  texto?: string
  /** URL de descarga en Storage; el doc nunca lleva la imagen. */
  fotoUrl?: string
  /** Path en Storage, para poder borrarla junto con la nota. */
  fotoPath?: string
  creadoPor: string
  creadoPorNombre?: string
  createdAt?: Timestamp
}

/** Path de Storage validado del lado del puente antes de subir. */
export function pathDeFoto(figura: string, uid: string): string {
  const safe = figura.replace(/[^A-Za-z0-9_-]/g, '')
  const stamp = `${Date.now()}_${Math.random().toString(36).slice(2, 8)}`
  return `${NOTAS_STORAGE_PREFIX}/${safe}/${uid}_${stamp}.webp`
}

/** Sube la foto de una nota y devuelve su URL pública de descarga. */
export async function subirFoto(dataUrl: string, path: string): Promise<string> {
  const r = storageRef(storage, path)
  await uploadString(r, dataUrl, 'data_url', { contentType: 'image/webp' })
  return getDownloadURL(r)
}

export async function crearNota(nota: Omit<NotaFigura, 'id' | 'createdAt'>): Promise<string> {
  const payload: Record<string, unknown> = {
    plantId: nota.plantId,
    figura: nota.figura,
    tipo: nota.tipo,
    x: nota.x,
    y: nota.y,
    creadoPor: nota.creadoPor,
    createdAt: serverTimestamp(),
  }
  if (nota.texto) payload.texto = nota.texto
  if (nota.fotoUrl) payload.fotoUrl = nota.fotoUrl
  if (nota.fotoPath) payload.fotoPath = nota.fotoPath
  if (nota.creadoPorNombre) payload.creadoPorNombre = nota.creadoPorNombre
  const ref = await addDoc(collection(db, NOTAS_COLLECTION), payload)
  return ref.id
}

export async function editarNota(
  id: string,
  cambios: Pick<NotaFigura, 'tipo' | 'texto'>,
): Promise<void> {
  await updateDoc(doc(db, NOTAS_COLLECTION, id), {
    tipo: cambios.tipo,
    texto: cambios.texto ?? '',
  })
}

/** Borra la nota y, si tenía foto, también el archivo de Storage. */
export async function borrarNota(id: string, fotoPath?: string): Promise<void> {
  await deleteDoc(doc(db, NOTAS_COLLECTION, id))
  if (fotoPath) {
    // Si el archivo ya no está, la nota igual se fue: no vale hacer fallar el borrado.
    await deleteObject(storageRef(storage, fotoPath)).catch(() => {})
  }
}

/**
 * Todas las notas de la planta, de la más vieja a la más nueva (así los pines
 * quedan numerados en el orden en que se anotaron).
 * Falla en silencio: sin señal o sin permiso, la herramienta sigue sirviendo
 * como manual; las notas son el extra.
 */
export async function listarNotas(plantId = 'chonchi', max = 500): Promise<NotaFigura[]> {
  try {
    const q = query(
      collection(db, NOTAS_COLLECTION),
      where('plantId', '==', plantId),
      orderBy('createdAt', 'asc'),
      limit(max),
    )
    const snap = await getDocs(q)
    return snap.docs.map((d) => ({ id: d.id, ...(d.data() as NotaFigura) }))
  } catch {
    return []
  }
}
