/**
 * Monitor público de turno — payload en vivo para el link/QR sin sesión.
 *
 * Control de Producción necesita ver el avance de piezas de una línea
 * (caso de uso: la Baader 200 de Filete) sin entrar a Shoplogix ni tener
 * cuenta en la PWA. Un token UUID abre `/monitor/{token}`, que lee un único
 * doc público (`publicShiftMonitors/{token}`) con `allow read` acotado por
 * `expiresAt`. Solo lectura: el doc lo escribe SIEMPRE el Admin SDK.
 *
 * Por qué un espejo y no lectura directa de `shoplogix/**`: esa colección
 * exige `isNotAnonymous()` y abrirla expondría todos los turnos de todas las
 * plantas. El espejo publica SOLO los agregados del turno compartido, sin
 * comentarios de operador (texto libre que puede traer nombres o incidentes).
 *
 * Frescura: lo refresca el trigger del doc padre del turno, que el sync
 * reescribe cada ~5 min mientras el turno corre.
 *
 * Dos modos de link:
 *   - `shift` — sigue UN turno concreto. Sirve para compartir "el turno de
 *     ayer" y deja de moverse cuando ese turno termina.
 *   - `line`  — sigue el turno VIGENTE de la línea. Es el que se le deja fijo a
 *     Control de Producción: el mismo QR pegado en la pared vale mañana, porque
 *     en cada refresco el backend vuelve a resolver qué turno está corriendo
 *     (ver `resolveCurrentShiftDocId`).
 *
 * ⚠ Convención de tiempos (la misma del resto del módulo): los timestamps de
 * TURNO (`scheduledStart/End`, `effectiveStart/End`, intervals, states) son
 * wall-clock de planta guardado como UTC → se formatean con getUTC*. En
 * cambio `lastSyncAt` es UTC real. No mezclarlos.
 */

const shoplogixPolling = require('./shoplogix/polling')

const COLLECTION = 'publicShiftMonitors'

/** Intervalo de producción de Shoplogix: 5 minutos fijos. */
const INTERVAL_MIN = 5
/** Cuántos intervalos entran en la serie del sparkline (48 × 5 min = 4 h). */
const SERIES_MAX_POINTS = 48
/** Ventana "reciente" para la cadencia instantánea. */
const RECENT_INTERVALS = 6   // 30 min

/** Timestamp de Firestore / Date / string / número → Date. null si no se puede. */
function toDate(v) {
  if (!v) return null
  if (v instanceof Date) return Number.isNaN(v.getTime()) ? null : v
  if (typeof v.toDate === 'function') {
    const d = v.toDate()
    return Number.isNaN(d.getTime()) ? null : d
  }
  const d = new Date(v)
  return Number.isNaN(d.getTime()) ? null : d
}

const iso = (d) => (d ? d.toISOString() : null)

/** Etiqueta corta del modelo, espejo de `machineShortLabel` de la PWA. */
function modelLabel(type) {
  switch (type) {
    case 'baader_142': return 'Baader 142'
    case 'baader_200': return 'Baader 200'
    case 'marel_hg':   return 'Marel HG'
    case 'knuro':      return 'Knuro'
    default:           return ''
  }
}

/**
 * Estado actual de una máquina a partir de sus states.
 *
 * `isCurrent` lo marca Shoplogix en el state vigente al momento del sync. Si
 * ningún state lo trae (turno cerrado, o sync que llegó entre estados) se cae
 * al último state por tiempo, que es lo que el operador vería en la pantalla.
 */
function currentStateOf(states) {
  if (!Array.isArray(states) || states.length === 0) return null
  const ordered = [...states].sort((a, b) => {
    const aMs = toDate(a.startAt)?.getTime() ?? 0
    const bMs = toDate(b.startAt)?.getTime() ?? 0
    return aMs - bMs
  })
  return ordered.find(s => s.isCurrent === true) ?? ordered[ordered.length - 1]
}

/** 'produciendo' | 'detenida' | 'sin-datos' según el state vigente. */
function statusOf(state) {
  if (!state) return 'sin-datos'
  return state.type === 'uptime' ? 'produciendo' : 'detenida'
}

/** dateKey (wall-clock de planta) desplazado `n` días. */
function shiftDateKey(nowWall, n) {
  const d = new Date(nowWall.getTime() + n * 86_400_000)
  return d.toISOString().slice(0, 10)
}

