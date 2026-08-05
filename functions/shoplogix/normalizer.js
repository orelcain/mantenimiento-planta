/**
 * Normalizer Shoplogix → schema Firestore.
 *
 * Mirror del normalizer TS en apps/pwa/src/services/shoplogix/shoplogixNormalizer.ts.
 * Diferencia: escribimos timestamps como Firestore Timestamp-ready (Date),
 * mientras que el TS devuelve Date para consumo directo en el browser.
 *
 * El doc final va a:
 *   shoplogix/chonchi/shifts/{dateKey}_{shiftId}/machines/{machineid}
 */

const { parseShoplogixTime } = require('./time')
const { CHONCHI_EVISCERADORAS, YAL_EVISCERADORAS, CHONCHI_FILETE } = require('./machines')

// Olvidar una planta acá NO rompe el sync: solo hace que sus docs queden con
// machineType 'other' (le pasó a la Baader 200 de Filete en su primer día).
const ALL_MACHINES = [...CHONCHI_EVISCERADORAS, ...YAL_EVISCERADORAS, ...CHONCHI_FILETE]

function findMachineInfo(machineid) {
  return ALL_MACHINES.find(m => m.machineid === machineid)
}

function colorFromRatio(ratio, hadExpected, threshold) {
  if (!hadExpected) return 'gray'
  if (ratio === 0) return 'red'
  const greenCutoff = Math.max(0, 1 - threshold / 100)
  if (ratio >= greenCutoff) return 'green'
  if (ratio >= greenCutoff / 2) return 'yellow'
  return 'red'
}

function normalizeInterval(raw, startAt, threshold) {
  const endAt = new Date(startAt.getTime() + (raw.totalDuration || 0))
  const hadExpected = (raw.expectedCycles || 0) > 0
  const ratio = hadExpected ? raw.cycles / raw.expectedCycles : 0
  return {
    startAt, endAt,
    cycles: raw.cycles || 0,
    expectedCycles: raw.expectedCycles || 0,
    total: raw.total || 0,
    expectedTotal: raw.expectedTotal || 0,
    ratio,
    color: colorFromRatio(ratio, hadExpected, threshold),
    // Cadencia OBJETIVO del intervalo en pz/min, según Shoplogix.
    //
    // ⚠ NO es la velocidad real (esa es cycles/duración). Verificado contra el
    // turno del 2026-07-28 de la Baader 200: en los 14 intervalos con dato se
    // cumple `expectedCycles = targetRate × 5 min` exacto, y hay intervalos con
    // targetRate 20 y cycles 0 — máquina parada con objetivo 20 pz/min. El
    // valor baja en intervalos parciales porque Shoplogix escala el objetivo al
    // tiempo activo del intervalo.
    //
    // Sirve para leer el objetivo por tramo sin re-derivarlo de expectedCycles.
    // null cuando el sensor no lo reporta (nunca 0: eso sería objetivo cero).
    targetRate: Number.isFinite(raw.rate) ? raw.rate : null,
  }
}

/**
 * Agrega el scrap (rechazo) que el sensor reporta POR INTERVALO en
 * `scrapReasons` y que hasta ahora se descartaba entero.
 *
 * Importa especialmente en Filete: no hay Grader aguas abajo, así que este es
 * el único origen posible de un factor CALIDAD para su OEE.
 *
 * ⚠ La forma exacta de cada entrada NO está verificada con datos reales: en
 * todos los turnos observados (incluido el día de pruebas de la Baader 200)
 * `scrapReasons` vino vacío. Por eso se aceptan varios nombres de campo y, si
 * no se reconoce nada, el resultado es simplemente una lista vacía — nunca un
 * número inventado. Revisar contra un turno real con rechazo antes de mostrar
 * este dato como Calidad.
 */
function aggregateScrapReasons(rawIntervals) {
  const acc = new Map()
  for (const raw of rawIntervals || []) {
    for (const sr of raw?.scrapReasons || []) {
      if (!sr) continue
      const reason = String(sr.reason ?? sr.name ?? sr.description ?? '').trim() || '(sin causa)'
      const qty = Number(sr.quantity ?? sr.cycles ?? sr.count ?? sr.qty ?? sr.value ?? 0)
      if (!Number.isFinite(qty) || qty <= 0) continue
      acc.set(reason, (acc.get(reason) || 0) + qty)
    }
  }
  return [...acc.entries()]
    .map(([reason, qty]) => ({ reason, qty }))
    .sort((a, b) => b.qty - a.qty)
}

