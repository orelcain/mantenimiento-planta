/**
 * Causa PROBABLE de cada micro detención que llega con hora al monitor (la que se marca en «Ritmo en vivo»).
 *
 * Lógica PURA, sin React ni DOM. Todo sale de lo que el doc público ya trae: `pulse.serieMinuto` (piezas por minuto y
 * esperado de cada Baader) y `live.stopEvents` / `stopReasons` / `stopMachines` (cada parada con su máquina, inicio y
 * duración). No se publica nada nuevo ni se toca el backend.
 *
 * ⚠ Es «causa PROBABLE», nunca «causa»: son reglas de contexto (qué pasó justo antes, qué hicieron las otras Baader),
 * no un diagnóstico. El estudio de ARIA dice que 81-97 % de las micro no se pueden atribuir a nada (docs/
 * ESTUDIO_MICRODETENCIONES_CAUSAS_2026-10-29.md, §1): por eso la salida honesta por defecto es «sin contexto» y todo lo
 * demás se rotula «probable, no imputada; se confirma en terreno».
 *
 * Solo se clasifican las micro que llegan con hora: Shoplogix las registra en pasos de 15 s (0, 15 … 90 s) y las de 0 s
 * no se publican con hora (estudio, §1 «0 s y tiempo oculto»), así que no aparecen aquí.
 *
 * Precedencia (gana la primera, como en el estudio: «ARR → LIN → MAN → …»): arranque → línea común → tras detención →
 * carros vacíos → sin contexto.
 */
import { esMicroDetencion, etiquetaMaquina, paradasPorMaquina, segundosCubiertos, ANDANDO_MIN_S } from './ritmoVivo'

export type CausaMicro = 'arranque' | 'linea' | 'paro' | 'carros' | 'sin'

/** Orden de precedencia, que es también el orden de las chips del resumen. */
export const CAUSAS_MICRO: readonly CausaMicro[] = ['arranque', 'linea', 'paro', 'carros', 'sin']

export const ROTULO_CAUSA: Record<CausaMicro, string> = {
  arranque: 'Arranque',
  linea: 'Línea común',
  paro: 'Tras detención',
  carros: 'Carros vacíos',
  sin: 'Sin contexto',
}

// ── Las reglas (constantes con su porqué) ────────────────────────────────────

/**
 * Una parada de ESTA duración o más es una pausa (inicio de turno, reunión, colación…) y lo que sigue es un arranque.
 * Estudio, taxonomía ARR: tras una pausa larga hay más micro que al azar; en Chonchi la meseta del exceso está entre
 * 7 y 10 min, con 10 min de margen (ARR1).
 */
export const ARRANQUE_PARADA_MIN_S = 600
/** Cuánto dura el arranque después de esa pausa (y desde el inicio del turno): 10 min, el margen de Chonchi (estudio, ARR1). */
export const ARRANQUE_VENTANA_S = 600
/**
 * «Línea común»: otra Baader marca micro con inicio a ±15 s. Shoplogix registra las micro en pasos de 15 s: dos micro
 * del mismo paso (o contiguos) no son casualidad de una máquina, son de la línea (estudio, LIN-a/b: «misma tic de 15 s»).
 * Con una sola Baader (Filete) no aplica: no hay hermana con quién coincidir.
 */
export const LINEA_COMUN_TOL_S = 15
/**
 * «Tras detención»: hasta 2 min después del fin de una detención (no micro) de esa Baader. Estudio, MAN1: el pico de
 * 0 a 2 min tras una falla o ajuste es rearranque genérico, el de 2 a 10 min ya es difuso: se marca solo el pico.
 */
export const TRAS_DETENCION_S = 120
/**
 * «Carros vacíos»: el minuto cerrado anterior la Baader anduvo (≥ `ANDANDO_MIN_S`) y dio menos del 75 % de lo que
 * daba andando a su esperado. 0,75 es el mismo corte «bien» de Shoplogix (`tonoDe`): por debajo, esa Baader venía
 * cortada, o sea carros sin pieza (falta de pescado antes de la Baader).
 */
