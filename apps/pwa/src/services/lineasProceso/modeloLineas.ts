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
  /** Grupos en paralelo marcados a mano (los evidentes se deducen del grafo). */
  grupos?: GrupoParalelo[]
  /** Puntos por los que se hace pasar una flecha, para acomodarla a mano. */
  curvas?: CurvaFlecha[]
}

/**
 * Una flecha acomodada a mano: pasa por estos puntos, en orden, con curva suave
 * (Orel, 19-09-2026: «ordenar las líneas como si fueran cuerdas»).
 */
export interface CurvaFlecha {
  a: string
  b: string
  puntos: { x: number; y: number }[]
}

/**
 * Camino suave que pasa por todos los puntos (Catmull-Rom convertido a Bézier): curvas
 * redondas, nunca ángulos rectos, que es lo que Orel pidió del diagrama.
 */
export function caminoSuave(puntos: readonly { x: number; y: number }[]): string {
  if (puntos.length < 2) return ''
  const p = puntos
  let d = `M${p[0]!.x},${p[0]!.y}`
  for (let i = 0; i < p.length - 1; i++) {
    const p0 = p[i - 1] ?? p[i]!
    const p1 = p[i]!
    const p2 = p[i + 1]!
    const p3 = p[i + 2] ?? p2
    const c1 = { x: p1.x + (p2.x - p0.x) / 6, y: p1.y + (p2.y - p0.y) / 6 }
    const c2 = { x: p2.x - (p3.x - p1.x) / 6, y: p2.y - (p3.y - p1.y) / 6 }
    d += ` C${c1.x},${c1.y} ${c2.x},${c2.y} ${p2.x},${p2.y}`
  }
  return d
}

/**
 * Un grupo en paralelo hecho a mano: sirve donde el reparto no se deduce solo (ramas con
 * cuotas distintas, equipos que no cuelgan del mismo padre) o donde Orel quiere dejarlo
 * dicho explícitamente en otra área (19-09-2026).
 */
export interface GrupoParalelo {
  id: string
  miembros: string[]
  /** Nombre propio; si falta, se rotula «Paralelo · N ramas». */
  nombre?: string
}

/**
 * Id de un contenedor nuevo a partir de su nombre, sin chocar con los que ya existen
 * (el id viaja en `NodoGrafo.zona` y en `in:<id>`: cambiarlo después rompería lo guardado).
 */
export function idDeContenedor(nombre: string, usados: readonly string[]): string {
  const base =
    nombre
      .toLowerCase()
      .normalize('NFD')
      .replace(/[\u0300-\u036f]/g, '')
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-|-$/g, '') || 'linea'
  let id = base
  for (let i = 2; usados.includes(id); i++) id = `${base}-${i}`
  return id
}

/** Caja de un contenedor nuevo: a la derecha de todo, que es como fluye la planta. */
export function cajaNueva(cajas: Iterable<LineaProceso['zona']>, w = 560, h = 360): LineaProceso['zona'] {
  const todas = [...cajas]
  return {
    x: todas.length ? Math.round(Math.max(...todas.map((z) => z.x + z.w)) + 80) : 0,
    y: todas.length ? Math.round(Math.min(...todas.map((z) => z.y))) : 0,
    w,
    h,
  }
}

/**
 * ¿Una flecha `a → b` cerraría un círculo? (`b` ya llega hasta `a`). El reparto del flujo
 * necesita que el grafo no tenga vueltas: en un círculo no se puede repartir y los equipos
 * quedan sin porcentaje (`PesoEnLinea.ciclo`). Mejor no dejar armarlo que avisar después.
 */
export function cierraCiclo(aristas: readonly (readonly [string, string])[], a: string, b: string): boolean {
  if (a === b) return true
  const salidas = new Map<string, string[]>()
  for (const [x, y] of aristas) salidas.set(x, [...(salidas.get(x) ?? []), y])
  const visto = new Set<string>()
  const pila = [b]
  while (pila.length) {
    const n = pila.pop()!
    if (n === a) return true
    if (visto.has(n)) continue
    visto.add(n)
    for (const s of salidas.get(n) ?? []) pila.push(s)
  }
  return false
}

