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
  /** Minutos que la causa duró en ALGUNA máquina. NO usar para valorizar. */
  min: number
  /**
   * Minutos que además frenaron la LÍNEA entera. Es el único que se traduce a
   * piezas que no pasaron por el sensor: con tres Baader, `min` lo multiplica
   * por más de cinco. Ausente en payloads viejos, donde se cae a `min`.
   */
  lineMin?: number | null
  count: number
}

/** De quién es la recurrencia. Mismo lenguaje que «Qué pasó en el turno». */
export type DuenoPareto = 'mantencion' | 'externo' | 'sin-imputar'

export interface ParetoRow {
  /** Etiqueta que se muestra: el equipo si agrupa, o la causa tal cual. */
  label: string
  minutes: number
  /**
   * ≈ piezas que costó, valorizadas al ritmo andando DEL TURNO en que ocurrió
   * cada parada (total/producingMin de ese turno), no al promedio de la
   * muestra: 20 min en un turno lento cuestan menos piezas que 17 en uno
   * rápido, y esa diferencia reordena el ranking — es información, no ruido.
   */
  piezas: number
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
  parts: Array<CausaTurno & { piezas: number }>
}

/** Lo que buildPareto necesita de cada turno para valorizar sus causas. */
export interface TurnoParaPareto {
  causas?: CausaTurno[] | null
  total?: number | null
  producingMin?: number | null
  /**
   * Total de minutos de línea recuperables del turno — el que cierra su
   * ventana. Topa la suma de `lineMin`, que no se descuentan entre sí.
   */
  recoverableMin?: number | null
}

