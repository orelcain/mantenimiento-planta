/**
 * marelFileteLearning — contenido del Centro de Aprendizaje para la Marel Filete
 * (línea de fileteado / porcionado). El equipo instalado es una M-Weigher WTR
 * (GR8251) con indicador M6410: un pesador dinámico en línea que NO clasifica ni
 * arma lotes — eso ocurre aguas abajo. Fuente: manual del usuario M-Weigher WTR, ES.
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

/** Capa didáctica (objetivo · porqué · autoevaluación) sobre el manual M-Weigher WTR curado. */
const MANUAL_DIDACTIC: Record<string, { objetivo?: string; porque?: string; quiz?: RawQuiz[] }> = {
  'mf-manual-que-es': {
    objetivo: 'Explicar el recorrido de la M-Weigher WTR —alimentación → plataforma de pesaje → salida— y que lo único que hace es pesar cada pieza en movimiento.',
    porque: 'confundirla con un clasificador manda al técnico a buscar brazos, canaletas y bandejas que esta máquina no tiene. Lo que sí depende de ella es la exactitud del peso, y eso se juega en el flujo y la limpieza.',
    quiz: [
      { question: '¿Qué hace la M-Weigher WTR con el producto después de pesarlo?', options: ['Lo clasifica por calibre', 'Lo arma en lotes por peso', 'Lo entrega por la plataforma de salida al proceso siguiente', 'Lo descarta si está fuera de rango'], correctIndex: 2, explanation: 'La M-Weigher WTR solo pesa: el artículo sale por la plataforma de salida y pasa al proceso siguiente. El peso se transfiere al indicador de la porcionadora o Robobatcher, que es donde ocurre el loteo.' },
      { question: '¿Por qué cada pieza tiene que pasar sola por la plataforma de pesaje?', options: ['Por higiene', 'Porque el peso se calcula por pieza combinando peso y velocidad de cinta', 'Para no romper la cinta', 'Para que quepa'], correctIndex: 1, explanation: 'El pesaje es dinámico e integrado: se combina el peso sobre la plataforma con la velocidad de cinta del codificador. Si entran dos piezas juntas, la pesada no corresponde a ninguna de las dos.' },
    ],
  },
  'mf-manual-seguridad': {
    objetivo: 'Distinguir cuándo corresponde cortar y bloquear energía (intervención sobre piezas móviles) y cuándo el manual pide algo distinto (limpieza).',
    porque: 'aplicar el criterio equivocado tiene costo en los dos sentidos: intervenir energizado lesiona, pero apagar el interruptor de red como rutina genera condensación de humedad dentro de la unidad.',
    quiz: [
      { question: 'Para la LIMPIEZA diaria, ¿qué pide el manual?', options: ['LOTO completo obligatorio', 'Apagar la máquina; el candado es opcional', 'Nada, se limpia en marcha', 'Solo avisar por radio'], correctIndex: 1, explanation: 'Para limpieza el manual pide apagar la máquina y da el candado como OPCIONAL ("opcionalmente, bloquee el interruptor con un candado para mayor seguridad"). El bloqueo es exigible para intervención sobre piezas móviles.' },
      { question: 'Entre turnos, ¿el interruptor de red se deja en OFF?', options: ['Sí, siempre', 'No: se deja en ON para mantener corriente constante y evitar condensación', 'Da lo mismo', 'Solo los lunes'], correctIndex: 1, explanation: 'El manual pide devolver el interruptor de red a encendido para mantener la corriente eléctrica constante y evitar la condensación de humedad en la unidad. El OFF con candado queda para intervención o mantenimiento.' },
    ],
  },
  'mf-manual-alimentacion': {
    objetivo: 'Entender que el producto debe llegar separado e individualizado a la plataforma de pesaje, y que esa separación se resuelve aguas arriba.',
    porque: 'el pesaje se calcula por pieza: si llegan dos juntas la pesada no sirve. Y esta máquina no tiene módulo separador propio, así que el problema y su arreglo están antes de ella.',
    quiz: [
      { question: '¿Qué efecto tiene un flujo con piezas pegadas?', options: ['Ninguno', 'La pesada no corresponde a ninguna de las dos piezas', 'Mejora la exactitud', 'Acelera la salida'], correctIndex: 1, explanation: 'El peso integrado se calcula por pieza; con dos piezas juntas sobre la plataforma el resultado no corresponde a ninguna. La separación se resuelve aguas arriba: la WTR no tiene separador propio.' },
    ],
  },
  'mf-manual-bascula-mw': {
    objetivo: 'Distinguir la báscula (unidad de pesaje: plataforma + celda de carga + módulo MWS2) del indicador M6410, que es la HMI.',
    porque: 'llamar "báscula M6410" al indicador manda a buscar el problema de pesaje en la pantalla en vez de en la celda, el MWS2 o el sensor de productos.',
    quiz: [
      { question: '¿Qué es el M6410?', options: ['La báscula', 'La celda de carga', 'El indicador (HMI)', 'El motor'], correctIndex: 2, explanation: 'El M6410 es el indicador, o sea la HMI. La báscula es la unidad de pesaje: plataforma, celda de carga y módulo de pesaje electrónico MWS2.' },
      { question: '¿Por qué importa tanto la limpieza en la unidad de pesaje?', options: ['Por estética', 'Porque el pesaje es dinámico y la suciedad desestabiliza la lectura', 'Por la garantía', 'No importa'], correctIndex: 1, explanation: 'El pesaje es dinámico (pieza en movimiento); la suciedad sobre la plataforma o la celda desestabiliza la lectura, y la suciedad en el sensor de productos obstruye el haz de luz.' },
    ],
  },
  'mf-manual-limpieza-mantenimiento': {
    objetivo: 'Limpiar respetando las zonas que no aguantan alta presión y saber qué tarea es de planta y cuál es del servicio Marel.',
    porque: 'un chorro de más de 25 bar sobre el sensor, la celda o la pantalla daña justo lo que sostiene la exactitud del pesaje; y buscar la falla en la celda de carga es perder el turno, porque su inspección es semestral y la hace Marel.',
    quiz: [
      { question: '¿Dónde NO se puede usar agua a alta presión?', options: ['En ningún lado', 'En indicadores, sensor de producto, celda de carga, armarios y motores', 'Solo en el piso', 'En las cintas'], correctIndex: 1, explanation: 'Los chorros por encima de 25 bar dañan los mecanismos delicados: en indicadores, sensor de producto, celda de carga, armarios eléctricos y motores va agua a baja presión o limpieza a mano.' },
      { question: 'La inspección de la celda de carga, ¿con qué frecuencia y quién?', options: ['Diaria, el operador', 'Semanal, mantención', 'Cada seis meses, el servicio técnico de Marel', 'Nunca'], correctIndex: 2, explanation: 'La inspección de la(s) celda(s) de carga y del sistema eléctrico es mantenimiento semestral realizado por personal de servicio técnico de Marel. Lo que sí es rutina de planta es el sensor de productos.' },
      { question: '¿Qué le hace el cloro a la máquina?', options: ['Nada', 'Desintegra las cintas y puede manchar de óxido el inox', 'La protege', 'Solo huele feo'], correctIndex: 1, explanation: 'El cloro desintegra las cintas y puede producir manchas de óxido en el acero inoxidable. Las soluciones básicas potentes (pH > 13) corroen las piezas de aluminio como los cilindros de aire.' },
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
