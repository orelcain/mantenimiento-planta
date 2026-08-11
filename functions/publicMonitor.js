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
/**
 * Tope de tramos de la serie. 192 × 5 min = 16 h: alcanza para un turno
 * completo con su cola fuera de horario.
 *
 * Estaba en 48 (4 h) y recortaba el gráfico por delante: el turno del 10-ago
 * arrancó 07:55 y el eje decía "12:30–16:25", como si la mañana no hubiera
 * existido. El gráfico tiene que cubrir el turno entero o engaña.
 */
const SERIES_MAX_POINTS = 192
/** Ventana "reciente" para la cadencia instantánea. */
const RECENT_INTERVALS = 6   // 30 min
/** Tope de detenciones ubicadas que se publican por turno (un turno real trae ~70). */
const STOP_EVENTS_MAX = 300
/** Tramos vacíos que se agregan al final para que quepan los últimos paros (1 h). */
const SERIES_TAIL_MAX = 12

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

/**
 * ¿Este state es el relleno "Planned Downtime" de fuera del turno?
 *
 * Shoplogix rellena con él las horas que la ventana de consulta captura de más
 * (la planta simplemente no estaba operando). No es una detención de la línea:
 * meterlo en el denominador del "% produciendo" lo hunde solo, y listarlo entre
 * las detenciones del turno hace que el primer lugar del ranking sea "no
 * estábamos trabajando". Visto en vivo el 10-ago: el % cayó de 72% a 58% al
 * entrar 2 h 41 min de Planned Downtime posteriores al cierre.
 */
function esPlannedDowntime(state) {
  return /planned\s*downtime/i.test(String(state?.reason || '')) ||
         /planned\s*downtime/i.test(String(state?.name || ''))
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
    const esUnscheduled = /unscheduled/i.test(d.shiftId || snap.id)
    parsed.push({ id: snap.id, start, end, pieces, esUnscheduled })
  }
  if (parsed.length === 0) return null

  // `Unscheduled` NO es un turno: es el bucket de las horas entre turnos, y
  // desde que el monitor rescata las piezas fuera de horario, su producción ya
  // se suma al turno real. Elegirlo como "vigente" mostraba esas piezas dos
  // veces y con la etiqueta equivocada — visto en producción el 10-ago: ganó
  // `Unscheduled` con 623 pz mientras el `Turno Dia` real llevaba 4.915.
  //
  // Solo se acepta como último recurso, cuando la línea no tiene NINGÚN turno
  // con nombre en hoy/ayer y aun así hubo proceso: mejor mostrar producción mal
  // etiquetada que una pantalla vacía teniendo datos.
  const conNombre = parsed.filter(p => !p.esUnscheduled)
  const elegibles = conNombre.length > 0
    ? conNombre
    : parsed.filter(p => p.pieces >= 50)
  if (elegibles.length === 0) return null

  const nowMs = nowWall.getTime()
  const GRACE_MS = 30 * 60 * 1000

  const vigente = elegibles
    .filter(p => p.start.getTime() <= nowMs && (!p.end || nowMs <= p.end.getTime() + GRACE_MS))
    .sort((a, b) => b.start.getTime() - a.start.getTime())[0]
  if (vigente) return vigente.id

  const yaEmpezados = elegibles
    .filter(p => p.start.getTime() <= nowMs)
    .sort((a, b) => b.start.getTime() - a.start.getTime())
  return yaEmpezados[0]?.id ?? null
}

/** ¿`t` cae dentro de alguna de las ventanas [start, end]? */
function dentroDeAlguna(t, ventanas) {
  return ventanas.some(v => v.start && v.end && t >= v.start.getTime() && t < v.end.getTime())
}

/** Corte entre dos tramos de producción fuera de turno. */
const OUTSIDE_GAP_MS = 15 * 60 * 1000

