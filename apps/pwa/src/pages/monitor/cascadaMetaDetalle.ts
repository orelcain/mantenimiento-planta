/**
 * El detalle de la cascada a la meta («Ver detalle» del tablero v2): por causa, por Baader y por hora. Lógica PURA, sin React.
 *
 * ── La regla que manda (la misma de `cascadaDetalle.ts`) ───────────────────────────────────────────
 * Cada lista REPARTE el total de su escalón; no lo recalcula. El total sale de `cascadaPorMeta` y los pesos, de los minutos
 * (segundos de la parada × la vara del minuto). Con `repartir` (resto mayor) cada lista suma exacto su escalón: lo que se
 * muestra cierra al entero.
 *
 *   · detenciones → causas (las de aguas arriba reparten `aguas`; las de Mantención y operación, el resto), Baader y hora.
 *   · micro       → Baader y hora.
 *   · vacíos      → Baader y hora. Peso del minuto = max(0, vara × andando/60 − ciclos), solo con ≥ `ANDANDO_MIN_S` s andando.
 *
 * Las reglas de los minutos son las de `calcularBaader`: ventana = minutos [0, n) desde `serie.desde`; sin razón, se ignora;
 * programada, se ignora; micro, va a micro; el resto, a detención. La línea suma solo las Baader que cuentan (con meta).
 */
import { ANDANDO_MIN_S, esMicroDetencion, varaEnMinuto, type MaquinaSerie, type ParadaDetalle } from './ritmoVivo'
import { esAguasArriba, esProgramada, type BaaderCascada, type CascadaArgs, type CascadaPorMeta, type PiezasVista } from './cascadaPerilla'
import { nombreCausa } from './desgloseVista'
import { repartir } from './cascadaDetalle'

const MS_MINUTO = 60_000
const horaDe = (ms: number) => (Number.isFinite(ms) ? new Date(ms).toISOString().slice(11, 13) : '--')

export type DuenoMeta = 'mantOp' | 'aguas'

export interface RenglonMeta {
  clave: string
  nombre: string
  piezas: number
  /** Dueño de la fila entera (vista por causa). */
  dueno?: DuenoMeta
  /** Reparto por dueño de `piezas` (suma `piezas`; sin ceros). */
  partes?: Partial<Record<DuenoMeta, number>>
  /** Minutos redondeados. */
  min?: number
  /** Paradas que tocan la ventana (vista por causa) o rachas (vista por Baader), según la lista. */
  veces?: number
  /** pz/min de la perilla (vista de vacíos por Baader). */
  vara?: number | null
}

export interface HoraMeta {
  /** «08», hora de planta. */
  hora: string
  piezas: number
  partes?: Partial<Record<DuenoMeta, number>>
  /** Minutos de esa hora que cubre la ventana, cuando no es la hora completa. */
  parcialMin?: number
}

export interface DetalleVistaMeta {
  detenciones: { causa: RenglonMeta[]; baader: RenglonMeta[] | null; hora: HoraMeta[] }
  micro: { baader: RenglonMeta[] | null; hora: HoraMeta[]; segundosPromedio: number | null }
  vacios: { baader: RenglonMeta[] | null; hora: HoraMeta[] }
}

export interface DetalleCascadaMeta {
  linea: DetalleVistaMeta
  /** El detalle de cada Baader por id (las sin meta llevan todo en cero). */
  porBaader: Record<string, DetalleVistaMeta>
}

/** «Evisceradora 1» → «Ev 1» (así lo nombra el encargo y el mockup). Copia de la de `CascadaTurnoCard`. */
export const etiquetaVista = (nombre: string): string => nombre.replace(/^Evisceradora\s*/i, 'Ev ')

/** Reparto que cierra exacto al total. Sin total o sin pesos positivos, todo en cero: nunca se rellena con otra cosa. */
function repartoDe(total: number, pesos: number[]): number[] {
  if (!(total > 0)) return pesos.map(() => 0)
  return repartir(total, pesos) ?? pesos.map(() => 0)
}

const porPiezas = (a: RenglonMeta, b: RenglonMeta) => b.piezas - a.piezas || a.nombre.localeCompare(b.nombre)

