/**
 * El aviso de Puerta 0 en un turno sin Excel del Grader.
 *
 * En Chonchi y Yal el Excel existe y se puede cargar: se dice de dónde sale el
 * P0. En Filete no hay Grader: el P0 no existe, y decir que «se calcula con el
 * Excel» mandaba a buscar un archivo que la línea no produce.
 */
export function textoPuerta0(tieneGrader: boolean): string {
  return tieneGrader
    ? 'P0 — se calcula con el Excel del Grader'
    : 'Sin P0 — esta línea no pasa por Grader'
}
