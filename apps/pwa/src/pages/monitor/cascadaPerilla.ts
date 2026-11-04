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
import { ANDANDO_MIN_S, esMicroDetencion, normalizar, varaEnMinuto, type MaquinaSerie, type ParadaDetalle } from './ritmoVivo'
import type { PerillasDeLinea } from './perilla'

/* Lo que el mockup cuenta como programado: colación, reunión de inicio de turno y ejercicio compensatorio. Va normalizado. */
const PROGRAMADAS = new Set(['colacion', 'reunion inicio turno', 'ejercicio compensatorio - paro'])
const MS_MINUTO = 60_000

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
  detenciones: { min: number; veces: number }
  micro: { min: number; veces: number }
  vacios: number
  hizo: number
  /** podía − perilla − detenciones − micro − vacíos = hizo. */
  cuadra: boolean
}

export interface BaaderCascada extends PiezasVista {
  id: string
  nombre: string
  /** Meta de Shoplogix en pz/min. */
  meta: number
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
  /** Puntos que faltaron para llegar a la perilla (vacíos y micro). */
  ptsFaltoPerilla: number
  piezasPerilla: number
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
  vac: number
  hizo: number
  minDet: number
  vDet: number
  minMicro: number
  vMicro: number
  andTodo: number
  expMeta: number
}

/** Minutos del turno de una Baader con sus segundos por clase. Una pasada por las paradas; después, todo sale por minuto. */
function calcularBaader(m: MaquinaSerie, args: CascadaArgs): Calculo {
  const { serie, n, paradas, perillas } = args
  const t0 = Date.parse(serie.desde)
  const meta = m.esperado ?? 0
  const segundos = Array.from({ length: n }, () => ({ parada: 0, prog: 0, micro: 0, det: 0, claves: new Set<string>() }))

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
      if (PROGRAMADAS.has(razon)) {
        s.prog += ov
        continue
      }
      const micro = esMicroDetencion(p.razon)
      if (micro) s.micro += ov
      else s.det += ov
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
    vac,
    hizo,
    minDet: detSeg / 60,
    vDet,
    minMicro: microSeg / 60,
    vMicro,
    andTodo,
    expMeta: meta * andTodo,
  }
}

function calcularTodo(args: CascadaArgs): Calculo[] {
  return args.serie.maquinas.map((m) => calcularBaader(m, args))
}

const sumar = (lista: Calculo[], k: keyof Calculo) => lista.reduce((a, c) => a + (c[k] as number), 0)

/** Una vista (línea o Baader) a partir de los cálculos de sus Baader. La línea suma; el tiempo de producción promedia. */
function vistaDe(lista: Calculo[]): PiezasVista {
  const N = lista.length || 1
  const cap = sumar(lista, 'cap')
  const per = sumar(lista, 'per')
  const det = sumar(lista, 'det')
  const micro = sumar(lista, 'micro')
  const vac = sumar(lista, 'vac')
  const hizo = sumar(lista, 'hizo')
  return {
    minProduccion: sumar(lista, 'prodMin') / N,
    minProgramada: sumar(lista, 'progMin') / N,
    podia: cap,
    perilla: per,
    podiaConPerilla: sumar(lista, 'daba'),
    detenciones: { min: sumar(lista, 'minDet'), veces: sumar(lista, 'vDet') },
    micro: { min: sumar(lista, 'minMicro'), veces: sumar(lista, 'vMicro') },
    vacios: vac,
    hizo,
    cuadra: cap - per - det - micro - vac === hizo,
  }
}

/**
 * La cascada por meta: la línea (suma de las Baader) y cada Baader por separado. Cada vista cuadra sola: podía − perilla −
 * detenciones − micro − vacíos = hizo. Los vacíos son el resto, con piso en 0; `cuadra` avisa si el piso lo tuvo que tapar.
 */
export function cascadaPorMeta(args: CascadaArgs): CascadaPorMeta {
  const calc = calcularTodo(args)
  return {
    linea: vistaDe(calc),
    baaders: calc.map((c) => ({
      id: c.id,
      nombre: c.nombre,
      meta: c.meta,
      ...vistaDe([c]),
    })),
  }
}

/**
 * La partición del rendimiento: hizo / (meta × minutos andando). Solo cuentan los minutos andando, por eso sus piezas no son
 * las de la cascada (que usa todo el tiempo de producción). La perilla y lo que faltó para llegar a ella suman exacto al
 * rendimiento que falta.
 */
export function rendimientoPartido(args: CascadaArgs): RendimientoPartido {
  const calc = calcularTodo(args)
  const expMeta = sumar(calc, 'expMeta')
  const hizo = sumar(calc, 'hizo')
  const piezasPerilla = sumar(calc, 'per')
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
    piezasFaltoPerilla: Math.round((expMeta * ptsFaltoPerilla) / 100),
  }
}
