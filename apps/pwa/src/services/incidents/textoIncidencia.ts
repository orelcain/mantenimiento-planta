/**
 * Normaliza y valida el texto con el que nace una incidencia.
 *
 * POR QUÉ EXISTE
 * --------------
 * De las 13 incidencias que hay, una tiene por título `"\n´\n"` y por
 * descripción `"}"`. Se creó el 05-02-2026 y sigue **en proceso** seis meses
 * después: aparece en la lista, la cuenta ARIA entre las abiertas ("Incidencia
 * sin título (´)") y suma a los pendientes del día. Fue un dedo en el teclado,
 * no una falla de planta.
 *
 * El schema de validación existe (`tituloSchema`: mínimo 5 caracteres) pero
 * `createIncident` nunca lo aplicó: escribe lo que le pasen.
 *
 * Otros tres títulos guardados terminan en espacio ("Baader sucia ",
 * "Sensor tolva ", "probar bomba recirculado "), que es lo que hace que dos
 * incidencias iguales no se vean iguales.
 *
 * No se impone el mínimo de 5 caracteres para no romper los títulos que arma
 * el protocolo de la 142 ni los del bot: lo que se rechaza es lo que **no dice
 * nada** — vacío o pura puntuación.
 */

/** Espacios y saltos de más fuera; el resto se respeta tal cual. */
export function normalizarTextoIncidencia(texto: unknown): string {
  if (typeof texto !== 'string') return ''
  return texto.replace(/\s+/g, ' ').trim()
}

/** ¿Este texto dice algo? Necesita al menos una letra o un dígito. */
export function diceAlgo(texto: unknown): boolean {
  const limpio = normalizarTextoIncidencia(texto)
  if (limpio.length === 0) return false
  return /[\p{L}\p{N}]/u.test(limpio)
}
