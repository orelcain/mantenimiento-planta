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
  doc as firestoreDoc,
  query,
  where,
  orderBy,
  getDocs,
  writeBatch,
  documentId,
  getCountFromServer,
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

// ============================================================================
// Migración de turnos legacy: 'Turno tarde' → 'Turno noche'
// ============================================================================

/**
 * Cuenta cuántos documentos tienen `shiftId === 'Turno tarde'` (turnos
 * legacy del iter 8 cuando B se mapeaba a 'Turno tarde' en vez de 'Turno
 * noche'). Se usa para mostrar un banner en la UI que ofrezca migrarlos.
 */
export async function countLegacyTardeShifts(): Promise<number> {
  const q = query(
    collection(db, COLLECTION),
    where('shiftId', '==', 'Turno tarde'),
  )
  const snap = await getDocs(q)
  return snap.size
}

/**
 * Consolida KPIs de un summary legacy 'Turno tarde' dentro de un summary
 * 'Turno noche' ya existente para el mismo día. Devuelve el summary
 * fusionado listo para escribir.
 *
 * Reglas de merge:
 *  - Piezas y pesos se suman
 *  - P0% recalculado desde totales sumados (ponderado)
 *  - startAt = min de ambos, endAt = max
 *  - durationMinutes se recalcula desde el rango real (no suma, porque
 *    si los turnos solapan darían resultado erróneo)
 *  - Distribuciones: merge por key → suma de piezas → recalcular pct
 *  - topP0Causes: igual que distribuciones
 *  - hasPieceData / hasGate0Data: OR lógico
 */
function mergeTwoSummaries(base: GraderDailySummary, legacy: GraderDailySummary): GraderDailySummary {
  const r = (v: number, dec: number) => {
    const f = 10 ** dec
    return Math.round(v * f) / f
  }

  const totalPieces = (base.totalPieces ?? 0) + (legacy.totalPieces ?? 0)
  const pointZeroPieces = (base.pointZeroPieces ?? 0) + (legacy.pointZeroPieces ?? 0)
  const pointZeroPct = totalPieces > 0 ? r((pointZeroPieces / totalPieces) * 100, 2) : 0

  const totalWeightKg =
    (base.totalWeightKg ?? 0) + (legacy.totalWeightKg ?? 0) || undefined

  // Duración: sumar ambas duraciones (no calcular desde span — daría ~24h si los turnos
  // empiezan en horas distintas del mismo día, como ocurrió en la migración tarde→noche)
  const starts = [base.startAt, legacy.startAt].filter(Boolean).sort()
  const ends = [base.endAt, legacy.endAt].filter(Boolean).sort()
  const startAt = starts[0] ?? base.startAt
  const endAt = ends[ends.length - 1] ?? base.endAt
  const durationMinutes = ((base.durationMinutes ?? 0) + (legacy.durationMinutes ?? 0)) || undefined

  const avgWeightGrams = totalWeightKg && totalPieces > 0
    ? r((totalWeightKg * 1000) / totalPieces, 0)
    : undefined

  const productionRatePerHour = durationMinutes && durationMinutes > 0 && totalPieces > 0
    ? r(totalPieces / (durationMinutes / 60), 0)
    : undefined

  // Merge de distribuciones: map por key, suma piezas, recalcula pct
  const mergeDist = <T extends { pieces: number; pct: number }>(
    a: T[] | undefined,
    b: T[] | undefined,
    keyField: keyof T,
  ): T[] => {
    const map = new Map<string, T>()
    for (const item of [...(a ?? []), ...(b ?? [])]) {
      const key = String(item[keyField])
      const existing = map.get(key)
      if (existing) {
        (existing as any).pieces = existing.pieces + item.pieces
      } else {
        map.set(key, { ...item })
      }
    }
    const total = Array.from(map.values()).reduce((s, x) => s + x.pieces, 0)
    return Array.from(map.values())
      .map((x) => ({ ...x, pct: total > 0 ? r((x.pieces / total) * 100, 1) : 0 }))
      .sort((a, b) => b.pieces - a.pieces)
  }

  const calibreDistribution = mergeDist(
    base.calibreDistribution, legacy.calibreDistribution, 'calibre' as any,
  ) as GraderDailySummary['calibreDistribution']
  const qualityDistribution = mergeDist(
    base.qualityDistribution, legacy.qualityDistribution, 'quality' as any,
  ) as GraderDailySummary['qualityDistribution']
  const gateDistribution = mergeDist(
    base.gateDistribution, legacy.gateDistribution, 'gate' as any,
  ) as GraderDailySummary['gateDistribution']

  // topP0Causes: merge por error, recalcula pct sobre el total P0 fusionado
  const causesMap = new Map<string, number>()
  for (const c of [...(base.topP0Causes ?? []), ...(legacy.topP0Causes ?? [])]) {
    causesMap.set(c.error, (causesMap.get(c.error) ?? 0) + c.pieces)
  }
  const topP0Causes = Array.from(causesMap.entries())
    .map(([error, pieces]) => ({
      error,
      pieces,
      pct: pointZeroPieces > 0 ? r((pieces / pointZeroPieces) * 100, 1) : 0,
    }))
    .sort((a, b) => b.pieces - a.pieces)
    .slice(0, 10)

  return {
    ...base,
    totalPieces,
    pointZeroPieces,
    pointZeroPct,
    startAt,
    endAt,
    durationMinutes,
    totalWeightKg,
    avgWeightGrams,
    productionRatePerHour,
    calibreDistribution,
    qualityDistribution,
    gateDistribution,
    topP0Causes,
    hasPieceData: (base.hasPieceData ?? false) || (legacy.hasPieceData ?? false),
    hasGate0Data: (base.hasGate0Data ?? false) || (legacy.hasGate0Data ?? false),
    updatedAt: new Date().toISOString(),
  }
}

