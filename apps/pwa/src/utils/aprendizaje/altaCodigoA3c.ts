/**
 * Lógica pura de la «Solicitud de alta de código» de la ficha A3C: a quién se le pide el SAP, qué elementos
 * del plano usan ese código, qué avisos lleva el formulario y qué SAP vale en la ficha. Sin React ni
 * Firestore. Fuente de los datos: `partes.json` del plano 888 (los elementos se CALCULAN de ahí, no se
 * escriben a mano) y la solicitud guardada en `solicitudes_repuestos`.
 */
import type { ParteFisica, PartesPlano } from '@/hooks/usePartesPlano'
import type { VinculoTerreno } from '@/hooks/usePlanoVinculos'
import type { AltaCodigo, NuevaAlta } from '@/hooks/repuestos/useSolicitudes'
import type { MaquinaBaader } from '@/services/baader142/perilla5Protocolo'
import { etiquetaMaquina } from '@/utils/aprendizaje/vinculoTerreno'
import { normCodigo } from '@/utils/repuestos/normCodigo'

/** Id fijo del alta de un código de fabricante: un código = una alta, venga de donde venga. */
export const idAltaDeCodigo = (codigoFabricante: string) => `alta_${normCodigo(codigoFabricante)}`

/** Tope de la regla de Firestore (`codigoFabricante` de 1 a 30). */
export const MAX_CODIGO_ALTA = 30

/** Tope de la regla de Firestore para las unidades de un alta (el pedido normal admite hasta 9999). */
export const MAX_CANTIDAD_ALTA = 999

/** Cantidad válida de un alta: entero entre 1 y 999. */
export const acotarCantidadAlta = (n: number): number => Math.min(MAX_CANTIDAD_ALTA, Math.max(1, Math.round(n || 1)))

/** Orden natural de designaciones: Y2 antes que Y10; «K» antes que «Y». */
export function compararElementos(a: string, b: string): number {
  return a.localeCompare(b, 'es', { numeric: true, sensitivity: 'base' })
}

/** Todos los elementos del plano con alguna pieza de ese código de fabricante (comparado normalizado). */
export function elementosConCodigo(aparatos: PartesPlano['aparatos'] | undefined | null, codigo: string): string[] {
  const k = normCodigo(codigo)
  if (!k || !aparatos) return []
  return Object.entries(aparatos)
    .filter(([, piezas]) => piezas.some((p) => normCodigo(p.nr) === k))
    .map(([el]) => el)
    .sort(compararElementos)
}

const partir = (el: string): { letras: string; n: number } | null => {
  const m = /^([A-Za-z]+)(\d+)$/.exec(el)
  return m ? { letras: m[1]!, n: Number(m[2]) } : null
}

/**
 * «K20, K22» · «Y1–Y12» · «Y13, Y14, Y53–Y55». Los tramos de 3 o más consecutivos con la misma letra van
 * como rango; el resto, uno por uno. Entra ordenado o no: se ordena.
 */
export function compactarElementos(elementos: readonly string[]): string {
  const ord = [...new Set(elementos)].sort(compararElementos)
  const salida: string[] = []
  let i = 0
  while (i < ord.length) {
    const ini = partir(ord[i]!)
    let j = i
    while (ini && j + 1 < ord.length) {
      const sig = partir(ord[j + 1]!)
      const act = partir(ord[j]!)
      if (sig && act && sig.letras === ini.letras && sig.n === act.n + 1) j++
      else break
    }
    if (j - i + 1 >= 3) {
      salida.push(`${ord[i]}–${ord[j]}`)
      i = j + 1
    } else {
      salida.push(ord[i]!)
      i++
    }
  }
  return salida.join(', ')
}

/** «2 elementos» / «1 elemento». */
export const cuantosElementos = (n: number) => `${n} ${n === 1 ? 'elemento' : 'elementos'}`

