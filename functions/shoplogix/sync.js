/**
 * Orquestador de sync Shoplogix → Firestore.
 *
 * Dos modos de operación:
 *
 *   syncDay (nuevo — recomendado):
 *     Consulta el día completo (00:00-24:00) una sola vez por planta y deriva
 *     los turnos reales a partir del campo `shift` en los intervalos de producción.
 *     Escribe un doc por turno real: `${dateKey}_Turno 1`, `${dateKey}_Turno 2`, etc.
 *     Soporta cualquier número de turnos (2 en Chonchi, 3 en Yal).
 *
 *   syncShift (legado — backward compat):
 *     Consulta con ventana hardcodeada (09:00-22:00 o 19:00-07:00) y escribe
 *     `${dateKey}_Turno día` o `${dateKey}_Turno noche`. Mantener para el
 *     trigger HTTP de testing/backfill cuando se pasa shiftId explícitamente.
 *
 * Errores:
 *   - AUTH_EXPIRED → propaga (el wrapper decide si alertar)
 *   - Network → skip esa máquina y continuar
 */

const { PLANT_MACHINES, PLANT_AREA_ID } = require('./machines')
const { queryShoplogix, queryShoplogixBearer } = require('./client')
const { normalizeShift } = require('./normalizer')
const { toShoplogixTime, parseShoplogixTime } = require('./time')
const { pauseBetweenMachines, currentShift, toChileWall, chileUtcOffsetHours, ahoraEnPlanta } = require('./polling')
const { canonicalShiftName } = require('./canonicalShift')

/** Plantas activas — usada en wakeup scheduler. */
const ACTIVE_PLANTS = Object.freeze(['chonchi', 'yal', 'filete'])

/**
 * Gracia tras el cierre de un turno antes de considerarlo "congelado".
 * Shoplogix puede seguir ajustando states/intervals un rato después del cierre,
 * así que exigimos al menos un sync POSTERIOR a `scheduledEnd + GRACE` antes de
 * dejar de re-escribir el turno.
 */
const CLOSED_SHIFT_GRACE_MS = 2 * 60 * 60 * 1000  // 2h

/**
 * Versión del esquema del doc PADRE de turno.
 *
 * Un turno congelado deja de reescribirse, así que esta constante es el ÚNICO
 * mecanismo que fuerza un repoblado del histórico. **Súbela cada vez que agregues
 * o cambies un campo del doc padre**, o los turnos ya congelados se quedarán sin
 * él para siempre y harán falta backfills manuales.
 *
 * Historial:
 *   1 — (implícito) docs sin `parentSchemaVersion`: solo conteos por máquina.
 *   2 — agrega por máquina: uptimeSec, shiftRuntime, overallRatio,
 *       expectedTotalCycles, breakdown y stateAggregates.
 */
const PARENT_SCHEMA_VERSION = 2

/**
 * Agrega los states de una máquina por (type, name, reason), sumando duración y
 * conteo. Es la forma comprimida de `states[]` que necesita la vista MENSUAL:
 * el pareto de paros por razón y los totales de avería macro/micro.
 *
 * Deliberadamente CRUDO: no clasifica qué es avería y qué es paro operacional.
 * Esa regla (`isMaintenanceState`) vive solo en la PWA y se aplica sobre estos
 * agregados. Duplicarla acá sería garantía de divergencia silenciosa.
 *
 * Se excluye `uptime`: no aparece en el pareto (que muestra paradas) y su total
 * ya viaja en `uptimeSec` / `breakdown`. Sacarlo baja bastante el tamaño del doc.
 *
 * Un turno de ~8h colapsa cientos de states (los micro-paros son 1400+ al mes)
 * en unas 10-25 entradas por máquina.
 */
/**
 * Gap máximo (seg) entre dos states CONSECUTIVOS de la misma causal para
 * considerarlos UN solo evento real. Shoplogix trocea una misma detención en
 * varios states contiguos (caso real 14-07 T2: COLACION 19:04→19:49 + COLACION
 * 19:49→20:01 = una colación de 57 min contada como 2 eventos) — sin fusión, el
 * conteo de eventos queda inflado y el MTTR (sec/count) subestimado.
 */
const EVENT_MERGE_GAP_SEC = 60

function aggregateStatesByReason(states) {
  // Orden cronológico primero: la fusión de consecutivos depende de mirar el
  // state anterior DE LA MISMA causal en el tiempo.
  const toMs = (v) => (v instanceof Date ? v.getTime() : new Date(v).getTime())
  const sorted = [...(states || [])]
    .filter((s) => s.type !== 'uptime')
    .sort((a, b) => toMs(a.startAt) - toMs(b.startAt))

  const byKey = new Map()
  for (const s of sorted) {
    const name   = s.name   || ''
    const reason = s.reason || ''
    const key = `${s.type}|${name}|${reason}`
    const prev = byKey.get(key)
    if (prev) {
      prev.durationSec += s.durationSec || 0
      // Evento nuevo SOLO si hay un gap real desde el fin del último fragmento
      // de esta causal; contiguo (≤ EVENT_MERGE_GAP_SEC) = mismo evento.
      // NaN-safe: sin timestamps válidos no se puede probar contigüidad →
      // cuenta como evento aparte (comportamiento pre-fusión).
      const gapSec = (toMs(s.startAt) - prev.lastEndMs) / 1000
      if (!(gapSec <= EVENT_MERGE_GAP_SEC)) prev.count += 1
      const endMs = toMs(s.endAt)
      if (isFinite(endMs)) prev.lastEndMs = Math.max(prev.lastEndMs, endMs)
    } else {
      byKey.set(key, {
        type: s.type,
        name,
        reason,
        color: s.color || '#64748b',
        durationSec: s.durationSec || 0,
        count: 1,
        lastEndMs: toMs(s.endAt),
      })
    }
  }
  return [...byKey.values()]
    .map(({ lastEndMs: _drop, ...rest }) => rest)
    .sort((a, b) => b.durationSec - a.durationSec)
}

/**
 * ¿Este turno ya quedó capturado en su forma final y no vale la pena reescribirlo?
 *
 * El wakeup corre cada 5 min y `syncDay` recorre TODOS los turnos del día — sin
 * este chequeo se reescribían turnos cerrados hace horas con datos idénticos
 * (~10k writes/día, casi todos redundantes).
 *
 * Devuelve true SOLO si:
 *   1. el turno cerró hace más de la gracia,
 *   2. existe doc padre con un `lastSyncAt` posterior a `scheduledEnd + gracia`
 *      (⇒ los datos finales del turno ya se guardaron al menos una vez), y
 *   3. el doc padre está al día con `PARENT_SCHEMA_VERSION`.
 *
 * El punto 3 es el que permite migrar el esquema del padre sin backfill manual:
 * los docs viejos se reescriben UNA vez y de ahí en adelante se saltean.
 *
 * Ante cualquier duda (doc ausente, sin lastSyncAt, error de lectura) devuelve
 * false → se reescribe. Nunca deja de escribir un turno que no está confirmado.
 *
 * Costo: 1 read por turno cerrado, a cambio de evitar 4 writes.
 */
async function isShiftAlreadyFrozen({ db, plantSlug, parentShiftDateKey, shiftId, scheduledEnd, now, logger }) {
  const closedForMs = now.getTime() - scheduledEnd.getTime()
  if (closedForMs <= CLOSED_SHIFT_GRACE_MS) return false

  try {
    const snap = await db.doc(`shoplogix/${plantSlug}/shifts/${parentShiftDateKey}_${shiftId}`).get()
    if (!snap.exists) return false

    const data = snap.data() || {}

    // lastSyncAt llega como Timestamp (Admin SDK); tolerar Date/string por si acaso.
    const raw = data.lastSyncAt
    const lastSyncAt = raw && typeof raw.toDate === 'function' ? raw.toDate()
      : raw instanceof Date ? raw
      : typeof raw === 'string' ? new Date(raw)
      : null
    if (!lastSyncAt || Number.isNaN(lastSyncAt.getTime())) return false
    if (lastSyncAt.getTime() < scheduledEnd.getTime() + CLOSED_SHIFT_GRACE_MS) return false

    // Esquema al día. Docs de la versión anterior (sin el campo) → reescribir una
    // vez. Ver PARENT_SCHEMA_VERSION: sin esto, un turno congelado nunca recibiría
    // los campos nuevos que agregue una versión futura del sync.
    if ((data.parentSchemaVersion ?? 1) < PARENT_SCHEMA_VERSION) return false

    // Debe haber al menos una máquina con datos reales. `.some` y no `.every`:
    // una máquina que falló en el normalizer (status:'error', sin uptimeSec) no
    // debe bloquear el freeze para siempre.
    const machines = Array.isArray(data.machines) ? data.machines : []
    if (!machines.some(m => typeof m?.uptimeSec === 'number')) return false

    return true
  } catch (err) {
    logger.warn(`[syncDay][${plantSlug}] freeze-check err (${parentShiftDateKey} ${shiftId}): ${err.message}`)
    return false
  }
}