export interface MigrationResult {
  processed: number // total de 'Turno tarde' detectados
  merged: number    // casos donde ya existía noche y se fusionaron
  renamed: number   // casos donde sólo se movió tarde → noche
  errors: number
}

/**
 * Migra todos los summaries con `shiftId === 'Turno tarde'` a `'Turno noche'`.
 *
 * Para cada documento legacy:
 *  1. Busca si ya existe `${dateKey}__Turno noche` en Firestore.
 *  2. Si existe → fusiona los KPIs (ver `mergeTwoSummaries`) y escribe el
 *     resultado en el doc de noche. Luego borra el doc de tarde.
 *  3. Si NO existe → crea un nuevo doc con id `${dateKey}__Turno noche`
 *     copiando los campos del legacy (cambiando shiftId y id). Luego borra
 *     el doc de tarde.
 *
 * Todas las operaciones se hacen en batches de 400 ops (límite de Firestore).
 * Retorna un objeto con el conteo de cada tipo de operación.
 */
export async function migrateTardeShiftsToNoche(): Promise<MigrationResult> {
  const result: MigrationResult = { processed: 0, merged: 0, renamed: 0, errors: 0 }

  // 1. Leer todos los 'Turno tarde'
  const tardeQuery = query(
    collection(db, COLLECTION),
    where('shiftId', '==', 'Turno tarde'),
  )
  const tardeSnap = await getDocs(tardeQuery)
  if (tardeSnap.empty) return result

  const tardeDocs: GraderDailySummary[] = tardeSnap.docs.map((d) => d.data() as GraderDailySummary)
  result.processed = tardeDocs.length

  // 2. Para cada uno, verificar si existe el 'Turno noche' gemelo
  //    y preparar la operación correspondiente
  const operations: Array<{
    type: 'merge' | 'rename'
    legacyId: string         // id del doc tarde que se borra
    nocheId: string          // id del doc noche que se escribe
    data: GraderDailySummary // datos finales a escribir en nocheId
  }> = []

  for (const legacy of tardeDocs) {
    try {
      const nocheId = buildDailySummaryId(legacy.dateKey, 'Turno noche')
      const existingNoche = await getDailySummary(legacy.dateKey, 'Turno noche')
      if (existingNoche) {
        // Fusionar
        const merged = mergeTwoSummaries(existingNoche, legacy)
        merged.id = nocheId
        merged.shiftId = 'Turno noche'
        operations.push({ type: 'merge', legacyId: legacy.id, nocheId, data: merged })
      } else {
        // Renombrar: copiar legacy con shiftId='Turno noche'
        const renamed: GraderDailySummary = {
          ...legacy,
          id: nocheId,
          shiftId: 'Turno noche',
          updatedAt: new Date().toISOString(),
        }
        operations.push({ type: 'rename', legacyId: legacy.id, nocheId, data: renamed })
      }
    } catch {
      result.errors += 1
    }
  }

  // 3. Ejecutar en batches: primero escribe noche, luego borra tarde.
  //    Cada operación consume 2 writes (1 set + 1 delete), así que el límite
  //    efectivo es 200 operaciones por batch (FIRESTORE_BATCH_LIMIT=400).
  const OPS_PER_ENTRY = 2
  const ENTRIES_PER_BATCH = Math.floor(FIRESTORE_BATCH_LIMIT / OPS_PER_ENTRY)

  for (let i = 0; i < operations.length; i += ENTRIES_PER_BATCH) {
    const chunk = operations.slice(i, i + ENTRIES_PER_BATCH)
    const batch = writeBatch(db)
    for (const op of chunk) {
      const nocheRef = doc(db, COLLECTION, op.nocheId)
      const legacyRef = doc(db, COLLECTION, op.legacyId)
      batch.set(nocheRef, deepCleanUndefined({ ...op.data, _updatedAt: new Date().toISOString() }))
      batch.delete(legacyRef)
    }
    try {
      await batch.commit()
      for (const op of chunk) {
        if (op.type === 'merge') result.merged += 1
        else result.renamed += 1
      }
    } catch {
      result.errors += chunk.length
    }
  }

  return result
}

