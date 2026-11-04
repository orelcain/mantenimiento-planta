/**
 * cascadaPerilla.ts — la cascada de piezas «a la meta» y la partición del rendimiento con la perilla (Fase B, núcleo sin UI).
 *
 * Lógica PURA. La fuente de verdad del cálculo es el script del mockup de la Fase B (04-11, `mockup_b.html`); aquí se replica
 * minuto a minuto. La UI (`CascadaTurnoCard`) la conecta B-2; esta función no sabe de pantallas.
 *
 * La cascada parte de la meta de Shoplogix de cada Baader:
 *   podía a la meta → − perilla más lenta que la meta → podía con la perilla → − detenciones → − micro → − vacíos → hizo.
 * Desde el escalón de la perilla todo se mide a la vara de la perilla. Cada vista (línea o Baader) cuadra sola al entero.
 *
 * Reglas (las del mockup):
 *  · Tiempo de producción = turno − detención programada (colación, reunión de inicio y ejercicio compensatorio). Línea = promedio.
 *  · Perilla más lenta = (meta − vara)+ × minutos andando, contando solo los minutos con ≥ 30 s andando (`ANDANDO_MIN_S`).
 *  · Detenciones y micro: minutos a la vara del minuto. «Veces» = rachas de minutos seguidos con la misma razón. Línea = suma.
 *  · Vacíos = lo que falta para cuadrar, con piso en 0.
 *  · La detención sin razón cuenta como minutos andando menos, pero no entra en detenciones, micro ni programada (igual que el mockup).
 */
import { ANDANDO_MIN_S, esMicroDetencion, normalizar, varaEnMinuto, type MaquinaSerie, type ParadaDetalle, type TipoParada } from './ritmoVivo'
import { perillaVigenteEn, type PerillasDeLinea } from './perilla'
import { matchImputacion } from '@/services/shoplogix/imputacionTaxonomy'
/* Las causas programadas, normalizadas. Es el MISMO archivo que lee `esParoPlanificado` en `functions/publicMonitor.js`:
   vive en `functions/` porque el deploy de Functions solo sube esa carpeta. */
import CAUSAS_PROGRAMADAS from '../../../../../functions/lib/causasProgramadas.json'

/** Exportada solo para que la prueba de paridad confirme que es el JSON y no una copia. */
export { CAUSAS_PROGRAMADAS }

const MS_MINUTO = 60_000

/**
 * ¿La razón es detención programada (la que se descuenta del turno para dar el tiempo de producción)? Es la MISMA regla que
 * `esParoPlanificado` en `functions/publicMonitor.js`: texto normalizado, espacios internos colapsados y `includes` de alguna
 * causa programada. Así «EJERCICIO  COMPENSATORIO» (dos espacios, como lo manda Shoplogix) cuenta igual que en el backend.
 * `DesglosePiezas` (A2) lo usa también para que el «sin la detención programada» cuadre con la cascada.
 * Paridad: `functions/__tests__/fixtures/causasProgramadas.casos.json` la corren `programadaParidad.test.ts` (aquí) y
 * `functions/__tests__/programadaParidad.test.js` (servidor); si las dos reglas se separan, falla una de las dos.
 */
export const esProgramada = (razon: string | null | undefined): boolean => {
  const r = normalizar(razon).replace(/\s+/g, ' ')
  return r !== '' && CAUSAS_PROGRAMADAS.some((c) => r.includes(c))
}

/**
 * El tipo de una parada en el desglose de «Ver detalle». `paradasDetalle` marca como `programada` todo lo que el legado
 * (`classifyLossState`) llama planificado, incluida la limpieza de ducto. Aquí solo es programada lo que `esProgramada`;
 * lo demás sigue su tipo (micro u otra detención).
 */
export const tipoParaDesglose = (p: { tipo: TipoParada; razon: string | null }): TipoParada =>
  p.tipo === 'programada' && !esProgramada(p.razon) ? 'detencion' : p.tipo