/**
 * Resuelve qué turno está vigente en una línea AHORA. Es el corazón del modo
 * `line`: gracias a esto el mismo link sirve mañana sin regenerarlo.
 *
 * Cómo elige, en orden:
 *   1. El turno cuya ventana contiene el reloj de planta (con 30 min de gracia
 *      al final, porque `scheduledEnd` se deriva del último intervalo
 *      sincronizado y siempre va unos minutos atrasado).
 *   2. Si ninguno lo contiene (estamos entre turnos), el último que YA empezó.
 *      Preferible a no mostrar nada: quien abre el QL a las 20:00 quiere ver
 *      cómo terminó el turno, no una pantalla vacía.
 *
 * Solo mira los dateKey de hoy y ayer: un turno noche que arranca 21:30 queda
 * archivado bajo el día en que arrancó, así que a las 02:00 el vigente es de
 * "ayer". Se leen 2-6 docs padre; nada de subcolecciones.
 *
 * ⚠ Se resuelve SIEMPRE de nuevo, nunca se adopta el turno que disparó el
 * trigger: el re-sync móvil reescribe padres de ayer y de hace 2-3 días, y
 * adoptarlos haría saltar el monitor a un turno viejo.
 *
 * @returns {Promise<string|null>} shiftDocId, o null si la línea no tiene turnos recientes.
 */
async function resolveCurrentShiftDocId(db, plantSlug, nowWall = shoplogixPolling.toChileWall(new Date())) {
  const wanted = new Set([shiftDateKey(nowWall, 0), shiftDateKey(nowWall, -1)])

  const refs = await db.collection(`shoplogix/${plantSlug}/shifts`).listDocuments()
  const candidates = refs.filter(r => wanted.has(r.id.slice(0, 10)))
  if (candidates.length === 0) return null

  const docs = await db.getAll(...candidates)
  const parsed = []
  for (const snap of docs) {
    if (!snap.exists) continue
    const d = snap.data() || {}
    const start = toDate(d.scheduledStart)
    const end = toDate(d.scheduledEnd)
    if (!start) continue
    const pieces = (d.machines || []).reduce((a, m) => a + (m.totalCycles || 0), 0)
    // `Unscheduled` son las horas ENTRE turnos (limpieza, calibración). Solo
    // vale como turno si acumuló producción de verdad — mismo umbral que usa
    // la PWA para no disfrazar 20 ciclos sueltos de turno real.
    if (/unscheduled/i.test(d.shiftId || snap.id) && pieces < 50) continue
    parsed.push({ id: snap.id, start, end, pieces })
  }
  if (parsed.length === 0) return null

  const nowMs = nowWall.getTime()
  const GRACE_MS = 30 * 60 * 1000

  const vigente = parsed
    .filter(p => p.start.getTime() <= nowMs && (!p.end || nowMs <= p.end.getTime() + GRACE_MS))
    .sort((a, b) => b.start.getTime() - a.start.getTime())[0]
  if (vigente) return vigente.id

  const yaEmpezados = parsed
    .filter(p => p.start.getTime() <= nowMs)
    .sort((a, b) => b.start.getTime() - a.start.getTime())
  return yaEmpezados[0]?.id ?? null
}

/**
 * Compone el payload público de un turno.
 *
 * @returns {Promise<object|null>} null si el turno no tiene máquinas sincronizadas.
 */
