/**
 * Servicio de persistencia de uploads Grader (calendario de archivos).
 */

import {
  collection,
  doc,
  getDocs,
  setDoc,
  deleteDoc,
  query,
  orderBy,
  limit,
  serverTimestamp,
  waitForPendingWrites,
} from '@/services/firestoreTracked'
import { ref, uploadBytes, getDownloadURL, deleteObject } from 'firebase/storage'
import { db, storage } from '../firebase'
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
  plantLineId?: string
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
    plantLineId: params.plantLineId,
    deviceId: params.deviceId,
    createdBy: params.createdBy,
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  }

  const firestoreData = deepCleanUndefined({
    ...upload,
    _createdAt: serverTimestamp(),
    _updatedAt: serverTimestamp(),
  })

  await setDoc(doc(db, COLLECTION, id), firestoreData)
  return upload
}

export async function uploadGraderFile(file: File, uploadId: string): Promise<{ storagePath: string; downloadURL: string }> {
  const safeName = file.name.replace(/[^a-zA-Z0-9._-]/g, '_')
  const storagePath = `graderUploads/${uploadId}/${Date.now()}_${safeName}`
  const storageRef = ref(storage, storagePath)
  await uploadBytes(storageRef, file, {
    contentType: file.type || 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  })
  const downloadURL = await getDownloadURL(storageRef)
  return { storagePath, downloadURL }
}

export async function updateGraderUpload(id: string, patch: Partial<GraderUpload>): Promise<void> {
  const firestoreData = deepCleanUndefined({
    ...patch,
    updatedAt: new Date().toISOString(),
    _updatedAt: serverTimestamp(),
  })
  await setDoc(doc(db, COLLECTION, id), firestoreData, { merge: true })
}

export async function listGraderUploads(
  plantLineId?: string,
  max = 1000,
): Promise<GraderUpload[]> {
  const q = query(
    collection(db, COLLECTION),
    orderBy('_createdAt', 'desc'),
    limit(max),
  )
  const snap = await getDocs(q)
  const all = snap.docs.map((d) => d.data() as GraderUpload)
  if (!plantLineId) return all
  // fix-on-read: docs sin plantLineId son legacy → pertenecen a chonchi-eviscerado
  return all.filter(
    (u) => (u.plantLineId ?? 'chonchi-eviscerado') === plantLineId,
  )
}

export async function deleteGraderUpload(upload: GraderUpload): Promise<void> {
  // Eliminar doc de Firestore
  await deleteDoc(doc(db, COLLECTION, upload.id))
  // Esperar confirmación del servidor antes de continuar
  await waitForPendingWrites(db)
  // Eliminar archivo de Storage si existe
  if (upload.fileMeta.storagePath) {
    try {
      const storageRef = ref(storage, upload.fileMeta.storagePath)
      await deleteObject(storageRef)
    } catch {
      // Si falla la eliminación del Storage, no bloqueamos
    }
  }
}
