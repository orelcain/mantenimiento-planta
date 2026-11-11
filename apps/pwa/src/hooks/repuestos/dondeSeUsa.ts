/**
 * «Dónde se usa» un repuesto: los equipos agrupados por planta y familia — una sola definición.
 *
 * POR QUÉ EXISTE
 * --------------
 * El panel del repuesto agrupaba los equipos solo por NOMBRE VISIBLE. Pero los equipos se llaman
 * igual en las dos plantas: el cilindro CRHD-32-85 del Knuro (SAP 3300138386) va montado en
 * SEIS equipos —KNURO N1, N2 y N3 de Chonchi, y KNURO N1, N2 y N3 de Yal— y el panel decía:
 *
 *     Dónde se usa · 3 equipos      KNURO · N1 · N2 · N3
 *
 * mientras la fila de la tabla, dos centímetros al lado, decía «KNURO N1 +5». La cuenta mentía
 * y una planta entera desaparecía. Y cualquier enlace montado sobre esa agrupación («N1») habría
 * mandado al expediente de la planta equivocada la mitad de las veces.
 *
 * Ahora la clave es PLANTA + nombre. Chonchi-N1 y Yal-N1 son dos equipos; dos nodos duplicados
 * de la jerarquía con el mismo nombre en la MISMA planta siguen siendo uno (la deduplicación
 * original existía por eso, y se conserva).
 */

export interface EquipoDelRepuesto {
  /** nodeId de `hierarchy`. */
  machineId: string
  machineName: string
}

export interface UnidadDondeSeUsa {
  /** «N1», «N2»… o cadena vacía si el nombre no trae número de unidad. */
  unidad: string
  /** Nombre completo, para el title y el enlace. */
  nombre: string
  /** El nodo al que lleva el enlace del expediente. */
  nodeId: string
}

export interface GrupoDondeSeUsa {
  familia: string
  /** «PLANTA CHONCHI», «PLANTA YAL»… o `undefined` si el nodo no cuelga de una planta conocida. */
  planta: string | undefined
  unidades: UnidadDondeSeUsa[]
}

const UNIDAD = /^(.*\S)\s+(N[°º]?\s?\d+)$/i

/** «PLANTA CHONCHI» → «Chonchi». Para el chip: la palabra «planta» no aporta nada al lado. */
export function plantaCorta(planta: string | undefined): string {
  if (!planta) return ''
  const sin = planta.replace(/^PLANTA\s+/i, '').trim().toLowerCase()
  return sin.replace(/(^|\s)\S/g, (c) => c.toUpperCase())
}

export function agruparDondeSeUsa(
  equipos: readonly EquipoDelRepuesto[],
  plantaDe: (nodeId: string) => string | undefined = () => undefined,
): GrupoDondeSeUsa[] {
  const vistos = new Set<string>()
  const grupos = new Map<string, GrupoDondeSeUsa>()

  for (const e of equipos) {
    const nombre = (e.machineName || '').trim()
    if (!e.machineId || !nombre) continue
    const planta = plantaDe(e.machineId)
    // PLANTA + nombre: el mismo nombre en dos plantas son dos equipos; dos nodos repetidos de la
    // jerarquía en la misma planta, uno solo.
    const clave = claveDeEquipo(nombre, planta)
    if (vistos.has(clave)) continue
    vistos.add(clave)

    const m = nombre.match(UNIDAD)
    const familia = m?.[1] ?? nombre
    const unidad = m?.[2]?.toUpperCase().replace(/\s+/g, '') ?? ''
    const claveGrupo = `${(planta ?? '').toUpperCase()}|${familia.toUpperCase()}`
    const g = grupos.get(claveGrupo) ?? { familia, planta, unidades: [] }
    g.unidades.push({ unidad, nombre, nodeId: e.machineId })
    grupos.set(claveGrupo, g)
  }

  for (const g of grupos.values()) {
    g.unidades.sort((a, b) => a.unidad.localeCompare(b.unidad, 'es', { numeric: true }))
  }
  // Mismo orden en cada render: por familia y, dentro de ella, por planta.
  return [...grupos.values()].sort(
    (a, b) => a.familia.localeCompare(b.familia, 'es') || (a.planta ?? '').localeCompare(b.planta ?? '', 'es'),
  )
}

/** La identidad visible de un equipo: PLANTA + nombre, en mayúsculas. */
export function claveDeEquipo(nombre: string, planta: string | undefined): string {
  return `${(planta ?? '').toUpperCase()}|${nombre.trim().toUpperCase()}`
}

export interface OpcionDeEquipo {
  /** `claveDeEquipo` — lo que guarda el filtro. */
  valor: string
  /** El nombre, y la planta solo si ese nombre existe en más de una. */
  etiqueta: string
  nodeIds: string[]
}

/**
 * Las opciones del filtro «Equipo» de Repuestos.
 *
 * El filtro armaba sus opciones con `equipos[0]` —el PRIMER equipo de cada repuesto— y después
 * filtraba por CUALQUIERA, comparando el nombre. Medido el 14-09: de 70 nombres con repuestos,
 * 11 no aparecían nunca (KNURO N2 y N3, EVISCERADORA BAADER 142 N2 y N3, ENZUNCHADORA N2 y N3…:
 * siempre van detrás de la N1), y elegir «KNURO N1» traía mezclados el de Chonchi y el de Yal.
 */
