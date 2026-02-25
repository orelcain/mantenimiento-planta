/**
 * Chat Actions Service — "ARIA Mode"
 * 
 * Permite al chatbot ejecutar acciones reales en la app:
 * - Crear incidencias
 * - Cambiar estado de incidencias
 * - Buscar equipos / repuestos
 * - Navegar a secciones
 * 
 * Cada acción tiene un flujo conversacional con confirmación.
 */
import { createIncident, updateIncident, getIncidents } from './incidents'
import { getEquipments } from './equipment'
import { normalizeText } from './chatbot'
import { logger } from '@/lib/logger'
import type { Incident, Equipment, IncidentPriority, IncidentStatus } from '@/types'

// ─── Tipos ───────────────────────────────────────────────────────────

/** Tipos de acción que el chatbot puede ejecutar */
export type ActionType =
  | 'create_incident'
  | 'update_incident_status'
  | 'search_equipment'
  | 'search_repuestos'
  | 'navigate'

/** Estado de una acción pendiente */
export type ActionStatus = 'collecting' | 'confirming' | 'executing' | 'completed' | 'cancelled'

/** Datos para crear una incidencia */
export interface IncidentDraft {
  titulo: string
  descripcion: string
  prioridad: IncidentPriority
  equipmentId?: string
  equipmentName?: string
  tipo: 'correctivo' | 'preventivo' | 'predictivo' | 'proactivo'
  sintomas?: string[]
  zoneId?: string
  hierarchyNodeId?: string
  needsPhoto?: boolean
}

/** Una acción pendiente del chatbot */
export interface PendingAction {
  id: string
  type: ActionType
  status: ActionStatus
  data: Partial<IncidentDraft> & Record<string, unknown>
  missingFields: string[]
  createdAt: number
  confirmedAt?: number
  resultId?: string  // ID del recurso creado (ej: incident ID)
  resultMessage?: string
}

// ─── Detección de acciones en texto libre ────────────────────────────

const ACTION_PATTERNS: { type: ActionType; patterns: RegExp[] }[] = [
  {
    type: 'create_incident',
    patterns: [
      /(?:crear|generar|abrir|registrar|reportar|levantar)\s+(?:una?\s+)?(?:incidencia|reporte|falla|problema)/i,
      /(?:tenemos|hay)\s+(?:una?\s+)?(?:falla|problema|rotura|avería|averia)/i,
      /(?:se\s+)?(?:rompió|rompio|quebr[oó]|fall[oó]|dañ[oó]|danó|descompuso|detuvo|paró|par[oó])/i,
      /(?:cinta|motor|bomba|equipo|maquina|máquina).+(?:fall[oó]|rompió|rompio|no\s+funciona|detenid[oa]|parad[oa])/i,
      /(?:falla|problema|rotura|avería).+(?:en|de)\s+/i,
      /(?:debemos|hay\s+que|necesitamos|urge)\s+(?:reemplazar|reparar|cambiar|arreglar|revisar)/i,
    ],
  },
  {
    type: 'update_incident_status',
    patterns: [
      /(?:cerrar|resolver|confirmar|rechazar)\s+(?:la?\s+)?(?:incidencia|reporte|falla)/i,
      /(?:marcar|cambiar|actualizar|poner)\s+(?:como?\s+)?(?:resuelt[ao]|cerrad[ao]|confirmad[ao]|en\s+proceso)/i,
      /(?:incidencia|reporte).+(?:ya\s+)?(?:está|esta)\s+(?:resuelt[ao]|list[ao]|arreglad[ao])/i,
    ],
  },
]

export function detectAction(text: string): ActionType | null {
  for (const { type, patterns } of ACTION_PATTERNS) {
    if (patterns.some(p => p.test(text))) {
      return type
    }
  }
  return null
}

// ─── Detección inteligente de prioridad ──────────────────────────────

