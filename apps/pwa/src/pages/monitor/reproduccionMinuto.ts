/**
 * «Cola de reproducción» del monitor de turno (jitter buffer; spec `docs/SPEC_MONITOR_EN_VIVO_COLA.md`, §1 y §2).
 *
 * Lógica pura, sin React ni DOM: la usa `useReproduccionMinuto` y la prueban los tests.
 *
 * ── Qué hace ────────────────────────────────────────────────────────────────
 * Shoplogix publica los minutos cerrados a ráfagas (rezago 66–185 s) y el pulso, cada 60 s, trae 0, 1 o 2 minutos
 * (medido 2,1,0,0,2,2,1,0). El monitor no inventa piezas: encola TODO minuto cerrado nuevo y lo vuelve a pasar EN ORDEN,
 * pieza a pieza y Baader por Baader, con un desfase aproximado de 3 min respecto del reloj de planta:
 *
 *   · hay UN solo instante reproducido (`tMs`, hora de planta). Todo lo que se mueve en pantalla se lee de él;
 *   · el instante avanza a ×1 y nunca pasa del fin del último minuto en cola (`finCola`): con la cola vacía el reloj queda
 *     CONGELADO, sin inventar piezas;
 *   · atraso = finCola − tMs. Con atraso ≤ 186 s la velocidad es ×1; sobre eso sube a ×1,12 y desde 240 s a ×1,25, con
 *     rampas (sin escalones bruscos) para ponerse al día sin saltar nada;
 *   · solo se SALTA (snap) si el atraso pasa de 8 min, si cambia la serie (otro turno, recarga) o si el contador baja.
 *     El snap deja el reloj como al cargar: en el total al cierre del minuto «último cerrado − 2», con esos 2 en cola;
 *   · el reparto dentro del minuto es el de siempre (regla del minuto: las piezas caen en los segundos que anduvo cada
 *     Baader, cruzando las paradas de `stopEvents`); al cierre de cada minuto cada Baader vale EXACTAMENTE Σ cycles[0..k]
 *     y la línea es la suma de las Baader;
 *   · nunca se muestra más de lo que registra el contador vivo de Shoplogix (`Tope`), ni por Baader ni en total, y aun
 *     así total = Σ Baader en todo cuadro (el exceso se descuenta de las Baader);
 *   · «reducir movimiento» NO frena el conteo: es dato, no adorno. Lo que se apaga (+N flotante, deslizamiento de la
 *     cinta, tweens) lo apaga la UI; este módulo no mira esa preferencia.
 *
 * ── Dos relojes distintos (⚠) ───────────────────────────────────────────────
 * `serieMinuto.desde` y `stopEvents[].f` vienen en HORA DE PLANTA marcada con una Z falsa (wall-clock-as-UTC);
 * `pulse.at` y `lecturas[].at` vienen en UTC REAL. Entre sí solo se comparan los de la misma base. Para mostrar la hora
 * de una lectura real se convierte con `horaPlantaDeUtc` (America/Santiago), nunca con `toISOString().slice(11, 16)`.
 * El tiempo del propio reproductor (`relojMs`, `llegadaMs`, `vacioDesdeMs`) es el monótono `performance.now()`.
 *
 * ── Orden de `stopEvents[].m` ───────────────────────────────────────────────
 * `m` indexa `live.stopMachines` (functions/publicMonitor.js: `stopMachines = machines.map(m => m.id)`), que sale en el
 * mismo orden que `live.machines`. Se cruza SIEMPRE por id; solo si el doc es viejo y no trae `stopMachines` se cae al
 * orden de `live.machines`.
 */
import { aWallClockMs } from './contadorCrudo'

export const SEG_MINUTO = 60
export const MIN_MS = 60_000
/** Una Baader que anduvo menos que esto del minuto está «parcial». */
export const SEG_PARCIAL = 58

/** Minutos en cola al cargar o al saltar: el reloj parte en el total al cierre del minuto «último cerrado − COLA_INICIAL_MIN». */
export const COLA_INICIAL_MIN = 2
/** Hasta este atraso la velocidad es ×1. */
export const ATRASO_NOMINAL_S = 186
/** Desde este atraso la velocidad llega a ×1,25. */
export const ATRASO_RAPIDO_S = 240
export const FACTOR_PONIENDOSE = 1.12
export const FACTOR_RAPIDO = 1.25
/** Ancho de las rampas del factor (s de atraso): de ×1 a ×1,12 desde 186 s y de ×1,12 a ×1,25 desde 240 s. */
export const RAMPA_S = 12
/** Más atraso que esto (8 min) y se salta en vez de ponerse al día. */
export const ATRASO_SALTO_S = 480
/** Una cola vacía solo es «atrasado» pasado un pulso entero (60 s, `functions/shoplogix/pulse.js`) sin minuto nuevo. */
export const GRACIA_ATRASADO_MS = 60_000
/** El instante reproducido avanza en pasos de a lo más esto (el factor depende del atraso, que cambia mientras avanza). */
const PASO_MAX_MS = 500

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

