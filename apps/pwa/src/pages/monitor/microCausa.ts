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
 * ritmo bajo → sin contexto. Reglas finales validadas con 5 turnos de Chonchi (262 micro: 26 · 52 · 3 · 34 · 147).
 *
 * Además de la causa, cada micro trae lo que el globo muestra: las razones que la respaldan (con la celda de la tabla que
 * las prueba), las reglas que NO aplicaron (con su cifra) y la tabla por Baader. Toda cifra sale del doc: aquí no se
 * escribe ninguna a mano ni se redondea distinto entre el texto y la tabla.
 *
 * Lo que el usuario lee no dice POR QUÉ cayó el conteo (el sensor solo cuenta lo que pasa) ni usa el nombre de un estado oficial
 * de Shoplogix que se lee como falla de la máquina, o sea de Mantención: en Chonchi la Baader gira a ritmo fijo y lo que cambia
 * es cuántos pescados cuenta el sensor. «Ritmo bajo» describe el número, no la causa.
 */
import { matchImputacion } from '@/services/shoplogix/imputacionTaxonomy'
import { dec1 } from '@/utils/formatoNumeros'
import { esMicroDetencion, etiquetaMaquina, paradasPorMaquina, segundosCubiertos, unir, ANDANDO_MIN_S, type Intervalo } from './ritmoVivo'

export type CausaMicro = 'arranque' | 'linea' | 'paro' | 'ritmo' | 'sin'

/** Orden de precedencia, que es también el orden de las chips del resumen. */
export const CAUSAS_MICRO: readonly CausaMicro[] = ['arranque', 'linea', 'paro', 'ritmo', 'sin']

export const ROTULO_CAUSA: Record<CausaMicro, string> = {
  arranque: 'Arranque',
  linea: 'Línea común',
  paro: 'Tras detención',
  ritmo: 'Ritmo bajo',
  sin: 'Sin contexto',
}

/**
 * El color de cada causa probable de una micro (marcas ▼ del gráfico, cuadros de las chips y del globo): solo tokens `--v2-*` de
 * monitorGlass.css, que existen en claro y en oscuro. Las marcas y los cuadros van a ≥ 3:1 contra la tarjeta: «Ritmo bajo» y «Sin contexto»
 * usan las variantes `--v2-causa-*`, que en claro son más cerradas que el ámbar (`--v2-atento`, 2,8:1) y el gris (`--v2-gris`, 2,3:1) del
 * resto del monitor. Lo mide `__tests__/contrasteCausasMicro.test.ts` leyendo este mismo mapa.
 */
