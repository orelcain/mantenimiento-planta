/**
 * Resolución de qué doc PADRE alimenta cada clave `${dateKey}__${shiftId}` del
 * caché mensual del calendario.
 *
 * Existe porque hay dos vocabularios de turno conviviendo:
 *   - el que escribe el sync, tal como lo emite Shoplogix: "Turno 1/2/3",
 *     "Turno 1 Lunes", "Unscheduled";
 *   - el que usa el Grader/Excel: "Turno día" / "Turno noche".
 *
 * El calendario indexa por ambos. Antes, `loadOne` resolvía el alias probando
 * candidatos contra Firestore (un read por intento). Con los docs padre ya en
 * memoria, la misma resolución es puro cómputo — de ahí esta función.
 *
 * Se extrajo del componente para poder probarla: es la pieza donde un error
 * silencioso hace desaparecer turnos del calendario o duplicar su producción.
 */

import type { ShoplogixShiftParent } from '@/services/shoplogix/shoplogixShift.service'

/**
 * Umbral de ruido para `Unscheduled`: producción que Shoplogix no atribuyó a
 * ningún turno. Por debajo de esto es arranque/parada o calibración, no un turno
 * real, y no debe disfrazarse de "Turno 3" ni de "Turno noche".
 *
 * Mismo valor que usaban `loadOne` y `subscribeShoplogixShiftAuto`.
 */
export const UNSCHEDULED_MIN_CYCLES = 50

/** Ciclos totales del turno según su doc padre. */
export function parentTotalCycles(p: ShoplogixShiftParent): number {
  return p.machines.reduce((a, m) => a + m.totalCycles, 0)
}

/**
 * Mapea cada clave del caché mensual al doc padre que la resuelve.
 *
 * Incluye:
 *   - las claves REALES (el shiftId tal cual lo escribió el sync),
 *   - las claves BASE del Grader que no existen como doc pero cuyo alias sí
 *     (p. ej. `2026-07-08__Turno día` → el padre de `Turno 2`).
 *
 * Solo considera padres con agregados: los de esquema viejo no tienen con qué
 * alimentar la vista mensual y deben ir por el camino con subcolección.
 *
 * Reglas de resolución del alias, calcadas de `loadOne`:
 *   1. si el turno nombrado existe y tiene producción, gana;
 *   2. si no, el primer candidato con producción;
 *   3. `Unscheduled` solo si supera el umbral de ruido;
 *   4. si nada tiene producción, se conserva el turno nombrado si existe (para
 *      que la UI muestre "sin producción" en vez de "sin datos").
 */
export function resolveMonthShiftKeys(
  parents: readonly ShoplogixShiftParent[],
  baseShiftIds: readonly string[],
  getCandidates: (base: string) => string[],
): Map<string, ShoplogixShiftParent> {
  const byKey = new Map<string, ShoplogixShiftParent>()
  for (const p of parents) {
    if (!p.hasAggregates) continue
    byKey.set(`${p.dateKey}__${p.shiftId}`, p)
  }
  if (byKey.size === 0) return new Map()

  const resolved = new Map<string, ShoplogixShiftParent>(byKey)

  const resolveBase = (dk: string, base: string): ShoplogixShiftParent | null => {
    const own = byKey.get(`${dk}__${base}`)
    if (own && parentTotalCycles(own) > 0) return own

    // Si nadie tiene producción, se devuelve el primer turno que al menos EXISTA.
    // Así la clave queda poblada con un turno de 0 ciclos y la UI muestra "sin
    // producción" en vez de "sin datos" — que es lo que hacía `loadOne` al no
    // encontrar candidato válido y quedarse con el snapshot vacío del nombrado.
    let firstExisting: ShoplogixShiftParent | null = own ?? null

    for (const candidate of getCandidates(base)) {
      if (candidate === base) continue
      const p = byKey.get(`${dk}__${candidate}`)
      if (!p) continue
      const cycles = parentTotalCycles(p)
      // `Unscheduled` bajo el umbral es ruido: no gana, y tampoco sirve de relleno.
      if (candidate === 'Unscheduled' && cycles < UNSCHEDULED_MIN_CYCLES) continue
      if (cycles > 0) return p
      if (!firstExisting) firstExisting = p
    }
    return firstExisting
  }

  const days = new Set(parents.map(p => p.dateKey))
  for (const dk of days) {
    for (const base of baseShiftIds) {
      const key = `${dk}__${base}`
      if (resolved.has(key)) continue
      const p = resolveBase(dk, base)
      if (p) resolved.set(key, p)
    }
  }

  return resolved
}
