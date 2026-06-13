/**
 * useRepuestoCrud — CRUD de repuestos por *path explícito* (machine-agnóstico).
 *
 * A diferencia de `useEquipmentRepuestos` (acoplado a un nodeId+machineId con
 * listeners onSnapshot), este hook opera contra una colección arbitraria pasada
 * por argumento (`machines/{id}/repuestos` o `hierarchy/{nodeId}/repuestos`).
 * Pensado para el hub área-first, donde cada fila agregada puede resolver a un
 * doc `Repuesto` distinto bajo una máquina distinta.
 *
 * Reusa la misma lógica de historial + auditoría + papelera que el hook legacy.
 * No mantiene estado reactivo: tras escribir, el llamador refresca su fuente
 * (p.ej. `invalidateGlobalRepuestosCache()` + `loadAll()`).
 */
import { useCallback } from 'react'
import {
  collection,
  doc,
  getDoc,
  getDocs,
  addDoc,
  updateDoc,
  deleteDoc,
  query,
  orderBy,
  Timestamp,
  writeBatch,
} from 'firebase/firestore'
import { db } from '@/services/firebase'
import { logger } from '@/lib/logger'
import { useAuthStore } from '@/store/authStore'
import { writeAuditLog, moveToTrash } from '@/services/auditLog'
import type { Repuesto, RepuestoFormData, HistorialCambio } from '@/types/repuestos'

export function useRepuestoCrud() {
  const authUser = useAuthStore((s) => s.user)
  const userName = `${authUser?.nombre || ''} ${authUser?.apellido || ''}`.trim()

  // ── Historial ──
  const addHistorial = useCallback(async (
    colPath: string,
    repuestoId: string,
    campo: string,
    valorAnterior: string | number | null | undefined,
    valorNuevo: string | number | null | undefined,
  ) => {
    try {
      await addDoc(collection(db, `${colPath}/${repuestoId}/historial`), {
        campo,
        valorAnterior: valorAnterior ?? null,
        valorNuevo: valorNuevo ?? null,
        fecha: Timestamp.now(),
      })
    } catch (err) {
      logger.error('Error adding historial', err instanceof Error ? err : new Error(String(err)))
    }
  }, [])

  // ── Crear ──
  /** `extra`: campos adicionales del modelo plano (equipos, equiposCodigos, parentRepuestoId…). */
  const createRepuesto = useCallback(async (
    colPath: string,
    data: RepuestoFormData,
    extra?: Record<string, unknown>,
  ): Promise<string> => {
    const newRepuesto = {
      codigoSAP: data.codigoSAP,
      codigoFabricante: data.codigoFabricante,
      textoBreve: data.textoBreve,
      descripcion: data.descripcion || '',
      nombreManual: data.nombreManual || '',
      valorUnitario: data.valorUnitario,
      cantidadPorMaquina: data.cantidadPorMaquina || 0,
      ubicacionEnPlanta: data.ubicacionEnPlanta || '',
      observaciones: data.observaciones || '',
      vinculosManual: [],
      imagenesManual: [],
      fotosReales: [],
      ...(extra || {}),
      createdAt: Timestamp.now(),
      updatedAt: Timestamp.now(),
    }
    const docRef = await addDoc(collection(db, colPath), newRepuesto)
    await addHistorial(colPath, docRef.id, 'creacion', null, JSON.stringify(data))

    writeAuditLog({
      action: 'create',
      collection: colPath,
      documentId: docRef.id,
      documentLabel: `${data.codigoSAP} — ${data.textoBreve}`,
      userId: authUser?.id || '',
      userName,
      after: newRepuesto as unknown as Record<string, unknown>,
      metadata: { source: 'area-hub' },
    })
    return docRef.id
  }, [authUser, userName, addHistorial])

  // ── Actualizar ──
  const updateRepuesto = useCallback(async (
    colPath: string,
    id: string,
    data: Partial<Repuesto>,
    originalData?: Repuesto,
  ) => {
    const updateData = { ...data, updatedAt: Timestamp.now() }
    await updateDoc(doc(db, colPath, id), updateData as Record<string, unknown>)

    if (originalData) {
      for (const key of Object.keys(data) as (keyof Repuesto)[]) {
        if (data[key] !== originalData[key]) {
          await addHistorial(colPath, id, key, originalData[key] as never, data[key] as never)
        }
      }
      writeAuditLog({
        action: 'update',
        collection: colPath,
        documentId: id,
        documentLabel: `${originalData.codigoSAP} — ${originalData.textoBreve}`,
        userId: authUser?.id || '',
        userName,
        before: originalData as unknown as Record<string, unknown>,
        after: data as unknown as Record<string, unknown>,
        metadata: { source: 'area-hub' },
      })
    }
  }, [authUser, userName, addHistorial])

  // ── Eliminar (soft delete → papelera) ──
  const deleteRepuesto = useCallback(async (colPath: string, id: string) => {
    const docRef = doc(db, colPath, id)
    const snap = await getDoc(docRef)
    if (!snap.exists()) throw new Error('Repuesto no encontrado')
    const data = snap.data()

    const historialRef = collection(db, `${colPath}/${id}/historial`)
    const historialSnap = await getDocs(historialRef)
    const historialData = historialSnap.docs.map(h => ({ id: h.id, ...h.data() }))

    await moveToTrash({
      originalCollection: colPath,
      originalId: id,
      documentLabel: `${data.codigoSAP || ''} — ${data.textoBreve || ''}`,
      data: data as Record<string, unknown>,
      subcollections: historialData.length > 0 ? { historial: historialData } : undefined,
      userId: authUser?.id || '',
      userName,
      metadata: { source: 'area-hub' },
    })

    if (!historialSnap.empty) {
      const batch = writeBatch(db)
      historialSnap.docs.forEach(d => batch.delete(d.ref))
      await batch.commit()
    }
    await deleteDoc(docRef)
  }, [authUser, userName])

  // ── Historial de un repuesto ──
  const getHistorial = useCallback(async (colPath: string, repuestoId: string): Promise<HistorialCambio[]> => {
    try {
      const q = query(collection(db, `${colPath}/${repuestoId}/historial`), orderBy('fecha', 'desc'))
      const snap = await getDocs(q)
      return snap.docs.map(d => ({
        id: d.id,
        repuestoId,
        ...d.data(),
        fecha: d.data().fecha?.toDate?.() || new Date(),
      })) as HistorialCambio[]
    } catch (err) {
      logger.error('Error getting historial', err instanceof Error ? err : new Error(String(err)))
      return []
    }
  }, [])

  return { createRepuesto, updateRepuesto, deleteRepuesto, getHistorial }
}
