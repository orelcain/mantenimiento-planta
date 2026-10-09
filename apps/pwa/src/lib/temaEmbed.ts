/**
 * Contrato de tema para los iframes de la app (ver public/embed-tema.js).
 *
 * El padre resuelve los colores del tema ACTUAL con getComputedStyle y los manda por postMessage:
 *   { type: 'app:tema', oscuro, colores: { fondo, superficie, tinta, tinta2, linea, acento } }
 * Los tokens de la app son tripletas «R G B» (`--background: 242 241 236`); aquí se convierten a
 * `rgb(r, g, b)`. Puro: recibe cómo leer una variable, así se prueba sin DOM.
 */

export interface ColoresTema {
  fondo: string
  superficie: string
  tinta: string
  tinta2: string
  linea: string
  acento: string
}

export interface MensajeTema {
  type: 'app:tema'
  oscuro: boolean
  colores: ColoresTema
}

/** Token de la app que alimenta cada color del contrato. */
const TOKENS: Record<keyof ColoresTema, string> = {
  fondo: '--background',
  superficie: '--card',
  tinta: '--foreground',
  tinta2: '--muted-foreground',
  linea: '--border',
  acento: '--brand',
}

/** Si un token no se puede leer (p. ej. antes de que cargue el CSS): Pizarra Día y Penumbra. */
const RESPALDO: Record<'dia' | 'penumbra', ColoresTema> = {
  dia: { fondo: '#F2F1EC', superficie: '#FFFFFF', tinta: '#1D1D1C', tinta2: '#4E4D4A', linea: '#D4D3CF', acento: '#2A6BA6' },
  penumbra: { fondo: '#171614', superficie: '#222120', tinta: '#E8E2D7', tinta2: '#BDB6AA', linea: '#3E3D3A', acento: '#7DB4EE' },
}

/** «242 241 236» → «rgb(242, 241, 236)»; cualquier otra cosa → null. */
export function tripletaARgb(raw: string): string | null {
  const m = raw.trim().match(/^(\d{1,3})[\s,]+(\d{1,3})[\s,]+(\d{1,3})$/)
  if (!m) return null
  const [r, g, b] = [m[1], m[2], m[3]].map(Number) as [number, number, number]
  if (r > 255 || g > 255 || b > 255) return null
  return `rgb(${r}, ${g}, ${b})`
}

export function resolverTema(leerVariable: (nombre: string) => string, oscuro: boolean): MensajeTema {
  const resp = RESPALDO[oscuro ? 'penumbra' : 'dia']
  const colores = {} as ColoresTema
  for (const k of Object.keys(TOKENS) as (keyof ColoresTema)[]) {
    colores[k] = tripletaARgb(leerVariable(TOKENS[k])) ?? resp[k]
  }
  return { type: 'app:tema', oscuro, colores }
}

/** Tema que se ve AHORA en la ventana (lee el DOM). */
export function temaActual(): MensajeTema {
  const root = document.documentElement
  const cs = getComputedStyle(root)
  return resolverTema((n) => cs.getPropertyValue(n), root.classList.contains('dark'))
}