function mapStateType(rawType) {
  const t = (rawType || '').toLowerCase()
  if (t === 'uptime') return 'uptime'
  if (t === 'downtime') return 'downtime'
  if (t === 'break') return 'break'
  if (t === 'setup') return 'setup'
  return 'downtime'
}

function normalizeState(raw) {
  const startAt = parseShoplogixTime(raw.start)
  const endAt   = parseShoplogixTime(raw.end)
  const color   = raw.statusColor && raw.statusColor.length === 6
    ? `#${raw.statusColor}` : '#64748b'
  return {
    startAt, endAt,
    durationSec: Math.round((raw.durationMilli || 0) / 1000),
    type: mapStateType(raw.type),
    name: raw.name || '',
    reason: raw.reason || '',
    color,
    isCurrent: raw.current === true,
  }
}

/**
 * Recorta un state a la intersección con [windowStart, windowEnd] y recalcula
 * durationSec desde el tramo recortado. Sin esto, un state que CRUZA el límite
 * de turno (ej. un downtime que arranca en el turno anterior y sigue en este)
 * se incluía COMPLETO en los dos documentos de turno adyacentes — duplicación
 * real confirmada contra Firestore (downtime "LOGICA" de 7.9h contado 2 veces).
 * Si el state ya cae íntegro dentro de la ventana, se devuelve sin modificar.
 */
function clipStateToWindow(s, windowStart, windowEnd) {
  const clippedStartMs = Math.max(s.startAt.getTime(), windowStart.getTime())
  const clippedEndMs   = Math.min(s.endAt.getTime(),   windowEnd.getTime())
  if (clippedStartMs === s.startAt.getTime() && clippedEndMs === s.endAt.getTime()) return s
  return {
    ...s,
    startAt: new Date(clippedStartMs),
    endAt: new Date(clippedEndMs),
    durationSec: Math.max(0, Math.round((clippedEndMs - clippedStartMs) / 1000)),
  }
}

/**
 * Normaliza un comentario crudo de Shoplogix, preservando la correlación
 * temporal/razón que trae de fábrica ({text, start, end, matchField:"reason",
 * matchValue:"FALTA MMPP", key/displayId}) — antes se descartaba todo salvo el
 * texto. `key`/`displayId` identifican el comentario de forma estable para
 * poder dedupear cuando summary y production devuelven el mismo comentario.
 * Devuelve null si no hay texto útil (se descarta, igual que antes).
 */
function normalizeComment(raw) {
  if (typeof raw === 'string') {
    const text = raw.trim()
    return text ? { key: text, text, startAt: null, endAt: null, reasonField: '', reasonValue: '' } : null
  }
  if (!raw || typeof raw !== 'object') return null
  const text = raw.text ?? raw.comment ?? raw.message ?? raw.body
  if (typeof text !== 'string' || !text.trim()) return null
  return {
    key: String(raw.key ?? raw.displayId ?? `${text}|${raw.start ?? ''}`),
    text,
    startAt: raw.start ? parseShoplogixTime(raw.start) : null,
    endAt: raw.end ? parseShoplogixTime(raw.end) : null,
    reasonField: String(raw.matchField ?? ''),
    reasonValue: String(raw.matchValue ?? ''),
  }
}

/**
 * Normaliza y dedupea comentarios crudos (summary + production pueden traer
 * el mismo comentario) por su `key`/`displayId` estable — primera ocurrencia
 * gana. Sin esto se duplicaban comentarios cuando ambos endpoints los traían.
 */
function normalizeComments(rawComments) {
  const byKey = new Map()
  for (const raw of rawComments || []) {
    const c = normalizeComment(raw)
    if (!c) continue
    if (!byKey.has(c.key)) byKey.set(c.key, c)
  }
  return [...byKey.values()]
}

