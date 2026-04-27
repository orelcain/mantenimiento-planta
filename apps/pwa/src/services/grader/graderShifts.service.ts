/**
 * Servicio Firestore para la colección `graderShifts`.
 * Persiste uploads y acciones de un turno (live o closed).
 *
 * Doc ID: `${dateKey}__${shiftId}` — igual que graderDailySummaries.
 */

import {
  doc,
  getDoc,
  setDoc,
  updateDoc,
  deleteField,
  collection,
  query,
  where,
  orderBy,
  getDocs,
  arrayUnion,
} from 'firebase/firestore'
import { db } from '../firebase'
import type { MatrixP0Cause } from './types'

export interface ShiftUploadEntry {
  id: string
  at: string
  by: string
  byName: string
  files: {
    pp?: { fileName: string; fileSize: number; recordCount: number }
    p0?: { fileName: string; fileSize: number; recordCount: number }
  }
  completeness: 'pp-only' | 'p0-only' | 'complete'
  snapshot: {
    totalPieces: number
    p0Pct: number
    topMatrixCause: MatrixP0Cause | null
    throughputPzPerMin: number
    hasCauseData: boolean
  }
}

export interface ShiftActionEntry {
  id: string
  at: string
  by: string
  byName: string
  field: string
  before: unknown
  after: unknown
  reason?: string
  outcome?: {
    evaluatedAt: string
    p0BeforePct: number
    p0AfterPct: number
    piecesAfter: number
    verdict: 'improved' | 'neutral' | 'worsened' | 'insufficient-data'
  }
}

export interface ShiftBeltSpeedEntry {
  id: string
  at: string
  by: string
  byName: string
  belts: Array<{
    beltId: 'zeta' | 'accel1' | 'accel2'
    rpm: number
    calculatedMps: number
    measuredMps?: number
  }>
  note?: string
}

export interface GraderShiftDoc {
  id: string
  dateKey: string
  shiftId: string
  status: 'live' | 'closed'
  uploads: ShiftUploadEntry[]
  actions: ShiftActionEntry[]
  /** Especie del turno — override manual del supervisor. */
  species?: 'salar' | 'coho'
  /** Historial de velocidades de cintas registradas durante el turno. */
  beltSpeedHistory?: ShiftBeltSpeedEntry[]
  createdAt: string
  updatedAt: string
}

const COLLECTION = 'graderShifts'

export function buildShiftDocId(dateKey: string, shiftId: string): string {
  return `${dateKey}__${shiftId}`
}

export async function getShiftDoc(dateKey: string, shiftId: string): Promise<GraderShiftDoc | null> {
  const id = buildShiftDocId(dateKey, shiftId)
  const snap = await getDoc(doc(db, COLLECTION, id))
  if (!snap.exists()) return null
  return snap.data() as GraderShiftDoc
}

export async function ensureShiftDoc(
  dateKey: string,
  shiftId: string,
  status: 'live' | 'closed',
): Promise<void> {
  const id = buildShiftDocId(dateKey, shiftId)
  const ref = doc(db, COLLECTION, id)
  const snap = await getDoc(ref)
  if (!snap.exists()) {
    const now = new Date().toISOString()
    await setDoc(ref, {
      id,
      dateKey,
      shiftId,
      status,
      uploads: [],
      actions: [],
      createdAt: now,
      updatedAt: now,
    })
  }
}

export async function appendShiftUpload(
  dateKey: string,
  shiftId: string,
  upload: ShiftUploadEntry,
): Promise<void> {
  const id = buildShiftDocId(dateKey, shiftId)
  const ref = doc(db, COLLECTION, id)
  await ensureShiftDoc(dateKey, shiftId, 'live')
  await updateDoc(ref, {
    uploads: arrayUnion(upload),
    updatedAt: new Date().toISOString(),
  })
}

export async function appendShiftAction(
  dateKey: string,
  shiftId: string,
  action: ShiftActionEntry,
): Promise<void> {
  const id = buildShiftDocId(dateKey, shiftId)
  const ref = doc(db, COLLECTION, id)
  await ensureShiftDoc(dateKey, shiftId, 'live')
  await updateDoc(ref, {
    actions: arrayUnion(action),
    updatedAt: new Date().toISOString(),
  })
}

export async function updateActionOutcome(
  dateKey: string,
  shiftId: string,
  actionId: string,
  outcome: NonNullable<ShiftActionEntry['outcome']>,
): Promise<void> {
  const id = buildShiftDocId(dateKey, shiftId)
  const ref = doc(db, COLLECTION, id)
  const snap = await getDoc(ref)
  if (!snap.exists()) return
  const data = snap.data() as GraderShiftDoc
  const actions = data.actions.map(a =>
    a.id === actionId ? { ...a, outcome } : a,
  )
  await updateDoc(ref, { actions, updatedAt: new Date().toISOString() })
}

export async function saveShiftBeltSpeeds(
  shiftDocId: string,
  entry: Omit<ShiftBeltSpeedEntry, 'id' | 'at'>,
): Promise<void> {
  const ref = doc(db, COLLECTION, shiftDocId)
  const full: ShiftBeltSpeedEntry = {
    ...entry,
    id: crypto.randomUUID(),
    at: new Date().toISOString(),
  }
  await updateDoc(ref, {
    beltSpeedHistory: arrayUnion(full),
    updatedAt: new Date().toISOString(),
  })
}

export async function updateShiftSpecies(
  shiftDocId: string,
  species: 'salar' | 'coho' | null,
): Promise<void> {
  const ref = doc(db, COLLECTION, shiftDocId)
  await updateDoc(ref, {
    ...(species ? { species } : { species: deleteField() }),
    updatedAt: new Date().toISOString(),
  })
}

export async function markShiftClosed(dateKey: string, shiftId: string): Promise<void> {
  const id = buildShiftDocId(dateKey, shiftId)
  const ref = doc(db, COLLECTION, id)
  const snap = await getDoc(ref)
  if (!snap.exists()) return
  await updateDoc(ref, { status: 'closed', updatedAt: new Date().toISOString() })
}

export async function listShiftsByRange(
  fromDateKey: string,
  toDateKey: string,
): Promise<GraderShiftDoc[]> {
  const q = query(
    collection(db, COLLECTION),
    where('dateKey', '>=', fromDateKey),
    where('dateKey', '<=', toDateKey),
    orderBy('dateKey', 'desc'),
  )
  const snap = await getDocs(q)
  return snap.docs.map(d => d.data() as GraderShiftDoc)
}
