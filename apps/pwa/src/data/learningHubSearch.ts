/**
 * Buscador del hub del Centro de Aprendizaje.
 *
 * Vive fuera de la página para poder probarlo contra el catálogo REAL: el
 * técnico llega con la placa de la máquina en la mano y escribe lo que lee
 * ahí (`A600`, `MS4`, `TP-6000`, `GR8251`), y esos modelos viven en la bajada
 * de la ficha, no en su nombre.
 */

/** lowercase + sin acentos, para búsqueda tolerante. */
export const normHub = (s: string) => s.toLowerCase().normalize('NFD').replace(/\p{Diacritic}/gu, '')

/** Todo lo que la tarjeta muestra, junto y normalizado. */
export function textoBuscable(...partes: Array<string | null | undefined>): string {
  return normHub(partes.filter(Boolean).join(' '))
}

/** ¿La tarjeta responde a lo que se escribió? Consulta ya normalizada. */
export function coincide(texto: string, consultaNorm: string): boolean {
  return texto.includes(consultaNorm)
}
