/**
 * Servicios para gestión de Especificaciones Técnicas del Trabajo (ETT)
 * Almacenamiento en Firestore con métodos CRUD completos
 */

import {
  collection,
  doc,
  getDocs,
  getDoc,
  setDoc,
  updateDoc,
  deleteDoc,
  query,
  where,
  orderBy,
  limit,
  Timestamp,
  QueryConstraint,
} from 'firebase/firestore'
import { db } from '@/services/firebase'
import type { ETT, ETTAdjunto } from '@/types'
import { logger } from '@/lib/logger'

const ETT_COLLECTION = 'ett'

/**
 * Crear nueva ETT
 */
export async function createETT(ett: Omit<ETT, 'id'>): Promise<string> {
  try {
    const ettRef = doc(collection(db, ETT_COLLECTION))
    const now = new Date()

    const ettData = {
      ...ett,
      createdAt: Timestamp.fromDate(now),
      updatedAt: Timestamp.fromDate(now),
      general: {
        ...ett.general,
        fecha: Timestamp.fromDate(ett.general.fecha),
      },
      adjuntos: (ett.adjuntos || []).map(adj => ({
        ...adj,
        uploadedAt: Timestamp.fromDate(adj.uploadedAt),
      })),
    }

    await setDoc(ettRef, ettData)
    logger.info('ETT created', { id: ettRef.id })
    return ettRef.id
  } catch (error) {
    logger.error('Error creating ETT', error instanceof Error ? error : new Error(String(error)))
    throw error
  }
}

/**
 * Obtener ETT por ID
 */
export async function getETT(ettId: string): Promise<ETT | null> {
  try {
    const ettRef = doc(db, ETT_COLLECTION, ettId)
    const ettSnap = await getDoc(ettRef)

    if (!ettSnap.exists()) {
      return null
    }

    const data = ettSnap.data() as any
    return {
      id: ettSnap.id,
      ...data,
      createdAt: data.createdAt?.toDate() || new Date(),
      updatedAt: data.updatedAt?.toDate() || new Date(),
      general: {
        ...data.general,
        fecha: data.general?.fecha?.toDate() || new Date(),
      },
      adjuntos: (data.adjuntos || []).map((adj: any) => ({
        ...adj,
        uploadedAt: adj.uploadedAt?.toDate() || new Date(),
      })),
    } as ETT
  } catch (error) {
    logger.error('Error getting ETT', error instanceof Error ? error : new Error(String(error)))
    throw error
  }
}

/**
 * Listar ETT con filtros opcionales
 */
export async function listETT(filters?: {
  createdBy?: string
  estado?: string
  limit?: number
}): Promise<ETT[]> {
  try {
    const constraints: QueryConstraint[] = []

    if (filters?.createdBy) {
      constraints.push(where('createdBy', '==', filters.createdBy))
    }

    if (filters?.estado) {
      constraints.push(where('estado', '==', filters.estado))
    }

    constraints.push(orderBy('createdAt', 'desc'))

    if (filters?.limit) {
      constraints.push(limit(filters.limit))
    }

    const q = query(collection(db, ETT_COLLECTION), ...constraints)
    const querySnapshot = await getDocs(q)

    return querySnapshot.docs.map(doc => {
      const data = doc.data() as any
      return {
        id: doc.id,
        ...data,
        createdAt: data.createdAt?.toDate() || new Date(),
        updatedAt: data.updatedAt?.toDate() || new Date(),
        general: {
          ...data.general,
          fecha: data.general?.fecha?.toDate() || new Date(),
        },
        adjuntos: (data.adjuntos || []).map((adj: any) => ({
          ...adj,
          uploadedAt: adj.uploadedAt?.toDate() || new Date(),
        })),
      } as ETT
    })
  } catch (error) {
    logger.error('Error listing ETT', error instanceof Error ? error : new Error(String(error)))
    throw error
  }
}