// ============================================================================
// Subcollection pieceRecords — registros pieza a pieza
// ============================================================================

const PIECE_RECORDS_SUB = 'pieceRecords'

export interface FirestorePieceRecord {
  ts: string
  gate: number
  pieces: number
  weightKg?: number
  weightPerPieceGrams?: number
  quality?: string
  calibre?: string
  error?: string
  dedupeKey: string
}

function pieceRecordsCol(summaryId: string) {
  return collection(db, COLLECTION, summaryId, PIECE_RECORDS_SUB)
}

/**
 * Genera un dedupeKey a partir de los campos de un registro.
 * Mismo criterio que graderSegmenter.ts dedupePieceRecords().
 */
export function buildDedupeKey(r: { ts: string; gate: number; pieces: number; quality?: string; calibre?: string; weightKg?: number }): string {
  return `${r.ts}|${r.gate}|${r.pieces}|${r.quality ?? ''}|${r.calibre ?? ''}|${r.weightKg ?? ''}`
}

/**
 * Guarda registros pieza a pieza como subcollection de un summary.
 * Si `dedup = true`, lee las claves existentes primero y solo escribe los nuevos.
 * Retorna cuántos registros nuevos se escribieron.
 */
export async function savePieceRecordsBatch(
  summaryId: string,
  records: FirestorePieceRecord[],
  dedup = true,
): Promise<{ written: number; skipped: number }> {
  if (records.length === 0) return { written: 0, skipped: 0 }

  let toWrite = records
  let skipped = 0

  if (dedup) {
    const existing = await fetchExistingDedupeKeys(summaryId)
    if (existing.size > 0) {
      toWrite = records.filter((r) => !existing.has(r.dedupeKey))
      skipped = records.length - toWrite.length
    }
  }

  const colRef = pieceRecordsCol(summaryId)
  for (let i = 0; i < toWrite.length; i += FIRESTORE_BATCH_LIMIT) {
    const chunk = toWrite.slice(i, i + FIRESTORE_BATCH_LIMIT)
    const batch = writeBatch(db)
    for (const rec of chunk) {
      const docRef = firestoreDoc(colRef)
      batch.set(docRef, rec)
    }
    await batch.commit()
  }
  return { written: toWrite.length, skipped }
}

/**
 * Lee solo las dedupeKeys de los pieceRecords existentes (minimiza transfer).
 */
async function fetchExistingDedupeKeys(summaryId: string): Promise<Set<string>> {
  const snap = await getDocs(pieceRecordsCol(summaryId))
  const keys = new Set<string>()
  snap.forEach((d) => {
    const key = d.data().dedupeKey
    if (typeof key === 'string') keys.add(key)
  })
  return keys
}

/**
 * Lee todos los pieceRecords de un turno, ordenados por timestamp.
 */
export async function listPieceRecords(summaryId: string): Promise<FirestorePieceRecord[]> {
  const q = query(pieceRecordsCol(summaryId), orderBy('ts'))
  const snap = await getDocs(q)
  return snap.docs.map((d) => d.data() as FirestorePieceRecord)
}

/**
 * Cuenta cuántos pieceRecords tiene un turno (sin descargar data).
 */
export async function countPieceRecords(summaryId: string): Promise<number> {
  const snap = await getCountFromServer(pieceRecordsCol(summaryId))
  return snap.data().count
}