/**
 * Cómo va el reloj (spec §1):
 *   · `vivo`: la cola tiene al menos un minuto o se está reproduciendo;
 *   · `poniendose`: velocidad > ×1 (hay que mostrar el atraso en s);
 *   · `atrasado`: cola vacía y el minuto esperado no llegó en un pulso entero: reloj CONGELADO;
 *   · `detenida`: el minuto que corre llegó con 0 piezas en toda la línea (el reloj sigue, la cifra no sube).
 */
export type EstadoVivo = 'vivo' | 'poniendose' | 'atrasado' | 'detenida'

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
  /** Minutos cerrados vistos (la cola llega hasta el fin del minuto `cerrados - 1`). */
  cerrados: number
  /** La serie vista: piezas de cada minuto cerrado por Baader. */
  maquinas: MaquinaRep[]
  paradas: Record<string, ParadaMs[]>
  /** Contador de cada Baader al fin del último minuto en cola (= Σ cycles). */
  final: number[]
  /** Σ cycles[0..j-1] por Baader: `acum[i][j]` es el contador de la Baader i al empezar el minuto j. */
  acum: number[][]
  /** El instante reproducido, en hora de planta (wall-as-UTC). Nunca pasa de `finCola`. */
  tMs: number
  /** Hasta qué `performance.now()` se avanzó `tMs`. */
  relojMs: number
  /** `performance.now()` en que la cola se vació (null mientras haya algo que reproducir). */
  vacioDesdeMs: number | null
  /** Reloj monotónico en que entró el último minuto cerrado. */
  llegadaMs: number
  pulsoAtMs: number | null
  /** Cuántas veces se saltó (cambio de serie, contador que baja, atraso > 8 min): quien dibuja lo usa para no animar ese paso. */
  saltos: number
  /** Minutos ya armados (horario por Baader), por índice: se calculan al pedirlos. */
  cache: Map<number, MinutoMaq[]>
}

export const repInicial = (): EstadoRep => ({
  desdeMs: null, ids: [], cerrados: 0, maquinas: [], paradas: {}, final: [], acum: [], tMs: 0, relojMs: 0,
  vacioDesdeMs: null, llegadaMs: 0, pulsoAtMs: null, saltos: 0, cache: new Map(),
})

const suma = (v: readonly number[]) => v.reduce((a, b) => a + b, 0)
const mismosIds = (a: readonly string[], b: readonly string[]) => a.length === b.length && a.every((x, i) => x === b[i])
const acota = (n: number, a: number, b: number) => Math.min(b, Math.max(a, n))

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

const tope = (v: number, t: number | null | undefined) => (t != null && Number.isFinite(t) ? Math.min(v, t) : v)

/**
 * Los contadores por Baader topados por lo que registra el contador vivo, con el total = Σ Baader siempre: primero el
 * techo de cada Baader y, si aun así la suma pasa del contador de la línea, el exceso se descuenta de las últimas Baader
 * (caso raro: la serie va por delante del contador). Devuelve los valores en el mismo orden.
 */
export function toparContadores(ids: readonly string[], valores: readonly number[], limite: Tope | null | undefined): number[] {
  const out = valores.map((v, i) => tope(v, limite?.porMaquina?.[ids[i]!]))
  let exceso = limite?.total != null && Number.isFinite(limite.total) ? suma(out) - limite.total : 0
  for (let i = out.length - 1; i >= 0 && exceso > 0; i--) {
    const quita = Math.min(out[i]!, exceso)
    out[i] = out[i]! - quita
    exceso -= quita
  }
  return out
}

/**
 * Lo que se muestra EN REPOSO cuando la cola se vació: Σ de los minutos cerrados, topada por el contador vivo. Con la
 * cola corriendo la cifra va por detrás de este valor (el desfase). Lo usan los lugares que no se mueven por cuadro
 * (respaldo antes del primer cuadro, pie «el contador de planta lleva N más»). null sin serie.
 */
export function totalEnReposo(e: Pick<EntradaRep, 'maquinas'> | null | undefined, limite: Tope | null | undefined): number | null {
  if (!e) return null
  const finales = finalesCerrados(e)
  return finales.length ? suma(toparContadores(e.maquinas.map((m) => m.id), finales, limite)) : null
}

