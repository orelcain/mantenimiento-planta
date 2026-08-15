/**
 * monitorEventos.ts — todo lo que pasó en el turno, en un solo lugar.
 *
 * ── Por qué agrupado por DUEÑO y no por "evitable / no evitable" ────────────
 *
 * "Evitable" no significa "de Mantención", y esa confusión es la que termina
 * costando caro: los 662 pz que el 14-08 se perdieron por paradas evitables no
 * tenían ni un minuto de falla de máquina — eran operación, abastecimiento y
 * detenciones que nadie imputó. Sin la separación, la cifra se lee como si
 * alguien hubiera fallado.
 *
 * El primer nivel es entonces el dueño de la pérdida, que sale del árbol
 * OFICIAL de imputación (`imputacionTaxonomy`, el de la capacitación V12 con la
 * que se entrena a los supervisores). No lo inventamos acá: si el curso dice
 * que ATASCAMIENTO es MMPP, es MMPP, y nadie puede discutir la etiqueta.
 *
 * ── El grupo que no estaba previsto ─────────────────────────────────────────
 *
 * `sin-imputar`: paradas que llegaron sin causa del árbol —"Micro Detencion",
 * "Detencion"— o con una que el curso no cubre. El 14-08 fueron 252 pz, el 38%
 * de todo lo evitable. Mostrarlo aparte no es un detalle técnico: no se puede
 * atacar lo que nadie anota, y esconderlo dentro de otro grupo lo daría por
 * explicado.
 *
 * ⚠ Las paradas de convenio NO se convierten a piezas. En la colación no se
 * puede producir; contarla daría una pérdida que no existe.
 */
import { matchImputacion, categoriaLabel } from './imputacionTaxonomy'
import type { CostoDeParadas } from './monitorPerdidas'
import type { PublicMonitorLive } from './publicShiftMonitor.service'

export type DuenoPerdida = 'mantencion' | 'externo' | 'sin-imputar' | 'programado'

export const DUENO_META: Record<DuenoPerdida, { label: string; detalle: string }> = {
  mantencion:    { label: 'Mantención',  detalle: 'equipos' },
  externo:       { label: 'Externo',     detalle: 'proceso y abastecimiento' },
  'sin-imputar': { label: 'Sin imputar', detalle: 'nadie anotó la causa' },
  programado:    { label: 'Programado',  detalle: 'no se recupera' },
}

/** Una parada suelta, para el detalle de la causa. */
export interface ParadaSuelta {
  /** Hora de planta, ya formateada (HH:MM). */
  hora: string
  min: number
}

export interface CausaDelTurno {
  reason: string
  min: number
  count: number
  /** Piezas que costó. null en las de convenio: ahí no se pierde producción. */
  piezas: number | null
  /** Categoría del curso ('MMPP', 'Operacional'…). null si no matcheó ninguna hoja. */
  categoria: string | null
  /** La hoja no es del curso, la agregamos para una máquina que la V12 no cubre. */
  extension: boolean
  /** Sus paradas, de la más larga a la más corta. */
  paradas: ParadaSuelta[]
}

export interface GrupoDelTurno {
  dueno: DuenoPerdida
  min: number
  /** Suma de las piezas de sus causas. null en `programado`. */
  piezas: number | null
  causas: CausaDelTurno[]
}

/** Orden fijo: primero de quién es, después cuánto costó. */
const ORDEN: DuenoPerdida[] = ['mantencion', 'externo', 'sin-imputar', 'programado']

/**
 * `f` viene en la convención wall-clock-as-UTC del doc: la hora de planta ES la
 * del ISO. Formatear con el reloj local la correría 3 o 4 horas.
 */
function horaDe(iso: string): string {
  return iso.slice(11, 16)
}

/**
 * Las paradas de cada causa, de la más larga a la más corta.
 *
 * Más larga primero y no cronológico a propósito: cuando una causa tiene 23
 * eventos —las microparadas— lo único que se puede mostrar sin tapar la
 * pantalla son las que de verdad pesan.
 */
