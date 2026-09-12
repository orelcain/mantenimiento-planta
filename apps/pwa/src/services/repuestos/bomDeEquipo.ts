/**
 * Parte los repuestos de un equipo en lo que se puede pedir y lo que no.
 *
 * **El problema, medido en la Baader 142 N1:** el expediente listaba los 1.804
 * repuestos ligados al equipo en un solo orden alfabético. De esos, **476 tienen
 * código SAP** —son la lista de materiales que se carga en IB01, y 475 traen
 * cantidad por máquina— y **1.328 no lo tienen**: son el despiece del
 * fabricante, que sirve para identificar una pieza en el plano y no para
 * pedirla. Mezclados, lo primero que se veía era «Abrazadera de manguera»
 * cuatro veces seguidas, sin código.
 *
 * Y el despiece se repite mucho: 1.328 filas son solo **648 nombres distintos**
 * («Soporte» aparece 58 veces, «Tornillo hexagonal» 38). Agrupado por nombre se
 * lee; fila por fila, no.
 *
 * Las seis Baader 142 —N1, N2 y N3 en Chonchi y en Yal— llevan los mismos 476
 * con las mismas cantidades, porque es la misma máquina.
 *
 * El corte NO se inventa acá: es `esCodigoSapValido`, el mismo que decide qué
 * entra en el export IB01.
 */
import { esCodigoSapValido, deriveCentro } from '@/utils/repuestos/exportBomSAP'
import { normalizeForSearch, haystackMatchesAll } from '@/utils/repuestos/searchNormalize'

/** Lo mínimo que necesita la partición; `useRepuestosDeEquipo` devuelve esto. */
export interface RepuestoParticionable {
  id: string
  codigoSAP: string
  nombre: string
  tipo?: string
  cantidadPorMaquina?: number
}

/** Un nombre del despiece y cuántas veces aparece en el equipo. */
export interface GrupoDespiece {
  nombre: string
  tipo?: string
  veces: number
  /** Los ids de todas las filas del grupo, para poder desvincularlas. */
  ids: string[]
}

export interface ParticionDeEquipo<T extends RepuestoParticionable> {
  /** Con código SAP, ordenados por código: la lista de materiales. */
  bom: T[]
  /** Sin código, agrupados por nombre y ordenados por cantidad descendente. */
  despiece: GrupoDespiece[]
  /** Cuántas filas sin código hay en total (no cuántos grupos). */
  filasSinCodigo: number
}

export function particionarRepuestosDeEquipo<T extends RepuestoParticionable>(
  repuestos: readonly T[],
): ParticionDeEquipo<T> {
  const bom: T[] = []
  const grupos = new Map<string, GrupoDespiece>()

  for (const r of repuestos) {
    if (esCodigoSapValido(r.codigoSAP)) {
      bom.push(r)
      continue
    }
    const clave = r.nombre.trim().toLowerCase()
    const previo = grupos.get(clave)
    if (previo) {
      previo.veces++
      previo.ids.push(r.id)
      // El tipo puede faltar en unas filas y estar en otras: vale la que lo trae.
      if (!previo.tipo && r.tipo) previo.tipo = r.tipo
    } else {
      grupos.set(clave, { nombre: r.nombre, tipo: r.tipo, veces: 1, ids: [r.id] })
    }
  }

  bom.sort((a, b) => a.codigoSAP.localeCompare(b.codigoSAP))
  const despiece = [...grupos.values()].sort(
    (a, b) => b.veces - a.veces || a.nombre.localeCompare(b.nombre, 'es'),
  )

  return {
    bom,
    despiece,
    filasSinCodigo: despiece.reduce((s, g) => s + g.veces, 0),
  }
}

/**
 * La cabecera IB01 de un equipo, sacada de su ficha.
 *
 * Devuelve null cuando el equipo **no tiene código SAP**: sin ese número no hay
 * cabecera posible —es el equipo contra el que se carga la lista— y ofrecer el
 * export sería prometer algo que SAP va a rechazar.
 *
 * ⚠️ El **centro sale del árbol, nunca del nombre**: los equipos se llaman igual
 * en las dos plantas (hay una «EVISCERADORA BAADER 142 N3» en Chonchi y otra en
 * Yal), así que tomarlo del nombre significaría cargar la lista de una planta
 * contra el centro de la otra.
 */
export function opcionesBomDesdeEquipo(equipo: {
  codigo?: string
  nombre?: string
  hierarchyPath?: string
}): { equipoCodigo: string; equipoNombre: string; centro: string } | null {
  const codigo = (equipo.codigo ?? '').trim()
  if (!codigo) return null
  const ancestros = (equipo.hierarchyPath ?? '').split('>').map((s) => s.trim()).filter(Boolean)
  return {
    equipoCodigo: codigo,
    equipoNombre: (equipo.nombre ?? '').trim() || codigo,
    centro: deriveCentro(ancestros),
  }
}


/**
 * Filtra los materiales de un equipo por código SAP, nombre o tipo.
 *
 * Con 476 en la lista de materiales y 1.328 de despiece, encontrar una pieza
 * scrolleando no es viable. Usa el mismo normalizador que los buscadores del
 * módulo Repuestos —sin acentos, y con variantes de plural, así que «guantes»
 * encuentra «GUANTE ANTICORTE»— para que buscar lo mismo dé lo mismo en los dos
 * lados de la app.
 *
 * Filtra ANTES de partir: así los contadores de cada grupo hablan de lo que se
 * está viendo, no del total.
 */
export function filtrarRepuestosDeEquipo<T extends RepuestoParticionable>(
  repuestos: readonly T[],
  consulta: string,
): T[] {
  const q = normalizeForSearch(consulta)
  if (!q) return [...repuestos]
  const terminos = q.split(' ').filter(Boolean)
  return repuestos.filter((r) =>
    haystackMatchesAll(normalizeForSearch(`${r.codigoSAP} ${r.nombre} ${r.tipo ?? ''}`), terminos),
  )
}
