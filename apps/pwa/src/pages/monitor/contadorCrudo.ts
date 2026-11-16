/**
 * Qué número va ARRIBA, el grande, y de dónde sale.
 *
 * ── El problema ─────────────────────────────────────────────────────────────
 * El monitor tenía dos contadores del mismo turno, con dos horas de corte
 * distintas, uno encima del otro:
 *
 *   · el grande        805 pz «datos hasta las 23:00»   ← buckets de 5 min
 *   · el pie      Shoplogix marca 805 pz a las 22:56    ← contador vivo
 *
 * Los dos dicen la verdad y aun así se contradicen, porque no miran el mismo
 * instante. Quien está en la línea ve la pantalla de planta, y esa pantalla
 * muestra el contador vivo: el número grande tiene que ser ESE. El derivado de
 * los buckets llega entre 1,5 y 8 min tarde.
 *
 * ── Por qué no es un cambio de una línea ────────────────────────────────────
 * 1. El contador vivo se cae. El 2026-08-19 devolvió 0 en Chonchi y Filete con
 *    las dos plantas produciendo, y quedó congelado horas sin que nadie lo
 *    notara; los buckets siguieron llegando porque vienen de otra consulta.
 *    Así que hay que elegir la fuente en cada render, no una vez.
 * 2. NO cuentan lo mismo. El contador vivo es el acumulado del turno SEGÚN
 *    SHOPLOGIX, que manda a otro bucket lo producido fuera del horario. El
 *    número grande de antes (`totalPieces`) incluía eso. Cambiar la fuente sin
 *    más haría desaparecer piezas que la gente contó en la línea — el mismo
 *    descuadre que este monitor viene cerrando.
 * 3. ⚠ Las dos horas están en bases distintas: `pulse.at` es UTC REAL (lo
 *    estampa el servidor) y la serie viene en wall-clock-as-UTC (hora de
 *    planta). Compararlas sin convertir da cuatro horas de diferencia y elegiría
 *    siempre la fuente equivocada.
 */

import type { PublicMonitorLive, PulsoMonitor } from '@/services/shoplogix/publicShiftMonitor.service'
import { aWallClockMs } from '@/lib/horaDePlanta'

/** `aWallClockMs` vive en `lib/horaDePlanta` (también la usa `services/`). Se re-exporta aquí para quien ya lo importaba de este módulo. */
export { aWallClockMs }

export interface ContadorElegido {
  /** El número que va grande. */
  valor: number
  fuente: 'pulso' | 'buckets'
  /** Hora de corte en RELOJ DE PLANTA, o null si no se puede saber. */
  corteWallMs: number | null
  /**
   * Piezas producidas fuera del horario del turno (antes + después). `valor`
   * YA las incluye (Orel, 15-11: «sumalo al grande, necesito q se vean todas
   * las piezas»); este dato solo dice qué parte del total es de afuera.
   */
  fueraDelHorario: number
  /**
   * Lo que marca el contador vivo de Shoplogix tal cual (`pulse.totalCycles`).
   * Trae el turno y la hora extra de después, NO lo de antes del arranque.
   * Con el derivado, igual a `valor`.
   */
  crudo: number
  /**
   * Piezas de antes del horario (rangos `kind: 'antes'`) sumadas encima del
   * crudo: `valor = crudo + antesDelHorario`. Es la base del reloj de
   * reproducción, cuya serie por minuto parte en el inicio del turno. 0 con el derivado.
   */
  antesDelHorario: number
  /** Por qué se está mostrando el derivado en vez del crudo. null si va el crudo. */
  motivoFallback: string | null
}

/**
 * Cuánto puede quedar atrás el contador vivo antes de que convenga el derivado.
 * El pulso se lee cada minuto; con más de un bucket de atraso ya no es «vivo».
 */
const TOLERANCIA_MS = 6 * 60_000

/** Fin del último tramo con dato: el bucket cierra 5 min después de su marca. */
export function corteDeBuckets(live: Pick<PublicMonitorLive, 'series'>): number | null {
  const serie = live.series
  if (!serie || !serie.length) return null
  const ultimo = serie[serie.length - 1]
  if (!ultimo) return null
  const ms = Date.parse(ultimo.t)
  return Number.isFinite(ms) ? ms + 5 * 60_000 : null
}

