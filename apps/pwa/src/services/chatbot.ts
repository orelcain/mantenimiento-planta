/**
 * Servicio de Chatbot con RAG (Retrieval-Augmented Generation)
 * v4 — Memoria Firestore, turnos, resumen semanal, auto-seguimiento, alertas proactivas
 */
import { collection, getDocs, getDoc, setDoc, doc, query, where, orderBy, limit, serverTimestamp } from 'firebase/firestore'
import { db } from './firebase'
import { callGroq, callGemini, isAIConfigured, isGeminiConfigured, RateLimitError } from './ai'
import { checkThinkingAllowance, recordThinkingUsage, getAriaConfig } from './ariaThinkingTracker'
import { orchestrateStream, detectTaskType, type AgentStatusEvent } from './ariaOrchestrator'
import { logger } from '@/lib/logger'
import { buildLearningContext, trackEquipmentProblem } from './ariaLearning'
import type { Incident } from '@/types'
import type { Machine, Repuesto } from '@/types/repuestos'

// ─── Tipos ───────────────────────────────────────────────────────────
export interface ChatMessage {
  id: string
  role: 'user' | 'assistant' | 'system'
  content: string
  timestamp: Date
  context?: string
  actions?: ChatAction[]
  photoUrls?: string[]
  suggestions?: string[]
  chartData?: MiniChartData  // #2 — datos para mini gráfico inline
  /** Info del agente IA que generó esta respuesta */
  agentInfo?: {
    agentId: string
    agentName: string
    agentEmoji: string
    latencyMs: number
    fallbackUsed: boolean
    taskType?: string
    thinkingUsed?: boolean
  }
}

/** #2 — Datos para renderizar mini gráficos en burbujas */
export interface MiniChartData {
  type: 'bar' | 'donut'
  title?: string
  labels: string[]
  values: number[]
  colors?: string[]
}

export interface ChatAction {
  label: string
  route: string
  icon?: string
}

type IntentType =
  | 'repuestos'
  | 'incidencias'
  | 'equipos'
  | 'sensores'
  | 'resumen'
  | 'ayuda'
  | 'preventivo'
  | 'gantt'
  | 'ett'
  | 'mapas'
  | 'inspecciones'
  | 'modelos3d'
  | 'evidencias'
  | 'grader'
  | 'calendarioMantencion'
  | 'climaPuerto'
  | 'general'

// ─── Memoria por usuario (Firestore + localStorage fallback) ────────
export interface UserMemory {
  userId: string
  topics: Record<string, number>      // tema → nº de veces consultado
  lastQueries: string[]               // últimas 20 queries
  preferences: Record<string, string> // preferencias detectadas (ej. máquina favorita)
  updatedAt: number
  createdIncidentIds?: string[]       // #10 — IDs de incidencias creadas para auto-seguimiento
}

const MEMORY_PREFIX = 'chatbot_memory_'
const MEMORY_MAX_QUERIES = 20
const MEMORY_MAX_TOPICS = 30

// ─── #9 — Detección de turno/shift actual ────────────────────────────

type ShiftType = 'mañana' | 'tarde' | 'noche'

function getCurrentShift(): { shift: ShiftType; label: string; range: string } {
  const hour = new Date().getHours()
  if (hour >= 6 && hour < 14) return { shift: 'mañana', label: 'Turno Mañana', range: '06:00–14:00' }
  if (hour >= 14 && hour < 22) return { shift: 'tarde', label: 'Turno Tarde', range: '14:00–22:00' }
  return { shift: 'noche', label: 'Turno Noche', range: '22:00–06:00' }
}

export { getCurrentShift }

export function loadUserMemory(userId: string): UserMemory {
  try {
    const raw = localStorage.getItem(`${MEMORY_PREFIX}${userId}`)
    if (!raw) return { userId, topics: {}, lastQueries: [], preferences: {}, updatedAt: Date.now(), createdIncidentIds: [] }
    return JSON.parse(raw) as UserMemory
  } catch {
    return { userId, topics: {}, lastQueries: [], preferences: {}, updatedAt: Date.now(), createdIncidentIds: [] }
  }
}

export function saveUserMemory(memory: UserMemory): void {
  try {
    // Limpiar topics antiguos si hay demasiados — quedarse con los más frecuentes
    if (Object.keys(memory.topics).length > MEMORY_MAX_TOPICS) {
      const sorted = Object.entries(memory.topics).sort((a, b) => b[1] - a[1])
      memory.topics = Object.fromEntries(sorted.slice(0, MEMORY_MAX_TOPICS))
    }
    memory.lastQueries = memory.lastQueries.slice(-MEMORY_MAX_QUERIES)
    memory.updatedAt = Date.now()
    localStorage.setItem(`${MEMORY_PREFIX}${memory.userId}`, JSON.stringify(memory))
  } catch { /* localStorage full */ }
}

// #6 — Persistir memoria en Firestore (backup cross-device)
export async function syncMemoryToFirestore(memory: UserMemory): Promise<void> {
  try {
    const docRef = doc(db, 'ariaMemory', memory.userId)
    await setDoc(docRef, {
      ...memory,
      updatedAt: serverTimestamp(),
    }, { merge: true })
  } catch {
    // Non-blocking, localStorage queda como fallback
  }
}

// #6 — Cargar memoria desde Firestore si localStorage no tiene
export async function loadMemoryFromFirestore(userId: string): Promise<UserMemory | null> {
  try {
    const docRef = doc(db, 'ariaMemory', userId)
    const snap = await getDoc(docRef)
    if (snap.exists()) {
      const data = snap.data() as UserMemory
      return { ...data, userId }
    }
    return null
  } catch {
    return null
  }
}

function updateMemoryWithQuery(memory: UserMemory, userMessage: string, intents: IntentType[]): void {
  // Guardar el query
  memory.lastQueries.push(userMessage)
  
  // Incrementar temas
  for (const intent of intents) {
    memory.topics[intent] = (memory.topics[intent] || 0) + 1
  }
  
  // Detectar preferencias (máquinas mencionadas)
  const machinePatterns = ['baader', 'marel', 'volcador', 'cinta', 'eviscer']
  const lower = userMessage.toLowerCase()
  for (const pattern of machinePatterns) {
    if (lower.includes(pattern)) {
      memory.preferences[`last_machine`] = pattern
      memory.preferences[`machine_${pattern}`] = String((parseInt(memory.preferences[`machine_${pattern}`] || '0') + 1))
    }
  }
}

function buildMemoryContext(memory: UserMemory): string {
  const lines: string[] = []
  
  // Temas frecuentes
  const topTopics = Object.entries(memory.topics)
    .sort((a, b) => b[1] - a[1])
    .slice(0, 5)
  
  if (topTopics.length > 0) {
    lines.push('HISTORIAL DEL USUARIO:')
    lines.push(`Temas más consultados: ${topTopics.map(([t, n]) => `${t}(${n})`).join(', ')}`)
  }
  
  // Últimas queries para contexto conversacional
  const recentQueries = memory.lastQueries.slice(-5)
  if (recentQueries.length > 0) {
    lines.push(`Últimas consultas: ${recentQueries.map(q => `"${q}"`).join(' → ')}`)
  }
  
  // Preferencias de máquinas
  const machinePrefs = Object.entries(memory.preferences)
    .filter(([k]) => k.startsWith('machine_'))
    .sort((a, b) => parseInt(b[1]) - parseInt(a[1]))
    .slice(0, 3)
  
  if (machinePrefs.length > 0) {
    lines.push(`Máquinas de interés: ${machinePrefs.map(([k, v]) => `${k.replace('machine_', '')}(×${v})`).join(', ')}`)
  }
  
  return lines.length > 0 ? lines.join('\n') : ''
}

// ─── Corrección de typos (Levenshtein fuzzy) ─────────────────────────

/** Distancia de Levenshtein entre dos strings */
function levenshtein(a: string, b: string): number {
  const la = a.length
  const lb = b.length
  if (la === 0) return lb
  if (lb === 0) return la
  
  // Optimización: si la diferencia de longitud es muy grande, no vale la pena calcular
  if (Math.abs(la - lb) > 3) return Math.max(la, lb)
  
  // Usar un solo array 1D para ahorrar memoria
  const prev = Array.from({ length: lb + 1 }, (_, j) => j)
  
  for (let i = 1; i <= la; i++) {
    let prevDiag = prev[0]!
    prev[0] = i
    for (let j = 1; j <= lb; j++) {
      const cost = a[i - 1] === b[j - 1] ? 0 : 1
      const tmp = prev[j]!
      prev[j] = Math.min(
        prev[j]! + 1,          // Borrar
        prev[j - 1]! + 1,      // Insertar
        prevDiag + cost         // Reemplazar
      )
      prevDiag = tmp
    }
  }
  
  return prev[lb]!
}

// Vocabulario conocido — todos los términos del dominio para corrección de typos
const KNOWN_VOCABULARY: string[] = [
  // De SYNONYM_MAP (las keys y todos los sinónimos)
  'motor', 'motoreductor', 'motobomba', 'electrico',
  'bomba', 'pump', 'bombeo', 'centrifuga',
  'rodamiento', 'rodaje', 'bearing', 'balero', 'balinera', 'cojinete', 'ruleman',
  'correa', 'faja', 'banda', 'belt', 'cinta',
  'sello', 'seal', 'reten', 'junta', 'oring', 'empaque', 'empaquetadura',
  'filtro', 'filter', 'cartucho', 'colador', 'malla',
  'reductor', 'reductora', 'gearbox',
  'valvula', 'valve', 'llave', 'grifo', 'electrovalvula',
  'sensor', 'transductor', 'transmisor', 'detector', 'sonda', 'probe',
  'engranaje', 'pinon', 'gear', 'corona', 'cremallera',
  'cadena', 'chain', 'eslabon',
  'eje', 'shaft', 'flecha', 'arbol',
  'cuchillo', 'cuchilla', 'blade', 'knife', 'filo',
  'soporte', 'bracket', 'support', 'base', 'mounting',
  // Términos de la planta
  'temperatura', 'humedad', 'presion', 'vibracion', 'corriente', 'voltaje',
  'incidencia', 'falla', 'problema', 'reporte', 'pendiente', 'critica',
  'equipo', 'maquina', 'operativo', 'mantenimiento', 'criticidad',
  'baader', 'marel', 'volcador', 'grader', 'transportadora', 'eviscerado', 'filete', 'empaque',
  'repuesto', 'pieza', 'catalogo', 'inventario',
  'resumen', 'estadistica', 'dashboard', 'panorama', 'total',
]

/**
 * Corrige un término buscando el más cercano en el vocabulario conocido. 
 * Solo corrige si la distancia es ≤ 2 y el término original no existe ya.
 * Ejemplo: "moror" → "motor", "roamiento" → "rodamiento", "balve" → "valve"
 */
function correctTypo(term: string): { corrected: string; wasFixed: boolean } {
  // Si ya es un término conocido, no corregir
  if (KNOWN_VOCABULARY.includes(term)) return { corrected: term, wasFixed: false }
  
  let bestMatch = term
  let bestDist = Infinity
  const maxDist = term.length <= 4 ? 1 : 2  // Más estricto con palabras cortas
  
  for (const known of KNOWN_VOCABULARY) {
    // Skip si la diferencia de longitud es mayor a maxDist (optimización)
    if (Math.abs(known.length - term.length) > maxDist) continue
    
    const dist = levenshtein(term, known)
    if (dist < bestDist && dist <= maxDist) {
      bestDist = dist
      bestMatch = known
    }
  }
  
  return bestDist <= maxDist && bestMatch !== term
    ? { corrected: bestMatch, wasFixed: true }
    : { corrected: term, wasFixed: false }
}

/**
 * Corrige typos en un array de términos y devuelve los corregidos + log de correcciones
 */
function correctTerms(terms: string[]): { correctedTerms: string[]; corrections: string[] } {
  const correctedTerms: string[] = []
  const corrections: string[] = []
  
  for (const term of terms) {
    const { corrected, wasFixed } = correctTypo(term)
    correctedTerms.push(corrected)
    if (wasFixed) {
      corrections.push(`"${term}" → "${corrected}"`)
    }
  }
  
  return { correctedTerms, corrections }
}

// ─── Sinónimos para búsqueda semántica ───────────────────────────────
const SYNONYM_MAP: Record<string, string[]> = {
  motor: ['motor', 'motoreductor', 'motobomba', 'electrico', 'eléctrico'],
  bomba: ['bomba', 'pump', 'bombeo', 'motobomba', 'centrífuga', 'centrifuga'],
  rodamiento: ['rodamiento', 'rodaje', 'bearing', 'balero', 'balinera', 'cojinete', 'ruleman'],
  correa: ['correa', 'faja', 'banda', 'belt', 'cinta'],
  sello: ['sello', 'seal', 'retén', 'reten', 'junta', 'o-ring', 'oring', 'empaque', 'empaquetadura'],
  filtro: ['filtro', 'filter', 'cartucho', 'colador', 'malla'],
  reductor: ['reductor', 'reductora', 'caja reductora', 'gearbox', 'motoreductor'],
  válvula: ['válvula', 'valvula', 'valve', 'llave', 'grifo', 'electroválvula', 'electrovalvula'],
  sensor: ['sensor', 'transductor', 'transmisor', 'detector', 'sonda', 'probe'],
  engranaje: ['engranaje', 'piñón', 'pinon', 'gear', 'corona', 'cremallera'],
  cadena: ['cadena', 'chain', 'eslabón', 'eslabon'],
  eje: ['eje', 'shaft', 'flecha', 'árbol', 'arbol'],
  cuchillo: ['cuchillo', 'cuchilla', 'blade', 'knife', 'filo'],
  soporte: ['soporte', 'bracket', 'support', 'base', 'mounting'],
}
const SYNONYM_MAP_ENTRIES = Object.entries(SYNONYM_MAP)

// ─── Stop words para limpiar queries conversacionales ────────────────
const STOP_WORDS = new Set([
  // Artículos y preposiciones
  'el', 'la', 'los', 'las', 'un', 'una', 'unos', 'unas', 'de', 'del', 'en', 'con', 'por', 'para',
  'al', 'a', 'y', 'o', 'que', 'se', 'es', 'su', 'lo', 'como',
  // Verbos comunes en preguntas
  'tenemos', 'tiene', 'tienen', 'hay', 'estar', 'esta', 'estan', 'son', 'ser', 'tener',
  'necesito', 'necesitamos', 'busco', 'buscar', 'quiero', 'dame', 'dime', 'muestrame', 'muestra',
  'cuantos', 'cuantas', 'cuanto', 'cuanta', 'donde', 'cual', 'cuales', 'puedo', 'puede',
  // Palabras de contexto genéricas
  'stock', 'inventario', 'disponible', 'disponibles', 'lista', 'listado', 'info', 'informacion',
  'datos', 'detalle', 'detalles', 'ver', 'sobre', 'algo', 'todo', 'todos', 'todas',
  'tipo', 'tipos', 'clase', 'clases', 'parte', 'partes', 'pieza', 'piezas',
  'repuesto', 'repuestos', 'catalogo', 'precio', 'precios', 'valor',
  'planta', 'nuestra', 'nuestro', 'nuestras', 'nuestros', 'cual', 'mas',
  'maquina', 'maquinas', 'equipo', 'equipos',
  'por', 'favor', 'gracias', 'hola', 'buenas', 'bueno',
])

/**
 * Normaliza texto: strip diacritics, puntuación, lowercase
 */
export function normalizeText(text: string): string {
  return text
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '') // strip diacritics
    .replace(/[^a-z0-9\s\-_.]/g, ' ') // remove punctuation
    .replace(/\s+/g, ' ')
    .trim()
}

/**
 * Extrae términos de búsqueda significativos de un query conversacional.
 * Incluye corrección de typos: "moror" → "motor", "roamiento" → "rodamiento"
 * Ejemplo: "¿Tenemos moror en stock?" → ["motor"] (corregido)
 */
