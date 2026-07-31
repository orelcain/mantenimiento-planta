/**
 * learningContent — CRUD de contenido del Centro de Aprendizaje en Firestore
 *
 * Estructura:
 *   learningContent/{machineSlug}/manual/{sectionId}
 *   learningContent/{machineSlug}/procedures/{procedureId}
 *   learningContent/{machineSlug}/flows/{flowId}
 *   learningContent/{machineSlug}/diagnosis/{diagnosisId}
 */
import {
  collection,
  deleteDoc,
  doc,
  getDoc,
  getDocs,
  orderBy,
  query,
  setDoc,
  Timestamp,
} from 'firebase/firestore'
import { deleteObject, getDownloadURL, ref, uploadBytes } from 'firebase/storage'
import { db, storage } from './firebase'
import { getB200Sections, ALL_DEFAULT_SECTIONS, type B200Section } from './baader200Learning'
import {
  GRADER_CONTENT_UPDATED_AT,
  GRADER_LEARNING_SLUG,
  listGraderDiagnosis as graderDiagnosisSeed,
  listGraderFlows as graderFlowsSeed,
  listGraderManualSections as graderManualSeed,
  listGraderProcedures as graderProceduresSeed,
} from './graderLearning'
import {
  B142_CONTENT_UPDATED_AT,
  getB142ContentCounts,
  listB142ManualSections,
  listB142Procedures,
  listB142Flows,
  listB142Diagnosis,
} from './baader142Learning'
import {
  DETECTOR_CONTENT_UPDATED_AT,
  getDetectorContentCounts,
  listDetectorManualSections,
  listDetectorProcedures,
  listDetectorFlows,
  listDetectorDiagnosis,
} from './detectorMetalesLearning'
import {
  MAREL_HG_CONTENT_UPDATED_AT,
  getMarelHgContentCounts,
  listMarelHgManualSections,
  listMarelHgProcedures,
  listMarelHgFlows,
  listMarelHgDiagnosis,
} from './marelHgLearning'
import {
  FISHKEN_CONTENT_UPDATED_AT,
  getFishkenContentCounts,
  listFishkenManualSections,
  listFishkenProcedures,
  listFishkenFlows,
  listFishkenDiagnosis,
} from './fishkenLearning'
import {
  MAREL_FILETE_CONTENT_UPDATED_AT,
  getMarelFileteContentCounts,
  listMarelFileteManualSections,
  listMarelFileteProcedures,
  listMarelFileteFlows,
  listMarelFileteDiagnosis,
} from './marelFileteLearning'
import {
  ENZUNCHADORA_CONTENT_UPDATED_AT,
  getEnzunchadoraContentCounts,
  listEnzunchadoraManualSections,
  listEnzunchadoraProcedures,
  listEnzunchadoraFlows,
  listEnzunchadoraDiagnosis,
} from './enzunchadoraLearning'
import { processImageForUpload, IMAGE_PRESETS } from '@/utils/images/processImage'

// ─────────────────────────────────────────────────────────────
// TIPOS
// ─────────────────────────────────────────────────────────────

export interface ProcedureStep {
  order: number
  title: string
  description: string
  /** URL de imagen o null */
  imageUrl?: string | null
}

export interface Procedure {
  id: string
  title: string
  description?: string
  steps: ProcedureStep[]
  createdAt: number
  updatedAt: number
  createdBy?: string
  /** Ruta de menu del controlador, ej. MENU → Servicio → Cambiar parametros. */
  menuPath?: string[]
  /** Formula de calculo asociada, con el significado de cada variable. */
  formula?: { expression: string; variables: Record<string, string> }
  /** Condiciones verificables que definen que el procedimiento salio bien. */
  successCriteria?: string[]
}

/** Pregunta de autoevaluación al pie de una sección de manual (didáctica). */
export interface SectionQuizItem {
  question: string
  options: string[]
  /** Índice (0-based) de la opción correcta. */
  correctIndex: number
  explanation: string
}

export interface ManualSection {
  id: string
  title: string
  content: string
  order: number
  createdAt: number
  updatedAt: number
  /** Objetivo de aprendizaje: qué sabrá hacer el lector al terminar la sección. */
  objetivo?: string
  /** "El porqué": por qué importa la sección, no solo el qué. */
  porque?: string
  /** Autoevaluación corta (1-3 preguntas) al pie de la sección. */
  quiz?: SectionQuizItem[]
}

/** Punto numerado sobre una foto real de "Componentes del equipo" — toca para ver la nota. */
export interface ComponentHotspotPoint {
  id: string
  /** Posición horizontal, 0-100 (%) sobre la foto completa (sin recorte). */
  x: number
  /** Posición vertical, 0-100 (%) sobre la foto completa (sin recorte). */
  y: number
  label: string
  description: string
}

/** Una foto real con sus puntos, dentro de la pestaña "Componentes del equipo". */
export interface ComponentPhoto {
  id: string
  /** Nombre de archivo dentro de `public/learning-assets/{machineSlug}/`. */
  file: string
  title: string
  /** Ancho/alto real de la foto (evita recorte/letterbox al posicionar los puntos). */
  aspectRatio: number
  order: number
  points: ComponentHotspotPoint[]
  createdAt: number
  updatedAt: number
}

export interface Flow {
  id: string
  title: string
  trigger: string
  actions: string[]
  createdAt: number
  updatedAt: number
}

export interface DiagnosisEntry {
  id: string
  /** Título corto e indicativo del diagnóstico (etiqueta del catálogo). */
  title: string
  /** Descripción detallada del síntoma observado. */
  symptom: string
  possibleCauses: string[]
  solution: string
  createdAt: number
  updatedAt: number
}

/** Pregunta de autoevaluación (pestaña "Examen" en temas de curso). */
export interface QuizQuestion {
  id: string
  question: string
  options: string[]
  /** Índice (0-based) de la opción correcta dentro de `options`. */
  correctIndex: number
  /** Explicación que se muestra al responder. */
  explanation: string
  order: number
  createdAt: number
  updatedAt: number
}

/** Entrada del glosario (pestaña "Glosario" en temas de curso). */
export interface GlossaryEntry {
  id: string
  /** Sigla o término. */
  term: string
  /** Definición breve. */
  definition: string
  /** Nº de lección donde se explica (para el redireccionamiento). Opcional. */
  lesson?: number
  order: number
  createdAt: number
  updatedAt: number
}

/** Referencia bibliográfica (pestaña "Bibliografía" en temas de curso). */
export interface BibliographyEntry {
  id: string
  /** Cita / referencia. */
  label: string
  /** URL de la fuente, si existe. */
  url?: string | null
  order: number
  createdAt: number
  updatedAt: number
}

