/**
 * monitorPareto.ts — qué para esta línea, turno tras turno.
 *
 * ── Por qué DOS ejes y no uno ───────────────────────────────────────────────
 *
 * Un Pareto clásico ordena por tiempo perdido y con eso alcanza cuando hay
 * cientos de casos. Acá son 6 o 7 turnos, y medido en Filete el 14-08 el
 * ranking por minutos ponía cuarta a `ACUMULACION` con 36 min — que ocurrió
 * UNA sola vez, el 8-ago. Ordenado solo por minutos, un incidente aislado se
 * disfraza de causa crónica y manda a cambiar un proceso que no lo necesita.
 *
 * Por eso cada fila lleva además **en cuántos turnos aparece**: 6 de 6 es un
 * patrón, 1 de 6 es un incidente. Los dos números se muestran juntos; ninguno
 * de los dos solo alcanza para decidir.
 *
 * ── Por qué se agrupa por equipo ────────────────────────────────────────────
 *
 * Shoplogix etiqueta con `Equipo/Parte` (`Baader 200/CUCHILLERIA DORSAL`,
 * `Baader 200/CUCHILLERIA RASCADOR`, `Baader 200/PERNOS/RESORTES`). Sueltas,
 * ninguna de las tres pasa de 47 min en 6 turnos y ninguna llama la atención;
 * juntas son 86 min, el 26% del tiempo parado y el segundo lugar del Pareto.
 * La regla es genérica —lo que va antes de la primera barra es el equipo— así
 * que no hay que mantener un mapa de causas a mano, y sirve igual en Yal.
 *
 * ⚠ Solo entra el tiempo RECUPERABLE. La colación y las demás paradas de
 * convenio no son pérdidas que alguien pueda atacar: meterlas en el Pareto las
 * pondría primeras y taparían justamente lo que sí se puede mejorar.
 */

/** Una causa tal como viaja en el `timeBreakdown` de un turno. */
export interface CausaTurno {
  reason: string
  min: number
  count: number
}

export interface ParetoRow {
  /** Etiqueta que se muestra: el equipo si agrupa, o la causa tal cual. */
  label: string
  minutes: number
  /** En cuántos turnos de la muestra aparece. */
  shifts: number
  /** Paradas totales sumadas. */
  count: number
  /** Porcentaje del tiempo recuperable total. */
  sharePct: number
  /** Porcentaje acumulado hasta esta fila, inclusive. */
  cumPct: number
  /** Las causas que se agruparon, cuando son más de una. */
  parts: CausaTurno[]
}

export interface ParetoResult {
  rows: ParetoRow[]
  /** Minutos recuperables sumados de toda la muestra. */
  totalMin: number
  /** Turnos considerados. */
  shifts: number
  /**
   * Cuántas filas cubren el 80% del tiempo. 0 si no hay datos. Es el corte que
   * se dibuja: "estas N explican el X%".
   */
  vitalCount: number
  /** Porcentaje que cubren esas `vitalCount` filas. */
  vitalPct: number
}

/** El equipo de una causa `Equipo/Parte`, o null si la causa no lo trae. */
export function equipoDe(reason: string): string | null {
  const i = reason.indexOf('/')
  if (i <= 0) return null
  const equipo = reason.slice(0, i).trim()
  return equipo.length > 1 ? equipo : null
}

/**
 * El Pareto de las paradas recuperables de una muestra de turnos.
 *
 * Cada turno aporta su lista de causas ya agregada por el backend; acá solo se
 * suman, se agrupan por equipo y se ordenan.
 */
export function buildPareto(turnos: Array<CausaTurno[] | null | undefined>): ParetoResult {
  const acc = new Map<string, { minutes: number; count: number; shifts: Set<number>; parts: Map<string, CausaTurno> }>()

  turnos.forEach((causas, idx) => {
    if (!causas) return
    for (const c of causas) {
      if (!c?.reason || !(c.min > 0)) continue
      const label = equipoDe(c.reason) ?? c.reason
      let fila = acc.get(label)
      if (!fila) {
        fila = { minutes: 0, count: 0, shifts: new Set(), parts: new Map() }
        acc.set(label, fila)
      }
      fila.minutes += c.min
      fila.count += c.count ?? 0
      fila.shifts.add(idx)
      const parte = fila.parts.get(c.reason)
      if (parte) {
        parte.min += c.min
        parte.count += c.count ?? 0
      } else {
        fila.parts.set(c.reason, { reason: c.reason, min: c.min, count: c.count ?? 0 })
      }
    }
  })

  const totalMin = [...acc.values()].reduce((a, f) => a + f.minutes, 0)
  const shifts = turnos.filter(Boolean).length
  if (totalMin <= 0) return { rows: [], totalMin: 0, shifts, vitalCount: 0, vitalPct: 0 }

  let cum = 0
  const rows: ParetoRow[] = [...acc.entries()]
    .sort((a, b) => b[1].minutes - a[1].minutes)
    .map(([label, f]) => {
      cum += f.minutes
      return {
        label,
        minutes: f.minutes,
        shifts: f.shifts.size,
        count: f.count,
        sharePct: (f.minutes / totalMin) * 100,
        cumPct: (cum / totalMin) * 100,
        parts: [...f.parts.values()].sort((a, b) => b.min - a.min),
      }
    })

  /*
   * El corte del 80%: la primera fila que lo alcanza entra. Con muestras
   * chicas puede caer en la fila 1 (una causa que se llevó todo) o no llegar
   * nunca si están todas parejas — ahí no hay "pocas vitales" que mostrar y el
   * bloque lo dice en vez de inventar un corte.
   */
  const i = rows.findIndex((r) => r.cumPct >= 80)
  const vitalCount = i >= 0 ? i + 1 : 0
  return {
    rows,
    totalMin,
    shifts,
    vitalCount,
    vitalPct: vitalCount > 0 ? rows[vitalCount - 1]!.cumPct : 0,
  }
}
