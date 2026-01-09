import {
  collection,
  doc,
  getDoc,
  getDocs,
  setDoc,
  updateDoc,
  deleteDoc,
  deleteField,
  query,
  where,
  orderBy,
  onSnapshot,
  serverTimestamp,
  Timestamp,
  QueryConstraint,
} from 'firebase/firestore'
import {
  ref,
  uploadBytes,
  getDownloadURL,
  deleteObject,
} from 'firebase/storage'
import { db, storage } from './firebase'
import type { PhotoEvidence, PhotoItem, PhotoEvidenceStatus, PhotoComparison, PhotoPairMeta } from '@/types'
import { generateId } from '@/lib/utils'
import { compressImage } from './storage'
import { logger } from '@/lib/logger'

const COLLECTION = 'photoEvidence'

function stripUndefined(value: unknown): unknown {
  if (value === undefined) return undefined
  if (value === null) return null

  if (Array.isArray(value)) {
    const mapped = value
      .map((item) => stripUndefined(item))
      .filter((item) => item !== undefined)
    return mapped
  }

  if (value instanceof Date) return value

  if (typeof value === 'object') {
    const record = value as Record<string, unknown>
    const result: Record<string, unknown> = {}
    for (const [key, val] of Object.entries(record)) {
      const cleaned = stripUndefined(val)
      if (cleaned !== undefined) result[key] = cleaned
    }
    return result
  }

  return value
}

function toDateSafe(value: unknown): Date | undefined {
  if (!value) return undefined

  if (value instanceof Date) {
    return Number.isNaN(value.getTime()) ? undefined : value
  }

  if (value instanceof Timestamp) return value.toDate()

  if (typeof value === 'object') {
    const maybe = value as { seconds?: unknown; nanoseconds?: unknown }
    if (typeof maybe.seconds === 'number') {
      const nanos = typeof maybe.nanoseconds === 'number' ? maybe.nanoseconds : 0
      try {
        return new Timestamp(maybe.seconds, nanos).toDate()
      } catch {
        return undefined
      }
    }
  }

  if (typeof value === 'number' || typeof value === 'string') {
    const date = new Date(value)
    return Number.isNaN(date.getTime()) ? undefined : date
  }

  return undefined
}

// ========== FUNCIONES DE STORAGE ==========

// Subir foto de evidencia (before o after)
export async function uploadEvidencePhoto(
  evidenceId: string,
  file: File,
  type: 'before' | 'after'
): Promise<{ id: string; url: string }> {
  logger.info('Uploading evidence photo', { evidenceId, type, fileSize: file.size })

  try {
    // Comprimir imagen si es mayor a 1MB
    const fileToUpload = file.size > 1024 * 1024
      ? await compressImage(file, 1920, 0.8, true)
      : file

    const photoId = generateId()
    const fileExtension =
      fileToUpload.name.split('.').pop() ||
      (fileToUpload.type === 'image/webp' ? 'webp' : 'jpg')
    const fileName = `${photoId}.${fileExtension}`
    const storageRef = ref(storage, `evidence/${evidenceId}/${type}/${fileName}`)
    
    await uploadBytes(storageRef, fileToUpload, {
      contentType: fileToUpload.type || 'image/jpeg',
    })
    const url = await getDownloadURL(storageRef)
    
    logger.info('Evidence photo uploaded successfully', { evidenceId, photoId, type })
    return { id: photoId, url }
  } catch (error) {
    logger.error('Error uploading evidence photo', error as Error, { evidenceId, type })
    throw error
  }
}

// Subir múltiples fotos
export async function uploadMultipleEvidencePhotos(
  evidenceId: string,
  files: File[],
  type: 'before' | 'after'
): Promise<{ id: string; url: string }[]> {
  const results: { id: string; url: string }[] = []
  
  for (const file of files) {
    const result = await uploadEvidencePhoto(evidenceId, file, type)
    results.push(result)
  }
  
  return results
}

// Eliminar foto de evidencia
export async function deleteEvidencePhoto(
  evidenceId: string,
  photoId: string,
  type: 'before' | 'after',
  url: string
): Promise<void> {
  try {
    const storageRef = ref(storage, url)
    await deleteObject(storageRef)
    logger.info('Evidence photo deleted', { evidenceId, photoId, type })
  } catch (error) {
    logger.error('Error deleting evidence photo', error as Error, { evidenceId, photoId })
    throw error
  }
}

