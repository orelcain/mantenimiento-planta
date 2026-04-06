/**
 * AuditLog + Papelera — Servicio centralizado
 *
 * Colecciones:
 *  - audit_log/{autoId}  → registro inmutable de operaciones
 *  - trash/{autoId}      → papelera restaurable (30 días)
 *
 * Todas las funciones son fire-and-forget para no bloquear la UX.
 */

import {
  collection,
  doc,
  addDoc,
  getDoc,
  getDocs,
  deleteDoc,
  setDoc,
  query,
  orderBy,
  where,
  limit as firestoreLimit,
  Timestamp,
  startAfter,
  writeBatch,
  type QueryConstraint,
  type DocumentData,
} from 'firebase/firestore'
import { db } from './firebase'
import type {
  AuditAction,
  AuditLogEntry,
  AuditLogFilters,
  TrashItem,
  TrashFilters,
} from '@/types/audit'

const AUDIT_COL = 'audit_log'
const TRASH_COL = 'trash'
const TRASH_RETENTION_DAYS = 30

// ── Helpers ──────────────────────────────────────────────────────

/** Sanitiza un objeto para Firestore (remueve undefined, convierte Date→Timestamp) */
function sanitizeForFirestore(obj: Record<string, unknown>): Record<string, unknown> {
  const result: Record<string, unknown> = {}
  for (const [k, v] of Object.entries(obj)) {
    if (v === undefined) continue
    if (v instanceof Date) {
      result[k] = Timestamp.fromDate(v)
    } else if (v && typeof v === 'object' && !Array.isArray(v) && !(v instanceof Timestamp)) {
      result[k] = sanitizeForFirestore(v as Record<string, unknown>)
    } else {
      result[k] = v
    }
  }
  return result
}

/** Convierte un doc de Firestore a AuditLogEntry */
function docToAuditEntry(id: string, d: DocumentData): AuditLogEntry {
  return {
    id,
    action: d.action,
    collection: d.collection,
    documentId: d.documentId,
    documentLabel: d.documentLabel || '',
    userId: d.userId,
    userName: d.userName || '',
    timestamp: d.timestamp?.toDate?.() || new Date(),
    before: d.before,
    after: d.after,
    metadata: d.metadata,
  }
}

/** Convierte un doc de Firestore a TrashItem */
function docToTrashItem(id: string, d: DocumentData): TrashItem {
  return {
    id,
    originalCollection: d.originalCollection,
    originalId: d.originalId,
    documentLabel: d.documentLabel || '',
    data: d.data || {},
    subcollections: d.subcollections,
    deletedBy: d.deletedBy,
    deletedByName: d.deletedByName || '',
    deletedAt: d.deletedAt?.toDate?.() || new Date(),
    expiresAt: d.expiresAt?.toDate?.() || new Date(),
    metadata: d.metadata,
  }
}

// ── Escribir Audit Log ───────────────────────────────────────────

export async function writeAuditLog(params: {
  action: AuditAction
  collection: string
  documentId: string
  documentLabel: string
  userId: string
  userName: string
  before?: Record<string, unknown>
  after?: Record<string, unknown>
  metadata?: Record<string, string>
}): Promise<void> {
  try {
    const entry: Record<string, unknown> = {
      action: params.action,
      collection: params.collection,
      documentId: params.documentId,
      documentLabel: params.documentLabel,
      userId: params.userId,
      userName: params.userName,
      timestamp: Timestamp.now(),
    }
    if (params.before) entry.before = sanitizeForFirestore(params.before)
    if (params.after) entry.after = sanitizeForFirestore(params.after)
    if (params.metadata) entry.metadata = params.metadata
    await addDoc(collection(db, AUDIT_COL), entry)
  } catch (err) {
    console.error('[auditLog] Error writing audit log:', err)
  }
}

// ── Mover a Papelera ─────────────────────────────────────────────

export async function moveToTrash(params: {
  originalCollection: string
  originalId: string
  documentLabel: string
  data: Record<string, unknown>
  subcollections?: Record<string, Record<string, unknown>[]>
  userId: string
  userName: string
  metadata?: Record<string, string>
}): Promise<string | null> {
  try {
    const now = new Date()
    const expiresAt = new Date(now.getTime() + TRASH_RETENTION_DAYS * 24 * 60 * 60 * 1000)

    const trashEntry: Record<string, unknown> = {
      originalCollection: params.originalCollection,
      originalId: params.originalId,
      documentLabel: params.documentLabel,
      data: sanitizeForFirestore(params.data),
      deletedBy: params.userId,
      deletedByName: params.userName,
      deletedAt: Timestamp.now(),
      expiresAt: Timestamp.fromDate(expiresAt),
    }
    if (params.subcollections) {
      const sanitizedSubs: Record<string, Record<string, unknown>[]> = {}
      for (const [key, items] of Object.entries(params.subcollections)) {
        sanitizedSubs[key] = items.map(i => sanitizeForFirestore(i))
      }
      trashEntry.subcollections = sanitizedSubs
    }
    if (params.metadata) trashEntry.metadata = params.metadata

    const ref = await addDoc(collection(db, TRASH_COL), trashEntry)

    // Registrar en audit log
    await writeAuditLog({
      action: 'delete',
      collection: params.originalCollection,
      documentId: params.originalId,
      documentLabel: params.documentLabel,
      userId: params.userId,
      userName: params.userName,
      before: params.data,
      metadata: params.metadata,
    })

    return ref.id
  } catch (err) {
    console.error('[auditLog] Error moving to trash:', err)
    return null
  }
}