export const CARROS_BAJOS = 0.75
/** Lo que Shoplogix no ve de cada micro (estudio, «tiempo oculto»: 17-23 s por micro): real ≈ anotado + ~20 s. */
export const OCULTO_S = 20

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
  /** Inicio del turno (ms, wall-as-UTC): los primeros `ARRANQUE_VENTANA_S` s son arranque. */
  inicioTurnoMs: number
}

export interface RitmoAlrededor {
  /** Piezas por minuto del minuto anterior, el de la micro y el siguiente; null si ese minuto no existe en la serie. */
  anterior: number | null
  micro: number | null
  siguiente: number | null
  esperado: number | null
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
  /** Por qué se marcó así, en una frase. */
  porque: string
  /** Índice del minuto de la serie en que empezó. */
  minuto: number
  /** El ritmo de ESA Baader alrededor de la micro. */
  ritmo: RitmoAlrededor
  /** Las otras Baader en el minuto de la micro. */
  otras: Array<{ id: string; nombre: string; piezas: number | null; esperado: number | null }>
}

interface Evento { fila: number; ini: number; fin: number; micro: boolean }

/**
 * Clasifica cada micro con hora. Sin serie, sin `stopMachines` (el doc es anterior a que cada parada dijera de qué
 * máquina fue) o sin micro, devuelve `[]`: no se adivina la máquina.
 */
