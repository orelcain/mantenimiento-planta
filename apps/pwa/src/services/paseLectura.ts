import type { User as FirebaseUser } from 'firebase/auth'
import type { User } from '@/types'
import { mensajeDeError } from '@/services/bitacora/paseBitacora'

/**
 * Pase de lectura para los nuevos (decisión de Orel 04-11-2026).
 *
 * Un solo link `/nuevos#t=<token>` deja ver, sin usuario ni contraseña y solo
 * para leer, el Centro de Aprendizaje, Repuestos completo y los monitores de
 * Filete y Eviscerado. El teléfono recibe una cuenta propia con el claim
 * `pase_lectura`: no tiene documento en `users`, la app le muestra solo esas
 * puertas y las reglas no le dejan escribir nada. Servidor: `functions/paseLectura.js`.
 */

export { mensajeDeError }

/** ¿La sesión es un pase de lectura? */
export async function esSesionDeLectura(usuario: FirebaseUser): Promise<boolean> {
  const { claims } = await usuario.getIdTokenResult()
  return claims.pase_lectura === true
}

/** El usuario de la app para un teléfono con pase de lectura (rol mínimo, sin permisos). */
export function usuarioDeLectura(uid: string): User {
  const ahora = new Date()
  return {
    id: uid,
    email: '',
    nombre: 'Invitado',
    apellido: '',
    rol: 'usuario',
    activo: true,
    createdAt: ahora,
    updatedAt: ahora,
    paseLectura: true,
  }
}

/** El token va en el `#`: no viaja al servidor de páginas ni queda en sus registros. */
export function urlDelPaseLectura(origen: string, base: string, token: string): string {
  const raiz = `${origen}${base.endsWith('/') ? base : `${base}/`}`
  return `${raiz}nuevos#t=${encodeURIComponent(token)}`
}

export function leerTokenDeHash(hash: string): string | null {
  const t = new URLSearchParams(hash.replace(/^#/, '')).get('t') ?? ''
  return /^[A-Za-z0-9_-]{16,80}$/.test(t) ? t : null
}

// ── Llamadas a la función `paseLectura` ──────────────────────────────────────

export interface EstadoPaseLectura {
  token: string
  version: number
  activo: boolean
  generadoEnMs: number | null
  generadoPorNombre: string
}

export interface MonitorDelPase {
  id: string
  titulo: string
  token: string
}

async function llamar<T>(accion: string, data: Record<string, unknown> = {}): Promise<T> {
  const [{ getFunctions, httpsCallable }, { default: app }] = await Promise.all([
    import('firebase/functions'),
    import('@/services/firebase'),
  ])
  const fn = httpsCallable(getFunctions(app, 'us-central1'), 'paseLectura')
  const r = await fn({ accion, ...data })
  return r.data as T
}

export async function entrarConPaseLectura(token: string): Promise<void> {
  const r = await llamar<{ token: string }>('entrar', { token })
  const [{ signInWithCustomToken }, { auth }] = await Promise.all([import('firebase/auth'), import('@/services/firebase')])
  await signInWithCustomToken(auth, r.token)
}

export const monitoresDelPase = () => llamar<{ monitores: MonitorDelPase[] }>('monitores').then((r) => r.monitores)

// Solo administrador
export const verPaseLectura = () => llamar<EstadoPaseLectura>('ver')
export const cambiarPaseLectura = () => llamar<EstadoPaseLectura>('cambiar')
export const activarPaseLectura = (activo: boolean) => llamar<EstadoPaseLectura>('activar', { activo })
