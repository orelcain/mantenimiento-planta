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
  updateDoc,
  serverTimestamp,
} from '@/services/firestoreTracked'
import {
  collection,
  doc as firestoreDoc,
  query,
  where,
  orderBy,
  getDocs,
  getDocsFromCache,
  writeBatch,
  documentId,
  getCountFromServer,
  onSnapshot,
  addDoc,
} from 'firebase/firestore'
import { db } from '../firebase'
import type { GraderDailySummary, TimelineBucket, Pause, MicroDetentionsSummary, PauseHistoryEntry } from './types'

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

/**
 * Actualiza campos parciales de un summary existente.
 * Usado por el reclasificador (FASE 26) para actualizar topP0Causes y schemaVersion
 * sin sobreescribir el resto del doc.
 */
export async function updateDailySummary(
  summaryId: string,
  patch: Partial<GraderDailySummary> & Record<string, unknown>,
): Promise<void> {
  const ref = doc(db, COLLECTION, summaryId)
  await updateDoc(ref, { ...deepCleanUndefined(patch), updatedAt: new Date().toISOString() })
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
  lot?: string
  dedupeKey: string
  /** Origen del record cuando fue enriquecido por Excel P0 del Marelec */
  source?: 'P0_EXCEL'
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
  // Intentar desde cache primero — instantáneo en visitas repetidas (IndexedDB)
  try {
    const cached = await getDocsFromCache(q)
    if (!cached.empty) return cached.docs.map((d) => d.data() as FirestorePieceRecord)
  } catch {
    // Cache miss — continuar con red
  }
  const snap = await getDocs(q)
  return snap.docs.map((d) => d.data() as FirestorePieceRecord)
}

/**
 * Lee solo los pieceRecords con gate=0 (P0) de un turno, ordenados por timestamp.
 * Úsalo cuando solo interesan los eventos de rechazo (mucho menos que listPieceRecords completo).
 *
 * Nota: el ordenamiento se hace en memoria para evitar un índice compuesto
 * (gate ASC + ts ASC). Con ~900 records por turno el overhead es despreciable.
 */
export async function listGate0PieceRecords(summaryId: string): Promise<FirestorePieceRecord[]> {
  const q = query(pieceRecordsCol(summaryId), where('gate', '==', 0))
  let records: FirestorePieceRecord[] = []
  try {
    const cached = await getDocsFromCache(q)
    if (!cached.empty) records = cached.docs.map((d) => d.data() as FirestorePieceRecord)
  } catch {
    // Cache miss — continuar con red
  }
  if (records.length === 0) {
    const snap = await getDocs(q)
    records = snap.docs.map((d) => d.data() as FirestorePieceRecord)
  }
  return records.sort((a, b) => a.ts.localeCompare(b.ts))
}

/**
 * Cuenta cuántos pieceRecords tiene un turno (sin descargar data).
 */
export async function countPieceRecords(summaryId: string): Promise<number> {
  const snap = await getCountFromServer(pieceRecordsCol(summaryId))
  return snap.data().count
}

/**
 * Lee los pieceRecords de UN minuto específico de un turno, ordenados por ts.
 *
 * Usado por el modal de "detalle del minuto" (Fase 4a) — al clickear una barra
 * del Timeline, se cargan solo las piezas de ese minuto (típico 50-80 docs,
 * max histórico 80). Firestore hace la query por rango de ts server-side.
 *
 * Cache-first: el mismo rango se beneficia de IndexedDB si se consultó antes.
 */
export async function listPieceRecordsByMinute(
  summaryId: string,
  tsMin: string,  // ISO "YYYY-MM-DDTHH:MM:00.000Z"
): Promise<FirestorePieceRecord[]> {
  const startTs = tsMin
  // Fin del minuto: ts estricto < startMs + 60s
  const startMs = Date.parse(tsMin)
  const endTs = new Date(startMs + 60_000).toISOString()
  const q = query(
    pieceRecordsCol(summaryId),
    where('ts', '>=', startTs),
    where('ts', '<', endTs),
    orderBy('ts'),
  )
  try {
    const cached = await getDocsFromCache(q)
    if (!cached.empty) return cached.docs.map((d) => d.data() as FirestorePieceRecord)
  } catch {
    // Cache miss — fallthrough a red
  }
  const snap = await getDocs(q)
  return snap.docs.map((d) => d.data() as FirestorePieceRecord)
}