export const COLOR_CAUSA: Record<CausaMicro, string> = {
  arranque: 'rgb(var(--foreground))',
  linea: 'var(--v2-ext)',
  paro: 'var(--v2-mal)',
  ritmo: 'var(--v2-causa-ritmo)',
  sin: 'var(--v2-causa-sin)',
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
 * «Línea común»: otra Baader con una micro O con una detención NO programada cuyo inicio está a ±15 s del de la micro.
 * Shoplogix registra en pasos de 15 s: dos paradas del mismo paso (o contiguos) no son casualidad de una máquina, son de
 * la línea (estudio, LIN-a/b). Con una sola Baader (Filete) no aplica: no hay otra con quién coincidir. La regla no se
 * parte en subtipos. Datos: en 7 turnos de Chonchi suma 14 micro (de 16,9 % a 20,8 %), 3,5 veces sobre el azar.
 */
export const LINEA_COMUN_TOL_S = 15
/**
 * «Tras detención»: hasta 2 min después del fin de una detención (no micro) de esa Baader. Estudio, MAN1: el pico de
 * 0 a 2 min tras una falla o ajuste es rearranque genérico, el de 2 a 10 min ya es difuso: se marca solo el pico.
 */
export const TRAS_DETENCION_S = 120
/**
 * «Ritmo bajo»: el minuto cerrado anterior a la micro la Baader dio MENOS del 75 % de su ritmo propio (estricto). 0,75 es
 * el mismo corte «bien» de Shoplogix (`tonoDe`). Se mide contra el ritmo propio de esa Baader (no contra el esperado):
 * contra el esperado, una Baader que anda normal parece lenta (en Filete el 68 % de sus minutos ya va bajo el 75 % del
 * esperado, y la regla no explicaría nada).
 */
export const RITMO_BAJO = 0.75
/**
 * La micro empieza esto o más después del inicio de su minuto, o la regla de ritmo bajo NO se evalúa. Shoplogix anota la
 * micro 15-30 s después de que la Baader deja de contar piezas: si cae en :00-:14, el minuto anterior ya trae parte de la
 * misma parada y compararlo con el ritmo sería medir la micro contra sí misma. Datos: en 5 turnos de Chonchi, el 78 %
 * de esas micro tiene el minuto anterior «bajo», contra 42 % del resto (base 22,6 %).
 */
export const INICIO_MINUTO_S = 15
/** El ritmo propio es la mediana de los últimos 15 minutos cerrados (anteriores al minuto que se mide) en que anduvo 60 s. */
export const RITMO_MINUTOS = 15
/** Mínimo de esos minutos para fiarse de la mediana; con menos, la regla no se evalúa. */
export const RITMO_MIN_MINUTOS = 8
/** Ritmo bajo solo se evalúa con DOS o más Baader (con Filete, una sola, no se rotula: no explica las micro). */
export const RITMO_MIN_BAADER = 2
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
  /**
   * Máquinas detenidas AHORA: su parada todavía no está en `stopEvents` (se publica al cerrarse). Sin ellas, una Baader
   * detenida hace unos minutos se leería «sin parada anotada». Ausente: ninguna.
   */
  enCurso?: Array<{ id: string; desdeMs: number }> | null
  /** Inicio del gráfico (ms, wall-as-UTC; desde la primera pieza o el inicio programado): los primeros `ARRANQUE_VENTANA_S` s son arranque. */
  inicioTurnoMs: number
}

/** Una celda de la tabla del globo: la Baader (índice de la fila) y el minuto respecto del de la micro (−1 = el anterior). */
export interface CeldaRef {
  fila: number
  d: -1 | 0 | 1
}

/** Una línea de la columna «Causa probable»: una cifra con lo que significa y, si la prueba una celda, cuál. */
export interface RazonMicro {
  /** «2 de 3», «10 de 16», «4,2 min». Lleva espacios duros entre la cifra y su unidad. */
  cifra: string
  texto: string
  /** Segunda línea más chica (de dónde sale la cifra); null si no hay. */
  detalle: string | null
  /** Celdas de la tabla que la prueban: llevan su mismo número. Sin celdas, el globo la marca con ✓. */
  celdas: CeldaRef[]
}

/** Una regla que NO aplicó: con su cifra («✕») o sin evaluarse («—»). */
export interface ReglaDescartada {
  regla: CausaMicro
  /** `no`: se evaluó y no se cumplió (✕). `sin`: no se evalúa (—). */
  estado: 'no' | 'sin'
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
  /** ▽ en el minuto k−1: su micro cayó en :00-:14, así que la parada ya venía de antes. */
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
  /** Índice del minuto de la serie en que empezó. */
  minuto: number
  /** Lo que respalda la causa, en el orden en que se numeran (① ② …). */
  razones: RazonMicro[]
  /** Las reglas que no aplicaron, en orden de precedencia. */
  descartadas: ReglaDescartada[]
  tabla: TablaGlobo
}

interface Evento { fila: number; ini: number; fin: number; s: number; razon: string | null; micro: boolean; programada: boolean }

/** Otra Baader que paró a ±`LINEA_COMUN_TOL_S` del inicio de la micro (`deltaMs` < 0: antes; `d`: su minuto respecto del de la micro). */
interface Coincidencia { fila: number; micro: boolean; programada: boolean; s: number; razon: string | null; deltaMs: number; d: -1 | 0 | 1 }

interface MedidaRitmo {
  /** Piezas del minuto medido; null si ese minuto no existe o no cierra. */
  piezas: number | null
  /** Segundos de reloj que anduvo en ese minuto. */
  anduvo: number
  /** Su ritmo propio (mediana, pz/min); null si no hay `RITMO_MIN_MINUTOS` minutos para sacarlo. */
  ritmo: number | null
  /** 0,75 × ritmo × anduvo / 60: por debajo de esto el minuto es bajo. */
  corte: number | null
  /** ¿anduvo ≥ `ANDANDO_MIN_S` y dio menos que el corte? (el estado de la regla, sin mirar el segundo de la micro). */
  bajo: boolean
}