async function buildMonitorLive(db, plantSlug, shiftDocId) {
  const parentRef = db.doc(`shoplogix/${plantSlug}/shifts/${shiftDocId}`)
  const [parentSnap, machinesSnap] = await Promise.all([
    parentRef.get(),
    parentRef.collection('machines').get(),
  ])

  if (machinesSnap.empty) return null

  const parent = parentSnap.exists ? parentSnap.data() : {}

  const machines = machinesSnap.docs
    .map(d => ({ id: d.id, ...d.data() }))
    .sort((a, b) => String(a.machineName || '').localeCompare(String(b.machineName || '')))

  // ── Ventana de producción ────────────────────────────────────────────────
  // Misma regla que `buildLineSnapshot` de la PWA: la cadencia se divide por la
  // ventana REAL (primera → última pieza), no por la del turno. En Filete el
  // turno de Shoplogix abarca 24 h y dividir por él daba 2 pz/h para un turno
  // que corrió 6 h.
  let firstMs = Infinity
  let lastMs = -Infinity
  for (const m of machines) {
    for (const ivRaw of m.intervals || []) {
      if ((ivRaw.cycles || 0) <= 0) continue
      const s = toDate(ivRaw.startAt)
      const e = toDate(ivRaw.endAt)
      if (s) firstMs = Math.min(firstMs, s.getTime())
      if (e) lastMs = Math.max(lastMs, e.getTime())
    }
  }
  const hasProduction = Number.isFinite(firstMs) && lastMs > firstMs

  const scheduledStart = toDate(parent.scheduledStart) ?? toDate(machines[0]?.scheduledStart) ?? toDate(machines[0]?.shiftStart)
  const scheduledEnd   = toDate(parent.scheduledEnd)   ?? toDate(machines[0]?.scheduledEnd)   ?? toDate(machines[0]?.shiftEnd)

  const effectiveStart = hasProduction ? new Date(firstMs) : toDate(parent.effectiveStart)
  const effectiveEnd   = hasProduction ? new Date(lastMs)  : toDate(parent.effectiveEnd)

  const effectiveHours = hasProduction ? (lastMs - firstMs) / 3_600_000 : 0
  const shiftHours = scheduledStart && scheduledEnd
    ? (scheduledEnd.getTime() - scheduledStart.getTime()) / 3_600_000
    : 0
  const windowSource = effectiveHours > 0 ? 'effective' : 'shift'
  const windowHours = effectiveHours > 0 ? effectiveHours : shiftHours

  // ── Agregados de línea ───────────────────────────────────────────────────
  const totalPieces = machines.reduce((a, m) => a + (m.totalCycles || 0), 0)
  const expectedPieces = machines.reduce((a, m) => a + (m.expectedTotalCycles || 0), 0)

  const piecesPerHour = windowHours > 0 ? totalPieces / windowHours : 0
  const piecesPerMinute = piecesPerHour / 60

  const uptimeSec = machines.reduce((a, m) => a + (m.shiftRuntimeBreakdown?.uptimeSec || 0), 0)
  const downtimeSec = machines.reduce((a, m) => a + (m.shiftRuntimeBreakdown?.downtimeSec || 0), 0)
  const breakSec = machines.reduce((a, m) => a + (m.shiftRuntimeBreakdown?.breakSec || 0), 0)
  const uptimePct = machines.length > 0
    ? (machines.reduce((a, m) => a + (m.shiftRuntime || 0), 0) / machines.length) * 100
    : 0

  // ── Serie temporal (suma de todas las máquinas por bucket de 5 min) ──────
  const byBucket = new Map()
  for (const m of machines) {
    for (const ivRaw of m.intervals || []) {
      const s = toDate(ivRaw.startAt)
      if (!s) continue
      const key = s.getTime()
      byBucket.set(key, (byBucket.get(key) || 0) + (ivRaw.cycles || 0))
    }
  }
  const seriesAll = [...byBucket.entries()]
    .sort((a, b) => a[0] - b[0])
    .map(([t, pieces]) => ({ t: new Date(t).toISOString(), pieces }))
  const series = seriesAll.slice(-SERIES_MAX_POINTS)

  // Cadencia reciente: últimos 30 min de intervalos sincronizados. Cero es un
  // dato válido y buscado (la línea está parada AHORA), no un hueco.
  const recentSlice = seriesAll.slice(-RECENT_INTERVALS)
  const recentPieces = recentSlice.reduce((a, p) => a + p.pieces, 0)
  const recentMinutes = recentSlice.length * INTERVAL_MIN
  const recentPiecesPerMinute = recentMinutes > 0 ? recentPieces / recentMinutes : 0

  // ── Por máquina ──────────────────────────────────────────────────────────
  const machinesOut = machines.map(m => {
    const st = currentStateOf(m.states)
    const pieces = m.totalCycles || 0
    const mHours = windowHours > 0 ? windowHours : 0
    return {
      id: m.id,
      name: m.machineName || m.id,
      model: modelLabel(m.machineType),
      pieces,
      piecesPerHour: mHours > 0 ? pieces / mHours : 0,
      uptimePct: (m.shiftRuntime || 0) * 100,
      status: statusOf(st),
      currentReason: st ? (st.reason || st.name || null) : null,
      currentSinceAt: st ? iso(toDate(st.startAt)) : null,
    }
  })

  // ── Top razones de paro (sin texto libre de operador) ────────────────────
  const stopAcc = new Map()
  for (const m of machines) {
    for (const s of m.states || []) {
      if (s.type === 'uptime') continue
      const reason = (s.reason || s.name || 'Sin razón').trim()
      const prev = stopAcc.get(reason) || { reason, sec: 0, count: 0 }
      prev.sec += s.durationSec || 0
      prev.count += 1
      stopAcc.set(reason, prev)
    }
  }
  const topStops = [...stopAcc.values()].sort((a, b) => b.sec - a.sec).slice(0, 5)

  // Estado de línea: produciendo si CUALQUIER máquina lo está.
  const producing = machinesOut.filter(m => m.status === 'produciendo')
  const status = machinesOut.every(m => m.status === 'sin-datos')
    ? 'sin-datos'
    : (producing.length > 0 ? 'produciendo' : 'detenida')

  // ¿Turno cerrado? Se compara wall-clock contra wall-clock (ver nota de
  // convención arriba). El proceso de Cloud Functions corre en UTC, así que el
  // "ahora" de planta se deriva con el mismo helper que usa el sync —
  // `new Date()` a secas iría 3-4 h adelantado.
  //
  // El margen de 30 min NO es cosmético: en Filete el `scheduledEnd` se deriva
  // del ÚLTIMO intervalo sincronizado, o sea que va corriendo detrás del reloj
  // y siempre queda unos minutos en el pasado. Sin margen, un turno en plena
  // producción se anunciaba como "cerrado" (verificado con el turno del
  // 10-ago: fin derivado 14:36 con la línea produciendo a las 14:40). Además
  // se exige que ninguna máquina esté corriendo: mientras haya producción, el
  // turno no está cerrado, diga lo que diga el horario.
  const nowWall = shoplogixPolling.toChileWall(new Date())
  const CLOSE_MARGIN_MS = 30 * 60 * 1000
  const stopped = machinesOut.filter(m => m.status === 'detenida')
  const shiftClosed = scheduledEnd
    ? nowWall.getTime() > scheduledEnd.getTime() + CLOSE_MARGIN_MS && producing.length === 0
    : false

  return {
    updatedAt: new Date().toISOString(),
    lastSyncAt: iso(toDate(parent.lastSyncAt)),
    scheduledStart: iso(scheduledStart),
    scheduledEnd: iso(scheduledEnd),
    effectiveStart: iso(effectiveStart),
    effectiveEnd: iso(effectiveEnd),
    shiftClosed,
    totalPieces,
    expectedPieces,
    piecesPerHour,
    piecesPerMinute,
    windowHours,
    windowSource,
    recentPieces,
    recentMinutes,
    recentPiecesPerMinute,
    uptimePct,
    uptimeSec,
    downtimeSec,
    breakSec,
    status,
    machinesProducing: producing.length,
    machinesTotal: machinesOut.length,
    currentReason: status === 'detenida' ? (stopped[0]?.currentReason ?? null) : null,
    currentSinceAt: status === 'detenida' ? (stopped[0]?.currentSinceAt ?? null) : null,
    machines: machinesOut,
    series,
    topStops,
  }
}

