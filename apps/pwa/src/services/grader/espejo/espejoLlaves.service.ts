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
  getDocs,
  serverTimestamp,
  setDoc,
  updateDoc,
} from '@/services/firestoreTracked'
import { auth, db } from '../../firebase'
import { aMs } from './espejoEstado'
import { esHashValido, generarLlave, limpiarNombre } from './espejoLlavesLogica'

export { generarLlave } from './espejoLlavesLogica'

const COLECCION = 'graderEspejoLlaves'
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

/** Crea la llave y devuelve la llave en claro (única vez que existe fuera del PC del lector). */
export async function crearLlave(nombre: string, linea: string = LINEA_POR_DEFECTO): Promise<{ llave: string; hash: string }> {
  const limpio = limpiarNombre(nombre)
  if (!limpio) throw new Error('Escribe un nombre corto para la llave.')
  const uid = auth.currentUser?.uid
  if (!uid) throw new Error('Inicia sesión como administrador para generar la llave.')
  const { llave, hash } = await generarLlave()
  await setDoc(doc(db, COLECCION, hash), {
    nombre: limpio,
    linea,
    creadaEn: serverTimestamp(),
    creadaPor: uid,
    revocada: false,
  })
  return { llave, hash }
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
