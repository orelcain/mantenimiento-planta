/**
 * «Reproducción del último minuto» del monitor de turno (Fase 6 del Duelo; DESIGN.md §8, excepción «reloj de datos»).
 *
 * Lógica pura, sin React ni DOM: la usa `useReproduccionMinuto` y la prueban los tests.
 *
 * ── Qué hace ────────────────────────────────────────────────────────────────
 * El monitor no inventa piezas: vuelve a pasar, con desfase, el último minuto CERRADO que Shoplogix ya entregó
 * (`pulse.serieMinuto`), pieza a pieza y Baader por Baader. Las `n` piezas de una Baader en el minuto caen una a una,
 * repartidas en los segundos que la máquina ANDUVO (el minuto menos sus detenciones de `live.stopEvents`):
 * la pieza j cae en el segundo andando `U·(j+0,5)/n`. Parejo y centrado, sin azar: no se conoce el segundo real.
 *
 *   · el avance es por MINUTO CERRADO de la serie, no por lectura del contador (3 de cada 10 lecturas vienen repetidas);
 *   · el minuto dura lo que de verdad pasó entre dos llegadas (`intervaloMedido`, tope 90 s);
 *   · al cerrar el minuto cada Baader vale EXACTAMENTE Σ cycles[0..k] y la línea es la suma de las Baader;
 *   · nunca se muestra más de lo que registra el contador vivo de Shoplogix (`Tope`): ni por Baader ni en total;
 *   · si la lectura se atrasa (> 1,5 × el intervalo) todo se queda quieto en el total cerrado;
 *   · un contador que baja (otro turno, reconciliación), otra serie o un hueco de más de 3 min NO se anima: salta.
 *
 * ── Dos relojes distintos (⚠) ───────────────────────────────────────────────
 * `serieMinuto.desde` y `stopEvents[].f` vienen en HORA DE PLANTA marcada con una Z falsa (wall-clock-as-UTC);
 * `pulse.at` y `lecturas[].at` vienen en UTC REAL. Entre sí solo se comparan los de la misma base. Para mostrar la hora
 * de una lectura real se convierte con `horaPlantaDeUtc` (America/Santiago), nunca con `toISOString().slice(11, 16)`.
 *
 * ── Orden de `stopEvents[].m` ───────────────────────────────────────────────
 * `m` indexa `live.stopMachines` (functions/publicMonitor.js: `stopMachines = machines.map(m => m.id)`), que sale en el
 * mismo orden que `live.machines`. Se cruza SIEMPRE por id; solo si el doc es viejo y no trae `stopMachines` se cae al
 * orden de `live.machines`.
 */
import { aWallClockMs } from './contadorCrudo'
import { intervaloMedido, lecturaAtrasada, relojInicial, type EstadoReloj } from './relojDeDatos'

export const SEG_MINUTO = 60
export const MIN_MS = 60_000
/** Más minutos que esto sin verse = hueco (pestaña dormida, sync caído): salta, no se anima. */
export const MINUTOS_HUECO_MAX = 3
/** Una Baader que anduvo menos que esto del minuto está «parcial». */
export const SEG_PARCIAL = 58

/** Un tramo del minuto, en segundos [a, b) desde su inicio. */
export type Tramo = readonly [number, number]
/** Una detención de una Baader: inicio (ms, hora de planta) y segundos que duró. */
export interface ParadaMs { fMs: number; s: number }

// ── Relojes ──────────────────────────────────────────────────────────────────

/** HH:MM de planta de un instante UTC REAL (ms). null si no hay. */
export function horaPlantaDeUtc(utcMs: number | null | undefined): string | null {
  if (utcMs == null || !Number.isFinite(utcMs)) return null
  const wall = aWallClockMs(new Date(utcMs).toISOString())
  return wall == null ? null : new Date(wall).toISOString().slice(11, 16)
}

/** HH:MM de un instante que ya está en hora de planta (wall-as-UTC). */
export const horaDeWall = (wallMs: number): string => new Date(wallMs).toISOString().slice(11, 16)

// ── Paradas por Baader ───────────────────────────────────────────────────────