function extractSearchTerms(query: string): { terms: string[]; corrections: string[] } {
  const normalized = normalizeText(query)
  const words = normalized.split(/\s+/).filter(w => w.length > 2)
  
  // Filtrar stop words
  const meaningful = words.filter(w => !STOP_WORDS.has(w))
  
  // Stem básico: "motores" → "motor", "bombas" → "bomba", etc.
  const stemmed = meaningful.map(w => {
    if (w.endsWith('es') && w.length > 4) return w.slice(0, -2)
    if (w.endsWith('s') && w.length > 3) return w.slice(0, -1)
    return w
  })
  
  const unique = [...new Set(stemmed)]
  
  // Corregir typos
  const { correctedTerms, corrections } = correctTerms(unique)
  
  return { terms: [...new Set(correctedTerms)], corrections }
}

function expandWithSynonyms(terms: string[]): string[] {
  const expanded = new Set(terms)
  for (const term of terms) {
    for (const [, synonyms] of Object.entries(SYNONYM_MAP)) {
      // Solo expandir si el término es DIRECTAMENTE miembro del grupo.
      // Evita expansión transitiva: "motor" → "motobomba" → grupo bomba → "pump"
      const normSyns = synonyms.map(s => normalizeText(s))
      const isDirectMember = normSyns.includes(term) || normSyns.some(ns => ns === term)
      if (isDirectMember) {
        normSyns.forEach(s => expanded.add(s))
      }
    }
  }
  return Array.from(expanded)
}

// ─── Detección de intención ──────────────────────────────────────────
const INTENT_KEYWORDS: Record<IntentType, string[]> = {
  repuestos: ['repuesto', 'repuestos', 'pieza', 'piezas', 'sap', 'stock', 'rodamiento', 'motor', 'bomba', 'filtro', 'correa', 'sello', 'cojinete', 'reductor', 'válvula', 'sensor', 'catálogo', 'catalogo', 'precio', 'valor', 'caro', 'barato', 'código', 'codigo', 'tenemos', 'hay'],
  incidencias: ['incidencia', 'incidencias', 'problema', 'problemas', 'falla', 'fallas', 'reporte', 'reportes', 'pendiente', 'pendientes', 'abierta', 'abiertas', 'resuelta', 'resueltas', 'crítica', 'critica', 'alta', 'prioridad'],
  equipos: ['equipo', 'equipos', 'máquina', 'maquina', 'máquinas', 'maquinas', 'operativo', 'mantenimiento', 'fuera de servicio', 'criticidad'],
  sensores: ['sensor', 'sensores', 'temperatura', 'humedad', 'lectura', 'iot', 'esp32', 'telemetría', 'telemetria', 'alerta'],
  preventivo: ['preventivo', 'preventiva', 'preventivas', 'preventivos', 'tarea programada', 'tareas programadas', 'lubricación', 'lubricacion', 'checklist', 'rutina', 'rutinas', 'frecuencia', 'mantenimiento preventivo', 'proxima ejecucion'],
  gantt: ['gantt', 'planificación', 'planificacion', 'planificar', 'proyecto', 'proyectos', 'cronograma', 'calendario', 'tarea', 'tareas', 'dependencia', 'dependencias', 'ruta crítica', 'ruta critica', 'temporada baja'],
  ett: ['ett', 'especificación técnica', 'especificacion tecnica', 'procedimiento', 'procedimientos', 'riesgo', 'riesgos', 'material', 'materiales', 'trabajo seguro', 'ficha técnica', 'ficha tecnica'],
  mapas: ['mapa', 'mapas', 'plano', 'planos', 'ubicación', 'ubicacion', 'localización', 'localizacion', 'marcador', 'marcadores', 'zona', 'zonas', 'visor de mapas'],
  inspecciones: ['inspección', 'inspeccion', 'inspecciones', 'ronda', 'rondas', 'recorrido', 'folio', 'punto de inspección', 'cumple', 'no cumple'],
  modelos3d: ['3d', 'modelo 3d', 'modelos 3d', 'visor 3d', 'glb', 'gltf', 'obj', 'fbx', 'anotación 3d', 'anotacion 3d', 'tridimensional'],
  evidencias: ['evidencia', 'evidencias', 'foto', 'fotos', 'antes después', 'antes despues', 'antes y después', 'fotografía', 'fotografia', 'comparación', 'comparacion'],
  grader: ['grader', 'análisis grader', 'analisis grader', 'clasificadora', 'session grader', 'calibración', 'calibracion'],
  calendarioMantencion: ['calendario', 'calendario mantención', 'calendario mantencion', 'turno', 'turnos', 'rotativo', 'rotativos', '6x1', 'jornada', 'vacaciones técnico', 'vacaciones tecnico', 'semana técnico', 'control semanal', 'control mensual', 'horas semanales', 'horas mensuales', 'días trabajados', 'dias trabajados', 'libre', 'libres', 'descanso'],
  climaPuerto: ['clima', 'tiempo', 'weather', 'puerto', 'chonchi', 'viento', 'olas', 'oleaje', 'marejada', 'lluvia', 'pronóstico', 'pronostico', 'meteorológico', 'meteorologico', 'temporal', 'cierre puerto', 'bahía', 'bahia', 'directemar'],
  resumen: ['resumen', 'resúmeme', 'resumeme', 'estadística', 'estadísticas', 'estadistica', 'cuántos', 'cuantos', 'cuántas', 'cuantas', 'total', 'totales', 'semana', 'mes', 'hoy', 'dashboard', 'panorama', 'overview'],
  ayuda: ['ayuda', 'help', 'cómo', 'como', 'qué puedes', 'que puedes', 'funciones', 'qué haces', 'que haces'],
  general: [],
}

function detectIntent(text: string): IntentType[] {
  const lower = normalizeText(text)
  const detected: IntentType[] = []

  // También corregir typos en la detección de intención
  const words = lower.split(/\s+/).filter(w => w.length > 2)
  const correctedWords = words.map(w => correctTypo(w).corrected)
  const correctedText = correctedWords.join(' ')

  for (const [intent, keywords] of Object.entries(INTENT_KEYWORDS)) {
    if (intent === 'general') continue
    if (keywords.some(kw => correctedText.includes(kw) || lower.includes(kw))) {
      detected.push(intent as IntentType)
    }
  }

  // Si menciona cosas como "motor", "bomba" sin otros indicadores → repuestos
  if (detected.length === 0) {
    const repKeywords = Object.keys(SYNONYM_MAP)
    if (repKeywords.some(kw => lower.includes(kw))) {
      detected.push('repuestos')
    }
  }

  return detected.length > 0 ? detected : ['general']
}

// ─── Acciones sugeridas según intención ──────────────────────────────
function suggestActions(intents: IntentType[]): ChatAction[] {
  const actions: ChatAction[] = []
  if (intents.includes('incidencias')) {
    actions.push({ label: 'Ver incidencias', route: '/incidents', icon: 'AlertTriangle' })
  }
  if (intents.includes('equipos')) {
    actions.push({ label: 'Ver equipos', route: '/equipment', icon: 'Wrench' })
  }
  if (intents.includes('repuestos')) {
    actions.push({ label: 'Catálogo repuestos', route: '/repuestos', icon: 'Package' })
  }
  if (intents.includes('sensores')) {
    actions.push({ label: 'Panel sensores', route: '/sensors/monitor', icon: 'Activity' })
  }
  if (intents.includes('preventivo')) {
    actions.push({ label: 'Mantenimiento preventivo', route: '/preventive', icon: 'Calendar' })
  }
  if (intents.includes('gantt')) {
    actions.push({ label: 'Planificador Gantt', route: '/gantt', icon: 'BarChart3' })
  }
  if (intents.includes('ett')) {
    actions.push({ label: 'Ver ETT', route: '/ett', icon: 'FileText' })
  }
  if (intents.includes('mapas')) {
    actions.push({ label: 'Mapas de planta', route: '/map', icon: 'Map' })
  }
  if (intents.includes('inspecciones')) {
    actions.push({ label: 'Inspecciones', route: '/inspections', icon: 'ClipboardCheck' })
  }
  if (intents.includes('modelos3d')) {
    actions.push({ label: 'Visor 3D', route: '/visor-3d', icon: 'Box' })
  }
  if (intents.includes('evidencias')) {
    actions.push({ label: 'Evidencias fotográficas', route: '/evidence', icon: 'Camera' })
  }
  if (intents.includes('grader')) {
    actions.push({ label: 'Análisis Grader', route: '/grader-analysis', icon: 'BarChart' })
  }
  if (intents.includes('calendarioMantencion')) {
    actions.push({ label: 'Calendario Mantención', route: '/calendario-mantencion', icon: 'CalendarClock' })
  }
  if (intents.includes('climaPuerto')) {
    actions.push({ label: 'Clima Puerto Chonchi', route: '/clima-puerto', icon: 'CloudSun' })
  }
  return actions
}

// ─── PRE-ANÁLISIS CON LLM (Razonamiento Autónomo) ───────────────────

interface QueryAnalysis {
  intents: IntentType[]
  entities: {
    machines: string[]
    components: string[]
    statuses: string[]
    people: string[]
  }
  resolvedQuery: string
  needsData: IntentType[]
  reasoning: string
}

const ANALYSIS_PROMPT = `Eres un analizador de intención ultrarrápido para una app de mantenimiento industrial.
Analiza el mensaje del usuario EN CONTEXTO de la conversación reciente.

Responde SOLO con JSON válido (sin markdown, sin comentarios):
{
  "intents": [...],
  "entities": { "machines": [...], "components": [...], "statuses": [...], "people": [...] },
  "resolvedQuery": "...",
  "needsData": [...],
  "reasoning": "..."
}

CAMPOS:
- intents: array de categorías detectadas. Valores posibles: "repuestos", "incidencias", "equipos", "sensores", "preventivo", "gantt", "ett", "mapas", "inspecciones", "modelos3d", "evidencias", "grader", "calendarioMantencion", "climaPuerto", "resumen", "ayuda", "general"
- entities.machines: nombres de máquinas/equipos mencionados o implícitos por contexto (ej: "Grader", "Baader 200", "Marel I-Cut")
- entities.components: componentes mencionados (ej: "motor", "rodamiento", "bomba", "filtro", "cuchillo")
- entities.statuses: estados mencionados (ej: "pendiente", "resuelto", "crítica")
- entities.people: personas mencionadas (ej: "Juan", "el técnico")
- resolvedQuery: el mensaje del usuario con TODAS las referencias implícitas resueltas usando la conversación. Si el usuario dijo "y sus repuestos?" y antes hablaban de la Grader → "repuestos de la máquina Grader". Si dice "cuántos tiene?" y antes hablaban de motores de la Baader → "cuántos motores tiene la Baader"
- needsData: qué módulos de datos necesitas para responder bien (puede ser más amplio que intents)
- reasoning: una frase breve explicando tu razonamiento

REGLAS CRÍTICAS:
- Si el usuario usa pronombres (eso, esa, ese, lo, la, los, sus, esos) o frases vagas ("y los repuestos?", "cuántos tiene?", "muéstrame más"), DEBES resolver la referencia mirando la conversación anterior
- Si no hay contexto previo para resolver, usa el mensaje tal cual
- Si el mensaje es simple y claro ("hola", "qué puedes hacer"), no necesitas análisis profundo
- machines incluye cualquier referencia a equipos de planta: Grader, Baader, Marel, cinta, faja, etc.`

/**
 * Pre-análisis con LLM: entiende el contexto conversacional y resuelve referencias implícitas.
 * Se ejecuta ANTES de la respuesta principal para determinar qué datos buscar y cómo interpretar el query.
 */
async function analyzeQuery(
  userMessage: string,
  recentHistory: ChatMessage[],
): Promise<QueryAnalysis> {
  // Shortcut: si el mensaje es muy simple, no gastar un call al LLM
  const lower = normalizeText(userMessage)
  const simplePatterns = /^(hola|buenos? d[ií]as?|buenas|hey|ayuda|help|que puedes hacer|que haces|gracias|ok|si|no)$/
  if (simplePatterns.test(lower.trim())) {
    const kwIntents = detectIntent(userMessage)
    return {
      intents: kwIntents,
      entities: { machines: [], components: [], statuses: [], people: [] },
      resolvedQuery: userMessage,
      needsData: kwIntents.filter(i => i !== 'general' && i !== 'ayuda'),
      reasoning: 'Mensaje simple, no requiere análisis profundo',
    }
  }

  // Si no hay historial relevante y la detección por keywords es clara, evitar el call
  const kwIntents = detectIntent(userMessage)
  const hasHistory = recentHistory.length > 1
  const hasImplicitRef = /\b(eso|esa|ese|esos|esas|lo|la|los|las|sus|su|tiene|tienen|más|estos|estas|el mismo|la misma)\b/i.test(userMessage)

  if (!hasHistory && kwIntents.length > 0 && !kwIntents.includes('general') && !hasImplicitRef) {
    // Keywords claros + sin historial = no necesita LLM
    return {
      intents: kwIntents,
      entities: { machines: [], components: [], statuses: [], people: [] },
      resolvedQuery: userMessage,
      needsData: kwIntents,
      reasoning: 'Intención clara por keywords, sin contexto previo',
    }
  }

  // Construir contexto conversacional compacto
  const contextMessages = recentHistory.slice(-8)
  const conversationContext = contextMessages.map(m =>
    `${m.role === 'user' ? 'Usuario' : 'ARIA'}: ${m.content.slice(0, 300)}`
  ).join('\n')

  const messages: Array<{ role: string; content: string }> = [
    { role: 'system', content: ANALYSIS_PROMPT },
  ]

  if (conversationContext) {
    messages.push({
      role: 'system',
      content: `Conversación reciente:\n${conversationContext}`,
    })
  }

  messages.push({ role: 'user', content: userMessage })

  try {
    // Preferir Gemini para razonamiento (mejor reasoning + no consume rate limit de Groq)
    const analysisFn = isGeminiConfigured() ? callGemini : callGroq
    const result = await analysisFn(messages, { temperature: 0.05, max_tokens: 400 })
    const jsonMatch = result.content.match(/\{[\s\S]*\}/)
    if (jsonMatch) {
      const parsed = JSON.parse(jsonMatch[0]) as Partial<QueryAnalysis>
      // Validar y completar campos
      const validIntents = (parsed.intents || []).filter(i =>
        Object.keys(INTENT_KEYWORDS).includes(i)
      )
      return {
        intents: validIntents.length > 0 ? validIntents : kwIntents,
        entities: {
          machines: parsed.entities?.machines || [],
          components: parsed.entities?.components || [],
          statuses: parsed.entities?.statuses || [],
          people: parsed.entities?.people || [],
        },
        resolvedQuery: parsed.resolvedQuery || userMessage,
        needsData: (parsed.needsData || validIntents).filter(i =>
          Object.keys(INTENT_KEYWORDS).includes(i)
        ),
        reasoning: parsed.reasoning || '',
      }
    }
  } catch (err) {
    // Propagar rate limit para que el UI muestre countdown
    if (err instanceof RateLimitError) throw err
    logger.error('Chatbot: analyzeQuery LLM error, falling back to keywords', err instanceof Error ? err : undefined)
  }

  // Fallback a detección por keywords
  return {
    intents: kwIntents,
    entities: { machines: [], components: [], statuses: [], people: [] },
    resolvedQuery: userMessage,
    needsData: kwIntents.filter(i => i !== 'general' && i !== 'ayuda'),
    reasoning: 'Fallback a detección por keywords',
  }
}

/** Detecta si el usuario quiere ver el historial de ARIA */
function isAriaHistoryRequest(text: string): boolean {
  return /(?:historial|acciones|log|registro)\s*(?:de\s+)?(?:aria|asistente|bot|chat)/i.test(text) ||
    /historial\s+de\s+aria/i.test(text)
}

// ─── Caché de contexto RAG (TTL: 3 minutos) ─────────────────────────
interface CacheEntry {
  data: string
  timestamp: number
}

const CACHE_TTL_MS = 3 * 60 * 1000
const contextCache = new Map<string, CacheEntry>()

