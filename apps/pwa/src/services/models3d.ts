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
} from '@/services/firestoreTracked'
import {
  ref,
  uploadBytesResumable,
  getDownloadURL,
  deleteObject,
} from 'firebase/storage'
import { db, storage } from './firebase'
import { generateId } from '@/lib/utils'
import { logger } from '@/lib/logger'
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

/**
 * Borra el archivo recién subido cuando el documento no se pudo crear.
 *
 * Nunca lanza: el error que le importa a quien sube es el ORIGINAL (por qué se
 * rechazó el documento), no que además falló la limpieza. Si el borrado falla
 * queda un huérfano y se registra para poder encontrarlo.
 */
async function rollbackUploadedFile(storagePath: string): Promise<void> {
  try {
    await deleteObject(ref(storage, storagePath))
    logger.info('Subida revertida: archivo huérfano eliminado de Storage', { storagePath })
  } catch (cleanupError) {
    logger.error(
      'No se pudo revertir la subida: queda un archivo huérfano en Storage',
      cleanupError as Error,
      { storagePath },
    )
  }
}

/**
 * Traduce un fallo de subida a algo accionable para quien está mirando la pantalla.
 *
 * Sin esto, a quien no es admin le aparece `storage/unauthorized` o
 * "Missing or insufficient permissions" — cierto pero inútil: no dice que el
 * problema es el rol ni qué hacer.
 *
 * @param discarded true si ya había un archivo en Storage y se descartó, para no
 *   prometer una limpieza que no ocurrió cuando el fallo fue en la subida misma.
 */
function describeUploadFailure(error: unknown, discarded = false): Error {
  const code = (error as { code?: string })?.code
  const tail = discarded ? ' El archivo subido se descartó.' : ''

  // 'storage/unauthorized' → storage.rules (subida del archivo).
  // 'permission-denied'   → firestore.rules (creación del doc).
  // Los dos significan lo mismo para el usuario: falta rol de administrador.
  if (code === 'storage/unauthorized' || code === 'permission-denied') {
    return new Error(
      'No tienes permisos para publicar modelos 3D: se requiere rol de administrador.' +
        `${tail} Pídele a un administrador que lo suba.`,
    )
  }

  const detail = error instanceof Error ? error.message : String(error)
  return new Error(`No se pudo registrar el modelo: ${detail}.${tail}`)
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

  // Esperar subida con reporte de progreso.
  // storage.rules pide isAdmin() para escribir el archivo del modelo, así que un
  // no-admin falla acá, en el primer byte, y no después de subir 40 MB.
  try {
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
  } catch (error) {
    throw describeUploadFailure(error)
  }

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

  // Storage y Firestore NO exigen lo mismo: storage.rules deja escribir en
  // `models3d/**` a cualquier autenticado, pero crear el doc pide isAdmin().
  // Como el archivo se sube ANTES que el doc, un no-admin dejaba el .glb en el
  // bucket para siempre y el modelo no aparecía en ninguna parte — invisible
  // desde la app, así que ni siquiera se podía borrar desde la UI. Así apareció
  // `models3d/862bb7b2-.../test.glb` (4,7 MB, 22-05-2026).
  //
  // Si el doc no se puede crear, el archivo se va con él.
  const docRef = doc(db, COLLECTION, modelId)
  try {
    await setDoc(docRef, {
      ...modelData,
      createdAt: serverTimestamp(),
      updatedAt: serverTimestamp(),
      updatedBy: userId,
    })
  } catch (error) {
    await rollbackUploadedFile(storagePath)
    throw describeUploadFailure(error, true)
  }

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
      logger.warn('Error en suscripción models3d')
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
  } catch {
    // Si no existe en Storage, continuar (puede ya haberse borrado)
    logger.warn('Error eliminando archivo de Storage')
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
