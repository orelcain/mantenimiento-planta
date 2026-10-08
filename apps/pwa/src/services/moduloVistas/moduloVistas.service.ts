/**
 * Contador de vistas por módulo (`moduloVistas/{YYYY-MM-DD}`).
 *
 * Mide uso real de la app (línea base antes/después del rediseño).
 * «Vista» = USUARIO-DÍA por módulo: el dedupe lo GARANTIZA EL SERVIDOR. Las reglas
 * solo aceptan sumar una vista si la escritura agrega a `u` el hash del que escribe
 * y ese hash no estaba antes, así que un usuario cuenta como máximo 1 vez por módulo
 * y día aunque falle sessionStorage. El cliente solo evita gastar escrituras que la
 * regla rechazaría (Set en memoria + sessionStorage). Sin lecturas al navegar, sin
 * Cloud Functions.
 *
 * Modelo del doc del día (hora de Chile):
 *   { ultimo: '<modulo>', '<modulo>': { vistas, claro|oscuro, cel|pc, u: { '<hash12 del uid>': true } } }
 * `u` es obligatorio. El hash son los primeros 12 hex de sha256(uid); el uid no se guarda.
 * Como cada hash entra una sola vez, `vistas` == cantidad de usuarios únicos del módulo ese día.
 */
import { doc, getDocs, collection, increment, query, setDoc, where, documentId } from 'firebase/firestore'
import { db } from '@/services/firebase'
import { moduloDeRuta } from './moduloDeRuta'
import type { ModuloVistas } from './moduloDeRuta'

export const COLECCION_VISTAS = 'moduloVistas'
const TZ = 'America/Santiago'
const FORMATO_DIA = new Intl.DateTimeFormat('en-CA', { timeZone: TZ, year: 'numeric', month: '2-digit', day: '2-digit' })

/** `YYYY-MM-DD` en hora de Chile (no la del dispositivo: la planta es una sola). */
export function diaChile(d: Date = new Date()): string {
  const p: Record<string, string> = {}
  for (const parte of FORMATO_DIA.formatToParts(d)) p[parte.type] = parte.value
  return `${p.year}-${p.month}-${p.day}`
}

/** Primeros 12 hex de sha256(uid). Debe coincidir con el cálculo de `firestore.rules`. */
export async function hashUsuario(uid: string): Promise<string | null> {
  try {
    const dig = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(uid))
    return Array.from(new Uint8Array(dig))
      .map((b) => b.toString(16).padStart(2, '0'))
      .join('')
      .slice(0, 12)
  } catch {
    return null // sin crypto.subtle (la app corre en https, no debería pasar): no se escribe
  }
}

export interface EntornoVista {
  intensidad: 'claro' | 'oscuro'
  dispositivo: 'cel' | 'pc'
}

export function leerEntorno(): EntornoVista {
  let oscuro = false
  let ancho = 1024
  try {
    oscuro = document.documentElement.classList.contains('dark')
    ancho = window.innerWidth
  } catch {
    /* sin DOM (tests de node) */
  }
  return { intensidad: oscuro ? 'oscuro' : 'claro', dispositivo: ancho < 768 ? 'cel' : 'pc' }
}

/** Payload del setDoc merge. Sin `undefined`: Firestore no lo acepta. */
export function armarPayloadVista(
  modulo: ModuloVistas,
  entorno: EntornoVista,
  hashUid: string,
  inc: (n: number) => unknown = increment,
): Record<string, unknown> {
  const campos: Record<string, unknown> = {
    vistas: inc(1),
    [entorno.intensidad]: inc(1),
    [entorno.dispositivo]: inc(1),
    u: { [hashUid]: true },
  }
  // `ultimo`: el módulo que toca esta escritura; las reglas lo exigen (ver firestore.rules, moduloVistas).
  return { ultimo: modulo, [modulo]: campos }
}

/** Respaldo en memoria (vive lo que dura la pestaña) por si sessionStorage no está disponible. */
const registradasEnMemoria = new Set<string>()

