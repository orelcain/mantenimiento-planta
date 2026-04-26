/**
 * Captura manual de datos Marel HG (corta-cabeza) por turno.
 *
 * Marel HG es la primera estación del pipeline planta Chonchi:
 * Marel HG → 3 Baader 142 → línea manual → Grader.
 *
 * Marel HG cuenta:
 *   - Total de piezas que ingresan (con cabeza)
 *   - "Controladas": las que pesa correctamente
 *   - "No controladas": 1-7% típico — escapan al pesaje y van a línea manual
 *
 * Esa data NO está automatizada (no hay API ni OPC UA accesibles), por eso
 * el operador la captura manualmente UNA vez por turno desde la pantalla
 * Marel HG. Con esto + Shoplogix Baader procesadas + Grader piezas, podemos
 * deducir el rechazo Baader puro:
 *
 *   ΣBaader_rechazadas ≈ Grader_total − ΣBaader_procesadas − Marel_no_controladas
 *
 * Sin esta captura el número estimado mezcla rechazos + no-controladas.
 *
 * Persistencia: sub-doc `graderDailySummaries/{summaryId}/meta/marelHg`
 * (consistente con `meta/pauses` y `meta/timeline`).
 */

import { doc, getDoc, setDoc, onSnapshot } from 'firebase/firestore'
import { db } from '../firebase'

const COLLECTION = 'graderDailySummaries'
const META_SUB = 'meta'
const MAREL_HG_DOC = 'marelHg'
const SCHEMA_VERSION = 1

export interface MarelHgCapture {
  /** Total de piezas que ingresaron a Marel HG (con cabeza). */
  totalInput: number
  /** Cantidad de piezas no controladas (no pesadas correctamente). */
  uncontrolled: number
  /** Peso promedio de las piezas con cabeza, en gramos. */
  avgWeightHeadGrams: number
  /** Notas opcionales del operador (ej. paros Marel, condiciones especiales). */
  notes?: string
  /** ISO timestamp del momento de captura. */
  capturedAt: string
  /** UID del operador que capturó. */
  capturedBy: string
  /** Nombre del operador (denormalizado para mostrar sin lookup). */
  capturedByName: string
  /** Versión del schema para migraciones futuras. */
  schemaVersion: number
}

/** Persistencia: lo que se guarda en Firestore. */
interface MarelHgCaptureDoc extends MarelHgCapture {
  updatedAt: string
}

/**
 * Lee la captura actual de Marel HG para un turno.
 * Retorna `null` si no se ha capturado nada todavía.
 */
export async function getMarelHgCapture(summaryId: string): Promise<MarelHgCapture | null> {
  const ref = doc(db, COLLECTION, summaryId, META_SUB, MAREL_HG_DOC)
  const snap = await getDoc(ref)
  if (!snap.exists()) return null
  const data = snap.data() as Partial<MarelHgCaptureDoc>
  if (typeof data.totalInput !== 'number') return null
  return {
    totalInput: data.totalInput,
    uncontrolled: data.uncontrolled ?? 0,
    avgWeightHeadGrams: data.avgWeightHeadGrams ?? 0,
    notes: data.notes,
    capturedAt: data.capturedAt ?? '',
    capturedBy: data.capturedBy ?? '',
    capturedByName: data.capturedByName ?? '',
    schemaVersion: data.schemaVersion ?? SCHEMA_VERSION,
  }
}

/**
 * Suscripción reactiva a la captura. Útil para que la UI se actualice cuando
 * otro operador captura desde otro dispositivo.
 */