/** #2 — Cache inteligente: normaliza la key semánticamente para reutilizar resultados similares */
function normalizeCacheKey(prefix: string, query: string): string {
  const { terms } = extractSearchTerms(query)
  return `${prefix}_${terms.sort().join('_')}`
}

function getCached(key: string): string | null {
  const entry = contextCache.get(key)
  if (!entry) return null
  if (Date.now() - entry.timestamp > CACHE_TTL_MS) {
    contextCache.delete(key)
    return null
  }
  return entry.data
}

function setCache(key: string, data: string): void {
  contextCache.set(key, { data, timestamp: Date.now() })
  // Limpiar entradas expiradas (max 30)
  if (contextCache.size > 30) {
    const now = Date.now()
    for (const [k, v] of contextCache) {
      if (now - v.timestamp > CACHE_TTL_MS) contextCache.delete(k)
    }
  }
}

/** #1 — Fuzzy match: coincidencia parcial tolerante a errores */
function fuzzyMatch(text: string, term: string): boolean {
  // Exact substring match
  if (text.includes(term)) return true
  // Partial match: el term aparece como parte de una palabra en text
  const words = text.split(/\s+/)
  for (const word of words) {
    if (word.includes(term)) return true
    // Reverso: la palabra es un substring del term (solo si la palabra es sustancial)
    if (word.length >= 4 && term.includes(word)) return true
    // Levenshtein fuzzy: permite 1-2 errores según longitud
    if (term.length >= 4 && word.length >= 4) {
      const maxDist = term.length <= 5 ? 1 : 2
      if (levenshtein(word, term) <= maxDist) return true
      // Check substrings of word against term for compound words (e.g. 'motorreductor' contains 'motor')
      if (word.length > term.length + 2) {
        for (let i = 0; i <= word.length - term.length; i++) {
          const sub = word.substring(i, i + term.length)
          if (levenshtein(sub, term) <= 1) return true
        }
      }
    }
  }
  return false
}

// ─── Consultas Firestore (RAG context) ───────────────────────────────

async function fetchIncidentsSummary(): Promise<string> {
  const cached = getCached('incidents_summary')
  if (cached) return cached

  try {
    const colRef = collection(db, 'incidents')
    const snap = await getDocs(colRef)
    const incidents = snap.docs.map(d => ({ id: d.id, ...d.data() })) as Incident[]

    const byStatus: Record<string, number> = {}
    const byPriority: Record<string, number> = {}

    incidents.forEach(inc => {
      byStatus[inc.status] = (byStatus[inc.status] || 0) + 1
      byPriority[inc.prioridad] = (byPriority[inc.prioridad] || 0) + 1
    })

    const sorted = incidents
      .sort((a, b) => {
        const ta = a.createdAt instanceof Date ? a.createdAt.getTime() : (a.createdAt as any)?.toMillis?.() || 0
        const tb = b.createdAt instanceof Date ? b.createdAt.getTime() : (b.createdAt as any)?.toMillis?.() || 0
        return tb - ta
      })
      .slice(0, 10)

    const recentTitles = sorted.map(inc =>
      `- [${inc.status}][${inc.prioridad}] ${inc.titulo} (${inc.equipmentId || 'sin equipo'})`
    )

    const result = [
      `INCIDENCIAS (total: ${incidents.length}):`,
      `Por estado: ${JSON.stringify(byStatus)}`,
      `Por prioridad: ${JSON.stringify(byPriority)}`,
      `Recientes:`,
      ...recentTitles,
    ].join('\n')

    setCache('incidents_summary', result)
    return result
  } catch (err: unknown) {
    logger.error('Chatbot: error fetching incidents', err instanceof Error ? err : undefined)
    return 'No se pudieron cargar las incidencias.'
  }
}

async function fetchEquipmentSummary(): Promise<string> {
  const cached = getCached('equipment_summary')
  if (cached) return cached

  try {
    const colRef = collection(db, 'equipment')
    const snap = await getDocs(colRef)
    const items = snap.docs.map(d => ({ id: d.id, ...d.data() }))

    const byEstado: Record<string, number> = {}
    const byCriticidad: Record<string, number> = {}
    const names: string[] = []

    items.forEach((eq: any) => {
      byEstado[eq.estado || 'desconocido'] = (byEstado[eq.estado || 'desconocido'] || 0) + 1
      byCriticidad[eq.criticidad || 'sin definir'] = (byCriticidad[eq.criticidad || 'sin definir'] || 0) + 1
      names.push(`- ${eq.nombre || eq.codigo} [${eq.estado}] (${eq.criticidad})`)
    })

    const result = [
      `EQUIPOS (total: ${items.length}):`,
      `Por estado: ${JSON.stringify(byEstado)}`,
      `Por criticidad: ${JSON.stringify(byCriticidad)}`,
      `Lista:`,
      ...names.slice(0, 20),
      items.length > 20 ? `... y ${items.length - 20} más` : '',
    ].join('\n')

    setCache('equipment_summary', result)
    return result
  } catch (err: unknown) {
    logger.error('Chatbot: error fetching equipment', err instanceof Error ? err : undefined)
    return 'No se pudieron cargar los equipos.'
  }
}

// ─── Usuarios disponibles ────────────────────────────────────────────

async function fetchUsersSummary(): Promise<string> {
  const cached = getCached('users_summary')
  if (cached) return cached

  try {
    const usersSnap = await getDocs(collection(db, 'users'))
    const users = usersSnap.docs
      .map(d => ({ id: d.id, ...d.data() }))
      .filter((u: any) => u.activo !== false)

    const byRol: Record<string, number> = {}
    const userList: string[] = []

    users.forEach((u: any) => {
      const rol = u.rol || 'sin_rol'
      byRol[rol] = (byRol[rol] || 0) + 1
      userList.push(`- ${u.nombre || ''} ${u.apellido || ''} [${rol}] (${u.email})`)
    })

    const result = [
      `USUARIOS ACTIVOS (total: ${users.length}):`,
      `Por rol: ${JSON.stringify(byRol)}`,
      `Lista:`,
      ...userList,
    ].join('\n')

    setCache('users_summary', result)
    return result
  } catch (err: unknown) {
    logger.error('Chatbot: error fetching users', err instanceof Error ? err : undefined)
    return 'No se pudieron cargar los usuarios.'
  }
}

// ─── Mantenimiento preventivo ────────────────────────────────────────

async function fetchPreventiveSummary(): Promise<string> {
  const cached = getCached('preventive_summary')
  if (cached) return cached

  try {
    const tasksSnap = await getDocs(query(collection(db, 'preventiveTasks'), orderBy('proximaEjecucion', 'asc')))
    const tasks = tasksSnap.docs.map(d => ({ id: d.id, ...d.data() })) as any[]

    const activas = tasks.filter(t => t.activo !== false)
    const byTipo: Record<string, number> = {}
    const proximas: string[] = []

    activas.forEach((t: any) => {
      byTipo[t.tipo || 'general'] = (byTipo[t.tipo || 'general'] || 0) + 1
    })

    // Próximas 10 tareas
    activas.slice(0, 10).forEach((t: any) => {
      const fecha = t.proximaEjecucion?.toDate?.() || t.proximaEjecucion
      const fechaStr = fecha instanceof Date ? fecha.toLocaleDateString('es-CL') : String(fecha || 'sin fecha')
      proximas.push(`- ${t.nombre || 'Sin nombre'} [${t.tipo || 'general'}] → próxima: ${fechaStr} (cada ${t.frecuenciaDias || '?'} días)${t.equipmentId ? ` | equipo: ${t.equipmentId}` : ''}`)
    })

    const result = [
      `MANTENIMIENTO PREVENTIVO (${activas.length} tareas activas):`,
      `Por tipo: ${JSON.stringify(byTipo)}`,
      `Próximas tareas:`,
      ...proximas,
      activas.length > 10 ? `... y ${activas.length - 10} más` : '',
    ].join('\n')

    setCache('preventive_summary', result)
    return result
  } catch (err: unknown) {
    logger.error('Chatbot: error fetching preventive tasks', err instanceof Error ? err : undefined)
    return 'No se pudieron cargar las tareas preventivas.'
  }
}

// ─── Planificador Gantt ──────────────────────────────────────────────

async function fetchGanttSummary(): Promise<string> {
  const cached = getCached('gantt_summary')
  if (cached) return cached

  try {
    const tasksSnap = await getDocs(query(collection(db, 'ganttTasks'), orderBy('startDate', 'asc')))
    const tasks = tasksSnap.docs.map(d => ({ id: d.id, ...d.data() })) as any[]

    const projectsSnap = await getDocs(collection(db, 'ganttProjects'))
    const projects = projectsSnap.docs.map(d => ({ id: d.id, ...d.data() })) as any[]

    const byStatus: Record<string, number> = {}
    const taskList: string[] = []

    tasks.forEach((t: any) => {
      byStatus[t.status || 'sin_estado'] = (byStatus[t.status || 'sin_estado'] || 0) + 1
    })

    tasks.slice(0, 15).forEach((t: any) => {
      const start = t.startDate?.toDate?.() || t.startDate
      const end = t.endDate?.toDate?.() || t.endDate
      const startStr = start instanceof Date ? start.toLocaleDateString('es-CL') : '?'
      const endStr = end instanceof Date ? end.toLocaleDateString('es-CL') : '?'
      taskList.push(`- [${t.status}] ${t.titulo} | ${startStr} - ${endStr} | progreso: ${t.progress || 0}%${t.prioridad ? ` | prioridad: ${t.prioridad}` : ''}`)
    })

    const result = [
      `PLANIFICADOR GANTT:`,
      `Proyectos: ${projects.length} (${projects.filter((p: any) => p.active).length} activos)`,
      `Tareas: ${tasks.length}`,
      `Por estado: ${JSON.stringify(byStatus)}`,
      `Lista de tareas:`,
      ...taskList,
      tasks.length > 15 ? `... y ${tasks.length - 15} más` : '',
    ].join('\n')

    setCache('gantt_summary', result)
    return result
  } catch (err: unknown) {
    logger.error('Chatbot: error fetching gantt', err instanceof Error ? err : undefined)
    return 'No se pudieron cargar los datos del planificador Gantt.'
  }
}

// ─── ETT (Especificaciones Técnicas del Trabajo) ─────────────────────

async function fetchETTSummary(): Promise<string> {
  const cached = getCached('ett_summary')
  if (cached) return cached

  try {
    const snap = await getDocs(query(collection(db, 'ett'), orderBy('createdAt', 'desc'), limit(50)))
    const items = snap.docs.map(d => ({ id: d.id, ...d.data() })) as any[]

    const byEstado: Record<string, number> = {}
    const ettList: string[] = []

    items.forEach((e: any) => {
      byEstado[e.estado || 'sin_estado'] = (byEstado[e.estado || 'sin_estado'] || 0) + 1
    })

    items.slice(0, 10).forEach((e: any) => {
      const gen = e.general || {}
      ettList.push(`- [${e.estado}] ${gen.titulo || 'Sin título'} | Código: ${gen.codigo || 'N/A'} | Área: ${gen.area || 'N/A'} | Responsable: ${gen.responsable || 'N/A'}`)
    })

    const result = [
      `ETT - ESPECIFICACIONES TÉCNICAS DEL TRABAJO (total: ${items.length}):`,
      `Por estado: ${JSON.stringify(byEstado)}`,
      `Lista:`,
      ...ettList,
      items.length > 10 ? `... y ${items.length - 10} más` : '',
    ].join('\n')

    setCache('ett_summary', result)
    return result
  } catch (err: unknown) {
    logger.error('Chatbot: error fetching ETT', err instanceof Error ? err : undefined)
    return 'No se pudieron cargar las ETT.'
  }
}

// ─── Mapas e Inspecciones ────────────────────────────────────────────

async function fetchMapsSummary(): Promise<string> {
  const cached = getCached('maps_summary')
  if (cached) return cached

  try {
    const locSnap = await getDocs(collection(db, 'mapLocations'))
    const locations = locSnap.docs.map(d => ({ id: d.id, ...d.data() })) as any[]

    const inspSnap = await getDocs(query(collection(db, 'inspections'), orderBy('createdAt', 'desc'), limit(30)))
    const inspections = inspSnap.docs.map(d => ({ id: d.id, ...d.data() })) as any[]

    const byStatus: Record<string, number> = {}
    const inspList: string[] = []

    inspections.forEach((i: any) => {
      byStatus[i.status || 'sin_estado'] = (byStatus[i.status || 'sin_estado'] || 0) + 1
    })

    inspections.slice(0, 10).forEach((i: any) => {
      const fecha = i.createdAt?.toDate?.() || i.createdAt
      const fechaStr = fecha instanceof Date ? fecha.toLocaleDateString('es-CL') : '?'
      inspList.push(`- [${i.status}] ${i.nombre} | Ubicación: ${i.locationName || 'N/A'} | Items: ${i.totalItems || 0} | Fecha: ${fechaStr}`)
    })

    const result = [
      `MAPAS DE PLANTA (${locations.length} ubicaciones):`,
      `Ubicaciones: ${locations.map((l: any) => l.nombre || l.id).join(', ')}`,
      '',
      `INSPECCIONES (${inspections.length} recientes):`,
      `Por estado: ${JSON.stringify(byStatus)}`,
      ...inspList,
    ].join('\n')

    setCache('maps_summary', result)
    return result
  } catch (err: unknown) {
    logger.error('Chatbot: error fetching maps/inspections', err instanceof Error ? err : undefined)
    return 'No se pudieron cargar los datos de mapas e inspecciones.'
  }
}

// ─── Modelos 3D ──────────────────────────────────────────────────────

async function fetchModels3DSummary(): Promise<string> {
  const cached = getCached('models3d_summary')
  if (cached) return cached

  try {
    const snap = await getDocs(query(collection(db, 'models3d'), orderBy('createdAt', 'desc')))
    const models = snap.docs.map(d => ({ id: d.id, ...d.data() })) as any[]

    const modelList: string[] = models.map((m: any) =>
      `- ${m.name || 'Sin nombre'} [${m.format || '?'}] | ${m.visibility || 'admin'} | ${(m.sizeBytes / 1024 / 1024).toFixed(1)} MB`
    )

    const result = [
      `MODELOS 3D (${models.length} modelos):`,
      ...modelList.slice(0, 15),
      models.length > 15 ? `... y ${models.length - 15} más` : '',
    ].join('\n')

    setCache('models3d_summary', result)
    return result
  } catch (err: unknown) {
    logger.error('Chatbot: error fetching 3D models', err instanceof Error ? err : undefined)
    return 'No se pudieron cargar los modelos 3D.'
  }
}

// ─── Evidencias fotográficas ─────────────────────────────────────────

async function fetchPhotoEvidenceSummary(): Promise<string> {
  const cached = getCached('evidence_summary')
  if (cached) return cached

  try {
    const snap = await getDocs(query(collection(db, 'photoEvidence'), orderBy('createdAt', 'desc'), limit(30)))
    const items = snap.docs.map(d => ({ id: d.id, ...d.data() })) as any[]

    const byStatus: Record<string, number> = {}
    const evList: string[] = []

    items.forEach((e: any) => {
      byStatus[e.status || 'sin_estado'] = (byStatus[e.status || 'sin_estado'] || 0) + 1
    })

    items.slice(0, 10).forEach((e: any) => {
      evList.push(`- [${e.status}] ${e.titulo || 'Sin título'} | Fotos antes: ${(e.fotosBefore || []).length} | Fotos después: ${(e.fotosAfter || []).length}`)
    })

    const result = [
      `EVIDENCIAS FOTOGRÁFICAS (${items.length} recientes):`,
      `Por estado: ${JSON.stringify(byStatus)}`,
      ...evList,
    ].join('\n')

    setCache('evidence_summary', result)
    return result
  } catch (err: unknown) {
    logger.error('Chatbot: error fetching photo evidence', err instanceof Error ? err : undefined)
    return 'No se pudieron cargar las evidencias fotográficas.'
  }
}

// ─── Análisis Grader ─────────────────────────────────────────────────

