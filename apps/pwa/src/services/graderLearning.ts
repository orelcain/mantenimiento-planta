/**
 * graderLearning — Adaptador del catalogo de runbooks Z2 al formato del
 * Centro de Aprendizaje, para que el Grader use el mismo expediente que el
 * resto de las maquinas (mismo patron que baader200Learning).
 *
 * La fuente de verdad sigue siendo `services/grader/graderRunbooks.ts`, porque
 * sus `triggers` alimentan el plan de accion del Analisis de Turno
 * (`findTriggeredRunbooks`). Aqui solo se TRADUCE, nunca se copia ni se mueve.
 *
 * Reparto:
 *   Manual        → documentos oficiales, glosario Z2 y parametros del controlador
 *   Procedimientos → runbooks de contrastacion, calibracion, mantencion y limpieza
 *   Flujos        → runbooks que la app dispara sola (triggers con `metric`)
 *   Diagnostico   → runbooks de troubleshooting
 */
import { RUNBOOKS, type Runbook } from './grader/graderRunbooks'
import { GRADER_GLOSSARY } from './grader/graderGlossary'
import type { DiagnosisEntry, Flow, ManualSection, Procedure } from './learningContent'

export const GRADER_LEARNING_SLUG = 'grader'
export const GRADER_CONTENT_UPDATED_AT = new Date('2026-07-09T00:00:00-04:00').getTime()

/** Runbooks que son procedimiento programado; el resto es diagnostico reactivo. */
const PROCEDURE_CATEGORIES = new Set(['contrastacion', 'calibracion', 'mantencion', 'limpieza'])

const OFFICIAL_DOCS = [
  { label: 'Manual Marelec MS4/12', url: '/docs/grader/manual-marelec-ms4-12.pdf' },
  { label: 'SOP Contrastación — CH-MT-ME-0002', url: '/docs/grader/sop-contrastacion.pdf' },
  { label: 'SOP Balanzas y tara', url: '/docs/grader/sop-balanzas.pdf' },
]

const REFERENCE_IMAGES = [
  { label: 'Cambio de tarjeta SM221', url: '/docs/grader/troubleshooting/cambio-sm221.jpg' },
  { label: 'Motor tambor de la cinta de aceleración', url: '/docs/grader/troubleshooting/moto-tambor.jpg' },
  { label: 'Botón azul de reset en el panel Z2', url: '/docs/grader/troubleshooting/boton-azul.jpg' },
]

const allRunbooks = (): Runbook[] => Object.values(RUNBOOKS)

/** Runbooks que la app dispara sola: tienen al menos un trigger ligado a una metrica. */
function isAutoTriggered(rb: Runbook): boolean {
  return rb.triggers.some(t => !!t.metric)
}

function stepDescription(step: Runbook['steps'][number]): string {
  const extra: string[] = []
  if (step.note) extra.push(`Nota: ${step.note}`)
  if (step.requiresTool?.length) extra.push(`Requiere: ${step.requiresTool.join(', ')}`)
  if (step.durationMin) extra.push(`Duración estimada: ${step.durationMin} min`)
  return [step.instruction, ...extra].join('\n')
}

// ─────────────────────────────────────────────────────────────
// MANUAL
// ─────────────────────────────────────────────────────────────

function docsSection(): ManualSection {
  return {
    id: 'grader-manual-documentos',
    title: 'Documentos oficiales',
    order: 1,
    createdAt: GRADER_CONTENT_UPDATED_AT,
    updatedAt: GRADER_CONTENT_UPDATED_AT,
    content: [
      'Fuentes oficiales del clasificador Marelec. Todo runbook de este expediente se apoya en alguno de estos documentos.',
      'Documentos:',
      ...OFFICIAL_DOCS.map(doc => `- ${doc.label}: ${doc.url}`),
      'Notas operativas:',
      '- Ante discrepancia entre un runbook y el manual oficial, manda el manual: reportar la diferencia a Mantención.',
    ].join('\n\n'),
  }
}

function glossarySection(): ManualSection {
  const terms = Object.values(GRADER_GLOSSARY).map(entry => {
    const alts = entry.alts?.length ? ` (también: ${entry.alts.join(', ')})` : ''
    return `- ${entry.label}${alts}: ${entry.description}`
  })
  return {
    id: 'grader-manual-glosario',
    title: 'Glosario Marelec Z2',
    order: 2,
    createdAt: GRADER_CONTENT_UPDATED_AT,
    updatedAt: GRADER_CONTENT_UPDATED_AT,
    content: [
      `Vocabulario del clasificador y de la planta: ${terms.length} términos usados en los runbooks, en el Z2 y en los reportes de turno.`,
      'Puntos clave:',
      ...terms,
    ].join('\n\n'),
  }
}

