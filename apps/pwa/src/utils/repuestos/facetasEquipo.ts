/**
 * Facetas de equipo para la lista de Repuestos: «Baader 142 (30) · Knuro (12)…».
 *
 * Sustituye al desplegable «Todos los equipos» (70 nombres, 11 de ellos inalcanzables antes del
 * arreglo de 14-09). Las opciones salen de los RESULTADOS, no del catálogo: lo que se ofrece es
 * lo que existe en lo que ya se está mirando.
 *
 * Niveles (el primero que separe algo):
 *   familia  → si las filas cubren ≥ 2 familias («EVISCERADORA BAADER 142», «KNURO»…)
 *   planta   → si hay una sola familia pero ≥ 2 plantas
 *   unidad   → una sola familia y una sola planta: N1 / N2 / N3
 *
 * Conteo = filas ÚNICAS: una pieza montada en N1+N2+N3 cuenta una vez.
 * Reusa `agruparDondeSeUsa`: planta + nombre es la identidad del equipo.
 */
import { agruparDondeSeUsa, equiposVisiblesEnRepuestos, plantaCorta, type EquipoDelRepuesto, type GrupoDondeSeUsa } from '@/hooks/repuestos/dondeSeUsa'

export type NivelFaceta = 'familia' | 'planta' | 'unidad'

export interface Faceta {
  nivel: NivelFaceta
  /** familia: nombre en mayúsculas · planta: texto de la planta · unidad: «N1». */
  clave: string
}

export interface OpcionFaceta {
  clave: string
  etiqueta: string
  conteo: number
}

export interface Facetas {
  nivel: NivelFaceta
  opciones: OpcionFaceta[]
}

export interface FilaConEquipos {
  rowKey: string
  equipos: readonly EquipoDelRepuesto[]
}

type PlantaDe = (nodeId: string) => string | undefined

const SIN_PLANTA = 'Sin planta'
const SIN_UNIDAD = 'Sin unidad'

const claveFamilia = (g: GrupoDondeSeUsa): string => g.familia.trim().toUpperCase()
const clavePlanta = (g: GrupoDondeSeUsa): string => g.planta ?? ''

/** Nombre de la familia como se lee en el chip: «Evisceradora Baader 142». */
export function tituloFamilia(nombre: string): string {
  return nombre.toLowerCase().replace(/(^|\s)\S/g, (c) => c.toUpperCase())
}

/** ¿El grupo (familia + planta + unidades) cae dentro de la faceta? */
export function grupoEnFaceta(g: GrupoDondeSeUsa, faceta: Faceta): boolean {
  switch (faceta.nivel) {
    case 'familia': return claveFamilia(g) === faceta.clave
    case 'planta': return clavePlanta(g) === faceta.clave
    case 'unidad': return g.unidades.some((u) => u.unidad === faceta.clave)
  }
}

/** Valores de la faceta que tiene una fila (las claves de cada nivel, sin repetir). */
function clavesDeFila(row: FilaConEquipos, nivel: NivelFaceta, plantaDe: PlantaDe): string[] {
  const out = new Set<string>()
  for (const g of agruparDondeSeUsa(equiposVisiblesEnRepuestos(row.equipos, plantaDe), plantaDe)) {
    if (nivel === 'familia') out.add(claveFamilia(g))
    else if (nivel === 'planta') out.add(clavePlanta(g))
    else for (const u of g.unidades) out.add(u.unidad)
  }
  return [...out]
}

export function facetasDeEquipo(rows: readonly FilaConEquipos[], plantaDe: PlantaDe = () => undefined): Facetas {
  const porFila = rows.map((r) => agruparDondeSeUsa(equiposVisiblesEnRepuestos(r.equipos, plantaDe), plantaDe))
  const distintas = (f: (g: GrupoDondeSeUsa) => string): number => {
    const s = new Set<string>()
    for (const gs of porFila) for (const g of gs) s.add(f(g))
    return s.size
  }
  const nivel: NivelFaceta = distintas(claveFamilia) >= 2 ? 'familia' : distintas(clavePlanta) >= 2 ? 'planta' : 'unidad'

  const conteo = new Map<string, number>()
  const etiquetas = new Map<string, string>()
  for (const r of rows) {
    for (const clave of clavesDeFila(r, nivel, plantaDe)) {
      conteo.set(clave, (conteo.get(clave) ?? 0) + 1)
      if (!etiquetas.has(clave)) {
        etiquetas.set(
          clave,
          nivel === 'familia' ? tituloFamilia(clave)
            : nivel === 'planta' ? (plantaCorta(clave) || SIN_PLANTA)
              : (clave || SIN_UNIDAD),
        )
      }
    }
  }
  const opciones = [...conteo.entries()]
    .map(([clave, n]) => ({ clave, etiqueta: etiquetas.get(clave) ?? clave, conteo: n }))
    .sort((a, b) => b.conteo - a.conteo || a.etiqueta.localeCompare(b.etiqueta, 'es', { numeric: true }))
  return { nivel, opciones }
}

export function filtraPorFaceta(row: FilaConEquipos, faceta: Faceta, plantaDe: PlantaDe = () => undefined): boolean {
  return agruparDondeSeUsa(equiposVisiblesEnRepuestos(row.equipos, plantaDe), plantaDe).some((g) => grupoEnFaceta(g, faceta))
}

/** La fila ya lo dice sola: ≤ 3 filas o una única opción → no se ofrece la fila de chips. */
export function ocultarFacetas(rows: readonly unknown[], facetas: Facetas): boolean {
  return rows.length <= 3 || facetas.opciones.length <= 1
}
