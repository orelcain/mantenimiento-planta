/**
 * CRUD Firestore para la colección `graderPauseTags`.
 *
 * Cada tag vive en un doc con id = tag.id (estable, snake_case).
 * Soft-delete via campo `archived: true`.
 *
 * Si la colección está vacía, `listPauseTags()` retorna [] y el hook
 * aplica el fallback hardcoded. Para poblarla por primera vez usar
 * `seedDefaultTagsIfEmpty()` desde el admin.
 */

import {
  collection,
  doc,
  getDocs,
  setDoc,
  serverTimestamp,
  writeBatch,
} from '@/services/firestoreTracked'
import { db } from '../firebase'
import { GRADER_PAUSE_TAGS } from './graderPauseTags'
import type { GraderPauseTag } from './graderPauseTags'

const COLLECTION = 'graderPauseTags'

interface TagDoc extends GraderPauseTag {
  order?: number
  archived?: boolean
  updatedBy?: string
  updatedAt?: string
}

/** Lista tags activos ordenados por `order`. Retorna [] si la colección está vacía. */
export async function listPauseTags(): Promise<GraderPauseTag[]> {
  const snap = await getDocs(collection(db, COLLECTION))
  if (snap.empty) return []
  return snap.docs
    .map(d => d.data() as TagDoc)
    .filter(t => !t.archived)
    .sort((a, b) => (a.order ?? 99) - (b.order ?? 99))
    .map(({ id, label, emoji, color, bandFill }) => ({ id, label, emoji, color, bandFill }))
}

/** Crea o actualiza un tag. Usa `tag.id` como doc id. */
export async function savePauseTag(
  tag: GraderPauseTag & { order?: number },
  updatedBy: string,
): Promise<void> {
  await setDoc(
    doc(db, COLLECTION, tag.id),
    {
      ...tag,
      archived: false,
      updatedBy,
      updatedAt: new Date().toISOString(),
      _updatedAt: serverTimestamp(),
    },
    { merge: true },
  )
}

/** Soft-delete de un tag (archived: true). Los reportes históricos lo siguen resolviendo. */
export async function archivePauseTag(id: string, updatedBy: string): Promise<void> {
  await setDoc(
    doc(db, COLLECTION, id),
    {
      archived: true,
      updatedBy,
      updatedAt: new Date().toISOString(),
      _updatedAt: serverTimestamp(),
    },
    { merge: true },
  )
}

/**
 * Escribe los 9 tags hardcoded si la colección está vacía.
 * Retorna `true` si hizo el seed, `false` si ya había docs.
 */
export async function seedDefaultTagsIfEmpty(updatedBy: string): Promise<boolean> {
  const snap = await getDocs(collection(db, COLLECTION))
  if (!snap.empty) return false

  const batch = writeBatch(db)
  GRADER_PAUSE_TAGS.forEach((tag, idx) => {
    batch.set(doc(db, COLLECTION, tag.id), {
      ...tag,
      order: idx,
      archived: false,
      updatedBy,
      updatedAt: new Date().toISOString(),
    })
  })
  await batch.commit()
  return true
}
