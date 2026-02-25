/**
 * Servicio de Chatbot con RAG (Retrieval-Augmented Generation)
 * v3 — Memoria por usuario, corrección de typos, contexto conversacional
 */
import { collection, getDocs, query, where, orderBy, limit } from 'firebase/firestore'
import { db } from './firebase'
import { callGroqStream, isAIConfigured } from './ai'
import { logger } from '@/lib/logger'
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
  | 'general'

// ─── Memoria por usuario ─────────────────────────────────────────────
export interface UserMemory {
  userId: string
  topics: Record<string, number>      // tema → nº de veces consultado
  lastQueries: string[]               // últimas 20 queries
  preferences: Record<string, string> // preferencias detectadas (ej. máquina favorita)
  updatedAt: number
}

const MEMORY_PREFIX = 'chatbot_memory_'
const MEMORY_MAX_QUERIES = 20
const MEMORY_MAX_TOPICS = 30

export function loadUserMemory(userId: string): UserMemory {
  try {
    const raw = localStorage.getItem(`${MEMORY_PREFIX}${userId}`)
    if (!raw) return { userId, topics: {}, lastQueries: [], preferences: {}, updatedAt: Date.now() }
    return JSON.parse(raw) as UserMemory
  } catch {
    return { userId, topics: {}, lastQueries: [], preferences: {}, updatedAt: Date.now() }
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
  'baader', 'marel', 'volcador', 'transportadora', 'eviscerado', 'filete', 'empaque',
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
      if (synonyms.some(s => normalizeText(s).includes(term) || term.includes(normalizeText(s)))) {
        synonyms.forEach(s => expanded.add(normalizeText(s)))
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
  return actions
}

// ─── Caché de contexto RAG (TTL: 3 minutos) ─────────────────────────
interface CacheEntry {
  data: string
  timestamp: number
}

const CACHE_TTL_MS = 3 * 60 * 1000
const contextCache = new Map<string, CacheEntry>()

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

async function fetchRepuestosSummary(userQuery: string): Promise<string> {
  const cacheKey = `repuestos_${normalizeText(userQuery)}`
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
    const expandedTerms = searchTerms.length > 0 ? expandWithSynonyms(searchTerms) : []
    const matchedRepuestos: string[] = []

    logger.info(`Chatbot search: raw="${userQuery}" → terms=[${searchTerms.join(', ')}]${corrections.length ? ` (corregido: ${corrections.join(', ')})` : ''} → expanded=[${expandedTerms.join(', ')}]`)

    for (const machine of machines) {
      const repSnap = await getDocs(collection(db, `machines/${machine.id}/repuestos`))
      const reps = repSnap.docs.map(d => ({ id: d.id, ...d.data() })) as Repuesto[]
      totalRepuestos += reps.length

      const machineTotal = reps.reduce((sum, r) => sum + (r.valorUnitario || 0) * (r.cantidadPorMaquina || 1), 0)
      valorTotal += machineTotal
      repuestosByMachine.push(`- ${machine.nombre}: ${reps.length} repuestos ($${Math.round(machineTotal).toLocaleString()})`)

      // Buscar repuestos que coincidan con los términos de búsqueda
      if (expandedTerms.length > 0) {
        reps.forEach(r => {
          const text = normalizeText(
            `${r.textoBreve} ${r.descripcion} ${r.codigoSAP} ${r.codigoFabricante} ${r.nombreManual || ''} ${r.ubicacionEnPlanta || ''}`
          )
          // Basta con que AL MENOS UN término original (o su sinónimo expandido) matchee
          // Pero si hay múltiples searchTerms, requerimos que todos los originales estén
          const originalMatches = searchTerms.filter(term => {
            // El term original o alguno de sus sinónimos está en el texto
            const relatedTerms = expandedTerms.filter(et => {
              // Check if this expanded term is related to this original term
              return et === term || SYNONYM_MAP_ENTRIES.some(([, syns]) => {
                const normSyns = syns.map(s => normalizeText(s))
                return (normSyns.includes(term) || normSyns.some(ns => term.includes(ns) || ns.includes(term)))
                    && (normSyns.includes(et) || normSyns.some(ns => et.includes(ns) || ns.includes(et)))
              })
            })
            // Direct match or synonym match
            return text.includes(term) || relatedTerms.some(rt => text.includes(rt))
          })
          
          if (originalMatches.length >= searchTerms.length) {
            matchedRepuestos.push(
              `  ✓ [${machine.nombre}] ${r.textoBreve} | SAP: ${r.codigoSAP} | Fab: ${r.codigoFabricante} | Cant: ${r.cantidadPorMaquina} | $${r.valorUnitario}`
            )
          }
        })
      }
    }

    const lines = [
      `REPUESTOS (total: ${totalRepuestos}, valor inventario: $${Math.round(valorTotal).toLocaleString()}):`,
      `Máquinas con repuestos: ${machines.length}`,
      ...repuestosByMachine,
    ]

    if (corrections.length > 0) {
      lines.push(`(Corrección automática: ${corrections.join(', ')})`)
    }

    if (matchedRepuestos.length > 0) {
      lines.push('', `COINCIDENCIAS con "${searchTerms.join(' ')}" (${matchedRepuestos.length} encontrados):`)
      lines.push(...matchedRepuestos.slice(0, 30))
      if (matchedRepuestos.length > 30) {
        lines.push(`... y ${matchedRepuestos.length - 30} más`)
      }
    } else if (searchTerms.length > 0) {
      lines.push('', `No se encontraron repuestos que coincidan exactamente con "${searchTerms.join(' ')}".`)
      lines.push(`(Se buscó con sinónimos: ${expandedTerms.slice(0, 15).join(', ')})`)
      lines.push(`Nota: los repuestos pueden estar registrados con nombres técnicos o códigos SAP diferentes.`)
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

async function buildRAGContext(intents: IntentType[], userQuery: string): Promise<string> {
  const promises: Promise<string>[] = []

  if (intents.includes('incidencias') || intents.includes('resumen')) {
    promises.push(fetchIncidentsSummary())
  }
  if (intents.includes('equipos') || intents.includes('resumen') || intents.includes('repuestos')) {
    // Siempre traer equipos si se habla de repuestos (para contexto de máquinas)
    promises.push(fetchEquipmentSummary())
  }
  if (intents.includes('repuestos') || intents.includes('resumen')) {
    promises.push(fetchRepuestosSummary(userQuery))
  }
  if (intents.includes('incidencias') && !intents.includes('resumen')) {
    promises.push(fetchIncidentsByFilter(userQuery))
  }
  if (intents.includes('general')) {
    // Para preguntas generales, dar un panorama completo
    promises.push(fetchIncidentsSummary())
    promises.push(fetchEquipmentSummary())
    promises.push(fetchRepuestosSummary(userQuery))
  }

  const results = await Promise.all(promises)
  return results.join('\n\n')
}

// ─── System prompt ───────────────────────────────────────────────────

const SYSTEM_PROMPT = `Eres el asistente virtual de la aplicación de Mantenimiento de Planta Industrial.
Tu nombre es "Asistente de Planta". Eres como JARVIS — puedes ejecutar acciones reales en la app.

Tu rol:
- Responder preguntas sobre repuestos, incidencias, equipos y sensores de la planta
- Usar EXCLUSIVAMENTE los DATOS REALES proporcionados como contexto para dar respuestas precisas
- NUNCA inventar datos. Si la información no está en el contexto, dilo claramente
- Ser conciso pero útil, con formato claro (usa **negritas** para destacar)
- Responder SIEMPRE en español

CAPACIDADES DE ACCIÓN (puedes ejecutar estas acciones cuando el usuario lo pida):
1. **Crear incidencias** — si el usuario describe una falla, TÚ generas el reporte. Muestra el borrador y pide confirmación.
2. **Actualizar incidencias** — cerrar, resolver, confirmar incidencias existentes.
3. **Buscar repuestos** — encontrar piezas por nombre, código SAP, fabricante.
4. **Buscar equipos** — consultar estado de máquinas.
5. **Navegar** — llevar al usuario a cualquier sección de la app.

REGLAS cuando el usuario describe un problema/falla:
- SIEMPRE interpreta que quiere crear una incidencia
- Muestra el borrador con título, descripción, prioridad, equipo detectado
- Pregunta si quiere confirmar la creación o modificar algo
- Si detectas que falta info (equipo, ubicación), pregunta de forma natural

REGLAS CRÍTICAS para responder sobre repuestos:
- Si el contexto dice "COINCIDENCIAS con X (N encontrados)" → ESOS SON LOS RESULTADOS REALES. Enuméralos.
- Si hay coincidencias, di cuántas hay y muéstralas con sus datos (máquina, SAP, fabricante, precio)
- Si no hay coincidencias pero sí hay términos de búsqueda, explica que no se encontraron con ese nombre exacto y sugiere buscar por código SAP o fabricante
- Cuando des listas, usa viñetas (•) o formato legible
- Puedes usar emojis moderadamente para hacer la respuesta más legible

Capacidades de la app:
- Catálogo de repuestos organizado por máquinas (con códigos SAP, precios, cantidades)
- Sistema de incidencias (reportes de fallas con prioridad y estado)
- Gestión de equipos (estado operativo, criticidad)
- Monitoreo de sensores IoT (temperatura, humedad)
- Mantenimiento preventivo (tareas programadas)
- Mapas interactivos de la planta
- Análisis predictivo con IA

Cuando te pregunten qué puedes hacer, destaca especialmente que puedes CREAR INCIDENCIAS por voz o texto, como un asistente JARVIS.`

// ─── Función principal con streaming ─────────────────────────────────

import {
  detectAction,
  buildIncidentDraft,
  executeCreateIncident,
  formatDraftForDisplay,
  findRecentIncidents,
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
}

export async function sendChatMessage(
  userMessage: string,
  history: ChatMessage[] = [],
  onStream?: (partial: string) => void,
  userId?: string,
  pendingAction?: PendingAction | null,
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
  const { terms: correctedSearchTerms, corrections: typoCorrections } = extractSearchTerms(userMessage)
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
      const userName = history.find(m => m.role === 'user')?.content ? undefined : undefined // will rely on userId
      const result = await executeCreateIncident(draft, userId, userName)
      
      if (result.success) {
        return {
          reply: `✅ **¡Incidencia creada exitosamente!**\n\n` +
            `📋 ID: **${result.incidentId}**\n` +
            `📌 "${draft.titulo}"\n` +
            `⚡ Prioridad: ${draft.prioridad}\n\n` +
            `La incidencia quedó en estado **pendiente** y será revisada por un supervisor.\n\n` +
            `💡 Puedes agregar fotos desde la sección de incidencias, o decirme si necesitas algo más.`,
          context: '',
          actions: [
            { label: 'Ver incidencias', route: '/incidents', icon: 'AlertTriangle' },
          ],
          typoCorrections: [],
          pendingAction: { ...pendingAction, status: 'completed', resultId: result.incidentId },
        }
      } else {
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

    // Si no es ni sí/no/modificar, procesar como ajuste al borrador
    // (ej: "cambia la prioridad a crítica")
    // Pasar al LLM con contexto del borrador para que genere respuesta inteligente
  }

  // ─── DETECCIÓN DE ACCIÓN NUEVA ──────────────────────────────────────
  const detectedActionType = detectAction(userMessage)
  
  if (detectedActionType === 'create_incident' && userId) {
    // Construir borrador de incidencia desde el texto
    const { draft, equipment } = await buildIncidentDraft(userMessage, userId)
    
    // Crear PendingAction
    const newPendingAction: PendingAction = {
      id: `action_${Date.now()}`,
      type: 'create_incident',
      status: 'confirming',
      data: draft as unknown as Record<string, unknown>,
      missingFields: equipment ? [] : ['equipo'],
      createdAt: Date.now(),
    }

    const draftDisplay = formatDraftForDisplay(draft)
    let replyText = `🤖 Detecté que quieres reportar una falla. He preparado este borrador:\n\n${draftDisplay}\n\n`

    if (!equipment) {
      replyText += `⚠️ No pude identificar el equipo exacto. Puedes:\n• Decirme el nombre del equipo para buscarlo\n• Confirmar así y asignarlo después\n\n`
    }

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

  // 1. Detectar intención (con typos corregidos)
  const intents = detectIntent(userMessage)
  logger.info(`Chatbot: intents detected = ${intents.join(', ')} | search terms = ${correctedSearchTerms.join(', ')}`)

  // 2. Cargar memoria del usuario
  let memory: UserMemory | null = null
  if (userId) {
    memory = loadUserMemory(userId)
    updateMemoryWithQuery(memory, userMessage, intents)
  }

  // 3. Acciones sugeridas
  const actions = suggestActions(intents)

  // 4. Obtener contexto de Firestore (RAG)
  let ragContext = ''
  try {
    ragContext = await buildRAGContext(intents, userMessage)
  } catch (err: unknown) {
    logger.error('Chatbot: error building RAG context', err instanceof Error ? err : undefined)
    ragContext = 'No se pudieron cargar datos de la planta en este momento.'
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

  const recentHistory = history.slice(-10)
  for (const msg of recentHistory) {
    if (msg.role === 'user' || msg.role === 'assistant') {
      messages.push({ role: msg.role, content: msg.content })
    }
  }

  messages.push({ role: 'user', content: userMessage })

  // 6. Llamar a Groq con streaming
  try {
    const result = await callGroqStream(
      messages,
      (partial) => onStream?.(partial),
      { temperature: 0.4, max_tokens: 1500 }
    )

    // 7. Guardar memoria actualizada
    if (memory && userId) {
      saveUserMemory(memory)
    }

    return {
      reply: result.content,
      context: ragContext,
      actions,
      typoCorrections,
      pendingAction: pendingAction?.status === 'confirming' ? pendingAction : undefined,
    }
  } catch (err) {
    const errorMsg = err instanceof Error ? err.message : String(err)
    logger.error('Chatbot: Groq error', err instanceof Error ? err : undefined)

    // Guardar memoria incluso si falla la llamada a Groq
    if (memory && userId) {
      saveUserMemory(memory)
    }

    if (errorMsg.includes('429') || errorMsg.includes('rate')) {
      return {
        reply: '⏳ Se alcanzó el límite de consultas por minuto. Intenta de nuevo en unos segundos.',
        context: ragContext,
        actions: [],
        typoCorrections: [],
      }
    }

    return {
      reply: '❌ Error al procesar tu consulta. Intenta de nuevo.',
      context: ragContext,
      actions: [],
      typoCorrections: [],
    }
  }
}
