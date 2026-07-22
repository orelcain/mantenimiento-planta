/**
 * Clasificación de "avería" (mantenimiento) sobre states de Shoplogix.
 *
 * Contexto: para calcular MTTR/MTBF y para el toggle "Solo mantenimiento"
 * del pareto mensual, necesitamos distinguir qué `UpstreamMachineState`
 * cuenta como avería real vs. paro operacional.
 *
 * Distribución observada (Yal mayo 2026, 105 docs máquina):
 *   break    763h 26m  (Planned Downtime, CUMPLIMIENTO CUOTA, COLACION, etc.)
 *   downtime  55h 55m  (1596 events)
 *     ├─ Averías reales:
 *     │    AJUSTE MANTENIMIENTO         4h 19m / 74 ev
 *     │    (sin reason / Detencion)     8h 21m / 16 ev   ← macro
 *     │    (sin reason / Micro Detencion) 3h 33m / 1412 ev ← micro
 *     └─ Operativos (excluir):
 *          FALTA MMPP            37h 14m  (suministro)
 *          CONTRASTACION          1h 53m  (calibración planificada)
 *          CAMBIO LOTE/MMPP         31m   (cambio de operación)
 *          AJUSTE OPERADOR           1m   (ajuste manual)
 *
 * Decisión (sesión 2026-05-14):
 *   - "Avería" = type='downtime' AND reason ∉ exclude-list
 *   - Macro vs micro se separa por state.name === 'Micro Detencion'
 *   - MTTR-macro y MTTR-micro se reportan por separado (1412 microparos
 *     bajan el MTTR a ~38s, poco accionable. MTTR-macro ~8.5min es útil).
 */
import type { UpstreamMachineState } from '@/services/shoplogix/types'

/**
 * Shape mínimo para clasificar un paro. Lo cumplen tanto un `UpstreamMachineState`
 * (de la subcolección `machines`) como un `StateAggregate` (el resumen por razón
 * que el sync guarda en el doc padre del turno).
 *
 * Existe para que la REGLA de qué cuenta como avería viva en un solo lugar y se
 * aplique igual a ambas representaciones. Sin esto habría dos copias de la lista
 * de exclusiones y terminarían divergiendo.
 */
export interface ClassifiableState {
  type: UpstreamMachineState['type']
  name?: string
  reason?: string
}

/**
 * Reasons que aparecen como `type='downtime'` en Shoplogix pero NO son
 * averías técnicas — son paros operacionales (cambio de operación,
 * falta de suministro, calibración planificada). Se excluyen de MTTR.
 *
 * Match case-insensitive y trimmed.
 */
export const MAINTENANCE_EXCLUDED_REASONS: ReadonlySet<string> = new Set([
  'FALTA MMPP',
  'CONTRASTACION',
  'CAMBIO LOTE/MMPP',
  'AJUSTE OPERADOR',
])

/** Nombre con el que Shoplogix etiqueta las interferencias breves y frecuentes. */
export const MICRO_STOP_NAME = 'Micro Detencion'

/** ¿Es este state una avería (macro o micro)? */
export function isMaintenanceState(state: ClassifiableState): boolean {
  if (state.type !== 'downtime') return false
  const reason = (state.reason || '').trim().toUpperCase()
  if (reason && MAINTENANCE_EXCLUDED_REASONS.has(reason)) return false
  return true
}

/**
 * Micro Detencion (interferencias mecánicas): paros muy cortos y frecuentes.
 * Suelen no llevar reason categorizado.
 */
export function isMaintenanceMicro(state: ClassifiableState): boolean {
  if (!isMaintenanceState(state)) return false
  return (state.name || '').trim() === MICRO_STOP_NAME
}

/** Avería macro: avería excluyendo Micro Detencion (paros relevantes). */
export function isMaintenanceMacro(state: ClassifiableState): boolean {
  if (!isMaintenanceState(state)) return false
  return (state.name || '').trim() !== MICRO_STOP_NAME
}

/**
 * Agregados de mantención sobre una lista de states.
 * Devuelve segundos totales y conteo separados por macro vs micro.
 */
export interface MaintenanceTotals {
  /** Averías macro: paros relevantes, sin Micro Detencion. */
  macroSec: number
  macroCount: number
  /** Micro Detencion: interferencias breves y frecuentes. */
  microSec: number
  microCount: number
}

/**
 * Gap máximo (seg) para fusionar dos states consecutivos de la misma causal en
 * UN evento. Espejo de EVENT_MERGE_GAP_SEC en functions/shoplogix/sync.js y en
 * aggregatesFromStates — Shoplogix trocea una misma detención en fragmentos
 * contiguos; contarlos por separado infla los eventos y subestima el MTTR.
 */
const EVENT_MERGE_GAP_SEC = 60

export function computeMaintenanceTotals(states: readonly UpstreamMachineState[]): MaintenanceTotals {
  let macroSec = 0
  let macroCount = 0
  let microSec = 0
  let microCount = 0
  // Fusión de fragmentos contiguos: mismo (type|name|reason) sin gap real = 1 evento.
  const sorted = [...states].sort((a, b) => a.startAt.getTime() - b.startAt.getTime())
  const lastEndByKey = new Map<string, number>()
  for (const s of sorted) {
    if (!isMaintenanceState(s)) continue
    const key = `${s.type}|${(s.name || '').trim()}|${(s.reason || '').trim()}`
    const lastEnd = lastEndByKey.get(key)
    const isNewEvent = lastEnd === undefined || (s.startAt.getTime() - lastEnd) / 1000 > EVENT_MERGE_GAP_SEC
    lastEndByKey.set(key, Math.max(lastEnd ?? 0, s.endAt.getTime()))
    if ((s.name || '').trim() === 'Micro Detencion') {
      microSec += s.durationSec || 0
      if (isNewEvent) microCount += 1
    } else {
      macroSec += s.durationSec || 0
      if (isNewEvent) macroCount += 1
    }
  }
  return { macroSec, macroCount, microSec, microCount }
}

/** MTTR = total seg / count.  Devuelve 0 si no hay eventos. */
export function computeMTTR(totalSec: number, count: number): number {
  if (count <= 0) return 0
  return totalSec / count
}
