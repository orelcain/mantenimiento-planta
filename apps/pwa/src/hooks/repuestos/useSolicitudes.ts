/**
 * useSolicitudes — Solicitudes de repuestos (rediseño área-first, Fase 6).
 *
 * Colección Firestore:
 *   solicitudes_repuestos/{id} → codigoSAP, textoBreve, cantidad,
 *     estado (pendiente|aprobada|entregada), solicitadoPor(Nombre), observaciones?, createdAt
 *
 * Lista en vivo (onSnapshot) ordenada por fecha desc + alta + avance de estado.
 * Firestore SIN ignoreUndefinedProperties → se stripea `observaciones` si va vacío.
 */
import { useState, useEffect, useCallback, useMemo } from 'react'
import {
  collection,
  doc,
  addDoc,
  updateDoc,
  onSnapshot,
  query,
  orderBy,
  serverTimestamp,
  Timestamp,
} from 'firebase/firestore'
import { db } from '@/services/firebase'
import { logger } from '@/lib/logger'

export type SolicitudEstado = 'pendiente' | 'aprobada' | 'entregada'

export interface SolicitudRepuesto {
  id: string
  codigoSAP: string
  textoBreve: string
  cantidad: number
  estado: SolicitudEstado
  solicitadoPor: string
  solicitadoPorNombre: string
  observaciones?: string
  createdAt: Date
}

export interface NuevaSolicitud {
  codigoSAP: string
  textoBreve: string
  cantidad: number
  observaciones?: string
}

const SOLICITUDES_COL = 'solicitudes_repuestos'

/** Orden de avance del estado: pendiente → aprobada → entregada. */
export const ESTADO_SIGUIENTE: Record<SolicitudEstado, SolicitudEstado | null> = {
  pendiente: 'aprobada',
  aprobada: 'entregada',
  entregada: null,
}

function tsToDate(ts: Timestamp | Date | undefined | null): Date {
  if (!ts) return new Date()
  if (ts instanceof Date) return ts
  if (typeof ts === 'object' && 'toDate' in ts) return ts.toDate()
  return new Date()
}

export function useSolicitudes() {
  const [solicitudes, setSolicitudes] = useState<SolicitudRepuesto[]>([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    const q = query(collection(db, SOLICITUDES_COL), orderBy('createdAt', 'desc'))
    const unsub = onSnapshot(
      q,
      (snap) => {
        setSolicitudes(
          snap.docs.map((d) => {
            const data = d.data()
            return {
              id: d.id,
              codigoSAP: data.codigoSAP || '',
              textoBreve: data.textoBreve || '',
              cantidad: data.cantidad ?? 0,
              estado: (data.estado as SolicitudEstado) || 'pendiente',
              solicitadoPor: data.solicitadoPor || '',
              solicitadoPorNombre: data.solicitadoPorNombre || '',
              observaciones: data.observaciones || undefined,
              createdAt: tsToDate(data.createdAt),
            }
          }),
        )
        setLoading(false)
      },
      (err) => {
        if (err?.code !== 'permission-denied') {
          logger.error('Error cargando solicitudes', err instanceof Error ? err : new Error(String(err)))
        }
        setLoading(false)
      },
    )
    return () => unsub()
  }, [])

  const crearSolicitud = useCallback(async (data: NuevaSolicitud, userId: string, userName: string) => {
    const payload: Record<string, unknown> = {
      codigoSAP: data.codigoSAP.trim(),
      textoBreve: data.textoBreve || '',
      cantidad: Math.max(1, Math.round(data.cantidad || 1)),
      estado: 'pendiente',
      solicitadoPor: userId,
      solicitadoPorNombre: userName,
      createdAt: serverTimestamp(),
    }
    const obs = data.observaciones?.trim()
    if (obs) payload.observaciones = obs // stripeado si vacío (Firestore sin ignoreUndefinedProperties)
    await addDoc(collection(db, SOLICITUDES_COL), payload)
  }, [])

  const avanzarEstado = useCallback(async (id: string, estado: SolicitudEstado) => {
    await updateDoc(doc(db, SOLICITUDES_COL, id), { estado })
  }, [])

  const pendientesCount = useMemo(
    () => solicitudes.filter((s) => s.estado === 'pendiente').length,
    [solicitudes],
  )

  return { solicitudes, loading, pendientesCount, crearSolicitud, avanzarEstado }
}