function parametersSection(): ManualSection {
  const routes = allRunbooks()
    .filter(rb => rb.z2Path?.length)
    .map(rb => `- ${rb.title}: ${rb.z2Path!.join(' → ')}`)
  const serviceKeys = [...new Set(allRunbooks().map(rb => rb.serviceKey).filter(Boolean))]

  return {
    id: 'grader-manual-parametros-z2',
    title: 'Parámetros y rutas del controlador Z2',
    order: 3,
    createdAt: GRADER_CONTENT_UPDATED_AT,
    updatedAt: GRADER_CONTENT_UPDATED_AT,
    content: [
      'Rutas de menú y claves de servicio del Z2 que usan los procedimientos de este expediente.',
      'Medidas / tolerancias:',
      `- Clave de servicio: ${serviceKeys.join(', ') || 'no aplica'}`,
      '- Pocket vacío: −5 a +5 g',
      '- Peso patrón de contrastación: 5 000 g ± 20 g',
      '- Presión de aire: ≥ 7 bar (0,70 MPa), aire seco',
      '- Objetivo P0 (rechazo): < 2 %',
      'Puntos clave:',
      ...routes,
      'Notas operativas:',
      '- Anotar siempre el valor anterior antes de modificar un parámetro del Z2.',
      'Referencias visuales:',
      ...REFERENCE_IMAGES.map(img => `- ${img.label}: ${img.url}`),
    ].join('\n\n'),
  }
}

export function listGraderManualSections(): ManualSection[] {
  return [docsSection(), glossarySection(), parametersSection()]
}

// ─────────────────────────────────────────────────────────────
// PROCEDIMIENTOS
// ─────────────────────────────────────────────────────────────

export function listGraderProcedures(): Procedure[] {
  return allRunbooks()
    .filter(rb => PROCEDURE_CATEGORIES.has(rb.category))
    .map(rb => ({
      id: `grader-procedure-${rb.id}`,
      title: rb.title,
      description: [rb.summary, `Fuente: ${rb.source}`].join('\n\n'),
      menuPath: rb.z2Path,
      formula: rb.formula,
      successCriteria: rb.successCriteria,
      steps: rb.steps.map(step => ({
        order: step.order,
        title: `Paso ${step.order}`,
        description: stepDescription(step),
        imageUrl: step.imageRef ?? null,
      })),
      createdAt: GRADER_CONTENT_UPDATED_AT,
      updatedAt: GRADER_CONTENT_UPDATED_AT,
      createdBy: 'grader-adapter',
    }))
}

// ─────────────────────────────────────────────────────────────
// FLUJOS — "¿Que hago cuando...?"
// ─────────────────────────────────────────────────────────────

export function listGraderFlows(): Flow[] {
  return allRunbooks()
    .filter(isAutoTriggered)
    .map(rb => ({
      id: `grader-flow-${rb.id}`,
      title: rb.title,
      trigger: rb.triggers.map(t => t.condition).join(' · '),
      actions: [
        ...rb.steps.map(step => step.instruction),
        `Verificar: ${rb.successCriteria.join(' · ')}`,
      ],
      createdAt: GRADER_CONTENT_UPDATED_AT,
      updatedAt: GRADER_CONTENT_UPDATED_AT,
    }))
}

// ─────────────────────────────────────────────────────────────
// DIAGNOSTICO
// ─────────────────────────────────────────────────────────────

export function listGraderDiagnosis(): DiagnosisEntry[] {
  return allRunbooks()
    .filter(rb => rb.category === 'troubleshooting')
    .map(rb => ({
      id: `grader-diagnosis-${rb.id}`,
      title: rb.title,
      symptom: rb.summary,
      possibleCauses: rb.triggers.map(t => t.condition),
      solution: [
        ...rb.steps.map(step => `${step.order}. ${stepDescription(step)}`),
        '',
        `Criterios de éxito: ${rb.successCriteria.join(' · ')}`,
        `Fuente: ${rb.source}`,
      ].join('\n'),
      createdAt: GRADER_CONTENT_UPDATED_AT,
      updatedAt: GRADER_CONTENT_UPDATED_AT,
    }))
}
