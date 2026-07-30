/**
 * enzunchadoraLearning — contenido del Centro de Aprendizaje para la Enzunchadora
 * Transpak TP-6000-1 (flejadora automática de cajas terminadas, sellado por calor).
 *
 * Fuente: `TRANSPAK_TP-6000-1_Manual_operacion_y_repuestos.pdf` (124 págs; PARTE I =
 * manual de operación, págs. 1-22). El manual original está en inglés: el contenido
 * se tradujo al curar, transcribiendo los valores técnicos exactos y citando la
 * página de origen en cada sección. La tabla de Troubleshooting (pág. 22) venía como
 * imagen sin texto extraíble y se transcribió leyéndola rasterizada: sus 26 causas
 * están repartidas en las 5 entradas de diagnóstico, agrupadas por síntoma.
 *
 * Vive como seed JSON (`enzunchadora/enzunchadoraContent.json`, curado y versionado
 * en el repo) y este módulo lo adapta a los tipos de `learningContent`. Mismo patrón
 * que fishkenLearning / detectorMetalesLearning / marelHgLearning — con la diferencia
 * de que acá la capa didáctica (objetivo · porqué · autoevaluación) va inline en el
 * JSON, así que no hace falta el mapa MANUAL_DIDACTIC.
 */
import seed from './enzunchadora/enzunchadoraContent.json'
import type { DiagnosisEntry, Flow, ManualSection, Procedure } from './learningContent'

export const ENZUNCHADORA_LEARNING_SLUG = 'enzunchadora-n2'
export const ENZUNCHADORA_CONTENT_UPDATED_AT = new Date('2026-07-30T00:00:00-04:00').getTime()

interface RawQuiz { question: string; options: string[]; correctIndex: number; explanation: string }
interface RawManual { id: string; title: string; order: number; content: string; objetivo?: string; porque?: string; quiz?: RawQuiz[] }
interface RawProcedure {
  id: string; title: string; description?: string
  steps: { order: number; title: string; description?: string; imageUrl?: string | null }[]
}
interface RawFlow { id: string; title: string; trigger: string; actions: string[] }
interface RawDiagnosis { id: string; title: string; symptom: string; possibleCauses: string[]; solution: string }

interface EnzunchadoraSeed {
  manual: RawManual[]
  procedures: RawProcedure[]
  flows: RawFlow[]
  diagnosis: RawDiagnosis[]
}

const data = seed as EnzunchadoraSeed
const stamp = { createdAt: ENZUNCHADORA_CONTENT_UPDATED_AT, updatedAt: ENZUNCHADORA_CONTENT_UPDATED_AT }

export function listEnzunchadoraManualSections(): ManualSection[] {
  return data.manual
    .slice()
    .sort((a, b) => a.order - b.order)
    .map(s => ({
      id: s.id,
      title: s.title,
      order: s.order,
      content: s.content,
      objetivo: s.objetivo,
      porque: s.porque,
      quiz: s.quiz,
      ...stamp,
    }))
}

export function listEnzunchadoraProcedures(): Procedure[] {
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
    createdBy: 'enzunchadora-seed',
    ...stamp,
  }))
}

export function listEnzunchadoraFlows(): Flow[] {
  return data.flows.map(f => ({ id: f.id, title: f.title, trigger: f.trigger, actions: f.actions, ...stamp }))
}

export function listEnzunchadoraDiagnosis(): DiagnosisEntry[] {
  return data.diagnosis.map(d => ({
    id: d.id,
    title: d.title,
    symptom: d.symptom,
    possibleCauses: d.possibleCauses,
    solution: d.solution,
    ...stamp,
  }))
}

export function getEnzunchadoraContentCounts() {
  return {
    manual: data.manual.length,
    procedures: data.procedures.length,
    flows: data.flows.length,
    diagnosis: data.diagnosis.length,
  }
}