export type LearningSectionKey = 'manual' | 'procedures' | 'flows' | 'diagnosis' | 'quiz' | 'glossary' | 'bibliografia' | 'components'

// ─────────────────────────────────────────────────────────────
// PATHS HELPERS
// ─────────────────────────────────────────────────────────────

const ROOT = 'learningContent'

function sectionCollection(machineSlug: string, section: LearningSectionKey) {
  return collection(db, ROOT, machineSlug, section)
}

function sectionDoc(machineSlug: string, section: LearningSectionKey, id: string) {
  return doc(db, ROOT, machineSlug, section, id)
}

const B200_LEARNING_SLUG = 'baader-200'
const B200_CONTENT_UPDATED_AT = new Date('2026-05-27T00:00:00-04:00').getTime()
const B142_LEARNING_SLUG = 'baader-142'
const DETECTOR_LEARNING_SLUG = 'detector-metales'
const MAREL_HG_LEARNING_SLUG = 'marel-hg'
const FISHKEN_LEARNING_SLUG = 'fishken'
const MAREL_FILETE_LEARNING_SLUG = 'marel-filete'
const ENZUNCHADORA_LEARNING_SLUG = 'enzunchadora-n2'
type StoredOverride<T> = T & { _deleted?: boolean }

async function listStoredProcedures(machineSlug: string): Promise<StoredOverride<Procedure>[]> {
  const q = query(sectionCollection(machineSlug, 'procedures'), orderBy('updatedAt', 'desc'))
  const snap = await getDocs(q)
  return snap.docs.map(d => {
    const data = d.data() as StoredOverride<Procedure>
    return { ...data, id: d.id }
  })
}

async function listStoredManualSections(machineSlug: string): Promise<StoredOverride<ManualSection>[]> {
  const q = query(sectionCollection(machineSlug, 'manual'), orderBy('order', 'asc'))
  const snap = await getDocs(q)
  return snap.docs.map(d => ({ ...(d.data() as StoredOverride<ManualSection>), id: d.id }))
}

async function listStoredFlows(machineSlug: string): Promise<StoredOverride<Flow>[]> {
  const q = query(sectionCollection(machineSlug, 'flows'), orderBy('updatedAt', 'desc'))
  const snap = await getDocs(q)
  return snap.docs.map(d => ({ ...(d.data() as StoredOverride<Flow>), id: d.id }))
}

async function listStoredDiagnosis(machineSlug: string): Promise<StoredOverride<DiagnosisEntry>[]> {
  const q = query(sectionCollection(machineSlug, 'diagnosis'), orderBy('updatedAt', 'desc'))
  const snap = await getDocs(q)
  return snap.docs.map(d => ({ ...(d.data() as StoredOverride<DiagnosisEntry>), id: d.id }))
}

function mergeSeedOverrides<T extends { id: string; updatedAt: number }>(
  base: T[],
  stored: StoredOverride<T>[],
): T[] {
  const storedById = new Map(stored.map(item => [item.id, item]))
  const merged = base
    .filter(item => storedById.get(item.id)?._deleted !== true)
    .map(item => {
      const override = storedById.get(item.id)
      return override && !override._deleted ? stripDeleted(override) : item
    })
  const extra = stored
    .filter(item => !item._deleted && !base.some(baseItem => baseItem.id === item.id))
    .map(stripDeleted)
  return [...merged, ...extra].sort((a, b) => b.updatedAt - a.updatedAt)
}

function stripDeleted<T extends { _deleted?: boolean }>(item: T): T {
  const clean = { ...item }
  delete clean._deleted
  return clean
}

async function getBaader200SourceSections(): Promise<B200Section[]> {
  try {
    const sections = await getB200Sections()
    return sections.length > 0 ? sections : toB200Sections(ALL_DEFAULT_SECTIONS)
  } catch {
    return toB200Sections(ALL_DEFAULT_SECTIONS)
  }
}

function toB200Sections(sections: Omit<B200Section, 'updatedAt' | 'updatedBy'>[]): B200Section[] {
  return sections.map(section => ({
    ...section,
    updatedAt: new Date(B200_CONTENT_UPDATED_AT),
    updatedBy: 'seed',
  }))
}

function b200MeasurementsText(section: B200Section): string[] {
  if (section.measurements.length === 0) return []
  return [
    'Medidas / tolerancias:',
    ...section.measurements.map(m => {
      const value = [m.value, m.unit].filter(Boolean).join(' ')
      return `- ${m.name}: ${value}${m.note ? ` (${m.note})` : ''}`
    }),
  ]
}

function b200NotesText(section: B200Section): string[] {
  if (section.notes.length === 0) return []
  return ['Notas operativas:', ...section.notes.map(note => `- ${note}`)]
}

function b200ImagesText(section: B200Section): string[] {
  if (section.images.length === 0) return []
  return [
    'Referencias visuales:',
    ...section.images.map(image => `- ${image.caption || 'Imagen'}: ${image.url}`),
  ]
}

function b200ManualContent(section: B200Section): string {
  return [
    section.description,
    ...b200MeasurementsText(section),
    'Puntos clave:',
    ...section.steps.map(step => `- ${step.important ? '[CRITICO] ' : ''}${step.text}`),
    ...b200NotesText(section),
    ...b200ImagesText(section),
  ].filter(Boolean).join('\n\n')
}

function b200DiagnosisSolution(section: B200Section): string {
  return [
    'Ejecutar las verificaciones en orden y corregir el primer ajuste fuera de condicion.',
    ...b200MeasurementsText(section),
    ...b200NotesText(section),
    ...b200ImagesText(section),
  ].filter(Boolean).join('\n\n')
}

/**
 * Capa didáctica (objetivo · el porqué · autoevaluación) de las 14 secciones de
 * ajuste de la Baader 200, keyed por section.id. Grounded en las medidas, pasos y
 * notas de cada B200Section (baader200Learning.ts) — sin inventar tolerancias.
 */
