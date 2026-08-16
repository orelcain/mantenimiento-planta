/**
 * monitorPareto.ts — qué para esta línea, turno tras turno.
 *
 * ── Por qué DOS ejes y no uno ───────────────────────────────────────────────
 *
 * Un Pareto clásico ordena por tiempo perdido y con eso alcanza cuando hay
 * cientos de casos. Acá son 6 o 7 turnos, y medido en Filete el 14-08 el
 * ranking por minutos ponía cuarta a `ACUMULACION` con 36 min — que ocurrió
 * UNA sola vez, el 8-ago. Ordenado solo por minutos, un incidente aislado se
 * disfraza de causa crónica y manda a cambiar un proceso que no lo necesita.
 *
 * Por eso cada fila lleva además **en cuántos turnos aparece**: 6 de 6 es un
 * patrón, 1 de 6 es un incidente. Los dos números se muestran juntos; ninguno
 * de los dos solo alcanza para decidir.
 *
 * ── Por qué se agrupa por equipo ────────────────────────────────────────────
 *
 * Shoplogix etiqueta con `Equipo/Parte` (`Baader 200/CUCHILLERIA DORSAL`,
 * `Baader 200/CUCHILLERIA RASCADOR`, `Baader 200/PERNOS/RESORTES`). Sueltas,
 * ninguna de las tres pasa de 47 min en 6 turnos y ninguna llama la atención;
 * juntas son 86 min, el 26% del tiempo parado y el segundo lugar del Pareto.
 * La regla es genérica —lo que va antes de la primera barra es el equipo— así
 * que no hay que mantener un mapa de causas a mano, y sirve igual en Yal.
 *
 * ⚠ Solo entra el tiempo RECUPERABLE. La colación y las demás paradas de
 * convenio no son pérdidas que alguien pueda atacar: meterlas en el Pareto las
 * pondría primeras y taparían justamente lo que sí se puede mejorar.
 */

import { matchImputacion } from './imputacionTaxonomy'

/** Una causa tal como viaja en el `timeBreakdown` de un turno. */
export interface CausaTurno {
  reason: string
  min: number
  count: number
}

/** De quién es la recurrencia. Mismo lenguaje que «Qué pasó en el turno». */
export type DuenoPareto = 'mantencion' | 'externo' | 'sin-imputar'

export interface ParetoRow {
  /** Etiqueta que se muestra: el equipo si agrupa, o la causa tal cual. */
  label: string
  minutes: number
  /** En cuántos turnos de la muestra aparece. */
  shifts: number
  /** Paradas totales sumadas. */
  count: number
  /** Porcentaje del tiempo recuperable total. */
  sharePct: number
  /** Porcentaje acumulado hasta esta fila, inclusive. */
  cumPct: number
  /**
   * Dueño según el árbol OFICIAL de imputación. La fila agrupada por equipo se
   * decide por la parte con más minutos — en la práctica todas las partes de
   * un mismo equipo caen en el mismo dueño.
   */
  dueno: DuenoPareto
  /** Las causas que se agruparon, cuando son más de una. */
  parts: CausaTurno[]
}

export interface ParetoResult {
  rows: ParetoRow[]
  /**
   * Minutos de la recurrencia por dueño. Es el dato de gestión que las filas
   * solas no dicen: en Filete (7 turnos al 15-08) lo más grande era lo SIN
   * IMPUTAR — 170 de 349 min, el 49% — y no se puede atacar lo que nadie anota.
   */
  porDueno: Record<DuenoPareto, number>
  /** Minutos recuperables sumados de toda la muestra. */
  totalMin: number
  /** Turnos considerados. */
  shifts: number
  /**
   * Cuántas filas cubren el 80% del tiempo. 0 si no hay datos. Es el corte que
   * se dibuja: "estas N explican el X%".
   */
  vitalCount: number
  /** Porcentaje que cubren esas `vitalCount` filas. */
  vitalPct: number
}

/** El equipo de una causa `Equipo/Parte`, o null si la causa no lo trae. */
export function equipoDe(reason: string): string | null {
  const i = reason.indexOf('/')
  if (i <= 0) return null
  const equipo = reason.slice(0, i).trim()
  return equipo.length > 1 ? equipo : null
}

