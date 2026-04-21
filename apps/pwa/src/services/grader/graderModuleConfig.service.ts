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
import type { CalibreWeightRange, GraderModuleConfig, GraderPhysicalConfig, GraderShiftSchedule } from './types'

const COLLECTION = 'graderModuleConfigs'
const GLOBAL_ID = 'global'

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
}): Promise<GraderModuleConfig> {
  const cfg: GraderModuleConfig = {
    id: 'global',
    customWeightRanges: params.ranges,
    updatedBy: params.updatedBy,
    updatedAt: new Date().toISOString(),
  }

  const firestoreData = deepCleanUndefined({
    ...cfg,
    _updatedAt: serverTimestamp(),
  })

  await setDoc(doc(db, COLLECTION, GLOBAL_ID), firestoreData, { merge: true })
  return cfg
}

export async function saveModuleShiftSchedule(params: {
  schedule: GraderShiftSchedule[]
  updatedBy: string
}): Promise<GraderModuleConfig> {
  const firestoreData = deepCleanUndefined({
    id: 'global',
    shiftSchedule: params.schedule,
    updatedBy: params.updatedBy,
    updatedAt: new Date().toISOString(),
    _updatedAt: serverTimestamp(),
  })

  await setDoc(doc(db, COLLECTION, GLOBAL_ID), firestoreData, { merge: true })
  return {
    id: 'global',
    customWeightRanges: [],
    shiftSchedule: params.schedule,
    updatedBy: params.updatedBy,
    updatedAt: new Date().toISOString(),
  }
}

export async function saveModulePhysicalConfig(params: {
  physicalConfig: GraderPhysicalConfig
  updatedBy: string
}): Promise<void> {
  const firestoreData = deepCleanUndefined({
    id: 'global',
    physicalConfig: params.physicalConfig,
    updatedBy: params.updatedBy,
    updatedAt: new Date().toISOString(),
    _updatedAt: serverTimestamp(),
  })
  await setDoc(doc(db, COLLECTION, GLOBAL_ID), firestoreData, { merge: true })
}

export async function getModuleRanges(): Promise<GraderModuleConfig | null> {
  const snap = await getDoc(doc(db, COLLECTION, GLOBAL_ID))
  if (!snap.exists()) return null
  return snap.data() as GraderModuleConfig
}

/** Persiste umbrales P0% + rangos de calibre en el doc global (merge). */
export async function saveModuleAnalysisConfig(params: {
  alertThreshold: number
  criticalThreshold: number
  customWeightRanges: CalibreWeightRange[]
  updatedBy: string
}): Promise<void> {
  const data = deepCleanUndefined({
    id: 'global',
    alertThreshold: params.alertThreshold,
    criticalThreshold: params.criticalThreshold,
    customWeightRanges: params.customWeightRanges,
    updatedBy: params.updatedBy,
    updatedAt: new Date().toISOString(),
    _updatedAt: serverTimestamp(),
  })
  await setDoc(doc(db, COLLECTION, GLOBAL_ID), data, { merge: true })
}
