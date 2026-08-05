/**
 * Ventana horaria REAL de un turno, y detección de arranque anticipado.
 *
 * EL PROBLEMA QUE RESUELVE
 * ------------------------
 * El sync consulta Shoplogix en una ventana fija **08:00 → 08:00 del día
 * siguiente** (`fullDayWindow` en `functions/shoplogix/sync.js`). Cuando un
 * turno arranca antes de las 08:00 —y en esta planta es lo habitual: Filete
 * parte 07:30, Yal 07:45, Chonchi 07:15— sus primeros intervals caen en la
 * consulta del día ANTERIOR. Dos consecuencias, ambas verificadas en producción
 * el 2026-08-05:
 *
 *   1. El turno de hoy nace con `scheduledStart` = 08:00 y pierde su arranque.
 *   2. El turno de ayer queda declarado 08:00 → 08:00 (24 h) y **absorbe** los
 *      ciclos del arranque de hoy (`2026-08-04_Turno 2`: 16.398 ciclos que
 *      incluyen 45 min del día siguiente).
 *
 * O sea las piezas no se pierden: se le suman al día equivocado.
 *
 * QUÉ SÍ SABE SHOPLOGIX
 * ---------------------
 * El rollup del whiteboard (`officialSchedule`) trae la ventana declarada del
 * turno — 07:15 → 15:00 — y el sync YA la guarda. Es la misma que se ve en la
 * pantalla de Shoplogix. Lo que faltaba era usarla.
 *
 * POR QUÉ NO ALCANZA CON "USAR SIEMPRE EL OFICIAL"
 * ------------------------------------------------
 * Porque a veces lo observado es MÁS cierto que lo declarado: en
 * `2026-08-02_Turno 2` de Yal el turno produjo desde las 14:00 mientras el
 * whiteboard declaraba 16:15 — un arranque anticipado real, de 2 h 15, que el
 * oficial no refleja.
 *
 * Y TAMPOCO SIRVE UNIR LAS DOS SIEMPRE: un turno declarado 09:00-17:15 que
 * produjo de 09:05 a 17:02 corrió 09:05-17:02, no 09:00-17:15. Unir infla la
 * ventana con tiempo en el que no pasó nada, y eso empeora cualquier cálculo
 * de disponibilidad.
 *
 * La regla es más específica: **manda lo observado, salvo que venga
 * contaminado por el borde de la consulta**; ahí y solo ahí manda lo declarado,
 * diciendo cuántos minutos de datos faltan.
 *
 * ESTE MÓDULO NO ARREGLA LOS DATOS, ARREGLA LO QUE SE AFIRMA SOBRE ELLOS.
 * Los ciclos de 07:15→08:00 siguen sin estar en el doc del día (eso se corrige
 * en el sync). Acá se calcula la ventana verdadera y se expone `missingHeadMin`
 * para que la UI pueda decir "faltan los primeros 45 min" en vez de dibujar un
 * turno que arranca a las 08:00 como si fuera la realidad.
 */

/** De dónde salió la ventana que se está usando. */
export type ShiftWindowOrigin = 'declarado' | 'observado' | 'schedule' | 'ninguna'

/**
 * Hora ancla de la ventana de consulta del sync. Un turno cuyo inicio observado
 * cae EXACTAMENTE acá es sospechoso de estar recortado, no de haber arrancado
 * a esa hora en punto.
 */
export const SYNC_WINDOW_ANCHOR_HOUR = 8

/**
 * Sin ventana declarada con la que comparar, solo se descarta lo que abarca la
 * consulta entera. Un `Unscheduled` real puede durar 16 h 48 (caso 2026-08-02).
 */
const MAX_SHIFT_HOURS = 20

/**
 * Cuánto puede pasarse el fin observado del declarado antes de considerarlo
 * desborde. Generoso a propósito: un turno se puede estirar de verdad, pero no
 * 17 horas, que es lo que pasa cuando absorbe hasta el borde de la ventana.
 */
const TAIL_TOLERANCE_MS = 2 * 60 * 60_000

/** Bajo estos minutos, la diferencia es ruido de sincronización, no un evento. */
const EARLY_START_MIN_THRESHOLD = 10

const MIN = 60_000
/** Un timestamp por debajo de epoch+1día es un placeholder, no una fecha. */
const MIN_VALID_MS = 86_400_000

export interface ShiftWindowInput {
  /** Ventana declarada por Shoplogix (rollup del whiteboard / `officialSchedule`). */
  declaredStart?: Date | null
  declaredEnd?: Date | null
  /**
   * Ventana observada: cuándo se produjo de verdad (`effectiveStart/End`, o el
   * `scheduledStart/End` derivado de intervals cuando es lo único que hay).
   */
  observedStart?: Date | null
  observedEnd?: Date | null
  /** Último recurso: el horario configurado de la planta, que puede estar obsoleto. */
  scheduleStart?: Date | null
  scheduleEnd?: Date | null
}

export interface ResolvedShiftWindow {
  start: Date | null
  end: Date | null
  origin: ShiftWindowOrigin

  /**
   * Minutos que el turno arrancó ANTES de lo declarado por Shoplogix.
   * Es el arranque anticipado GENUINO: se produjo antes de lo planificado y el
   * sync alcanzó a verlo.
   */
  earlyStartMin: number

  /**
   * Minutos del arranque que el sync NO entregó, porque quedaron antes del
   * borde de su ventana de consulta. Es la parte del turno de la que no hay
   * datos, aunque la ventana sí la incluya. Mayor que 0 ⇒ el total de piezas
   * del turno está incompleto.
   */
  missingHeadMin: number

