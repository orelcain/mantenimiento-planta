/**
 * El entero que alguien está escribiendo en un campo.
 *
 * Vacío NO es el mínimo: mientras no haya un número válido, no hay número. Los campos de la
 * carga de trabajo usaban `Math.max(min, Number(v) || min)` y al borrar volvían al mínimo en el
 * acto, así que lo escrito después quedaba pegado detrás (5 sobre unos minutos vacíos → 55).
 * Mismo defecto que la cantidad de la solicitud de repuestos (#1016).
 */
export function enteroDesdeTexto(texto: string, min: number): number | null {
  const limpio = texto.trim()
  if (!/^\d+$/.test(limpio)) return null
  const n = Number(limpio)
  return Number.isSafeInteger(n) && n >= min ? n : null
}
