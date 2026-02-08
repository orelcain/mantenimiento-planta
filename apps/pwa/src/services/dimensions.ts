/**
 * Servicio Firebase para cotas/dimensiones de modelos 3D
 * 
 * Subcolección Firestore: models3d/{modelId}/dimensions
 */

import {
  collection,
  doc,
  setDoc,
  getDocs,
  deleteDoc,
  query,
  orderBy,
  serverTimestamp,
  onSnapshot,
  Timestamp,
} from 'firebase/firestore'
import { db } from './firebase'
import { generateId } from '@/lib/utils'
import type { Dimension3D, CreateDimensionData, DimensionUnit, Point3D } from '@/types/models3d'

const PARENT_COLLECTION = 'models3d'
const SUB_COLLECTION = 'dimensions'

// ============================================================================
// Helpers
// ============================================================================

function parseDimensionDoc(docSnap: { id: string; data: () => Record<string, unknown> }): Dimension3D {
  const data = docSnap.data()
  return {
    id: docSnap.id,
    p1: data.p1 as Point3D,
    p2: data.p2 as Point3D,
    length: data.length as number,
    unit: data.unit as DimensionUnit,
    label: (data.label as string) || '',
    createdAt: data.createdAt instanceof Timestamp ? data.createdAt.toDate() : new Date(data.createdAt as string),
    createdBy: data.createdBy as string,
  }
}

/**
 * Calcula la distancia euclidiana entre dos puntos 3D
 */
export function calculateDistance(p1: Point3D, p2: Point3D): number {
  return Math.sqrt(
    Math.pow(p2.x - p1.x, 2) +
    Math.pow(p2.y - p1.y, 2) +
    Math.pow(p2.z - p1.z, 2)
  )
}

/**
 * Convierte una distancia a la unidad especificada
 * Asume que las coordenadas del modelo están en metros (estándar glTF)
 */
export function convertUnit(distanceInModelUnits: number, unit: DimensionUnit): number {
  switch (unit) {
    case 'mm': return distanceInModelUnits * 1000
    case 'cm': return distanceInModelUnits * 100
    case 'm': return distanceInModelUnits
  }
}

/**
 * Formatea un valor de longitud para display
 */
export function formatLength(value: number, unit: DimensionUnit): string {
  if (value >= 100 && unit === 'mm') return `${value.toFixed(0)} mm`
  if (value >= 10) return `${value.toFixed(1)} ${unit}`
  return `${value.toFixed(2)} ${unit}`
}

// ============================================================================
// CRUD
// ============================================================================

/**
 * Crear una cota para un modelo
 */
export async function createDimension(
  modelId: string,
  data: CreateDimensionData
): Promise<Dimension3D> {
  const dimId = generateId()
  const colRef = collection(db, PARENT_COLLECTION, modelId, SUB_COLLECTION)
  const docRef = doc(colRef, dimId)

  await setDoc(docRef, {
    p1: data.p1,
    p2: data.p2,
    length: data.length,
    unit: data.unit,
    label: data.label || '',
    createdBy: data.createdBy,
    createdAt: serverTimestamp(),
  })

  return {
    id: dimId,
    p1: data.p1,
    p2: data.p2,
    length: data.length,
    unit: data.unit,
    label: data.label || '',
    createdAt: new Date(),
    createdBy: data.createdBy,
  }
}

/**
 * Obtener todas las cotas de un modelo
 */
export async function getDimensions(modelId: string): Promise<Dimension3D[]> {
  const q = query(
    collection(db, PARENT_COLLECTION, modelId, SUB_COLLECTION),
    orderBy('createdAt', 'desc')
  )
  const snapshot = await getDocs(q)
  return snapshot.docs.map((d) =>
    parseDimensionDoc(d as unknown as { id: string; data: () => Record<string, unknown> })
  )
}

/**
 * Suscripción en tiempo real a las cotas de un modelo
 */
export function subscribeToDimensions(
  modelId: string,
  callback: (dims: Dimension3D[]) => void
): () => void {
  const q = query(
    collection(db, PARENT_COLLECTION, modelId, SUB_COLLECTION),
    orderBy('createdAt', 'desc')
  )
  return onSnapshot(q, (snapshot) => {
    const dims = snapshot.docs.map((d) =>
      parseDimensionDoc(d as unknown as { id: string; data: () => Record<string, unknown> })
    )
    callback(dims)
  })
}

/**
 * Eliminar una cota
 */
export async function deleteDimension(modelId: string, dimensionId: string): Promise<void> {
  await deleteDoc(doc(db, PARENT_COLLECTION, modelId, SUB_COLLECTION, dimensionId))
}

/**
 * Eliminar todas las cotas de un modelo
 */
export async function deleteAllDimensions(modelId: string): Promise<void> {
  const snapshot = await getDocs(
    collection(db, PARENT_COLLECTION, modelId, SUB_COLLECTION)
  )
  const promises = snapshot.docs.map((d) =>
    deleteDoc(doc(db, PARENT_COLLECTION, modelId, SUB_COLLECTION, d.id))
  )
  await Promise.all(promises)
}
