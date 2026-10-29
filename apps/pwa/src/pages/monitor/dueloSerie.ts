/**
 * Serie minuto a minuto del Duelo: la hoja de la que cuelgan «minutos a buen ritmo», el arranque del turno y la curva
 * fina. Módulo hoja: no importa nada de `duelo.ts` ni de `dueloDatosPC.ts`, para que los dos puedan usarlo sin ciclos.
 *
 * Las horas de planta de los ISO son wall-clock sellados como UTC.
 */
import type { PacePoint } from '@/services/shoplogix/monitorCompare'

/** Un minuto de la línea cuenta como «sostenido» (y como «arrancó») cuando rinde al menos esta fracción de su esperado. */
export const UMBRAL_SOSTENIDA = 0.9

export interface SerieMinuto {
  desde: string
  maquinas: Array<{ id: string; esperado: number | null; cycles: number[] }>
}

/** Suma por minuto de la línea y su esperado (null si alguna máquina no trae esperado: no se puede afirmar «a ritmo»). */
export function sumaDeLinea(s: SerieMinuto | null | undefined): { suma: number[]; esperado: number | null } | null {
  if (!s?.maquinas?.length) return null
  const largo = Math.min(...s.maquinas.map((m) => m.cycles.length))
  if (!(largo > 0)) return null
  const suma = Array.from({ length: largo }, (_, i) => s.maquinas.reduce((a, m) => a + (m.cycles[i] ?? 0), 0))
  const completo = s.maquinas.every((m) => m.esperado != null && m.esperado > 0)
  return { suma, esperado: completo ? s.maquinas.reduce((a, m) => a + (m.esperado ?? 0), 0) : null }
}

/**
 * Minuto del arranque PRODUCTIVO en una serie por minuto: el primero con piezas, saltando picos sueltos (más de 60 min
 * de vacío hasta lo siguiente). Es la misma regla que el backend (`indiceArranqueProductivo`) y la de la curva del Duelo.
 * -1 si no hay piezas.
 */
export function arranqueEnSerie(suma: readonly number[]): number {
  const conPz: number[] = []
  suma.forEach((v, i) => { if (v > 0) conPz.push(i) })
  if (conPz.length === 0) return -1
  let inicio = conPz[0]!
  for (let k = 1; k < conPz.length; k++) {
    if (conPz[k]! - conPz[k - 1]! - 1 > 60) inicio = conPz[k]!
    else break
  }
  return inicio
}

export interface Sostenida {
  /** Minutos (desde la primera pieza, el mismo eje de la carrera) en que la línea rindió ≥ 90 % de su esperado. */
  minutos: number[]
  /** Esperado de la línea (pz/min). */
  esperado: number
}

const CINCO_MIN = 300_000
const MIN_MS = 60_000

/**
 * Los minutos sostenidos de un turno, ubicados en el eje de producción. El origen es el inicio del tramo de 5 min de la
 * primera pieza (como `curvaCompacta`), así que cae en el mismo minuto que la curva. null sin serie o sin esperado.
 */
export function sostenidaDeSerie(s: SerieMinuto | null | undefined): Sostenida | null {
  const base = sumaDeLinea(s)
  if (!s || !base || base.esperado == null) return null
  const desdeMs = Date.parse(s.desde)
  const i0 = arranqueEnSerie(base.suma)
  if (!Number.isFinite(desdeMs) || i0 < 0) return null
  const t0 = Math.floor((desdeMs + i0 * MIN_MS) / CINCO_MIN) * CINCO_MIN
  const minutos: number[] = []
  for (let i = i0; i < base.suma.length; i++) {
    if (base.suma[i]! >= UMBRAL_SOSTENIDA * base.esperado) minutos.push(Math.round((desdeMs + i * MIN_MS - t0) / MIN_MS))
  }
  return { minutos, esperado: base.esperado }
}

/**
 * La curva acumulada MINUTO A MINUTO de un turno, en el mismo eje que la carrera (minuto 0 = inicio del tramo de 5 min de
 * la primera pieza). Es la serie fina con la que se contesta «cuántas hechas a la misma hora» sin el escalón de 5 o 15 min.
 * Vacía sin serie o sin piezas.
 */
