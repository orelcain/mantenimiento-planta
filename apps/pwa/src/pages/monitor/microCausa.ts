/**
 * Causa POSIBLE de cada micro detención que llega con hora al monitor (la que se marca en «Ritmo en vivo»), con el algoritmo v3 (03-11-2026).
 *
 * Lógica PURA, sin React ni DOM. Todo sale de lo que el doc público ya trae: `pulse.serieMinuto` (piezas por minuto y esperado de cada Baader) y
 * `live.stopEvents` / `stopReasons` / `stopMachines` (cada detención con su máquina, inicio y duración). No se publica nada nuevo ni se toca el backend.
 *
 * ⚠ Es «causa posible», nunca «causa»: son reglas de contexto (qué pasó justo antes, qué hicieron las otras Baader), no un diagnóstico. La
 * «causa PROBABLE» es otra cosa: el estimado agregado de cuántas coincidencias superan lo habitual del turno, y sale de la calibración estática
 * (`causasCalibracion.ts`) con `resumirCausas`. Referencia ejecutable: `causas_v3.py` (ARIA_MANTENIMIENTO_PLANTA/scripts/microdetenciones_2026-11-02_v3):
 * `clasificar_turno`, `familia`, `prim_prod_serie`. La tabla exacta está en `docs/ESTUDIO_MICRO_CATEGORIAS_V3_2026-11-02.md`, §1.
 *
 * Solo se clasifican las micro que llegan con hora (duración > 0): `functions/publicMonitor.js` descarta de `stopEvents` las de 0 s, y al monitor
 * de esas llega solo cuántas son (`microN` de `live.mantencion.porMaquina`).
 *
 * Gana la PRIMERA regla que se cumple, en este orden:
 *  1. Arranque: desde el inicio programado y hasta ARR (10 min) después de max(inicio programado, primera producción de esa Baader), o a menos de ARR
 *     del fin de una pausa de 10 min o más de esa Baader (la unión de sus detenciones que no son micro, las programadas incluidas).
 *  2. Otra Baader paró · a la vez: otra Baader tuvo una micro o una detención NO programada con inicio, bajado al segundo, a ±15 s.
 *  3. Al volver de una detención: hasta TRAS después del fin de una detención (no micro) de esa misma Baader.
 *  4. Otra Baader paró · en cadena: la planta tiene 3 o más Baader y CADA una de las otras tuvo una micro con inicio entre 22,5 y CAD_HI antes o después.
 *  5. Otra Baader paró · detención previa: otra Baader INICIÓ una detención no programada entre 22,5 s y OTR_HI antes, de la familia ACUM, ATASC, MMPP o AJ_OP.
 *  6. Sin contexto: todo lo demás.
 * «Ritmo bajo» se retiró de las causas de micro (fuga del atraso de anotación de Shoplogix: estudio v3, §1). Sigue en el globo del minuto como pérdida
 * con la Baader andando, que es otra cosa.
 *
 * Además de la causa, cada micro trae lo que el globo muestra: la evidencia con sus cifras, las celdas de la tabla que la prueban, las reglas que NO
 * aplicaron y la tabla por Baader. Toda cifra sale del doc: aquí no se escribe ninguna a mano. Los textos viven en `textosCausas.ts`.
 */
import { matchImputacion } from '@/services/shoplogix/imputacionTaxonomy'
import { calibracionDe, PARAMETROS_V3, type CalibracionPlanta, type EstadoForma, type FormaCalibrada, type ParametrosCausas } from './causasCalibracion'
import { etiquetaMaquina, esMicroDetencion, unir, type Intervalo } from './ritmoVivo'
import {
  ATRASO_ANOTA, OCULTO_S, ROTULO_CAUSA, TXT_GLOBO, motivoLegible, textoDescarteArranque, textoDescarteLinea, textoDescarteVolver, tituloDescarte,
} from './textosCausas'

export { ATRASO_ANOTA, OCULTO_S, ROTULO_CAUSA, motivoLegible }

export type CausaMicro = 'arranque' | 'linea' | 'paro' | 'sin'
/** Las formas de «Otra Baader paró»: solo se dicen en el detalle y en el ⓘ. */
export type ModoLinea = 'a_la_vez' | 'en_cadena' | 'tras_paro_otra'
/** La clave de cada forma de causa (la de la calibración, más «sin»). */
export type FormaMicro = FormaCalibrada | 'sin'

/** Orden de precedencia, que es también el orden de la barra y de los chips del resumen. */
export const CAUSAS_MICRO: readonly CausaMicro[] = ['arranque', 'linea', 'paro', 'sin']