/** «K20, K22 · 2 elementos». */
export const resumenElementos = (elementos: readonly string[]) => `${compactarElementos(elementos)} · ${cuantosElementos(new Set(elementos).size)}`

/** Una tensión escrita en la descripción alemana del catálogo: «24V DC», «230 V AC», «12V». */
const TENSION = /\b\d+(?:[.,]\d+)?\s?V(?:\s?(?:DC|AC))?\b/i

/**
 * Descripción para bodega: el nombre en español y, si el catálogo en alemán trae la tensión
 * («Miniaturrelais 24V DC»), se la suma («Relé en miniatura 24V DC»). No se traduce ni se inventa nada más.
 */
export function descripcionAlta(es: string, de?: string): string {
  const t = de ? TENSION.exec(de)?.[0] : undefined
  if (!t || es.toLowerCase().includes(t.toLowerCase())) return es
  return `${es} ${t.replace(/\s+/g, ' ').trim()}`
}

export interface AvisosAlta {
  /** El código es del conjunto completo: la pieza sola no tiene código propio. */
  conjunto: boolean
  /** Código propuesto, no confirmado en terreno. */
  propuesto: boolean
  /** Código de otra generación de máquina (catálogo 2006 · N1). */
  generacion: string | null
}

/** Los avisos del formulario. Ninguno bloquea el envío: bodega los ve en la tarjeta. */
export function avisosAlta(pieza: Pick<ParteFisica, 'nivel' | 'confianza' | 'generacion'>, codigoLeido = false): AvisosAlta {
  const gen = pieza.generacion?.trim()
  return {
    conjunto: pieza.nivel === 'conjunto',
    // Un código leído de la etiqueta en terreno ya no es una propuesta del catálogo.
    propuesto: !codigoLeido && pieza.confianza !== 'catalogo',
    generacion: gen
      ? /^N1\b/.test(gen)
        ? 'Código del catálogo 2006 (N1): revisa que sirva para N2 y N3.'
        : `Código de otra generación (${gen}): revisa que sirva en esta máquina.`
      : null,
  }
}

export interface EntradaAlta {
  /** Código de fabricante a pedir: `pieza.nr`, o el leído de la etiqueta si el terreno lo corrigió. */
  codigo: string
  pieza: ParteFisica
  /** Elemento desde el que se pide. */
  elemento: string
  maquina: MaquinaBaader | null
  aparatos: PartesPlano['aparatos'] | undefined | null
  planoSlug: string
  observaciones?: string
  fotoUrl?: string
}

/** El documento del alta (sin quién/cuándo/cantidad: los pone `crearAltaCodigo`). Sin `undefined`. */
export function armarAltaCodigo(e: EntradaAlta): { id: string; data: NuevaAlta } {
  const codigo = e.codigo.trim()
  const leido = normCodigo(codigo) !== normCodigo(e.pieza.nr)
  const elementos = [...new Set([...elementosConCodigo(e.aparatos, codigo), e.elemento])].sort(compararElementos)
  const data: NuevaAlta = {
    tipo: 'alta_codigo',
    codigoFabricante: codigo,
    codigoNorm: normCodigo(codigo),
    // La tensión sale de la descripción alemana de ESE código; un código leído en terreno no la hereda.
    textoBreve: leido ? e.pieza.es : descripcionAlta(e.pieza.es, e.pieza.de),
    // Si el código es otro (leído en terreno), la figura y la posición del catálogo ya no hablan de él.
    ...(e.pieza.de && !leido ? { descripcionDe: e.pieza.de } : {}),
    ...(e.pieza.fig && !leido ? { fig: e.pieza.fig } : {}),
    ...(e.pieza.pos && !leido ? { pos: e.pieza.pos } : {}),
    fuentes: leido ? [] : [...(e.pieza.fuentes ?? [])],
    nivel: e.pieza.nivel === 'conjunto' ? 'conjunto' : 'pieza',
    confianza: leido ? 'terreno' : e.pieza.confianza,
    planoSlug: e.planoSlug,
    ...(e.maquina ? { maquina: etiquetaMaquina(e.maquina) } : {}),
    elemento: e.elemento,
    elementos,
    cantidad: 1,
    ...(e.observaciones?.trim() ? { observaciones: e.observaciones.trim() } : {}),
    ...(e.fotoUrl ? { fotoUrl: e.fotoUrl } : {}),
  }
  return { id: idAltaDeCodigo(codigo), data }
}