const B200_MANUAL_DIDACTIC: Record<string, { objetivo?: string; porque?: string; quiz?: SectionQuizItem[] }> = {
  'primera-alimentacion': {
    objetivo: 'Ajustar la 1ra alimentación (chapaletas, silleta y resortes) sin roces y con la presión de resorte acorde a la temperatura de la materia prima.',
    porque: 'no ajustar a ciegas la medida del catálogo (32-28 mm): en la práctica suele ser menos, y con materia prima bajo 0 °C hace falta más presión de resorte o el pescado no avanza parejo.',
    quiz: [
      { question: 'La materia prima entra a menos de 0 °C. ¿Qué se ajusta?', options: ['Menos presión al resorte', 'Más presión al resorte', 'Nada', 'Se sube la velocidad'], correctIndex: 1, explanation: 'Con materia prima bajo 0 °C se da más presión al resorte (tuerca Fig 6) para que avance parejo.' },
      { question: '¿La distancia de chapaletas es siempre 32-28 mm como el catálogo?', options: ['Sí, siempre', 'No: en la práctica generalmente es menos', 'Siempre más', 'No importa'], correctIndex: 1, explanation: 'El catálogo indica 32-28 mm, pero en la práctica generalmente es menos; se usa la medida que corresponde a las condiciones reales.' },
    ],
  },
  'segunda-alimentacion': {
    objetivo: 'Ajustar la 2da alimentación (leva, chapaletas, topes) dejando las chapaletas por dentro del filo de los cuchillos dorsales ±0.5 mm, y reajustarlas al montar cuchillos nuevos.',
    porque: 'si no reajustás las chapaletas al cambiar cuchillos, al bajar el mando dorsal los cuchillos rozan con ellas y se dañan; el ±0.5 mm es la diferencia entre corte limpio y rotura.',
    quiz: [
      { question: '¿A qué tolerancia deben quedar las chapaletas respecto del filo de los cuchillos dorsales?', options: ['±5 mm', '±0.5 mm (casi chocando)', '10 mm', 'No importa'], correctIndex: 1, explanation: 'Las chapaletas quedan por dentro del filo de los dorsales a ±0.5 mm; los topes de seguridad, a 0.5 mm de los amortiguadores.' },
      { question: 'Al montar cuchillos nuevos, ¿qué hay que reajustar en la 2da alimentación?', options: ['Nada', 'Las chapaletas (con pernos M10)', 'La leva', 'Solo los resortes'], correctIndex: 1, explanation: 'Con cuchillos nuevos hay que reajustar las chapaletas de la 2da alimentación con pernos M10, o al bajar el mando dorsal rozarían.' },
    ],
  },
  'levantadores-aletas': {
    objetivo: 'Ajustar el 1er (tope 30 mm) y 2do (tope 50 mm) levantador de aletas, dejando la parte inferior delantera del 2do a 5 mm del contradiente.',
    porque: 'el 2do levantador no tiene chapas guías de aleta, por eso baja más; si la distancia al contradiente no es 5 mm, la aleta no pasa bien y arruina el filete.',
    quiz: [
      { question: '¿A qué distancia del contradiente debe quedar la parte inferior delantera del 2do levantador?', options: ['30 mm', '5 mm', '50 mm', '2 mm'], correctIndex: 1, explanation: 'A 5 mm del contradiente al paso de las aletas; si no, se regula con la biela de mando Fig 6.' },
    ],
  },
  'cuchillos-ventrales': {
    objetivo: 'Calibrar los cuchillos ventrales con la cruz patrón: abertura «a» ENTRE ambos cuchillos de 5 mm y referencia de 177.5 mm a la cara interna del cuchillo izquierdo.',
    porque: 'los pernos de fijación pos 1-2 (alineamiento entre cuchillos) SOLO se tocan en la mantención anual; moverlos en un ajuste de turno descalibra el alineamiento fino.',
    quiz: [
      { question: '¿Cuándo se mueven los pernos de fijación pos 1-2 de los cuchillos ventrales?', options: ['Cada turno', 'Solo en la mantención anual', 'Al cambiar de especie', 'Nunca'], correctIndex: 1, explanation: 'Los pernos de fijación pos 1-2 solo se mueven en la mantención anual, para el alineamiento de los cuchillos entre sí.' },
      { question: 'La medida «a» de los cuchillos ventrales, ¿qué es y cuánto vale para salmón?', options: ['La abertura ENTRE ambos cuchillos: 5 mm', 'El avance del cuchillo: 5 mm', 'La abertura entre ambos: 12 mm', 'La referencia al cuchillo izquierdo: 177.5 mm'], correctIndex: 0, explanation: 'La «a» es la distancia ENTRE ambos cuchillos ventrales, que se ajusta con los bujes apretadores pos 8-9 — no es un “avance” (esa palabra vino de una errata del manual de planta). Para salmón son 5 mm; el fabricante da 4 mm para trucha y 7 mm para pescado blanco.' },
    ],
  },
  'guias-flotantes': {
    objetivo: 'Ajustar las guías flotantes (abertura máx. 4.8 mm, 5 mm por debajo de las guías de la 2da alimentación) SIEMPRE después de los cuchillos ventrales y con la silleta en reposo.',
    porque: 'el orden importa: si ajustás las guías flotantes antes que los ventrales quedan descalibradas; y con la silleta fuera de reposo la medida sale falsa.',
    quiz: [
      { question: '¿Cuándo se ajustan las guías flotantes?', options: ['Antes de los cuchillos ventrales', 'Siempre después de los cuchillos ventrales', 'En cualquier orden', 'Solo en mantención anual'], correctIndex: 1, explanation: 'Las guías flotantes se ajustan SIEMPRE después de los cuchillos ventrales, con la silleta en posición de reposo.' },
      { question: '¿Cuál es la abertura máxima de las guías flotantes?', options: ['4.8 mm', '12 mm', '17-18 mm', '5 mm'], correctIndex: 0, explanation: 'La abertura no debe ser más de 4.8 mm; la altura, 5 mm por debajo de las guías de la 2da alimentación.' },
    ],
  },
  'cuchillos-dorsales': {
    objetivo: 'Ajustar la abertura «b» de los cuchillos dorsales con la máquina en reposo, usando la cruz patrón para alinearlos con los ventrales.',
    porque: 'la cruz patrón es lo que garantiza que ventrales y dorsales queden exactamente alineados; sin ella, el corte queda desfasado.',
    quiz: [
      { question: '¿Para qué se coloca la cruz patrón entre los cuchillos?', options: ['Para medir el pescado', 'Para alinear exactamente ventrales y dorsales', 'Para limpiar', 'Para afilar'], correctIndex: 1, explanation: 'La cruz patrón asegura que los cuchillos ventrales y dorsales queden exactamente alineados entre sí.' },
    ],
  },
  'medidas-cuchillos': {
    objetivo: 'Verificar y mantener los 12 mm entre cuchillos ventrales y dorsales, especialmente al cambiar cuchillos nuevos.',
    porque: 'si la distancia no es 12 mm, los cuchillos rozan con las chapaletas de la 2da alimentación; verificarlo al cambiar cuchillos evita romperlos en el arranque.',
    quiz: [
      { question: '¿Cuál es la distancia correcta entre cuchillos ventrales y dorsales?', options: ['5 mm', '12 mm', '20 mm', '0.5 mm'], correctIndex: 1, explanation: '12 mm. Si no es correcta, los cuchillos rozarían con las chapaletas de la 2da alimentación; verificar siempre al cambiar cuchillos.' },
    ],
  },
  'mando-cuchillos-dorsales': {
    objetivo: 'Ajustar el mando de los cuchillos dorsales y seguir la secuencia de diagnóstico si no levantan. OJO con las dos cotas: los 20 mm son una distancia de CONTROL entre ventrales y dorsales (no una carrera de levante) y los 12 mm son entre trinquete y fiador.',
    porque: 'si no levantan, el orden de revisión es primero el trinquete y después el bulón con gollete; saltarse el orden hace perder tiempo.',
    quiz: [
      { question: 'Los cuchillos dorsales no levantan al paso de la silleta. ¿Qué se revisa PRIMERO?', options: ['El bulón con gollete', 'La posición del trinquete', 'Los resortes', 'La leva'], correctIndex: 1, explanation: 'Primero se verifica la posición del trinquete; después, el bulón con gollete del mando dorsales en el carter de las levas. El levante debe ser 20 mm.' },
    ],
  },
  'guias-espinas-superiores': {
    objetivo: 'Ajustar las guías de espinas superiores (2 mm al contradiente, filo escondido 1 mm, 3 mm sobre los dorsales en reposo) con el perno separador suelto durante la regulación.',
    porque: 'si el perno separador no está suelto durante el ajuste, interfiere y la guía queda mal; recién al final se reaprieta a 0.5 mm.',
    quiz: [
      { question: 'Durante la regulación de las guías de espinas superiores, ¿cómo debe estar el perno separador?', options: ['Apretado', 'Suelto (para no interferir)', 'Retirado por completo', 'Da igual'], correctIndex: 1, explanation: 'El perno separador debe estar suelto durante la regulación para no interferir; al final se reaprieta a 0.5 mm de la guía superior.' },
    ],
  },
  'cuchillos-punzones': {
    objetivo: 'Ajustar caída (7 mm antes del fin B), altura mínima (1 mm) y altura de trabajo (punta-cuchilla 3-4 mm, separación 8 mm) de los punzones, entendiendo qué pasa si quedan altos o bajos.',
    porque: 'punzones muy altos hacen «gay ping» en el filete a lo largo del espinazo; muy bajos cortan la espina del flanco y dejan sin función a los rascadores. La altura decide la calidad del filete.',
    quiz: [
      { question: 'Los cuchillos punzones quedaron más bajos de lo normal. ¿Qué pasa?', options: ['Nada', 'Cortan la espina del flanco y los rascadores no cumplen función', 'Mejora el filete', 'Se traba la silleta'], correctIndex: 1, explanation: 'Punzones muy bajos cortan la espina del flanco y dejan sin función a los cuchillos rascadores; muy altos hacen «gay ping» a lo largo del espinazo.' },
      { question: '¿Cuál es la distancia de altura de trabajo entre la punta del diente y la cuchilla?', options: ['1 mm', '3-4 mm', '8 mm', '7 mm'], correctIndex: 1, explanation: 'Al pasar la silleta, la distancia punta del diente–cuchilla debe ser 3-4 mm; la separación entre cuchillos, 8 mm.' },
    ],
  },
  'cuchillos-rascadores-ajuste': {
    objetivo: 'Ajustar los cuchillos rascadores únicamente con la silleta en la posición 1350 mm, donde quedan bajo la guía inferior de espinas.',
    porque: 'el ajuste SOLO se puede hacer en 1350 mm; intentarlo en otra posición no llega a los topes de los rodillos y el ajuste sale mal.',
    quiz: [
      { question: '¿En qué posición de silleta se ajustan los cuchillos rascadores?', options: ['En reposo', 'En 1350 mm aprox.', 'En 177.5 mm', 'En cualquiera'], correctIndex: 1, explanation: 'El ajuste de los rascadores SOLO se puede realizar con la silleta en 1350 mm aprox., donde quedan bajo la guía inferior de espinas.' },
    ],
  },
  'cuchillos-rascadores-altura': {
    objetivo: 'Ajustar la altura de trabajo (3 mm sobre la base del diente) y la abertura (17-18 mm) de los cuchillos rascadores en posición de trabajo.',
    porque: 'la abertura de 17-18 mm se toma como referencia de las guías superiores de espinas; fuera de ese rango, el rascador no limpia bien la espina.',
    quiz: [
      { question: '¿Cuál es la abertura correcta de los cuchillos rascadores?', options: ['4.8 mm', '8 mm', '17-18 mm', '3 mm'], correctIndex: 2, explanation: 'La abertura debe ser 17-18 mm, ajustada en posición de trabajo; la altura de trabajo, 3 mm sobre la base del diente.' },
    ],
  },
  'cuchillos-cola-contrabancadas': {
    objetivo: 'Ajustar los cuchillos circulares de corte de cola para que entren en el hueco de la contrabancada (0.5 mm a los soportes) sin rozar la guía de espinas inferiores.',
    porque: 'si el rodillo de la biela pos 11 toca el tope de seguridad pos 12, hay que regular primero con la biela pos 5 y no forzar el perno tope; el orden evita romper el mecanismo.',
    quiz: [
      { question: 'El rodillo de la biela pos 11 toca el tope de seguridad pos 12. ¿Qué se regula primero?', options: ['El perno tope pos 1', 'La biela pos 5', 'Nada', 'La contrabancada'], correctIndex: 1, explanation: 'Si el rodillo pos 11 toca el tope pos 12, se regula con la biela pos 5. Los cuchillos deben quedar a 0.5 mm de los soportes pos 3.' },
    ],
  },
  'embrague': {
    objetivo: 'Reajustar el embrague girando el eje 180° para pasar al otro canal chavetero, solo cuando NO hay causal justificada de bloqueo.',
    porque: 'antes de reajustar hay que descartar un objeto interpuesto (pescado); reajustar con un bloqueo real por objeto oculta el problema y puede dañar la máquina.',
    quiz: [
      { question: 'Antes de reajustar el embrague, ¿qué hay que verificar?', options: ['La presión de aire', 'Que no haya un objeto (pescado) interpuesto al accionamiento', 'El nivel de aceite', 'La velocidad'], correctIndex: 1, explanation: 'El reajuste se hace solo cuando no hay causal justificada de bloqueo; primero se verifica que no haya un objeto interpuesto.' },
      { question: '¿Cuánto se gira el eje para que aparezca el otro canal chavetero?', options: ['90°', '180° (media vuelta)', '360°', '45°'], correctIndex: 1, explanation: 'Se gira el volante en sentido horario y el eje 180° (media vuelta) para que aparezca el otro canal chavetero; luego se recoloca el prisionero.' },
    ],
  },
}