/** Partes por dueño de un renglón que ya trae sus piezas por Baader (exacto, sin reparto). */
function partesCascada(piezas: number, aguas: number): Partial<Record<DuenoMeta, number>> {
  const out: Partial<Record<DuenoMeta, number>> = {}
  if (piezas - aguas > 0) out.mantOp = piezas - aguas
  if (aguas > 0) out.aguas = aguas
  return out
}

/** Partes por dueño de las piezas de una hora: reparto de `piezas` por los pesos mantOp y aguas de esa hora. */
function partesHora(piezas: number, mant: number, aguas: number): Partial<Record<DuenoMeta, number>> {
  const r = repartoDe(piezas, [mant, aguas])
  const out: Partial<Record<DuenoMeta, number>> = {}
  if (r[0]! > 0) out.mantOp = r[0]
  if (r[1]! > 0) out.aguas = r[1]
  return out
}

/* ── Los minutos de cada Baader ─────────────────────────────────────────────────────────────────────── */

/** Una causa de detención: sus piezas sin repartir (peso), sus segundos y las paradas que la tocan. */
interface Causa {
  nombre: string
  dueno: DuenoMeta
  pz: number
  seg: number
  veces: number
}

/** Lo que pesa cada hora y cada causa, en la ventana de una Baader (o de la suma de varias). */
interface Minutos {
  causas: Map<string, Causa>
  detHora: Map<string, { pz: number; aguas: number; mant: number }>
  microHora: Map<string, number>
  vacHora: Map<string, number>
  microSeg: number
  microVeces: number
}

/** Hora de la ventana: clave «HH» y minutos que cubre la ventana en ella. */
interface Hora {
  hora: string
  min: number
}

function ventanaHoras(t0: number, n: number): Hora[] {
  const out: Hora[] = []
  for (let k = 0; k < n; k++) {
    const hora = horaDe(t0 + k * MS_MINUTO)
    const ultima = out[out.length - 1]
    if (ultima && ultima.hora === hora) ultima.min++
    else out.push({ hora, min: 1 })
  }
  return out
}

type Clase = { tipo: 'nada' } | { tipo: 'micro' } | { tipo: 'det'; nombre: string; dueno: DuenoMeta }

/** Igual que `calcularBaader`: sin razón o programada no pesa; micro va a micro; el resto, a detención con su dueño. */
function clasificar(razon: string | null): Clase {
  if (!razon) return { tipo: 'nada' }
  if (esProgramada(razon)) return { tipo: 'nada' }
  if (esMicroDetencion(razon)) return { tipo: 'micro' }
  return { tipo: 'det', nombre: nombreCausa(razon), dueno: esAguasArriba(razon) ? 'aguas' : 'mantOp' }
}

/** Los pesos de una Baader en su ventana: piezas a la vara de cada minuto, por causa, hora y clase. */
function acumularBaader(m: MaquinaSerie, args: CascadaArgs): Minutos {
  const { serie, n, paradas, perillas } = args
  const t0 = Date.parse(serie.desde)
  const vara = Array.from({ length: n }, (_, k) => varaEnMinuto(m, t0, k, perillas) ?? 0)
  const parada = Array.from({ length: n }, () => 0)
  const causas = new Map<string, Causa & { paradas: Set<ParadaDetalle> }>()
  const detHora = new Map<string, { pz: number; aguas: number; mant: number }>()
  const microHora = new Map<string, number>()
  const microParadas = new Set<ParadaDetalle>()
  let microSeg = 0

  for (const p of paradas.get(m.id) ?? []) {
    const kIni = Math.max(0, Math.floor((p.iniMs - t0) / MS_MINUTO))
    const kFin = Math.min(n - 1, Math.floor((Math.min(p.finMs, t0 + n * MS_MINUTO) - t0 - 1) / MS_MINUTO))
    const clase = clasificar(p.razon)
    for (let k = kIni; k <= kFin; k++) {
      const ini = t0 + k * MS_MINUTO
      const ov = (Math.min(p.finMs, ini + MS_MINUTO) - Math.max(p.iniMs, ini)) / 1000
      if (!(ov > 0)) continue
      parada[k]! += ov
      if (clase.tipo === 'nada') continue
      const pz = (ov / 60) * vara[k]!
      const hora = horaDe(ini)
      if (clase.tipo === 'micro') {
        microSeg += ov
        microParadas.add(p)
        microHora.set(hora, (microHora.get(hora) ?? 0) + pz)
        continue
      }
      const clave = `${clase.dueno}|${clase.nombre}`
      const c = causas.get(clave) ?? { nombre: clase.nombre, dueno: clase.dueno, pz: 0, seg: 0, veces: 0, paradas: new Set<ParadaDetalle>() }
      c.pz += pz
      c.seg += ov
      c.paradas.add(p)
      causas.set(clave, c)
      const h = detHora.get(hora) ?? { pz: 0, aguas: 0, mant: 0 }
      h.pz += pz
      if (clase.dueno === 'aguas') h.aguas += pz
      else h.mant += pz
      detHora.set(hora, h)
    }
  }

  /* Vacíos: andando (60 − segundos con parada) con su vara, menos lo que la Baader sí produjo en el minuto. Solo con ≥ 30 s andando. */
  const vacHora = new Map<string, number>()
  for (let k = 0; k < n; k++) {
    const andando = 60 - Math.min(60, parada[k]!)
    if (andando < ANDANDO_MIN_S) continue
    const peso = Math.max(0, (vara[k]! * andando) / 60 - (m.cycles[k] ?? 0))
    const hora = horaDe(t0 + k * MS_MINUTO)
    vacHora.set(hora, (vacHora.get(hora) ?? 0) + peso)
  }

  const causasSalida = new Map<string, Causa>()
  for (const [clave, c] of causas) causasSalida.set(clave, { nombre: c.nombre, dueno: c.dueno, pz: c.pz, seg: c.seg, veces: c.paradas.size })
  return { causas: causasSalida, detHora, microHora, vacHora, microSeg, microVeces: microParadas.size }
}

