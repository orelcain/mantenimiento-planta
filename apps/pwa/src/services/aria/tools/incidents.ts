/**
 * ARIA Tools — Incidencias
 *
 * Sprint 2 — Omnisciencia. Permite a ARIA responder preguntas sobre
 * incidencias abiertas, por prioridad, recientes y por equipo.
 */
import { registerTool } from './registry'
import { getIncidents } from '../../incidents'
import { findEquipmentByText } from '../../chatActions'
import type { Incident, IncidentStatus, IncidentPriority } from '@/types'

const STATUS_OPEN: IncidentStatus[] = ['pendiente', 'confirmada', 'en_proceso']

// ─── Utilidades formato ────────────────────────────────────────────────

function fmtDate(d: Date | string | undefined | null): string {
  if (!d) return '—'
  const date = typeof d === 'string' ? new Date(d) : d
  if (!(date instanceof Date) || isNaN(date.getTime())) return '—'
  return date.toLocaleString('es-CL', {
    day: '2-digit',
    month: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
  })
}

const PRIORITY_EMOJI: Record<IncidentPriority, string> = {
  critica: '🔴',
  alta: '🟠',
  media: '🟡',
  baja: '🟢',
}

const STATUS_LABEL: Record<IncidentStatus, string> = {
  pendiente: 'pendiente',
  confirmada: 'confirmada',
  rechazada: 'rechazada',
  en_proceso: 'en proceso',
  resuelta: 'resuelta',
  cerrada: 'cerrada',
}

function summarizeIncident(i: Incident): string {
  const parts: string[] = []
  const emoji = PRIORITY_EMOJI[i.prioridad] || '⚪'
  const equip = i.equipmentId ? ` · equipo ${i.equipmentId}` : ''
  parts.push(`${emoji} [${STATUS_LABEL[i.status]}] ${i.titulo}${equip}`)
  if (i.asignadoANombre) parts.push(`   asignado: ${i.asignadoANombre}`)
  if (i.createdAt) parts.push(`   reportada: ${fmtDate(i.createdAt as Date | string)}`)
  return parts.join('\n')
}

// ─── incidents.open ────────────────────────────────────────────────────

registerTool({
  name: 'incidents.open',
  category: 'incidents',
  description:
    'Lista incidencias abiertas (pendiente/confirmada/en_proceso). Útil para "¿qué incidencias hay activas?", "incidencias pendientes", "abiertas hoy".',
  params: [
    { name: 'limit', type: 'number', required: false, default: 10, description: 'Máx resultados' },
  ],
  triggers: [
    /\b(incidencias?\s+(abiertas?|pendientes?|activas?|en\s+curso))\b/i,
    /\b(qu[eé]\s+incidencias?\s+(hay|tenemos))\b/i,
    /\b(incidencias?\s+(sin\s+(resolver|cerrar)|por\s+(resolver|cerrar)))\b/i,
    /\b(reportes?\s+(pendientes?|abiertos?))\b/i,
  ],
  execute: async (params) => {
    const limit = (params.limit as number) || 10
    const all: Incident[] = []
    // getIncidents acepta un solo status — itero los 3 abiertos
    for (const status of STATUS_OPEN) {
      const list = await getIncidents({ status, limit })
      all.push(...list)
    }
    // Deduplicar por id y ordenar por prioridad luego fecha
    const byId = new Map<string, Incident>()
    for (const inc of all) byId.set(inc.id, inc)
    const PRIORITY_RANK: Record<IncidentPriority, number> = {
      critica: 0,
      alta: 1,
      media: 2,
      baja: 3,
    }
    const sorted = Array.from(byId.values())
      .sort((a, b) => {
        const ra = PRIORITY_RANK[a.prioridad] ?? 9
        const rb = PRIORITY_RANK[b.prioridad] ?? 9
        if (ra !== rb) return ra - rb
        const ta = a.createdAt instanceof Date ? a.createdAt.getTime() : new Date(a.createdAt as string).getTime()
        const tb = b.createdAt instanceof Date ? b.createdAt.getTime() : new Date(b.createdAt as string).getTime()
        return tb - ta
      })
      .slice(0, limit)

    if (sorted.length === 0) {
      return {
        ok: true,
        data: { count: 0 },
        summary: 'No hay incidencias abiertas en este momento. 🎉',
        label: 'Incidencias abiertas',
      }
    }

    const byPriority: Record<IncidentPriority, number> = { critica: 0, alta: 0, media: 0, baja: 0 }
    for (const inc of sorted) byPriority[inc.prioridad]++
    const header = `Total abiertas: ${sorted.length} (🔴 ${byPriority.critica} · 🟠 ${byPriority.alta} · 🟡 ${byPriority.media} · 🟢 ${byPriority.baja})`
    const body = sorted.map(summarizeIncident).join('\n')
    return {
      ok: true,
      data: { count: sorted.length, byPriority, incidents: sorted },
      summary: `${header}\n\n${body}`,
      label: 'Incidencias abiertas',
    }
  },
})

