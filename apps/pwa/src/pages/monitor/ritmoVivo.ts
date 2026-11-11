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
import { varaMinuto, type FuenteVara, type PerillasDeLinea, type VaraUmbral } from './perilla'

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

/**
 * Vara de una Baader en el minuto `k` (`t0` = inicio del minuto 0, wall-as-UTC): la perilla vigente en ese instante o, si no
 * hay, el esperado de Shoplogix (`varaMinuto`). Sin perillas devuelve `m.esperado` tal cual. Null solo si la Baader no tiene
 * esperado de Shoplogix: ese dato sigue siendo la compuerta y quien llama ya la aplica. Sin `t0` finito no se consulta la
 * perilla: `perillaEn` con NaN la daría por vigente en cualquier instante.
 */
export function varaEnMinuto(m: { id?: string; esperado: number | null }, t0: number, k: number, perillas?: PerillasDeLinea | null): number | null {
  if (m.esperado == null) return null
  if (m.id == null || !Number.isFinite(t0)) return m.esperado
  return varaMinuto(perillas, m.id, t0 + k * 60_000, m.esperado).cpm
}

/**
 * La misma vara que `varaEnMinuto`, con su fuente (perilla o Shoplogix) y, con perilla, su `modo`. El tono de «a ritmo» depende de la
 * fuente y del modo: con perilla es la perilla menos el descuento calibrado (por omisión).
 */
export function varaDeMinuto(m: { id?: string; esperado: number | null }, t0: number, k: number, perillas?: PerillasDeLinea | null): VaraUmbral {
  if (m.esperado == null) return { cpm: null, fuente: 'shoplogix' }
  if (m.id == null || !Number.isFinite(t0)) return { cpm: m.esperado, fuente: 'shoplogix' }
  return varaMinuto(perillas, m.id, t0 + k * 60_000, m.esperado)
}

export interface EntradaRitmoVivo {
  serie: { desde: string; maquinas: MaquinaSerie[] }
  /** Acumulado del turno por máquina en la última lectura (minuto parcial incluido). */
  acumulado: Record<string, number> | null
  stopEvents?: Array<{ r: number; f: string; s: number; m?: number }> | null
  stopReasons?: string[] | null
  stopMachines?: string[] | null
  /** Perillas de la línea (`live.perillas`): sin ellas, la vara de cada minuto es el esperado de Shoplogix. */
  perillas?: PerillasDeLinea | null
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
  /** `detenida`: los últimos minutos cerrados vienen en cero; una recta sobre ceros decía «Estable · 0 → 0». */
  dir: 'subiendo' | 'estable' | 'bajando' | 'detenida'
  /** Valor de la recta al inicio y al final de la ventana, en pz/min. */
  desde: number
  hasta: number
  /** Minutos cerrados que entraron en la cuenta. */
  n: number
  /** Con `detenida`: minutos seguidos en cero al final. */
  ceros?: number
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
  /* Tres minutos seguidos en cero al final: no es una tendencia, la línea (o la Baader) está detenida. */
  let ceros = 0
  for (let i = n - 1; i >= 0 && valores[i] === 0; i--) ceros++
  if (ceros >= 3) return { dir: 'detenida', desde, hasta: 0, n, ceros }
  const rel = (hasta - desde) / esperadoLinea
  return { dir: Math.abs(rel) < UMBRAL_TENDENCIA ? 'estable' : rel > 0 ? 'subiendo' : 'bajando', desde, hasta, n }
}

// ── Paradas por máquina ──────────────────────────────────────────────────────

export type Intervalo = [number, number]

export function unir(iv: Intervalo[]): Intervalo[] {
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
      const a0 = Date.parse(x.f)
      if (!Number.isFinite(a0) || !(x.s > 0)) continue
      /* Misma regla del segundo que `paradasDetalle`: el inicio se baja al segundo y el fin es ese inicio más la duración. Así los segundos
         andando del llenado, del tono de la celda y de la compuerta del ritmo son los mismos que dice el globo del minuto (Chonchi 02-11:
         15:00 Ev 1, 15:17 Ev 1 y 15:21 Ev 2 andaban 30 s con el piso y 29,60, 29,44 y 29,37 con los milisegundos crudos: el globo decía
         «30 s andando» y «sin dato» a la vez). */
      const a = Math.floor(a0 / 1000) * 1000
      const iv: Intervalo = [a, a + x.s * 1000]
      poner(todas, id, iv)
      if (esMicroDetencion(e.stopReasons?.[x.r])) poner(micro, id, iv)
    }
  }
  for (const p of e.enCurso) poner(todas, p.id, [Math.floor(p.desdeMs / 1000) * 1000, Number.POSITIVE_INFINITY])
  for (const [id, l] of todas) todas.set(id, unir(l))
  for (const [id, l] of micro) micro.set(id, unir(l))
  return { separa, todas, micro }
}

