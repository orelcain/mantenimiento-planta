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

/**
 * Resumen liviano de un turno anterior DEL MISMO NOMBRE, para pronosticar.
 *
 * `history` trae los seis turnos cronológicos y en las líneas con varios turnos
 * por día quedaban solo dos comparables — mezclar el de día con el de noche no
 * es una opción.
 *
 * ⚠ `curve` son objetos `{m: minuto de turno, p: piezas acumuladas}` cada 15
 * min y no pares `[m, p]`: Firestore rechaza los arrays anidados y el write del
 * doc falla entero.
 */
export interface ForecastHistoryShift {
  shiftDocId: string
  dateKey: string
  curve: Array<{ m: number; p: number }>
  total: number
  producingMin: number
  micro: number | null
  /**
   * Lo que Shoplogix esperaba de este turno YA CERRADO (suma de
   * `expectedTotalCycles`). Es la meta firme cuando nadie cargó cuota: en el
   * turno EN CURSO el mismo campo se completa sobre la marcha. Ver
   * `objetivoDelTurno`. Ausente en entradas cacheadas de antes.
   */
  expected?: number | null
  /**
   * Desglose del tiempo del turno, para explicar por qué hoy cerró distinto
   * («Qué cambió contra ayer») y para los récords por componente.
   * Ausentes en entradas cacheadas antes de publicarse — el backend las
   * reconstruye una vez y quedan.
   */
  windowMin?: number | null
  plannedMin?: number | null
  recoverableMin?: number | null
}

export interface PublicMonitorLive {
  updatedAt: string
  lastSyncAt: string | null
  /** El contador VIVO del whiteboard de Shoplogix al momento del sync (el
      mismo número de la pantalla de planta). `at` es UTC real. null en turnos
      históricos o anteriores al deploy del rollup vivo. */
  shoplogixLive?: { totalCycles: number; at: string | null } | null
  scheduledStart: string | null
  scheduledEnd: string | null
  /**
   * Cierre PROGRAMADO del turno, de la config del módulo.
   *
   * ⚠ Distinto de `scheduledEnd`, que se deriva del último intervalo
   * sincronizado y va corriendo detrás del reloj: con aquél el tiempo restante
   * da siempre ~0. Para "cuánto falta para el cierre" se usa éste.
   * Ausente en docs escritos antes de que el backend lo publicara.
   */
  plannedEnd?: string | null
  /**
   * De dónde salió `plannedEnd`. `historial` es el caso normal: la mediana de
   * los turnos anteriores con el mismo nombre. `config` solo cuando el turno es
   * nuevo y todavía no tiene historia.
   */
  plannedEndSource?: 'fijado' | 'historial' | 'config' | 'duracion' | null
  /**
   * Set point operacional de la máquina, editado por un supervisor en la PWA.
   * `medidoEl`/`metodo`/`por` viajan porque la fuente es parte del dato.
   */
  setPoint?: { cpm: number; medidoEl: string | null; metodo: string | null; por: string | null } | null
  /** Nombre del turno según Shoplogix — con él se fija el cierre de ESTE turno. */
  shiftName?: string | null
  /** Turnos anteriores usados, cuando se aprendió del historial. */
  plannedEndSamples?: number | null
  /**
   * Ritmo de los turnos anteriores en pz/min, sobre TIEMPO DE RELOJ (no sobre
   * uptime) — la misma base en la que se calcula el ritmo requerido, para que
   * los dos números se puedan comparar.
   */
  paceMedianCpm?: number | null
  /** El mejor de esos turnos: lo que esta línea demostró que puede dar. */
  paceBestCpm?: number | null
  paceSamples?: number | null
  /** Cuota del turno según la config del módulo. */
  quotaPieces?: number | null
  /**
   * Peso promedio del pescado, kg por pieza, cargado a mano durante el turno.
   * Shoplogix cuenta ciclos y no manda kilos: sin este dato el monitor no puede
   * estimar una sola tonelada, y las reales llegan después por el Grader.
   */
  pesoPromedioKg?: number | null
  /** Cuando la cuota se pidió en toneladas: el pedido original. */
  quotaOrigen?: { toneladas: number; pesoPromedioKg: number | null } | null
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
  /**
   * A dónde se fue el tiempo del turno.
   *
   * ⚠ La separación planificado / recuperable es el corazón de "¿se llega a la
   * cuota?": exigir que se recupere una colación es pedir un imposible. Las
   * causas van con su detalle en los dos grupos, no agrupadas en un total —
   * un "planificado: 78 min" sin desglose invita a sospechar que se esconde algo.
   */
  timeBreakdown?: {
    /** Versión de la rejilla (2 = lapso real, fix #562). Ausente en docs viejos. */
    tbv?: number | null
    windowMin: number
    /** Minutos de LÍNEA: los tres suman la ventana, con una máquina o con tres. */
    producingMin: number
    plannedMin: number
    recoverableMin: number
    /**
     * `min` son los minutos que la causa estuvo activa en alguna máquina;
     * `lineMin`, los que además frenaron la línea entera. Con varias máquinas
     * los dos se separan mucho y esa diferencia es el dato: en Chonchi KNURO se
     * llevó 98 min de UNA Baader y solo 4 detuvieron la línea.
     */
    planned: Array<{ reason: string; min: number; count: number; lineMin?: number }>
    recoverable: Array<{ reason: string; min: number; count: number; lineMin?: number }>
  } | null
  /** Razones de detención, referenciadas por índice desde `stopEvents`. */
  stopReasons?: string[]
  /** Detenciones ubicadas: `r` índice de razón, `f` inicio ISO, `s` segundos. */
  stopEvents?: Array<{ r: number; f: string; s: number }>
  /**
   * Lo que el operador escribió en Shoplogix sobre una detención: `t` el texto,
   * `r` la causa a la que lo asoció, `f`/`h` la ventana (ISO wall-clock).
   *
   * Es el único texto en castellano de todo el turno. "Se corre litografiado y
   * se debe detener y ordenar" explica una FALLA OPERACIONAL de 10 min mucho
   * mejor que la etiqueta.
   */
  comments?: Array<{ t: string; r: string | null; f: string | null; h: string | null }>
}

