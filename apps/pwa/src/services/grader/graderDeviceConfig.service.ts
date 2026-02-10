/**
 * Persistencia de configuracion por dispositivo (rangos de peso).
 */

import {
  doc,
  getDoc,
  setDoc,
  serverTimestamp,
} from '@/services/firestoreTracked'
import { db } from '../firebase'
import type { CalibreWeightRange, GraderDeviceConfig } from './types'

const COLLECTION = 'graderDeviceConfigs'

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

export async function saveDeviceRanges(params: {
  deviceId: string
  ranges: CalibreWeightRange[]
  updatedBy: string
}): Promise<GraderDeviceConfig> {
  const cfg: GraderDeviceConfig = {
    id: params.deviceId,
    deviceId: params.deviceId,
    customWeightRanges: params.ranges,
    updatedBy: params.updatedBy,
    updatedAt: new Date().toISOString(),
  }

  const firestoreData = deepCleanUndefined({
    ...cfg,
    _updatedAt: serverTimestamp(),
  })

  await setDoc(doc(db, COLLECTION, params.deviceId), firestoreData, { merge: true })
  return cfg
}

export async function getDeviceRanges(deviceId: string): Promise<GraderDeviceConfig | null> {
  const snap = await getDoc(doc(db, COLLECTION, deviceId))
  if (!snap.exists()) return null
  return snap.data() as GraderDeviceConfig
}