async function fetchGraderSummary(): Promise<string> {
  const cached = getCached('grader_summary')
  if (cached) return cached

  try {
    // Las sesiones de análisis se guardan en 'graderAnalysisSessions'
    let sessionsCount = 0
    let sessionsInfo = 'No hay sesiones de análisis registradas.'
    
    try {
      const snap = await getDocs(query(collection(db, 'graderAnalysisSessions'), orderBy('createdAt', 'desc'), limit(20)))
      const sessions = snap.docs.map(d => ({ id: d.id, ...d.data() })) as any[]
      sessionsCount = sessions.length
      
      if (sessions.length > 0) {
        const sessionList = sessions.slice(0, 10).map((s: any) => {
          const fecha = s.createdAt?.toDate?.() || s.createdAt
          const fechaStr = fecha instanceof Date ? fecha.toLocaleDateString('es-CL') : '?'
          return `- ${s.name || s.titulo || 'Sesión'} | Fecha: ${fechaStr} | Estado: ${s.status || 'N/A'}`
        })
        sessionsInfo = sessionList.join('\n')
      }
    } catch {
      // Collection might not exist
    }

    const result = [
      `ANÁLISIS GRADER (${sessionsCount} sesiones):`,
      `El módulo de Análisis Grader permite evaluar el rendimiento de la máquina clasificadora (grader).`,
      `Incluye: wizard de configuración, sesiones de análisis, calendario de sesiones.`,
      sessionsInfo,
    ].join('\n')

    setCache('grader_summary', result)
    return result
  } catch (err: unknown) {
    logger.error('Chatbot: error fetching grader data', err instanceof Error ? err : undefined)
    return 'No se pudieron cargar los datos del análisis grader.'
  }
}

// ─── Sensores IoT ────────────────────────────────────────────────────

async function fetchSensorsSummary(): Promise<string> {
  const cached = getCached('sensors_summary')
  if (cached) return cached

  try {
    // Los sensores están vinculados a equipos — consultar equipos que tienen sensor
    const eqSnap = await getDocs(collection(db, 'equipment'))
    const equipments = eqSnap.docs.map(d => ({ id: d.id, ...d.data() })) as any[]
    
    // Los sensores usan Realtime Database, pero podemos informar de la configuración
    const sensorEquipments = equipments.filter((eq: any) => 
      eq.sensorEnabled || eq.sensorId || (eq.nombre || '').toLowerCase().includes('sensor')
    )

    const result = [
      `SENSORES IoT:`,
      `El sistema monitorea sensores ESP32 conectados por WiFi a Firebase Realtime Database.`,
      `Métricas: temperatura y humedad en tiempo real.`,
      `Equipos con sensor: ${sensorEquipments.length > 0 ? sensorEquipments.map((e: any) => e.nombre || e.id).join(', ') : 'Los sensores se vinculan a equipos desde la sección de Sensores.'}`,
      `Funcionalidades: lectura en tiempo real, historial con gráficos, alertas por umbral, backfill de datos.`,
      `Panel principal: /sensors/monitor | Configuración: /sensors`,
    ].join('\n')

    setCache('sensors_summary', result)
    return result
  } catch (err: unknown) {
    logger.error('Chatbot: error fetching sensors', err instanceof Error ? err : undefined)
    return 'No se pudieron cargar datos de sensores.'
  }
}

// ─── Calendario Mantención ───────────────────────────────────────────

async function fetchCalendarioMantencionSummary(): Promise<string> {
  const cached = getCached('calendario_mantencion_summary')
  if (cached) return cached

  try {
    const snap = await getDoc(doc(db, 'calendario_mantencion_state', 'current'))
    if (!snap.exists()) {
      return 'CALENDARIO MANTENCIÓN:\nNo hay datos de calendario cargados aún. Se puede cargar una plantilla Excel desde /calendario-mantencion.'
    }

    const data = snap.data()
    const techs: any[] = data.techRows || []
    const dayCols: any[] = data.dayCols || []
    const hoursConfig = data.hoursConfig || {}
    const shiftConfig = data.shiftConfig || {}
    const filename = data.originalFilename || '(sin nombre)'

    // Build summary of current week
    const today = new Date()
    const todayStr = `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, '0')}-${String(today.getDate()).padStart(2, '0')}`

    // Parse dates from dayCols
    const parsedCols = dayCols.map((col: any) => {
      const raw = col.dateRaw || ''
      let dateObj: Date | null = null
      const ddmmyyyy = raw.match(/^(\d{1,2})[/-](\d{1,2})[/-](\d{4})$/)
      const yyyymmdd = raw.match(/^(\d{4})[/-](\d{1,2})[/-](\d{1,2})$/)
      if (ddmmyyyy) dateObj = new Date(+ddmmyyyy[3], +ddmmyyyy[2] - 1, +ddmmyyyy[1])
      else if (yyyymmdd) dateObj = new Date(+yyyymmdd[1], +yyyymmdd[2] - 1, +yyyymmdd[3])
      return { ...col, dateObj }
    })

    // ISO week key
    function isoWk(d: Date): string {
      const u = new Date(Date.UTC(d.getFullYear(), d.getMonth(), d.getDate()))
      u.setUTCDate(u.getUTCDate() + 4 - (u.getUTCDay() || 7))
      const y = new Date(Date.UTC(u.getUTCFullYear(), 0, 1))
      const w = Math.ceil((((u.getTime() - y.getTime()) / 86400000) + 1) / 7)
      return `${u.getUTCFullYear()}-W${String(w).padStart(2, '0')}`
    }

    const currentWeek = isoWk(today)
    const currentMonth = `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, '0')}`

    const weekCols = parsedCols.filter((c: any) => c.dateObj && isoWk(c.dateObj) === currentWeek)
    const monthCols = parsedCols.filter((c: any) => c.dateObj && `${c.dateObj.getFullYear()}-${String(c.dateObj.getMonth() + 1).padStart(2, '0')}` === currentMonth)

    // Turnos per-group count
    const groups: Record<string, string[]> = {}
    for (const t of techs) {
      const g = t.turno || 'Sin grupo'
      if (!groups[g]) groups[g] = []
      groups[g].push(t.name)
    }

    // Build current-week shift summary per tech
    const weekSummary = techs.slice(0, 20).map((t: any) => {
      const shifts = weekCols.map((c: any) => {
        const val = (t.shifts || {})[String(c.c)] || ''
        return val || '–'
      })
      return `  ${t.name} (${t.turno || '?'}): ${shifts.join(' | ')}`
    })

    const vacNorm = (v: string) => v.toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '')
    const techsOnVacation = techs.filter((t: any) => {
      return weekCols.some((c: any) => {
        const v = vacNorm((t.shifts || {})[String(c.c)] || '')
        return v.startsWith('vac') || v.includes('vacacion')
      })
    }).map((t: any) => t.name)

    const effectiveDaily = Math.max(0, (hoursConfig.workHours || 8) - (hoursConfig.breakHours || 0.5))

    const result = [
      `CALENDARIO MANTENCIÓN — Datos actuales:`,
      `Plantilla: ${filename}`,
      `Técnicos: ${techs.length} | Días en calendario: ${dayCols.length}`,
      `Grupos: ${Object.entries(groups).map(([g, names]) => `${g}(${names.length})`).join(', ')}`,
      `Jornada configurada: ${hoursConfig.workHours || 8}h total - ${hoursConfig.breakHours || 0.5}h colación = ${effectiveDaily}h efectivas/día`,
      `Jornada semanal legal: ${hoursConfig.autoLegalWeek !== false ? 'Automática Chile' : `${hoursConfig.expectedWeek || 44}h`}`,
      `Días laborales: ${hoursConfig.workDaysPerWeek || 6}x1`,
      `Vacaciones: solo días hábiles = ${hoursConfig.vacationBusinessDaysOnly !== false ? 'Sí' : 'No'}`,
      ``,
      `Semana actual (${currentWeek}): ${weekCols.length} días`,
      `Fecha de hoy: ${todayStr}`,
      weekSummary.length > 0 ? `Turnos esta semana:\n${weekSummary.join('\n')}` : 'Sin datos para esta semana.',
      techsOnVacation.length > 0 ? `\nTécnicos en vacaciones esta semana: ${techsOnVacation.join(', ')}` : '',
      `\nMes actual (${currentMonth}): ${monthCols.length} días`,
      `\nTurnos configurados: Día ${shiftConfig.diaInicio || '08:00'}-${shiftConfig.diaFin || '16:00'} | Tarde ${shiftConfig.tardeInicio || '16:00'}-${shiftConfig.tardeFin || '00:00'} | Noche ${shiftConfig.nocheInicio || '00:00'}-${shiftConfig.nocheFin || '08:00'}`,
      `\nPágina: /calendario-mantencion`,
    ].join('\n')

    setCache('calendario_mantencion_summary', result)
    return result
  } catch (err: unknown) {
    logger.error('Chatbot: error fetching calendario mantencion', err instanceof Error ? err : undefined)
    return 'No se pudieron cargar datos del Calendario Mantención.'
  }
}

// ─── Clima Puerto Chonchi ────────────────────────────────────────────

async function fetchClimaPuertoSummary(): Promise<string> {
  const cached = getCached('clima_puerto_summary')
  if (cached) return cached

  try {
    const lat = -42.62
    const lon = -73.77
    const weatherUrl = `https://api.open-meteo.com/v1/forecast?latitude=${lat}&longitude=${lon}&timezone=America/Santiago&current=temperature_2m,precipitation,weather_code,wind_speed_10m,wind_gusts_10m&daily=weather_code,temperature_2m_max,temperature_2m_min,precipitation_sum,wind_speed_10m_max,wind_gusts_10m_max&forecast_days=3`
    const marineUrl = `https://marine-api.open-meteo.com/v1/marine?latitude=${lat}&longitude=${lon}&timezone=America/Santiago&hourly=wave_height&forecast_days=2`

    const [weatherRes, marineRes] = await Promise.all([fetch(weatherUrl), fetch(marineUrl)])

    const weather = weatherRes.ok ? await weatherRes.json() : null
    const marine = marineRes.ok ? await marineRes.json() : null

    const current = weather?.current || {}
    const daily = weather?.daily || {}

    const waveHeights: number[] = marine?.hourly?.wave_height || []
    const maxWave = waveHeights.length > 0 ? Math.max(...waveHeights) : null
    const currentWave = waveHeights.length > 0 ? waveHeights[waveHeights.length - 1] : null

    const weatherCodes: Record<number, string> = {
      0: 'Despejado', 1: 'Mayormente despejado', 2: 'Parcialmente nublado', 3: 'Nublado',
      45: 'Niebla', 48: 'Niebla con escarcha',
      51: 'Llovizna leve', 53: 'Llovizna moderada', 55: 'Llovizna intensa',
      61: 'Lluvia leve', 63: 'Lluvia moderada', 65: 'Lluvia intensa',
      71: 'Nieve leve', 73: 'Nieve moderada', 75: 'Nieve intensa',
      80: 'Chubascos leves', 81: 'Chubascos moderados', 82: 'Chubascos intensos',
      95: 'Tormenta', 96: 'Tormenta con granizo', 99: 'Tormenta fuerte con granizo',
    }

    const currentDesc = weatherCodes[current.weather_code] || `Código ${current.weather_code}`
    const windKmh = current.wind_speed_10m || 0
    const gustKmh = current.wind_gusts_10m || 0

    // Simple port risk assessment
    const riskFactors: string[] = []
    if (gustKmh > 60) riskFactors.push(`Ráfagas fuertes (${gustKmh} km/h)`)
    if (maxWave && maxWave > 2.5) riskFactors.push(`Oleaje alto (${maxWave.toFixed(1)}m)`)
    if (current.precipitation > 5) riskFactors.push(`Precipitación alta (${current.precipitation}mm)`)
    const riskLevel = riskFactors.length >= 2 ? 'ALTO — probable cierre de puerto' : riskFactors.length === 1 ? 'MODERADO — precaución' : 'BAJO — condiciones favorables'

    // Forecast 3 days
    const forecastLines = (daily.time || []).slice(0, 3).map((date: string, i: number) => {
      const desc = weatherCodes[daily.weather_code?.[i]] || '?'
      return `  ${date}: ${desc}, ${daily.temperature_2m_min?.[i] ?? '?'}–${daily.temperature_2m_max?.[i] ?? '?'}°C, lluvia ${daily.precipitation_sum?.[i] ?? 0}mm, viento máx ${daily.wind_speed_10m_max?.[i] ?? '?'}km/h (ráfagas ${daily.wind_gusts_10m_max?.[i] ?? '?'}km/h)`
    })

    const result = [
      `CLIMA PUERTO CHONCHI — Datos en tiempo real:`,
      `Ubicación: Bahía de Yal, Chonchi, Chiloé (${lat}°S, ${Math.abs(lon)}°O)`,
      `Planta: Centro de Acopio Antarfood`,
      ``,
      `CONDICIONES ACTUALES:`,
      `  Clima: ${currentDesc}`,
      `  Temperatura: ${current.temperature_2m ?? '?'}°C`,
      `  Viento: ${windKmh} km/h | Ráfagas: ${gustKmh} km/h`,
      `  Precipitación: ${current.precipitation ?? 0} mm`,
      currentWave != null ? `  Oleaje actual: ~${currentWave.toFixed(1)}m | Máx próximas 48h: ${maxWave?.toFixed(1)}m` : '',
      ``,
      `RIESGO DE CIERRE: ${riskLevel}`,
      riskFactors.length > 0 ? `Factores: ${riskFactors.join(', ')}` : '',
      ``,
      `PRONÓSTICO 3 DÍAS:`,
      ...forecastLines,
      ``,
      `Fuente: Open-Meteo API + Marine API | Dashboard completo: /clima-puerto`,
    ].filter(Boolean).join('\n')

    setCache('clima_puerto_summary', result)
    return result
  } catch (err: unknown) {
    logger.error('Chatbot: error fetching clima puerto', err instanceof Error ? err : undefined)
    return 'CLIMA PUERTO CHONCHI:\nNo se pudieron obtener datos meteorológicos en este momento. Puedes ver el dashboard completo en /clima-puerto.'
  }
}

