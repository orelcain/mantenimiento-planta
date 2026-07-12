/**
 * baader142Learning — contenido del Centro de Aprendizaje para la Baader 142.
 *
 * La data se curó del manual oficial (`142-Manual de Instrucciones-2005-12-E`,
 * 96 págs) al formato del expediente estándar. Vive como seed JSON
 * (`baader142/baader142Content.json`, generado por curaduría y versionado en el
 * repo) y este módulo lo adapta a los tipos de `learningContent`.
 *
 * Misma idea que baader200Learning / graderLearning: seed en código; a futuro
 * se le pueden sumar overrides de Firestore si hace falta editar desde admin.
 */
import seed from './baader142/baader142Content.json'
import type { DiagnosisEntry, Flow, ManualSection, Procedure } from './learningContent'

export const B142_LEARNING_SLUG = 'baader-142'
export const B142_CONTENT_UPDATED_AT = new Date('2026-07-12T00:00:00-04:00').getTime()

interface RawManual { id: string; title: string; order: number; content: string }
interface RawProcedure {
  id: string; title: string; description?: string
  steps: { order: number; title: string; description?: string; imageUrl?: string | null }[]
}
interface RawFlow { id: string; title: string; trigger: string; actions: string[] }
interface RawDiagnosis { id: string; title: string; symptom: string; possibleCauses: string[]; solution: string }

interface B142Seed {
  manual: RawManual[]
  procedures: RawProcedure[]
  flows: RawFlow[]
  diagnosis: RawDiagnosis[]
}

const data = seed as B142Seed
const stamp = { createdAt: B142_CONTENT_UPDATED_AT, updatedAt: B142_CONTENT_UPDATED_AT }

export function listB142ManualSections(): ManualSection[] {
  return data.manual
    .slice()
    .sort((a, b) => a.order - b.order)
    .map(s => ({ id: s.id, title: s.title, order: s.order, content: s.content, ...stamp }))
}

export function listB142Procedures(): Procedure[] {
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
    createdBy: 'b142-seed',
    ...stamp,
  }))
}

export function listB142Flows(): Flow[] {
  return data.flows.map(f => ({ id: f.id, title: f.title, trigger: f.trigger, actions: f.actions, ...stamp }))
}

export function listB142Diagnosis(): DiagnosisEntry[] {
  return data.diagnosis.map(d => ({
    id: d.id,
    title: d.title,
    symptom: d.symptom,
    possibleCauses: d.possibleCauses,
    solution: d.solution,
    ...stamp,
  }))
}

export function getB142ContentCounts() {
  return {
    manual: data.manual.length,
    procedures: data.procedures.length,
    flows: data.flows.length,
    diagnosis: data.diagnosis.length,
  }
}