  /** Lo observado se descartó por venir recortado por el borde de la consulta. */
  observedClipped: boolean
}

const EMPTY: ResolvedShiftWindow = {
  start: null, end: null, origin: 'ninguna',
  earlyStartMin: 0, missingHeadMin: 0, observedClipped: false,
}

function valid(d?: Date | null): d is Date {
  return !!d && !isNaN(d.getTime()) && d.getTime() > MIN_VALID_MS
}

function pair(a?: Date | null, b?: Date | null): { start: Date; end: Date } | null {
  if (!valid(a) || !valid(b)) return null
  if (b.getTime() <= a.getTime()) return null
  return { start: a, end: b }
}

/** ¿Cae exactamente en el ancla de la ventana de consulta (08:00:00)? */
function atAnchor(d: Date): boolean {
  return d.getUTCHours() === SYNC_WINDOW_ANCHOR_HOUR &&
    d.getUTCMinutes() === 0 && d.getUTCSeconds() === 0
}

/**
 * ¿La ventana observada viene deformada por el borde de la consulta del sync?
 *
 * El criterio es por EVIDENCIA, no por duración: se compara contra lo que
 * Shoplogix declara. Dos firmas, cualquiera basta:
 *
 *   1. *Cabeza cortada* — arranca exactamente en el ancla (08:00:00) mientras
 *      lo declarado empieza antes. El turno ya existía cuando la consulta
 *      empezó a mirar (caso `2026-08-05`: observado 08:00, declarado 07:15).
 *   2. *Cola desbordada* — termina mucho después del fin declarado, porque
 *      absorbió los intervals del día siguiente hasta el borde (caso
 *      `2026-08-04`: declarado hasta 15:00, observado hasta las 08:00 del día
 *      siguiente).
 *
 * Ambas EXIGEN lo declarado. Sin esa referencia no se puede afirmar que algo
 * esté cortado: un turno nocturno que legítimamente corre 00:00→08:00 termina
 * en el ancla sin tener nada malo, y un bloque `Unscheduled` puede durar 16 h
 * sin ser un error. Sin declarado solo se marca la firma inequívoca: la ventana
 * de consulta ENTERA (ancla a ancla).
 */
function isClipped(
  observed: { start: Date; end: Date },
  declared: { start: Date; end: Date } | null,
): boolean {
  if (!declared) {
    const durH = (observed.end.getTime() - observed.start.getTime()) / 3_600_000
    return atAnchor(observed.start) && atAnchor(observed.end) && durH >= MAX_SHIFT_HOURS
  }
  const headClipped = atAnchor(observed.start) && declared.start.getTime() < observed.start.getTime()
  const tailBleed = observed.end.getTime() > declared.end.getTime() + TAIL_TOLERANCE_MS
  return headClipped || tailBleed
}

/**
 * Resuelve la ventana del turno y detecta el arranque anticipado.
 *
 * Orden: se descarta lo observado si viene recortado, se unen las ventanas
 * sanas que queden, y solo si no hay ninguna se cae al horario configurado.
 */
export function resolveShiftWindow(input: ShiftWindowInput): ResolvedShiftWindow {
  const declared = pair(input.declaredStart, input.declaredEnd)
  const observedRaw = pair(input.observedStart, input.observedEnd)
  const schedule = pair(input.scheduleStart, input.scheduleEnd)

  const observedClipped = !!observedRaw && isClipped(observedRaw, declared)
  const observed = observedClipped ? null : observedRaw

  // Sin nada de Shoplogix: el horario configurado, que puede estar obsoleto.
  if (!declared && !observed) {
    return schedule
      ? { ...EMPTY, start: schedule.start, end: schedule.end, origin: 'schedule', observedClipped }
      : { ...EMPTY, observedClipped }
  }

  // Manda lo observado: es cuándo se produjo de verdad. Lo declarado entra
  // cuando lo observado no está o vino deformado por el borde de la consulta.
  let start: Date
  let end: Date
  let origin: ShiftWindowOrigin

  if (observed) {
    start = observed.start
    end = observed.end
    origin = 'observado'
  } else {
    start = declared!.start
    end = declared!.end
    origin = 'declarado'
  }

  // Arranque anticipado GENUINO: se produjo antes de lo declarado y el sync lo
  // vio. Si lo observado vino recortado no se puede afirmar nada de esto.
  const earlyStartMin = declared && observed && observed.start.getTime() < declared.start.getTime()
    ? Math.round((declared.start.getTime() - observed.start.getTime()) / MIN)
    : 0

  // Datos que faltan: entre el inicio real del turno y el primer dato que el
  // sync entregó. Solo aplica cuando lo observado se descartó por recorte.
  const missingHeadMin = observedClipped && observedRaw
    ? Math.max(0, Math.round((observedRaw.start.getTime() - start.getTime()) / MIN))
    : 0

  return {
    start,
    end,
    origin,
    earlyStartMin: earlyStartMin >= EARLY_START_MIN_THRESHOLD ? earlyStartMin : 0,
    missingHeadMin: missingHeadMin >= EARLY_START_MIN_THRESHOLD ? missingHeadMin : 0,
    observedClipped,
  }
}

/** "45 min" / "2 h 15". Para los avisos de la UI. */
export function formatGapMinutes(min: number): string {
  if (min < 60) return `${min} min`
  const h = Math.floor(min / 60)
  const m = min % 60
  return m === 0 ? `${h} h` : `${h} h ${String(m).padStart(2, '0')}`
}
