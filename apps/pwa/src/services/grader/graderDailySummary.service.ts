/**
 * Persistencia de KPIs diarios por turno para Grader.
 */

import {
  doc,
  getDoc,
  setDoc,
  deleteDoc,
  serverTimestamp,
} from '@/services/firestoreTracked'
import { db } from '../firebase'
import type { GraderDailySummary } from './types'

const COLLECTION = 'graderDailySummaries'

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

export function buildDailySummaryId(dateKey: string, shiftId: string): string {
  return `${dateKey}__${shiftId}`
}

export async function getDailySummary(dateKey: string, shiftId: string): Promise<GraderDailySummary | null> {
  const id = buildDailySummaryId(dateKey, shiftId)
  const snap = await getDoc(doc(db, COLLECTION, id))
  if (!snap.exists()) return null
  return snap.data() as GraderDailySummary
}

export async function saveDailySummary(params: {
  dateKey: string
  shiftId: string
  totalPieces: number
  pointZeroPieces: number
  pointZeroPct: number
  startAt?: string
  endAt?: string
  updatedBy: string
}): Promise<GraderDailySummary> {
  const id = buildDailySummaryId(params.dateKey, params.shiftId)
  const summary: GraderDailySummary = {
    id,
    dateKey: params.dateKey,
    shiftId: params.shiftId,
    totalPieces: params.totalPieces,
    pointZeroPieces: params.pointZeroPieces,
    pointZeroPct: params.pointZeroPct,
    startAt: params.startAt,
    endAt: params.endAt,
    updatedBy: params.updatedBy,
    updatedAt: new Date().toISOString(),
  }

  const firestoreData = deepCleanUndefined({
    ...summary,
    _updatedAt: serverTimestamp(),
  })

  await setDoc(doc(db, COLLECTION, id), firestoreData, { merge: true })
  return summary
}

export async function deleteDailySummary(dateKey: string, shiftId: string): Promise<void> {
  const id = buildDailySummaryId(dateKey, shiftId)
  await deleteDoc(doc(db, COLLECTION, id))
}
