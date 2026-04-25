/**
 * graderUpstreamHealth.ts — Helpers puros para clasificación de salud de la
 * línea upstream (Evisceradoras Baader 142).
 *
 * Aplica los principios "info útil + consistencia + cautela" del CLAUDE.md:
 * - Constantes exportadas como FUENTE ÚNICA de umbrales (saludable/atención/
 *   crítico, microparadas anómalas, frescura del sync).
 * - Helpers testables en lugar de lógica inline en componentes.
 * - Labels operacionales en lugar de números crudos (variance "+5% (mejor)").
 *
 * Usado por:
 *   - UpstreamMachinesPanel (badges, tooltips, microAlertSet, stale)
 *   - Otros componentes que clasifiquen salud de máquinas Baader
 */

// ── Umbrales de tasa alcanzada (reachedPct) — saludable vs atención vs crítico ─
//
// `reachedPct = totalProducido / totalEsperado` (0..∞)
//
//   - ≥ 0.85 → saludable    (produce el 85% o más de lo esperado)
//   - 0.65–0.85 → atención  (bajo objetivo pero no crítico)
//   - < 0.65 → crítico      (muy lejos del objetivo, intervenir)

export const REACHED_PCT_THRESHOLDS = {
  /** A partir de este % se considera saludable. */
  healthyAbove: 0.85,
  /** Por debajo de este % se considera crítico. */
  criticalBelow: 0.65,
} as const

export type ReachedStatus = 'healthy' | 'attention' | 'critical'

export function reachedStatusFromPct(pct: number): ReachedStatus {
  if (pct >= REACHED_PCT_THRESHOLDS.healthyAbove) return 'healthy'
  if (pct < REACHED_PCT_THRESHOLDS.criticalBelow) return 'critical'
  return 'attention'
}

/** Color tailwind para texto según status — alineado con la paleta del módulo. */
export function reachedStatusColor(status: ReachedStatus): string {
  switch (status) {
    case 'healthy':   return 'text-emerald-400'
    case 'attention': return 'text-amber-400'
    case 'critical':  return 'text-rose-400'
  }
}

/** Label corto operacional para badge/tooltip. */
export function reachedStatusLabel(status: ReachedStatus): string {
  switch (status) {
    case 'healthy':   return 'saludable'
    case 'attention': return 'bajo objetivo'
    case 'critical':  return 'crítico'
  }
}

// ── Umbrales de microparadas anómalas ─────────────────────────────────────────
//
// Una máquina se marca como "atención" si:
//   1. Tiene el conteo MÁS ALTO de microparadas de la línea
//   2. Su conteo es ≥ MIN_ABSOLUTE (umbral absoluto — evita FP en turnos vacíos)
//   3. Su conteo es ≥ avg × OVER_AVG_RATIO (significativamente sobre el promedio)

export const MICRO_ANOMALY_THRESHOLDS = {
  /** Mínimo absoluto de microparadas para considerar la alerta. */
  minAbsolute: 15,
  /** La máquina debe estar al menos este múltiplo sobre el promedio de la línea. */
  overAvgRatio: 1.25,
} as const

/**
 * Detecta máquinas con microparadas anómalas.
 *
 * Retorna un Set con los `machineid` que cumplen los 3 criterios.
 * Conservador por diseño — solo marca cuando hay evidencia clara, evita
 * ruido de alerta en turnos con muy pocas microparadas.
 */
export function detectMicroAnomalies(
  machines: { machineid: string; microCount: number }[],
): Set<string> {
  const set = new Set<string>()
  if (machines.length < 2) return set
  const counts = machines.map(m => m.microCount)
  const max = Math.max(...counts)
  if (max < MICRO_ANOMALY_THRESHOLDS.minAbsolute) return set
  const avg = counts.reduce((a, x) => a + x, 0) / counts.length
  if (avg <= 0) return set
  const threshold = avg * MICRO_ANOMALY_THRESHOLDS.overAvgRatio
  for (const m of machines) {
    if (m.microCount === max && m.microCount > threshold) set.add(m.machineid)
  }
  return set
}

// ── Frescura del sync Shoplogix ───────────────────────────────────────────────
//
// El badge "Desactualizado" aparece cuando han pasado más de N min sin sync.

export const SYNC_STALE_MINUTES = 15

export function isStaleSync(syncedAt: Date | null | undefined, now: Date = new Date()): boolean {
  if (!syncedAt) return false
  const ageMin = (now.getTime() - syncedAt.getTime()) / 60000
  return ageMin > SYNC_STALE_MINUTES
}

// ── Variance runtime — etiqueta operacional ───────────────────────────────────
//
// `runtimeVariance = actualRuntime - expectedRuntime` (de Shoplogix).
// Convertimos el número crudo a label operacional para el operador.

export type VarianceDirection = 'better' | 'as_expected' | 'worse'

/** Umbral de "como esperado" — variance dentro de ±2 puntos % se considera neutro. */
export const VARIANCE_NEUTRAL_BAND = 0.02

export function varianceDirection(variance: number): VarianceDirection {
  if (variance >= VARIANCE_NEUTRAL_BAND)  return 'better'
  if (variance <= -VARIANCE_NEUTRAL_BAND) return 'worse'
  return 'as_expected'
}

export function varianceLabel(direction: VarianceDirection): string {
  switch (direction) {
    case 'better':      return 'mejor que esperado'
    case 'as_expected': return 'como esperado'
    case 'worse':       return 'peor que esperado'
  }
}

export function varianceColor(direction: VarianceDirection): string {
  switch (direction) {
    case 'better':      return 'text-emerald-400'
    case 'as_expected': return 'text-slate-400'
    case 'worse':       return 'text-rose-400'
  }
}
