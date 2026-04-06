/**
 * useEquipmentRepuestos — Hook combinado para repuestos por equipo
 *
 * Combina dos fuentes:
 *  - `hierarchy/{nodeId}/repuestos`       → propios del equipo (source: 'own')
 *  - `machines/{linkedMachineId}/repuestos` → heredados de la máquina (source: 'shared')
 *
 * El resultado es una vista unificada donde cada repuesto sabe su origen,
 * permitiendo crear, editar y eliminar en la colección correcta.
 */

import { useState, useEffect, useCallback, useMemo } from 'react'
import {
  collection,
  doc,
  getDoc,
  getDocs,
  addDoc,
  updateDoc,
  deleteDoc,
  onSnapshot,
  query,
  orderBy,
  Timestamp,
  writeBatch,
} from 'firebase/firestore'
import { db } from '@/services/firebase'
import { useAuthStore } from '@/store/authStore'
import { writeAuditLog, moveToTrash } from '@/services/auditLog'
import type {
  Repuesto,
  EquipmentRepuesto,
  RepuestoSource,
  HistorialCambio,
  RepuestoFormData,
} from '@/types/repuestos'

// ── Helpers ──────────────────────────────────────────────────────

function mapDoc(docSnap: { id: string; data: () => any }, source: RepuestoSource, colPath: string): EquipmentRepuesto {
  const d = docSnap.data()
  return {
    id: docSnap.id,
    ...d,
    codigoFabricante: d.codigoFabricante || d.codigoBaader || '',
    createdAt: d.createdAt?.toDate?.() || new Date(),
    updatedAt: d.updatedAt?.toDate?.() || new Date(),
    source,
    sourceCollection: colPath,
  } as EquipmentRepuesto
}

// ── Hook principal ───────────────────────────────────────────────