/**
 * Actualizar ETT
 */
export async function updateETT(ettId: string, updates: Partial<ETT>): Promise<void> {
  try {
    const ettRef = doc(db, ETT_COLLECTION, ettId)

    const updateData: any = {
      ...updates,
      updatedAt: Timestamp.fromDate(new Date()),
    }

    if (updates.general) {
      updateData.general = {
        ...updates.general,
        fecha: Timestamp.fromDate(updates.general.fecha),
      }
    }

    if (updates.adjuntos) {
      updateData.adjuntos = updates.adjuntos.map(adj => ({
        ...adj,
        uploadedAt: Timestamp.fromDate(adj.uploadedAt),
      }))
    }

    await updateDoc(ettRef, updateData)
    logger.info('ETT updated', { id: ettId })
  } catch (error) {
    logger.error('Error updating ETT', error instanceof Error ? error : new Error(String(error)))
    throw error
  }
}

/**
 * Cambiar estado de ETT
 */
export async function updateETTEstado(
  ettId: string,
  estado: 'borrador' | 'en_revision' | 'aprobada' | 'completada' | 'archivada'
): Promise<void> {
  try {
    const ettRef = doc(db, ETT_COLLECTION, ettId)
    await updateDoc(ettRef, {
      estado,
      updatedAt: Timestamp.fromDate(new Date()),
    })
    logger.info('ETT estado updated', { id: ettId, estado })
  } catch (error) {
    logger.error('Error updating ETT estado', error instanceof Error ? error : new Error(String(error)))
    throw error
  }
}

/**
 * Aprobar ETT
 */
export async function approveETT(ettId: string, approvedBy: string): Promise<void> {
  try {
    const ettRef = doc(db, ETT_COLLECTION, ettId)
    await updateDoc(ettRef, {
      estado: 'aprobada',
      aprobado_por: approvedBy,
      fecha_aprobacion: Timestamp.fromDate(new Date()),
      updatedAt: Timestamp.fromDate(new Date()),
    })
    logger.info('ETT approved', { id: ettId, approvedBy })
  } catch (error) {
    logger.error('Error approving ETT', error instanceof Error ? error : new Error(String(error)))
    throw error
  }
}

/**
 * Eliminar ETT
 */
export async function deleteETT(ettId: string): Promise<void> {
  try {
    const ettRef = doc(db, ETT_COLLECTION, ettId)
    await deleteDoc(ettRef)
    logger.info('ETT deleted', { id: ettId })
  } catch (error) {
    logger.error('Error deleting ETT', error instanceof Error ? error : new Error(String(error)))
    throw error
  }
}

/**
 * Agregar adjunto a ETT
 */
export async function addETTAdjunto(ettId: string, adjunto: ETTAdjunto): Promise<void> {
  try {
    const ett = await getETT(ettId)
    if (!ett) {
      throw new Error('ETT no encontrada')
    }

    const adjuntos = [...(ett.adjuntos || []), adjunto]
    await updateETT(ettId, { adjuntos })
    logger.info('Adjunto added to ETT', { ettId, adjuntoId: adjunto.id })
  } catch (error) {
    logger.error('Error adding adjunto to ETT', error instanceof Error ? error : new Error(String(error)))
    throw error
  }
}

/**
 * Remover adjunto de ETT
 */
export async function removeETTAdjunto(ettId: string, adjuntoId: string): Promise<void> {
  try {
    const ett = await getETT(ettId)
    if (!ett) {
      throw new Error('ETT no encontrada')
    }

    const adjuntos = (ett.adjuntos || []).filter(a => a.id !== adjuntoId)
    await updateETT(ettId, { adjuntos })
    logger.info('Adjunto removed from ETT', { ettId, adjuntoId })
  } catch (error) {
    logger.error('Error removing adjunto from ETT', error instanceof Error ? error : new Error(String(error)))
    throw error
  }
}