// ============================================================================
// Timeline aggregates — buckets pre-computados por minuto
// ============================================================================
//
// Los `TimelineBucket[]` viven en una sub-collection separada para NO inflar
// el doc del summary (que se descarga en queries por rango del calendario y
// vista de período). Solo se cargan cuando el usuario abre un turno específico.
//
// Path: `graderDailySummaries/{summaryId}/meta/timeline`
// Tamaño típico: ~40-60 KB (400-700 buckets × ~100 bytes cada uno)

const TIMELINE_META_SUB = 'meta'
const TIMELINE_META_DOC = 'timeline'

interface TimelineAggregatesDoc {
  buckets: TimelineBucket[]
  updatedAt: string
  /** Versión del schema para futuras migraciones sin romper readers */
  schemaVersion: number
}

const TIMELINE_SCHEMA_VERSION = 1

/**
 * Guarda los buckets pre-computados del timeline en la sub-collection.
 * Sobrescribe cualquier versión previa (overwrite intencional: los aggregates
 * son una función pura del set de pieceRecords).
 */
export async function saveTimelineAggregates(
  summaryId: string,
  buckets: TimelineBucket[],
): Promise<void> {
  const ref = doc(db, COLLECTION, summaryId, TIMELINE_META_SUB, TIMELINE_META_DOC)
  const payload: TimelineAggregatesDoc = {
    buckets,
    updatedAt: new Date().toISOString(),
    schemaVersion: TIMELINE_SCHEMA_VERSION,
  }
  await setDoc(ref, payload)
}

/**
 * Lee los timelineAggregates desde la sub-collection. Retorna `null` si el
 * turno todavía no tiene backfill (summary legacy antes de Fase 2).
 *
 * Gracias al cache persistente de Firestore, las visitas repetidas al mismo
 * turno son instantáneas (hit de IndexedDB, sin round-trip).
 */
export async function loadTimelineAggregates(
  summaryId: string,
): Promise<TimelineBucket[] | null> {
  const ref = doc(db, COLLECTION, summaryId, TIMELINE_META_SUB, TIMELINE_META_DOC)
  const snap = await getDoc(ref)
  if (!snap.exists()) return null
  const data = snap.data() as Partial<TimelineAggregatesDoc>
  if (!Array.isArray(data.buckets)) return null
  return data.buckets as TimelineBucket[]
}

// ============================================================================
// Pauses aggregates — detalle de pausas ≥5min + byHour de microDetentions
// ============================================================================
//
// El detector (`graderPauseDetector`) produce:
//   - `pauses`: Pause[] anotables (tier 'pausa' | 'larga' | 'parada')
//   - `microDetentions`: agregado de gaps 1-5min (count + total + byHour)
//
// Los totales ligeros van en el doc summary (ver campos en GraderDailySummary).
// Este doc de sub-collection guarda el detalle para la UI del Timeline y la
// anotación manual (Fase 3). Path: `graderDailySummaries/{id}/meta/pauses`.

const PAUSES_META_DOC = 'pauses'
/** Subcollección de audit log para pausas (M13). */
const PAUSE_HISTORY_SUB = 'pauseHistory'

interface PausesAggregatesDoc {
  pauses: Pause[]
  microDetentions: MicroDetentionsSummary
  updatedAt: string
  /** Versión del schema para futuras migraciones sin romper readers */
  schemaVersion: number
}

const PAUSES_SCHEMA_VERSION = 1

// ── M13: Audit log de pausas ─────────────────────────────────────────────────

/**
 * Escribe una entrada en el historial de cambios de una pausa.
 * Colección: `graderDailySummaries/{summaryId}/pauseHistory` (auto-id).
 * Silencia errores para no bloquear la operación principal.
 */