// ========== FUNCIONES DE FIRESTORE ==========

// Helper para parsear documentos de Firestore
function parseEvidenceDoc(doc: any): PhotoEvidence {
  const data = doc.data()
  const createdAt = toDateSafe(data.createdAt) ?? new Date()
  const updatedAt = toDateSafe(data.updatedAt) ?? createdAt
  return {
    ...data,
    id: doc.id,
    createdAt,
    updatedAt,
    corregidaAt: toDateSafe(data.corregidaAt),
    verificadaAt: toDateSafe(data.verificadaAt),
    pairMeta: Array.isArray(data.pairMeta) ? data.pairMeta : [],
    fotosBefore: (data.fotosBefore || []).map((f: any) => ({
      ...f,
      timestamp: toDateSafe(f.timestamp) ?? createdAt,
    })),
    fotosAfter: (data.fotosAfter || []).map((f: any) => ({
      ...f,
      timestamp: toDateSafe(f.timestamp) ?? createdAt,
    })),
  }
}

// Crear nueva evidencia fotográfica
export async function createPhotoEvidence(
  data: Omit<PhotoEvidence, 'id' | 'createdAt' | 'updatedAt' | 'fotosAfter'>
): Promise<PhotoEvidence> {
  const id = generateId()
  const now = new Date()
  
  const evidence: PhotoEvidence = {
    ...data,
    id,
    fotosAfter: [],
    pairMeta: [],
    status: 'pendiente',
    createdAt: now,
    updatedAt: now,
  }

  await setDoc(
    doc(db, COLLECTION, id),
    stripUndefined({
      ...evidence,
      createdAt: serverTimestamp(),
      updatedAt: serverTimestamp(),
    }) as Record<string, unknown>
  )

  logger.info('Photo evidence created', { id, titulo: data.titulo })
  return evidence
}

// Obtener evidencia por ID
export async function getPhotoEvidenceById(id: string): Promise<PhotoEvidence | null> {
  const docRef = doc(db, COLLECTION, id)
  const docSnap = await getDoc(docRef)
  
  if (!docSnap.exists()) {
    return null
  }

  return parseEvidenceDoc(docSnap)
}

// Obtener todas las evidencias con filtros opcionales
export async function getPhotoEvidences(filters?: {
  status?: PhotoEvidenceStatus
  hierarchyNodeId?: string
  reportadoPor?: string
}): Promise<PhotoEvidence[]> {
  const constraints: QueryConstraint[] = []

  if (filters?.status) {
    constraints.push(where('status', '==', filters.status))
  }
  if (filters?.hierarchyNodeId) {
    constraints.push(where('hierarchyNodeId', '==', filters.hierarchyNodeId))
  }
  if (filters?.reportadoPor) {
    constraints.push(where('reportadoPor', '==', filters.reportadoPor))
  }

  constraints.push(orderBy('createdAt', 'desc'))

  const q = query(collection(db, COLLECTION), ...constraints)
  const snapshot = await getDocs(q)

  return snapshot.docs.map(parseEvidenceDoc)
}

// Suscribirse a cambios en tiempo real
export function subscribeToPhotoEvidences(
  callback: (evidences: PhotoEvidence[]) => void,
  filters?: { status?: PhotoEvidenceStatus }
): () => void {
  const constraints: QueryConstraint[] = []

  if (filters?.status) {
    constraints.push(where('status', '==', filters.status))
  }

  constraints.push(orderBy('createdAt', 'desc'))

  const q = query(collection(db, COLLECTION), ...constraints)
  
  return onSnapshot(q, (snapshot) => {
    const evidences = snapshot.docs.map(parseEvidenceDoc)
    callback(evidences)
  })
}

// Actualizar evidencia
export async function updatePhotoEvidence(
  id: string,
  data: Partial<Omit<PhotoEvidence, 'id' | 'createdAt'>>
): Promise<void> {
  const docRef = doc(db, COLLECTION, id)
  await updateDoc(
    docRef,
    stripUndefined({
      ...data,
      updatedAt: serverTimestamp(),
    }) as Record<string, unknown>
  )
  
  logger.info('Photo evidence updated', { id })
}

