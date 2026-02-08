/**
 * Servicio Firebase para cotas/dimensiones de modelos 3D
 * 
 * Soporta: distancia lineal, área, circunferencia, volumen
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
import type { Dimension3D, CreateDimensionData, DimensionUnit, Point3D, MeasurementType } from '@/types/models3d'

const PARENT_COLLECTION = 'models3d'
const SUB_COLLECTION = 'dimensions'

// ============================================================================
// Document Parser (retrocompatible)
// ============================================================================

function parseDimensionDoc(docSnap: { id: string; data: () => Record<string, unknown> }): Dimension3D {
  const data = docSnap.data()
  const type = (data.type as MeasurementType) || 'distance'
  const p1 = data.p1 as Point3D
  const p2 = data.p2 as Point3D
  const points = (data.points as Point3D[]) || [p1, p2]
  const value = (data.value as number) ?? (data.length as number) ?? 0
  return {
    id: docSnap.id,
    type,
    points,
    p1,
    p2,
    value,
    length: value, // alias
    unit: data.unit as DimensionUnit,
    label: (data.label as string) || '',
    radius: data.radius as number | undefined,
    diameter: data.diameter as number | undefined,
    createdAt: data.createdAt instanceof Timestamp ? data.createdAt.toDate() : new Date(data.createdAt as string),
    createdBy: data.createdBy as string,
  }
}

// ============================================================================
// Calculation Helpers
// ============================================================================

/**
 * Distancia euclidiana entre dos puntos 3D
 */
export function calculateDistance(p1: Point3D, p2: Point3D): number {
  return Math.sqrt(
    (p2.x - p1.x) ** 2 +
    (p2.y - p1.y) ** 2 +
    (p2.z - p1.z) ** 2
  )
}

/**
 * Convierte una magnitud lineal de model-units a la unidad especificada
 */
export function convertUnit(distanceInModelUnits: number, unit: DimensionUnit): number {
  switch (unit) {
    case 'mm': return distanceInModelUnits * 1000
    case 'cm': return distanceInModelUnits * 100
    case 'm': return distanceInModelUnits
  }
}

/**
 * Convierte área (model-units²) a la unidad especificada
 */
export function convertAreaUnit(areaInModelUnits: number, unit: DimensionUnit): number {
  switch (unit) {
    case 'mm': return areaInModelUnits * 1_000_000
    case 'cm': return areaInModelUnits * 10_000
    case 'm': return areaInModelUnits
  }
}

/**
 * Convierte volumen (model-units³) a la unidad especificada
 */
export function convertVolumeUnit(volumeInModelUnits: number, unit: DimensionUnit): number {
  switch (unit) {
    case 'mm': return volumeInModelUnits * 1_000_000_000
    case 'cm': return volumeInModelUnits * 1_000_000
    case 'm': return volumeInModelUnits
  }
}

/**
 * Área de un polígono 3D definido por 3+ puntos.
 * Usa la fórmula del producto cruzado (funciona con puntos no coplanarios aprox.)
 */
export function calculatePolygonArea(points: Point3D[]): number {
  if (points.length < 3) return 0
  // Newell's method for 3D polygon area
  let nx = 0, ny = 0, nz = 0
  for (let i = 0; i < points.length; i++) {
    const cur = points[i]!
    const next = points[(i + 1) % points.length]!
    nx += (cur.y - next.y) * (cur.z + next.z)
    ny += (cur.z - next.z) * (cur.x + next.x)
    nz += (cur.x - next.x) * (cur.y + next.y)
  }
  return 0.5 * Math.sqrt(nx * nx + ny * ny + nz * nz)
}

/**
 * Calcula el centro y radio del círculo que pasa por 3 puntos en 3D.
 * Devuelve null si los puntos son colineares.
 */