async function appendPauseHistory(
  summaryId: string,
  entry: PauseHistoryEntry,
): Promise<void> {
  try {
    const colRef = collection(db, COLLECTION, summaryId, PAUSE_HISTORY_SUB)
    await addDoc(colRef, entry)
  } catch (e) {
    console.warn('[graderDailySummary] appendPauseHistory falló (no bloqueante):', e)
  }
}

/**
 * Carga el historial de cambios de una pausa específica dentro de un turno.
 * Filtra por `pauseId` en cliente para evitar índice compuesto en Firestore.
 * Ordena por `changedAt` ascendente (más antiguo primero).
 */
export async function loadPauseHistory(
  summaryId: string,
  pauseId: string,
): Promise<PauseHistoryEntry[]> {
  const q = query(
    collection(db, COLLECTION, summaryId, PAUSE_HISTORY_SUB),
    orderBy('changedAt', 'asc'),
  )
  const snap = await getDocs(q)
  return snap.docs
    .map((d) => d.data() as PauseHistoryEntry)
    .filter((e) => e.pauseId === pauseId)
}

// ─────────────────────────────────────────────────────────────────────────────

/**
 * Guarda las pausas detectadas + microDetentions en la sub-collection.
 * Sobrescribe cualquier versión previa (overwrite intencional: la detección
 * es función pura del set de pieceRecords).
 *
 * IMPORTANTE: este método guarda la detección automática. Cuando Fase 3
 * agregue anotación manual, los campos `tag` / `note` / `annotatedBy` de
 * pausas existentes deben preservarse — este método SOBRESCRIBE, así que
 * el caller que haga re-detección debe hacer merge primero con la versión
 * previa (se maneja en `mergeAnnotationsIntoPauses`).
 */
export async function savePausesAggregates(
  summaryId: string,
  pauses: Pause[],
  microDetentions: MicroDetentionsSummary,
): Promise<void> {
  const ref = doc(db, COLLECTION, summaryId, TIMELINE_META_SUB, PAUSES_META_DOC)
  const payload: PausesAggregatesDoc = {
    pauses: deepCleanUndefined(pauses),
    microDetentions: deepCleanUndefined(microDetentions),
    updatedAt: new Date().toISOString(),
    schemaVersion: PAUSES_SCHEMA_VERSION,
  }
  await setDoc(ref, payload)
}

/**
 * Lee las pausas desde la sub-collection. Retorna `null` si el turno todavía
 * no tiene backfill (summary legacy antes de Fase 1 de pausas).
 */
export async function loadPausesAggregates(
  summaryId: string,
): Promise<{ pauses: Pause[]; microDetentions: MicroDetentionsSummary } | null> {
  const ref = doc(db, COLLECTION, summaryId, TIMELINE_META_SUB, PAUSES_META_DOC)
  const snap = await getDoc(ref)
  if (!snap.exists()) return null
  const data = snap.data() as Partial<PausesAggregatesDoc>
  if (!Array.isArray(data.pauses)) return null
  return {
    pauses: data.pauses,
    microDetentions: data.microDetentions ?? { count: 0, totalSec: 0, byHour: {} },
  }
}

/**
 * Suscripción en tiempo real al doc `meta/pauses` de un turno.
 *
 * Cuando otro admin anota o ajusta desde otro dispositivo, el callback se
 * dispara automáticamente — sin necesidad de recargar la página.
 *
 * @returns función de limpieza (unsubscribe) que debe llamarse al desmontar.
 */
export function subscribePausesAggregates(
  summaryId: string,
  callback: (data: { pauses: Pause[]; microDetentions: MicroDetentionsSummary } | null) => void,
): () => void {
  const ref = firestoreDoc(db, COLLECTION, summaryId, TIMELINE_META_SUB, PAUSES_META_DOC)
  return onSnapshot(
    ref,
    (snap) => {
      if (!snap.exists()) { callback(null); return }
      const data = snap.data() as Partial<PausesAggregatesDoc>
      callback({
        pauses: Array.isArray(data.pauses) ? data.pauses : [],
        microDetentions: data.microDetentions ?? { count: 0, totalSec: 0, byHour: {} },
      })
    },
    () => { callback(null) },
  )
}