/**
 * Las micro detenciones de cada máquina SIN unir, con inicio y duración tal como las publica Shoplogix
 * (`stopEvents[].f` y `.s`). Sin `stopMachines`/`m` no se sabe de qué máquina fue cada una: devuelve vacío.
 */
export function microsPorMaquina(e: Pick<EntradaRitmoVivo, 'stopEvents' | 'stopReasons' | 'stopMachines'>): Map<string, Array<{ inicioMs: number; duracionS: number }>> {
  const out = new Map<string, Array<{ inicioMs: number; duracionS: number }>>()
  const ids = e.stopMachines ?? []
  const eventos = e.stopEvents ?? []
  if (!ids.length || !eventos.every((x) => x.m != null && ids[x.m] != null)) return out
  for (const x of eventos) {
    if (!esMicroDetencion(e.stopReasons?.[x.r])) continue
    const a = Date.parse(x.f)
    if (!Number.isFinite(a) || !(x.s > 0)) continue
    const id = ids[x.m!]!
    const item = { inicioMs: a, duracionS: x.s }
    const l = out.get(id)
    if (l) l.push(item)
    else out.set(id, [item])
  }
  for (const l of out.values()) l.sort((p, q) => p.inicioMs - q.inicioMs)
  return out
}

export type TipoParada = 'micro' | 'detencion' | 'programada'

/**
 * Una parada de una máquina tal como la anota Shoplogix (sin unir con otras), lista para dibujarse al segundo.
 *
 * REGLA ÚNICA DEL SEGUNDO: Shoplogix manda el inicio con ruido de milisegundos (entre 0,001 y 0,997 s sobre su paso de 15 s). Aquí el inicio
 * se baja al segundo (`Math.floor`) y el fin es ese inicio más la duración entera de la parada: lo que mira el usuario son segundos, y así
 * dos paradas pegadas (una termina 15:17:30,564 y la otra empieza 15:17:30,607) quedan pegadas, no separadas por 43 ms. Caso medido: el
 * fin de la colación del Filete 02-11 está guardado en 14:16:29,949; con el dato crudo la Baader «andaba» 30,05 s de ese minuto, con el
 * piso 31 s. Un solo criterio para el inicio, el fin y los segundos andando.
 */
export interface ParadaDetalle {
  tipo: TipoParada
  /** Inicio bajado al segundo (wall-as-UTC ms). */
  iniMs: number
  /** Fin = `iniMs` + duración (infinito en una parada en curso). */
  finMs: number
  /** Duración anotada, en segundos (infinito en una parada en curso). */
  durS: number
  /** El inicio tal como viene del doc (con milisegundos): sirve para reconocer la misma parada en `clasificarMicros`. */
  inicioCrudoMs: number
  /** El motivo que anotó Shoplogix («Micro Detencion», «COLACION», «Detencion»…); null en una parada en curso. */
  razon: string | null
  /** Sigue en curso: todavía no tiene fin ni motivo en el doc (se sabe solo que la máquina está detenida). */
  abierta?: boolean
}

/**
 * Las paradas de cada máquina SIN unir, con su tipo: micro (`esMicroDetencion`), programada (el mismo criterio de `ritmoVivoDeMonitor`: el
 * motivo cae en «planificado») o detención (todo lo demás). Más la parada en curso (`enCurso`), de tipo detención y marcada `abierta`:
 * su motivo no viaja en el doc. Sin `stopMachines`/`m` no se sabe de qué máquina fue cada parada: devuelve solo las en curso.
 */
