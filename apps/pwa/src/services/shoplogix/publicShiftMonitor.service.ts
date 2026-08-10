/**
 * Monitor público de turno — cliente.
 *
 * Un supervisor genera un link/QR desde Análisis de Turno y Control de
 * Producción lo abre en `/monitor/{token}` SIN sesión: ve el avance de piezas
 * de la línea (total, pz/min, pz/h), el turno y su horario, el estado de la
 * máquina y los paros. Solo lectura.
 *
 * El doc espejo lo escribe siempre el backend (`functions/publicMonitor.js`):
 * las reglas dejan `publicShiftMonitors` en `write: if false` y la lectura
 * abierta pero acotada a links vigentes. Acá solo se llama a los callables y
 * se escucha el doc.
 *
 * ⚠ Timestamps: los de TURNO (`scheduledStart/End`, `effectiveStart/End`,
 * `series[].t`) son wall-clock de planta serializado como UTC → formatear con
 * getUTC*. `lastSyncAt` y `updatedAt` son UTC reales → comparables con
 * Date.now().
 */

import { doc, onSnapshot } from '@/services/firestoreTracked'
import { db } from '../firebase'

const COLLECTION = 'publicShiftMonitors'

export type MonitorStatus = 'produciendo' | 'detenida' | 'sin-datos'

export interface PublicMonitorMachine {
  id: string
  name: string
  /** "Baader 200" — vacío si el modelo no está registrado. */
  model: string
  pieces: number
  piecesPerHour: number
  uptimePct: number
  status: MonitorStatus
  currentReason: string | null
  currentSinceAt: string | null
}

export interface PublicMonitorLive {
  updatedAt: string
  lastSyncAt: string | null
  scheduledStart: string | null
  scheduledEnd: string | null
  effectiveStart: string | null
  effectiveEnd: string | null
  shiftClosed: boolean
  /** Jornada completa = `shiftPieces` + `outsidePieces`. */
  totalPieces: number
  /** Lo que Shoplogix metió DENTRO de la ventana del turno. */
  shiftPieces?: number
  /** Lo que la línea hizo fuera de esa ventana (arranque anticipado o cola). */
  outsidePieces?: number
  outsideRanges?: Array<{ from: string; to: string; pieces: number; kind: 'antes' | 'despues' }>
  expectedPieces: number
  piecesPerHour: number
  piecesPerMinute: number
  windowHours: number
  windowSource: 'effective' | 'shift'
  recentPieces: number
  recentMinutes: number
  recentPiecesPerMinute: number
  uptimePct: number
  uptimeSec: number
  downtimeSec: number
  breakSec: number
  status: MonitorStatus
  machinesProducing: number
  machinesTotal: number
  currentReason: string | null
  currentSinceAt: string | null
  machines: PublicMonitorMachine[]
  series: Array<{ t: string; pieces: number }>
  topStops: Array<{ reason: string; sec: number; count: number }>
}

/**
 * `shift` sigue un turno fijo; `line` sigue el turno VIGENTE de la línea y el
 * backend le cambia solo el turno al que apunta (link que no se regenera).
 * Ausente en los docs creados antes del modo línea → se tratan como `shift`.
 */
export type MonitorMode = 'shift' | 'line'

export interface PublicShiftMonitorDoc {
  token: string
  mode?: MonitorMode
  plantSlug: string
  dateKey: string
  shiftId: string
  shiftDocId: string
  plantLineId: string | null
  areaLabel: string | null
  lineLabel: string | null
  machineKindLong: string | null
  targetPieces: number | null
  createdBy: string
  createdAt: string
  expiresAt: string
  ttlHours: number
  live: PublicMonitorLive | null
  /**
   * Turnos anteriores de la línea, del más reciente al más viejo, para poder
   * deslizar hacia atrás sin sesión. Los compone el backend con el mismo
   * formato que `live`. Ausente en docs creados antes de esta función.
   */
  history?: Array<{ shiftDocId: string; dateKey: string; shiftId: string; live: PublicMonitorLive }>
}

/** Duraciones que acepta el backend (horas). 720 = 30 días. */
export const MONITOR_TTL_CHOICES = [12, 24, 72, 168, 720] as const
export type MonitorTtlHours = (typeof MONITOR_TTL_CHOICES)[number]

export interface CreateMonitorParams {
  mode?: MonitorMode
  plantSlug: string
  /** Obligatorios en modo `shift`; ignorados en modo `line`. */
  dateKey?: string
  shiftId?: string
  plantLineId?: string
  areaLabel?: string
  lineLabel?: string
  machineKindLong?: string
  targetPieces?: number
  ttlHours?: MonitorTtlHours
}

async function callable<TReq extends object, TRes>(name: string, data: TReq): Promise<TRes> {
  const [{ getFunctions, httpsCallable }, app] = await Promise.all([
    import('firebase/functions'),
    import('@/services/firebase').then(m => m.default),
  ])
  const fn = httpsCallable<TReq, TRes>(getFunctions(app), name)
  const res = await fn(data)
  return res.data
}

/**
 * Genera el link público. Requiere rol supervisor/admin (lo valida el backend).
 *
 * En modo `shift` falla si el turno todavía no tiene datos sincronizados — así
 * el link no nace apuntando a una pantalla vacía. En modo `line` se permite
 * crearlo fuera de turno (justamente sirve para el próximo), pero no sobre una
 * línea que nunca sincronizó.
 */
export function createPublicShiftMonitor(
  params: CreateMonitorParams,
): Promise<{ token: string; expiresAt: string; ttlHours: number }> {
  return callable('createPublicShiftMonitor', params)
}

