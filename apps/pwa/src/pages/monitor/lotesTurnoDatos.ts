/**
 * «Lotes del turno» (mockup v4, tarjeta 5): los lotes en orden, con su tramo, piezas, kg y perfil por calibre, el
 * hueco del espejo entre dos lotes y la comparación con el anterior. Puro, aparte del componente; también arma la
 * franja de lotes del gráfico «Piezas por minuto».
 *
 * Calibre POR PESO de cada pieza (cada 2 lb), como el mockup: describe el pescado, no el programa de las gates.
 * Minutos = minutos del grader desde el inicio del turno (hora de planta guardada como UTC).
 */
import { milesPunto } from '@/services/grader/espejo/alertasGrader'
import type { LoteTramo } from '@/services/grader/espejo/pescaVivo'
import { compararPerfiles, type CompararLote } from './hayQueHacerDatos'

/** Con menos de estos px, el lote va sin rótulo en la franja del gráfico. */
export const ROTULO_LOTE_MIN_PX = 56
/** Con más de estos px, el rótulo largo («lote 738 · distinto»); si no, «…738». */
export const ROTULO_LOTE_LARGO_PX = 130

/** Lote «720260739» → «720.260.739», como lo muestra Matrix. */
export function loteLegible(l: string): string {
  return /^\d+$/.test(l) ? milesPunto(Number(l)) : l
}

/** Los 3 últimos dígitos: «…738». */
export const loteCorto = (l: string) => `…${l.replace(/\D/g, '').slice(-3) || l.slice(-3)}`

export interface FilaLote {
  tipo: 'lote'
  /** Índice del lote en el turno (un lote puede repetirse: se identifica por tramo, no por número). */
  k: number
  lote: string
  desdeMin: number
  /** Minuto siguiente a la última pieza (exclusivo). */
  hastaMin: number
  enCurso: boolean
  piezas: number
  t: LoteTramo
  /** Contra el lote anterior; `null` en el primero. */
  cmp: CompararLote | null
}

export interface FilaHueco {
  tipo: 'hueco'
  desdeMin: number
  hastaMin: number
  /** El hueco separa dos lotes distintos: el cambio cayó sin lectura. */
  cambio: boolean
}

export type FilaLotes = FilaLote | FilaHueco

const minDe = (ts: string, t0Ms: number) => Math.floor((Date.parse(ts) - t0Ms) / 60_000)

/**
 * Filas de la tarjeta. `huecos`: tramos sin lectura del espejo [desde, hasta) en minutos; solo se listan los que caen
 * ENTRE dos lotes (los de dentro de un lote se ven en el gráfico). `enCurso`: el turno sigue (el último lote «en curso»).
 */
export function filasLotes(lotes: readonly LoteTramo[], t0Ms: number, huecos: ReadonlyArray<readonly [number, number]>, enCurso: boolean): FilaLotes[] {
  const out: FilaLotes[] = []
  lotes.forEach((t, k) => {
    const desdeMin = Math.max(0, minDe(t.desdeTs, t0Ms))
    const hastaMin = minDe(t.hastaTs, t0Ms) + 1
    if (k > 0) {
      const prev = out[out.length - 1] as FilaLote
      for (const [a, b] of huecos) {
        // El hueco toca el final del lote anterior y el comienzo de este (±1 min de borde).
        if (a >= prev.hastaMin - 1 && b <= desdeMin + 1) out.push({ tipo: 'hueco', desdeMin: a, hastaMin: b, cambio: prev.lote !== t.lote })
      }
    }
    out.push({
      tipo: 'lote',
      k,
      lote: t.lote,
      desdeMin,
      hastaMin,
      enCurso: enCurso && k === lotes.length - 1,
      piezas: t.piezas,
      t,
      cmp: k > 0 ? compararPerfiles(lotes[k - 1]!.perfil, t.perfil) : null,
    })
  })
  return out
}

export interface FranjaLote {
  k: number
  x0: number
  x1: number
  lote: string
  distinto: boolean
  pesoMedioKg: number | null
}

/** La franja de lotes del gráfico (minutos del grader). */
export function franjaLotes(filas: readonly FilaLotes[]): FranjaLote[] {
  return filas.flatMap((f) => (f.tipo === 'lote' ? [{ k: f.k, x0: f.desdeMin, x1: f.hastaMin, lote: f.lote, distinto: !!f.cmp?.distinto, pesoMedioKg: f.t.perfil.pesoMedioKg }] : []))
}

/** Rótulo de un lote en la franja según su ancho en px (`''` = sin rótulo). */
export function rotuloFranja(f: FranjaLote, anchoPx: number): string {
  if (anchoPx <= ROTULO_LOTE_MIN_PX) return ''
  const n = f.lote.replace(/\D/g, '').slice(-3) || f.lote.slice(-3)
  if (anchoPx <= ROTULO_LOTE_LARGO_PX) return `…${n}`
  return `lote ${n}${f.distinto ? ' · distinto' : ''}`
}

/** El lote en que cae un minuto del grader (para el tooltip), o `null`. */
export function loteDelMinuto(franja: readonly FranjaLote[], m: number): FranjaLote | null {
  return franja.find((f) => m >= f.x0 && m < f.x1) ?? null
}

/** El índice del último tramo de un lote (la acción «Revisar gates» apunta al lote en curso). */
export function indiceLote(filas: readonly FilaLotes[], lote: string): number | null {
  for (let i = filas.length - 1; i >= 0; i--) {
    const f = filas[i]!
    if (f.tipo === 'lote' && f.lote === lote) return f.k
  }
  return null
}
