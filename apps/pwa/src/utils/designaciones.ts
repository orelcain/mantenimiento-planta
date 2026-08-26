/**
 * Utilidades de designaciones IEC (B14, K7…) del módulo de planos.
 * Extraídas de PlanosElectricosPage para poder testearlas: el formato del
 * aviso "otro modelo" ya tuvo un bug real (colapsaba B11, B12 en "B11–B12"
 * y antes escondía el hueco de B10 con "B1–B12").
 */

/** Orden "natural" de una designación (B1, B2 … B12, no alfabético). */
export function compararTags(a: string, b: string): number {
  const pa = a.match(/^([A-Za-z]*)(\d*)$/)
  const pb = b.match(/^([A-Za-z]*)(\d*)$/)
  const la = pa?.[1] ?? a
  const lb = pb?.[1] ?? b
  if (la !== lb) return la.localeCompare(lb)
  return Number(pa?.[2] || 0) - Number(pb?.[2] || 0)
}

/**
 * Compacta designaciones consecutivas respetando HUECOS: el guion solo se usa
 * para corridas de 3 o más; dos seguidas van con coma.
 *   [B1..B9, B11, B12] → ["B1–B9", "B11", "B12"]  (B10 fuera: el hueco se ve)
 */
export function compactarTramos(tags: string[]): string[] {
  const ordenados = [...tags].sort(compararTags)
  const corridas: string[][] = []
  for (const tag of ordenados) {
    const m = /^([A-Z]+)(\d+)$/.exec(tag)
    const previa = corridas[corridas.length - 1]
    const ult = previa ? /^([A-Z]+)(\d+)$/.exec(previa[previa.length - 1] ?? '') : null
    if (m && previa && ult && ult[1] === m[1] && Number(ult[2]) === Number(m[2]) - 1) {
      previa.push(tag)
    } else {
      corridas.push([tag])
    }
  }
  return corridas.flatMap((c) => (c.length >= 3 ? [`${c[0]}–${c[c.length - 1]}`] : c))
}