/** «Evisceradora 1» → «Ev 1» (así lo nombra el encargo y el mockup). La usan la tarjeta de la cascada y el detalle de la meta. */
export const etiquetaVista = (nombre: string): string => nombre.replace(/^Evisceradora\s*/i, 'Ev ')

/**
 * Dueño «aguas arriba»: SOLO el flujo de pescado que frena la línea antes de las Baader. Son la falta de MMPP y el
 * abastecimiento (categorías `mmpp` y `abastecimiento` del árbol), el acopio, el bombeo y la limpieza de ducto (por texto).
 * Lo demás de `externo` (ajuste del operador, cambio de lote, cumplimiento de cuota…) es de Mantención y operación.
 * Se decide AQUÍ y no en `imputacionTaxonomy`: cambiar la taxonomía movería cifras de otras pantallas.
 */
const AGUAS_ARRIBA_TEXTO = /\b(DUCTO|ACOPIO|BOMBEO)\b/
const CATEGORIAS_AGUAS_ARRIBA = new Set(['mmpp', 'abastecimiento'])
export const esAguasArriba = (razon: string | null | undefined): boolean => {
  if (AGUAS_ARRIBA_TEXTO.test(normalizar(razon).toUpperCase())) return true
  const categorias = matchImputacion(razon).leaf?.categorias ?? []
  return categorias.some((c) => CATEGORIAS_AGUAS_ARRIBA.has(c))
}

export interface CascadaArgs {
  serie: { desde: string; maquinas: MaquinaSerie[] }
  /** Minutos del turno (455 en el turno noche de Chonchi del 03-11). */
  n: number
  /** Detenciones de cada Baader (`paradasDetalle`), por id de máquina. */
  paradas: Map<string, ParadaDetalle[]>
  /** Perillas de la línea. Sin ellas la vara de cada minuto es la meta de Shoplogix y la perilla no resta. */
  perillas?: PerillasDeLinea | null
}

/** Una vista de la cascada (la línea o una Baader), en piezas y minutos enteros que cuadran. */
export interface PiezasVista {
  /** Tiempo de producción en minutos (turno − programada). En la línea, el promedio de las Baader. */
  minProduccion: number
  minProgramada: number
  /** Podía hacer a la meta de Shoplogix. */
  podia: number
  /** Perilla más lenta que la meta. */
  perilla: number
  /** Podía hacer con la perilla. */
  podiaConPerilla: number
  /** `aguas` = la parte de `piezas` que es aguas arriba (por Baader ya redondeada; la línea suma). */
  detenciones: { min: number; veces: number; piezas: number; aguas: number }
  micro: { min: number; veces: number; piezas: number; aguas: number }
  vacios: number
  hizo: number
  /** Lo que no se hizo: podía − hizo (la suma de perilla, detenciones, micro y vacíos cuando `cuadra`). */
  perdido: number
  /** La partición del rendimiento de ESTA vista (minutos andando × meta): la fila «Al rendimiento le faltan». */
  rendimiento: RendimientoPartido
  /** podía − perilla − detenciones − micro − vacíos = hizo. */
  cuadra: boolean
  /**
   * Dueños de lo que no se hizo: podía − hizo = mantOp + aguas + produccion (cuando `cuadra`). Producción = la perilla;
   * aguas arriba = vacíos + detenciones y micro de acopio, bombeo, ducto o `externo`; el resto, Mantención y operación.
   */
  duenos: { mantOp: number; aguas: number; produccion: number }
}

export interface BaaderCascada extends PiezasVista {
  id: string
  nombre: string
  /** Meta de Shoplogix en pz/min. */
  meta: number
  /** Vara vigente al final del turno (pz/min), la misma que usa el desglose. Sin perilla, es la meta de Shoplogix. */
  vara: number | null
  /** Motivo de la perilla vigente al final del turno («por el Knuro»). null si no hay perilla o no tiene motivo. */
  motivo: string | null
  /** Hay una perilla anotada vigente al final del turno (aunque su vara sea igual a la meta). */
  conPerilla: boolean
  /**
   * La Baader no tiene meta de Shoplogix usable (null o ≤ 0). NO entra en la cascada de la línea; su vista lleva solo el aviso y
   * sus cifras van en cero, para que nadie las lea como si fueran suyas.
   */
  sinMeta: boolean
}

