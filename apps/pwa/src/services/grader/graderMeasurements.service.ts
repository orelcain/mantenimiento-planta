/**
 * Mediciones en terreno de la clasificadora grader.
 *
 * Dos colecciones independientes:
 *   - `beltSpeedMeasurements` — mediciones con tachómetro SKF sobre cintas
 *   - `flipperTimingMeasurements` — mediciones slow-mo iPhone 240fps de
 *     respuesta mecánica del flipper (frames→segundos)
 *
 * Cada documento es una muestra individual: permite historial, comparación
 * entre turnos y auditoría de deriva (drift) de calibración.
 *
 * El valor más reciente puede aplicarse como `vfd.measuredBeltMps` (cinta)
 * o `flipperMechanicalResetS` (flipper) en la physicalConfig global.
 */

import {
  collection,
  doc,
  getDocs,
  limit,
  orderBy,
  query,
  serverTimestamp,
  setDoc,
  where,
} from '@/services/firestoreTracked'
import { db } from '../firebase'
import type { GraderBeltId } from './graderBeltHelpers'

const BELT_COLLECTION = 'beltSpeedMeasurements'
const FLIPPER_COLLECTION = 'flipperTimingMeasurements'
const Z2_CAPTURE_COLLECTION = 'flipperZ2Captures'

// ============================================================================
// TIPOS
// ============================================================================

/**
 * Medición con tachómetro SKF sobre una cinta.
 *
 * Dos modos según el instrumento usado:
 *   - tipo 'shaftRpm'  : tachómetro óptico sobre eje + cinta reflectante
 *     → el componente calcula belt_mps = rpm × effectiveMpsPerRpm
 *   - tipo 'linearMps' : tachómetro de contacto (rueda) sobre cinta → lectura directa en m/s
 *     (el SKF TMRT/TMRP mide superficie si se usa la rueda de medición)
 */
export interface BeltSpeedMeasurement {
  id: string
  beltId: GraderBeltId
  /** 'shaft' si se midió RPM con óptico, 'linear' si se midió m/s directo con rueda */
  method: 'shaft' | 'linear'
  /** Valor medido — RPM (si shaft) o m/s (si linear) */
  measuredValue: number
  /** m/s resultante (derivado si es shaft, igual si es linear) */
  beltMps: number
  /** RPM del VFD en ese momento (display Danfoss) — para cross-check */
  vfdRpm?: number
  /** Notas del operador (ej: "ruido en reductor", "tach mostraba fluct. 0.02") */
  notes?: string
  /** Usuario que hizo la medición */
  measuredBy: string
  /** Timestamp ISO */
  measuredAt: string
}

/**
 * Medición slow-mo (iPhone 240fps) del reset mecánico del flipper.
 *
 * Procedimiento:
 *   1. Servicio → Probar salidas → gate N [8620]
 *   2. Grabar con iPhone @ 240fps (Cámara → Slo-mo)
 *   3. En edición, contar frames entre "inicia cierre" y "listo siguiente"
 *   4. segundos = frames / 240
 */
export interface FlipperTimingMeasurement {
  id: string
  /** 1..12 — gate a la que corresponde la medición */
  gateNumber: number
  /** Frames contados en el video slow-mo */
  frames: number
  /** Frame rate del video (normalmente 240 en iPhone slow-mo) */
  fps: number
  /** segundos = frames / fps */
  seconds: number
  /** Qué componente se midió */
  phase: 'openToReady' | 'closeToOpen' | 'fullCycle'
  /** Notas del operador */
  notes?: string
  /** Usuario */
  measuredBy: string
  /** Timestamp ISO */
  measuredAt: string
}

// ============================================================================
// UTILIDADES
// ============================================================================

function newId(prefix: string): string {
  return `${prefix}_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`
}

function isPlainObject(value: unknown): value is Record<string, unknown> {
  if (Object.prototype.toString.call(value) !== '[object Object]') return false
  const proto = Object.getPrototypeOf(value)
  return proto === Object.prototype || proto === null
}

function deepCleanUndefined<T>(value: T): T {
  if (value === undefined) return value
  if (Array.isArray(value)) {
    return value.map((v) => deepCleanUndefined(v)).filter((v) => v !== undefined) as T
  }
  if (isPlainObject(value)) {
    const entries = Object.entries(value)
      .map(([k, v]) => [k, deepCleanUndefined(v)] as const)
      .filter(([, v]) => v !== undefined)
    return Object.fromEntries(entries) as T
  }
  return value
}

// ============================================================================
// BELT SPEED MEASUREMENTS
// ============================================================================

export async function saveBeltSpeedMeasurement(
  input: Omit<BeltSpeedMeasurement, 'id' | 'measuredAt'> & { measuredAt?: string },
): Promise<BeltSpeedMeasurement> {
  const id = newId('bsm')
  const measuredAt = input.measuredAt ?? new Date().toISOString()
  const record: BeltSpeedMeasurement = { ...input, id, measuredAt }
  await setDoc(
    doc(db, BELT_COLLECTION, id),
    deepCleanUndefined({ ...record, _createdAt: serverTimestamp() }),
  )
  return record
}

