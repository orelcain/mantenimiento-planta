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
  // Asignación directa (admin/supervisor)
  asignadoA?: string
  asignadoANombre?: string
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
      // Petición directa de creación
      /(?:crear?|generar?|abrir|registrar?|reportar?|levantar?|hacer|a[ñn]adir|ingresar?)\s+(?:una?\s+)?(?:incidencia|reporte|falla|problema|ticket|orden)/i,
      // Hay un problema / falla
      /(?:tenemos|hay|existe|ocurri[oó]|detect[eé]|se\s+detect[oó])\s+(?:una?\s+)?(?:falla|problema|rotura|aver[ií]a|defecto|anomal[ií]a|situaci[oó]n|desperfecto)/i,
      // Algo se rompió / falló / paró
      /(?:se\s+)?(?:rompi[oó]|quebr[oó]|fall[oó]|da[ñn][oó]|descompuso|detuvo|par[oó]|quem[oó]|trab[oó]|atasc[oó]|revent[oó]|bot[oó]|salt[oó]|cort[oó])/i,
      // Equipo + estado negativo
      /(?:cinta|motor|bomba|equipo|m[aá]quina|reductor|compresor|grader|baader|marel|volcador|sensor|v[aá]lvula|rodamiento|turbina|ventilador|transportador|faja).+(?:fall[oó]|rompi[oó]|no\s+funciona|detenid[oa]|parad[oa]|da[ñn]ad[oa]|malogr|aver[ií]|bota|gotea|vibra|calienta|ruido)/i,
      // Estado negativo + equipo
      /(?:falla|problema|rotura|aver[ií]a|fuga|goteo|ruido|vibraci[oó]n|calentamiento|humo|olor).+(?:en|de|del)\s+/i,
      // Necesitamos reparar / revisar
      /(?:debemos|hay\s+que|necesitamos|urge|toca|falta|requiere)\s+(?:reemplazar|reparar|cambiar|arreglar|revisar|corregir|intervenir|mantener|limpiar|ajustar)/i,
      // No funciona / no arranca / no enciende
      /(?:no\s+(?:funciona|arranca|enciende|prende|parte|opera|gira|enfr[ií]a|calienta|bombea|corta|sella))/i,
      // Está fallando / botando / goteando
      /(?:est[aá]\s+(?:fallando|botando|goteando|vibrando|calentando|haciendo\s+ruido|sonando|tir[aá]ndo))/i,
      // "Incidencia de X" "incidencia para X"
      /(?:incidencia|reporte|falla)\s+(?:de|para|por|sobre|en)\s+/i,
      // "limpieza / mantenimiento de equipo"
      /(?:necesita|requiere|falta)\s+(?:una?\s+)?(?:limpieza|mantenci[oó]n|mantenimiento|revisi[oó]n|calibraci[oó]n|lubricaci[oó]n|ajuste)/i,
      // "quiero reportar" / "necesito reportar"
      /(?:quiero|necesito|debo|puedo|podr[ií]as?)\s+(?:reportar|crear|generar|levantar|registrar|abrir)/i,
    ],
  },
  {
    type: 'update_incident_status',
    patterns: [
      /(?:cerrar|resolver|confirmar|rechazar|completar|finalizar)\s+(?:la?\s+)?(?:incidencia|reporte|falla|ticket|orden)/i,
      /(?:marcar|cambiar|actualizar|poner|pasar|mover)\s+(?:como?\s+|a\s+)?(?:resuelt[ao]|cerrad[ao]|confirmad[ao]|en\s+proceso|completad[ao])/i,
      /(?:incidencia|reporte).+(?:ya\s+)?(?:est[aá]|esta|fue|qued[oó])\s+(?:resuelt[ao]|list[ao]|arreglad[ao]|reparad[ao]|terminad[ao])/i,
      /(?:ya\s+)?(?:arregl[eé]|repar[eé]|resolv[ií]|termin[eé]|complet[eé]).+(?:incidencia|falla|reporte|problema)/i,
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

/** Devuelve los mejores candidatos de equipo con puntaje */
export interface EquipmentCandidate {
  equipment: Equipment
  score: number
}

export async function findEquipmentCandidates(text: string, maxResults = 5): Promise<EquipmentCandidate[]> {
  try {
    const equipments = await getEquipments()
    const normalized = normalizeText(text)
    const queryWords = normalized.split(/\s+/).filter(w => w.length > 1)
    if (queryWords.length === 0) return []

    // Detectar tipo de equipo para filtro por categoría
    const typeKeywords: Record<string, string[]> = {
      cinta: ['cinta', 'correa', 'banda', 'faja', 'transportador'],
      motor: ['motor'],
      bomba: ['bomba'],
      compresor: ['compresor'],
      reductor: ['reductor'],
      ventilador: ['ventilador'],
      valvula: ['valvula', 'válvula'],
      sensor: ['sensor'],
      caldera: ['caldera'],
      chiller: ['chiller', 'enfriador'],
      maquina: ['maquina', 'máquina', 'equipo'],
    }

    // Detectar categoría del query
    let detectedCategory: string | null = null
    for (const [cat, keywords] of Object.entries(typeKeywords)) {
      if (queryWords.some(w => keywords.some(k => w.includes(k) || k.includes(w)))) {
        detectedCategory = cat
        break
      }
    }

    const candidates: EquipmentCandidate[] = []

    for (const eq of equipments) {
      if (eq.deleted) continue
      const eqText = normalizeText(`${eq.nombre} ${eq.codigo} ${eq.descripcion || ''} ${eq.hierarchyPath || ''}`)
      const eqWords = eqText.split(/\s+/)

      // Calcular score multi-factor
      let score = 0

      // Factor 1: coincidencia de palabras del query en el equipo
      const wordMatches = queryWords.filter(w => eqText.includes(w)).length
      score += (wordMatches / queryWords.length) * 0.5

      // Factor 2: coincidencia de números (importante para "baader 200", "cinta 3", etc.)
      const queryNumbers = queryWords.filter(w => /^\d+$/.test(w))
      const eqNumbers = eqWords.filter(w => /^\d+$/.test(w))
      if (queryNumbers.length > 0) {
        const numMatches = queryNumbers.filter(n => eqNumbers.includes(n)).length
        score += (numMatches / queryNumbers.length) * 0.3
      }

      // Factor 3: bonus si la categoría del tipo coincide
      if (detectedCategory) {
        const catKws = typeKeywords[detectedCategory] || []
        if (catKws.some(k => eqText.includes(k))) {
          score += 0.15
        }
      }

      // Factor 4: penalizar si el nombre es muy diferente (fuzzy por substring)
      const eqNombre = normalizeText(eq.nombre)
      const fullQuery = normalized
      if (eqNombre.includes(fullQuery) || fullQuery.includes(eqNombre)) {
        score += 0.15
      }

      if (score >= 0.25) {
        candidates.push({ equipment: eq, score })
      }
    }

    // Ordenar por score descendente y limitar
    return candidates.sort((a, b) => b.score - a.score).slice(0, maxResults)
  } catch (err) {
    logger.error('chatActions: error finding equipment candidates', err instanceof Error ? err : undefined)
    return []
  }
}

export async function findEquipmentByText(text: string): Promise<Equipment | null> {
  const candidates = await findEquipmentCandidates(text, 1)
  return candidates.length > 0 && candidates[0]!.score >= 0.3 ? candidates[0]!.equipment : null
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
    /(?:cinta|correa|banda|faja)\s+(?:de\s+)?(\w+(?:\s+\w+)?)/i,
    /(?:motor|bomba|reductor|compresor|turbina|ventilador|generador|transformador|v[aá]lvula|rodamiento)\s+(?:de\s+)?(\w+(?:\s+\w+)?)/i,
    /(?:m[aá]quina|equipo|sistema|unidad|l[ií]nea|panel|tablero|sensor)\s+(\w+(?:\s+\w+)?)/i,
    /(?:baader|marel|volcador|grader|descamadora|fileteadora|eviscerador[a]?|empacadora|selladora|transportador[a]?|cortadora|pesadora|clasificadora|detector[a]?|enfriador|congelador|iqf|caldera|chiller|tina)\s*(\d*(?:\s+\w+)?)/i,
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
): Promise<{ draft: IncidentDraft; equipment: Equipment | null; missingFields: string[]; equipmentCandidates: EquipmentCandidate[] }> {
  const extracted = extractIncidentFromText(text)
  
  // Buscar equipos candidatos
  let candidates: EquipmentCandidate[] = []
  let equipment: Equipment | null = null

  if (extracted.equipmentKeywords.length > 0) {
    candidates = await findEquipmentCandidates(extracted.equipmentKeywords.join(' '), 8)
  }
  // Si no encontramos por keywords, intentar con location hints
  if (candidates.length === 0 && extracted.locationHints.length > 0) {
    candidates = await findEquipmentCandidates(
      extracted.locationHints.join(' ') + ' ' + extracted.equipmentKeywords.join(' '),
      8
    )
  }

  // Tomar el mejor como equipo principal
  if (candidates.length > 0 && candidates[0]!.score >= 0.3) {
    equipment = candidates[0]!.equipment
  }

  const draft: IncidentDraft = {
    titulo: extracted.titulo,
    descripcion: extracted.descripcion,
    prioridad: extracted.prioridad,
    tipo: extracted.tipo,
    sintomas: extracted.sintomas.length > 0 ? extracted.sintomas : undefined,
    equipmentId: equipment?.id,
    equipmentName: equipment?.nombre,
    // Heredar ubicación del equipo si existe
    zoneId: equipment?.zoneId,
    hierarchyNodeId: equipment?.hierarchyNodeId,
    needsPhoto: true,
  }

  // Determinar campos faltantes críticos
  const missingFields: string[] = []
  if (!equipment) {
    missingFields.push('equipo')
  }

  return { draft, equipment, missingFields, equipmentCandidates: candidates }
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
      status: draft.asignadoA ? 'en_proceso' : 'pendiente',
      fotos: photoUrls && photoUrls.length > 0 ? photoUrls : [],
      reportadoPor: userId,
      creadoPor: userId,
      creadoPorNombre: userName,
      requiresValidation: !draft.asignadoA,
      ...(draft.equipmentId && { equipmentId: draft.equipmentId }),
      ...(draft.sintomas && { sintomas: draft.sintomas }),
      ...(draft.zoneId && { zoneId: draft.zoneId }),
      ...(draft.hierarchyNodeId && { hierarchyNodeId: draft.hierarchyNodeId }),
      ...(draft.asignadoA && { asignadoA: draft.asignadoA }),
      ...(draft.asignadoANombre && { asignadoANombre: draft.asignadoANombre }),
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

  if (draft.asignadoANombre) {
    lines.push(`👷 **Asignado a:** ${draft.asignadoANombre}`)
  }

  if (draft.sintomas && draft.sintomas.length > 0) {
    lines.push(`🩺 **Síntomas:** ${draft.sintomas.join(', ')}`)
  }

  return lines.join('\n')
}

// ─── Subir foto desde chat ───────────────────────────────────────────

import { uploadIncidentPhoto } from './storage'

/**
 * Sube una foto desde el chat y retorna la URL.
 * Usa un incidentId temporal (chat_{userId}_{ts}) que se puede reasignar.
 */
export async function uploadChatPhoto(userId: string, file: File): Promise<string> {
  try {
    // uploadIncidentPhoto optimiza a WebP internamente (preset photo).
    const tempId = `chat_${userId}_${Date.now()}`
    const url = await uploadIncidentPhoto(tempId, file)
    logger.info('chatActions: photo uploaded from chat', { userId, size: file.size })
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
