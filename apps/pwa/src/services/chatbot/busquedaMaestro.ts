/**
 * Búsqueda de materiales por CÓDIGO para el contexto de ARIA (chat de la PWA).
 *
 * POR QUÉ EXISTE
 * --------------
 * Medido el 14-09: «en qué equipos se usa el repuesto SAP 3300138386?» → ARIA contestó que
 * **no había ningún repuesto con ese código** y ofreció un «BENDIX DE ARRANQUE 3300100386».
 * El cilindro existe y está en seis Knuro. Dos causas:
 *
 *   1. La búsqueda estricta exigía TODOS los términos (`usa`, `sap`, `3300138386`) y ningún
 *      material dice «usa» ni «sap» → cero, y caía a la búsqueda flexible.
 *   2. La flexible compara con Levenshtein ≤ 2, también los NÚMEROS: 3300100386 está a dos
 *      dígitos de 3300138386, así que «se parece». Un código con dos dígitos distintos es OTRA
 *      pieza — mandar a buscarla es peor que no encontrar nada.
 *
 * Con un código completo en la pregunta, el match exacto va primero y manda.
 */

/** Códigos SAP / de fabricante numéricos escritos en la consulta (6 dígitos o más). */
export function codigosEnConsulta(consulta: string): string[] {
  return [...new Set(consulta.match(/\b\d{6,}\b/g) ?? [])]
}

/** Un término hecho solo de dígitos no admite coincidencia aproximada. */
export function esTerminoNumerico(termino: string): boolean {
  return /^\d+$/.test(termino)
}

const soloAlfanumerico = (s: string) => s.replace(/[^0-9a-z]/gi, '').toUpperCase()

/**
 * Materiales cuyo código SAP es EXACTAMENTE uno de los códigos, o cuyo código de fabricante lo
 * es sin espacios ni guiones («999 0571» = 9990571).
 */
export function materialesPorCodigo<T extends { sap: string; fab: string }>(materiales: readonly T[], codigos: readonly string[]): T[] {
  if (codigos.length === 0) return []
  const buscados = new Set(codigos)
  return materiales.filter((m) => buscados.has(m.sap.trim()) || (m.fab !== '' && buscados.has(soloAlfanumerico(m.fab))))
}

/**
 * La planta de un nodo, subiendo por `parentId` hasta un ancestro que se llame «PLANTA …».
 * Los equipos se llaman igual en las dos plantas: sin esto, «KNURO N1» no dice cuál.
 */
export function plantaSubiendo(
  nodeId: string,
  padreDe: ReadonlyMap<string, string | null | undefined>,
  nombreDe: ReadonlyMap<string, string>,
): string | undefined {
  let actual: string | null | undefined = nodeId
  for (let saltos = 0; actual && saltos < 25; saltos++) {
    const nombre = nombreDe.get(actual) ?? ''
    if (/^PLANTA\s/i.test(nombre)) return nombre.replace(/^PLANTA\s+/i, '').trim()
    actual = padreDe.get(actual)
  }
  return undefined
}

/** «KNURO N1 (Chonchi), KNURO N1 (Yal), …» — todos, no el primero «+5». */
export function listarEquiposConPlanta(
  nodeIds: readonly string[],
  padreDe: ReadonlyMap<string, string | null | undefined>,
  nombreDe: ReadonlyMap<string, string>,
): string {
  return nodeIds
    .map((id) => {
      const nombre = nombreDe.get(id) || id
      const planta = plantaSubiendo(id, padreDe, nombreDe)
      return planta ? `${nombre} (${planta})` : nombre
    })
    .sort((a, b) => a.localeCompare(b, 'es', { numeric: true }))
    .join(', ')
}
