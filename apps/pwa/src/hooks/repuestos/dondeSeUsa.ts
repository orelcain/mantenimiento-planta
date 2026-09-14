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
    const clave = `${(planta ?? '').toUpperCase()}|${nombre.toUpperCase()}`
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

/** Cuántos equipos distintos: lo que dice el encabezado, y lo que la fila de la tabla cuenta. */
export function totalDondeSeUsa(grupos: readonly GrupoDondeSeUsa[]): number {
  return grupos.reduce((n, g) => n + g.unidades.length, 0)
}