// ── Helpers de ventana temporal ───────────────────────────────────────────────

/**
 * Hora en que TERMINA la ventana de consulta de un día (y empieza la del
 * siguiente). Anclar en 08:00 en lugar de 00:00 mantiene los turnos nocturnos
 * que cruzan medianoche dentro de la ventana del día al que pertenecen.
 */
const WINDOW_ANCHOR_HOUR = 8

/**
 * Hora en que EMPIEZA la ventana, dos horas antes del ancla.
 *
 * Por qué se adelantó (2026-08-05): en estas plantas el turno de día arranca
 * habitualmente ANTES de las 08:00 — Chonchi 07:15, Filete 07:30, Yal 07:45 —
 * y con la ventana anclada en 08:00 esos minutos caían dentro de la consulta
 * del día ANTERIOR. No se perdían: se le SUMABAN a ese doc. En producción,
 * `2026-08-04_Turno 2` quedó declarado 08:00 → 08:00 (24 h) con 16.398 ciclos
 * que incluían 45 min del día 5, mientras el turno del 5 nacía a las 08:00 sin
 * ellos. Era sistemático: 12 de 31 docs de Filete.
 *
 * Por qué 06:00 y no antes: el turno nocturno de Chonchi termina a las 05:00
 * (`2026-08-04_Turno 1`: 21:15 → 05:00). Empezar antes metería su cola en la
 * consulta del día siguiente y traería el mismo problema con el signo cambiado.
 * Queda 1 h 15 de margen sobre el arranque más temprano observado.
 *
 * Consecuencia buscada: las ventanas de dos días consecutivos SE SOLAPAN entre
 * 06:00 y 08:00. Por eso `deriveShiftGroups` separa los turnos por continuidad
 * temporal y los dos guards de borde (`isTruncatedTailOfNextWindow` y
 * `isTruncatedHeadOfPrevWindow`) evitan que un fragmento pise un doc completo.
 */
const WINDOW_START_HOUR = 6

/**
 * Hueco máximo entre dos intervals del mismo turno para seguir considerándolos
 * el MISMO turno.
 *
 * Shoplogix emite intervals también cuando no hay producción — el bloque
 * `Unscheduled` del 04-ago traía 102 intervals con 0 ciclos —, así que dentro
 * de un turno los intervals son contiguos aunque la línea esté parada. 8 h es
 * holgado para cualquier parada real y muy inferior a la distancia entre dos
 * turnos del mismo nombre en días consecutivos (16 h 15 en el caso real del
 * 04→05 de agosto).
 */
const SAME_SHIFT_MAX_GAP_MS = 8 * 60 * 60 * 1000

/**
 * Ventana de consulta para el día completo (wall-clock-as-UTC).
 *
 * Ejemplo para dateKey = "2026-08-05":
 *   window = 06:00 Ago 5 → 08:00 Ago 6
 *   Turno 2 (07:15-15:00 Ago 5)          ← dentro ✓ (antes se cortaba en 08:00)
 *   Turno 1 (~21:15 Ago 5 → 05:00 Ago 6) ← dentro ✓
 *   Turno 1 del día ANTERIOR (→ 05:00 Ago 5) ← fuera ✓ (termina antes de 06:00)
 */
function fullDayWindow(dateKey) {
  const [y, m, d] = dateKey.split('-').map(Number)
  const start = new Date(Date.UTC(y, m - 1, d,     WINDOW_START_HOUR, 0, 0))
  const end   = new Date(Date.UTC(y, m - 1, d + 1, WINDOW_ANCHOR_HOUR, 0, 0))
  return { start: toShoplogixTime(start), end: toShoplogixTime(end) }
}

/**
 * Ventana hardcodeada (legado) para syncShift.
 * Sigue siendo necesaria para backfill manual de turnos específicos.
 */
function shiftWindow(dateKey, shiftId) {
  const [y, m, d] = dateKey.split('-').map(Number)
  let startH = 9, endH = 22
  if (shiftId === 'Turno noche') { startH = 19; endH = 31 }
  const start = new Date(Date.UTC(y, m - 1, d, startH, 0, 0))
  const end   = new Date(Date.UTC(y, m - 1, d, 0, 0, 0) + endH * 3600 * 1000)
  return { start: toShoplogixTime(start), end: toShoplogixTime(end) }
}

/**
 * Filtra comentarios crudos de Shoplogix a la ventana [startMs, endMs] de un
 * turno específico. Sin esto, un comentario con su propio `start`/`end` fuera
 * del turno consultado quedaba igual guardado en el doc — evidencia real:
 * un comentario de 2026-07-08 01:00 (turno de madrugada del día 8) apareció
 * dentro del doc "2026-07-07_Turno 2", cuyo turno real termina ~00:00.
 *
 * Comentarios sin campo `.start` (o legado como string plano) se CONSERVAN
 * — no hay forma de saber si pertenecen a este turno, y descartarlos perdería
 * datos legítimos; quedan como "huérfanos" para que la UI decida qué hacer.
 */
function filterCommentsToWindow(rawComments, startMs, endMs) {
  return (rawComments || []).filter(c => {
    if (!c || typeof c !== 'object' || !c.start) return true
    const t = parseShoplogixTime(c.start).getTime()
    return t >= startMs && t <= endMs
  })
}

/**
 * ¿Este grupo viene CORTADO por el borde INICIAL de la ventana, y ya existe
 * guardado entero?
 *
 * Es el espejo exacto de `isTruncatedTailOfNextWindow`, y hace falta desde que
 * la ventana empieza a las 06:00 en vez de las 08:00: ahora la consulta de un
 * día alcanza a ver la COLA del turno nocturno que arrancó el día anterior y
 * sigue corriendo (Yal `Turno 3` iba 00:00→08:00). `deriveShiftGroups` la ve
 * como un turno propio que empieza a las 06:00 y `shiftDateKeyFromStart` la
 * manda al mismo doc que la ventana anterior ya escribió completo — pisándolo
 * con un fragmento de dos horas.
 *
 * Regla (las dos condiciones son necesarias, igual que en el guard de cola):
 *   1. el grupo empieza en el borde de la ventana (⇒ está cortado ahí), y
 *   2. el doc guardado declara un `scheduledStart` ANTERIOR a ese borde (⇒
 *      alguien con mejor información ya lo escribió entero).
 *
 * Solo (1) rompería un turno que legítimamente arranca a las 06:00: la ventana
 * anterior termina antes y no lo vería nunca. Solo (2) bloquearía las
 * correcciones en que Shoplogix atrasa el inicio de un turno de verdad.
 *
 * Ante cualquier duda (doc ausente, sin `scheduledStart`, error de lectura)
 * devuelve false → se escribe. Nunca deja de guardar un turno por precaución.
 */
async function isTruncatedHeadOfPrevWindow({ db, plantSlug, parentShiftDateKey, shiftId, scheduledStart, windowStart, logger }) {
  if (scheduledStart.getTime() > windowStart.getTime()) return false

  try {
    const snap = await db.doc(`shoplogix/${plantSlug}/shifts/${parentShiftDateKey}_${shiftId}`).get()
    if (!snap.exists) return false

    const raw = (snap.data() || {}).scheduledStart
    const storedStart = raw && typeof raw.toDate === 'function' ? raw.toDate()
      : raw instanceof Date ? raw
      : typeof raw === 'string' ? new Date(raw)
      : null
    if (!storedStart || Number.isNaN(storedStart.getTime())) return false

    // Ambos en wall-clock-as-UTC (lo guardado viene de estos mismos intervals).
    return storedStart.getTime() < windowStart.getTime()
  } catch (err) {
    logger.warn(`[syncDay][${plantSlug}] truncated-head-check err (${parentShiftDateKey} ${shiftId}): ${err.message}`)
    return false
  }
}