export function detectPriority(text: string): IncidentPriority {
  const lower = text.toLowerCase()
  
  // Crítica: detiene producción, urgente, peligro
  if (/deten.*(producci[oó]n|l[ií]nea)|parad.*(planta|producci[oó]n)|urgente|peligro|emergencia|cr[ií]tic/i.test(lower)) {
    return 'critica'
  }
  // Alta: afecta operación, rotura, se rompió
  if (/rompi[oó]|rotura|aver[ií]a|da[ñn]o\s+(grave|serio|importante)|afecta\s+(operaci[oó]n|funcionamiento)/i.test(lower)) {
    return 'alta'
  }
  // Baja: puede esperar, menor, preventivo
  if (/puede\s+esperar|menor|leve|no\s+urgente|preventiv/i.test(lower)) {
    return 'baja'
  }
  // Default: media
  return 'media'
}

// ─── Búsqueda fuzzy de equipo por texto libre ────────────────────────

export async function findEquipmentByText(text: string): Promise<Equipment | null> {
  try {
    const equipments = await getEquipments()
    const normalized = normalizeText(text)
    
    // Intentar match exacto primero
    let best: Equipment | null = null
    let bestScore = 0
    
    for (const eq of equipments) {
      const eqText = normalizeText(`${eq.nombre} ${eq.codigo} ${eq.descripcion || ''} ${eq.hierarchyPath || ''}`)
      
      // Calcular score: cuántas palabras del query están en el equipo
      const queryWords = normalized.split(/\s+/).filter(w => w.length > 2)
      const matchCount = queryWords.filter(w => eqText.includes(w)).length
      const score = queryWords.length > 0 ? matchCount / queryWords.length : 0
      
      if (score > bestScore && score >= 0.3) {
        bestScore = score
        best = eq
      }
    }
    
    return best
  } catch (err) {
    logger.error('chatActions: error finding equipment', err instanceof Error ? err : undefined)
    return null
  }
}

// ─── Extracción de datos de incidencia del texto libre ───────────────

export interface ExtractedIncidentData {
  titulo: string
  descripcion: string
  prioridad: IncidentPriority
  tipo: 'correctivo' | 'preventivo' | 'predictivo' | 'proactivo'
  equipmentKeywords: string[]
  sintomas: string[]
  locationHints: string[]
}

export function extractIncidentFromText(text: string): ExtractedIncidentData {
  const lower = text.toLowerCase()
  
  // Extraer síntomas
  const sintomasPatterns: [RegExp, string][] = [
    [/vibraci[oó]n/i, 'Vibración'],
    [/ruido\s*(anormal|fuerte|extra[ñn]o)?/i, 'Ruido anormal'],
    [/calentamiento|sobretemperatura|calienta/i, 'Calentamiento'],
    [/fuga.*(aceite|lubricante)/i, 'Fuga de aceite'],
    [/fuga.*(agua|l[ií]quido)/i, 'Fuga de agua'],
    [/humo/i, 'Humo'],
    [/olor\s*(extra[ñn]o|quemado|raro)?/i, 'Olor extraño'],
    [/no\s+(enciende|arranca|funciona|parte)/i, 'No enciende'],
    [/se\s+(detiene|para|apaga)\s*(sol[oa])?/i, 'Se detiene solo'],
    [/rompi[oó]|rotura|roto|quebr/i, 'Rotura/quiebre'],
    [/desgast/i, 'Desgaste'],
    [/atascad|atasc[oó]|trabanc/i, 'Atascamiento'],
  ]
  
  const sintomas = sintomasPatterns
    .filter(([pattern]) => pattern.test(text))
    .map(([, label]) => label)

  // Extraer keywords de equipo
  const equipKeywords: string[] = []
  const equipPatterns = [
    /(?:cinta|correa|banda)\s+(?:de\s+)?(\w+(?:\s+\w+)?)/i,
    /(?:motor|bomba|reductor|compresor)\s+(?:de\s+)?(\w+(?:\s+\w+)?)/i,
    /(?:máquina|maquina|equipo)\s+(\w+(?:\s+\w+)?)/i,
    /(?:baader|marel|volcador)\s*(\d*)/i,
  ]
  for (const pattern of equipPatterns) {
    const match = text.match(pattern)
    if (match) {
      equipKeywords.push(match[0].trim())
    }
  }

  // Location hints
  const locationHints: string[] = []
  const locationPatterns = [
    /(?:en|de|zona|[aá]rea|secci[oó]n)\s+(filete|eviscerado|empaque|acopio|despacho|recepci[oó]n|bodega|sala\s+\w+)/gi,
    /(?:colaci[oó]n|comedor|pasillo|exterior)\s*(?:de\s+)?(\w+)?/gi,
  ]
  for (const pattern of locationPatterns) {
    const matches = text.matchAll(pattern)
    for (const match of matches) {
      locationHints.push(match[0].trim())
    }
  }

  // Generar título inteligente
  let titulo = ''
  if (equipKeywords.length > 0) {
    titulo = `Falla en ${equipKeywords[0]}`
    if (sintomas.length > 0) {
      titulo += ` - ${sintomas[0]}`
    }
  } else if (sintomas.length > 0) {
    titulo = `Reporte: ${sintomas[0]}`
  } else {
    // Usar las primeras palabras significativas
    const words = text.split(/\s+/).slice(0, 8).join(' ')
    titulo = words.length > 50 ? words.slice(0, 50) + '...' : words
  }

  // Detectar tipo
  let tipo: 'correctivo' | 'preventivo' | 'predictivo' | 'proactivo' = 'correctivo'
  if (/preventiv/i.test(lower)) tipo = 'preventivo'
  else if (/predictiv/i.test(lower)) tipo = 'predictivo'

  return {
    titulo,
    descripcion: text,
    prioridad: detectPriority(text),
    tipo,
    equipmentKeywords: equipKeywords,
    sintomas,
    locationHints,
  }
}