export function paradasDetalle(e: Pick<EntradaRitmoVivo, 'stopEvents' | 'stopReasons' | 'stopMachines' | 'enCurso'>): Map<string, ParadaDetalle[]> {
  const out = new Map<string, ParadaDetalle[]>()
  const poner = (id: string, p: ParadaDetalle) => {
    const l = out.get(id)
    if (l) l.push(p)
    else out.set(id, [p])
  }
  const eventos = e.stopEvents ?? []
  const ids = e.stopMachines ?? []
  if (ids.length > 0 && eventos.every((x) => x.m != null && ids[x.m] != null)) {
    for (const x of eventos) {
      const a = Date.parse(x.f)
      if (!Number.isFinite(a) || !(x.s > 0)) continue
      const razon = e.stopReasons?.[x.r] ?? null
      const tipo: TipoParada = esMicroDetencion(razon) ? 'micro' : classifyLossState({ type: 'break', reason: razon ?? undefined }) === 'planificado' ? 'programada' : 'detencion'
      const iniMs = Math.floor(a / 1000) * 1000
      poner(ids[x.m!]!, { tipo, iniMs, finMs: iniMs + x.s * 1000, durS: x.s, inicioCrudoMs: a, razon })
    }
  }
  for (const p of e.enCurso) {
    const iniMs = Math.floor(p.desdeMs / 1000) * 1000
    poner(p.id, { tipo: 'detencion', iniMs, finMs: Number.POSITIVE_INFINITY, durS: Number.POSITIVE_INFINITY, inicioCrudoMs: p.desdeMs, razon: null, abierta: true })
  }
  for (const l of out.values()) l.sort((p, q) => p.iniMs - q.iniMs || p.finMs - q.finMs)
  return out
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

/** Una micro detención de una máquina, con su duración REAL (`stopEvents[].s`). */
export interface MicroDetalle {
  /** Índice del minuto (0 = primero de la tira) en que empezó, o 0 si empezó antes de la tira. */
  i: number
  /** Inicio real, wall-as-UTC ms. */
  inicioMs: number
  /** Duración real en segundos, tal como la publica Shoplogix. */
  duracionS: number
}

export interface LineaLlenado {
  id: string
  nombre: string
  esperado: number
  /** De dónde sale la vara del último minuto: la perilla o el esperado de Shoplogix (`varaDeMinuto`). */
  fuente: FuenteVara
  /** % de llenado por minuto cerrado (0–100); null = sin dato (parada o <30 s andando). */
  fills: Array<number | null>
  /** Índices de minuto con micro detención de ESA máquina. */
  micros: number[]
  /** Cada micro de ESA máquina que toca la tira, con inicio y duración real. */
  microsDetalle: MicroDetalle[]
  ini: number | null
  fin: number | null
  baja: boolean
  tono: Tono | null
  microsRecientes: number
}

export type SenalTono = 'atento' | 'mal' | 'neutra'
export interface Senal { tono: SenalTono; texto: string }

/** La tira de 15 min de UNA Baader, con SU esperado (`serieMinuto.maquinas[].esperado`). */
export interface SerieMaquina {
  id: string
  nombre: string
  esperado: number
  minutos: MinutoLinea[]
  /** Piezas del minuto en curso de ESTA máquina, o null si el dato no cuadra. */
  curso: number | null
}

export interface RitmoVivo {
  minutos: MinutoLinea[]
  /** La misma tira, máquina por máquina (en el orden de la serie). */
  porMaquina: SerieMaquina[]
  /** Inicio del primer minuto de la tira, wall-as-UTC ms (para ubicar una micro dentro del minuto). */
  inicioTiraMs: number
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
  /** Carros con pieza de los minutos cerrados de `lineas` (la ventana de la franja), con la regla de `vaciosTurnoDe`: Σ piezas ÷ Σ (vara × fracción andando). Es la cifra del panel, no el último minuto. */
  carrosVentana: VaciosTurno
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
  const mp = microsPorMaquina(e)
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
        const vara = varaEnMinuto(m, t0, i, e.perillas)!
        const v = (m.cycles[i] ?? 0) / (vara * (andando / 60))
        fills.push(Math.min(100, Math.round(v * 100)))
      }
      if (segundosCubiertos(pp.micro.get(m.id), ini, fin) > 0) micros.push(i - i0)
    }
    const iniVentana = t0 + i0 * 60_000
    const finVentana = t0 + n * 60_000
    const microsDetalle: MicroDetalle[] = []
    for (const mi of mp.get(m.id) ?? []) {
      if (mi.inicioMs + mi.duracionS * 1000 <= iniVentana || mi.inicioMs >= finVentana) continue
      microsDetalle.push({ i: Math.max(0, Math.floor((mi.inicioMs - t0) / 60_000) - i0), inicioMs: mi.inicioMs, duracionS: mi.duracionS })
    }
    const validos = fills.filter((x): x is number => x != null)
    const ini = validos.length >= 6 ? Math.round(media(validos.slice(0, 3))) : null
    const fin = validos.length >= 6 ? Math.round(media(validos.slice(-3))) : null
    const baja = ini != null && fin != null && ini - fin >= CAIDA_LLENADO_PP
    const varaUltimo = varaDeMinuto(m, t0, Math.max(0, n - 1), e.perillas)
    lineas.push({
      id: m.id,
      nombre: m.nombre,
      esperado: varaUltimo.cpm!,
      fuente: varaUltimo.fuente,
      fills,
      micros,
      microsDetalle,
      ini,
      fin,
      baja,
      tono: baja && fin != null ? (fin < 50 ? 'mal' : 'atento') : null,
      microsRecientes: micros.filter((x) => x >= fills.length - 7).length,
    })
  }
  return { lineas, separaParadas: pp.separa }
}