export function calculateCircleFrom3Points(
  a: Point3D, b: Point3D, c: Point3D
): { center: Point3D; radius: number; normal: Point3D } | null {
  // Vectores AB y AC
  const AB = { x: b.x - a.x, y: b.y - a.y, z: b.z - a.z }
  const AC = { x: c.x - a.x, y: c.y - a.y, z: c.z - a.z }

  // Normal del plano (AB × AC)
  const N = {
    x: AB.y * AC.z - AB.z * AC.y,
    y: AB.z * AC.x - AB.x * AC.z,
    z: AB.x * AC.y - AB.y * AC.x,
  }
  const nLen = Math.sqrt(N.x ** 2 + N.y ** 2 + N.z ** 2)
  if (nLen < 1e-10) return null // Colineares

  // Para encontrar el centro: resolver el sistema de ecus de la mediatriz
  // El centro está a igual distancia de los 3 puntos
  const abMid = { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2, z: (a.z + b.z) / 2 }
  const acMid = { x: (a.x + c.x) / 2, y: (a.y + c.y) / 2, z: (a.z + c.z) / 2 }

  // Bisector directions (perpendiculares a AB y AC dentro del plano)
  const bisAB = cross(AB, N)
  const bisAC = cross(AC, N)

  // Parametric intersection: abMid + s*bisAB = acMid + t*bisAC
  // Resolver para s usando least squares
  // abMid + s*bisAB - acMid = t*bisAC
  const d = { x: acMid.x - abMid.x, y: acMid.y - abMid.y, z: acMid.z - abMid.z }
  
  // s = dot(d × bisAC, bisAB × bisAC) / |bisAB × bisAC|²
  const crossBis = cross(bisAB, bisAC)
  const crossBisLen2 = crossBis.x ** 2 + crossBis.y ** 2 + crossBis.z ** 2
  if (crossBisLen2 < 1e-15) return null
  
  const dCrossBisAC = cross(d, bisAC)
  const s = dot3(dCrossBisAC, crossBis) / crossBisLen2

  const center: Point3D = {
    x: abMid.x + s * bisAB.x,
    y: abMid.y + s * bisAB.y,
    z: abMid.z + s * bisAB.z,
  }

  const radius = calculateDistance(center, a)

  return {
    center,
    radius,
    normal: { x: N.x / nLen, y: N.y / nLen, z: N.z / nLen },
  }
}

function cross(a: Point3D, b: Point3D): Point3D {
  return {
    x: a.y * b.z - a.z * b.y,
    y: a.z * b.x - a.x * b.z,
    z: a.x * b.y - a.y * b.x,
  }
}

function dot3(a: Point3D, b: Point3D): number {
  return a.x * b.x + a.y * b.y + a.z * b.z
}

/**
 * Volumen del bounding box entre 2 puntos diagonales opuestos
 */
export function calculateBoxVolume(p1: Point3D, p2: Point3D): number {
  return Math.abs(p2.x - p1.x) * Math.abs(p2.y - p1.y) * Math.abs(p2.z - p1.z)
}

/**
 * Formatea un valor de medición para display
 */
export function formatMeasurement(value: number, unit: DimensionUnit, type: MeasurementType): string {
  const suffix = type === 'area' ? `${unit}²` : type === 'volume' ? `${unit}³` : unit
  if (value >= 1000) return `${value.toFixed(0)} ${suffix}`
  if (value >= 10) return `${value.toFixed(1)} ${suffix}`
  if (value >= 1) return `${value.toFixed(2)} ${suffix}`
  return `${value.toFixed(3)} ${suffix}`
}

/** Número de puntos necesarios para cada tipo de medición */
export function getRequiredPoints(type: MeasurementType): number | 'multi' {
  switch (type) {
    case 'distance': return 2
    case 'circumference': return 3
    case 'volume': return 2
    case 'area': return 'multi' // 3+ con cierre manual
  }
}

// ============================================================================
// CRUD
// ============================================================================

/**
 * Crear una medición para un modelo
 */
export async function createDimension(
  modelId: string,
  data: CreateDimensionData
): Promise<Dimension3D> {
  const dimId = generateId()
  const colRef = collection(db, PARENT_COLLECTION, modelId, SUB_COLLECTION)
  const docRef = doc(colRef, dimId)

  const type = data.type || 'distance'
  const points = data.points || [data.p1, data.p2]
  const value = data.value ?? data.length

  await setDoc(docRef, {
    type,
    points,
    p1: data.p1,
    p2: data.p2,
    value,
    length: value, // retrocompat
    unit: data.unit,
    label: data.label || '',
    ...(data.radius != null ? { radius: data.radius } : {}),
    ...(data.diameter != null ? { diameter: data.diameter } : {}),
    createdBy: data.createdBy,
    createdAt: serverTimestamp(),
  })

  return {
    id: dimId,
    type,
    points,
    p1: data.p1,
    p2: data.p2,
    value,
    length: value,
    unit: data.unit,
    label: data.label || '',
    radius: data.radius,
    diameter: data.diameter,
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
  return onSnapshot(
    q,
    (snapshot) => {
      const dims = snapshot.docs.map((d) =>
        parseDimensionDoc(d as unknown as { id: string; data: () => Record<string, unknown> })
      )
      callback(dims)
    },
    (error) => {
      console.warn('Error en suscripción dimensions:', error.message)
    }
  )
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