type EstadoRitmo = 'cumple' | 'no' | 'inicio' | 'una-baader' | 'sin-minuto' | 'poco-andando' | 'sin-ritmo'

interface Evaluacion {
  m: Evento
  /** Minuto de la serie en que empezó. */
  k: number
  /** Segundo del minuto en que Shoplogix anotó el inicio (0 a 59,99). */
  seg: number
  arranque: { aplica: boolean; pausa: { a: number; b: number; razon: string | null } | null; ultimaLarga: { a: number; b: number } | null }
  linea: { aplica: boolean; otros: Coincidencia[]; programadas: Coincidencia[] }
  paro: { aplica: boolean; ultimo: Evento | null }
  ritmo: { estado: EstadoRitmo; medida: MedidaRitmo; kA: number }
  causa: CausaMicro
}

// ── Textos ───────────────────────────────────────────────────────────────────

/** Espacio duro: «45 s», «9,5 min», «10 de 16» y «Ev 1» no se parten entre dos renglones. */
const NB = '\u00a0'
const seg = (s: number) => `${Math.round(s)}${NB}s`
/** Cifra a mostrar: entera sin decimales; con decimales (minutos, ritmo escalado por los segundos andando), uno y con coma. */
const cifraTxt = (n: number) => {
  const r = Math.round(n * 10) / 10
  return Number.isInteger(r) ? r.toLocaleString('es-CL') : dec1(r)
}
/** Lo corto en segundos, lo largo en minutos con coma: «45 s», «2,3 min». */
const dur = (s: number) => (s < 120 ? seg(s) : `${cifraTxt(s / 60)}${NB}min`)
const minTxt = (min: number) => `${cifraTxt(min)}${NB}min`
const deDe = (a: number | string, b: number | string) => `${a}${NB}de${NB}${b}`
const conNB = (texto: string) => texto.replace(/ /g, NB)
const hhmm = (ms: number) => new Date(ms).toISOString().slice(11, 16)
const hhmmss = (ms: number) => new Date(ms).toISOString().slice(11, 19)

/**
 * El motivo de una parada como lo muestra el resto del monitor, sin mayúsculas sostenidas: la etiqueta oficial del árbol de
 * imputación («Colación», «Reunión inicio turno») o, si no está en el árbol, el texto de Shoplogix en minúsculas con la
 * primera mayúscula. La detención sin motivo anotado («Detencion») no dice nada: devuelve null.
 */
export function motivoLegible(razon: string | null | undefined): string | null {
  const t = (razon ?? '').trim().replace(/\s+/g, ' ')
  if (!t) return null
  const hoja = matchImputacion(t).leaf
  if (hoja) return hoja.label
  const bajo = t.toLowerCase()
  if (bajo === 'detencion' || bajo === 'detención') return null
  return bajo.charAt(0).toUpperCase() + bajo.slice(1)
}

/** Lo que Shoplogix no ve de cada micro. «≈ 65 s reales». */
export const realEstimadoS = (duracionS: number) => Math.round(duracionS) + OCULTO_S

/** Cuántas micro hay de cada causa, en el orden de `CAUSAS_MICRO`. */
export function contarPorCausa(micros: readonly MicroClasificada[]): Record<CausaMicro, number> {
  const out: Record<CausaMicro, number> = { arranque: 0, linea: 0, paro: 0, ritmo: 0, sin: 0 }
  for (const m of micros) out[m.causa]++
  return out
}

/**
 * Los números de las razones (①, ②…) y las celdas de la tabla que cada una prueba: `fila:d` → números. La tabla pinta
 * esos mismos números, así que cada cifra del texto se ve también en el dato que la prueba.
 */
export function numerosPorCelda(q: Pick<MicroClasificada, 'razones'>): Map<string, number[]> {
  const out = new Map<string, number[]>()
  q.razones.forEach((r, i) => {
    for (const c of r.celdas) {
      const clave = `${c.fila}:${c.d}`
      out.set(clave, [...(out.get(clave) ?? []), i + 1])
    }
  })
  return out
}

