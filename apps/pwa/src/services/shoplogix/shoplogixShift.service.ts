/**
 * Service de Shoplogix — lee shifts desde Firestore.
 *
 * Ruta: `shoplogix/chonchi/shifts/{dateKey}_{shiftId}/machines/{machineid}`
 *
 * El Cloud Function `shoplogixSyncHttp` / `shoplogixSyncWakeup` escribe acá
 * cada pocos minutos durante horas de turno.
 */

import { collection, getDocs, doc, getDoc, Timestamp } from 'firebase/firestore'
import { db } from '@/services/firebase'
import type {
  UpstreamMachineShift,
  UpstreamLineSnapshot,
  UpstreamProductionInterval,
  UpstreamMachineState,
} from './types'
import { buildLineSnapshot } from './shoplogixNormalizer'

const PLANT_SLUG = 'chonchi'

// Firestore devuelve Timestamp — las funciones backend pueden escribir Date
// (Admin SDK los convierte a Timestamp automáticamente). Al leer, siempre es
// Timestamp — convertimos a Date para el schema interno.
type FirestoreData = Record<string, unknown>

function toDateSafe(v: unknown): Date {
  if (v instanceof Timestamp) return v.toDate()
  if (v instanceof Date) return v
  if (typeof v === 'string' || typeof v === 'number') return new Date(v)
  return new Date(0)  // fallback — doc corrupto
}

/** Convierte item de comments a string legible (Shoplogix a veces trae objetos). */
function coerceComment(c: unknown): string {
  if (typeof c === 'string') return c
  if (c && typeof c === 'object') {
    // Típicos campos que usa Shoplogix
    const obj = c as Record<string, unknown>
    const text = obj.text ?? obj.comment ?? obj.message ?? obj.body
    if (typeof text === 'string') return text
    return ''  // objeto sin texto útil → omitir
  }
  return ''
}

function deserializeInterval(raw: FirestoreData): UpstreamProductionInterval {
  return {
    startAt: toDateSafe(raw.startAt),
    endAt:   toDateSafe(raw.endAt),
    cycles:         Number(raw.cycles ?? 0),
    expectedCycles: Number(raw.expectedCycles ?? 0),
    total:          Number(raw.total ?? 0),
    expectedTotal:  Number(raw.expectedTotal ?? 0),
    ratio:          Number(raw.ratio ?? 0),
    color:          (raw.color as UpstreamProductionInterval['color']) ?? 'gray',
  }
}

function deserializeState(raw: FirestoreData): UpstreamMachineState {
  return {
    startAt:     toDateSafe(raw.startAt),
    endAt:       toDateSafe(raw.endAt),
    durationSec: Number(raw.durationSec ?? 0),
    type:        (raw.type as UpstreamMachineState['type']) ?? 'downtime',
    name:        String(raw.name ?? ''),
    reason:      String(raw.reason ?? ''),
    color:       String(raw.color ?? '#64748b'),
    isCurrent:   Boolean(raw.isCurrent),
  }
}

function deserializeShift(raw: FirestoreData): UpstreamMachineShift {
  return {
    machineid:           String(raw.machineid ?? ''),
    machineName:         String(raw.machineName ?? ''),
    machineType:         (raw.machineType as UpstreamMachineShift['machineType']) ?? 'other',
    dateKey:             String(raw.dateKey ?? ''),
    shiftId:             String(raw.shiftId ?? ''),
    shiftStart:          toDateSafe(raw.shiftStart),
    shiftEnd:            toDateSafe(raw.shiftEnd),
    totalCycles:         Number(raw.totalCycles ?? 0),
    expectedTotalCycles: Number(raw.expectedTotalCycles ?? 0),
    totalPieces:         Number(raw.totalPieces ?? 0),
    expectedTotalPieces: Number(raw.expectedTotalPieces ?? 0),
    overallRatio:        Number(raw.overallRatio ?? 0),
    actualRuntime:       Number(raw.actualRuntime ?? 0),
    expectedRuntime:     Number(raw.expectedRuntime ?? 0),
    runtimeVariance:     Number(raw.runtimeVariance ?? 0),
    intervals:           Array.isArray(raw.intervals) ? raw.intervals.map(x => deserializeInterval(x as FirestoreData)) : [],
    states:              Array.isArray(raw.states)    ? raw.states.map(x => deserializeState(x as FirestoreData))       : [],
    threshold:           Number(raw.threshold ?? 15),
    productionUnit:      String(raw.productionUnit ?? ''),
    comments:            Array.isArray(raw.comments) ? raw.comments.map(coerceComment).filter(Boolean) : [],
    source:              'shoplogix',
    sourceVersion:       Number(raw.sourceVersion ?? 1),
    syncedAt:            toDateSafe(raw.syncedAt),
  }
}

export interface LoadShoplogixShiftResult {
  snapshot: UpstreamLineSnapshot | null
  syncedAt: Date | null
}

/**
 * Carga el snapshot de un turno desde Firestore (las 3 Evisceradoras).
 * Retorna `snapshot: null` si no hay documentos en la colección.
 */
export async function loadShoplogixShift(
  dateKey: string,
  shiftId: string,
): Promise<LoadShoplogixShiftResult> {
  const shiftDocId = `${dateKey}_${shiftId}`
  const parentRef = doc(db, `shoplogix/${PLANT_SLUG}/shifts/${shiftDocId}`)
  const machinesRef = collection(db, `shoplogix/${PLANT_SLUG}/shifts/${shiftDocId}/machines`)

  const [parentSnap, machinesSnap] = await Promise.all([
    getDoc(parentRef),
    getDocs(machinesRef),
  ])

  if (machinesSnap.empty) {
    return { snapshot: null, syncedAt: null }
  }

  const machines: UpstreamMachineShift[] = []
  machinesSnap.forEach(d => {
    machines.push(deserializeShift(d.data() as FirestoreData))
  })

  // Orden consistente: Evisceradora 1, 2, 3
  machines.sort((a, b) => a.machineName.localeCompare(b.machineName))

  const snapshot = buildLineSnapshot({ dateKey, shiftId, machines })

  const parentData = parentSnap.exists() ? parentSnap.data() : null
  const syncedAt = parentData?.lastSyncAt ? toDateSafe(parentData.lastSyncAt) : null

  return { snapshot, syncedAt }
}