/**
 * Piezas mínimas para que un tramo fuera de turno cuente como producción.
 *
 * Bajo esto es ruido: higiene, prueba de línea, giro en vacío. Caso real que
 * fijó el umbral — el 10-ago Filete tenía 6 piezas sueltas a las 06:10, hora y
 * media antes del turno, mientras el tramo posterior al cierre eran 617 piezas
 * de producción de verdad.
 *
 * Es un umbral y no la regla dura "ignorar todo lo anterior al turno" a
 * propósito: el arranque anticipado REAL existe y ya costó un fix entero
 * (turnos que empezaban antes de las 08:00 perdían sus primeros ciclos). Con
 * umbral, 6 piezas se descartan y 300 se cuentan.
 */
const OUTSIDE_MIN_PIECES = 20

/**
 * Tramos de operación de TODAS las máquinas juntas, cortando cuando pasa más de
 * `gapMs` sin una sola pieza. Se usa como denominador de la cadencia: mide el
 * tiempo en que la línea estuvo corriendo, no el reloj entre la primera y la
 * última pieza del día.
 */
function agruparTramosPorGap(machines, gapMs) {
  const ivs = []
  for (const m of machines) {
    for (const iv of m.intervals || []) {
      if ((iv.cycles || 0) <= 0) continue
      const s = toDate(iv.startAt)
      const e = toDate(iv.endAt)
      if (s && e) ivs.push({ s: s.getTime(), e: e.getTime() })
    }
  }
  ivs.sort((a, b) => a.s - b.s)

  const tramos = []
  for (const iv of ivs) {
    const ultimo = tramos[tramos.length - 1]
    if (ultimo && iv.s - ultimo.end <= gapMs) ultimo.end = Math.max(ultimo.end, iv.e)
    else tramos.push({ start: iv.s, end: iv.e })
  }
  return tramos
}

/** Agrupa intervals en tramos contiguos (corte cuando hay más de GAP sin piezas). */
function agruparTramos(intervals) {
  const orden = intervals
    .map(iv => ({ iv, s: toDate(iv.startAt)?.getTime(), e: toDate(iv.endAt)?.getTime() }))
    .filter(x => Number.isFinite(x.s) && Number.isFinite(x.e))
    .sort((a, b) => a.s - b.s)

  const tramos = []
  for (const x of orden) {
    const ultimo = tramos[tramos.length - 1]
    if (ultimo && x.s - ultimo.end <= OUTSIDE_GAP_MS) {
      ultimo.end = Math.max(ultimo.end, x.e)
      ultimo.pieces += x.iv.cycles || 0
      ultimo.intervals.push(x.iv)
    } else {
      tramos.push({ start: x.s, end: x.e, pieces: x.iv.cycles || 0, intervals: [x.iv] })
    }
  }
  return tramos
}

/**
 * Recupera la producción que Shoplogix dejó FUERA de la ventana del turno.
 *
 * El problema, con datos del 10-ago-2026 en Filete: el turno estaba definido
 * 07:45→15:30 y así se cerró, pero la línea siguió procesando hasta las 16:27.
 * Esas 623 piezas (más las del arranque anticipado de las 06:10) fueron a parar
 * al doc `Unscheduled`, y el monitor mostraba 4.410 cuando la jornada real
 * habían sido ~5.033. Para Control de Producción eso es plata que no aparece.
 *
 * Qué se rescata: los intervals/states de los docs `Unscheduled` del MISMO día
 * que no caen dentro de la ventana de NINGÚN turno con nombre. El filtro por
 * ventanas es lo que evita el doble conteo — un interval que ya está dentro del
 * turno mostrado, o dentro de otro turno del día, se ignora.
 *
 * @returns {Promise<Map<string, {intervals: Array, states: Array, pieces: number}>>}
 */
