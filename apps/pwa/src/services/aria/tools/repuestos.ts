/**
 * ARIA Tools — Repuestos
 *
 * Sprint 2.5 — Repuestos viven en sub-colecciones Firestore
 * (machines/{id}/repuestos, hierarchy/{id}/repuestos) sin agregación global.
 *
 * Estrategia conservadora: leer el cache que ya mantiene `useGlobalSearch`
 * (módulo-scoped, TTL 5min, poblado al visitar la pestaña Repuestos). Si el
 * cache está frío, devolver mensaje útil sugiriendo al usuario abrir la
 * pestaña. Evita reescaneos costosos disparados desde el chat.
 *
 * Una futura iteración puede sumar carga lazy desde la tool si el caso de
 * uso lo justifica (refactor de useGlobalSearch para extraer loader puro).
 */
import { registerTool } from './registry'
import { getGlobalRepuestosCache, type GlobalSearchResult } from '@/hooks/repuestos/useGlobalSearch'

const normalizeText = (s: string) =>
  s
    .toLowerCase()
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/[^a-z0-9\s]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()

function summarizeRepuesto(r: GlobalSearchResult): string {
  const rep = r.repuesto
  const parts: string[] = []
  const name = rep.textoBreve || rep.descripcion || '(sin nombre)'
  const sap = rep.codigoSAP ? ` · SAP ${rep.codigoSAP}` : ''
  const fab = rep.codigoFabricante ? ` · cód.fab ${rep.codigoFabricante}` : ''
  parts.push(`• ${name}${sap}${fab}`)
  parts.push(`   equipo: ${r.machineName}`)
  return parts.join('\n')
}

// ─── repuestos.search ──────────────────────────────────────────────────

registerTool({
  name: 'repuestos.search',
  category: 'repuestos',
  description:
    'Busca repuestos por nombre, código SAP o código de fabricante (texto libre). Usa el cache global mantenido por la pestaña Repuestos (TTL 5min).',
  params: [
    {
      name: 'query',
      type: 'string',
      required: false,
      description: 'Texto a buscar (nombre, SAP, cód. fabricante)',
    },
    { name: 'limit', type: 'number', required: false, default: 10, description: 'Máx resultados' },
  ],
  triggers: [
    /\b(repuestos?\s+(de|del|para)\s+|repuesto\s+\w+|qu[eé]\s+repuesto)\b/i,
    /\b(buscar\s+repuesto|c[oó]digo\s+sap)\b/i,
    /\b(tenemos\s+(el\s+)?repuesto)\b/i,
  ],
  execute: async (params) => {
    const query = String(params.query || '').trim()
    const limit = (params.limit as number) || 10
    if (!query) {
      return { ok: false, error: 'Falta texto a buscar', label: 'Buscar repuesto' }
    }
    const cache = getGlobalRepuestosCache()
    if (!cache) {
      return {
        ok: true,
        data: { query, count: 0, cacheCold: true },
        summary: `Aún no hay repuestos cargados en cache (TTL 5min). Abrí la pestaña **Repuestos** una vez y vuelvo a poder buscar "${query}".`,
        label: 'Buscar repuesto',
      }
    }
    const needle = normalizeText(query)
    if (!needle) {
      return { ok: false, error: 'Query vacío tras normalizar', label: 'Buscar repuesto' }
    }
    const matches = cache.filter((r) => {
      const hay = normalizeText(
        `${r.repuesto.textoBreve || ''} ${r.repuesto.descripcion || ''} ${r.repuesto.codigoSAP || ''} ${r.repuesto.codigoFabricante || ''} ${r.machineName}`,
      )
      return hay.includes(needle)
    })
    if (matches.length === 0) {
      return {
        ok: true,
        data: { query, count: 0 },
        summary: `Sin coincidencias para "${query}" entre ${cache.length} repuestos cacheados. Probá con SAP o código de fabricante.`,
        label: 'Buscar repuesto',
      }
    }
    const top = matches.slice(0, limit)
    const body = top.map(summarizeRepuesto).join('\n')
    return {
      ok: true,
      data: { query, count: matches.length, results: top },
      summary: `${matches.length} coincidencia(s) para "${query}" (mostrando ${top.length}):\n\n${body}`,
      label: 'Buscar repuesto',
    }
  },
})

// ─── Inferencia params ─────────────────────────────────────────────────

export function inferRepuestosParams(toolName: string, userMessage: string): Record<string, unknown> {
  const params: Record<string, unknown> = {}
  if (toolName === 'repuestos.search') {
    // Saca palabras trigger y deja el resto como query
    const q = userMessage
      .replace(/\b(repuestos?|buscar|tenemos|qu[eé]|el|la|los|las|de|del|para|c[oó]digo|sap)\b/gi, ' ')
      .replace(/[¿?¡!]/g, '')
      .replace(/\s+/g, ' ')
      .trim()
    if (q.length >= 2) params.query = q
  }
  return params
}
