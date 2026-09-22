/**
 * Accesos directos al monitor de línea desde la app (Inicio y el propio
 * monitor), sin pasar por Análisis de Turno.
 *
 * El monitor es un link público con token (`/monitor/{token}`). Cada línea
 * tiene UNO fijo: `ensureLineMonitor` en el backend lo reusa y extiende, nunca
 * crea otro — el QR pegado en la pared y el del acceso directo son el mismo.
 * Acá solo se recuerda ese token en el aparato para no llamar a la función en
 * cada toque (la llamada cuesta una invocación y ~1-3 s en frío).
 *
 * Solo para supervisor/admin: el callable lo exige.
 */
import { collection, documentId, getDocs, query, where } from '@/services/firestoreTracked'
import { db } from '../firebase'
import { PLANT_LINES, type PlantLineConfig, type PlantLineId } from '@/config/plantLines'
import { createPublicShiftMonitor } from './publicShiftMonitor.service'
import { hayTurnoEnCurso, type TurnoLigero } from './turnoEnCurso'

/** Las líneas con acceso directo al monitor (decisión de Orel, 22-09: solo Principal). */
export const LINEAS_CON_MONITOR: readonly PlantLineId[] = ['chonchi-eviscerado', 'chonchi-filete']

export function lineaConMonitor(id: string | null | undefined): PlantLineConfig | null {
  if (!id || !(LINEAS_CON_MONITOR as readonly string[]).includes(id)) return null
  return PLANT_LINES.find((l) => l.id === id) ?? null
}

/**
 * La línea de un doc de monitor. Los links viejos pueden no traer
 * `plantLineId`: en ese caso manda el `plantSlug`, que en Principal es único
 * por línea (chonchi = Eviscerado, filete = Filete).
 */
export function lineaDelMonitor(plantLineId: string | null | undefined, plantSlug: string | null | undefined): PlantLineConfig | null {
  return lineaConMonitor(plantLineId)
    ?? LINEAS_CON_MONITOR.map((id) => lineaConMonitor(id)).find((l) => l?.plantSlug === plantSlug)
    ?? null
}

const CLAVE = (plantSlug: string) => `monitor-linea:${plantSlug}`
/** Con menos de un día de vigencia se vuelve a pedir: el backend lo renueva. */
const MARGEN_MS = 24 * 3_600_000

function leerCache(plantSlug: string): string | null {
  try {
    const raw = localStorage.getItem(CLAVE(plantSlug))
    if (!raw) return null
    const { token, expiresAt } = JSON.parse(raw) as { token?: string; expiresAt?: string }
    if (!token || !expiresAt) return null
    return Date.parse(expiresAt) - Date.now() > MARGEN_MS ? token : null
  } catch {
    return null
  }
}

function guardarCache(plantSlug: string, token: string, expiresAt: string | null | undefined) {
  if (!expiresAt) return
  try { localStorage.setItem(CLAVE(plantSlug), JSON.stringify({ token, expiresAt })) } catch { /* sin almacenamiento */ }
}

/** Olvida el token recordado (p. ej. si el link resultó revocado). */
export function olvidarTokenMonitor(plantSlug: string) {
  try { localStorage.removeItem(CLAVE(plantSlug)) } catch { /* sin almacenamiento */ }
}

/**
 * El token del monitor de la línea: el recordado si sigue vigente, si no el
 * que entrega el backend (mismos parámetros que «Abrir monitor» de Análisis
 * de Turno, para que las etiquetas de la cabecera no cambien).
 */
export async function tokenMonitorDeLinea(linea: PlantLineConfig): Promise<string> {
  const cacheado = leerCache(linea.plantSlug)
  if (cacheado) return cacheado
  const { token, expiresAt } = await createPublicShiftMonitor({
    mode:            'line',
    plantSlug:       linea.plantSlug,
    plantLineId:     linea.id,
    areaLabel:       linea.areaLabel,
    lineLabel:       linea.label,
    machineKindLong: linea.machineKind?.long,
    targetPieces:    linea.shiftTargetPieces,
    ttlHours:        720,
  })
  guardarCache(linea.plantSlug, token, expiresAt)
  return token
}

export const rutaMonitor = (token: string) => `/monitor/${token}`

// ─── ¿Hay turno en curso? ─────────────────────────────────────────────────────

/** «2026-09-21» en hora de planta: los ids de turno llevan la fecha local. */
function fechaPlanta(ms: number): string {
  return new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Santiago' }).format(new Date(ms))
}

const cacheEstado = new Map<string, { at: number; valor: boolean }>()
const CACHE_ESTADO_MS = 2 * 60_000

/**
 * Lee los turnos de ayer y hoy de la planta (el turno noche arranca con la
 * fecha de ayer) — ~6 docs de ~5 KB. Se recuerda 2 min en memoria para que
 * volver a Inicio no relea.
 */
export async function turnoEnCursoDePlanta(plantSlug: string): Promise<boolean> {
  const ahora = Date.now()
  const previo = cacheEstado.get(plantSlug)
  if (previo && ahora - previo.at < CACHE_ESTADO_MS) return previo.valor
  const desde = fechaPlanta(ahora - 86_400_000)
  const snap = await getDocs(query(collection(db, 'shoplogix', plantSlug, 'shifts'), where(documentId(), '>=', desde)))
  const valor = hayTurnoEnCurso(snap.docs.map((d) => ({ id: d.id, ...(d.data() as Omit<TurnoLigero, 'id'>) })), ahora)
  cacheEstado.set(plantSlug, { at: ahora, valor })
  return valor
}