/**
 * El Pareto de las paradas recuperables de una muestra de turnos.
 *
 * Cada turno aporta su lista de causas ya agregada por el backend; acá solo se
 * suman, se agrupan por equipo y se ordenan.
 */
export function buildPareto(turnos: Array<CausaTurno[] | null | undefined>): ParetoResult {
  const acc = new Map<string, { minutes: number; count: number; shifts: Set<number>; parts: Map<string, CausaTurno> }>()

  turnos.forEach((causas, idx) => {
    if (!causas) return
    for (const c of causas) {
      if (!c?.reason || !(c.min > 0)) continue
      const label = equipoDe(c.reason) ?? c.reason
      let fila = acc.get(label)
      if (!fila) {
        fila = { minutes: 0, count: 0, shifts: new Set(), parts: new Map() }
        acc.set(label, fila)
      }
      fila.minutes += c.min
      fila.count += c.count ?? 0
      fila.shifts.add(idx)
      const parte = fila.parts.get(c.reason)
      if (parte) {
        parte.min += c.min
        parte.count += c.count ?? 0
      } else {
        fila.parts.set(c.reason, { reason: c.reason, min: c.min, count: c.count ?? 0 })
      }
    }
  })

  const totalMin = [...acc.values()].reduce((a, f) => a + f.minutes, 0)
  const shifts = turnos.filter(Boolean).length
  if (totalMin <= 0) {
    return {
      rows: [], totalMin: 0, shifts, vitalCount: 0, vitalPct: 0,
      porDueno: { mantencion: 0, externo: 0, 'sin-imputar': 0 },
    }
  }

  let cum = 0
  const rows: ParetoRow[] = [...acc.entries()]
    .sort((a, b) => b[1].minutes - a[1].minutes)
    .map(([label, f]) => {
      cum += f.minutes
      const dominante = [...f.parts.values()].sort((a, b) => b.min - a.min)[0]!
      const m = matchImputacion(dominante.reason)
      const dueno: DuenoPareto = m.bucket === 'mantencion'
        ? 'mantencion'
        : m.bucket === 'externo' ? 'externo' : 'sin-imputar'
      return {
        label,
        minutes: f.minutes,
        shifts: f.shifts.size,
        count: f.count,
        sharePct: (f.minutes / totalMin) * 100,
        cumPct: (cum / totalMin) * 100,
        dueno,
        parts: [...f.parts.values()].sort((a, b) => b.min - a.min),
      }
    })

  const porDueno: Record<DuenoPareto, number> = { mantencion: 0, externo: 0, 'sin-imputar': 0 }
  for (const r of rows) porDueno[r.dueno] += r.minutes

  /*
   * El corte del 80%: la primera fila que lo alcanza entra. Con muestras
   * chicas puede caer en la fila 1 (una causa que se llevó todo) o no llegar
   * nunca si están todas parejas — ahí no hay "pocas vitales" que mostrar y el
   * bloque lo dice en vez de inventar un corte.
   */
  const i = rows.findIndex((r) => r.cumPct >= 80)
  const vitalCount = i >= 0 ? i + 1 : 0
  return {
    rows,
    totalMin,
    shifts,
    vitalCount,
    vitalPct: vitalCount > 0 ? rows[vitalCount - 1]!.cumPct : 0,
    porDueno,
  }
}

/** Un turno de la muestra, con lo que hace falta para ubicar su recuperable. */
export interface TurnoCtx {
  dateKey: string
  shiftId?: string | null
  windowMin?: number | null
  producingMin?: number | null
  plannedMin?: number | null
  recoverableMin?: number | null
  causas?: CausaTurno[] | null
}

export interface PuntoTendencia {
  dateKey: string
  /** % del tiempo del turno que fue recuperable. */
  pct: number
  recuperableMin: number
  windowMin: number
}

