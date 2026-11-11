/** Lógica pura de «Mis equipos» en PC: sección de la línea, orden y formato de cifras. */

/** Orden real del proceso; una sección que no esté aquí va al final, por nombre. */
const ORDEN_LINEA = ['sacrificio', 'eviscerado', 'emparrillado', 'filete', 'sellado', 'empaque']

export const SIN_SECCION = 'Sin sección'

/** «EVISCERADO» → «Eviscerado». */
export function nombreSeccion(nombre: string): string {
  const n = nombre.trim().toLowerCase()
  return n.charAt(0).toUpperCase() + n.slice(1)
}

/**
 * Sección de un equipo dentro de la cadena raíz → equipo: dos niveles bajo la planta
 * (Planta / Proceso / Eviscerado). Si el equipo cuelga antes, no tiene sección que mostrar.
 */
export function seccionDeCadena(cadena: readonly string[]): string | undefined {
  const i = cadena.findIndex((n) => /^PLANTA\b/i.test(n.trim()))
  // El último eslabón es el propio equipo: la sección tiene que estar antes.
  if (i < 0 || i + 2 >= cadena.length - 1) return undefined
  return cadena[i + 2]
}

export interface FilaSeccion { nombre: string; n: number }

/** Cuenta equipos por sección, en el orden de la línea. */
export function contarPorSeccion(secciones: readonly (string | undefined)[]): FilaSeccion[] {
  const m = new Map<string, number>()
  for (const s of secciones) {
    const k = s ? nombreSeccion(s) : SIN_SECCION
    m.set(k, (m.get(k) ?? 0) + 1)
  }
  const rango = (n: string) => {
    if (n === SIN_SECCION) return ORDEN_LINEA.length + 1
    const i = ORDEN_LINEA.indexOf(n.toLowerCase())
    return i < 0 ? ORDEN_LINEA.length : i
  }
  return [...m].map(([nombre, n]) => ({ nombre, n })).sort((a, b) => rango(a.nombre) - rango(b.nombre) || a.nombre.localeCompare(b.nombre, 'es'))
}

/** Primero lo que se puede elegir; dentro de cada grupo, por nombre. */
export function ordenarResultados<T extends { id: string; nombre: string }>(filas: readonly T[], yaIds: ReadonlySet<string>): T[] {
  return [...filas].sort((a, b) => Number(yaIds.has(a.id)) - Number(yaIds.has(b.id)) || a.nombre.localeCompare(b.nombre, 'es', { numeric: true }))
}

/** Sin dato: vacío. Cero: raya. El resto con separador de miles. */
export function cifra(n: number | null | undefined): string {
  if (n === null || n === undefined) return ''
  return n === 0 ? '—' : n.toLocaleString('es-CL')
}

/** Suma de una columna; en blanco mientras falte alguna fila. */
export function sumaColumna(valores: readonly (number | null | undefined)[]): number | null {
  let t = 0
  for (const v of valores) {
    if (v === null || v === undefined) return null
    t += v
  }
  return t
}
