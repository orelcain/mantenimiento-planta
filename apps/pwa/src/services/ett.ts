/**
 * Servicios Firestore para ETT (Especificaciones Técnicas del Trabajo)
 *
 * CRUD completo sobre la colección `ett`.
 *
 * El modelo de dominio usa `Date` para los timestamps, mientras que Firestore
 * usa `Timestamp`. Los helpers `toFirestoreData` / `fromFirestoreData` se
 * encargan de la conversión en ambos sentidos.
 */

import {
  collection,
  doc,
  getDocs,
  getDoc,
  setDoc,
  updateDoc,
  deleteDoc,
  query,
  where,
  orderBy,
  limit,
  Timestamp,
  QueryConstraint,
} from '@/services/firestoreTracked'
import { db } from '@/services/firebase'
import type { ETT, ETTCabecera, ETTEstado, ETTImagen } from '@/types'
import { logger } from '@/lib/logger'

const ETT_COLLECTION = 'ett'

// ============================================================================
// HELPERS DE CONVERSIÓN (Date ↔ Timestamp)
// ============================================================================

/** Convierte un Date a Timestamp de Firestore; null/undefined se mantienen. */
function dateToTs(d: Date | undefined | null): Timestamp | null {
  return d ? Timestamp.fromDate(d) : null
}

/** Convierte un Timestamp/objeto de Firestore a Date; null/undefined → undefined. */
function tsToDate(ts: unknown): Date | undefined {
  if (!ts) return undefined
  if (ts instanceof Date) return ts
  if (typeof (ts as Timestamp).toDate === 'function') {
    return (ts as Timestamp).toDate()
  }
  return undefined
}

/** Convierte la cabecera del modelo de dominio al formato Firestore. */
function cabeceraToFirestore(cab: ETTCabecera): Record<string, unknown> {
  return {
    ...cab,
    fecha_requerimiento: dateToTs(cab.fecha_requerimiento),
    fecha_inicio: dateToTs(cab.fecha_inicio),
    fecha_termino: dateToTs(cab.fecha_termino),
  }
}

/** Convierte la cabecera desde Firestore al modelo de dominio. */
function cabeceraFromFirestore(data: Record<string, unknown>): ETTCabecera {
  return {
    fecha_requerimiento: tsToDate(data.fecha_requerimiento) || new Date(),
    proyecto: (data.proyecto as string) || '',
    usuario_solicitante: (data.usuario_solicitante as string) || '',
    sector_realizacion: (data.sector_realizacion as string) || '',
    fecha_inicio: tsToDate(data.fecha_inicio),
    fecha_termino: tsToDate(data.fecha_termino),
    garantia_texto:
      (data.garantia_texto as string) || '06 (meses) Garantía Temporada Alta',
  }
}

/** Convierte imágenes del modelo al formato Firestore. */
function imagenesToFirestore(imagenes: ETTImagen[]): Record<string, unknown>[] {
  return (imagenes || []).map((img) => ({
    ...img,
    uploadedAt: dateToTs(img.uploadedAt),
  }))
}

/** Convierte imágenes desde Firestore al modelo. */
function imagenesFromFirestore(data: unknown): ETTImagen[] {
  if (!Array.isArray(data)) return []
  return data.map((img: Record<string, unknown>) => ({
    id: (img.id as string) || '',
    nombre: (img.nombre as string) || '',
    url: (img.url as string) || '',
    descripcion: img.descripcion as string | undefined,
    uploadedAt: tsToDate(img.uploadedAt) || new Date(),
  }))
}

/** Serializa una ETT completa al formato Firestore. */
function ettToFirestore(ett: Omit<ETT, 'id'>): Record<string, unknown> {
  return {
    cabecera: cabeceraToFirestore(ett.cabecera),
    area_intervencion: ett.area_intervencion,
    descripcion_trabajos: ett.descripcion_trabajos,
    responsabilidades_contratista: ett.responsabilidades_contratista,
    imagenes: imagenesToFirestore(ett.imagenes),
    estado: ett.estado,
    createdBy: ett.createdBy,
    createdAt: dateToTs(ett.createdAt),
    updatedAt: dateToTs(ett.updatedAt),
    aprobado_por: ett.aprobado_por || null,
    fecha_aprobacion: dateToTs(ett.fecha_aprobacion),
    origen: ett.origen || null,
    duplicado_de: ett.duplicado_de || null,
  }
}

