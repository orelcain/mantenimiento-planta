/**
 * Servicio Firebase para modelos 3D
 * 
 * Colección Firestore: models3d
 * Storage: models3d/{modelId}/{filename}
 */

import {
  collection,
  doc,
  setDoc,
  getDoc,
  getDocs,
  deleteDoc,
  query,
  orderBy,
  serverTimestamp,
  onSnapshot,
  Timestamp,
} from 'firebase/firestore'
import {
  ref,
  uploadBytesResumable,
  getDownloadURL,
  deleteObject,
} from 'firebase/storage'
import { db, storage } from './firebase'
import { generateId } from '@/lib/utils'
import type {
  Model3D,
  CreateModel3DData,
  Model3DFormat,
} from '@/types/models3d'
import { detectFormat, MAX_MODEL_SIZE_BYTES } from '@/types/models3d'

const COLLECTION = 'models3d'

// ============================================================================
// Helpers
// ============================================================================

function parseModelDoc(docSnap: { id: string; data: () => Record<string, unknown> }): Model3D {
  const data = docSnap.data()
  return {
    id: docSnap.id,
    name: data.name as string,
    originalFileName: data.originalFileName as string,
    contentType: data.contentType as string,
    format: data.format as Model3DFormat,
    sizeBytes: data.sizeBytes as number,
    storagePath: data.storagePath as string,
    downloadURL: data.downloadURL as string,
    createdAt: data.createdAt instanceof Timestamp ? data.createdAt.toDate() : new Date(data.createdAt as string),
    createdBy: data.createdBy as string,
    updatedAt: data.updatedAt instanceof Timestamp ? data.updatedAt.toDate() : new Date(data.updatedAt as string),
    updatedBy: data.updatedBy as string,
    visibility: (data.visibility as 'public' | 'admin') || 'public',
  }
}

// ============================================================================
// CRUD
// ============================================================================

/**
 * Sube un archivo de modelo 3D a Storage y registra metadatos en Firestore.
 */
export async function uploadModel3D(
  file: File,
  name: string,
  userId: string,
  onProgress?: (progress: number) => void
): Promise<Model3D> {
  // Validar formato
  const format = detectFormat(file.name)
  if (!format) {
    throw new Error(`Formato no soportado: ${file.name}. Use .glb, .gltf, .obj o .fbx`)
  }

  // Validar tamaño
  if (file.size > MAX_MODEL_SIZE_BYTES) {
    throw new Error(`El archivo excede el tamaño máximo de ${MAX_MODEL_SIZE_BYTES / (1024 * 1024)}MB`)
  }

  const modelId = generateId()
  const storagePath = `models3d/${modelId}/${file.name}`
  const storageRef = ref(storage, storagePath)

  // Upload con progreso
  const uploadTask = uploadBytesResumable(storageRef, file, {
    contentType: file.type || 'application/octet-stream',
  })

  // Esperar subida con reporte de progreso
  await new Promise<void>((resolve, reject) => {
    uploadTask.on(
      'state_changed',
      (snapshot) => {
        const progress = (snapshot.bytesTransferred / snapshot.totalBytes) * 100
        onProgress?.(progress)
      },
      (error) => reject(error),
      () => resolve()
    )
  })

  // Obtener URL de descarga
  const downloadURL = await getDownloadURL(storageRef)

  // Guardar metadatos en Firestore
  const modelData: CreateModel3DData = {
    name,
    originalFileName: file.name,
    contentType: file.type || 'application/octet-stream',
    format,
    sizeBytes: file.size,
    storagePath,
    downloadURL,
    createdBy: userId,
    visibility: 'public',
  }

  const docRef = doc(db, COLLECTION, modelId)
  await setDoc(docRef, {
    ...modelData,
    createdAt: serverTimestamp(),
    updatedAt: serverTimestamp(),
    updatedBy: userId,
  })

  return {
    id: modelId,
    ...modelData,
    createdAt: new Date(),
    updatedAt: new Date(),
    updatedBy: userId,
    visibility: 'public',
  }
}

/**
 * Obtener un modelo 3D por ID
 */
export async function getModel3DById(modelId: string): Promise<Model3D | null> {
  const docRef = doc(db, COLLECTION, modelId)
  const docSnap = await getDoc(docRef)
  if (!docSnap.exists()) return null
  return parseModelDoc(docSnap as unknown as { id: string; data: () => Record<string, unknown> })
}

/**
 * Listar todos los modelos 3D (ordenados por fecha de creación desc)
 */
export async function getModels3D(): Promise<Model3D[]> {
  const q = query(collection(db, COLLECTION), orderBy('createdAt', 'desc'))
  const snapshot = await getDocs(q)
  return snapshot.docs.map((d) =>
    parseModelDoc(d as unknown as { id: string; data: () => Record<string, unknown> })
  )
}

/**
 * Suscripción en tiempo real a la lista de modelos
 */
export function subscribeToModels3D(
  callback: (models: Model3D[]) => void,
  onError?: (error: Error) => void
): () => void {
  const q = query(collection(db, COLLECTION), orderBy('createdAt', 'desc'))
  return onSnapshot(
    q,
    (snapshot) => {
      const models = snapshot.docs.map((d) =>
        parseModelDoc(d as unknown as { id: string; data: () => Record<string, unknown> })
      )
      callback(models)
    },
    (error) => {
      console.warn('Error en suscripción models3d:', error.message)
      onError?.(error)
    }
  )
}

/**
 * Eliminar un modelo 3D (Firestore + Storage + subcolección de cotas)
 */
export async function deleteModel3D(modelId: string): Promise<void> {
  // 1. Obtener datos del modelo para conocer la ruta de Storage
  const model = await getModel3DById(modelId)
  if (!model) throw new Error('Modelo no encontrado')

  // 2. Eliminar archivo de Storage
  try {
    const storageRef = ref(storage, model.storagePath)
    await deleteObject(storageRef)
  } catch (error) {
    // Si no existe en Storage, continuar (puede ya haberse borrado)
    console.warn('Error eliminando archivo de Storage:', error)
  }

  // 3. Eliminar subcolección dimensions
  const dimsSnapshot = await getDocs(collection(db, COLLECTION, modelId, 'dimensions'))
  const deletePromises = dimsSnapshot.docs.map((d) =>
    deleteDoc(doc(db, COLLECTION, modelId, 'dimensions', d.id))
  )
  await Promise.all(deletePromises)

  // 4. Eliminar documento principal
  await deleteDoc(doc(db, COLLECTION, modelId))
}