// ── Clasificación ────────────────────────────────────────────────────────────

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

  const n = serie.maquinas.length
  const filaDe = new Map(serie.maquinas.map((q, i) => [q.id, i]))
  /* ¿Es una parada programada? Con la taxonomía de la app (bucket `planificado`: cambio de turno, colación, detención
     programada, ejercicio compensatorio, reunión de inicio), una sola vez por razón distinta. */
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
  const unidas = paradasPorMaquina({ stopEvents: eventosCrudos, stopReasons: e.stopReasons, stopMachines: ids, enCurso: e.enCurso ?? [] })

  /**
   * Minutos COMPLETOS de la serie. `pulse.js` publica solo minutos cerrados, hasta el último cerrado en TODAS las Baader
   * (`minutoComun`): el minuto en curso no viene. Se usa el menor largo entre las Baader por si un doc trae largos distintos;
   * restarle uno botaría un minuto cerrado.
   */
  const completos = Math.min(...serie.maquinas.map((q) => q.cycles.length))
  const piezasEn = (fila: number, k: number): number | null => (k >= 0 && k < completos ? serie.maquinas[fila]!.cycles[k] ?? 0 : null)
  const nom = (fila: number) => etiquetaMaquina(serie.maquinas[fila]!.nombre)
  const minutoDe = (ms: number) => Math.floor((ms - t0) / 60_000)
  const horaMinuto = (k: number) => hhmm(t0 + k * 60_000)

  /** Segundos de reloj que la Baader anduvo en el minuto k (60 − lo cubierto por cualquiera de sus paradas, también la que sigue abierta). */
  const memoAndando = new Map<number, number>()
  const andando = (fila: number, k: number) => {
    const clave = fila * 100_000 + k
    let v = memoAndando.get(clave)
    if (v == null) {
      const ini = t0 + k * 60_000
      v = 60 - segundosCubiertos(unidas.todas.get(serie.maquinas[fila]!.id), ini, ini + 60_000)
      memoAndando.set(clave, v)
    }
    return v
  }

  /**
   * Ritmo propio de la Baader para medir el minuto `kE`: la mediana de sus piezas en los `RITMO_MINUTOS` minutos cerrados
   * ANTERIORES a `kE` (de kE−1 a kE−15) en que anduvo los 60 s, es decir, sin ninguna parada que toque el minuto. Con
   * cantidad par se toma el valor alto de los dos del medio. Con menos de `RITMO_MIN_MINUTOS` así: null.
   */
  const ritmoPropio = (fila: number, kE: number): number | null => {
    const v: number[] = []
    for (let j = kE - 1; j >= Math.max(0, kE - RITMO_MINUTOS); j--) {
      const p = piezasEn(fila, j)
      if (p != null && andando(fila, j) === 60) v.push(p)
    }
    if (v.length < RITMO_MIN_MINUTOS) return null
    v.sort((a, b) => a - b)
    return v[Math.floor(v.length / 2)]!
  }

  /** El minuto `kE` de una Baader contra su ritmo propio. «Bajo»: anduvo ≥ 30 s y dio MENOS (estricto) del 75 % de lo que da andando. */
  const medir = (fila: number, kE: number): MedidaRitmo => {
    const piezas = piezasEn(fila, kE)
    if (piezas == null) return { piezas: null, anduvo: 0, ritmo: null, corte: null, bajo: false }
    const anduvo = andando(fila, kE)
    const ritmo = ritmoPropio(fila, kE)
    const corte = ritmo != null ? RITMO_BAJO * ritmo * (anduvo / 60) : null
    return { piezas, anduvo, ritmo, corte, bajo: ritmo != null && ritmo > 0 && anduvo >= ANDANDO_MIN_S && corte != null && piezas < corte }
  }

  const evaluar = (m: Evento): Evaluacion => {
    const k = minutoDe(m.ini)
    const seg0 = ((((m.ini - t0) % 60_000) + 60_000) % 60_000) / 1000

    // 1 · Arranque: en los primeros 10 min del gráfico (desde la primera pieza o el inicio programado) o hasta 10 min después
    // del fin de una pausa de 10 min o más de esa Baader.
    const largas = (parosUnidos.get(m.fila) ?? []).filter(([a, b]) => b - a >= ARRANQUE_PARADA_MIN_S * 1000 && b <= m.ini)
    const ultima = largas.length > 0 ? largas[largas.length - 1]! : null
    const ultimaLarga = ultima ? { a: ultima[0], b: ultima[1] } : null
    /* El motivo de la pausa es el de su registro más largo: una pausa unida puede venir partida en varios. */
    const motivoDe = (u: { a: number; b: number }) => paros
      .filter((p) => p.fila === m.fila && p.fin > u.a && p.ini < u.b)
      .reduce<Evento | null>((mayor, p) => (!mayor || p.s > mayor.s ? p : mayor), null)?.razon ?? null
    const pausa = ultimaLarga && m.ini - ultimaLarga.b < ARRANQUE_VENTANA_S * 1000 ? { ...ultimaLarga, razon: motivoDe(ultimaLarga) } : null
    const aplicaArranque = pausa != null || m.ini - e.inicioTurnoMs < ARRANQUE_VENTANA_S * 1000

    // 2 · Línea común: otra Baader con una micro o con una detención NO programada que empieza a ±15 s.
    const cercanas = eventos
      .filter((y) => y.fila !== m.fila && Math.abs(y.ini - m.ini) <= LINEA_COMUN_TOL_S * 1000)
      .sort((a, b) => Math.abs(a.ini - m.ini) - Math.abs(b.ini - m.ini))
      .map((y): Coincidencia => ({ fila: y.fila, micro: y.micro, programada: y.programada, s: y.s, razon: y.razon, deltaMs: y.ini - m.ini, d: (minutoDe(y.ini) - k) as -1 | 0 | 1 }))
    /* Una por Baader, la más cercana (vienen ordenadas por cercanía). */
    const unaPorBaader = (lista: Coincidencia[]) => lista.filter((c, i) => lista.findIndex((z) => z.fila === c.fila) === i)
    const otros = unaPorBaader(cercanas.filter((c) => !c.programada))
    const programadas = unaPorBaader(cercanas.filter((c) => c.programada))

    // 3 · Tras detención: hasta 2 min después del fin de una detención (no micro) de esa Baader.
    const previos = paros.filter((p) => p.fila === m.fila && p.fin <= m.ini)
    const ultimo = previos.length > 0 ? previos.reduce((a, b) => (b.fin > a.fin ? b : a)) : null
    const aplicaParo = ultimo != null && m.ini - ultimo.fin < TRAS_DETENCION_S * 1000

    // 4 · Ritmo bajo: el minuto cerrado anterior (k−1) contra el ritmo propio. No se evalúa con una sola Baader ni si la micro
    // empieza en :00-:14 (el minuto anterior ya trae parte de la misma parada).
    const kA = k - 1
    const medida = medir(m.fila, kA)
    let estado: EstadoRitmo
    if (n < RITMO_MIN_BAADER) estado = 'una-baader'
    else if (seg0 < INICIO_MINUTO_S) estado = 'inicio'
    else if (kA < 0 || medida.piezas == null) estado = 'sin-minuto'
    else if (medida.anduvo < ANDANDO_MIN_S) estado = 'poco-andando'
    else if (medida.ritmo == null || !(medida.ritmo > 0)) estado = 'sin-ritmo'
    else estado = medida.bajo ? 'cumple' : 'no'

    let causa: CausaMicro = 'sin'
    if (aplicaArranque) causa = 'arranque'
    else if (otros.length > 0) causa = 'linea'
    else if (aplicaParo) causa = 'paro'
    else if (estado === 'cumple') causa = 'ritmo'

    return {
      m, k, seg: seg0,
      arranque: { aplica: aplicaArranque, pausa, ultimaLarga },
      linea: { aplica: otros.length > 0, otros, programadas },
      paro: { aplica: aplicaParo, ultimo },
      ritmo: { estado, medida, kA },
      causa,
    }
  }

  const evaluaciones = new Map<Evento, Evaluacion>(micros.map((m) => [m, evaluar(m)]))

  // ── Lo que el globo muestra de cada micro ──────────────────────────────────

  const explicar = (x: Evaluacion): Pick<MicroClasificada, 'razones' | 'descartadas' | 'tabla'> => {
    const { m, k, causa } = x
    const nombre = nom(m.fila)
    const razones: RazonMicro[] = []
    const descartadas: ReglaDescartada[] = []

    // Las razones de la causa que ganó.
    if (causa === 'arranque') {
      const p = x.arranque.pausa
      if (p) {
        razones.push({
          cifra: minTxt((m.ini - p.b) / 60_000),
          texto: `desde que ${conNB(nombre)} volvió a andar, tras ${dur((p.b - p.a) / 1000)} detenida`,
          detalle: motivoLegible(p.razon),
          celdas: [],
        })
      } else {
        razones.push({ cifra: minTxt((m.ini - e.inicioTurnoMs) / 60_000), texto: 'desde el inicio del turno', detalle: hhmm(e.inicioTurnoMs), celdas: [] })
      }
    } else if (causa === 'linea') {
      const mismoSegundo = x.linea.otros.every((c) => Math.abs(c.deltaMs) < 1000)
      const lista = [{ fila: m.fila, micro: true, s: m.s, deltaMs: 0, d: 0 as const }, ...x.linea.otros]
      razones.push({
        cifra: deDe(lista.length, n),
        texto: mismoSegundo ? 'Baader pararon en el mismo segundo' : 'Baader pararon casi a la vez',
        detalle: lista.map((c) => {
          const desfase = Math.abs(c.deltaMs) >= 1000 ? ` (${seg(Math.abs(c.deltaMs) / 1000)} ${c.deltaMs < 0 ? 'antes' : 'después'})` : ''
          return `${conNB(nom(c.fila))} ${dur(c.s)}${c.micro ? '' : ' (detención)'}${desfase}`
        }).join(' · '),
        celdas: lista.map((c) => ({ fila: c.fila, d: c.d })),
      })
    } else if (causa === 'paro' && x.paro.ultimo) {
      const u = x.paro.ultimo
      razones.push({ cifra: seg((m.ini - u.fin) / 1000), texto: `desde que terminó una detención de ${dur(u.s)}`, detalle: motivoLegible(u.razon), celdas: [] })
    } else if (causa === 'ritmo') {
      const { medida, kA } = x.ritmo
      const de = (medida.ritmo ?? 0) * (medida.anduvo / 60)
      razones.push({
        cifra: deDe(medida.piezas ?? 0, cifraTxt(de)),
        texto: `${conNB(nombre)} a las ${horaMinuto(kA)}, el minuto antes${medida.anduvo < 60 ? ` (anduvo ${seg(medida.anduvo)})` : ''}`,
        detalle: `su ritmo de los últimos ${RITMO_MINUTOS} min: ${cifraTxt(medida.ritmo ?? 0)}${NB}pz/min`,
        celdas: [{ fila: m.fila, d: -1 }],
      })
    }

    // Notas: son evidencia, nunca rótulo ni chip. Van bajo la causa que gane.
    // · Todas las Baader venían bajo su ritmo el minuto anterior (y la micro no cae en :00-:14).
    if (n >= RITMO_MIN_BAADER && x.seg >= INICIO_MINUTO_S && serie.maquinas.every((_, j) => medir(j, k - 1).bajo)) {
      razones.push({
        cifra: deDe(n, n),
        texto: n === 2 ? 'las dos venían bajo su ritmo' : n === 3 ? 'las tres venían bajo su ritmo' : 'todas venían bajo su ritmo',
        detalle: `en ${horaMinuto(k - 1)}, el minuto antes`,
        celdas: serie.maquinas.map((_, j) => ({ fila: j, d: -1 as const })),
      })
    }
    // · Otra Baader que en el minuto k anduvo los 60 s (ninguna parada anotada lo toca) y dio menos del 75 % de su ritmo propio.
    for (let j = 0; j < n; j++) {
      if (j === m.fila) continue
      const md = medir(j, k)
      if (md.piezas == null || md.anduvo !== 60 || md.ritmo == null || !(md.piezas < RITMO_BAJO * md.ritmo)) continue
      const esp = serie.maquinas[j]!.esperado
      razones.push({
        cifra: esp != null ? deDe(md.piezas, esp) : `${md.piezas}${NB}pz`,
        texto: `${conNB(nom(j))} sin parada anotada en ${horaMinuto(k)}`,
        detalle: 'posible micro de 0 s',
        celdas: [{ fila: j, d: 0 }],
      })
    }

    // Las reglas que no aplicaron (✕ con su cifra, — si no se evalúan). Una regla que se cumple pero pierde por orden de
    // precedencia no es «descartada»: no se lista como ✕ (sería falso).
    if (causa !== 'arranque' && !x.arranque.aplica) {
      descartadas.push({
        regla: 'arranque',
        estado: 'no',
        texto: x.arranque.ultimaLarga
          ? `la última pausa larga terminó a las ${hhmm(x.arranque.ultimaLarga.b)}`
          : `no hubo pausas largas desde el inicio del turno (${hhmm(e.inicioTurnoMs)})`,
      })
    }
    if (causa !== 'linea' && n > 1 && !x.linea.aplica) {
      const prog = x.linea.programadas[0]
      descartadas.push({
        regla: 'linea',
        estado: 'no',
        texto: prog
          ? `ninguna otra Baader paró a ±${LINEA_COMUN_TOL_S}${NB}s, salvo una parada programada: ${conNB(nom(prog.fila))}${motivoLegible(prog.razon) ? ` (${motivoLegible(prog.razon)})` : ''}`
          : `ninguna otra Baader paró a ±${LINEA_COMUN_TOL_S}${NB}s`,
      })
    }
    if (causa !== 'paro' && !x.paro.aplica) {
      descartadas.push({
        regla: 'paro',
        estado: 'no',
        texto: x.paro.ultimo ? `la última detención fue hace ${minTxt((m.ini - x.paro.ultimo.fin) / 60_000)}` : 'no hubo detenciones antes de la micro',
      })
    }
    if (causa !== 'ritmo' && x.ritmo.estado !== 'cumple') {
      const { estado, medida, kA } = x.ritmo
      const hace = horaMinuto(kA)
      let texto: string
      if (estado === 'una-baader') texto = 'no se usa en Filete: su ritmo cambia mucho y no explica las micro'
      else if (estado === 'inicio') {
        /* «Por eso el minuto sale bajo» solo si de verdad sale bajo: sin esto la regla lo habría marcado. */
        texto = `no se evalúa: Shoplogix anotó la micro al empezar el minuto (${hhmmss(m.ini)}). La parada ya venía de antes${medida.bajo ? `, por eso el minuto ${hace} sale bajo` : ''}`
      } else if (estado === 'sin-minuto') texto = 'no se evalúa: todavía no hay datos del minuto anterior'
      else if (estado === 'poco-andando') texto = `no se evalúa: en ${hace} la Baader anduvo solo ${seg(medida.anduvo)}`
      else if (estado === 'sin-ritmo') texto = `no se evalúa: no hay ${RITMO_MIN_MINUTOS} minutos completos andando para medir su ritmo propio`
      else texto = `${deDe(medida.piezas ?? 0, cifraTxt((medida.ritmo ?? 0) * (medida.anduvo / 60)))} en ${hace}, el minuto antes: no bajó del ${Math.round(RITMO_BAJO * 100)}${NB}% de su ritmo`
      descartadas.push({ regla: 'ritmo', estado: estado === 'no' ? 'no' : 'sin', texto })
    }

    // La tabla: una fila por Baader, minutos k−2 … k+1.
    const microsDeK = (fila: number) => micros.filter((v) => v.fila === fila && minutoDe(v.ini) === k)
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
        inicioPrevio: k >= 1 && enK.some((v) => ((((v.ini - t0) % 60_000) + 60_000) % 60_000) / 1000 < INICIO_MINUTO_S),
      }
    })
    const tabla: TablaGlobo = {
      horas: [k - 2, k - 1, k, k + 1].map(horaMinuto),
      filas,
      leyendaInicio: filas.some((f) => f.inicioPrevio) ? 'ya estaba parando (Shoplogix lo anota después)' : null,
    }
    return { razones, descartadas, tabla }
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
      minuto: x.k,
      ...explicar(x),
    }
  })
}