/** El SAP que vale en la ficha: el del cruce (`partes.json`, estático) o, si no hay, el del alta ya creada. */
export function sapEfectivo(sapDelPlano: string | undefined, alta?: Pick<AltaCodigo, 'estado' | 'sapCreado'> | null): string | undefined {
  if (sapDelPlano) return sapDelPlano
  return alta?.estado === 'creada' && alta.sapCreado ? alta.sapCreado : undefined
}

/** dd-MM: la fecha corta del pedido y de la resolución. */
export function fechaCortaAlta(d?: Date | null): string {
  if (!d || Number.isNaN(d.getTime())) return ''
  return `${String(d.getDate()).padStart(2, '0')}-${String(d.getMonth() + 1).padStart(2, '0')}`
}

/** «K20 y K22» / «Y1–Y12» / «Y13, Y14, Y53–Y55»: para la frase «Un solo pedido sirve para …». */
export function listaEnFrase(elementos: readonly string[]): string {
  const u = [...new Set(elementos)].sort(compararElementos)
  if (u.length === 2) return `${u[0]} y ${u[1]}`
  return compactarElementos(u)
}

/**
 * El código que se pide a bodega: el de la etiqueta si el terreno lo corrigió («Es otra pieza»), y si no el del
 * catálogo. Pide lo que de verdad está instalado, no lo que el catálogo suponía.
 */
export function codigoParaAlta(pieza: Pick<ParteFisica, 'nr'>, vinculo?: Pick<VinculoTerreno, 'estado' | 'codigo'> | null): string {
  return vinculo?.estado === 'corregido' && vinculo.codigo?.trim() ? vinculo.codigo.trim() : pieza.nr
}

type DatosCatalogoAlta = Pick<AltaCodigo, 'elemento' | 'elementos' | 'maquina' | 'fig' | 'pos'>

/**
 * La línea de contexto de una alta para bodega: «K20 en N2 · catálogo 2014 fig. 120 pos. 321 · también K22».
 * Sin figura dice que el catálogo no la rotula (no se inventa una).
 */
export function lineaCatalogoAlta(a: DatosCatalogoAlta): string {
  const donde = `${a.elemento}${a.maquina ? ` en ${a.maquina}` : ''}`
  let catalogo = 'sin figura en el catálogo'
  if (a.fig) {
    const anio = a.fig.includes('2014') ? '2014' : '2006'
    catalogo = `catálogo ${anio} fig. ${a.fig.replace(/\s*\(2014\)/, '')}${a.pos ? ` pos. ${a.pos}` : ''}`
  }
  const otros = a.elementos.filter((e) => e !== a.elemento)
  return [donde, catalogo, otros.length ? `también ${compactarElementos(otros)}` : ''].filter(Boolean).join(' · ')
}

/** El aviso que bodega ve en la tarjeta («Conjunto completo · código propuesto, sin confirmar en terreno»), o null. */
export function avisoDeAlta(a: Pick<AltaCodigo, 'nivel' | 'confianza'>): string | null {
  const partes = [
    a.nivel === 'conjunto' ? 'Conjunto completo' : '',
    a.confianza !== 'catalogo' && a.confianza !== 'terreno' ? 'código propuesto, sin confirmar en terreno' : '',
  ].filter(Boolean)
  if (!partes.length) return null
  const t = partes.join(' · ')
  return t.charAt(0).toUpperCase() + t.slice(1)
}