export interface ParetoResult {
  rows: ParetoRow[]
  /**
   * Minutos de la recurrencia por dueño. Es el dato de gestión que las filas
   * solas no dicen: en Filete (7 turnos al 15-08) lo más grande era lo SIN
   * IMPUTAR — 170 de 349 min, el 49% — y no se puede atacar lo que nadie anota.
   */
  porDueno: Record<DuenoPareto, number>
  /** Lo mismo, en ≈ piezas — la frase de dueños habla en piezas. */
  porDuenoPiezas: Record<DuenoPareto, number>
  /** Minutos recuperables sumados de toda la muestra. */
  totalMin: number
  /** ≈ piezas de toda la muestra, valorizadas turno a turno. */
  totalPiezas: number
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
export function buildPareto(turnos: Array<TurnoParaPareto | null | undefined>): ParetoResult {
  const acc = new Map<string, { minutes: number; piezas: number; count: number; shifts: Set<number>; parts: Map<string, CausaTurno & { piezas: number }> }>()

  turnos.forEach((t, idx) => {
    const causas = t?.causas
    if (!causas || causas.length === 0) return
    /* El ritmo andando de ESTE turno: la vara con que se valorizan SUS causas. */
    const cpm = t.total != null && (t.producingMin ?? 0) > 0 ? t.total / t.producingMin! : 0
    /*
     * OJO OJO: MINUTOS DE LÍNEA, no de máquina.
     *
     * `min` es lo que la causa duró en ALGUNA máquina; `lineMin`, lo que frenó
     * la línea entera. Con tres Baader se separan brutalmente. Medido sobre los
     * 7 turnos que publicaba el monitor el 26-08: 669 min de máquina (11,2 h)
     * contra 122 de línea (2,0 h) — y 24.517 piezas contra 4.383, **5,6 veces**.
     *
     * En pantalla eso era «≈41.900 pz · ≈3,5 turnos completos de producción»
     * donde lo defendible es del orden de medio turno. Y no es solo exagerar:
     * las causas que más se inflan son las que paran UNA máquina muchas veces
     * —las microdetenciones— así que el ranking mandaba a atacar la equivocada.
     *
     * Y como los `lineMin` tampoco se descuentan entre sí (dos causas pueden
     * frenar la línea el mismo minuto), se escalan al `recoverableMin` del
     * turno, que es el total de línea que cierra su ventana.
     */
    const sumaLinea = causas.reduce((a, c) => a + Math.max(0, c.lineMin ?? c.min ?? 0), 0)
    const tope = t.recoverableMin ?? null
    const escala = tope != null && tope > 0 && sumaLinea > tope ? tope / sumaLinea : 1
    const minDe = (c: { min: number; lineMin?: number | null }) =>
      Math.max(0, c.lineMin ?? c.min ?? 0) * escala

    for (const c of causas) {
      if (!c?.reason || !(c.min > 0)) continue
      const min = minDe(c)
      if (!(min > 0)) continue
      const pz = min * cpm
      const label = equipoDe(c.reason) ?? c.reason
      let fila = acc.get(label)
      if (!fila) {
        fila = { minutes: 0, piezas: 0, count: 0, shifts: new Set(), parts: new Map() }
        acc.set(label, fila)
      }
      fila.minutes += min
      fila.piezas += pz
      fila.count += c.count ?? 0
      fila.shifts.add(idx)
      const parte = fila.parts.get(c.reason)
      if (parte) {
        parte.min += min
        parte.piezas += pz
        parte.count += c.count ?? 0
      } else {
        fila.parts.set(c.reason, { reason: c.reason, min, count: c.count ?? 0, piezas: pz })
      }
    }
  })

  const totalMin = [...acc.values()].reduce((a, f) => a + f.minutes, 0)
  const totalPiezas = [...acc.values()].reduce((a, f) => a + f.piezas, 0)
  const shifts = turnos.filter((t) => (t?.causas?.length ?? 0) > 0).length
  if (totalMin <= 0) {
    return {
      rows: [], totalMin: 0, totalPiezas: 0, shifts, vitalCount: 0, vitalPct: 0,
      porDueno: { mantencion: 0, externo: 0, 'sin-imputar': 0 },
      porDuenoPiezas: { mantencion: 0, externo: 0, 'sin-imputar': 0 },
    }
  }

  /*
   * ⚠ El orden y el corte 80/20 van por PIEZAS, no por minutos (decisión del
   * mockup): las piezas son el número que manda en pantalla, y un ranking
   * ordenado por otra columna que la que se lee es una trampa silenciosa.
   */
  let cum = 0
  const rows: ParetoRow[] = [...acc.entries()]
    .sort((a, b) => b[1].piezas - a[1].piezas)
    .map(([label, f]) => {
      cum += f.piezas
      const dominante = [...f.parts.values()].sort((a, b) => b.min - a.min)[0]!
      const m = matchImputacion(dominante.reason)
      const dueno: DuenoPareto = m.bucket === 'mantencion'
        ? 'mantencion'
        : m.bucket === 'externo' ? 'externo' : 'sin-imputar'
      return {
        label,
        minutes: f.minutes,
        piezas: f.piezas,
        shifts: f.shifts.size,
        count: f.count,
        sharePct: totalPiezas > 0 ? (f.piezas / totalPiezas) * 100 : 0,
        cumPct: totalPiezas > 0 ? (cum / totalPiezas) * 100 : 0,
        dueno,
        parts: [...f.parts.values()].sort((a, b) => b.piezas - a.piezas),
      }
    })

  const porDueno = { mantencion: 0, externo: 0, 'sin-imputar': 0 } as Record<DuenoPareto, number>
  const porDuenoPiezas = { mantencion: 0, externo: 0, 'sin-imputar': 0 } as Record<DuenoPareto, number>
  for (const r of rows) { porDueno[r.dueno] += r.minutes; porDuenoPiezas[r.dueno] += r.piezas }

  const i = rows.findIndex((r) => r.cumPct >= 80)
  const vitalCount = i >= 0 ? i + 1 : 0
  return {
    rows,
    totalMin,
    totalPiezas,
    shifts,
    vitalCount,
    vitalPct: vitalCount > 0 ? rows[vitalCount - 1]!.cumPct : 0,
    porDueno,
    porDuenoPiezas,
  }
}

/** Un turno de la muestra, con lo que hace falta para ubicar su recuperable. */
export interface TurnoCtx {
  dateKey: string
  shiftId?: string | null
  /** Piezas del turno: el numerador del cpm con que se valorizan sus causas. */
  total?: number | null
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
  /** ≈ piezas de ese recuperable, al cpm andando del propio turno. */
  piezas: number
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
  /** Piezas promedio por turno de la muestra: la vara de «≈ N turnos». */
  piezasPorTurno: number
  /** Rango real de cpm andando en la muestra: el «cómo se calcula» lo muestra. */
  cpmRango: { min: number; max: number } | null
  /** Un punto por turno CON PRODUCCIÓN, del más viejo al más nuevo. */
  serie: PuntoTendencia[]
  /** Turnos sin un minuto produciendo: no entran en la serie, pero existieron. */
  sinProduccion: string[]
  /** Banda de lo habitual (cuartiles de la serie). null con menos de 4 puntos. */
  banda: { bajo: number; alto: number; mediana: number; medianaPiezas: number } | null
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
  /*
   * ⚠ Cuando el turno trae el detalle de causas, lo recuperable es LA SUMA DE
   * ESAS CAUSAS, no el total redondeado del backend: el titular del bloque
   * tiene que ser exactamente la suma de sus filas, o los 3 minutos de
   * diferencia (redondeo por causa) reaparecen en cada frase que compare las
   * dos cifras — ya pasó con «12 h 40» arriba y dueños que sumaban 12 h 37.
   */
  /*
   * OJO: y en minutos de LÍNEA, la misma vara que el ranking. Con `min` este
   * titular decía «22 h 27 min recuperables · 29,4%» sobre un ranking cuyas
   * filas sumaban menos de 4 h — dos cifras del mismo bloque midiendo cosas
   * distintas. Ver el comentario largo en `buildPareto`.
   */
  const recuperableDe = (t: TurnoCtx) => {
    if ((t.causas?.length ?? 0) === 0) return t.recoverableMin ?? 0
    const suma = t.causas!.reduce((a, c) => a + Math.max(0, c.lineMin ?? c.min ?? 0), 0)
    const tope = t.recoverableMin ?? null
    return tope != null && tope > 0 && suma > tope ? tope : suma
  }
  const recuperableMin = suma(recuperableDe)

