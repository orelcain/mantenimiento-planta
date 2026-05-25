/**
 * shoplogixCredentials.service.ts — gestión de credenciales Shoplogix.
 *
 * Las credenciales (Firestore `system/shoplogixCredentials`) las usa el backend
 * (Cloud Functions, Admin SDK) para auto-login ROPC contra Shoplogix.
 *
 * Seguridad (endurecido 2026-05-25):
 *   - La regla Firestore del doc es `if false`: NINGÚN cliente lee/escribe directo.
 *   - Toda gestión va por Cloud Functions callable que valida `rol === 'admin'`
 *     server-side (shoplogixCredsGet / shoplogixCredsSet / shoplogixCredsDelete).
 *   - La PASSWORD nunca sale al cliente: el callable de lectura solo devuelve
 *     metadata (user, hasPassword, setAt).
 */

import { httpsCallable, getFunctions } from 'firebase/functions'
import app from '../firebase'
import { logger } from '@/lib/logger'

/** Metadata no-sensible de las credenciales (sin password). */
export interface ShoplogixCredentialsInfo {
  user: string | null
  /** True si hay password configurada. La pass nunca sale del backend. */
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
 * Lee metadata de las credenciales (sin password) vía callable admin-only.
 * Retorna `{ user: null, hasPassword: false, setAt: null }` si no hay creds.
 */
export async function getShoplogixCredentialsInfo(): Promise<ShoplogixCredentialsInfo> {
  try {
    const fn = httpsCallable<void, ShoplogixCredentialsInfo>(getFunctions(app), 'shoplogixCredsGet')
    const res = await fn()
    return res.data
  } catch (err) {
    logger.error('[shoplogixCredentials] Error leyendo credenciales:', err instanceof Error ? err : new Error(String(err)))
    throw err
  }
}

/**
 * Guarda las credenciales vía callable admin-only. La validación client-side es
 * defensiva; la autoridad real es el check de admin en el Cloud Function.
 */
export async function saveShoplogixCredentials({ user, password }: ShoplogixCredentialsUpdate): Promise<void> {
  if (!user || !user.includes('@')) {
    throw new Error('Usuario debe ser un email válido')
  }
  if (!password || password.length < 4) {
    throw new Error('Contraseña debe tener al menos 4 caracteres')
  }
  const fn = httpsCallable<ShoplogixCredentialsUpdate, { ok: boolean }>(getFunctions(app), 'shoplogixCredsSet')
  await fn({ user: user.trim(), password })
}

/**
 * Borra las credenciales vía callable admin-only — vuelve al modo cookie legado.
 */
export async function deleteShoplogixCredentials(): Promise<void> {
  const fn = httpsCallable<void, { ok: boolean }>(getFunctions(app), 'shoplogixCredsDelete')
  await fn()
}