/** sessionStorage con try/catch: si no está disponible, devuelve null (se sigue sin dedupe persistente). */
function almacen(): Storage | null {
  try {
    return typeof sessionStorage === 'undefined' ? null : sessionStorage
  } catch {
    return null
  }
}

export interface DepsRegistro {
  pathname: string
  /** Usuario con sesión real y activo. Sin esto, no se escribe nada. */
  usuario: { id: string; activo: boolean } | null | undefined
  ahora?: Date
  escribir?: (dia: string, payload: Record<string, unknown>) => Promise<unknown>
  storage?: Pick<Storage, 'getItem' | 'setItem'> | null
  entorno?: EntornoVista
  hash?: (uid: string) => Promise<string | null>
  /** Respaldo en memoria; por defecto uno a nivel de módulo. Inyectable para tests. */
  memoria?: Set<string>
}

/**
 * Registra la vista si corresponde. Nunca lanza. Devuelve true si intentó escribir.
 * Sin sesión activa o sin hash (sin crypto.subtle) no escribe. La clave de dedupe se
 * marca ANTES de escribir: si la regla rechaza la escritura (p. ej. ese usuario ya
 * contó hoy desde otro dispositivo) se traga en silencio y no se reintenta.
 */
export async function registrarVistaModulo(deps: DepsRegistro): Promise<boolean> {
  try {
    const { usuario } = deps
    if (!usuario || !usuario.id || usuario.activo !== true) return false
    const modulo = moduloDeRuta(deps.pathname)
    const dia = diaChile(deps.ahora)

    const storage = deps.storage === undefined ? almacen() : deps.storage
    const hash = await (deps.hash ?? hashUsuario)(usuario.id)
    if (!hash) return false
    const clave = `mv:${dia}:${modulo}:${hash}`
    const memoria = deps.memoria ?? registradasEnMemoria
    if (memoria.has(clave)) return false
    memoria.add(clave)
    try {
      if (storage?.getItem(clave)) return false
      storage?.setItem(clave, '1')
    } catch {
      /* storage lleno o bloqueado: queda el Set en memoria */
    }

    const payload = armarPayloadVista(modulo, deps.entorno ?? leerEntorno(), hash)
    const escribir = deps.escribir ?? ((d, p) => setDoc(doc(db, COLECCION_VISTAS, d), p, { merge: true }))
    await escribir(dia, payload)
    return true
  } catch {
    return false
  }
}

export interface VistasModulo {
  vistas: number
  claro: number
  oscuro: number
  cel: number
  pc: number
  usuarios: number
}
export type VistasPorDia = Record<string, Record<string, VistasModulo>>

/** Normaliza un doc crudo de `moduloVistas` (solo lectura). */
export function normalizarDocVistas(data: Record<string, unknown>): Record<string, VistasModulo> {
  const num = (v: unknown) => (typeof v === 'number' && Number.isFinite(v) ? v : 0)
  const out: Record<string, VistasModulo> = {}
  for (const [modulo, v] of Object.entries(data)) {
    if (modulo === 'ultimo' || !v || typeof v !== 'object') continue
    const m = v as Record<string, unknown>
    const u = m.u && typeof m.u === 'object' ? Object.keys(m.u as object).length : 0
    out[modulo] = { vistas: num(m.vistas), claro: num(m.claro), oscuro: num(m.oscuro), cel: num(m.cel), pc: num(m.pc), usuarios: u }
  }
  return out
}

/** Lee los docs del rango [desde, hasta] (YYYY-MM-DD, inclusive): una lectura por día. Solo supervisor/admin. */
export async function leerVistasRango(desde: string, hasta: string): Promise<VistasPorDia> {
  const q = query(collection(db, COLECCION_VISTAS), where(documentId(), '>=', desde), where(documentId(), '<=', hasta))
  const snap = await getDocs(q)
  const out: VistasPorDia = {}
  snap.forEach((d) => {
    out[d.id] = normalizarDocVistas(d.data())
  })
  return out
}