/**
 * Refresca un monitor. En modo `line` además re-resuelve qué turno está
 * vigente, así que devuelve también los campos de identidad del turno para que
 * la cabecera del link cambie sola al cambiar de turno.
 *
 * @returns {Promise<object|null>} patch a mergear en el doc, o null si no hay nada que publicar.
 */
async function buildMonitorPatch(db, monitor, currentShiftDocIdByPlant = new Map()) {
  const plantSlug = monitor.plantSlug
  if (!plantSlug) return null

  if (monitor.mode !== 'line') {
    const live = await buildMonitorLive(db, plantSlug, monitor.shiftDocId)
    return live ? { live } : null
  }

  // Modo línea: el turno vigente se resuelve una vez por planta y se reusa
  // entre los monitores de esa misma línea.
  let shiftDocId = currentShiftDocIdByPlant.get(plantSlug)
  if (shiftDocId === undefined) {
    shiftDocId = await resolveCurrentShiftDocId(db, plantSlug)
    currentShiftDocIdByPlant.set(plantSlug, shiftDocId)
  }
  if (!shiftDocId) return null

  const live = await buildMonitorLive(db, plantSlug, shiftDocId)
  if (!live) return null

  return {
    live,
    shiftDocId,
    dateKey: shiftDocId.slice(0, 10),
    shiftId: shiftDocId.slice(11),
  }
}

module.exports = {
  COLLECTION,
  buildMonitorLive,
  buildMonitorPatch,
  resolveCurrentShiftDocId,
  // exportados para tests
  currentStateOf,
  statusOf,
  modelLabel,
  toDate,
}
