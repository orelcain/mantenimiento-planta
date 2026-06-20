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
}

export interface ManualSection {
  id: string
  title: string
  content: string
  order: number
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

export type LearningSectionKey = 'manual' | 'procedures' | 'flows' | 'diagnosis' | 'quiz'

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
const B142_CONTENT_UPDATED_AT = new Date('2026-05-28T00:00:00-04:00').getTime()
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

function mergeB200Overrides<T extends { id: string; updatedAt: number }>(
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

async function listB200ManualSections(): Promise<ManualSection[]> {
  const sections = await getBaader200SourceSections()
  const base = sections
    .filter(section => section.type === 'ajuste')
    .map(section => ({
      id: `b200-manual-${section.id}`,
      title: section.title,
      content: b200ManualContent(section),
      order: section.order,
      createdAt: B200_CONTENT_UPDATED_AT,
      updatedAt: section.updatedAt.getTime(),
    }))
  const stored = await listStoredManualSections(B200_LEARNING_SLUG)
  return mergeB200Overrides(base, stored).sort((a, b) => a.order - b.order)
}

async function listB200Procedures(): Promise<Procedure[]> {
  const sections = await getBaader200SourceSections()
  const base = sections
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
  return mergeB200Overrides(base, stored)
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
  return mergeB200Overrides(base, stored)
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
  return mergeB200Overrides(base, stored)
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

function listB142ManualSections(): ManualSection[] {
  return [
    {
      id: 'b142-manual-generalidades-datos-tecnicos',
      title: 'Generalidades y datos tecnicos',
      order: 1,
      createdAt: B142_CONTENT_UPDATED_AT,
      updatedAt: B142_CONTENT_UPDATED_AT,
      content: [
        'La BAADER 142 esta concebida para eviscerar salmones y truchas marinas frescos y enteros, con cabeza, antes de rigidez cadaverica. El manual indica corte princesa y extraccion de visceras mediante instalacion de vacio.',
        'Medidas / tolerancias:',
        '- Rango de pescado: 2 - 7 kg, no eviscerado, con cabeza',
        '- Rendimiento de referencia: 1 - 16 pescados/min',
        '- Consumo de energia: 4 kW',
        '- Agua: 10 litros/min, presion minima 2 bar, toma 3/4 pulg',
        '- Aire comprimido: 125 litros/min, presion minima 6 bar, presion de servicio 4 bar, toma 3/8 pulg',
        '- Vacio: 15 m3/min, presion negativa minima 0,4 bar, toma DN 80/DN 100',
        '- Dimensiones con caja de almacenamiento y cinta posterior: 7420 x 1932 x 2365 mm',
        '- Peso BAADER 142: 1700 kg; cinta de limpieza posterior: 270 kg',
        '- Nivel de ruido en puesto de trabajo: 80 dB(A), usar proteccion auditiva',
        'Puntos clave:',
        '- No procesar peces en rigor mortis ni congelados.',
        '- Debe existir aleta anal para el proceso indicado por el manual.',
        '- El equipo usa control compacto A3C para movimientos de herramientas con motores paso a paso.',
        '- Los valores de rendimiento pueden variar por proporcion, calidad, temporada, caladero y frescura del pescado.',
        'Notas operativas:',
        '- Fuente base: Manual de instrucciones BAADER 142, archivo local 142-Manual de Instrucciones-2005-12-E (1).pdf.',
        '- Validar cualquier ajuste contra manual oficial, supervisor o experiencia documentada de planta antes de intervenir.',
      ].join('\n\n'),
    },
    {
      id: 'b142-manual-repuestos-comunes',
      title: 'Repuestos comunes',
      order: 2,
      createdAt: B142_CONTENT_UPDATED_AT,
      updatedAt: B142_CONTENT_UPDATED_AT,
      content: [
        'Tabla local de repuestos frecuentes usada como apoyo para identificar consumibles y componentes recurrentes de Baader 142.',
        'Puntos clave:',
        '- Incluye resortes, correas, cuchillos, repuestos mecanicos, sensores y bomba sopladora.',
        '- Relaciona nombre de componente con codigo SAP y, cuando aplica, codigo de manual.',
        '- Sirve como punto de partida para levantar repuestos criticos y crear procedimientos de cambio.',
        'Notas operativas:',
        '- Confirmar codigo final contra bodega, catalogo de repuestos vigente y configuracion exacta del equipo.',
        '- Separar posteriormente por familias: resortes, correas, cuchillos, sensores, vacio/sopladora y mecanica general.',
        'Referencias visuales:',
        '- Repuestos Baader 142 mas comunes: /mantenimiento-planta/learning-assets/baader-142/b142-repuestos-comunes.jpg',
      ].join('\n\n'),
    },
  ]
}

function getB142ContentCounts(): MachineContentCounts {
  return {
    manual: listB142ManualSections().length,
    procedures: 0,
    flows: 0,
    diagnosis: 0,
  }
}

// ─────────────────────────────────────────────────────────────
// PROCEDURES
// ─────────────────────────────────────────────────────────────

export async function listProcedures(machineSlug: string): Promise<Procedure[]> {
  if (machineSlug === B200_LEARNING_SLUG) return listB200Procedures()

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
  if (machineSlug === B200_LEARNING_SLUG && id.startsWith('b200-procedure-')) {
    await setDoc(sectionDoc(machineSlug, 'procedures', id), { _deleted: true, updatedAt: Date.now() }, { merge: true })
    return
  }
  await deleteDoc(sectionDoc(machineSlug, 'procedures', id))
}

// ─────────────────────────────────────────────────────────────
// MANUAL SECTIONS
// ─────────────────────────────────────────────────────────────

export async function listManualSections(machineSlug: string): Promise<ManualSection[]> {
  if (machineSlug === B200_LEARNING_SLUG) return listB200ManualSections()
  if (machineSlug === B142_LEARNING_SLUG) return listB142ManualSections()

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

export async function deleteManualSection(machineSlug: string, id: string): Promise<void> {
  if (machineSlug === B200_LEARNING_SLUG && id.startsWith('b200-manual-')) {
    await setDoc(sectionDoc(machineSlug, 'manual', id), { _deleted: true, updatedAt: Date.now() }, { merge: true })
    return
  }
  await deleteDoc(sectionDoc(machineSlug, 'manual', id))
}

// ─────────────────────────────────────────────────────────────
// FLOWS
// ─────────────────────────────────────────────────────────────

export async function listFlows(machineSlug: string): Promise<Flow[]> {
  if (machineSlug === B200_LEARNING_SLUG) return listB200Flows()

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
// RESUMEN / COUNTS (para el hub)
// ─────────────────────────────────────────────────────────────

export interface MachineContentCounts {
  manual: number
  procedures: number
  flows: number
  diagnosis: number
}

/** Obtiene conteo de items por seccion para una maquina */
export async function getMachineContentCounts(
  machineSlug: string
): Promise<MachineContentCounts> {
  if (machineSlug === B200_LEARNING_SLUG) return getB200ContentCounts()
  if (machineSlug === B142_LEARNING_SLUG) return getB142ContentCounts()

  const [manual, procedures, flows, diagnosis] = await Promise.all([
    getDocs(sectionCollection(machineSlug, 'manual')),
    getDocs(sectionCollection(machineSlug, 'procedures')),
    getDocs(sectionCollection(machineSlug, 'flows')),
    getDocs(sectionCollection(machineSlug, 'diagnosis')),
  ])
  return {
    manual: manual.size,
    procedures: procedures.size,
    flows: flows.size,
    diagnosis: diagnosis.size,
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

  const [manual, procedures, flows, diagnosis] = await Promise.all([
    getDocs(sectionCollection(machineSlug, 'manual')),
    getDocs(sectionCollection(machineSlug, 'procedures')),
    getDocs(sectionCollection(machineSlug, 'flows')),
    getDocs(sectionCollection(machineSlug, 'diagnosis')),
  ])
  let lastUpdatedAt: number | null = null
  for (const snap of [manual, procedures, flows, diagnosis]) {
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
        if (slug === B200_LEARNING_SLUG) {
          const diagnosis = await listB200Diagnosis()
          return diagnosis.map(entry => ({
            machineSlug: slug,
            diagnosisId: entry.id,
            title: entry.title,
            symptom: entry.symptom,
          }))
        }

        const snap = await getDocs(sectionCollection(slug, 'diagnosis'))
        return snap.docs.map(d => {
          const data = d.data() as DiagnosisEntry
          return {
            machineSlug: slug,
            diagnosisId: d.id,
            title: data.title ?? '',
            symptom: data.symptom ?? '',
          }
        })
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