async function fetchRepuestosSummary(userQuery: string): Promise<string> {
  // #2 — Cache semántico: normaliza query para reutilizar resultados
  const cacheKey = normalizeCacheKey('repuestos', userQuery)
  const cached = getCached(cacheKey)
  if (cached) return cached

  try {
    const machinesSnap = await getDocs(collection(db, 'machines'))
    const machines = machinesSnap.docs.map(d => ({ id: d.id, ...d.data() })) as Machine[]

    let totalRepuestos = 0
    let valorTotal = 0
    const repuestosByMachine: string[] = []
    
    // Extraer solo los términos significativos del query (sin stop words, sin puntuación, con corrección de typos)
    const { terms: searchTerms, corrections } = extractSearchTerms(userQuery)

    // ─── DETECCIÓN DE MÁQUINAS EN EL QUERY ────────────────────────────
    // Si el usuario dice "motores de la grader", detectamos "grader" como máquina
    // y buscamos solo en los repuestos de esa máquina, con los términos restantes.
    // IMPORTANTE: No matchear máquinas por palabras genéricas de componentes
    // (ej: "motor", "bomba", "sensor") porque eso causa falsos positivos
    // como "Motor bomba caseta agua mar" matcheando por "motor".
    const normalizedQuery = normalizeText(userQuery)
    const matchedMachineIds = new Set<string>()
    const machineTermsToRemove = new Set<string>()

    // Palabras que son nombres de COMPONENTES, no identificadores de máquinas.
    // Si un nombre de máquina contiene SOLO este tipo de palabras, no debe matchear por palabra individual.
    const COMPONENT_WORDS = new Set([
      'motor', 'bomba', 'sensor', 'filtro', 'correa', 'sello', 'válvula', 'valvula',
      'reductor', 'engranaje', 'cadena', 'eje', 'cuchillo', 'soporte', 'rodamiento',
      'cilindro', 'actuador', 'variador', 'placa', 'cinta', 'polea', 'piñon', 'pinon',
      'compresor', 'ventilador', 'generador', 'transformador', 'interruptor',
    ])

    for (const machine of machines) {
      const normName = normalizeText(machine.nombre)
      const normMarca = normalizeText(machine.marca || '')
      const normModelo = normalizeText(machine.modelo || '')
      const nameWords = normName.split(/\s+/).filter(w => w.length > 2)

      // Verificar si el nombre COMPLETO aparece en el query
      if (normalizedQuery.includes(normName)) {
        matchedMachineIds.add(machine.id)
        nameWords.forEach(w => machineTermsToRemove.add(w))
      } else {
        // Buscar por palabras individuales del nombre de la máquina (ej. "grader", "baader", "marel")
        // PERO ignorar palabras genéricas de componentes para evitar falsos positivos
        for (const word of nameWords) {
          if (normalizedQuery.includes(word) && word.length >= 4 && !COMPONENT_WORDS.has(word)) {
            matchedMachineIds.add(machine.id)
            machineTermsToRemove.add(word)
          }
        }
        // También por marca o modelo
        if (normMarca.length >= 3 && normalizedQuery.includes(normMarca)) {
          matchedMachineIds.add(machine.id)
          machineTermsToRemove.add(normMarca)
        }
        if (normModelo.length >= 3 && normalizedQuery.includes(normModelo)) {
          matchedMachineIds.add(machine.id)
          machineTermsToRemove.add(normModelo)
        }
      }
    }

    // Separar términos de búsqueda: quitar los que referencian la máquina
    const componentTerms = matchedMachineIds.size > 0
      ? searchTerms.filter(t => !machineTermsToRemove.has(t) && t !== 'maquina' && t !== 'maquinas')
      : searchTerms
    const expandedTerms = componentTerms.length > 0 ? expandWithSynonyms(componentTerms) : []
    const matchedRepuestos: string[] = []

    // Si se detectó una máquina pero no quedaron términos de componente,
    // listar los repuestos de esa máquina (hasta 40)
    const listAllForMachine = matchedMachineIds.size > 0 && componentTerms.length === 0
    // Cache de repuestos por máquina (para safety-net posterior)
    const repsByMachineCache = new Map<string, Repuesto[]>()

    logger.info(`Chatbot search: raw="${userQuery}" → terms=[${searchTerms.join(', ')}] → machine filter=[${[...matchedMachineIds].join(', ')}] → component terms=[${componentTerms.join(', ')}] → expanded=[${expandedTerms.join(', ')}]${corrections.length ? ` (corregido: ${corrections.join(', ')})` : ''}`)

    for (const machine of machines) {
      const repSnap = await getDocs(collection(db, `machines/${machine.id}/repuestos`))
      const reps = repSnap.docs.map(d => ({ id: d.id, ...d.data() })) as Repuesto[]
      totalRepuestos += reps.length

      const machineTotal = reps.reduce((sum, r) => sum + (r.valorUnitario || 0) * (r.cantidadPorMaquina || 1), 0)
      valorTotal += machineTotal
      repuestosByMachine.push(`- ${machine.nombre}: ${reps.length} repuestos ($${Math.round(machineTotal).toLocaleString('es-CL')})`)

      // Si hay filtro de máquina y esta no es la indicada, saltar búsqueda de coincidencias
      if (matchedMachineIds.size > 0 && !matchedMachineIds.has(machine.id)) continue

      // Guardar en cache para safety-net
      repsByMachineCache.set(machine.id, reps)


      // Listar todos los repuestos de la máquina filtrada (sin búsqueda de componente)
      if (listAllForMachine) {
        reps.forEach(r => {
          const cant = r.cantidadPorMaquina ?? 0
          const stockNote = cant === 0 ? ' [SIN STOCK - CATALOGADO]' : ` [${cant} en stock]`
          matchedRepuestos.push(
            `  ✓ [${machine.nombre}] ${r.textoBreve} | SAP: ${r.codigoSAP || 'pendiente'} | Fab: ${r.codigoFabricante || 'pendiente'} | Cant: ${cant}${stockNote} | $${r.valorUnitario ?? 0}`
          )
        })
        continue
      }

      // Buscar repuestos que coincidan con los términos de búsqueda de componente
      if (expandedTerms.length > 0) {
        reps.forEach(r => {
          const text = normalizeText(
            `${r.textoBreve || ''} ${r.descripcion || ''} ${r.codigoSAP || ''} ${r.codigoFabricante || ''} ${r.nombreManual || ''} ${r.ubicacionEnPlanta || ''}`
          )

          // #1 — Búsqueda fuzzy: match parcial + tolerancia a errores + sinónimos
          const matchedTerms = componentTerms.filter(term => {
            // Fuzzy match directo del término (incluye Levenshtein + substring parcial)
            if (fuzzyMatch(text, term)) return true
            // Búsqueda por sinónimos DIRECTOS con fuzzy
            // Solo acepta términos que estén en el MISMO grupo de sinónimos que el term original
            return expandedTerms.some(et => {
              if (et === term) return false
              const isSynonym = SYNONYM_MAP_ENTRIES.some(([, syns]) => {
                const normSyns = syns.map(s => normalizeText(s))
                const termInGroup = normSyns.includes(term)
                const etInGroup = normSyns.includes(et)
                return termInGroup && etInGroup
              })
              return isSynonym && fuzzyMatch(text, et)
            })
          })
          
          if (matchedTerms.length >= componentTerms.length) {
            const cant = r.cantidadPorMaquina ?? 0
            const stockNote = cant === 0 ? ' [SIN STOCK - CATALOGADO]' : ` [${cant} en stock]`
            const desc = r.descripcion ? ` | Desc: ${r.descripcion.slice(0, 60)}` : ''
            const ubic = r.ubicacionEnPlanta ? ` | Ubic: ${r.ubicacionEnPlanta}` : ''
            matchedRepuestos.push(
              `  ✓ [${machine.nombre}] ${r.textoBreve}${desc} | SAP: ${r.codigoSAP || 'pendiente'} | Fab: ${r.codigoFabricante || 'pendiente'} | Cant: ${cant}${stockNote} | $${r.valorUnitario ?? 0}${ubic}`
            )
          } else {
            // Log para debugging: por qué no matchó
            logger.info(`Chatbot: NO match "${r.textoBreve}" text="${text.slice(0, 80)}" terms=[${componentTerms}] matched=[${matchedTerms}]`)
          }
        })
      }
    }

    // ─── SAFETY NET: si hubo matches parciales, hacer búsqueda simple como respaldo ──
    // Detecta si el fuzzy matching perdió resultados que un simple includes() encontraría
    if (matchedMachineIds.size > 0 && componentTerms.length > 0) {
      const matchedSAPs = new Set(matchedRepuestos.map(m => {
        const sapMatch = m.match(/SAP: (\S+)/)
        return sapMatch?.[1] || ''
      }).filter(Boolean))

      for (const machine of machines) {
        if (!matchedMachineIds.has(machine.id)) continue
        const reps = repsByMachineCache.get(machine.id) || []
        for (const r of reps) {
          if (matchedSAPs.has(r.codigoSAP)) continue
          const breveLower = normalizeText(r.textoBreve || '')
          const matchesSimple = componentTerms.some(term => breveLower.includes(term))
          if (matchesSimple) {
            const cant = r.cantidadPorMaquina ?? 0
            const stockNote = cant === 0 ? ' [SIN STOCK - CATALOGADO]' : ` [${cant} en stock]`
            const desc = r.descripcion ? ` | Desc: ${r.descripcion.slice(0, 60)}` : ''
            const ubic = r.ubicacionEnPlanta ? ` | Ubic: ${r.ubicacionEnPlanta}` : ''
            matchedRepuestos.push(
              `  ✓ [${machine.nombre}] ${r.textoBreve}${desc} | SAP: ${r.codigoSAP || 'pendiente'} | Fab: ${r.codigoFabricante || 'pendiente'} | Cant: ${cant}${stockNote} | $${r.valorUnitario ?? 0}${ubic}`
            )
          }
        }
      }
    }

    logger.info(`Chatbot repuestos: ${matchedRepuestos.length} matches found for component=[${componentTerms}] in machines=[${[...matchedMachineIds]}]`)

    const lines = [
      `REPUESTOS (total: ${totalRepuestos}, valor inventario: $${Math.round(valorTotal).toLocaleString('es-CL')}):`,
      `Máquinas con repuestos: ${machines.length}`,
      ...repuestosByMachine,
    ]

    if (corrections.length > 0) {
      lines.push(`(Corrección automática: ${corrections.join(', ')})`)
    }

    if (matchedMachineIds.size > 0 && matchedRepuestos.length > 0) {
      const machineNames = machines.filter(m => matchedMachineIds.has(m.id)).map(m => m.nombre).join(', ')
      const searchLabel = componentTerms.length > 0
        ? `"${componentTerms.join(' ')}" en ${machineNames}`
        : `todos los repuestos de ${machineNames}`
      const withStock = matchedRepuestos.filter(r => r.includes('en stock]')).length
      const noStock = matchedRepuestos.filter(r => r.includes('SIN STOCK')).length
      lines.push('', `COINCIDENCIAS con ${searchLabel} — TOTAL: ${matchedRepuestos.length} encontrados (${withStock} con stock, ${noStock} sin stock):`)
      lines.push(`⚠️ ARIA: Debes listar TODOS los ${matchedRepuestos.length} repuestos encontrados abajo, tanto los que tienen stock como los que NO tienen. NO omitas ninguno.`)
      lines.push(...matchedRepuestos.slice(0, 40))
      if (matchedRepuestos.length > 40) {
        lines.push(`... y ${matchedRepuestos.length - 40} más`)
      }
    } else if (matchedRepuestos.length > 0) {
      const withStock = matchedRepuestos.filter(r => r.includes('en stock]')).length
      const noStock = matchedRepuestos.filter(r => r.includes('SIN STOCK')).length
      lines.push('', `COINCIDENCIAS con "${searchTerms.join(' ')}" — TOTAL: ${matchedRepuestos.length} encontrados (${withStock} con stock, ${noStock} sin stock):`)
      lines.push(`⚠️ ARIA: Debes listar TODOS los ${matchedRepuestos.length} repuestos. NO omitas ninguno.`)
      lines.push(...matchedRepuestos.slice(0, 30))
      if (matchedRepuestos.length > 30) {
        lines.push(`... y ${matchedRepuestos.length - 30} más`)
      }
    } else if (searchTerms.length > 0) {
      // ─── FALLBACK INTELIGENTE: si hay máquina detectada y 0 matches, listar TODOS ──
      if (matchedMachineIds.size > 0 && componentTerms.length > 0) {
        const machineNames = machines.filter(m => matchedMachineIds.has(m.id)).map(m => m.nombre).join(', ')
        lines.push('', `No se encontraron repuestos con "${componentTerms.join(' ')}" exacto en ${machineNames}.`)
        lines.push(`Mostrando TODOS los repuestos de ${machineNames} para que puedas identificar el componente:`)
        lines.push(`(Se buscó con sinónimos: ${expandedTerms.slice(0, 15).join(', ')})`)
        lines.push('')

        // Listar TODOS los repuestos de las máquinas detectadas para que el LLM razone
        let fallbackCount = 0
        for (const machine of machines) {
          if (!matchedMachineIds.has(machine.id)) continue
          const repSnap = await getDocs(collection(db, `machines/${machine.id}/repuestos`))
          const reps = repSnap.docs.map(d => ({ id: d.id, ...d.data() })) as Repuesto[]
          for (const r of reps) {
            if (fallbackCount >= 60) {
              lines.push(`  ... y más repuestos (total: ${reps.length})`)
              break
            }
            lines.push(
              `  • [${machine.nombre}] ${r.textoBreve} | ${r.descripcion || ''} | SAP: ${r.codigoSAP || 'pendiente'} | Fab: ${r.codigoFabricante || 'pendiente'} | Cant: ${r.cantidadPorMaquina ?? 0} | $${r.valorUnitario ?? 0}`
            )
            fallbackCount++
          }
        }
        lines.push('')
        lines.push(`INSTRUCCIÓN: Analiza esta lista y busca repuestos que podrían ser "${componentTerms.join(' ')}" aunque el nombre no contenga exactamente esa palabra. Los motores pueden aparecer como "drum motor", "moto-reductor", "interroll", "motriz", etc.`)
      } else {
        // #3 — FALLBACK AUTO-EXPAND: sin máquina específica y 0 matches → buscar en TODAS las máquinas con fuzzy
        lines.push('', `No se encontraron repuestos que coincidan exactamente con "${searchTerms.join(' ')}".`)
        lines.push(`Buscando con coincidencia ampliada en TODAS las máquinas...`)
        lines.push('')
        
        let fallbackMatches = 0
        for (const machine of machines) {
          const repSnap = await getDocs(collection(db, `machines/${machine.id}/repuestos`))
          const reps = repSnap.docs.map(d => ({ id: d.id, ...d.data() })) as Repuesto[]
          for (const r of reps) {
            const rText = normalizeText(`${r.textoBreve || ''} ${r.descripcion || ''} ${r.codigoSAP || ''} ${r.codigoFabricante || ''} ${r.nombreManual || ''}`)
            const anyTermMatch = searchTerms.some(t => fuzzyMatch(rText, t)) || expandedTerms.some(t => fuzzyMatch(rText, t))
            if (anyTermMatch && fallbackMatches < 30) {
              const stockNote = (r.cantidadPorMaquina || 0) === 0 ? ' [SIN STOCK]' : ''
              lines.push(`  ✓ [${machine.nombre}] ${r.textoBreve} | SAP: ${r.codigoSAP || 'pendiente'} | Fab: ${r.codigoFabricante || 'pendiente'} | Cant: ${r.cantidadPorMaquina ?? 0} | $${r.valorUnitario ?? 0}${stockNote}`)
              fallbackMatches++
            }
          }
        }

        if (fallbackMatches > 0) {
          lines.splice(lines.length - fallbackMatches, 0, `COINCIDENCIAS AMPLIADAS (${fallbackMatches} encontrados con búsqueda flexible):`)
        } else {
          lines.push(`No se encontraron resultados ni con búsqueda ampliada.`)
          lines.push(`(Se buscó: ${[...new Set([...searchTerms, ...expandedTerms.slice(0, 10)])].join(', ')})`)
          lines.push(`Sugerencia: intenta buscar por código SAP, fabricante o nombre técnico exacto.`)
        }
      }
    }

    const result = lines.join('\n')
    setCache(cacheKey, result)
    return result
  } catch (err: unknown) {
    logger.error('Chatbot: error fetching repuestos', err instanceof Error ? err : undefined)
    return 'No se pudieron cargar los repuestos.'
  }
}