/**
 * `shift` sigue un turno fijo; `line` sigue el turno VIGENTE de la línea y el
 * backend le cambia solo el turno al que apunta (link que no se regenera).
 * Ausente en los docs creados antes del modo línea → se tratan como `shift`.
 */
export type MonitorMode = 'shift' | 'line'

/**
 * El PULSO: el contador vivo de Shoplogix, leído cada minuto.
 *
 * Los buckets de producción son de 5 min y no existen hasta que cierran; este
 * contador es el del instante y es el mismo número que muestra la pantalla de
 * planta. Con dos lecturas seguidas sale el ritmo instantáneo (`cpm`).
 */
export interface PulsoMonitor {
  /** ISO de la última lectura. */
  at: string
  /** Acumulado del turno en ese instante. */
  totalCycles: number
  /** Piezas por minuto entre las dos últimas lecturas. null si no se puede. */
  cpm: number | null
  /** Las últimas lecturas, para dibujar el pulso reciente. */
  lecturas?: Array<{ at: string; totalCycles: number }>
}

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
   * Contador vivo de Shoplogix, refrescado cada minuto (ver `PulsoMonitor`).
   * Ausente en monitores creados antes de esta función o fuera de turno.
   */
  pulse?: PulsoMonitor | null
  /**
   * Turnos anteriores de la línea, del más reciente al más viejo, para poder
   * deslizar hacia atrás sin sesión. Los compone el backend con el mismo
   * formato que `live`. Ausente en docs creados antes de esta función.
   */
  history?: Array<{ shiftDocId: string; dateKey: string; shiftId: string; live: PublicMonitorLive }>
  /** Turnos del MISMO nombre, resumidos, para el pronóstico del cierre. */
  forecastHistory?: ForecastHistoryShift[]
  /**
   * Estadística LIVIANA de los últimos ~40 turnos, de TODOS los nombres.
   *
   * Sin curva (eso vive en `forecastHistory`) pero CON las causas, que es lo
   * que permite mirar «los últimos 30» en vez de los 6 de `history` — ese
   * carga la serie completa de cada turno y por eso son pocos. Y con día y
   * noche juntos, para poder comparar un turno contra el otro.
   *
   * ⚠ Ausente en docs que el backend todavía no repobló: el arreglo se llena
   * de a pocos turnos por corrida. Todo lo que lo use tiene que funcionar sin
   * él, cayendo a `history`/`forecastHistory`.
   */
  shiftStats?: ShiftStat[]
}

