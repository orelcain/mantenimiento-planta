/**
 * Persistencia de los registros de Puerta 0 tal como vienen del Excel del Marelec,
 * y recálculo del desglose de causas cuando cambia la configuración de gates.
 *
 * Por qué existe: el Excel de Puerta 0 es el ÚNICO que trae la columna Error
 * (fotocélula, too close, puerta no preparada). `mergeParsedData` lo parsea a
 * `gate0Records` y ahí muere: a Firestore solo iban los `pieceRecords` del
 * pieza-a-pieza, que no tienen esa columna. Sin ella, reclasificar desde la base
 * DESTRUYE las causas oficiales — las piezas que el Marelec marcó como "no leído
 * por fotocélula" reaparecen como "fuera de límites". Guardando el input original
 * el recálculo usa exactamente los mismos datos que el análisis, así que reproduce
 * el desglose sin heurísticas ni emparejamientos aproximados.
 *
 * Dónde vive: `graderDailySummaries/{id}/meta/gate0[__n]`, mismo patrón que
 * `meta/timeline` y `meta/pauses`. Chunked por el límite de 1 MB por documento.
 *
 * ⚠️ Estos registros NO se suman a ningún total. El conteo de piezas sale de
 * `pieceRecords` (que ya incluye las de gate 0); duplicarlos fue un bug real.
 * Acá solo se guardan para poder explicar POR QUÉ cayeron.
 */

import {
  collection, doc, getDocs, setDoc, deleteDoc, query, where,
} from 'firebase/firestore'
import { db } from '../firebase'
import { classifyRecordToMatrix, CALIBRE_WEIGHT_RANGES } from './graderAnalytics'
import { updateDailySummary } from './graderDailySummary.service'
import type { GateAssignment, Gate0Record, GraderDailySummary } from './types'

const COLLECTION = 'graderDailySummaries'
const META_SUB = 'meta'
const GATE0_DOC = 'gate0'
export const GATE0_SCHEMA_VERSION = 1

/** ~120 bytes por registro → 2000 deja el doc bien por debajo del límite de 1 MB. */
const CHUNK_SIZE = 2000

/** Solo los campos que la clasificación necesita. `raw` se descarta (pesa y no se usa). */
export interface StoredGate0Record {
  ts: string
  pieces: number
  error: string
  weightKg?: number
  weightPerPieceGrams?: number
  quality?: string
  calibre?: string
  product?: string
  conservation?: string
  lot?: string
}

interface Gate0ChunkDoc {
  records: StoredGate0Record[]
  chunkIndex: number
  totalChunks: number
  updatedAt: string
  schemaVersion: number
}

const chunkDocId = (i: number) => (i === 0 ? GATE0_DOC : `${GATE0_DOC}__${i}`)

function toStored(r: Gate0Record): StoredGate0Record {
  return {
    ts: r.ts,
    pieces: r.pieces,
    error: r.error ?? '',
    ...(r.weightKg != null && { weightKg: r.weightKg }),
    ...(r.weightPerPieceGrams != null && { weightPerPieceGrams: r.weightPerPieceGrams }),
    ...(r.quality && { quality: r.quality as string }),
    ...(r.calibre && { calibre: r.calibre as string }),
    ...(r.product && { product: r.product as string }),
    ...(r.conservation && { conservation: r.conservation as string }),
    ...(r.lot && { lot: r.lot }),
  }
}

/**
 * Guarda los registros de Puerta 0 del turno. Idempotente: sobrescribe los chunks
 * y borra los sobrantes de una carga anterior más grande (si no, un re-upload con
 * menos piezas dejaría cola de registros viejos que el recálculo volvería a contar).
 */
