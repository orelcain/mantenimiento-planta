/**
 * Presets de rangos de fecha para el análisis de período del Grader.
 *
 * Cada preset devuelve `{ start, end, label }` donde `start` y `end` están en
 * formato `YYYY-MM-DD` (compatible con `listDailySummariesByRange`). Los
 * presets relativos (semana/mes/trimestre) se calculan respecto al día actual;
 * los absolutos (temporada) tienen fechas fijas por diseño.
 */

export interface PeriodRange {
  start: string // YYYY-MM-DD
  end: string   // YYYY-MM-DD
  label: string
}

export type PeriodPresetKey = 'week' | 'month' | 'quarter' | 'season' | 'custom'

function toDateKey(d: Date): string {
  const yyyy = d.getFullYear()
  const mm = String(d.getMonth() + 1).padStart(2, '0')
  const dd = String(d.getDate()).padStart(2, '0')
  return `${yyyy}-${mm}-${dd}`
}

function daysAgo(n: number): Date {
  const d = new Date()
  d.setDate(d.getDate() - n)
  return d
}

/**
 * Fechas de la temporada productiva principal. Ajustable si la planta define
 * una temporada distinta. Por ahora usa la temporada actual 2025-2026 para
 * coincidir con los datos históricos cargados.
 */
const SEASON_START = '2025-06-01'
const SEASON_END = '2026-05-31'
const SEASON_LABEL = 'Temporada 2025-2026'

/**
 * Presets disponibles. Cada entrada es una función porque los rangos
 * relativos deben recalcularse al momento de seleccionar (no al montar).
 */
export const PERIOD_PRESETS: Record<Exclude<PeriodPresetKey, 'custom'>, () => PeriodRange> = {
  week: () => ({
    start: toDateKey(daysAgo(7)),
    end: toDateKey(new Date()),
    label: 'Última semana',
  }),
  month: () => ({
    start: toDateKey(daysAgo(30)),
    end: toDateKey(new Date()),
    label: 'Último mes',
  }),
  quarter: () => ({
    start: toDateKey(daysAgo(90)),
    end: toDateKey(new Date()),
    label: 'Último trimestre',
  }),
  season: () => ({
    start: SEASON_START,
    end: SEASON_END,
    label: SEASON_LABEL,
  }),
}

/** Devuelve el preset default cuando se abre la página. */
export function getDefaultPreset(): { key: PeriodPresetKey; range: PeriodRange } {
  // Por defecto: temporada completa (es lo que el usuario quiere ver para análisis general).
  return { key: 'season', range: PERIOD_PRESETS.season() }
}

/** Lista de presets para renderizar como botones tab-style. */
export const PRESET_ORDER: Array<{ key: Exclude<PeriodPresetKey, 'custom'>; label: string }> = [
  { key: 'week',    label: 'Semana' },
  { key: 'month',   label: 'Mes' },
  { key: 'quarter', label: 'Trimestre' },
  { key: 'season',  label: 'Temporada' },
]