// ── Carros (o silletas) vacíos del turno ─────────────────────────────────────

export interface VaciosMaquina {
  id: string
  nombre: string
  /** Lo que pasó mientras la Baader andaba: velocidad seteada (`esperado`) × segundos andando ÷ 60, en los minutos válidos. */
  pasaron: number
  /** Las piezas que la Baader contó en esos mismos minutos. */
  conPieza: number
  /** `pasaron − conPieza`, con piso en 0. */
  vacios: number
  /** `conPieza ÷ pasaron`, de 0 a 100; null si no pasó ninguno. */
  pct: number | null
}

export interface VaciosTurno {
  maquinas: VaciosMaquina[]
  /** La línea es la SUMA de sus Baader (cada cifra ya redondeada: lo que se ve en la tabla suma lo que dice la fila de la línea). */
  linea: Omit<VaciosMaquina, 'id' | 'nombre'>
  /** Cuántos minutos del turno entraron (al menos una Baader con dato válido). */
  minutos: number
}

/**
 * ESTIMACIÓN de los carros (o silletas) que llegaron a cada Baader sin pescado: la capacidad de la máquina mientras anduvo
 * contra lo que contó. Misma regla de minutos válidos que `llenadoDe`: una Baader sin esperado no entra, un minuto con menos de
 * `ANDANDO_MIN_S` andando no cuenta y un minuto con la línea entera en cero tampoco (no se distingue de una parada pactada que
 * no viaja en `stopEvents`). Un minuto que la serie de esa Baader aún no tiene tampoco cuenta (no es un cero).
 *
 * `vacios` son carros que pasaron sin pieza: pescado que no llegó a la Baader, no una falla de la máquina.
 * Cada cifra por Baader se redondea ANTES de sumar la línea y de restar, así la tabla cuadra a la vista.
 */
export function vaciosTurnoDe(
  serie: { desde: string; maquinas: MaquinaSerie[] },
  n: number,
  paradas?: Pick<EntradaRitmoVivo, 'stopEvents' | 'stopReasons' | 'stopMachines' | 'enCurso'> | null,
  perillas?: PerillasDeLinea | null,
): VaciosTurno {
  const t0 = Date.parse(serie.desde)
  const pp = paradasPorMaquina({ stopEvents: paradas?.stopEvents ?? null, stopReasons: paradas?.stopReasons ?? null, stopMachines: paradas?.stopMachines ?? null, enCurso: paradas?.enCurso ?? [] })
  const usados = new Set<number>()
  const maquinas: VaciosMaquina[] = []
  if (Number.isFinite(t0)) {
    for (const m of serie.maquinas) {
      if (!(m.esperado != null && m.esperado > 0)) continue
      let capacidad = 0
      let conPieza = 0
      for (let i = 0; i < n && i < m.cycles.length; i++) {
        const ini = t0 + i * 60_000
        const andando = 60 - segundosCubiertos(pp.todas.get(m.id), ini, ini + 60_000)
        const lineaEnCero = serie.maquinas.every((x) => (x.cycles[i] ?? 0) === 0)
        if (andando < ANDANDO_MIN_S || lineaEnCero) continue
        capacidad += varaEnMinuto(m, t0, i, perillas)! * (andando / 60)
        conPieza += m.cycles[i] ?? 0
        usados.add(i)
      }
      const pasaron = Math.round(capacidad)
      maquinas.push({
        id: m.id, nombre: m.nombre, pasaron, conPieza,
        vacios: Math.max(0, pasaron - conPieza),
        pct: pasaron > 0 ? Math.min(100, (conPieza / pasaron) * 100) : null,
      })
    }
  }
  const suma = (f: (x: VaciosMaquina) => number) => maquinas.reduce((a, x) => a + f(x), 0)
  const pasaron = suma((x) => x.pasaron)
  const conPieza = suma((x) => x.conPieza)
  return {
    maquinas,
    linea: { pasaron, conPieza, vacios: suma((x) => x.vacios), pct: pasaron > 0 ? Math.min(100, (conPieza / pasaron) * 100) : null },
    minutos: usados.size,
  }
}