/**
 * Las detenciones de cada Baader, cruzadas por id. `m` es el índice en `stopMachines`; sin ese arreglo (doc viejo)
 * se usa el orden de `live.machines`. Una parada sin máquina conocida no se aplica a nadie (no se adivina).
 */
export function paradasPorMaquina(
  stopEvents: ReadonlyArray<{ f: string; s: number; m?: number }> | null | undefined,
  stopMachines: readonly string[] | null | undefined,
  idsEnOrdenDeMaquinas: readonly string[],
): Record<string, ParadaMs[]> {
  const out: Record<string, ParadaMs[]> = {}
  for (const id of idsEnOrdenDeMaquinas) out[id] = []
  for (const e of stopEvents ?? []) {
    if (e.m == null) continue
    const id = (stopMachines ?? idsEnOrdenDeMaquinas)[e.m]
    const lista = id != null ? out[id] : undefined
    if (!lista) continue
    const fMs = Date.parse(e.f)
    if (!Number.isFinite(fMs) || !(e.s > 0)) continue
    lista.push({ fMs, s: e.s })
  }
  return out
}

/**
 * Los tramos del minuto [0, 60) s en que la Baader andaba: el minuto menos el cruce con cada detención.
 * `desdeMs` es el inicio del minuto en la misma base (hora de planta) que `ParadaMs.fMs`.
 */
export function tramosAndando(paradas: readonly ParadaMs[], desdeMs: number): Tramo[] {
  let tramos: Tramo[] = [[0, SEG_MINUTO]]
  for (const p of paradas) {
    const a = (p.fMs - desdeMs) / 1000
    const b = a + p.s
    if (b <= 0 || a >= SEG_MINUTO) continue
    const nuevos: Tramo[] = []
    for (const t of tramos) {
      if (b <= t[0] || a >= t[1]) { nuevos.push(t); continue }
      if (a > t[0]) nuevos.push([t[0], a])
      if (b < t[1]) nuevos.push([b, t[1]])
    }
    tramos = nuevos
  }
  return tramos
}

export const segundosAndando = (tramos: readonly Tramo[]): number => tramos.reduce((s, t) => s + (t[1] - t[0]), 0)

// ── Reparto de las piezas dentro del minuto ──────────────────────────────────

/**
 * En qué segundo del minuto cae cada una de las `n` piezas (crecientes, todas dentro de un tramo andando).
 * La pieza j cae en el segundo andando `U·(j+0,5)/n`. Con `n = 0` no hay piezas. Si el dato cruzado deja menos de
 * 1 s andando pero hubo piezas, se usa el minuto entero (el cruce está mal o la parada es micro: no se pierde ninguna).
 */
export function horarioPiezas(n: number, tramos: readonly Tramo[]): number[] {
  const cuenta = Math.max(0, Math.round(n))
  if (cuenta === 0) return []
  let tr = tramos
  let u = segundosAndando(tr)
  if (u < 1) { tr = [[0, SEG_MINUTO]]; u = SEG_MINUTO }
  const out: number[] = []
  for (let j = 0; j < cuenta; j++) {
    let resto = (u * (j + 0.5)) / cuenta
    let puesta = false
    for (const [a, b] of tr) {
      if (resto <= b - a) { out.push(a + resto); puesta = true; break }
      resto -= b - a
    }
    if (!puesta) out.push(tr[tr.length - 1]![1])
  }
  return out
}

/** Cuántas piezas del horario ya cayeron a los `seg` segundos del minuto. */
export function piezasEncendidas(horario: readonly number[], seg: number): number {
  let c = 0
  for (const t of horario) { if (t <= seg) c++; else break }
  return c
}

// ── Entrada y estado ─────────────────────────────────────────────────────────

export interface MaquinaRep {
  id: string
  nombre: string
  /** «Baader 142» / «Baader 200»: decide si se cuentan carros o silletas. */
  modelo?: string | null
  esperado: number | null
  /** Piezas de cada minuto CERRADO desde el inicio del turno. */
  cycles: number[]
}

export interface EntradaRep {
  /** Inicio del minuto 0 de `cycles`, hora de planta (wall-as-UTC). */
  desdeMs: number
  maquinas: MaquinaRep[]
  paradas: Record<string, ParadaMs[]>
  /** Hora REAL (UTC) del pulso que trajo esta serie. null si no se sabe. */
  pulsoAtMs: number | null
}

