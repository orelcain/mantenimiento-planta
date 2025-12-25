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
import type { Equipment } from '@/types'
import { generateId } from '@/lib/utils'

const COLLECTION = 'equipment'

// Crear equipo
export async function createEquipment(
  data: Omit<Equipment, 'id' | 'createdAt' | 'updatedAt'>
): Promise<Equipment> {
  const id = generateId()
  
  const equipment: Equipment = {
    ...data,
    id,
    createdAt: new Date(),
    updatedAt: new Date(),
  }

  await setDoc(doc(db, COLLECTION, id), {
    ...equipment,
    createdAt: serverTimestamp(),
    updatedAt: serverTimestamp(),
  })

  return equipment
}

// Obtener equipo por ID
export async function getEquipmentById(id: string): Promise<Equipment | null> {
  const docRef = doc(db, COLLECTION, id)
  const docSnap = await getDoc(docRef)
  
  if (!docSnap.exists()) {
    return null
  }

  return parseEquipmentDoc(docSnap)
}

// Obtener equipo por código
export async function getEquipmentByCode(codigo: string): Promise<Equipment | null> {
  const q = query(collection(db, COLLECTION), where('codigo', '==', codigo))
  const snapshot = await getDocs(q)
  
  if (snapshot.empty || !snapshot.docs[0]) {
    return null
  }

  return parseEquipmentDoc(snapshot.docs[0])
}

// Obtener todos los equipos
export async function getEquipments(filters?: {
  zoneId?: string
  estado?: Equipment['estado']
  criticidad?: Equipment['criticidad']
}): Promise<Equipment[]> {
  let q = query(collection(db, COLLECTION), orderBy('nombre'))

  if (filters?.zoneId) {
    q = query(collection(db, COLLECTION), where('zoneId', '==', filters.zoneId), orderBy('nombre'))
  }

  if (filters?.estado) {
    q = query(collection(db, COLLECTION), where('estado', '==', filters.estado), orderBy('nombre'))
  }

  if (filters?.criticidad) {
    q = query(collection(db, COLLECTION), where('criticidad', '==', filters.criticidad), orderBy('nombre'))
  }

  const snapshot = await getDocs(q)
  return snapshot.docs.map(parseEquipmentDoc)
}

// Obtener equipos por zona
export async function getEquipmentsByZone(zoneId: string): Promise<Equipment[]> {
  return getEquipments({ zoneId })
}

// Actualizar equipo
export async function updateEquipment(
  id: string,
  data: Partial<Omit<Equipment, 'id' | 'createdAt'>>
): Promise<void> {
  const docRef = doc(db, COLLECTION, id)

  await updateDoc(docRef, {
    ...data,
    updatedAt: serverTimestamp(),
  })
}

// Eliminar equipo
export async function deleteEquipment(id: string): Promise<void> {
  await deleteDoc(doc(db, COLLECTION, id))
}

// Cambiar estado del equipo
export async function setEquipmentStatus(
  id: string,
  estado: Equipment['estado']
): Promise<void> {
  await updateEquipment(id, { estado })
}

// Helper para parsear documentos
import type { DocumentSnapshot, QueryDocumentSnapshot } from 'firebase/firestore'

function parseEquipmentDoc(doc: DocumentSnapshot | QueryDocumentSnapshot): Equipment {
  const data = doc.data()
  if (!data) {
    throw new Error(`Equipment document ${doc.id} has no data`)
  }
  
  return {
    ...data,
    id: doc.id,
    createdAt: toDate(data.createdAt),
    updatedAt: toDate(data.updatedAt),
    fechaInstalacion: toDate(data.fechaInstalacion),
  } as Equipment
}

function toDate(value: unknown): Date | undefined {
  if (!value) return undefined
  if (value instanceof Timestamp) return value.toDate()
  if (value instanceof Date) return value
  if (typeof value === 'string' || typeof value === 'number') return new Date(value)
  return undefined
}
