/**
 * Lógica PURA de la tarjeta «Ritmo en vivo · 15 min» del monitor v2.
 *
 * Todo sale de dato de Shoplogix ya publicado en el doc; nada se inventa:
 *  · `pulse.serieMinuto`  — piezas por minuto y por máquina (buckets de 1 min
 *    CERRADOS) y el `esperado` oficial de cada máquina (19/16/16 en Eviscerado
 *    B142, 18 en Filete B200). Ese esperado es la velocidad seteada: carros o
 *    silletas por minuto.
 *  · `pulse.lecturas[].porMaquina` — acumulado del turno con el minuto parcial
 *    incluido: restándole la serie cerrada sale lo contado del minuto EN CURSO.
 *  · `live.stopEvents` (+ `stopMachines`, `m`) — paradas ubicadas por máquina,
 *    para saber qué fracción de cada minuto la máquina estuvo ANDANDO.
 *  · estado vivo de cada máquina (`currentReason` / `currentSinceAt`) — la
 *    CLASIFICACIÓN OFICIAL de Shoplogix de la parada en curso.
 *
 * Todas las horas están en la convención wall-clock-as-UTC del doc.
 */
import type { PublicMonitorLive, PulsoMonitor } from '@/services/shoplogix/publicShiftMonitor.service'
import { classifyLossState } from '@/services/shoplogix/lossBuckets'

/** Cuánto duran, como máximo, las micro detenciones en los datos medidos (nota informativa, jamás decide un color). */
export const MICRO_MAX_MEDIDO_S = 90
/** Menos de esto andando en un minuto = no hay dato de llenado de ese minuto. */
/* Medio minuto: con menos, el minuto en que arranca una parada (p. ej. 21 s andando y 0 piezas por el
   rezago del contador) se leía como «0 % de carros con pieza» cuando en verdad la máquina se detuvo. */
export const ANDANDO_MIN_S = 30
/** Cuántos minutos CERRADOS caben en la tira (el 15º es el minuto en curso). */
export const MINUTOS_CERRADOS = 14
/** Caída de llenado (puntos porcentuales, inicio → fin) a partir de la cual una máquina «baja». */
export const CAIDA_LLENADO_PP = 12
/** Variación relativa de la recta de 15 min bajo la cual el ritmo se llama estable. */
export const UMBRAL_TENDENCIA = 0.06

export type Tono = 'bien' | 'atento' | 'mal'

/** Los cortes de Shoplogix en sus barras: ≥75 % del esperado bien, 50–75 atento, <50 mal. */
export function tonoDe(ratio: number): Tono {
  return ratio >= 0.75 ? 'bien' : ratio >= 0.5 ? 'atento' : 'mal'
}

/** Minúsculas, sin tildes ni espacios sobrantes: el texto de Shoplogix llega con acentos inconsistentes. */
export function normalizar(s: string | null | undefined): string {
  return (s ?? '').normalize('NFD').replace(/[̀-ͯ]/g, '').trim().toLowerCase()
}

export const esMicroDetencion = (razon: string | null | undefined) => normalizar(razon) === 'micro detencion'

// ── Entradas ─────────────────────────────────────────────────────────────────

export interface MaquinaSerie {
  id: string
  nombre: string
  esperado: number | null
  cycles: number[]
}

export interface EntradaRitmoVivo {
  serie: { desde: string; maquinas: MaquinaSerie[] }
  /** Acumulado del turno por máquina en la última lectura (minuto parcial incluido). */
  acumulado: Record<string, number> | null
  stopEvents?: Array<{ r: number; f: string; s: number; m?: number }> | null
  stopReasons?: string[] | null
  stopMachines?: string[] | null
  /** Máquinas detenidas AHORA (la parada en curso no está en `stopEvents`). */
  enCurso: Array<{ id: string; desdeMs: number }>
}

export interface MaquinaVivo {
  id: string
  nombre: string
  status: 'produciendo' | 'detenida' | 'sin-datos'
  razon: string | null
  /** Inicio de la parada actual, wall-as-UTC ms. */
  desdeMs: number | null
  /** Parada pactada (colación, etc.): no es una alarma. */
  programada: boolean
}

// ── Tendencia ────────────────────────────────────────────────────────────────

export interface Tendencia {
  dir: 'subiendo' | 'estable' | 'bajando'
  /** Valor de la recta al inicio y al final de la ventana, en pz/min. */
  desde: number
  hasta: number
  /** Minutos cerrados que entraron en la cuenta. */
  n: number
}

