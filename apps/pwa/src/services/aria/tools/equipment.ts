/**
 * ARIA Tools — Equipos
 *
 * Sprint 2 — Omnisciencia. Permite a ARIA buscar equipos por nombre/código,
 * filtrar por criticidad, estado, y dar ubicación jerárquica.
 */
import { registerTool } from './registry'
import { getEquipments } from '../../equipment'
import { findEquipmentCandidates } from '../../chatActions'
import type { Equipment } from '@/types'

// ─── Utilidades formato ────────────────────────────────────────────────

const CRITICIDAD_EMOJI: Record<string, string> = {
  alta: '🔴',
  media: '🟡',
  baja: '🟢',
}

const ESTADO_EMOJI: Record<string, string> = {
  operativo: '✅',
  en_mantenimiento: '🔧',
  fuera_servicio: '⛔',
}

function summarizeEquipment(e: Equipment): string {
  const parts: string[] = []
  const critE = CRITICIDAD_EMOJI[e.criticidad as string] || '⚪'
  const estE = ESTADO_EMOJI[e.estado as string] || '⚪'
  parts.push(`${critE}${estE} ${e.nombre} (${e.codigo})`)
  if (e.hierarchyPath) parts.push(`   ubicación: ${e.hierarchyPath}`)
  else if (e.zonePath && e.zonePath.length > 0) parts.push(`   zona: ${e.zonePath.join(' › ')}`)
  if (e.marca || e.modelo) parts.push(`   ${[e.marca, e.modelo].filter(Boolean).join(' ')}`)
  return parts.join('\n')
}

// ─── equipment.locate ──────────────────────────────────────────────────

registerTool({
  name: 'equipment.locate',
  category: 'equipment',
  description:
    'Busca equipo(s) por texto libre (nombre, código, número de serie) y devuelve ubicación jerárquica. Triggers: "dónde está X", "ubicación del Y", "localizar Z".',
  params: [
    {
      name: 'query',
      type: 'string',
      required: false,
      description: 'Texto a buscar (nombre, código, parte del nombre)',
    },
  ],
  triggers: [
    /\b(d[oó]nde\s+est[aá])\b/i,
    /\b(ubicaci[oó]n\s+(de|del))\b/i,
    /\b(localizar|encontrar)\s+(la?|el)\s+(m[aá]quina|equipo|cinta|motor|bomba|sensor|baader|grader|marel)\b/i,
    /\b(en\s+qu[eé]\s+(zona|[aá]rea)\s+est[aá])\b/i,
  ],
  execute: async (params) => {
    const query = (params.query as string) || ''
    if (!query.trim()) {
      return {
        ok: false,
        error: 'Falta texto de búsqueda',
        label: 'Localizar equipo',
      }
    }
    const candidates = await findEquipmentCandidates(query, 5)
    if (candidates.length === 0) {
      return {
        ok: true,
        data: { query, count: 0 },
        summary: `No encontré equipos que coincidan con "${query}". Probá con otro nombre, código o ser más específico.`,
        label: 'Localizar equipo',
      }
    }
    const body = candidates.map((c, i) => `${i + 1}. ${summarizeEquipment(c.equipment)}`).join('\n\n')
    return {
      ok: true,
      data: { query, count: candidates.length, candidates },
      summary: `Coincidencias para "${query}" (${candidates.length}):\n\n${body}`,
      label: 'Localizar equipo',
    }
  },
})

// ─── equipment.critical ────────────────────────────────────────────────

registerTool({
  name: 'equipment.critical',
  category: 'equipment',
  description:
    'Lista todos los equipos con criticidad alta (los que paran producción si fallan). Útil para auditorías de mantenimiento preventivo.',
  params: [],
  triggers: [
    /\b(equipos?\s+cr[ií]ticos?)\b/i,
    /\b(m[aá]quinas?\s+cr[ií]ticas?)\b/i,
    /\b(criticidad\s+alta)\b/i,
    /\b(qu[eé]\s+equipos?\s+(son|tenemos)\s+(cr[ií]ticos?|de\s+alta))\b/i,
  ],
  execute: async () => {
    const equips = await getEquipments({ criticidad: 'alta' })
    const active = equips.filter(e => !e.deleted)
    if (active.length === 0) {
      return {
        ok: true,
        data: { count: 0 },
        summary: 'No hay equipos marcados como criticidad alta.',
        label: 'Equipos críticos',
      }
    }
    const byEstado = active.reduce<Record<string, number>>((acc, e) => {
      const key = String(e.estado || 'sin_estado')
      acc[key] = (acc[key] || 0) + 1
      return acc
    }, {})
    const header = `Total equipos críticos: ${active.length} (✅ ${byEstado.operativo || 0} operativos · 🔧 ${byEstado.en_mantenimiento || 0} en mantención · ⛔ ${byEstado.fuera_servicio || 0} fuera de servicio)`
    const body = active.slice(0, 15).map(summarizeEquipment).join('\n\n')
    return {
      ok: true,
      data: { count: active.length, byEstado, equipments: active },
      summary: `${header}\n\n${body}${active.length > 15 ? `\n\n…y ${active.length - 15} más.` : ''}`,
      label: 'Equipos críticos',
    }
  },
})

