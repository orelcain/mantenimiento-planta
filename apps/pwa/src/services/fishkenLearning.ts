/**
 * fishkenLearning — contenido del Centro de Aprendizaje para la Fishken E-Pack S28
 * (envasadora/pesadora combinatoria). Fuente: manual del E-Pack S28 (operación,
 * software, servicio) + manual FishKen Web (reportes), ES.
 *
 * Vive como seed JSON (`fishken/fishkenContent.json`, curado y versionado en el
 * repo) y este módulo lo adapta a los tipos de `learningContent`. Mismo patrón
 * que detectorMetalesLearning / marelHgLearning.
 */
import seed from './fishken/fishkenContent.json'
import type { DiagnosisEntry, Flow, ManualSection, Procedure } from './learningContent'

export const FISHKEN_LEARNING_SLUG = 'fishken'
export const FISHKEN_CONTENT_UPDATED_AT = new Date('2026-07-12T00:00:00-04:00').getTime()

interface RawQuiz { question: string; options: string[]; correctIndex: number; explanation: string }
interface RawManual { id: string; title: string; order: number; content: string; objetivo?: string; porque?: string; quiz?: RawQuiz[] }
interface RawProcedure {
  id: string; title: string; description?: string
  steps: { order: number; title: string; description?: string; imageUrl?: string | null }[]
}
interface RawFlow { id: string; title: string; trigger: string; actions: string[] }
interface RawDiagnosis { id: string; title: string; symptom: string; possibleCauses: string[]; solution: string }

interface FishkenSeed {
  manual: RawManual[]
  procedures: RawProcedure[]
  flows: RawFlow[]
  diagnosis: RawDiagnosis[]
}

const data = seed as FishkenSeed
const stamp = { createdAt: FISHKEN_CONTENT_UPDATED_AT, updatedAt: FISHKEN_CONTENT_UPDATED_AT }