async function loadOutsideShiftProduction(db, plantSlug, shiftDocId, ventanaTurno, yaContados = new Map()) {
  const dateKey = shiftDocId.slice(0, 10)
  const extras = new Map()

  const refs = await db.collection(`shoplogix/${plantSlug}/shifts`).listDocuments()
  const delDia = refs.filter(r => r.id.startsWith(dateKey) && r.id !== shiftDocId)
  if (delDia.length === 0) return extras

  const snaps = await db.getAll(...delDia)

  // Ventanas ocupadas: la del turno mostrado + la de los otros turnos con
  // nombre. Lo que caiga ahí ya está contado por alguien.
  const ventanas = [ventanaTurno]
  const unscheduled = []
  for (const snap of snaps) {
    if (!snap.exists) continue
    const d = snap.data() || {}
    const esUnscheduled = /unscheduled/i.test(d.shiftId || snap.id)
    if (esUnscheduled) {
      unscheduled.push(snap.id)
    } else {
      ventanas.push({ start: toDate(d.scheduledStart), end: toDate(d.scheduledEnd) })
    }
  }
  if (unscheduled.length === 0) return extras

  for (const id of unscheduled) {
    const ms = await db.collection(`shoplogix/${plantSlug}/shifts/${id}/machines`).get()
    ms.forEach(doc => {
      const m = doc.data() || {}
      const yaEnElTurno = yaContados.get(doc.id) || new Set()
      const candidatos = (m.intervals || []).filter(iv => {
        if ((iv.cycles || 0) <= 0) return false
        const s = toDate(iv.startAt)
        if (!s) return false
        // Dedupe por timestamp, NO solo por la ventana declarada: el doc del
        // turno guarda intervals más allá de su propio `scheduledEnd` y
        // Shoplogix repite esos mismos minutos en `Unscheduled`. Verificado el
        // 10-ago en Filete: 15:30=47 y 15:35=65 estaban idénticos en los dos
        // docs, y filtrar solo por ventana los sumaba dos veces (112 piezas
        // infladas). El doble conteo es el peor error posible en esta pantalla:
        // nadie que mire el link tiene cómo detectarlo.
        if (yaEnElTurno.has(s.getTime())) return false
        return !dentroDeAlguna(s.getTime(), ventanas)
      })

      // Solo los tramos con producción de verdad (ver OUTSIDE_MIN_PIECES).
      const tramos = agruparTramos(candidatos).filter(t => t.pieces >= OUTSIDE_MIN_PIECES)
      if (tramos.length === 0) return

      const intervals = tramos.flatMap(t => t.intervals)

      // Los states solo se rescatan si SOLAPAN un tramo con producción real.
      // Sin esta poda entraban las horas muertas del bucket `Unscheduled` (que
      // legítimamente dura casi todo el día) y el "% produciendo" se desplomaba
      // por tiempo en que la planta ni siquiera estaba operando.
      const states = (m.states || []).filter(st => {
        const s = toDate(st.startAt)
        const e = toDate(st.endAt)
        if (!s || !e || dentroDeAlguna(s.getTime(), ventanas)) return false
        return tramos.some(t => e.getTime() > t.start && s.getTime() < t.end)
      })

      const prev = extras.get(doc.id) || { intervals: [], states: [], pieces: 0 }
      prev.intervals.push(...intervals)
      prev.states.push(...states)
      prev.pieces += intervals.reduce((a, iv) => a + (iv.cycles || 0), 0)
      extras.set(doc.id, prev)
    })
  }

  return extras
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

  // Piezas que la línea hizo fuera del horario del turno (ver
  // `loadOutsideShiftProduction`). Se fusionan en los intervals/states de cada
  // máquina para que TODO —serie, cadencia, estado actual— hable de la jornada
  // real y no del recorte de Shoplogix; el desglose se publica aparte.
  const ventanaTurno = {
    start: toDate(parent.scheduledStart) ?? toDate(machines[0]?.scheduledStart),
    end:   toDate(parent.scheduledEnd)   ?? toDate(machines[0]?.scheduledEnd),
  }
  // Minutos que el turno ya tiene, por máquina — la base del dedupe.
  const yaContados = new Map(
    machines.map(m => [
      m.id,
      new Set((m.intervals || []).map(iv => toDate(iv.startAt)?.getTime()).filter(Boolean)),
    ]),
  )

  let extras = new Map()
  try {
    extras = await loadOutsideShiftProduction(db, plantSlug, shiftDocId, ventanaTurno, yaContados)
  } catch (err) {
    // Nunca dejar al monitor sin datos por no poder rescatar la cola.
    extras = new Map()
  }

  const shiftPieces = machines.reduce((a, m) => a + (m.totalCycles || 0), 0)
  let outsidePieces = 0
  for (const m of machines) {
    const extra = extras.get(m.id)
    if (!extra) continue
    m.intervals = [...(m.intervals || []), ...extra.intervals]
    m.states = [...(m.states || []), ...extra.states]
    m.totalCycles = (m.totalCycles || 0) + extra.pieces
    outsidePieces += extra.pieces
  }

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

  // Horas de OPERACIÓN: de la primera a la última pieza, descontando los huecos
  // largos en que la línea no estaba corriendo. Sin descontarlos, rescatar la
  // cola de después del turno abarataba la cadencia — el 10-ago la jornada
  // pasaba a medir 10,3 h (06:10→16:30) por un hueco de 1,5 h en la mañana, y
  // los 557 pz/h reales se leían como 487.
  const IDLE_GAP_MS = 30 * 60 * 1000
  const tramosOperacion = agruparTramosPorGap(machines, IDLE_GAP_MS)
  const operatingMs = tramosOperacion.reduce((a, t) => a + (t.end - t.start), 0)

  const effectiveHours = operatingMs > 0 ? operatingMs / 3_600_000 : 0
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

  // Tiempos: al agregado del turno se le suma el de la cola fuera de horario,
  // por categoría. El % se calcula sobre el tiempo RASTREADO (no sobre la
  // ventana del turno ni sobre el reloj): así no lo distorsionan los huecos en
  // que la máquina no estuvo bajo seguimiento. Con la cola vacía da exactamente
  // el mismo número que el `shiftRuntime` de Shoplogix — verificado contra el
  // turno del 10-ago: 18.105 / (18.105+5.985+615) = 73,3%, igual que su 73,28%.
  const sumaExtras = (tipo) => {
    let sec = 0
    for (const m of machines) {
      for (const st of extras.get(m.id)?.states || []) {
        if (st.type === tipo && !esPlannedDowntime(st)) sec += st.durationSec || 0
      }
    }
    return sec
  }
  const uptimeSec = machines.reduce((a, m) => a + (m.shiftRuntimeBreakdown?.uptimeSec || 0), 0) + sumaExtras('uptime')
  const downtimeSec = machines.reduce((a, m) => a + (m.shiftRuntimeBreakdown?.downtimeSec || 0), 0) + sumaExtras('downtime')
  const breakSec = machines.reduce((a, m) => a + (m.shiftRuntimeBreakdown?.breakSec || 0), 0) + sumaExtras('break')
  const trackedSec = uptimeSec + downtimeSec + breakSec
  const uptimePct = trackedSec > 0 ? (uptimeSec / trackedSec) * 100 : 0

  // Tramos de producción fuera del horario del turno, agrupados (un corte cada
  // vez que hay más de 15 min sin piezas). Es lo que la pantalla nombra como
  // "antes/después del horario" — sin los rangos, el número suelto no se puede
  // contrastar con lo que la gente vio en la línea.
  const outsideRanges = agruparTramos(
    machines.flatMap(m => extras.get(m.id)?.intervals || []),
  ).map(t => ({
    from: new Date(t.start).toISOString(),
    to: new Date(t.end).toISOString(),
    pieces: t.pieces,
    /** `antes` = arrancó antes del turno; `despues` = siguió tras el cierre. */
    kind: ventanaTurno.start && t.start < ventanaTurno.start.getTime() ? 'antes' : 'despues',
  }))

  // ── Detenciones: UNA sola fuente para la lista y para el gráfico ─────────
  // Antes se calculaban por separado y divergían: la lista decía "Micro
  // Detencion 85×" y el gráfico dibujaba 55 bandas. La diferencia eran states
  // repetidos entre el doc del turno y el de la cola (57) y states de duración
  // CERO (53), que no son un paro observable ni se pueden ubicar en el tiempo.
  // Ahora los eventos se deduplican una vez y de ahí sale todo.
  //
  // El formato es comprimido a propósito (índice de razón + inicio + duración):
  // con ~70 paros por turno y 6 turnos de historial, repetir el texto de la
  // razón en cada evento engorda el doc sin aportar nada.
  const stopReasons = []
  const eventosCrudos = []
  for (const m of machines) {
    for (const st of m.states || []) {
      if (st.type === 'uptime') continue
      if (esPlannedDowntime(st)) continue
      const desde = toDate(st.startAt)
      const sec = st.durationSec || 0
      if (!desde || sec <= 0) continue
      const reason = (st.reason || st.name || 'Sin razón').trim()
      let r = stopReasons.indexOf(reason)
      if (r === -1) { stopReasons.push(reason); r = stopReasons.length - 1 }
      eventosCrudos.push({ r, f: desde.toISOString(), s: sec })
    }
  }
  const vistosEv = new Set()
  const stopEvents = eventosCrudos
    .filter(e => {
      const k = `${e.r}|${e.f}|${e.s}`
      if (vistosEv.has(k)) return false
      vistosEv.add(k)
      return true
    })
    .sort((a, b) => (a.f < b.f ? -1 : 1))
    .slice(0, STOP_EVENTS_MAX)

  // La lista sale de los mismos eventos: si dice "4×", el gráfico marca 4.
  const stopAcc = new Map()
  for (const e of stopEvents) {
    const reason = stopReasons[e.r]
    const prev = stopAcc.get(reason) || { reason, sec: 0, count: 0 }
    prev.sec += e.s
    prev.count += 1
    stopAcc.set(reason, prev)
  }
  const topStops = [...stopAcc.values()].sort((a, b) => b.sec - a.sec).slice(0, 5)

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

  // La serie termina en el último tramo CON piezas, pero la línea sigue
  // detenida un rato después y esas detenciones no tendrían dónde dibujarse:
  // la lista decía "Micro Detencion 58×" y el gráfico marcaba 55. Se extiende
  // con tramos vacíos hasta cubrir el último paro — con tope, para que un
  // evento raro y lejano no estire el gráfico una hora de nada.
  const ultimoParoMs = stopEvents.length > 0
    ? Math.max(...stopEvents.map(e => new Date(e.f).getTime() + e.s * 1000))
    : 0
  if (seriesAll.length > 0 && ultimoParoMs > 0) {
    let t = new Date(seriesAll[seriesAll.length - 1].t).getTime()
    let extra = 0
    while (t + INTERVAL_MIN * 60_000 <= ultimoParoMs && extra < SERIES_TAIL_MAX) {
      t += INTERVAL_MIN * 60_000
      seriesAll.push({ t: new Date(t).toISOString(), pieces: 0 })
      extra++
    }
  }

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
    // Mismo criterio que el % de línea (uptime sobre tiempo rastreado), para que
    // los dos números se puedan comparar. `shiftRuntime` no sirve acá: es del
    // turno y no conoce la cola de después del cierre.
    const b = m.shiftRuntimeBreakdown || {}
    const extraStates = extras.get(m.id)?.states || []
    const secDe = (tipo) => (
      (tipo === 'uptime' ? b.uptimeSec : tipo === 'downtime' ? b.downtimeSec : b.breakSec) || 0
    ) + extraStates.filter(s => s.type === tipo).reduce((a, s) => a + (s.durationSec || 0), 0)
    const mUptime = secDe('uptime')
    const mTracked = mUptime + secDe('downtime') + secDe('break')
    return {
      id: m.id,
      name: m.machineName || m.id,
      model: modelLabel(m.machineType),
      pieces,
      piecesPerHour: mHours > 0 ? pieces / mHours : 0,
      uptimePct: mTracked > 0 ? (mUptime / mTracked) * 100 : 0,
      status: statusOf(st),
      currentReason: st ? (st.reason || st.name || null) : null,
      currentSinceAt: st ? iso(toDate(st.startAt)) : null,
    }
  })

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
    /** Desglose de `totalPieces`: lo que Shoplogix metió dentro del turno… */
    shiftPieces,
    /** …y lo que la línea hizo fuera de esa ventana (ver outsideRanges). */
    outsidePieces,
    outsideRanges,
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
    /** Razones, para que los eventos no repitan el texto en cada uno. */
    stopReasons,
    /** Detenciones ubicadas en el tiempo: `r` = índice en stopReasons. */
    stopEvents,
  }
}