async function listB200ManualSections(): Promise<ManualSection[]> {
  const sections = await getBaader200SourceSections()
  const base = sections
    .filter(section => section.type === 'ajuste')
    .map(section => {
      const d = B200_MANUAL_DIDACTIC[section.id]
      return {
        id: `b200-manual-${section.id}`,
        title: section.title,
        content: b200ManualContent(section),
        order: section.order,
        createdAt: B200_CONTENT_UPDATED_AT,
        updatedAt: section.updatedAt.getTime(),
        objetivo: d?.objetivo,
        porque: d?.porque,
        quiz: d?.quiz,
      }
    })
  const stored = await listStoredManualSections(B200_LEARNING_SLUG)
  return mergeSeedOverrides(base, stored).sort((a, b) => a.order - b.order)
}

async function listB200Procedures(): Promise<Procedure[]> {
  const sections = await getBaader200SourceSections()
  const base: Procedure[] = sections
    .filter(section => section.type === 'seguridad' || section.type === 'precaucion')
    .map(section => ({
      id: `b200-procedure-${section.id}`,
      title: section.title,
      description: [
        section.description,
        ...b200MeasurementsText(section),
        ...b200NotesText(section),
      ].filter(Boolean).join('\n\n'),
      steps: section.steps.map((step, index) => ({
        order: index + 1,
        title: step.important ? 'Paso critico' : `Paso ${index + 1}`,
        description: step.text,
        imageUrl: index === 0 ? section.images[0]?.url ?? null : null,
      })),
      createdAt: B200_CONTENT_UPDATED_AT,
      updatedAt: section.updatedAt.getTime(),
      createdBy: 'baader200-adapter',
    }))
  const stored = await listStoredProcedures(B200_LEARNING_SLUG)
  return mergeSeedOverrides(base, stored)
}

