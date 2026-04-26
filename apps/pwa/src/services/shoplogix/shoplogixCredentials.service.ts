/**
 * shoplogixCredentials.service.ts — gestión de credenciales Shoplogix.
 *
 * Permite a admins guardar / leer / borrar las credenciales que las Cloud
 * Functions usan para auto-login ROPC contra la API de Shoplogix.
 *
 * Estructura Firestore (`system/shoplogixCredentials`):
 *   user:     string  — email Shoplogix (ej: javier.toro@aquachile.com)
 *   password: string  — contraseña en texto plano (cifrada en reposo por GCP)
 *   set_at:   Timestamp — cuándo se guardaron (para mostrar "actualizado hace X")
 *
 * Acceso: regulado por Firestore rules — solo `isAdmin()` puede leer/escribir.
 *
 * Anti-patrón a evitar:
 *   NO usar este service desde código no-admin. Si el flujo lo necesita,
 *   exponer en su lugar un Cloud Function callable que valide auth y
 *   permisos server-side.
 */

import { doc, getDoc, setDoc, deleteDoc, serverTimestamp, Timestamp } from '@/services/firestoreTracked'
import { db } from '../firebase'
import { logger } from '@/lib/logger'

const CREDS_DOC_PATH = 'system/shoplogixCredentials'

/** Snapshot read del doc (info no-sensible + has_password flag). */
export interface ShoplogixCredentialsInfo {
  user: string | null
  /** True si el doc existe y tiene `password` no vacío. La pass nunca sale del back, solo se setea. */
  hasPassword: boolean
  /** Última actualización (ISO string), null si nunca se setearon. */
  setAt: string | null
}

/** Payload para actualizar credenciales. */
export interface ShoplogixCredentialsUpdate {
  user: string
  password: string
}

/**
 * Lee la metadata de las credenciales actuales (sin devolver la password al caller).
 * Útil para mostrar "user actual + actualizado hace X" en la UI admin.
 *
 * Retorna `{ user: null, hasPassword: false, setAt: null }` cuando no hay creds
 * configuradas (modo cookie legado activo).
 */
export async function getShoplogixCredentialsInfo(): Promise<ShoplogixCredentialsInfo> {
  try {
    const snap = await getDoc(doc(db, CREDS_DOC_PATH))
    if (!snap.exists()) {
      return { user: null, hasPassword: false, setAt: null }
    }
    const data = snap.data() as { user?: string; password?: string; set_at?: Timestamp }
    const setAtIso = data.set_at instanceof Timestamp
      ? data.set_at.toDate().toISOString()
      : null
    return {
      user: data.user ?? null,
      hasPassword: !!data.password,
      setAt: setAtIso,
    }
  } catch (err) {
    logger.error('[shoplogixCredentials] Error leyendo credenciales:', err)
    throw err
  }
}

/**
 * Guarda las credenciales Shoplogix. Sobreescribe las anteriores si existen.
 * El timestamp `set_at` se actualiza al `serverTimestamp()` de Firestore.
 *
 * Validaciones mínimas client-side (defensivas — la regla server-side es la
 * autoridad real):
 *   - user debe parecer un email
 *   - password no vacía y de al menos 4 chars
 */
export async function saveShoplogixCredentials({ user, password }: ShoplogixCredentialsUpdate): Promise<void> {
  if (!user || !user.includes('@')) {
    throw new Error('Usuario debe ser un email válido')
  }
  if (!password || password.length < 4) {
    throw new Error('Contraseña debe tener al menos 4 caracteres')
  }
  await setDoc(doc(db, CREDS_DOC_PATH), {
    user: user.trim(),
    password,
    set_at: serverTimestamp(),
  })
}

/**
 * Borra las credenciales — vuelve al modo cookie legado.
 * El próximo sync va a fallar con AUTH_EXPIRED si no hay token vigente.
 */
export async function deleteShoplogixCredentials(): Promise<void> {
  await deleteDoc(doc(db, CREDS_DOC_PATH))
}
