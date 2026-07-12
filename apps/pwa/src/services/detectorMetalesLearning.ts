/**
 * detectorMetalesLearning — contenido del Centro de Aprendizaje para el Detector
 * de Metales Vistus (Sartorius Mechatronics / Minebea Intec).
 *
 * La data se curó del manual oficial (`BA_Vistus-es_0_20110413`, 223 págs) al
 * formato del expediente estándar. Vive como seed JSON
 * (`detectorMetales/detectorMetalesContent.json`, generado por curaduría y
 * versionado en el repo) y este módulo lo adapta a los tipos de `learningContent`.
 *
 * Misma idea que baader142Learning / baader200Learning / graderLearning: seed en
 * código; a futuro se le pueden sumar overrides de Firestore si hace falta editar
 * desde admin.
 */
import seed from './detectorMetales/detectorMetalesContent.json'
import type { DiagnosisEntry, Flow, ManualSection, Procedure } from './learningContent'

export const DETECTOR_LEARNING_SLUG = 'detector-metales'
export const DETECTOR_CONTENT_UPDATED_AT = new Date('2026-07-12T00:00:00-04:00').getTime()

interface RawManual { id: string; title: string; order: number; content: string }
interface RawProcedure {
  id: string; title: string; description?: string
  steps: { order: number; title: string; description?: string; imageUrl?: string | null }[]
}
interface RawFlow { id: string; title: string; trigger: string; actions: string[] }
interface RawDiagnosis { id: string; title: string; symptom: string; possibleCauses: string[]; solution: string }

interface DetectorSeed {
  manual: RawManual[]
  procedures: RawProcedure[]
  flows: RawFlow[]
  diagnosis: RawDiagnosis[]
}

const data = seed as DetectorSeed
const stamp = { createdAt: DETECTOR_CONTENT_UPDATED_AT, updatedAt: DETECTOR_CONTENT_UPDATED_AT }

export function listDetectorManualSections(): ManualSection[] {
  return data.manual
    .slice()
    .sort((a, b) => a.order - b.order)
    .map(s => ({ id: s.id, title: s.title, order: s.order, content: s.content, ...stamp }))
}

export function listDetectorProcedures(): Procedure[] {
  return data.procedures.map(p => ({
    id: p.id,
    title: p.title,
    description: p.description ?? '',
    steps: p.steps.map(st => ({
      order: st.order,
      title: st.title,
      description: st.description ?? '',
      imageUrl: st.imageUrl ?? null,
    })),
    createdBy: 'detector-seed',
    ...stamp,
  }))
}

export function listDetectorFlows(): Flow[] {
  return data.flows.map(f => ({ id: f.id, title: f.title, trigger: f.trigger, actions: f.actions, ...stamp }))
}

export function listDetectorDiagnosis(): DiagnosisEntry[] {
  return data.diagnosis.map(d => ({
    id: d.id,
    title: d.title,
    symptom: d.symptom,
    possibleCauses: d.possibleCauses,
    solution: d.solution,
    ...stamp,
  }))
}

export function getDetectorContentCounts() {
  return {
    manual: data.manual.length,
    procedures: data.procedures.length,
    flows: data.flows.length,
    diagnosis: data.diagnosis.length,
  }
}