async function listB200Flows(): Promise<Flow[]> {
  const sections = await getBaader200SourceSections()
  const base = sections
    .filter(section => section.type === 'troubleshooting')
    .map(section => ({
      id: `b200-flow-${section.id}`,
      title: `Resolver: ${section.title}`,
      trigger: section.description,
      actions: [
        ...section.steps.map(step => step.text),
        'Aplicar correccion, producir muestra y validar el filete antes de liberar la condicion.',
      ],
      createdAt: B200_CONTENT_UPDATED_AT,
      updatedAt: section.updatedAt.getTime(),
    }))
  const stored = await listStoredFlows(B200_LEARNING_SLUG)
  return mergeSeedOverrides(base, stored)
}

async function listB200Diagnosis(): Promise<DiagnosisEntry[]> {
  const sections = await getBaader200SourceSections()
  const base = sections
    .filter(section => section.type === 'troubleshooting')
    .map(section => ({
      id: `b200-diagnosis-${section.id}`,
      title: section.title,
      symptom: section.description,
      possibleCauses: section.steps.map(step => step.text),
      solution: b200DiagnosisSolution(section),
      createdAt: B200_CONTENT_UPDATED_AT,
      updatedAt: section.updatedAt.getTime(),
    }))
  const stored = await listStoredDiagnosis(B200_LEARNING_SLUG)
  return mergeSeedOverrides(base, stored)
}

async function getB200ContentCounts(): Promise<MachineContentCounts> {
  const [manual, procedures, flows, diagnosis] = await Promise.all([
    listB200ManualSections(),
    listB200Procedures(),
    listB200Flows(),
    listB200Diagnosis(),
  ])
  return {
    manual: manual.length,
    procedures: procedures.length,
    flows: flows.length,
    diagnosis: diagnosis.length,
  }
}

// ─────────────────────────────────────────────────────────────
// GRADER — el catalogo de runbooks Z2 traducido al formato del expediente.
// La fuente vive en services/grader/graderRunbooks.ts (sus `triggers` alimentan
// el plan de accion del Analisis de Turno); aqui solo se adapta y se le aplican
// los overrides que un admin haya guardado en Firestore.
// ─────────────────────────────────────────────────────────────

async function listGraderManualSections(): Promise<ManualSection[]> {
  const stored = await listStoredManualSections(GRADER_LEARNING_SLUG)
  return mergeSeedOverrides(graderManualSeed(), stored).sort((a, b) => a.order - b.order)
}

async function listGraderProcedures(): Promise<Procedure[]> {
  const stored = await listStoredProcedures(GRADER_LEARNING_SLUG)
  return mergeSeedOverrides(graderProceduresSeed(), stored)
}

async function listGraderFlows(): Promise<Flow[]> {
  const stored = await listStoredFlows(GRADER_LEARNING_SLUG)
  return mergeSeedOverrides(graderFlowsSeed(), stored)
}

async function listGraderDiagnosis(): Promise<DiagnosisEntry[]> {
  const stored = await listStoredDiagnosis(GRADER_LEARNING_SLUG)
  return mergeSeedOverrides(graderDiagnosisSeed(), stored)
}

async function getGraderContentCounts(): Promise<MachineContentCounts> {
  const [manual, procedures, flows, diagnosis] = await Promise.all([
    listGraderManualSections(),
    listGraderProcedures(),
    listGraderFlows(),
    listGraderDiagnosis(),
  ])
  return {
    manual: manual.length,
    procedures: procedures.length,
    flows: flows.length,
    diagnosis: diagnosis.length,
  }
}

// ─────────────────────────────────────────────────────────────
// PROCEDURES
// ─────────────────────────────────────────────────────────────

export async function listProcedures(machineSlug: string): Promise<Procedure[]> {
  if (machineSlug === B200_LEARNING_SLUG) return listB200Procedures()
  if (machineSlug === B142_LEARNING_SLUG) return listB142Procedures()
  if (machineSlug === DETECTOR_LEARNING_SLUG) return listDetectorProcedures()
  if (machineSlug === MAREL_HG_LEARNING_SLUG) return listMarelHgProcedures()
  if (machineSlug === FISHKEN_LEARNING_SLUG) return listFishkenProcedures()
  if (machineSlug === MAREL_FILETE_LEARNING_SLUG) return listMarelFileteProcedures()
  if (machineSlug === ENZUNCHADORA_LEARNING_SLUG) return listEnzunchadoraProcedures()
  if (machineSlug === GRADER_LEARNING_SLUG) return listGraderProcedures()

  return listStoredProcedures(machineSlug)
    .then(list => list.filter(item => !item._deleted).map(stripDeleted))
}

export async function getProcedure(machineSlug: string, id: string): Promise<Procedure | null> {
  const snap = await getDoc(sectionDoc(machineSlug, 'procedures', id))
  if (!snap.exists()) return null
  return { ...(snap.data() as Procedure), id: snap.id }
}