// ─── Crear borrador de incidencia desde texto ────────────────────────

export async function buildIncidentDraft(
  text: string,
  _userId?: string,
): Promise<{ draft: IncidentDraft; equipment: Equipment | null; missingFields: string[] }> {
  const extracted = extractIncidentFromText(text)
  
  // Buscar equipo mencionado
  let equipment: Equipment | null = null
  if (extracted.equipmentKeywords.length > 0) {
    equipment = await findEquipmentByText(extracted.equipmentKeywords.join(' '))
  }
  // Si no encontramos por keywords, intentar con location hints
  if (!equipment && extracted.locationHints.length > 0) {
    equipment = await findEquipmentByText(extracted.locationHints.join(' ') + ' ' + extracted.equipmentKeywords.join(' '))
  }

  const draft: IncidentDraft = {
    titulo: extracted.titulo,
    descripcion: extracted.descripcion,
    prioridad: extracted.prioridad,
    tipo: extracted.tipo,
    sintomas: extracted.sintomas.length > 0 ? extracted.sintomas : undefined,
    equipmentId: equipment?.id,
    equipmentName: equipment?.nombre,
    needsPhoto: true,
  }

  // Determinar campos faltantes críticos
  const missingFields: string[] = []
  if (!equipment) {
    missingFields.push('equipo')
  }

  return { draft, equipment, missingFields }
}

// ─── Ejecutar creación de incidencia ─────────────────────────────────

export async function executeCreateIncident(
  draft: IncidentDraft,
  userId: string,
  userName?: string,
  photoUrls?: string[],
): Promise<{ success: boolean; incidentId?: string; error?: string }> {
  try {
    const incident = await createIncident({
      tipo: draft.tipo,
      titulo: draft.titulo,
      descripcion: draft.descripcion,
      prioridad: draft.prioridad,
      status: 'pendiente',
      fotos: photoUrls && photoUrls.length > 0 ? photoUrls : [],
      reportadoPor: userId,
      creadoPor: userId,
      creadoPorNombre: userName,
      requiresValidation: true,
      ...(draft.equipmentId && { equipmentId: draft.equipmentId }),
      ...(draft.sintomas && { sintomas: draft.sintomas }),
      ...(draft.zoneId && { zoneId: draft.zoneId }),
      ...(draft.hierarchyNodeId && { hierarchyNodeId: draft.hierarchyNodeId }),
    })

    logger.info('chatActions: incident created via ARIA', { incidentId: incident.id, photoCount: photoUrls?.length || 0 })
    return { success: true, incidentId: incident.id }
  } catch (err) {
    const msg = err instanceof Error ? err.message : 'Error desconocido'
    logger.error('chatActions: error creating incident', err instanceof Error ? err : undefined)
    return { success: false, error: msg }
  }
}