export function curvaDeSerieMinuto(s: SerieMinuto | null | undefined): PacePoint[] {
  const base = sumaDeLinea(s)
  if (!s || !base) return []
  const desdeMs = Date.parse(s.desde)
  const i0 = arranqueEnSerie(base.suma)
  if (!Number.isFinite(desdeMs) || i0 < 0) return []
  const t0 = Math.floor((desdeMs + i0 * MIN_MS) / CINCO_MIN) * CINCO_MIN
  const out: PacePoint[] = []
  let acum = 0
  for (let i = i0; i < base.suma.length; i++) {
    acum += base.suma[i]!
    out.push({ minutes: Math.round((desdeMs + (i + 1) * MIN_MS - t0) / MIN_MS), pieces: acum })
  }
  return out
}

// ── Arranque del turno ───────────────────────────────────────────────────────

/**
 * Cómo se mide el arranque, siempre desde el inicio PLANIFICADO (`scheduledStart`):
 *  - `ritmo90` (Eviscerado): minutos hasta que la línea llega al 90 % del ritmo esperado y lo sostiene.
 *  - `primera-pieza` (Filete): minutos hasta la primera pieza tras el inicio planificado.
 */
export type ModoArranque = 'ritmo90' | 'primera-pieza'

/** Cuántos minutos seguidos tiene que sostener el 90 % para decir que la línea arrancó (un minuto suelto no es arranque). */
export const VENTANA_ARRANQUE_MIN = 5

export interface EntradaArranque {
  modo: ModoArranque
  /** Inicio planificado del turno (ms, hora de planta sellada como UTC). */
  inicioPlanMs: number
  /** Serie minuto a minuto del turno (la de 12 h puede traer minutos de antes del inicio: se ignoran). */
  serie?: SerieMinuto | null
  /** Tramos de 5 min (`live.series`), por si no hay serie minuto a minuto (solo sirve a `primera-pieza`). */
  tramos?: ReadonlyArray<{ t?: string | null; pieces?: number | null }> | null
}

/**
 * Minutos entre el inicio planificado y el arranque del turno, o null si todavía no arrancó o no hay dato con el que
 * afirmarlo (nunca un cero inventado). Solo cuentan los minutos desde el inicio planificado: lo que la línea hizo antes
 * es del turno anterior.
 */
export function arranqueDeTurno(e: EntradaArranque): number | null {
  if (!Number.isFinite(e.inicioPlanMs)) return null
  const base = sumaDeLinea(e.serie)
  const desdeMs = Date.parse(e.serie?.desde ?? '')
  if (base && Number.isFinite(desdeMs)) {
    const i0 = Math.max(0, Math.ceil((e.inicioPlanMs - desdeMs) / MIN_MS))
    if (e.modo === 'primera-pieza') {
      for (let i = i0; i < base.suma.length; i++) if (base.suma[i]! > 0) return Math.max(0, Math.round((desdeMs + i * MIN_MS - e.inicioPlanMs) / MIN_MS))
      return null
    }
    if (base.esperado == null) return null
    const meta = UMBRAL_SOSTENIDA * base.esperado * VENTANA_ARRANQUE_MIN
    let ventana = 0
    for (let i = i0; i < base.suma.length; i++) {
      ventana += base.suma[i]!
      if (i - i0 >= VENTANA_ARRANQUE_MIN) ventana -= base.suma[i - VENTANA_ARRANQUE_MIN]!
      if (i - i0 >= VENTANA_ARRANQUE_MIN - 1 && ventana >= meta) {
        return Math.max(0, Math.round((desdeMs + (i - VENTANA_ARRANQUE_MIN + 1) * MIN_MS - e.inicioPlanMs) / MIN_MS))
      }
    }
    return null
  }
  if (e.modo !== 'primera-pieza') return null
  for (const p of e.tramos ?? []) {
    const t = Date.parse(p?.t ?? '')
    if (!Number.isFinite(t) || (p.pieces ?? 0) <= 0) continue
    if (t + CINCO_MIN <= e.inicioPlanMs) continue
    return Math.max(0, Math.round((t - e.inicioPlanMs) / MIN_MS))
  }
  return null
}