/** Lo que registra el contador vivo de Shoplogix: lo que la reproducción jamás supera. */
export interface Tope {
  total: number | null
  porMaquina: Record<string, number> | null
}

export type EstadoMaquina = 'andando' | 'parcial' | 'detenida'

export interface MinutoMaq {
  id: string
  nombre: string
  modelo: string | null
  esperado: number | null
  /** Piezas del minuto en reproducción. */
  n: number
  /** Segundo del minuto en que cae cada pieza. */
  horario: number[]
  tramos: Tramo[]
  segAndando: number
  estado: EstadoMaquina
}

export interface EstadoRep {
  desdeMs: number | null
  ids: string[]
  /** Minutos cerrados vistos; el que se reproduce es el índice `cerrados - 1`. */
  cerrados: number
  minuto: MinutoMaq[]
  /** Contador de cada Baader al empezar el minuto (= Σ cycles hasta el minuto anterior). */
  piso: number[]
  /** Y al cerrarlo (= Σ cycles hasta este minuto). */
  final: number[]
  /** Reloj monotónico (performance.now) en que entró el minuto. */
  llegadaMs: number
  pulsoAtMs: number | null
  /** Cuánto dura la reproducción del minuto. 0 = salto, sin animar. */
  duracionMs: number
  /** Total de la línea en los dos últimos minutos cerrados (para saber si la línea paró). */
  recientes: number[]
}

export const repInicial = (): EstadoRep => ({
  desdeMs: null, ids: [], cerrados: 0, minuto: [], piso: [], final: [], llegadaMs: 0, pulsoAtMs: null, duracionMs: 0, recientes: [],
})

const suma = (v: readonly number[]) => v.reduce((a, b) => a + b, 0)
const mismosIds = (a: readonly string[], b: readonly string[]) => a.length === b.length && a.every((x, i) => x === b[i])

/** Minutos cerrados que trae la serie (el menor de las Baader: si una viene corta, no se inventa su minuto). */
export function minutosCerrados(e: Pick<EntradaRep, 'maquinas'>): number {
  return e.maquinas.length ? Math.min(...e.maquinas.map((m) => m.cycles.length)) : 0
}

/** Σ cycles[0..k] de una Baader (k incluido). */
export function acumuladoHasta(cycles: readonly number[], k: number): number {
  let s = 0
  for (let j = 0; j <= k && j < cycles.length; j++) s += cycles[j] ?? 0
  return s
}

/** El contador de cada Baader al cerrar el último minuto cerrado de la serie (Σ cycles hasta ahí). Vacío sin minutos. */
export function finalesCerrados(e: Pick<EntradaRep, 'maquinas'>): number[] {
  const largo = minutosCerrados(e)
  return largo < 1 ? [] : e.maquinas.map((m) => acumuladoHasta(m.cycles, largo - 1))
}

/**
 * Lo que la reproducción muestra EN REPOSO (cuando el último minuto ya cayó entero): Σ de los minutos cerrados, topado por
 * el contador vivo. Es `totalFinal` del cuadro, calculado desde la entrada sin esperar al hook: la franja, el gráfico y
 * Camino a la meta lo usan para decir lo mismo en «A esta hora». null sin serie (nada que reproducir).
 */
export function totalEnReposo(e: Pick<EntradaRep, 'maquinas'> | null | undefined, limite: Tope | null | undefined): number | null {
  if (!e) return null
  const finales = finalesCerrados(e)
  return finales.length ? tope(suma(finales), limite?.total) : null
}

/**
 * Registra la serie que llegó. Devuelve el MISMO objeto si no hay un minuto cerrado nuevo (así el llamador compara por
 * identidad: una lectura repetida no reinicia nada). Con un minuto nuevo, el que se reproduce es SOLO el último: si
 * llegaron varios de golpe, los anteriores saltan a su total.
 */
