/**
 * Servicios CRUD para el sistema de Mapas con Marcadores
 */

import {
  collection,
  doc,
  setDoc,
  getDoc,
  getDocs,
  updateDoc,
  deleteDoc,
  query,
  where,
  orderBy,
  serverTimestamp,
  Timestamp,
  limit,
} from 'firebase/firestore'
import { ref, uploadBytes, getDownloadURL, deleteObject } from 'firebase/storage'
import { db, storage } from '@/services/firebase'
import { generateId } from '@/lib/utils'
import { compressImage } from '@/services/storage'
import type {
  MapLocation,
  MapVersion,
  MapMarker,
  Inspection,
  InspectionItem,
  CreateMapLocationDTO,
  CreateMarkerDTO,
  CreateInspectionDTO,
  CreateInspectionItemDTO,
} from '@/types/maps'

// Collections
const LOCATIONS_COLLECTION = 'mapLocations'
const VERSIONS_COLLECTION = 'mapVersions'
const MARKERS_COLLECTION = 'mapMarkers'
const INSPECTIONS_COLLECTION = 'inspections'
const INSPECTION_ITEMS_COLLECTION = 'inspectionItems'

// ============================================================
// MAP LOCATIONS
// ============================================================

/**
 * Crear una nueva ubicación de mapa
 */
export async function createMapLocation(
  data: CreateMapLocationDTO,
  userId: string
): Promise<MapLocation> {
  const id = generateId()
  const now = new Date()

  // Obtener el orden más alto actual
  const locationsSnap = await getDocs(
    query(collection(db, LOCATIONS_COLLECTION), orderBy('orden', 'desc'), limit(1))
  )
  const firstDoc = locationsSnap.docs[0]
  const maxOrden = locationsSnap.empty || !firstDoc ? 0 : (firstDoc.data().orden || 0)

  const location: MapLocation = {
    id,
    nombre: data.nombre,
    descripcion: data.descripcion || '', // Firestore no acepta undefined
    activo: true,
    orden: maxOrden + 1,
    createdAt: now,
    updatedAt: now,
    createdBy: userId,
  }

  await setDoc(doc(db, LOCATIONS_COLLECTION, id), {
    ...location,
    createdAt: serverTimestamp(),
    updatedAt: serverTimestamp(),
  })

  return location
}

/**
 * Obtener todas las ubicaciones activas
 */
export async function getMapLocations(): Promise<MapLocation[]> {
  const snap = await getDocs(
    query(
      collection(db, LOCATIONS_COLLECTION),
      where('activo', '==', true),
      orderBy('orden', 'asc')
    )
  )

  return snap.docs.map((doc) => parseLocation(doc))
}

/**
 * Obtener ubicación por ID
 */
export async function getMapLocationById(id: string): Promise<MapLocation | null> {
  const docSnap = await getDoc(doc(db, LOCATIONS_COLLECTION, id))
  if (!docSnap.exists()) return null
  return parseLocation(docSnap)
}

/**
 * Actualizar ubicación
 */
export async function updateMapLocation(
  id: string,
  data: Partial<Pick<MapLocation, 'nombre' | 'descripcion' | 'activo' | 'orden'>>
): Promise<void> {
  await updateDoc(doc(db, LOCATIONS_COLLECTION, id), {
    ...data,
    updatedAt: serverTimestamp(),
  })
}

/**
 * Eliminar ubicación (soft delete)
 */
export async function deleteMapLocation(id: string): Promise<void> {
  await updateDoc(doc(db, LOCATIONS_COLLECTION, id), {
    activo: false,
    updatedAt: serverTimestamp(),
  })
}

// ============================================================
// MAP VERSIONS
// ============================================================

/**
 * Subir una nueva versión de mapa
 */