/** La suma de varias Baader (la línea): pesos sumados, paradas sumadas (cada una es de una sola Baader). */
function mezclar(lista: Minutos[]): Minutos {
  const out: Minutos = { causas: new Map(), detHora: new Map(), microHora: new Map(), vacHora: new Map(), microSeg: 0, microVeces: 0 }
  for (const m of lista) {
    for (const [clave, c] of m.causas) {
      const o = out.causas.get(clave) ?? { nombre: c.nombre, dueno: c.dueno, pz: 0, seg: 0, veces: 0 }
      o.pz += c.pz
      o.seg += c.seg
      o.veces += c.veces
      out.causas.set(clave, o)
    }
    for (const [hora, d] of m.detHora) {
      const o = out.detHora.get(hora) ?? { pz: 0, aguas: 0, mant: 0 }
      o.pz += d.pz
      o.aguas += d.aguas
      o.mant += d.mant
      out.detHora.set(hora, o)
    }
    for (const [hora, pz] of m.microHora) out.microHora.set(hora, (out.microHora.get(hora) ?? 0) + pz)
    for (const [hora, peso] of m.vacHora) out.vacHora.set(hora, (out.vacHora.get(hora) ?? 0) + peso)
    out.microSeg += m.microSeg
    out.microVeces += m.microVeces
  }
  return out
}

/* ── Las listas (cada una reparte su escalón de `cascada`) ─────────────────────────────────────────── */

/** Causas por dueño: las de aguas arriba reparten `aguas`; las de Mantención y operación, `piezas − aguas`. */
function listaCausas(causas: Map<string, Causa>, aguas: number, mantOp: number): RenglonMeta[] {
  const todas = [...causas.values()]
  const out: RenglonMeta[] = []
  for (const [dueno, total] of [['aguas', aguas], ['mantOp', mantOp]] as const) {
    const grupo = todas.filter((c) => c.dueno === dueno)
    const r = repartoDe(total, grupo.map((c) => c.pz))
    grupo.forEach((c, i) => {
      if (r[i]! > 0) out.push({ clave: `${dueno}|${c.nombre}`, nombre: c.nombre, piezas: r[i]!, dueno, min: Math.round(c.seg / 60), veces: c.veces })
    })
  }
  return out.sort(porPiezas)
}

function horasDetencion(ventana: Hora[], det: Map<string, { pz: number; aguas: number; mant: number }>, total: number): HoraMeta[] {
  const r = repartoDe(total, ventana.map((h) => det.get(h.hora)?.pz ?? 0))
  return ventana.map((h, i) => {
    const d = det.get(h.hora)
    return { hora: h.hora, piezas: r[i]!, partes: partesHora(r[i]!, d?.mant ?? 0, d?.aguas ?? 0), ...(h.min < 60 ? { parcialMin: h.min } : {}) }
  })
}

