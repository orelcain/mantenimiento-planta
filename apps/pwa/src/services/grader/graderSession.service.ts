/**
 * Servicio de persistencia de sesiones de análisis Grader en Firestore.
 */

import {
  collection,
  doc,
  getDoc,
  getDocs,
  setDoc,
  deleteDoc,
  query,
  orderBy,
  limit,
  serverTimestamp,
} from '@/services/firestoreTracked'
import { db } from '../firebase'
import { generateId } from '@/lib/utils'
import type {
  GraderSession,
  GraderAnalyticsResult,
  DeterministicInsight,
  AIGraderOutput,
  UploadedMatrixFile,
  GateAssignment,
} from './types'

const COLLECTION = 'graderAnalysisSessions'

export async function saveGraderSession(params: {
  deviceId?: string
  startAt?: string
  endAt?: string
  uploadedFilesMeta: UploadedMatrixFile[]
  gatesConfigSnapshot: GateAssignment[]
  aggregates: GraderAnalyticsResult
  insights: DeterministicInsight[]
  aiOutput?: AIGraderOutput
  createdBy: string
}): Promise<GraderSession> {
  const id = generateId()
  const session: GraderSession = {
    id,
    deviceId: params.deviceId,
    startAt: params.startAt,
    endAt: params.endAt,
    uploadedFilesMeta: params.uploadedFilesMeta,
    gatesConfigSnapshot: params.gatesConfigSnapshot,
    aggregates: params.aggregates,
    insights: params.insights,
    aiOutput: params.aiOutput,
    createdBy: params.createdBy,
    createdAt: new Date().toISOString(),
  }

  await setDoc(doc(db, COLLECTION, id), {
    ...session,
    _createdAt: serverTimestamp(),
    _updatedAt: serverTimestamp(),
  })

  return session
}

export async function getGraderSession(sessionId: string): Promise<GraderSession | null> {
  const snap = await getDoc(doc(db, COLLECTION, sessionId))
  if (!snap.exists()) return null
  return snap.data() as GraderSession
}

export async function listGraderSessions(max = 50): Promise<GraderSession[]> {
  const q = query(
    collection(db, COLLECTION),
    orderBy('_createdAt', 'desc'),
    limit(max),
  )
  const snap = await getDocs(q)
  return snap.docs.map((d) => d.data() as GraderSession)
}

export async function deleteGraderSession(sessionId: string): Promise<void> {
  await deleteDoc(doc(db, COLLECTION, sessionId))
}

// ============================================================================
// GATES CONFIG TEMPLATES
// ============================================================================

const GATES_TEMPLATES_COLLECTION = 'graderGatesTemplates'

export interface GatesTemplate {
  id: string
  name: string
  deviceId?: string
  gates: GateAssignment[]
  createdBy: string
  createdAt: string
}

export async function saveGatesTemplate(params: {
  name: string
  deviceId?: string
  gates: GateAssignment[]
  createdBy: string
}): Promise<GatesTemplate> {
  const id = generateId()
  const tmpl: GatesTemplate = {
    id,
    name: params.name,
    ...(params.deviceId != null && { deviceId: params.deviceId }),
    gates: params.gates,
    createdBy: params.createdBy,
    createdAt: new Date().toISOString(),
  }

  // Filter out any remaining undefined values before writing to Firestore
  const firestoreData = Object.fromEntries(
    Object.entries({ ...tmpl, _createdAt: serverTimestamp() }).filter(([, v]) => v !== undefined),
  )
  await setDoc(doc(db, GATES_TEMPLATES_COLLECTION, id), firestoreData)

  return tmpl
}

export async function listGatesTemplates(): Promise<GatesTemplate[]> {
  const q = query(
    collection(db, GATES_TEMPLATES_COLLECTION),
    orderBy('_createdAt', 'desc'),
    limit(20),
  )
  const snap = await getDocs(q)
  return snap.docs.map((d) => d.data() as GatesTemplate)
}

export async function deleteGatesTemplate(id: string): Promise<void> {
  await deleteDoc(doc(db, GATES_TEMPLATES_COLLECTION, id))
}