// ─── equipment.status ──────────────────────────────────────────────────

registerTool({
  name: 'equipment.status',
  category: 'equipment',
  description:
    'Lista equipos por estado (operativo / en_mantenimiento / fuera_servicio). Default: fuera de servicio.',
  params: [
    {
      name: 'estado',
      type: 'string',
      enum: ['operativo', 'en_mantenimiento', 'fuera_servicio'],
      required: false,
      default: 'fuera_servicio',
      description: 'Estado a filtrar',
    },
  ],
  triggers: [
    /\b(equipos?|m[aá]quinas?)\s+(fuera\s+de\s+servicio|parados?|caidos?|detenidos?)\b/i,
    /\b(equipos?|m[aá]quinas?)\s+(en\s+mantenci[oó]n|en\s+mantenimiento)\b/i,
    /\b(qu[eé]\s+est[aá]\s+(parado|fuera|en\s+mantenci[oó]n))\b/i,
  ],
  execute: async (params) => {
    const estado = (params.estado as string) || 'fuera_servicio'
    const equips = await getEquipments({ estado: estado as Equipment['estado'] })
    const active = equips.filter(e => !e.deleted)
    const estadoLabel = estado === 'fuera_servicio' ? 'fuera de servicio' : estado.replace('_', ' ')
    if (active.length === 0) {
      return {
        ok: true,
        data: { estado, count: 0 },
        summary: `No hay equipos ${estadoLabel}. ✅`,
        label: `Equipos ${estadoLabel}`,
      }
    }
    const body = active.slice(0, 15).map(summarizeEquipment).join('\n\n')
    return {
      ok: true,
      data: { estado, count: active.length, equipments: active },
      summary: `Equipos ${estadoLabel} (${active.length}):\n\n${body}${active.length > 15 ? `\n\n…y ${active.length - 15} más.` : ''}`,
      label: `Equipos ${estadoLabel}`,
    }
  },
})

// ─── Inferencia params adicionales ─────────────────────────────────────

/**
 * Para `equipment.locate`: extrae el query del texto eliminando palabras
 * trigger ("dónde está", "ubicación del", etc.). Para `equipment.status`:
 * detecta el estado solicitado.
 */
export function inferEquipmentParams(toolName: string, userMessage: string): Record<string, unknown> {
  const params: Record<string, unknown> = {}
  const lower = userMessage.toLowerCase()

  if (toolName === 'equipment.locate') {
    // Quitar prefijos trigger comunes y dejar solo el nombre/código
    let q = userMessage
      .replace(/\b(d[oó]nde\s+est[aá]|ubicaci[oó]n\s+(de|del)|localizar|encontrar|en\s+qu[eé]\s+(zona|[aá]rea)\s+est[aá])\b/gi, '')
      .replace(/[¿?¡!]/g, '')
      .replace(/^\s+(la|el|los|las)\s+/i, '')
      .trim()
    if (q) params.query = q
  }

  if (toolName === 'equipment.status') {
    if (/\b(en\s+mantenci[oó]n|en\s+mantenimiento)\b/.test(lower)) {
      params.estado = 'en_mantenimiento'
    } else if (/\boperativos?\b/.test(lower)) {
      params.estado = 'operativo'
    } else {
      params.estado = 'fuera_servicio'
    }
  }

  if (toolName === 'incidents.byPriority') {
    if (/\b(cr[ií]tica|cr[ií]ticas|cr[ií]tico|urgentes?|m[aá]xima\s+prioridad)\b/.test(lower)) {
      params.prioridad = 'critica'
    } else if (/\b(alta|altas?)\s+(prioridad|incidencias?)\b/.test(lower) || /\bprioridad\s+alta\b/.test(lower)) {
      params.prioridad = 'alta'
    } else if (/\bmedia\b/.test(lower)) {
      params.prioridad = 'media'
    } else if (/\bbaja\b/.test(lower)) {
      params.prioridad = 'baja'
    }
  }

  return params
}
