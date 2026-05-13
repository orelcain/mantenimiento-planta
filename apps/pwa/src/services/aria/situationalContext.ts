/**
 * ARIA Situational Context — Sprint 3 ARIA-JARVIS.
 *
 * Snapshot del estado actual de la planta que se inyecta en CADA mensaje
 * del chatbot (no solo cuando se preguntan métricas específicas). Permite
 * a ARIA anticipar el contexto operativo y responder "JARVIS-like".
 *
 * Composición:
 *  - Turno actual (hora, label, range)
 *  - Grader hoy (P0%, piezas, productionRate si hay datos cargados)
 *  - Incidencias abiertas (count + criticas)
 *  - Equipos fuera de servicio (count)
 *
 * Cache: 5 minutos. Suficiente para no martillar Firestore en una conversación
 * normal y suficientemente fresco para reflejar cambios operativos.
 *
 * Reusa el Tool Registry de Sprint 1+2 — cada query es una tool ya probada.
 */
import { executeTool } from './tools'
import { logger } from '@/lib/logger'

const CACHE_TTL_MS = 5 * 60 * 1000 // 5 min
const QUERY_TIMEOUT_MS = 4000 // fail-soft si Firestore tarda > 4s

export interface SituationalSnapshot {
  builtAt: number
  shift: {
    label: string
    range: string
    hora: string
  }
  graderToday: {
    hasData: boolean
    text: string
  }
  incidents: {
    openCount: number
    criticalCount: number
    text: string
  }
  equipment: {
    outOfServiceCount: number
    text: string
  }
}

interface CachedSnapshot {
  snapshot: SituationalSnapshot
  builtAt: number
}

let cache: CachedSnapshot | null = null

// ─── Helpers ───────────────────────────────────────────────────────────

async function withTimeout<T>(p: Promise<T>, ms: number, fallback: T): Promise<T> {
  return await Promise.race([
    p,
    new Promise<T>((resolve) => setTimeout(() => resolve(fallback), ms)),
  ])
}

function safeNumber(v: unknown, fallback = 0): number {
  return typeof v === 'number' && isFinite(v) ? v : fallback
}

// ─── Build snapshot ────────────────────────────────────────────────────

/**
 * Construye el snapshot situacional. Cachea por 5min.
 * Si todas las queries fallan retorna un snapshot mínimo solo con turno actual
 * (que no toca Firestore).
 */
export async function buildSituationalSnapshot(force = false): Promise<SituationalSnapshot> {
  if (!force && cache && Date.now() - cache.builtAt < CACHE_TTL_MS) {
    return cache.snapshot
  }

  // Las 4 tools en paralelo con timeout suave
  const FAIL_RESULT = { ok: false as const, error: 'timeout' }
  const [shiftRes, graderRes, incidentsRes, equipmentRes] = await Promise.all([
    withTimeout(executeTool('shift.current'), QUERY_TIMEOUT_MS, FAIL_RESULT),
    withTimeout(executeTool('shift.today'), QUERY_TIMEOUT_MS, FAIL_RESULT),
    withTimeout(executeTool('incidents.open', { limit: 5 }), QUERY_TIMEOUT_MS, FAIL_RESULT),
    withTimeout(
      executeTool('equipment.status', { estado: 'fuera_servicio' }),
      QUERY_TIMEOUT_MS,
      FAIL_RESULT,
    ),
  ])

  // ── Shift (siempre disponible, no toca Firestore) ──
  const shiftData = (shiftRes.ok && (shiftRes.data as Record<string, unknown>)) || {}
  const shift = {
    label: String(shiftData.label || 'Turno desconocido'),
    range: String(shiftData.range || '—'),
    hora: String(shiftData.hora || new Date().toLocaleTimeString('es-CL', { hour: '2-digit', minute: '2-digit' })),
  }

  // ── Grader hoy ──
  let graderToday: SituationalSnapshot['graderToday']
  if (graderRes.ok) {
    const data = (graderRes.data as Record<string, unknown>) || {}
    const count = safeNumber(data.count)
    if (count === 0) {
      graderToday = {
        hasData: false,
        text: 'sin datos cargados aún (turno en curso o cierre pendiente)',
      }
    } else {
      const totalPieces = safeNumber(data.totalPieces)
      const p0Pct = safeNumber(data.p0Pct)
      graderToday = {
        hasData: true,
        text: `${count} turno(s) cargados · ${totalPieces.toLocaleString('es-CL')} piezas · P0% global ${p0Pct.toFixed(2)}%`,
      }
    }
  } else {
    graderToday = { hasData: false, text: 'consulta falló' }
  }

  // ── Incidencias abiertas ──
  let incidents: SituationalSnapshot['incidents']
  if (incidentsRes.ok) {
    const data = (incidentsRes.data as Record<string, unknown>) || {}
    const openCount = safeNumber(data.count)
    const byPriority = (data.byPriority as Record<string, number>) || {}
    const criticalCount = safeNumber(byPriority.critica)
    if (openCount === 0) {
      incidents = { openCount: 0, criticalCount: 0, text: 'sin incidencias abiertas 🎉' }
    } else {
      const altaCount = safeNumber(byPriority.alta)
      const parts = [`${openCount} abiertas`]
      if (criticalCount > 0) parts.push(`${criticalCount} 🔴 críticas`)
      if (altaCount > 0) parts.push(`${altaCount} 🟠 altas`)
      incidents = { openCount, criticalCount, text: parts.join(' · ') }
    }
  } else {
    incidents = { openCount: 0, criticalCount: 0, text: 'consulta falló' }
  }

  // ── Equipos fuera de servicio ──
  let equipment: SituationalSnapshot['equipment']
  if (equipmentRes.ok) {
    const data = (equipmentRes.data as Record<string, unknown>) || {}
    const oos = safeNumber(data.count)
    equipment = {
      outOfServiceCount: oos,
      text: oos === 0 ? 'sin equipos fuera de servicio ✅' : `${oos} equipo(s) fuera de servicio ⛔`,
    }
  } else {
    equipment = { outOfServiceCount: 0, text: 'consulta falló' }
  }

  const snapshot: SituationalSnapshot = {
    builtAt: Date.now(),
    shift,
    graderToday,
    incidents,
    equipment,
  }

  cache = { snapshot, builtAt: snapshot.builtAt }
  return snapshot
}

