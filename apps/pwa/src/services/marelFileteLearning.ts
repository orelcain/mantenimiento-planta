/**
 * marelFileteLearning — contenido del Centro de Aprendizaje para la Marel Filete
 * (línea de fileteado / porcionado). Fuente: manual del usuario de la línea
 * SmartLine (pesaje dinámico + clasificación + descarga, software A600), ES.
 *
 * Vive como seed JSON (`marelFilete/marelFileteContent.json`, curado y versionado
 * en el repo) y este módulo lo adapta a los tipos de `learningContent`. Mismo
 * patrón que detectorMetalesLearning / marelHgLearning / fishkenLearning.
 */
import seed from './marelFilete/marelFileteContent.json'
import type { DiagnosisEntry, Flow, ManualSection, Procedure } from './learningContent'

export const MAREL_FILETE_LEARNING_SLUG = 'marel-filete'
export const MAREL_FILETE_CONTENT_UPDATED_AT = new Date('2026-07-12T00:00:00-04:00').getTime()

interface RawManual { id: string; title: string; order: number; content: string }
interface RawProcedure {
  id: string; title: string; description?: string
  steps: { order: number; title: string; description?: string; imageUrl?: string | null }[]
}
interface RawFlow { id: string; title: string; trigger: string; actions: string[] }
interface RawDiagnosis { id: string; title: string; symptom: string; possibleCauses: string[]; solution: string }

interface MarelFileteSeed {
  manual: RawManual[]
  procedures: RawProcedure[]
  flows: RawFlow[]
  diagnosis: RawDiagnosis[]
}

const data = seed as MarelFileteSeed
const stamp = { createdAt: MAREL_FILETE_CONTENT_UPDATED_AT, updatedAt: MAREL_FILETE_CONTENT_UPDATED_AT }

export function listMarelFileteManualSections(): ManualSection[] {
  return data.manual
    .slice()
    .sort((a, b) => a.order - b.order)
    .map(s => ({ id: s.id, title: s.title, order: s.order, content: s.content, ...stamp }))
}

export function listMarelFileteProcedures(): Procedure[] {
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
    createdBy: 'marel-filete-seed',
    ...stamp,
  }))
}

export function listMarelFileteFlows(): Flow[] {
  return data.flows.map(f => ({ id: f.id, title: f.title, trigger: f.trigger, actions: f.actions, ...stamp }))
}

export function listMarelFileteDiagnosis(): DiagnosisEntry[] {
  return data.diagnosis.map(d => ({
    id: d.id,
    title: d.title,
    symptom: d.symptom,
    possibleCauses: d.possibleCauses,
    solution: d.solution,
    ...stamp,
  }))
}

export function getMarelFileteContentCounts() {
  return {
    manual: data.manual.length,
    procedures: data.procedures.length,
    flows: data.flows.length,
    diagnosis: data.diagnosis.length,
  }
}