/**
 * Combina production + summary → documento Firestore para 1 máquina/turno.
 *
 * Cambios clave vs v1:
 * - Los intervals usan el timestamp real del raw data (`raw.start`) en lugar
 *   de `shiftStart + i * 5min`. Esto garantiza posición correcta aunque la
 *   ventana de consulta no empiece exactamente en el inicio del turno.
 * - Los states se filtran al rango [shiftStartAt, shiftEndAt] cuando ambos
 *   son válidos. Necesario para queries full-day (un estado de 8h abarca
 *   múltiples turnos; solo queremos el segmento de este turno).
 * - Se escriben scheduledStart, scheduledEnd, scheduleSource para que el
 *   frontend pueda posicionar bloques sin depender de computeEffectiveWindow.
 */
function normalizeShift({ production, summary, dateKey, shiftId, intervalMs, syncedAt, shiftStartAt, shiftEndAt, scheduleSource }) {
  if (production.machineId !== summary.machineId) {
    throw new Error(`[normalizer] machineId mismatch ${production.machineId} vs ${summary.machineId}`)
  }
  const iMs = intervalMs || 5 * 60 * 1000
  const threshold = summary.threshold ?? production.threshold ?? 15

  // Preferir shiftStart/End explícitos (derivados de intervals en syncDay,
  // o de la ventana hardcodeada en syncShift legacy). El field
  // `currentShiftStart` del API apunta al turno EN CURSO al hacer la consulta,
  // NO al turno consultado.
  const shiftStart = shiftStartAt
    ? new Date(shiftStartAt)
    : parseShoplogixTime(summary.currentShiftStart || production.currentShiftStart)
  const shiftEnd = shiftEndAt
    ? new Date(shiftEndAt)
    : parseShoplogixTime(summary.currentShiftEnd || production.currentShiftEnd)

  // Usar timestamps reales del raw data en lugar de shiftStart + i*5min.
  // raw.start es wall-clock-as-UTC (ej. "20260226T090000.000") — parseShoplogixTime
  // lo convierte a Date con esos valores como UTC, coherente con el resto del sistema.
  const intervals = (production.machineProduction || []).map((raw) => {
    const intervalStart = raw.start
      ? parseShoplogixTime(raw.start)
      : new Date(shiftStart.getTime() + ((production.machineProduction || []).indexOf(raw)) * iMs)
    return normalizeInterval(raw, intervalStart, threshold)
  })

  const totalCycles = intervals.reduce((a, x) => a + x.cycles, 0)
  const expectedTotalCycles = intervals.reduce((a, x) => a + x.expectedCycles, 0)

  // Piezas SEGÚN EL PROPIO SENSOR, separadas por denominador. Shoplogix las
  // manda por intervalo y se descartaban; no son derivables de lo que
  // guardábamos, y son la diferencia entre "rendimiento contra el tiempo que la
  // máquina corrió" (uptime) y "contra el turno completo" (scheduled).
  const rawIntervals = production.machineProduction || []
  const sumRaw = (field) => rawIntervals.reduce((a, r) => {
    const v = Number(r?.[field])
    return a + (Number.isFinite(v) ? v : 0)
  }, 0)
  const uptimeCycles    = sumRaw('uptimeCycles')
  const scheduledCycles = sumRaw('scheduledCycles')
  const scrapByReason   = aggregateScrapReasons(rawIntervals)
  const scrapTotal      = scrapByReason.reduce((a, x) => a + x.qty, 0)
  const last = intervals[intervals.length - 1]
  const totalPieces = last?.total ?? 0
  const expectedTotalPieces = last?.expectedTotal ?? 0
  const overallRatio = expectedTotalCycles > 0 ? totalCycles / expectedTotalCycles : 0

  // Mapear todos los states del summary y filtrar al rango del turno.
  // Cuando la consulta es full-day, el summary contiene states de TODOS los turnos;
  // solo queremos los que pertenecen a este turno (solapan con [shiftStart, shiftEnd]).
  const MIN_VALID_TS = 86_400_000
  const ssValid = shiftStart.getTime() > MIN_VALID_TS
  const seValid = shiftEnd.getTime()   > MIN_VALID_TS

  const allStates = (summary.machineStates || []).map(normalizeState)
  const states = ssValid && seValid
    ? allStates
        .filter(s => s.endAt.getTime() > shiftStart.getTime() && s.startAt.getTime() < shiftEnd.getTime())
        .map(s => clipStateToWindow(s, shiftStart, shiftEnd))
    : allStates

  // "Planned Downtime" (type='break') = período POST-TURNO capturado por la
  // ventana de consulta. Debe excluirse del denominador de shiftRuntime.
  // Shoplogix cambió el idioma del reason entre feb-2026 ("DETENCION
  // PROGRAMADA") y jul-2026 ("Planned Downtime") — aceptar ambos.
  const isPlannedDT = (s) => {
    if (s.type !== 'break') return false
    const r = (s.reason || '').toLowerCase()
    return r.includes('planned downtime') || r.includes('detencion programada') || r.includes('detención programada')
  }

  const shiftRuntimeBreakdown = {
    uptimeSec:          states.filter(s => s.type === 'uptime').reduce((a, s) => a + s.durationSec, 0),
    breakSec:           states.filter(s => s.type === 'break' && !isPlannedDT(s)).reduce((a, s) => a + s.durationSec, 0),
    plannedDowntimeSec: states.filter(isPlannedDT).reduce((a, s) => a + s.durationSec, 0),
    downtimeSec:        states.filter(s => s.type === 'downtime').reduce((a, s) => a + s.durationSec, 0),
    setupSec:           states.filter(s => s.type === 'setup').reduce((a, s) => a + s.durationSec, 0),
    totalTrackedSec:    0,
  }
  shiftRuntimeBreakdown.totalTrackedSec =
    shiftRuntimeBreakdown.uptimeSec + shiftRuntimeBreakdown.breakSec +
    shiftRuntimeBreakdown.plannedDowntimeSec + shiftRuntimeBreakdown.downtimeSec +
    shiftRuntimeBreakdown.setupSec
  const productiveSec = shiftRuntimeBreakdown.totalTrackedSec - shiftRuntimeBreakdown.plannedDowntimeSec
  const shiftRuntime  = productiveSec > 0 ? shiftRuntimeBreakdown.uptimeSec / productiveSec : 0

  const info = findMachineInfo(production.machineId)
  const machineType = info?.type ?? 'other'

  return {
    machineid: production.machineId,
    machineName: production.machineName,
    machineType,
    dateKey,
    shiftId,
    shiftStart,
    shiftEnd,
    // scheduledStart/End: horario real del turno según Shoplogix (derivado de
    // intervals.shift field en syncDay, o igual a shiftStart/End en syncShift legacy).
    scheduledStart: shiftStart,
    scheduledEnd:   shiftEnd,
    scheduleSource: scheduleSource || 'legacy',
    totalCycles,
    expectedTotalCycles,
    totalPieces,
    expectedTotalPieces,
    overallRatio,
    actualRuntime:   summary.actualRuntime ?? 0,
    expectedRuntime: summary.expectedRuntime ?? 0,
    runtimeVariance: summary.runtimeVariance ?? 0,
    shiftRuntime,
    shiftRuntimeBreakdown,
    intervals,
    states,
    threshold,
    uptimeCycles,
    scheduledCycles,
    scrapByReason,
    scrapTotal,
    // Contadores de línea del sensor. En Chonchi/Filete vienen vacíos hoy; se
    // guardan solo si traen algo para no engordar el doc con strings vacíos.
    ...(production.finishedGoodUnits ? { finishedGoodUnits: String(production.finishedGoodUnits) } : {}),
    ...(production.inventoryUnits    ? { inventoryUnits:    String(production.inventoryUnits) }    : {}),
    ...(production.lineUnits         ? { lineUnits:         String(production.lineUnits) }         : {}),
    productionUnit: summary.productionUnits || production.productionUnits || '',
    comments: normalizeComments([...(summary.comments || []), ...(production.comments || [])]),
    source: 'shoplogix',
    // 4 = agrega targetRate por intervalo + uptimeCycles/scheduledCycles/scrap
    sourceVersion: 4,
    syncedAt: syncedAt || new Date(),
  }
}

module.exports = {
  colorFromRatio,
  aggregateScrapReasons,
  normalizeInterval,
  normalizeState,
  clipStateToWindow,
  normalizeComment,
  normalizeComments,
  normalizeShift,
  findMachineInfo,
}