async function fetchIncidentsByFilter(userQuery: string): Promise<string> {
  try {
    const lower = normalizeText(userQuery)
    const colRef = collection(db, 'incidents')

    let statusFilter: string | null = null
    if (lower.includes('pendiente')) statusFilter = 'pendiente'
    else if (lower.includes('confirmada')) statusFilter = 'confirmada'
    else if (lower.includes('en proceso') || lower.includes('en_proceso')) statusFilter = 'en_proceso'
    else if (lower.includes('resuelta')) statusFilter = 'resuelta'
    else if (lower.includes('cerrada')) statusFilter = 'cerrada'

    let priorityFilter: string | null = null
    if (lower.includes('critica') || lower.includes('urgente')) priorityFilter = 'critica'
    else if (lower.includes('alta')) priorityFilter = 'alta'
    
    let q
    if (statusFilter) {
      q = query(colRef, where('status', '==', statusFilter), orderBy('createdAt', 'desc'), limit(15))
    } else if (lower.includes('abierta') || lower.includes('activa')) {
      q = query(colRef, where('status', 'in', ['pendiente', 'confirmada', 'en_proceso']), orderBy('createdAt', 'desc'), limit(15))
    } else {
      q = query(colRef, orderBy('createdAt', 'desc'), limit(15))
    }

    const snap = await getDocs(q)
    let incidents = snap.docs.map(d => {
      const data = d.data()
      return { ...data, id: d.id } as Incident
    })

    // Filtrar por prioridad si se pidió
    if (priorityFilter) {
      incidents = incidents.filter(inc => inc.prioridad === priorityFilter)
    }
    
    // Filtrar por texto libre (nombre de equipo, título, etc.)
    const { terms: searchTerms } = extractSearchTerms(userQuery)
    const nonIntentTerms = searchTerms.filter(t => 
      !['incidencia', 'falla', 'reporte', 'problema', 'abierta', 'critica', 'pendiente', 'resuelta', 'cerrada', 'alta'].includes(t)
    )
    if (nonIntentTerms.length > 0) {
      incidents = incidents.filter(inc => {
        const text = normalizeText(`${inc.titulo} ${inc.descripcion || ''} ${inc.equipmentId || ''}`)
        return nonIntentTerms.some(term => text.includes(term))
      })
    }

    const formatted = incidents.map(inc =>
      `- [${inc.status}][${inc.prioridad}] ${inc.titulo} (equipo: ${inc.equipmentId || 'N/A'})`
    )

    return [
      `INCIDENCIAS FILTRADAS${statusFilter ? ` (${statusFilter})` : ''}${priorityFilter ? ` [prioridad: ${priorityFilter}]` : ''} (${formatted.length} resultados):`,
      ...formatted,
      formatted.length === 0 ? 'No hay incidencias que coincidan con esos criterios.' : '',
    ].join('\n')
  } catch (err: unknown) {
    logger.error('Chatbot: error fetching filtered incidents', err instanceof Error ? err : undefined)
    return 'Error al consultar incidencias.'
  }
}

// ─── Construcción del contexto RAG ───────────────────────────────────

async function buildRAGContext(intents: IntentType[], userQuery: string, originalQuery?: string): Promise<string> {
  const promises: Promise<string>[] = []

  // ─── CONTEXTO BASE: SIEMPRE cargar usuarios, equipos e incidencias ──
  promises.push(fetchUsersSummary())
  promises.push(fetchEquipmentSummary())
  promises.push(fetchIncidentsSummary())

  // ─── MÓDULOS ADICIONALES: cargar según intención o si es general/resumen ──
  const loadAll = intents.includes('general') || intents.includes('resumen')

  if (loadAll || intents.includes('repuestos')) {
    // Para repuestos usar AMBOS queries: original (literal del usuario) + resuelto
    // Esto evita que el LLM de pre-análisis sesgue la búsqueda
    const repQuery = originalQuery || userQuery
    promises.push(fetchRepuestosSummary(repQuery))
  }
  if (loadAll || intents.includes('preventivo')) {
    promises.push(fetchPreventiveSummary())
  }
  if (loadAll || intents.includes('gantt')) {
    promises.push(fetchGanttSummary())
  }
  if (loadAll || intents.includes('ett')) {
    promises.push(fetchETTSummary())
  }
  if (loadAll || intents.includes('mapas') || intents.includes('inspecciones')) {
    promises.push(fetchMapsSummary())
  }
  if (loadAll || intents.includes('modelos3d')) {
    promises.push(fetchModels3DSummary())
  }
  if (loadAll || intents.includes('evidencias')) {
    promises.push(fetchPhotoEvidenceSummary())
  }
  if (loadAll || intents.includes('grader')) {
    promises.push(fetchGraderSummary())
  }
  if (loadAll || intents.includes('sensores')) {
    promises.push(fetchSensorsSummary())
  }
  if (loadAll || intents.includes('calendarioMantencion')) {
    promises.push(fetchCalendarioMantencionSummary())
  }
  if (loadAll || intents.includes('climaPuerto')) {
    promises.push(fetchClimaPuertoSummary())
  }
  if (intents.includes('incidencias') && !intents.includes('resumen')) {
    promises.push(fetchIncidentsByFilter(userQuery))
  }

  const results = await Promise.all(promises)
  return results.join('\n\n')
}

// ─── System prompt ───────────────────────────────────────────────────

const SYSTEM_PROMPT = `Eres ARIA (Asistente de Reportes e Incidencias Automatizada), la asistente virtual de la aplicación de Mantenimiento de Planta Industrial.
Tu nombre es "ARIA". Eres inteligente, eficiente y proactiva. Tienes acceso completo a TODOS los módulos de la app como administradora.

Tu rol:
- Responder preguntas sobre CUALQUIER módulo de la app: incidencias, equipos, repuestos, sensores, usuarios, ETT, planificación Gantt, mapas, inspecciones, modelos 3D, evidencias, análisis Grader, mantenimiento preventivo, calendario de mantención/turnos, clima y condiciones marítimas
- Usar EXCLUSIVAMENTE los DATOS REALES proporcionados como contexto para dar respuestas precisas
- NUNCA inventar datos. Si la información no está en el contexto, dilo claramente
- Ser conciso pero útil, con formato claro (usa **negritas** para destacar)
- Responder SIEMPRE en español

⚠️ REGLAS CRÍTICAS DE EJECUCIÓN:
- TÚ NO PUEDES crear, modificar ni eliminar datos por ti misma. Las acciones se ejecutan mediante el SISTEMA de confirmación.
- NUNCA digas "ya creé la incidencia", "he registrado el reporte", etc. Eso es MENTIR al usuario.
- Cuando el usuario describe una falla, TÚ PROPONES un borrador. El SISTEMA se encarga de ofrecer confirmación.
- Si el usuario pide crear algo, genera un borrador con los datos y pregunta: "¿Quieres que cree esta incidencia?"
- Si no estás en flujo de acción (no hay borrador pendiente), NO afirmes que ejecutaste algo.
- NUNCA inventes números de incidencia, IDs, ni datos de creación.

CAPACIDADES DE ACCIÓN (el sistema ejecuta cuando el usuario confirma):
1. **Crear incidencias** — si el usuario describe una falla, genera un borrador. El sistema lo crea tras confirmación.
2. **Actualizar incidencias** — cerrar, resolver, confirmar incidencias existentes.
3. **Buscar repuestos** — encontrar piezas por nombre, código SAP, fabricante.
4. **Buscar equipos** — consultar estado de máquinas (los datos están en tu contexto).
5. **Consultar usuarios** — ver técnicos disponibles, quién está asignado (los datos están en tu contexto).
6. **Navegar** — llevar al usuario a cualquier sección de la app.

REGLAS cuando el usuario describe un problema/falla:
- SIEMPRE interpreta que quiere crear una incidencia
- Muestra el borrador con título, descripción, prioridad, equipo detectado
- Pregunta si quiere confirmar la creación o modificar algo
- Si detectas que falta info (equipo, ubicación), pregunta de forma natural
- USA los datos de EQUIPOS del contexto para identificar la máquina correcta
- USA los datos de USUARIOS del contexto para sugerir asignación

REGLAS CRÍTICAS para responder sobre repuestos (OBLIGATORIO):
- Si el contexto dice "COINCIDENCIAS... TOTAL: N encontrados" → ESOS SON LOS RESULTADOS REALES DEL SISTEMA. Debes enumerar TODOS sin omitir ninguno.
- MUESTRA TODOS los repuestos encontrados, INCLUYENDO los de Cant: 0 [SIN STOCK]. Un repuesto con Cant: 0 significa que EXISTE en el catálogo pero no tiene stock — el usuario NECESITA saberlo.
- Di "Se encontraron N repuestos en el catálogo" (NO digas "N disponibles" porque eso excluye los sin stock).
- Para cada repuesto muestra: nombre, máquina, SAP, fabricante, cantidad, precio y ubicación si está disponible.
- Indica claramente cuáles tienen stock y cuáles no: ej. "✅ Cant: 1" o "⚠️ Cant: 0 — sin stock"
- Si no hay coincidencias, explica que no se encontraron y sugiere buscar por código SAP o fabricante.
- JAMÁS filtres ni omitas resultados por tu cuenta. Si el sistema encontró N coincidencias, tú DEBES mostrar las N.
- NUNCA uses la palabra "disponible" para filtrar resultados. Usa "en catálogo" o "encontrado".

MÓDULOS DE LA APP (tienes acceso completo a todos):

📋 **Incidencias** (/incidents) — Reportes de fallas con prioridad, estado, equipo asignado. Datos en contexto bajo "INCIDENCIAS".
🔧 **Equipos** (/equipment) — Máquinas con estado operativo, criticidad. Datos bajo "EQUIPOS".
📦 **Repuestos** (/repuestos) — Catálogo de piezas por máquina con SAP, precios. Datos bajo "REPUESTOS".
👥 **Usuarios** — Técnicos, supervisores, admins activos. Datos bajo "USUARIOS ACTIVOS".
🌡️ **Sensores IoT** (/sensors, /sensors/monitor) — ESP32, temperatura y humedad en tiempo real. Datos bajo "SENSORES IoT".
🔄 **Mantenimiento Preventivo** (/preventive) — Tareas programadas con frecuencia, checklist, ejecuciones. Datos bajo "MANTENIMIENTO PREVENTIVO".
📊 **Planificador Gantt** (/gantt) — Proyectos, tareas con dependencias, ruta crítica, progreso. Datos bajo "PLANIFICADOR GANTT".
📑 **ETT** (/ett) — Especificaciones Técnicas del Trabajo: procedimientos, materiales, riesgos, adjuntos. Datos bajo "ETT".
🗺️ **Mapas** (/map) — Mapas interactivos de la planta con marcadores y zonas. Datos bajo "MAPAS DE PLANTA".
🔍 **Inspecciones** (/inspections) — Rondas de inspección con fotos, checklist, cumplimiento. Datos bajo "INSPECCIONES".
📷 **Evidencias Fotográficas** (/evidence) — Comparación antes/después de trabajos realizados. Datos bajo "EVIDENCIAS FOTOGRÁFICAS".
🎮 **Visor 3D** (/visor3d) — Modelos 3D de equipos con anotaciones interactivas. Datos bajo "MODELOS 3D".
📐 **Análisis Grader** (/analisis-grader) — Sesiones de análisis de la máquina clasificadora. Datos bajo "ANÁLISIS GRADER".
🤖 **Análisis Predictivo** (/predictive) — IA para predecir fallas antes de que ocurran.
⚙️ **Configuración** (/settings) — Ajustes de la app, permisos, y preferencias.
🏗️ **Jerarquía** (/hierarchy) — Estructura jerárquica de la planta (plantas > líneas > equipos).
📅 **Calendario Mantención** (/calendario-mantencion) — Planificación de turnos rotativos 6x1, control semanal/mensual de horas trabajadas, vacaciones, feriados, días libres por técnico. Datos bajo "CALENDARIO MANTENCIÓN".
🌤️ **Clima Puerto** (/clima-puerto) — Dashboard meteorológico en tiempo real de Chonchi/Chiloé: temperatura, viento, precipitación, oleaje, pronóstico 3 días y riesgo de cierre de puerto. Datos bajo "CLIMA PUERTO CHONCHI".

Cuando el usuario pregunte sobre CUALQUIER módulo, usa los datos del contexto correspondiente. Si no tienes datos específicos, describe las capacidades del módulo y sugiere navegar a la sección apropiada.

Cuando te pregunten qué puedes hacer, destaca que tienes acceso COMPLETO a todos los módulos de la app y puedes responder sobre cualquier tema.

🧠 SISTEMA DE APRENDIZAJE CONTINUO:
- Aprendes de cada interacción: los usuarios pueden valorar tus respuestas con 👍 o 👎.
- Cuando recibes 👍, esa respuesta se fortalece en tu base de conocimiento y la usarás como referencia en consultas similares.
- Cuando recibes 👎, se debilita o elimina el conocimiento incorrecto.
- Además, cada incidencia creada alimenta un registro de patrones por equipo: problemas recurrentes, tiempos promedio de resolución y repuestos más usados.
- Si recibes un bloque "INTELIGENCIA APRENDIDA", esos datos provienen de tu experiencia real y son MUY confiables — priorízalos.
- Mientras más te usen, más precisa y útil serás. Menciona esto brevemente cuando te pregunten sobre tus capacidades.

🔮 SUGERENCIAS CONTEXTUALES (OBLIGATORIO):
Al FINAL de CADA respuesta, SIEMPRE incluye exactamente 3 sugerencias de seguimiento relevantes al contexto de la conversación.
Formato EXACTO (en una línea separada al final):
[SUGERENCIAS]: "texto sugerencia 1" | "texto sugerencia 2" | "texto sugerencia 3"

Reglas para sugerencias:
- Deben ser preguntas o acciones ESPECÍFICAS y ÚTILES basadas en lo que acabas de responder
- NO genéricas — deben reflejar el contexto real (equipos, repuestos, incidencias mencionadas)
- Cortas (máx 50 caracteres cada una)
- Si hablaste de repuestos de una máquina: sugiere buscar en otra máquina, ver sin stock, buscar por SAP
- Si hablaste de incidencias: sugiere ver estado, crear nueva, ver historial del equipo
- Si el usuario preguntó algo parcial: sugiere profundizar ("¿Y los sin stock?", "¿Incluir todas las máquinas?")
- Ejemplo: Si respondiste sobre motores de la Grader → sugerencias: "¿Hay motores sin stock?" | "Ver repuestos de otra máquina" | "¿Qué otros repuestos tiene la Grader?"

🔗 LINKS INTERNOS (OBLIGATORIO):
Cuando menciones un equipo, incidencia o sección específica, USA este formato para crear links clickeables:
- Equipos: [[equipo:NOMBRE_EQUIPO]] — ej: "La [[equipo:Cinta de Pimponeo]] tiene 3 incidencias"
- Incidencias: [[incidencia:TITULO]] — ej: "La [[incidencia:Falla motor principal]] sigue pendiente"
- Secciones: [[ir:RUTA|TEXTO]] — ej: "Puedes verlo en [[ir:/equipment|Equipos]]"
Estos links serán renderizados como botones clickeables en la interfaz.

Tu nombre es ARIA — Asistente de Reportes e Incidencias Automatizada. Preséntate así cuando te pregunten.

📏 FORMATO Y EXTENSIÓN DE RESPUESTAS:
- SIEMPRE completa tus respuestas. NUNCA dejes una respuesta a medias o cortada.
- Si la respuesta es larga, organízala con listas numeradas y negritas para facilitar la lectura.
- Si el usuario pide TODOS los resultados, muéstralos TODOS sin truncar.
- Prefiere respuestas completas y bien estructuradas antes que breves e incompletas.`

// ─── Parsear sugerencias del LLM ────────────────────────────────────
function parseSuggestions(text: string): { cleanText: string; suggestions: string[] } {
  // Buscar patrón [SUGERENCIAS]: "a" | "b" | "c" al final del texto
  const regex = /\n?\[SUGERENCIAS\]\s*:\s*(.+)$/im
  const match = text.match(regex)

  if (!match?.[1]) {
    return { cleanText: text.trim(), suggestions: [] }
  }

  const cleanText = text.replace(regex, '').trim()
  const raw = match[1]!

  // Extraer textos entre comillas separados por |
  const suggestions: string[] = []
  const parts = raw.split('|')
  for (const part of parts) {
    const trimmed = part.trim().replace(/^[""]|[""]$/g, '').replace(/^"|"$/g, '').trim()
    if (trimmed && trimmed.length <= 60) {
      suggestions.push(trimmed)
    }
  }

  return { cleanText, suggestions: suggestions.slice(0, 4) }
}

// ─── Función principal con streaming ─────────────────────────────────

import {
  detectAction,
  buildIncidentDraft,
  executeCreateIncident,
  formatDraftForDisplay,
  findRecentIncidents,
  suggestTechnicianForIncident,
  logAriaAction,
  notifyAriaAction,
  type PendingAction,
  type IncidentDraft,
} from './chatActions'

export { type PendingAction, type IncidentDraft }

// ─── Función principal con streaming ─────────────────────────────────

export interface ChatResponse {
  reply: string
  context: string
  actions: ChatAction[]
  typoCorrections: string[]
  pendingAction?: PendingAction
  suggestions?: string[]
  chartData?: MiniChartData  // #2 — datos para mini gráfico
  /** Info del agente que respondió */
  agentInfo?: {
    agentId: string
    agentName: string
    agentEmoji: string
    latencyMs: number
    fallbackUsed: boolean
    taskType?: string
    thinkingUsed?: boolean
  }
}