export async function uploadMapVersion(
  locationId: string,
  file: File,
  userId: string,
  descripcion?: string
): Promise<MapVersion> {
  // Comprimir imagen (max 2500px, 85% quality para mapas detallados)
  const compressed = await compressImage(file, 2500, 0.85)

  // Obtener dimensiones
  const dimensions = await getImageDimensions(compressed)

  // Obtener siguiente número de versión
  const versionsSnap = await getDocs(
    query(
      collection(db, VERSIONS_COLLECTION),
      where('locationId', '==', locationId),
      orderBy('version', 'desc'),
      limit(1)
    )
  )
  const firstVersionDoc = versionsSnap.docs[0]
  const nextVersion = versionsSnap.empty || !firstVersionDoc ? 1 : (firstVersionDoc.data().version || 0) + 1

  // Subir a Storage
  const id = generateId()
  const ext = compressed.type.includes('webp') ? 'webp' : 'jpg'
  const storagePath = `maps/${locationId}/${id}.${ext}`
  const storageRef = ref(storage, storagePath)

  await uploadBytes(storageRef, compressed)
  const imageUrl = await getDownloadURL(storageRef)

  // Guardar en Firestore
  const now = new Date()
  const mapVersion: MapVersion = {
    id,
    locationId,
    imageUrl,
    imagePath: storagePath,
    version: nextVersion,
    descripcion: descripcion || '', // Firestore no acepta undefined
    width: dimensions.width,
    height: dimensions.height,
    uploadedBy: userId,
    createdAt: now,
  }

  await setDoc(doc(db, VERSIONS_COLLECTION, id), {
    ...mapVersion,
    createdAt: serverTimestamp(),
  })

  return mapVersion
}

/**
 * Obtener todas las versiones de mapa para una ubicación
 */
export async function getMapVersionsByLocation(locationId: string): Promise<MapVersion[]> {
  const snap = await getDocs(
    query(
      collection(db, VERSIONS_COLLECTION),
      where('locationId', '==', locationId),
      orderBy('version', 'desc')
    )
  )

  return snap.docs.map((doc) => parseMapVersion(doc))
}

/**
 * Obtener la última versión de mapa para una ubicación
 */
export async function getLatestMapVersion(locationId: string): Promise<MapVersion | null> {
  const snap = await getDocs(
    query(
      collection(db, VERSIONS_COLLECTION),
      where('locationId', '==', locationId),
      orderBy('version', 'desc'),
      limit(1)
    )
  )

  if (snap.empty) return null
  const firstDoc = snap.docs[0]
  if (!firstDoc) return null
  return parseMapVersion(firstDoc)
}

/**
 * Obtener versión de mapa por ID
 */
export async function getMapVersionById(id: string): Promise<MapVersion | null> {
  const docSnap = await getDoc(doc(db, VERSIONS_COLLECTION, id))
  if (!docSnap.exists()) return null
  return parseMapVersion(docSnap)
}

/**
 * Eliminar versión de mapa (también elimina de Storage)
 */
export async function deleteMapVersion(id: string): Promise<void> {
  const version = await getMapVersionById(id)
  if (!version) return

  // Eliminar de Storage
  try {
    const storageRef = ref(storage, version.imagePath)
    await deleteObject(storageRef)
  } catch (e) {
    console.warn('Error deleting map image from storage:', e)
  }

  // Eliminar de Firestore
  await deleteDoc(doc(db, VERSIONS_COLLECTION, id))
}

// ============================================================
// MAP MARKERS
// ============================================================

/**
 * Crear un marcador
 */
export async function createMapMarker(
  data: CreateMarkerDTO,
  userId: string
): Promise<MapMarker> {
  const id = generateId()
  const now = new Date()

  const marker: MapMarker = {
    id,
    mapVersionId: data.mapVersionId,
    locationId: data.locationId,
    incidentId: data.incidentId,
    inspectionId: data.inspectionId,
    inspectionIndex: data.inspectionIndex,
    position: data.position,
    label: data.label,
    createdAt: now,
    createdBy: userId,
  }

  await setDoc(doc(db, MARKERS_COLLECTION, id), {
    ...marker,
    createdAt: serverTimestamp(),
  })

  return marker
}

/**
 * Obtener marcadores por versión de mapa
 */
export async function getMarkersByMapVersion(mapVersionId: string): Promise<MapMarker[]> {
  const snap = await getDocs(
    query(
      collection(db, MARKERS_COLLECTION),
      where('mapVersionId', '==', mapVersionId),
      orderBy('createdAt', 'asc')
    )
  )

  return snap.docs.map((doc) => parseMarker(doc))
}

/**
 * Obtener marcadores por inspección
 */
export async function getMarkersByInspection(inspectionId: string): Promise<MapMarker[]> {
  const snap = await getDocs(
    query(
      collection(db, MARKERS_COLLECTION),
      where('inspectionId', '==', inspectionId),
      orderBy('inspectionIndex', 'asc')
    )
  )

  return snap.docs.map((doc) => parseMarker(doc))
}

/**
 * Obtener marcador por incidencia
 */
