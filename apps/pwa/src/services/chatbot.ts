/**
 * Servicio de Chatbot con RAG (Retrieval-Augmented Generation)
 * Consulta datos reales de Firestore y los inyecta como contexto al LLM
 */
import { collection, getDocs, query, where, orderBy, limit } from 'firebase/firestore'
import { db } from './firebase'
import { callGroq, isAIConfigured } from './ai'
import { logger } from '@/lib/logger'
import type { Incident } from '@/types'
import type { Machine, Repuesto } from '@/types/repuestos'

// ─── Tipos ───────────────────────────────────────────────────────────
export interface ChatMessage {
  id: string
  role: 'user' | 'assistant' | 'system'
  content: string
  timestamp: Date
  context?: string // datos RAG usados (para debug)
}

type IntentType =
  | 'repuestos'
  | 'incidencias'
  | 'equipos'
  | 'sensores'
  | 'resumen'
  | 'ayuda'
  | 'general'

// ─── Detección de intención ──────────────────────────────────────────
const INTENT_KEYWORDS: Record<IntentType, string[]> = {
  repuestos: ['repuesto', 'repuestos', 'pieza', 'piezas', 'sap', 'stock', 'rodamiento', 'motor', 'bomba', 'filtro', 'correa', 'sello', 'cojinete', 'reductor', 'válvula', 'sensor', 'catálogo', 'catalogo', 'precio', 'valor', 'caro', 'barato', 'código', 'codigo'],
  incidencias: ['incidencia', 'incidencias', 'problema', 'problemas', 'falla', 'fallas', 'reporte', 'reportes', 'pendiente', 'pendientes', 'abierta', 'abiertas', 'resuelta', 'resueltas', 'crítica', 'critica', 'alta', 'prioridad', 'estado'],
  equipos: ['equipo', 'equipos', 'máquina', 'maquina', 'máquinas', 'maquinas', 'operativo', 'mantenimiento', 'fuera de servicio', 'criticidad'],
  sensores: ['sensor', 'sensores', 'temperatura', 'humedad', 'lectura', 'iot', 'esp32', 'telemetría', 'telemetria', 'alerta'],
  resumen: ['resumen', 'resúmeme', 'resumeme', 'estadística', 'estadísticas', 'estadistica', 'cuántos', 'cuantos', 'cuántas', 'cuantas', 'total', 'totales', 'semana', 'mes', 'hoy', 'dashboard', 'panorama', 'overview'],
  ayuda: ['ayuda', 'help', 'cómo', 'como', 'qué puedes', 'que puedes', 'funciones', 'qué haces', 'que haces'],
  general: [],
}

function detectIntent(text: string): IntentType[] {
  const lower = text.toLowerCase()
  const detected: IntentType[] = []

  for (const [intent, keywords] of Object.entries(INTENT_KEYWORDS)) {
    if (intent === 'general') continue
    if (keywords.some(kw => lower.includes(kw))) {
      detected.push(intent as IntentType)
    }
  }

  return detected.length > 0 ? detected : ['general']
}

// ─── Consultas Firestore (RAG context) ───────────────────────────────

async function fetchIncidentsSummary(): Promise<string> {
  try {
    const colRef = collection(db, 'incidents')
    const snap = await getDocs(colRef)
    const incidents = snap.docs.map(d => ({ id: d.id, ...d.data() })) as Incident[]

    const byStatus: Record<string, number> = {}
    const byPriority: Record<string, number> = {}
    const recentTitles: string[] = []

    incidents.forEach(inc => {
      byStatus[inc.status] = (byStatus[inc.status] || 0) + 1
      byPriority[inc.prioridad] = (byPriority[inc.prioridad] || 0) + 1
    })

    // Las 10 más recientes
    const sorted = incidents
      .sort((a, b) => {
        const ta = a.createdAt instanceof Date ? a.createdAt.getTime() : (a.createdAt as any)?.toMillis?.() || 0
        const tb = b.createdAt instanceof Date ? b.createdAt.getTime() : (b.createdAt as any)?.toMillis?.() || 0
        return tb - ta
      })
      .slice(0, 10)

    sorted.forEach(inc => {
      recentTitles.push(`- [${inc.status}][${inc.prioridad}] ${inc.titulo} (${inc.equipmentId || 'sin equipo'})`)
    })

    return [
      `INCIDENCIAS (total: ${incidents.length}):`,
      `Por estado: ${JSON.stringify(byStatus)}`,
      `Por prioridad: ${JSON.stringify(byPriority)}`,
      `Recientes:`,
      ...recentTitles,
    ].join('\n')
  } catch (err: unknown) {
    logger.error('Chatbot: error fetching incidents', err instanceof Error ? err : undefined)
    return 'No se pudieron cargar las incidencias.'
  }
}