/**
 * Flechas que hay que agregar al sacar equipos del medio para que el flujo no quede cortado:
 * en `A → B → C`, si se va B, queda `A → C` (patrón «Delete Middle Node» de React Flow).
 * Cruza varios seguidos, no repite lo que ya existe y no arma círculos.
 */
export function puentesAlQuitar(aristas: readonly (readonly [string, string])[], quitados: readonly string[]): [string, string][] {
  const fuera = new Set(quitados)
  const salidas = new Map<string, string[]>()
  for (const [x, y] of aristas) salidas.set(x, [...(salidas.get(x) ?? []), y])
  const existe = new Set(aristas.map(([x, y]) => `${x}->${y}`))
  const quedan = aristas.filter(([x, y]) => !fuera.has(x) && !fuera.has(y)) as [string, string][]
  const out: [string, string][] = []
  const puesto = new Set<string>()
  for (const [a, b] of aristas) {
    if (fuera.has(a) || !fuera.has(b)) continue
    const visto = new Set<string>()
    const pila = [b]
    while (pila.length) {
      const n = pila.pop()!
      if (visto.has(n)) continue
      visto.add(n)
      for (const s of salidas.get(n) ?? []) {
        if (fuera.has(s)) {
          pila.push(s)
          continue
        }
        const llave = `${a}->${s}`
        if (s === a || existe.has(llave) || puesto.has(llave)) continue
        if (cierraCiclo([...quedan, ...out], a, s)) continue
        puesto.add(llave)
        out.push([a, s])
      }
    }
  }
  return out
}

/** Dónde queda cada equipo después de acomodar. */
export interface Acomodo {
  id: string
  x: number
  y: number
}

/** Aire entre capas y entre ramas al acomodar. */
export const ACOMODO = { entreCapas: 72, entreRamas: 28, sueltos: 56 }

/**
 * Acomoda los equipos de un contenedor de izquierda a derecha siguiendo el flujo: cada uno
 * va una capa más a la derecha que el que lo alimenta (capa = el camino MÁS LARGO desde la
 * entrada, así nada queda a la izquierda de quien lo alimenta) y las ramas de una misma capa
 * se apilan en el orden en que ya estaban, para que el dibujo no dé un salto.
 *
 * Lo que no cuelga del flujo —y lo que quedó en un círculo— va en una fila aparte, abajo.
 * No toca contenedores ni flechas: solo devuelve posiciones.
 */