// Agregar foto "antes"
export async function addBeforePhoto(
  evidenceId: string,
  photo: PhotoItem
): Promise<void> {
  const evidence = await getPhotoEvidenceById(evidenceId)
  if (!evidence) throw new Error('Evidencia no encontrada')

  const updatedFotos = [...evidence.fotosBefore, photo]
  await updatePhotoEvidence(evidenceId, { fotosBefore: updatedFotos })
}

// Agregar foto "después"
export async function addAfterPhoto(
  evidenceId: string,
  photo: PhotoItem,
  userId: string
): Promise<void> {
  const evidence = await getPhotoEvidenceById(evidenceId)
  if (!evidence) throw new Error('Evidencia no encontrada')

  const updatedFotos = [...evidence.fotosAfter, photo]
  const newStatus: PhotoEvidenceStatus = 'corregida'
  
  await updatePhotoEvidence(evidenceId, {
    fotosAfter: updatedFotos,
    status: newStatus,
    corregidoPor: userId,
    corregidaAt: new Date(),
  })
}

// Eliminar foto
export async function removePhoto(
  evidenceId: string,
  photoId: string,
  type: 'before' | 'after'
): Promise<void> {
  const evidence = await getPhotoEvidenceById(evidenceId)
  if (!evidence) throw new Error('Evidencia no encontrada')

  const fotos = type === 'before' ? evidence.fotosBefore : evidence.fotosAfter
  const photoToDelete = fotos.find(f => f.id === photoId)
  
  if (photoToDelete) {
    // Eliminar de storage
    await deleteEvidencePhoto(evidenceId, photoId, type, photoToDelete.url)
    
    // Actualizar documento
    const updatedFotos = fotos.filter(f => f.id !== photoId)
    if (type === 'before') {
      await updatePhotoEvidence(evidenceId, { fotosBefore: updatedFotos })
    } else {
      await updatePhotoEvidence(evidenceId, { fotosAfter: updatedFotos })
    }
  }
}

export async function upsertEvidencePhotoAtIndex(
  evidenceId: string,
  pairIndex: number,
  type: 'before' | 'after',
  file: File,
  userId?: string
): Promise<void> {
  const evidence = await getPhotoEvidenceById(evidenceId)
  if (!evidence) throw new Error('Evidencia no encontrada')

  const fotos = type === 'before' ? evidence.fotosBefore : evidence.fotosAfter

  // Evitar "huecos" en arrays (Firestore no permite undefined)
  if (pairIndex > fotos.length) {
    throw new Error('No se puede guardar este par sin completar los anteriores')
  }

  const current = fotos[pairIndex]
  if (current) {
    try {
      await deleteEvidencePhoto(evidenceId, current.id, type, current.url)
    } catch (e) {
      logger.warn('Error deleting previous photo on upsert', { evidenceId, type, photoId: current.id })
    }
  }

  const uploaded = await uploadMultipleEvidencePhotos(evidenceId, [file], type)
  const first = uploaded[0]
  if (!first) throw new Error('No se pudo subir la foto')

  const newItem: PhotoItem = {
    id: first.id,
    url: first.url,
    timestamp: new Date(),
  }

  const updatedFotos = [...fotos]
  if (pairIndex === fotos.length) {
    updatedFotos.push(newItem)
  } else {
    updatedFotos[pairIndex] = newItem
  }

  if (type === 'before') {
    await updatePhotoEvidence(evidenceId, { fotosBefore: updatedFotos })
  } else {
    await updatePhotoEvidence(evidenceId, {
      fotosAfter: updatedFotos,
      status: 'corregida',
      corregidoPor: userId,
      corregidaAt: new Date(),
    })
  }
}

export async function deleteEvidencePair(
  evidenceId: string,
  pairIndex: number
): Promise<void> {
  const evidence = await getPhotoEvidenceById(evidenceId)
  if (!evidence) throw new Error('Evidencia no encontrada')

  const before = evidence.fotosBefore[pairIndex]
  const after = evidence.fotosAfter[pairIndex]

  if (before) {
    try {
      await deleteEvidencePhoto(evidenceId, before.id, 'before', before.url)
    } catch (e) {
      logger.warn('Error deleting before photo for pair deletion', { evidenceId, photoId: before.id })
    }
  }
  if (after) {
    try {
      await deleteEvidencePhoto(evidenceId, after.id, 'after', after.url)
    } catch (e) {
      logger.warn('Error deleting after photo for pair deletion', { evidenceId, photoId: after.id })
    }
  }

  const fotosBefore = evidence.fotosBefore.filter((_, i) => i !== pairIndex)
  const fotosAfter = evidence.fotosAfter.filter((_, i) => i !== pairIndex)
  const pairMeta = (evidence.pairMeta || []).filter((_, i) => i !== pairIndex)

  await updatePhotoEvidence(evidenceId, {
    fotosBefore,
    fotosAfter,
    pairMeta,
  })
}

