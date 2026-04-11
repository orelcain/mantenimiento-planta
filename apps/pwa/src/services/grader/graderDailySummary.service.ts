/**
 * Persistencia de KPIs diarios por turno para Grader.
 *
 * Colección: `graderDailySummaries`
 * ID doc: `${dateKey}__${shiftId}` (ej: "2025-12-14__Turno noche")
 *
 * Funciones de escritura individual: saveDailySummary, deleteDailySummary
 * Funciones de carga masiva: saveDailySummaryBatch, listDailySummariesByRange,
 *                             deleteDailySummariesByBatch
 */

import {
  doc,
  getDoc,
  setDoc,
  deleteDoc,
  serverTimestamp,
} from '@/services/firestoreTracked'
import {
  collection,
  query,
  where,
  orderBy,
  getDocs,
  writeBatch,
  documentId,
} from 'firebase/firestore'
import { db } from '../firebase'
import type { GraderDailySummary } from './types'

const COLLECTION = 'graderDailySummaries'
/** Firestore permite máx. 500 ops por batch; usamos 400 para margen */
const FIRESTORE_BATCH_LIMIT = 400

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

// ============================================================================
// Funciones para carga masiva histórica
// ============================================================================

/**
 * Guarda múltiples resúmenes de turno en Firestore en lotes de 400.
 *
 * Estrategia de merge inteligente:
 * - Upload PP (hasPieceData: true):  full overwrite — establece todos los KPIs del turno.
 * - Upload P0 solo (hasPieceData: false, hasGate0Data: true):  merge parcial — solo
 *   actualiza topP0Causes y hasGate0Data, preservando los KPIs de producción existentes.
 *   Así subir PP primero y P0 después no borra los datos de producción.
 */
export async function saveDailySummaryBatch(
  summaries: GraderDailySummary[],
): Promise<void> {
  if (summaries.length === 0) return

  for (let i = 0; i < summaries.length; i += FIRESTORE_BATCH_LIMIT) {
    const chunk = summaries.slice(i, i + FIRESTORE_BATCH_LIMIT)
    const batch = writeBatch(db)
    for (const s of chunk) {
      const ref = doc(db, COLLECTION, s.id)
      const isP0Only = s.hasPieceData === false && s.hasGate0Data === true

      if (isP0Only) {
        // Solo actualiza campos de P0 — preserva los KPIs del PP si ya existen
        const p0Patch = deepCleanUndefined({
          id: s.id,
          dateKey: s.dateKey,
          shiftId: s.shiftId,
          hasGate0Data: true,
          topP0Causes: s.topP0Causes,
          batchUploadId: s.batchUploadId,
          sourceFileNames: s.sourceFileNames,
          updatedBy: s.updatedBy,
          updatedAt: s.updatedAt,
          _updatedAt: new Date().toISOString(),
        })
        batch.set(ref, p0Patch, { merge: true })
      } else {
        // Upload PP o mixto: overwrite completo para tener KPIs actualizados
        batch.set(ref, deepCleanUndefined({ ...s, _updatedAt: new Date().toISOString() }))
      }
    }
    await batch.commit()
  }
}

/**
 * Consulta resúmenes diarios en un rango de fechas (inclusive).
 * startDate / endDate: 'YYYY-MM-DD'
 */
export async function listDailySummariesByRange(
  startDate: string,
  endDate: string,
): Promise<GraderDailySummary[]> {
  const q = query(
    collection(db, COLLECTION),
    where('dateKey', '>=', startDate),
    where('dateKey', '<=', endDate),
    orderBy('dateKey'),
  )
  const snap = await getDocs(q)
  return snap.docs.map((d) => d.data() as GraderDailySummary)
}

/**
 * Dados un conjunto de IDs (`${dateKey}__${shiftId}`), devuelve cuáles ya
 * existen en Firestore. Se usa para marcar en el preview de la carga masiva
 * los turnos que serían reemplazados vs. los que son nuevos.
 *
 * Firestore permite hasta 30 valores en un `in` / `where(documentId, 'in', ...)`
 * (era 10 antes del 2023). Para estar seguros usamos chunks de 30.
 */
export async function fetchExistingSummaryIds(ids: string[]): Promise<Set<string>> {
  const existing = new Set<string>()
  if (ids.length === 0) return existing

  const CHUNK = 30
  for (let i = 0; i < ids.length; i += CHUNK) {
    const chunk = ids.slice(i, i + CHUNK)
    const q = query(
      collection(db, COLLECTION),
      where(documentId(), 'in', chunk),
    )
    const snap = await getDocs(q)
    snap.forEach((d) => existing.add(d.id))
  }
  return existing
}

/**
 * Elimina todos los resúmenes de un lote de carga masiva dado su batchUploadId.
 */
export async function deleteDailySummariesByBatch(
  batchUploadId: string,
): Promise<void> {
  const q = query(
    collection(db, COLLECTION),
    where('batchUploadId', '==', batchUploadId),
  )
  const snap = await getDocs(q)
  if (snap.empty) return

  for (let i = 0; i < snap.docs.length; i += FIRESTORE_BATCH_LIMIT) {
    const chunk = snap.docs.slice(i, i + FIRESTORE_BATCH_LIMIT)
    const batch = writeBatch(db)
    for (const d of chunk) batch.delete(d.ref)
    await batch.commit()
  }
}