// ── Restaurar desde Papelera ─────────────────────────────────────

export async function restoreFromTrash(
  trashId: string,
  userId: string,
  userName: string,
): Promise<{ success: boolean; restoredId?: string; error?: string }> {
  try {
    const trashRef = doc(db, TRASH_COL, trashId)
    const snap = await getDoc(trashRef)
    if (!snap.exists()) return { success: false, error: 'Item no encontrado en papelera' }

    const item = docToTrashItem(snap.id, snap.data())

    // Recrear documento original
    const originalRef = doc(db, item.originalCollection, item.originalId)
    const restoredData = {
      ...item.data,
      updatedAt: Timestamp.now(),
    }
    await setDoc(originalRef, restoredData)

    // Recrear subcolecciones (ej: historial)
    if (item.subcollections) {
      for (const [subName, items] of Object.entries(item.subcollections)) {
        const subColPath = `${item.originalCollection}/${item.originalId}/${subName}`
        const batch = writeBatch(db)
        for (const subItem of items) {
          const subRef = doc(collection(db, subColPath))
          batch.set(subRef, subItem)
        }
        await batch.commit()
      }
    }

    // Borrar de papelera
    await deleteDoc(trashRef)

    // Registrar en audit log
    await writeAuditLog({
      action: 'restore',
      collection: item.originalCollection,
      documentId: item.originalId,
      documentLabel: item.documentLabel,
      userId,
      userName,
      after: item.data,
      metadata: item.metadata,
    })

    return { success: true, restoredId: item.originalId }
  } catch (err) {
    console.error('[auditLog] Error restoring from trash:', err)
    return { success: false, error: err instanceof Error ? err.message : 'Error desconocido' }
  }
}

// ── Eliminar permanentemente ─────────────────────────────────────

export async function permanentDeleteFromTrash(trashId: string): Promise<boolean> {
  try {
    await deleteDoc(doc(db, TRASH_COL, trashId))
    return true
  } catch (err) {
    console.error('[auditLog] Error permanent delete:', err)
    return false
  }
}

// ── Consultar Audit Log ──────────────────────────────────────────

export async function getAuditLog(
  filters: AuditLogFilters = {},
  afterDoc?: unknown,
): Promise<{ entries: AuditLogEntry[]; lastDoc: unknown }> {
  try {
    const constraints: QueryConstraint[] = [orderBy('timestamp', 'desc')]

    if (filters.action) constraints.push(where('action', '==', filters.action))
    if (filters.collection) constraints.push(where('collection', '==', filters.collection))
    if (filters.userId) constraints.push(where('userId', '==', filters.userId))
    if (filters.fromDate) constraints.push(where('timestamp', '>=', Timestamp.fromDate(filters.fromDate)))
    if (filters.toDate) constraints.push(where('timestamp', '<=', Timestamp.fromDate(filters.toDate)))
    if (afterDoc) constraints.push(startAfter(afterDoc))

    constraints.push(firestoreLimit(filters.limit || 50))

    const q = query(collection(db, AUDIT_COL), ...constraints)
    const snap = await getDocs(q)

    const entries = snap.docs.map(d => docToAuditEntry(d.id, d.data()))
    const lastDoc = snap.docs.length > 0 ? snap.docs[snap.docs.length - 1] : null

    return { entries, lastDoc }
  } catch (err) {
    console.error('[auditLog] Error getting audit log:', err)
    return { entries: [], lastDoc: null }
  }
}

// ── Consultar Papelera ───────────────────────────────────────────

export async function getTrashItems(
  filters: TrashFilters = {},
): Promise<TrashItem[]> {
  try {
    const constraints: QueryConstraint[] = [orderBy('deletedAt', 'desc')]

    if (filters.collection) constraints.push(where('originalCollection', '==', filters.collection))
    if (filters.fromDate) constraints.push(where('deletedAt', '>=', Timestamp.fromDate(filters.fromDate)))
    if (filters.toDate) constraints.push(where('deletedAt', '<=', Timestamp.fromDate(filters.toDate)))

    constraints.push(firestoreLimit(filters.limit || 50))

    const q = query(collection(db, TRASH_COL), ...constraints)
    const snap = await getDocs(q)

    return snap.docs.map(d => docToTrashItem(d.id, d.data()))
  } catch (err) {
    console.error('[auditLog] Error getting trash items:', err)
    return []
  }
}

// ── Conteo rápido de papelera ────────────────────────────────────

export async function getTrashCount(): Promise<number> {
  try {
    const q = query(
      collection(db, TRASH_COL),
      where('expiresAt', '>', Timestamp.now()),
    )
    const snap = await getDocs(q)
    return snap.size
  } catch {
    return 0
  }
}
