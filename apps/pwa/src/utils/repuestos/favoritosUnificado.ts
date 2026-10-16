/**
 * «★ Favoritos» unificado: UN control sobre dos listas que siguen siendo distintas.
 *
 *   Comunes   → lista COMPARTIDA de la máquina (`comunEn` del doc + lista estática por SAP).
 *               La marca un administrador desde el panel del repuesto.
 *   Mías      → estrellas PERSONALES (`useRepuestoFavoritos`).
 *
 * Esto es solo el control: no cambia cómo se guarda ninguna de las dos.
 *
 * PUENTE MÁQUINA ↔ SLUG
 * ---------------------
 * `comunEn` guarda el slug del Centro de Aprendizaje («baader-142», «grader»…) y el hub trabaja
 * con equipos de la jerarquía («EVISCERADORA BAADER 142 N2»). No existe un mapa entre los dos, así
 * que se compara por NOMBRE: todas las palabras del nombre de la máquina del slug (sin «N1/N2…»)
 * tienen que estar en el nombre del equipo. «Evisceradora Baader 142 N3» (slug baader-142) calza
 * con «EVISCERADORA BAADER 142 N1/N2/N3» —es una familia, no una unidad— y no con «BAADER 200».
 */
import { machinesForCommonSap } from '@/data/commonPartsByMachine'
import { esComun, type FilaFiltrable } from '@/hooks/repuestos/filtrosDeRepuestos'
import type { EquipoDelRepuesto } from '@/hooks/repuestos/dondeSeUsa'

const sinTildes = (s: string): string => s.normalize('NFD').replace(/\p{M}/gu, '').toLowerCase()

/** Palabras comparables de un nombre: sin tildes, sin «N1/N2…» (la unidad no distingue la familia). */
function palabras(nombre: string): string[] {
  return sinTildes(nombre).split(/[^a-z0-9]+/).filter((p) => p && !/^n\d+$/.test(p))
}

/** ¿El nombre de la máquina del slug describe a este equipo? */
export function maquinaCalzaConEquipo(nombreMaquina: string, nombreEquipo: string): boolean {
  const m = palabras(nombreMaquina)
  if (m.length === 0) return false
  const e = new Set(palabras(nombreEquipo))
  return m.every((p) => e.has(p))
}

export interface FilaFavorita extends FilaFiltrable {
  equipos: readonly EquipoDelRepuesto[]
}

/**
 * ¿Es común EN ESE alcance? `equiposAlcance` = los equipos en foco (máquina elegida o faceta);
 * `null` = sin alcance: vale cualquier común. `nombreDeSlug` resuelve el slug a nombre de máquina.
 */
export function esComunDe(
  r: FilaFavorita,
  equiposAlcance: readonly EquipoDelRepuesto[] | null,
  nombreDeSlug: (slug: string) => string,
): boolean {
  if (!esComun(r)) return false
  if (equiposAlcance === null) return true
  const slugs = new Set<string>([
    ...((r.comunEn ?? []) as unknown[]).filter((s): s is string => typeof s === 'string'),
    ...(r.codigoSAP ? machinesForCommonSap(r.codigoSAP) : []),
  ])
  for (const slug of slugs) {
    const nombre = nombreDeSlug(slug)
    if (equiposAlcance.some((e) => maquinaCalzaConEquipo(nombre, e.machineName || ''))) return true
  }
  return false
}

export interface MarcasFavorito {
  comun: boolean
  mia: boolean
}

/** Qué es la fila dentro del alcance: común, mía o ambas. */
export function marcasDeFavorito(
  r: FilaFavorita,
  favKeys: ReadonlySet<string>,
  equiposAlcance: readonly EquipoDelRepuesto[] | null,
  nombreDeSlug: (slug: string) => string,
): MarcasFavorito {
  return { comun: esComunDe(r, equiposAlcance, nombreDeSlug), mia: favKeys.has(r.rowKey) }
}

/**
 * Filtra y ordena por favoritos: comunes primero (incluye las que además son mías), luego solo
 * mías. Sin repetir. Conserva el orden relativo dentro de cada grupo.
 */
export function particionaFavoritos<T extends FilaFavorita>(
  rows: readonly T[],
  favKeys: ReadonlySet<string>,
  alcanceDe: (r: T) => readonly EquipoDelRepuesto[] | null,
  nombreDeSlug: (slug: string) => string,
): { comunes: T[]; mias: T[] } {
  const comunes: T[] = []
  const mias: T[] = []
  for (const r of rows) {
    const m = marcasDeFavorito(r, favKeys, alcanceDe(r), nombreDeSlug)
    if (m.comun) comunes.push(r)
    else if (m.mia) mias.push(r)
  }
  return { comunes, mias }
}
