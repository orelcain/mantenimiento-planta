/**
 * Servicio Firebase para material overrides de modelos 3D
 * 
 * Subcolección: models3d/{modelId}/materialOverrides
 */

import {
  collection,
  doc,
  setDoc,
  deleteDoc,
  getDocs,
  onSnapshot,
  serverTimestamp,
  Timestamp,
} from '@/services/firestoreTracked'
import { db } from './firebase'
import type { MaterialOverride, CreateMaterialOverrideData } from '@/types/models3d'

const PARENT_COLLECTION = 'models3d'
const SUB_COLLECTION = 'materialOverrides'

function getSubCollectionRef(modelId: string) {
  return collection(db, PARENT_COLLECTION, modelId, SUB_COLLECTION)
}

function parseOverrideDoc(docSnap: { id: string; data: () => Record<string, unknown> }): MaterialOverride {
  const data = docSnap.data()
  return {
    id: docSnap.id,
    meshId: data.meshId as string,
    color: data.color as string,
    opacity: (data.opacity as number) ?? 1,
    createdAt: data.createdAt instanceof Timestamp ? data.createdAt.toDate() : new Date(),
    createdBy: data.createdBy as string,
  }
}

/**
 * Crear o actualizar un override de material para una malla
 * Usa meshId como document ID para que sea idempotente
 */
export async function setMaterialOverride(
  modelId: string,
  data: CreateMaterialOverrideData
): Promise<MaterialOverride> {
  const docId = data.meshId.replace(/[\/\.#\[\]]/g, '_') // Sanitize for Firestore doc ID
  const docRef = doc(db, PARENT_COLLECTION, modelId, SUB_COLLECTION, docId)
  
  await setDoc(docRef, {
    meshId: data.meshId,
    color: data.color,
    opacity: data.opacity ?? 1,
    createdBy: data.createdBy,
    createdAt: serverTimestamp(),
  })

  return {
    id: docId,
    meshId: data.meshId,
    color: data.color,
    opacity: data.opacity ?? 1,
    createdAt: new Date(),
    createdBy: data.createdBy,
  }
}

/**
 * Eliminar un override de material
 */
export async function deleteMaterialOverride(modelId: string, overrideId: string): Promise<void> {
  await deleteDoc(doc(db, PARENT_COLLECTION, modelId, SUB_COLLECTION, overrideId))
}

/**
 * Eliminar todos los overrides de un modelo
 */
export async function deleteAllMaterialOverrides(modelId: string): Promise<void> {
  const snapshot = await getDocs(getSubCollectionRef(modelId))
  const promises = snapshot.docs.map((d) =>
    deleteDoc(doc(db, PARENT_COLLECTION, modelId, SUB_COLLECTION, d.id))
  )
  await Promise.all(promises)
}

/**
 * Obtener todos los overrides de un modelo
 */
export async function getMaterialOverrides(modelId: string): Promise<MaterialOverride[]> {
  const snapshot = await getDocs(getSubCollectionRef(modelId))
  return snapshot.docs.map((d) =>
    parseOverrideDoc(d as unknown as { id: string; data: () => Record<string, unknown> })
  )
}

/**
 * Suscripción en tiempo real a los overrides de un modelo
 */
export function subscribeToMaterialOverrides(
  modelId: string,
  callback: (overrides: MaterialOverride[]) => void,
  onError?: (error: Error) => void
): () => void {
  return onSnapshot(
    getSubCollectionRef(modelId),
    (snapshot) => {
      const overrides = snapshot.docs.map((d) =>
        parseOverrideDoc(d as unknown as { id: string; data: () => Record<string, unknown> })
      )
      callback(overrides)
    },
    (error) => {
      console.warn('Error en suscripción materialOverrides:', error.message)
      onError?.(error)
    }
  )
}