/** Deserializa una ETT desde el formato Firestore al modelo de dominio. */
function ettFromFirestore(id: string, data: Record<string, unknown>): ETT {
  return {
    id,
    cabecera: cabeceraFromFirestore(
      (data.cabecera as Record<string, unknown>) || {},
    ),
    area_intervencion: (data.area_intervencion as string) || '',
    descripcion_trabajos: (data.descripcion_trabajos as ETT['descripcion_trabajos']) || [],
    responsabilidades_contratista:
      (data.responsabilidades_contratista as string[]) || [],
    imagenes: imagenesFromFirestore(data.imagenes),
    estado: ((data.estado as ETTEstado) || 'borrador') as ETTEstado,
    createdBy: (data.createdBy as string) || '',
    createdAt: tsToDate(data.createdAt) || new Date(),
    updatedAt: tsToDate(data.updatedAt) || new Date(),
    aprobado_por: data.aprobado_por as string | undefined,
    fecha_aprobacion: tsToDate(data.fecha_aprobacion),
    origen: data.origen as ETT['origen'],
    duplicado_de: data.duplicado_de as string | undefined,
  }
}

// ============================================================================
// CRUD
// ============================================================================

/** Crea una nueva ETT en Firestore. Devuelve el ID generado. */
export async function createETT(
  ett: Omit<ETT, 'id' | 'createdAt' | 'updatedAt'>,
): Promise<string> {
  try {
    const ettRef = doc(collection(db, ETT_COLLECTION))
    const now = new Date()

    const fullETT: Omit<ETT, 'id'> = {
      ...ett,
      createdAt: now,
      updatedAt: now,
    }

    await setDoc(ettRef, ettToFirestore(fullETT))
    logger.info('ETT created', { id: ettRef.id })
    return ettRef.id
  } catch (error) {
    logger.error(
      'Error creating ETT',
      error instanceof Error ? error : new Error(String(error)),
    )
    throw error
  }
}

/** Obtiene una ETT por ID. Devuelve `null` si no existe. */
export async function getETT(ettId: string): Promise<ETT | null> {
  try {
    const ettRef = doc(db, ETT_COLLECTION, ettId)
    const ettSnap = await getDoc(ettRef)

    if (!ettSnap.exists()) return null

    return ettFromFirestore(ettSnap.id, ettSnap.data() as Record<string, unknown>)
  } catch (error) {
    logger.error(
      'Error getting ETT',
      error instanceof Error ? error : new Error(String(error)),
    )
    throw error
  }
}

/** Lista ETTs con filtros opcionales. Ordenadas por createdAt descendente. */
export async function listETT(filters?: {
  createdBy?: string
  estado?: ETTEstado
  limit?: number
}): Promise<ETT[]> {
  try {
    const constraints: QueryConstraint[] = []

    if (filters?.createdBy) {
      constraints.push(where('createdBy', '==', filters.createdBy))
    }
    if (filters?.estado) {
      constraints.push(where('estado', '==', filters.estado))
    }
    constraints.push(orderBy('createdAt', 'desc'))
    if (filters?.limit) {
      constraints.push(limit(filters.limit))
    }

    const q = query(collection(db, ETT_COLLECTION), ...constraints)
    const snap = await getDocs(q)

    return snap.docs.map((d) =>
      ettFromFirestore(d.id, d.data() as Record<string, unknown>),
    )
  } catch (error) {
    logger.error(
      'Error listing ETT',
      error instanceof Error ? error : new Error(String(error)),
    )
    throw error
  }
}

