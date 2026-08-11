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
 * ⚠ La distancia máxima entre un bloque y "su" turno la fija ahora
 * `MAX_CONTINUIDAD_MS`, una sola constante compartida con el monitor público, el
 * brief de Telegram y la vista de turno. Antes vivía acá como
 * `MAX_ADJACENCY_MIN`; tener dos números para la misma regla es cómo empiezan a
 * decir cosas distintas dos pantallas del mismo dato.
 */

/** Un tramo de producción con su ubicación en el tiempo. */
export interface CycleInterval {
  startAt: Date
  cycles: number
  /** Máquina que lo produjo. Junto al timestamp identifica el tramo sin ambigüedad. */
  machineid?: string
}

/** Clave de un tramo: la misma que usa `loadCountedKeysForDate`. */
export function intervalKey(iv: CycleInterval): string {
  return `${iv.machineid ?? ''}|${iv.startAt.getTime()}`
}

/** Corte entre dos tramos de producción fuera de turno. */
const TRAMO_GAP_MS = 15 * 60 * 1000
/** Duración de un intervalo de Shoplogix: 5 min fijos. */
const TRAMO_INTERVAL_MS = 5 * 60 * 1000

/**
 * Piezas mínimas para que un tramo fuera de turno cuente como producción.
 *
 * Bajo esto es ruido: higiene, prueba de línea, giro en vacío. El mismo umbral
 * que usa el monitor público (`functions/publicMonitor.js`), para que la matriz
 * y el link compartido no den números distintos del mismo turno. Caso que lo
 * fijó: 6 piezas sueltas a las 06:10 del 10-ago en Filete, hora y media antes
 * del turno, contra 505 piezas de producción real después del cierre.
 */
export const OUTSIDE_MIN_PIECES = 20

/** Agrupa tramos contiguos (corte cuando pasan más de 15 min sin piezas). */
export function agruparTramos(intervals: readonly CycleInterval[]): Array<{
  start: number; end: number; pieces: number; intervals: CycleInterval[]
}> {
  const orden = [...intervals]
    .filter(iv => iv.cycles > 0)
    .sort((a, b) => a.startAt.getTime() - b.startAt.getTime())

  const tramos: Array<{ start: number; end: number; pieces: number; intervals: CycleInterval[] }> = []
  for (const iv of orden) {
    const t = iv.startAt.getTime()
    const ultimo = tramos[tramos.length - 1]
    if (ultimo && t - ultimo.end <= TRAMO_GAP_MS) {
      ultimo.end = Math.max(ultimo.end, t)
      ultimo.pieces += iv.cycles
      ultimo.intervals.push(iv)
    } else {
      tramos.push({ start: t, end: t, pieces: iv.cycles, intervals: [iv] })
    }
  }
  return tramos
}

/**
 * Máximo hueco entre un turno y su cola para considerarla CONTINUA.
 *
 * Regla de Orel (11-ago-2026): "solo si las piezas son continuas al turno, no
 * sumarle piezas de otro tiempo horas después". Lo que la motivó: el turno noche
 * de Chonchi (21:15→05:00) se llevaba 1.048 piezas de las 07:15 de la mañana
 * —la cola del turno que cerró a esa hora— y mostraba 13.487 en vez de 12.170,
 * con una barra a las 7 AM dentro de un turno que arrancó a las 21:30.
 *
 * 90 min, medido contra los casos reales:
 *   · Filete cerró 15:30 y la cola arrancó 15:40 → 10 min.
 *   · En Chonchi las colas arrancan en el mismo minuto del cierre → 0.
 *   · Yal 10-jul: la planta entró a las 14:05 y el Turno 2 arrancó 15:15 → 65
 *     min. Con 1 h se perdían 2.296 piezas de arranque anticipado REAL por cinco
 *     minutos; el umbral tiene que dejar pasar un cambio de turno con limpieza.
 *   · Lo que la regla debe excluir está a otra escala: las 07:15 contra el turno
 *     noche de Chonchi son 14 h, y la madrugada del 02-ago está a 10 h.
 *
 * ⚠ HISTORIAL, porque la decisión cambió dos veces y conviene no volver atrás
 * sin saberlo:
 *   1. Se probaron 240 y 90 min de tolerancia.
 *   2. 2026-08-03 — Orel la quitó del todo: toda la producción de un día
 *      pertenece a algún turno de ese día, y un bloque "Unscheduled" suelto en
 *      la vista no le sirve a nadie en planta.
 *   3. 2026-08-11 — la repone al ver el resultado en Eviscerado, ya con el
 *      matiz correcto: continuidad, no cercanía a secas.
 *
 * La decisión de agosto NO se revierte del todo: lo que cae DENTRO de la ventana
 * de un turno se le sigue atribuyendo sin discusión, por suelto que esté. Solo
 * cambia lo de FUERA. Medido sobre agosto completo, deja de atribuirse un total
 * de 65 piezas (chonchi 3, filete 62, yal 0); el caso Yal 03-ago no se afecta.
 */
