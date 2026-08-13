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
  /** Falta producción y el ritmo requerido está dentro del ritmo que la línea
      VIENE TRAYENDO en este turno. */
  | 'alcanzable'
  /**
   * Cabe bajo el techo histórico, pero exige más que el ritmo real del turno.
   *
   * El escalón que faltaba (pedido de Orel, 13-ago): "Se alcanza... pidiendo
   * 24 pz/min" cuando la línea viene a 10 es verdad solo en teoría — el techo
   * es lo mejor que la línea hizo ALGUNA VEZ, no lo que está haciendo hoy. Lo
   * honesto es decir "solo apurando" y ofrecer la hora extra ya en este
   * escalón, no recién cuando es imposible.
   */
  | 'exigente'
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
  /** Porcentaje de la meta ya producido. */
  progressPct: number
  /**
   * Qué pasaría con UNA HORA EXTRA.
   *
   * Es la pregunta que sigue naturalmente a "no se alcanza": si alargar el
   * turno una hora lo resuelve, eso es una decisión que alguien puede tomar
   * ahora — y muy distinta de "no llegamos y listo". null cuando no aporta:
   * cuota cumplida, o ya se alcanza sin estirar nada.
   */
  withExtraHour: {
    /** Ritmo que haría falta con esa hora de más. */
    requiredPerHour: number
    requiredPerMinute: number
    /** true si ese ritmo entra en el techo de la línea (o si no hay techo). */
    feasible: boolean
    /** true si además entra en el ritmo que la línea VIENE trayendo: "con la
        hora extra bastaría el ritmo que ya traés" es otra conversación. */
    realistic: boolean
    /** Minutos totales disponibles con la hora extra. */
    remainingMin: number
  } | null
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
  /** Ritmo de la última media hora, pz/h. Para juzgar qué es "realista" se usa
      el MAYOR entre este y el promedio: durante una colación el reciente cae a
      cero y solo con él todo parecería inalcanzable. */
  recentPerHour?: number | null
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

  /*
   * ⚠ Un techo por DEBAJO del ritmo ya demostrado no es un techo.
   *
   * `maxPerHour` sale de repartir lo que el sensor espera del turno sobre las
   * horas de la ventana, y esas dos cosas pueden venir de turnos distintos —
   * salía 1.029 pz/h en una línea que ya venía corriendo a 1.464. Con ese
   * número la pantalla decía a la vez "con este ritmo alcanza" y "la meta ya no
   * se alcanza". Si el techo es menor que lo que la línea YA hizo, el techo
   * está mal, así que se descarta: mejor no marcar imposible que marcarlo con
   * una referencia falsa.
   */
  const techoCrudo = input.maxPerHour && input.maxPerHour > 0 ? input.maxPerHour : null
  const maxPerHour = techoCrudo != null && techoCrudo >= currentPerHour ? techoCrudo : null

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
      progressPct: 100,
      withExtraHour: null,
    }
  }

  // Sin tiempo por delante no hay ritmo que sirva: dividir daría infinito.
  if (remainingMin <= 0) return null

  const requiredPerHour = (remainingPieces / remainingMin) * 60
  const projectedPieces = producedPieces + remainingMin * (currentPerHour / 60)

  /*
   * Contra qué se juzga lo "realista": el MAYOR entre el promedio del turno y
   * el ritmo reciente. El promedio solo castigaría un turno que arrancó mal y
   * ya se recuperó; el reciente solo diría "imposible" durante cada colación.
   * El margen del 5% evita que un requerido apenas por encima del ritmo real
   * dispare el "solo apurando" — a esa distancia la línea llega sola.
   */
  const ritmoReal = Math.max(currentPerHour, input.recentPerHour ?? 0)
  const MARGEN = 1.05
  const realista = ritmoReal > 0 && requiredPerHour <= ritmoReal * MARGEN

  const verdict: PaceVerdict =
    maxPerHour != null && requiredPerHour > maxPerHour
      ? 'fuera-de-alcance'
      : ritmoReal > 0 && !realista
      ? 'exigente'
      : 'alcanzable'

  /*
   * La hora extra. Se ofrece desde el escalón "exigente", no recién cuando es
   * imposible: si alargar el turno baja el requerido al ritmo que la línea YA
   * trae, esa es una decisión que alguien puede tomar ahora. Con verdict
   * alcanzable sigue sin ofrecerse — proponer alargar cuando alcanza es ruido.
   */
  const extraMin = remainingMin + 60
  const requiredWithExtra = (remainingPieces / extraMin) * 60
  const withExtraHour = verdict === 'alcanzable' ? null : {
    requiredPerHour: requiredWithExtra,
    requiredPerMinute: requiredWithExtra / 60,
    feasible: maxPerHour == null || requiredWithExtra <= maxPerHour,
    realistic: ritmoReal > 0 && requiredWithExtra <= ritmoReal * MARGEN,
    remainingMin: extraMin,
  }

  return {
    verdict,
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
    progressPct: Math.min(100, (producedPieces / meta) * 100),
    withExtraHour,
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