/** Actualiza una ETT existente. El campo `updatedAt` se actualiza automáticamente. */
export async function updateETT(
  ettId: string,
  updates: Partial<Omit<ETT, 'id' | 'createdAt'>>,
): Promise<void> {
  try {
    const ettRef = doc(db, ETT_COLLECTION, ettId)

    // Construir el objeto de actualización convirtiendo solo los campos presentes
    const updateData: Record<string, unknown> = {
      updatedAt: Timestamp.fromDate(new Date()),
    }

    if (updates.cabecera) {
      updateData.cabecera = cabeceraToFirestore(updates.cabecera)
    }
    if (updates.area_intervencion !== undefined) {
      updateData.area_intervencion = updates.area_intervencion
    }
    if (updates.descripcion_trabajos) {
      updateData.descripcion_trabajos = updates.descripcion_trabajos
    }
    if (updates.responsabilidades_contratista) {
      updateData.responsabilidades_contratista = updates.responsabilidades_contratista
    }
    if (updates.imagenes) {
      updateData.imagenes = imagenesToFirestore(updates.imagenes)
    }
    if (updates.estado) {
      updateData.estado = updates.estado
    }
    if (updates.aprobado_por !== undefined) {
      updateData.aprobado_por = updates.aprobado_por
    }
    if (updates.fecha_aprobacion !== undefined) {
      updateData.fecha_aprobacion = dateToTs(updates.fecha_aprobacion)
    }

    await updateDoc(ettRef, updateData)
    logger.info('ETT updated', { id: ettId })
  } catch (error) {
    logger.error(
      'Error updating ETT',
      error instanceof Error ? error : new Error(String(error)),
    )
    throw error
  }
}

/** Cambia el estado de una ETT. */
export async function updateETTEstado(
  ettId: string,
  estado: ETTEstado,
): Promise<void> {
  await updateETT(ettId, { estado })
}

/** Aprueba una ETT (cambia estado a 'aprobada' y registra aprobador). */
export async function approveETT(ettId: string, approvedBy: string): Promise<void> {
  try {
    const ettRef = doc(db, ETT_COLLECTION, ettId)
    await updateDoc(ettRef, {
      estado: 'aprobada',
      aprobado_por: approvedBy,
      fecha_aprobacion: Timestamp.fromDate(new Date()),
      updatedAt: Timestamp.fromDate(new Date()),
    })
    logger.info('ETT approved', { id: ettId, approvedBy })
  } catch (error) {
    logger.error(
      'Error approving ETT',
      error instanceof Error ? error : new Error(String(error)),
    )
    throw error
  }
}

/** Elimina una ETT de Firestore. */
export async function deleteETT(ettId: string): Promise<void> {
  try {
    const ettRef = doc(db, ETT_COLLECTION, ettId)
    await deleteDoc(ettRef)
    logger.info('ETT deleted', { id: ettId })
  } catch (error) {
    logger.error(
      'Error deleting ETT',
      error instanceof Error ? error : new Error(String(error)),
    )
    throw error
  }
}

/**
 * Duplica una ETT existente creando una copia nueva en estado 'borrador'.
 * La copia conserva todos los datos de contenido pero resetea metadata.
 */
export async function duplicateETT(
  ettId: string,
  newCreatedBy: string,
): Promise<string> {
  try {
    const original = await getETT(ettId)
    if (!original) {
      throw new Error(`ETT no encontrada: ${ettId}`)
    }

    const copia: Omit<ETT, 'id' | 'createdAt' | 'updatedAt'> = {
      cabecera: {
        ...original.cabecera,
        fecha_requerimiento: new Date(),
        fecha_inicio: undefined,
        fecha_termino: undefined,
      },
      area_intervencion: original.area_intervencion,
      descripcion_trabajos: original.descripcion_trabajos,
      responsabilidades_contratista: original.responsabilidades_contratista,
      imagenes: [], // No duplicamos imágenes, usuario puede adjuntar nuevas
      estado: 'borrador',
      createdBy: newCreatedBy,
      origen: 'duplicado',
      duplicado_de: ettId,
    }

    return await createETT(copia)
  } catch (error) {
    logger.error(
      'Error duplicating ETT',
      error instanceof Error ? error : new Error(String(error)),
    )
    throw error
  }
}

/** Agrega una imagen al array de imágenes de una ETT existente. */
export async function addETTImagen(ettId: string, imagen: ETTImagen): Promise<void> {
  const ett = await getETT(ettId)
  if (!ett) throw new Error(`ETT no encontrada: ${ettId}`)
  await updateETT(ettId, { imagenes: [...ett.imagenes, imagen] })
}

/** Elimina una imagen del array de imágenes de una ETT existente. */
export async function removeETTImagen(ettId: string, imagenId: string): Promise<void> {
  const ett = await getETT(ettId)
  if (!ett) throw new Error(`ETT no encontrada: ${ettId}`)
  await updateETT(ettId, {
    imagenes: ett.imagenes.filter((img) => img.id !== imagenId),
  })
}
