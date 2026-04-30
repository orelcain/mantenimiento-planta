/**
 * Configuracion global del modulo Grader (rangos de peso compartidos).
 */

import {
  doc,
  getDoc,
  setDoc,
  serverTimestamp,
} from '@/services/firestoreTracked'
import { db } from '../firebase'
import type { CalibreWeightRange, GraderModuleConfig, GraderPhysicalConfig, GraderShiftSchedule, PauseDetectorConfig } from './types'

const COLLECTION = 'graderModuleConfigs'
const GLOBAL_ID = 'global'

/**
 * Resuelve el ID del documento de configuración por planta.
 *
 * - Chonchi (o sin planta) → 'global'  (backward compat, doc ya existente)
 * - Yal                    → 'yal-eviscerado'  (namespace separado)
 * - Cualquier otro valor   → usa el plantLineId como docId directamente
 */
function configDocId(plantLineId?: string | null): string {
  if (!plantLineId || plantLineId === 'chonchi-eviscerado') return GLOBAL_ID
  return plantLineId
}

function isPlainObject(value: unknown): value is Record<string, unknown> {
  if (Object.prototype.toString.call(value) !== '[object Object]') return false
  const proto = Object.getPrototypeOf(value)
  return proto === Object.prototype || proto === null
}

function deepCleanUndefined<T>(value: T): T {
  if (value === undefined) return value
  if (Array.isArray(value)) {
    return value
      .map((v) => deepCleanUndefined(v))
      .filter((v) => v !== undefined) as T
  }
  if (isPlainObject(value)) {
    const entries = Object.entries(value)
      .map(([k, v]) => [k, deepCleanUndefined(v)] as const)
      .filter(([, v]) => v !== undefined)
    return Object.fromEntries(entries) as T
  }
  return value
}

export async function saveModuleRanges(params: {
  ranges: CalibreWeightRange[]
  updatedBy: string
  plantLineId?: string
}): Promise<GraderModuleConfig> {
  const docId = configDocId(params.plantLineId)
  const cfg: GraderModuleConfig = {
    id: docId,
    customWeightRanges: params.ranges,
    updatedBy: params.updatedBy,
    updatedAt: new Date().toISOString(),
  }

  const firestoreData = deepCleanUndefined({
    ...cfg,
    _updatedAt: serverTimestamp(),
  })

  await setDoc(doc(db, COLLECTION, docId), firestoreData, { merge: true })
  return cfg
}

export async function saveModuleShiftSchedule(params: {
  schedule: GraderShiftSchedule[]
  updatedBy: string
  plantLineId?: string
}): Promise<GraderModuleConfig> {
  const docId = configDocId(params.plantLineId)
  const firestoreData = deepCleanUndefined({
    id: docId,
    shiftSchedule: params.schedule,
    updatedBy: params.updatedBy,
    updatedAt: new Date().toISOString(),
    _updatedAt: serverTimestamp(),
  })

  await setDoc(doc(db, COLLECTION, docId), firestoreData, { merge: true })
  return {
    id: docId,
    customWeightRanges: [],
    shiftSchedule: params.schedule,
    updatedBy: params.updatedBy,
    updatedAt: new Date().toISOString(),
  }
}

export async function saveModulePhysicalConfig(params: {
  physicalConfig: GraderPhysicalConfig
  updatedBy: string
  plantLineId?: string
}): Promise<void> {
  const docId = configDocId(params.plantLineId)
  const firestoreData = deepCleanUndefined({
    id: docId,
    physicalConfig: params.physicalConfig,
    updatedBy: params.updatedBy,
    updatedAt: new Date().toISOString(),
    _updatedAt: serverTimestamp(),
  })
  await setDoc(doc(db, COLLECTION, docId), firestoreData, { merge: true })
}

export async function getModuleRanges(plantLineId?: string): Promise<GraderModuleConfig | null> {
  const snap = await getDoc(doc(db, COLLECTION, configDocId(plantLineId)))
  if (!snap.exists()) return null
  return snap.data() as GraderModuleConfig
}

/** Persiste configuración del detector de pausas en el doc de la planta (merge). */
export async function savePauseDetectorConfig(params: {
  config: PauseDetectorConfig
  updatedBy: string
  plantLineId?: string
}): Promise<void> {
  const docId = configDocId(params.plantLineId)
  const data = deepCleanUndefined({
    id: docId,
    pauseDetectorConfig: params.config,
    updatedBy: params.updatedBy,
    updatedAt: new Date().toISOString(),
    _updatedAt: serverTimestamp(),
  })
  await setDoc(doc(db, COLLECTION, docId), data, { merge: true })
}

/** Persiste umbrales P0% + rangos de calibre en el doc de la planta (merge). */
export async function saveModuleAnalysisConfig(params: {
  alertThreshold: number
  criticalThreshold: number
  customWeightRanges: CalibreWeightRange[]
  updatedBy: string
  plantLineId?: string
}): Promise<void> {
  const docId = configDocId(params.plantLineId)
  const data = deepCleanUndefined({
    id: docId,
    alertThreshold: params.alertThreshold,
    criticalThreshold: params.criticalThreshold,
    customWeightRanges: params.customWeightRanges,
    updatedBy: params.updatedBy,
    updatedAt: new Date().toISOString(),
    _updatedAt: serverTimestamp(),
  })
  await setDoc(doc(db, COLLECTION, docId), data, { merge: true })
}
