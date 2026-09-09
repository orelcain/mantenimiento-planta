/**
 * Adoptar el seteo de la máquina en un turno CERRADO.
 *
 * En un turno en curso, adoptar = registrar el cambio desde ahora (un snapshot
 * nuevo, o el inicial corregido si nadie tocó nada). En un turno cerrado eso
 * miente: el snapshot «ahora» rige solo desde ahora y todo el turno sigue
 * juzgado con el seteo viejo. Medido 09-09 en 2026-09-07 Turno 1: G1 y G12
 * adoptadas por script en los 4 snapshots → coincidencia 98,9 % → 99,9 %.
 *
 * La regla: la máquina tuvo ese programa TODO el turno (es lo que dice el
 * Excel), así que la puerta se reescribe en TODOS los snapshots, sin tocar las
 * demás puertas ni los cambios registrados a mano.
 */
import type { GateAssignment } from './types'
import type { GateConfigSnapshot } from './graderConfigSnapshot.service'

/** Puertas cuya asignación cambia entre la config base y la adoptada. */
export function puertasAdoptadas(base: readonly GateAssignment[], nuevas: readonly GateAssignment[]): Map<number, GateAssignment> {
  const byNumber = new Map(base.map((g) => [g.gateNumber, g]))
  const out = new Map<number, GateAssignment>()
  for (const n of nuevas) {
    const b = byNumber.get(n.gateNumber)
    if (!b || b.assignedCalibre !== n.assignedCalibre || b.assignedQuality !== n.assignedQuality || b.active !== n.active
      || (b.assignedConservation ?? undefined) !== (n.assignedConservation ?? undefined)) {
      out.set(n.gateNumber, n)
    }
  }
  return out
}

/** Los mismos snapshots con las puertas adoptadas reescritas (puro; no escribe). */
export function reescribirEnTodos(
  snapshots: readonly GateConfigSnapshot[],
  adoptadas: ReadonlyMap<number, GateAssignment>,
): Array<{ id: string; gates: GateAssignment[]; cambio: boolean }> {
  return snapshots.map((s) => {
    let cambio = false
    const gates = s.gates.map((g) => {
      const a = adoptadas.get(g.gateNumber)
      if (!a) return g
      cambio = true
      return { ...g, ...a }
    })
    // Una puerta adoptada que el snapshot no traía (config parcial) se agrega.
    for (const [n, a] of adoptadas) if (!gates.some((g) => g.gateNumber === n)) { gates.push({ ...a }); cambio = true }
    return { id: s.id, gates, cambio }
  })
}
