import {
  collection,
  doc,
  getDoc,
  getDocs,
  setDoc,
  updateDoc,
  deleteDoc,
  query,
  where,
  orderBy,
  serverTimestamp,
  Timestamp,
} from 'firebase/firestore'
import { db } from './firebase'
import type { Zone } from '@/types'

const COLLECTION = 'zones'

// Crear zona
export async function createZone(
  data: Omit<Zone, 'createdAt' | 'updatedAt'> & { id: string }
): Promise<Zone> {
  const zone: Zone = {
    ...data,
    createdAt: new Date(),
    updatedAt: new Date(),
  }

  await setDoc(doc(db, COLLECTION, data.id), {
    ...zone,
    createdAt: serverTimestamp(),
    updatedAt: serverTimestamp(),
  })

  return zone
}

// Obtener zona por ID
export async function getZoneById(id: string): Promise<Zone | null> {
  const docRef = doc(db, COLLECTION, id)
  const docSnap = await getDoc(docRef)
  
  if (!docSnap.exists()) {
    return null
  }

  return parseZoneDoc(docSnap)
}

// Obtener todas las zonas
export async function getZones(filters?: {
  nivel?: 1 | 2 | 3
  parentId?: string
}): Promise<Zone[]> {
  let q = query(collection(db, COLLECTION), orderBy('id'))

  if (filters?.nivel) {
    q = query(collection(db, COLLECTION), where('nivel', '==', filters.nivel), orderBy('id'))
  }

  if (filters?.parentId) {
    q = query(collection(db, COLLECTION), where('parentId', '==', filters.parentId), orderBy('id'))
  }

  const snapshot = await getDocs(q)
  return snapshot.docs.map(parseZoneDoc)
}

// Obtener zonas nivel 1 (principales)
export async function getMainZones(): Promise<Zone[]> {
  return getZones({ nivel: 1 })
}

// Obtener subzonas de una zona padre
export async function getSubZones(parentId: string): Promise<Zone[]> {
  return getZones({ parentId })
}

// Actualizar zona
export async function updateZone(
  id: string,
  data: Partial<Omit<Zone, 'id' | 'createdAt'>>
): Promise<void> {
  const docRef = doc(db, COLLECTION, id)
  await updateDoc(docRef, {
    ...data,
    updatedAt: serverTimestamp(),
  })
}

// Eliminar zona
export async function deleteZone(id: string): Promise<void> {
  // Verificar que no tenga subzonas
  const subZones = await getSubZones(id)
  if (subZones.length > 0) {
    throw new Error('No se puede eliminar una zona que tiene subzonas')
  }

  await deleteDoc(doc(db, COLLECTION, id))
}

// Helper para parsear documentos
function parseZoneDoc(doc: any): Zone {
  const data = doc.data()
  return {
    id: doc.id,
    parentId: data.parentId || null,
    nivel: data.nivel || 1,
    nombre: data.nombre || '',
    codigo: data.codigo || data.id || '', // Compatibilidad con zonas antiguas
    tipo: data.tipo || 'otro',
    descripcion: data.descripcion || '',
    polygon: data.polygon || [],
    bounds: data.bounds || undefined,
    color: data.color || '#2196f3',
    activa: data.activa !== false,
    createdAt: toDate(data.createdAt),
    updatedAt: toDate(data.updatedAt),
  } as Zone
}

function toDate(value: any): Date {
  if (!value) return new Date()
  if (value instanceof Timestamp) return value.toDate()
  if (value instanceof Date) return value
  return new Date(value)
}