/**
 * El ritmo VIVO que la tarjeta muestra como «Ahora», con su hora.
 *
 * El pulso queda mudo (`cpm: null`) unos minutos cuando el contador de
 * Shoplogix hace una discontinuidad (reconciliación, cambio de turno). La
 * tarjeta caía a la media de 15 min y en un cierre con goteo decía 33 pz/min
 * cuando la realidad era 12 — Orel lo cazó en vivo (29-08). El backend ahora
 * arrastra el último vivo con su hora (`vivoPrevio`); acá se decide si todavía
 * vale como «ahora»: fresco de verdad, o arrastrado hace poco (se marca
 * `recalibrando` para decirlo en pantalla). Más viejo que eso, null — y la
 * tarjeta cae a la media con su etiqueta honesta, que para un contador caído
 * de verdad ES lo correcto.
 */
export interface PulsoVivoElegido {
  cpm: number
  /** La hora DEL VIVO (no de la última lectura): con arrastre, es más vieja. */
  at: string
  porMaquina: Array<{ id: string; cpm: number }> | null
  /** true cuando el número es el arrastrado — la pantalla lo dice. */
  recalibrando: boolean
}

/** Cuánto arrastre se acepta antes de soltar el vivo y caer a la media. */
const VIVO_TOLERANCIA_MS = 6 * 60_000

export function pulsoVivo(pulse: PulsoMonitor | null | undefined): PulsoVivoElegido | null {
  if (!pulse) return null
  if (pulse.cpm != null) {
    return { cpm: pulse.cpm, at: pulse.at, porMaquina: pulse.porMaquina ?? null, recalibrando: false }
  }
  const v = pulse.vivoPrevio
  if (!v) return null
  const edad = Date.parse(pulse.at) - Date.parse(v.at)
  if (!Number.isFinite(edad) || edad > VIVO_TOLERANCIA_MS) return null
  return { cpm: v.cpm, at: v.at, porMaquina: v.porMaquina ?? null, recalibrando: true }
}

/**
 * Elige la fuente del número grande.
 *
 * La regla es «el crudo de Shoplogix manda, salvo que no esté o esté viejo».
 * Cuando manda el derivado se dice por qué: un número sin explicación que no
 * coincide con la pantalla de planta es exactamente lo que rompe la confianza.
 */
export function elegirContador({ pulse, live, shiftClosed }: {
  pulse: PulsoMonitor | null | undefined
  live: PublicMonitorLive
  shiftClosed?: boolean
}): ContadorElegido {
  const corteBuckets = corteDeBuckets(live)
  const fueraDelHorario = Math.max(0, live.outsidePieces ?? 0)
  const derivado = (motivo: string | null): ContadorElegido => ({
    valor: live.totalPieces ?? 0,
    fuente: 'buckets',
    corteWallMs: corteBuckets,
    // El derivado YA incluye lo de fuera del horario: no va el desglose contra
    // el crudo, porque no hay crudo contra el cual desglosarlo.
    fueraDelHorario: 0,
    crudo: live.totalPieces ?? 0,
    antesDelHorario: 0,
    motivoFallback: motivo,
  })

  /* Con el turno cerrado el total ya es final y el rollup de Shoplogix deja de
     contar el turno que terminó: pedirle el vivo devuelve 0. */
  if (shiftClosed) return derivado(null)
  if (!pulse || !(pulse.totalCycles > 0)) {
    return derivado('el contador vivo de Shoplogix no está respondiendo')
  }

  const cortePulso = aWallClockMs(pulse.at)
  if (cortePulso == null) return derivado('el contador vivo llegó sin hora')
  if (corteBuckets != null && corteBuckets > cortePulso + TOLERANCIA_MS) {
    return derivado('el contador vivo de Shoplogix quedó atrás')
  }

  /* El contador vivo cuenta desde el primer minuto del turno con nombre (más la
     hora extra de después). Lo del arranque anticipado (p. ej. 22:10 → 00:00 del
     «Turno 1 Lunes») queda en otro bucket y llega en `outsideRanges` como
     `antes`: se suma aquí para que el grande muestre TODAS las piezas. Lo de
     `despues` NO se suma: el pulso ya lo trae. */
  const antesDelHorario = piezasAntesDelHorario(live)
  return {
    valor: pulse.totalCycles + antesDelHorario,
    fuente: 'pulso',
    corteWallMs: cortePulso,
    fueraDelHorario,
    crudo: pulse.totalCycles,
    antesDelHorario,
    motivoFallback: null,
  }
}

/** Σ piezas de los rangos de antes del horario del turno (`outsideRanges` con `kind: 'antes'`). */
export function piezasAntesDelHorario(live: Pick<PublicMonitorLive, 'outsideRanges'>): number {
  let s = 0
  for (const r of live.outsideRanges ?? []) {
    if (r.kind === 'antes' && Number.isFinite(r.pieces) && r.pieces > 0) s += r.pieces
  }
  return s
}