export interface CascadaPorMeta {
  linea: PiezasVista
  baaders: BaaderCascada[]
}

export interface RendimientoPartido {
  /** Piezas de referencia: meta × minutos andando de todo el turno (la base del rendimiento). */
  expMeta: number
  hizo: number
  /** Fracción 0–1 (hizo / expMeta). */
  rendimiento: number
  /** Puntos del rendimiento que faltan para 100. */
  ptsFalta: number
  /** Puntos que se van en la perilla más lenta. */
  ptsPerilla: number
  /** Puntos que faltaron para llegar a la perilla: lo que falta del rendimiento menos la perilla (`ptsFalta − ptsPerilla`). */
  ptsFaltoPerilla: number
  piezasPerilla: number
  /** Piezas de los vacíos de la cascada de esa vista: lo que de verdad falta para llegar a la perilla. Los pts no cambian, así que pueden diferir de estas piezas en unas pocas. */
  piezasFaltoPerilla: number
}

interface Calculo {
  id: string
  nombre: string
  meta: number
  prodMin: number
  progMin: number
  cap: number
  per: number
  daba: number
  det: number
  micro: number
  /** La parte de det y micro que es aguas arriba (el resto es de Mantención y operación). */
  detAg: number
  microAg: number
  vac: number
  hizo: number
  minDet: number
  vDet: number
  minMicro: number
  vMicro: number
  andTodo: number
  expMeta: number
  /** Perilla vigente al final del turno; null si la Baader no tiene meta. */
  vara: number | null
  /** Motivo de esa misma perilla (el instante es el del `vara`); null si no hay perilla o no tiene motivo. */
  motivo: string | null
  /** Hay perilla anotada vigente al final del turno (el mismo instante que `vara` y `motivo`). */
  conPerilla: boolean
}

