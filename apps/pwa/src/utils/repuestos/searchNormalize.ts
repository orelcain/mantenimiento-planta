/**
 * Normaliza texto para búsqueda: lowercase + sin acentos/diacríticos + trim de espacios.
 *
 * Resuelve casos como:
 *   - "iman" matchea "Imán"
 *   - "valvula" matchea "Válvula"
 *   - "limpia" matchea "Límpia"
 *   - "pequena" matchea "pequeña" (la ñ NO se descompone — se conserva como ñ)
 *
 * Uso:
 *   const q = normalizeForSearch(query)
 *   if (normalizeForSearch(rep.textoBreve).includes(q)) ...
 */
export function normalizeForSearch(text: string | null | undefined): string {
  if (!text) return ''
  return String(text)
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')   // remueve marcas diacríticas combinables (acentos)
    .toLowerCase()
    .replace(/\s+/g, ' ')
    .trim()
}

/**
 * Conveniencia: ¿el texto coincide con la query (ambos normalizados)?
 */
export function matchesSearch(haystack: string | null | undefined, normalizedQuery: string): boolean {
  if (!normalizedQuery) return true
  if (!haystack) return false
  return normalizeForSearch(haystack).includes(normalizedQuery)
}
