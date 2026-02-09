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
} from 'firebase/firestore'
import { db } from '@/services/firebase'
import {
  decrementPendingWrites,
  incrementPendingWrites,
  markEntryError,
  markEntrySynced,
  setSyncError,
} from '@/store/syncStore'

async function trackWrite<T>(op: () => Promise<T>, context: string): Promise<T> {
  const entryId = incrementPendingWrites(context)
  let done = false

  const finish = () => {
    if (done) return
    done = true
    decrementPendingWrites(context)
    markEntrySynced(entryId)
  }

  try {
    const result = await op()
    waitForPendingWrites(db)
      .then(() => finish())
      .catch((error) => {
        const message = `[${context}] ${error?.message ?? String(error)}`
        setSyncError(message)
        markEntryError(entryId, message)
        finish()
      })
    return result
  } catch (error: any) {
    const message = `[${context}] ${error?.message ?? String(error)}`
    setSyncError(message)
    markEntryError(entryId, message)
    finish()
    throw error
  }
}

export async function addDoc(...args: Parameters<typeof _addDoc>) {
  return trackWrite(() => _addDoc(...args), 'addDoc')
}

export async function setDoc<T>(
  reference: DocumentReference<T>,
  data: WithFieldValue<T>,
  options?: SetOptions
): Promise<void> {
  return trackWrite(
    () => (options ? _setDoc(reference, data, options) : _setDoc(reference, data)),
    'setDoc'
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
  return trackWrite(
    () => (_updateDoc as any)(reference, dataOrField, ...rest),
    'updateDoc'
  )
}

export async function deleteDoc(...args: Parameters<typeof _deleteDoc>) {
  return trackWrite(() => _deleteDoc(...args), 'deleteDoc')
}

export async function runTransaction(...args: Parameters<typeof _runTransaction>) {
  return trackWrite(() => _runTransaction(...args), 'runTransaction')
}

export function writeBatch(...args: Parameters<typeof _writeBatch>): WriteBatch {
  const batch = _writeBatch(...args)
  const originalCommit = batch.commit.bind(batch)
  batch.commit = () => trackWrite(() => originalCommit(), 'writeBatch')
  return batch
}
