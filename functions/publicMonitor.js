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
const kpisMantencion = require('./shoplogix/kpisMantencion')

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
/** Comentarios que viajan en el doc. Son 2-3 por turno; 20 es techo de sobra. */
const COMMENTS_MAX = 20
/** Tramos vacíos que se agregan al final para que quepan los últimos paros (1 h). */
const SERIES_TAIL_MAX = 12

/** Timestamp de Firestore / Date / string / número → Date. null si no se puede. */
/**
 * Fecha en el formato compacto de los comentarios viejos: "20260202T220000.000".
 * `new Date()` no lo parsea, y sin esto esos comentarios quedaban sin ubicar.
 */
function parseCompacto(v) {
  if (typeof v !== 'string') return null
  const m = /^(\d{4})(\d{2})(\d{2})T(\d{2})(\d{2})(\d{2})/.exec(v)
  if (!m) return null
  const d = new Date(Date.UTC(+m[1], +m[2] - 1, +m[3], +m[4], +m[5], +m[6]))
  return Number.isNaN(d.getTime()) ? null : d
}

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

/**
 * ¿Este paro es PLANIFICADO (reglamentario) o RECUPERABLE?
 *
 * La distinción es el corazón del "¿se puede llegar a la cuota?". Sin ella, el
 * turno del 12-08 de Filete mostraba 86 min de detenciones grandes como si
 * fueran el problema — y 77 de esos 86 eran colación, reunión de inicio,
 * ejercicio compensatorio y detención programada. Confundirlos lleva a exigir
 * que se recupere un tiempo que por convenio no se recupera.
 *
 * Lista confirmada por Orel el 12-08. Se compara sin tildes ni mayúsculas
 * porque Shoplogix escribe las causas a mano y ya varían entre turnos.
 */
const CAUSAS_PLANIFICADAS = [
  'colacion',
  'detencion programada',
  'reunion inicio turno',
  'ejercicio compensatorio',
]

function esParoPlanificado(reason) {
  /*
   * ⚠ Los espacios INTERNOS también se colapsan. Shoplogix manda
   * "EJERCICIO  COMPENSATORIO" con dos espacios (visto en el turno del 12-08) y
   * sin esto la causa caía en "recuperable" — o sea, se le exigía a la línea
   * recuperar un ejercicio de pausa activa.
   */
  const r = normShiftName(reason).replace(/\s+/g, ' ')
  if (!r) return false
  return CAUSAS_PLANIFICADAS.some(c => r.includes(c))
}

/** 'produciendo' | 'detenida' | 'sin-datos' según el state vigente. */
function statusOf(state) {
  if (!state) return 'sin-datos'
  return state.type === 'uptime' ? 'produciendo' : 'detenida'
}

/*
 * El margen NO es cosmético: en Filete el `scheduledEnd` se deriva del ÚLTIMO
 * intervalo sincronizado, o sea que va corriendo detrás del reloj y siempre
 * queda unos minutos en el pasado. Sin margen, un turno en plena producción se
 * anunciaba como "cerrado" (10-ago: fin derivado 14:36, línea produciendo 14:40).
 */
const CLOSE_MARGIN_MS = 30 * 60 * 1000

/**
 * ¿El turno se puede sellar como cerrado?
 *
 * Pasado el horario (+margen), se sella si ninguna máquina produce O si el
 * último dato de producción es más viejo que el margen. La segunda pata evita
 * el turno zombie: el state vigente no se reescribe cuando Shoplogix deja de
 * mandar datos, así que un turno cuyo final fue uptime quedaba "produciendo"
 * para siempre — el 26-08 en Chonchi la pantalla seguía pronosticando hora
 * extra 2 h 30 min después del último pescado.
 */
