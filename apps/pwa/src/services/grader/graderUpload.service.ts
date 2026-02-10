/**
 * Servicio de persistencia de uploads Grader (calendario de archivos).
 */

import {
  collection,
  doc,
  getDocs,
  setDoc,
  query,
  orderBy,
  limit,
  serverTimestamp,
} from '@/services/firestoreTracked'
import { db } from '../firebase'
import { generateId } from '@/lib/utils'
import type { GraderUpload, UploadedMatrixFile } from './types'

const COLLECTION = 'graderUploads'

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

export async function saveGraderUpload(params: {
  id?: string
  fileMeta: UploadedMatrixFile
  inferred?: { startAt?: string; endAt?: string }
  sessionDate: string
  shiftId?: string
  deviceId?: string
  createdBy: string
}): Promise<GraderUpload> {
  const id = params.id || params.fileMeta.id || generateId()
  const upload: GraderUpload = {
    id,
    fileMeta: params.fileMeta,
    inferred: params.inferred,
    sessionDate: params.sessionDate,
    shiftId: params.shiftId,
    deviceId: params.deviceId,
    createdBy: params.createdBy,
    createdAt: new Date().toISOString(),
  }

  const firestoreData = deepCleanUndefined({
    ...upload,
    _createdAt: serverTimestamp(),
    _updatedAt: serverTimestamp(),
  })

  await setDoc(doc(db, COLLECTION, id), firestoreData)
  return upload
}

export async function updateGraderUpload(id: string, patch: Partial<GraderUpload>): Promise<void> {
  const firestoreData = deepCleanUndefined({
    ...patch,
    _updatedAt: serverTimestamp(),
  })
  await setDoc(doc(db, COLLECTION, id), firestoreData, { merge: true })
}

export async function listGraderUploads(max = 200): Promise<GraderUpload[]> {
  const q = query(
    collection(db, COLLECTION),
    orderBy('_createdAt', 'desc'),
    limit(max),
  )
  const snap = await getDocs(q)
  return snap.docs.map((d) => d.data() as GraderUpload)
}