export async function saveProcedure(
  machineSlug: string,
  procedure: Omit<Procedure, 'createdAt' | 'updatedAt'> & { createdAt?: number }
): Promise<void> {
  const now = Date.now()
  const ref = sectionDoc(machineSlug, 'procedures', procedure.id)
  await setDoc(
    ref,
    {
      ...procedure,
      createdAt: procedure.createdAt || now,
      updatedAt: now,
      _ts: Timestamp.now(),
    },
    { merge: false }
  )
}

export async function deleteProcedure(machineSlug: string, id: string): Promise<void> {
  if (machineSlug === GRADER_LEARNING_SLUG && id.startsWith('grader-procedure-')) {
    await setDoc(sectionDoc(machineSlug, 'procedures', id), { _deleted: true, updatedAt: Date.now() }, { merge: true })
    return
  }
  if (machineSlug === B200_LEARNING_SLUG && id.startsWith('b200-procedure-')) {
    await setDoc(sectionDoc(machineSlug, 'procedures', id), { _deleted: true, updatedAt: Date.now() }, { merge: true })
    return
  }
  await deleteDoc(sectionDoc(machineSlug, 'procedures', id))
}

// ─────────────────────────────────────────────────────────────
// MANUAL SECTIONS
// ─────────────────────────────────────────────────────────────

/**
 * Aplica los overrides de Firestore sobre un seed sincrónico de secciones de
 * manual. Necesario para que las máquinas que leen su seed de un JSON (Detector,
 * Baader 142, Marel HG/Filete, Fishken) sean editables desde el admin: sin esto,
 * el admin guardaría en Firestore pero el seed nunca leería ese override.
 */
async function withManualOverrides(slug: string, base: ManualSection[]): Promise<ManualSection[]> {
  const stored = await listStoredManualSections(slug)
  return mergeSeedOverrides(base, stored).sort((a, b) => a.order - b.order)
}

export async function listManualSections(machineSlug: string): Promise<ManualSection[]> {
  if (machineSlug === B200_LEARNING_SLUG) return listB200ManualSections()
  if (machineSlug === B142_LEARNING_SLUG) return withManualOverrides(B142_LEARNING_SLUG, listB142ManualSections())
  if (machineSlug === DETECTOR_LEARNING_SLUG) return withManualOverrides(DETECTOR_LEARNING_SLUG, listDetectorManualSections())
  if (machineSlug === MAREL_HG_LEARNING_SLUG) return withManualOverrides(MAREL_HG_LEARNING_SLUG, listMarelHgManualSections())
  if (machineSlug === FISHKEN_LEARNING_SLUG) return withManualOverrides(FISHKEN_LEARNING_SLUG, listFishkenManualSections())
  if (machineSlug === MAREL_FILETE_LEARNING_SLUG) return withManualOverrides(MAREL_FILETE_LEARNING_SLUG, listMarelFileteManualSections())
  if (machineSlug === ENZUNCHADORA_LEARNING_SLUG) return withManualOverrides(ENZUNCHADORA_LEARNING_SLUG, listEnzunchadoraManualSections())
  if (machineSlug === GRADER_LEARNING_SLUG) return listGraderManualSections()

  return listStoredManualSections(machineSlug)
    .then(list => list.filter(item => !item._deleted).map(stripDeleted))
}

export async function saveManualSection(
  machineSlug: string,
  section: Omit<ManualSection, 'createdAt' | 'updatedAt'> & { createdAt?: number }
): Promise<void> {
  const now = Date.now()
  await setDoc(sectionDoc(machineSlug, 'manual', section.id), {
    ...section,
    createdAt: section.createdAt || now,
    updatedAt: now,
  })
}

/** Prefijo del id de las secciones de manual que vienen de un seed (no de Firestore).
 *  Borrar una de estas = soft-delete (marca `_deleted`), para que el seed no la
 *  reponga; las secciones creadas desde admin (`sec_*`) se borran de verdad. */
const SEED_MANUAL_PREFIX: Record<string, string> = {
  [GRADER_LEARNING_SLUG]: 'grader-manual-',
  [B200_LEARNING_SLUG]: 'b200-manual-',
  [DETECTOR_LEARNING_SLUG]: 'det-manual-',
  [B142_LEARNING_SLUG]: 'b142-manual-',
  [MAREL_HG_LEARNING_SLUG]: 'mhg-manual-',
  [MAREL_FILETE_LEARNING_SLUG]: 'mf-manual-',
  [FISHKEN_LEARNING_SLUG]: 'fk-manual-',
  [ENZUNCHADORA_LEARNING_SLUG]: 'tp6-manual-',
}

export async function deleteManualSection(machineSlug: string, id: string): Promise<void> {
  const seedPrefix = SEED_MANUAL_PREFIX[machineSlug]
  if (seedPrefix && id.startsWith(seedPrefix)) {
    await setDoc(sectionDoc(machineSlug, 'manual', id), { _deleted: true, updatedAt: Date.now() }, { merge: true })
    return
  }
  await deleteDoc(sectionDoc(machineSlug, 'manual', id))
}

// ─────────────────────────────────────────────────────────────
// COMPONENTES DEL EQUIPO (fotos reales + hotspots)
// ─────────────────────────────────────────────────────────────

export async function listComponentPhotos(machineSlug: string): Promise<ComponentPhoto[]> {
  const q = query(sectionCollection(machineSlug, 'components'), orderBy('order', 'asc'))
  const snap = await getDocs(q)
  return snap.docs.map(d => ({ ...(d.data() as ComponentPhoto), id: d.id }))
}

export async function saveComponentPhoto(
  machineSlug: string,
  photo: Omit<ComponentPhoto, 'createdAt' | 'updatedAt'> & { createdAt?: number }
): Promise<void> {
  const now = Date.now()
  await setDoc(sectionDoc(machineSlug, 'components', photo.id), {
    ...photo,
    createdAt: photo.createdAt || now,
    updatedAt: now,
  })
}

export async function deleteComponentPhoto(machineSlug: string, id: string): Promise<void> {
  await deleteDoc(sectionDoc(machineSlug, 'components', id))
}

// ─────────────────────────────────────────────────────────────
// FLOWS
// ─────────────────────────────────────────────────────────────

export async function listFlows(machineSlug: string): Promise<Flow[]> {
  if (machineSlug === B200_LEARNING_SLUG) return listB200Flows()
  if (machineSlug === B142_LEARNING_SLUG) return listB142Flows()
  if (machineSlug === DETECTOR_LEARNING_SLUG) return listDetectorFlows()
  if (machineSlug === MAREL_HG_LEARNING_SLUG) return listMarelHgFlows()
  if (machineSlug === FISHKEN_LEARNING_SLUG) return listFishkenFlows()
  if (machineSlug === MAREL_FILETE_LEARNING_SLUG) return listMarelFileteFlows()
  if (machineSlug === ENZUNCHADORA_LEARNING_SLUG) return listEnzunchadoraFlows()
  if (machineSlug === GRADER_LEARNING_SLUG) return listGraderFlows()

  return listStoredFlows(machineSlug)
    .then(list => list.filter(item => !item._deleted).map(stripDeleted))
}