/** Minutos del turno de una Baader con sus segundos por clase. Una pasada por las paradas; después, todo sale por minuto. */
function calcularBaader(m: MaquinaSerie, args: CascadaArgs): Calculo {
  const { serie, n, paradas, perillas } = args
  const t0 = Date.parse(serie.desde)
  const meta = m.esperado ?? 0
  const segundos = Array.from({ length: n }, () => ({ parada: 0, prog: 0, micro: 0, det: 0, microAg: 0, detAg: 0, claves: new Set<string>() }))

  for (const p of paradas.get(m.id) ?? []) {
    const kIni = Math.max(0, Math.floor((p.iniMs - t0) / MS_MINUTO))
    const kFin = Math.min(n - 1, Math.floor((Math.min(p.finMs, t0 + n * MS_MINUTO) - t0 - 1) / MS_MINUTO))
    for (let k = kIni; k <= kFin; k++) {
      const ini = t0 + k * MS_MINUTO
      const ov = (Math.min(p.finMs, ini + MS_MINUTO) - Math.max(p.iniMs, ini)) / 1000
      if (!(ov > 0)) continue
      const s = segundos[k]!
      s.parada += ov
      if (!p.razon) continue
      const razon = normalizar(p.razon)
      if (esProgramada(p.razon)) {
        s.prog += ov
        continue
      }
      const micro = esMicroDetencion(p.razon)
      const aguas = esAguasArriba(p.razon)
      if (micro) {
        s.micro += ov
        if (aguas) s.microAg += ov
      } else {
        s.det += ov
        if (aguas) s.detAg += ov
      }
      s.claves.add(`${micro ? 'micro' : 'det'}|${razon}`)
    }
  }

  let progSeg = 0
  let detSeg = 0
  let microSeg = 0
  let andTodo = 0
  let perdidaPer = 0
  let det = 0
  let micro = 0
  let detAgSeg = 0
  let microAgSeg = 0
  let hizo = 0
  let vDet = 0
  let vMicro = 0
  let previas = new Set<string>()
  for (let k = 0; k < n; k++) {
    const s = segundos[k]!
    const andando = 60 - Math.min(60, s.parada)
    const vara = varaEnMinuto(m, t0, k, perillas) ?? 0
    progSeg += s.prog
    detSeg += s.det
    microSeg += s.micro
    andTodo += andando / 60
    if (andando >= ANDANDO_MIN_S) perdidaPer += Math.max(0, meta - vara) * (andando / 60)
    det += (s.det / 60) * vara
    micro += (s.micro / 60) * vara
    detAgSeg += (s.detAg / 60) * vara
    microAgSeg += (s.microAg / 60) * vara
    hizo += m.cycles[k] ?? 0
    for (const c of s.claves) {
      if (previas.has(c)) continue
      if (c.startsWith('micro|')) vMicro++
      else vDet++
    }
    previas = s.claves
  }

  const prodMin = n - progSeg / 60
  const cap = Math.round(prodMin * meta)
  const per = Math.round(perdidaPer)
  const daba = cap - per
  const pzDet = Math.round(det)
  const pzMicro = Math.round(micro)
  /* La parte aguas arriba se redondea aparte y el resto es la diferencia: así el total de cada escalón no cambia. */
  const pzDetAg = Math.round(detAgSeg)
  const pzMicroAg = Math.round(microAgSeg)
  const vac = Math.max(0, daba - pzDet - pzMicro - hizo)
  return {
    id: m.id,
    nombre: m.nombre,
    meta,
    prodMin,
    progMin: progSeg / 60,
    cap,
    per,
    daba,
    det: pzDet,
    micro: pzMicro,
    detAg: pzDetAg,
    microAg: pzMicroAg,
    vac,
    hizo,
    minDet: detSeg / 60,
    vDet,
    minMicro: microSeg / 60,
    vMicro,
    andTodo,
    expMeta: meta * andTodo,
    vara: varaEnMinuto(m, t0, n - 1, perillas),
    motivo: perillaVigenteEn(perillas, m.id, t0 + (n - 1) * MS_MINUTO)?.motivo ?? null,
    conPerilla: perillaVigenteEn(perillas, m.id, t0 + (n - 1) * MS_MINUTO) != null,
  }
}

function calcularTodo(args: CascadaArgs): Calculo[] {
  return args.serie.maquinas.map((m) => calcularBaader(m, args))
}

/** Una Baader entra en la cuenta solo con una meta de Shoplogix usable (> 0). Sin ella no hay «podía», ni vara, ni cuadre. */
const tieneMeta = (c: Calculo): boolean => c.meta > 0

/**
 * Los minutos del turno que cuenta la cascada: el largo de la serie, cortado en el fin del turno. El fin es el menor entre
 * `plannedEnd` y, con el turno cerrado, `effectiveEnd`. Sin ningún fin conocido, vale el largo de la serie. Solo cuentan los
 * minutos completos antes del fin: así el tiempo del turno no sigue el reloj cuando la serie ya trae minutos de después del cierre.
 */
export function minutosDelTurno(args: {
  desde: string
  largo: number
  plannedEnd?: string | null
  effectiveEnd?: string | null
  shiftClosed?: boolean
}): number {
  const t0 = Date.parse(args.desde)
  const fines = [args.plannedEnd, args.shiftClosed ? args.effectiveEnd : null]
    .map((x) => (x ? Date.parse(x) : NaN))
    .filter((ms) => Number.isFinite(ms))
  if (!fines.length || !Number.isFinite(t0)) return args.largo
  return Math.max(0, Math.min(args.largo, Math.floor((Math.min(...fines) - t0) / MS_MINUTO)))
}