/**
 * ¿Este grupo de turno viene CORTADO por el borde final de la ventana, y ya
 * existe guardado en su forma completa?
 *
 * La ventana de un día va 08:00 → 08:00 del día siguiente. Si un turno arranca
 * ANTES de las 08:00 (caso real 03-ago: Filete y Yal partieron 07:45), sus
 * primeros intervals caen dentro de la ventana del día ANTERIOR ya etiquetados
 * con el nombre del turno del día siguiente. `deriveShiftGroups` los ve como un
 * turno propio y `shiftDateKeyFromStart` los manda al doc del día siguiente —
 * que ya contiene el turno ENTERO, escrito por su propia ventana.
 *
 * Sin este guard, el re-sync horario de "ayer" (que corre con `forceAll`, y por
 * eso ni siquiera el freeze lo detiene) pisaba el turno completo del día en
 * curso con ese fragmento de 15 minutos: Filete quedó con 4 ciclos en vez de
 * 2.406, y el freeze impedía después que el sync normal lo reparara.
 *
 * Regla (las dos condiciones son necesarias):
 *   1. el grupo termina en el borde de la ventana (⇒ está cortado ahí), y
 *   2. el doc guardado declara un `scheduledEnd` MÁS ALLÁ del borde (⇒ alguien
 *      con mejor información — la ventana del día siguiente — ya lo escribió).
 *
 * Solo (1) rompería un turno que legítimamente termina a las 08:00: la ventana
 * del día siguiente arranca justo ahí y no lo vería nunca. Solo (2) bloquearía
 * las correcciones retroactivas en que Shoplogix acorta un turno de verdad.
 *
 * Ante cualquier duda (doc ausente, sin `scheduledEnd`, error de lectura)
 * devuelve false → se escribe. Nunca deja de guardar un turno por precaución.
 */
async function isTruncatedTailOfNextWindow({ db, plantSlug, parentShiftDateKey, shiftId, scheduledEnd, windowEnd, logger }) {
  if (scheduledEnd.getTime() < windowEnd.getTime()) return false

  try {
    const snap = await db.doc(`shoplogix/${plantSlug}/shifts/${parentShiftDateKey}_${shiftId}`).get()
    if (!snap.exists) return false

    const raw = (snap.data() || {}).scheduledEnd
    const storedEnd = raw && typeof raw.toDate === 'function' ? raw.toDate()
      : raw instanceof Date ? raw
      : typeof raw === 'string' ? new Date(raw)
      : null
    if (!storedEnd || Number.isNaN(storedEnd.getTime())) return false

    // Ambos en wall-clock-as-UTC (lo guardado viene de estos mismos intervals).
    return storedEnd.getTime() > windowEnd.getTime()
  } catch (err) {
    logger.warn(`[syncDay][${plantSlug}] truncated-check err (${parentShiftDateKey} ${shiftId}): ${err.message}`)
    return false
  }
}

/**
 * Deriva el `dateKey` calendario (YYYY-MM-DD) al que pertenece un turno,
 * a partir de su `scheduledStart` real (wall-clock-as-UTC).
 *
 * Esto garantiza coherencia con la convención de Shoplogix UI: el turno se
 * archiva en el día en que arrancó, sin importar la ventana de consulta del
 * CF (que cubre 08:00→08:00 para captar también turnos que cruzan medianoche).
 *
 * Ejemplos:
 *   - T3 que arranca 00:00 del 13-may → dateKey "2026-05-13"
 *   - T3 que arranca 22:00 del 12-may (cruza medianoche) → dateKey "2026-05-12"
 *   - T2 que arranca 14:45 del 13-may → dateKey "2026-05-13"
 *
 * Sin esta función, todos los turnos asumen el dateKey de la ventana de
 * consulta — y un T3 que arranca 00:00 del día N se guardaba bajo dateKey N-1
 * porque la ventana del CF para N-1 va de 08:00 (N-1) → 08:00 (N).
 */
function shiftDateKeyFromStart(scheduledStart) {
  const y = scheduledStart.getUTCFullYear()
  const m = String(scheduledStart.getUTCMonth() + 1).padStart(2, '0')
  const d = String(scheduledStart.getUTCDate()).padStart(2, '0')
  return `${y}-${m}-${d}`
}

/**
 * Deriva turnos reales desde el campo `shift` de los intervalos de producción.
 * Retorna array ordenado por scheduledStart.
 *
 * Política: respetar lo que Shoplogix emite — incluye "Unscheduled" como un
 * "turno" más. Caso real Yal 2026-05-01: 624 cycles de producción real estaban
 * en intervals etiquetados "Unscheduled" mientras los turnos labeled tenían
 * 0 cycles. Si filtrábamos Unscheduled, descartábamos toda la producción.
 *
 * El nombre de cada turno se CANONIZA por su hora de inicio ("el histórico
 * manda" — ver canonicalShift.js): Shoplogix a veces etiqueta mal un turno
 * (caso real Yal 8-jul: madrugada 00:00 vino "Turno 1" cuando 20× previas fue
 * "Turno 3"). Se agrupa por el nombre canónico; el nombre crudo de Shoplogix se
 * conserva en `rawShiftId` para trazabilidad.
 *
 * @param {Array} machineProductionResponses — array de objetos raw de la API
 *   (uno por máquina), cada uno con `.machineProduction[]`.
 * @param {string} [plantSlug] — planta, para aplicar las reglas canónicas.
 * @returns {Array<{shiftId, rawShiftId, scheduledStart, scheduledEnd}>}
 */

/**
 * Enriquecimiento OPCIONAL con el rollup oficial de Shoplogix
 * (`type=whiteboard&rollup=1&areas=<area>&start=<instante>`), que es el mismo
 * endpoint que alimenta el whiteboard en vivo (confirmado inspeccionando el
 * tráfico real del navegador, 2026-07-16).
 *
 * Dos capas de horario que NO siempre coinciden y no hay que confundir:
 *   - `deriveShiftGroups` (arriba): ventana REAL derivada de los intervals
 *     de producción — cuándo la gente efectivamente trabajó. Es la fuente de
 *     verdad que ya usa toda la app para mostrar turnos históricos.
 *   - Este rollup: el CALENDARIO OFICIAL de Shoplogix (una plantilla fija de
 *     horarios de turno) + el target/expectedCycles oficial por máquina +
 *     el trabajo/especie en curso. Verificado que para fechas pasadas este
 *     endpoint puede devolver una ventana que NO es la que realmente se
 *     trabajó ese día (ej. dice "Turno 3 00:00→07:45" en un tramo que en los
 *     datos reales aparece como "Unscheduled" porque nadie producía), y para
 *     fechas lejanas puede traer targets en 0. Por eso NUNCA se usa para
 *     reconstruir turnos históricos ni se reintenta con backfill: se consulta
 *     una sola vez, "ahora" (`syncedAt`), únicamente cuando `syncDay` está
 *     sincronizando el día de HOY — momento en que este dato sí es fiable,
 *     porque describe el turno vigente en tiempo real.
 *
 * Falla en silencio (devuelve null): es un adorno informativo, nunca debe
 * tumbar el sync de producción real.
 *
 * @returns {Promise<{shiftLabel: string, targetsByMachineId: Map<string, number>,
 *   officialStart: Date, officialEnd: Date, currentJob: object|null} | null>}
 */