export async function saveFlow(
  machineSlug: string,
  flow: Omit<Flow, 'createdAt' | 'updatedAt'> & { createdAt?: number }
): Promise<void> {
  const now = Date.now()
  await setDoc(sectionDoc(machineSlug, 'flows', flow.id), {
    ...flow,
    createdAt: flow.createdAt || now,
    updatedAt: now,
  })
}

export async function deleteFlow(machineSlug: string, id: string): Promise<void> {
  if (machineSlug === GRADER_LEARNING_SLUG && id.startsWith('grader-flow-')) {
    await setDoc(sectionDoc(machineSlug, 'flows', id), { _deleted: true, updatedAt: Date.now() }, { merge: true })
    return
  }
  if (machineSlug === B200_LEARNING_SLUG && id.startsWith('b200-flow-')) {
    await setDoc(sectionDoc(machineSlug, 'flows', id), { _deleted: true, updatedAt: Date.now() }, { merge: true })
    return
  }
  await deleteDoc(sectionDoc(machineSlug, 'flows', id))
}

// ─────────────────────────────────────────────────────────────
// DIAGNOSIS
// ─────────────────────────────────────────────────────────────

export async function listDiagnosis(machineSlug: string): Promise<DiagnosisEntry[]> {
  if (machineSlug === B200_LEARNING_SLUG) return listB200Diagnosis()
  if (machineSlug === B142_LEARNING_SLUG) return listB142Diagnosis()
  if (machineSlug === DETECTOR_LEARNING_SLUG) return listDetectorDiagnosis()
  if (machineSlug === MAREL_HG_LEARNING_SLUG) return listMarelHgDiagnosis()
  if (machineSlug === FISHKEN_LEARNING_SLUG) return listFishkenDiagnosis()
  if (machineSlug === MAREL_FILETE_LEARNING_SLUG) return listMarelFileteDiagnosis()
  if (machineSlug === ENZUNCHADORA_LEARNING_SLUG) return listEnzunchadoraDiagnosis()
  if (machineSlug === GRADER_LEARNING_SLUG) return listGraderDiagnosis()

  return listStoredDiagnosis(machineSlug)
    .then(list => list.filter(item => !item._deleted).map(stripDeleted))
}

export async function saveDiagnosis(
  machineSlug: string,
  entry: Omit<DiagnosisEntry, 'createdAt' | 'updatedAt'> & { createdAt?: number }
): Promise<void> {
  const now = Date.now()
  await setDoc(sectionDoc(machineSlug, 'diagnosis', entry.id), {
    ...entry,
    createdAt: entry.createdAt || now,
    updatedAt: now,
  })
}

export async function deleteDiagnosis(machineSlug: string, id: string): Promise<void> {
  if (machineSlug === GRADER_LEARNING_SLUG && id.startsWith('grader-diagnosis-')) {
    await setDoc(sectionDoc(machineSlug, 'diagnosis', id), { _deleted: true, updatedAt: Date.now() }, { merge: true })
    return
  }
  if (machineSlug === B200_LEARNING_SLUG && id.startsWith('b200-diagnosis-')) {
    await setDoc(sectionDoc(machineSlug, 'diagnosis', id), { _deleted: true, updatedAt: Date.now() }, { merge: true })
    return
  }
  await deleteDoc(sectionDoc(machineSlug, 'diagnosis', id))
}

// ─────────────────────────────────────────────────────────────
// QUIZ (pestaña "Examen" de los temas de curso)
// ─────────────────────────────────────────────────────────────

export async function listQuiz(machineSlug: string): Promise<QuizQuestion[]> {
  const q = query(sectionCollection(machineSlug, 'quiz'), orderBy('order', 'asc'))
  const snap = await getDocs(q)
  return snap.docs.map(d => ({ ...(d.data() as QuizQuestion), id: d.id }))
}

export async function saveQuiz(
  machineSlug: string,
  question: Omit<QuizQuestion, 'createdAt' | 'updatedAt'> & { createdAt?: number }
): Promise<void> {
  const now = Date.now()
  await setDoc(sectionDoc(machineSlug, 'quiz', question.id), {
    ...question,
    createdAt: question.createdAt || now,
    updatedAt: now,
  })
}

export async function deleteQuiz(machineSlug: string, id: string): Promise<void> {
  await deleteDoc(sectionDoc(machineSlug, 'quiz', id))
}

// ─────────────────────────────────────────────────────────────
// GLOSARIO (pestaña "Glosario" de los temas de curso)
// ─────────────────────────────────────────────────────────────

export async function listGlossary(machineSlug: string): Promise<GlossaryEntry[]> {
  const q = query(sectionCollection(machineSlug, 'glossary'), orderBy('order', 'asc'))
  const snap = await getDocs(q)
  return snap.docs.map(d => ({ ...(d.data() as GlossaryEntry), id: d.id }))
}

// ─────────────────────────────────────────────────────────────
// BIBLIOGRAFIA (pestaña "Bibliografía" de los temas de curso)
// ─────────────────────────────────────────────────────────────

export async function listBibliografia(machineSlug: string): Promise<BibliographyEntry[]> {
  const q = query(sectionCollection(machineSlug, 'bibliografia'), orderBy('order', 'asc'))
  const snap = await getDocs(q)
  return snap.docs.map(d => ({ ...(d.data() as BibliographyEntry), id: d.id }))
}

// ─────────────────────────────────────────────────────────────
// RESUMEN / COUNTS (para el hub)
// ─────────────────────────────────────────────────────────────

export interface MachineContentCounts {
  manual: number
  procedures: number
  flows: number
  diagnosis: number
  /** Solo aplica a temas de curso (pestana Examen). */
  quiz?: number
}

