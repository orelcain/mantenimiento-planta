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
} from 'firebase/firestore'
import { db } from '@/services/firebase'
import { decrementPendingWrites, incrementPendingWrites, setSyncError } from '@/store/syncStore'

async function trackWrite<T>(op: () => Promise<T>, context: string): Promise<T> {
  incrementPendingWrites(context)
  let done = false

  const finish = () => {
    if (done) return
    done = true
    decrementPendingWrites(context)
  }

  try {
    const result = await op()
    waitForPendingWrites(db)
      .then(() => finish())
      .catch((error) => {
        setSyncError(`[${context}] ${error?.message ?? String(error)}`)
        finish()
      })
    return result
  } catch (error: any) {
    setSyncError(`[${context}] ${error?.message ?? String(error)}`)
    finish()
    throw error
  }
}

export async function addDoc(...args: Parameters<typeof _addDoc>) {
  return trackWrite(() => _addDoc(...args), 'addDoc')
}

export async function setDoc(...args: Parameters<typeof _setDoc>) {
  return trackWrite(() => _setDoc(...args), 'setDoc')
}

export async function updateDoc(...args: Parameters<typeof _updateDoc>) {
  return trackWrite(() => _updateDoc(...args), 'updateDoc')
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
