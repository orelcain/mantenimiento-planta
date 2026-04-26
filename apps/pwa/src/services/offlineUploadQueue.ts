import { ref, uploadBytesResumable, getDownloadURL } from 'firebase/storage'
import { storage } from '@/services/firebase'
import { useUploadQueueStore, type UploadItem } from '@/store/uploadQueueStore'
import { getPhotoEvidenceById, updatePhotoEvidence } from '@/services/photoEvidence'
import { logger } from '@/lib/logger'

const DB_NAME = 'offline-upload-queue'
const STORE_NAME = 'evidenceUploads'
const DB_VERSION = 1

interface StoredUpload {
  id: string
  evidenceId: string
  type: 'before' | 'after'
  fileName: string
  size: number
  blob: Blob
  createdAt: number
}

function openDb(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, DB_VERSION)
    request.onupgradeneeded = () => {
      const db = request.result
      if (!db.objectStoreNames.contains(STORE_NAME)) {
        db.createObjectStore(STORE_NAME, { keyPath: 'id' })
      }
    }
    request.onsuccess = () => resolve(request.result)
    request.onerror = () => reject(request.error)
  })
}

async function addUpload(entry: StoredUpload): Promise<void> {
  const db = await openDb()
  const tx = db.transaction(STORE_NAME, 'readwrite')
  tx.objectStore(STORE_NAME).put(entry)
  return new Promise((resolve, reject) => {
    tx.oncomplete = () => resolve()
    tx.onerror = () => reject(tx.error)
  })
}

async function deleteUpload(id: string): Promise<void> {
  const db = await openDb()
  const tx = db.transaction(STORE_NAME, 'readwrite')
  tx.objectStore(STORE_NAME).delete(id)
  return new Promise((resolve, reject) => {
    tx.oncomplete = () => resolve()
    tx.onerror = () => reject(tx.error)
  })
}

async function getAllUploads(): Promise<StoredUpload[]> {
  const db = await openDb()
  const tx = db.transaction(STORE_NAME, 'readonly')
  const store = tx.objectStore(STORE_NAME)
  const req = store.getAll()
  return new Promise((resolve, reject) => {
    req.onsuccess = () => resolve(req.result as StoredUpload[])
    req.onerror = () => reject(req.error)
  })
}

function toUploadItem(entry: StoredUpload): UploadItem {
  return {
    id: entry.id,
    evidenceId: entry.evidenceId,
    type: entry.type,
    fileName: entry.fileName,
    size: entry.size,
    progress: 0,
    status: 'queued',
    createdAt: entry.createdAt,
  }
}

function replacePendingUrl(evidence: any, photoId: string, url: string) {
  const fixList = (list?: any[]) => {
    if (!Array.isArray(list)) return list
    return list.map((p) => (p?.id === photoId && String(p.url || '').startsWith('pending:')
      ? { ...p, url }
      : p))
  }

  const pairPhotos = Array.isArray(evidence.pairPhotos) ? evidence.pairPhotos.map((pp: any) => ({
    ...pp,
    before: fixList(pp.before),
    after: fixList(pp.after),
  })) : evidence.pairPhotos

  return {
    fotosBefore: fixList(evidence.fotosBefore),
    fotosAfter: fixList(evidence.fotosAfter),
    pairPhotos,
  }
}

export async function enqueueEvidenceUpload(
  evidenceId: string,
  file: File,
  type: 'before' | 'after',
  photoId: string
): Promise<void> {
  const entry: StoredUpload = {
    id: photoId,
    evidenceId,
    type,
    fileName: file.name,
    size: file.size,
    blob: file,
    createdAt: Date.now(),
  }
  await addUpload(entry)
  useUploadQueueStore.getState().upsertItem(toUploadItem(entry))
}

export async function loadUploadQueue(): Promise<void> {
  try {
    const entries = await getAllUploads()
    useUploadQueueStore.getState().setItems(entries.map(toUploadItem))
  } catch {
    logger.warn('Failed to load upload queue')
  }
}

export async function processUploadQueue(): Promise<void> {
  if (!navigator.onLine) return
  const entries = await getAllUploads()

  for (const entry of entries) {
    const itemId = entry.id
    useUploadQueueStore.getState().updateItem(itemId, { status: 'uploading', progress: 0 })
    try {
      const storageRef = ref(storage, `evidence/${entry.evidenceId}/${entry.type}/${entry.fileName}`)
      const uploadTask = uploadBytesResumable(storageRef, entry.blob, {
        contentType: entry.blob.type || 'image/jpeg',
      })

      await new Promise<void>((resolve, reject) => {
        uploadTask.on('state_changed', (snapshot) => {
          const progress = Math.round((snapshot.bytesTransferred / snapshot.totalBytes) * 100)
          useUploadQueueStore.getState().updateItem(itemId, { progress })
        }, reject, () => resolve())
      })

      const url = await getDownloadURL(storageRef)
      const evidence = await getPhotoEvidenceById(entry.evidenceId)
      if (evidence) {
        const patched = replacePendingUrl(evidence, entry.id, url)
        await updatePhotoEvidence(entry.evidenceId, patched)
      }

      await deleteUpload(itemId)
      useUploadQueueStore.getState().updateItem(itemId, { status: 'done', progress: 100 })
      useUploadQueueStore.getState().removeItem(itemId)
    } catch (error: any) {
      useUploadQueueStore.getState().updateItem(itemId, {
        status: 'error',
        error: error?.message ?? String(error),
      })
    }
  }
}

export function initUploadQueue(): void {
  loadUploadQueue()
  if (navigator.onLine) {
    processUploadQueue()
  }
  window.addEventListener('online', () => {
    processUploadQueue()
  })
}
