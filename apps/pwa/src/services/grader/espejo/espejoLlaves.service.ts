/**
 * Llaves del lector del espejo del grader: `graderEspejoLlaves/{sha256hex}`.
 * Las crea y revoca un admin desde Diagnóstico Matrix (las reglas de Firestore
 * piden `isAdmin()`). La llave en claro se devuelve UNA vez al crearla y no se
 * guarda ni se registra en ninguna parte; el documento solo lleva su hash.
 *
 * Revocar = «Detener lector»: la función de ingesta responde 403 y el lector se
 * cierra solo.
 */
import {
  collection,
  doc,
  getDoc,
  getDocs,
  serverTimestamp,
  setDoc,
  updateDoc,
} from '@/services/firestoreTracked'
import { auth, db } from '../../firebase'
import { aMs } from './espejoEstado'
import { esHashValido, generarLlave, limpiarNombre } from './espejoLlavesLogica'
import { VIGENCIA_ALTA_MIN, esVersionValida } from './espejoVersionLogica'

export { generarLlave } from './espejoLlavesLogica'

const COLECCION = 'graderEspejoLlaves'
const COLECCION_ALTAS = 'graderEspejoAltas'
const COLECCION_VERSION = 'graderEspejoVersion'
const DOC_VERSION_ACTUAL = 'actual'
const LINEA_POR_DEFECTO = 'chonchi'

export interface LlaveEspejo {
  /** sha256 hex de la llave: id del documento. */
  hash: string
  nombre: string
  linea: string
  creadaEnMs: number | null
  ultimoUsoMs: number | null
  revocada: boolean
  revocadaEnMs: number | null
}

/**
 * Prepara un código de alta de un solo uso para el instalador del PC de Matrix.
 * `graderEspejoAltas/{hash}`: solo se guarda el hash; el código en claro se devuelve una vez.
 */
export async function crearAlta(nombre: string, linea: string = LINEA_POR_DEFECTO): Promise<{ codigo: string; venceEnMs: number }> {
  const limpio = limpiarNombre(nombre)
  if (!limpio) throw new Error('Escribe un nombre corto para el instalador.')
  const uid = auth.currentUser?.uid
  if (!uid) throw new Error('Inicia sesión como administrador para preparar el instalador.')
  const { llave, hash } = await generarLlave()
  const venceEnMs = Date.now() + VIGENCIA_ALTA_MIN * 60_000
  await setDoc(doc(db, COLECCION_ALTAS, hash), {
    nombre: limpio,
    linea,
    creadaEn: serverTimestamp(),
    creadaPor: uid,
    usada: false,
  })
  return { codigo: llave, venceEnMs }
}

/** Versión que la planta debe bajar (`graderEspejoVersion/actual`); `null` si no hay ninguna. */
export async function leerVersionPublicada(): Promise<{ version: string; publicadaEnMs: number | null } | null> {
  const snap = await getDoc(doc(db, COLECCION_VERSION, DOC_VERSION_ACTUAL))
  if (!snap.exists()) return null
  const x = snap.data() as Record<string, unknown>
  if (typeof x.version !== 'string') return null
  return { version: x.version, publicadaEnMs: aMs(x.publicadaEn) }
}

/** Publica la versión para planta. Valida el formato antes de escribir. */
export async function publicarVersion(version: string): Promise<void> {
  if (!esVersionValida(version)) throw new Error('La versión no tiene el formato eX.Y.')
  const uid = auth.currentUser?.uid
  if (!uid) throw new Error('Inicia sesión como administrador para publicar.')
  await setDoc(doc(db, COLECCION_VERSION, DOC_VERSION_ACTUAL), {
    version,
    publicadaEn: serverTimestamp(),
    publicadaPor: uid,
  })
}

export async function listarLlaves(): Promise<LlaveEspejo[]> {
  const snap = await getDocs(collection(db, COLECCION))
  const out = snap.docs.map((d) => {
    const x = d.data() as Record<string, unknown>
    return {
      hash: d.id,
      nombre: typeof x.nombre === 'string' ? x.nombre : d.id.slice(0, 8),
      linea: typeof x.linea === 'string' ? x.linea : LINEA_POR_DEFECTO,
      creadaEnMs: aMs(x.creadaEn),
      ultimoUsoMs: aMs(x.ultimoUso),
      revocada: x.revocada === true,
      revocadaEnMs: aMs(x.revocadaEn),
    }
  })
  return out.sort((a, b) => (b.creadaEnMs ?? 0) - (a.creadaEnMs ?? 0))
}

export async function revocarLlave(hash: string): Promise<void> {
  if (!esHashValido(hash)) throw new Error('Llave desconocida.')
  await updateDoc(doc(db, COLECCION, hash), { revocada: true, revocadaEn: serverTimestamp() })
}
