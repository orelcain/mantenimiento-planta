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
  where,
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
  GraderAnalysisConfig,
} from './types'

const COLLECTION = 'graderAnalysisSessions'
const DRAFTS_COLLECTION = 'graderAnalysisDrafts'

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

export async function saveGraderSession(params: {
  deviceId?: string
  shiftId?: string
  sessionDate?: string
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
    shiftId: params.shiftId,
    sessionDate: params.sessionDate,
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

  // Filter out undefined values — Firestore rejects them (even nested)
  const firestoreData = deepCleanUndefined({
    ...session,
    _createdAt: serverTimestamp(),
    _updatedAt: serverTimestamp(),
  })
  await setDoc(doc(db, COLLECTION, id), firestoreData)

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
// CLOUD AUTOSAVE DRAFTS
// ============================================================================

export interface GraderAutosaveDraft {
  id: string
  createdBy: string
  deviceId?: string
  shiftId?: string
  sessionDate?: string
  config: GraderAnalysisConfig
  gatesConfigSnapshot: GateAssignment[]
  currentStep?: 'config' | 'dashboard'
  updatedAt: string
}

function sanitizeIdPart(value?: string): string {
  if (!value) return 'na'
  return value
    .toLowerCase()
    .replace(/[^a-z0-9_-]/g, '-')
    .replace(/-+/g, '-')
    .replace(/^-|-$/g, '')
    .slice(0, 64) || 'na'
}

function buildDraftId(params: { createdBy: string; deviceId?: string; shiftId?: string; sessionDate?: string }): string {
  const user = sanitizeIdPart(params.createdBy)
  const device = sanitizeIdPart(params.deviceId)
  const shift = sanitizeIdPart(params.shiftId)
  const date = sanitizeIdPart(params.sessionDate)
  return `${user}__${device}__${shift}__${date}`
}

export async function saveGraderAutosaveDraft(params: {
  createdBy: string
  deviceId?: string
  shiftId?: string
  sessionDate?: string
  config: GraderAnalysisConfig
  gatesConfigSnapshot: GateAssignment[]
  currentStep?: 'config' | 'dashboard'
}): Promise<GraderAutosaveDraft> {
  const id = buildDraftId(params)
  const draft: GraderAutosaveDraft = {
    id,
    createdBy: params.createdBy,
    deviceId: params.deviceId,
    shiftId: params.shiftId,
    sessionDate: params.sessionDate,
    config: params.config,
    gatesConfigSnapshot: params.gatesConfigSnapshot,
    currentStep: params.currentStep,
    updatedAt: new Date().toISOString(),
  }

  const firestoreData = deepCleanUndefined({
    ...draft,
    _updatedAt: serverTimestamp(),
  })
  await setDoc(doc(db, DRAFTS_COLLECTION, id), firestoreData)
  return draft
}

export async function getLatestGraderAutosaveDraft(createdBy: string): Promise<GraderAutosaveDraft | null> {
  const q = query(
    collection(db, DRAFTS_COLLECTION),
    where('createdBy', '==', createdBy),
    orderBy('_updatedAt', 'desc'),
    limit(1),
  )
  const snap = await getDocs(q)
  if (snap.empty) return null
  return snap.docs[0]?.data() as GraderAutosaveDraft
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