export async function getMarkerByIncident(incidentId: string): Promise<MapMarker | null> {
  const snap = await getDocs(
    query(
      collection(db, MARKERS_COLLECTION),
      where('incidentId', '==', incidentId),
      limit(1)
    )
  )

  if (snap.empty) return null
  const firstDoc = snap.docs[0]
  if (!firstDoc) return null
  return parseMarker(firstDoc)
}

/**
 * Actualizar posición del marcador
 */
export async function updateMarkerPosition(
  id: string,
  position: { x: number; y: number }
): Promise<void> {
  await updateDoc(doc(db, MARKERS_COLLECTION, id), { position })
}

/**
 * Eliminar marcador
 */
export async function deleteMapMarker(id: string): Promise<void> {
  await deleteDoc(doc(db, MARKERS_COLLECTION, id))
}

/**
 * Obtener marcadores por ubicación (todos los de esa ubicación)
 */
export async function getMarkersByLocation(locationId: string): Promise<MapMarker[]> {
  const snap = await getDocs(
    query(
      collection(db, MARKERS_COLLECTION),
      where('locationId', '==', locationId),
      orderBy('createdAt', 'desc')
    )
  )

  return snap.docs.map((doc) => parseMarker(doc))
}

/**
 * Obtener todas las inspecciones (para admin/visualización)
 */
export async function getAllInspections(): Promise<Inspection[]> {
  const snap = await getDocs(
    query(
      collection(db, INSPECTIONS_COLLECTION),
      orderBy('createdAt', 'desc')
    )
  )

  return snap.docs.map((doc) => parseInspection(doc))
}

// ============================================================
// INSPECTIONS
// ============================================================

/**
 * Crear una nueva inspección
 */
export async function createInspection(
  data: CreateInspectionDTO
): Promise<Inspection> {
  const id = generateId()
  const now = new Date()

  const inspection: Inspection = {
    id,
    nombre: data.nombre,
    descripcion: data.descripcion || '', // Firestore no acepta undefined
    locationId: data.locationId,
    locationName: data.locationName,
    mapVersionId: data.mapVersionId,
    motivoInspeccion: data.motivoInspeccion || '', // Firestore no acepta undefined
    status: 'en_progreso',
    totalMarkers: 0,
    totalItems: 0,
    createdBy: data.createdBy,
    createdByName: data.createdByName,
    createdAt: now,
    updatedAt: now,
  }

  await setDoc(doc(db, INSPECTIONS_COLLECTION, id), {
    ...inspection,
    createdAt: serverTimestamp(),
    updatedAt: serverTimestamp(),
  })

  return inspection
}

/**
 * Obtener inspecciones del usuario
 */
export async function getInspectionsByUser(userId: string): Promise<Inspection[]> {
  const snap = await getDocs(
    query(
      collection(db, INSPECTIONS_COLLECTION),
      where('createdBy', '==', userId),
      orderBy('createdAt', 'desc')
    )
  )

  return snap.docs.map((doc) => parseInspection(doc))
}

/**
 * Obtener inspecciones por ubicación
 */
export async function getInspectionsByLocation(locationId: string): Promise<Inspection[]> {
  const snap = await getDocs(
    query(
      collection(db, INSPECTIONS_COLLECTION),
      where('locationId', '==', locationId),
      orderBy('createdAt', 'desc')
    )
  )

  return snap.docs.map((doc) => parseInspection(doc))
}

/**
 * Obtener inspección por ID
 */
export async function getInspectionById(id: string): Promise<Inspection | null> {
  const docSnap = await getDoc(doc(db, INSPECTIONS_COLLECTION, id))
  if (!docSnap.exists()) return null
  return parseInspection(docSnap)
}

/**
 * Actualizar inspección
 */
export async function updateInspection(
  id: string,
  data: Partial<Pick<Inspection, 'nombre' | 'descripcion' | 'status' | 'totalMarkers' | 'totalItems'>>
): Promise<void> {
  const updateData: Record<string, unknown> = {
    ...data,
    updatedAt: serverTimestamp(),
  }

  if (data.status === 'finalizado') {
    updateData.completedAt = serverTimestamp()
  }

  await updateDoc(doc(db, INSPECTIONS_COLLECTION, id), updateData)
}

/**
 * Finalizar una inspección
 */