export const MAX_CONTINUIDAD_MS = 90 * 60 * 1000

/** Ventana de un turno, para decidir de quién es un tramo. */
export interface VentanaTurno { start: Date; end: Date }

/**
 * Une los tramos que están encadenados entre sí (≤ `MAX_CONTINUIDAD_MS`) para
 * decidir la pertenencia sobre el bloque COMPLETO.
 *
 * Hace falta porque la producción real viene con huecos: el caso Yal 10-jul son
 * 2.296 ciclos a las 14:05, 14:40 y 15:00 antes de un turno que arrancó 15:15.
 * Medidos por separado, el primero queda a 65 min y se perdía — encadenados,
 * el bloque llega hasta 10 min del turno y es claramente su arranque anticipado.
 */
export function encadenarTramos<T extends { start: number; end: number; pieces: number }>(
  tramos: readonly T[],
): Array<{ start: number; end: number; pieces: number }> {
  const orden = [...tramos].sort((a, b) => a.start - b.start)
  const out: Array<{ start: number; end: number; pieces: number }> = []
  for (const t of orden) {
    const ult = out[out.length - 1]
    if (ult && t.start - (ult.end + TRAMO_INTERVAL_MS) <= MAX_CONTINUIDAD_MS) {
      ult.end = Math.max(ult.end, t.end)
      ult.pieces += t.pieces
    } else {
      out.push({ start: t.start, end: t.end, pieces: t.pieces })
    }
  }
  return out
}

/**
 * Minutos entre un tramo y una ventana; 0 si se solapan.
 *
 * ⚠ El `end` de un tramo es el INICIO de su último intervalo (ver
 * `agruparTramos`), así que el tramo dura 5 min más de lo que dice.
 */
function distanciaTramo(tramo: { start: number; end: number }, v: VentanaTurno): number {
  const fin = tramo.end + TRAMO_INTERVAL_MS
  const s = v.start.getTime()
  const e = v.end.getTime()
  if (fin > s && tramo.start < e) return 0
  return fin <= s ? s - fin : tramo.start - e
}

/**
 * ¿El tramo es la cola de ESTE turno y no de otro del día?
 *
 * Dos condiciones: que sea CONTINUO al turno (≤ 1 h) y que ningún otro turno
 * esté más cerca. Un tramo va a UN turno, nunca a dos ni a ninguno: el empate se
 * desempata a favor del turno que ya CERRÓ —una cola es la continuación de lo
 * que se venía haciendo— en vez de descartarse, que perdería las piezas.
 */
export function esColaDeEsteTurno(
  tramo: { start: number; end: number },
  ventana: VentanaTurno,
  otras: readonly VentanaTurno[],
): boolean {
  const propia = distanciaTramo(tramo, ventana)
  if (propia > MAX_CONTINUIDAD_MS) return false
  const yaCerro = (v: VentanaTurno) => tramo.start >= v.end.getTime()
  return otras.every(v => {
    const otra = distanciaTramo(tramo, v)
    if (propia !== otra) return propia < otra
    return yaCerro(ventana) && !yaCerro(v)
  })
}

