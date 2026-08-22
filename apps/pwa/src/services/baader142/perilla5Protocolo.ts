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

/** Pescados mínimos para que el panel calcule /1000Fi (manual 1420000804). */
export const MUESTRA_MINIMA_FISH = 1000

/**
 * ¿Las tasas /1000 de esta lectura significan algo?
 *
 * El manual lo repite en las once pantallas con tasa: "la primera indicación se
 * visualiza después de 1000 pescados elaborados". Con menos, el panel todavía no
 * calcula nada y cualquier tasa que se dibuje es ruido — graficarla sin marca es
 * afirmar algo que no se sabe.
 */
export function muestraValida(l: Pick<ContadoresProtocolo, 'fish'>): boolean {
  return (Number(l.fish) || 0) >= MUESTRA_MINIMA_FISH
}

export const INGESTA_COLLECTION = 'baader142ProtocoloIngesta'

/** Lectura transcrita de un video, para precargar el formulario. */
export interface BorradorVideo {
  fecha: string
  maquina: MaquinaBaader
  /** Solo los contadores que se pudieron leer; el resto NO viene (nunca en cero). */
  contadores: Partial<Record<keyof ContadoresProtocolo, number>>
  /** Claves que el barrido no alcanzó a mostrar. */
  faltantes: (keyof ContadoresProtocolo)[]
  video?: string
}

/**
 * Último video transcrito de una máquina que todavía no entró como lectura.
 *
 * Lo escribe el watcher local (scripts/watcher) cuando la ingesta se rechaza por
 * barrido incompleto: en vez de perder los 13 contadores que sí se leyeron, quedan
 * acá para que el formulario los precargue y la persona solo complete los que faltan.
 *
 * Falla en silencio como lecturasDeMaquina: sin esto el formulario sigue sirviendo
 * a mano, que es como funcionó siempre.
 */
export async function borradorDeVideo(
  maquina: MaquinaBaader,
  plantId = 'chonchi',
): Promise<BorradorVideo | null> {
  try {
    const q = query(
      collection(db, INGESTA_COLLECTION),
      where('plantId', '==', plantId),
      where('maquina', '==', maquina),
      where('resultado', '==', 'rechazado'),
      orderBy('createdAt', 'desc'),
      limit(1),
    )
    const snap = await getDocs(q)
    const d = snap.docs[0]?.data() as
      | { fecha?: string; contadores?: Record<string, number | null>; faltantes?: string[]; origen?: { video?: string } }
      | undefined
    if (!d?.fecha || !d.contadores) return null

    const contadores: Partial<Record<keyof ContadoresProtocolo, number>> = {}
    for (const k of CONTADORES_KEYS) {
      const v = d.contadores[k]
      // null / undefined = no se leyó. Se omite: un cero inventado es
      // indistinguible de un cero real y contamina la serie para siempre.
      if (typeof v === 'number' && Number.isFinite(v)) contadores[k] = v
    }
    return {
      fecha: d.fecha,
      maquina,
      contadores,
      faltantes: (d.faltantes ?? []).filter(
        (k): k is keyof ContadoresProtocolo =>
          (CONTADORES_KEYS as readonly string[]).includes(k),
      ),
      video: d.origen?.video,
    }
  } catch {
    return null
  }
}

// ── Lazo lectura → intervención → mejora ────────────────────────────────────

/**
 * Incidencia nacida del lector del protocolo, reconocida por su marcador
 * `[protocolo142 <maquina> · <contador> <tasa>/1000 · lectura <fecha>]`.
 * El marcador vive en la descripción desde que el lector precarga la
 * incidencia — es el hilo que permite mostrar «se intervino y la tasa bajó».
 */
export interface IncidenciaProtocolo {
  id: string
  titulo: string
  status: string
  /** yyyy-mm-dd del createdAt de la incidencia. */
  creada: string
  /** Contador del marcador (p. ej. `stopc`). */
  contador: string
  /** Tasa /1000 al momento de registrarla. */
  tasa: number
  /** Fecha de la lectura que la originó. */
  lectura: string
}

const RE_MARCADOR = /\[protocolo142 (\S+) · (\S+) (\d+)\/1000 · lectura ([\d-]+)\]/

/** Parsea el marcador de una descripción; null si no es del protocolo. */
export function parsearMarcadorProtocolo(
  descripcion: string,
): { maquina: string; contador: string; tasa: number; lectura: string } | null {
  const m = RE_MARCADOR.exec(descripcion)
  if (!m) return null
  return { maquina: m[1]!, contador: m[2]!, tasa: Number(m[3]), lectura: m[4]! }
}

/**
 * Incidencias del protocolo de UNA máquina, más recientes primero.
 *
 * Firestore no busca substrings, así que se traen las últimas incidencias y
 * se filtra por el marcador en el cliente. Cacheado por sesión: este dato
 * cambia cuando alguien registra/resuelve una incidencia, no a cada render.
 */
export async function incidenciasProtocolo(
  maquina: MaquinaBaader,
  opts?: { max?: number },
): Promise<IncidenciaProtocolo[]> {
  const cacheKey = `p5incid:${maquina}`
  try {
    const hit = sessionStorage.getItem(cacheKey)
    if (hit) return JSON.parse(hit) as IncidenciaProtocolo[]
  } catch { /* sin sessionStorage */ }

  const q = query(
    collection(db, 'incidents'),
    orderBy('createdAt', 'desc'),
    limit(opts?.max ?? 150),
  )
  const snap = await getDocs(q)
  const filas: IncidenciaProtocolo[] = []
  for (const d of snap.docs) {
    const data = d.data() as { titulo?: string; descripcion?: string; status?: string; createdAt?: { toDate?: () => Date } }
    const marca = parsearMarcadorProtocolo(data.descripcion ?? '')
    if (!marca || marca.maquina !== maquina) continue
    const creada = data.createdAt?.toDate?.()
    filas.push({
      id: d.id,
      titulo: data.titulo ?? '',
      status: data.status ?? 'pendiente',
      creada: creada ? creada.toISOString().slice(0, 10) : marca.lectura,
      contador: marca.contador,
      tasa: marca.tasa,
      lectura: marca.lectura,
    })
  }
  try { sessionStorage.setItem(cacheKey, JSON.stringify(filas)) } catch { /* llena */ }
  return filas
}