export function subscribeMarelHgCapture(
  summaryId: string,
  callback: (capture: MarelHgCapture | null) => void,
): () => void {
  const ref = doc(db, COLLECTION, summaryId, META_SUB, MAREL_HG_DOC)
  return onSnapshot(
    ref,
    (snap) => {
      if (!snap.exists()) { callback(null); return }
      const data = snap.data() as Partial<MarelHgCaptureDoc>
      if (typeof data.totalInput !== 'number') { callback(null); return }
      callback({
        totalInput: data.totalInput,
        uncontrolled: data.uncontrolled ?? 0,
        avgWeightHeadGrams: data.avgWeightHeadGrams ?? 0,
        notes: data.notes,
        capturedAt: data.capturedAt ?? '',
        capturedBy: data.capturedBy ?? '',
        capturedByName: data.capturedByName ?? '',
        schemaVersion: data.schemaVersion ?? SCHEMA_VERSION,
      })
    },
    () => { callback(null) },
  )
}

/**
 * Guarda (crea o sobrescribe) la captura para un turno.
 * El caller debe pasar el uid + nombre del operador. Se reescribe completo
 * cada vez (no parche): la captura es atómica por turno.
 */
export async function saveMarelHgCapture(
  summaryId: string,
  payload: {
    totalInput: number
    uncontrolled: number
    avgWeightHeadGrams: number
    notes?: string
    capturedBy: string
    capturedByName: string
  },
): Promise<void> {
  if (!summaryId) throw new Error('saveMarelHgCapture: summaryId vacío')
  if (payload.totalInput <= 0) throw new Error('totalInput debe ser > 0')
  if (payload.uncontrolled < 0) throw new Error('uncontrolled no puede ser negativo')
  if (payload.uncontrolled > payload.totalInput) {
    throw new Error('uncontrolled no puede exceder totalInput')
  }
  if (payload.avgWeightHeadGrams < 100 || payload.avgWeightHeadGrams > 15000) {
    throw new Error('avgWeightHeadGrams fuera de rango razonable (100-15000g)')
  }

  const now = new Date().toISOString()
  const docPayload: MarelHgCaptureDoc = {
    totalInput: payload.totalInput,
    uncontrolled: payload.uncontrolled,
    avgWeightHeadGrams: payload.avgWeightHeadGrams,
    capturedAt: now,
    capturedBy: payload.capturedBy,
    capturedByName: payload.capturedByName,
    schemaVersion: SCHEMA_VERSION,
    updatedAt: now,
    ...(payload.notes && payload.notes.trim() ? { notes: payload.notes.trim() } : {}),
  }

  const ref = doc(db, COLLECTION, summaryId, META_SUB, MAREL_HG_DOC)
  await setDoc(ref, docPayload)
}

/**
 * Calcula el rechazo Baader puro a partir de la captura Marel HG y los datos
 * disponibles del turno. Devuelve `null` si faltan datos para calcular.
 *
 * Fórmula:
 *   rechazoBaader = Grader_total − Σ Baader_procesadas − Marel_no_controladas
 *
 * Asume que las rechazadas Baader vuelven todas vía línea manual al Grader,
 * y que las no-controladas Marel también llegan al Grader vía línea manual.
 * La merma real de cinta (caídas, partidas) se considera despreciable —
 * podría refinar el modelo cuando tengamos métrica de merma física.
 */
export function deriveBaaderRejection(args: {
  graderTotalPieces: number
  baaderTotalCycles: number
  marelHgCapture: MarelHgCapture | null
}): { rejected: number; rejectedPctOfBaader: number } | null {
  const { graderTotalPieces, baaderTotalCycles, marelHgCapture } = args
  if (!marelHgCapture) return null
  if (graderTotalPieces <= 0 || baaderTotalCycles <= 0) return null

  const rejected = graderTotalPieces - baaderTotalCycles - marelHgCapture.uncontrolled
  if (rejected < 0) {
    // Pipeline no encaja: probablemente piezas en tránsito al cierre o algún
    // sub-cálculo está sesgado. Mejor no mostrar número engañoso.
    return null
  }
  const rejectedPctOfBaader = baaderTotalCycles > 0 ? (rejected / baaderTotalCycles) * 100 : 0
  return { rejected, rejectedPctOfBaader }
}
