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

module.exports = {
  COLLECTION,
  buildMonitorLive,
  // exportados para tests
  currentStateOf,
  statusOf,
  modelLabel,
  toDate,
}
