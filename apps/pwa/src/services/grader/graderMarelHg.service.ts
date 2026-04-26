/**
 * Captura manual de datos Marel HG (corta-cabeza) por turno.
 *
 * Marel HG es la primera estación del pipeline planta Chonchi:
 * Marel HG → 3 Baader 142 → línea manual → Grader.
 *
 * IMPORTANTE — Reset en colación:
 *   En el descanso de colación la pantalla Marel HG entra en modo
 *   "contrastación" y el contador se resetea. El conteo pre-colación
 *   queda guardado en Control de Producción pero no visible en pantalla.
 *   Por eso se soportan 2 segmentos por turno:
 *     · Segmento 1 — captura pre-colación (operador captura justo antes de salir)
 *     · Segmento 2 — captura post-colación (al cierre del turno, ya con conteo fresco)
 *   Los campos `totalInput` y `uncontrolled` en la raíz son siempre la SUMA de ambos.
 *   Si solo hay un segmento (no hubo reset o solo se pudo capturar una vez), los
 *   campos raíz contienen ese único valor.
 *
 * Con totalInput + uncontrolled del turno + Shoplogix Baader procesadas + Grader piezas:
 *   ΣBaader_rechazadas ≈ Grader_total − ΣBaader_procesadas − Marel_no_controladas
 *
 * Persistencia: sub-doc `graderDailySummaries/{summaryId}/meta/marelHg`
 * (consistente con `meta/pauses` y `meta/timeline`).
 */

import { doc, getDoc, setDoc, onSnapshot } from 'firebase/firestore'
import { db } from '../firebase'

const COLLECTION = 'graderDailySummaries'
const META_SUB = 'meta'
const MAREL_HG_DOC = 'marelHg'
const SCHEMA_VERSION = 2

/** Un segmento de conteo Marel HG (pre-colación o post-colación). */
export interface MarelHgSegment {
  /** "pre-colación" | "post-colación" */
  label: string
  totalInput: number
  uncontrolled: number
  /** ISO timestamp del momento en que se registró este segmento. */
  capturedAt: string
}

export interface MarelHgCapture {
  /**
   * Total de piezas del turno completo (suma de todos los segmentos).
   * Si hubo reset en colación = Σ segmentos; si no = valor único capturado.
   */
  totalInput: number
  /** No controladas del turno completo (suma de segmentos). */
  uncontrolled: number
  /** Peso promedio de las piezas con cabeza, en gramos. */
  avgWeightHeadGrams: number
  /** Notas opcionales del operador (ej. paros Marel, condiciones especiales). */
  notes?: string
  /** ISO timestamp de la última grabación. */
  capturedAt: string
  /** UID del operador que capturó. */
  capturedBy: string
  /** Nombre del operador (denormalizado para mostrar sin lookup). */
  capturedByName: string
  /** Versión del schema para migraciones futuras. */
  schemaVersion: number
  /**
   * Desglose por segmento si hubo reset en colación.
   * Presente solo cuando se capturaron 2 períodos; ausente en captura única.
   */
  segments?: MarelHgSegment[]
}

/** Persistencia: lo que se guarda en Firestore. */
interface MarelHgCaptureDoc extends MarelHgCapture {
  updatedAt: string
}

function parseCapture(data: Partial<MarelHgCaptureDoc>): MarelHgCapture {
  const base: MarelHgCapture = {
    totalInput: data.totalInput ?? 0,
    uncontrolled: data.uncontrolled ?? 0,
    avgWeightHeadGrams: data.avgWeightHeadGrams ?? 0,
    notes: data.notes,
    capturedAt: data.capturedAt ?? '',
    capturedBy: data.capturedBy ?? '',
    capturedByName: data.capturedByName ?? '',
    schemaVersion: data.schemaVersion ?? SCHEMA_VERSION,
  }
  if (Array.isArray(data.segments) && data.segments.length > 0) {
    base.segments = data.segments.map((s) => ({
      label: s.label ?? '',
      totalInput: s.totalInput ?? 0,
      uncontrolled: s.uncontrolled ?? 0,
      capturedAt: s.capturedAt ?? '',
    }))
  }
  return base
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
  return parseCapture(data)
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
      callback(parseCapture(data))
    },
    () => { callback(null) },
  )
}

/**
 * Guarda (crea o sobrescribe) la captura para un turno.
 *
 * Si `segments` está presente (2 períodos), `totalInput` y `uncontrolled`
 * deben ser la suma de ambos segmentos — el caller es responsable de sumarlos.
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
    segments?: MarelHgSegment[]
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
    ...(payload.segments && payload.segments.length > 0 ? { segments: payload.segments } : {}),
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
 * La merma real de cinta (caídas, partidas) se considera despreciable.
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