/**
 * El color de cada causa de una micro (marcas ▼ del gráfico, tramos de la barra, cuadros de los chips y del globo): solo tokens `--v2-*` de
 * monitorGlass.css, que existen en claro y en oscuro. Las marcas y los cuadros van a ≥ 3:1 contra la tarjeta Y contra el fondo local donde se
 * dibujan (el chip gris, la columna resaltada de la tabla): «Al volver de una detención» y «Sin contexto» usan las variantes `--v2-causa-*`, que en
 * claro son más cerradas que el coral y el gris (`--v2-gris`, 2,3:1) del resto del monitor, y en oscuro «Sin contexto» es un gris OPACO (el `--v2-gris`
 * es translúcido y sobre el chip bajaba a 2,6:1). Lo mide `__tests__/contrasteCausasMicro.test.ts` leyendo este mismo mapa.
 */
export const COLOR_CAUSA: Record<CausaMicro, string> = {
  arranque: 'rgb(var(--foreground))',
  linea: 'var(--v2-ext)',
  paro: 'var(--v2-causa-paro)',
  sin: 'var(--v2-causa-sin)',
}

// ── Las reglas (constantes con su porqué) ────────────────────────────────────

/**
 * Una detención de ESTA duración o más es una pausa (inicio de turno, reunión, colación…) y lo que sigue es un arranque. Estudio, taxonomía ARR: tras
 * una pausa larga hay más micro de lo habitual; la meseta del exceso está entre 7 y 10 min. No depende de la planta (la calibración fija solo la
 * ventana del arranque, `ARR`).
 */
export const ARRANQUE_PARADA_MIN_S = 600
/**
 * «A la vez»: otra Baader con una micro O con una detención NO programada cuyo inicio está a ±15 s del de la micro, con los dos inicios bajados al
 * segundo antes de comparar (decisión de Mantención, 02-11-2026: la misma regla del segundo que usa el zoom del minuto). Shoplogix anota en pasos de
 * 15 s con ruido de milisegundos: comparadas al milisegundo (≤ 15.000 ms), dos detenciones a UN paso entraban o no según 2 a 9 ms. Una prueba fija el
 * límite: 15 s al segundo entra aunque sean 15,999 s crudos; 16 s ya no. Con una sola Baader (Filete) no aplica.
 */
export const LINEA_COMUN_TOL_S = 15
/** Lo que vale la ventana de «Al volver de una detención» sin calibración (v3). Con calibración manda la de la planta (Yal: 90 s). */
export const TRAS_DETENCION_S = PARAMETROS_V3.TRAS / 1000
/** «En cadena»: el piso de la ventana (22,5 s), igual en todas las plantas. */
export const CADENA_LO_MS = 22_500
/** «Detención previa»: el piso de la ventana (22,5 s) y las familias de motivo que cuentan (de `causas_v3.py`). */
export const OTRA_LO_MS = 22_500
export const FAMILIAS_LINEA: ReadonlySet<string> = new Set(['ACUM', 'ATASC', 'MMPP', 'AJ_OP'])
/** La micro que empieza en los primeros 15 s de su minuto: Shoplogix la anota 15-30 s después de que la Baader deja de contar piezas, así que la detención PUDO empezar en el minuto anterior (marca ▽). */
export const INICIO_MINUTO_S = 15

/**
 * La familia del motivo de una detención (misma tabla que `familia()` de `causas_v3.py`, que es la de `lente_exploratoria/lib_exp.familia`).
 * El ORDEN de las comprobaciones es parte de la tabla: la primera que se cumple gana («CAMBIO LOTE/MMPP» es MMPP porque la comprobación de MMPP va
 * antes que la mecánica; «DETENCION» exacta es SIN_IMP). Normaliza como el script: NFD, sin marcas ni caracteres no ASCII, espacios colapsados,
 * mayúsculas.
 */
export function familia(razon: string | null | undefined): string {
  const n = String(razon ?? '').normalize('NFD').replace(/[\u0080-\uffff]/g, '').replace(/\s+/g, ' ').trim().toUpperCase()
  if (n.startsWith('ACUMULACION')) return 'ACUM'
  if (n.includes('MMPP') || n.includes('MATERIA PRIMA') || n.includes('CONDICION MMPP')) return 'MMPP'
  if (n.startsWith('ATASCAMIENTO')) return 'ATASC'
  if (n.startsWith('AJUSTE OPERADOR')) return 'AJ_OP'
  if (n.startsWith('AJUSTE MANTENIMIENTO')) return 'AJ_MANT'
  if (n.startsWith('KNURO')) return 'KNURO'
  if (n.startsWith('LOGICA') || n.startsWith('SAP') || n.startsWith('BAJADA')) return 'LOGICA'
  if (n.startsWith('ENERGIA')) return 'ENERGIA'
  if (n === 'DETENCION' || n === 'SIN RAZON') return 'SIN_IMP'
  if (n.includes('LIMPIEZA') || n.includes('ASEO')) return 'LIMP'
  if (n.startsWith('CUMPLIMIENTO CUOTA') || n.startsWith('CONTRASTACION') || n.startsWith('PUNTO CERO') || n.startsWith('FLOW ICE')) return 'PLAN'
  if (['MOTORES', 'CINTAS', 'BOMBAS', 'CORREAS', 'PERNOS', 'CUCHILL', 'GEA', 'BALANZAS', 'FALLA OPERACIONAL'].some((k) => n.includes(k))) return 'MEC'
  return 'OTRO'
}

