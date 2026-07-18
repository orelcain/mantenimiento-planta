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

/**
 * Variantes singulares de un término de búsqueda en español (heurística
 * conservadora). El matcher es substring, así que buscar en singular ya
 * encuentra el plural ("guante" ⊂ "guantes"), pero al revés no: "guantes"
 * no aparece en "GUANTE ANTICORTE". Estas variantes cierran esa asimetría.
 *
 *   guantes  → [guantes, guante]
 *   motores  → [motores, motore, motor]
 *   luces    → [luces, luce, luz]
 *
 * Términos cortos (<4) no se tocan: des-pluralizar "los"/"des" solo mete ruido.
 */
export function termVariants(term: string): string[] {
  const variants = [term]
  if (term.length < 4) return variants
  if (term.endsWith('ces')) variants.push(term.slice(0, -3) + 'z')
  if (term.endsWith('es')) {
    variants.push(term.slice(0, -1)) // guantes → guante
    if (term.length >= 6) variants.push(term.slice(0, -2)) // motores → motor
  } else if (term.endsWith('s')) {
    variants.push(term.slice(0, -1)) // rodamientos → rodamiento
  }
  return variants
}

/**
 * ¿El haystack (ya normalizado) contiene TODOS los términos, aceptando la
 * variante singular de cada uno? Reemplazo directo del idioma
 * `terms.every((t) => hay.includes(t))` de los buscadores de repuestos.
 */
export function haystackMatchesAll(normalizedHaystack: string, terms: string[]): boolean {
  return terms.every((t) => termVariants(t).some((v) => normalizedHaystack.includes(v)))
}