// ─── Ejecutar cambio de estado de incidencia ─────────────────────────

export async function executeUpdateStatus(
  incidentId: string,
  newStatus: IncidentStatus,
  userId: string,
  resolution?: string,
): Promise<{ success: boolean; error?: string }> {
  try {
    const updateData: Partial<Incident> = {
      status: newStatus,
      updatedAt: new Date(),
    }

    if (newStatus === 'resuelta') {
      updateData.resolvedAt = new Date()
      updateData.resolvedBy = userId
      if (resolution) updateData.resolucion = resolution
    } else if (newStatus === 'cerrada') {
      updateData.closedAt = new Date()
    } else if (newStatus === 'confirmada') {
      updateData.confirmedAt = new Date()
      updateData.validatedBy = userId
    }

    await updateIncident(incidentId, updateData)
    logger.info('chatActions: incident status updated via chatbot', { incidentId, newStatus })
    return { success: true }
  } catch (err) {
    const msg = err instanceof Error ? err.message : 'Error desconocido'
    logger.error('chatActions: error updating incident', err instanceof Error ? err : undefined)
    return { success: false, error: msg }
  }
}

// ─── Buscar incidencias recientes para referencia ────────────────────

export async function findRecentIncidents(text: string): Promise<Incident[]> {
  try {
    const incidents = await getIncidents({ limit: 20 })
    
    if (!text.trim()) return incidents.slice(0, 5)
    
    const normalized = normalizeText(text)
    const words = normalized.split(/\s+/).filter(w => w.length > 2)
    
    return incidents.filter(inc => {
      const incText = normalizeText(`${inc.titulo} ${inc.descripcion} ${inc.equipmentId || ''}`)
      return words.some(w => incText.includes(w))
    }).slice(0, 5)
  } catch {
    return []
  }
}

// ─── Formatear borrador como texto legible ───────────────────────────

export function formatDraftForDisplay(draft: IncidentDraft): string {
  const lines = [
    `📋 **Título:** ${draft.titulo}`,
    `📝 **Descripción:** ${draft.descripcion.slice(0, 150)}${draft.descripcion.length > 150 ? '...' : ''}`,
    `⚡ **Prioridad:** ${draft.prioridad}`,
    `🔧 **Tipo:** ${draft.tipo}`,
  ]

  if (draft.equipmentName) {
    lines.push(`🏭 **Equipo:** ${draft.equipmentName} (${draft.equipmentId})`)
  } else {
    lines.push(`🏭 **Equipo:** No identificado (se puede asignar después)`)
  }

  if (draft.sintomas && draft.sintomas.length > 0) {
    lines.push(`🩺 **Síntomas:** ${draft.sintomas.join(', ')}`)
  }

  return lines.join('\n')
}

// ─── Subir foto desde chat ───────────────────────────────────────────

import { uploadIncidentPhoto, compressImage } from './storage'

/**
 * Sube una foto desde el chat y retorna la URL.
 * Usa un incidentId temporal (chat_{userId}_{ts}) que se puede reasignar.
 */
export async function uploadChatPhoto(userId: string, file: File): Promise<string> {
  try {
    // Comprimir imagen a WebP
    const compressed = await compressImage(file, 1920, 0.85, true)
    // Usar un bucket path temporal para chat uploads
    const tempId = `chat_${userId}_${Date.now()}`
    const url = await uploadIncidentPhoto(tempId, compressed)
    logger.info('chatActions: photo uploaded from chat', { userId, size: compressed.size })
    return url
  } catch (err) {
    logger.error('chatActions: error uploading chat photo', err instanceof Error ? err : undefined)
    throw err
  }
}

// ─── Sugerir técnico para asignación ─────────────────────────────────

import { getTechnicians } from './auth'
import type { User } from '@/types'

/**
 * Busca técnicos disponibles y sugiere el más adecuado.
 * Criterios: (1) rol técnico activo, (2) menor carga de incidencias abiertas
 */
