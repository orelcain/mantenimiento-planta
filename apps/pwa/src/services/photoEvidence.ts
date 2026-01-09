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
import type { PhotoEvidence, PhotoItem, PhotoEvidenceStatus, PhotoComparison, PhotoPairMeta, PhotoPairPhotos } from '@/types'
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

  const pairPhotos: PhotoPairPhotos[] | undefined = Array.isArray(data.pairPhotos)
    ? data.pairPhotos.map((pp: any) => ({
        before: Array.isArray(pp?.before)
          ? pp.before.map((f: any) => ({
              ...f,
              timestamp: toDateSafe(f.timestamp) ?? createdAt,
            }))
          : [],
        after: Array.isArray(pp?.after)
          ? pp.after.map((f: any) => ({
              ...f,
              timestamp: toDateSafe(f.timestamp) ?? createdAt,
            }))
          : [],
      }))
    : undefined

  // Legacy arrays (1 foto por par). If pairPhotos exists, keep them in sync for UI thumbnails.
  const legacyBefore: PhotoItem[] = (data.fotosBefore || []).map((f: any) => ({
    ...f,
    timestamp: toDateSafe(f.timestamp) ?? createdAt,
  }))
  const legacyAfter: PhotoItem[] = (data.fotosAfter || []).map((f: any) => ({
    ...f,
    timestamp: toDateSafe(f.timestamp) ?? createdAt,
  }))

  const syncedLegacy = (() => {
    if (!pairPhotos) return { fotosBefore: legacyBefore, fotosAfter: legacyAfter }
    const maxPairs = Math.max(pairPhotos.length, legacyBefore.length, legacyAfter.length)
    const fotosBefore: PhotoItem[] = []
    const fotosAfter: PhotoItem[] = []
    for (let i = 0; i < maxPairs; i++) {
      const pp = pairPhotos[i]
      const first = pp?.before?.[0] ?? legacyBefore[i]
      if (first) fotosBefore.push(first)
    }
    for (let i = 0; i < maxPairs; i++) {
      const pp = pairPhotos[i]
      const first = pp?.after?.[0] ?? legacyAfter[i]
      if (first) fotosAfter.push(first)
    }
    // Filter out undefined (TS) at runtime
    return {
      fotosBefore: fotosBefore.filter(Boolean) as PhotoItem[],
      fotosAfter: fotosAfter.filter(Boolean) as PhotoItem[],
    }
  })()

  return {
    ...data,
    id: doc.id,
    createdAt,
    updatedAt,
    corregidaAt: toDateSafe(data.corregidaAt),
    verificadaAt: toDateSafe(data.verificadaAt),
    pairMeta: Array.isArray(data.pairMeta) ? data.pairMeta : [],
    pairPhotos,
    fotosBefore: syncedLegacy.fotosBefore,
    fotosAfter: syncedLegacy.fotosAfter,
  }
}

function buildPairPhotosFromLegacy(evidence: PhotoEvidence): PhotoPairPhotos[] {
  const maxPairs = Math.max(evidence.fotosBefore.length, evidence.fotosAfter.length, evidence.pairMeta?.length ?? 0)
  const pairs: PhotoPairPhotos[] = []
  for (let i = 0; i < maxPairs; i++) {
    const before = evidence.fotosBefore[i] ? [evidence.fotosBefore[i]!] : []
    const after = evidence.fotosAfter[i] ? [evidence.fotosAfter[i]!] : []
    pairs.push({ before, after })
  }
  return pairs
}

function getNormalizedPairPhotos(evidence: PhotoEvidence): PhotoPairPhotos[] {
  const pairs = Array.isArray(evidence.pairPhotos) ? evidence.pairPhotos : buildPairPhotosFromLegacy(evidence)
  const maxPairs = Math.max(pairs.length, evidence.fotosBefore.length, evidence.fotosAfter.length, evidence.pairMeta?.length ?? 0)
  const out: PhotoPairPhotos[] = []
  for (let i = 0; i < maxPairs; i++) {
    const pp = pairs[i]
    const before = Array.isArray(pp?.before) ? pp.before : []
    const after = Array.isArray(pp?.after) ? pp.after : []
    out.push({ before, after })
  }
  return out
}