/** Los parámetros que valen para una planta: los de su calibración, o los de v3 si no tiene. */
export const parametrosDe = (planta: string | null | undefined): ParametrosCausas => calibracionDe(planta)?.parametros ?? PARAMETROS_V3

/** Una forma a partir de la causa y su modo. */
export const formaDe = (causa: CausaMicro, modo: ModoLinea | null): FormaMicro => (causa === 'linea' ? `linea_${modo ?? 'a_la_vez'}` as FormaCalibrada : causa)

// ── Entradas y salida ────────────────────────────────────────────────────────

export interface SerieMicro {
  /** Inicio del primer minuto (ISO, wall-as-UTC), el mismo de `pulse.serieMinuto.desde`. */
  desde: string
  maquinas: Array<{ id: string; nombre: string; esperado: number | null; cycles: number[] }>
}

export interface EntradaMicroCausa {
  serie: SerieMicro | null | undefined
  stopEvents?: Array<{ r: number; f: string; s: number; m?: number }> | null
  stopReasons?: string[] | null
  stopMachines?: string[] | null
  /** Inicio programado del turno (ms, wall-as-UTC): el arranque cuenta desde max(este, la primera producción de cada Baader). */
  inicioTurnoMs: number
  /** La planta del doc (`plantSlug`): de ella salen los parámetros de la calibración. Sin planta o sin calibración valen los de v3. */
  planta?: string | null
}

/** Una celda de la tabla del globo: la Baader (índice de la fila) y el minuto respecto del de la micro (−2 = dos minutos antes). */
export interface CeldaRef {
  fila: number
  d: -2 | -1 | 0 | 1
}

/** Otra Baader que coincidió con la micro (`deltaS` < 0: antes). */
export interface OtraBaader {
  fila: number
  nombre: string
  /** true: tuvo una micro; false: una detención. */
  micro: boolean
  deltaS: number
  /** Su duración anotada. */
  durS: number
  razon: string | null
}

/** Lo que respalda la causa, con las cifras del doc (los textos se arman en `textosCausas.ts`). */
export type EvidenciaMicro =
  | { forma: 'arranque'; origen: 'produccion' | 'inicio' | 'pausa'; /** Minutos desde el origen (negativo: la micro es anterior). */ minutos: number; pausaS: number | null }
  | { forma: 'linea_a_la_vez'; otras: OtraBaader[] }
  | { forma: 'linea_en_cadena'; otras: OtraBaader[] }
  | { forma: 'linea_tras_paro_otra'; nombre: string; razon: string | null; durS: number; haceS: number }
  | { forma: 'paro'; haceS: number; durS: number }
  | { forma: 'sin' }

/** Una regla que NO aplicó, con su cifra («✕»). */
export interface ReglaDescartada {
  regla: Exclude<CausaMicro, 'sin'>
  /** Lo que se dice de la regla, en negrita: «No es arranque:». */
  titulo: string
  /** El porqué, con su cifra y su límite. */
  texto: string
}

export interface FilaGlobo {
  id: string
  /** «Ev 1». */
  nombre: string
  esperado: number | null
  /** La Baader de la micro del globo. */
  ella: boolean
  /** Piezas de los minutos k−2, k−1, k y k+1; null = ese minuto no existe en la serie o todavía no cierra. */
  piezas: Array<number | null>
  /** ▼ en el minuto k: esta Baader tiene una micro que empieza ahí; trae la causa de ESA micro (su color). */
  microEnK: CausaMicro | null
  /**
   * ▽ en el minuto k−1: la detención de esta Baader que explica el globo (su micro, o la micro o la detención no programada que empieza a ±15 s de
   * la del globo) quedó anotada en los primeros 15 s del minuto k. Shoplogix la anota con 15 a 30 s de atraso, así que PUDO empezar en k−1.
   */
  inicioPrevio: boolean
}

export interface TablaGlobo {
  /** «15:08», «15:09», «15:10», «15:11»: los cuatro minutos de las columnas. */
  horas: string[]
  filas: FilaGlobo[]
  /** Leyenda de ▽ para el pie de la tabla; null si ninguna celda lleva esa marca. */
  leyendaInicio: string | null
}

