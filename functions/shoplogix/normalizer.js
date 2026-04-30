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
const { CHONCHI_EVISCERADORAS, YAL_EVISCERADORAS } = require('./machines')

const ALL_MACHINES = [...CHONCHI_EVISCERADORAS, ...YAL_EVISCERADORAS]

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
  }
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
    ? allStates.filter(s => s.endAt.getTime() > shiftStart.getTime() && s.startAt.getTime() < shiftEnd.getTime())
    : allStates

  // "Planned Downtime" (type='break', reason contains 'planned downtime') =
  // período POST-TURNO capturado por la ventana de consulta. Debe excluirse
  // del denominador de shiftRuntime.
  const isPlannedDT = (s) =>
    s.type === 'break' && (s.reason || '').toLowerCase().includes('planned downtime')

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
    productionUnit: summary.productionUnits || production.productionUnits || '',
    comments: [...(summary.comments || []), ...(production.comments || [])],
    source: 'shoplogix',
    sourceVersion: 2,
    syncedAt: syncedAt || new Date(),
  }
}

module.exports = {
  colorFromRatio,
  normalizeInterval,
  normalizeState,
  normalizeShift,
  findMachineInfo,
}
