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