/** Obtiene conteo de items por seccion para una maquina */
export async function getMachineContentCounts(
  machineSlug: string
): Promise<MachineContentCounts> {
  if (machineSlug === B200_LEARNING_SLUG) return getB200ContentCounts()
  if (machineSlug === B142_LEARNING_SLUG) return getB142ContentCounts()
  if (machineSlug === DETECTOR_LEARNING_SLUG) return getDetectorContentCounts()
  if (machineSlug === MAREL_HG_LEARNING_SLUG) return getMarelHgContentCounts()
  if (machineSlug === FISHKEN_LEARNING_SLUG) return getFishkenContentCounts()
  if (machineSlug === MAREL_FILETE_LEARNING_SLUG) return getMarelFileteContentCounts()
  if (machineSlug === ENZUNCHADORA_LEARNING_SLUG) return getEnzunchadoraContentCounts()
  if (machineSlug === GRADER_LEARNING_SLUG) return getGraderContentCounts()

  const [manual, procedures, flows, diagnosis, quiz] = await Promise.all([
    getDocs(sectionCollection(machineSlug, 'manual')),
    getDocs(sectionCollection(machineSlug, 'procedures')),
    getDocs(sectionCollection(machineSlug, 'flows')),
    getDocs(sectionCollection(machineSlug, 'diagnosis')),
    getDocs(sectionCollection(machineSlug, 'quiz')),
  ])
  return {
    manual: manual.size,
    procedures: procedures.size,
    flows: flows.size,
    diagnosis: diagnosis.size,
    quiz: quiz.size,
  }
}

export interface MachineContentMeta extends MachineContentCounts {
  /** updatedAt (ms) más reciente entre las 4 secciones, o null si no hay contenido */
  lastUpdatedAt: number | null
}

/** Como getMachineContentCounts, pero además devuelve el updatedAt más reciente
 *  (para el badge "Nuevo"). Reusa los mismos getDocs (sin lecturas extra). */
export async function getMachineContentMeta(
  machineSlug: string
): Promise<MachineContentMeta> {
  if (machineSlug === B200_LEARNING_SLUG) {
    const counts = await getB200ContentCounts()
    return { ...counts, lastUpdatedAt: B200_CONTENT_UPDATED_AT }
  }
  if (machineSlug === B142_LEARNING_SLUG) {
    return { ...getB142ContentCounts(), lastUpdatedAt: B142_CONTENT_UPDATED_AT }
  }
  if (machineSlug === DETECTOR_LEARNING_SLUG) {
    return { ...getDetectorContentCounts(), lastUpdatedAt: DETECTOR_CONTENT_UPDATED_AT }
  }
  if (machineSlug === MAREL_HG_LEARNING_SLUG) {
    return { ...getMarelHgContentCounts(), lastUpdatedAt: MAREL_HG_CONTENT_UPDATED_AT }
  }
  if (machineSlug === FISHKEN_LEARNING_SLUG) {
    return { ...getFishkenContentCounts(), lastUpdatedAt: FISHKEN_CONTENT_UPDATED_AT }
  }
  if (machineSlug === MAREL_FILETE_LEARNING_SLUG) {
    return { ...getMarelFileteContentCounts(), lastUpdatedAt: MAREL_FILETE_CONTENT_UPDATED_AT }
  }
  if (machineSlug === ENZUNCHADORA_LEARNING_SLUG) {
    return { ...getEnzunchadoraContentCounts(), lastUpdatedAt: ENZUNCHADORA_CONTENT_UPDATED_AT }
  }
  if (machineSlug === GRADER_LEARNING_SLUG) {
    const counts = await getGraderContentCounts()
    return { ...counts, lastUpdatedAt: GRADER_CONTENT_UPDATED_AT }
  }

  const [manual, procedures, flows, diagnosis, quiz] = await Promise.all([
    getDocs(sectionCollection(machineSlug, 'manual')),
    getDocs(sectionCollection(machineSlug, 'procedures')),
    getDocs(sectionCollection(machineSlug, 'flows')),
    getDocs(sectionCollection(machineSlug, 'diagnosis')),
    getDocs(sectionCollection(machineSlug, 'quiz')),
  ])
  let lastUpdatedAt: number | null = null
  for (const snap of [manual, procedures, flows, diagnosis, quiz]) {
    for (const d of snap.docs) {
      const u = (d.data() as { updatedAt?: number }).updatedAt
      if (typeof u === 'number' && (lastUpdatedAt === null || u > lastUpdatedAt)) lastUpdatedAt = u
    }
  }
  return {
    manual: manual.size,
    procedures: procedures.size,
    flows: flows.size,
    diagnosis: diagnosis.size,
    quiz: quiz.size,
    lastUpdatedAt,
  }
}

export interface SymptomHit {
  machineSlug: string
  diagnosisId: string
  title: string
  symptom: string
}

/** Carga los síntomas de diagnóstico de las máquinas indicadas (para búsqueda
 *  por síntoma en el hub). Solo lee la sección diagnosis de cada slug. */
export async function getSymptomsForMachines(machineSlugs: string[]): Promise<SymptomHit[]> {
  const results = await Promise.all(
    machineSlugs.map(async slug => {
      try {
        // Reusa el dispatch de listDiagnosis (seeds B200/B142/Detector/Grader +
        // fallback Firestore) para que TODA máquina con diagnóstico entre al
        // buscador por síntoma, no solo las cableadas a mano aquí.
        const diagnosis = await listDiagnosis(slug)
        return diagnosis.map(entry => ({
          machineSlug: slug,
          diagnosisId: entry.id,
          title: entry.title,
          symptom: entry.symptom,
        }))
      } catch {
        return [] as SymptomHit[]
      }
    })
  )
  return results.flat().filter(h => h.title.trim().length > 0 || h.symptom.trim().length > 0)
}

/** Genera un ID unico basado en timestamp + random */
export function generateContentId(prefix = ''): string {
  return `${prefix}${Date.now()}_${Math.random().toString(36).slice(2, 9)}`
}

// ─────────────────────────────────────────────────────────────
// UPLOAD DE IMAGENES (Storage)
// ─────────────────────────────────────────────────────────────

/**
 * Sube una imagen a Firebase Storage comprimida como WebP y devuelve la URL publica.
 * Path: learningContent/{machineSlug}/{section}/{entityId}/{imageId}.webp
 */
export async function uploadLearningImage(
  machineSlug: string,
  section: LearningSectionKey,
  entityId: string,
  file: File
): Promise<string> {
  const { file: compressed } = await processImageForUpload(file, IMAGE_PRESETS.photo)
  const imageId = `${Date.now()}_${Math.random().toString(36).slice(2, 9)}`
  const ext = compressed.type.includes('webp') ? 'webp' : 'jpg'
  const path = `learningContent/${machineSlug}/${section}/${entityId}/${imageId}.${ext}`
  const storageRef = ref(storage, path)
  await uploadBytes(storageRef, compressed, {
    contentType: compressed.type || 'image/webp',
  })
  return getDownloadURL(storageRef)
}

/** Elimina una imagen previamente subida (ignora errores si ya no existe) */
export async function deleteLearningImage(url: string): Promise<void> {
  try {
    const storageRef = ref(storage, url)
    await deleteObject(storageRef)
  } catch {
    // Si la URL no es parseable o el objeto ya no existe, ignorar
  }
}
