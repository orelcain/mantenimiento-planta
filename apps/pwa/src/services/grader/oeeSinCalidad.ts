/**
 * Modo del primer tile del tablero de indicadores (PlantKPIBoard).
 *
 * Sin Excel del Grader no hay Calidad, y el OEE completo (D × R × C) no se puede
 * calcular. Mostrar «—» al lado de una Disponibilidad de 80,6 % hizo que varias
 * personas leyeran 80,6 % como el OEE. Ahora, cuando falta la Calidad, el tile
 * muestra el «OEE sin calidad» = D × R, rotulado como tal y con la cuenta a la
 * vista; la tarjeta Calidad se oculta (vuelve sola cuando hay Excel).
 *
 * Usa EXACTAMENTE la Disponibilidad y el Rendimiento que muestran los otros
 * tiles (los mismos `kpis.availability` / `kpis.performance`), sin recalcular.
 */

export interface OeeInputs {
  availability: number | null
  performance: number | null
  quality: number | null
  oee: number | null
  /** Período con calidad del Grader pero sin Shoplogix. */
  graderOnly?: boolean
}

export type OeeTileMode =
  /** Hay Calidad: OEE completo y 4 tiles, como siempre. */
  | { mode: 'completo'; value: number | null }
  /** No hay Calidad: D × R rotulado «OEE sin calidad» y 3 tiles. */
  | { mode: 'sin-calidad'; value: number; availability: number; performance: number }
  /** Ni siquiera hay D y R (sin Shoplogix): el tile queda como estaba. */
  | { mode: 'sin-datos'; value: null }

const finito = (v: number | null): v is number => v !== null && Number.isFinite(v)

export function resolveOeeTileMode(k: OeeInputs): OeeTileMode {
  if (k.graderOnly) return { mode: 'sin-datos', value: null }
  if (finito(k.quality)) return { mode: 'completo', value: k.oee }
  if (finito(k.availability) && finito(k.performance)) {
    return {
      mode: 'sin-calidad',
      value: k.availability * k.performance,
      availability: k.availability,
      performance: k.performance,
    }
  }
  return { mode: 'sin-datos', value: null }
}
