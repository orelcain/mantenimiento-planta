import { doc, collection, getDocs, setDoc, query, orderBy } from 'firebase/firestore'
import { db } from '@/services/firebase'
import type { GateAssignment } from './types'

export interface ConfigDiff {
  gateNumber: number
  field: 'assignedCalibre' | 'assignedQuality' | 'assignedConservation' | 'assignedProduct' | 'active'
  before: unknown
  after: unknown
}

export interface GateConfigSnapshot {
  id: string
  shiftDocId: string   // `${dateKey}__${shiftId}`
  at: string           // ISO timestamp del cambio
  changedBy: { uid: string; name: string }
  reason?: string
  gates: GateAssignment[]
  changes: ConfigDiff[]
  synthetic?: boolean  // true si fue inferido por el reclasificador (FASE 26)
}

const SUBCOLLECTION = 'configHistory'

/** Calcula diff entre dos estados completos de gates */
export function computeGatesDiff(before: GateAssignment[], after: GateAssignment[]): ConfigDiff[] {
  const diffs: ConfigDiff[] = []
  const byNumber = new Map(before.map(g => [g.gateNumber, g]))
  for (const next of after) {
    const prev = byNumber.get(next.gateNumber)
    if (!prev) continue
    const fields: Array<keyof GateAssignment> = [
      'assignedCalibre', 'assignedQuality', 'assignedConservation', 'assignedProduct', 'active',
    ]
    for (const f of fields) {
      if (prev[f] !== next[f]) {
        diffs.push({ gateNumber: next.gateNumber, field: f as ConfigDiff['field'], before: prev[f], after: next[f] })
      }
    }
  }
  return diffs
}

/** Lista snapshots de un turno ordenados cronológicamente (asc) */
export async function listSnapshots(shiftDocId: string): Promise<GateConfigSnapshot[]> {
  const ref = collection(db, 'graderShifts', shiftDocId, SUBCOLLECTION)
  const q = query(ref, orderBy('at', 'asc'))
  const snap = await getDocs(q)
  return snap.docs.map(d => d.data() as GateConfigSnapshot)
}

export async function getLatestSnapshot(shiftDocId: string): Promise<GateConfigSnapshot | null> {
  const all = await listSnapshots(shiftDocId)
  const last = all[all.length - 1]
  return last ?? null
}

/**
 * Guarda snapshot solo si hay cambios reales respecto al anterior.
 * Retorna null si no hubo cambios (idempotente).
 */
export async function saveConfigSnapshot(
  shiftDocId: string,
  newGates: GateAssignment[],
  user: { uid: string; name: string },
  reason?: string,
): Promise<GateConfigSnapshot | null> {
  const previous = await getLatestSnapshot(shiftDocId)
  const changes = previous ? computeGatesDiff(previous.gates, newGates) : []
  if (previous && changes.length === 0) return null

  const snapshot: GateConfigSnapshot = {
    id: crypto.randomUUID(),
    shiftDocId,
    at: new Date().toISOString(),
    changedBy: user,
    gates: [...newGates],
    changes,
    ...(reason ? { reason } : {}),
  }
  const ref = doc(db, 'graderShifts', shiftDocId, SUBCOLLECTION, snapshot.id)
  await setDoc(ref, snapshot)
  return snapshot
}

/**
 * Snapshot de tipo "sintético" — escrito por el reclasificador (FASE 26)
 * cuando infiere la config desde los pieceRecords históricos.
 */
export async function saveSyntheticSnapshot(
  shiftDocId: string,
  snapshot: Omit<GateConfigSnapshot, 'id'>,
): Promise<GateConfigSnapshot> {
  const id = crypto.randomUUID()
  const full: GateConfigSnapshot = { ...snapshot, id, synthetic: true }
  const ref = doc(db, 'graderShifts', shiftDocId, SUBCOLLECTION, id)
  await setDoc(ref, full)
  return full
}

/**
 * Devuelve el snapshot vigente en un timestamp dado (el más reciente ≤ ts).
 * Si no hay ninguno, retorna null (caller debe usar config default del summary).
 */
export function getConfigAtTimestamp(
  snapshots: GateConfigSnapshot[],
  ts: string,
): GateConfigSnapshot | null {
  const eligible = snapshots.filter(s => s.at <= ts)
  const last = eligible[eligible.length - 1]
  return last ?? null
}
