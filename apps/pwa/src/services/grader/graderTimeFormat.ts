/**
 * graderTimeFormat.ts — formateo de tiempos del módulo Análisis de Turno.
 *
 * FUENTE ÚNICA DE VERDAD para los formateadores de tiempo y duración usados
 * en todo el módulo. Antes existían duplicados en >15 archivos:
 *   - `fmtHHMM` / `formatHHMM` (idéntico en MinuteDetailDialog, PauseAnnotationDialog,
 *     ShiftTimelineView, etc.)
 *   - `fmtDuration` con firmas mezcladas (segundos en algunos, minutos en otros)
 *
 * Convención de timestamps Marelec / Shoplogix:
 * los ISO strings llevan sufijo 'Z' pero representan hora LOCAL DE PLANTA
 * (Chile) sin conversión TZ. Por eso usamos `getUTCHours/Minutes/Seconds`
 * para leer el wall-clock real.
 *
 * Aplica el principio "consistencia entre elementos" del CLAUDE.md.
 */

// ── Hora del día (HH:MM) ─────────────────────────────────────────────────────

/**
 * Formatea ISO string a `HH:MM` en hora local de planta.
 *
 * Re-exportado desde `shiftTimelineHelpers.ts` para mantener una única
 * definición funcional (la implementación canónica vive allí desde el
 * refactor M11). Este re-export agrupa todos los formateadores de tiempo
 * en un módulo común para descubrimiento.
 */
export { fmtTime } from '@/components/grader/shiftTimelineHelpers'

/**
 * Formatea un timestamp a `HH:MM:SS` en hora local de planta.
 *
 * Acepta string ISO / Date / number (epoch ms) — misma firma que `fmtTime`.
 * Útil cuando el contexto requiere precisión a segundos (ej: detalle pieza
 * por pieza en `MinuteDetailDialog`, o el panel de detalle de estado Baader).
 */
export function fmtTimeWithSec(input: string | Date | number): string {
  const d = input instanceof Date ? input : new Date(input)
  return [
    String(d.getUTCHours()).padStart(2, '0'),
    String(d.getUTCMinutes()).padStart(2, '0'),
    String(d.getUTCSeconds()).padStart(2, '0'),
  ].join(':')
}

/**
 * Formatea ISO a `dd/MM HH:MM` — útil para historiales que cruzan días.
 * Mantiene la convención Z-as-wall-clock-local.
 */
export function fmtDateTime(iso: string): string {
  const d = new Date(iso)
  return [
    `${String(d.getUTCDate()).padStart(2, '0')}/${String(d.getUTCMonth() + 1).padStart(2, '0')}`,
    `${String(d.getUTCHours()).padStart(2, '0')}:${String(d.getUTCMinutes()).padStart(2, '0')}`,
  ].join(' ')
}

// ── Duraciones ───────────────────────────────────────────────────────────────

/**
 * Formatea una duración en SEGUNDOS a string legible.
 *
 * Reglas:
 *   - < 60s            → "X s"
 *   - 60s ≤ d < 3600s  → "X min"
 *   - ≥ 3600s          → "X h Y min" (omite "Y min" cuando es 0)
 *
 * Redondea minutos al entero más cercano (no truncar — un evento de 89s
 * es más representativo como "1 min" que como "1 min" de truncar 89/60=1).
 */
export function fmtDurationSec(seconds: number): string {
  if (!Number.isFinite(seconds) || seconds < 0) return '—'
  if (seconds < 60) return `${Math.round(seconds)} s`
  const totalMin = Math.round(seconds / 60)
  if (totalMin < 60) return `${totalMin} min`
  const h = Math.floor(totalMin / 60)
  const m = totalMin % 60
  return m > 0 ? `${h} h ${m} min` : `${h} h`
}

/**
 * Formatea una duración en MINUTOS a string legible.
 *
 * Reglas:
 *   - < 60min → "X min"
 *   - ≥ 60min → "X h Y min" (omite "Y min" cuando es 0)
 *
 * Útil cuando el dato ya viene agregado en minutos (ej: KPIs de período).
 */
export function fmtDurationMin(minutes: number): string {
  if (!Number.isFinite(minutes) || minutes < 0) return '—'
  const m = Math.round(minutes)
  if (m < 60) return `${m} min`
  const h = Math.floor(m / 60)
  const rm = m % 60
  return rm > 0 ? `${h} h ${rm} min` : `${h} h`
}

/**
 * Formatea un delta de tiempo entre dos timestamps (ms epoch o ISO) como
 * "hace X" — útil para metadata de eventos del turno (último cambio config,
 * última anotación, etc.).
 *
 * Reglas:
 *   - Δ < 60s     → "hace un momento"
 *   - 60s ≤ d <1h → "hace X min"
 *   - 1h ≤ d <24h → "hace X h" (omite minutos)
 *   - ≥ 24h       → "hace X d"
 *
 * Si `nowMs` no se provee, usa Date.now() — pero exponer el parámetro
 * permite tests determinísticos.
 */
export function fmtRelativeTime(thenMs: number, nowMs: number = Date.now()): string {
  if (!Number.isFinite(thenMs) || !Number.isFinite(nowMs)) return '—'
  const deltaSec = Math.max(0, Math.round((nowMs - thenMs) / 1000))
  if (deltaSec < 60) return 'hace un momento'
  const deltaMin = Math.floor(deltaSec / 60)
  if (deltaMin < 60) return `hace ${deltaMin} min`
  const deltaHr = Math.floor(deltaMin / 60)
  if (deltaHr < 24) return `hace ${deltaHr} h`
  const deltaDay = Math.floor(deltaHr / 24)
  return `hace ${deltaDay} d`
}

// ── Parseo ────────────────────────────────────────────────────────────────────

/**
 * Parsea un timestamp del módulo a epoch ms respetando la convención
 * wall-clock-as-planta.
 *
 * Por qué existe: no todos los timestamps del módulo llevan sufijo `Z`. Los
 * `tsMin` de los TimelineBucket son `ts.slice(0, 16)` → `"2026-08-01T01:34"`,
 * sin zona. `Date.parse` de una fecha-hora SIN offset la interpreta como hora
 * LOCAL (lo dice el estándar), así que en Chile (UTC-4) esos minutos se corrían
 * 4 horas — el mismo error que rompía el corte de turnos.
 *
 * Acá se fuerza a leerlos como wall-clock: si el string no trae zona, se le
 * agrega `Z` para que el reloj del Excel llegue intacto.
 */
export function parseWallClockMs(ts: string | null | undefined): number {
  if (!ts) return NaN
  const s = ts.trim()
  // Ya trae zona explícita (Z o ±HH:MM) → se respeta tal cual.
  if (/(?:Z|[+-]\d{2}:?\d{2})$/.test(s)) return Date.parse(s)
  // `YYYY-MM-DDTHH:MM` o `…:SS(.mmm)` sin zona → wall-clock de planta.
  if (/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}(:\d{2}(\.\d+)?)?$/.test(s)) return Date.parse(`${s}Z`)
  return Date.parse(s)
}
