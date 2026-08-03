/**
 * Reparte la producción "Unscheduled" de Shoplogix entre los turnos que le
 * corresponden.
 *
 * QUÉ ES "Unscheduled"
 * --------------------
 * NO es un turno. El doc `${dateKey}_Unscheduled` es una ventana de 24 h
 * exactas (`00:00 → 00:00`, `totalTrackedSec: 86400`) que Shoplogix usa para
 * reportar lo que quedó FUERA de las ventanas de turno que tiene configuradas.
 * Su `shiftId` y su `rawShiftId` dicen literalmente "Unscheduled": Shoplogix no
 * afirma en ningún campo a qué turno pertenece esa producción.
 *
 * POR QUÉ SE PUEDE REPARTIR IGUAL
 * -------------------------------
 * Aunque el doc padre no lo diga, la subcolección `machines` trae `intervals[]`
 * con `startAt`/`endAt` y `cycles`. Con esos timestamps se puede ubicar cada
 * ciclo en el tiempo y compararlo contra las ventanas reales de los turnos.
 *
 * Verificado contra producción (julio 2026, Yal):
 *
 *   10-jul  2.296 cic en las horas 14–15   → Turno 2 arrancó 15:15
 *   16-jul    918 cic en la hora  14       → Turno 2 arrancó 14:45
 *   24-jul  1.970 cic en las horas 14–15   → Turno 2 arrancó 15:15
 *
 * El 100% cae en la hora inmediatamente anterior al inicio del turno: es la
 * planta entrando ANTES del horario oficial. Esa producción la hizo la gente de
 * ese turno, así que contarla aparte —o peor, como si fuera un cuarto turno—
 * distorsiona tanto el volumen del turno como el ranking del mes.
 *
 * QUÉ NO HACE
 * -----------
 * Si el día NO tiene ningún turno, no hay a quién atribuir y el bloque se
 * conserva visible — caso real Chonchi 2026-08-02: 293 ciclos a las 07 h en un
 * día sin un solo turno registrado. Inventar un turno ahí sería peor que
 * mostrar el resto.
 */
import type { PeriodShift } from '@/services/grader/graderShiftPeriod'

/**
 * Máxima distancia entre un ciclo suelto y el turno al que se le atribuye.
 *
 * SIN LÍMITE por decisión explícita de Orel (2026-08-03), reafirmada tras
 * plantearle el matiz: toda la producción de un día pertenece a algún turno de
 * ese día, y un bloque "Unscheduled" en la vista no le sirve a nadie en planta.
 *
 * Qué implica, para que quede escrito: un ciclo se atribuye al turno más
 * cercano del MISMO día aunque haya ocurrido horas fuera de su horario. Caso
 * real Yal 2026-08-03 — 1.836 ciclos entre las 09 y 11 h se suman al Turno 3,
 * que corrió 00:06–07:18. El número del turno pasa a incluir producción que no
 * ocurrió dentro de su ventana.
 *
 * Eso queda auditable en `attributedCycles`, que la UI muestra aparte
 * ("incluye N cic fuera de turno"), y la causa de fondo sigue siendo que esos
 * turnos no están configurados en Shoplogix.
 *
 * Se probaron 240 min y 90 min antes de quitarlo; el historial está en los
 * tests.
 */
export const MAX_ADJACENCY_MIN = Number.POSITIVE_INFINITY

/** Un tramo de producción con su ubicación en el tiempo. */
export interface CycleInterval {
  startAt: Date
  cycles: number
}

export interface UnscheduledAttribution {
  /** Ciclos sumados a cada turno, por `key`. */
  byShiftKey: Map<string, number>
  /** Ciclos que no se pudieron atribuir a ningún turno. */
  unattributed: number
  /** Total procesado, para poder comprobar que no se perdió ni se duplicó nada. */
  total: number
}

/**
 * Decide a qué turno pertenece cada tramo suelto.
 *
 * Orden de preferencia:
 *   1. El turno que lo CONTIENE en el tiempo.
 *   2. El turno que arranca DESPUÉS y más cerca — adelanto de entrada, el caso
 *      real y frecuente.
 *   3. El turno que terminó ANTES y más cerca — se quedaron pasado el horario.
 *   4. Ninguno: queda sin atribuir.
 *
 * `candidates` deben ser turnos del período que NO sean Unscheduled.
 */
