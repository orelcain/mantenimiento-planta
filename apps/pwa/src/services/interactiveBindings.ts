import {
  collection,
  deleteDoc,
  doc,
  getDocs,
  onSnapshot,
  serverTimestamp,
  setDoc,
  Timestamp,
} from '@/services/firestoreTracked'
import { db } from './firebase'
import { logger } from '@/lib/logger'

const PARENT_COLLECTION = 'models3d'
const SUB_COLLECTION = 'interactiveBindings'

export interface InteractiveBinding {
  id: string
  assetId: string
  objectName: string
  motionObjectName?: string
  updatedAt: Date
  updatedBy: string
}

export interface CreateInteractiveBindingData {
  assetId: string
  objectName: string
  motionObjectName?: string
  updatedBy: string
}

function getSubCollectionRef(modelId: string) {
  return collection(db, PARENT_COLLECTION, modelId, SUB_COLLECTION)
}

function parseBindingDoc(docSnap: { id: string; data: () => Record<string, unknown> }): InteractiveBinding {
  const data = docSnap.data()
  return {
    id: docSnap.id,
    assetId: data.assetId as string,
    objectName: data.objectName as string,
    motionObjectName: data.motionObjectName as string | undefined,
    updatedAt: data.updatedAt instanceof Timestamp ? data.updatedAt.toDate() : new Date(),
    updatedBy: data.updatedBy as string,
  }
}

export async function setInteractiveBinding(modelId: string, data: CreateInteractiveBindingData): Promise<InteractiveBinding> {
  const docId = data.assetId.replace(/[/.#[\]]/g, '_')
  const docRef = doc(db, PARENT_COLLECTION, modelId, SUB_COLLECTION, docId)

  await setDoc(docRef, {
    assetId: data.assetId,
    objectName: data.objectName,
    motionObjectName: data.motionObjectName ?? null,
    updatedBy: data.updatedBy,
    updatedAt: serverTimestamp(),
  })

  return {
    id: docId,
    assetId: data.assetId,
    objectName: data.objectName,
    motionObjectName: data.motionObjectName,
    updatedAt: new Date(),
    updatedBy: data.updatedBy,
  }
}

export async function deleteInteractiveBinding(modelId: string, assetId: string): Promise<void> {
  const docId = assetId.replace(/[/.#[\]]/g, '_')
  await deleteDoc(doc(db, PARENT_COLLECTION, modelId, SUB_COLLECTION, docId))
}

export async function getInteractiveBindings(modelId: string): Promise<InteractiveBinding[]> {
  const snapshot = await getDocs(getSubCollectionRef(modelId))
  return snapshot.docs.map((docSnap) => parseBindingDoc(docSnap as unknown as { id: string; data: () => Record<string, unknown> }))
}

export function subscribeToInteractiveBindings(
  modelId: string,
  callback: (bindings: InteractiveBinding[]) => void,
  onError?: (error: Error) => void,
): () => void {
  return onSnapshot(
    getSubCollectionRef(modelId),
    (snapshot) => {
      callback(snapshot.docs.map((docSnap) => parseBindingDoc(docSnap as unknown as { id: string; data: () => Record<string, unknown> })))
    },
    (error) => {
      logger.warn('Error en suscripción interactiveBindings')
      onError?.(error)
    },
  )
}