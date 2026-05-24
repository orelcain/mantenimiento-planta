/**
 * learningContent — CRUD de contenido del Centro de Aprendizaje en Firestore
 *
 * Estructura:
 *   learningContent/{machineSlug}/manual/{sectionId}
 *   learningContent/{machineSlug}/procedures/{procedureId}
 *   learningContent/{machineSlug}/flows/{flowId}
 *   learningContent/{machineSlug}/diagnosis/{diagnosisId}
 */
import {
  collection,
  deleteDoc,
  doc,
  getDoc,
  getDocs,
  orderBy,
  query,
  setDoc,
  Timestamp,
} from 'firebase/firestore'
import { deleteObject, getDownloadURL, ref, uploadBytes } from 'firebase/storage'
import { db, storage } from './firebase'
import { processImageForUpload, IMAGE_PRESETS } from '@/utils/images/processImage'

// ─────────────────────────────────────────────────────────────
// TIPOS
// ─────────────────────────────────────────────────────────────

export interface ProcedureStep {
  order: number
  title: string
  description: string
  /** URL de imagen o null */
  imageUrl?: string | null
}

export interface Procedure {
  id: string
  title: string
  description?: string
  steps: ProcedureStep[]
  createdAt: number
  updatedAt: number
  createdBy?: string
}

export interface ManualSection {
  id: string
  title: string
  content: string
  order: number
  createdAt: number
  updatedAt: number
}

export interface Flow {
  id: string
  title: string
  trigger: string
  actions: string[]
  createdAt: number
  updatedAt: number
}

export interface DiagnosisEntry {
  id: string
  /** Título corto e indicativo del diagnóstico (etiqueta del catálogo). */
  title: string
  /** Descripción detallada del síntoma observado. */
  symptom: string
  possibleCauses: string[]
  solution: string
  createdAt: number
  updatedAt: number
}

export type LearningSectionKey = 'manual' | 'procedures' | 'flows' | 'diagnosis'

// ─────────────────────────────────────────────────────────────
// PATHS HELPERS
// ─────────────────────────────────────────────────────────────

const ROOT = 'learningContent'

function sectionCollection(machineSlug: string, section: LearningSectionKey) {
  return collection(db, ROOT, machineSlug, section)
}

function sectionDoc(machineSlug: string, section: LearningSectionKey, id: string) {
  return doc(db, ROOT, machineSlug, section, id)
}

// ─────────────────────────────────────────────────────────────
// PROCEDURES
// ─────────────────────────────────────────────────────────────

export async function listProcedures(machineSlug: string): Promise<Procedure[]> {
  const q = query(sectionCollection(machineSlug, 'procedures'), orderBy('updatedAt', 'desc'))
  const snap = await getDocs(q)
  return snap.docs.map(d => {
    const data = d.data() as Procedure
    return { ...data, id: d.id }
  })
}

export async function getProcedure(machineSlug: string, id: string): Promise<Procedure | null> {
  const snap = await getDoc(sectionDoc(machineSlug, 'procedures', id))
  if (!snap.exists()) return null
  return { ...(snap.data() as Procedure), id: snap.id }
}

export async function saveProcedure(
  machineSlug: string,
  procedure: Omit<Procedure, 'createdAt' | 'updatedAt'> & { createdAt?: number }
): Promise<void> {
  const now = Date.now()
  const ref = sectionDoc(machineSlug, 'procedures', procedure.id)
  await setDoc(
    ref,
    {
      ...procedure,
      createdAt: procedure.createdAt || now,
      updatedAt: now,
      _ts: Timestamp.now(),
    },
    { merge: false }
  )
}

export async function deleteProcedure(machineSlug: string, id: string): Promise<void> {
  await deleteDoc(sectionDoc(machineSlug, 'procedures', id))
}

// ─────────────────────────────────────────────────────────────
// MANUAL SECTIONS
// ─────────────────────────────────────────────────────────────

export async function listManualSections(machineSlug: string): Promise<ManualSection[]> {
  const q = query(sectionCollection(machineSlug, 'manual'), orderBy('order', 'asc'))
  const snap = await getDocs(q)
  return snap.docs.map(d => ({ ...(d.data() as ManualSection), id: d.id }))
}

export async function saveManualSection(
  machineSlug: string,
  section: Omit<ManualSection, 'createdAt' | 'updatedAt'> & { createdAt?: number }
): Promise<void> {
  const now = Date.now()
  await setDoc(sectionDoc(machineSlug, 'manual', section.id), {
    ...section,
    createdAt: section.createdAt || now,
    updatedAt: now,
  })
}

export async function deleteManualSection(machineSlug: string, id: string): Promise<void> {
  await deleteDoc(sectionDoc(machineSlug, 'manual', id))
}

// ─────────────────────────────────────────────────────────────
// FLOWS
// ─────────────────────────────────────────────────────────────

export async function listFlows(machineSlug: string): Promise<Flow[]> {
  const q = query(sectionCollection(machineSlug, 'flows'), orderBy('updatedAt', 'desc'))
  const snap = await getDocs(q)
  return snap.docs.map(d => ({ ...(d.data() as Flow), id: d.id }))
}

export async function saveFlow(
  machineSlug: string,
  flow: Omit<Flow, 'createdAt' | 'updatedAt'> & { createdAt?: number }
): Promise<void> {
  const now = Date.now()
  await setDoc(sectionDoc(machineSlug, 'flows', flow.id), {
    ...flow,
    createdAt: flow.createdAt || now,
    updatedAt: now,
  })
}

export async function deleteFlow(machineSlug: string, id: string): Promise<void> {
  await deleteDoc(sectionDoc(machineSlug, 'flows', id))
}

// ─────────────────────────────────────────────────────────────
// DIAGNOSIS
// ─────────────────────────────────────────────────────────────

