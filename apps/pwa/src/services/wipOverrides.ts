/**
 * wipOverrides — Firestore service para controlar qué módulos
 * tienen la banda "en desarrollo" activa.
 *
 * Documento: appConfig/wipOverrides
 * Shape:     { released: string[] }   // IDs de tiles liberados por admin
 */
import { doc, getDoc, setDoc, onSnapshot, type Unsubscribe } from 'firebase/firestore'
import { db } from '@/services/firebase'

const REF = () => doc(db, 'appConfig', 'wipOverrides')

/** Devuelve el Set de IDs que ya han sido liberados (ribbon apagado) */
export async function getWipReleased(): Promise<Set<string>> {
  const snap = await getDoc(REF())
  if (!snap.exists()) return new Set()
  const data = snap.data() as { released?: string[] }
  return new Set(data.released ?? [])
}

/** Suscripción reactiva — llama a `cb` con el Set actualizado */
export function subscribeWipReleased(cb: (ids: Set<string>) => void): Unsubscribe {
  return onSnapshot(REF(), (snap) => {
    if (!snap.exists()) { cb(new Set()); return }
    const data = snap.data() as { released?: string[] }
    cb(new Set(data.released ?? []))
  })
}

/** Admin: marca un tile como liberado (ribbon desaparece) */
export async function releaseModule(tileId: string): Promise<void> {
  const current = await getWipReleased()
  current.add(tileId)
  await setDoc(REF(), { released: [...current] }, { merge: true })
}

/** Admin: vuelve a marcar un tile como WIP (ribbon reaparece) */
export async function unReleaseModule(tileId: string): Promise<void> {
  const current = await getWipReleased()
  current.delete(tileId)
  await setDoc(REF(), { released: [...current] }, { merge: true })
}
