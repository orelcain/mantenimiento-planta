/**
 * Puerta 0 del espejo (e1.10) en Firestore:
 * - `useEspejoP0(linea, ventana)`: escucha `graderEspejo/{linea}__{fecha}/p0/{HH}` de las horas de la ventana del turno
 *   y devuelve los registros (mismo `StoredGate0Record` que el Excel). Lógica en `espejoP0.ts`.
 * - `usePedidoP0(linea)` / `pedirP0(linea)`: el botón «Actualizar causas P0» escribe `graderEspejoPedidoP0/{linea}`
 *   (`pedidoEn` = hora del servidor); la función de ingesta se lo pasa al lector en su próximo envío.
 */
import { useEffect, useMemo, useState } from 'react'
import { doc, onSnapshot, serverTimestamp, setDoc } from '@/services/firestoreTracked'
import { auth, db } from '../../firebase'
import { useSesionFirebase } from '../graderDatosHasta'
import type { StoredGate0Record } from '../graderGate0Store'
import { aMs } from './espejoEstado'
import { horasDeVentana } from './espejoCache'
import { registrosP0 } from './espejoP0'

export function useEspejoP0(linea: string | null, ventana: { startMs: number; endMs: number } | null): StoredGate0Record[] | null {
  const sesion = useSesionFirebase()
  const startMs = ventana?.startMs ?? NaN
  const endMs = ventana?.endMs ?? NaN
  const claveHoras = useMemo(
    () => horasDeVentana(Number.isFinite(startMs) ? { startMs, endMs } : null).map((h) => `${h.fecha}/${h.hh}`).join('|'),
    [startMs, endMs],
  )
  const [porDoc, setPorDoc] = useState<Record<string, string[]>>({})
  useEffect(() => {
    setPorDoc({})
    if (sesion !== 'con' || !linea || !claveHoras) return
    const bajas = claveHoras.split('|').map((k) => {
      const [fecha, hh] = k.split('/') as [string, string]
      return onSnapshot(
        doc(db, 'graderEspejo', `${linea}__${fecha}`, 'p0', hh),
        (snap) => {
          const f = snap.exists() ? snap.data()?.filas : undefined
          const filas = Array.isArray(f) ? f.filter((s): s is string => typeof s === 'string') : []
          setPorDoc((prev) => {
            if ((prev[k]?.length ?? 0) === filas.length && filas.length === 0) return prev
            return { ...prev, [k]: filas }
          })
        },
        () => { /* sin permiso o sin red: quedan las causas estimadas o el Excel */ },
      )
    })
    return () => { for (const b of bajas) b() }
  }, [sesion, linea, claveHoras])
  return useMemo(() => {
    const todas = Object.values(porDoc).flat()
    return todas.length > 0 ? registrosP0(todas) : null
  }, [porDoc])
}

export interface PedidoP0 {
  /** `pedidoEn` del último pedido (ms reales), o `null` si no hay. */
  pedidoEnMs: number | null
  pedidoNombre: string | null
}

const SIN_PEDIDO: PedidoP0 = { pedidoEnMs: null, pedidoNombre: null }

export function usePedidoP0(linea: string): PedidoP0 {
  const sesion = useSesionFirebase()
  const [v, setV] = useState<PedidoP0>(SIN_PEDIDO)
  useEffect(() => {
    if (sesion !== 'con') return
    return onSnapshot(
      doc(db, 'graderEspejoPedidoP0', linea),
      (s) => {
        const d = s.exists() ? s.data({ serverTimestamps: 'estimate' }) : null
        setV(d ? { pedidoEnMs: aMs(d.pedidoEn), pedidoNombre: typeof d.pedidoNombre === 'string' ? d.pedidoNombre : null } : SIN_PEDIDO)
      },
      () => setV(SIN_PEDIDO),
    )
  }, [linea, sesion])
  return v
}

/** «Actualizar causas P0»: la regla acepta un pedido por minuto por línea. */
export async function pedirP0(linea: string): Promise<void> {
  const u = auth.currentUser
  if (!u || u.isAnonymous) throw new Error('Inicia sesión para pedir la Puerta 0.')
  await setDoc(doc(db, 'graderEspejoPedidoP0', linea), {
    pedidoPor: u.uid,
    pedidoNombre: (u.displayName || u.email || '').slice(0, 60),
    pedidoEn: serverTimestamp(),
  })
}
