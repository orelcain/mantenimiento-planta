/**
 * La cantidad de una posición de la lista de materiales — una sola definición.
 *
 * POR QUÉ EXISTE
 * --------------
 * 39 de los 768 materiales con código SAP vinculados a un equipo (medido el 14-09) no tienen
 * cantidad real: 8 dicen `cantidadPorMaquina: 0` y a 31 les falta el campo. Cada salida lo
 * contaba distinto:
 *
 *   - la pestaña «Lista de materiales» mostraba «×0» EN VERDE, como un dato bueno;
 *   - «Exportar para SAP» subía la posición con cantidad 1, y solo lo decía en la hoja Resumen;
 *   - el PDF del expediente dejaba la casilla en blanco.
 *
 * Un cero no es una cantidad: ninguna máquina lleva cero cilindros montados. Se trata igual que
 * el campo ausente, y todas las salidas preguntan acá.
 */

export interface CantidadDePosicion {
  /** `true` si el maestro trae un número positivo. */
  real: boolean
  /** Lo que va a SAP: la cantidad real o, sin dato, 1 (IB01 no acepta posiciones en cero). */
  cantidad: number
}

export function cantidadDePosicion(valor: unknown): CantidadDePosicion {
  const n = typeof valor === 'number' ? valor : typeof valor === 'string' && valor.trim() ? Number(valor) : NaN
  const real = Number.isFinite(n) && n > 0
  return { real, cantidad: real ? n : 1 }
}

/** Cuántas posiciones no tienen cantidad real. */
export function contarSinCantidad(items: readonly { cantidadPorMaquina?: unknown }[]): number {
  return items.reduce((n, r) => n + (cantidadDePosicion(r.cantidadPorMaquina).real ? 0 : 1), 0)
}
