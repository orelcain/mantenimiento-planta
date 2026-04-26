import { collection, getDocs, query, orderBy } from '@/services/firestoreTracked'
import { db } from '@/services/firebase'
import { logger } from '@/lib/logger'

export interface HistorialCambio {
  id: string
  repuestoId: string
  campo: string
  valorAnterior: string | number | null
  valorNuevo: string | number | null
  fecha: Date
}

/**
 * Obtener historial de cambios de un repuesto
 */
export async function getHistorial(repuestoId: string, machineId: string): Promise<HistorialCambio[]> {
  try {
    const collectionPath = `machines/${machineId}/repuestos/${repuestoId}/historial`
    const q = query(collection(db, collectionPath), orderBy('fecha', 'desc'))
    const snapshot = await getDocs(q)

    return snapshot.docs.map((doc) => ({
      id: doc.id,
      repuestoId,
      ...doc.data(),
      fecha: doc.data().fecha?.toDate() || new Date(),
    })) as HistorialCambio[]
  } catch (err) {
    logger.error('Error getting historial', err instanceof Error ? err : new Error(String(err)))
    return []
  }
}