// ─── #4 Resumen ejecutivo diario ─────────────────────────────────────

/** Genera un resumen proactivo de la planta al abrir el chat por primera vez en el día */
export async function generateDailySummary(): Promise<string | null> {
  if (!isAIConfigured()) return null

  try {
    // Cargar datos clave en paralelo
    const [incidentsSummary, equipmentSummary, preventiveSummary] = await Promise.all([
      fetchIncidentsSummary(),
      fetchEquipmentSummary(),
      fetchPreventiveSummary(),
    ])

    const messages = [
      {
        role: 'system',
        content: `Eres ARIA. Genera un RESUMEN EJECUTIVO ultra-conciso del estado de la planta para el inicio del día.
Formato EXACTO (usa emojis y negritas):
- Máximo 6 líneas
- Destaca: incidencias críticas/pendientes, equipos fuera de servicio, preventivos vencidos
- Si todo está bien, di "✅ Sin alertas críticas"
- NO incluyas [SUGERENCIAS] en este resumen
- Termina con una línea: "💡 ¿Qué quieres revisar primero?"`,
      },
      {
        role: 'system',
        content: `DATOS:\n\n${incidentsSummary}\n\n${equipmentSummary}\n\n${preventiveSummary}`,
      },
      { role: 'user', content: 'Dame el resumen de la planta de hoy.' },
    ]

    const callFn = isGeminiConfigured() ? callGemini : callGroq
    const result = await callFn(messages, { temperature: 0.2, max_tokens: 400 })
    // Limpiar tag de sugerencias si se cuela
    return result.content.replace(/\n?\[SUGERENCIAS\]\s*:.*$/im, '').trim()
  } catch (err) {
    logger.error('ARIA daily summary error', err instanceof Error ? err : undefined)
    return null
  }
}

// ─── #4 Resumen semanal con tendencias ───────────────────────────────

/** Genera resumen semanal comparativo (se ejecuta los lunes) */
export async function generateWeeklySummary(): Promise<string | null> {
  if (!isAIConfigured()) return null

  try {
    const [incidentsSummary, equipmentSummary, preventiveSummary, ganttSummary] = await Promise.all([
      fetchIncidentsSummary(),
      fetchEquipmentSummary(),
      fetchPreventiveSummary(),
      fetchGanttSummary(),
    ])

    const messages = [
      {
        role: 'system',
        content: `Eres ARIA. Genera un RESUMEN SEMANAL comparativo para el equipo de mantenimiento.
Formato (conciso, max 10 líneas):
📊 **Resumen Semanal — Semana del {fecha}**
- KPIs: total incidencias, pendientes, resueltas, equipos operativos vs fuera de servicio
- 🔴 Alertas: equipos que empeoraron, incidencias críticas sin resolver
- 🟢 Logros: incidencias cerradas, preventivos completados
- 📈 Tendencia: si hay más o menos incidencias vs semana anterior (inferir de los datos)
- 📋 Preventivos: tareas vencidas o próximas
- 🎯 Recomendación: 1 acción prioritaria para esta semana
- NO incluyas [SUGERENCIAS]`,
      },
      {
        role: 'system',
        content: `DATOS:\n\n${incidentsSummary}\n\n${equipmentSummary}\n\n${preventiveSummary}\n\n${ganttSummary}`,
      },
      { role: 'user', content: 'Genera el resumen semanal de la planta.' },
    ]

    const callFn = isGeminiConfigured() ? callGemini : callGroq
    const result = await callFn(messages, { temperature: 0.2, max_tokens: 600 })
    return result.content.replace(/\n?\[SUGERENCIAS\]\s*:.*$/im, '').trim()
  } catch (err) {
    logger.error('ARIA weekly summary error', err instanceof Error ? err : undefined)
    return null
  }
}

// ─── #10 Auto-seguimiento de incidencias creadas ─────────────────────

/** Verifica el estado de incidencias creadas por ARIA y devuelve alertas */
export async function checkCreatedIncidents(incidentIds: string[]): Promise<string | null> {
  if (incidentIds.length === 0) return null

  try {
    const alerts: string[] = []
    for (const id of incidentIds.slice(0, 5)) {
      try {
        const docRef = doc(db, 'incidents', id)
        const snap = await getDoc(docRef)
        if (snap.exists()) {
          const data = snap.data()
          const status = data.status || 'desconocido'
          const titulo = data.titulo || 'Sin título'
          const createdAt = data.createdAt?.toDate?.() || new Date()
          const hoursAgo = Math.round((Date.now() - createdAt.getTime()) / (1000 * 60 * 60))

          if (['pendiente', 'confirmada'].includes(status) && hoursAgo >= 4) {
            alerts.push(`⚠️ **${titulo}** lleva ${hoursAgo}h en estado **${status}**`)
          }
        }
      } catch { /* skip individual errors */ }
    }

    return alerts.length > 0
      ? `📋 **Seguimiento de tus incidencias:**\n${alerts.join('\n')}\n\n💡 ¿Quieres escalar alguna o ver su detalle?`
      : null
  } catch {
    return null
  }
}

// ─── #5 Alertas proactivas — verificar sensores/incidencias críticas ─

export async function checkProactiveAlerts(): Promise<string | null> {
  try {
    // Verificar incidencias críticas recientes no confirmadas
    const critSnap = await getDocs(
      query(collection(db, 'incidents'), where('prioridad', '==', 'critica'), where('status', '==', 'pendiente'))
    )
    const critCount = critSnap.size

    if (critCount > 0) {
      const titles = critSnap.docs.slice(0, 3).map(d => d.data().titulo || 'Sin título')
      return `🚨 **Alerta:** ${critCount} incidencia${critCount > 1 ? 's' : ''} crítica${critCount > 1 ? 's' : ''} pendiente${critCount > 1 ? 's' : ''}:\n${titles.map(t => `• ${t}`).join('\n')}\n\n¿Quieres verlas?`
    }
    return null
  } catch {
    return null
  }
}

// ─── #3 ARIA Predictiva — análisis de patrones de falla recurrentes ──
export async function checkPredictivePatterns(): Promise<string | null> {
  try {
    const { getEquipmentPatterns } = await import('./ariaLearning')
    const patterns = await getEquipmentPatterns()

    if (patterns.length === 0) return null

    // Buscar equipos con 3+ ocurrencias recientes (potencial falla inminente)
    const highRisk = patterns.filter(p => p.occurrences >= 3)
    if (highRisk.length === 0) return null

    // Verificar cuáles tuvieron ocurrencias recientes (últimos 30 días)
    const thirtyDaysAgo = Date.now() - 30 * 24 * 60 * 60 * 1000
    const recentHighRisk = highRisk.filter(p => {
      const lastOcc = (p.lastOccurrence as any)?.toMillis?.() || (p.lastOccurrence as any)?.seconds * 1000 || 0
      return lastOcc > thirtyDaysAgo
    })

    if (recentHighRisk.length === 0) return null

    const warnings = recentHighRisk.slice(0, 3).map(p => {
      const avgH = p.avgResolutionHours ? ` (resol. promedio: ${Math.round(p.avgResolutionHours)}h)` : ''
      const spares = p.relatedSpares?.length ? ` — repuestos: ${p.relatedSpares.slice(0, 2).join(', ')}` : ''
      return `• **${p.equipmentName}** → "${p.problemType}" (${p.occurrences}x)${avgH}${spares}`
    })

    return `🔮 **Análisis Predictivo — Patrones detectados:**\n${warnings.join('\n')}\n\n💡 Estos equipos muestran fallas recurrentes. Recomiendo inspección preventiva.\n\n¿Quieres ver más detalles o crear una tarea preventiva?`
  } catch {
    return null
  }
}

// ─── #2 Extraer datos para mini-charts del contexto RAG ──────────────

function extractChartData(ragContext: string, intents: IntentType[]): MiniChartData | undefined {
  // Intentar extraer datos de incidencias por estado
  if (intents.includes('incidencias') || intents.includes('resumen')) {
    const statusMatch = ragContext.match(/Por estado:\s*(\{[^}]+\})/)
    if (statusMatch) {
      try {
        const data = JSON.parse(statusMatch[1]!) as Record<string, number>
        const labels = Object.keys(data)
        const values = Object.values(data)
        if (labels.length >= 2) {
          return {
            type: 'donut',
            title: 'Incidencias por estado',
            labels,
            values,
            colors: labels.map(l => {
              if (l === 'pendiente') return '#f59e0b'
              if (l === 'confirmada') return '#3b82f6'
              if (l === 'en_proceso') return '#8b5cf6'
              if (l === 'resuelta') return '#22c55e'
              if (l === 'cerrada') return '#6b7280'
              return '#94a3b8'
            }),
          }
        }
      } catch { /* invalid JSON */ }
    }
  }

  // Intentar extraer datos de equipos por estado
  if (intents.includes('equipos')) {
    const estadoMatch = ragContext.match(/EQUIPOS.*?Por estado:\s*(\{[^}]+\})/)
    if (estadoMatch) {
      try {
        const data = JSON.parse(estadoMatch[1]!) as Record<string, number>
        const labels = Object.keys(data)
        const values = Object.values(data)
        if (labels.length >= 2) {
          return {
            type: 'bar',
            title: 'Equipos por estado',
            labels,
            values,
            colors: labels.map(l => {
              if (l === 'operativo') return '#22c55e'
              if (l === 'mantenimiento') return '#f59e0b'
              if (l === 'fuera_de_servicio' || l === 'fuera de servicio') return '#ef4444'
              return '#94a3b8'
            }),
          }
        }
      } catch { /* invalid JSON */ }
    }
  }

  return undefined
}