export async function saveGate0Records(
  summaryId: string,
  records: Gate0Record[],
): Promise<{ chunks: number; records: number }> {
  const stored = records.map(toStored)
  const chunks: StoredGate0Record[][] = []
  for (let i = 0; i < stored.length; i += CHUNK_SIZE) chunks.push(stored.slice(i, i + CHUNK_SIZE))
  // Un turno sin piezas de puerta 0 igual escribe un chunk vacío: distingue
  // "no hubo P0" de "este turno es viejo y nunca guardó el input".
  if (chunks.length === 0) chunks.push([])

  const updatedAt = new Date().toISOString()
  for (let i = 0; i < chunks.length; i++) {
    const payload: Gate0ChunkDoc = {
      records: chunks[i]!,
      chunkIndex: i,
      totalChunks: chunks.length,
      updatedAt,
      schemaVersion: GATE0_SCHEMA_VERSION,
    }
    await setDoc(doc(db, COLLECTION, summaryId, META_SUB, chunkDocId(i)), payload)
  }

  // Limpiar chunks sobrantes de una carga previa con más registros.
  const existing = await getDocs(query(
    collection(db, COLLECTION, summaryId, META_SUB),
    where('schemaVersion', '==', GATE0_SCHEMA_VERSION),
  ))
  for (const d of existing.docs) {
    const data = d.data() as Partial<Gate0ChunkDoc>
    if (typeof data.chunkIndex === 'number' && data.chunkIndex >= chunks.length) {
      await deleteDoc(d.ref)
    }
  }

  return { chunks: chunks.length, records: stored.length }
}

/**
 * Lee los registros de Puerta 0 guardados. `null` = el turno nunca los guardó
 * (anterior a esta feature) — distinto de `[]`, que es "no hubo piezas en P0".
 */
export async function loadGate0Records(summaryId: string): Promise<StoredGate0Record[] | null> {
  const snap = await getDocs(query(
    collection(db, COLLECTION, summaryId, META_SUB),
    where('schemaVersion', '==', GATE0_SCHEMA_VERSION),
  ))
  if (snap.empty) return null
  const chunks = snap.docs
    .map((d) => d.data() as Gate0ChunkDoc)
    .filter((c) => Array.isArray(c.records))
    .sort((a, b) => (a.chunkIndex ?? 0) - (b.chunkIndex ?? 0))
  if (chunks.length === 0) return null
  return chunks.flatMap((c) => c.records)
}

/** Clasifica los registros con una config de gates. Réplica exacta de computeShiftSummary. */
export function classifyGate0Records(
  records: StoredGate0Record[],
  gates: GateAssignment[],
  pointZeroPieces: number,
): Array<{ error: string; pieces: number; pct: number }> {
  const active = gates.filter((g) => g.active)
  const causeMap = new Map<string, number>()
  for (const rec of records) {
    const key = active.length > 0
      ? classifyRecordToMatrix(
        { ...(rec as unknown as Gate0Record), error: rec.error ?? '', gate: 0 as const },
        active,
        CALIBRE_WEIGHT_RANGES,
      )
      : (rec.error || 'Sin causa')
    causeMap.set(key, (causeMap.get(key) ?? 0) + rec.pieces)
  }
  const total = pointZeroPieces || records.reduce((s, r) => s + r.pieces, 0) || 1
  return Array.from(causeMap.entries())
    .sort((a, b) => b[1] - a[1])
    .slice(0, 9)
    .map(([error, pieces]) => ({ error, pieces, pct: +((pieces / total) * 100).toFixed(1) }))
}

export interface RecomputeResult {
  ok: boolean
  /** Por qué no se pudo, cuando `ok` es false. */
  reason?: 'sin-datos-guardados' | 'sin-gates'
  causes?: Array<{ error: string; pieces: number; pct: number }>
}

/**
 * Recalcula el desglose de causas del turno con una configuración de gates y lo
 * persiste. No toca conteos: `pointZeroPieces` y `pointZeroPct` son el registro
 * físico de la máquina y no dependen de la configuración.
 */
export async function recomputeShiftP0Causes(
  summaryId: string,
  gates: GateAssignment[],
  pointZeroPieces: number,
): Promise<RecomputeResult> {
  if (gates.filter((g) => g.active).length === 0) return { ok: false, reason: 'sin-gates' }
  const records = await loadGate0Records(summaryId)
  if (records == null) return { ok: false, reason: 'sin-datos-guardados' }

  const causes = classifyGate0Records(records, gates, pointZeroPieces)
  await updateDailySummary(summaryId, {
    topP0Causes: causes,
    gatesUsed: gates.filter((g) => g.active),
    reclassifiedAt: new Date().toISOString(),
  } as Partial<GraderDailySummary> & Record<string, unknown>)
  return { ok: true, causes }
}
