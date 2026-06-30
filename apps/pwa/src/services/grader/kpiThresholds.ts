/**
 * kpiThresholds — cortes de semáforo de los KPIs de turno (OEE / disponibilidad /
 * rendimiento / calidad / MTTR / MTBF) en UN solo lugar.
 *
 * Son los MISMOS cortes que ya usa el board `PlantKPIBoard` para colorear (oeeColor,
 * availColor, etc.). Aquí se centralizan para que los AVISOS PROACTIVOS de ARIA
 * (`proactiveAlerts`) disparen exactamente con el mismo criterio con que la app pinta
 * un KPI en amarillo/rojo — regla del CLAUDE.md: un concepto se evalúa igual en todos
 * lados. (Pendiente: migrar también `PlantKPIBoard` a estas constantes.)
 *
 * Semáforo del board, traducido a alerta:
 *   - 🟢 verde  → 'good'     (no alerta)
 *   - 🟡 ámbar  → 'warn'     (vigilar)
 *   - 🔴 rojo   → 'critical' (atender)
 * Para OEE el board tiene un tramo "aceptable" extra (azul 0.65–0.85) que NO alerta.
 */

export type KpiTone = 'good' | 'warn' | 'critical'

/**
 * Umbrales por KPI. `warnBelow/critBelow` para los que "más alto es mejor"
 * (OEE/disp/rend/calidad/MTBF); `warnAbove/critAbove` para MTTR (más bajo es mejor).
 */
export const KPI_CUTOFFS = {
  // OEE: 🟢≥0.85 · 🔵≥0.65 (ok, no alerta) · 🟡≥0.50 · 🔴<0.50
  oee: { warnBelow: 0.65, critBelow: 0.5 },
  // Disponibilidad: 🟢≥0.85 · 🟡≥0.70 · 🔴<0.70
  availability: { warnBelow: 0.85, critBelow: 0.7 },
  // Rendimiento: 🟢≥0.90 · 🟡≥0.75 · 🔴<0.75
  performance: { warnBelow: 0.9, critBelow: 0.75 },
  // Calidad: 🟢≥0.95 · 🟡≥0.85 · 🔴<0.85
  quality: { warnBelow: 0.95, critBelow: 0.85 },
  // MTTR (min, menor es mejor): 🟢≤5 · 🟡≤15 · 🔴>15
  mttrMin: { warnAbove: 5, critAbove: 15 },
  // MTBF (h, mayor es mejor): 🟢≥2 · 🟡≥1 · 🔴<1
  mtbfHours: { warnBelow: 2, critBelow: 1 },
} as const

/** Tono para KPIs donde MÁS ALTO es mejor. `null`/no-finito → 'good' (sin dato, no alerta). */
export function toneHigherBetter(v: number | null | undefined, warnBelow: number, critBelow: number): KpiTone {
  if (v === null || v === undefined || !isFinite(v)) return 'good'
  if (v < critBelow) return 'critical'
  if (v < warnBelow) return 'warn'
  return 'good'
}

/** Tono para KPIs donde MÁS BAJO es mejor (MTTR). `<=0`/no-finito → 'good' (sin dato). */
export function toneLowerBetter(v: number | null | undefined, warnAbove: number, critAbove: number): KpiTone {
  if (v === null || v === undefined || !isFinite(v) || v <= 0) return 'good'
  if (v > critAbove) return 'critical'
  if (v > warnAbove) return 'warn'
  return 'good'
}