export async function finalizeInspection(id: string, totalItems: number): Promise<void> {
  await updateDoc(doc(db, INSPECTIONS_COLLECTION, id), {
    status: 'finalizado',
    totalItems,
    completedAt: serverTimestamp(),
    updatedAt: serverTimestamp(),
  })
}

/**
 * Incrementar contador de marcadores
 */
export async function incrementInspectionMarkers(id: string): Promise<void> {
  const inspection = await getInspectionById(id)
  if (!inspection) return

  await updateDoc(doc(db, INSPECTIONS_COLLECTION, id), {
    totalMarkers: (inspection.totalMarkers || 0) + 1,
    updatedAt: serverTimestamp(),
  })
}

// ============================================================
// INSPECTION ITEMS
// ============================================================

/**
 * Agregar item a una inspección
 */
export async function addInspectionItem(
  data: CreateInspectionItemDTO
): Promise<InspectionItem> {
  const id = generateId()
  const now = new Date()

  const item: InspectionItem = {
    id,
    inspectionId: data.inspectionId,
    markerId: data.markerId,
    order: data.order,
    position: data.position,
    title: data.title,
    description: data.description,
    fotos: [], // Se subirán después
    createdAt: now,
    updatedAt: now,
  }

  // Crear objeto para Firestore sin campos undefined
  const firestoreData: Record<string, unknown> = {
    id,
    inspectionId: data.inspectionId,
    order: data.order,
    position: data.position,
    title: data.title,
    description: data.description || '',
    fotos: [],
    createdAt: serverTimestamp(),
    updatedAt: serverTimestamp(),
  }

  // Solo agregar markerId si está definido
  if (data.markerId) {
    firestoreData.markerId = data.markerId
  }

  // Solo agregar prioridad si está definida
  if (data.prioridad) {
    firestoreData.prioridad = data.prioridad
  }

  await setDoc(doc(db, INSPECTION_ITEMS_COLLECTION, id), firestoreData)

  return item
}

/**
 * Obtener items de una inspección
 */
export async function getInspectionItems(inspectionId: string): Promise<InspectionItem[]> {
  const snap = await getDocs(
    query(
      collection(db, INSPECTION_ITEMS_COLLECTION),
      where('inspectionId', '==', inspectionId),
      orderBy('order', 'asc')
    )
  )

  return snap.docs.map((doc) => parseInspectionItem(doc))
}

/**
 * Eliminar item de inspección
 */
export async function deleteInspectionItem(_inspectionId: string, itemId: string): Promise<void> {
  await deleteDoc(doc(db, INSPECTION_ITEMS_COLLECTION, itemId))
}

/**
 * Actualizar item de inspección
 */
export async function updateInspectionItem(
  id: string,
  data: Partial<Pick<InspectionItem, 'title' | 'description' | 'prioridad' | 'fotos' | 'incidentId'>>
): Promise<void> {
  await updateDoc(doc(db, INSPECTION_ITEMS_COLLECTION, id), {
    ...data,
    updatedAt: serverTimestamp(),
  })
}

/**
 * Subir foto para item de inspección
 */
export async function uploadInspectionItemPhoto(
  itemId: string,
  inspectionId: string,
  file: File
): Promise<string> {
  const compressed = await compressImage(file, 1200, 0.8)
  const ext = compressed.type.includes('webp') ? 'webp' : 'jpg'
  const photoId = generateId()
  const storagePath = `inspections/${inspectionId}/${itemId}/${photoId}.${ext}`
  const storageRef = ref(storage, storagePath)

  await uploadBytes(storageRef, compressed)
  const url = await getDownloadURL(storageRef)

  // Actualizar array de fotos
  const item = await getDoc(doc(db, INSPECTION_ITEMS_COLLECTION, itemId))
  if (item.exists()) {
    const currentFotos = item.data().fotos || []
    await updateDoc(doc(db, INSPECTION_ITEMS_COLLECTION, itemId), {
      fotos: [...currentFotos, url],
      updatedAt: serverTimestamp(),
    })
  }

  return url
}

// ============================================================
// HELPERS
// ============================================================

function parseTimestamp(ts: unknown): Date {
  if (ts instanceof Timestamp) return ts.toDate()
  if (ts instanceof Date) return ts
  return new Date()
}

function parseLocation(doc: { id: string; data: () => Record<string, unknown> }): MapLocation {
  const data = doc.data()
  return {
    id: doc.id,
    nombre: data.nombre as string,
    descripcion: data.descripcion as string | undefined,
    activo: data.activo as boolean,
    orden: data.orden as number,
    createdAt: parseTimestamp(data.createdAt),
    updatedAt: parseTimestamp(data.updatedAt),
    createdBy: data.createdBy as string,
  }
}