export async function suggestTechnicianForIncident(
  _equipmentId?: string,
): Promise<{ suggested: User | null; candidates: User[]; reason: string }> {
  try {
    const technicians = await getTechnicians()
    
    if (technicians.length === 0) {
      return { suggested: null, candidates: [], reason: 'No hay técnicos registrados en el sistema.' }
    }

    // Obtener incidencias activas para contar carga por técnico
    const activeIncidents = await getIncidents({ status: 'en_proceso' })
    const assignmentCount: Record<string, number> = {}
    
    for (const inc of activeIncidents) {
      if (inc.asignadoA) {
        assignmentCount[inc.asignadoA] = (assignmentCount[inc.asignadoA] || 0) + 1
      }
    }

    // Ordenar por menor carga de trabajo
    const sorted = [...technicians].sort((a, b) => {
      const countA = assignmentCount[a.id] || 0
      const countB = assignmentCount[b.id] || 0
      return countA - countB
    })

    const suggested = sorted[0] ?? null
    if (!suggested) {
      return { suggested: null, candidates: sorted.slice(0, 5), reason: 'No se pudo determinar técnico sugerido.' }
    }
    const load = assignmentCount[suggested.id] || 0
    const reason = load === 0
      ? `${suggested.nombre} ${suggested.apellido || ''} no tiene incidencias asignadas actualmente.`
      : `${suggested.nombre} ${suggested.apellido || ''} tiene menor carga (${load} incidencia${load > 1 ? 's' : ''} activa${load > 1 ? 's' : ''}).`

    return {
      suggested,
      candidates: sorted.slice(0, 5),
      reason,
    }
  } catch (err) {
    logger.error('chatActions: error suggesting technician', err instanceof Error ? err : undefined)
    return { suggested: null, candidates: [], reason: 'Error al buscar técnicos disponibles.' }
  }
}

// ─── Registrar acción ARIA en historial ──────────────────────────────

import { doc as firestoreDoc, setDoc as firestoreSetDoc, serverTimestamp as srvTimestamp } from '@/services/firestoreTracked'
import { db } from './firebase'

export interface AriaActionLog {
  id: string
  userId: string
  userName?: string
  actionType: ActionType
  description: string
  resultId?: string
  success: boolean
  timestamp: Date
  metadata?: Record<string, unknown>
}

/**
 * Registra una acción ejecutada por ARIA en la colección `ariaActions`.
 */
export async function logAriaAction(action: Omit<AriaActionLog, 'id' | 'timestamp'>): Promise<void> {
  try {
    const id = `aria_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`
    await firestoreSetDoc(firestoreDoc(db, 'ariaActions', id), {
      ...action,
      id,
      timestamp: srvTimestamp(),
    })
    logger.info('chatActions: logged ARIA action', { type: action.actionType, success: action.success })
  } catch (err) {
    logger.error('chatActions: error logging action', err instanceof Error ? err : undefined)
  }
}

// ─── Notificar por acción de ARIA ────────────────────────────────────

import { showLocalNotification, areNotificationsEnabled, NotificationType, getNotificationConfig } from './notifications'

/**
 * Envía una notificación local cuando ARIA completa una acción.
 */
export function notifyAriaAction(
  type: 'incident_created' | 'incident_updated' | 'technician_assigned',
  data: { titulo: string; incidentId?: string; technicianName?: string },
): void {
  if (!areNotificationsEnabled()) return

  let title: string
  let body: string

  switch (type) {
    case 'incident_created': {
      const config = getNotificationConfig(NotificationType.INCIDENT_CREATED, data)
      title = `🤖 ARIA: ${config.title}`
      body = config.body
      break
    }
    case 'incident_updated':
      title = '🤖 ARIA: Incidencia actualizada'
      body = `"${data.titulo}" fue actualizada por ARIA`
      break
    case 'technician_assigned':
      title = '🤖 ARIA: Técnico asignado'
      body = `${data.technicianName} fue asignado a "${data.titulo}"`
      break
  }

  showLocalNotification(title, {
    body,
    tag: `aria-${type}-${Date.now()}`,
    data: data.incidentId ? { url: `/incidents?id=${data.incidentId}` } : undefined,
  })
}
