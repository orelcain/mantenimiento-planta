/**
 * imputacionPareto — agrupa las pérdidas del turno por CATEGORÍA del árbol
 * oficial de imputación, y mide cuánto del tiempo detenido llegó con causal.
 *
 * Dos preguntas distintas que la cascada por dueño no responde:
 *
 *  1. «¿De qué tipo fue el tiempo perdido?» — el pareto plano de causales pone
 *     COLACION y LOGICA en la misma lista, y la colación (una pausa acordada)
 *     siempre gana. Agrupado por categoría, primero se ve el tipo y recién al
 *     abrirlo la causal puntual.
 *  2. «¿Se anotó?» — `cobertura` es el % del tiempo detenido que llegó con
 *     causal. No mide a Mantención: mide si el turno quedó documentado. Sin
 *     eso, cualquier análisis de causa raíz se hace sobre media historia.
 *
 * `Planned Downtime` queda fuera de ambos cálculos: es relleno post-turno de
 * Shoplogix arrastrado por la ventana de consulta, no tiempo del turno.
 */

import {
  CATEGORIA_META,
  categoriaLabel,
  matchImputacion,
  type ImputacionCategoria,
} from './imputacionTaxonomy'
import { classifyLossState, type LossBucket } from './lossBuckets'

/** Etiqueta del grupo que junta todo lo que llegó sin causal anotada. */
export const SIN_CAUSAL = 'Sin causal anotada'

export interface ParetoCausal {
  /** Etiqueta oficial de la causal, o el nombre del state si no se reconoció. */
  label: string
  bucket: LossBucket
  durationSec: number
  count: number
  /** true si la hoja existe en eléctrica y mecánica y el dato no permite decidir. */
  ambigua: boolean
}

export interface ParetoCategoria {
  /** Clave estable: la categoría, `electrica|mecanica` si es ambigua, o `sin-causal`. */
  key: string
  /** Nombre para mostrar ('Eléctrica o Mecánica', 'MMPP'…). */
  label: string
  durationSec: number
  causales: ParetoCausal[]
  /** Segundos por dueño, para pintar la barra apilada. */
  porDueno: Array<{ bucket: LossBucket; durationSec: number }>
}

export interface ImputacionPareto {
  categorias: ParetoCategoria[]
  /** Tiempo detenido considerado (sin uptime ni Planned Downtime). */
  totalSec: number
  /** Del total, cuánto llegó con una causal del árbol. */
  imputadoSec: number
  /** imputadoSec / totalSec (0-1). 0 si no hubo detenciones. */
  cobertura: number
}

type StateLike = { type: string; name?: string; reason?: string; durationSec?: number }

/** Categorías del árbol que se muestran aunque el turno no tenga ninguna. */
const SIEMPRE_VISIBLES: ImputacionCategoria[] = [
  'abastecimiento', 'electrica', 'mecanica', 'mmpp', 'operacional', 'programado',
]

/**
 * Arma el pareto por categoría desde los states crudos de una o varias máquinas.
 *
 * Una categoría sin registros se muestra igual, en cero. Una categoría ausente
 * es información —«en julio nadie anotó una falla mecánica»— y esconderla la
 * disfraza de inexistente.
 */
export function paretoByCategoria(states: ReadonlyArray<StateLike>): ImputacionPareto {
  const groups = new Map<string, { label: string; causales: Map<string, ParetoCausal> }>()
  let totalSec = 0
  let imputadoSec = 0

  const ensure = (key: string, label: string) => {
    let g = groups.get(key)
    if (!g) { g = { label, causales: new Map() }; groups.set(key, g) }
    return g
  }

  // Las 6 del árbol arrancan presentes y vacías.
  for (const c of SIEMPRE_VISIBLES) ensure(c, CATEGORIA_META[c].label)

  for (const s of states) {
    if (s.type === 'uptime') continue
    const bucket = classifyLossState(s)
    if (bucket === 'fuera-turno') continue // Planned Downtime: no es del turno
    const sec = s.durationSec ?? 0
    if (sec <= 0) continue
    totalSec += sec

    const m = matchImputacion(s.reason)
    let key: string
    let label: string
    let causalLabel: string

    if (m.leaf) {
      imputadoSec += sec
      key = m.leaf.categorias.join('|')
      label = categoriaLabel(m.leaf)
      causalLabel = m.leaf.label
    } else {
      key = 'sin-causal'
      label = SIN_CAUSAL
      // Distinguir la micro detención del paro largo sin anotar: son problemas
      // distintos y se atacan distinto, aunque ninguno tenga causal.
      causalLabel = (s.name ?? '').toLowerCase().includes('micro')
        ? 'Micro detención (sin causal)'
        : (s.reason?.trim() || 'Detención (sin causal)')
    }

    const g = ensure(key, label)
    const cur = g.causales.get(causalLabel)
      ?? { label: causalLabel, bucket, durationSec: 0, count: 0, ambigua: m.ambigua }
    cur.durationSec += sec
    cur.count += 1
    g.causales.set(causalLabel, cur)
  }

  const categorias: ParetoCategoria[] = [...groups.entries()].map(([key, g]) => {
    const causales = [...g.causales.values()].sort((a, b) => b.durationSec - a.durationSec)
    const durationSec = causales.reduce((a, c) => a + c.durationSec, 0)
    const dueno = new Map<LossBucket, number>()
    for (const c of causales) dueno.set(c.bucket, (dueno.get(c.bucket) ?? 0) + c.durationSec)
    return {
      key,
      label: g.label,
      durationSec,
      causales,
      porDueno: [...dueno.entries()]
        .map(([bucket, durationSec]) => ({ bucket, durationSec }))
        .sort((a, b) => b.durationSec - a.durationSec),
    }
  })

  // Con registros primero, por impacto; las vacías al final, en su orden natural.
  categorias.sort((a, b) => {
    if (a.durationSec !== b.durationSec) return b.durationSec - a.durationSec
    return a.label.localeCompare(b.label, 'es')
  })

  return {
    categorias,
    totalSec,
    imputadoSec,
    cobertura: totalSec > 0 ? imputadoSec / totalSec : 0,
  }
}