const sumar = (lista: Calculo[], k: keyof Calculo) => lista.reduce((a, c) => a + (c[k] as number), 0)

/** La partición del rendimiento de una lista de Baader (una o todas): hizo / (meta × minutos andando). */
function rendimientoDe(lista: Calculo[]): RendimientoPartido {
  const expMeta = sumar(lista, 'expMeta')
  const hizo = sumar(lista, 'hizo')
  const piezasPerilla = sumar(lista, 'per')
  const rendimiento = expMeta > 0 ? hizo / expMeta : 0
  const ptsFalta = 100 - rendimiento * 100
  const ptsPerilla = expMeta > 0 ? (piezasPerilla / expMeta) * 100 : 0
  const ptsFaltoPerilla = ptsFalta - ptsPerilla
  return {
    expMeta,
    hizo,
    rendimiento,
    ptsFalta,
    ptsPerilla,
    ptsFaltoPerilla,
    piezasPerilla,
    piezasFaltoPerilla: sumar(lista, 'vac'),
  }
}

/** Una vista (línea o Baader) a partir de los cálculos de sus Baader. La línea suma; el tiempo de producción promedia. */
function vistaDe(lista: Calculo[]): PiezasVista {
  const N = lista.length || 1
  const cap = sumar(lista, 'cap')
  const per = sumar(lista, 'per')
  const det = sumar(lista, 'det')
  const micro = sumar(lista, 'micro')
  const vac = sumar(lista, 'vac')
  const hizo = sumar(lista, 'hizo')
  const detAg = sumar(lista, 'detAg')
  const microAg = sumar(lista, 'microAg')
  return {
    minProduccion: sumar(lista, 'prodMin') / N,
    minProgramada: sumar(lista, 'progMin') / N,
    podia: cap,
    perilla: per,
    podiaConPerilla: sumar(lista, 'daba'),
    detenciones: { min: sumar(lista, 'minDet'), veces: sumar(lista, 'vDet'), piezas: det, aguas: detAg },
    micro: { min: sumar(lista, 'minMicro'), veces: sumar(lista, 'vMicro'), piezas: micro, aguas: microAg },
    vacios: vac,
    hizo,
    perdido: cap - hizo,
    rendimiento: rendimientoDe(lista),
    cuadra: cap - per - det - micro - vac === hizo,
    duenos: {
      mantOp: det - detAg + (micro - microAg),
      aguas: vac + detAg + microAg,
      produccion: per,
    },
  }
}

/**
 * La cascada por meta: la línea (suma de las Baader) y cada Baader por separado. Cada vista cuadra sola: podía − perilla −
 * detenciones − micro − vacíos = hizo. Los vacíos son el resto, con piso en 0; `cuadra` avisa si el piso lo tuvo que tapar.
 */
export function cascadaPorMeta(args: CascadaArgs): CascadaPorMeta {
  const calc = calcularTodo(args)
  const usables = calc.filter(tieneMeta)
  return {
    linea: vistaDe(usables),
    baaders: calc.map((c) => ({
      id: c.id,
      nombre: c.nombre,
      meta: c.meta,
      vara: c.vara,
      motivo: c.motivo,
      conPerilla: c.conPerilla,
      sinMeta: !tieneMeta(c),
      ...vistaDe(tieneMeta(c) ? [c] : []),
    })),
  }
}

/**
 * La partición del rendimiento: hizo / (meta × minutos andando). Solo cuentan los minutos andando, así que su base no es el
 * tiempo de producción de la cascada. En puntos, la perilla y lo que faltó para llegar a ella suman el rendimiento que falta.
 * En piezas, lo que faltó son los vacíos de la cascada (`piezasFaltoPerilla`): pueden diferir de los puntos en unas pocas.
 */
export function rendimientoPartido(args: CascadaArgs): RendimientoPartido {
  return rendimientoDe(calcularTodo(args).filter(tieneMeta))
}
