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
const { CHONCHI_EVISCERADORAS } = require('./machines')

function findMachineInfo(machineid) {
  return CHONCHI_EVISCERADORAS.find(m => m.machineid === machineid)
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
 */
function normalizeShift({ production, summary, dateKey, shiftId, intervalMs, syncedAt }) {
  if (production.machineId !== summary.machineId) {
    throw new Error(`[normalizer] machineId mismatch ${production.machineId} vs ${summary.machineId}`)
  }
  const iMs = intervalMs || 5 * 60 * 1000
  const threshold = summary.threshold ?? production.threshold ?? 15
  const shiftStart = parseShoplogixTime(summary.currentShiftStart || production.currentShiftStart)
  const shiftEnd   = parseShoplogixTime(summary.currentShiftEnd   || production.currentShiftEnd)

  const intervals = (production.machineProduction || []).map((raw, i) => {
    const intervalStart = new Date(shiftStart.getTime() + i * iMs)
    return normalizeInterval(raw, intervalStart, threshold)
  })

  const totalCycles = intervals.reduce((a, x) => a + x.cycles, 0)
  const expectedTotalCycles = intervals.reduce((a, x) => a + x.expectedCycles, 0)
  const last = intervals[intervals.length - 1]
  const totalPieces = last?.total ?? 0
  const expectedTotalPieces = last?.expectedTotal ?? 0
  const overallRatio = expectedTotalCycles > 0 ? totalCycles / expectedTotalCycles : 0

  const states = (summary.machineStates || []).map(normalizeState)

  const info = findMachineInfo(production.machineId)
  const machineType = info?.type ?? 'other'

  return {
    machineid: production.machineId,
    machineName: production.machineName,
    machineType,
    dateKey,
    shiftId,
    shiftStart, shiftEnd,
    totalCycles,
    expectedTotalCycles,
    totalPieces,
    expectedTotalPieces,
    overallRatio,
    actualRuntime:   summary.actualRuntime ?? 0,
    expectedRuntime: summary.expectedRuntime ?? 0,
    runtimeVariance: summary.runtimeVariance ?? 0,
    intervals,
    states,
    threshold,
    productionUnit: summary.productionUnits || production.productionUnits || '',
    comments: [...(summary.comments || []), ...(production.comments || [])],
    source: 'shoplogix',
    sourceVersion: 1,
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