export function attributeUnscheduledCycles(
  intervals: readonly CycleInterval[],
  candidates: readonly PeriodShift[],
): UnscheduledAttribution {
  const byShiftKey = new Map<string, number>()
  let unattributed = 0
  let total = 0

  const usable = candidates.filter(c => !c.unscheduled && c.start && c.end)

  for (const iv of intervals) {
    if (!(iv.cycles > 0)) continue
    total += iv.cycles
    const t = iv.startAt.getTime()

    // 1. contenido en un turno
    let best = usable.find(c => t >= c.start!.getTime() && t < c.end!.getTime()) ?? null

    if (!best) {
      // 2 y 3. el turno adyacente más cercano del día. Sin tolerancia: si hay
      // algún turno ese día, la producción es de alguno de ellos.
      let bestGap = Infinity
      for (const c of usable) {
        const gap = t < c.start!.getTime()
          ? (c.start!.getTime() - t) / 60_000     // el turno arranca después
          : (t - c.end!.getTime()) / 60_000       // el turno terminó antes
        if (gap >= 0 && gap <= MAX_ADJACENCY_MIN && gap < bestGap) {
          bestGap = gap
          best = c
        }
      }
    }

    if (best) byShiftKey.set(best.key, (byShiftKey.get(best.key) ?? 0) + iv.cycles)
    else unattributed += iv.cycles
  }

  return { byShiftKey, unattributed, total }
}

/**
 * Aplica la atribución: suma los ciclos a cada turno y deja el Unscheduled solo
 * con el resto que no se pudo repartir (o lo saca si no quedó nada).
 *
 * Los ciclos atribuidos quedan además en `attributedCycles`, para que la UI
 * pueda decir "de estos 22.789, 2.296 los hizo el turno antes de su horario" en
 * vez de mezclarlos sin dejar rastro.
 */
export function applyUnscheduledAttribution(
  shifts: readonly PeriodShift[],
  intervalsByUnscheduledKey: ReadonlyMap<string, readonly CycleInterval[]>,
): PeriodShift[] {
  if (intervalsByUnscheduledKey.size === 0) return [...shifts]

  const added = new Map<string, number>()
  const restByKey = new Map<string, number>()

  for (const [unsKey, intervals] of intervalsByUnscheduledKey) {
    const uns = shifts.find(s => s.key === unsKey)
    if (!uns) continue
    // Primero compiten los turnos del MISMO día — la atribución natural.
    //
    // Si el día no tiene NINGÚN turno (caso real Chonchi 2026-08-02: madrugada
    // 00:06–07:41, 293 cic, cero turnos registrados), se abre a los turnos de
    // TODO el período y gana el más cercano en el tiempo, aunque sea de otro
    // día. Decisión explícita de Orel (2026-08-03, reafirmada tres veces):
    // ningún ciclo queda sin turno. La implicación queda escrita: esa madrugada
    // de domingo se reparte entre el T2 del sábado y la madrugada del lunes —
    // ninguno de los dos la produjo de verdad; el turno que corresponde no
    // existe en Shoplogix. Auditable en `attributedCycles`; la corrección de
    // fondo sigue siendo configurar el turno (ver INFORME_UNSCHEDULED_SHOPLOGIX).
    const sameDay = shifts.filter(s => s.dateKey === uns.dateKey && s.key !== unsKey && !s.unscheduled)
    const candidates = sameDay.length > 0
      ? sameDay
      : shifts.filter(s => !s.unscheduled)
    const res = attributeUnscheduledCycles(intervals, candidates)
    for (const [k, v] of res.byShiftKey) added.set(k, (added.get(k) ?? 0) + v)
    restByKey.set(unsKey, res.unattributed)
  }

  const out: PeriodShift[] = []
  for (const s of shifts) {
    if (s.unscheduled && restByKey.has(s.key)) {
      const rest = restByKey.get(s.key)!
      // Sin resto, el registro deja de existir: todo encontró su turno.
      if (rest <= 0) continue
      out.push({ ...s, cycles: rest })
      continue
    }
    const extra = added.get(s.key)
    out.push(extra ? { ...s, cycles: s.cycles + extra, attributedCycles: extra } : s)
  }
  return out
}