async function fetchOfficialRollup({ query, plantSlug, at, logger = console }) {
  const areaId = PLANT_AREA_ID[plantSlug]
  if (!areaId) return null
  try {
    const data = await query({
      type: 'whiteboard',
      params: { rollup: 1, areas: areaId, start: toShoplogixTime(at) },
    })
    const machineRows = (data?.machines || []).filter(m => m.machineid && m.machineid !== 'Total')
    if (!machineRows.length) return null

    const shiftLabel = machineRows[0].shift
    const targetsByMachineId = new Map(machineRows.map(m => [m.machineid, m.target]))
    const currentJobRaw = (data?.jobs || []).find(j => j.currentJob) || (data?.jobs || [])[0] || null

    /*
     * Contador VIVO del turno: el estado "Produciendo" (type Uptime) de cada
     * fila trae el acumulado real en `cycles` — el MISMO número que muestra el
     * whiteboard en la pantalla de planta (verificado contra la pantalla el
     * 13-08: rollup 3.850 = pantalla 3.850). Los buckets de 5 min siempre
     * corren un bucket detrás; este contador es el del instante de la consulta
     * y es lo que permite que el monitor "cuadre" con la pared sin requests
     * extra ni cambiar la frecuencia del sync.
     */
    const uptimeCycles = (row) => (row.states || [])
      .filter(s => s.type === 'Uptime')
      .reduce((a, s) => a + (s.cycles || 0), 0)
    const liveCyclesByMachineId = new Map(machineRows.map(m => [m.machineid, uptimeCycles(m)]))
    const totalRow = (data?.machines || []).find(m => m.machineid === 'Total')
    const liveTotalCycles = totalRow
      ? uptimeCycles(totalRow)
      : [...liveCyclesByMachineId.values()].reduce((a, b) => a + b, 0)

    return {
      shiftLabel,
      targetsByMachineId,
      liveCyclesByMachineId,
      liveTotalCycles,
      officialStart: parseShoplogixTime(machineRows[0].start),
      officialEnd:   parseShoplogixTime(machineRows[0].end),
      currentJob: currentJobRaw ? {
        name: currentJobRaw.name ?? null,
        jobMaxRunRate: currentJobRaw.jobMaxRunRate ?? null,
        productionQuantityExpected: currentJobRaw.productionQuantityExpected ?? null,
      } : null,
    }
  } catch (err) {
    if (err.code === 'AUTH_EXPIRED') throw err
    logger.warn(`[syncDay][${plantSlug}] rollup oficial no disponible (no bloquea): ${err.message}`)
    return null
  }
}

/**
 * ¿El horario oficial del rollup es coherente con la ventana real del turno?
 *
 * El rollup a veces entrega una plantilla con fechas de OTRO día (visto en
 * prod: officialEnd 2026-08-01 para un turno del 22-07, o corrido +1 día).
 * Guardar eso corrompe `officialSchedule` y cualquier cosa que lo consuma
 * (brief de fin de turno, chips de la UI). Regla: start y end oficiales deben
 * caer a ≤12h de sus pares derivados de intervals — margen de sobra para
 * horas extra o turnos cortados, pero mata los saltos de día/semana.
 *
 * Ambas fechas vienen en la misma escala (wall-clock-as-UTC), comparables
 * entre sí sin conversión.
 */
/**
 * Duración máxima creíble para un turno. Los reales rondan 7-9 h; el más largo
 * visto (Yal "Turno 2", 14:45→00:00) son 9,25 h. 16 h deja margen de sobra para
 * horas extra o turnos empalmados, y sigue muy por debajo de las ventanas
 * corruptas (22-23 h) que motivan este chequeo.
 */
const MAX_SHIFT_MS = 16 * 3600_000

/**
 * Resuelve la ventana del turno cuando la derivada de intervals es imposible.
 *
 * `deriveShiftGroups` toma el primer `start` y el último `end` de los intervals
 * que Shoplogix etiquetó con ese turno. Si Shoplogix re-etiqueta intervals de
 * OTRO turno —pasa: el 3-ago-2026 el "Turno 2" de Chonchi saltó de 3.333 a
 * 10.462 piezas 24 h después del cierre, y su ventana se estiró de 7,75 h a
 * 22,75 h— la envolvente queda absurda y se traga turnos vecinos enteros.
 *
 * Consecuencia real: al segmentar el Excel del Grader con esa ventana, las 6.526
 * piezas del turno de día quedaron fuera de todo turno y desaparecieron de los
 * KPIs sin ninguna señal.
 *
 * Ojo con el orden del razonamiento: `isOfficialScheduleSane` valida el horario
 * oficial CONTRA el derivado, asumiendo que el derivado es la verdad. Cuando el
 * corrupto es el derivado, esa comparación descarta el dato bueno. Por eso acá
 * el oficial se valida POR SÍ MISMO (duración creíble + mismo arranque), no
 * contra el derivado.
 *
 * Conservador a propósito: solo actúa si el derivado es imposible Y el oficial
 * es creíble. Sin oficial, o con un oficial igual de malo, se respeta el
 * derivado — el comportamiento de siempre.
 */
function resolveShiftWindow({ scheduledStart, scheduledEnd, officialStart, officialEnd }) {
  const sinCambio = { start: scheduledStart, end: scheduledEnd, corregida: false }

  const durDerivada = scheduledEnd.getTime() - scheduledStart.getTime()
  if (durDerivada > 0 && durDerivada <= MAX_SHIFT_MS) return sinCambio   // derivado creíble

  if (!(officialStart instanceof Date) || isNaN(officialStart.getTime())) return sinCambio
  if (!(officialEnd instanceof Date) || isNaN(officialEnd.getTime())) return sinCambio

  const durOficial = officialEnd.getTime() - officialStart.getTime()
  if (!(durOficial > 0 && durOficial <= MAX_SHIFT_MS)) return sinCambio  // oficial tampoco sirve

  // El oficial tiene que describir ESTE turno, no una plantilla de otro día: se
  // exige que arranque a menos de 12 h del inicio derivado (el inicio casi nunca
  // se corrompe — lo que se estira es el cierre, que es el último interval).
  if (Math.abs(officialStart.getTime() - scheduledStart.getTime()) > 12 * 3600_000) return sinCambio

  return {
    start: officialStart,
    end: officialEnd,
    corregida: true,
    motivo: `ventana derivada de intervals imposible (${(durDerivada / 3600_000).toFixed(1)} h): `
      + `se adopta el horario oficial (${(durOficial / 3600_000).toFixed(1)} h)`,
  }
}

function isOfficialScheduleSane({ officialStart, officialEnd, scheduledStart, scheduledEnd }) {
  const MAX_DRIFT_MS = 12 * 3600_000
  if (!(officialStart instanceof Date) || isNaN(officialStart.getTime())) return false
  if (!(officialEnd   instanceof Date) || isNaN(officialEnd.getTime()))   return false
  if (officialEnd.getTime() <= officialStart.getTime()) return false
  return Math.abs(officialStart.getTime() - scheduledStart.getTime()) <= MAX_DRIFT_MS
      && Math.abs(officialEnd.getTime()   - scheduledEnd.getTime())   <= MAX_DRIFT_MS
}

function deriveShiftGroups(machineProductionResponses, plantSlug) {
  // Usar la primera máquina que tenga intervalos (todas deberían tener los mismos shifts)
  const firstWithIntervals = machineProductionResponses.find(r => r?.machineProduction?.length > 0)
  if (!firstWithIntervals) return []

  // 1. Agrupar por el nombre RAW de Shoplogix (el turno tal como viene) Y por
  //    CONTINUIDAD TEMPORAL. CLAVE:
  //
  //    a) NO canonizar por interval — el "Turno 2" de Yal va 14:45→00:00 y sus
  //       intervals de las 22:00+ caerían en el rango "madrugada" y partirían
  //       el turno en dos. Se agrupa por el turno completo y se canoniza después.
  //
  //    b) NO agrupar SOLO por nombre — desde que la ventana empieza a las 06:00,
  //       una misma consulta puede ver el "Turno 2" de ayer Y el de hoy. Con la
  //       clave puesta solo en el string, los dos colapsaban en un grupo de 24 h
  //       y el doc de ayer se quedaba con los ciclos de hoy (caso real
  //       `2026-08-04_Turno 2`). Un hueco grande entre intervals del mismo
  //       nombre significa que son turnos de días distintos.
  const perShift = {}
  for (const iv of firstWithIntervals.machineProduction) {
    if (!iv.shift) continue          // sin etiqueta = no hay turno, descartable
    const runs = perShift[iv.shift] || (perShift[iv.shift] = [])
    const cur = runs[runs.length - 1]
    if (!cur) {
      runs.push({ first: iv, last: iv })
      continue
    }
    const gapMs = parseShoplogixTime(iv.start).getTime() - parseShoplogixTime(cur.last.end).getTime()
    if (gapMs > SAME_SHIFT_MAX_GAP_MS) {
      runs.push({ first: iv, last: iv })   // otro turno con el mismo nombre
    } else {
      cur.last = iv
    }
  }

  // 2. Canonizar el nombre de cada tramo por su hora de INICIO. Dos tramos que
  //    colapsan al mismo canónico se fusionan SOLO si son el mismo turno: se
  //    los distingue por el día en que arrancan, que es lo que decide en qué
  //    doc terminan (`shiftDateKeyFromStart`).
  const byCanon = {}
  for (const [rawShiftId, runs] of Object.entries(perShift)) {
    for (const g of runs) {
      const scheduledStart = parseShoplogixTime(g.first.start)
      const canon = canonicalShiftName(plantSlug, scheduledStart, rawShiftId)
      const key = `${canon}__${shiftDateKeyFromStart(scheduledStart)}`
      if (!byCanon[key]) {
        byCanon[key] = { shiftId: canon, first: g.first, last: g.last, rawShiftId }
      } else {
        if (parseShoplogixTime(g.first.start).getTime() < parseShoplogixTime(byCanon[key].first.start).getTime()) byCanon[key].first = g.first
        if (parseShoplogixTime(g.last.end).getTime()   > parseShoplogixTime(byCanon[key].last.end).getTime())   byCanon[key].last  = g.last
      }
    }
  }

  return Object.values(byCanon)
    .map(({ shiftId, first, last, rawShiftId }) => ({
      shiftId,
      // rawShiftId != shiftId solo cuando se corrigió una anomalía de Shoplogix.
      rawShiftId,
      scheduledStart: parseShoplogixTime(first.start),
      scheduledEnd:   parseShoplogixTime(last.end),
    }))
    .sort((a, b) => a.scheduledStart.getTime() - b.scheduledStart.getTime())
}