export interface ContextoPareto {
  /** Turnos DISTINTOS de la muestra (ya deduplicados). */
  turnos: number
  ventanaMin: number
  produciendoMin: number
  convenioMin: number
  recuperableMin: number
  /** Lo que no cae en ninguna categoría: huecos de sincronización. */
  huecosMin: number
  /** % recuperable sobre el tiempo TOTAL medido, convenio incluido. */
  pct: number
  /** Un punto por turno CON PRODUCCIÓN, del más viejo al más nuevo. */
  serie: PuntoTendencia[]
  /** Turnos sin un minuto produciendo: no entran en la serie, pero existieron. */
  sinProduccion: string[]
  /** Banda de lo habitual (cuartiles de la serie). null con menos de 4 puntos. */
  banda: { bajo: number; alto: number; mediana: number } | null
  /** El promedio simple. Solo para explicar por qué NO se usa como referencia. */
  promedio: number | null
  /**
   * El veredicto, con una regla dura para que no se vuelva optimista solo:
   * los últimos 3 turnos TODOS por debajo del mejor de los anteriores.
   */
  veredicto: 'mejora' | 'empeora' | 'sin-cambio' | 'sin-datos'
  /** El % que hay que bajar 3 turnos seguidos para poder decir que mejoró. */
  vara: number | null
}

/** Deduplica por turno: el que se está mirando suele venir también en el historial. */
export function muestraUnica(turnos: TurnoCtx[]): TurnoCtx[] {
  const vistos = new Set<string>()
  const out: TurnoCtx[] = []
  for (const t of turnos) {
    if (!t?.dateKey) continue
    const clave = `${t.dateKey}|${t.shiftId ?? ''}`
    if (vistos.has(clave)) continue
    vistos.add(clave)
    out.push(t)
  }
  return out
}

function cuartil(orden: number[], q: number): number {
  const i = (orden.length - 1) * q
  const lo = Math.floor(i)
  const hi = Math.ceil(i)
  return lo === hi ? orden[lo]! : orden[lo]! + (orden[hi]! - orden[lo]!) * (i - lo)
}

/**
 * El marco temporal del Pareto: cuánto tiempo se está midiendo y qué parte de
 * ese tiempo es recuperable, turno a turno.
 *
 * ⚠ El 100% es el tiempo TOTAL de los turnos, convenio incluido (decisión de
 * Orel): así el convenio se VE en la barra en vez de esconderse en el
 * denominador. Con el tiempo útil como base el número sale más alto (11,6% en
 * vez de 10,3%) y, sobre todo, nadie puede ver que la colación creció.
 *
 * ⚠⚠ Los turnos SIN producción no entran en la serie: un sábado con la línea
 * apagada tiene 0 min recuperables y dibujaría una mejora que no ocurrió.
 */
export function contextoPareto(turnos: TurnoCtx[]): ContextoPareto {
  /*
   * ⚠⚠ Los turnos SIN PRODUCCIÓN quedan fuera de TODA la cuenta, no solo de la
   * serie: un sábado con la línea apagada aporta 7 h 45 min al denominador y
   * cero al numerador, así que baja el indicador sin que nadie haya arreglado
   * una parada. Mirando el turno de hoy el bloque decía «7 turnos · 10,3%» y
   * mirando el de ayer «6 turnos · 11,9%» — con los mismos 6 turnos de trabajo
   * adentro. El mismo vicio que el convenio en el denominador: mejorar por no
   * producir. Siguen contándose aparte (`sinProduccion`) para que el día no
   * desaparezca de la pantalla.
   */
  const conVentana = muestraUnica(turnos).filter((t) => (t.windowMin ?? 0) > 0)
  const unicos = conVentana.filter((t) => (t.producingMin ?? 0) > 0)
  const suma = (f: (t: TurnoCtx) => number) => unicos.reduce((a, t) => a + f(t), 0)
  const ventanaMin = suma((t) => t.windowMin ?? 0)
  const produciendoMin = suma((t) => t.producingMin ?? 0)
  const convenioMin = suma((t) => t.plannedMin ?? 0)
  const recuperableMin = suma((t) => t.recoverableMin ?? 0)

  const conProduccion = [...unicos].sort((a, b) => a.dateKey.localeCompare(b.dateKey))
  const serie: PuntoTendencia[] = conProduccion.map((t) => ({
    dateKey: t.dateKey,
    pct: ((t.recoverableMin ?? 0) / (t.windowMin || 1)) * 100,
    recuperableMin: t.recoverableMin ?? 0,
    windowMin: t.windowMin ?? 0,
  }))

  const orden = serie.map((p) => p.pct).sort((a, b) => a - b)
  const promedio = orden.length > 0 ? orden.reduce((a, v) => a + v, 0) / orden.length : null
  const banda = orden.length >= 4
    ? { bajo: cuartil(orden, 0.25), alto: cuartil(orden, 0.75), mediana: cuartil(orden, 0.5) }
    : null

  /*
   * El veredicto: los últimos 3 turnos TODOS por debajo del MEJOR de los
   * anteriores (o todos por encima del peor, para «empeora»).
   *
   * ⚠ La vara se calcula con los turnos previos, NO con la serie entera: una
   * banda que incluye a los turnos que se están juzgando se mueve con ellos y
   * nunca los declara fuera. Y la regla es dura a propósito — con seis turnos
   * ruidosos (11,1 · 10,7 · 17,8 · 7,5 · 12,1 · 12,1) cualquier cosa más
   * blanda declara una mejora que la produjo un solo turno malo.
   */
  const RACHA = 3
  let veredicto: ContextoPareto['veredicto'] = serie.length === 0 ? 'sin-datos' : 'sin-cambio'
  /** El listón que hay que bajar 3 turnos seguidos para poder decir «mejoró». */
  let vara: number | null = null
  if (serie.length >= RACHA + 2) {
    const previos = serie.slice(0, -RACHA).map((p) => p.pct)
    const ultimos = serie.slice(-RACHA).map((p) => p.pct)
    const mejorPrevio = Math.min(...previos)
    const peorPrevio = Math.max(...previos)
    vara = mejorPrevio
    if (ultimos.every((v) => v < mejorPrevio)) veredicto = 'mejora'
    else if (ultimos.every((v) => v > peorPrevio)) veredicto = 'empeora'
  }

  return {
    turnos: unicos.length,
    ventanaMin,
    produciendoMin,
    convenioMin,
    recuperableMin,
    huecosMin: Math.max(0, ventanaMin - produciendoMin - convenioMin - recuperableMin),
    pct: ventanaMin > 0 ? (recuperableMin / ventanaMin) * 100 : 0,
    serie,
    sinProduccion: conVentana.filter((t) => !((t.producingMin ?? 0) > 0)).map((t) => t.dateKey),
    banda,
    promedio,
    veredicto,
    vara,
  }
}