function esTurnoSellado({ nowWallMs, scheduledEndMs, hayProduciendo, ultimaProdMs, margenMs = CLOSE_MARGIN_MS }) {
  if (scheduledEndMs == null) return false
  if (nowWallMs <= scheduledEndMs + margenMs) return false
  if (!hayProduciendo) return true
  return ultimaProdMs == null || nowWallMs - ultimaProdMs > margenMs
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

/** Minutos entre `t` y la ventana [start, end]; 0 si cae dentro. */
function distanciaA(t, ventana) {
  if (!ventana?.start || !ventana?.end) return Number.POSITIVE_INFINITY
  const s = ventana.start.getTime()
  const e = ventana.end.getTime()
  if (t >= s && t < e) return 0
  return t < s ? s - t : t - e
}

/**
 * Máximo hueco entre el turno y su cola para considerarla CONTINUA.
 *
 * La cola es la misma jornada que siguió de largo, no cualquier producción del
 * día. Regla de Orel (11-ago-2026): "solo si las piezas son continuas al turno,
 * no sumarle piezas de otro tiempo horas después".
 *
 * 90 min, medido contra los casos reales: Filete cerró 15:30 y la cola arrancó
 * 15:40 (10 min); en Chonchi las colas arrancan en el mismo minuto del cierre; y
 * Yal 10-jul entró a las 14:05 para un turno que arrancaba 15:15 (65 min) — con
 * 1 h se perdían 2.296 piezas de arranque anticipado REAL por cinco minutos.
 * Lo que la regla debe excluir está a otra escala: el bloque de las 07:15 que el
 * turno noche de Chonchi se llevaba está a 14 h.
 *
 * ⚠ Mismo número que `MAX_CONTINUIDAD_MS` de `graderUnscheduledAttribution.ts`
 * (la matriz). Si cambia uno, cambia el otro: son la misma regla y dos pantallas
 * del mismo turno no pueden dar números distintos.
 */
const MAX_CONTINUIDAD_MS = 90 * 60 * 1000

/**
 * Minutos entre un TRAMO [ini, fin] y una ventana; 0 si se solapan.
 *
 * Se mide de borde a borde, no desde el inicio del tramo: un bloque que corre
 * 07:00→07:30 antes de un turno que arranca 08:00 está a 30 min de él, no a 60.
 * Medirlo desde el inicio descartaba arranques anticipados legítimos.
 */
function distanciaTramo(tramo, ventana) {
  if (!ventana?.start || !ventana?.end) return Number.POSITIVE_INFINITY
  const s = ventana.start.getTime()
  const e = ventana.end.getTime()
  if (tramo.end > s && tramo.start < e) return 0
  return tramo.end <= s ? s - tramo.end : tramo.start - e
}

/**
 * ¿El tramo en `t` es la cola de ESTE turno?
 *
 * Dos condiciones, y hacen falta las dos:
 *   1. CONTINUIDAD — pegado al turno (≤ 30 min). Sin esto, en un día de un solo
 *      turno se le colgaba cualquier producción, por lejos que estuviera.
 *   2. CERCANÍA — ningún otro turno del día está más cerca. Si el tramo cae
 *      DENTRO de otro turno, es de ese otro: ya lo tiene contado en su doc.
 *
 * ⚠ Un tramo va a UN turno, nunca a dos ni a ninguno. Por eso el empate se
 * desempata en vez de descartarse (descartarlo perdía las piezas): gana el turno
 * que ya CERRÓ, porque una cola es la continuación de lo que se estaba haciendo,
 * no el adelanto de lo que viene. Como la regla solo mira los bordes, los dos
 * turnos llegan a la misma conclusión aunque se evalúen por separado.
 */
function esColaDeEsteTurno(tramo, ventanaTurno, otrasVentanas) {
  const propia = distanciaTramo(tramo, ventanaTurno)
  if (propia > MAX_CONTINUIDAD_MS) return false
  const yaCerro = (v) => Boolean(v?.end) && tramo.start >= v.end.getTime()
  return otrasVentanas.every((v) => {
    const otra = distanciaTramo(tramo, v)
    if (propia !== otra) return propia < otra
    return yaCerro(ventanaTurno) && !yaCerro(v)
  })
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
 * cuyo turno MÁS CERCANO sea el que se está mostrando.
 *
 * ⚠⚠ La cercanía es lo que hace correcta la atribución, y faltaba: bastaba con
 * "no cae dentro de la ventana de ningún turno", así que CUALQUIER turno del día
 * se quedaba con TODAS las colas del día. Caso real Chonchi 10-ago-2026: el
 * turno noche (21:15→05:00) sumaba 1.317 piezas ajenas —1.048 de las 07:15, que
 * son la cola del turno que cerró a esa hora, y 269 de las 17:00, del turno de
 * día— y mostraba 13.487 en vez de 12.170. Se veía hasta en el gráfico: una
 * barra a las 7 de la mañana dentro de un turno que arrancó a las 21:30.
 *
 * Mismo criterio que la matriz (`attributeUnscheduledCycles`): el turno adyacente
 * más cercano se lleva el tramo. Así las cuatro superficies coinciden.
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

  // Los OTROS turnos con nombre del día: son los que compiten por cada tramo.
  const otrasVentanas = []
  const unscheduled = []
  for (const snap of snaps) {
    if (!snap.exists) continue
    const d = snap.data() || {}
    const esUnscheduled = /unscheduled/i.test(d.shiftId || snap.id)
    if (esUnscheduled) {
      unscheduled.push(snap.id)
    } else {
      otrasVentanas.push({ start: toDate(d.scheduledStart), end: toDate(d.scheduledEnd) })
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
        // Lo que cae DENTRO de otro turno con nombre ya lo cuenta ese turno.
        return !otrasVentanas.some(v => distanciaTramo({ start: s.getTime(), end: s.getTime() + 1 }, v) === 0)
      })

      // La pertenencia se decide sobre el BLOQUE completo, no sobre cada
      // intervalo: es la cola de este turno o no lo es, entero. Y los tramos se
      // encadenan antes de decidir, porque la producción real viene con huecos:
      // Yal 10-jul son 2.296 piezas a las 14:05, 14:40 y 15:00 antes de un turno
      // que arrancó 15:15 — medido tramo a tramo, el primero se quedaba fuera.
      const utiles = agruparTramos(candidatos)
        // Solo los tramos con producción de verdad (ver OUTSIDE_MIN_PIECES).
        .filter(t => t.pieces >= OUTSIDE_MIN_PIECES)
      const cadenas = []
      for (const t of [...utiles].sort((a, b) => a.start - b.start)) {
        const ult = cadenas[cadenas.length - 1]
        if (ult && t.start - ult.end <= MAX_CONTINUIDAD_MS) {
          ult.end = Math.max(ult.end, t.end)
          ult.tramos.push(t)
        } else {
          cadenas.push({ start: t.start, end: t.end, tramos: [t] })
        }
      }
      const tramos = cadenas
        .filter(c => esColaDeEsteTurno(c, ventanaTurno, otrasVentanas))
        .flatMap(c => c.tramos)

      /*
       * El state VIGENTE del día se publica APARTE de los rescatados, incluso
       * cuando no hay cola que rescatar (el dedupe por `yaContados` puede dejar
       * `tramos` vacío porque el doc del turno ya trae esos mismos minutos).
       * Cuando el turno termina, Shoplogix escribe la detención del cierre solo
       * en este bucket: sin esto la máquina quedaba congelada en su último
       * uptime — "produciendo" horas después del último pescado (26-08 Chonchi).
       * No entra a `states` (esos suman al % produciendo); solo dice el AHORA.
       */
      const vigente = [...(m.states || [])]
        .filter(st => {
          const s = toDate(st.startAt)
          return s && !otrasVentanas.some(v => distanciaA(s.getTime(), v) === 0)
        })
        .sort((a, b) => (toDate(a.startAt)?.getTime() ?? 0) - (toDate(b.startAt)?.getTime() ?? 0))
        .pop() ?? null
      const conVigente = (prev) => {
        if (vigente) {
          const nuevoMs = toDate(vigente.startAt)?.getTime() ?? 0
          const prevMs = prev.stateVigente ? (toDate(prev.stateVigente.startAt)?.getTime() ?? 0) : -1
          if (nuevoMs > prevMs) prev.stateVigente = vigente
        }
        return prev
      }

      if (tramos.length === 0) {
        extras.set(doc.id, conVigente(extras.get(doc.id) || { intervals: [], states: [], pieces: 0, stateVigente: null }))
        return
      }

      const intervals = tramos.flatMap(t => t.intervals)

      // Los states solo se rescatan si SOLAPAN un tramo con producción real.
      // Sin esta poda entraban las horas muertas del bucket `Unscheduled` (que
      // legítimamente dura casi todo el día) y el "% produciendo" se desplomaba
      // por tiempo en que la planta ni siquiera estaba operando.
      const states = (m.states || []).filter(st => {
        const s = toDate(st.startAt)
        const e = toDate(st.endAt)
        if (!s || !e) return false
        // Un state que cae dentro de otro turno es de ese turno: el solape con
        // un tramo rescatado no alcanza para traérselo.
        if (otrasVentanas.some(v => distanciaA(s.getTime(), v) === 0)) return false
        return tramos.some(t => e.getTime() > t.start && s.getTime() < t.end)
      })

      const prev = conVigente(extras.get(doc.id) || { intervals: [], states: [], pieces: 0, stateVigente: null })
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
/**
 * Horario PROGRAMADO del turno y su cuota, desde `graderModuleConfigs`.
 *
 * ⚠ No confundir con el `scheduledEnd` que ya viaja en `live`: ese se deriva
 * del ÚLTIMO intervalo sincronizado, o sea que va corriendo detrás del reloj y
 * siempre queda unos minutos en el pasado (la nota de `shiftClosed` lo explica).
 * Sirve para "hasta cuándo hay datos", NO para "cuánto falta para el cierre":
 * con él, el tiempo restante da siempre ~0 y no se puede recomendar un ritmo.
 *
 * Devuelve `{ plannedEnd: Date|null, quotaPieces: number|null }`.
 */
/**
 * Cierre APRENDIDO de los turnos anteriores con el mismo nombre.
 *
 * Es el camino por defecto, y a propósito: pedirle a alguien que cargue a mano
 * el horario de cada turno de cada línea envejece mal — la semana que Filete
 * pase a tener turno día Y tarde, la config quedaría vieja sin que nadie se
 * entere y el monitor recomendaría contra un cierre que ya no existe. Los
 * turnos ya cerrados sí dicen la verdad: su `effectiveEnd` quedó fijo en la
 * última pieza real.
 *
 * Se toma la MEDIANA de la hora de cierre y no el promedio: un turno que se
 * cortó temprano por falta de materia prima no debe arrastrar la referencia.
 *
 * ⚠ Solo turnos con producción de verdad (`MIN_PIEZAS_HISTORIAL`): un turno de
 * 40 piezas que murió a los 20 minutos no dice a qué hora cierra ese turno.
 */
const HISTORIAL_TURNOS = 8
const MIN_PIEZAS_HISTORIAL = 200

async function inferShiftEndFromHistory(db, plantSlug, shiftId, scheduledStart, currentShiftDocId) {
  if (!shiftId || !scheduledStart) return null
  try {
    const refs = await db.collection(`shoplogix/${plantSlug}/shifts`).listDocuments()
    const mismos = refs.filter(r =>
      r.id !== currentShiftDocId &&
      !/unscheduled/i.test(r.id) &&
      normShiftName(r.id.slice(11)) === normShiftName(shiftId),
    )
    if (mismos.length === 0) return null

    // Los más recientes primero: el id arranca con el dateKey.
    mismos.sort((a, b) => b.id.localeCompare(a.id))
    const snaps = await db.getAll(...mismos.slice(0, HISTORIAL_TURNOS * 2))

    /** Minutos desde medianoche del cierre de cada turno con producción real. */
    const cierres = []
    /*
     * Ritmo de cada turno pasado, en pz/min sobre el TIEMPO DE RELOJ de su
     * ventana efectiva — no sobre el uptime.
     *
     * La base importa: el ritmo requerido se calcula sobre los minutos de reloj
     * que faltan, y esos minutos van a incluir paradas igual que las incluyeron
     * los turnos anteriores. Medido sobre uptime, el histórico daría 11,5 pz/min
     * y el requerido 16 — dos números en bases distintas que no se pueden
     * comparar, que es lo que la pantalla invita a hacer.
     */
    const ritmos = []
    for (const snap of snaps) {
      if (!snap.exists) continue
      const d = snap.data() || {}
      const piezas = (d.machines || []).reduce((a, m) => a + (m.totalCycles || 0), 0)
      if (piezas < MIN_PIEZAS_HISTORIAL) continue
      const fin = toDate(d.effectiveEnd) ?? toDate(d.scheduledEnd)
      if (!fin) continue
      cierres.push(fin.getUTCHours() * 60 + fin.getUTCMinutes())

      const ini = toDate(d.effectiveStart) ?? toDate(d.scheduledStart)
      if (ini) {
        const min = (fin.getTime() - ini.getTime()) / 60_000
        if (min > 30) ritmos.push(piezas / min)
      }
      if (cierres.length >= HISTORIAL_TURNOS) break
    }
    /*
     * Con 2 muestras ya se da una referencia, y la pantalla dice cuántas son.
     * Un turno NUEVO (Shoplogix lo dará de alta solo, p. ej. "Turno 2" de
     * Filete cuando arranque el segundo turno) tardaría tres días en tener 3
     * muestras, y esos son justo los días en que nadie sabe a qué ritmo ir.
     * Con 1 sola no: un primer turno raro fijaría la referencia entera.
     */
    if (cierres.length < 2) return null

    cierres.sort((a, b) => a - b)
    const mid = Math.floor(cierres.length / 2)
    const medianaMin = cierres.length % 2 === 0
      ? Math.round((cierres[mid - 1] + cierres[mid]) / 2)
      : cierres[mid]

    const end = new Date(Date.UTC(
      scheduledStart.getUTCFullYear(), scheduledStart.getUTCMonth(), scheduledStart.getUTCDate(),
      Math.floor(medianaMin / 60), medianaMin % 60, 0, 0,
    ))
    if (end.getTime() <= scheduledStart.getTime()) end.setUTCDate(end.getUTCDate() + 1)

    // Mediana y mejor de los ritmos pasados. La mediana es "lo normal", el
    // mejor es "lo que esta línea demostró que puede" — el techo realista.
    let paceMedianCpm = null
    let paceBestCpm = null
    if (ritmos.length >= 2) {
      const ord = [...ritmos].sort((a, b) => a - b)
      const m = Math.floor(ord.length / 2)
      paceMedianCpm = ord.length % 2 === 0 ? (ord[m - 1] + ord[m]) / 2 : ord[m]
      paceBestCpm = ord[ord.length - 1]
    }
    return { end, muestras: cierres.length, paceMedianCpm, paceBestCpm, paceSamples: ritmos.length }
  } catch {
    return null
  }
}

/**
 * Cierre estimado a partir de la DURACIÓN típica de la línea, no de la hora.
 *
 * ⚠ Por qué hace falta: `inferShiftEndFromHistory` aprende la HORA de cierre de
 * los turnos con el mismo nombre, y eso no sirve para un tramo `Unscheduled`
 * —que además descarta a propósito—. En Filete el turno noche no está definido
 * en Shoplogix y su horario CAMBIA de un día para otro (17-08: 00:00→08:00;
 * 18-08: 21:00→05:00; el de día 09:00→17:00). La hora de cierre es distinta
 * cada vez; lo que se mantiene es cuánto DURA: los 11 turnos productivos de la
 * línea miden entre 449 y 461 min, con mediana 452 (7 h 32).
 *
 * Sumada al arranque real, esa mediana da 07:52 / 04:32 / 16:32 para los tres
 * casos de arriba — dentro de media hora de lo que dice la planta, y sin que
 * nadie tenga que configurar nada a diario.
 *
 * Devuelve null si no hay al menos MIN_MUESTRAS_DURACION turnos con producción
 * real: con menos, una duración rara fijaría la referencia entera.
 */
const MIN_MUESTRAS_DURACION = 4

async function inferShiftEndFromDuration(db, plantSlug, scheduledStart, currentShiftDocId) {
  if (!scheduledStart) return null
  try {
    const refs = await db.collection(`shoplogix/${plantSlug}/shifts`).listDocuments()
    /* Acá SÍ entran todos los nombres: se mide cuánto dura un turno de esta
       línea, no cuándo cierra uno que se llame igual. */
    const otros = refs.filter((r) => r.id !== currentShiftDocId && !/unscheduled/i.test(r.id))
    if (otros.length === 0) return null
    otros.sort((a, b) => b.id.localeCompare(a.id))
    const snaps = await db.getAll(...otros.slice(0, HISTORIAL_TURNOS * 2))

    const duraciones = []
    for (const snap of snaps) {
      if (!snap.exists) continue
      const d = snap.data() || {}
      const piezas = (d.machines || []).reduce((a, m) => a + (m.totalCycles || 0), 0)
      if (piezas < MIN_PIEZAS_HISTORIAL) continue
      const ini = toDate(d.effectiveStart) ?? toDate(d.scheduledStart)
      const fin = toDate(d.effectiveEnd) ?? toDate(d.scheduledEnd)
      if (!ini || !fin) continue
      const min = Math.round((fin.getTime() - ini.getTime()) / 60000)
      if (min > 60 && min < 16 * 60) duraciones.push(min)
    }
    if (duraciones.length < MIN_MUESTRAS_DURACION) return null

    duraciones.sort((a, b) => a - b)
    const m = Math.floor(duraciones.length / 2)
    const mediana = duraciones.length % 2 === 0
      ? Math.round((duraciones[m - 1] + duraciones[m]) / 2)
      : duraciones[m]

    const ini = toDate(scheduledStart)
    if (!ini) return null
    return { end: new Date(ini.getTime() + mediana * 60000), muestras: duraciones.length, duracionMin: mediana }
  } catch {
    return null
  }
}

/** "Turno Dia" y "Turno día" son el mismo turno: se comparan sin tildes. */
function normShiftName(s) {
  return String(s ?? '').normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().trim()
}

async function loadPlannedShift(db, plantSlug, shiftId, scheduledStart) {
  const vacio = { plannedEnd: null, quotaPieces: null, setPoint: null, pesoPromedioKg: null, quotaOrigen: null }
  if (!shiftId || !scheduledStart) return vacio
  /*
   * Cada `plantSlug` del monitor es UNA línea, así que el id de config se
   * deriva sin arrastrar `plantLineId` por cuatro firmas. Mismo `configDocId`
   * que la PWA: la línea principal de Chonchi vive en 'global'.
   */
  const docId = { chonchi: 'global', yal: 'yal-eviscerado', filete: 'chonchi-filete' }[plantSlug]
  if (!docId) return vacio
  try {
    const snap = await db.doc(`graderModuleConfigs/${docId}`).get()
    if (!snap.exists) return vacio
    /*
     * El set point es de la LÍNEA, no del turno: se resuelve ANTES de buscar la
     * entrada de horario, para que la primera noche de un turno nuevo —sin
     * entrada todavía— no pierda también la referencia de máquina. Lo edita un
     * supervisor en la PWA; acá solo se valida que sea un número usable.
     */
    const spRaw = snap.data()?.monitorSetPoint
    const setPoint = spRaw && Number(spRaw.cpm) > 0
      ? {
        cpm: Number(spRaw.cpm),
        medidoEl: typeof spRaw.medidoEl === 'string' ? spRaw.medidoEl : null,
        metodo: typeof spRaw.metodo === 'string' ? spRaw.metodo : null,
        por: typeof spRaw.por === 'string' ? spRaw.por : null,
      }
      : null
    const schedule = snap.data()?.shiftSchedule
    if (!Array.isArray(schedule)) return { ...vacio, setPoint }
    /*
     * Comparación TOLERANTE de nombre de turno. Filete llama al suyo
     * "Turno Dia" y la config guarda "Turno día": comparando literal, Filete
     * nunca encontraba su horario. Es el mismo tropiezo que ya rompió antes la
     * comparación de turnos por nombre fijo — se normalizan tildes y mayúsculas.
     */
    // ̀-ͯ = los diacríticos que separa NFD. Escapado y no literal:
    // un archivo con otro encoding convertiría el rango en basura silenciosa.
    const entry = schedule.find(s => normShiftName(s?.shiftId) === normShiftName(shiftId))
    if (!entry) return { ...vacio, setPoint }

    const endH = Number(entry.endHour)
    const endM = Number(entry.endMinute ?? 0)
    if (!Number.isFinite(endH)) return vacio

    // Wall-clock, igual que el resto del monitor: se construye sobre el DÍA del
    // inicio y se suma un día si el turno cruza medianoche.
    const end = new Date(Date.UTC(
      scheduledStart.getUTCFullYear(), scheduledStart.getUTCMonth(), scheduledStart.getUTCDate(),
      endH, endM, 0, 0,
    ))
    if (end.getTime() <= scheduledStart.getTime()) end.setUTCDate(end.getUTCDate() + 1)

    /*
     * `quota` es `{ value, unit }` y la unidad importa: una cuota en KG no es
     * una meta de piezas y compararla contra los ciclos daría un disparate.
     * Solo se toma cuando viene en piezas.
     */
    const quota = Number(entry.quota?.value)
    const enPiezas = entry.quota?.unit === 'pieces'
    /*
     * El peso promedio del pescado, cargado a mano durante el turno.
     *
     * ⚠ Shoplogix cuenta CICLOS, no kilos: en todo el payload no hay un solo
     * campo de peso. Pero producción pide TONELADAS —"70 t", y cuántas piezas
     * son depende del calibre del día— y las toneladas reales salen del Excel
     * del Grader, que no es en vivo. Con este peso el monitor puede estimar en
     * vivo cuántas toneladas van y cuántas darían al cierre.
     */
    const pesoRaw = Number(entry.pesoPromedioKg)
    const pesoPromedioKg = Number.isFinite(pesoRaw) && pesoRaw > 0 ? pesoRaw : null
    const origen = entry.quotaOrigen && Number(entry.quotaOrigen.toneladas) > 0
      ? {
        toneladas: Number(entry.quotaOrigen.toneladas),
        pesoPromedioKg: Number(entry.quotaOrigen.pesoPromedioKg) || null,
      }
      : null
    return {
      plannedEnd: end,
      setPoint,
      pesoPromedioKg,
      quotaOrigen: origen,
      quotaPieces: enPiezas && Number.isFinite(quota) && quota > 0 ? quota : null,
      /*
       * `endPinned` lo marca quien fija el cierre A PROPÓSITO desde el monitor.
       * Sin él no se puede distinguir un horario cargado hace meses —que envejeció
       * y por eso el historial le gana— de una decisión que alguien acaba de
       * tomar mirando la pantalla, que sí tiene que mandar.
       */
      endPinned: entry.endPinned === true,
    }
  } catch {
    // La config es un extra: si no se puede leer, el monitor sigue igual.
    return vacio
  }
}

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

  for (const m of machines) {
    const extra = extras.get(m.id)
    if (!extra) continue
    m.intervals = [...(m.intervals || []), ...extra.intervals]
    m.states = [...(m.states || []), ...extra.states]
    m.totalCycles = (m.totalCycles || 0) + extra.pieces
  }

  /*
   * Qué es "fuera del horario" se decide por la HORA REAL del tramo, no por el
   * doc del que vino.
   *
   * ⚠ Visto el 13-08 en Filete con la línea en hora extra: los tramos 15:30 y
   * 15:35 (49 pz, pasado el cierre de 15:30) estaban en el doc del turno Y
   * duplicados en `Unscheduled`. El dedupe —correcto, evita contarlos dos
   * veces— los dejaba del lado "dentro del turno", así que el chip "+N fuera
   * del horario" no aparecía hasta que Shoplogix dejaba de escribirlos en el
   * doc del turno (ayer, recién a las 15:40). La hora extra se contaba pero no
   * se veía, y eso se lee como que la app dejó de contarla.
   *
   * Se conserva el criterio viejo como UNIÓN: lo rescatado del bucket
   * `Unscheduled` sigue siendo "fuera" aunque la ventana del turno venga
   * derivada del último intervalo (Yal) y no permita clasificar por tiempo.
   */
  const fueraDeVentana = (ms) => {
    if (ventanaTurno.end && ms >= ventanaTurno.end.getTime()) return true
    if (ventanaTurno.start && ms < ventanaTurno.start.getTime()) return true
    return false
  }
  const outsideIntervals = []
  for (const m of machines) {
    const rescatados = new Set(
      (extras.get(m.id)?.intervals || []).map(iv => toDate(iv.startAt)?.getTime()).filter(Boolean),
    )
    for (const iv of m.intervals || []) {
      if ((iv.cycles || 0) <= 0) continue
      const s = toDate(iv.startAt)
      if (!s) continue
      if (rescatados.has(s.getTime()) || fueraDeVentana(s.getTime())) outsideIntervals.push(iv)
    }
  }
  const outsidePieces = outsideIntervals.reduce((a, iv) => a + (iv.cycles || 0), 0)

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
  /* Lo de adentro se DERIVA del total: así los dos números siempre suman, sin
     importar por qué doc llegó cada tramo. */
  const shiftPieces = Math.max(0, totalPieces - outsidePieces)
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
  const outsideRanges = agruparTramos(outsideIntervals).map(t => ({
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

  /*
   * Comentarios que el operador escribe en Shoplogix sobre una detención.
   *
   * Es el único texto en castellano que hay en todo el turno: "Se corre
   * litografiado y se debe detener y ordenar" explica una FALLA OPERACIONAL de
   * 10 min mucho mejor que la etiqueta. Sin esto, quien mira el monitor ve la
   * causa pero no el motivo, y tiene que ir a preguntar.
   *
   * Dos formas conviven en la data: la nueva (`startAt`/`endAt` Timestamp +
   * `reasonValue`) y la vieja de febrero (`start`/`end` string compacto +
   * `matchValue`). Se leen las dos porque el historial las mezcla.
   *
   * Se deduplica por `key`: el mismo comentario aparece en el doc del turno y
   * en el de la cola `Unscheduled`, y sin esto sale repetido.
   */
  const comentarios = []
  const vistosCom = new Set()
  for (const m of machines) {
    for (const c of m.comments || []) {
      const texto = String(c.text || '').trim()
      if (!texto) continue
      const k = c.key || `${texto}|${c.startAt || c.start || ''}`
      if (vistosCom.has(k)) continue
      vistosCom.add(k)
      const desde = toDate(c.startAt) || parseCompacto(c.start)
      const hasta = toDate(c.endAt) || parseCompacto(c.end)
      comentarios.push({
        t: texto,
        r: String(c.reasonValue || c.matchValue || '').trim() || null,
        f: desde ? desde.toISOString() : null,
        h: hasta ? hasta.toISOString() : null,
      })
    }
  }
  comentarios.sort((a, b) => (a.f || '') < (b.f || '') ? 1 : -1)

  /*
   * Desglose planificado / recuperable, con las causas VISIBLES en los dos
   * grupos. Agrupar el planificado en un solo número invita a sospechar que se
   * esconde algo: si la colación se lleva 56 min, que se lea "colación 56 min".
   *
   * ⚠⚠ Se mide sobre la LÍNEA DE TIEMPO del turno, minuto a minuto, y no
   * sumando las duraciones de cada máquina. Yal tiene TRES Baader: sumadas, sus
   * paradas daban 811 + 193 + 21 min contra una ventana de 291 — la barra
   * marcaba 352% y la colación aparecía como "179 min · 6×" cuando fueron 60
   * minutos, dos veces. En Filete, con una sola máquina, la suma coincidía con
   * la ventana y el error no se veía.
   *
   * Cada minuto se clasifica UNA vez y con esta prioridad: si alguna máquina
   * produjo, la línea estaba produciendo; después el convenio; después lo
   * recuperable. Así el total nunca pasa de la ventana.
   */
  /*
   * ⚠⚠ El TAMAÑO de la rejilla es el LAPSO REAL (effectiveStart→effectiveEnd),
   * no los minutos de operación. `windowHours` descuenta los huecos >30 min
   * (decisión correcta para la cadencia pz/h), pero la rejilla se indexa por
   * hora real: dimensionarla con los minutos descontados la cortaba ANTES del
   * final del turno, exactamente tantos minutos como hueco hubo.
   *
   * Visto en Filete el 14-08 (colación de 43 min > 30): rejilla hasta las
   * 14:35 con el turno corriendo hasta las 15:25 — los últimos 50 min
   * desaparecían del desglose entero. La fila decía "Micro 23×" con 28 paros
   * reales, una Detencion de 6 min a las 15:24 no salía en NINGUNA fila, y el
   * ritmo andando daba 13,5 con ~11,8 reales (las piezas de la cola contaban,
   * sus minutos produciendo no).
   */
  const spanMin = effectiveStart && effectiveEnd && effectiveEnd > effectiveStart
    ? Math.round((effectiveEnd.getTime() - effectiveStart.getTime()) / 60_000)
    : Math.max(0, Math.round(windowHours * 60))
  const minVentana = spanMin
  const t0Ventana = effectiveStart ? effectiveStart.getTime() : null

  /*
   * La rejilla va de 10 en 10 segundos, no de minuto en minuto: una micro
   * detención de 40 s pintaba un minuto entero, y con 37 de ellas en un turno
   * de Filete el error se acumula en decenas de minutos. Un turno de 12 h son
   * 4.320 celdas — nada.
   */
  const PASO_SEG = 10
  const celdas = Math.max(0, minVentana * (60 / PASO_SEG))
  const aMin = (n) => Math.round((n * PASO_SEG) / 60)

  /** Marca [desde, hasta) en una rejilla, redondeando al paso más cercano. */
  const marcar = (rejilla, desdeMs, hastaMs, valor) => {
    const a = Math.max(0, Math.round((desdeMs - t0Ventana) / (PASO_SEG * 1000)))
    const b = Math.min(celdas, Math.round((hastaMs - t0Ventana) / (PASO_SEG * 1000)))
    for (let i = a; i < b; i++) rejilla[i] = valor
  }

  /*
   * La línea de tiempo se arma en DOS pasos, y el orden importa.
   *
   * 1. Cada máquina resuelve su propia línea: primero sus `uptime`, y encima
   *    sus paradas. Las paradas pisan el uptime a propósito — los states de una
   *    misma máquina llegan duplicados entre el doc del turno y el de la cola
   *    `Unscheduled`, y un uptime solapado tapaba la parada. Así, con UNA sola
   *    máquina, las 37 micro detenciones de Filete daban "0 min frenaron la
   *    línea", que es justo lo contrario de la verdad.
   * 2. La línea produce en un minuto si ALGUNA máquina lo estaba produciendo.
   *    Recién ahí, sobre los minutos que quedaron sin producción, se reparte el
   *    convenio y lo recuperable.
   */
  const linea = new Uint8Array(celdas)  // 1 produce, 2 convenio, 3 recuperable
  if (t0Ventana != null) {
    for (const m of machines) {
      const gm = new Uint8Array(celdas)
      for (const st of m.states || []) {
        const d = toDate(st.startAt)
        const sec = st.durationSec || 0
        if (!d || sec <= 0) continue
        if (st.type === 'uptime') marcar(gm, d.getTime(), d.getTime() + sec * 1000, 1)
      }
      for (const st of m.states || []) {
        const d = toDate(st.startAt)
        const sec = st.durationSec || 0
        if (!d || sec <= 0 || st.type === 'uptime') continue
        marcar(gm, d.getTime(), d.getTime() + sec * 1000, 4)  // parada de ESTA máquina
      }
      for (let i = 0; i < celdas; i++) if (gm[i] === 1) linea[i] = 1
    }
  }

  /** Minutos de la ventana cubiertos por cada causa, ya sin solapes. */
  const porCausa = new Map()
  if (t0Ventana != null) {
    for (const e of stopEvents) {
      const reason = stopReasons[e.r]
      let g = porCausa.get(reason)
      if (!g) { g = new Uint8Array(celdas); porCausa.set(reason, g) }
      const a = new Date(e.f).getTime()
      marcar(g, a, a + e.s * 1000, 1)
    }
    // Convenio antes que recuperable: una colación no se "recupera".
    for (const [reason, g] of porCausa) {
      const valor = esParoPlanificado(reason) ? 2 : 3
      for (let i = 0; i < celdas; i++) if (g[i] && linea[i] === 0) linea[i] = valor
    }
  }

  /**
   * Minutos y tramos contiguos de una causa. "2x" son dos paradas reales, no
   * dos máquinas parando por lo mismo.
   *
   * `lineMin` son los minutos en que ADEMÁS la línea entera estuvo detenida.
   * Con varias máquinas los dos números se separan mucho y esa diferencia es el
   * dato: KNURO se llevó 107 min de UNA Baader de Chonchi mientras las otras
   * dos seguían, así que la línea no perdió esos minutos. Sin distinguirlo, la
   * barra dice "recuperable 7 min" y el detalle "107 min", y parece un error.
   */
  const resumir = (g) => {
    let celdasCausa = 0, tramos = 0, previo = 0, celdasLinea = 0
    for (let i = 0; i < g.length; i++) {
      if (g[i]) {
        celdasCausa++
        if (linea[i] !== 1) celdasLinea++
        if (!previo) tramos++
      }
      previo = g[i]
    }
    return { min: aMin(celdasCausa), count: tramos, lineMin: aMin(celdasLinea) }
  }

  const planificados = []
  const recuperables = []
  for (const [reason, g] of [...porCausa.entries()].sort()) {
    const r = resumir(g)
    if (r.min <= 0) continue
    ;(esParoPlanificado(reason) ? planificados : recuperables)
      .push({ reason, min: r.min, count: r.count, lineMin: r.lineMin })
  }
  planificados.sort((a, b) => b.min - a.min)
  recuperables.sort((a, b) => b.min - a.min)

  let cProd = 0, cPlan = 0, cRec = 0
  for (let i = 0; i < linea.length; i++) {
    if (linea[i] === 1) cProd++
    else if (linea[i] === 2) cPlan++
    else if (linea[i] === 3) cRec++
  }
  const producingMin = aMin(cProd)
  const plannedMin = aMin(cPlan)
  const recoverableMin = aMin(cRec)

  // ── Serie temporal (suma de todas las máquinas por bucket de 5 min) ──────
  // Se guarda también el desglose POR máquina: el monitor dibuja la curva de
  // velocidad de cada Baader (pedido de Orel 26-08) y reparte la media de
  // 15 min entre ellas. Mismos buckets, misma ventana — así las curvas
  // individuales suman la de línea en vez de contar otra historia.
  const byBucket = new Map()
  const byBucketDeMaquina = new Map()
  for (const m of machines) {
    const propio = new Map()
    byBucketDeMaquina.set(m.id, propio)
    for (const ivRaw of m.intervals || []) {
      const s = toDate(ivRaw.startAt)
      if (!s) continue
      const key = s.getTime()
      byBucket.set(key, (byBucket.get(key) || 0) + (ivRaw.cycles || 0))
      propio.set(key, (propio.get(key) || 0) + (ivRaw.cycles || 0))
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

  /*
   * El arranque PRODUCTIVO: el primer bucket con piezas, saltando picos
   * sueltos. La madrugada del 17-08 la línea pasó 3 piezas a las 21:45 y
   * arrancó de verdad a las 00:20; tomar el pico como arranque corría el
   * cierre estimado casi tres horas. Misma regla que el cliente
   * (`monitorActividad.desdePrimeraPieza`), y el mismo umbral.
   */
  const HUECO_ARRANQUE_MIN = 60
  const arranqueProductivo = (() => {
    const conPz = seriesAll.filter((p) => (p.pieces || 0) > 0)
    if (conPz.length === 0) return null
    let elegido = conPz[0]
    for (let i = 1; i < conPz.length; i++) {
      const huecoMin = (Date.parse(conPz[i].t) - Date.parse(conPz[i - 1].t)) / 60000 - INTERVAL_MIN
      if (huecoMin > HUECO_ARRANQUE_MIN) elegido = conPz[i]
      else break
    }
    return toDate(elegido.t)
  })()

  // Cadencia reciente: últimos 30 min de intervalos sincronizados. Cero es un
  // dato válido y buscado (la línea está parada AHORA), no un hueco.
  const recentSlice = seriesAll.slice(-RECENT_INTERVALS)
  const recentPieces = recentSlice.reduce((a, p) => a + p.pieces, 0)
  const recentMinutes = recentSlice.length * INTERVAL_MIN
  const recentPiecesPerMinute = recentMinutes > 0 ? recentPieces / recentMinutes : 0

  // ── Por máquina ──────────────────────────────────────────────────────────
  const machinesOut = machines.map(m => {
    // Mismo criterio que el % de línea (uptime sobre tiempo rastreado), para que
    // los dos números se puedan comparar. `shiftRuntime` no sirve acá: es del
    // turno y no conoce la cola de después del cierre.
    const b = m.shiftRuntimeBreakdown || {}
    const extraStates = extras.get(m.id)?.states || []
    // El estado ACTUAL: el del turno, salvo que el bucket `Unscheduled` tenga
    // uno más nuevo (`stateVigente`) y el turno no traiga un `isCurrent` real.
    // Al cerrar el turno, la detención del cierre vive solo en ese bucket, y
    // mirando únicamente los states del turno la máquina quedaba congelada en
    // su último uptime — "produciendo" horas después del último pescado.
    let st = currentStateOf(m.states)
    const vigente = extras.get(m.id)?.stateVigente
    if (
      vigente && st?.isCurrent !== true &&
      (!st || (toDate(vigente.startAt)?.getTime() ?? 0) > (toDate(st.startAt)?.getTime() ?? 0))
    ) {
      st = vigente
    }
    const pieces = m.totalCycles || 0
    const mHours = windowHours > 0 ? windowHours : 0
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
      // Piezas de ESTA máquina en cada bucket de `series` (mismo orden). Los
      // buckets sin dato van en 0 — incluida la cola extendida de paros.
      serie: series.map(p => byBucketDeMaquina.get(m.id)?.get(Date.parse(p.t)) || 0),
      // Objetivo de ESTA máquina en pz/min: la mediana del `targetRate` que
      // Shoplogix reporta por tramo (en Chonchi: Ev1 19, Ev2/Ev3 16 — no son
      // el mismo modelo). Mediana y no máximo: los tramos parciales traen el
      // objetivo escalado hacia abajo y un pico raro no debe definirlo.
      targetCpm: (() => {
        const ts = (m.intervals || [])
          .map(iv => iv.targetRate)
          .filter(v => Number.isFinite(v) && v > 0)
          .sort((a, b) => a - b)
        return ts.length ? ts[Math.floor(ts.length / 2)] : null
      })(),
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
  // `new Date()` a secas iría 3-4 h adelantado. La decisión vive en
  // `esTurnoSellado` (ver su nota: margen de Filete + turno zombie).
  const nowWall = shoplogixPolling.toChileWall(new Date())
  const stopped = machinesOut.filter(m => m.status === 'detenida')
  // Último dato de PRODUCCIÓN conocido (turno + cola rescatada), wall-clock.
  let ultimaProdMs = hasProduction ? lastMs : null
  for (const ex of extras.values()) {
    for (const iv of ex.intervals || []) {
      if ((iv.cycles || 0) <= 0) continue
      const e = toDate(iv.endAt)
      if (e && (ultimaProdMs == null || e.getTime() > ultimaProdMs)) ultimaProdMs = e.getTime()
    }
  }
  const shiftClosed = esTurnoSellado({
    nowWallMs: nowWall.getTime(),
    scheduledEndMs: scheduledEnd ? scheduledEnd.getTime() : null,
    hayProduciendo: producing.length > 0,
    ultimaProdMs,
    margenMs: CLOSE_MARGIN_MS,
  })

  /*
   * ── KPIs de Mantención, publicados al monitor ─────────────────────────────
   * La respuesta del turno: quién falló, cuánto costó y qué tan rápido se
   * repuso. Van al doc público porque Producción mira ESTA pantalla (pedido de
   * Orel, 26-08): la evidencia de que Mantención responde tiene que estar donde
   * está el público, no solo en la vista interna. Sale de los states que este
   * build ya tiene en la mano — cero lecturas extra.
   */
  const mantencion = (() => {
    const fin = effectiveEnd ?? scheduledEnd
    if (!scheduledStart || !fin) return null
    const ventana = { start: scheduledStart, end: new Date(fin.getTime() + 10 * 60_000) }
    const eventosTodos = []
    const rangosSinCausa = []
    const porMaquina = machines.map((m) => {
      /* Los states traen Timestamps de Firestore; el módulo espera fechas
         parseables (`new Date(Timestamp)` da NaN y el saneo lo bota todo). */
      const statesNorm = (m.states || []).map((s) => ({
        ...s,
        startAt: toDate(s.startAt),
        endAt: toDate(s.endAt),
      }))
      const saneados = kpisMantencion.sanearStates(statesNorm, ventana)
      /* Los tramos sin causa de ESTA máquina, recortados a la ventana: abajo
         se intersectan entre máquinas para decir cuánto estuvo la LÍNEA
         entera detenida sin causa (no la suma máquina a máquina). */
      rangosSinCausa.push(
        saneados
          .filter((s) => kpisMantencion.clasificaCausa(s) === 'sin-imputar')
          .map((s) => [
            Math.max(new Date(s.startAt).getTime(), ventana.start.getTime()),
            Math.min(new Date(s.endAt).getTime(), ventana.end.getTime()),
          ]),
      )
      const k = kpisMantencion.kpisDeMaquina(saneados)
      for (const e of k.eventosFalla) {
        eventosTodos.push({
          maquina: m.machineName || m.id,
          desde: e.desde,
          hasta: e.hasta,
          min: Math.round(e.sec / 6) / 10,
          causas: e.causas,
          paros: e.paros,
        })
      }
      const causasFalla = Object.entries(k.grupos.falla?.causas ?? {})
        .sort((a, b) => b[1] - a[1])
        .map(([causa, sec]) => ({ causa, min: Math.round(sec / 6) / 10 }))
      return {
        name: m.machineName || m.id,
        dispTecnicaPct: k.dispTecnicaPct != null ? Math.round(k.dispTecnicaPct * 10) / 10 : null,
        eventosFalla: k.eventosFalla.length,
        fallaMin: Math.round((k.grupos.falla?.sec ?? 0) / 6) / 10,
        mttrMin: k.mttrMin != null ? Math.round(k.mttrMin * 10) / 10 : null,
        mtbfMin: k.mtbfMin != null ? Math.round(k.mtbfMin * 10) / 10 : null,
        microN: k.grupos.micro?.n ?? 0,
        microMin: Math.round((k.grupos.micro?.sec ?? 0) / 6) / 10,
        /*
         * Detenciones SIN causa anotada. Sin esto la tarjeta decía «100% ·
         * sin fallas» con paros sin imputar a la vista — una falsa realidad
         * (Orel, 26-08 con el turno noche recién arrancando): cualquiera de
         * esos paros puede SER una falla que nadie categorizó todavía.
         */
        sinImputarN: k.grupos['sin-imputar']?.n ?? 0,
        sinImputarMin: Math.round((k.grupos['sin-imputar']?.sec ?? 0) / 6) / 10,
        causasFalla,
      }
    })
    return {
      porMaquina,
      /** Los eventos del turno, del más caro al más barato. Tope chico: el doc es público. */
      eventos: eventosTodos.sort((a, b) => b.min - a.min).slice(0, 6),
      /** Minutos con TODAS las máquinas detenidas sin causa a la vez. */
      sinImputarLineaMin: Math.round(kpisMantencion.interseccionSec(rangosSinCausa) / 6) / 10,
    }
  })()

  /*
   * Cierre del turno, en tres niveles y en este orden:
   *
   *   1. FIJADO a mano (`endPinned`) — alguien lo decidió mirando la pantalla.
   *      Una decisión explícita le gana a cualquier cálculo.
   *   2. HISTORIAL — la mediana de los turnos anteriores con el mismo nombre.
   *      Es el caso normal y el que no hay que mantener: cuando Filete pase a
   *      tener día y tarde, cada turno aprende su horario solo.
   *   3. CONFIG sin fijar — un horario cargado alguna vez. Último recurso.
   *
   * El historial le gana a la config sin fijar a propósito: la config es una
   * intención que envejece sin que nadie se entere. Medido el 12-08, la de
   * Chonchi dice que el Turno 2 cierra 17:15 y los últimos 8 turnos cerraron a
   * las 15:00 — recomendar un ritmo contra un cierre que no ocurre regala dos
   * horas que no existen.
   */
  const shiftIdActual = parent.shiftId ?? machines[0]?.shiftId
  const cfg = await loadPlannedShift(db, plantSlug, shiftIdActual, scheduledStart)
  const planned = { quotaPieces: cfg.quotaPieces, pesoPromedioKg: cfg.pesoPromedioKg ?? null, quotaOrigen: cfg.quotaOrigen ?? null }
  const setPoint = cfg.setPoint ?? null

  let plannedEnd = null
  let plannedEndSource = null
  let plannedEndSamples = null

  /*
   * El historial se consulta SIEMPRE, incluso con el cierre fijado a mano: el
   * pin decide la hora de cierre, pero el ritmo de los turnos pasados sigue
   * siendo la referencia con la que se juzga si la meta es realista.
   */
  const inferido = await inferShiftEndFromHistory(db, plantSlug, shiftIdActual, scheduledStart, shiftDocId)

  if (cfg.plannedEnd && cfg.endPinned) {
    plannedEnd = cfg.plannedEnd
    plannedEndSource = 'fijado'
  } else {
    if (inferido) {
      plannedEnd = inferido.end
      plannedEndSource = 'historial'
      plannedEndSamples = inferido.muestras
    } else if (cfg.plannedEnd) {
      plannedEnd = cfg.plannedEnd
      plannedEndSource = 'config'
    } else {
      /*
       * Último recurso, y el único que sirve cuando el turno NO está definido
       * en Shoplogix: estimar por DURACIÓN típica de la línea. Va al final a
       * propósito — un horario real, aprendido o configurado, siempre le gana
       * a una duración promediada.
       */
      /* Se cuenta desde que la línea ARRANCÓ, no desde el horario declarado:
         para un `Unscheduled` ese horario es el borde de la ventana (06:00) y
         sumarle la duración daría un cierre a media tarde. */
      const porDuracion = await inferShiftEndFromDuration(
        db, plantSlug, arranqueProductivo ?? scheduledStart, shiftDocId,
      )
      if (porDuracion) {
        plannedEnd = porDuracion.end
        plannedEndSource = 'duracion'
        plannedEndSamples = porDuracion.muestras
      }
    }
  }

  return {
    updatedAt: new Date().toISOString(),
    lastSyncAt: iso(toDate(parent.lastSyncAt)),
    /*
     * El contador VIVO del whiteboard de Shoplogix, capturado por el sync del
     * rollup con su hora (UTC real). Es el mismo número que la pantalla de
     * planta: los buckets de 5 min corren un bucket detrás y la diferencia se
     * leía como descuadre. null en turnos sin rollup (históricos, pre-deploy).
     */
    /* > 0, no solo "es número": los turnos que ya pasaron su cierre quedaron
       con un 0 congelado del bug del 13-08 (el rollup devolvía la plantilla
       del día siguiente y se guardaba su cero). Exponerlo haría que cualquier
       consumidor lea "Shoplogix marcaba 0" con la línea en 4.707 piezas. */
    shoplogixLive: parent.officialLive && parent.officialLive.totalCycles > 0
      ? {
          totalCycles: parent.officialLive.totalCycles,
          at: iso(toDate(parent.officialLive.at)),
        }
      : null,
    scheduledStart: iso(scheduledStart),
    scheduledEnd: iso(scheduledEnd),
    /*
     * Cierre PROGRAMADO y cuota del turno, de la config del módulo. Van aparte
     * de `scheduledEnd` a propósito: aquél se deriva del último intervalo y
     * corre detrás del reloj, así que sirve para "hasta cuándo hay datos" pero
     * no para "cuánto falta". Con estos dos, el monitor puede recomendar el
     * ritmo necesario para llegar. null cuando el turno no está en la config.
     */
    plannedEnd: iso(plannedEnd),
    /** 'fijado' | 'historial' | 'config' | null — para poder decirlo en pantalla. */
    plannedEndSource,
    /**
     * Set point operacional de la máquina, editado por un supervisor en la PWA
     * (graderModuleConfigs.monitorSetPoint). Con fecha y método porque la
     * fuente es parte del dato: 18 pz/min medidos con cronómetro no es lo mismo
     * que un dato del PLC, y la pantalla lo dice.
     */
    setPoint,
    /** Turnos anteriores usados cuando se infirió del historial. */
    plannedEndSamples,
    /*
     * Ritmo de los turnos anteriores, en pz/min sobre tiempo de reloj. Es la
     * referencia con la que se juzga si un "necesitás 16 pz/min" es realista:
     * el objetivo del sensor puede decir 20 y la línea no haber pasado nunca
     * de 12,7 — medido en Filete sobre 9 turnos.
     */
    paceMedianCpm: inferido?.paceMedianCpm ?? null,
    paceBestCpm: inferido?.paceBestCpm ?? null,
    paceSamples: inferido?.paceSamples ?? null,
    quotaPieces: planned.quotaPieces,
    pesoPromedioKg: planned.pesoPromedioKg ?? null,
    quotaOrigen: planned.quotaOrigen ?? null,
    /*
     * Nombre del turno tal como lo da Shoplogix. Va en el payload para que el
     * monitor pueda fijar el cierre DE ESTE turno sin adivinarlo del id del
     * documento — que trae el dateKey pegado y ya rompió una comparación antes.
     */
    shiftName: shiftIdActual ?? null,
    effectiveStart: iso(effectiveStart),
    effectiveEnd: iso(effectiveEnd),
    shiftClosed,
    /** KPIs de Mantención del turno (ver bloque de arriba). Ausente en docs viejos. */
    mantencion,
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
    /*
     * A dónde se fue el tiempo del turno, medido sobre la línea de tiempo: los
     * tres números y el resto suman la ventana, con varias máquinas o con una.
     */
    timeBreakdown: {
      /*
       * Versión de la rejilla. v2 = dimensionada por el lapso real (fix del
       * recorte de cola, #562). Viaja EN el desglose porque las dos cachés
       * (history y forecastHistory) reusan lives ya publicados: sin la marca
       * acá, un live viejo se re-sellaba como nuevo y los récords mezclaban
       * turnos medidos con dos varas.
       */
      tbv: 2,
      windowMin: minVentana,
      producingMin,
      plannedMin,
      recoverableMin,
      planned: planificados,
      recoverable: recuperables,
    },
    /** Razones, para que los eventos no repitan el texto en cada uno. */
    comments: comentarios.slice(0, COMMENTS_MAX),
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
    // Y solo se reusa un live medido con la rejilla vigente: uno viejo dejaría
    // «Anterior» mostrando el desglose recortado para siempre.
    if (cacheado?.live && i > 0 && cacheado.live.timeBreakdown?.tbv === 2) { out.push(cacheado); continue }
    try {
      const live = await buildMonitorLive(db, plantSlug, id)
      if (live) out.push({ shiftDocId: id, dateKey: id.slice(0, 10), shiftId: id.slice(11), live })
    } catch {
      if (cacheado?.live) out.push(cacheado)
    }
  }
  return out
}

/** Turnos del MISMO nombre que se publican para pronosticar el cierre. */
const FORECAST_MAX = 10
/** Un punto cada 15 min alcanza para proyectar y deja el resumen liviano. */
const FORECAST_STEP_MIN = 15
/** Debajo de esto no fue un turno: fue una prueba o un arranque abortado. */
const FORECAST_MIN_PIECES = 500
const FORECAST_MIN_PROD_MIN = 60

/**
 * Resumen liviano de un turno para el pronóstico: su curva acumulada indexada
 * en minutos desde el arranque, más los tres datos que usa el diagnóstico.
 *
 * No viaja la serie completa (~100 puntos por turno): con diez turnos eso
 * engordaría el doc público sin aportar — proyectar no necesita el detalle de
 * cinco minutos.
 */
function resumirParaForecast(live) {
  const serie = (live?.series || []).filter(p => p && p.t)
  if (serie.length < 3) return null
  const t0 = Date.parse(serie[0].t)
  if (Number.isNaN(t0)) return null

  /*
   * ⚠⚠ Objetos {m, p} y NO pares [m, p]: **Firestore rechaza los arrays
   * anidados** ("Property array contains an invalid nested entity") y el write
   * del patch falla ENTERO — no solo este campo. Costó tener el monitor
   * congelado 25 minutos en producción el 13-08: el cálculo se había probado
   * leyendo, nunca escribiendo.
   */
  const curve = []
  let acum = 0
  let proximo = 0
  for (const p of serie) {
    acum += p.pieces || 0
    const min = Math.round((Date.parse(p.t) - t0) / 60_000) + 5
    if (min >= proximo) {
      curve.push({ m: min, p: acum })
      proximo = min + FORECAST_STEP_MIN
    }
  }
  // El cierre siempre entra: es el punto que ancla toda la proyección.
  const ultimo = curve[curve.length - 1]
  const finMin = Math.round((Date.parse(serie[serie.length - 1].t) - t0) / 60_000) + 5
  if (!ultimo || ultimo.m !== finMin) curve.push({ m: finMin, p: acum })
  if (curve.length < 3) return null

  /*
   * ⚠ Fuera los turnos que apenas arrancaron. Visto al probarlo en Filete: el
   * 1-ago figura con 180 piezas en 16 minutos —una prueba, no un turno— y como
   * referencia envenena las dos cosas que alimenta: su ratio distorsiona la
   * proyección y su velocidad (11 pz/min en 16 min) el diagnóstico.
   */
  const total = live.totalPieces ?? acum
  const producingMin = live.timeBreakdown?.producingMin ?? 0
  if (total < FORECAST_MIN_PIECES || producingMin < FORECAST_MIN_PROD_MIN) return null

  const micro = (live.topStops || []).find(s => /micro/i.test(s.reason || ''))
  /*
   * El desglose del tiempo viaja entero: sin ventana/convenio/paradas del turno
   * anterior no se puede explicar POR QUE hoy cerro distinto (el 14-08 hizo 788
   * pz menos que el 13 siendo mas rapido: la diferencia era 80 min de ventana
   * y 17 de convenio, y eso solo se ve con estos tres numeros).
   */
  const tb = live.timeBreakdown || {}
  return {
    curve, total, producingMin, micro: micro?.count ?? null,
    /*
     * Lo que Shoplogix esperaba de este turno YA CERRADO. Es la unica forma de
     * tener una meta firme cuando nadie cargo una cuota: en el turno EN CURSO
     * `expectedPieces` se completa sobre la marcha (medido la noche del 25-08:
     * 15.821 -> 20.875 en el mismo turno), asi que como meta en vivo corre
     * hacia arriba. Ver `objetivoDelTurno` en la PWA.
     */
    expected: live.expectedPieces ?? null,
    windowMin: tb.windowMin ?? null,
    plannedMin: tb.plannedMin ?? null,
    recoverableMin: tb.recoverableMin ?? null,
    // La versión viene del PROPIO desglose: sellarla con una constante acá
    // re-etiquetaría como nuevos números medidos con la vara vieja.
    tbv: tb.tbv ?? null,
  }
}


/**
 * Cuántos turnos guarda el arreglo liviano de estadísticas. 40 son ~20 días
 * con dos turnos: alcanza para ventanas de «últimos 30» sin acercarse al
 * límite de 1 MB del documento (medido el 16-08: el doc entero pesaba 74 KB y
 * cada entrada de estas ronda los 0,4 KB, así que 40 suman ~16 KB).
 */
const STATS_MAX = 40
/**
 * Cuántas entradas NUEVAS se construyen por corrida.
 *
 * ⚠ `buildMonitorLive` lee los ciclos del turno: construir 40 de una es un
 * pico de lecturas y de tiempo en una función que corre cada pocos minutos.
 * El arreglo se va llenando solo, unas pocas por vez, y mientras tanto la app
 * usa las que ya hay — que es exactamente cómo se comporta hoy el historial.
 */
const STATS_NUEVOS_POR_CORRIDA = 5

/**
 * Estadística LIVIANA de los últimos turnos, de TODOS los nombres.
 *
 * Por qué existe además de `forecastHistory`:
 *  - `forecastHistory` guarda la CURVA (lo pesado) y solo del MISMO turno,
 *    porque su trabajo es pronosticar el cierre.
 *  - Esto guarda lo que necesitan el Pareto, la banda y la tendencia —minutos
 *    y causas—, sin curva y con día y noche juntos, para poder comparar un
 *    turno contra otro y elegir la ventana («últimos 5/10/30»).
 *
 * Sin esto, «lo que se repite» solo podía mirar los 6 turnos de `history`, que
 * cargan la serie completa de cada uno y por eso son pocos.
 */
async function buildShiftStats(db, plantSlug, currentShiftDocId, prev = [], history = [], forecast = []) {
  const nowWall = shoplogixPolling.toChileWall(new Date())
  const desde = shiftDateKey(nowWall, -45)

  const refs = await db.collection(`shoplogix/${plantSlug}/shifts`).listDocuments()
  const ids = refs
    .map(r => r.id)
    /*
     * ⚠ Sin «Unscheduled»: es el cajón de lo que cae fuera de horario, no un
     * turno — el historial ya lo descarta por la misma razón. Se coló en la
     * primera corrida real (16-08) porque el de 520 pz pasaba el piso de
     * piezas, y habría aparecido como «turno» propio en el selector Día/Noche.
     */
    .filter(id => id.slice(0, 10) >= desde && id !== currentShiftDocId && id.slice(11) !== 'Unscheduled')
    .sort()
    .reverse()
    .slice(0, STATS_MAX)

  const previos = new Map((prev || []).map(h => [h.shiftDocId, h]))
  // Lives que este mismo refresco ya construyó: se aprovechan gratis.
  const yaConstruidos = new Map([
    ...(history || []).filter(h => h.live?.timeBreakdown?.tbv === 2).map(h => [h.shiftDocId, h.live]),
  ])
  const conCurva = new Set((forecast || []).map(f => f.shiftDocId))

  const out = []
  let nuevos = 0
  for (let i = 0; i < ids.length; i++) {
    const id = ids[i]
    const cacheado = previos.get(id)
    // i === 0 es el turno anterior: el re-sync móvil todavía puede moverlo.
    if (cacheado && i > 0 && cacheado.tbv === 2) { out.push(cacheado); continue }
    const live = yaConstruidos.get(id)
    if (!live && nuevos >= STATS_NUEVOS_POR_CORRIDA) {
      if (cacheado) out.push(cacheado)
      continue
    }
    try {
      const l = live || await buildMonitorLive(db, plantSlug, id)
      if (!live) nuevos++
      const tb = l?.timeBreakdown
      if (!tb || !(tb.windowMin > 0)) { if (cacheado) out.push(cacheado); continue }
      /*
       * ⚠ El MISMO piso de piezas que el pronóstico, y por la misma razón: en
       * Filete el 1-ago figura con 180 piezas y el 28-jul con 42 — son
       * pruebas, no turnos. Coladas en la muestra envenenan las tres piezas
       * que alimenta: un "turno" de 16 min con 5 de parada da 31% de tiempo
       * recuperable y arrastra la mediana, la banda y el ranking.
       * Solo el piso de PIEZAS (no el de minutos): es el criterio robusto y
       * las dos pruebas reales caen por él.
       */
      const total = l.totalPieces ?? 0
      if (total < FORECAST_MIN_PIECES) {
        if (cacheado) out.push(cacheado)
        continue
      }
      out.push({
        shiftDocId: id,
        dateKey: id.slice(0, 10),
        shiftId: id.slice(11),
        total,
        producingMin: tb.producingMin ?? 0,
        windowMin: tb.windowMin ?? null,
        plannedMin: tb.plannedMin ?? null,
        recoverableMin: tb.recoverableMin ?? null,
        /* Las causas, que es lo que `forecastHistory` no trae: sin ellas el
           Pareto no puede mirar más allá de los 6 turnos de `history`.
           Solo reason/min/count — ni paradas sueltas ni comentarios. */
        recoverable: (tb.recoverable || []).map(c => ({
          reason: c.reason, min: c.min, count: c.count ?? 0,
        })),
        /*
         * ⚠⚠ NUNCA `undefined` en un doc de Firestore: lo rechaza y el write
         * del patch falla ENTERO — no solo este campo. Pasó el 16-08: cada
         * refresco de CADA monitor murió con «Cannot use undefined as a
         * Firestore value (shiftStats.0.tieneCurva)» y el espejo quedó
         * congelado 40 minutos. El mismo gotcha del 13-08 con los arrays
         * anidados, y la misma causa: probado leyendo (tests), nunca
         * escribiendo. El campo solo existe cuando es true.
         */
        ...(conCurva.has(id) ? { tieneCurva: true } : {}),
        tbv: tb.tbv ?? null,
      })
    } catch {
      if (cacheado) out.push(cacheado)
    }
  }
  return out
}

/**
 * Turnos anteriores DEL MISMO NOMBRE, para pronosticar el cierre.
 *
 * ⚠ Por qué no alcanza con `history`: ese trae los seis turnos cronológicos
 * anteriores, y en Yal conviven tres turnos por día — quedaban solo dos
 * comparables y el pronóstico no aparecía nunca. Mezclar el turno de día con
 * el de noche no es una opción: tienen otra dotación y otra duración.
 *
 * Mismo truco de costo que `buildMonitorHistory`: un turno cerrado no cambia,
 * así que se reusa lo ya publicado y solo se compone lo que falta. Además se
 * aprovechan los `live` que el historial acaba de construir.
 */
async function buildForecastHistory(db, plantSlug, currentShiftDocId, shiftId, prev = [], history = []) {
  if (!shiftId) return []
  const nowWall = shoplogixPolling.toChileWall(new Date())
  const desde = shiftDateKey(nowWall, -30)

  const refs = await db.collection(`shoplogix/${plantSlug}/shifts`).listDocuments()
  const candidatos = refs.filter(r =>
    r.id !== currentShiftDocId &&
    r.id.slice(0, 10) >= desde &&
    r.id.slice(11) === shiftId,
  )
  if (candidatos.length === 0) return []

  const previos = new Map((prev || []).map(h => [h.shiftDocId, h]))
  // Solo lives de la rejilla vigente: uno viejo acá se resumiría y quedaría
  // sellado como nuevo con números de la vara vieja — cache poisoning silencioso.
  const yaConstruidos = new Map((history || [])
    .filter(h => h.live?.timeBreakdown?.tbv === 2)
    .map(h => [h.shiftDocId, h.live]))
  const ids = candidatos.map(r => r.id).sort().reverse().slice(0, FORECAST_MAX)

  const out = []
  for (let i = 0; i < ids.length; i++) {
    const id = ids[i]
    // i === 0 es el turno anterior: el re-sync móvil todavía puede moverlo.
    // Un cacheado sin el desglose (o con el de la rejilla RECORTADA, tbv<2)
    // es de un código anterior: se reconstruye una vez y queda.
    //
    // `expected` entra con el mismo criterio: sin el se pierde la unica meta
    // firme cuando nadie carga cuota (ver `objetivoDelTurno` en la PWA), y sin
    // forzar el rearmado los cacheados nunca lo tendrian — la mediana tardaria
    // una semana en poblarse sola. Se compara contra `undefined` a proposito:
    // un turno donde el sensor no espero nada guarda `null` y NO se rearma.
    const cacheado = previos.get(id)
    const completo = cacheado && cacheado.windowMin != null && cacheado.tbv === 2
      && cacheado.expected !== undefined
    if (completo && i > 0) { out.push(cacheado); continue }
    try {
      const live = yaConstruidos.get(id) || await buildMonitorLive(db, plantSlug, id)
      const resumen = live && resumirParaForecast(live)
      if (resumen) out.push({ shiftDocId: id, dateKey: id.slice(0, 10), ...resumen })
      else if (cacheado) out.push(cacheado)
    } catch {
      if (cacheado) out.push(cacheado)
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
    const fh = await buildForecastHistory(
      db, plantSlug, monitor.shiftDocId, String(monitor.shiftDocId).slice(11),
      monitor.forecastHistory, history,
    )
    return {
      live,
      history,
      forecastHistory: fh,
      /* Liviano y con TODOS los turnos: habilita elegir la ventana y comparar
         un turno contra el otro. Ver `buildShiftStats`. */
      shiftStats: await buildShiftStats(
        db, plantSlug, monitor.shiftDocId, monitor.shiftStats, history, fh,
      ),
    }
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

  const history = await buildMonitorHistory(db, plantSlug, shiftDocId, monitor.history)
  const fhLinea = await buildForecastHistory(
    db, plantSlug, shiftDocId, shiftDocId.slice(11), monitor.forecastHistory, history,
  )
  return {
    live,
    history,
    /* Turnos del mismo nombre: es lo que hace posible pronosticar en las
       líneas con varios turnos por día. */
    forecastHistory: fhLinea,
    /* Liviano y con TODOS los turnos: habilita elegir la ventana y comparar
       un turno contra el otro. Ver `buildShiftStats`. */
    shiftStats: await buildShiftStats(db, plantSlug, shiftDocId, monitor.shiftStats, history, fhLinea),
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

/**
 * Suma a cada máquina la producción que quedó FUERA del horario del turno y
 * devuelve el desglose. La usa el brief de fin de turno (checkShiftEndBriefs)
 * para que el mensaje de Telegram anuncie la jornada real y no el recorte de
 * Shoplogix — el mismo número que muestran el monitor público y la matriz.
 *
 * ⚠ Muta `machines` a propósito: suma `totalCycles` y concatena `states`, para
 * que el total, los paros y el % contra target del brief hablen todos de lo
 * mismo. `shiftRuntime` NO se toca (es el uptime que calcula Shoplogix para su
 * ventana; recomponerlo para la cola sería inventar).
 *
 * @param {object} parent — doc padre del turno (por su `scheduledStart/End`)
 * @param {Array<{id:string,totalCycles:number,intervals:Array,states:Array}>} machines
 * @returns {Promise<{pieces:number, start:Date|null, end:Date|null, lastPieceAt:Date|null}>}
 *   `lastPieceAt` va en wall-clock-as-UTC como todo lo derivado de intervals:
 *   quien lo compare con el reloj real tiene que convertirlo.
 */
async function sumarColaAMaquinas(db, plantSlug, shiftDocId, parent, machines) {
  const vacio = { pieces: 0, start: null, end: null, lastPieceAt: null }
  const ventanaTurno = { start: toDate(parent.scheduledStart), end: toDate(parent.scheduledEnd) }
  if (!ventanaTurno.start || !ventanaTurno.end) return vacio

  const yaContados = new Map(
    machines.map(m => [
      m.id,
      new Set((m.intervals || []).map(iv => toDate(iv.startAt)?.getTime()).filter(Boolean)),
    ]),
  )

  const extras = await loadOutsideShiftProduction(db, plantSlug, shiftDocId, ventanaTurno, yaContados)
  if (extras.size === 0) return vacio

  let pieces = 0
  let start = null
  let end = null
  for (const m of machines) {
    const extra = extras.get(m.id)
    if (!extra) continue
    m.totalCycles = (m.totalCycles || 0) + extra.pieces
    m.states = [...(m.states || []), ...(extra.states || [])]
    pieces += extra.pieces
    for (const iv of extra.intervals) {
      const s = toDate(iv.startAt)
      const e = toDate(iv.endAt) || s
      if (s && (!start || s < start)) start = s
      if (e && (!end || e > end)) end = e
    }
  }
  return { pieces, start, end, lastPieceAt: end }
}

module.exports = {
  COLLECTION,
  esTurnoSellado,
  CLOSE_MARGIN_MS,
  buildMonitorLive,
  buildMonitorHistory,
  buildForecastHistory,
  buildShiftStats,
  inferShiftEndFromDuration,
  buildMonitorPatch,
  resolveCurrentShiftDocId,
  ensureLineMonitor,
  // Lo usa también el brief de fin de turno (checkShiftEndBriefs): la cola de
  // producción fuera del horario tiene que dar el MISMO número en el monitor,
  // en la matriz y en el mensaje de Telegram.
  loadOutsideShiftProduction,
  sumarColaAMaquinas,
  OUTSIDE_MIN_PIECES,
  // exportados para tests
  currentStateOf,
  statusOf,
  modelLabel,
  toDate,
}