export async function sendChatMessage(
  userMessage: string,
  history: ChatMessage[] = [],
  onStream?: (partial: string) => void,
  userId?: string,
  pendingAction?: PendingAction | null,
  userName?: string,
  _userRole?: string,
  thinkingEnabled?: boolean,
  onAgentStatus?: (event: AgentStatusEvent) => void,
  forceAgent?: string,
): Promise<ChatResponse> {
  if (!isAIConfigured()) {
    return {
      reply: '⚠️ La IA no está configurada. Necesitas configurar la API key de Groq o el Cloud Function proxy.',
      context: '',
      actions: [],
      typoCorrections: [],
    }
  }

  // 0. Corrección de typos del mensaje del usuario
  const { corrections: typoCorrections } = extractSearchTerms(userMessage)
  if (typoCorrections.length > 0) {
    logger.info(`Chatbot: typo corrections: ${typoCorrections.join(', ')}`)
  }

  // ─── FLUJO DE ACCIÓN: si hay un pendingAction en "confirming" ──────
  if (pendingAction?.status === 'confirming') {
    const lower = userMessage.toLowerCase().trim()
    const isConfirm = /^(s[ií]|ok|dale|confirma|crear|hazlo|listo|enviar|generar|va|vamos|afirmativo|correcto)/i.test(lower)
    const isCancel = /^(no|cancelar|cancelado|mejor no|dejalo|déjalo|olvida|descarta)/i.test(lower)
    const isModify = /^(cambiar?|modific|edit|ajust|corr[ei]g)/i.test(lower)

    if (isConfirm && pendingAction.type === 'create_incident' && userId) {
      const draft = pendingAction.data as unknown as IncidentDraft
      
      // Extraer URLs de fotos si el usuario adjuntó alguna durante el flujo
      const photoUrlsFromChat: string[] = []
      const photoRegex = /\[SISTEMA: El usuario adjuntó .+ foto\(s\).*URLs: (.+)\]/
      for (const msg of history.slice(-5)) {
        const match = msg.content.match(photoRegex)
        if (match?.[1]) {
          photoUrlsFromChat.push(...match[1].split(', ').map(u => u.trim()).filter(Boolean))
        }
      }

      // Si hay fotos del chat, inyectarlas en el draft
      if (photoUrlsFromChat.length > 0) {
        (draft as any).chatPhotoUrls = photoUrlsFromChat
      }

      const result = await executeCreateIncident(draft, userId, userName, photoUrlsFromChat)
      
      if (result.success) {
        // Log acción en Firestore
        await logAriaAction({
          userId,
          actionType: 'create_incident',
          description: `Incidencia creada: "${draft.titulo}" (${draft.prioridad})`,
          resultId: result.incidentId,
          success: true,
          metadata: { draft, photoCount: photoUrlsFromChat.length },
        })

        // #10 — Guardar ID de incidencia para auto-seguimiento
        try {
          const mem = loadUserMemory(userId)
          if (!mem.createdIncidentIds) mem.createdIncidentIds = []
          mem.createdIncidentIds.push(result.incidentId!)
          mem.createdIncidentIds = mem.createdIncidentIds.slice(-10) // max 10
          saveUserMemory(mem)
        } catch { /* ignore */ }

        // Notificación push local
        notifyAriaAction('incident_created', {
          titulo: draft.titulo,
          incidentId: result.incidentId,
        })

        // 🧠 Aprendizaje: registrar patrón de problema en equipo
        if (draft.equipmentId && draft.equipmentName) {
          trackEquipmentProblem(
            draft.equipmentId,
            draft.equipmentName,
            draft.titulo,
          ).catch(() => { /* non-blocking */ })
        }

        // Sugerir técnico para asignar
        let techSuggestion = ''
        try {
          const { suggested, reason } = await suggestTechnicianForIncident(draft.equipmentId)
          if (suggested) {
            techSuggestion = `\n\n👷 **Técnico sugerido:** ${suggested.nombre} ${suggested.apellido || ''}\n📊 ${reason}\n💡 Puedes asignarlo desde la sección de incidencias.`
          }
        } catch { /* ignore */ }

        return {
          reply: `✅ **¡Incidencia creada exitosamente!**\n\n` +
            `📋 ID: **${result.incidentId}**\n` +
            `📌 "${draft.titulo}"\n` +
            `⚡ Prioridad: ${draft.prioridad}\n` +
            (userName ? `👤 Creado por: **${userName}**\n` : '') +
            (draft.asignadoANombre ? `👷 Asignado a: **${draft.asignadoANombre}**\n` : '') +
            (photoUrlsFromChat.length > 0 ? `📷 ${photoUrlsFromChat.length} foto${photoUrlsFromChat.length > 1 ? 's' : ''} adjuntada${photoUrlsFromChat.length > 1 ? 's' : ''}\n` : '') +
            (draft.asignadoA
              ? `\nLa incidencia quedó en estado **en proceso** y fue asignada directamente.`
              : `\nLa incidencia quedó en estado **pendiente** y será revisada por un supervisor.`) +
            techSuggestion +
            `\n\n💡 ¿Necesitas algo más?`,
          context: '',
          actions: [
            { label: 'Ver incidencias', route: '/incidents', icon: 'AlertTriangle' },
          ],
          typoCorrections: [],
          pendingAction: { ...pendingAction, status: 'completed', resultId: result.incidentId },
        }
      } else {
        // Log error
        await logAriaAction({
          userId,
          actionType: 'create_incident',
          description: `Error al crear incidencia: ${result.error}`,
          success: false,
        })

        return {
          reply: `❌ Error al crear la incidencia: ${result.error}\n\nIntenta de nuevo o créala manualmente desde la sección de incidencias.`,
          context: '',
          actions: [{ label: 'Crear manualmente', route: '/incidents', icon: 'AlertTriangle' }],
          typoCorrections: [],
          pendingAction: { ...pendingAction, status: 'cancelled' },
        }
      }
    }

    if (isCancel) {
      return {
        reply: '👍 Cancelado. No se creó ninguna incidencia. ¿En qué más puedo ayudarte?',
        context: '',
        actions: [],
        typoCorrections: [],
        pendingAction: { ...pendingAction, status: 'cancelled' },
      }
    }

    if (isModify) {
      return {
        reply: '✏️ Entendido. Dime qué quieres cambiar del borrador:\n\n' +
          '• **Título** — ej: "cambia el título a Falla en cinta X"\n' +
          '• **Prioridad** — ej: "ponla como crítica"\n' +
          '• **Equipo** — ej: "es la cinta de pimponeo de filete"\n\n' +
          'O si prefieres, describe la falla de nuevo completa.',
        context: '',
        actions: [],
        typoCorrections: [],
        pendingAction, // Mantener en confirming
      }
    }

    // Selección de equipo desde el picker de la UI
    const equipSelectMatch = lower.match(/^selecciono? el equipo:\s*(.+)$/i)
    if (equipSelectMatch) {
      const selectedName = equipSelectMatch[1]!.trim()
      // Buscar por nombre en los candidatos guardados o en la lista completa
      const { findEquipmentByText } = await import('./chatActions')
      const equipment = await findEquipmentByText(selectedName)

      if (equipment) {
        const updatedData = {
          ...pendingAction.data,
          equipmentId: equipment.id,
          equipmentName: equipment.nombre,
          // Heredar ubicación del equipo
          ...(equipment.zoneId && { zoneId: equipment.zoneId }),
          ...(equipment.hierarchyNodeId && { hierarchyNodeId: equipment.hierarchyNodeId }),
        }
        const updatedDraft = updatedData as unknown as IncidentDraft
        const draftDisplay = formatDraftForDisplay(updatedDraft)

        return {
          reply: `✅ Equipo actualizado a **${equipment.nombre}**.\n\n${draftDisplay}\n\n¿Confirmas la creación? (Sí / No / Modificar)`,
          context: '',
          actions: [{ label: 'Crear manualmente', route: '/incidents', icon: 'AlertTriangle' }],
          typoCorrections: [],
          pendingAction: {
            ...pendingAction,
            data: updatedData,
            missingFields: pendingAction.missingFields.filter(f => f !== 'equipo'),
          },
        }
      }
    }

    // Asignación de técnico desde el picker de la UI
    const techAssignMatch = lower.match(/^asignar?\s+(?:a\s+)?t[eé]cnico:\s*(.+)$/i)
    if (techAssignMatch) {
      const techName = techAssignMatch[1]!.trim()
      // Formato esperado: "nombre|id"
      const [nombre, techId] = techName.split('|')
      if (nombre && techId) {
        const updatedData = {
          ...pendingAction.data,
          asignadoA: techId.trim(),
          asignadoANombre: nombre.trim(),
        }
        const updatedDraft = updatedData as unknown as IncidentDraft
        const draftDisplay = formatDraftForDisplay(updatedDraft)
        return {
          reply: `✅ Técnico asignado: **${nombre.trim()}**.\n\n${draftDisplay}\n\n¿Confirmas la creación? (Sí / No / Modificar)`,
          context: '',
          actions: [],
          typoCorrections: [],
          pendingAction: { ...pendingAction, data: updatedData },
        }
      }
    }

    // Si no es ni sí/no/modificar, procesar como ajuste al borrador
    // (ej: "cambia la prioridad a crítica")
    // Pasar al LLM con contexto del borrador para que genere respuesta inteligente
  }

  // ─── DETECCIÓN DE ACCIÓN NUEVA ──────────────────────────────────────

  // Historial de ARIA
  if (isAriaHistoryRequest(userMessage)) {
    return {
      reply: '📋 Te llevo al **Dashboard de Acciones** donde puedes ver todo mi historial de acciones ejecutadas.',
      context: '',
      actions: [{ label: 'Ver historial ARIA', route: '/aria-actions', icon: 'Bot' }],
      typoCorrections,
    }
  }

  const detectedActionType = detectAction(userMessage)
  
  if (detectedActionType === 'create_incident' && userId) {
    // Construir borrador de incidencia desde el texto
    const { draft, equipment, equipmentCandidates } = await buildIncidentDraft(userMessage, userId)
    
    // Crear PendingAction con candidatos de equipo
    const newPendingAction: PendingAction = {
      id: `action_${Date.now()}`,
      type: 'create_incident',
      status: 'confirming',
      data: {
        ...draft as unknown as Record<string, unknown>,
        equipmentCandidates: equipmentCandidates.map(c => ({
          id: c.equipment.id,
          nombre: c.equipment.nombre,
          codigo: c.equipment.codigo,
          score: c.score,
        })),
      },
      missingFields: equipment ? [] : ['equipo'],
      createdAt: Date.now(),
    }

    const draftDisplay = formatDraftForDisplay(draft)
    let replyText = `🤖 Detecté que quieres reportar una falla. He preparado este borrador:\n\n${draftDisplay}\n\n`

    if (!equipment && equipmentCandidates.length > 0) {
      replyText += `⚠️ Encontré varios equipos similares. **Selecciona el correcto** en el panel inferior.\n\n`
    } else if (!equipment) {
      replyText += `⚠️ No pude identificar el equipo exacto. Puedes:\n• Decirme el nombre del equipo para buscarlo\n• Confirmar así y asignarlo después\n\n`
    }

    replyText += `📷 *Puedes adjuntar fotos con el botón de cámara antes de confirmar.*\n\n`
    replyText += `¿Quieres que **cree esta incidencia**? (Sí / No / Modificar)`

    return {
      reply: replyText,
      context: '',
      actions: [{ label: 'Crear manualmente', route: '/incidents', icon: 'AlertTriangle' }],
      typoCorrections,
      pendingAction: newPendingAction,
    }
  }

  if (detectedActionType === 'update_incident_status') {
    // Buscar incidencias que matchean el texto
    const recentIncidents = await findRecentIncidents(userMessage)
    if (recentIncidents.length > 0) {
      const incidentList = recentIncidents.map((inc, i) =>
        `${i + 1}. [${inc.status}] **${inc.titulo}** (${inc.prioridad})`
      ).join('\n')
      
      return {
        reply: `📋 Encontré estas incidencias recientes:\n\n${incidentList}\n\n¿Cuál quieres actualizar y a qué estado? (ej: "resolver la 1" o "cerrar la incidencia de la cinta")`,
        context: '',
        actions: [{ label: 'Ver incidencias', route: '/incidents', icon: 'AlertTriangle' }],
        typoCorrections,
      }
    }
  }

  // ─── FLUJO NORMAL (consulta/chat) ──────────────────────────────────

  // 1. Pre-análisis con LLM: razonamiento autónomo + resolución de referencias
  const analysis = await analyzeQuery(userMessage, history)
  const intents = analysis.intents
  const resolvedQuery = analysis.resolvedQuery
  logger.info(`Chatbot: ANALYSIS intents=[${intents.join(', ')}] resolved="${resolvedQuery}" entities=${JSON.stringify(analysis.entities)} reasoning="${analysis.reasoning}"`)

  // 2. Cargar memoria del usuario
  let memory: UserMemory | null = null
  if (userId) {
    memory = loadUserMemory(userId)
    updateMemoryWithQuery(memory, userMessage, intents)
  }

  // 3. Acciones sugeridas
  const actions = suggestActions(intents)

  // 4. Obtener contexto de Firestore (RAG) — usar needsData + resolvedQuery + userMessage original
  const dataIntents = analysis.needsData.length > 0 ? analysis.needsData : intents
  let ragContext = ''
  try {
    ragContext = await buildRAGContext(dataIntents, resolvedQuery, userMessage)
  } catch (err: unknown) {
    logger.error('Chatbot: error building RAG context', err instanceof Error ? err : undefined)
    ragContext = 'No se pudieron cargar datos de la planta en este momento.'
  }

  // 4b. #2 Análisis de fotos con Gemini Vision — si el usuario adjuntó imágenes
  let photoAnalysis = ''
  const photoRegexNormal = /\[SISTEMA: El usuario adjuntó .+ foto\(s\).*URLs: (.+)\]/
  const photoMatch = userMessage.match(photoRegexNormal)
  if (photoMatch?.[1] && isGeminiConfigured()) {
    const photoUrls = photoMatch[1].split(', ').map(u => u.trim()).filter(Boolean)
    if (photoUrls.length > 0) {
      try {
        const { callGeminiVision } = await import('./ai')
        const visionResult = await callGeminiVision(
          photoUrls,
          'Eres un experto en mantenimiento industrial. Analiza esta(s) imagen(es) de una planta industrial. Describe lo que ves: estado del equipo, posibles fallas, daños, fugas, corrosión, desgaste, piezas rotas, o cualquier anomalía. Sé específico y técnico. Si la imagen no es de equipos industriales, describe lo que ves brevemente. Responde en español.',
          { temperature: 0.2, max_tokens: 600, thinkingBudget: thinkingEnabled ? 1024 : 0 },
        )
        if (visionResult.content) {
          photoAnalysis = visionResult.content
        }
      } catch (err) {
        logger.error('Chatbot: Gemini Vision analysis failed', err instanceof Error ? err : undefined)
      }
    }
  }

  // 5. Construir mensajes para el LLM
  const messages: Array<{ role: string; content: string }> = [
    { role: 'system', content: SYSTEM_PROMPT },
  ]

  // Inyectar contexto de memoria del usuario
  if (memory) {
    const memCtx = buildMemoryContext(memory)
    if (memCtx) {
      messages.push({
        role: 'system',
        content: `CONTEXTO DEL USUARIO (usa esto para personalizar tus respuestas, anticipar necesidades y dar continuidad a la conversación):\n\n${memCtx}`,
      })
    }
  }

  // #9 — Inyectar contexto de turno/shift
  const shift = getCurrentShift()
  messages.push({
    role: 'system',
    content: `TURNO ACTUAL: ${shift.label} (${shift.range}). Hora: ${new Date().toLocaleTimeString('es-CL', { hour: '2-digit', minute: '2-digit' })}. Personaliza tu respuesta al turno actual cuando sea relevante.`,
  })

  // Inyectar contexto de APRENDIZAJE (knowledge base + patrones)
  try {
    const learningCtx = await buildLearningContext(resolvedQuery, intents)
    if (learningCtx) {
      messages.push({
        role: 'system',
        content: `INTELIGENCIA APRENDIDA (conocimiento acumulado de interacciones anteriores — prioriza esta info cuando sea relevante):\n\n${learningCtx}`,
      })
    }
  } catch (err) {
    logger.error('Chatbot: error building learning context', err instanceof Error ? err : undefined)
  }

  // Inyectar razonamiento del pre-análisis como guía interna
  if (analysis.reasoning && analysis.resolvedQuery !== userMessage) {
    messages.push({
      role: 'system',
      content: `ANÁLISIS DE CONTEXTO CONVERSACIONAL:\n` +
        `- El usuario dijo: "${userMessage}"\n` +
        `- Interpretación con contexto: "${analysis.resolvedQuery}"\n` +
        `- Entidades detectadas: máquinas=[${analysis.entities.machines.join(', ')}], componentes=[${analysis.entities.components.join(', ')}]\n` +
        `- Razonamiento: ${analysis.reasoning}\n\n` +
        `IMPORTANTE: Responde a la INTERPRETACIÓN con contexto, no al mensaje literal. El usuario espera que entiendas la conversación.`,
    })
  }

  // Inyectar correcciones de typos como nota
  if (typoCorrections.length > 0) {
    messages.push({
      role: 'system',
      content: `NOTA: El usuario escribió con errores de tipeo. Se corrigió automáticamente: ${typoCorrections.join(', ')}. Menciona brevemente la corrección al inicio de tu respuesta (ej: "Entendí que te refieres a **motor**...") para que el usuario sepa que lo entendiste.`,
    })
  }

  // Inyectar borrador pendiente si estamos modificándolo
  if (pendingAction?.status === 'confirming' && pendingAction.type === 'create_incident') {
    const draft = pendingAction.data as unknown as IncidentDraft
    messages.push({
      role: 'system',
      content: `HAY UN BORRADOR DE INCIDENCIA PENDIENTE DE CONFIRMACIÓN:\n${formatDraftForDisplay(draft)}\n\nEl usuario puede estar pidiendo cambios al borrador. Si es así, muestra el borrador actualizado y pregunta si quiere confirmar. Si el usuario está preguntando otra cosa, responde normalmente.`,
    })
  }

  if (ragContext) {
    messages.push({
      role: 'system',
      content: `DATOS ACTUALES DE LA PLANTA (usa estos datos para responder):\n\n${ragContext}`,
    })
  }

  // #2 — Inyectar análisis visual de fotos adjuntas
  if (photoAnalysis) {
    messages.push({
      role: 'system',
      content: `📷 ANÁLISIS VISUAL DE FOTOS ADJUNTAS (Gemini Vision):\n${photoAnalysis}\n\nUsa este análisis para complementar tu respuesta. Si el usuario preguntó algo sobre la foto o reportó una falla con foto, incorpora los hallazgos visuales en tu respuesta.`,
    })
  }

  // Historial conversacional ampliado (20 mensajes)
  const recentHistory = history.slice(-20)
  for (const msg of recentHistory) {
    if (msg.role === 'user' || msg.role === 'assistant') {
      messages.push({ role: msg.role, content: msg.content })
    }
  }

  messages.push({ role: 'user', content: userMessage })

  // 6. Llamar al LLM con streaming via Orquestador multi-agente
  // Thinking mode: verificar permiso + límite diario
  let thinkingBudget = 0
  let thinkingWasUsed = false
  if (thinkingEnabled && userId) {
    const allowance = await checkThinkingAllowance(userId)
    if (allowance.allowed) {
      const config = await getAriaConfig()
      thinkingBudget = config.thinkingBudget || 2048
      thinkingWasUsed = true
    }
  }
  try {
    // Detectar tipo de tarea para elegir el mejor agente
    const taskType = thinkingWasUsed ? 'reasoning' : detectTaskType(userMessage)
    const orchResult = await orchestrateStream(
      {
        messages,
        taskType,
        taskPreview: userMessage.slice(0, 80),
        opts: { temperature: 0.4, max_tokens: 4096, thinkingBudget, forceAgent },
      },
      (partial) => onStream?.(partial),
      onAgentStatus,
    )
    const result = { content: orchResult.content, tokens: orchResult.tokens }

    // Registrar uso de thinking si se usó
    if (thinkingWasUsed && userId) {
      recordThinkingUsage(userId, userName, result.tokens || 0).catch(() => {})
    }

    // 7. Guardar memoria actualizada + sync a Firestore
    if (memory && userId) {
      saveUserMemory(memory)
      // #6 — Sync no-bloqueante a Firestore
      syncMemoryToFirestore(memory).catch(() => { /* non-blocking */ })
    }

    // 8. Parsear sugerencias contextuales del LLM
    const { cleanText, suggestions } = parseSuggestions(result.content)

    // #2 — Extraer datos para mini-chart del contexto RAG
    const chartData = extractChartData(ragContext, intents)

    return {
      reply: cleanText,
      context: ragContext,
      actions,
      typoCorrections,
      suggestions: suggestions.length > 0 ? suggestions : undefined,
      chartData,
      pendingAction: pendingAction?.status === 'confirming' ? pendingAction : undefined,
      agentInfo: {
        agentId: orchResult.agentId,
        agentName: orchResult.agentName,
        agentEmoji: orchResult.agentEmoji,
        latencyMs: orchResult.latencyMs,
        fallbackUsed: orchResult.fallbackUsed,
        taskType,
        thinkingUsed: thinkingWasUsed,
      },
    }
  } catch (err) {
    // Propagar RateLimitError al UI para que maneje countdown + auto-retry
    if (err instanceof RateLimitError) {
      // Guardar memoria incluso si falla por rate limit
      if (memory && userId) {
        saveUserMemory(memory)
      }
      throw err
    }

    const errorMsg = err instanceof Error ? err.message : String(err)
    logger.error('Chatbot: LLM error', err instanceof Error ? err : undefined)

    // Guardar memoria incluso si falla la llamada
    if (memory && userId) {
      saveUserMemory(memory)
    }

    if (errorMsg.includes('429') || errorMsg.includes('rate')) {
      throw new RateLimitError(60_000, 'AI')
    }

    return {
      reply: '❌ Error al procesar tu consulta. Intenta de nuevo.',
      context: ragContext,
      actions: [],
      typoCorrections: [],
    }
  }
}