/**
 * Opciones de contexto NO-cacheable: van separadas del snapshot porque
 * cambian por sesión/usuario y no deben quedarse en el cache TTL.
 */
export interface SituationalContextOpts {
  userId?: string | undefined
  userName?: string | undefined
}

/**
 * Formatea el snapshot como bloque markdown listo para inyectar como
 * system message en el prompt del LLM. Tono operativo y compacto.
 * Opcionalmente incorpora info del usuario actual (que NO está cacheado
 * dentro del snapshot — evita contaminación cruzada entre usuarios).
 */
export function formatSituationalSnapshot(s: SituationalSnapshot, opts?: SituationalContextOpts): string {
  const lines: string[] = [
    '📡 CONTEXTO SITUACIONAL (snapshot del estado de la planta — úsalo proactivamente):',
    '',
  ]
  if (opts?.userName || opts?.userId) {
    const who = opts.userName || `usuario ${opts.userId}`
    lines.push(`• **Usuario actual**: ${who}`)
  }
  lines.push(
    `• **Turno**: ${s.shift.label} (${s.shift.range}) · hora local ${s.shift.hora}`,
    `• **Grader hoy**: ${s.graderToday.text}`,
    `• **Incidencias**: ${s.incidents.text}`,
    `• **Equipos**: ${s.equipment.text}`,
    '',
    'INSTRUCCIONES: este contexto es siempre vigente — NO digas "no sé" sobre estos datos. Si la pregunta del usuario los toca tangencialmente, menciónalos brevemente al inicio (ej: "tenés 2 críticas abiertas, una de ellas en la baader 200…"). Si conocés el nombre del usuario, podés dirigirte a él/ella por su nombre cuando sea natural. Mantené la respuesta breve y operacional.',
  )
  return lines.join('\n')
}

/**
 * Convenience: snapshot + format en una llamada. El opts (userId/userName)
 * va aparte para que el cache TTL solo cubra los datos operacionales pesados.
 */
export async function buildSituationalContextBlock(opts?: SituationalContextOpts): Promise<string> {
  try {
    const snap = await buildSituationalSnapshot()
    return formatSituationalSnapshot(snap, opts)
  } catch (err) {
    logger.error('[situationalContext] error building snapshot', err instanceof Error ? err : undefined)
    return ''
  }
}

/**
 * Invalida el cache. Llamar tras eventos que cambien estado (incidencia
 * nueva, equipo cambia estado, summary del día se guarda).
 */
export function clearSituationalCache(): void {
  cache = null
}