function paradasPorCausa(
  stopEvents: Array<{ r: number; f: string; s: number }>,
  stopReasons: string[],
): Map<string, ParadaSuelta[]> {
  const m = new Map<string, ParadaSuelta[]>()
  for (const e of stopEvents) {
    const causa = stopReasons[e.r]
    if (!causa || !(e.s > 0) || !e.f) continue
    const lista = m.get(causa) ?? []
    lista.push({ hora: horaDe(e.f), min: e.s / 60 })
    m.set(causa, lista)
  }
  for (const lista of m.values()) lista.sort((a, b) => b.min - a.min)
  return m
}

/**
 * A qué grupo va una causa recuperable.
 *
 * Solo `mantencion` y `externo` son afirmaciones que el árbol respalda. Todo lo
 * demás —sin hoja, hoja ambigua de otro bucket— cae en `sin-imputar`, que dice
 * exactamente lo que pasa: no hay dato para atribuirla. Inventarle dueño a una
 * detención es lo único que no se puede hacer acá.
 */
function duenoDe(reason: string): { dueno: DuenoPerdida; categoria: string | null; extension: boolean } {
  const m = matchImputacion(reason)
  const categoria = m.leaf ? categoriaLabel(m.leaf) : null
  const extension = Boolean(m.leaf?.extension)
  if (m.bucket === 'mantencion') return { dueno: 'mantencion', categoria, extension }
  if (m.bucket === 'externo') return { dueno: 'externo', categoria, extension }
  return { dueno: 'sin-imputar', categoria, extension }
}

export function agruparEventos(args: {
  tb?: PublicMonitorLive['timeBreakdown'] | null
  stopEvents?: Array<{ r: number; f: string; s: number }> | null
  stopReasons?: string[] | null
  /** Costo ya calculado al ritmo local (ver `monitorPerdidas`). */
  costo?: CostoDeParadas | null
  /** Promedio andando, de respaldo para las causas que el costo no cubra. */
  cpmGlobal?: number | null
}): GrupoDelTurno[] {
  const { tb } = args
  if (!tb) return []
  const paradas = paradasPorCausa(args.stopEvents ?? [], args.stopReasons ?? [])
  const costo = new Map((args.costo?.porCausa ?? []).map((c) => [c.reason, c.piezas]))
  const cpm = args.cpmGlobal && args.cpmGlobal > 0 ? args.cpmGlobal : null

  const grupos = new Map<DuenoPerdida, GrupoDelTurno>()
  const push = (dueno: DuenoPerdida, causa: CausaDelTurno) => {
    const g = grupos.get(dueno) ?? { dueno, min: 0, piezas: dueno === 'programado' ? null : 0, causas: [] }
    g.min += causa.min
    if (g.piezas != null && causa.piezas != null) g.piezas += causa.piezas
    g.causas.push(causa)
    grupos.set(dueno, g)
  }

  for (const x of tb.recoverable ?? []) {
    const { dueno, categoria, extension } = duenoDe(x.reason)
    const piezas = costo.get(x.reason) ?? (cpm ? x.min * cpm : null)
    push(dueno, {
      reason: x.reason,
      min: x.min,
      count: x.count ?? 0,
      piezas,
      categoria,
      extension,
      paradas: paradas.get(x.reason) ?? [],
    })
  }

  for (const x of tb.planned ?? []) {
    push('programado', {
      reason: x.reason,
      min: x.min,
      count: x.count ?? 0,
      piezas: null,
      // La categoría es siempre "Paros Programados": decirlo en cada fila es
      // ruido cuando el grupo ya se llama así.
      categoria: null,
      extension: false,
      paradas: paradas.get(x.reason) ?? [],
    })
  }

  return ORDEN.filter((d) => grupos.has(d)).map((d) => {
    const g = grupos.get(d)!
    g.causas.sort((a, b) => (b.piezas ?? b.min * 1000) - (a.piezas ?? a.min * 1000))
    return g
  })
}

/**
 * Cuántos minutos de máquina hubo. Sirve para la frase que Mantención necesita
 * poder decir —"ninguna parada fue por falla de máquina"— que solo vale si se
 * afirma sobre el total, no sobre lo que se alcanzó a mostrar.
 */
export function minutosDeMantencion(grupos: GrupoDelTurno[]): number {
  return grupos.find((g) => g.dueno === 'mantencion')?.min ?? 0
}