export function useEquipmentRepuestos(
  nodeId: string | null,
  linkedMachineId: string | null | undefined,
) {
  const [ownRepuestos, setOwnRepuestos] = useState<EquipmentRepuesto[]>([])
  const [sharedRepuestos, setSharedRepuestos] = useState<EquipmentRepuesto[]>([])
  const [loadingOwn, setLoadingOwn] = useState(true)
  const [loadingShared, setLoadingShared] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const authUser = useAuthStore((s) => s.user)

  const ownPath = nodeId ? `hierarchy/${nodeId}/repuestos` : null
  const sharedPath = linkedMachineId ? `machines/${linkedMachineId}/repuestos` : null

  // Limpiar error al cambiar de equipo
  useEffect(() => { setError(null) }, [nodeId, linkedMachineId])

  // ── Listener: repuestos propios (hierarchy/{nodeId}/repuestos) ──
  // Tolerante a fallos: si las rules aún no están desplegadas, sigue sin bloquear
  useEffect(() => {
    if (!ownPath) { setOwnRepuestos([]); setLoadingOwn(false); return }

    const q = query(collection(db, ownPath), orderBy('codigoSAP'))
    const unsub = onSnapshot(q,
      (snap) => {
        setOwnRepuestos(snap.docs.map(d => mapDoc(d, 'own', ownPath)))
        setLoadingOwn(false)
      },
      (err) => {
        // permission-denied es esperado si rules no desplegadas aún
        if (err.code === 'permission-denied') {
          console.warn('[useEquipmentRepuestos] Sin permisos para repuestos propios (deploy rules pendiente)')
        } else {
          console.error('Error own repuestos:', err)
        }
        setOwnRepuestos([])
        setLoadingOwn(false)
      },
    )
    return () => unsub()
  }, [ownPath])

  // ── Listener: repuestos heredados (machines/{id}/repuestos) ──
  useEffect(() => {
    if (!sharedPath) { setSharedRepuestos([]); setLoadingShared(false); return }

    const q = query(collection(db, sharedPath), orderBy('codigoSAP'))
    const unsub = onSnapshot(q,
      (snap) => {
        setSharedRepuestos(snap.docs.map(d => mapDoc(d, 'shared', sharedPath)))
        setLoadingShared(false)
      },
      (err) => {
        if (err.code === 'permission-denied') {
          console.warn('[useEquipmentRepuestos] Sin permisos para repuestos compartidos')
        } else {
          console.error('Error shared repuestos:', err)
          setError(err.message)
        }
        setSharedRepuestos([])
        setLoadingShared(false)
      },
    )
    return () => unsub()
  }, [sharedPath])

  // ── Vista combinada ──
  const repuestos = useMemo(() => {
    // Propios primero, luego compartidos
    return [...ownRepuestos, ...sharedRepuestos]
  }, [ownRepuestos, sharedRepuestos])

  const loading = loadingOwn || loadingShared

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
      console.error('Error adding historial:', err)
    }
  }, [])

  // ── Crear repuesto propio (default) ──
  const createRepuesto = useCallback(async (
    data: RepuestoFormData,
    target: 'own' | 'shared' = 'own',
  ): Promise<string> => {
    const colPath = target === 'own' ? ownPath : sharedPath
    if (!colPath) throw new Error('No hay colección destino disponible')

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
      userName: `${authUser?.nombre || ''} ${authUser?.apellido || ''}`.trim(),
      after: newRepuesto as unknown as Record<string, unknown>,
      metadata: { nodeId: nodeId || '', target },
    })

    return docRef.id
  }, [ownPath, sharedPath, nodeId, authUser, addHistorial])

  // ── Crear en múltiples nodos hermanos ──
  const createInMultipleNodes = useCallback(async (
    data: RepuestoFormData,
    targetNodeIds: string[],
  ): Promise<number> => {
    let created = 0
    for (const nId of targetNodeIds) {
      const path = `hierarchy/${nId}/repuestos`
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
        createdAt: Timestamp.now(),
        updatedAt: Timestamp.now(),
      }
      await addDoc(collection(db, path), newRepuesto)
      created++
    }
    return created
  }, [])

  // ── Actualizar ──
  const updateRepuesto = useCallback(async (
    id: string,
    data: Partial<Repuesto>,
    source: RepuestoSource,
    originalData?: Repuesto,
  ) => {
    const colPath = source === 'own' ? ownPath : sharedPath
    if (!colPath) throw new Error('No hay colección destino')

    const updateData = { ...data, updatedAt: Timestamp.now() }
    await updateDoc(doc(db, colPath, id), updateData as any)

    if (originalData) {
      for (const key of Object.keys(data) as (keyof Repuesto)[]) {
        if (data[key] !== originalData[key]) {
          await addHistorial(colPath, id, key, originalData[key] as any, data[key] as any)
        }
      }

      writeAuditLog({
        action: 'update',
        collection: colPath,
        documentId: id,
        documentLabel: `${originalData.codigoSAP} — ${originalData.textoBreve}`,
        userId: authUser?.id || '',
        userName: `${authUser?.nombre || ''} ${authUser?.apellido || ''}`.trim(),
        before: originalData as unknown as Record<string, unknown>,
        after: data as unknown as Record<string, unknown>,
        metadata: { nodeId: nodeId || '', source },
      })
    }
  }, [ownPath, sharedPath, nodeId, authUser, addHistorial])

  // ── Eliminar (soft delete) ──
  const deleteRepuesto = useCallback(async (id: string, source: RepuestoSource) => {
    const colPath = source === 'own' ? ownPath : sharedPath
    if (!colPath) throw new Error('No hay colección destino')

    // Snapshot
    const docRef = doc(db, colPath, id)
    const snap = await getDoc(docRef)
    if (!snap.exists()) throw new Error('Repuesto no encontrado')
    const data = snap.data()

    // Historial
    const historialRef = collection(db, `${colPath}/${id}/historial`)
    const historialSnap = await getDocs(historialRef)
    const historialData = historialSnap.docs.map(h => ({ id: h.id, ...h.data() }))

    // Papelera
    await moveToTrash({
      originalCollection: colPath,
      originalId: id,
      documentLabel: `${data.codigoSAP || ''} — ${data.textoBreve || ''}`,
      data: data as Record<string, unknown>,
      subcollections: historialData.length > 0 ? { historial: historialData } : undefined,
      userId: authUser?.id || '',
      userName: `${authUser?.nombre || ''} ${authUser?.apellido || ''}`.trim(),
      metadata: { nodeId: nodeId || '', source },
    })

    // Hard delete
    if (!historialSnap.empty) {
      const batch = writeBatch(db)
      historialSnap.docs.forEach(d => batch.delete(d.ref))
      await batch.commit()
    }
    await deleteDoc(docRef)
  }, [ownPath, sharedPath, nodeId, authUser])

  // ── Historial de un repuesto ──
  const getHistorial = useCallback(async (repuestoId: string, source: RepuestoSource): Promise<HistorialCambio[]> => {
    const colPath = source === 'own' ? ownPath : sharedPath
    if (!colPath) return []

    try {
      const q = query(
        collection(db, `${colPath}/${repuestoId}/historial`),
        orderBy('fecha', 'desc'),
      )
      const snap = await getDocs(q)
      return snap.docs.map(d => ({
        id: d.id,
        repuestoId,
        ...d.data(),
        fecha: d.data().fecha?.toDate?.() || new Date(),
      })) as HistorialCambio[]
    } catch (err) {
      console.error('Error getting historial:', err)
      return []
    }
  }, [ownPath, sharedPath])

  return {
    repuestos,
    ownRepuestos,
    sharedRepuestos,
    loading,
    error,
    hasOwnPath: !!ownPath,
    hasSharedPath: !!sharedPath,
    createRepuesto,
    createInMultipleNodes,
    updateRepuesto,
    deleteRepuesto,
    getHistorial,
  }
}