export interface UnscheduledAttribution {
  /** Ciclos sumados a cada turno, por `key`. */
  byShiftKey: Map<string, number>
  /** Ciclos que no se pudieron atribuir a ningún turno. */
  unattributed: number
  /** Total procesado, para poder comprobar que no se perdió ni se duplicó nada. */
  total: number
  /** Ciclos descartados por estar ya contados en el doc de un turno. */
  duplicated: number
  /** Ciclos descartados por venir en tramos demasiado chicos (ruido). */
  noise: number
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
 *
 * `alreadyCounted` trae los tramos que los turnos del día YA incluyen en su
 * total (ver `loadCountedKeysForDate`): esos se descartan enteros. Shoplogix
 * reporta algunos minutos en el doc del turno Y en `Unscheduled` —verificado el
 * 10-ago-2026 en Filete, 112 piezas idénticas en ambos—, y sumarlos otra vez
 * infla el turno y el mes con producción que no existió.
 */
export function attributeUnscheduledCycles(
  intervals: readonly CycleInterval[],
  candidates: readonly PeriodShift[],
  alreadyCounted?: ReadonlySet<string>,
): UnscheduledAttribution {
  const byShiftKey = new Map<string, number>()
  let unattributed = 0
  let total = 0
  let duplicated = 0

  const usable = candidates.filter(c => !c.unscheduled && c.start && c.end)

  // Primero se descartan los repetidos, y recién después se agrupa: un tramo de
  // ruido no debe quedar "grande" por arrastrar minutos que ya estaban contados.
  const nuevos: CycleInterval[] = []
  for (const iv of intervals) {
    if (!(iv.cycles > 0)) continue
    if (alreadyCounted?.has(intervalKey(iv))) { duplicated += iv.cycles; continue }
    nuevos.push(iv)
  }

  // El umbral de ruido solo aplica FUERA de las ventanas de turno. Un ciclo que
  // cae DENTRO del horario es del turno sin discusión, por suelto que esté —
  // filtrarlo ahí perdía producción legítima (dos tests reales lo fijaron).
  const dentro = (iv: CycleInterval) => {
    const t = iv.startAt.getTime()
    return usable.some(c => t >= c.start!.getTime() && t < c.end!.getTime())
  }
  // 1. Lo que cae DENTRO de un turno es de ese turno, sin discusión.
  for (const iv of nuevos.filter(dentro)) {
    total += iv.cycles
    const c = usable.find(x => iv.startAt.getTime() >= x.start!.getTime() && iv.startAt.getTime() < x.end!.getTime())!
    byShiftKey.set(c.key, (byShiftKey.get(c.key) ?? 0) + iv.cycles)
  }

  // 2. Lo de fuera se decide por BLOQUE, no por intervalo suelto: es la cola de
  // un turno o no lo es, entero. Misma regla que el monitor público, el brief de
  // Telegram y la vista de turno (ver `esColaDeEsteTurno`).
  let noise = 0
  const ventanaDe = (c: PeriodShift): VentanaTurno => ({ start: c.start!, end: c.end! })
  const utiles = agruparTramos(nuevos.filter(iv => !dentro(iv))).filter(t => {
    if (t.pieces >= OUTSIDE_MIN_PIECES) return true
    noise += t.pieces
    return false
  })

  for (const bloque of encadenarTramos(utiles)) {
    total += bloque.pieces
    const dueño = usable.find(c => esColaDeEsteTurno(
      bloque,
      ventanaDe(c),
      usable.filter(o => o !== c).map(ventanaDe),
    ))
    if (dueño) byShiftKey.set(dueño.key, (byShiftKey.get(dueño.key) ?? 0) + bloque.pieces)
    else unattributed += bloque.pieces
  }

  return { byShiftKey, unattributed, total, duplicated, noise }
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
  countedKeysByDate?: ReadonlyMap<string, ReadonlySet<string>>,
): PeriodShift[] {
  if (intervalsByUnscheduledKey.size === 0) return [...shifts]

  const added = new Map<string, number>()
  const restByKey = new Map<string, number>()

  for (const [unsKey, intervals] of intervalsByUnscheduledKey) {
    const uns = shifts.find(s => s.key === unsKey)
    if (!uns) continue
    // Compiten los turnos del mismo día y de los ADYACENTES: la continuidad
    // cruza la medianoche. Producción a las 23:30 es el arranque del turno que
    // parte a las 00:00, no la cola de uno que cerró a las 15:00 — limitarlo al
    // mismo día se la daba al equivocado.
    //
    // Ya no hace falta la rama "si el día no tiene turnos, abrir a todo el
    // período": la continuidad decide sola. Un día sin turnos y sin nada cerca
    // (Chonchi 02-ago: 293 cic de madrugada, a 10 h del turno más próximo)
    // conserva su bloque visible, que es lo que dice la cabecera del módulo —
    // la corrección de fondo es configurar el turno en Shoplogix
    // (ver INFORME_UNSCHEDULED_SHOPLOGIX).
    const unsDay = Date.parse(`${uns.dateKey}T00:00:00Z`)
    const candidates = shifts.filter(s =>
      !s.unscheduled
      && s.key !== unsKey
      && Math.abs(Date.parse(`${s.dateKey}T00:00:00Z`) - unsDay) <= 86_400_000)
    const res = attributeUnscheduledCycles(intervals, candidates, countedKeysByDate?.get(uns.dateKey))
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
