/**
 * monitorEventos.ts — todo lo que pasó en el turno, en un solo lugar.
 *
 * ── Por qué agrupado por DUEÑO y no por "evitable / no evitable" ────────────
 *
 * "Evitable" no significa "de Mantención", y esa confusión es la que termina
 * costando caro: los 662 pz que el 14-08 se perdieron por paradas evitables no
 * tenían ni un minuto de falla de máquina — eran operación, abastecimiento y
 * detenciones que nadie imputó. Sin la separación, la cifra se lee como si
 * alguien hubiera fallado.
 *
 * El primer nivel es entonces el dueño de la pérdida, que sale del árbol
 * OFICIAL de imputación (`imputacionTaxonomy`, el de la capacitación V12 con la
 * que se entrena a los supervisores). No lo inventamos acá: si el curso dice
 * que ATASCAMIENTO es MMPP, es MMPP, y nadie puede discutir la etiqueta.
 *
 * ── El grupo que no estaba previsto ─────────────────────────────────────────
 *
 * `sin-imputar`: paradas que llegaron sin causa del árbol —"Micro Detencion",
 * "Detencion"— o con una que el curso no cubre. El 14-08 fueron 252 pz, el 38%
 * de todo lo evitable. Mostrarlo aparte no es un detalle técnico: no se puede
 * atacar lo que nadie anota, y esconderlo dentro de otro grupo lo daría por
 * explicado.
 *
 * ⚠ Las paradas de convenio NO se convierten a piezas. En la colación no se
 * puede producir; contarla daría una pérdida que no existe.
 */
import { matchImputacion, categoriaLabel } from './imputacionTaxonomy'
import type { CostoDeParadas } from './monitorPerdidas'
import type { PublicMonitorLive } from './publicShiftMonitor.service'

export type DuenoPerdida = 'mantencion' | 'externo' | 'sin-imputar' | 'programado'

export const DUENO_META: Record<DuenoPerdida, { label: string; detalle: string }> = {
  mantencion:    { label: 'Mantención',  detalle: 'equipos' },
  externo:       { label: 'Externo',     detalle: 'proceso y abastecimiento' },
  'sin-imputar': { label: 'Sin imputar', detalle: 'nadie anotó la causa' },
  programado:    { label: 'Programado',  detalle: 'no se recupera' },
}

/** Una parada suelta, para el detalle de la causa. */
export interface ParadaSuelta {
  /** Hora de planta a la que EMPEZÓ, ya formateada (HH:MM). */
  hora: string
  /** Hora a la que TERMINÓ. «De 08:57 a 09:02» ubica; «08:57» sola, no. */
  hasta: string
  min: number
  /**
   * Su tramo en el eje del gráfico (minutos desde el primer dato), para poder
   * saltar a ESTA parada y no a todas las de su causa. null sin `t0`.
   */
  desdeMin: number | null
  hastaMin: number | null
}

export interface CausaDelTurno {
  reason: string
  min: number
  count: number
  /** Piezas que costó. null en las de convenio: ahí no se pierde producción. */
  piezas: number | null
  /** Categoría del curso ('MMPP', 'Operacional'…). null si no matcheó ninguna hoja. */
  categoria: string | null
  /** La hoja no es del curso, la agregamos para una máquina que la V12 no cubre. */
  extension: boolean
  /** Sus paradas, de la más larga a la más corta. */
  paradas: ParadaSuelta[]
}

export interface GrupoDelTurno {
  dueno: DuenoPerdida
  min: number
  /** Suma de las piezas de sus causas. null en `programado`. */
  piezas: number | null
  causas: CausaDelTurno[]
}

/** Orden fijo: primero de quién es, después cuánto costó. */
const ORDEN: DuenoPerdida[] = ['mantencion', 'externo', 'sin-imputar', 'programado']

/**
 * `f` viene en la convención wall-clock-as-UTC del doc: la hora de planta ES la
 * del ISO. Formatear con el reloj local la correría 3 o 4 horas.
 */
/**
 * Hora CON SEGUNDOS, para el detalle de una parada.
 *
 * ⚠ Sin segundos el detalle se contradecía solo: una microparada de 08:11:20 a
 * 08:12:50 se mostraba como «08:11→08:12 · 1,5 min» — el reloj decía un minuto
 * y la duración uno y medio. Con paradas cuya MEDIA es de 24 s, el minuto no
 * es una unidad que sirva.
 */
