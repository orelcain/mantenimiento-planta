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

interface RawQuiz { question: string; options: string[]; correctIndex: number; explanation: string }
interface RawManual { id: string; title: string; order: number; content: string; objetivo?: string; porque?: string; quiz?: RawQuiz[] }
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

/** Capa didáctica (objetivo · porqué · autoevaluación) sobre el manual SmartLine curado. */
const MANUAL_DIDACTIC: Record<string, { objetivo?: string; porque?: string; quiz?: RawQuiz[] }> = {
  'mf-manual-que-es': {
    objetivo: 'Explicar el recorrido de la SmartLine —alimentación → báscula MW (pesaje dinámico) → descarga en lotes— y que el rendimiento depende de un flujo individualizado.',
    porque: 'el cuello de botella de la SmartLine casi siempre es la alimentación: si el producto no llega separado y parejo, no hay software que recupere el rendimiento.',
    quiz: [
      { question: '¿Cuáles son los tres módulos principales de la SmartLine?', options: ['Motor, cinta y tablero', 'Alimentación, báscula MW y descarga', 'Entrada, salida y PLC', 'Pesaje, corte y empaque'], correctIndex: 1, explanation: 'La SmartLine consta de alimentación, unidad de báscula MW (pesaje dinámico) y unidad de descarga.' },
      { question: '¿De qué depende el rendimiento máximo?', options: ['De la velocidad del motor', 'De un flujo de producto uniforme e individualizado en la alimentación', 'Del tamaño de la caja', 'Del clima'], correctIndex: 1, explanation: 'El rendimiento máximo solo se logra con un flujo de producto óptimo: separado y parejo en la alimentación.' },
    ],
  },
  'mf-manual-seguridad': {
    objetivo: 'Aplicar el bloqueo LOTO (interruptor de red en OFF + candado) antes de intervenir la SmartLine y no trabajar nunca sobre piezas móviles.',
    porque: 'es pesaje dinámico con cintas y brazos neumáticos en movimiento; sin LOTO, una puesta en marcha inesperada durante el mantenimiento lesiona. Además, operar sin protecciones anula la garantía.',
    quiz: [
      { question: 'Antes de trabajar en el equipo, ¿qué corresponde?', options: ['Bajar la velocidad', 'Interruptor de red en OFF y bloquear con candado (LOTO)', 'Avisar por radio', 'Sacar una tapa'], correctIndex: 1, explanation: 'Se desconecta la alimentación: interruptor de red del armario en OFF y se bloquea con candado (LOTO). Las reparaciones eléctricas las hace un electricista autorizado.' },
    ],
  },
  'mf-manual-alimentacion': {
    objetivo: 'Entender que la alimentación separa el producto en 2-3 pasos para entregarlo individualizado a la báscula, y que de eso depende el rendimiento.',
    porque: 'un flujo mal separado o con piezas pegadas baja el rendimiento y ensucia el pesaje; la mayoría de los problemas de la SmartLine se resuelven arreglando la alimentación.',
    quiz: [
      { question: '¿Qué efecto tiene un flujo con piezas pegadas o mal separado?', options: ['Ninguno', 'Baja el rendimiento y ensucia el pesaje', 'Mejora la exactitud', 'Acelera la descarga'], correctIndex: 1, explanation: 'Un flujo mal separado o con piezas pegadas baja el rendimiento y ensucia el pesaje; la separación se completa en 2-3 pasos.' },
    ],
  },
  'mf-manual-bascula-mw': {
    objetivo: 'Saber que la MW pesa cada pieza en movimiento con celdas de carga y elegir el modelo (MW1000/1450/1900) según la aplicación.',
    porque: 'al ser pesaje dinámico, la suciedad sobre las plataformas o celdas desestabiliza la lectura; por eso la limpieza y el flujo parejo pesan tanto en la exactitud.',
    quiz: [
      { question: '¿Qué modelo MW es el predeterminado?', options: ['MW1000', 'MW1450', 'MW1900', 'MW700'], correctIndex: 1, explanation: 'El MW1450 es el predeterminado; el MW1000 es para alta velocidad/espacio reducido y el MW1900 para piezas de más de 700 mm.' },
      { question: '¿Por qué importa tanto la limpieza en la báscula MW?', options: ['Por estética', 'Porque el pesaje es dinámico y la suciedad desestabiliza la lectura', 'Por la garantía', 'No importa'], correctIndex: 1, explanation: 'El pesaje es dinámico (pieza en movimiento); la suciedad sobre las plataformas o celdas desestabiliza la lectura.' },
    ],
  },
  'mf-manual-descarga': {
    objetivo: 'Entender que brazos neumáticos dirigen el flujo a canaletas/bandejas y que el A600 decide cuándo el lote alcanzó su objetivo de peso o número de piezas.',
    porque: 'un brazo neumático lento o desajustado desvía piezas al destino equivocado y mezcla lotes; es una causa típica de reclamos de peso o cantidad.',
    quiz: [
      { question: '¿Quién decide cuándo un lote alcanzó su objetivo?', options: ['El operador a ojo', 'El software A600 (por peso o número de piezas)', 'El brazo neumático', 'La cinta de cajas'], correctIndex: 1, explanation: 'El software A600 decide cuándo el lote alcanzó su objetivo (peso o número de piezas) y da la instrucción de descarga.' },
    ],
  },
  'mf-manual-limpieza-mantenimiento': {
    objetivo: 'Ejecutar la limpieza y el mantenimiento (cintas, plataformas, brazos, sensores) con la máquina asegurada (LOTO), sabiendo que en pesaje dinámico la suciedad afecta la exactitud.',
    porque: 'en una báscula dinámica la limpieza no es cosmética: la suciedad afecta directamente la exactitud y el rendimiento. Saltarla se paga en sobrepeso y rechazo.',
    quiz: [
      { question: '¿Por qué la limpieza es central en la SmartLine?', options: ['Por inspección sanitaria solamente', 'Porque al ser pesaje dinámico la suciedad afecta la exactitud y el rendimiento', 'Para que se vea bien', 'No es importante'], correctIndex: 1, explanation: 'Al ser pesaje dinámico, la suciedad afecta directamente la exactitud y el rendimiento; se limpia con la máquina asegurada (LOTO).' },
    ],
  },
}

export function listMarelFileteManualSections(): ManualSection[] {
  return data.manual
    .slice()
    .sort((a, b) => a.order - b.order)
    .map(s => {
      const d = MANUAL_DIDACTIC[s.id]
      return { id: s.id, title: s.title, order: s.order, content: s.content, objetivo: s.objetivo ?? d?.objetivo, porque: s.porque ?? d?.porque, quiz: s.quiz ?? d?.quiz, ...stamp }
    })
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