/**
 * Actualiza la anotación (tag + nota) de UNA pausa existente dentro de un turno.
 * Lee el doc `meta/pauses` completo, modifica la pausa por id, y re-escribe.
 *
 * Atómico en el sentido de Firestore setDoc (una sola escritura), pero no hay
 * transacción ni optimistic-concurrency: si dos admins editan la misma pausa
 * simultáneamente, gana el último write. Aceptable mientras la operación sea
 * humana y esporádica.
 *
 * Si el `tagId` es null, la anotación se remueve (vuelve a "sin clasificar",
 * aunque puede conservar el `autoTag` que puso el detector).
 */
export async function updatePauseAnnotation(
  summaryId: string,
  pauseId: string,
  annotation: {
    tagId: string | null
    note?: string
    annotatedBy: string
  },
): Promise<void> {
  const ref = doc(db, COLLECTION, summaryId, TIMELINE_META_SUB, PAUSES_META_DOC)
  const snap = await getDoc(ref)
  if (!snap.exists()) throw new Error(`No existe meta/pauses para ${summaryId}`)
  const data = snap.data() as Partial<PausesAggregatesDoc>
  if (!Array.isArray(data.pauses)) throw new Error(`meta/pauses con forma inesperada para ${summaryId}`)

  const now = new Date().toISOString()
  const oldPause = data.pauses.find((p) => p.id === pauseId)
  const updatedPauses = data.pauses.map((p) => {
    if (p.id !== pauseId) return p
    const next: Pause = { ...p }
    if (annotation.tagId === null) {
      delete next.tag
      delete next.note
      delete next.annotatedBy
      delete next.annotatedAt
    } else {
      next.tag = annotation.tagId
      next.annotatedBy = annotation.annotatedBy
      next.annotatedAt = now
      if (annotation.note && annotation.note.trim()) {
        next.note = annotation.note.trim()
      } else {
        delete next.note
      }
    }
    return next
  })

  const payload: PausesAggregatesDoc = {
    pauses: deepCleanUndefined(updatedPauses),
    microDetentions: data.microDetentions ?? { count: 0, totalSec: 0, byHour: {} },
    updatedAt: now,
    schemaVersion: PAUSES_SCHEMA_VERSION,
  }
  await setDoc(ref, payload)

  // M13 — Audit log
  if (annotation.tagId === null) {
    await appendPauseHistory(summaryId, {
      pauseId,
      action: 'clear_tag',
      changedBy: annotation.annotatedBy,
      changedAt: now,
      diff: {
        tag: { old: oldPause?.tag, new: undefined },
        note: oldPause?.note ? { old: oldPause.note, new: undefined } : undefined,
      },
    })
  } else {
    await appendPauseHistory(summaryId, {
      pauseId,
      action: 'tag',
      changedBy: annotation.annotatedBy,
      changedAt: now,
      diff: {
        tag: { old: oldPause?.tag, new: annotation.tagId },
        ...(oldPause?.note !== (annotation.note?.trim() || undefined)
          ? { note: { old: oldPause?.note, new: annotation.note?.trim() || undefined } }
          : {}),
      },
    })
  }
}

/**
 * Corrige el rango horario de una pausa (startAt / endAt).
 *
 * Útil cuando el detector automático marcó bordes imprecisos (±minutos).
 * Recalcula `durationSec` y registra quién ajustó.
 * El `id` de la pausa NO cambia — sigue siendo el identificador estable
 * aunque ya no coincida exactamente con la hora (es cosmético, no funcional).
 *
 * Validaciones mínimas:
 *   - endAt > startAt
 *   - durationSec ≥ 60 s (pausa de al menos 1 min)
 */