function horaSegDe(iso: string): string {
  return iso.slice(11, 19)
}

/**
 * Las paradas de cada causa, de la más larga a la más corta.
 *
 * Más larga primero y no cronológico a propósito: cuando una causa tiene 23
 * eventos —las microparadas— lo único que se puede mostrar sin tapar la
 * pantalla son las que de verdad pesan.
 */
function paradasPorCausa(
  stopEvents: Array<{ r: number; f: string; s: number }>,
  stopReasons: string[],
  /** Primer tramo con dato: el minuto 0 del eje que comparten los gráficos. */
  t0Ms: number | null,
  /** Ventana del turno: lo de afuera no es suyo. Ver el recorte más abajo. */
  ventana?: { desdeMs: number | null; hastaMs: number | null } | null,
): Map<string, ParadaSuelta[]> {
  /*
   * ⚠ EPISODIOS, no eventos crudos. El sensor parte una misma parada en varios
   * states (el 14-08, dos "Micro Detencion" a las 14:44 con 8 s de diferencia)
   * y la fila de la causa cuenta TRAMOS sobre una grilla de 10 s — así que la
   * fila decía «23×» y este detalle listaba 28, dos números para lo mismo a
   * 20 px de distancia. Acá se funde con la misma vara del backend: hueco de
   * hasta una celda (10 s) = la misma parada, y la duración es el LARGO del
   * episodio (con sus microhuecos adentro), que es lo que mide la grilla.
   */
  const GRILLA_SEG = 10
  const porCausa = new Map<string, Array<{ ini: number; fin: number }>>()
  for (const e of stopEvents) {
    const causa = stopReasons[e.r]
    const ini = Date.parse(e.f)
    if (!causa || !(e.s > 0) || Number.isNaN(ini)) continue
    const lista = porCausa.get(causa) ?? []
    lista.push({ ini, fin: ini + e.s * 1000 })
    porCausa.set(causa, lista)
  }

  const m = new Map<string, ParadaSuelta[]>()
  for (const [causa, eventos] of porCausa) {
    eventos.sort((a, b) => a.ini - b.ini)
    const episodios: Array<{ ini: number; fin: number }> = []
    for (const e of eventos) {
      const ultimo = episodios[episodios.length - 1]
      if (ultimo && e.ini - ultimo.fin <= GRILLA_SEG * 1000) {
        ultimo.fin = Math.max(ultimo.fin, e.fin)
      } else {
        episodios.push({ ...e })
      }
    }
    /*
     * ⚠ RECORTE a la ventana del turno. Sin esto, una parada que arranca antes
     * del primer dato entraba entera: en el turno del 25-08 (arranque 21:25) la
     * lista de «Detencion» abría con **21:15:00→21:25:45 · 10,8 min** — diez de
     * esos once minutos son de antes de que el turno existiera. Por eso las 10
     * paradas listadas sumaban 99,7 min mientras la fila decía 85, y por eso
     * las otras dos causas del mismo turno sí cuadraban: no era redondeo.
     *
     * Cargarle al turno tiempo que no es suyo es peor que el descuadre.
     */
    const desde = ventana?.desdeMs ?? null
    const hasta = ventana?.hastaMs ?? null
    const dentro = episodios
      .map((ep) => ({
        ini: desde != null ? Math.max(ep.ini, desde) : ep.ini,
        fin: hasta != null ? Math.min(ep.fin, hasta) : ep.fin,
      }))
      .filter((ep) => ep.fin > ep.ini)

    m.set(causa, dentro
      .map((ep) => ({
        hora: horaSegDe(new Date(ep.ini).toISOString()),
        hasta: horaSegDe(new Date(ep.fin).toISOString()),
        min: (ep.fin - ep.ini) / 60_000,
        desdeMin: t0Ms == null ? null : (ep.ini - t0Ms) / 60_000,
        hastaMin: t0Ms == null ? null : (ep.fin - t0Ms) / 60_000,
      }))
      .sort((a, b) => b.min - a.min))
  }
  return m
}

