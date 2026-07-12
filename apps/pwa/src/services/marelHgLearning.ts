/**
 * marelHgLearning — contenido del Centro de Aprendizaje para la Marel HG
 * (línea de eviscerado / procesamiento primario). La fuente es el manual del
 * software del Clasificador A600 (controlador M3210, 76 págs, ES).
 *
 * Vive como seed JSON (`marelHg/marelHgContent.json`, curado y versionado en el
 * repo) y este módulo lo adapta a los tipos de `learningContent`. Mismo patrón
 * que detectorMetalesLearning / baader142Learning: seed en código; a futuro se
 * le pueden sumar overrides de Firestore si hace falta editar desde admin.
 */
import seed from './marelHg/marelHgContent.json'
import type { DiagnosisEntry, Flow, ManualSection, Procedure } from './learningContent'

export const MAREL_HG_LEARNING_SLUG = 'marel-hg'
export const MAREL_HG_CONTENT_UPDATED_AT = new Date('2026-07-12T00:00:00-04:00').getTime()

interface RawManual { id: string; title: string; order: number; content: string }
interface RawProcedure {
  id: string; title: string; description?: string
  steps: { order: number; title: string; description?: string; imageUrl?: string | null }[]
}
interface RawFlow { id: string; title: string; trigger: string; actions: string[] }
interface RawDiagnosis { id: string; title: string; symptom: string; possibleCauses: string[]; solution: string }

interface MarelHgSeed {
  manual: RawManual[]
  procedures: RawProcedure[]
  flows: RawFlow[]
  diagnosis: RawDiagnosis[]
}

const data = seed as MarelHgSeed
const stamp = { createdAt: MAREL_HG_CONTENT_UPDATED_AT, updatedAt: MAREL_HG_CONTENT_UPDATED_AT }

export function listMarelHgManualSections(): ManualSection[] {
  return data.manual
    .slice()
    .sort((a, b) => a.order - b.order)
    .map(s => ({ id: s.id, title: s.title, order: s.order, content: s.content, ...stamp }))
}

export function listMarelHgProcedures(): Procedure[] {
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
    createdBy: 'marel-hg-seed',
    ...stamp,
  }))
}

export function listMarelHgFlows(): Flow[] {
  return data.flows.map(f => ({ id: f.id, title: f.title, trigger: f.trigger, actions: f.actions, ...stamp }))
}

export function listMarelHgDiagnosis(): DiagnosisEntry[] {
  return data.diagnosis.map(d => ({
    id: d.id,
    title: d.title,
    symptom: d.symptom,
    possibleCauses: d.possibleCauses,
    solution: d.solution,
    ...stamp,
  }))
}

export function getMarelHgContentCounts() {
  return {
    manual: data.manual.length,
    procedures: data.procedures.length,
    flows: data.flows.length,
    diagnosis: data.diagnosis.length,
  }
}