export async function listDiagnosis(machineSlug: string): Promise<DiagnosisEntry[]> {
  const q = query(sectionCollection(machineSlug, 'diagnosis'), orderBy('updatedAt', 'desc'))
  const snap = await getDocs(q)
  return snap.docs.map(d => ({ ...(d.data() as DiagnosisEntry), id: d.id }))
}

export async function saveDiagnosis(
  machineSlug: string,
  entry: Omit<DiagnosisEntry, 'createdAt' | 'updatedAt'> & { createdAt?: number }
): Promise<void> {
  const now = Date.now()
  await setDoc(sectionDoc(machineSlug, 'diagnosis', entry.id), {
    ...entry,
    createdAt: entry.createdAt || now,
    updatedAt: now,
  })
}

export async function deleteDiagnosis(machineSlug: string, id: string): Promise<void> {
  await deleteDoc(sectionDoc(machineSlug, 'diagnosis', id))
}

// ─────────────────────────────────────────────────────────────
// RESUMEN / COUNTS (para el hub)
// ─────────────────────────────────────────────────────────────

export interface MachineContentCounts {
  manual: number
  procedures: number
  flows: number
  diagnosis: number
}

/** Obtiene conteo de items por seccion para una maquina */
export async function getMachineContentCounts(
  machineSlug: string
): Promise<MachineContentCounts> {
  const [manual, procedures, flows, diagnosis] = await Promise.all([
    getDocs(sectionCollection(machineSlug, 'manual')),
    getDocs(sectionCollection(machineSlug, 'procedures')),
    getDocs(sectionCollection(machineSlug, 'flows')),
    getDocs(sectionCollection(machineSlug, 'diagnosis')),
  ])
  return {
    manual: manual.size,
    procedures: procedures.size,
    flows: flows.size,
    diagnosis: diagnosis.size,
  }
}

export interface MachineContentMeta extends MachineContentCounts {
  /** updatedAt (ms) más reciente entre las 4 secciones, o null si no hay contenido */
  lastUpdatedAt: number | null
}

/** Como getMachineContentCounts, pero además devuelve el updatedAt más reciente
 *  (para el badge "Nuevo"). Reusa los mismos getDocs (sin lecturas extra). */
export async function getMachineContentMeta(
  machineSlug: string
): Promise<MachineContentMeta> {
  const [manual, procedures, flows, diagnosis] = await Promise.all([
    getDocs(sectionCollection(machineSlug, 'manual')),
    getDocs(sectionCollection(machineSlug, 'procedures')),
    getDocs(sectionCollection(machineSlug, 'flows')),
    getDocs(sectionCollection(machineSlug, 'diagnosis')),
  ])
  let lastUpdatedAt: number | null = null
  for (const snap of [manual, procedures, flows, diagnosis]) {
    for (const d of snap.docs) {
      const u = (d.data() as { updatedAt?: number }).updatedAt
      if (typeof u === 'number' && (lastUpdatedAt === null || u > lastUpdatedAt)) lastUpdatedAt = u
    }
  }
  return {
    manual: manual.size,
    procedures: procedures.size,
    flows: flows.size,
    diagnosis: diagnosis.size,
    lastUpdatedAt,
  }
}

export interface SymptomHit {
  machineSlug: string
  diagnosisId: string
  title: string
  symptom: string
}

/** Carga los síntomas de diagnóstico de las máquinas indicadas (para búsqueda
 *  por síntoma en el hub). Solo lee la sección diagnosis de cada slug. */
export async function getSymptomsForMachines(machineSlugs: string[]): Promise<SymptomHit[]> {
  const results = await Promise.all(
    machineSlugs.map(async slug => {
      try {
        const snap = await getDocs(sectionCollection(slug, 'diagnosis'))
        return snap.docs.map(d => {
          const data = d.data() as DiagnosisEntry
          return {
            machineSlug: slug,
            diagnosisId: d.id,
            title: data.title ?? '',
            symptom: data.symptom ?? '',
          }
        })
      } catch {
        return [] as SymptomHit[]
      }
    })
  )
  return results.flat().filter(h => h.title.trim().length > 0 || h.symptom.trim().length > 0)
}

/** Genera un ID unico basado en timestamp + random */
export function generateContentId(prefix = ''): string {
  return `${prefix}${Date.now()}_${Math.random().toString(36).slice(2, 9)}`
}

// ─────────────────────────────────────────────────────────────
// UPLOAD DE IMAGENES (Storage)
// ─────────────────────────────────────────────────────────────

/**
 * Sube una imagen a Firebase Storage comprimida como WebP y devuelve la URL publica.
 * Path: learningContent/{machineSlug}/{section}/{entityId}/{imageId}.webp
 */
export async function uploadLearningImage(
  machineSlug: string,
  section: LearningSectionKey,
  entityId: string,
  file: File
): Promise<string> {
  const { file: compressed } = await processImageForUpload(file, IMAGE_PRESETS.photo)
  const imageId = `${Date.now()}_${Math.random().toString(36).slice(2, 9)}`
  const ext = compressed.type.includes('webp') ? 'webp' : 'jpg'
  const path = `learningContent/${machineSlug}/${section}/${entityId}/${imageId}.${ext}`
  const storageRef = ref(storage, path)
  await uploadBytes(storageRef, compressed, {
    contentType: compressed.type || 'image/webp',
  })
  return getDownloadURL(storageRef)
}

/** Elimina una imagen previamente subida (ignora errores si ya no existe) */
export async function deleteLearningImage(url: string): Promise<void> {
  try {
    const storageRef = ref(storage, url)
    await deleteObject(storageRef)
  } catch {
    // Si la URL no es parseable o el objeto ya no existe, ignorar
  }
}