/** Recta de mínimos cuadrados sobre los minutos cerrados; la dirección sale del cambio relativo al esperado. */
export function tendenciaDe(valores: number[], esperadoLinea: number): Tendencia | null {
  const n = valores.length
  if (n < 4 || !(esperadoLinea > 0)) return null
  const mx = (n - 1) / 2
  const my = valores.reduce((a, v) => a + v, 0) / n
  let num = 0
  let den = 0
  valores.forEach((v, i) => { num += (i - mx) * (v - my); den += (i - mx) * (i - mx) })
  const pendiente = num / den
  const desde = Math.max(0, Math.round(my - pendiente * mx))
  const hasta = Math.max(0, Math.round(my + pendiente * (n - 1 - mx)))
  const rel = (hasta - desde) / esperadoLinea
  return { dir: Math.abs(rel) < UMBRAL_TENDENCIA ? 'estable' : rel > 0 ? 'subiendo' : 'bajando', desde, hasta, n }
}

// ── Paradas por máquina ──────────────────────────────────────────────────────

type Intervalo = [number, number]

function unir(iv: Intervalo[]): Intervalo[] {
  const orden = iv.slice().sort((a, b) => a[0] - b[0])
  const out: Intervalo[] = []
  for (const [a, b] of orden) {
    const ult = out[out.length - 1]
    if (ult && a <= ult[1]) ult[1] = Math.max(ult[1], b)
    else out.push([a, b])
  }
  return out
}

export interface ParadasPorMaquina {
  /** false = el doc es anterior a `stopMachines`/`m`: no se sabe de qué máquina fue cada parada. */
  separa: boolean
  todas: Map<string, Intervalo[]>
  micro: Map<string, Intervalo[]>
}

/** Intervalos de parada por máquina (unidos): los cerrados de `stopEvents` + la que está en curso. */
export function paradasPorMaquina(e: Pick<EntradaRitmoVivo, 'stopEvents' | 'stopReasons' | 'stopMachines' | 'enCurso'>): ParadasPorMaquina {
  const eventos = e.stopEvents ?? []
  const ids = e.stopMachines ?? []
  const separa = ids.length > 0 && eventos.every((x) => x.m != null && ids[x.m] != null)
  const todas = new Map<string, Intervalo[]>()
  const micro = new Map<string, Intervalo[]>()
  const poner = (mapa: Map<string, Intervalo[]>, id: string, iv: Intervalo) => {
    const l = mapa.get(id)
    if (l) l.push(iv)
    else mapa.set(id, [iv])
  }
  if (separa) {
    for (const x of eventos) {
      const id = ids[x.m!]!
      const a = Date.parse(x.f)
      if (!Number.isFinite(a) || !(x.s > 0)) continue
      const iv: Intervalo = [a, a + x.s * 1000]
      poner(todas, id, iv)
      if (esMicroDetencion(e.stopReasons?.[x.r])) poner(micro, id, iv)
    }
  }
  for (const p of e.enCurso) poner(todas, p.id, [p.desdeMs, Number.POSITIVE_INFINITY])
  for (const [id, l] of todas) todas.set(id, unir(l))
  for (const [id, l] of micro) micro.set(id, unir(l))
  return { separa, todas, micro }
}

/** Segundos de [ini, fin) cubiertos por los intervalos (ya unidos). */
export function segundosCubiertos(iv: Intervalo[] | undefined, ini: number, fin: number): number {
  if (!iv?.length) return 0
  let ms = 0
  for (const [a, b] of iv) {
    const x = Math.max(a, ini)
    const y = Math.min(b, fin)
    if (y > x) ms += y - x
  }
  return ms / 1000
}

// ── Resultado ────────────────────────────────────────────────────────────────

export interface MinutoLinea {
  /** HH:MM del inicio del minuto. */
  hora: string
  piezas: number
  tono: Tono
}

export interface LineaLlenado {
  id: string
  nombre: string
  esperado: number
  /** % de llenado por minuto cerrado (0–100); null = sin dato (parada o <30 s andando). */
  fills: Array<number | null>
  /** Índices de minuto con micro detención de ESA máquina. */
  micros: number[]
  ini: number | null
  fin: number | null
  baja: boolean
  tono: Tono | null
  microsRecientes: number
}

export type SenalTono = 'atento' | 'mal' | 'neutra'
export interface Senal { tono: SenalTono; texto: string }

export interface RitmoVivo {
  minutos: MinutoLinea[]
  esperadoLinea: number
  /** Piezas del último minuto cerrado (= el «Ahora» de la tarjeta de ritmo). */
  ahora: number
  ahoraPct: number
  tendencia: Tendencia | null
  /** Piezas contadas del minuto en curso, o null si el dato no cuadra. */
  curso: number | null
  /** HH:MM del minuto en curso. */
  horaCurso: string
  lineas: LineaLlenado[]
  /** Falso en docs anteriores a `stopMachines`: el llenado no separa las paradas. */
  separaParadas: boolean
  senales: Senal[]
  unidad: 'carros' | 'silletas' | null
}

