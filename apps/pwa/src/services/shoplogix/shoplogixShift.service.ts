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
  const shiftStart = toDateSafe(raw.shiftStart)
  const shiftEnd   = toDateSafe(raw.shiftEnd)
  const states: UpstreamMachineState[] = Array.isArray(raw.states)
    ? raw.states.map(x => deserializeState(x as FirestoreData))
    : []

  // Si los docs Firestore aún no traen shiftRuntime/breakdown (data legacy),
  // los recomputamos desde states. Mismo cálculo que el normalizer.
  const breakdown = (raw.shiftRuntimeBreakdown && typeof raw.shiftRuntimeBreakdown === 'object'
    ? {
        uptimeSec:       Number((raw.shiftRuntimeBreakdown as FirestoreData).uptimeSec ?? 0),
        breakSec:        Number((raw.shiftRuntimeBreakdown as FirestoreData).breakSec ?? 0),
        downtimeSec:     Number((raw.shiftRuntimeBreakdown as FirestoreData).downtimeSec ?? 0),
        setupSec:        Number((raw.shiftRuntimeBreakdown as FirestoreData).setupSec ?? 0),
        totalTrackedSec: Number((raw.shiftRuntimeBreakdown as FirestoreData).totalTrackedSec ?? 0),
      }
    : (() => {
        const b = {
          uptimeSec:   states.filter(s => s.type === 'uptime').reduce((a, s) => a + s.durationSec, 0),
          breakSec:    states.filter(s => s.type === 'break').reduce((a, s) => a + s.durationSec, 0),
          downtimeSec: states.filter(s => s.type === 'downtime').reduce((a, s) => a + s.durationSec, 0),
          setupSec:    states.filter(s => s.type === 'setup').reduce((a, s) => a + s.durationSec, 0),
          totalTrackedSec: 0,
        }
        b.totalTrackedSec = b.uptimeSec + b.breakSec + b.downtimeSec + b.setupSec
        return b
      })()
  )
  // shiftRuntime SIEMPRE se recomputa desde breakdown — los docs almacenados
  // pueden tener un valor de la fórmula vieja (`uptime / shiftDuration`) que
  // dependía de bounds incorrectos. Con la fórmula nueva (`uptime / totalTracked`)
  // es robusta a los bounds y no requiere re-sync.
  const shiftRuntime = breakdown.totalTrackedSec > 0
    ? breakdown.uptimeSec / breakdown.totalTrackedSec
    : 0

  return {
    machineid:           String(raw.machineid ?? ''),
    machineName:         String(raw.machineName ?? ''),
    machineType:         (raw.machineType as UpstreamMachineShift['machineType']) ?? 'other',
    dateKey:             String(raw.dateKey ?? ''),
    shiftId:             String(raw.shiftId ?? ''),
    shiftStart,
    shiftEnd,
    totalCycles:         Number(raw.totalCycles ?? 0),
    expectedTotalCycles: Number(raw.expectedTotalCycles ?? 0),
    totalPieces:         Number(raw.totalPieces ?? 0),
    expectedTotalPieces: Number(raw.expectedTotalPieces ?? 0),
    overallRatio:        Number(raw.overallRatio ?? 0),
    actualRuntime:       Number(raw.actualRuntime ?? 0),
    expectedRuntime:     Number(raw.expectedRuntime ?? 0),
    runtimeVariance:     Number(raw.runtimeVariance ?? 0),
    shiftRuntime,
    shiftRuntimeBreakdown: breakdown,
    intervals:           Array.isArray(raw.intervals) ? raw.intervals.map(x => deserializeInterval(x as FirestoreData)) : [],
    states,
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