function syncLegacyFromPairPhotos(pairPhotos: PhotoPairPhotos[]) {
  const fotosBefore: PhotoItem[] = []
  const fotosAfter: PhotoItem[] = []
  for (let i = 0; i < pairPhotos.length; i++) {
    const pp = pairPhotos[i]
    if (pp?.before?.[0]) fotosBefore[i] = pp.before[0]
    if (pp?.after?.[0]) fotosAfter[i] = pp.after[0]
  }
  return {
    fotosBefore: fotosBefore.filter(Boolean) as PhotoItem[],
    fotosAfter: fotosAfter.filter(Boolean) as PhotoItem[],
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
    pairPhotos: [],
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

export async function updateEvidencePairPhotos(
  evidenceId: string,
  pairIndex: number,
  type: 'before' | 'after',
  desired: { id: string; url: string; file?: File }[],
  userId?: string
): Promise<void> {
  const evidence = await getPhotoEvidenceById(evidenceId)
  if (!evidence) throw new Error('Evidencia no encontrada')

  const pairPhotos = getNormalizedPairPhotos(evidence)

  // Evitar huecos de pares
  if (pairIndex > pairPhotos.length) {
    throw new Error('No se puede guardar este par sin completar los anteriores')
  }

  // Asegurar que exista el par
  if (pairIndex === pairPhotos.length) {
    pairPhotos.push({ before: [], after: [] })
  }

  const currentList = type === 'before' ? pairPhotos[pairIndex]!.before : pairPhotos[pairIndex]!.after
  const desiredIds = new Set(desired.map((d) => d.id))

  // Borrar del storage lo que se quitó
  for (const p of currentList) {
    if (!desiredIds.has(p.id)) {
      try {
        await deleteEvidencePhoto(evidenceId, p.id, type, p.url)
      } catch (e) {
        logger.warn('Error deleting removed pair photo', { evidenceId, type, photoId: p.id })
      }
    }
  }

  const nextList: PhotoItem[] = []

  for (const item of desired) {
    if (item.file) {
      const toReplace = currentList.find((p) => p.id === item.id)
      if (toReplace) {
        try {
          await deleteEvidencePhoto(evidenceId, toReplace.id, type, toReplace.url)
        } catch (e) {
          logger.warn('Error deleting replaced pair photo', { evidenceId, type, photoId: toReplace.id })
        }
      }
      const uploaded = await uploadMultipleEvidencePhotos(evidenceId, [item.file], type)
      const first = uploaded[0]
      if (!first) continue
      nextList.push({ id: first.id, url: first.url, timestamp: new Date() })
      continue
    }

    const existing = currentList.find((p) => p.id === item.id)
    if (existing) {
      nextList.push(existing)
    } else {
      // Fallback: keep provided id/url
      nextList.push({ id: item.id, url: item.url, timestamp: new Date() })
    }
  }

  if (type === 'before') {
    pairPhotos[pairIndex] = { ...pairPhotos[pairIndex]!, before: nextList }
  } else {
    pairPhotos[pairIndex] = { ...pairPhotos[pairIndex]!, after: nextList }
  }

  const legacy = syncLegacyFromPairPhotos(pairPhotos)

  if (type === 'after' && nextList.length > 0) {
    await updatePhotoEvidence(evidenceId, {
      pairPhotos,
      fotosBefore: legacy.fotosBefore,
      fotosAfter: legacy.fotosAfter,
      status: 'corregida',
      corregidoPor: userId,
      corregidaAt: new Date(),
    })
  } else {
    await updatePhotoEvidence(evidenceId, {
      pairPhotos,
      fotosBefore: legacy.fotosBefore,
      fotosAfter: legacy.fotosAfter,
    })
  }
}

export async function deleteEvidencePair(
  evidenceId: string,
  pairIndex: number
): Promise<void> {
  const evidence = await getPhotoEvidenceById(evidenceId)
  if (!evidence) throw new Error('Evidencia no encontrada')

  const pairPhotos = getNormalizedPairPhotos(evidence)
  const toDelete = pairPhotos[pairIndex]
  if (toDelete) {
    for (const p of toDelete.before) {
      try {
        await deleteEvidencePhoto(evidenceId, p.id, 'before', p.url)
      } catch (e) {
        logger.warn('Error deleting before photo for pair deletion', { evidenceId, photoId: p.id })
      }
    }
    for (const p of toDelete.after) {
      try {
        await deleteEvidencePhoto(evidenceId, p.id, 'after', p.url)
      } catch (e) {
        logger.warn('Error deleting after photo for pair deletion', { evidenceId, photoId: p.id })
      }
    }
  }

  const nextPairPhotos = pairPhotos.filter((_, i) => i !== pairIndex)
  const legacy = syncLegacyFromPairPhotos(nextPairPhotos)
  const pairMeta = (evidence.pairMeta || []).filter((_, i) => i !== pairIndex)

  await updatePhotoEvidence(evidenceId, {
    pairPhotos: nextPairPhotos,
    fotosBefore: legacy.fotosBefore,
    fotosAfter: legacy.fotosAfter,
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

  const pairPhotos = getNormalizedPairPhotos(evidence)
  const seen = new Set<string>()

  for (const pp of pairPhotos) {
    for (const photo of pp.before) {
      if (seen.has(photo.id)) continue
      seen.add(photo.id)
      try {
        await deleteEvidencePhoto(id, photo.id, 'before', photo.url)
      } catch (e) {
        logger.warn('Error deleting before photo', { photoId: photo.id })
      }
    }
    for (const photo of pp.after) {
      if (seen.has(photo.id)) continue
      seen.add(photo.id)
      try {
        await deleteEvidencePhoto(id, photo.id, 'after', photo.url)
      } catch (e) {
        logger.warn('Error deleting after photo', { photoId: photo.id })
      }
    }
  }

  // Eliminar documento
  await deleteDoc(doc(db, COLLECTION, id))
  logger.info('Photo evidence deleted', { id })
}

// Preparar datos para exportación PDF
export function prepareComparisonForExport(evidence: PhotoEvidence): PhotoComparison[] {
  const comparisons: PhotoComparison[] = []

  const pairPhotos = getNormalizedPairPhotos(evidence)
  for (let i = 0; i < pairPhotos.length; i++) {
    const pp = pairPhotos[i]
    if (!pp) continue
    const meta = evidence.pairMeta?.[i]
    const maxInner = Math.max(pp.before.length, pp.after.length)
    for (let k = 0; k < maxInner; k++) {
      const before = pp.before[k]
      const after = pp.after[k]
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