/** Capa didáctica (objetivo · porqué · autoevaluación) sobre el manual E-Pack S28 curado. */
const MANUAL_DIDACTIC: Record<string, { objetivo?: string; porque?: string; quiz?: RawQuiz[] }> = {
  'fk-manual-que-es': {
    objetivo: 'Explicar cómo la E-Pack S28 arma cajas: 28 compuertas pesan piezas en celdas de carga y el software combina pesos para llegar a la caja objetivo con el menor sobrepeso.',
    porque: 'entender que es una pesadora combinatoria (no una simple balanza) es la base para leer el sobrepeso y el rechazo, que son los KPIs de rendimiento de la máquina.',
    quiz: [
      { question: '¿Cómo arma una caja la E-Pack S28?', options: ['Pesa una sola pieza', 'Combina los pesos de varias compuertas para llegar al objetivo con menor sobrepeso', 'Cuenta piezas sin pesar', 'Al azar'], correctIndex: 1, explanation: 'Es combinatoria: 28 compuertas pesan piezas y el software combina las que sumen dentro del peso objetivo, minimizando el sobrepeso.' },
      { question: '¿Cuántas compuertas tiene la E-Pack S28?', options: ['12', '24', '28', '48'], correctIndex: 2, explanation: 'Tiene 28 compuertas; cada una recibe y pesa piezas en su celda de carga.' },
    ],
  },
  'fk-manual-software-epack': {
    objetivo: 'Ubicar las dos opciones del menú principal del software E-Pack —Iniciar Proceso y Servicio FishKen— y para qué sirve cada una.',
    porque: 'confundir dónde se produce (Iniciar Proceso) con dónde se calibra/ajusta (Servicio FishKen) hace perder tiempo; el software es el que comanda las compuertas.',
    quiz: [
      { question: '¿Dónde se hace la calibración y el ajuste de puertas?', options: ['Iniciar Proceso', 'Servicio FishKen', 'FishKen Web', 'No se puede'], correctIndex: 1, explanation: 'Servicio FishKen agrupa calibración, ajuste de puertas y pruebas de conexión; Iniciar Proceso controla el proceso productivo.' },
    ],
  },
  'fk-manual-iniciar-proceso': {
    objetivo: 'Leer la pantalla Iniciar Proceso: producto configurado, estadísticas (cajas, sobrepeso %, kg/h) y el estado de compuertas (rojo = deshabilitada).',
    porque: 'el % de sobrepeso y las cajas rechazadas son la salud del proceso en vivo; leerlos a tiempo permite corregir antes de acumular pérdida.',
    quiz: [
      { question: 'En la pantalla Iniciar Proceso, ¿cómo se ve una compuerta deshabilitada?', options: ['Con transparencia', 'En color ROJO', 'Parpadeando en verde', 'No se ve'], correctIndex: 1, explanation: 'Las compuertas habilitadas se ven con transparencia; las deshabilitadas, en color rojo.' },
    ],
  },
  'fk-manual-servicio': {
    objetivo: 'Usar Servicio FishKen para calibrar el pesaje, habilitar/deshabilitar compuertas (Activo + Guardar Cambios) y correr las pruebas de conexión (Base de Datos, Tarjetas de Relé, Tarjetas de Pesaje).',
    porque: 'una compuerta con celda con problemas contamina la combinatoria; deshabilitarla a tiempo mantiene el rendimiento mientras se resuelve. Las pruebas de conexión aíslan si la falla es de red, relé o pesaje.',
    quiz: [
      { question: 'Una compuerta presenta problemas de pesaje. ¿Qué corresponde mientras se resuelve?', options: ['Seguir usándola', 'Deshabilitarla (Activo desmarcado + Guardar Cambios)', 'Apagar toda la máquina', 'Bajar la velocidad'], correctIndex: 1, explanation: 'Se deshabilita la compuerta con problemas hasta resolverla, desde Ajuste de puertas (casilla Activo + Guardar Cambios).' },
      { question: 'Las pruebas de conexión verifican 3 grupos. ¿Cuáles?', options: ['Agua, aire y luz', 'Base de Datos, Tarjetas de Relé y Tarjetas de Pesaje', 'Motor, cinta y PLC', 'Red, USB y pantalla'], correctIndex: 1, explanation: 'Las pruebas de conexión verifican Base de Datos, Tarjetas de Relé y Tarjetas de Pesaje.' },
    ],
  },
  'fk-manual-web-reportes': {
    objetivo: 'Saber que FishKen Web entrega los reportes de producción (por Especie, Calidad y Calibre) para trazabilidad por turno/orden.',
    porque: 'los reportes son la evidencia de producción; sin ellos no hay trazabilidad ni forma de demostrar el rendimiento por orden de trabajo.',
    quiz: [
      { question: '¿Por cuáles criterios entrega reportes FishKen Web?', options: ['Solo por fecha', 'Por Especie, Calidad y Calibre', 'Por operador', 'Por color'], correctIndex: 1, explanation: 'FishKen Web entrega reportes por Especie, Calidad y Calibre (general y detallado), para trazabilidad por turno/orden.' },
    ],
  },
  'fk-manual-compuertas-celdas': {
    objetivo: 'Entender la combinatoria: cada compuerta pesa en una celda con rango definido, el algoritmo suma las que caen en el objetivo, y el sobrepeso mide cuánto se pasa la caja.',
    porque: 'una celda fuera de rango o sucia degrada la combinatoria y sube el sobrepeso/rechazo; ahí está el mayor apalancamiento de Mantención sobre el rendimiento.',
    quiz: [
      { question: '¿Qué mide el sobrepeso?', options: ['El peso total del turno', 'Cuánto se pasa la caja del peso objetivo (menor = mejor)', 'El número de compuertas', 'La velocidad'], correctIndex: 1, explanation: 'El sobrepeso (y su %) mide cuánto se pasa la caja del peso objetivo; cuanto menor, mejor rendimiento.' },
      { question: 'Una compuerta con celda sucia o fuera de rango, ¿qué efecto tiene?', options: ['Ninguno', 'Degrada la combinatoria y sube el sobrepeso/rechazo', 'Mejora el rendimiento', 'Solo afecta esa caja'], correctIndex: 1, explanation: 'Una celda fuera de rango o sucia degrada la combinatoria y sube el sobrepeso y el rechazo.' },
    ],
  },
}

export function listFishkenManualSections(): ManualSection[] {
  return data.manual
    .slice()
    .sort((a, b) => a.order - b.order)
    .map(s => {
      const d = MANUAL_DIDACTIC[s.id]
      return { id: s.id, title: s.title, order: s.order, content: s.content, objetivo: s.objetivo ?? d?.objetivo, porque: s.porque ?? d?.porque, quiz: s.quiz ?? d?.quiz, ...stamp }
    })
}

export function listFishkenProcedures(): Procedure[] {
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
    createdBy: 'fishken-seed',
    ...stamp,
  }))
}

export function listFishkenFlows(): Flow[] {
  return data.flows.map(f => ({ id: f.id, title: f.title, trigger: f.trigger, actions: f.actions, ...stamp }))
}

export function listFishkenDiagnosis(): DiagnosisEntry[] {
  return data.diagnosis.map(d => ({
    id: d.id,
    title: d.title,
    symptom: d.symptom,
    possibleCauses: d.possibleCauses,
    solution: d.solution,
    ...stamp,
  }))
}

export function getFishkenContentCounts() {
  return {
    manual: data.manual.length,
    procedures: data.procedures.length,
    flows: data.flows.length,
    diagnosis: data.diagnosis.length,
  }
}
