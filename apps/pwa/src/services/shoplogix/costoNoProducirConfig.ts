/**
 * Márgenes por kilo de cada línea, para valorizar el costo de no producir.
 *
 * Documento `appConfig/costoNoProducir`. La regla ya deja leerlo a cualquier
 * usuario con sesión no anónima y escribirlo solo a admin; por eso el monitor
 * público (sin sesión) nunca llega a leerlo.
 *
 * ⚠ Guardar AGREGA una entrada al historial de la línea: nunca la reemplaza.
 * Un turno pasado se valoriza con el margen que regía ese día (ver
 * `margenClpPorKg`), así que borrar un margen viejo cambiaría cifras cerradas.
 *
 * La normalización y la validación son funciones puras y exportadas para
 * probarlas sin Firestore.
 */
import { doc, getDoc, setDoc, serverTimestamp } from '@/services/firestoreTracked'
import { db } from '../firebase'
import {
  MARGEN_CLP_MAX,
  MARGEN_CLP_MIN,
  type ConfigCostoNoProducir,
  type MargenVigente,
  type Moneda,
} from './costoNoProducir'

const COLECCION = 'appConfig'
const DOC_ID = 'costoNoProducir'
const FECHA_RE = /^\d{4}-\d{2}-\d{2}$/

export function configVacia(): ConfigCostoNoProducir {
  return { tipoCambioClpPorUsd: null, lineas: {} }
}

function normalizarMargen(x: unknown): MargenVigente | null {
  if (!x || typeof x !== 'object') return null
  const o = x as Record<string, unknown>
  const margenPorKg = typeof o.margenPorKg === 'number' && Number.isFinite(o.margenPorKg) ? o.margenPorKg : null
  const moneda: Moneda | null = o.moneda === 'CLP' || o.moneda === 'USD' ? o.moneda : null
  const vigenteDesde = typeof o.vigenteDesde === 'string' && FECHA_RE.test(o.vigenteDesde) ? o.vigenteDesde : null
  if (margenPorKg == null || !(margenPorKg > 0) || moneda == null || vigenteDesde == null) return null
  return {
    margenPorKg,
    moneda,
    vigenteDesde,
    autor: typeof o.autor === 'string' ? o.autor : null,
    guardadoEn: typeof o.guardadoEn === 'string' ? o.guardadoEn : null,
  }
}

/**
 * Lo que venga de Firestore, tal cual, a la forma que usa el monitor. Falta un
 * campo → valor vacío; una entrada mal formada se descarta (no tumba la lectura).
 */
export function normalizarConfigCostoNoProducir(raw: unknown): ConfigCostoNoProducir {
  if (!raw || typeof raw !== 'object') return configVacia()
  const o = raw as Record<string, unknown>
  const tc = typeof o.tipoCambioClpPorUsd === 'number' && o.tipoCambioClpPorUsd > 0 && Number.isFinite(o.tipoCambioClpPorUsd)
    ? o.tipoCambioClpPorUsd
    : null
  const lineas: Record<string, MargenVigente[]> = {}
  if (o.lineas && typeof o.lineas === 'object' && !Array.isArray(o.lineas)) {
    for (const [lineId, arr] of Object.entries(o.lineas as Record<string, unknown>)) {
      if (!lineId || !Array.isArray(arr)) continue
      const margenes = arr.map(normalizarMargen).filter((m): m is MargenVigente => m != null)
      if (margenes.length > 0) lineas[lineId] = margenes
    }
  }
  return { tipoCambioClpPorUsd: tc, lineas }
}

export interface ArgsGuardarMargen {
  lineId: string
  margenPorKg: number
  moneda: Moneda
  vigenteDesde: string
  tipoCambioClpPorUsd: number | null
  autor: string
}

/**
 * Mensaje en español si el margen no se puede guardar; null si está bien.
 * Las cifras van con el mismo formato que el resto de la app.
 */
export function validarMargen(args: ArgsGuardarMargen): string | null {
  if (!args.lineId) return 'Falta la línea a la que corresponde el margen.'
  if (!(Number.isFinite(args.margenPorKg) && args.margenPorKg > 0)) {
    return 'El margen por kilo tiene que ser mayor que cero.'
  }
  const tc = args.tipoCambioClpPorUsd
  if (args.moneda === 'USD' && !(tc != null && Number.isFinite(tc) && tc > 0)) {
    return 'Con margen en USD hay que indicar el tipo de cambio (CLP por USD).'
  }
  const clpPorKg = args.moneda === 'USD' ? args.margenPorKg * (tc as number) : args.margenPorKg
  if (!(clpPorKg >= MARGEN_CLP_MIN && clpPorKg <= MARGEN_CLP_MAX)) {
    const fmt = (n: number) => n.toLocaleString('es-CL', { maximumFractionDigits: 0 })
    return `El margen equivale a $${fmt(clpPorKg)} por kilo en CLP. Tiene que estar entre $${fmt(MARGEN_CLP_MIN)} y $${fmt(MARGEN_CLP_MAX)}. Revisa el número.`
  }
  if (!FECHA_RE.test(args.vigenteDesde) || Number.isNaN(Date.parse(`${args.vigenteDesde}T00:00:00Z`))) {
    return 'La fecha «vigente desde» tiene que tener formato AAAA-MM-DD.'
  }
  if (!args.autor) return 'Falta quien guarda el margen.'
  return null
}

/**
 * Lectura única. Sin documento → config vacía. Si la lectura falla (permiso,
 * red) → null: el monitor no pinta la tarjeta en vez de inventar un margen.
 */
export async function leerConfigCostoNoProducir(): Promise<ConfigCostoNoProducir | null> {
  try {
    const snap = await getDoc(doc(db, COLECCION, DOC_ID))
    return normalizarConfigCostoNoProducir(snap.exists() ? snap.data() : null)
  } catch {
    return null
  }
}

/**
 * Agrega un margen al historial de su línea y devuelve la config nueva.
 * El tipo de cambio solo se escribe si llega un número > 0: un margen en CLP
 * no debe borrar el tipo de cambio que usan los márgenes en USD de otras líneas.
 */
export async function guardarMargen(args: ArgsGuardarMargen): Promise<ConfigCostoNoProducir> {
  const error = validarMargen(args)
  if (error) throw new Error(error)

  const ref = doc(db, COLECCION, DOC_ID)
  let actual: ConfigCostoNoProducir
  try {
    const snap = await getDoc(ref)
    actual = normalizarConfigCostoNoProducir(snap.exists() ? snap.data() : null)
  } catch {
    throw new Error('No se pudo leer la configuración de costos. Revisa tu sesión y tus permisos.')
  }

  const nuevo: MargenVigente = {
    margenPorKg: args.margenPorKg,
    moneda: args.moneda,
    vigenteDesde: args.vigenteDesde,
    autor: args.autor,
    guardadoEn: new Date().toISOString(),
  }
  const lineas = { ...actual.lineas, [args.lineId]: [...(actual.lineas[args.lineId] ?? []), nuevo] }
  const tc = args.tipoCambioClpPorUsd != null && args.tipoCambioClpPorUsd > 0
    ? args.tipoCambioClpPorUsd
    : actual.tipoCambioClpPorUsd

  try {
    await setDoc(ref, { tipoCambioClpPorUsd: tc, lineas, updatedAt: serverTimestamp() }, { merge: true })
  } catch {
    throw new Error('No se pudo guardar el margen. Revisa tu sesión y tus permisos de administrador.')
  }
  return { tipoCambioClpPorUsd: tc, lineas }
}
