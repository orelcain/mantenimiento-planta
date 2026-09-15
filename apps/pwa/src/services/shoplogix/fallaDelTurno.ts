/**
 * Las causas de falla del TURNO y a quién se le atribuyen los minutos.
 *
 * «Lo que costó» mostraba los minutos de falla de todo el turno con el nombre de
 * UNA máquina —la de más falla— y la píldora de causas salía solo de esa
 * máquina. Medido en Yal el 11-09 Turno 2: decía «63 min de falla en YA 1»
 * cuando YA 1 tuvo 24, YA 2 tuvo 21 y YA 3 tuvo 17, y la píldora «CAMBIO TURNO
 * 15 + AJUSTE MANTENIMIENTO 9» dejaba fuera las causas de las otras dos. En
 * Filete no se notaba porque hay una sola máquina.
 *
 * Módulo aparte para poder testearlo (mismo motivo que `vistasDelTurno`).
 */

export interface MaquinaConFalla {
  nombreCorto: string
  /** Minutos de falla técnica de esa máquina en el turno. */
  fallaMin: number
  /** Causas de la máquina: causa → segundos. */
  causas: Record<string, number>
}

/** «63 min de falla en YA 1» solo si de verdad fue una; si no, «en 3 máquinas». */
export function dondeOcurrioLaFalla(maquinas: readonly MaquinaConFalla[], totalFallaMin: number): string {
  if (maquinas.length === 0) return ''
  const min = Math.round(totalFallaMin)
  if (maquinas.length === 1) return `${min} min de falla en ${maquinas[0]!.nombreCorto}`
  return `${min} min de falla en ${maquinas.length} máquinas`
}

/**
 * Las causas de falla de TODAS las máquinas, en minutos, de mayor a menor.
 *
 * Los segundos se suman antes de redondear: dos paros de 90 s en máquinas
 * distintas son 3 min, no 2.
 */
export function causasDeFallaDelTurno(maquinas: readonly MaquinaConFalla[]): { causa: string; min: number }[] {
  const seg = new Map<string, number>()
  for (const m of maquinas) {
    for (const [causa, s] of Object.entries(m.causas || {})) seg.set(causa, (seg.get(causa) ?? 0) + s)
  }
  return [...seg.entries()]
    .map(([causa, s]) => ({ causa, min: Math.round(s / 60) }))
    .filter((c) => c.min > 0)
    .sort((a, b) => b.min - a.min || a.causa.localeCompare(b.causa, 'es'))
}