export interface MicroClasificada {
  /** Estable entre lecturas: máquina + inicio. */
  id: string
  maquinaId: string
  /** Índice de la máquina en la serie (el de su fila en el gráfico). */
  fila: number
  nombre: string
  inicioMs: number
  /** Duración anotada por Shoplogix (15 s o más). */
  duracionS: number
  causa: CausaMicro
  /** Solo en «Otra Baader paró»: a la vez, en cadena o detención previa. */
  modo: ModoLinea | null
  /** La clave de la forma (la de la calibración): «arranque», «linea_en_cadena», «paro», «sin»… */
  forma: FormaMicro
  /** Índice del minuto de la serie en que empezó. */
  minuto: number
  evidencia: EvidenciaMicro
  /** Las celdas de la tabla que prueban la causa (el ① del globo y de la tabla). Vacío: ninguna celda la prueba. */
  celdas: CeldaRef[]
  /** Las reglas que no aplicaron, en orden de precedencia. */
  descartadas: ReglaDescartada[]
  tabla: TablaGlobo
}

interface Evento { fila: number; ini: number; fin: number; s: number; razon: string | null; micro: boolean; programada: boolean }

/** Otra Baader que se detuvo a ±`LINEA_COMUN_TOL_S` del inicio de la micro (`deltaMs`: la diferencia de inicios al segundo, < 0 si fue antes; `d`: su minuto respecto del de la micro). */
interface Coincidencia { fila: number; micro: boolean; programada: boolean; s: number; razon: string | null; ini: number; deltaMs: number; d: number }

interface Evaluacion {
  m: Evento
  /** Minuto de la serie en que empezó. */
  k: number
  /** Segundo del minuto en que Shoplogix anotó el inicio (0 a 59,99). */
  seg: number
  arranque: { aplica: boolean; pausa: { a: number; b: number } | null; ultimaLarga: { a: number; b: number } | null; ref: number | null; refEsProduccion: boolean }
  linea: { otros: Coincidencia[]; programadas: Coincidencia[] }
  cadena: Array<{ fila: number; deltaMs: number; s: number; d: number }>
  otra: Array<{ fila: number; razon: string | null; fam: string; haceMs: number; s: number; ini: number }>
  otraFuera: Array<{ fila: number; razon: string | null; haceMs: number }>
  paro: { aplica: boolean; ultimo: Evento | null }
  causa: CausaMicro
  modo: ModoLinea | null
}

const hhmm = (ms: number) => new Date(ms).toISOString().slice(11, 16)

/** Cuántas micro hay de cada causa, en el orden de `CAUSAS_MICRO`. */
export function contarPorCausa(micros: readonly MicroClasificada[]): Record<CausaMicro, number> {
  const out: Record<CausaMicro, number> = { arranque: 0, linea: 0, paro: 0, sin: 0 }
  for (const m of micros) out[m.causa]++
  return out
}

/** Cuántas micro hay de cada forma (la clave de la calibración), con la forma «sin». */
export function contarPorForma(micros: readonly MicroClasificada[]): Record<FormaMicro, number> {
  const out: Record<FormaMicro, number> = { arranque: 0, linea_a_la_vez: 0, linea_en_cadena: 0, linea_tras_paro_otra: 0, paro: 0, sin: 0 }
  for (const m of micros) out[m.forma]++
  return out
}

/**
 * Los números de las razones (①) y las celdas de la tabla que cada una prueba: `fila:d` → números. La tabla pinta esos mismos números, así que
 * cada cifra del texto se ve también en el dato que la prueba.
 */
export function numerosPorCelda(q: Pick<MicroClasificada, 'celdas'>): Map<string, number[]> {
  const out = new Map<string, number[]>()
  for (const c of q.celdas) {
    const clave = `${c.fila}:${c.d}`
    out.set(clave, [...(out.get(clave) ?? []), 1])
  }
  return out
}

// ── Causa probable (el estimado agregado, con la calibración) ────────────────

export interface ResumenCausa {
  causa: CausaMicro
  n: number
  /** Segundos anotados de esas micro (lo que se dice «tiempo detenido»). */
  segundos: number
  /** `round(Σ_formas micro_forma × max(0, precisión))`, solo con las formas «activas», redondeado UNA vez por causa. null: sin calibración o «Sin contexto». */
  probable: number | null
  /** Todas sus micro son de formas «en observación»: se muestran, pero no suman. */
  enObservacion: boolean
}

export interface ResumenCausas {
  /** La línea tiene calibración: sin ella no hay «~». */
  calibrada: boolean
  causas: ResumenCausa[]
  total: number
  /** La suma de las causas probables; null sin calibración. */
  probableTotal: number | null
  porModo: Record<ModoLinea, number>
}

