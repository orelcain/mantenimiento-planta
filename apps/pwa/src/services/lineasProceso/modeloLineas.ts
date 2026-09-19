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
 *
 * SERVICIOS DE APOYO (Orel, 19-09-2026): Caseta agua mar, estanques de agua, Planta
 * RILES, sala de máquinas… no detienen la línea directo pero influyen. Viven en una
 * zona de tipo `apoyo`; sus flechas son «abastece a» (servicio → línea) o «recibe de»
 * (línea → servicio) y NO entran al cálculo de pesos: si RILES falla, la línea sigue
 * un rato y el efecto no es proporcional (mezclarlo falsearía los pesos).
 */

export interface LineaProceso {
  id: string
  nombre: string
  /** `apoyo` = zona de servicios que influyen indirectamente (sin entrada ni pesos). */
  tipo?: 'linea' | 'apoyo'
  /** Zona del lienzo (px del lienzo): solo dibujo. */
  zona: { x: number; y: number; w: number; h: number }
}

export interface NodoGrafo {
  /** Id del equipo en `hierarchy`, o `in:<lineaId>` para la entrada de una línea. */
  id: string
  x: number
  y: number
  /**
   * Contenedor (zona) al que PERTENECE — explícito, no por dónde está dibujado (Orel,
   * 19-09-2026: el contenedor crece con sus equipos; entrar o salir se confirma).
   * Sin el campo (guardados antiguos) se deduce por la posición; `''` = sin contenedor.
   */
  zona?: string
  /** Solo los elementos MANUALES (`manual:…`, creados en el editor, que no están en el árbol). */
  nombre?: string
}

export const PREFIJO_MANUAL = 'manual:'
export const esManual = (id: string) => id.startsWith(PREFIJO_MANUAL)

export interface GrafoLineas {
  version: 1
  lineas: LineaProceso[]
  nodos: NodoGrafo[]
  /** [origen, destino]. */
  aristas: [string, string][]
}

/** Tamaño de la tarjeta de un equipo en el lienzo (px): para saber en qué zona cae su centro. */
export const NODO = { ancho: 176, alto: 62 }
/** Tamaño de la píldora «Entrada …». */
export const ENTRADA = { ancho: 124, alto: 44 }
/** Aire entre el contenedor y sus equipos (arriba deja lugar para el título). */
export const MARGEN_ZONA = { lado: 24, arriba: 48, abajo: 24 }

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
  const servicios = serviciosDe(g)
  const salidas = new Map<string, string[]>()
  for (const [a, b] of g.aristas) {
    // Las flechas de los servicios de apoyo son indirectas: no reparten flujo.
    if (!existe.has(a) || !existe.has(b) || a === b || servicios.has(a) || servicios.has(b)) continue
    const lista = salidas.get(a) ?? []
    if (!lista.includes(b)) lista.push(b)
    salidas.set(a, lista)
  }
  const res = new Map<string, PesoEnLinea>()
  for (const l of g.lineas) {
    if (l.tipo === 'apoyo') continue
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

/** El contenedor al que pertenece un nodo: el explícito, el de su entrada, o el que tiene debajo. */
export function zonaDeNodo(lineas: readonly LineaProceso[], n: NodoGrafo): string | undefined {
  if (esEntrada(n.id)) return lineaDeEntrada(n.id)
  if (n.zona === '') return undefined
  if (n.zona && lineas.some((l) => l.id === n.zona)) return n.zona
  return lineaEnPunto(lineas, n.x + NODO.ancho / 2, n.y + NODO.alto / 2)?.id
}

/**
 * Límites de cada contenedor: su tamaño guardado AMPLIADO para que entren todos sus
 * equipos, hacia cualquier lado (si un equipo se empuja arriba o a la izquierda, el
 * contenedor lo sigue).
 */
export function limitesDeZonas(g: Pick<GrafoLineas, 'lineas' | 'nodos'>): Map<string, LineaProceso['zona']> {
  const out = new Map<string, LineaProceso['zona']>()
  for (const l of g.lineas) {
    let x1 = l.zona.x
    let y1 = l.zona.y
    let x2 = l.zona.x + l.zona.w
    let y2 = l.zona.y + l.zona.h
    for (const n of g.nodos) {
      if (zonaDeNodo(g.lineas, n) !== l.id) continue
      const t = esEntrada(n.id) ? ENTRADA : NODO
      x1 = Math.min(x1, n.x - MARGEN_ZONA.lado)
      y1 = Math.min(y1, n.y - MARGEN_ZONA.arriba)
      x2 = Math.max(x2, n.x + t.ancho + MARGEN_ZONA.lado)
      y2 = Math.max(y2, n.y + t.alto + MARGEN_ZONA.abajo)
    }
    out.set(l.id, { x: x1, y: y1, w: x2 - x1, h: y2 - y1 })
  }
  return out
}

/** Los equipos que PERTENECEN a una zona de servicios de apoyo. */
export function serviciosDe(g: Pick<GrafoLineas, 'lineas' | 'nodos'>): Set<string> {
  const apoyo = new Set(g.lineas.filter((l) => l.tipo === 'apoyo').map((l) => l.id))
  const out = new Set<string>()
  if (!apoyo.size) return out
  for (const n of g.nodos) {
    if (esEntrada(n.id)) continue
    const z = zonaDeNodo(g.lineas, n)
    if (z && apoyo.has(z)) out.add(n.id)
  }
  return out
}

export interface RelacionServicio {
  /** Líneas a las que abastece (flecha servicio → línea). */
  abastece: string[]
  /** Líneas de las que recibe (flecha línea → servicio), p. ej. RILES recibe vísceras de Eviscerado. */
  recibe: string[]
}

/** Qué líneas toca cada servicio de apoyo, según sus flechas (lineaId, sin repetir). */
export function relacionesDeServicios(g: Pick<GrafoLineas, 'lineas' | 'nodos' | 'aristas'>, pesos: Map<string, PesoEnLinea>): Map<string, RelacionServicio> {
  const servicios = serviciosDe(g)
  const lineaDe = (id: string) => (esEntrada(id) ? lineaDeEntrada(id) : pesos.get(id)?.lineaId)
  const out = new Map<string, RelacionServicio>()
  const de = (id: string) => {
    const r = out.get(id) ?? { abastece: [], recibe: [] }
    out.set(id, r)
    return r
  }
  for (const s of servicios) de(s)
  for (const [a, b] of g.aristas) {
    if (servicios.has(a) && !servicios.has(b)) {
      const l = lineaDe(b)
      if (l && !de(a).abastece.includes(l)) de(a).abastece.push(l)
    } else if (servicios.has(b) && !servicios.has(a)) {
      const l = lineaDe(a)
      if (l && !de(b).recibe.includes(l)) de(b).recibe.push(l)
    }
  }
  return out
}

/** La línea en cuya zona cae un punto (para decir «fuera de la línea · Eviscerado»). */
export function lineaEnPunto(lineas: readonly LineaProceso[], x: number, y: number): LineaProceso | undefined {
  return lineas.find((l) => x >= l.zona.x && x < l.zona.x + l.zona.w && y >= l.zona.y && y < l.zona.y + l.zona.h)
}
