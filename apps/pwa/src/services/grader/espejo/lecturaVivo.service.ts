/**
 * Lectura en vivo a pedido (E1.4): `graderEspejoControl/{linea}` = { hasta, pedidoPor, pedidoNombre, pedidoEn }.
 * Lo escribe cualquier usuario con sesión (la regla valida que `hasta` quede entre ahora y ahora + 30 min);
 * lo lee la función de ingesta en cada envío del lector. Lógica en `lecturaVivo.ts`.
 */
import { useEffect, useState } from 'react'
import { Timestamp, doc, onSnapshot, serverTimestamp, setDoc, type FieldValue } from '@/services/firestoreTracked'
import { auth, db } from '../../firebase'
import { useSesionFirebase } from '../graderDatosHasta'
import { aMs } from './espejoEstado'
import { hastaPedido } from './lecturaVivo'

const COLECCION = 'graderEspejoControl'

export interface ControlVivo {
  /** `hasta` del último pedido (ms reales), o `null` si no hay documento. */
  hastaMs: number | null
  pedidoNombre: string | null
}

const SIN_CONTROL: ControlVivo = { hastaMs: null, pedidoNombre: null }

/** Escucha el pedido de la línea. Sin sesión no se suscribe (la regla pide `isNotAnonymous`). */
export function useControlVivo(linea: string): ControlVivo {
  const sesion = useSesionFirebase()
  const [v, setV] = useState<ControlVivo>(SIN_CONTROL)
  useEffect(() => {
    if (sesion !== 'con') return
    return onSnapshot(
      doc(db, COLECCION, linea),
      (s) => {
        const d = s.exists() ? s.data() : null
        setV(d ? { hastaMs: aMs(d.hasta), pedidoNombre: typeof d.pedidoNombre === 'string' ? d.pedidoNombre : null } : SIN_CONTROL)
      },
      () => setV(SIN_CONTROL),
    )
  }, [linea, sesion])
  return v
}

function datosPedido(hasta: Timestamp | FieldValue) {
  const u = auth.currentUser
  if (!u || u.isAnonymous) throw new Error('Inicia sesión para pedir la lectura en vivo.')
  return {
    hasta,
    pedidoPor: u.uid,
    pedidoNombre: (u.displayName || u.email || '').slice(0, 60),
    pedidoEn: serverTimestamp(),
  }
}

/** «En vivo 15 min»: el lector baja a 60 s hasta ahora + 15 min. */
export async function pedirVivo(linea: string): Promise<void> {
  await setDoc(doc(db, COLECCION, linea), datosPedido(Timestamp.fromMillis(hastaPedido(Date.now()))))
}

/** «Volver a 5 min»: hasta = hora del servidor (vencido al instante, sin depender del reloj del navegador). */
export async function terminarVivo(linea: string): Promise<void> {
  await setDoc(doc(db, COLECCION, linea), datosPedido(serverTimestamp()))
}
