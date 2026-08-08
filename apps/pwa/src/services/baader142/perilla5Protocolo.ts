/**
 * baader142Protocolo — lecturas del protocolo del Upgrade Kit de las BAADER 142.
 *
 * Por qué existe: con Upgrade Kit (1420000150), el control corrige en silencio los
 * pasos perdidos de cada motor paso a paso y lo anota en contadores ∑E82x-C. Entre
 * "algo empezó a andar mal" y "la máquina se paró" pasan cientos de pescados; el
 * protocolo es el único lugar donde ese espacio queda escrito. Registrar la lectura
 * semanal acá permite graficar la tendencia por herramienta e intervenir ANTES de
 * la parada — con el dato en la mano, no de oído.
 *
 * Caso fundacional (Planta Chonchi, 08-08-2026, 1299 pescados): E825-C = 452
 * (347/1000) → el excavador B perdía pasos en 1 de cada 3 pescados y nadie lo veía;
 * los otros cuatro motores estaban en 0-3. Esa lectura definió la intervención.
 *
 * Reglas de la colección (espejo de variadoresCambios): solo crear y leer — es
 * evidencia histórica, no se edita ni se borra desde la app.
 */
import {
  addDoc,
  collection,
  getDocs,
  limit,
  orderBy,
  query,
  serverTimestamp,
  where,
  type Timestamp,
} from 'firebase/firestore'
import { db } from '../firebase'

export const PROTOCOLO_COLLECTION = 'baader142Protocolo'

/** Identidad de máquina según el orden de planta: N1 (antigua) / N2 / N3. */
export type MaquinaBaader = 'baader-n1' | 'baader-n2' | 'baader-n3'

export const MAQUINAS: { id: MaquinaBaader; label: string; hint?: string }[] = [
  { id: 'baader-n1', label: 'Baader 142 N1 (antigua)', hint: 'Upgrade Kit confirmado 08-08-2026 · lectura base E825-C=452' },
  { id: 'baader-n2', label: 'Baader 142 N2', hint: 'una de las nuevas tiene kit confirmado 08-08-2026 (protocolo reseteado) — identificar cuál' },
  { id: 'baader-n3', label: 'Baader 142 N3', hint: 'una de las nuevas tiene kit confirmado 08-08-2026 (protocolo reseteado) — identificar cuál' },
]

/** Los 13 contadores del protocolo (selector 5 → pos. 1, se navega con selector 4). */
export interface ContadoresProtocolo {
  /** ∑ FISH o ∑ FI-TODAY — el denominador de todas las tasas. */
  fish: number
  stops: number
  stopc: number
  tclip: number
  tclipc: number
  anusi: number
  anuso: number
  e821: number
  e821c: number
  e822: number
  e822c: number
  e823: number
  e823c: number
  e824: number
  e824c: number
  e825: number
  e825c: number
}

export interface LecturaProtocolo extends ContadoresProtocolo {
  id?: string
  plantId: string
  maquina: MaquinaBaader
  /** Fecha de la lectura en formato YYYY-MM-DD (día en que se leyó el panel). */
  fecha: string
  notas?: string
  creadoPor: string
  creadoPorNombre?: string
  createdAt?: Timestamp
}

export const CONTADORES_KEYS = [
  'fish', 'stops', 'stopc', 'tclip', 'tclipc', 'anusi', 'anuso',
  'e821', 'e821c', 'e822', 'e822c', 'e823', 'e823c', 'e824', 'e824c', 'e825', 'e825c',
] as const satisfies readonly (keyof ContadoresProtocolo)[]

/** Tasa por cada 1000 pescados, como la muestra el display (/1000Fi). */
export function tasa1000(n: number, fish: number): number {
  return fish > 0 ? Math.round((n * 1000) / fish) : 0
}

/**
 * Lectura base tomada en terreno el 08-08-2026 (Baader antigua, 1299 pescados).
 * Sirve para precargar el formulario como referencia — NO se guarda sola.
 */
export const LECTURA_BASE_2026_08_08: ContadoresProtocolo = {
  fish: 1299, stops: 20, stopc: 485, tclip: 15, tclipc: 29, anusi: 13, anuso: 12,
  e821: 0, e821c: 0, e822: 0, e822c: 1, e823: 0, e823c: 0, e824: 0, e824c: 3,
  e825: 0, e825c: 452,
}

/** Registra una lectura. Requiere sesión: las reglas exigen creadoPor == uid. */
export async function guardarLectura(
  lectura: Omit<LecturaProtocolo, 'id' | 'createdAt'>,
): Promise<string> {
  const ref = await addDoc(collection(db, PROTOCOLO_COLLECTION), {
    ...lectura,
    createdAt: serverTimestamp(),
  })
  return ref.id
}

/**
 * Lecturas de una máquina, de la más nueva a la más vieja.
 * Falla en silencio (devuelve []) a propósito: sin señal o sin permiso, la página
 * sigue sirviendo como herramienta de diagnóstico; la tendencia es el extra.
 * Requiere el índice compuesto (plantId, maquina, fecha desc) — está en
 * firestore.indexes.json; sin él esta query devolvería [] SIEMPRE.
 */
export async function lecturasDeMaquina(
  maquina: MaquinaBaader,
  plantId = 'chonchi',
  max = 60,
): Promise<LecturaProtocolo[]> {
  try {
    // createdAt desempata las lecturas del mismo día (semanal + pre-reset es el
    // caso esperado); sin él, el orden dentro del día quedaría al azar del docId.
    const q = query(
      collection(db, PROTOCOLO_COLLECTION),
      where('plantId', '==', plantId),
      where('maquina', '==', maquina),
      orderBy('fecha', 'desc'),
      orderBy('createdAt', 'desc'),
      limit(max),
    )
    const snap = await getDocs(q)
    return snap.docs.map((d) => ({ id: d.id, ...(d.data() as LecturaProtocolo) }))
  } catch {
    return []
  }
}
