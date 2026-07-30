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

interface RawQuiz { question: string; options: string[]; correctIndex: number; explanation: string }
interface RawManual { id: string; title: string; order: number; content: string; objetivo?: string; porque?: string; quiz?: RawQuiz[] }
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

/** Capa didáctica (objetivo · porqué · autoevaluación) sobre el manual A600 curado. */
const MANUAL_DIDACTIC: Record<string, { objetivo?: string; porque?: string; quiz?: RawQuiz[] }> = {
  'mhg-manual-que-es': {
    objetivo: 'Ubicar el software A600 sobre el controlador M3210 y entender que clasifica y arma lotes por peso a partir de la balanza (Weigher).',
    porque: 'saber que la app corre en el M3210 y debe estar en RUNNING evita el error clásico de buscar la falla en la mecánica cuando en realidad el controlador no está en producción.',
    quiz: [
      { question: '¿Qué debe mostrar la etiqueta de estado del controlador M3210 durante la producción?', options: ['STOPPED', 'RUNNING', 'IDLE', 'ERROR'], correctIndex: 1, explanation: 'Durante la producción, la etiqueta de estado del M3210 debe estar en RUNNING.' },
      { question: '¿A partir de qué crea lotes el A600?', options: ['Del color', 'Del peso de las piezas que pasan por la balanza (Weigher)', 'Del largo', 'Del conteo manual'], correctIndex: 1, explanation: 'El A600 clasifica y crea lotes por peso a partir de las piezas que pasan por la balanza.' },
    ],
  },
  'mhg-manual-arranque-seguridad': {
    objetivo: 'Correr la verificación breve antes de producir —estado RUNNING, vías despejadas, balanza inicializada— para evitar alarmas y paros.',
    porque: 'producir con la balanza sin inicializar o una vía obstruida arranca el turno con alarmas y clasificación mala; unos segundos de chequeo ahorran horas.',
    quiz: [
      { question: 'La balanza (Weigher) no está inicializada. ¿Qué hacés?', options: ['Producir igual', 'Detener toda la producción hasta que se inicialice', 'Bajar la velocidad', 'Ignorar'], correctIndex: 1, explanation: 'Si la balanza no está lista hay que detener toda la producción hasta que se inicialice.' },
    ],
  },
  'mhg-manual-pantallas': {
    objetivo: 'Ubicar cada pantalla del A600 (Production, Reports, Programs, Products, Service…) para llegar rápido a lo que se necesita.',
    porque: 'perder tiempo navegando entre pantallas en plena producción cuesta cajas; tener el mapa de pantallas hace que cada tarea sea directa.',
    quiz: [
      { question: '¿En qué pantalla se configuran los programas de clasificación?', options: ['Production', 'Programs', 'Reports', 'Cleaner'], correctIndex: 1, explanation: 'Los programas se gestionan desde la pantalla Programs; Products asigna productos a ubicaciones.' },
    ],
  },
  'mhg-manual-metodos-clasificacion': {
    objetivo: 'Distinguir los métodos de clasificación del A600 (creación de lotes óptima, por tasa, simple) y cuándo conviene cada uno.',
    porque: 'elegir el método equivocado desperdicia rendimiento o sube el sobrepeso. Ojo dónde se elige: es por PRODUCTO, en la pantalla Products (columna Method), no en la configuración del programa.',
    quiz: [
      { question: '¿Qué método arma los lotes de la forma más eficiente según el objetivo?', options: ['Clasificación simple', 'Creación de lotes óptima (Optimal batching)', 'Por tasa', 'Simple Batching'], correctIndex: 1, explanation: 'La creación de lotes óptima (Optimal batching) arma los lotes de la forma más eficiente según el objetivo.' },
    ],
  },
  'mhg-manual-programas': {
    objetivo: 'Gestionar programas (agregar, copiar, editar, activar) y entender que solo el programa activo controla la clasificación en curso.',
    porque: 'editar el programa equivocado o dejar activo uno viejo clasifica mal todo el turno; copiar y editar es más rápido y seguro que crear de cero.',
    quiz: [
      { question: '¿Cuántos programas controlan la clasificación en curso?', options: ['Todos a la vez', 'Solo el programa activo', 'Ninguno', 'Los dos últimos'], correctIndex: 1, explanation: 'Solo el programa activo controla la clasificación en curso.' },
    ],
  },
  'mhg-manual-productos': {
    objetivo: 'Entender que los productos se asignan a ubicaciones (vías/salidas) para dirigir cada rango a su destino, y revisar esa asignación al cambiar de programa.',
    porque: 'una asignación producto→ubicación desactualizada manda un calibre a la salida equivocada; revisarla al cambiar de programa evita mezclar producto.',
    quiz: [
      { question: 'Al cambiar de programa, ¿qué conviene revisar?', options: ['El idioma', 'La asignación de productos a ubicaciones', 'El reloj', 'Nada'], correctIndex: 1, explanation: 'Al cambiar de programa conviene revisar la asignación de productos a ubicaciones para que cada rango salga por su destino.' },
    ],
  },
  'mhg-manual-alarmas-informes': {
    objetivo: 'Leer el botón Alarm en sus TRES niveles (rojo = atención inmediata; naranja = solucionar lo antes posible; amarillo = no requiere atención inmediata) y usar el Registro de alarmas antes de actuar.',
    porque: 'actuar sin leer el Registro de alarmas es adivinar; el registro trae el tipo de error, su prioridad y la solución, que es justo lo que acorta la parada.',
    quiz: [
      { question: 'Salta una alarma. ¿Qué hacés primero?', options: ['Reiniciar el equipo', 'Leer el Registro de alarmas (tipo, prioridad y solución)', 'Bajar la velocidad', 'Llamar al proveedor'], correctIndex: 1, explanation: 'Ante una alarma se lee siempre el Registro de alarmas antes de actuar: trae el tipo de error, su prioridad y la solución.' },
      { question: 'El botón Alarm está en ROJO. ¿Qué indica?', options: ['Advertencia menor', 'Error grave que requiere atención inmediata', 'Todo normal', 'Falta papel'], correctIndex: 1, explanation: 'Alarma en rojo = nivel más alto, requiere atención inmediata. Son TRES niveles: naranja es nivel medio (solucionar lo antes posible) y amarillo el más bajo (no requiere atención inmediata) — no van juntos.' },
    ],
  },
}

export function listMarelHgManualSections(): ManualSection[] {
  return data.manual
    .slice()
    .sort((a, b) => a.order - b.order)
    .map(s => {
      const d = MANUAL_DIDACTIC[s.id]
      return { id: s.id, title: s.title, order: s.order, content: s.content, objetivo: s.objetivo ?? d?.objetivo, porque: s.porque ?? d?.porque, quiz: s.quiz ?? d?.quiz, ...stamp }
    })
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
