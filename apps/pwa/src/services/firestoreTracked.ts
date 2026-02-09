export * from 'firebase/firestore'

import {
  addDoc as _addDoc,
  deleteDoc as _deleteDoc,
  runTransaction as _runTransaction,
  setDoc as _setDoc,
  updateDoc as _updateDoc,
  waitForPendingWrites,
  writeBatch as _writeBatch,
  type WriteBatch,
  type DocumentReference,
  type FieldPath,
  type SetOptions,
  type UpdateData,
  type WithFieldValue,
  type CollectionReference,
} from 'firebase/firestore'
import { db } from '@/services/firebase'
import {
  decrementPendingWrites,
  incrementPendingWrites,
  markEntryError,
  markEntrySynced,
  setSyncError,
} from '@/store/syncStore'

const RETRYABLE_CODES = new Set(['unavailable', 'deadline-exceeded', 'resource-exhausted', 'internal'])
const CONFLICT_CODES = new Set(['aborted', 'failed-precondition'])

function getModuleFromPath(path: string | undefined): string {
  if (!path) return 'write'
  const first = path.split('/')[0] || 'write'
  const map: Record<string, string> = {
    incidents: 'incidencias',
    maps: 'mapas',
    models3d: 'visor3d',
    photoEvidence: 'evidencias',
    equipment: 'equipos',
    zones: 'zonas',
    inspections: 'inspecciones',
    preventiveTasks: 'preventivo',
    permissions: 'permisos',
    users: 'usuarios',
    fcmTokens: 'notificaciones',
  }
  return map[first] ?? first
}

function serializePayload(payload: unknown): string | undefined {
  if (payload == null) return undefined
  try {
    return JSON.stringify(payload, (_key, value) => {
      if (typeof value === 'function') return '[Function]'
      if (value && typeof value === 'object' && (value as any)._methodName) {
        return `[FieldValue:${(value as any)._methodName}]`
      }
      return value
    })
  } catch {
    return '[Unserializable]'
  }
}

async function withBackoff<T>(op: () => Promise<T>, canRetry: boolean): Promise<T> {
  const delays = [1000, 2000, 4000]
  let lastError: any
  for (let attempt = 0; attempt < delays.length + 1; attempt++) {
    try {
      return await op()
    } catch (error: any) {
      lastError = error
      const code = error?.code as string | undefined
      if (!canRetry || !code || !RETRYABLE_CODES.has(code) || attempt >= delays.length) {
        throw error
      }
      await new Promise((r) => setTimeout(r, delays[attempt]))
    }
  }
  throw lastError
}

async function trackWrite<T>(
  op: () => Promise<T>,
  context: string,
  meta?: { refPath?: string; payload?: unknown; retryable?: boolean; retry?: () => Promise<void> }
): Promise<T> {
  const entryId = incrementPendingWrites(context, {
    refPath: meta?.refPath,
    payload: serializePayload(meta?.payload),
    retryable: meta?.retryable,
    retry: meta?.retry,
  })
  let done = false

  const finish = () => {
    if (done) return
    done = true
    decrementPendingWrites(context)
    markEntrySynced(entryId)
  }

  try {
    const result = await withBackoff(op, meta?.retryable ?? false)
    waitForPendingWrites(db)
      .then(() => finish())
      .catch((error) => {
        const message = `[${context}] ${error?.message ?? String(error)}`
        const code = error?.code as string | undefined
        const conflict = code ? CONFLICT_CODES.has(code) : false
        setSyncError(message)
        markEntryError(entryId, message, conflict)
        finish()
      })
    return result
  } catch (error: any) {
    const message = `[${context}] ${error?.message ?? String(error)}`
    const code = error?.code as string | undefined
    const conflict = code ? CONFLICT_CODES.has(code) : false
    setSyncError(message)
    markEntryError(entryId, message, conflict)
    finish()
    throw error
  }
}

export async function addDoc<T>(
  reference: CollectionReference<T>,
  data: WithFieldValue<T>
) {
  const context = `${getModuleFromPath(reference.path)}:addDoc`
  return trackWrite(() => _addDoc(reference, data), context, {
    refPath: reference.path,
    payload: data,
    retryable: false,
  })
}

export async function setDoc<T>(
  reference: DocumentReference<T>,
  data: WithFieldValue<T>,
  options?: SetOptions
): Promise<void> {
  const context = `${getModuleFromPath(reference.path)}:setDoc`
  return trackWrite(
    () => (options ? _setDoc(reference, data, options) : _setDoc(reference, data)),
    context,
    {
      refPath: reference.path,
      payload: data,
      retryable: true,
      retry: () => setDoc(reference, data, options),
    }
  )
}

export async function updateDoc<T>(
  reference: DocumentReference<T>,
  data: UpdateData<T>
): Promise<void>
export async function updateDoc(
  reference: DocumentReference,
  field: string | FieldPath,
  value: unknown,
  ...moreFieldsAndValues: unknown[]
): Promise<void>
export async function updateDoc(
  reference: DocumentReference,
  dataOrField: UpdateData<unknown> | string | FieldPath,
  ...rest: unknown[]
): Promise<void> {
  const context = `${getModuleFromPath(reference.path)}:updateDoc`
  return trackWrite(
    () => (_updateDoc as any)(reference, dataOrField, ...rest),
    context,
    {
      refPath: reference.path,
      payload: dataOrField,
      retryable: true,
      retry: () => (updateDoc as any)(reference, dataOrField, ...rest),
    }
  )
}

export async function deleteDoc(reference: DocumentReference): Promise<void> {
  const context = `${getModuleFromPath(reference.path)}:deleteDoc`
  return trackWrite(() => _deleteDoc(reference), context, {
    refPath: reference.path,
    retryable: true,
    retry: () => deleteDoc(reference),
  })
}

export async function runTransaction(...args: Parameters<typeof _runTransaction>) {
  return trackWrite(() => _runTransaction(...args), 'runTransaction', {
    retryable: true,
  })
}

export function writeBatch(...args: Parameters<typeof _writeBatch>): WriteBatch {
  const batch = _writeBatch(...args)
  const originalCommit = batch.commit.bind(batch)
  batch.commit = () => trackWrite(() => originalCommit(), 'writeBatch', {
    retryable: false,
  })
  return batch
}
