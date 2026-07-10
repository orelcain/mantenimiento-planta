/**
 * Agregados de states por razón — la forma comprimida de `states[]` que el sync
 * guarda en el doc PADRE de cada turno (`machines[].stateAggregates`).
 *
 * Motivo: la vista mensual necesitaba dos cosas de `states[]` — el pareto de
 * paros por razón y los totales de avería macro/micro — y para obtenerlas bajaba
 * la subcolección `machines` de cada turno del mes (~4 reads por turno). Ambas
 * son agregaciones, así que el sync las precomputa y viajan gratis en los docs
 * padre que la query de rango ya lee.
 *
 * Los `states[]` completos siguen existiendo en la subcolección y se cargan solo
 * al abrir un día concreto (timeline, ventana efectiva).
 *
 * ── Invariante ───────────────────────────────────────────────────────────────
 * Los números derivados de los agregados deben ser IDÉNTICOS a los derivados de
 * `states[]`. Eso vale porque la agrupación es por `(type, name, reason)` — las
 * tres dimensiones de las que dependen `isMaintenanceState` (type, reason),
 * la separación macro/micro (name) y el bucket del pareto (reason || name).
 * `shoplogixStateAggregates.paridad.test.ts` lo verifica sobre turnos reales.
 *
 * La contraparte que ESCRIBE estos agregados es `aggregateStatesByReason` en
 * `functions/shoplogix/sync.js`. Si cambia una, cambia la otra: los tests de
 * paridad de este archivo son la red que lo detecta.
 */

import type { UpstreamMachineState } from '@/services/shoplogix/types'
import {
  isMaintenanceState,
  MICRO_STOP_NAME,
  type MaintenanceTotals,
} from './shoplogixMaintenance'

/** Una entrada del resumen: todos los states que comparten (type, name, reason). */
export interface StateAggregate {
  type: UpstreamMachineState['type']
  name: string
  reason: string
  color: string
  /** Suma de `durationSec` de los states colapsados en esta entrada. */
  durationSec: number
  /** Cuántos states se colapsaron. Es el `count` de eventos para el MTTR. */
  count: number
}

const DEFAULT_STATE_COLOR = '#64748b'

/**
 * Colapsa `states[]` en agregados. Espejo exacto de `aggregateStatesByReason`
 * en `functions/shoplogix/sync.js`.
 *
 * Se usa para dos cosas:
 *   - turnos legacy cuyo doc padre aún no trae `stateAggregates` (esquema v1),
 *   - los tests de paridad.
 *
 * Excluye `uptime`: no aparece en el pareto (que muestra paradas) y su total ya
 * viaja en `breakdown.uptimeSec`.
 */
export function aggregatesFromStates(states: readonly UpstreamMachineState[] | null | undefined): StateAggregate[] {
  const byKey = new Map<string, StateAggregate>()
  for (const s of states ?? []) {
    if (s.type === 'uptime') continue
    const name   = s.name   || ''
    const reason = s.reason || ''
    const key = `${s.type}|${name}|${reason}`
    const prev = byKey.get(key)
    if (prev) {
      prev.durationSec += s.durationSec || 0
      prev.count       += 1
    } else {
      byKey.set(key, {
        type: s.type,
        name,
        reason,
        color: s.color || DEFAULT_STATE_COLOR,
        durationSec: s.durationSec || 0,
        count: 1,
      })
    }
  }
  return [...byKey.values()].sort((a, b) => b.durationSec - a.durationSec)
}

/** Deserializa `machines[].stateAggregates` de un doc padre de Firestore. */
export function deserializeStateAggregates(raw: unknown): StateAggregate[] {
  if (!Array.isArray(raw)) return []
  const out: StateAggregate[] = []
  for (const x of raw) {
    if (!x || typeof x !== 'object') continue
    const o = x as Record<string, unknown>
    if (typeof o.type !== 'string') continue
    out.push({
      type:        o.type as UpstreamMachineState['type'],
      name:        typeof o.name   === 'string' ? o.name   : '',
      reason:      typeof o.reason === 'string' ? o.reason : '',
      color:       typeof o.color  === 'string' ? o.color  : DEFAULT_STATE_COLOR,
      durationSec: Number(o.durationSec ?? 0),
      count:       Number(o.count ?? 0),
    })
  }
  return out
}

/**
 * Totales de avería macro/micro desde agregados.
 *
 * Equivalente a `computeMaintenanceTotals(states)`: como cada agregado agrupa
 * states que comparten `(type, name, reason)`, todos caen del mismo lado de la
 * clasificación, y sumar `durationSec`/`count` da el mismo resultado.
 */
export function maintenanceTotalsFromAggregates(aggs: readonly StateAggregate[]): MaintenanceTotals {
  let macroSec = 0, macroCount = 0, microSec = 0, microCount = 0
  for (const a of aggs) {
    if (!isMaintenanceState(a)) continue
    if (a.name.trim() === MICRO_STOP_NAME) {
      microSec   += a.durationSec
      microCount += a.count
    } else {
      macroSec   += a.durationSec
      macroCount += a.count
    }
  }
  return { macroSec, macroCount, microSec, microCount }
}

/** Una barra del pareto de paros. */
export interface ParetoBucket {
  name: string
  durationSec: number
  count: number
  color: string
  type: UpstreamMachineState['type']
}

/**
 * Pareto de paros desde agregados, ordenado por duración descendente.
 *
 * `maintOnly` deja solo las averías (ver `isMaintenanceState`).
 *
 * Bucket = `reason` si existe, si no `name`, si no "Sin causa" — la causa que el
 * supervisor registró tiene prioridad sobre la categoría genérica de Shoplogix.
 * Dos agregados distintos pueden caer en el mismo bucket (p. ej. mismo reason con
 * distinto name); sus duraciones y conteos se suman, y el bucket se queda con el
 * `color`/`type` del primero — igual que la versión que iteraba `states[]`.
 */
export function paretoFromAggregates(
  aggs: readonly StateAggregate[],
  maintOnly: boolean,
): ParetoBucket[] {
  const byBucket = new Map<string, ParetoBucket>()
  for (const a of aggs) {
    // `uptime` ya viene excluido del agregado, pero el guard mantiene la función
    // correcta si alguna vez se le pasa una lista construida a mano.
    if (a.type === 'uptime') continue
    if (maintOnly && !isMaintenanceState(a)) continue

    const bucket = a.reason.trim() || a.name.trim() || 'Sin causa'
    const prev = byBucket.get(bucket)
    if (prev) {
      prev.durationSec += a.durationSec
      prev.count       += a.count
    } else {
      byBucket.set(bucket, {
        name: bucket,
        durationSec: a.durationSec,
        count: a.count,
        color: a.color,
        type: a.type,
      })
    }
  }
  return [...byBucket.values()].sort((a, b) => b.durationSec - a.durationSec)
}
