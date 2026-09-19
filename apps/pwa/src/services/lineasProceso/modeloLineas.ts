/**
 * Líneas de proceso de la planta como GRAFO (idea de Orel, 19-09-2026; prototipo
 * https://claude.ai/artifact/G4KbK1RAYafiJXabWQGFNf).
 *
 * «Tiempo reloj no es lo mismo que tiempo máquina»: si para 1 de las 3 Baader 142,
 * Eviscerado pierde el 33,3 % de su capacidad, no el 100 %. Cada línea tiene una
 * ENTRADA; las flechas son el flujo del producto. El peso de cada máquina en su
 * línea SE CALCULA: el flujo entra al 100 % y se reparte en partes iguales en cada
 * bifurcación (3 ramas → 33,3 %; al juntarse vuelve a 100 %). Lo que no queda
 * conectado desde la entrada está fuera de la línea (0 %). Una flecha hacia la
 * entrada de OTRA línea marca la cadena entre líneas y ahí se corta el cálculo.
 *
 * Supuesto declarado: las ramas en paralelo tienen la misma capacidad.
 */

export interface LineaProceso {
  id: string
  nombre: string
  /** Zona del lienzo (px del lienzo): solo dibujo. */
  zona: { x: number; y: number; w: number; h: number }
}

export interface NodoGrafo {
  /** Id del equipo en `hierarchy`, o `in:<lineaId>` para la entrada de una línea. */
  id: string
  x: number
  y: number
}

export interface GrafoLineas {
  version: 1
  lineas: LineaProceso[]
  nodos: NodoGrafo[]
  /** [origen, destino]. */
  aristas: [string, string][]
}

export const PREFIJO_ENTRADA = 'in:'
export const esEntrada = (id: string) => id.startsWith(PREFIJO_ENTRADA)
export const lineaDeEntrada = (id: string) => id.slice(PREFIJO_ENTRADA.length)

export interface PesoEnLinea {
  lineaId: string
  /** Parte del flujo de su línea que pasa por la máquina (0–1). */
  peso: number
}

/**
 * Peso de cada máquina en su línea. Una máquina alcanzable desde dos entradas
 * queda en la primera línea que la alcanza (orden de `lineas`).
 */
export function pesosPorLinea(g: Pick<GrafoLineas, 'lineas' | 'nodos' | 'aristas'>): Map<string, PesoEnLinea> {
  const existe = new Set(g.nodos.map((n) => n.id))
  const salidas = new Map<string, string[]>()
  for (const [a, b] of g.aristas) {
    if (!existe.has(a) || !existe.has(b) || a === b) continue
    const lista = salidas.get(a) ?? []
    if (!lista.includes(b)) lista.push(b)
    salidas.set(a, lista)
  }
  const res = new Map<string, PesoEnLinea>()
  for (const l of g.lineas) {
    const ini = PREFIJO_ENTRADA + l.id
    if (!existe.has(ini)) continue
    // Lo alcanzable desde la entrada, sin cruzar a la entrada de otra línea.
    const alcanzables = new Set<string>()
    const pila = [ini]
    while (pila.length) {
      const n = pila.pop()!
      if (alcanzables.has(n)) continue
      alcanzables.add(n)
      for (const s of salidas.get(n) ?? []) if (!esEntrada(s)) pila.push(s)
    }
    // Flujo en orden topológico (Kahn). Un ciclo deja a sus nodos sin flujo: no se inventa.
    const pendientes = new Map<string, number>()
    for (const n of alcanzables) for (const s of salidas.get(n) ?? []) if (alcanzables.has(s)) pendientes.set(s, (pendientes.get(s) ?? 0) + 1)
    const flujo = new Map<string, number>([[ini, 1]])
    const cola = [ini]
    while (cola.length) {
      const n = cola.shift()!
      const hijos = (salidas.get(n) ?? []).filter((s) => alcanzables.has(s))
      for (const h of hijos) {
        flujo.set(h, (flujo.get(h) ?? 0) + (flujo.get(n) ?? 0) / hijos.length)
        const p = (pendientes.get(h) ?? 1) - 1
        pendientes.set(h, p)
        if (p === 0) cola.push(h)
      }
    }
    for (const n of alcanzables) {
      if (n === ini || res.has(n)) continue
      res.set(n, { lineaId: l.id, peso: pendientes.get(n) ? 0 : Math.min(1, flujo.get(n) ?? 0) })
    }
  }
  return res
}

/** «33,3 %», «100 %», «0 %». */
export function formatoPeso(p: number): string {
  const v = Math.round(p * 1000) / 10
  return `${Number.isInteger(v) ? v : v.toLocaleString('es-CL')} %`
}

/** La línea en cuya zona cae un punto (para decir «fuera de la línea · Eviscerado»). */
export function lineaEnPunto(lineas: readonly LineaProceso[], x: number, y: number): LineaProceso | undefined {
  return lineas.find((l) => x >= l.zona.x && x < l.zona.x + l.zona.w && y >= l.zona.y && y < l.zona.y + l.zona.h)
}
