/**
 * El objetivo del turno cuando nadie cargó una cuota.
 *
 * POR QUÉ EXISTE
 * --------------
 * El monitor usaba `expectedPieces` —la suma de `expectedTotalCycles` de las
 * máquinas— como meta del turno, y lo rotulaba «objetivo Shoplogix». Pero ese
 * número **se completa durante el turno**: empieza bajo y sube hasta el total.
 * Medido en la noche del 25 al 26-08, en el mismo turno:
 *
 *     02:29 → 15.821      04:00 → 20.287      06:06 → 20.807      08:06 → 20.875
 *
 * La meta corría 4.500 piezas hacia arriba mientras el turno pasaba. Dos
 * consecuencias, las dos malas:
 *
 * - **Temprano el turno parece sobrado**: a las 22:00 el "objetivo" son un par
 *   de miles y la línea siempre va ganando.
 * - **Al final la brecha es enorme**: «faltan 8.396 pz y quedan 59 min».
 *
 * Y `lineMaxPerHour` repartía ese acumulado parcial sobre las horas del turno
 * COMPLETO, así que temprano devolvía un techo ridículamente bajo — justo lo
 * que su propio comentario llama la peor forma de equivocarse: marcar como
 * imposible una cuota que sí se puede.
 *
 * LO QUE SÍ SIRVE
 * ---------------
 * En los turnos ya CERRADOS el número es notablemente estable, y no depende de
 * cuánto duró el turno:
 *
 *     25-08 T2 · 458 min → 21.274
 *     25-08 T1 · 404 min → 21.130
 *     24-08 T2 · 458 min → 20.714
 *
 * Menos de 1,4% entre ellos con 54 minutos de diferencia de duración. Esa es la
 * cifra que Shoplogix espera del turno, y la que sirve de meta desde el minuto
 * uno: la mediana de los turnos cerrados del mismo nombre.
 */

/** Un turno cerrado del historial, con lo que Shoplogix esperaba de él. */
export interface TurnoCerradoConObjetivo {
  expected?: number | null
}

export type OrigenObjetivo = 'historia' | 'en-curso'

export interface ObjetivoDelTurno {
  piezas: number
  origen: OrigenObjetivo
  /** Cuántos turnos cerrados respaldan la mediana. 0 si se cayó al en curso. */
  turnos: number
}

/**
 * @param expectedEnCurso `expectedPieces` del turno de ahora — se completa
 *   sobre la marcha, así que solo se usa como último recurso.
 * @param historia turnos cerrados del mismo nombre.
 */
export function objetivoDelTurno(
  expectedEnCurso: number | null | undefined,
  historia: readonly TurnoCerradoConObjetivo[] | null | undefined,
): ObjetivoDelTurno | null {
  const cerrados = (historia ?? [])
    .map((h) => Number(h?.expected))
    .filter((n) => Number.isFinite(n) && n > 0)
    .sort((a, b) => a - b)

  if (cerrados.length > 0) {
    const mitad = Math.floor(cerrados.length / 2)
    const mediana = cerrados.length % 2
      ? cerrados[mitad]!
      : (cerrados[mitad - 1]! + cerrados[mitad]!) / 2
    return { piezas: Math.round(mediana), origen: 'historia', turnos: cerrados.length }
  }

  /*
   * Sin historia queda el acumulado en curso. Se devuelve igual —es mejor que
   * no tener vara— pero marcado, para que la pantalla pueda decir que todavía
   * se está completando en vez de presentarlo como una meta firme.
   */
  const enCurso = Number(expectedEnCurso)
  if (Number.isFinite(enCurso) && enCurso > 0) {
    return { piezas: Math.round(enCurso), origen: 'en-curso', turnos: 0 }
  }
  return null
}