/**
 * Determina el dateKey para el sync actual.
 *
 * Ancla en 08:00 Chile (igual que fullDayWindow): si son las 00:00-07:59
 * Chile, el "día de sync" es ayer. Esto garantiza que turnos que cruzan
 * medianoche (Yal Turno 3: 00:00→~07:00) caigan en la ventana correcta.
 * Sin este ajuste, a las 02:00 Chile se intentaría sincronizar "hoy" cuya
 * ventana empieza en 08:00 → los intervalos del Turno 3 quedarían fuera
 * de la ventana y el turno aparecería vacío.
 *
 * Usa `toChileWall` (DST-aware): con el offset -3 fijo de antes, en invierno
 * (UTC-4) el cambio de día ocurría a las 07:00 REALES y la franja 07:00-08:00
 * wall del día anterior nunca se volvía a sincronizar (cola de turnos
 * nocturnos perdida en silencio).
 */
function currentDateKey(now = new Date()) {
  const chileNow = toChileWall(now)
  const minutesOfDay = chileNow.getUTCHours() * 60 + chileNow.getUTCMinutes()
  // Antes de las 08:00 Chile → el "día de sync" es el día anterior
  const dateRef = minutesOfDay < 8 * 60
    ? new Date(chileNow.getTime() - 24 * 3600 * 1000)
    : chileNow
  const y = dateRef.getUTCFullYear()
  const m = String(dateRef.getUTCMonth() + 1).padStart(2, '0')
  const d = String(dateRef.getUTCDate()).padStart(2, '0')
  return `${y}-${m}-${d}`
}

/**
 * Determina dateKey + shiftId para "ahora mismo" (legado, para syncShift).
 */
function currentShiftKey(now = new Date()) {
  const ctx = currentShift(now)
  if (!ctx) return null
  const chileNow = toChileWall(now)
  // Madrugada del turno noche → el turno pertenece al día ANTERIOR. Derivar
  // año/mes/día completos del Date desplazado (antes solo se recalculaba el
  // día y en la madrugada del 1° de mes salía "2026-08-31" en vez de
  // "2026-07-31" — hasta el año quedaba mal cada 1° de enero).
  const dateRef = ctx.shiftId === 'Turno noche' && chileNow.getUTCHours() < 7
    ? new Date(chileNow.getTime() - 24 * 3600 * 1000)
    : chileNow
  const year = dateRef.getUTCFullYear()
  const month = dateRef.getUTCMonth() + 1
  const dateKey = `${year}-${String(month).padStart(2, '0')}-${String(dateRef.getUTCDate()).padStart(2, '0')}`
  return { dateKey, shiftId: ctx.shiftId }
}

// ── syncDay (nuevo) ───────────────────────────────────────────────────────────

/**
 * Sync de un día completo — detecta turnos reales desde intervals.shift.
 *
 * Ventajas sobre syncShift:
 *   - No hardcodea ventanas de turno (funciona para 2 o 3 turnos).
 *   - shiftStart/End correctos (no los bounds de consulta).
 *   - States filtrados al rango real del turno.
 *   - Doc IDs reflejan nombres reales de Shoplogix ("Turno 1", "Turno 2", etc.)
 *
 * @param {object} opts
 * @param {import('firebase-admin/firestore').Firestore} opts.db
 * @param {string} [opts.accessToken] — Bearer OAuth
 * @param {string} [opts.cookie]      — Cookie legado
 * @param {string} [opts.plantSlug]   — 'chonchi' | 'yal'
 * @param {string} [opts.dateKey]     — "YYYY-MM-DD"; default: hoy en Chile
 * @param {boolean} [opts.forceAll]   — reescribe también los turnos ya congelados.
 *   Necesario en los re-sync de días pasados (auto-corrección de etiquetado
 *   retroactivo de Shoplogix) y en backfills manuales: ahí TODOS los turnos están
 *   cerrados, y sin este flag el freeze los saltearía a todos y la corrección
 *   nunca llegaría a la app.
 * @param {function} [opts.logger]
 */