export function acomodarEnCapas(
  g: Pick<GrafoLineas, 'lineas' | 'nodos' | 'aristas'>,
  lineaId: string,
  medidas: { nodo: typeof NODO; entrada: typeof ENTRADA; margen: typeof MARGEN_ZONA } = { nodo: NODO, entrada: ENTRADA, margen: MARGEN_ZONA },
): Acomodo[] {
  const linea = g.lineas.find((l) => l.id === lineaId)
  if (!linea) return []
  const dentro = g.nodos.filter((n) => zonaDeNodo(g.lineas, n) === lineaId)
  if (!dentro.length) return []
  const ids = new Set(dentro.map((n) => n.id))
  const salidas = new Map<string, string[]>()
  const entran = new Map<string, number>()
  for (const [a, b] of g.aristas) {
    if (!ids.has(a) || !ids.has(b) || a === b) continue
    const lista = salidas.get(a) ?? []
    if (lista.includes(b)) continue
    lista.push(b)
    salidas.set(a, lista)
    entran.set(b, (entran.get(b) ?? 0) + 1)
  }
  // Capa por camino más largo (Kahn). Lo que queda atascado está en un círculo.
  const capa = new Map<string, number>()
  const pendientes = new Map(dentro.map((n) => [n.id, entran.get(n.id) ?? 0]))
  const cola = dentro.filter((n) => !(entran.get(n.id) ?? 0)).map((n) => n.id)
  for (const id of cola) capa.set(id, 0)
  while (cola.length) {
    const n = cola.shift()!
    for (const s of salidas.get(n) ?? []) {
      capa.set(s, Math.max(capa.get(s) ?? 0, (capa.get(n) ?? 0) + 1))
      const p = (pendientes.get(s) ?? 1) - 1
      pendientes.set(s, p)
      if (p === 0) cola.push(s)
    }
  }
  const conCapa = dentro.filter((n) => capa.has(n.id) && (salidas.has(n.id) || (entran.get(n.id) ?? 0) > 0))
  const sueltos = dentro.filter((n) => !conCapa.includes(n))
  const porCapa = new Map<number, NodoGrafo[]>()
  for (const n of conCapa) {
    const c = capa.get(n.id) ?? 0
    porCapa.set(c, [...(porCapa.get(c) ?? []), n])
  }
  const x0 = linea.zona.x + medidas.margen.lado
  const y0 = linea.zona.y + medidas.margen.arriba
  const out: Acomodo[] = []
  let abajo = y0
  for (const [c, lista] of [...porCapa.entries()].sort((a, b) => a[0] - b[0])) {
    // Se respeta el orden de arriba a abajo que ya tenían: acomodar no debe barajar.
    const ordenada = [...lista].sort((a, b) => a.y - b.y)
    ordenada.forEach((n, i) => {
      const alto = esEntrada(n.id) ? medidas.entrada.alto : medidas.nodo.alto
      const ancho = esEntrada(n.id) ? medidas.entrada.ancho : medidas.nodo.ancho
      out.push({
        id: n.id,
        x: Math.round(x0 + c * (medidas.nodo.ancho + ACOMODO.entreCapas) + (medidas.nodo.ancho - ancho) / 2),
        y: Math.round(y0 + i * (medidas.nodo.alto + ACOMODO.entreRamas) + (medidas.nodo.alto - alto) / 2),
      })
    })
    abajo = Math.max(abajo, y0 + ordenada.length * (medidas.nodo.alto + ACOMODO.entreRamas))
  }
  // Los que no cuelgan del flujo: en filas abajo, sin mezclarse con la cadena.
  sueltos
    .sort((a, b) => a.y - b.y || a.x - b.x)
    .forEach((n, i) => {
      out.push({
        id: n.id,
        x: Math.round(x0 + (i % 5) * (medidas.nodo.ancho + ACOMODO.entreRamas)),
        y: Math.round(abajo + ACOMODO.sueltos + Math.floor(i / 5) * (medidas.nodo.alto + ACOMODO.entreRamas)),
      })
    })
  return out
}

/** Tamaño de la tarjeta de un equipo en el lienzo (px): para saber en qué zona cae su centro. */
export const NODO = { ancho: 188, alto: 68 }
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
  /**
   * La máquina está dentro de un CÍRCULO de flechas (A → B → A): el flujo no se puede
   * repartir y queda en 0. Hay que decirlo, si no el 0 % parece un error del editor
   * (Orel, 19-09-2026: Acopio entero marcaba 0 % por una flecha de vuelta).
   */
  ciclo?: boolean
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
      const atascado = !!pendientes.get(n)
      res.set(n, { lineaId: l.id, peso: atascado ? 0 : Math.min(1, flujo.get(n) ?? 0), ...(atascado ? { ciclo: true } : {}) })
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

/** Caja que envuelve a un conjunto de equipos del lienzo, con aire alrededor. */
export function limitesDeGrupo(nodos: readonly NodoGrafo[], miembros: readonly string[], aire = 14): { x: number; y: number; w: number; h: number } | undefined {
  const cajas = nodos.filter((n) => miembros.includes(n.id))
  if (cajas.length < 2) return undefined
  const t = (n: NodoGrafo) => (esEntrada(n.id) ? ENTRADA : NODO)
  const x1 = Math.min(...cajas.map((c) => c.x))
  const y1 = Math.min(...cajas.map((c) => c.y))
  const x2 = Math.max(...cajas.map((c) => c.x + t(c).ancho))
  const y2 = Math.max(...cajas.map((c) => c.y + t(c).alto))
  return { x: x1 - aire, y: y1 - aire, w: x2 - x1 + aire * 2, h: y2 - y1 + aire * 2 }
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
