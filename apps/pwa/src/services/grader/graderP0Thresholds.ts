/**
 * graderP0Thresholds.ts — Umbrales operacionales de P0% del Grader.
 *
 * FUENTE ÚNICA DE VERDAD para los umbrales P0% usados en TODO el módulo
 * Análisis de Turno. Antes estaban duplicados (hardcoded) en al menos 3
 * componentes (UpstreamScatterCard, ShiftTimelineView, GlobalSettingsModal),
 * lo que causó un bug real: el scatter no respetaba la configuración del
 * usuario porque tenía su propio `const P0_CRITICAL_PCT = 3.5`.
 *
 * Reglas:
 *  - Estos son los **defaults** — el usuario puede sobreescribirlos via
 *    GlobalSettingsModal (persistido en Firestore `system/graderConfig`).
 *  - Los componentes deben aceptar la config del usuario como prop, y caer
 *    a estos defaults solo si no hay config disponible.
 *
 * Aplica el principio "consistencia entre elementos" del CLAUDE.md.
 */

// ── Defaults ─────────────────────────────────────────────────────────────────

/** Default: P0% bajo este valor → operación saludable (verde). */
export const DEFAULT_P0_ALERT_PCT = 2

/** Default: P0% sobre este valor → crítico (rojo, atención inmediata). */
export const DEFAULT_P0_CRITICAL_PCT = 3.5

/** Conjunto completo de defaults. Usar como fallback cuando no hay config Firestore. */
export const DEFAULT_P0_THRESHOLDS = {
  alert: DEFAULT_P0_ALERT_PCT,
  critical: DEFAULT_P0_CRITICAL_PCT,
} as const

// ── Status + helpers ──────────────────────────────────────────────────────────

export type P0Status = 'ok' | 'alert' | 'critical'

/**
 * Clasifica un P0% según los umbrales dados.
 *
 * Convención: el lado izquierdo del umbral es ESTRICTO (`<=`):
 *   - p0Pct <= alert     → 'ok'
 *   - alert < p0Pct <= critical → 'alert'
 *   - p0Pct > critical   → 'critical'
 */
export function p0StatusFromPct(
  p0Pct: number,
  thresholds: { alert: number; critical: number } = DEFAULT_P0_THRESHOLDS,
): P0Status {
  if (p0Pct <= thresholds.alert)    return 'ok'
  if (p0Pct <= thresholds.critical) return 'alert'
  return 'critical'
}

/** Color tailwind para texto según status — alineado con paleta del módulo. */
export function p0StatusColor(status: P0Status): string {
  switch (status) {
    case 'ok':       return 'text-emerald-400'
    case 'alert':    return 'text-amber-400'
    case 'critical': return 'text-rose-400'
  }
}

/** Color hex para canvas/echarts (sin clase tailwind) — útil en exportaciones PNG/PDF. */
export function p0StatusHex(status: P0Status): string {
  switch (status) {
    case 'ok':       return '#22c55e'  // emerald-500
    case 'alert':    return '#f59e0b'  // amber-500
    case 'critical': return '#ef4444'  // red-500
  }
}

/** Label corto operacional. */
export function p0StatusLabel(status: P0Status): string {
  switch (status) {
    case 'ok':       return 'OK'
    case 'alert':    return 'alerta'
    case 'critical': return 'crítico'
  }
}
