export type HojaEtiquetable = {
  blatt: number
  fig?: string | null
  titulo?: string | null
  tituloEs?: string | null
}

// Titulos que NO distinguen una hoja de otra: repetirlos en el selector es
// ruido puro. Medido: las 18 hojas del as-built de la 200 dicen todas
// "Continuacion del esquema", y 15 de las 31 del 860. Se muestra solo el
// numero, como antes — no se inventa un nombre que el plano no da.
const TITULOS_MUDOS = new Set(['continuacion del esquema', 'fortsetzung schaltplan'])

/**
 * Etiqueta de una hoja para el selector "Ir a hoja".
 *
 * El numero de hoja del visor no le dice NADA a nadie: en un despiece de 254
 * figuras lo que la gente cita es la figura impresa ("70-8") y lo que reconoce
 * es el titulo del conjunto. El indice ya traia ambos y el selector los tiraba.
 */
export function etiquetaHoja(h: HojaEtiquetable, es: boolean): string {
  const crudo = (es ? h.tituloEs || h.titulo : h.titulo || h.tituloEs) || ''
  const nombre = TITULOS_MUDOS.has(crudo.trim().toLowerCase()) ? '' : crudo
  const ref = h.fig && h.fig !== '—' ? h.fig : String(h.blatt)
  return nombre ? `${ref} · ${nombre}` : ref
}

/**
 * ¿El título de una hoja coincide con lo que se buscó?
 *
 * Compara también SIN ESPACIOS: los títulos de los planos GEA salen de OCR del
 * cajetín y traen palabras pegadas («OCUPACIONCABLE DE UNION25G075»). Buscar
 * "ocupacion cable" —lo que escribe cualquiera— daba 0 resultados mientras
 * "ocupacioncable" daba 3.
 *
 * Ambos textos llegan ya normalizados (sin acentos, en mayúsculas).
 */
export function coincideTitulo(titulo: string, consulta: string): boolean {
  if (!titulo || !consulta) return false
  if (titulo.includes(consulta)) return true
  const pegada = consulta.replace(/\s+/g, '')
  // 5+ caracteres: sin ese piso, "de la" → "dela" coincidiría con cualquier
  // cosa que contenga esas letras seguidas.
  if (pegada.length < 5 || pegada === consulta) return false
  return titulo.replace(/\s+/g, '').includes(pegada)
}