/**
 * Señales sobrias: lo que el dato muestra y qué mirar; nunca afirman una causa. Las cifras que citan son las del PANEL
 * (`cifraPanel`, de `carrosVentana`: los mismos 15 min y la misma regla). La caída compara el inicio y el fin de la tira
 * (3 minutos cada uno), que no es esa cifra: por eso la caída se dice SIN porcentajes. Así hay un solo número por máquina.
 */
export function senalesDe(lineas: LineaLlenado[], unidad: 'carros' | 'silletas' | null, separaParadas: boolean, cifraPanel: Record<string, number | null> = {}): Senal[] {
  const cosa = unidad ? `${unidad} con pieza` : 'llenado'
  const out: Senal[] = []
  const n = lineas.length
  const medidas = lineas.filter((l) => l.ini != null && l.fin != null)
  const bajan = medidas.filter((l) => l.baja)
  /* Sin una cifra del panel por cada máquina medida no se cita ninguna: no se muestra un rango a medias. */
  const citable = medidas.length > 0 && medidas.every((l) => cifraPanel[l.id] != null)
  const valoresPanel = citable ? medidas.map((l) => cifraPanel[l.id]!) : []
  if (medidas.length === 0) {
    out.push({ tono: 'neutra', texto: 'Todavía no hay minutos con llenado medible para dar una señal.' })
  } else if (n > 1) {
    if (bajan.length === n) {
      out.push({ tono: 'atento', texto: `Bajan las ${n} a la vez en los 15 min de ${cosa}. Cuando caen juntas conviene revisar la alimentación o la MMPP; el dato no confirma la causa.` })
    } else if (bajan.length === 1) {
      const b = bajan[0]!
      const otras = medidas.filter((l) => !l.baja).length
      out.push({ tono: 'atento', texto: `Solo baja ${b.nombre} en los 15 min de ${cosa}${otras ? '; las otras no bajan' : ''}. Conviene revisar esa máquina.` })
    } else if (bajan.length > 1) {
      out.push({ tono: 'atento', texto: `Bajan ${bajan.map((l) => l.nombre).join(' y ')} en los 15 min de ${cosa}. El dato no confirma la causa.` })
    } else {
      out.push({ tono: 'neutra', texto: citable ? `Llenado parejo en las ${n}: ${rangoTxt(valoresPanel)} % de ${cosa}. Sin señales.` : `Llenado parejo en las ${n}. Sin señales.` })
    }
  } else {
    const l = medidas[0]!
    const cap = `${cosa[0]!.toUpperCase()}${cosa.slice(1)}`
    out.push(l.baja
      ? { tono: 'atento', texto: `${cap} baja en los 15 min. Conviene revisar la máquina.` }
      : { tono: 'neutra', texto: citable ? `${cap} estable, ${valoresPanel[0]} %. Sin señales.` : `${cap} estable. Sin señales.` })
  }
  for (const l of medidas) {
    if (l.baja && l.microsRecientes >= 2) {
      out.push({ tono: 'mal', texto: `${l.nombre} suma ${l.microsRecientes} micro detenciones en 7 min mientras baja el llenado. Señal temprana: puede ser una falla o MMPP difícil; el dato no lo confirma.` })
    }
  }
  if (!separaParadas) {
    out.push({ tono: 'neutra', texto: 'Llenado sin separar detenciones: este registro no dice de qué máquina fue cada una.' })
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
  const perillas = e.perillas
  /* La vara de la línea en el minuto i: la suma de la vara de cada Baader en ese minuto (sin perillas, la suma de sus esperados). */
  const varaLineaEn = (i: number) => maq.reduce((a, m) => a + varaEnMinuto(m, t0, i, perillas)!, 0)
  /* Los escalares de la tarjeta («de X», ahora %, tendencia) van con la vara del último minuto cerrado. */
  const esperadoLinea = varaLineaEn(n - 1)
  const i0 = Math.max(0, n - MINUTOS_CERRADOS)
  const minutos: MinutoLinea[] = []
  for (let i = i0; i < n; i++) {
    const piezas = maq.reduce((a, m) => a + (m.cycles[i] ?? 0), 0)
    minutos.push({ hora: hh(t0 + i * 60_000), piezas, tono: tonoDe(piezas / varaLineaEn(i)) })
  }
  const ahora = minutos[minutos.length - 1]!.piezas

  /* El minuto en curso de cada máquina: acumulado de la última lectura menos lo ya cerrado. Un parcial
     imposible (serie recortada, minutos sin cerrar) no se dibuja. */
  const cursoDe = (m: MaquinaSerie): number | null => {
    const acc = e.acumulado?.[m.id]
    if (acc == null) return null
    const c = Math.max(0, acc - m.cycles.slice(0, n).reduce((x, y) => x + y, 0))
    return c > varaEnMinuto(m, t0, n, perillas)! * 1.5 ? null : c
  }
  const porMaquina: SerieMaquina[] = maq.map((m) => ({
    id: m.id,
    nombre: m.nombre,
    esperado: varaEnMinuto(m, t0, n - 1, perillas)!,
    curso: cursoDe(m),
    minutos: Array.from({ length: n - i0 }, (_, k) => {
      const piezas = m.cycles[i0 + k] ?? 0
      return { hora: hh(t0 + (i0 + k) * 60_000), piezas, tono: tonoDe(piezas / varaEnMinuto(m, t0, i0 + k, perillas)!) }
    }),
  }))

  let curso: number | null = null
  if (e.acumulado && maq.every((m) => e.acumulado![m.id] != null)) {
    curso = maq.reduce((a, m) => a + Math.max(0, e.acumulado![m.id]! - m.cycles.slice(0, n).reduce((x, y) => x + y, 0)), 0)
    /* Un parcial imposible (serie recortada, minutos sin cerrar) no se dibuja. */
    if (curso > varaLineaEn(n) * 1.5) curso = null
  }

  const { lineas, separaParadas } = llenadoDe(e, i0, n)
  /* Carros con pieza de la misma ventana que dibuja el panel (los minutos cerrados de `lineas`), con la regla de `vaciosTurnoDe`
     sobre la serie recortada a esa ventana. Es Σ piezas ÷ Σ (vara × fracción andando): ni el último minuto ni un promedio de porcentajes. */
  const carrosVentana = vaciosTurnoDe(
    { desde: new Date(t0 + i0 * 60_000).toISOString(), maquinas: maq.map((m) => ({ ...m, cycles: m.cycles.slice(i0, n) })) },
    n - i0,
    e,
    e.perillas,
  )
  /* La cifra del panel de cada Baader (`carrosVentana`, redondeada como se muestra): la señal la cita tal cual. */
  const cifraPanel: Record<string, number | null> = Object.fromEntries(carrosVentana.maquinas.map((x) => [x.id, x.pct == null ? null : Math.round(x.pct)]))
  return {
    minutos,
    porMaquina,
    inicioTiraMs: t0 + i0 * 60_000,
    esperadoLinea,
    ahora,
    ahoraPct: Math.round((ahora / esperadoLinea) * 100),
    tendencia: tendenciaDe(minutos.map((m) => m.piezas), esperadoLinea),
    curso,
    horaCurso: hh(t0 + n * 60_000),
    lineas,
    separaParadas,
    carrosVentana,
    senales: senalesDe(lineas, unidad, separaParadas, cifraPanel),
    unidad,
  }
}

/**
 * El llenado que la tarjeta «Ritmo en vivo» pone a la derecha de cada Baader: la MISMA cifra del panel de 15 min
 * (`carrosVentana`, redondeada como se muestra), no el último minuto. La página y el banco llaman a esta función, así
 * las dos columnas salen de una sola fuente. El nombre `ultimo` es de antes: ya no es el último minuto.
 */
export function llenadoDelPanel(r: RitmoVivo): Array<{ id: string; ultimo: number | null }> {
  return r.lineas.map((l) => {
    const pct = r.carrosVentana.maquinas.find((x) => x.id === l.id)?.pct
    return { id: l.id, ultimo: pct == null ? null : Math.round(pct) }
  })
}

// ── Qué se ve: la línea o una Baader ─────────────────────────────────────────

/** Lo que dibuja la tira de 15 min y el «último minuto»: la suma de la línea o UNA Baader con su esperado. */
export interface VistaSerie {
  /** `SEL_LINEA` o el id de la máquina. */
  sel: string
  nombre: string
  esperado: number
  minutos: MinutoLinea[]
  curso: number | null
  /** Piezas del último minuto cerrado. */
  ahora: number
  ahoraPct: number
  tendencia: Tendencia | null
}

export const SEL_LINEA = 'linea'

/**
 * La etiqueta corta de una máquina para el selector y las franjas, sacada de su nombre REAL:
 * «Evisceradora 2» → «Ev 2». Un nombre que no calza con «palabra + número» va tal cual (acotado).
 */
export function etiquetaMaquina(nombre: string): string {
  const t = nombre.trim()
  /* Solo se abrevia una palabra larga («Evisceradora», «Fileteadora»); «Línea 1» o «Baader 2» ya caben tal cual. */
  const m = /^(\p{L}{2})\p{L}{6,}[\s\-_]*(\d+)$/u.exec(t)
  if (m) return `${m[1]![0]!.toUpperCase()}${m[1]![1]!.toLowerCase()} ${m[2]}`
  return t.length > 10 ? `${t.slice(0, 9)}…` : t
}

/** La serie de lo elegido; una selección que ya no existe (otra línea, otro turno) vuelve a la línea. */
export function vistaDeSerie(r: RitmoVivo, sel: string): VistaSerie {
  const m = sel === SEL_LINEA ? null : r.porMaquina.find((x) => x.id === sel) ?? null
  const minutos = m ? m.minutos : r.minutos
  const esperado = m ? m.esperado : r.esperadoLinea
  const ahora = minutos[minutos.length - 1]?.piezas ?? 0
  return {
    sel: m ? m.id : SEL_LINEA,
    nombre: m ? m.nombre : 'Línea',
    esperado,
    minutos,
    curso: m ? m.curso : r.curso,
    ahora,
    ahoraPct: Math.round((ahora / esperado) * 100),
    tendencia: m ? tendenciaDe(minutos.map((x) => x.piezas), esperado) : r.tendencia,
  }
}

/** La Baader que baja (mayor caída de llenado sobre `CAIDA_LLENADO_PP`); si ninguna baja, null. */
export function maquinaQueBaja(lineas: LineaLlenado[]): LineaLlenado | null {
  let mejor: LineaLlenado | null = null
  let caida = 0
  for (const l of lineas) {
    if (!l.baja || l.ini == null || l.fin == null) continue
    const c = l.ini - l.fin
    if (c > caida) { mejor = l; caida = c }
  }
  return mejor
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

/**
 * La causa de la parada como se lee en pantalla. «Detencion» o «Micro detencion» es lo que pone Shoplogix cuando nadie la
 * clasificó: también es un dato (la detención quedó sin causa), así que se dice, con tilde y sin repetir «detenida» a secas.
 */
export function causaLegible(razon: string | null | undefined): string | null {
  if (razon == null) return null
  if (!RAZONES_SIN_CAUSA.has(normalizar(razon))) return razon
  if (normalizar(razon) === '') return null
  return esMicroDetencion(razon) ? 'Micro detención, sin causa anotada' : 'Detención, sin causa anotada'
}
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

/** ¿La banda de parada (`BandaParadaV2`) va a dibujar algo? La misma regla que ella: así la franja sabe si la causa ya está a la vista. */
export function hayBandaParada(maquinas: MaquinaVivo[], turnoTerminado?: boolean): boolean {
  return !turnoTerminado && paradaEnCurso(maquinas) != null
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
    perillas: live.perillas,
    enCurso: maquinas.filter((m) => m.status === 'detenida' && m.desdeMs != null).map((m) => ({ id: m.id, desdeMs: m.desdeMs! })),
  }, unidadDeMaquinas(live.machines))
  return r ? { r, maquinas } : null
}