/** Cuántos turnos anteriores se publican para deslizar. */
const HISTORY_MAX = 6
/** Días hacia atrás donde buscarlos. */
const HISTORY_LOOKBACK_DAYS = 12
/** Piezas mínimas para que un turno entre al historial (bajo eso no hubo proceso). */
const HISTORY_MIN_PIECES = 50

/**
 * Turnos anteriores de la línea, para poder deslizar hacia atrás desde el link.
 *
 * Reusa lo ya publicado (`prevHistory`) en vez de recomponer los seis en cada
 * refresco: **un turno cerrado ya no cambia**, y recomponerlo cuesta leer su
 * subcolección de máquinas más el rescate de piezas fuera de horario. Se
 * recompone solo el más reciente del historial, que todavía puede moverse por
 * el re-sync móvil (reescribe ayer cada hora y hace 2-3 días una vez al día).
 *
 * @returns {Promise<Array<{shiftDocId: string, dateKey: string, shiftId: string, live: object}>>}
 */
async function buildMonitorHistory(db, plantSlug, currentShiftDocId, prevHistory = []) {
  const nowWall = shoplogixPolling.toChileWall(new Date())
  const desde = shiftDateKey(nowWall, -HISTORY_LOOKBACK_DAYS)

  const refs = await db.collection(`shoplogix/${plantSlug}/shifts`).listDocuments()
  const candidatos = refs.filter(r =>
    r.id !== currentShiftDocId &&
    r.id.slice(0, 10) >= desde &&
    !/unscheduled/i.test(r.id),
  )
  if (candidatos.length === 0) return []

  const snaps = await db.getAll(...candidatos)
  const turnos = []
  for (const snap of snaps) {
    if (!snap.exists) continue
    const d = snap.data() || {}
    const start = toDate(d.scheduledStart)
    const pieces = (d.machines || []).reduce((a, m) => a + (m.totalCycles || 0), 0)
    // Ordenar por el horario REAL y no por el id: "Turno 1" de Chonchi arranca
    // 21:30 y "Turno 2" a las 09:00, así que alfabéticamente quedan al revés.
    if (start && pieces >= HISTORY_MIN_PIECES) turnos.push({ id: snap.id, start, pieces })
  }
  turnos.sort((a, b) => b.start.getTime() - a.start.getTime())

  const previos = new Map((prevHistory || []).map(h => [h.shiftDocId, h]))
  const out = []
  for (let i = 0; i < turnos.length && out.length < HISTORY_MAX; i++) {
    const { id } = turnos[i]
    const cacheado = previos.get(id)
    // i === 0 es el turno inmediatamente anterior: puede seguir moviéndose.
    if (cacheado?.live && i > 0) { out.push(cacheado); continue }
    try {
      const live = await buildMonitorLive(db, plantSlug, id)
      if (live) out.push({ shiftDocId: id, dateKey: id.slice(0, 10), shiftId: id.slice(11), live })
    } catch {
      if (cacheado?.live) out.push(cacheado)
    }
  }
  return out
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
    // Un link de turno fijo tampoco tiene por qué ser una isla: se le publican
    // igual los turnos anteriores para poder deslizar.
    const live = await buildMonitorLive(db, plantSlug, monitor.shiftDocId)
    if (!live) return null
    const history = await buildMonitorHistory(db, plantSlug, monitor.shiftDocId, monitor.history)
    return { live, history }
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
    history: await buildMonitorHistory(db, plantSlug, shiftDocId, monitor.history),
    shiftDocId,
    dateKey: shiftDocId.slice(0, 10),
    shiftId: shiftDocId.slice(11),
  }
}

