import type { User as FirebaseUser } from 'firebase/auth'
import type { User } from '@/types'

/**
 * Pase de la Bitácora (QR + PIN personal, decisiones de Orel 16-09-2026).
 *
 * Un teléfono que entra con el QR recibe una cuenta propia con el claim
 * `pase_bitacora`. No tiene documento en `users`: la app lo reconoce por el
 * claim y le muestra SOLO la bitácora; las reglas hacen lo mismo del lado del
 * servidor. La lógica del servidor vive en `functions/paseBitacora.js`.
 */

export interface PaseDeSesion {
  plantId: string
  /** Técnico dueño del teléfono (claim firmado por el servidor). */
  nombre: string
}

/** Lee el pase desde los claims del token; null = sesión normal de la app. */
export async function paseDeSesion(usuario: FirebaseUser): Promise<PaseDeSesion | null> {
  const { claims } = await usuario.getIdTokenResult()
  if (claims.pase_bitacora !== true) return null
  const plantId = typeof claims.plantId === 'string' ? claims.plantId : ''
  const nombre = typeof claims.nombre === 'string' ? claims.nombre : ''
  return plantId && nombre ? { plantId, nombre } : null
}

/**
 * El usuario de la app para un teléfono con pase. El nombre completo va en
 * `nombre` (el `apellido` vacío): las reglas exigen firmar con el nombre EXACTO
 * del pase y partirlo en dos lo cambiaba («Juan Pablo Pérez» → «Juan Pablo»).
 */
export function usuarioDePase(uid: string, pase: PaseDeSesion): User {
  const ahora = new Date()
  return {
    id: uid,
    email: '',
    nombre: pase.nombre,
    apellido: '',
    rol: 'usuario',
    activo: true,
    createdAt: ahora,
    updatedAt: ahora,
    paseBitacora: pase,
  }
}

export interface DatosQr {
  plantId: string
  token: string
}

/** El token va en el `#`: no viaja al servidor de páginas ni queda en sus registros. */
export function urlDelPase(origen: string, base: string, qr: DatosQr): string {
  const raiz = `${origen}${base.endsWith('/') ? base : `${base}/`}`
  return `${raiz}pase-bitacora#p=${encodeURIComponent(qr.plantId)}&t=${encodeURIComponent(qr.token)}`
}

export function leerQrDeHash(hash: string): DatosQr | null {
  const p = new URLSearchParams(hash.replace(/^#/, ''))
  const plantId = p.get('p') ?? ''
  const token = p.get('t') ?? ''
  return /^[a-z0-9-]{2,40}$/.test(plantId) && /^[A-Za-z0-9_-]{16,80}$/.test(token) ? { plantId, token } : null
}

/** «Android», «iPhone»… para que el supervisor distinga los teléfonos de un técnico. */
export function describirDispositivo(ua: string): string {
  if (/iPhone/i.test(ua)) return 'iPhone'
  if (/iPad/i.test(ua)) return 'iPad'
  if (/Android/i.test(ua)) return /Mobile/i.test(ua) ? 'Android' : 'Tablet Android'
  if (/Windows/i.test(ua)) return 'PC Windows'
  if (/Mac OS X/i.test(ua)) return 'Mac'
  return 'Teléfono'
}

/** Días que le quedan al QR para teléfonos nuevos (0 = vencido). */
export function diasRestantes(venceEnMs: number | null | undefined, ahoraMs = Date.now()): number {
  if (!venceEnMs) return 0
  return Math.max(0, Math.ceil((venceEnMs - ahoraMs) / 86_400_000))
}

/** «16-10-2026» (fecha local). */
export function fechaCorta(ms: number): string {
  const d = new Date(ms)
  return `${String(d.getDate()).padStart(2, '0')}-${String(d.getMonth() + 1).padStart(2, '0')}-${d.getFullYear()}`
}

// ── Llamadas a la función `paseBitacora` ──────────────────────────────────────

export interface InfoPase {
  plantId: string
  tecnicos: string[]
  venceEnMs: number
}

export interface ApiPase {
  info(qr: DatosQr): Promise<InfoPase>
  entrar(qr: DatosQr, nombre: string, pin: string): Promise<{ nombre: string }>
  generar(plantId: string): Promise<void>
  renovar(plantId: string): Promise<void>
  asignarPin(plantId: string, nombre: string): Promise<{ pin: string; reinicio: boolean; telefonosQuitados: number }>
  quitarPin(plantId: string, nombre: string): Promise<{ telefonosQuitados: number }>
  quitarDispositivo(uid: string): Promise<void>
  salir(): Promise<void>
}

async function llamar<T>(accion: string, data: Record<string, unknown> = {}): Promise<T> {
  const [{ getFunctions, httpsCallable }, { default: app }] = await Promise.all([
    import('firebase/functions'),
    import('@/services/firebase'),
  ])
  const fn = httpsCallable(getFunctions(app, 'us-central1'), 'paseBitacora')
  const r = await fn({ accion, ...data })
  return r.data as T
}

/** El mensaje del servidor ya viene en español; los demás errores, genéricos. */
export function mensajeDeError(e: unknown): string {
  const err = e as { code?: string; message?: string }
  const codigo = String(err?.code ?? '').replace('functions/', '')
  if (['permission-denied', 'failed-precondition', 'resource-exhausted', 'invalid-argument', 'not-found'].includes(codigo) && err.message) {
    return err.message
  }
  if (typeof navigator !== 'undefined' && !navigator.onLine) return 'Sin señal. Prueba de nuevo cuando haya conexión.'
  return 'No se pudo completar. Prueba de nuevo en un momento.'
}

export const apiPaseReal: ApiPase = {
  info: (qr) => llamar<InfoPase>('info', { ...qr }),
  async entrar(qr, nombre, pin) {
    const r = await llamar<{ token: string; nombre: string }>('entrar', {
      ...qr,
      nombre,
      pin,
      dispositivo: describirDispositivo(navigator.userAgent),
    })
    const [{ signInWithCustomToken }, { auth }] = await Promise.all([import('firebase/auth'), import('@/services/firebase')])
    await signInWithCustomToken(auth, r.token)
    return { nombre: r.nombre }
  },
  generar: async (plantId) => void (await llamar('generar', { plantId })),
  renovar: async (plantId) => void (await llamar('renovar', { plantId })),
  asignarPin: (plantId, nombre) => llamar('asignarPin', { plantId, nombre }),
  quitarPin: (plantId, nombre) => llamar('quitarPin', { plantId, nombre }),
  quitarDispositivo: async (uid) => void (await llamar('quitarDispositivo', { uid })),
  async salir() {
    // Primero se da de baja el teléfono (con la sesión todavía viva) y después se cierra.
    await llamar('salir').catch(() => undefined)
    const [{ signOut }, { auth }] = await Promise.all([import('firebase/auth'), import('@/services/firebase')])
    await signOut(auth)
  },
}