export function opcionesDeEquipo(
  equipos: Iterable<EquipoDelRepuesto>,
  plantaDe: (nodeId: string) => string | undefined = () => undefined,
): OpcionDeEquipo[] {
  const porClave = new Map<string, { nombre: string; planta: string | undefined; nodeIds: Set<string> }>()
  const plantasPorNombre = new Map<string, Set<string>>()
  for (const e of equipos) {
    const nombre = (e.machineName || '').trim()
    if (!e.machineId || !nombre) continue
    const planta = plantaDe(e.machineId)
    const clave = claveDeEquipo(nombre, planta)
    const o =porClave.get(clave) ?? { nombre, planta, nodeIds: new Set<string>() }
    o.nodeIds.add(e.machineId)
    porClave.set(clave, o)
    const n = nombre.toUpperCase()
    const ps = plantasPorNombre.get(n) ?? new Set<string>()
    ps.add((planta ?? '').toUpperCase())
    plantasPorNombre.set(n, ps)
  }
  return [...porClave.entries()]
    .map(([valor, o]) => {
      const repetido = (plantasPorNombre.get(o.nombre.toUpperCase())?.size ?? 0) > 1
      const donde = plantaCorta(o.planta) || 'sin planta'
      return { valor, etiqueta: repetido ? `${o.nombre} · ${donde}` : o.nombre, nodeIds: [...o.nodeIds] }
    })
    .sort((a, b) => a.etiqueta.localeCompare(b.etiqueta, 'es', { numeric: true }))
}

/**
 * Qué equipo nombra la columna «Equipo» de una fila, y cuántos más hay.
 *
 * Mostraba siempre `equipos[0]`. Medido el 14-09 filtrando «KNURO N2 · Yal»: 23 de las 25 filas
 * de la página decían «KNURO N1 +5» — el equipo que NO estabas mirando. Y el cilindro 3300138387
 * decía «Sin equipo +6»: tiene un documento duplicado sin equipos, cuyo marcador (`machineId`
 * vacío) llegaba primero y se contaba como un equipo más.
 *
 * `preferir` elige el equipo del filtro o del foco; sin él, el primero REAL.
 */
export function equipoParaMostrar(
  equipos: readonly EquipoDelRepuesto[],
  preferir?: (e: EquipoDelRepuesto) => boolean,
): { nombre: string; mas: number } {
  const reales = equipos.filter((e) => e.machineId)
  if (reales.length === 0) return { nombre: 'Transversal', mas: 0 }
  const principal = (preferir && reales.find(preferir)) || reales[0]!
  return { nombre: principal.machineName || principal.machineId, mas: reales.length - 1 }
}

/** Cuántos equipos distintos: lo que dice el encabezado, y lo que la fila de la tabla cuenta. */
export function totalDondeSeUsa(grupos: readonly GrupoDondeSeUsa[]): number {
  return grupos.reduce((n, g) => n + g.unidades.length, 0)
}

/**
 * Plantas que Repuestos no muestra en «Dónde se usa» ni en los botones de equipo (pedido de
 * Mantención 15-10-2026: Yal no interesa por ahora). Solo afecta la PRESENTACIÓN: los datos y
 * la búsqueda no cambian. Para volver a mostrarla, vaciar la lista.
 */
export const PLANTAS_OCULTAS_EN_REPUESTOS: readonly string[] = ['yal']

/** Equipos sin los de plantas ocultas (ver `PLANTAS_OCULTAS_EN_REPUESTOS`). */
export function equiposVisiblesEnRepuestos<T extends EquipoDelRepuesto>(
  equipos: readonly T[],
  plantaDe: (nodeId: string) => string | undefined = () => undefined,
): T[] {
  if (PLANTAS_OCULTAS_EN_REPUESTOS.length === 0) return [...equipos]
  return equipos.filter((e) => !PLANTAS_OCULTAS_EN_REPUESTOS.includes(plantaCorta(plantaDe(e.machineId)).toLowerCase()))
}

/**
 * Detalle compacto de las unidades de una familia en una planta:
 *  - Baader 142: modelo y no unidad — N1 es la antigua; N2 y N3, la nueva (iguales entre sí).
 *  - Si la pieza va en TODAS las unidades de la familia en esa planta: «todas».
 *  - Si no: las unidades («N1 N3»). Familia sin numeración: sin detalle.
 */
export type DetalleUnidades =
  | { tipo: 'ninguno' }
  | { tipo: 'texto'; texto: string; nodeIds: string[] }
  | { tipo: 'unidades'; unidades: UnidadDondeSeUsa[] }

export function detalleUnidades(g: GrupoDondeSeUsa, totalUnidades?: number): DetalleUnidades {
  const conNumero = g.unidades.filter((u) => u.unidad)
  if (conNumero.length === 0) return { tipo: 'ninguno' }
  const ids = g.unidades.map((u) => u.nodeId)
  if (/BAADER\s*142/i.test(g.familia)) {
    const antigua = conNumero.some((u) => u.unidad === 'N1')
    const nueva = conNumero.some((u) => u.unidad === 'N2' || u.unidad === 'N3')
    if (antigua && nueva) return { tipo: 'texto', texto: 'antigua y nueva', nodeIds: ids }
    if (antigua) return { tipo: 'texto', texto: 'antigua', nodeIds: ids }
    if (nueva) return { tipo: 'texto', texto: 'nueva', nodeIds: ids }
  }
  if (totalUnidades && conNumero.length >= totalUnidades && totalUnidades > 1) return { tipo: 'texto', texto: 'todas', nodeIds: ids }
  return { tipo: 'unidades', unidades: g.unidades }
}