/**
 * Devuelve el link de línea de una planta, creándolo si no existe.
 *
 * Lo llama el aviso de arranque de turno, así que la regla de oro es que el
 * **token no cambie**: un QR impreso o un mensaje viejo de Telegram tienen que
 * seguir funcionando. Por eso reusa el monitor vigente y solo le extiende la
 * vigencia; nunca crea uno nuevo si ya hay.
 *
 * Si hay más de uno vigente (alguien generó uno a mano desde la app), se queda
 * con el que vence más tarde y renueva ese: repartir avisos entre dos links de
 * la misma línea sería peor que elegir cualquiera de forma estable.
 *
 * @param {object} p.meta — etiquetas de la línea para la cabecera del monitor.
 * @returns {Promise<{token: string, created: boolean}|null>} null si la línea aún no tiene turnos.
 */
async function ensureLineMonitor(db, plantSlug, { ttlDays = 30, meta = {} } = {}) {
  const nowMs = Date.now()
  const nuevoVencimiento = new Date(nowMs + ttlDays * 86_400_000).toISOString()

  const snap = await db.collection(COLLECTION).where('scope', '==', `line|${plantSlug}`).get()
  const vigentes = snap.docs
    .filter(d => String(d.data()?.expiresAt || '') > new Date(nowMs).toISOString())
    .sort((a, b) => String(b.data().expiresAt).localeCompare(String(a.data().expiresAt)))

  if (vigentes.length > 0) {
    const doc = vigentes[0]
    const patch = {}
    // Renovar solo si de verdad hace falta: una escritura por arranque de turno
    // no cuesta nada, pero tampoco aporta si al link le quedan semanas.
    if (String(doc.data().expiresAt) < new Date(nowMs + 7 * 86_400_000).toISOString()) {
      patch.expiresAt = nuevoVencimiento
      patch.ttlHours = ttlDays * 24
    }
    // Las etiquetas SÍ se refrescan: quien genera desde la app manda las de
    // `plantLines.ts`, que son más descriptivas que las que arma el backend.
    // Cambiar el rótulo no cambia el token, que es lo que hay que preservar.
    for (const k of ['plantLineId', 'areaLabel', 'lineLabel', 'machineKindLong', 'targetPieces']) {
      if (meta[k] != null && meta[k] !== doc.data()[k]) patch[k] = meta[k]
    }
    if (Object.keys(patch).length > 0) await doc.ref.set(patch, { merge: true })
    return { token: doc.id, created: false }
  }

  const shiftDocId = await resolveCurrentShiftDocId(db, plantSlug)
  const live = shiftDocId ? await buildMonitorLive(db, plantSlug, shiftDocId) : null
  // Con historial desde el minuto uno: un link recién creado ya se puede
  // deslizar hacia atrás, sin esperar al primer refresco del trigger.
  const history = shiftDocId ? await buildMonitorHistory(db, plantSlug, shiftDocId, []) : []

  const token = require('crypto').randomUUID()
  await db.collection(COLLECTION).doc(token).set({
    token,
    mode: 'line',
    plantSlug,
    dateKey: shiftDocId ? shiftDocId.slice(0, 10) : '',
    shiftId: shiftDocId ? shiftDocId.slice(11) : '',
    shiftDocId: shiftDocId ?? null,
    scope: `line|${plantSlug}`,
    plantLineId:     meta.plantLineId ?? null,
    areaLabel:       meta.areaLabel ?? null,
    lineLabel:       meta.lineLabel ?? null,
    machineKindLong: meta.machineKindLong ?? null,
    targetPieces:    meta.targetPieces ?? null,
    createdBy: 'Mantención (automático)',
    createdByUid: 'system',
    createdAt: new Date(nowMs).toISOString(),
    expiresAt: nuevoVencimiento,
    ttlHours: ttlDays * 24,
    live,
    history,
  })
  return { token, created: true }
}

module.exports = {
  COLLECTION,
  buildMonitorLive,
  buildMonitorHistory,
  buildMonitorPatch,
  resolveCurrentShiftDocId,
  ensureLineMonitor,
  // exportados para tests
  currentStateOf,
  statusOf,
  modelLabel,
  toDate,
}