/** Revoca el link: deja de funcionar para todos los que lo tengan. */
export function revokePublicShiftMonitor(token: string): Promise<{ ok: boolean }> {
  return callable('revokePublicShiftMonitor', { token })
}

/**
 * Escucha el doc del monitor en vivo. El backend lo reescribe cada vez que el
 * sync de Shoplogix cierra un ciclo (~5 min mientras el turno corre), así que
 * la pantalla se actualiza sola sin polling.
 *
 * `onError` cubre el caso de link vencido/revocado: las reglas dejan de dar
 * lectura y Firestore emite permission-denied.
 */
export function subscribePublicShiftMonitor(
  token: string,
  onUpdate: (doc: PublicShiftMonitorDoc | null) => void,
  onError: (err: Error) => void,
): () => void {
  return onSnapshot(
    doc(db, COLLECTION, token),
    (snap) => onUpdate(snap.exists() ? (snap.data() as PublicShiftMonitorDoc) : null),
    (err) => onError(err instanceof Error ? err : new Error(String(err))),
  )
}

// ─── Telemetría de uso (anónima) ─────────────────────────────────────────────

/** Cada cuánto late la pantalla pública mientras está a la vista. */
const HEARTBEAT_SEC = 120

const PING_URL = 'https://us-central1-mantenimiento-planta-771a3.cloudfunctions.net/publicMonitorPing'
const VIEWER_KEY = 'monitorViewerId'

/**
 * Identificador ALEATORIO del navegador, para poder contar dispositivos
 * distintos sin saber quién los usa. No se deriva de nada del aparato ni de la
 * persona; borrar los datos del navegador lo reinicia.
 */
function getViewerId(): string {
  try {
    const guardado = localStorage.getItem(VIEWER_KEY)
    if (guardado) return guardado
    const nuevo = crypto.randomUUID()
    localStorage.setItem(VIEWER_KEY, nuevo)
    return nuevo
  } catch {
    // Navegador sin localStorage (modo privado estricto): id efímero. Contará
    // como un dispositivo nuevo cada vez, y es preferible a no contar nada.
    return crypto.randomUUID()
  }
}

async function enviarPing(token: string, event: 'open' | 'ping', extra: { secs?: number; viewingPast?: boolean }) {
  try {
    await fetch(PING_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      // `keepalive` para que el último latido salga aunque se cierre la pestaña.
      keepalive: true,
      body: JSON.stringify({ token, viewerId: getViewerId(), event, ...extra }),
    })
  } catch {
    // La telemetría JAMÁS puede romper la pantalla de quien vino a mirar piezas.
  }
}

/**
 * Registra el uso del monitor: una apertura al entrar y un latido cada 2 min
 * mientras la pestaña está visible (si está en segundo plano no se cuenta como
 * tiempo mirado, que es lo honesto).
 *
 * @param viewingPastRef — función que dice si en ese momento se está mirando un
 *   turno anterior, para saber si el deslizamiento se usa.
 * @returns función de limpieza
 */
export function trackMonitorUsage(token: string, viewingPastRef: () => boolean): () => void {
  void enviarPing(token, 'open', { viewingPast: viewingPastRef() })

  let visibleDesde = document.visibilityState === 'visible' ? Date.now() : null

  const onVisibility = () => {
    if (document.visibilityState === 'visible') {
      visibleDesde = Date.now()
    } else if (visibleDesde) {
      const secs = Math.round((Date.now() - visibleDesde) / 1000)
      visibleDesde = null
      if (secs > 5) void enviarPing(token, 'ping', { secs, viewingPast: viewingPastRef() })
    }
  }
  document.addEventListener('visibilitychange', onVisibility)

  const id = setInterval(() => {
    if (document.visibilityState !== 'visible' || !visibleDesde) return
    const secs = Math.round((Date.now() - visibleDesde) / 1000)
    visibleDesde = Date.now()
    if (secs > 5) void enviarPing(token, 'ping', { secs, viewingPast: viewingPastRef() })
  }, HEARTBEAT_SEC * 1000)

  return () => {
    clearInterval(id)
    document.removeEventListener('visibilitychange', onVisibility)
    if (visibleDesde) {
      const secs = Math.round((Date.now() - visibleDesde) / 1000)
      if (secs > 5) void enviarPing(token, 'ping', { secs, viewingPast: viewingPastRef() })
    }
  }
}

export interface MonitorUsageStats {
  opens: number
  viewersCount: number
  secondsViewed: number
  firstOpenAt: number | null
  lastOpenAt: number | null
  devices: { movil?: number; escritorio?: number }
  shiftViews: { actual?: number; anteriores?: number }
  byDay: Record<string, { opens: number; secs: number; viewers: string[] }>
  byHour: Record<string, number>
  viewers: Record<string, { firstSeen: number; lastSeen: number; opens?: number; secs?: number; device?: string }>
}

/**
 * Estadísticas de uso del link. Solo para gente de la app (las reglas exigen
 * sesión): quien abre el link mira el turno, no quiénes más lo abrieron.
 */
export function subscribeMonitorStats(
  token: string,
  onUpdate: (stats: MonitorUsageStats | null) => void,
): () => void {
  return onSnapshot(
    doc(db, 'publicShiftMonitorStats', token),
    (snap) => onUpdate(snap.exists() ? (snap.data() as MonitorUsageStats) : null),
    () => onUpdate(null),
  )
}

/** Dispositivos con actividad en los últimos `min` minutos. */
export function contarMirandoAhora(stats: MonitorUsageStats | null, min = 10): number {
  if (!stats?.viewers) return 0
  const corte = Date.now() - min * 60_000
  return Object.values(stats.viewers).filter(v => (v.lastSeen || 0) >= corte).length
}