// Marcar como corregida
export async function markAsCorrected(
  evidenceId: string,
  userId: string
): Promise<void> {
  await updatePhotoEvidence(evidenceId, {
    status: 'corregida',
    corregidoPor: userId,
    corregidaAt: new Date(),
  })
}

// Marcar como verificada
export async function markAsVerified(
  evidenceId: string,
  userId: string
): Promise<void> {
  await updatePhotoEvidence(evidenceId, {
    status: 'verificada',
    verificadoPor: userId,
    verificadaAt: new Date(),
  })
}

// Quitar verificación (volver a corregida para permitir ajustes)
export async function unmarkAsVerified(
  evidenceId: string
): Promise<void> {
  await updateDoc(doc(db, COLLECTION, evidenceId), {
    status: 'corregida',
    verificadoPor: deleteField(),
    verificadaAt: deleteField(),
    updatedAt: serverTimestamp(),
  })
}

// Cambiar a en proceso
export async function markAsInProgress(
  evidenceId: string
): Promise<void> {
  await updatePhotoEvidence(evidenceId, {
    status: 'en_proceso',
  })
}

// Eliminar evidencia completa
export async function deletePhotoEvidence(id: string): Promise<void> {
  const evidence = await getPhotoEvidenceById(id)
  if (!evidence) return

  // Eliminar todas las fotos de storage
  for (const photo of evidence.fotosBefore) {
    try {
      await deleteEvidencePhoto(id, photo.id, 'before', photo.url)
    } catch (e) {
      logger.warn('Error deleting before photo', { photoId: photo.id })
    }
  }
  for (const photo of evidence.fotosAfter) {
    try {
      await deleteEvidencePhoto(id, photo.id, 'after', photo.url)
    } catch (e) {
      logger.warn('Error deleting after photo', { photoId: photo.id })
    }
  }

  // Eliminar documento
  await deleteDoc(doc(db, COLLECTION, id))
  logger.info('Photo evidence deleted', { id })
}

// Preparar datos para exportación PDF
export function prepareComparisonForExport(evidence: PhotoEvidence): PhotoComparison[] {
  const comparisons: PhotoComparison[] = []
  
  // Emparejar fotos before con after por índice
  const maxLen = Math.max(evidence.fotosBefore.length, evidence.fotosAfter.length)
  
  for (let i = 0; i < maxLen; i++) {
    const before = evidence.fotosBefore[i]
    const after = evidence.fotosAfter[i]
    const meta = evidence.pairMeta?.[i]
    
    if (before && after) {
      comparisons.push({
        evidenceId: evidence.id,
        titulo: evidence.titulo,
        ubicacion: meta?.ubicacion || evidence.hierarchyPath,
        before,
        after,
        descripcion: meta?.descripcion || evidence.descripcion,
      })
    }
  }
  
  return comparisons
}

export async function updatePhotoEvidencePairMeta(
  evidenceId: string,
  pairIndex: number,
  meta: PhotoPairMeta
): Promise<void> {
  const evidence = await getPhotoEvidenceById(evidenceId)
  if (!evidence) throw new Error('Evidencia no encontrada')

  const current = Array.isArray(evidence.pairMeta) ? [...evidence.pairMeta] : []
  current[pairIndex] = {
    ...(current[pairIndex] || {}),
    ...meta,
  }

  await updatePhotoEvidence(evidenceId, { pairMeta: current })
}

// Obtener estadísticas
export async function getPhotoEvidenceStats(): Promise<{
  total: number
  pendientes: number
  enProceso: number
  corregidas: number
  verificadas: number
}> {
  const evidences = await getPhotoEvidences()
  
  return {
    total: evidences.length,
    pendientes: evidences.filter(e => e.status === 'pendiente').length,
    enProceso: evidences.filter(e => e.status === 'en_proceso').length,
    corregidas: evidences.filter(e => e.status === 'corregida').length,
    verificadas: evidences.filter(e => e.status === 'verificada').length,
  }
}