export function registrarSerie(est: EstadoRep, e: EntradaRep, llegadaMs: number): EstadoRep {
  const largo = minutosCerrados(e)
  if (largo < 1) return est
  const ids = e.maquinas.map((m) => m.id)
  const mismaSerie = est.desdeMs === e.desdeMs && mismosIds(ids, est.ids)
  if (mismaSerie && est.cerrados === largo) return est

  const k = largo - 1
  const inicioMinuto = e.desdeMs + k * MIN_MS
  const final = e.maquinas.map((m) => acumuladoHasta(m.cycles, k))
  const piso = e.maquinas.map((m) => acumuladoHasta(m.cycles, k - 1))
  const minuto: MinutoMaq[] = e.maquinas.map((m) => {
    const n = Math.max(0, Math.round(m.cycles[k] ?? 0))
    const tramos = tramosAndando(e.paradas[m.id] ?? [], inicioMinuto)
    const seg = segundosAndando(tramos)
    return {
      id: m.id, nombre: m.nombre, modelo: m.modelo ?? null, esperado: m.esperado, n,
      horario: horarioPiezas(n, tramos), tramos, segAndando: seg,
      estado: n === 0 ? 'detenida' : seg < SEG_PARCIAL ? 'parcial' : 'andando',
    }
  })
  const totalMin = (j: number) => suma(e.maquinas.map((m) => m.cycles[j] ?? 0))
  const recientes = k >= 1 ? [totalMin(k - 1), totalMin(k)] : [totalMin(k)]

  /* Solo se anima un minuto que llega pegado al anterior de la MISMA serie y sin que el contador baje. */
  let duracionMs = 0
  if (mismaSerie && largo > est.cerrados && largo - est.cerrados <= MINUTOS_HUECO_MAX && !final.some((v, i) => v < (est.final[i] ?? 0))) {
    duracionMs = intervaloMedido(
      { valor: suma(est.final), atMs: est.pulsoAtMs },
      { valor: suma(final), atMs: e.pulsoAtMs },
      est.llegadaMs, llegadaMs,
    )
  }
  return { desdeMs: e.desdeMs, ids, cerrados: largo, minuto, piso, final, llegadaMs, pulsoAtMs: e.pulsoAtMs, duracionMs, recientes }
}

// ── El cuadro de este instante ───────────────────────────────────────────────

/** Qué parte del minuto ya corrió (0..1). Sin animación o con «reducir movimiento», 1: el minuto cae entero. */
export function fraccionRep(est: EstadoRep, ahoraMs: number, reducido: boolean): number {
  if (reducido || est.duracionMs <= 0) return 1
  return Math.min(1, Math.max(0, (ahoraMs - est.llegadaMs) / est.duracionMs))
}

/** ¿Sigue corriendo el minuto? (el hook apaga el cuadro por cuadro cuando ya no) */
export function reproduciendo(est: EstadoRep, ahoraMs: number, reducido: boolean): boolean {
  return est.cerrados > 0 && est.duracionMs > 0 && !reducido && ahoraMs - est.llegadaMs < est.duracionMs
}

/**
 * Pasado 1,5 × el intervalo sin minuto nuevo, la reproducción está congelada en el total cerrado.
 * Es `lecturaAtrasada` de siempre, aplicada a la llegada del último minuto.
 */
export function repAtrasada(est: EstadoRep, ahoraMs: number): boolean {
  if (est.cerrados < 1) return false
  const reloj: EstadoReloj = { ...relojInicial(), ultima: { valor: suma(est.final), atMs: est.pulsoAtMs }, llegadaMs: est.llegadaMs, duracionMs: est.duracionMs }
  return lecturaAtrasada(reloj, ahoraMs)
}

/** «sin lectura nueva desde hh:mm»: la hora de planta en que llegó el último minuto. */
export function desdeUltimaLectura(est: EstadoRep): string | null {
  if (est.pulsoAtMs != null) return horaPlantaDeUtc(est.pulsoAtMs)
  return est.desdeMs != null ? horaDeWall(est.desdeMs + est.cerrados * MIN_MS) : null
}

/** La línea paró: los dos últimos minutos cerrados sin una sola pieza. */
export function detenidaRep(est: EstadoRep): boolean {
  return est.recientes.length >= 2 && est.recientes.every((t) => t === 0)
}