// ── La velocidad ─────────────────────────────────────────────────────────────

/**
 * Factor de velocidad según el atraso (s): ×1 hasta 186 s; rampa a ×1,12 en 12 s; ×1,12 hasta 240 s; rampa a ×1,25 en
 * 12 s; ×1,25 de ahí en adelante. Continuo: no hay escalón que se note en el contador.
 */
export function factorVelocidad(atrasoS: number): number {
  if (!(atrasoS > ATRASO_NOMINAL_S)) return 1
  if (atrasoS < ATRASO_NOMINAL_S + RAMPA_S) return 1 + (FACTOR_PONIENDOSE - 1) * ((atrasoS - ATRASO_NOMINAL_S) / RAMPA_S)
  if (atrasoS <= ATRASO_RAPIDO_S) return FACTOR_PONIENDOSE
  if (atrasoS < ATRASO_RAPIDO_S + RAMPA_S) return FACTOR_PONIENDOSE + (FACTOR_RAPIDO - FACTOR_PONIENDOSE) * ((atrasoS - ATRASO_RAPIDO_S) / RAMPA_S)
  return FACTOR_RAPIDO
}

/** El fin del último minuto en cola (hora de planta). */
export const finCola = (est: Pick<EstadoRep, 'desdeMs' | 'cerrados'>): number => (est.desdeMs ?? 0) + est.cerrados * MIN_MS

/** Atraso en s: lo que falta por reproducir de lo que ya llegó. */
export const atrasoS = (est: EstadoRep): number => Math.max(0, (finCola(est) - est.tMs) / 1000)

// ── El reloj corre ───────────────────────────────────────────────────────────

/**
 * Avanza el instante reproducido hasta `ahoraMs` (performance.now). Devuelve el MISMO objeto si no hay nada que mover
 * (reloj congelado en el fin de la cola o sin tiempo transcurrido). Nunca retrocede ni pasa del fin de la cola; al
 * llegar a él anota cuándo se vació la cola, con el instante exacto dentro del paso.
 */
export function avanzar(est: EstadoRep, ahoraMs: number): EstadoRep {
  if (est.cerrados < 1 || est.desdeMs == null) return est
  let dt = ahoraMs - est.relojMs
  if (!(dt > 0)) return est
  const fin = finCola(est)
  if (est.tMs >= fin) return { ...est, relojMs: ahoraMs, tMs: fin }
  let t = est.tMs
  let r = est.relojMs
  let vacio: number | null = null
  while (dt > 0) {
    const paso = Math.min(dt, PASO_MAX_MS)
    const f = factorVelocidad((fin - t) / 1000)
    if (t + paso * f >= fin) { vacio = r + (fin - t) / f; t = fin; break }
    t += paso * f
    r += paso
    dt -= paso
  }
  return { ...est, tMs: t, relojMs: ahoraMs, vacioDesdeMs: vacio }
}

/** ¿Hay minutos por reproducir? (el hook corre cuadro a cuadro solo mientras sea cierto) */
export function reproduciendo(est: EstadoRep, ahoraMs: number): boolean {
  const e = avanzar(est, ahoraMs)
  return e.cerrados > 0 && e.tMs < finCola(e)
}

/** Cuántos ms faltan para el próximo cambio de estado SIN cuadros (la cola vacía pasa a «atrasado»). null si no hay. */
export function proximoCambioMs(est: EstadoRep, ahoraMs: number): number | null {
  const e = avanzar(est, ahoraMs)
  if (e.cerrados < 1 || e.tMs < finCola(e) || e.vacioDesdeMs == null) return null
  const falta = e.vacioDesdeMs + GRACIA_ATRASADO_MS - ahoraMs
  return falta > 0 ? falta : null
}

/** El minuto que corre: su índice y los segundos que lleva. Con la cola vacía, el último minuto, entero. */
export function posicion(est: EstadoRep): { j: number; seg: number } {
  if (est.cerrados < 1 || est.desdeMs == null) return { j: 0, seg: 0 }
  const rel = est.tMs - est.desdeMs
  if (est.tMs >= finCola(est)) return { j: est.cerrados - 1, seg: SEG_MINUTO }
  const j = acota(Math.floor(rel / MIN_MS), 0, est.cerrados - 1)
  return { j, seg: acota((rel - j * MIN_MS) / 1000, 0, SEG_MINUTO) }
}

// ── Registrar lo que llega ───────────────────────────────────────────────────