const hh = (ms: number) => new Date(ms).toISOString().slice(11, 16)
const media = (v: number[]) => v.reduce((a, b) => a + b, 0) / v.length

/** «carros» en la Baader 142, «silletas» en la Baader 200: por modelo o nombre de la máquina, no de la línea. */
export function unidadDeMaquinas(maquinas: Array<{ model?: string | null; name?: string | null }>): 'carros' | 'silletas' | null {
  const f = (re: RegExp) => maquinas.some((m) => re.test(`${m.model ?? ''}`)) || maquinas.some((m) => re.test(`${m.name ?? ''}`))
  if (f(/\b142\b/)) return 'carros'
  if (f(/\b200\b/)) return 'silletas'
  return null
}

const rangoTxt = (v: number[]) => {
  const a = Math.min(...v)
  const b = Math.max(...v)
  return a === b ? `${a}` : `${a}–${b}`
}

/** Llenado y señales; separado de `calcularRitmoVivo` para poder probarlo con paradas a mano. */
export function llenadoDe(e: EntradaRitmoVivo, i0: number, n: number): { lineas: LineaLlenado[]; separaParadas: boolean } {
  const t0 = Date.parse(e.serie.desde)
  const pp = paradasPorMaquina(e)
  const lineas: LineaLlenado[] = []
  for (const m of e.serie.maquinas) {
    if (!(m.esperado != null && m.esperado > 0)) continue
    const fills: Array<number | null> = []
    const micros: number[] = []
    for (let i = i0; i < n; i++) {
      const ini = t0 + i * 60_000
      const fin = ini + 60_000
      const andando = 60 - segundosCubiertos(pp.todas.get(m.id), ini, fin)
      /* Línea entera en cero: no se puede distinguir una parada pactada que no
         viaja en `stopEvents` de un minuto sin pescado — no se pinta como mal llenado. */
      const lineaEnCero = e.serie.maquinas.every((x) => (x.cycles[i] ?? 0) === 0)
      if (andando < ANDANDO_MIN_S || lineaEnCero) {
        fills.push(null)
      } else {
        const v = (m.cycles[i] ?? 0) / (m.esperado * (andando / 60))
        fills.push(Math.min(100, Math.round(v * 100)))
      }
      if (segundosCubiertos(pp.micro.get(m.id), ini, fin) > 0) micros.push(i - i0)
    }
    const validos = fills.filter((x): x is number => x != null)
    const ini = validos.length >= 6 ? Math.round(media(validos.slice(0, 3))) : null
    const fin = validos.length >= 6 ? Math.round(media(validos.slice(-3))) : null
    const baja = ini != null && fin != null && ini - fin >= CAIDA_LLENADO_PP
    lineas.push({
      id: m.id,
      nombre: m.nombre,
      esperado: m.esperado,
      fills,
      micros,
      ini,
      fin,
      baja,
      tono: baja && fin != null ? (fin < 50 ? 'mal' : 'atento') : null,
      microsRecientes: micros.filter((x) => x >= fills.length - 7).length,
    })
  }
  return { lineas, separaParadas: pp.separa }
}