export interface VistaMaq {
  id: string
  /** Lo que se muestra: contador de la Baader (escalón por pieza), sin pasar del contador vivo. */
  valor: number
  /** Piezas del minuto que ya cayeron. */
  encendidas: number
  /** Piezas del minuto. */
  n: number
  estado: EstadoMaquina
}

export interface CuadroRep {
  frac: number
  /** Segundo del minuto en que va el cabezal (0..60). */
  seg: number
  total: number
  /** Total al empezar el minuto y al cerrarlo (ya topados), para la recta de la curva. */
  totalPiso: number
  totalFinal: number
  porMaquina: VistaMaq[]
  atrasada: boolean
  animando: boolean
}

const tope = (v: number, t: number | null | undefined) => (t != null && Number.isFinite(t) ? Math.min(v, t) : v)

/**
 * Lo que se ve ahora: cada Baader = su contador al empezar el minuto + las piezas que ya cayeron, y la línea es la
 * suma. Es la recta de `relojDeDatos` convertida en escalones: nunca sale de [piso, cierre] ni pasa del contador vivo.
 */
export function cuadroRep(est: EstadoRep, limite: Tope | null, ahoraMs: number, reducido: boolean): CuadroRep {
  const frac = fraccionRep(est, ahoraMs, reducido)
  const seg = frac * SEG_MINUTO
  const porMaquina: VistaMaq[] = est.minuto.map((m, i) => {
    const encendidas = piezasEncendidas(m.horario, seg)
    const valor = tope((est.piso[i] ?? 0) + encendidas, limite?.porMaquina?.[m.id])
    return { id: m.id, valor, encendidas, n: m.n, estado: m.estado }
  })
  return {
    frac, seg,
    total: tope(suma(porMaquina.map((m) => m.valor)), limite?.total),
    totalPiso: tope(suma(est.piso), limite?.total),
    totalFinal: tope(suma(est.final), limite?.total),
    porMaquina,
    atrasada: repAtrasada(est, ahoraMs),
    animando: reproduciendo(est, ahoraMs, reducido),
  }
}

// ── Armado de la entrada desde el doc del monitor ───────────────────────────

/**
 * Arma la entrada de la reproducción con los campos del doc, o null si no hay con qué (sin serie por minuto, sin
 * Baader, serie vacía). `serie` es la del turno ya recortada al inicio del turno (la misma de las barras de minuto),
 * para que el contador de la reproducción parta de la misma pieza que el contador vivo.
 */
export function armarEntradaRep(a: {
  serie: { desde: string; maquinas: Array<{ id: string; nombre: string; esperado: number | null; cycles: number[] }> } | null | undefined
  machines: ReadonlyArray<{ id: string; model?: string | null }>
  stopEvents?: ReadonlyArray<{ f: string; s: number; m?: number }> | null
  stopMachines?: readonly string[] | null
  /** `pulse.at`: UTC real. */
  pulseAt?: string | null
}): EntradaRep | null {
  const s = a.serie
  if (!s?.maquinas?.length) return null
  const desdeMs = Date.parse(s.desde)
  if (!Number.isFinite(desdeMs)) return null
  const pulsoAtMs = a.pulseAt ? Date.parse(a.pulseAt) : NaN
  const modelo = new Map(a.machines.map((m) => [m.id, m.model ?? null]))
  const entrada: EntradaRep = {
    desdeMs,
    maquinas: s.maquinas.map((m) => ({ id: m.id, nombre: m.nombre, modelo: modelo.get(m.id) ?? null, esperado: m.esperado, cycles: m.cycles })),
    paradas: paradasPorMaquina(a.stopEvents, a.stopMachines, a.machines.map((m) => m.id)),
    pulsoAtMs: Number.isFinite(pulsoAtMs) ? pulsoAtMs : null,
  }
  return minutosCerrados(entrada) >= 1 ? entrada : null
}

/** Lo que registra el contador vivo: el tope de la reproducción. `porMaquina` es el acumulado por id de la última lectura. */
export function armarTope(total: number | null | undefined, porMaquina: Record<string, number> | null | undefined): Tope {
  return { total: total != null && Number.isFinite(total) ? total : null, porMaquina: porMaquina ?? null }
}