async function fetchEquipmentSummary(): Promise<string> {
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

    return [
      `EQUIPOS (total: ${items.length}):`,
      `Por estado: ${JSON.stringify(byEstado)}`,
      `Por criticidad: ${JSON.stringify(byCriticidad)}`,
      `Lista:`,
      ...names.slice(0, 20),
      items.length > 20 ? `... y ${items.length - 20} más` : '',
    ].join('\n')
  } catch (err: unknown) {
    logger.error('Chatbot: error fetching equipment', err instanceof Error ? err : undefined)
    return 'No se pudieron cargar los equipos.'
  }
}

async function fetchRepuestosSummary(userQuery: string): Promise<string> {
  try {
    // Cargar las máquinas del catálogo de repuestos
    const machinesSnap = await getDocs(collection(db, 'machines'))
    const machines = machinesSnap.docs.map(d => ({ id: d.id, ...d.data() })) as Machine[]

    let totalRepuestos = 0
    let valorTotal = 0
    const repuestosByMachine: string[] = []
    const searchTerms = userQuery.toLowerCase().split(/\s+/).filter(t => t.length > 2)
    const matchedRepuestos: string[] = []

    for (const machine of machines) {
      const repSnap = await getDocs(collection(db, `machines/${machine.id}/repuestos`))
      const reps = repSnap.docs.map(d => ({ id: d.id, ...d.data() })) as Repuesto[]
      totalRepuestos += reps.length

      const machineTotal = reps.reduce((sum, r) => sum + (r.valorUnitario || 0) * (r.cantidadPorMaquina || 1), 0)
      valorTotal += machineTotal
      repuestosByMachine.push(`- ${machine.nombre}: ${reps.length} repuestos ($${Math.round(machineTotal).toLocaleString()})`)

      // Buscar coincidencias con la consulta del usuario
      if (searchTerms.length > 0) {
        reps.forEach(r => {
          const text = `${r.textoBreve} ${r.descripcion} ${r.codigoSAP} ${r.codigoFabricante}`.toLowerCase()
          if (searchTerms.every(term => text.includes(term))) {
            matchedRepuestos.push(
              `  ✓ [${machine.nombre}] ${r.textoBreve} | SAP: ${r.codigoSAP} | Fab: ${r.codigoFabricante} | $${r.valorUnitario} × ${r.cantidadPorMaquina}`
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

    if (matchedRepuestos.length > 0) {
      lines.push('', `COINCIDENCIAS con "${userQuery}" (${matchedRepuestos.length}):`)
      lines.push(...matchedRepuestos.slice(0, 15))
      if (matchedRepuestos.length > 15) {
        lines.push(`... y ${matchedRepuestos.length - 15} más`)
      }
    } else if (searchTerms.length > 0) {
      lines.push('', `No se encontraron repuestos que coincidan con "${userQuery}".`)
    }

    return lines.join('\n')
  } catch (err: unknown) {
    logger.error('Chatbot: error fetching repuestos', err instanceof Error ? err : undefined)
    return 'No se pudieron cargar los repuestos.'
  }
}

async function fetchIncidentsByFilter(userQuery: string): Promise<string> {
  try {
    const lower = userQuery.toLowerCase()
    const colRef = collection(db, 'incidents')

    // Intentar filtrar por estado si el usuario lo menciona
    let statusFilter: string | null = null
    if (lower.includes('pendiente')) statusFilter = 'pendiente'
    else if (lower.includes('confirmada')) statusFilter = 'confirmada'
    else if (lower.includes('en proceso') || lower.includes('en_proceso')) statusFilter = 'en_proceso'
    else if (lower.includes('resuelta')) statusFilter = 'resuelta'
    else if (lower.includes('cerrada')) statusFilter = 'cerrada'
    else if (lower.includes('abierta') || lower.includes('activa')) statusFilter = null // buscar no-cerradas

    let q
    if (statusFilter) {
      q = query(colRef, where('status', '==', statusFilter), orderBy('createdAt', 'desc'), limit(15))
    } else if (lower.includes('abierta') || lower.includes('activa')) {
      q = query(colRef, where('status', 'in', ['pendiente', 'confirmada', 'en_proceso']), orderBy('createdAt', 'desc'), limit(15))
    } else {
      q = query(colRef, orderBy('createdAt', 'desc'), limit(15))
    }

    const snap = await getDocs(q)
    const incidents = snap.docs.map(d => {
      const data = d.data()
      return `- [${data.status}][${data.prioridad}] ${data.titulo} (equipo: ${data.equipmentId || 'N/A'})`
    })

    return [
      `INCIDENCIAS FILTRADAS${statusFilter ? ` (${statusFilter})` : ''}:`,
      ...incidents,
      incidents.length === 0 ? 'No hay incidencias que coincidan.' : '',
    ].join('\n')
  } catch (err: unknown) {
    logger.error('Chatbot: error fetching filtered incidents', err instanceof Error ? err : undefined)
    return 'Error al consultar incidencias.'
  }
}

// ─── Construcción del contexto RAG ───────────────────────────────────

async function buildRAGContext(intents: IntentType[], userQuery: string): Promise<string> {
  const contextParts: string[] = []

  const promises: Promise<string>[] = []

  if (intents.includes('incidencias') || intents.includes('resumen')) {
    promises.push(fetchIncidentsSummary())
  }
  if (intents.includes('equipos') || intents.includes('resumen')) {
    promises.push(fetchEquipmentSummary())
  }
  if (intents.includes('repuestos') || intents.includes('resumen')) {
    promises.push(fetchRepuestosSummary(userQuery))
  }
  if (intents.includes('incidencias') && !intents.includes('resumen')) {
    promises.push(fetchIncidentsByFilter(userQuery))
  }
  if (intents.includes('general')) {
    // Para preguntas generales, dar un resumen rápido
    promises.push(fetchIncidentsSummary())
    promises.push(fetchEquipmentSummary())
  }

  const results = await Promise.all(promises)
  contextParts.push(...results)

  return contextParts.join('\n\n')
}

// ─── System prompt ───────────────────────────────────────────────────

const SYSTEM_PROMPT = `Eres el asistente virtual de la aplicación de Mantenimiento de Planta Industrial.
Tu nombre es "Asistente de Planta".

Tu rol:
- Responder preguntas sobre repuestos, incidencias, equipos y sensores de la planta
- Usar los DATOS REALES proporcionados como contexto para dar respuestas precisas
- Ser conciso pero útil, con formato claro
- Responder SIEMPRE en español
- Si no tienes datos suficientes, dilo honestamente
- Cuando des listas, usa viñetas o formato legible
- Si mencionas códigos SAP o de fabricante, ponlos completos
- Puedes usar emojis moderadamente para hacer la respuesta más legible

Capacidades de la app:
- Catálogo de repuestos organizado por máquinas (con códigos SAP, precios, cantidades)
- Sistema de incidencias (reportes de fallas con prioridad y estado)
- Gestión de equipos (estado operativo, criticidad)
- Monitoreo de sensores IoT (temperatura, humedad)
- Mantenimiento preventivo (tareas programadas)
- Mapas interactivos de la planta
- Análisis predictivo con IA

Cuando te pregunten qué puedes hacer, explica estas capacidades de forma amigable.`

// ─── Función principal del chat ──────────────────────────────────────

export async function sendChatMessage(
  userMessage: string,
  history: ChatMessage[] = []
): Promise<{ reply: string; context: string }> {
  if (!isAIConfigured()) {
    return {
      reply: '⚠️ La IA no está configurada. Necesitas configurar la API key de Groq o el Cloud Function proxy.',
      context: '',
    }
  }

  // 1. Detectar intención
  const intents = detectIntent(userMessage)
  logger.info(`Chatbot: intents detected = ${intents.join(', ')}`)

  // 2. Obtener contexto de Firestore (RAG)
  let ragContext = ''
  try {
    ragContext = await buildRAGContext(intents, userMessage)
  } catch (err: unknown) {
    logger.error('Chatbot: error building RAG context', err instanceof Error ? err : undefined)
    ragContext = 'No se pudieron cargar datos de la planta en este momento.'
  }

  // 3. Construir mensajes para el LLM
  const messages: Array<{ role: string; content: string }> = [
    { role: 'system', content: SYSTEM_PROMPT },
  ]

  // Agregar contexto RAG como mensaje del sistema
  if (ragContext) {
    messages.push({
      role: 'system',
      content: `DATOS ACTUALES DE LA PLANTA (usa estos datos para responder):\n\n${ragContext}`,
    })
  }

  // Agregar historial reciente (últimos 10 mensajes para no exceder tokens)
  const recentHistory = history.slice(-10)
  for (const msg of recentHistory) {
    if (msg.role === 'user' || msg.role === 'assistant') {
      messages.push({ role: msg.role, content: msg.content })
    }
  }

  // Agregar el mensaje actual del usuario
  messages.push({ role: 'user', content: userMessage })

  // 4. Llamar a Groq
  try {
    const result = await callGroq(messages, {
      temperature: 0.4,
      max_tokens: 1500,
    })

    return {
      reply: result.content,
      context: ragContext,
    }
  } catch (err) {
    const errorMsg = err instanceof Error ? err.message : String(err)
    logger.error('Chatbot: Groq error', err instanceof Error ? err : undefined)

    if (errorMsg.includes('429') || errorMsg.includes('rate')) {
      return {
        reply: '⏳ Se alcanzó el límite de consultas por minuto. Intenta de nuevo en unos segundos.',
        context: ragContext,
      }
    }

    return {
      reply: '❌ Error al procesar tu consulta. Intenta de nuevo.',
      context: ragContext,
    }
  }
}
