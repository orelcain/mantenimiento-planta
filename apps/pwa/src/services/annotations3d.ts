
import {
  collection,
  doc,
  setDoc,
  getDocs,
  deleteDoc,
  updateDoc,
  query,
  orderBy,
  serverTimestamp,
  onSnapshot,
  Timestamp,
} from 'firebase/firestore'
import { ref, uploadBytes, getDownloadURL } from 'firebase/storage'
import { db } from './firebase'
import { storage } from './firebase'
import { generateId } from '@/lib/utils'
import { compressImage } from './storage'
import type { Annotation3D, AnnotationStatus, AnnotationPriority, Point3D } from '@/types/models3d'

const PARENT_COLLECTION = 'models3d'
const SUB_COLLECTION = 'annotations'

// Helpers
function parseAnnotationDoc(docSnap: { id: string; data: () => Record<string, unknown> }): Annotation3D {
  const data = docSnap.data()
  return {
    id: docSnap.id,
    position: data.position as Point3D,
    number: data.number as number,
    title: (data.title as string) || '',
    description: (data.description as string) || '',
    photos: (data.photos as string[]) || [],
    status: (data.status as AnnotationStatus) || 'open',
    priority: (data.priority as AnnotationPriority) || 'medium',
    createdAt: data.createdAt instanceof Timestamp ? data.createdAt.toDate() : new Date(),
    createdBy: (data.createdBy as string) || 'system',
  }
}

// Subscribe
export function subscribeToAnnotations(
  modelId: string,
  callback: (annotations: Annotation3D[]) => void
): () => void {
  const q = query(
    collection(db, PARENT_COLLECTION, modelId, SUB_COLLECTION),
    orderBy('number', 'asc')
  )
  return onSnapshot(
    q,
    (snapshot) => {
      const annotations = snapshot.docs.map((d) =>
        parseAnnotationDoc(d as unknown as { id: string; data: () => Record<string, unknown> })
      )
      callback(annotations)
    },
    (error) => {
      console.warn('Error en suscripción annotations:', error.message)
    }
  )
}

// Create
export async function createAnnotation(
  modelId: string,
  data: Omit<Annotation3D, 'id' | 'createdAt' | 'number'>
): Promise<string> {
  const id = generateId()
  const colRef = collection(db, PARENT_COLLECTION, modelId, SUB_COLLECTION)
  
  // Get next number
  const q = query(colRef, orderBy('number', 'desc'))
  const snap = await getDocs(q)
  const lastNum = snap.empty ? 0 : (snap.docs[0]?.data().number ?? 0)
  const number = lastNum + 1

  await setDoc(doc(colRef, id), {
    ...data,
    number,
    createdAt: serverTimestamp(),
  })

  return id
}

// Update
export async function updateAnnotation(
  modelId: string,
  annotationId: string,
  data: Partial<Omit<Annotation3D, 'id' | 'createdAt' | 'number' | 'createdBy'>>
): Promise<void> {
  const docRef = doc(db, PARENT_COLLECTION, modelId, SUB_COLLECTION, annotationId)
  await updateDoc(docRef, data)
}

// Delete
export async function deleteAnnotation(modelId: string, annotationId: string): Promise<void> {
  const docRef = doc(db, PARENT_COLLECTION, modelId, SUB_COLLECTION, annotationId)
  await deleteDoc(docRef)
}

// Upload photos for annotation (optimized to WebP)
export async function uploadAnnotationPhotos(
  modelId: string,
  annotationId: string,
  files: File[]
): Promise<string[]> {
  const urls: string[] = []
  
  for (const file of files) {
    // Compress + convert to WebP
    const compressed = await compressImage(file, 1920, 0.85, true)
    const photoId = generateId()
    const ext = compressed.type.includes('webp') ? 'webp' : 'jpg'
    const storagePath = `models3d/${modelId}/annotations/${annotationId}/${photoId}.${ext}`
    const storageRef = ref(storage, storagePath)
    
    await uploadBytes(storageRef, compressed, {
      contentType: compressed.type || 'image/webp',
    })
    const url = await getDownloadURL(storageRef)
    urls.push(url)
    
    console.log(`📸 Annotation photo: ${file.size} → ${compressed.size} bytes (${Math.round((1 - compressed.size / file.size) * 100)}% reducción)`)
  }
  
  return urls
}