  /* El cpm andando de un turno: el mismo con que buildPareto valoriza sus
   * causas — si difirieran, las pz del hover de la tendencia no cuadrarían
   * con las filas del ranking. */
  const cpmDe = (t: TurnoCtx) =>
    t.total != null && (t.producingMin ?? 0) > 0 ? t.total / t.producingMin! : 0

  const conProduccion = [...unicos].sort((a, b) => a.dateKey.localeCompare(b.dateKey))
  const serie: PuntoTendencia[] = conProduccion.map((t) => ({
    dateKey: t.dateKey,
    pct: (recuperableDe(t) / (t.windowMin || 1)) * 100,
    recuperableMin: recuperableDe(t),
    windowMin: t.windowMin ?? 0,
    piezas: recuperableDe(t) * cpmDe(t),
  }))

  const cpms = unicos.map(cpmDe).filter((v) => v > 0)

  const orden = serie.map((p) => p.pct).sort((a, b) => a - b)
  const promedio = orden.length > 0 ? orden.reduce((a, v) => a + v, 0) / orden.length : null
  /*
   * ⚠ La mediana de piezas se calcula sobre SU PROPIA serie ordenada, no
   * aplicándole el % mediano al turno promedio: el turno del % mediano y el de
   * las piezas medianas no tienen por qué ser el mismo (un turno lento pierde
   * menos piezas con el mismo %).
   */
  const ordenPz = serie.map((p) => p.piezas).sort((a, b) => a - b)
  const banda = orden.length >= 4
    ? {
        bajo: cuartil(orden, 0.25),
        alto: cuartil(orden, 0.75),
        mediana: cuartil(orden, 0.5),
        medianaPiezas: cuartil(ordenPz, 0.5),
      }
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
    piezasPorTurno: unicos.length > 0 ? suma((t) => t.total ?? 0) / unicos.length : 0,
    cpmRango: cpms.length > 0 ? { min: Math.min(...cpms), max: Math.max(...cpms) } : null,
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
  opts: { ventana?: Ventana; turno?: string | null | 'todos'; conCausas?: boolean } = {},
): TurnoCtx[] {
  const { ventana = 10, turno = null, conCausas = false } = opts
  let out = muestraUnica(turnos).filter((t) => (t.windowMin ?? 0) > 0)
  /*
   * ⚠⚠ `conCausas` para el RANKING y su barra: un turno que aporta minutos
   * pero no trae el detalle infla el total sin poder explicarlo. Con 10 turnos
   * en la barra y causas de solo 6, el bloque decía «10 h 59 min recuperables»
   * arriba y las causas sumaban 5 h 48 min — 311 minutos sin dueño ni fila.
   * La tendencia SÍ los usa: solo necesita minutos, no causas.
   */
  if (conCausas) out = out.filter((t) => (t.causas?.length ?? 0) > 0)
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