/** El minuto `j` armado por Baader (horario, tramos, estado). Se calcula una vez por minuto y se recuerda. */
export function minutoEn(est: EstadoRep, j: number): MinutoMaq[] {
  const hecho = est.cache.get(j)
  if (hecho) return hecho
  const inicioMinuto = (est.desdeMs ?? 0) + j * MIN_MS
  const minuto: MinutoMaq[] = est.maquinas.map((m) => {
    const n = Math.max(0, Math.round(m.cycles[j] ?? 0))
    const tramos = tramosAndando(est.paradas[m.id] ?? [], inicioMinuto)
    const seg = segundosAndando(tramos)
    return {
      id: m.id, nombre: m.nombre, modelo: m.modelo ?? null, esperado: m.esperado, n,
      horario: horarioPiezas(n, tramos), tramos, segAndando: seg,
      estado: n === 0 ? 'detenida' : seg < SEG_PARCIAL ? 'parcial' : 'andando',
    }
  })
  est.cache.set(j, minuto)
  return minuto
}

/** Σ de las piezas de la línea en el minuto `j`. */
const piezasDelMinuto = (est: EstadoRep, j: number) => suma(est.maquinas.map((m) => m.cycles[j] ?? 0))

/**
 * Registra la serie que llegó. Devuelve el MISMO objeto si no hay un minuto cerrado nuevo (así el llamador compara por
 * identidad: una lectura repetida no reinicia nada). Con minutos nuevos, TODOS entran a la cola y se reproducen en orden.
 * Salta (snap) solo si cambia la serie, si el contador baja o si el atraso pasaría de 8 min.
 */
export function registrarSerie(est: EstadoRep, e: EntradaRep, llegadaMs: number): EstadoRep {
  const largo = minutosCerrados(e)
  if (largo < 1) return est
  const ids = e.maquinas.map((m) => m.id)
  const mismaSerie = est.cerrados > 0 && est.desdeMs === e.desdeMs && mismosIds(ids, est.ids)
  if (mismaSerie && est.cerrados === largo) return est

  const final = e.maquinas.map((m) => acumuladoHasta(m.cycles, largo - 1))
  const acum = e.maquinas.map((m) => {
    const a = [0]
    for (let j = 0; j < largo; j++) a.push(a[j]! + (m.cycles[j] ?? 0))
    return a
  })
  const fin = e.desdeMs + largo * MIN_MS
  const alCargar = Math.max(e.desdeMs, fin - COLA_INICIAL_MIN * MIN_MS)

  let salta = !mismaSerie || largo < est.cerrados || final.some((v, i) => v < (est.final[i] ?? 0))
  let tMs = alCargar
  if (!salta) {
    const previo = avanzar(est, llegadaMs)
    if ((fin - previo.tMs) / 1000 > ATRASO_SALTO_S) salta = true
    else tMs = previo.tMs
  }
  return {
    desdeMs: e.desdeMs, ids, cerrados: largo, maquinas: e.maquinas, paradas: e.paradas, final, acum,
    tMs, relojMs: llegadaMs, vacioDesdeMs: null, llegadaMs, pulsoAtMs: e.pulsoAtMs,
    saltos: est.saltos + (est.cerrados > 0 && salta ? 1 : 0), cache: new Map(),
  }
}

// ── El cuadro de este instante ───────────────────────────────────────────────

/** «sin datos desde hh:mm»: la hora de planta en que llegó el último minuto (la del pulso real convertida). */
export function desdeUltimaLectura(est: EstadoRep): string | null {
  if (est.pulsoAtMs != null) return horaPlantaDeUtc(est.pulsoAtMs)
  return est.desdeMs != null && est.cerrados > 0 ? horaDeWall(finCola(est)) : null
}

/** La línea paró: el minuto que corre y el anterior, sin una sola pieza. */
export function detenidaRep(est: EstadoRep): boolean {
  if (est.cerrados < 1) return false
  const { j } = posicion(est)
  return j >= 1 && piezasDelMinuto(est, j) === 0 && piezasDelMinuto(est, j - 1) === 0
}

/** ¿Cola vacía hace más de un pulso, sin minuto nuevo? (con `est` ya avanzado hasta `ahoraMs`) */
function estaAtrasado(est: EstadoRep, ahoraMs: number): boolean {
  return est.cerrados > 0 && est.tMs >= finCola(est) && est.vacioDesdeMs != null && ahoraMs - est.vacioDesdeMs >= GRACIA_ATRASADO_MS
}