export async function updatePauseRange(
  summaryId: string,
  pauseId: string,
  params: {
    startAt: string  // ISO string (misma convención Z-suffix = hora local planta)
    endAt: string
    adjustedBy: string
  },
): Promise<void> {
  const durationSec = Math.round((Date.parse(params.endAt) - Date.parse(params.startAt)) / 1000)
  if (durationSec < 60) throw new Error('La pausa debe durar al menos 1 minuto')

  const ref = doc(db, COLLECTION, summaryId, TIMELINE_META_SUB, PAUSES_META_DOC)
  const snap = await getDoc(ref)
  if (!snap.exists()) throw new Error(`No existe meta/pauses para ${summaryId}`)
  const data = snap.data() as Partial<PausesAggregatesDoc>
  if (!Array.isArray(data.pauses)) throw new Error(`meta/pauses con forma inesperada`)

  const now = new Date().toISOString()
  const found = data.pauses.some((p) => p.id === pauseId)
  if (!found) throw new Error(`Pausa ${pauseId} no encontrada en ${summaryId}`)

  // M6 — Validación: el nuevo rango no puede solaparse con otras pausas del turno.
  // Dos intervalos [s1,e1] y [s2,e2] se solapan si s1 < e2 AND s2 < e1 (strict).
  const newStart = Date.parse(params.startAt)
  const newEnd = Date.parse(params.endAt)
  if (newStart >= newEnd) throw new Error('El inicio debe ser anterior al fin')
  for (const other of data.pauses) {
    if (other.id === pauseId) continue
    const oStart = Date.parse(other.startAt)
    const oEnd = Date.parse(other.endAt)
    if (newStart < oEnd && oStart < newEnd) {
      const fmtUTC = (ms: number) => {
        const d = new Date(ms)
        return `${String(d.getUTCHours()).padStart(2, '0')}:${String(d.getUTCMinutes()).padStart(2, '0')}`
      }
      throw new Error(`El rango se solapa con otra pausa (${fmtUTC(oStart)}–${fmtUTC(oEnd)})`)
    }
  }

  const oldPauseRange = data.pauses.find((p) => p.id === pauseId)
  const updatedPauses = data.pauses.map((p) => {
    if (p.id !== pauseId) return p
    return {
      ...p,
      startAt: params.startAt,
      endAt: params.endAt,
      durationSec,
      adjustedBy: params.adjustedBy,
      adjustedAt: now,
    }
  })

  const payload: PausesAggregatesDoc = {
    pauses: deepCleanUndefined(updatedPauses),
    microDetentions: data.microDetentions ?? { count: 0, totalSec: 0, byHour: {} },
    updatedAt: now,
    schemaVersion: PAUSES_SCHEMA_VERSION,
  }
  await setDoc(ref, payload)

  // M13 — Audit log
  await appendPauseHistory(summaryId, {
    pauseId,
    action: 'range',
    changedBy: params.adjustedBy,
    changedAt: now,
    diff: {
      startAt: { old: oldPauseRange?.startAt ?? params.startAt, new: params.startAt },
      endAt: { old: oldPauseRange?.endAt ?? params.endAt, new: params.endAt },
    },
  })
}

/**
 * Merge de anotaciones existentes sobre una detección fresca.
 *
 * Cuando se reprocesa un turno (ej. re-upload del Excel), el detector produce
 * pausas nuevas. Si previamente el admin anotó algunas, queremos preservar
 * esas anotaciones. Esta función empareja por `id` (que codifica hora+duración
 * del gap — estable mientras los timestamps del Excel no cambien).
 *
 * Si un gap anotado ya no aparece en la detección fresca, se descarta su
 * anotación (es probable que el parser haya cambiado los datos subyacentes).
 */
export function mergeAnnotationsIntoPauses(fresh: Pause[], previous: Pause[]): Pause[] {
  if (previous.length === 0) return fresh
  const prevById = new Map(previous.map((p) => [p.id, p]))
  return fresh.map((p) => {
    const prev = prevById.get(p.id)
    if (!prev) return p
    return {
      ...p,
      tag: prev.tag ?? p.tag,
      note: prev.note ?? p.note,
      annotatedBy: prev.annotatedBy ?? p.annotatedBy,
      annotatedAt: prev.annotatedAt ?? p.annotatedAt,
    }
  })
}