/**
 * A qué grupo va una causa recuperable.
 *
 * Solo `mantencion` y `externo` son afirmaciones que el árbol respalda. Todo lo
 * demás —sin hoja, hoja ambigua de otro bucket— cae en `sin-imputar`, que dice
 * exactamente lo que pasa: no hay dato para atribuirla. Inventarle dueño a una
 * detención es lo único que no se puede hacer acá.
 */
function duenoDe(reason: string): { dueno: DuenoPerdida; categoria: string | null; extension: boolean } {
  const m = matchImputacion(reason)
  const categoria = m.leaf ? categoriaLabel(m.leaf) : null
  const extension = Boolean(m.leaf?.extension)
  if (m.bucket === 'mantencion') return { dueno: 'mantencion', categoria, extension }
  if (m.bucket === 'externo') return { dueno: 'externo', categoria, extension }
  return { dueno: 'sin-imputar', categoria, extension }
}

export function agruparEventos(args: {
  tb?: PublicMonitorLive['timeBreakdown'] | null
  stopEvents?: Array<{ r: number; f: string; s: number }> | null
  stopReasons?: string[] | null
  /** Costo ya calculado al ritmo local (ver `monitorPerdidas`). */
  costo?: CostoDeParadas | null
  /** Promedio andando, de respaldo para las causas que el costo no cubra. */
  cpmGlobal?: number | null
  /** ISO del primer tramo con dato: ubica cada parada en el eje del gráfico. */
  t0?: string | null
  /**
   * Ventana del turno en ms. Las paradas se recortan a ella: una que arranca
   * antes del turno solo aporta lo que cae adentro.
   */
  ventana?: { desdeMs: number | null; hastaMs: number | null } | null
}): GrupoDelTurno[] {
  const { tb } = args
  if (!tb) return []
  const t0Ms = args.t0 ? Date.parse(args.t0) : NaN
  const paradas = paradasPorCausa(
    args.stopEvents ?? [], args.stopReasons ?? [], Number.isNaN(t0Ms) ? null : t0Ms,
    args.ventana,
  )
  const costoPorCausa = new Map((args.costo?.porCausa ?? []).map((c) => [c.reason, c]))
  const cpm = args.cpmGlobal && args.cpmGlobal > 0 ? args.cpmGlobal : null

  const grupos = new Map<DuenoPerdida, GrupoDelTurno>()
  const push = (dueno: DuenoPerdida, causa: CausaDelTurno) => {
    const g = grupos.get(dueno) ?? { dueno, min: 0, piezas: dueno === 'programado' ? null : 0, causas: [] }
    g.min += causa.min
    if (g.piezas != null && causa.piezas != null) g.piezas += causa.piezas
    g.causas.push(causa)
    grupos.set(dueno, g)
  }

  /*
   * OJO OJO: MINUTOS DE LÍNEA, como el titular del bloque y el Pareto.
   *
   * `min` es lo que la causa duró en ALGUNA máquina; `lineMin`, lo que frenó la
   * línea entera. En el turno del 26-08, KNURO traía 88 y 8. Con `min` la lista
   * decía «KNURO 1.090 pz · 88 min» y los tres dueños sumaban 2.066 pz debajo
   * de un titular que —ya corregido— dice 469: el bloque dejaba de cuadrar
   * consigo mismo, que es peor que el error original porque salta a la vista.
   *
   * Los `lineMin` tampoco se descuentan entre sí, así que se escalan al
   * `recoverableMin` del turno: el total de línea que cierra la ventana.
   */
  const sumaLinea = (tb.recoverable ?? []).reduce((a, x) => a + Math.max(0, x.lineMin ?? x.min ?? 0), 0)
  const escala = tb.recoverableMin > 0 && sumaLinea > tb.recoverableMin
    ? tb.recoverableMin / sumaLinea
    : 1

  for (const x of tb.recoverable ?? []) {
    const { dueno, categoria, extension } = duenoDe(x.reason)
    const minLinea = Math.max(0, x.lineMin ?? x.min ?? 0) * escala
    /*
     * El RITMO sigue siendo el local —el que la línea traía justo antes de esa
     * parada—; solo se corrigen los minutos. `costo` viene calculado sobre los
     * minutos de máquina, así que de él se toma el ritmo, no el total.
     */
    /*
     * El RITMO es el local de esa causa y los MINUTOS los de línea.
     *
     * `c.cpm` ya viene definido en `monitorPerdidas` como
     * `(piezas x maquinas) / min`: es el ritmo de LÍNEA efectivo, con la
     * división por máquinas ya deshecha. Escalar `c.piezas` en vez de usar
     * `c.cpm` aplicaría esa división DOS veces y hundía el costo a un tercio.
     */
    const c = costoPorCausa.get(x.reason)
    const cpmLocal = c?.cpm ?? cpm
    const piezas = cpmLocal ? minLinea * cpmLocal : null
    push(dueno, {
      reason: x.reason,
      min: minLinea,
      count: x.count ?? 0,
      piezas,
      categoria,
      extension,
      paradas: paradas.get(x.reason) ?? [],
    })
  }

  for (const x of tb.planned ?? []) {
    push('programado', {
      reason: x.reason,
      min: x.min,
      count: x.count ?? 0,
      piezas: null,
      // La categoría es siempre "Paros Programados": decirlo en cada fila es
      // ruido cuando el grupo ya se llama así.
      categoria: null,
      extension: false,
      paradas: paradas.get(x.reason) ?? [],
    })
  }

  return ORDEN.filter((d) => grupos.has(d)).map((d) => {
    const g = grupos.get(d)!
    g.causas.sort((a, b) => (b.piezas ?? b.min * 1000) - (a.piezas ?? a.min * 1000))
    return g
  })
}

