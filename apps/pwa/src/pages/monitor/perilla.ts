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
 * Por ahora ninguna pantalla ni cálculo usa `varaMinuto`: `llenadoDe`, `aRitmo` y el
 * Duelo siguen con la vara actual.
 */
import type { PerillaHistorial, PerillaMaquina } from '@/services/shoplogix/pinShiftEnd'

/** Forma de `live.perillas` en el monitor público (publicShiftMonitor.service.ts). */
export interface PerillasDeLinea {
  actual: Record<string, PerillaMaquina>
  historial: PerillaHistorial[]
}

/** De dónde sale la vara del minuto: la perilla de la máquina o el esperado de Shoplogix. */
export type FuenteVara = 'perilla' | 'shoplogix'

/**
 * Velocidad de la perilla vigente para una máquina en `tMs`: la anotación más
 * reciente con `desde <= tMs`. Null si la máquina no tenía ninguna hasta ese instante.
 *
 * Mira el historial Y la anotación `actual`. El historial se recorta a 100 entradas;
 * `actual` asegura que la anotación más nueva nunca se pierda por ese recorte.
 */
export function perillaEn(
  perillas: PerillasDeLinea | null | undefined,
  machineId: string,
  tMs: number,
): number | null {
  if (!perillas) return null
  const candidatas: PerillaMaquina[] = [
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
 * Umbral de ritmo a partir de la perilla: el entero hacia arriba de 0,75 × cpm.
 * 17 → 13 · 16 → 12 · 18 → 14. El epsilon resta una cantidad ínfima antes de
 * redondear, para que un resultado exacto no suba a la unidad siguiente por un
 * error de coma flotante.
 */
const EPSILON_UMBRAL = 1e-9

export function umbralARitmo(cpm: number): number {
  return Math.ceil(cpm * 0.75 - EPSILON_UMBRAL)
}
