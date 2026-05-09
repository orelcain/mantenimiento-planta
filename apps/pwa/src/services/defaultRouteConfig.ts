/**
 * defaultRouteConfig — Firestore service para la página por defecto del home.
 *
 * Documento: appConfig/defaultRoute
 * Shape:     { path: string }   // ruta relativa (ej. '/analisis-grader')
 *
 * Lectura: cualquier usuario autenticado.
 * Escritura: solo admin (definido en firestore.rules).
 *
 * Cuando el usuario navega a `/`, HomeRedirect lee este doc y redirige.
 * Si no hay doc o el path es inválido, fallback a DEFAULT_HOME_PATH.
 */
import { doc, getDoc, setDoc, onSnapshot, type Unsubscribe } from 'firebase/firestore'
import { db } from '@/services/firebase'

const REF = () => doc(db, 'appConfig', 'defaultRoute')

/** Path por defecto si no hay config guardada. */
export const DEFAULT_HOME_PATH = '/analisis-grader'

export interface DefaultRouteConfig {
  path: string
}

/** Carga el path actual; null si no hay config. */
export async function loadDefaultRouteConfig(): Promise<DefaultRouteConfig | null> {
  const snap = await getDoc(REF())
  if (!snap.exists()) return null
  const data = snap.data() as Partial<DefaultRouteConfig>
  if (typeof data.path !== 'string' || !data.path.startsWith('/')) return null
  return { path: data.path }
}

/** Suscripción reactiva. cb recibe null si el doc no existe o es inválido. */
export function subscribeDefaultRouteConfig(
  cb: (cfg: DefaultRouteConfig | null) => void,
): Unsubscribe {
  return onSnapshot(REF(), (snap) => {
    if (!snap.exists()) { cb(null); return }
    const data = snap.data() as Partial<DefaultRouteConfig>
    if (typeof data.path !== 'string' || !data.path.startsWith('/')) { cb(null); return }
    cb({ path: data.path })
  })
}

/** Admin: guarda la ruta por defecto. */
export async function saveDefaultRouteConfig(path: string): Promise<void> {
  if (!path.startsWith('/')) throw new Error('La ruta debe empezar con "/"')
  await setDoc(REF(), { path } satisfies DefaultRouteConfig, { merge: true })
}