/** Señales sobrias: lo que el dato muestra y qué mirar; nunca afirman una causa. */
export function senalesDe(lineas: LineaLlenado[], unidad: 'carros' | 'silletas' | null, separaParadas: boolean): Senal[] {
  const cosa = unidad ? `${unidad} con pieza` : 'llenado'
  const out: Senal[] = []
  const n = lineas.length
  const medidas = lineas.filter((l) => l.ini != null && l.fin != null)
  const bajan = medidas.filter((l) => l.baja)
  if (medidas.length === 0) {
    out.push({ tono: 'neutra', texto: 'Todavía no hay minutos con llenado medible para dar una señal.' })
  } else if (n > 1) {
    if (bajan.length === n) {
      out.push({ tono: 'atento', texto: `Bajan las ${n} a la vez: de ${rangoTxt(lineas.map((l) => l.ini!))} % a ${rangoTxt(lineas.map((l) => l.fin!))} % de ${cosa}. Cuando caen juntas conviene revisar la alimentación o la MMPP; el dato no confirma la causa.` })
    } else if (bajan.length === 1) {
      const b = bajan[0]!
      const otras = medidas.filter((l) => !l.baja)
      out.push({ tono: 'atento', texto: `Solo baja ${b.nombre}: de ${b.ini} % a ${b.fin} % de ${cosa}${otras.length ? `; las otras siguen en ${rangoTxt(otras.map((l) => l.fin!))} %` : ''}. Conviene revisar esa máquina.` })
    } else if (bajan.length > 1) {
      out.push({ tono: 'atento', texto: `Bajan ${bajan.map((l) => l.nombre).join(' y ')}: ${bajan.map((l) => `${l.ini} → ${l.fin} %`).join(' y ')} de ${cosa}. El dato no confirma la causa.` })
    } else {
      out.push({ tono: 'neutra', texto: `Llenado parejo${n > 1 ? ` en las ${n}` : ''}: ${rangoTxt(medidas.map((l) => l.fin!))} % de ${cosa}. Sin señales.` })
    }
  } else {
    const l = medidas[0]!
    out.push(l.baja
      ? { tono: 'atento', texto: `${cosa[0]!.toUpperCase()}${cosa.slice(1)} baja de ${l.ini} % a ${l.fin} % en 15 min. Conviene revisar la máquina.` }
      : { tono: 'neutra', texto: `${cosa[0]!.toUpperCase()}${cosa.slice(1)} estable, ${l.fin} %. Sin señales.` })
  }
  for (const l of medidas) {
    if (l.baja && l.microsRecientes >= 2) {
      out.push({ tono: 'mal', texto: `${l.nombre} suma ${l.microsRecientes} micro detenciones en 7 min mientras baja el llenado. Señal temprana: puede ser una falla o MMPP difícil; el dato no lo confirma.` })
    }
  }
  if (!separaParadas) {
    out.push({ tono: 'neutra', texto: 'Llenado sin separar paradas: este registro no dice de qué máquina fue cada una.' })
  }
  return out
}

/** Todo lo que dibuja la tarjeta, o null si la serie no alcanza (esperado desconocido o muy pocos minutos). */
export function calcularRitmoVivo(e: EntradaRitmoVivo, unidad: 'carros' | 'silletas' | null): RitmoVivo | null {
  const maq = e.serie.maquinas
  if (!maq.length) return null
  const t0 = Date.parse(e.serie.desde)
  if (!Number.isFinite(t0)) return null
  const n = Math.min(...maq.map((m) => m.cycles.length))
  if (n < 4) return null
  /* Sin el esperado oficial de TODAS las máquinas no hay vara: se calla en vez de adivinar. */
  if (maq.some((m) => !(m.esperado != null && m.esperado > 0))) return null
  const esperadoLinea = maq.reduce((a, m) => a + m.esperado!, 0)
  const i0 = Math.max(0, n - MINUTOS_CERRADOS)
  const minutos: MinutoLinea[] = []
  for (let i = i0; i < n; i++) {
    const piezas = maq.reduce((a, m) => a + (m.cycles[i] ?? 0), 0)
    minutos.push({ hora: hh(t0 + i * 60_000), piezas, tono: tonoDe(piezas / esperadoLinea) })
  }
  const ahora = minutos[minutos.length - 1]!.piezas

  let curso: number | null = null
  if (e.acumulado && maq.every((m) => e.acumulado![m.id] != null)) {
    curso = maq.reduce((a, m) => a + Math.max(0, e.acumulado![m.id]! - m.cycles.slice(0, n).reduce((x, y) => x + y, 0)), 0)
    /* Un parcial imposible (serie recortada, minutos sin cerrar) no se dibuja. */
    if (curso > esperadoLinea * 1.5) curso = null
  }

  const { lineas, separaParadas } = llenadoDe(e, i0, n)
  return {
    minutos,
    esperadoLinea,
    ahora,
    ahoraPct: Math.round((ahora / esperadoLinea) * 100),
    tendencia: tendenciaDe(minutos.map((m) => m.piezas), esperadoLinea),
    curso,
    horaCurso: hh(t0 + n * 60_000),
    lineas,
    separaParadas,
    senales: senalesDe(lineas, unidad, separaParadas),
    unidad,
  }
}

// ── La parada en curso ───────────────────────────────────────────────────────

export type ClaseParada = 'micro' | 'detencion' | 'programada'

export interface ParadaVivo {
  clase: ClaseParada
  /** Quién para: «La línea», el nombre de la máquina (+ «y N más»). */
  quien: string
  /** La causa que anotaron; null mientras Shoplogix solo dice «Detencion»/«Micro Detencion». */
  causa: string | null
  /** Hay que anotar la causa: Shoplogix ya la llama detención y nadie escribió una. */
  faltaCausa: boolean
  desdeMs: number
  /** Texto del estado tal como lo clasifica Shoplogix. */
  estado: string
}