export interface VistaMaq {
  id: string
  nombre: string
  /** Lo que se muestra: contador de la Baader (escalón por pieza), sin pasar del contador vivo. */
  valor: number
  /** Piezas del minuto que ya cayeron. */
  encendidas: number
  /** Piezas del minuto. */
  n: number
  estado: EstadoMaquina
  /** Segundos por pieza del último minuto cerrado de esta Baader (60 / piezas); null si ese minuto estuvo detenida o aún no hay. */
  cadenciaS: number | null
  /** Piezas del último minuto cerrado (el que da `cadenciaS`); null si aún no hay. */
  piezasMinutoCerrado: number | null
  /** Cuánto del minuto que corre ya pasó (0..1): el mismo reloj para toda la línea. */
  progreso: number
}

export interface CuadroRep {
  /** Qué parte del minuto que corre ya pasó (0..1). */
  frac: number
  /** Segundo del minuto en que va el cabezal (0..60). */
  seg: number
  /** El instante reproducido, hora de planta (wall-as-UTC): el ÚNICO reloj de toda la pantalla. */
  tMs: number
  /** Índice del minuto que corre, desde el inicio de la serie. */
  minutoIdx: number
  total: number
  /** Total al empezar el minuto que corre y al cerrarlo (ya topados): la recta de la curva y de las barras. */
  totalPiso: number
  totalFinal: number
  porMaquina: VistaMaq[]
  estado: EstadoVivo
  /** Lo que falta por reproducir de lo que ya llegó (s). */
  atrasoS: number
  /** Velocidad actual del reloj (1 = en tiempo real). */
  factor: number
  /** «sin datos desde HH:MM»: hora de planta de la última lectura que trajo un minuto nuevo. */
  ultimaLecturaHHMM: string | null
  /** Estado `atrasado`: el reloj está congelado en el total de la cola. */
  atrasada: boolean
  /** Hay minutos por reproducir (el reloj se mueve). */
  animando: boolean
  /** Saltos acumulados (`EstadoRep.saltos`): si cambia entre dos cuadros, el paso no se anima. */
  saltos: number
}

/**
 * Lo que se ve ahora: cada Baader = su contador al empezar el minuto + las piezas que ya cayeron, y la línea es la
 * suma. Nunca sale de [piso, cierre] del minuto que corre ni pasa del contador vivo. Avanza el reloj hasta `ahoraMs`
 * sin guardarlo (el hook guarda con `avanzar`); pedirlo dos veces con el mismo `ahoraMs` da lo mismo.
 */
export function cuadroRep(est0: EstadoRep, limite: Tope | null, ahoraMs: number): CuadroRep {
  const est = avanzar(est0, ahoraMs)
  const { j, seg } = posicion(est)
  const minuto = est.cerrados > 0 ? minutoEn(est, j) : []
  const ids = est.ids
  const crudo = minuto.map((m, i) => (est.acum[i]?.[j] ?? 0) + piezasEncendidas(m.horario, seg))
  const valores = toparContadores(ids, crudo, limite)
  const piso = toparContadores(ids, est.acum.map((a) => a[j] ?? 0), limite)
  const cierre = toparContadores(ids, est.acum.map((a) => a[j + 1] ?? 0), limite)
  const previo = j >= 1 ? minutoEn(est, j - 1) : null
  const porMaquina: VistaMaq[] = minuto.map((m, i) => {
    const n1 = previo?.[i]?.n ?? null
    return {
      id: m.id, nombre: m.nombre, valor: valores[i] ?? 0, encendidas: piezasEncendidas(m.horario, seg), n: m.n, estado: m.estado,
      cadenciaS: n1 != null && n1 > 0 ? SEG_MINUTO / n1 : null, piezasMinutoCerrado: n1, progreso: seg / SEG_MINUTO,
    }
  })
  const fac = est.cerrados > 0 && est.tMs < finCola(est) ? factorVelocidad(atrasoS(est)) : 1
  const atrasado = estaAtrasado(est, ahoraMs)
  const estado: EstadoVivo = atrasado ? 'atrasado'
    : est.cerrados > 0 && piezasDelMinuto(est, j) === 0 ? 'detenida'
      : fac > 1 ? 'poniendose' : 'vivo'
  return {
    frac: seg / SEG_MINUTO, seg, tMs: est.tMs, minutoIdx: j,
    total: suma(valores), totalPiso: suma(piso), totalFinal: suma(cierre), porMaquina,
    estado, atrasoS: atrasoS(est), factor: fac, ultimaLecturaHHMM: desdeUltimaLectura(est),
    atrasada: atrasado, animando: est.cerrados > 0 && est.tMs < finCola(est), saltos: est.saltos,
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
