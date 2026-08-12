/**
 * monitorPace.ts — "¿a qué ritmo tengo que ir para llegar a la cuota?"
 *
 * El monitor ya decía cuántas piezas van y qué porcentaje de la meta es. Lo que
 * faltaba es lo accionable: cuánto queda, cuánto tiempo hay, y a qué ritmo hay
 * que ir de acá al cierre. Con eso, a mitad de turno se puede decidir si se
 * compensa o no — que es la pregunta de Orel.
 *
 * ── Por qué avisa cuando NO se llega ────────────────────────────────────────
 *
 * Un "necesitás 47 pz/min" en una línea que da 51 como máximo teórico no es una
 * meta, es una cifra que hace perder la confianza en la pantalla. Cuando el
 * ritmo requerido supera lo que la línea puede dar, se dice: la cuota no se
 * alcanza y lo honesto es replanificar, no apurar. Ese techo sale de las propias
 * máquinas del turno (`maxPiecesPerHour`), no de una constante.
 *
 * ⚠ Horas de turno en wall-clock de planta, igual que el resto del monitor.
 */

export type PaceVerdict =
  /** Falta producción y el ritmo requerido está dentro de lo posible. */
  | 'alcanzable'
  /** El ritmo requerido supera el techo físico de la línea. */
  | 'fuera-de-alcance'
  /** Ya se llegó a la cuota. */
  | 'cumplida'

export interface PaceToTarget {
  verdict: PaceVerdict
  /** La meta usada y de dónde salió — se muestra, para no confundir una con otra. */
  targetPieces: number
  targetSource: PaceTargetSource
  /** Piezas que faltan para la cuota (0 si ya se cumplió). */
  remainingPieces: number
  /** Minutos hasta el cierre programado. */
  remainingMin: number
  /** Ritmo necesario de acá al cierre. 0 si la cuota ya se cumplió. */
  requiredPerHour: number
  requiredPerMinute: number
  /** Ritmo que la línea viene teniendo, para contrastar. */
  currentPerHour: number
  /**
   * Cuánto hay que acelerar sobre el ritmo actual, en pz/h. Negativo o 0 = con
   * el ritmo actual alcanza.
   */
  gapPerHour: number
  /** Proyección al cierre si sigue al ritmo actual. */
  projectedPieces: number
  /** Techo físico de la línea en pz/h, si se pudo calcular. */
  maxPerHour: number | null
}

/** De dónde salió la meta contra la que se calcula el ritmo. */
export type PaceTargetSource = 'cuota' | 'objetivo-sensor'

export interface PaceInput {
  targetPieces: number | null | undefined
  /**
   * Piezas que Shoplogix espera del turno a objetivo. Se usa como meta cuando
   * el monitor no trae cuota configurada — sin esto la recomendación no
   * aparecería nunca en los links creados sin meta, que son la mayoría.
   */
  expectedPieces?: number | null
  producedPieces: number
  /** Cierre programado del turno, ISO wall-clock. */
  scheduledEnd: string | null | undefined
  /** "Ahora" en ms wall-clock de planta. */
  nowWallMs: number
  /** Ritmo que la línea viene teniendo, pz/h. */
  currentPerHour: number
  /** Suma de los objetivos de las máquinas del turno, pz/h. Null si no se sabe. */
  maxPerHour?: number | null
  /** Un turno cerrado no tiene ritmo que recomendar. */
  shiftClosed?: boolean
}

/**
 * Devuelve null cuando no hay nada honesto que recomendar: sin cuota, con el
 * turno cerrado, o sin tiempo por delante (ahí el número tendería a infinito y
 * no ayudaría a nadie).
 */
export function computePaceToTarget(input: PaceInput): PaceToTarget | null {
  const { producedPieces, scheduledEnd, nowWallMs, currentPerHour, shiftClosed } = input
  if (shiftClosed) return null
  if (!scheduledEnd) return null

  // La cuota manda; el objetivo del sensor es el respaldo.
  const cuota = input.targetPieces && input.targetPieces > 0 ? input.targetPieces : null
  const esperado = input.expectedPieces && input.expectedPieces > 0 ? input.expectedPieces : null
  const meta = cuota ?? esperado
  if (!meta) return null
  const targetSource: PaceTargetSource = cuota != null ? 'cuota' : 'objetivo-sensor'

  const endMs = Date.parse(scheduledEnd)
  if (Number.isNaN(endMs)) return null

  const remainingMin = Math.floor((endMs - nowWallMs) / 60_000)
  const remainingPieces = Math.max(0, meta - producedPieces)
  const maxPerHour = input.maxPerHour && input.maxPerHour > 0 ? input.maxPerHour : null

  // Cuota cumplida: se informa aunque queden minutos — es la buena noticia.
  if (remainingPieces === 0) {
    return {
      verdict: 'cumplida',
      targetPieces: meta,
      targetSource,
      remainingPieces: 0,
      remainingMin: Math.max(0, remainingMin),
      requiredPerHour: 0,
      requiredPerMinute: 0,
      currentPerHour,
      gapPerHour: 0,
      projectedPieces: producedPieces + Math.max(0, remainingMin) * (currentPerHour / 60),
      maxPerHour,
    }
  }

  // Sin tiempo por delante no hay ritmo que sirva: dividir daría infinito.
  if (remainingMin <= 0) return null

  const requiredPerHour = (remainingPieces / remainingMin) * 60
  const projectedPieces = producedPieces + remainingMin * (currentPerHour / 60)

  return {
    verdict: maxPerHour != null && requiredPerHour > maxPerHour ? 'fuera-de-alcance' : 'alcanzable',
    targetPieces: meta,
    targetSource,
    remainingPieces,
    remainingMin,
    requiredPerHour,
    requiredPerMinute: requiredPerHour / 60,
    currentPerHour,
    gapPerHour: requiredPerHour - currentPerHour,
    projectedPieces: Math.round(projectedPieces),
    maxPerHour,
  }
}

/**
 * Techo de la línea en pz/h, derivado de lo que el sensor espera del turno.
 *
 * `expectedPieces` es la suma de `expectedTotalCycles` de las máquinas: las
 * piezas que Shoplogix espera del turno COMPLETO a objetivo. Repartidas sobre
 * las horas programadas dan el ritmo objetivo de la línea.
 *
 * Se usa solo para decir "esto no se alcanza", así que ante la duda devuelve
 * null: un techo subestimado marcaría como imposible una cuota que sí se puede,
 * y esa es la peor forma de equivocarse acá.
 */
export function lineMaxPerHour(
  expectedPieces: number | null | undefined,
  scheduledStart: string | null | undefined,
  scheduledEnd: string | null | undefined,
): number | null {
  if (!expectedPieces || expectedPieces <= 0) return null
  if (!scheduledStart || !scheduledEnd) return null
  const ini = Date.parse(scheduledStart)
  const fin = Date.parse(scheduledEnd)
  if (Number.isNaN(ini) || Number.isNaN(fin)) return null
  const horas = (fin - ini) / 3_600_000
  if (horas <= 0) return null
  return expectedPieces / horas
}