function parseMapVersion(doc: { id: string; data: () => Record<string, unknown> }): MapVersion {
  const data = doc.data()
  return {
    id: doc.id,
    locationId: data.locationId as string,
    imageUrl: data.imageUrl as string,
    imagePath: data.imagePath as string,
    version: data.version as number,
    descripcion: data.descripcion as string | undefined,
    width: data.width as number,
    height: data.height as number,
    uploadedBy: data.uploadedBy as string,
    createdAt: parseTimestamp(data.createdAt),
  }
}

function parseMarker(doc: { id: string; data: () => Record<string, unknown> }): MapMarker {
  const data = doc.data()
  return {
    id: doc.id,
    mapVersionId: data.mapVersionId as string,
    locationId: data.locationId as string,
    incidentId: data.incidentId as string | undefined,
    inspectionId: data.inspectionId as string | undefined,
    inspectionIndex: data.inspectionIndex as number | undefined,
    position: data.position as { x: number; y: number },
    label: data.label as string | undefined,
    createdAt: parseTimestamp(data.createdAt),
    createdBy: data.createdBy as string,
  }
}

function parseInspection(doc: { id: string; data: () => Record<string, unknown> }): Inspection {
  const data = doc.data()
  return {
    id: doc.id,
    nombre: data.nombre as string,
    descripcion: data.descripcion as string | undefined,
    locationId: data.locationId as string,
    locationName: (data.locationName as string) || '',
    mapVersionId: data.mapVersionId as string,
    status: data.status as Inspection['status'],
    totalMarkers: (data.totalMarkers as number) || 0,
    totalItems: (data.totalItems as number) || 0,
    motivoInspeccion: data.motivoInspeccion as string | undefined,
    responsable: data.responsable as string | undefined,
    createdBy: data.createdBy as string,
    createdByName: data.createdByName as string | undefined,
    createdAt: parseTimestamp(data.createdAt),
    updatedAt: parseTimestamp(data.updatedAt),
    completedAt: data.completedAt ? parseTimestamp(data.completedAt) : undefined,
  }
}

function parseInspectionItem(doc: { id: string; data: () => Record<string, unknown> }): InspectionItem {
  const data = doc.data()
  return {
    id: doc.id,
    inspectionId: data.inspectionId as string,
    markerId: data.markerId as string | undefined,
    order: (data.order as number) || 0,
    position: data.position as { x: number; y: number },
    title: data.title as string,
    description: data.description as string | undefined,
    fotos: (data.fotos as string[]) || [],
    prioridad: data.prioridad as InspectionItem['prioridad'],
    incidentId: data.incidentId as string | undefined,
    createdAt: parseTimestamp(data.createdAt),
    updatedAt: parseTimestamp(data.updatedAt),
  }
}

/**
 * Subir fotos para un item de inspección
 */
export async function uploadInspectionItemPhotos(
  inspectionId: string,
  itemId: string,
  photos: File[]
): Promise<string[]> {
  const uploadedUrls: string[] = []

  for (const photo of photos) {
    const photoId = `${Date.now()}_${Math.random().toString(36).substr(2, 9)}`
    const ext = photo.name.split('.').pop() || 'jpg'
    const storagePath = `inspections/${inspectionId}/${itemId}/${photoId}.${ext}`

    const storageRef = ref(storage, storagePath)
    await uploadBytes(storageRef, photo)
    const url = await getDownloadURL(storageRef)
    uploadedUrls.push(url)
  }

  // Actualizar el item con las URLs de las fotos
  if (uploadedUrls.length > 0) {
    await updateDoc(doc(db, INSPECTION_ITEMS_COLLECTION, itemId), {
      fotos: uploadedUrls,
      updatedAt: serverTimestamp()
    })
  }

  return uploadedUrls
}

/**
 * Obtener dimensiones de una imagen
 */
function getImageDimensions(file: Blob): Promise<{ width: number; height: number }> {
  return new Promise((resolve, reject) => {
    const img = new Image()
    img.onload = () => {
      resolve({ width: img.width, height: img.height })
      URL.revokeObjectURL(img.src)
    }
    img.onerror = reject
    img.src = URL.createObjectURL(file)
  })
}