/** Un turno resumido, sin curva. Ver `buildShiftStats` en las functions. */
export interface ShiftStat {
  shiftDocId: string
  dateKey: string
  shiftId: string
  total: number
  producingMin: number
  windowMin?: number | null
  plannedMin?: number | null
  recoverableMin?: number | null
  /** Causas recuperables del turno: `reason`, minutos y cantidad de paradas. */
  recoverable?: Array<{ reason: string; min: number; count: number }>
  tbv?: number | null
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
const REFRESCAR_URL = 'https://us-central1-mantenimiento-planta-771a3.cloudfunctions.net/publicMonitorRefrescar'

/**
 * Pide a Shoplogix el contador vivo AHORA, sin esperar al pulso automático.
 *
 * ⚠ Adelanta «cuántas van» y el ritmo — es el mismo request liviano del pulso.
 * NO fuerza el sync completo del día (la curva, las paradas y el historial
 * siguen su ciclo de 5 min): eso son ~7 requests por planta y decenas de
 * segundos, demasiado para un botón que cualquiera con el link puede tocar.
 *
 * El servidor tiene throttle propio: si el pulso ya es fresco devuelve el que
 * hay con `yaFresco: true`, y eso NO es un error — es el dato más nuevo que
 * existe. El contador de Shoplogix se refresca cada ~2 min, así que pedirlo
 * más seguido devolvería el mismo número.
 *
 * No lanza: un botón de refrescar que rompe la pantalla es peor que uno que no
 * hace nada. Devuelve `null` si falló y quien llama decide qué mostrar.
 */
export async function refrescarPulso(token: string): Promise<
  { pulse: PulsoMonitor | null; yaFresco: boolean; esperaSeg?: number } | null
> {
  try {
    const r = await fetch(REFRESCAR_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ token }),
    })
    if (!r.ok) return null
    const d = await r.json()
    return { pulse: d.pulse ?? null, yaFresco: Boolean(d.yaFresco), esperaSeg: d.esperaSeg }
  } catch {
    return null
  }
}
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

// ─── Apodos de los aparatos (nota interna) ───────────────────────────────────

/**
 * Nombre que Mantención le pone a cada aparato que abre el monitor
 * ("celular de Control", "PC de la sala").
 *
 * ⚠ Es una nota INTERNA: vive en su propia colección, la lee solo gente con
 * sesión y NUNCA se copia al doc público. Quien abre el link no ve —ni debe
 * ver— cómo lo llamaron del otro lado.
 */
export function subscribeMonitorLabels(
  token: string,
  onUpdate: (labels: Record<string, string>) => void,
): () => void {
  return onSnapshot(
    doc(db, 'publicShiftMonitorLabels', token),
    (snap) => onUpdate((snap.data()?.labels ?? {}) as Record<string, string>),
    () => onUpdate({}),
  )
}

/** Guarda (o borra, con nombre vacío) el apodo de un aparato. */
export async function setMonitorLabel(token: string, viewerId: string, label: string): Promise<void> {
  const limpio = label.trim().slice(0, 40)
  const { setDoc, deleteField } = await import('@/services/firestoreTracked')
  await setDoc(
    doc(db, 'publicShiftMonitorLabels', token),
    { labels: { [viewerId]: limpio || deleteField() }, updatedAt: new Date().toISOString() },
    { merge: true },
  )
}
