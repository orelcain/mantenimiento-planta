/**
 * perilla.ts — la velocidad de la perilla de cada Baader y la vara que sale de ella.
 *
 * La perilla es el ritmo (pz/min) que la máquina tiene configurado. Shoplogix dice
 * otro número, el esperado. Mientras haya una anotación vigente para esa máquina en
 * ese instante, la vara es la perilla; si no, cae al esperado de Shoplogix.
 *
 * Funciones puras: no leen Firestore ni el reloj. El tiempo entra como parámetro
 * (ms), así que lo que se prueba es lo que se usa.
 *
 * `varaMinuto` la usa `varaEnMinuto` (ritmoVivo.ts), que alimenta el llenado, la franja
 * y el gráfico del Ritmo en vivo. El Duelo, la cascada y el OEE no la usan: siguen con el
 * esperado de Shoplogix.
 */
import type { PerillaMaquina } from '@/services/shoplogix/pinShiftEnd'
import { aWallClockMs } from './contadorCrudo'

/**
 * Lo que el monitor público ve de una perilla: velocidad y cuándo entró en vigor.
 * Quién la anotó no sale del servidor (functions/publicMonitor.js, normPerilla).
 */
export type PerillaPublica = { cpm: number; desde: string }

/** Forma de `live.perillas` en el monitor público (publicShiftMonitor.service.ts). */
export interface PerillasDeLinea {
  actual: Record<string, PerillaPublica>
  historial: Array<PerillaPublica & { machineId: string }>
}

/** De dónde sale la vara del minuto: la perilla de la máquina o el esperado de Shoplogix. */
export type FuenteVara = 'perilla' | 'shoplogix'

/**
 * Velocidad de la perilla vigente para una máquina en `tMs`: la anotación más
 * reciente con `desde <= tMs`. Null si la máquina no tenía ninguna hasta ese instante,
 * o si `tMs` no es un número finito (con NaN, cualquier anotación parecería vigente).
 *
 * Mira el historial Y la anotación `actual`. El historial se recorta a 100 entradas;
 * `actual` asegura que la anotación más nueva nunca se pierda por ese recorte.
 */
export function perillaEn(
  perillas: PerillasDeLinea | null | undefined,
  machineId: string,
  tMs: number,
): number | null {
  if (!perillas || !Number.isFinite(tMs)) return null
  const candidatas: PerillaPublica[] = [
    ...(perillas.historial ?? []).filter((h) => h.machineId === machineId),
    ...(perillas.actual?.[machineId] ? [perillas.actual[machineId]] : []),
  ]
  let vigente: { cpm: number; t: number } | null = null
  for (const c of candidatas) {
    const t = Date.parse(c.desde)
    if (!Number.isFinite(t) || !Number.isFinite(c.cpm) || t > tMs) continue
    if (!vigente || t >= vigente.t) vigente = { cpm: c.cpm, t }
  }
  return vigente ? vigente.cpm : null
}

/**
 * Vara del minuto para una máquina: la perilla vigente si la hay; si no, el esperado
 * de Shoplogix. `fuente` dice de dónde salió, para poder decirlo en pantalla. Si no
 * hay ninguno de los dos, `cpm` es null y la fuente queda en 'shoplogix'.
 */
export function varaMinuto(
  perillas: PerillasDeLinea | null | undefined,
  machineId: string,
  tMs: number,
  esperadoShoplogix: number | null,
): { cpm: number | null; fuente: FuenteVara } {
  const perilla = perillaEn(perillas, machineId, tMs)
  if (perilla !== null) return { cpm: perilla, fuente: 'perilla' }
  return { cpm: esperadoShoplogix, fuente: 'shoplogix' }
}

/**
 * Fracción de la perilla desde la que un minuto cuenta «a ritmo». Con perilla
 * anotada, «a ritmo» es la perilla completa (decisión de Orel, 04-11): con 17, 17 o
 * más. Es la única constante del umbral. Sin perilla no se usa: la vara de Shoplogix
 * conserva el 75 % de siempre (`tonoVara`).
 */
export const UMBRAL_A_RITMO_PERILLA = 1
const EPSILON_UMBRAL = 1e-9

/**
 * Umbral «a ritmo» entero de una perilla: el entero hacia arriba de
 * UMBRAL_A_RITMO_PERILLA × cpm. Con 17 da 17. El epsilon resta una cantidad ínfima
 * antes de redondear, para que un resultado exacto no suba a la unidad siguiente
 * por un error de coma flotante.
 */
export function umbralARitmo(cpm: number): number {
  return Math.ceil(cpm * UMBRAL_A_RITMO_PERILLA - EPSILON_UMBRAL)
}

/** Tono de un minuto contra su vara. `sin` = la Baader no tiene vara ni dato de ese minuto. */
export type TonoVara = 'bien' | 'atento' | 'mal' | 'sin'

/**
 * Tono de un minuto contra SU vara. Con perilla: «a ritmo» desde el umbral entero,
 * «bajo» desde la mitad de la perilla y «muy bajo» debajo. Con vara de Shoplogix: el
 * 75 % y el 50 % de siempre. No cambia `tonoDe` ni `tonoMinuto`, que comparte el Duelo.
 */
export function tonoVara(v: number, vara: { cpm: number | null; fuente: FuenteVara }): TonoVara {
  const cpm = vara.cpm
  if (cpm == null || !(cpm > 0)) return v > 0 ? 'bien' : 'sin'
  if (vara.fuente === 'perilla') {
    if (v >= umbralARitmo(cpm)) return 'bien'
    return v / cpm >= 0.5 ? 'atento' : 'mal'
  }
  const r = v / cpm
  return r >= 0.75 ? 'bien' : r >= 0.5 ? 'atento' : 'mal'
}

/**
 * Umbral «a ritmo» entero de una vara, según su fuente: con perilla, `umbralARitmo`
 * (17 → 17); con vara de Shoplogix, el 75 % redondeado hacia arriba (17 → 13, como
 * antes de la perilla). Null si no hay vara.
 */
export function umbralEntero(vara: { cpm: number | null; fuente: FuenteVara }): number | null {
  if (vara.cpm == null || !(vara.cpm > 0)) return null
  return vara.fuente === 'perilla' ? umbralARitmo(vara.cpm) : Math.ceil(vara.cpm * 0.75 - EPSILON_UMBRAL)
}

/**
 * `desde` de una anotación: la hora de PLANTA (America/Santiago) sellada como UTC, la
 * misma convención que los minutos del monitor. Con `toISOString()` directo quedaría
 * UTC real: una perilla anotada a las 10:00 en Chile entraría en vigor a las 13:00.
 * Reusa `aWallClockMs`, que ya pasa los instantes del contador a hora de planta.
 */
export function desdePerilla(nowMs: number): string {
  const wall = Number.isFinite(nowMs) ? aWallClockMs(new Date(nowMs).toISOString()) : null
  if (wall == null) throw new Error('Instante de la perilla no válido')
  return new Date(wall).toISOString()
}

/** La anotación nueva: la velocidad, quién la anotó y su `desde` en hora de planta. */
export function construirPerilla(params: { cpm: number; por: string | null; nowMs: number }): PerillaMaquina {
  return { cpm: params.cpm, desde: desdePerilla(params.nowMs), por: params.por }
}