export function clasificarMicros(e: EntradaMicroCausa): MicroClasificada[] {
  const serie = e.serie
  const ids = e.stopMachines ?? []
  const eventosCrudos = e.stopEvents ?? []
  if (!serie || serie.maquinas.length === 0 || ids.length === 0) return []
  if (!eventosCrudos.every((x) => x.m != null && ids[x.m] != null)) return []
  const t0 = Date.parse(serie.desde)
  if (!Number.isFinite(t0)) return []

  const filaDe = new Map(serie.maquinas.map((q, i) => [q.id, i]))
  const eventos: Evento[] = []
  for (const x of eventosCrudos) {
    const fila = filaDe.get(ids[x.m!]!)
    const ini = Date.parse(x.f)
    if (fila == null || !Number.isFinite(ini) || !(x.s > 0)) continue
    eventos.push({ fila, ini, fin: ini + x.s * 1000, micro: esMicroDetencion(e.stopReasons?.[x.r]) })
  }
  const micros = eventos.filter((v) => v.micro).sort((a, b) => a.ini - b.ini)
  const paros = eventos.filter((v) => !v.micro)
  const unidas = paradasPorMaquina({ stopEvents: eventosCrudos, stopReasons: e.stopReasons, stopMachines: ids, enCurso: [] })
  const n = serie.maquinas.length

  /** Segundos de reloj que la Baader anduvo en el minuto k (60 − lo cubierto por cualquiera de sus paradas). */
  const andando = (fila: number, k: number) => {
    const ini = t0 + k * 60_000
    return 60 - segundosCubiertos(unidas.todas.get(serie.maquinas[fila]!.id), ini, ini + 60_000)
  }
  const piezasEn = (fila: number, k: number): number | null => (k >= 0 && k < (serie.maquinas[fila]!.cycles.length) ? serie.maquinas[fila]!.cycles[k] ?? 0 : null)
  const nom = (fila: number) => etiquetaMaquina(serie.maquinas[fila]!.nombre)

  const causaDe = (m: Evento, k: number): { causa: CausaMicro; porque: string } => {
    // 1 · Arranque: en los primeros 10 min del turno o hasta 10 min después del fin de una parada de 10 min o más de esa Baader.
    const tras = paros.find((p) => p.fila === m.fila && p.fin - p.ini >= ARRANQUE_PARADA_MIN_S * 1000 && m.ini >= p.fin && m.ini - p.fin < ARRANQUE_VENTANA_S * 1000)
    if (tras || m.ini - e.inicioTurnoMs < ARRANQUE_VENTANA_S * 1000) {
      return { causa: 'arranque', porque: tras ? 'dentro de los 10 min siguientes a una detención de 10 min o más de esta Baader' : 'dentro de los primeros 10 min del turno' }
    }
    // 2 · Línea común: otra Baader marcó micro con inicio a ±15 s.
    const otras = micros.filter((y) => y.fila !== m.fila && Math.abs(y.ini - m.ini) <= LINEA_COMUN_TOL_S * 1000)
    if (otras.length > 0) {
      const quienes = [...new Set(otras.map((y) => nom(y.fila)))].join(', ')
      return { causa: 'linea', porque: `otra Baader marcó micro en el mismo paso de 15 s (${quienes})` }
    }
    // 3 · Tras detención: hasta 2 min después del fin de una detención (no micro) de esa Baader.
    if (paros.some((p) => p.fila === m.fila && m.ini >= p.fin && m.ini - p.fin < TRAS_DETENCION_S * 1000)) {
      return { causa: 'paro', porque: 'dentro de los 2 min siguientes al fin de una detención de esta Baader' }
    }
    // 4 · Carros vacíos: el minuto cerrado anterior esta Baader anduvo pero dio menos del 75 % de lo que daba andando.
    const kA = k - 1
    const q = serie.maquinas[m.fila]!
    const anduvo = kA >= 0 ? andando(m.fila, kA) : 0
    const piezas = piezasEn(m.fila, kA)
    if (kA >= 0 && piezas != null && q.esperado != null && q.esperado > 0 && anduvo >= ANDANDO_MIN_S && piezas < CARROS_BAJOS * q.esperado * (anduvo / 60)) {
      const todas = n > 1 && serie.maquinas.every((o, j) => {
        const p = piezasEn(j, kA)
        return p != null && o.esperado != null && o.esperado > 0 && p < CARROS_BAJOS * o.esperado
      })
      const base = `el minuto anterior ${nom(m.fila)} dio ${piezas} de ${q.esperado} pz/min andando`
      return { causa: 'carros', porque: todas ? `${base}; ${n === 3 ? 'las tres' : 'todas las'} Baader venían bajas: falta de pescado en la línea` : base }
    }
    // 5 · Lo demás.
    return { causa: 'sin', porque: 'ningún contexto de Shoplogix la explica' }
  }

  return micros.map((m): MicroClasificada => {
    const q = serie.maquinas[m.fila]!
    const k = Math.floor((m.ini - t0) / 60_000)
    const { causa, porque } = causaDe(m, k)
    return {
      id: `${q.id}@${m.ini}`,
      maquinaId: q.id,
      fila: m.fila,
      nombre: q.nombre,
      inicioMs: m.ini,
      duracionS: Math.round((m.fin - m.ini) / 1000),
      causa,
      porque,
      minuto: k,
      ritmo: { anterior: piezasEn(m.fila, k - 1), micro: piezasEn(m.fila, k), siguiente: piezasEn(m.fila, k + 1), esperado: q.esperado },
      otras: serie.maquinas
        .map((o, j) => ({ id: o.id, nombre: o.nombre, piezas: piezasEn(j, k), esperado: o.esperado, j }))
        .filter((o) => o.j !== m.fila)
        .map(({ j: _j, ...o }) => o),
    }
  })
}

// ── Textos que usa el globo ──────────────────────────────────────────────────

/** «unos 35 s»: lo anotado más lo que Shoplogix no ve. */
export const realEstimadoS = (duracionS: number) => Math.round(duracionS) + OCULTO_S

/** Cuántas micro hay de cada causa, en el orden de `CAUSAS_MICRO`. */
export function contarPorCausa(micros: readonly MicroClasificada[]): Record<CausaMicro, number> {
  const out: Record<CausaMicro, number> = { arranque: 0, linea: 0, paro: 0, carros: 0, sin: 0 }
  for (const m of micros) out[m.causa]++
  return out
}