const RAZONES_SIN_CAUSA = new Set(['detencion', 'micro detencion', ''])
const rank: Record<ClaseParada, number> = { detencion: 3, micro: 2, programada: 1 }

/**
 * La parada que se muestra en la banda. La clase sale de la clasificación
 * OFICIAL de Shoplogix (nombre/razón del estado vivo), nunca de un umbral
 * propio: «Micro Detencion» es micro mientras Shoplogix la llame así.
 */
export function paradaEnCurso(maquinas: MaquinaVivo[]): ParadaVivo | null {
  const paradas = maquinas
    .filter((m) => m.status === 'detenida' && m.desdeMs != null)
    .map((m) => {
      const clase: ClaseParada = m.programada ? 'programada' : esMicroDetencion(m.razon) ? 'micro' : 'detencion'
      const sinCausa = RAZONES_SIN_CAUSA.has(normalizar(m.razon))
      return { m, clase, sinCausa }
    })
  if (!paradas.length) return null
  paradas.sort((a, b) => rank[b.clase] - rank[a.clase] || Number(b.sinCausa) - Number(a.sinCausa) || a.m.desdeMs! - b.m.desdeMs!)
  const p = paradas[0]!
  const todas = maquinas.length > 1 && paradas.length === maquinas.length
  const otras = paradas.length - 1
  return {
    clase: p.clase,
    quien: todas ? 'La línea' : `${p.m.nombre}${otras > 0 ? ` y ${otras} más` : ''}`,
    causa: p.sinCausa ? null : p.m.razon,
    faltaCausa: p.clase === 'detencion' && p.sinCausa,
    desdeMs: p.m.desdeMs!,
    estado: p.m.razon ?? 'Detención',
  }
}

/** Duración con unidades («13 min 15 s», «1 h 02 min»): «13:15» se leía como una hora del reloj. Nunca negativa. */
export function cronometro(seg: number): string {
  const s = Math.max(0, Math.floor(seg))
  const h = Math.floor(s / 3600)
  const m = Math.floor((s % 3600) / 60)
  const ss = String(s % 60).padStart(2, '0')
  if (h > 0) return `${h} h ${String(m).padStart(2, '0')} min`
  return m > 0 ? `${m} min ${ss} s` : `${s % 60} s`
}

// ── Del doc del monitor a la tarjeta ─────────────────────────────────────────

/**
 * Arma la tarjeta desde el doc publicado. Devuelve null cuando no hay serie del
 * pulso (turno cerrado, contador mudo, doc viejo): la tarjeta no se dibuja.
 *
 * `ahoraPorId` es el pulso por máquina: si ya cuenta piezas, la máquina corre
 * aunque el estado del último corte diga «detenida» (misma regla que el resto
 * del v2).
 */
export function ritmoVivoDeMonitor(args: {
  pulse: PulsoMonitor | null | undefined
  live: PublicMonitorLive
  ahoraPorId: Map<string, number> | null
}): { r: RitmoVivo; maquinas: MaquinaVivo[] } | null {
  const { pulse, live, ahoraPorId } = args
  const s = pulse?.serieMinuto
  if (!pulse || !s?.maquinas?.length) return null
  const nombre = new Map(live.machines.map((m) => [m.id, m.name]))
  const maquinas: MaquinaVivo[] = live.machines.map((m) => {
    const since = m.currentSinceAt ? Date.parse(m.currentSinceAt) : NaN
    const status = (ahoraPorId?.get(m.id) ?? 0) > 0 ? 'produciendo' : m.status
    return {
      id: m.id,
      nombre: m.name,
      status,
      razon: m.currentReason,
      desdeMs: Number.isFinite(since) ? since : null,
      programada: status === 'detenida' && classifyLossState({ type: 'break', reason: m.currentReason ?? undefined }) === 'planificado',
    }
  })
  const ult = pulse.lecturas?.[pulse.lecturas.length - 1]?.porMaquina ?? null
  const r = calcularRitmoVivo({
    serie: { desde: s.desde, maquinas: s.maquinas.map((m) => ({ id: m.id, nombre: nombre.get(m.id) ?? m.id, esperado: m.esperado, cycles: m.cycles })) },
    acumulado: ult,
    stopEvents: live.stopEvents,
    stopReasons: live.stopReasons,
    stopMachines: live.stopMachines,
    enCurso: maquinas.filter((m) => m.status === 'detenida' && m.desdeMs != null).map((m) => ({ id: m.id, desdeMs: m.desdeMs! })),
  }, unidadDeMaquinas(live.machines))
  return r ? { r, maquinas } : null
}
