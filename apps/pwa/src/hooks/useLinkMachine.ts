/**
 * useLinkMachine — Vincular/desvincular equipos SAP con máquinas manuales
 *
 * Escribe linkedMachineId en hierarchy/ y actualiza hierarchyNodeId en machines/.
 */

import { useState, useCallback } from 'react'
import { doc, updateDoc, deleteField, getDoc, Timestamp } from 'firebase/firestore'
import { db } from '@/services/firebase'
import { invalidateEquipmentCache } from '@/hooks/useEquipmentForArea'

export function useLinkMachine() {
  const [loading, setLoading] = useState(false)

  const linkMachine = useCallback(async (sapNodeId: string, machineId: string) => {
    setLoading(true)
    try {
      // 1. Escribir linkedMachineId en el nodo de jerarquía
      await updateDoc(doc(db, 'hierarchy', sapNodeId), {
        linkedMachineId: machineId,
        actualizadoEn: Timestamp.now(),
      })

      // 2. Actualizar hierarchyNodeId de la máquina (bidireccional)
      const sapDoc = await getDoc(doc(db, 'hierarchy', sapNodeId))
      const parentAreaId = sapDoc.data()?.parentId
      if (parentAreaId) {
        await updateDoc(doc(db, 'machines', machineId), {
          hierarchyNodeId: parentAreaId,
          updatedAt: Timestamp.now(),
        })
      }

      // 3. Invalidar cache del área padre
      if (parentAreaId) invalidateEquipmentCache(parentAreaId)
    } finally {
      setLoading(false)
    }
  }, [])

  const unlinkMachine = useCallback(async (sapNodeId: string) => {
    setLoading(true)
    try {
      // Obtener el machineId antes de borrar para limpiar el lado inverso
      const sapDoc = await getDoc(doc(db, 'hierarchy', sapNodeId))
      const data = sapDoc.data()
      const machineId = data?.linkedMachineId
      const parentAreaId = data?.parentId

      // 1. Borrar linkedMachineId del nodo de jerarquía
      await updateDoc(doc(db, 'hierarchy', sapNodeId), {
        linkedMachineId: deleteField(),
        actualizadoEn: Timestamp.now(),
      })

      // 2. Limpiar hierarchyNodeId de la máquina
      if (machineId) {
        await updateDoc(doc(db, 'machines', machineId), {
          hierarchyNodeId: deleteField(),
          updatedAt: Timestamp.now(),
        })
      }

      // 3. Invalidar cache
      if (parentAreaId) invalidateEquipmentCache(parentAreaId)
    } finally {
      setLoading(false)
    }
  }, [])

  /** Soft-delete: marca la máquina como inactiva (los repuestos siguen accesibles) */
  const softDeleteMachine = useCallback(async (machineId: string) => {
    await updateDoc(doc(db, 'machines', machineId), {
      activa: false,
      updatedAt: Timestamp.now(),
    })
  }, [])

  return { linkMachine, unlinkMachine, softDeleteMachine, loading }
}