function horasSimples(ventana: Hora[], pesos: Map<string, number>, total: number): HoraMeta[] {
  const r = repartoDe(total, ventana.map((h) => pesos.get(h.hora) ?? 0))
  return ventana.map((h, i) => ({ hora: h.hora, piezas: r[i]!, ...(h.min < 60 ? { parcialMin: h.min } : {}) }))
}

/** Las listas por Baader de la línea (solo las que cuentan). Cifras exactas de `cascada.baaders`. */
interface ListasBaader {
  det: RenglonMeta[]
  micro: RenglonMeta[]
  vac: RenglonMeta[]
}

function listasBaader(bs: BaaderCascada[]): ListasBaader {
  return {
    det: bs
      .filter((b) => b.detenciones.piezas > 0)
      .map((b) => ({
        clave: b.id,
        nombre: etiquetaVista(b.nombre),
        piezas: b.detenciones.piezas,
        partes: partesCascada(b.detenciones.piezas, b.detenciones.aguas),
        min: Math.round(b.detenciones.min),
        veces: b.detenciones.veces,
      }))
      .sort(porPiezas),
    micro: bs
      .filter((b) => b.micro.piezas > 0)
      .map((b) => ({
        clave: b.id,
        nombre: etiquetaVista(b.nombre),
        piezas: b.micro.piezas,
        partes: partesCascada(b.micro.piezas, b.micro.aguas),
        min: Math.round(b.micro.min),
        veces: b.micro.veces,
      }))
      .sort(porPiezas),
    vac: bs
      .filter((b) => b.vacios > 0)
      .map((b) => ({ clave: b.id, nombre: etiquetaVista(b.nombre), piezas: b.vacios, vara: b.vara }))
      .sort(porPiezas),
  }
}

/** Una vista (la línea o una Baader): sus escalones de `piezas` y sus pesos de `min`. Las listas por Baader, solo en la línea. */
function vistaMeta(piezas: PiezasVista, min: Minutos, ventana: Hora[], listas: ListasBaader | null): DetalleVistaMeta {
  return {
    detenciones: {
      causa: listaCausas(min.causas, piezas.detenciones.aguas, piezas.detenciones.piezas - piezas.detenciones.aguas),
      baader: listas?.det ?? null,
      hora: horasDetencion(ventana, min.detHora, piezas.detenciones.piezas),
    },
    micro: {
      baader: listas?.micro ?? null,
      hora: horasSimples(ventana, min.microHora, piezas.micro.piezas),
      segundosPromedio: min.microVeces > 0 ? min.microSeg / min.microVeces : null,
    },
    vacios: {
      baader: listas?.vac ?? null,
      hora: horasSimples(ventana, min.vacHora, piezas.vacios),
    },
  }
}

/**
 * El detalle de la cascada a la meta. `cascada` debe salir de los MISMOS `args` (mismas paradas, serie y perillas): el detalle
 * reparte sus escalones y no los recalcula. La línea suma solo las Baader con meta; las listas por Baader existen solo en la
 * línea y con más de una Baader que cuenta.
 */
export function detalleCascadaMeta(args: CascadaArgs, cascada: CascadaPorMeta): DetalleCascadaMeta {
  const t0 = Date.parse(args.serie.desde)
  const ventana = ventanaHoras(t0, args.n)
  const porId = new Map(args.serie.maquinas.map((m) => [m.id, m]))
  const minutos = new Map<string, Minutos>()
  for (const b of cascada.baaders) {
    const m = porId.get(b.id)
    minutos.set(b.id, m ? acumularBaader(m, args) : mezclar([]))
  }

  const cuentan = cascada.baaders.filter((b) => !b.sinMeta)
  const minLinea = mezclar(cuentan.map((b) => minutos.get(b.id) ?? mezclar([])))
  const listas = cuentan.length > 1 ? listasBaader(cuentan) : null

  const porBaader: Record<string, DetalleVistaMeta> = {}
  for (const b of cascada.baaders) porBaader[b.id] = vistaMeta(b, minutos.get(b.id) ?? mezclar([]), ventana, null)
  return { linea: vistaMeta(cascada.linea, minLinea, ventana, listas), porBaader }
}