async function syncDay({ db, accessToken, cookie, plantSlug = 'chonchi', dateKey, forceAll = false, logger = console }) {
  if (!accessToken && !cookie) throw new Error('[syncDay] se requiere accessToken (Bearer) o cookie (legacy)')

  const machines = PLANT_MACHINES[plantSlug]
  if (!machines) throw new Error(`[syncDay] plantSlug desconocido: "${plantSlug}"`)

  const query = accessToken
    ? (opts) => queryShoplogixBearer({ accessToken, ...opts })
    : (opts) => queryShoplogix({ cookie, ...opts })

  if (!dateKey) {
    // Fuera de turno: igual sincronizamos el día actual para capturar data
    // de shifts que ya empezaron o están por empezar.
    dateKey = currentDateKey()
  }

  const window = fullDayWindow(dateKey)
  logger.info(`[shoplogix-syncDay][${plantSlug}] ${dateKey} (${window.start}→${window.end})`)

  const syncedAt = new Date()

  // 1. Fetch production (full-day) para todas las máquinas
  const productionResponses = []
  const summaryResponses    = []

  for (const machine of machines) {
    try {
      const prod = await query({
        type: 'whiteboardproduction',
        params: { machines: machine.machineid, start: window.start, end: window.end, minutes: 5 },
      })
      productionResponses.push(prod?.machines?.[0] ?? null)
    } catch (err) {
      if (err.code === 'AUTH_EXPIRED') throw err
      logger.warn(`[syncDay][${plantSlug}] ${machine.name} production err: ${err.message}`)
      productionResponses.push(null)
    }
    await pauseBetweenMachines()

    try {
      const summ = await query({
        type: 'whiteboardsummary',
        params: { machines: machine.machineid, start: window.start, end: window.end },
      })
      summaryResponses.push(summ?.machines?.[0] ?? null)
    } catch (err) {
      if (err.code === 'AUTH_EXPIRED') throw err
      logger.warn(`[syncDay][${plantSlug}] ${machine.name} summary err: ${err.message}`)
      summaryResponses.push(null)
    }
    await pauseBetweenMachines()
  }

  // 2. Derivar grupos de turno reales
  const shiftGroups = deriveShiftGroups(productionResponses, plantSlug)

  // 2.1 Rollup oficial de Shoplogix — SOLO cuando se sincroniza el día de HOY
  // (nunca en backfill/re-sync de días pasados: ver comentario en
  // fetchOfficialRollup sobre por qué no es fiable para reconstruir historia).
  // Al ser "ahora", describe el turno vigente — se adjunta al grupo cuyo
  // shiftId coincide con la etiqueta que reporta el rollup.
  const officialRollup = (dateKey === currentDateKey())
    // Hora de PLANTA, no UTC: Shoplogix lee el `start` como hora local. Mandarle
    // `syncedAt` crudo preguntaba 4 h en el futuro y devolvia la ficha del turno
    // siguiente en cero — por eso `shoplogixLive` se congelaba al cruzar el
    // borde de cada turno.
    ? await fetchOfficialRollup({ query, plantSlug, at: ahoraEnPlanta(syncedAt), logger })
    : null

  if (shiftGroups.length === 0) {
    logger.info(`[shoplogix-syncDay][${plantSlug}] ${dateKey}: sin turnos detectados (sin datos aún)`)
    return { plantSlug, dateKey, shiftGroups: [] }
  }

  logger.info(
    `[shoplogix-syncDay][${plantSlug}] ${dateKey}: ${shiftGroups.length} turno(s) detectados: ` +
    shiftGroups.map(g => `${g.shiftId} (${toShoplogixTime(g.scheduledStart)}→${toShoplogixTime(g.scheduledEnd)})`).join(', '),
  )

  const allShiftResults = []
  const frozenSkipped = []
  const truncatedSkipped = []
  const windowEnd = parseShoplogixTime(window.end)
  const windowStart = parseShoplogixTime(window.start)

  // 3. Por cada turno: filtrar intervals + normalize + escribir
  for (const group of shiftGroups) {
    // Ventana imposible por re-etiquetado de Shoplogix → adoptar el horario
    // oficial (ver resolveShiftWindow). Va PRIMERO: el freeze-check, los filtros
    // de intervals, los aggregates y el doc leen todos `group.scheduled*`, así
    // que corregir acá arregla el turno completo en vez de parchar cada uso.
    const oficialDeEsteTurno = officialRollup && officialRollup.shiftLabel === group.shiftId
      ? officialRollup
      : null
    const ventana = resolveShiftWindow({
      scheduledStart: group.scheduledStart,
      scheduledEnd:   group.scheduledEnd,
      officialStart:  oficialDeEsteTurno?.officialStart,
      officialEnd:    oficialDeEsteTurno?.officialEnd,
    })
    if (ventana.corregida) {
      logger.warn(
        `[syncDay][${plantSlug}] ${group.shiftId}: ${ventana.motivo} `
        + `(${toShoplogixTime(group.scheduledStart)}→${toShoplogixTime(group.scheduledEnd)} ⇒ `
        + `${toShoplogixTime(ventana.start)}→${toShoplogixTime(ventana.end)})`,
      )
      group.scheduledStart = ventana.start
      group.scheduledEnd = ventana.end
      group.ventanaCorregida = ventana.motivo
    }

    // dateKey del doc = día calendario donde ARRANCA el turno (ver nota extensa
    // más abajo, junto al armado del doc de máquina).
    const parentShiftDateKey = shiftDateKeyFromStart(group.scheduledStart)

    // Cola cortada por el borde de la ventana, con el turno completo ya guardado
    // por la ventana del día siguiente → no degradarlo. OJO: va ANTES del check
    // de freeze y NO respeta `forceAll` — el re-sync de días pasados corre
    // justamente con forceAll, y es el que provocaba el pisotón.
    if (await isTruncatedHeadOfPrevWindow({
      db, plantSlug, parentShiftDateKey, shiftId: group.shiftId,
      scheduledStart: group.scheduledStart, windowStart, logger,
    })) {
      truncatedSkipped.push(`${parentShiftDateKey} ${group.shiftId} (cabeza)`)
      allShiftResults.push({ shiftId: group.shiftId, skipped: 'truncated-head' })
      continue
    }

    if (await isTruncatedTailOfNextWindow({
      db, plantSlug, parentShiftDateKey, shiftId: group.shiftId,
      scheduledEnd: group.scheduledEnd, windowEnd, logger,
    })) {
      truncatedSkipped.push(`${parentShiftDateKey} ${group.shiftId}`)
      allShiftResults.push({ shiftId: group.shiftId, skipped: 'truncated-tail' })
      continue
    }

    // Turno cerrado y ya capturado en su forma final → no reescribir.
    // OJO escalas de tiempo: `group.scheduledEnd` viene en wall-clock-as-UTC
    // (hora Chile "disfrazada" de UTC, como todo lo derivado de intervals),
    // pero `syncedAt` y el `lastSyncAt` del doc son UTC REALES. Convertir el
    // cierre a UTC real antes de comparar: sin esto `closedForMs` queda
    // inflado en +3/4h (offset Chile) > gracia de 2h, y un turno EN CURSO se
    // "congela" tras su primera escritura (bug 19-07: vista en vivo muerta
    // mientras Shoplogix seguía entregando datos).
    const scheduledEndReal = new Date(
      group.scheduledEnd.getTime() + chileUtcOffsetHours(syncedAt) * 3600_000,
    )
    if (!forceAll && await isShiftAlreadyFrozen({
      db, plantSlug, parentShiftDateKey, shiftId: group.shiftId,
      scheduledEnd: scheduledEndReal, now: syncedAt, logger,
    })) {
      frozenSkipped.push(`${parentShiftDateKey} ${group.shiftId}`)
      allShiftResults.push({ shiftId: group.shiftId, skipped: 'frozen' })
      continue
    }

    const shiftMachineResults = []
    // Ventana EFECTIVA del turno: primer→último estado `uptime` entre TODAS las
    // máquinas ("primer pescado que pasó" → último). Distinta del horario
    // programado (scheduledStart/End): si el turno arranca 14:45 pero la línea
    // procesó recién a las 15:20, effectiveStart = 15:20. Viaja en el doc padre
    // para que la vista mensual la muestre sin bajar la subcolección `machines`.
    let effectiveStartMs = null
    let effectiveEndMs = null

    for (let i = 0; i < machines.length; i++) {
      const rawProd = productionResponses[i]
      const rawSumm = summaryResponses[i]

      if (!rawProd || !rawSumm) {
        shiftMachineResults.push({ machineid: machines[i].machineid, status: 'empty' })
        continue
      }

      try {
        // Filtrar intervals al turno por VENTANA TEMPORAL (no por etiqueta shift).
        //
        // Histórico: antes filtrábamos por `iv.shift === group.shiftId`. Eso falla
        // cuando Shoplogix etiqueta inconsistentemente las máquinas — caso real
        // 2026-04-29 T3 Yal: M1 tenía sus intervals 01:25-07:35 etiquetados
        // "Turno 3" correctamente, pero M2/M3 tenían sus 05:00-07:35 etiquetados
        // con otro shift (o "Unscheduled") y al mismo tiempo unos intervals de la
        // tarde Apr-28 (13:15-15:35) mal etiquetados como "Turno 3". Resultado:
        // se descartaba lo bueno y guardábamos basura.
        //
        // M1 (la primera máquina con datos) es la fuente de verdad para los
        // bounds del turno via deriveShiftGroups. Ahora filtramos por solapamiento
        // temporal con [scheduledStart, scheduledEnd] usando una tolerancia de
        // 5 min (un bucket) para incluir el primer/último que arranque justo
        // antes/después del bound exacto.
        const TOLERANCE_MS = 5 * 60 * 1000
        const groupStartMs = group.scheduledStart.getTime() - TOLERANCE_MS
        const groupEndMs   = group.scheduledEnd.getTime()   + TOLERANCE_MS

        // EXCEPCIÓN — grupo "Unscheduled": filtrar por ETIQUETA, no por ventana.
        //
        // El grupo Unscheduled abarca del primer al último interval sin turno
        // del día; cuando la planta está ociosa al inicio Y al final de la
        // ventana (caso típico), sus bounds ABRAZAN toda la ventana y el filtro
        // temporal se tragaba también los intervals etiquetados de los turnos
        // reales de en medio → DOBLE CONTEO garantizado (caso real Yal
        // 2026-07-06: doc Unscheduled con 35.510 ciclos = Turno 2 20.4k +
        // Turno 3 15.5k duplicados; el 2026-07-02 igual: 8.181 ≈ el mismo
        // Turno 2 de 8.169). Para turnos NOMBRADOS el filtro temporal sigue
        // siendo necesario (etiquetado inconsistente entre máquinas, ver
        // arriba); para Unscheduled la etiqueta es exacta por definición.
        const isUnscheduledGroup = group.shiftId === 'Unscheduled'
        const filteredProd = {
          ...rawProd,
          machineProduction: (rawProd.machineProduction || [])
            .filter(iv => {
              if (!iv.start) return false
              if (isUnscheduledGroup) return iv.shift === 'Unscheduled'
              const ivStartMs = parseShoplogixTime(iv.start).getTime()
              return ivStartMs >= groupStartMs && ivStartMs <= groupEndMs
            }),
          comments: filterCommentsToWindow(rawProd.comments, groupStartMs, groupEndMs),
        }

        // `rawSumm.comments` sufre el mismo problema que `machineProduction` sin
        // filtrar: es la respuesta del DÍA COMPLETO, reusada para cada turno
        // detectado ese día. Sin este filtro, comentarios de un turno vecino
        // (incluso del día siguiente) quedaban guardados en este turno.
        const filteredSumm = {
          ...rawSumm,
          comments: filterCommentsToWindow(rawSumm.comments, groupStartMs, groupEndMs),
        }

        // dateKey del doc = día calendario donde ARRANCA el turno (no la ventana
        // de consulta del CF). Esto garantiza coherencia con Shoplogix UI:
        //
        //   - T3 que arranca 00:00 del 13-may → shiftDateKey "2026-05-13"
        //   - T3 que arranca 22:00 del 12-may → shiftDateKey "2026-05-12"
        //
        // Sin esto, el T3 que arranca 00:00 del día N se guardaba bajo dateKey
        // N-1 porque la ventana de consulta del CF para N-1 cubre 08:00 (N-1)
        // → 08:00 (N), entonces el T3 0-7:45 del día N caía dentro.
        // El frontend al consultar "T3 del 13" no lo encontraba (estaba bajo
        // dateKey=12) y caía al fallback Unscheduled, mostrando data falsa.
        const shiftDateKey = parentShiftDateKey

        const doc = normalizeShift({
          production:    filteredProd,
          summary:       filteredSumm,
          dateKey:       shiftDateKey,
          shiftId:       group.shiftId,
          shiftStartAt:  group.scheduledStart,
          shiftEndAt:    group.scheduledEnd,
          syncedAt,
          scheduleSource: 'intervals',
        })

        // ── Capa 1: validación de calidad post-sync (no bloquea) ──────────────
        // Detecta si algún interval quedó fuera de la ventana del turno — síntoma
        // de filtrado incorrecto o timezone bug. Se adjunta `dataQualityIssues` al
        // doc para que el cliente y los dashboards puedan mostrar una advertencia.
        // Se calcula siempre: si no hay problema queda [] y limpia issues previos.
        //
        // Va DENTRO del mismo `.set()` que el doc: antes era un segundo `.set()`
        // sobre el mismo ref, lo que duplicaba los writes de todo el sync.
        // `null` = el chequeo no pudo correr → se OMITE el campo del `.set({merge:true})`
        // y el valor previo queda intacto. `[]` = corrió y no encontró problemas → limpia
        // los issues anteriores. Pisar con `[]` en caso de error borraría un diagnóstico válido.
        let dataQualityIssues = []
        try {
          const VAL_TOL_MS = 5 * 60_000
          const winLo = group.scheduledStart.getTime() - VAL_TOL_MS
          const winHi = group.scheduledEnd.getTime()   + VAL_TOL_MS
          const outOfWindow = (doc.intervals || []).filter(iv => {
            const ts = iv.startAt instanceof Date ? iv.startAt.getTime() : new Date(iv.startAt).getTime()
            return ts < winLo || ts > winHi
          })
          // Mismo chequeo para states: aunque ahora se recortan (clipStateToWindow)
          // al límite del turno, un state que aparezca con startAt/endAt fuera de
          // [winLo,winHi] delata un bug de filtrado/timezone que el clip no cubre
          // (ej. shiftStart/shiftEnd mal calculados). Antes de este cambio esta
          // duplicación era invisible: solo se validaban intervals, nunca states.
          const statesOutOfWindow = (doc.states || []).filter(s => {
            const startTs = s.startAt instanceof Date ? s.startAt.getTime() : new Date(s.startAt).getTime()
            const endTs   = s.endAt   instanceof Date ? s.endAt.getTime()   : new Date(s.endAt).getTime()
            return startTs < winLo || endTs > winHi
          })
          if (outOfWindow.length > 0) {
            dataQualityIssues.push(`${outOfWindow.length}/${(doc.intervals || []).length} intervals fuera de ventana (${toShoplogixTime(group.scheduledStart)}→${toShoplogixTime(group.scheduledEnd)})`)
          }
          if (statesOutOfWindow.length > 0) {
            dataQualityIssues.push(`${statesOutOfWindow.length}/${(doc.states || []).length} states fuera de ventana (${toShoplogixTime(group.scheduledStart)}→${toShoplogixTime(group.scheduledEnd)})`)
          }
          if (dataQualityIssues.length > 0) {
            logger.warn(`[syncDay][${plantSlug}] QUALITY ${machines[i].name}: ${dataQualityIssues.join(' · ')}`)
          }
        } catch (qErr) {
          logger.warn(`[syncDay][${plantSlug}] quality-check err (${machines[i].name}): ${qErr.message}`)
          dataQualityIssues = null   // no pisar los issues previos
        }

        const ref = db.doc(
          `shoplogix/${plantSlug}/shifts/${shiftDateKey}_${group.shiftId}/machines/${machines[i].machineid}`,
        )
        await ref.set(
          dataQualityIssues === null ? doc : { ...doc, dataQualityIssues },
          { merge: true },
        )

        // Agregados por máquina → doc padre. Permiten que la vista mensual
        // resuelva uptime / OEE / pareto de paros leyendo SOLO los docs padre
        // (1 query de rango), sin bajar las subcolecciones `machines` de cada
        // turno. Los `states[]` completos siguen en la subcolección y se cargan
        // solo al abrir un día concreto (timeline).
        for (const st of doc.states) {
          if (st.type !== 'uptime') continue
          const sMs = st.startAt instanceof Date ? st.startAt.getTime() : new Date(st.startAt).getTime()
          const eMs = st.endAt   instanceof Date ? st.endAt.getTime()   : new Date(st.endAt).getTime()
          if (!isFinite(sMs) || !isFinite(eMs)) continue
          if (effectiveStartMs === null || sMs < effectiveStartMs) effectiveStartMs = sMs
          if (effectiveEndMs   === null || eMs > effectiveEndMs)   effectiveEndMs   = eMs
        }

        shiftMachineResults.push({
          machineid:   machines[i].machineid,
          name:        machines[i].name,
          status:      'ok',
          intervals:   doc.intervals.length,
          states:      doc.states.length,
          totalCycles: doc.totalCycles,
          uptimeSec:           doc.shiftRuntimeBreakdown.uptimeSec,
          shiftRuntime:        doc.shiftRuntime,
          overallRatio:        doc.overallRatio,
          expectedTotalCycles: doc.expectedTotalCycles,
          breakdown:           doc.shiftRuntimeBreakdown,
          stateAggregates:     aggregateStatesByReason(doc.states),
        })
      } catch (err) {
        logger.warn(`[syncDay][${plantSlug}] ${machines[i].name} normalizer err: ${err.message}`)
        shiftMachineResults.push({ machineid: machines[i].machineid, status: 'error', error: err.message })
      }
    }

    // Metadata del doc padre del turno — `parentShiftDateKey` ya se calculó
    // arriba (freeze check); reusarlo evita una segunda derivación divergente.
    const parentDoc = {
      parentSchemaVersion: PARENT_SCHEMA_VERSION,
      dateKey:        parentShiftDateKey,
      shiftId:        group.shiftId,
      // Nombre crudo de Shoplogix (para trazabilidad); != shiftId solo cuando se
      // corrigió una anomalía de etiquetado (ver canonicalShift.js).
      rawShiftId:     group.rawShiftId ?? group.shiftId,
      scheduledStart: group.scheduledStart,
      scheduledEnd:   group.scheduledEnd,
      // 'official-corregido' deja rastro de que esta ventana NO salió de los
      // intervals: sin esto, un turno corregido es indistinguible de uno normal
      // y el próximo que investigue vuelve a perder el rato.
      scheduleSource: group.ventanaCorregida ? 'official-corregido' : 'intervals',
      ...(group.ventanaCorregida ? { ventanaCorregida: group.ventanaCorregida } : {}),
      lastSyncAt:     syncedAt,
      machines:       shiftMachineResults,
      // Ventana efectiva de producción (primer/último uptime real). Null si el
      // turno no procesó nada (solo idle) — la UI degrada al horario programado.
      effectiveStart: effectiveStartMs !== null ? new Date(effectiveStartMs) : null,
      effectiveEnd:   effectiveEndMs   !== null ? new Date(effectiveEndMs)   : null,
    }

    // Enriquecimiento con el rollup oficial: solo si su etiqueta de turno
    // coincide con ESTE grupo (el rollup describe un único turno vigente por
    // consulta; ver fetchOfficialRollup). additivo — nunca reemplaza
    // scheduledStart/End derivados de intervals reales.
    if (officialRollup && officialRollup.shiftLabel === group.shiftId) {
      // Horario oficial solo si pasa el sanity-check (ver isOfficialScheduleSane):
      // el rollup a veces trae plantillas con fechas de otro día y guardarlas
      // corrompe el doc. Targets/especie no muestran esa corrupción → siguen
      // guardándose siempre.
      if (isOfficialScheduleSane({
        officialStart:  officialRollup.officialStart,
        officialEnd:    officialRollup.officialEnd,
        scheduledStart: group.scheduledStart,
        scheduledEnd:   group.scheduledEnd,
      })) {
        parentDoc.officialSchedule = {
          start: officialRollup.officialStart,
          end:   officialRollup.officialEnd,
        }
        /*
         * El contador VIVO solo cuando la ventana del rollup es la de ESTE
         * turno. ⚠ Pasado el cierre, Shoplogix devuelve la plantilla del turno
         * del DÍA SIGUIENTE con el MISMO nombre y 0 ciclos: como el gate de
         * arriba compara solo etiquetas, el 0 pisaba el último valor bueno
         * justo durante la hora extra (visto el 13-08 en Filete, 15:34).
         * `isOfficialScheduleSane` ya mata los saltos de día — reusarlo acá es
         * lo que hace que el contador conserve el último dato real.
         */
        parentDoc.officialLive = {
          totalCycles: officialRollup.liveTotalCycles ?? null,
          byMachineId: Object.fromEntries(officialRollup.liveCyclesByMachineId ?? []),
          at: syncedAt,
        }
      } else {
        logger.warn(
          `[syncDay][${plantSlug}] officialSchedule del rollup descartado por incoherente ` +
          `(${toShoplogixTime(officialRollup.officialStart)}→${toShoplogixTime(officialRollup.officialEnd)} ` +
          `vs turno ${toShoplogixTime(group.scheduledStart)}→${toShoplogixTime(group.scheduledEnd)})`,
        )
      }
      parentDoc.officialTargetsByMachineId = Object.fromEntries(officialRollup.targetsByMachineId)
      parentDoc.currentJob = officialRollup.currentJob
      parentDoc.officialSyncedAt = syncedAt
    }

    await db.doc(`shoplogix/${plantSlug}/shifts/${parentShiftDateKey}_${group.shiftId}`).set(parentDoc, { merge: true })

    allShiftResults.push({ shiftId: group.shiftId, machines: shiftMachineResults })
    logger.info(`[shoplogix-syncDay][${plantSlug}] ${parentShiftDateKey} ${group.shiftId} OK (window dateKey=${dateKey})`, { machines: shiftMachineResults })
  }

  if (frozenSkipped.length > 0) {
    logger.info(`[shoplogix-syncDay][${plantSlug}] ${frozenSkipped.length} turno(s) congelados, sin reescribir: ${frozenSkipped.join(', ')}`)
  }
  if (truncatedSkipped.length > 0) {
    logger.info(`[shoplogix-syncDay][${plantSlug}] ${truncatedSkipped.length} cola(s) cortadas en el borde de la ventana, sin pisar el turno completo: ${truncatedSkipped.join(', ')}`)
  }

  return {
    plantSlug, dateKey,
    shiftGroups: shiftGroups.map(g => g.shiftId),
    results: allShiftResults,
    frozenSkipped: frozenSkipped.length,
    truncatedSkipped: truncatedSkipped.length,
  }
}