/** El estado de una forma en la calibración de la planta; null si no hay calibración o esa forma no está en ella. */
export const estadoDeForma = (cal: CalibracionPlanta | null, forma: FormaMicro): EstadoForma | null =>
  cal && forma !== 'sin' ? cal.categorias[forma]?.estado ?? null : null

const FORMAS_DE: Record<CausaMicro, readonly FormaCalibrada[]> = {
  arranque: ['arranque'],
  linea: ['linea_a_la_vez', 'linea_en_cadena', 'linea_tras_paro_otra'],
  paro: ['paro'],
  sin: [],
}

/** Resume las micro por causa con la calibración de la planta (null: línea sin calibración). El total es la suma de las causas, cada una redondeada una vez. */
export function resumirCausas(micros: readonly MicroClasificada[], cal: CalibracionPlanta | null): ResumenCausas {
  const porForma = contarPorForma(micros)
  const causas: ResumenCausa[] = CAUSAS_MICRO.map((causa) => {
    const mias = micros.filter((q) => q.causa === causa)
    let probable: number | null = null
    if (cal && causa !== 'sin') {
      let suma = 0
      for (const f of FORMAS_DE[causa]) {
        const c = cal.categorias[f]
        if (c && c.estado === 'activa') suma += porForma[f] * Math.max(0, c.precision_estimada)
      }
      probable = Math.round(suma)
    }
    const formas = FORMAS_DE[causa].filter((f) => porForma[f] > 0)
    const enObservacion = !!cal && mias.length > 0 && formas.length > 0 && formas.every((f) => cal.categorias[f]?.estado === 'en observación')
    return { causa, n: mias.length, segundos: mias.reduce((a, q) => a + q.duracionS, 0), probable, enObservacion }
  })
  return {
    calibrada: cal != null,
    causas,
    total: micros.length,
    probableTotal: cal ? causas.reduce((a, c) => a + (c.probable ?? 0), 0) : null,
    porModo: { a_la_vez: porForma.linea_a_la_vez, en_cadena: porForma.linea_en_cadena, tras_paro_otra: porForma.linea_tras_paro_otra },
  }
}

// ── Clasificación ────────────────────────────────────────────────────────────

/**
 * Clasifica cada micro con hora. Sin serie, sin `stopMachines` (el doc es anterior a que cada detención dijera de qué máquina fue) o sin micro,
 * devuelve `[]`: no se adivina la máquina.
 */