/**
 * Cuántos minutos de máquina hubo. Sirve para la frase que Mantención necesita
 * poder decir —"ninguna parada fue por falla de máquina"— que solo vale si se
 * afirma sobre el total, no sobre lo que se alcanzó a mostrar.
 */
export function minutosDeMantencion(grupos: GrupoDelTurno[]): number {
  return grupos.find((g) => g.dueno === 'mantencion')?.min ?? 0
}

/**
 * ¿Se puede afirmar que ninguna parada fue por falla de máquina?
 *
 * POR QUÉ EXISTE
 * --------------
 * El monitor lo afirmaba con un ✓ verde cada vez que no había grupo
 * `mantencion` — y `sin-imputar` contaba como "grupo que clasificar". O sea:
 * con el turno ENTERO sin imputar, la pantalla decía
 *
 *     ✓ Ninguna parada por falla de máquina en este turno.
 *
 * justo debajo de «SIN IMPUTAR · nadie anotó la causa · 2 h 40 min». Visto en
 * el monitor de Eviscerado el 26-08 a las 04:00. En Chonchi la imputación viene
 * en 0% la mayor parte del tiempo, así que el ✓ salía casi siempre sin
 * evidencia detrás.
 *
 * Convertir "no sé" en "no fue Mantención" es justo lo que este archivo
 * prohíbe más arriba, y en el sentido que le conviene a Mantención: el día que
 * Producción note que el ✓ sale igual sin imputar nada, se cae la credibilidad
 * del resto de la pantalla.
 *
 * La regla: se afirma solo sobre lo que TIENE causa anotada. Sin nada imputado
 * no se dice nada; con parte sin imputar, la frase lo dice y no habla "del
 * turno".
 */
export function veredictoFallaDeMaquina(
  grupos: GrupoDelTurno[],
): { texto: string; sinImputarMin: number } | null {
  const imputados = grupos.filter((g) => g.dueno === 'mantencion' || g.dueno === 'externo')
  // Sin nada imputado no hay nada que afirmar; con Mantención adentro, tampoco.
  if (imputados.length === 0) return null
  if (imputados.some((g) => g.dueno === 'mantencion')) return null

  const sinImputarMin = grupos.find((g) => g.dueno === 'sin-imputar')?.min ?? 0
  if (sinImputarMin <= 0) {
    return { texto: '✓ Ninguna parada por falla de máquina en este turno.', sinImputarMin: 0 }
  }
  return {
    texto: `✓ Ninguna parada con causa anotada fue falla de máquina · quedan ${fmtDur(sinImputarMin)} sin imputar.`,
    sinImputarMin,
  }
}

/** "111" → "1 h 51 min". Mismo formato que usa el bloque de tiempo. */
function fmtDur(min: number): string {
  const h = Math.floor(min / 60)
  const m = Math.round(min % 60)
  if (h === 0) return `${m} min`
  return m > 0 ? `${h} h ${m} min` : `${h} h`
}
