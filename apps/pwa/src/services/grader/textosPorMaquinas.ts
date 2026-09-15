/**
 * Las frases de la pestaña Mantención que cuentan máquinas.
 *
 * Se escribieron pensando en Chonchi y Yal, que tienen tres Baader. **Filete
 * tiene UNA máquina** y ahí salían «disponibilidad 100% en las 1 máquinas»,
 * «Las 1 máquinas cerraron sin una sola intervención» y «Las 1 barras miden el
 * mismo turno … se compara de un vistazo» —comparar con qué, si hay una—.
 *
 * Módulo aparte de la pestaña para poder testearlo (mismo motivo que
 * `vistasDelTurno`).
 */

/** «en la máquina» / «en las 3 máquinas». */
export function enLasMaquinas(total: number): string {
  return total === 1 ? 'en la máquina' : `en las ${total} máquinas`
}

/** Cuántas cerraron sin intervención; cadena vacía si ninguna. Termina en espacio. */
export function sinIntervencion(sanas: number, total: number): string {
  if (sanas <= 0) return ''
  if (total === 1) return 'La máquina cerró sin una sola intervención. '
  if (sanas === total) return `Las ${total} máquinas cerraron sin una sola intervención. `
  return `${sanas} de ${total} máquinas ${sanas === 1 ? 'cerró' : 'cerraron'} sin una sola intervención. `
}

/** La leyenda debajo de las barras de reparto. */
export function leyendaReparto(total: number): string {
  return total === 1
    ? 'La barra arranca por falla técnica: el bloque rojo es el tiempo que le tocó a Mantención. Tócala para ver el Gantt, los paros y los comentarios del operador.'
    : `Las ${total} barras miden el mismo turno y arrancan por falla técnica: el bloque rojo se compara de un vistazo. Toca una máquina para ver su Gantt, sus paros y los comentarios del operador.`
}
