/**
 * Tokens públicos para compartir un turno del Grader sin login.
 *
 * El token almacena un snapshot denormalizado (summary + timelineBuckets +
 * pauses) directamente en el doc de Firestore. Regla: `allow read: if true`.
 * Expiración: 24h. El check se hace en el cliente.
 *
 * Antes el TTL era 7 días — se acortó a 24h porque el doc contiene datos
 * operacionales del turno (KPIs, pausas, lotes) y si la URL del token se
 * filtra por WhatsApp/email/captura, esa ventana de exposición debería ser
 * lo más corta posible. Si el supervisor necesita compartir más de un día,
 * regenera el token.
 *
 * Colección: graderPublicTokens
 * ID doc: UUID v4 generado con crypto.randomUUID()
 */

import { doc, getDoc, setDoc, deleteDoc } from '@/services/firestoreTracked'
import { db } from '../firebase'
import type { GraderDailySummary, TimelineBucket, Pause } from './types'

const COLLECTION = 'graderPublicTokens'
const EXPIRY_DAYS = 1

export interface GraderPublicTokenDoc {
  token: string
  summaryId: string
  dateKey: string
  shiftId: string
  createdBy: string
  createdAt: string
  expiresAt: string
  /** Snapshot del summary (sin bucketExtrasByMinute para reducir tamaño) */
  summary: Omit<GraderDailySummary, 'bucketExtrasByMinute'>
  timelineBuckets: TimelineBucket[]
  pauses: Pause[]
}

export async function createPublicToken(
  summaryId: string,
  data: {
    dateKey: string
    shiftId: string
    createdBy: string
    summary: GraderDailySummary
    timelineBuckets: TimelineBucket[]
    pauses: Pause[]
  },
): Promise<string> {
  const token = crypto.randomUUID()
  const now = new Date()
  const expiresAt = new Date(now.getTime() + EXPIRY_DAYS * 24 * 60 * 60 * 1000)

  // Excluir bucketExtrasByMinute — puede ser muy grande y no se usa en la vista pública
  const { bucketExtrasByMinute: _omit, ...summaryLite } = data.summary

  const docData: GraderPublicTokenDoc = {
    token,
    summaryId,
    dateKey: data.dateKey,
    shiftId: data.shiftId,
    createdBy: data.createdBy,
    createdAt: now.toISOString(),
    expiresAt: expiresAt.toISOString(),
    summary: summaryLite,
    timelineBuckets: data.timelineBuckets,
    pauses: data.pauses,
  }

  await setDoc(doc(db, COLLECTION, token), docData)
  return token
}

export async function loadPublicToken(token: string): Promise<GraderPublicTokenDoc | null> {
  const snap = await getDoc(doc(db, COLLECTION, token))
  if (!snap.exists()) return null
  return snap.data() as GraderPublicTokenDoc
}

export async function revokePublicToken(token: string): Promise<void> {
  await deleteDoc(doc(db, COLLECTION, token))
}