export function clasificarMicros(e: EntradaMicroCausa): MicroClasificada[] {
  const serie = e.serie
  const ids = e.stopMachines ?? []
  const eventosCrudos = e.stopEvents ?? []
  if (!serie || serie.maquinas.length === 0 || ids.length === 0) return []
  if (!eventosCrudos.every((x) => x.m != null && ids[x.m] != null)) return []
  const t0 = Date.parse(serie.desde)
  if (!Number.isFinite(t0)) return []

  const P = parametrosDe(e.planta)
  const n = serie.maquinas.length
  const filaDe = new Map(serie.maquinas.map((q, i) => [q.id, i]))
  /* ¿Es una detención programada? Con la taxonomía de la app (bucket `planificado`: cambio de turno, colación, detención programada, ejercicio
     compensatorio, reunión de inicio), una sola vez por razón distinta. */
  const programadaDe = (e.stopReasons ?? []).map((r) => matchImputacion(r).bucket === 'planificado')
  const eventos: Evento[] = []
  for (const x of eventosCrudos) {
    const fila = filaDe.get(ids[x.m!]!)
    const ini = Date.parse(x.f)
    if (fila == null || !Number.isFinite(ini) || !(x.s > 0)) continue
    const razon = e.stopReasons?.[x.r] ?? null
    const micro = esMicroDetencion(razon)
    eventos.push({ fila, ini, fin: ini + x.s * 1000, s: x.s, razon, micro, programada: !micro && (programadaDe[x.r] ?? false) })
  }
  const micros = eventos.filter((v) => v.micro).sort((a, b) => a.ini - b.ini)
  const paros = eventos.filter((v) => !v.micro)
  /** Detenciones (no micro) de cada Baader UNIDAS: una pausa partida en dos registros se cuenta entera para el arranque. */
  const parosUnidos = new Map<number, Intervalo[]>()
  for (const p of paros) parosUnidos.set(p.fila, [...(parosUnidos.get(p.fila) ?? []), [p.ini, p.fin] as Intervalo])
  for (const [fila, iv] of parosUnidos) parosUnidos.set(fila, unir(iv))

  /** Primera producción de cada Baader en el monitor: el inicio del primer minuto de la serie con piezas > 0 (`prim_prod_serie`). */
  const primProd: Array<number | null> = serie.maquinas.map((q) => {
    const k = q.cycles.findIndex((v) => (v || 0) > 0)
    return k >= 0 ? t0 + k * 60_000 : null
  })
  /** Minutos COMPLETOS de la serie: `pulse.js` publica solo minutos cerrados, hasta el último cerrado en TODAS las Baader. */
  const completos = Math.min(...serie.maquinas.map((q) => q.cycles.length))
  const piezasEn = (fila: number, k: number): number | null => (k >= 0 && k < completos ? serie.maquinas[fila]!.cycles[k] ?? 0 : null)
  const nom = (fila: number) => etiquetaMaquina(serie.maquinas[fila]!.nombre)
  const minutoDe = (ms: number) => Math.floor((ms - t0) / 60_000)
  /** El segundo (0 a 59,99) del minuto de la serie en que cae un instante. */
  const segundoDelMinuto = (ms: number) => ((((ms - t0) % 60_000) + 60_000) % 60_000) / 1000
  const horaMinuto = (k: number) => hhmm(t0 + k * 60_000)
  const hayInicioTurno = Number.isFinite(e.inicioTurnoMs)

  const evaluar = (m: Evento): Evaluacion => {
    const k = minutoDe(m.ini)
    const seg0 = segundoDelMinuto(m.ini)

    // 1 · Arranque: desde el inicio programado y hasta ARR después de max(inicio programado, primera producción de esa Baader) (entran las que empiezan antes
    // de producir), o a menos de ARR del fin de una pausa de 10 min o más de esa Baader.
    const largas = (parosUnidos.get(m.fila) ?? []).filter(([a, b]) => b - a >= ARRANQUE_PARADA_MIN_S * 1000 && b <= m.ini)
    const ultima = largas.length > 0 ? largas[largas.length - 1]! : null
    const ultimaLarga = ultima ? { a: ultima[0], b: ultima[1] } : null
    const pausa = ultimaLarga && m.ini - ultimaLarga.b < P.ARR ? ultimaLarga : null
    const prim = primProd[m.fila] ?? null
    const ini0 = hayInicioTurno ? e.inicioTurnoMs : null
    const ref = P.PROD && prim != null ? (ini0 == null ? prim : Math.max(ini0, prim)) : ini0
    const arrTurno = ref != null && m.ini - ref < P.ARR

    // 2 · A la vez: otra Baader con una micro o con una detención NO programada que empieza a ±15 s, con los inicios al segundo.
    const difS = (y: Evento) => Math.floor(y.ini / 1000) - Math.floor(m.ini / 1000)
    const cercanas = eventos
      .filter((y) => y.fila !== m.fila && Math.abs(difS(y)) <= LINEA_COMUN_TOL_S)
      .sort((a, b) => Math.abs(difS(a)) - Math.abs(difS(b)) || Math.abs(a.ini - m.ini) - Math.abs(b.ini - m.ini))
      .map((y): Coincidencia => ({ fila: y.fila, micro: y.micro, programada: y.programada, s: y.s, razon: y.razon, ini: y.ini, deltaMs: difS(y) * 1000, d: minutoDe(y.ini) - k }))
    /* Una por Baader, la más cercana (vienen ordenadas por cercanía). */
    const unaPorBaader = (lista: Coincidencia[]) => lista.filter((c, i) => lista.findIndex((z) => z.fila === c.fila) === i)
    const otros = unaPorBaader(cercanas.filter((c) => !c.programada))
    const programadas = unaPorBaader(cercanas.filter((c) => c.programada))

    // 3 · Al volver de una detención: hasta TRAS después del fin de una detención (no micro) de esa Baader.
    const previos = paros.filter((p) => p.fila === m.fila && p.fin <= m.ini)
    const ultimo = previos.length > 0 ? previos.reduce((a, b) => (b.fin > a.fin ? b : a)) : null
    const aplicaParo = ultimo != null && m.ini - ultimo.fin < P.TRAS

    // 4 · En cadena: la planta tiene 3 o más Baader y CADA una de las otras tuvo una micro entre 22,5 s y CAD_HI antes o después (en ms).
    let cadena: Evaluacion['cadena'] = []
    if (P.CAD && n >= 3) {
      for (let g = 0; g < n; g++) {
        if (g === m.fila) continue
        let mejor: Evento | null = null
        for (const x of micros) {
          if (x.fila !== g) continue
          const d = Math.abs(x.ini - m.ini)
          if (d < CADENA_LO_MS || d > P.CAD_HI) continue
          if (!mejor || d < Math.abs(mejor.ini - m.ini)) mejor = x
        }
        if (mejor) cadena.push({ fila: g, deltaMs: mejor.ini - m.ini, s: mejor.s, d: minutoDe(mejor.ini) - k })
      }
      if (cadena.length < n - 1) cadena = []
    }

    // 5 · Detención previa: otra Baader INICIÓ una detención no programada entre 22,5 s y OTR_HI antes, de las familias de línea.
    const otra: Evaluacion['otra'] = []
    const otraFuera: Evaluacion['otraFuera'] = []
    if (P.OTR && n >= 2) {
      for (const y of paros) {
        if (y.fila === m.fila || y.programada) continue
        const hace = m.ini - y.ini
        if (hace < OTRA_LO_MS || hace > P.OTR_HI) continue
        const fam = familia(y.razon)
        if (P.OTR_TODAS || FAMILIAS_LINEA.has(fam)) otra.push({ fila: y.fila, razon: y.razon, fam, haceMs: hace, s: y.s, ini: y.ini })
        else otraFuera.push({ fila: y.fila, razon: y.razon, haceMs: hace })
      }
    }

    let causa: CausaMicro = 'sin'
    let modo: ModoLinea | null = null
    if (arrTurno || pausa != null) causa = 'arranque'
    else if (otros.length > 0) { causa = 'linea'; modo = 'a_la_vez' }
    else if (aplicaParo) causa = 'paro'
    else if (cadena.length > 0) { causa = 'linea'; modo = 'en_cadena' }
    else if (otra.length > 0) { causa = 'linea'; modo = 'tras_paro_otra' }

    return {
      m, k, seg: seg0,
      arranque: { aplica: arrTurno || pausa != null, pausa, ultimaLarga, ref, refEsProduccion: P.PROD && prim != null && ref === prim },
      linea: { otros, programadas },
      cadena, otra, otraFuera,
      paro: { aplica: aplicaParo, ultimo },
      causa, modo,
    }
  }

  const evaluaciones = new Map<Evento, Evaluacion>(micros.map((m) => [m, evaluar(m)]))

  // ── Lo que el globo muestra de cada micro ──────────────────────────────────

  const otraDe = (c: { fila: number; deltaMs: number; micro: boolean; s: number; razon: string | null }): OtraBaader =>
    ({ fila: c.fila, nombre: nom(c.fila), micro: c.micro, deltaS: Math.round(c.deltaMs / 1000), durS: c.s, razon: c.razon })

  const evidenciaDe = (x: Evaluacion): EvidenciaMicro => {
    const { m } = x
    if (x.causa === 'arranque') {
      /* Con las dos cosas a la vez (pasó poco desde la producción y desde una pausa) se dice la producción: así lo escribe `detalle()` del script. */
      if (x.arranque.pausa && !(x.arranque.ref != null && m.ini - x.arranque.ref < P.ARR)) {
        return { forma: 'arranque', origen: 'pausa', minutos: (m.ini - x.arranque.pausa.b) / 60_000, pausaS: (x.arranque.pausa.b - x.arranque.pausa.a) / 1000 }
      }
      return { forma: 'arranque', origen: x.arranque.refEsProduccion ? 'produccion' : 'inicio', minutos: (m.ini - (x.arranque.ref ?? m.ini)) / 60_000, pausaS: null }
    }
    if (x.modo === 'a_la_vez') return { forma: 'linea_a_la_vez', otras: x.linea.otros.map(otraDe).sort((a, b) => a.fila - b.fila) }
    if (x.causa === 'paro' && x.paro.ultimo) return { forma: 'paro', haceS: Math.round((m.ini - x.paro.ultimo.fin) / 1000), durS: x.paro.ultimo.s }
    if (x.modo === 'en_cadena') return { forma: 'linea_en_cadena', otras: x.cadena.map((c) => otraDe({ ...c, micro: true, razon: null })) }
    if (x.modo === 'tras_paro_otra') {
      /* La más cercana en el tiempo (la de menos segundos transcurridos), como `detalle()` del script. */
      const c = x.otra.reduce((a, b) => (b.haceMs < a.haceMs ? b : a))
      return { forma: 'linea_tras_paro_otra', nombre: nom(c.fila), razon: c.razon, durS: c.s, haceS: Math.round(c.haceMs / 1000) }
    }
    return { forma: 'sin' }
  }

  /** Las celdas de la tabla que prueban la causa (solo las que caen en las columnas k−2 … k+1). */
  const celdasDe = (x: Evaluacion): CeldaRef[] => {
    const dentro = (fila: number, d: number): CeldaRef[] => (d >= -2 && d <= 1 ? [{ fila, d: d as CeldaRef['d'] }] : [])
    if (x.modo === 'a_la_vez') return [{ fila: x.m.fila, d: 0 }, ...x.linea.otros.flatMap((c) => dentro(c.fila, c.d))]
    if (x.modo === 'en_cadena') return [{ fila: x.m.fila, d: 0 }, ...x.cadena.flatMap((c) => dentro(c.fila, c.d))]
    if (x.modo === 'tras_paro_otra') {
      const c = x.otra.reduce((a, b) => (b.haceMs < a.haceMs ? b : a))
      return dentro(c.fila, minutoDe(c.ini) - x.k)
    }
    return []
  }

  const explicar = (x: Evaluacion): Pick<MicroClasificada, 'evidencia' | 'celdas' | 'descartadas' | 'tabla'> => {
    const { m, k, causa } = x
    const nombre = nom(m.fila)
    const descartadas: ReglaDescartada[] = []
    const ventanaMin = P.ARR / 60_000
    const pausaMin = ARRANQUE_PARADA_MIN_S / 60

    // Las reglas que no aplicaron (✕ con su cifra). Una regla que se cumple pero pierde por orden de precedencia no es «descartada»: no se lista (sería falso).
    if (causa !== 'arranque' && !x.arranque.aplica) {
      descartadas.push({
        regla: 'arranque',
        titulo: tituloDescarte('arranque'),
        texto: textoDescarteArranque({
          nombre,
          ventanaMin,
          pausaMin,
          ultimaLargaHora: x.arranque.ultimaLarga ? hhmm(x.arranque.ultimaLarga.b) : null,
          produccionHora: x.arranque.refEsProduccion && x.arranque.ref != null ? hhmm(x.arranque.ref) : null,
          inicioHora: hayInicioTurno && x.arranque.ref != null && !x.arranque.refEsProduccion ? hhmm(x.arranque.ref) : null,
        }),
      })
    }
    /* «Otra Baader paró» no aplica si ninguna de sus tres formas se cumple (una que se cumple y pierde por orden no se lista). Con una sola Baader no existe. */
    if (n > 1 && x.linea.otros.length === 0 && x.cadena.length === 0 && x.otra.length === 0) {
      const f = x.otraFuera.length > 0 ? x.otraFuera.reduce((a, b) => (b.haceMs < a.haceMs ? b : a)) : null
      const prog = x.linea.programadas[0]
      descartadas.push({
        regla: 'linea',
        titulo: tituloDescarte('linea'),
        texto: textoDescarteLinea({
          fuera: f ? { nombre: nom(f.fila), haceS: Math.round(f.haceMs / 1000), razon: f.razon } : null,
          programada: prog ? { nombre: nom(prog.fila), razon: prog.razon } : null,
        }),
      })
    }
    if (causa !== 'paro' && !x.paro.aplica) {
      descartadas.push({
        regla: 'paro',
        titulo: tituloDescarte('paro'),
        texto: textoDescarteVolver({ nombre, haceMin: x.paro.ultimo ? (m.ini - x.paro.ultimo.fin) / 60_000 : null }),
      })
    }

    // La tabla: una fila por Baader, minutos k−2 … k+1.
    const microsDeK = (fila: number) => micros.filter((v) => v.fila === fila && minutoDe(v.ini) === k)
    /* ▽ (la detención PUDO empezar en k−1): la que explica el globo quedó anotada en los primeros 15 s del minuto k. Es la propia micro y, de las otras
       Baader, la micro o la detención no programada que empieza a ±15 s (las de `linea.otros`; una programada no explica nada). */
    const enInicio = (ms: number) => segundoDelMinuto(ms) < INICIO_MINUTO_S
    const filas: FilaGlobo[] = serie.maquinas.map((q, j) => {
      const enK = microsDeK(j)
      const propia = j === m.fila ? m : enK[0]
      return {
        id: q.id,
        nombre: nom(j),
        esperado: q.esperado,
        ella: j === m.fila,
        piezas: [k - 2, k - 1, k, k + 1].map((kk) => piezasEn(j, kk)),
        microEnK: propia ? evaluaciones.get(propia)?.causa ?? 'sin' : null,
        inicioPrevio: k >= 1 && (j === m.fila ? enInicio(m.ini) : x.linea.otros.some((c) => c.fila === j && c.d === 0 && enInicio(c.ini))),
      }
    })
    const tabla: TablaGlobo = {
      horas: [k - 2, k - 1, k, k + 1].map(horaMinuto),
      filas,
      leyendaInicio: filas.some((f) => f.inicioPrevio) ? TXT_GLOBO.leyendaInicio : null,
    }
    return { evidencia: evidenciaDe(x), celdas: celdasDe(x), descartadas, tabla }
  }

  return micros.map((m): MicroClasificada => {
    const q = serie.maquinas[m.fila]!
    const x = evaluaciones.get(m)!
    return {
      id: `${q.id}@${m.ini}`,
      maquinaId: q.id,
      fila: m.fila,
      nombre: q.nombre,
      inicioMs: m.ini,
      duracionS: Math.round((m.fin - m.ini) / 1000),
      causa: x.causa,
      modo: x.modo,
      forma: formaDe(x.causa, x.modo),
      minuto: x.k,
      ...explicar(x),
    }
  })
}