// ─── incidents.byPriority ──────────────────────────────────────────────

registerTool({
  name: 'incidents.byPriority',
  category: 'incidents',
  description:
    'Lista incidencias abiertas filtradas por prioridad (crítica/alta/media/baja). Detecta la prioridad en el texto del usuario.',
  params: [
    {
      name: 'prioridad',
      type: 'string',
      enum: ['critica', 'alta', 'media', 'baja'],
      required: false,
      default: 'critica',
      description: 'Prioridad a filtrar',
    },
  ],
  triggers: [
    /\b(incidencias?|reportes?)\s+(cr[ií]ticas?|cr[ií]tica|de\s+(alta|m[aá]xima))\b/i,
    /\bcr[ií]ticas?\s+(abiertas?|pendientes?|hay)\b/i,
    /\b(prioridad\s+(alta|cr[ií]tica|m[aá]xima))\b/i,
    /\b(urgentes?\s+(hay|tenemos))\b/i,
  ],
  execute: async (params) => {
    const prioridad = (params.prioridad as IncidentPriority) || 'critica'
    const all: Incident[] = []
    for (const status of STATUS_OPEN) {
      const list = await getIncidents({ status, prioridad, limit: 20 })
      all.push(...list)
    }
    const byId = new Map<string, Incident>()
    for (const inc of all) byId.set(inc.id, inc)
    const sorted = Array.from(byId.values()).sort((a, b) => {
      const ta = a.createdAt instanceof Date ? a.createdAt.getTime() : new Date(a.createdAt as string).getTime()
      const tb = b.createdAt instanceof Date ? b.createdAt.getTime() : new Date(b.createdAt as string).getTime()
      return tb - ta
    })

    if (sorted.length === 0) {
      return {
        ok: true,
        data: { prioridad, count: 0 },
        summary: `No hay incidencias abiertas con prioridad ${prioridad}. ✅`,
        label: `Prioridad ${prioridad}`,
      }
    }
    const body = sorted.map(summarizeIncident).join('\n')
    return {
      ok: true,
      data: { prioridad, count: sorted.length, incidents: sorted },
      summary: `Incidencias abiertas con prioridad ${prioridad} (${sorted.length}):\n\n${body}`,
      label: `Prioridad ${prioridad}`,
    }
  },
})

// ─── incidents.recent ──────────────────────────────────────────────────

