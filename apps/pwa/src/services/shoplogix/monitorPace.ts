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
  /**
   * Pasado el cierre y la línea sigue produciendo: HORA EXTRA.
   *
   * Antes acá la tarjeta desaparecía entera (sin minutos por delante no hay
   * ritmo que recomendar) — justo cuando la hora extra suele hacerse PARA
   * alcanzar la cuota. Ya no hay "ritmo necesario" que pedir, pero sí lo que
   * importa: cuánto falta y cuánto tardaría al ritmo de ahora.
   */
  | 'hora-extra'

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
  /**
   * Minutos de parada de convenio que faltan dentro de la ventana. 0 cuando la
   * colación ya pasó — ahí `workMin` y `remainingMin` coinciden.
   */
  pendingBreakMin: number
  /** Minutos de PRODUCCIÓN que quedan: el reloj menos `pendingBreakMin`. */
  workMin: number
  /** Proyección al cierre si sigue al ritmo actual. */
  projectedPieces: number
  /** Techo físico de la línea en pz/h, si se pudo calcular. */
  maxPerHour: number | null
  /** Porcentaje de la meta ya producido. */
  progressPct: number
  /** Minutos que tardaría en cubrir lo que falta al ritmo de ahora. Solo en
      'hora-extra': es la única guía honesta cuando ya no hay ventana. */
  extraMinutesNeeded?: number | null
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
  /**
   * Minutos de PARADA DE CONVENIO que todavía faltan de acá al cierre.
   *
   * ⚠⚠ Sin esto el ritmo necesario se reparte sobre tiempo de reloj y pide
   * menos de lo que hace falta. El 14-08 a las 12:50 en Filete faltaban 2.089
   * pz y 2 h 40, y la pantalla pedía 13,1 pz/min — pero dentro de esas 2 h 40
   * entraba la colación, ~55 min con la línea parada por convenio. Sobre los
   * 105 minutos en que la línea de verdad produce, lo que hace falta es 19,9.
   * La cuota ya se aplana en esas paradas desde #493; el ritmo necesario, no.
   *
   * De la misma fuente que todo lo demás (`timeBreakdown.planned` vía
   * `plannedBreaks`), incluyendo el PRONÓSTICO de las que faltan: la colación
   * de dentro de una hora todavía no es un hecho, pero contar con que no va a
   * ocurrir es peor pronóstico que suponerla.
   */
  pendingBreakMin?: number | null
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
   * El tiempo que la línea va a estar realmente produciendo de acá al cierre:
   * el reloj menos las paradas de convenio que faltan. Se dejan siempre 5
   * minutos de piso — con la colación cubriendo casi toda la ventana, dividir
   * por lo que queda daría un ritmo que no significa nada.
   */
  const convenioPorDelante = Math.max(
    0,
    Math.min(input.pendingBreakMin ?? 0, Math.max(0, remainingMin - 5)),
  )
  const workMin = Math.max(1, remainingMin - convenioPorDelante)

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
      pendingBreakMin: convenioPorDelante,
      workMin: Math.max(0, remainingMin - convenioPorDelante),
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

  /*
   * Sin tiempo por delante no hay ritmo que pedir (dividir daría infinito),
   * pero SÍ hay algo que decir mientras la línea siga andando: es hora extra.
   * Antes la tarjeta desaparecía justo cuando se estira el turno para llegar a
   * la cuota, y quien miraba se quedaba sin saber cuánto faltaba.
   */
  if (remainingMin <= 0) {
    if (shiftClosed || currentPerHour <= 0) return null
    return {
      verdict: 'hora-extra',
      targetPieces: meta,
      targetSource,
      remainingPieces,
      remainingMin: 0,
      pendingBreakMin: 0,
      workMin: 0,
      // No hay ritmo "necesario": el turno ya se pasó de su horario.
      requiredPerHour: 0,
      requiredPerMinute: 0,
      currentPerHour,
      gapPerHour: 0,
      projectedPieces: producedPieces,
      maxPerHour,
      progressPct: Math.min(100, (producedPieces / meta) * 100),
      extraMinutesNeeded: Math.round(remainingPieces / (currentPerHour / 60)),
      withExtraHour: null,
    }
  }

  /*
   * Los dos números sobre el tiempo PRODUCTIVO, no sobre el reloj: pedirle a
   * la línea que haga las piezas que faltan durante su colación no es una
   * meta, es un error de cuenta. Y la proyección, al revés: contar la colación
   * como si produjera infla el cierre.
   */
  const requiredPerHour = (remainingPieces / workMin) * 60
  const projectedPieces = producedPieces + workMin * (currentPerHour / 60)

  /*
   * Contra qué se juzga lo "realista": el MAYOR entre el promedio del turno y
   * el ritmo reciente. El promedio solo castigaría un turno que arrancó mal y
   * ya se recuperó; el reciente solo diría "imposible" durante cada colación.
   * El margen del 5% evita que un requerido apenas por encima del ritmo real
   * dispare el "solo apurando" — a esa distancia la línea llega sola.
   */
  const ritmoReal = Math.max(currentPerHour, input.recentPerHour ?? 0)
  const MARGEN = 1.05
  /*
   * Tope del "apurando" (Orel, 13-ago, segunda vuelta): "se alcanza pero con
   * 36 pz/min" en una línea que viene a 10 sigue siendo irreal — nadie apura
   * 3,6×. Por encima de +30% del ritmo real el veredicto es NO SE ALCANZA,
   * haya techo o no. Calibrado con los casos vistos hoy: pedir 12,6 viniendo
   * a 9,8 (+29%) es un apuro plausible; pedir 26,8 no.
   */
  const TOPE_APURO = 1.3
  const realista = ritmoReal > 0 && requiredPerHour <= ritmoReal * MARGEN

  const verdict: PaceVerdict =
    (maxPerHour != null && requiredPerHour > maxPerHour) ||
    (ritmoReal > 0 && requiredPerHour > ritmoReal * TOPE_APURO)
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
  // La hora extra se agrega al tiempo PRODUCTIVO: es una hora de línea andando
  // al final del turno, no una hora de reloj con otra colación adentro.
  const extraMin = workMin + 60
  const requiredWithExtra = (remainingPieces / extraMin) * 60
  const withExtraHour = verdict === 'alcanzable' ? null : {
    requiredPerHour: requiredWithExtra,
    requiredPerMinute: requiredWithExtra / 60,
    // "Factible" respeta los DOS topes: el techo histórico y el tope de apuro
    // sobre el ritmo real — si con la hora extra sigue pidiendo 2×, no basta.
    feasible:
      (maxPerHour == null || requiredWithExtra <= maxPerHour) &&
      (ritmoReal <= 0 || requiredWithExtra <= ritmoReal * TOPE_APURO),
    realistic: ritmoReal > 0 && requiredWithExtra <= ritmoReal * MARGEN,
    remainingMin: extraMin,
  }

  return {
    verdict,
    targetPieces: meta,
    targetSource,
    remainingPieces,
    remainingMin,
    pendingBreakMin: convenioPorDelante,
    workMin,
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