/** Las ventanas que se pueden elegir. `null` = todos los turnos que haya. */
export const VENTANAS = [5, 10, 15, 30, null] as const
export type Ventana = (typeof VENTANAS)[number]

/**
 * Los turnos a mirar, ya recortados a la ventana y al turno elegido.
 *
 * ⚠ Una sola función para las tres piezas del bloque (barra, ranking y
 * tendencia): si cada una recortara por su cuenta, el «% de estos N turnos»
 * podría no ser el de las causas listadas — que es exactamente el descuadre
 * que hubo que arreglar cuando el turno visto se contaba dos veces.
 *
 * `turno` filtra por nombre: null = el que se esté mirando, 'todos' = sin
 * filtrar (para comparar día contra noche).
 */
export function turnosParaVentana(
  turnos: TurnoCtx[],
  opts: { ventana?: Ventana; turno?: string | null | 'todos' } = {},
): TurnoCtx[] {
  const { ventana = 10, turno = null } = opts
  let out = muestraUnica(turnos).filter((t) => (t.windowMin ?? 0) > 0)
  if (turno && turno !== 'todos') out = out.filter((t) => !t.shiftId || t.shiftId === turno)
  /* Del más nuevo al más viejo para recortar, y de vuelta al orden natural:
     la serie se lee de izquierda (viejo) a derecha (nuevo). */
  out = [...out].sort((a, b) => b.dateKey.localeCompare(a.dateKey))
  if (ventana != null) out = out.slice(0, ventana)
  return out.reverse()
}

/**
 * El mismo contexto, calculado por turno: lo que hace comparable el Turno Día
 * contra el Turno Noche.
 *
 * Devuelve una entrada por nombre de turno, de más a menos tiempo medido — con
 * un solo turno corriendo devuelve uno y la UI no muestra comparación.
 */
export function contextoPorTurno(turnos: TurnoCtx[], ventana: Ventana = 10): Array<{ turno: string; ctx: ContextoPareto }> {
  const nombres = [...new Set(muestraUnica(turnos).map((t) => t.shiftId).filter((x): x is string => !!x))]
  return nombres
    .map((turno) => ({ turno, ctx: contextoPareto(turnosParaVentana(turnos, { ventana, turno })) }))
    .filter((x) => x.ctx.turnos > 0)
    .sort((a, b) => b.ctx.ventanaMin - a.ctx.ventanaMin)
}