registerTool({
  name: 'incidents.recent',
  category: 'incidents',
  description:
    'Lista las incidencias más recientes (cualquier estado). Útil para "última incidencia", "qué pasó hoy", "qué reportaron".',
  params: [
    { name: 'limit', type: 'number', required: false, default: 5, description: 'Máx resultados' },
  ],
  triggers: [
    /\b(qu[eé]\s+pas[oó]\s+(hoy|ayer|anoche))\b/i,
    /\b([uú]ltimas?\s+incidencias?)\b/i,
    /\b(incidencias?\s+recientes?)\b/i,
    /\b(qu[eé]\s+reportaron\s+(hoy|ayer))\b/i,
    /\b(qu[eé]\s+novedades?)\b/i,
  ],
  execute: async (params) => {
    const limit = (params.limit as number) || 5
    const list = await getIncidents({ limit })
    if (list.length === 0) {
      return {
        ok: true,
        data: { count: 0 },
        summary: 'No hay incidencias registradas.',
        label: 'Incidencias recientes',
      }
    }
    const sorted = [...list]
      .sort((a, b) => {
        const ta = a.createdAt instanceof Date ? a.createdAt.getTime() : new Date(a.createdAt as string).getTime()
        const tb = b.createdAt instanceof Date ? b.createdAt.getTime() : new Date(b.createdAt as string).getTime()
        return tb - ta
      })
      .slice(0, limit)
    const body = sorted.map(summarizeIncident).join('\n')
    return {
      ok: true,
      data: { count: sorted.length, incidents: sorted },
      summary: `Últimas ${sorted.length} incidencias:\n\n${body}`,
      label: 'Incidencias recientes',
    }
  },
})

// ─── incidents.byEquipment ─────────────────────────────────────────────

registerTool({
  name: 'incidents.byEquipment',
  category: 'incidents',
  description:
    'Lista incidencias asociadas a un equipo específico. Resuelve el equipo por texto libre (nombre, código). Útil para "incidencias de la baader 200", "qué le pasó al motor X", "historial del compresor".',
  params: [
    {
      name: 'equipmentText',
      type: 'string',
      required: false,
      description: 'Nombre o código del equipo a buscar',
    },
    { name: 'limit', type: 'number', required: false, default: 10, description: 'Máx resultados' },
  ],
  triggers: [
    /\b(incidencias?|fallas?|reportes?|historial)\s+(de|del|en|para)\s+(la?|el)?\s*(baader|grader|marel|cinta|motor|bomba|compresor|sensor|valvula|v[aá]lvula|reductor|filete|eviscerador|empacadora)/i,
    /\b(qu[eé]\s+(le\s+)?pas[oó]\s+(a|al|con))\b/i,
    /\b(historial\s+de\s+fallas?)\b/i,
  ],
  execute: async (params) => {
    const equipmentText = (params.equipmentText as string) || ''
    const limit = (params.limit as number) || 10
    if (!equipmentText.trim()) {
      return {
        ok: false,
        error: 'Falta texto del equipo a buscar',
        label: 'Incidencias por equipo',
      }
    }
    const equipment = await findEquipmentByText(equipmentText)
    if (!equipment) {
      return {
        ok: true,
        data: { equipmentText, count: 0 },
        summary: `No encontré un equipo que coincida con "${equipmentText}". Probá con el nombre completo o código.`,
        label: 'Incidencias por equipo',
      }
    }
    const list = await getIncidents({ equipmentId: equipment.id, limit })
    if (list.length === 0) {
      return {
        ok: true,
        data: { equipmentId: equipment.id, equipmentName: equipment.nombre, count: 0 },
        summary: `${equipment.nombre} (${equipment.codigo}) no tiene incidencias registradas. ✅`,
        label: `Incidencias de ${equipment.nombre}`,
      }
    }
    const sorted = [...list].sort((a, b) => {
      const ta = a.createdAt instanceof Date ? a.createdAt.getTime() : new Date(a.createdAt as string).getTime()
      const tb = b.createdAt instanceof Date ? b.createdAt.getTime() : new Date(b.createdAt as string).getTime()
      return tb - ta
    })
    const openCount = sorted.filter(i => STATUS_OPEN.includes(i.status)).length
    const body = sorted.map(summarizeIncident).join('\n')
    return {
      ok: true,
      data: { equipmentId: equipment.id, equipmentName: equipment.nombre, count: sorted.length, openCount, incidents: sorted },
      summary: `Incidencias de ${equipment.nombre} (${equipment.codigo}) — total ${sorted.length}, ${openCount} abiertas:\n\n${body}`,
      label: `Incidencias de ${equipment.nombre}`,
    }
  },
})
