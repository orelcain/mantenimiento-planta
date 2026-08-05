/**
 * Entrada para bundlear la lógica PURA de segmentación del Grader y usarla
 * desde scripts Node (firebase-admin). Así el re-proceso usa EXACTAMENTE el
 * mismo código que la app, en vez de una reimplementación que se desincroniza.
 */
export {
  assignShiftAndDate,
  assignFromShoplogixWindows,
  segmentByDayAndShift,
  computeShiftSummary,
  computeTimelineAggregates,
  dedupePieceRecords,
  dedupeGate0Records,
  sortedSegmentEntries,
} from '../apps/pwa/src/services/grader/graderSegmenter'
export {
  DEFAULT_SHIFT_SCHEDULE,
  normalizeShiftSchedule,
  shiftIdToKey,
} from '../apps/pwa/src/services/grader/graderShiftSchedule'
export { getPlantLineConfig, PLANT_LINES } from '../apps/pwa/src/config/plantLines'
