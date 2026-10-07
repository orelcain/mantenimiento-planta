/**
 * Lógica pura de la sección «Repuesto» de la ficha A3C y del indicador de cobertura de la cabecera.
 * Fuente de los datos: `partes.json` del plano 142.71.00.888 (catálogo BAADER 2006 cruzado con el
 * maestro SAP) y las confirmaciones en terreno (`planoVinculos`). Sin React ni Firestore.
 */
import type { ParteFamilia, ParteFisica, PartesPlano } from '@/hooks/usePartesPlano'
import type { VinculoTerreno } from '@/hooks/usePlanoVinculos'

export const SLUG_PLANO_A3C = 'baader-142-888'

/**
 * A = pieza exacta con SAP · B = pieza exacta sin SAP en el maestro · C = solo familia (el catálogo
 * no rotula la designación) · D = nada.
 */
export type EstadoRepuesto = 'A' | 'B' | 'C' | 'D'

export interface ClasificacionRepuesto {
  estado: EstadoRepuesto
  piezas: ParteFisica[]
  familia: ParteFamilia | null
}

/** Letra(s) IEC 81346 de la designación: «SM6-1» → «SM», «Y51» → «Y». */
export function letraFamilia(codigo: string): string | null {
  return codigo.match(/^[A-Z]+/)?.[0] ?? null
}

export function clasificarRepuesto(
  codigo: string,
  partes: Pick<PartesPlano, 'aparatos' | 'familias'> | null | undefined,
): ClasificacionRepuesto {
  const piezas = partes?.aparatos[codigo] ?? []
  const letra = letraFamilia(codigo)
  const fam = letra ? partes?.familias?.[letra] : undefined
  const familia = fam?.figuras.length ? fam : null
  if (piezas.length) {
    return { estado: piezas.every(p => !!p.sap) ? 'A' : 'B', piezas, familia }
  }
  return { estado: familia ? 'C' : 'D', piezas: [], familia }
}

/** Pseudo-elementos (A3C.*), regletas (X*) y puntos de prueba (TP*): no son una pieza que se pida a bodega. */
export function esPiezaFisica(codigo: string): boolean {
  return !(/^A3C\./.test(codigo) || codigo === 'A3C' || /^X\d/.test(codigo) || /^TP(?![A-Za-z])/.test(codigo))
}

export interface CoberturaRepuestos {
  /** M: elementos que son pieza física. */
  total: number
  /** N: con al menos una pieza exacta. */
  identificados: number
  /** X: con vínculo confirmado en terreno. */
  confirmados: number
}

export function coberturaRepuestos(
  codigos: readonly string[],
  aparatos: Record<string, readonly unknown[]> | null | undefined,
  vinculos: ReadonlyMap<string, Pick<VinculoTerreno, 'estado'>> | null | undefined,
): CoberturaRepuestos {
  const fisicos = [...new Set(codigos)].filter(esPiezaFisica)
  let identificados = 0
  let confirmados = 0
  for (const c of fisicos) {
    if ((aparatos?.[c]?.length ?? 0) > 0) identificados++
    if (vinculos?.get(c)?.estado === 'confirmado') confirmados++
  }
  return { total: fisicos.length, identificados, confirmados }
}

export type Certeza = { tono: 'info' | 'neutral' | 'ok' | 'warning'; texto: string }

/**
 * Varias piezas y ninguna dicha por el catálogo para esta designación: son CANDIDATOS y la
 * etiqueta en terreno decide (ej. B1 en las N2/N3: 42303109 del catálogo 2006 o 42303107 del 2014).
 */
export function esModoCandidatos(piezas: readonly Pick<ParteFisica, 'confianza'>[]): boolean {
  return piezas.length > 1 && piezas.every(p => p.confianza !== 'catalogo')
}

/**
 * Pill de certeza de UNA pieza: la confirmación en terreno manda sobre lo que dice el catálogo.
 * El vínculo es por aparato y guarda el código elegido; con candidatos, solo la pieza con ese
 * código queda confirmada y las demás se descartan. Un vínculo viejo sin código vale para `nrPrimera`.
 */
export function certezaDe(
  confianza: string,
  vinculo?: Pick<VinculoTerreno, 'estado' | 'codigo'> | null,
  nr?: string,
  nrPrimera?: string,
): Certeza {
  if (vinculo?.estado === 'confirmado') {
    const elegido = vinculo.codigo ?? nrPrimera
    if (!nr || !elegido || elegido === nr) return { tono: 'ok', texto: 'Confirmada en terreno' }
    return { tono: 'neutral', texto: 'Descartada en terreno' }
  }
  if (vinculo?.estado === 'corregido') return { tono: 'warning', texto: 'Es otra pieza' }
  if (vinculo?.estado === 'no_aplica') return { tono: 'neutral', texto: 'No existe en esta máquina' }
  if (confianza === 'catalogo') return { tono: 'info', texto: 'Según catálogo' }
  return { tono: 'neutral', texto: 'Propuesto' }
}

/** «Catálogo 2006 · fig. 70-8 · pos. B1» / «Catálogo 2014 · fig. 120 · pos. 321» / «Candidato». */
export function origenPieza(p: Pick<ParteFisica, 'fig' | 'pos'>): string {
  if (!p.fig) return 'Candidato · sin figura asignada'
  const anio = p.fig.includes('2014') ? '2014' : '2006'
  const fig = p.fig.replace(/\s*\(2014\)/, '')
  return `Catálogo ${anio} · fig. ${fig} · pos. ${p.pos}`
}