// ── syncShift (legado) ────────────────────────────────────────────────────────

/**
 * Sync de un turno específico con ventana hardcodeada (legado).
 * Conservado para backward compat con el trigger HTTP cuando se pasa shiftId.
 * Para sync regular usar syncDay.
 */
async function syncShift({ db, accessToken, cookie, plantSlug = 'chonchi', dateKey, shiftId, logger = console }) {
  if (!accessToken && !cookie) throw new Error('[sync] se requiere accessToken (Bearer) o cookie (legacy)')

  const machines = PLANT_MACHINES[plantSlug]
  if (!machines) throw new Error(`[sync] plantSlug desconocido: "${plantSlug}"`)

  const query = accessToken
    ? (opts) => queryShoplogixBearer({ accessToken, ...opts })
    : (opts) => queryShoplogix({ cookie, ...opts })

  let key = { dateKey, shiftId }
  if (!key.dateKey || !key.shiftId) {
    const current = currentShiftKey()
    if (!current) {
      logger.info('[shoplogix-sync] Fuera de turno, skip')
      return { skipped: true, reason: 'outside-shift' }
    }
    key = current
  }

  const window = shiftWindow(key.dateKey, key.shiftId)
  logger.info(`[shoplogix-sync][${plantSlug}] (legado) ${key.dateKey} ${key.shiftId} (${window.start}→${window.end})`)

  const results = []
  const syncedAt = new Date()

  for (const machine of machines) {
    try {
      const production = await query({
        type: 'whiteboardproduction',
        params: { machines: machine.machineid, start: window.start, end: window.end, minutes: 5 },
      })

      await pauseBetweenMachines()

      const summary = await query({
        type: 'whiteboardsummary',
        params: { machines: machine.machineid, start: window.start, end: window.end },
      })

      const prodMachine = production?.machines?.[0]
      const sumMachine  = summary?.machines?.[0]

      if (!prodMachine || !sumMachine) {
        logger.warn(`[shoplogix-sync][${plantSlug}] ${machine.name}: respuesta vacía`)
        results.push({ machineid: machine.machineid, status: 'empty' })
        continue
      }

      const queryStart = parseShoplogixTime(window.start)
      const queryEnd   = parseShoplogixTime(window.end)

      const doc = normalizeShift({
        production:   prodMachine,
        summary:      sumMachine,
        dateKey:      key.dateKey,
        shiftId:      key.shiftId,
        shiftStartAt: queryStart,
        shiftEndAt:   queryEnd,
        syncedAt,
        scheduleSource: 'legacy',
      })

      const ref = db.doc(
        `shoplogix/${plantSlug}/shifts/${key.dateKey}_${key.shiftId}/machines/${machine.machineid}`,
      )
      await ref.set(doc, { merge: true })

      results.push({
        machineid: machine.machineid,
        name: machine.name,
        status: 'ok',
        intervals: doc.intervals.length,
        states: doc.states.length,
        totalCycles: doc.totalCycles,
      })
    } catch (err) {
      if (err.code === 'AUTH_EXPIRED') {
        logger.error(`[shoplogix-sync][${plantSlug}] AUTH_EXPIRED — aborta sync`, { err: err.message })
        throw err
      }
      logger.error(`[shoplogix-sync][${plantSlug}] ${machine.name} error`, { err: err.message })
      results.push({ machineid: machine.machineid, status: 'error', error: err.message })
    }

    await pauseBetweenMachines()
  }

  await db.doc(`shoplogix/${plantSlug}/shifts/${key.dateKey}_${key.shiftId}`).set({
    dateKey:   key.dateKey,
    shiftId:   key.shiftId,
    lastSyncAt: syncedAt,
    machines:  results,
  }, { merge: true })

  logger.info(`[shoplogix-sync][${plantSlug}] Fin ${key.dateKey} ${key.shiftId}`, { results })
  return { plantSlug, dateKey: key.dateKey, shiftId: key.shiftId, syncedAt, results }
}

module.exports = {
  ACTIVE_PLANTS,
  CLOSED_SHIFT_GRACE_MS,
  PARENT_SCHEMA_VERSION,
  aggregateStatesByReason,
  shiftWindow,
  fullDayWindow,
  deriveShiftGroups,
  fetchOfficialRollup,
  isOfficialScheduleSane,
  resolveShiftWindow,
  MAX_SHIFT_MS,
  shiftDateKeyFromStart,
  currentShiftKey,
  currentDateKey,
  isShiftAlreadyFrozen,
  isTruncatedTailOfNextWindow,
  isTruncatedHeadOfPrevWindow,
  syncDay,
  syncShift,
}