export async function listBeltSpeedMeasurements(
  beltId?: GraderBeltId,
  max = 20,
): Promise<BeltSpeedMeasurement[]> {
  const qRef = beltId
    ? query(collection(db, BELT_COLLECTION), where('beltId', '==', beltId), orderBy('measuredAt', 'desc'), limit(max))
    : query(collection(db, BELT_COLLECTION), orderBy('measuredAt', 'desc'), limit(max))
  const snap = await getDocs(qRef)
  return snap.docs.map((d) => d.data() as BeltSpeedMeasurement)
}

export async function getLatestBeltMeasurement(
  beltId: GraderBeltId,
): Promise<BeltSpeedMeasurement | null> {
  const list = await listBeltSpeedMeasurements(beltId, 1)
  return list[0] ?? null
}

// ============================================================================
// FLIPPER TIMING MEASUREMENTS
// ============================================================================

export async function saveFlipperTimingMeasurement(
  input: Omit<FlipperTimingMeasurement, 'id' | 'seconds' | 'measuredAt'> & {
    measuredAt?: string
  },
): Promise<FlipperTimingMeasurement> {
  const id = newId('ftm')
  const measuredAt = input.measuredAt ?? new Date().toISOString()
  const seconds = input.fps > 0 ? input.frames / input.fps : 0
  const record: FlipperTimingMeasurement = { ...input, id, seconds, measuredAt }
  await setDoc(
    doc(db, FLIPPER_COLLECTION, id),
    deepCleanUndefined({ ...record, _createdAt: serverTimestamp() }),
  )
  return record
}

export async function listFlipperTimingMeasurements(
  gateNumber?: number,
  max = 20,
): Promise<FlipperTimingMeasurement[]> {
  const qRef = gateNumber
    ? query(
        collection(db, FLIPPER_COLLECTION),
        where('gateNumber', '==', gateNumber),
        orderBy('measuredAt', 'desc'),
        limit(max),
      )
    : query(collection(db, FLIPPER_COLLECTION), orderBy('measuredAt', 'desc'), limit(max))
  const snap = await getDocs(qRef)
  return snap.docs.map((d) => d.data() as FlipperTimingMeasurement)
}

export async function getLatestFlipperMeasurement(
  gateNumber: number,
): Promise<FlipperTimingMeasurement | null> {
  const list = await listFlipperTimingMeasurements(gateNumber, 1)
  return list[0] ?? null
}

// ============================================================================
// FLIPPER Z2 CAPTURES
// ============================================================================

/**
 * Captura de parámetros de timing del flipper leídos directamente del HMI Z2.
 * Ruta en Z2: Cambiar Parámetros → código 8620 → delayFlipperOpen / minFlipperOpenTime / delayFlipperClose.
 */
export interface FlipperZ2Capture {
  id: string
  /** Delay antes de activar el solenoide de apertura (ms). Z2: delayFlipperOpen. */
  delayFlipperOpenMs: number
  /** Tiempo mínimo que el flipper permanece abierto (ms). Z2: minFlipperOpenTime. */
  minFlipperOpenTimeMs: number
  /** Delay antes de activar el solenoide de cierre (ms). Z2: delayFlipperClose. */
  delayFlipperCloseMs: number
  /** Suma de los 3 tiempos — ciclo total software (ms). */
  cycleTotalMs: number
  /** Notas del operador (ej: "turno noche, producto HG Coho"). */
  notes?: string
  measuredBy: string
  measuredAt: string
}

export async function saveFlipperZ2Capture(
  input: Omit<FlipperZ2Capture, 'id' | 'cycleTotalMs' | 'measuredAt'> & { measuredAt?: string },
): Promise<FlipperZ2Capture> {
  const id = newId('z2c')
  const measuredAt = input.measuredAt ?? new Date().toISOString()
  const cycleTotalMs = input.delayFlipperOpenMs + input.minFlipperOpenTimeMs + input.delayFlipperCloseMs
  const record: FlipperZ2Capture = { ...input, id, cycleTotalMs, measuredAt }
  await setDoc(
    doc(db, Z2_CAPTURE_COLLECTION, id),
    deepCleanUndefined({ ...record, _createdAt: serverTimestamp() }),
  )
  return record
}

export async function listFlipperZ2Captures(max = 10): Promise<FlipperZ2Capture[]> {
  const qRef = query(collection(db, Z2_CAPTURE_COLLECTION), orderBy('measuredAt', 'desc'), limit(max))
  const snap = await getDocs(qRef)
  return snap.docs.map((d) => d.data() as FlipperZ2Capture)
}

export async function getLatestFlipperZ2Capture(): Promise<FlipperZ2Capture | null> {
  const list = await listFlipperZ2Captures(1)
  return list[0] ?? null
}
