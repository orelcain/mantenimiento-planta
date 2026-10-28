/**
 * Geometría y datos puros del gráfico «Ritmo en vivo» (antes «Eje del turno»; opción A «cinta» del 28-10).
 *
 * Sin React ni DOM: el componente (`GraficoRitmoVivo.tsx`) solo dibuja lo que sale de acá y los tests prueban las
 * reglas que no se pueden romper (escala Y, proyección, línea detenida, filas por Baader sin falsos rojos, alturas).
 *
 * Unidad de tiempo del eje: MINUTOS desde el inicio del turno (`iniMs`, wall-as-UTC como el resto del monitor).
 * El eje siempre abarca el turno COMPLETO; acercarse es zoom horizontal (`useZoomGesto`), no otro eje.
 */
import type { DuenoPerdida, GrupoDelTurno } from '@/services/shoplogix/monitorEventos'
import { ANDANDO_MIN_S, llenadoDe, paradasPorMaquina, segundosCubiertos, tonoDe, type EntradaRitmoVivo, type MaquinaSerie } from './ritmoVivo'
import type { Ventana } from './useZoomGesto'

// ── Formatos ─────────────────────────────────────────────────────────────────

export const int = (n: number) => Math.round(n).toLocaleString('es-CL')
export const firmado = (n: number) => `${n > 0 ? '+' : n < 0 ? '−' : ''}${int(Math.abs(n))}`
/**
 * La diferencia contra la meta a esa hora, en palabras de planta (glosario único del monitor, 28-10): «105 adelante»,
 * «45 atrás» y «al día» con 0 (redondeado: 0,4 es «al día»). Distinto de `firmado`, que sigue siendo ±N para las
 * tasas (pz/h) y otras comparaciones.
 */
export function adelanteAtras(n: number): string {
  const r = Math.round(n)
  return r > 0 ? `${int(r)} adelante` : r < 0 ? `${int(-r)} atrás` : 'al día'
}
/** «623 adelante de la meta» / «42 atrás de la meta»; con 0 (redondeado), «en la meta» (no «al día de la meta»). */
export function deLaMeta(n: number): string {
  return Math.round(n) === 0 ? 'en la meta' : `${adelanteAtras(n)} de la meta`
}
/**
 * Lo mismo en dos partes para la cifra grande: el número (sin signo) y la palabra que va en el hueco de la unidad.
 * Con 0, solo la palabra «al día» y ningún número.
 */
export function partesAdelanteAtras(n: number): { cifra: string; palabra: 'adelante' | 'atrás' | 'al día' } {
  const r = Math.round(n)
  return r > 0 ? { cifra: int(r), palabra: 'adelante' } : r < 0 ? { cifra: int(-r), palabra: 'atrás' } : { cifra: '', palabra: 'al día' }
}
/** HH:MM de un instante wall-as-UTC (la hora de planta). */
export const relojDe = (ms: number) => new Date(ms).toISOString().slice(11, 16)
/** «X h Y min», «N min» o, bajo 1 min, «N s» (una parada de 40 s no es «0 min»). */
export function horasMin(min: number): string {
  if (min > 0 && min < 1) return `${Math.max(1, Math.round(min * 60))} s`
  const t = Math.max(0, Math.round(min))
  return t >= 60 ? `${Math.floor(t / 60)} h ${t % 60} min` : `${t} min`
}

// ── Escalas ──────────────────────────────────────────────────────────────────

/** Escala Y «redonda» por encima del tope: 1.000 hasta 4.000, 2.000 hasta 10.000, 5.000 después (la usa el Duelo). */
export function escalaY(tope: number): { paso: number; max: number } {
  const t = Math.max(1, tope * 1.1)
  const paso = t <= 4000 ? 1000 : t <= 10000 ? 2000 : 5000
  return { paso, max: Math.ceil(t / paso) * paso }
}

/**
 * Escala del acumulado de «Ritmo en vivo»: el tope es el mayor valor que se dibuja (meta, proyección, hoy, turno
 * anterior) y el máximo, el múltiplo del paso justo por encima. Paso 1.000 hasta 8.000, 2.000 hasta 20.000 y 5.000
 * después; la rejilla va cada 2 pasos (15.623 → 0…16.000, rejilla de 4.000): sin la mitad de arriba vacía.
 * Si el máximo cae en un múltiplo IMPAR del paso (la raya de arriba no existiría: 5.000 con rejilla de 2.000) o el aire
 * sobre la curva es menor a 4 %, sube al múltiplo de la rejilla: 5.000 → 6.000 (rayas 0, 2, 4 y 6 mil); 15.479 → 16.000.
 */
export function escalaAcumulado(tope: number): { paso: number; max: number; rejilla: number } {
  const t = Math.max(1, tope)
  const paso = t <= 8000 ? 1000 : t <= 20000 ? 2000 : 5000
  const rejilla = paso * 2
  let max = Math.ceil(t / paso) * paso
  if ((max / paso) % 2 !== 0 || (max - t) / max < 0.04) max = Math.ceil(t / rejilla) * rejilla
  return { paso, max, rejilla }
}

export interface EscalaVentana { yMin: number; yMax: number; paso: number; rejilla: number }

/**
 * Escala Y con zoom: el dominio de lo que se ve en la ventana (`min`…`max` de los datos visibles). Paso 100 hasta un
 * rango de 800, 200 hasta 2.000, 500 hasta 5.000 y 1.000 después; la rejilla va cada 2 pasos y el tope cae en una raya.
 * `yMin` es múltiplo del paso y `yMax` múltiplo de la rejilla (la raya de arriba existe). Deja un 4 % de aire arriba y abajo
 * (si la curva toca el borde, sube un paso). Nunca baja de 0.
 */
export function escalaVentana(min: number, max: number): EscalaVentana {
  const lo = Math.max(0, Math.min(min, max))
  const hi = Math.max(lo, max)
  const rango = hi - lo
  const paso = rango <= 800 ? 100 : rango <= 2000 ? 200 : rango <= 5000 ? 500 : 1000
  const rejilla = paso * 2
  let yMin = Math.max(0, Math.floor(lo / paso) * paso)
  let yMax = Math.ceil(hi / paso) * paso
  if (yMax <= yMin) yMax = yMin + rejilla
  if (yMin > 0 && (lo - yMin) < (yMax - yMin) * 0.04) yMin = Math.max(0, yMin - paso)
  if ((yMax - hi) < (yMax - yMin) * 0.04) yMax += paso
  yMax = Math.ceil(yMax / rejilla) * rejilla
  return { yMin, yMax, paso, rejilla }
}

/** Las rayas de la rejilla: los múltiplos de `rejilla` (números redondos) entre `yMin` y `yMax`. En «Turno» (yMin 0) parten de 0. */
export function rayasY(yMin: number, yMax: number, rejilla: number): number[] {
  const out: number[] = []
  for (let v = (Math.ceil(yMin / rejilla - 1e-9) || 0) * rejilla; v <= yMax + 1e-6; v += rejilla) out.push(v)
  return out
}

/**
 * El mínimo y el máximo de lo que se dibuja dentro de la ventana `[desdeMin, hastaMin]`: los puntos de cada curva que
 * caen adentro más su valor interpolado en los dos bordes. null si ninguna curva toca la ventana.
 */
export function dominioVisible(curvas: Punto[][], desdeMin: number, hastaMin: number): { min: number; max: number } | null {
  let min = Infinity
  let max = -Infinity
  const ver = (v: number | null) => { if (v != null) { min = Math.min(min, v); max = Math.max(max, v) } }
  for (const ps of curvas) {
    if (ps.length === 0) continue
    ver(valorEnCurva(ps, desdeMin))
    ver(valorEnCurva(ps, hastaMin))
    for (const q of ps) if (q.min >= desdeMin && q.min <= hastaMin) ver(q.v)
  }
  return Number.isFinite(min) && Number.isFinite(max) ? { min, max } : null
}

// ── Marcas de hora ───────────────────────────────────────────────────────────

const PASOS_MARCA_MIN = [1, 2, 5, 10, 15, 30, 60, 120, 180, 240]

/** El paso de marca más chico (min) que deja al menos `minPx` entre dos marcas. */
export function pasoMarcas(pxPorMin: number, minPx: number): number {
  return PASOS_MARCA_MIN.find((p) => p * pxPorMin >= minPx) ?? 240
}

export type AnclaRotulo = 'start' | 'middle' | 'end'

/** Cuánto ocupa a lo ancho el texto «02:35 ahora» (o «04:50 fin») según el tamaño de la letra: 64 px a 12 px y 59 px a 11 px. */
export const anchoRotuloAhora = (fontSize: number) => (fontSize >= 12 ? 64 : 59)

/**
 * Dónde y cómo se escribe el rótulo «HH:MM ahora» (o «HH:MM fin») en el eje: centrado sobre la raya, o pegado hacia adentro si la
 * raya queda a menos de medio texto (más 2 px) del borde VISIBLE. Con zoom el borde visible es el de la ventana, no el del lienzo
 * entero; y con el turno cerrado el fin real puede quedar unos minutos después de la ventana (que termina 15 % delante del último
 * dato): el texto se acota al borde visible en vez de salirse. `x` es la posición del texto (la de su ancla).
 */
export function anclaRotuloAhora(args: { xAhora: number; visIni: number; visDer: number; anchoRotulo: number }): { ancla: AnclaRotulo; x: number } {
  const { xAhora, visIni, visDer, anchoRotulo } = args
  if (xAhora > visDer - anchoRotulo / 2 - 2) return { ancla: 'end', x: Math.min(xAhora, visDer - 2) }
  if (xAhora < visIni + anchoRotulo / 2 + 2) return { ancla: 'start', x: Math.max(xAhora, visIni + 2) }
  return { ancla: 'middle', x: xAhora }
}

/**
 * «a esta hora ±N» va a la derecha de la punta (20 px); si el texto no cabe en lo que se VE (con zoom la ventana termina poco
 * después de la punta), pasa a su izquierda. `anchoTexto` es el ancho estimado del rótulo.
 */
export const brechaALaIzquierda = (xAhora: number, anchoTexto: number, visDer: number): boolean => xAhora + 20 + anchoTexto > visDer - 2

/**
 * Minutos (desde el inicio del turno) donde va una hora en el eje X.
 *
 * Con `iniMs` (el inicio del turno, hora de planta) las marcas caen en múltiplos de reloj del paso (22:00, 23:00… con paso
 * 60; 00:00, 02:00… con 120) y el inicio del turno solo se rotula si queda a 0,6·`minPx` o más de la primera marca; sin
 * `iniMs` parten del inicio. El fin del turno se agrega si queda lugar.
 *
 * Con el «ahora» rotulado en el eje, las marcas que chocarían con su rótulo se omiten. Con `ahoraAncla` y `ahoraRotuloPx`
 * la zona sin marcas sigue la ancla del texto (hacia la izquierda si es 'end', hacia la derecha si 'start', simétrica si
 * 'middle'), contando el ancho de la marca (`marcaPx`) y 8 px de aire; sin ellos, ±`ahoraPx` alrededor del ahora.
 */
export function marcasEje(args: {
  totalMin: number
  pxPorMin: number
  minPx: number
  ahoraMin: number | null
  ahoraPx: number
  iniMs?: number
  ahoraAncla?: AnclaRotulo
  ahoraRotuloPx?: number
  marcaPx?: number
}): number[] {
  const { totalMin, pxPorMin, minPx, ahoraMin, ahoraPx, iniMs, ahoraAncla, ahoraRotuloPx } = args
  const marcaPx = args.marcaPx ?? 32
  if (!(totalMin > 0) || !(pxPorMin > 0)) return []
  const paso = pasoMarcas(pxPorMin, minPx)
  /* El inicio y el fin llevan su texto PEGADO al borde (hacia adentro) y la marca de al lado va centrada: para no pisarse hace falta
     ancho y medio de texto entre sus posiciones, más 4 px de aire. */
  const sinPisar = marcaPx * 1.5 + 4
  const out: number[] = []
  let primera = 0
  if (iniMs != null && Number.isFinite(iniMs)) {
    const ini = iniMs / 60_000
    primera = ((paso - (((ini % paso) + paso) % paso)) % paso)
    if (primera > 0 && primera * pxPorMin >= Math.max(minPx * 0.6, sinPisar)) out.push(0)
  }
  for (let t = primera; t <= totalMin + 1e-9; t += paso) out.push(t)
  const ultimo = out[out.length - 1]
  if (ultimo != null && ultimo < totalMin && (totalMin - ultimo) * pxPorMin >= Math.max(minPx * 0.45, sinPisar)) out.push(totalMin)
  if (ahoraMin == null) return out
  if (ahoraAncla && ahoraRotuloPx) {
    const xa = ahoraMin * pxPorMin
    const [l0, l1] = ahoraAncla === 'end' ? [xa - ahoraRotuloPx, xa] : ahoraAncla === 'start' ? [xa, xa + ahoraRotuloPx] : [xa - ahoraRotuloPx / 2, xa + ahoraRotuloPx / 2]
    return out.filter((t) => {
      const x = t * pxPorMin
      /* El texto de la marca: pegado a la izquierda en el inicio, a la derecha en el fin y centrado en el resto. */
      const [m0, m1] = t <= 0 ? [x, x + marcaPx] : t >= totalMin ? [x - marcaPx, x] : [x - marcaPx / 2, x + marcaPx / 2]
      return m1 + 8 <= l0 || m0 - 8 >= l1
    })
  }
  return out.filter((t) => Math.abs(t - ahoraMin) * pxPorMin >= ahoraPx)
}

// ── Zoom «Turno | 1 h | 15 min» ──────────────────────────────────────────────

export type Zoom = 'turno' | '1h' | '15m'
const ANCHO_ZOOM_MIN: Record<Exclude<Zoom, 'turno'>, number> = { '1h': 60, '15m': 15 }

/**
 * La ventana (minutos desde el inicio del turno) de cada atajo: `ancho` minutos que terminan un 15 % por delante del
 * «ahora» (la punta no queda pegada al borde) y sin salirse del turno. «Turno» = sin ventana (todo).
 */
export function ventanaDe(z: Zoom, ahoraMin: number, totalMin: number): Ventana | null {
  if (z === 'turno') return null
  const ancho = Math.min(ANCHO_ZOOM_MIN[z], totalMin)
  const hasta = Math.min(totalMin, Math.max(ancho, ahoraMin + ancho * 0.15))
  return { desdeMin: hasta - ancho, hastaMin: hasta }
}

/** Qué atajo describe una ventana (por su ancho); null si es un zoom a mano. */
export function zoomActivo(v: Ventana | null): Zoom | null {
  if (v == null) return 'turno'
  const ancho = v.hastaMin - v.desdeMin
  if (Math.abs(ancho - ANCHO_ZOOM_MIN['1h']) <= 3) return '1h'
  if (Math.abs(ancho - ANCHO_ZOOM_MIN['15m']) <= 1.5) return '15m'
  return null
}

/** Tope de zoom del hook: que «15 min» sea alcanzable en cualquier turno y se pueda ir un poco más cerca. */
export const zoomMaxPara = (totalMin: number) => Math.max(12, Math.ceil(totalMin / 10))

// ── Curva ────────────────────────────────────────────────────────────────────

export interface Punto { min: number; v: number }

/** Acumulado por minuto: `a[i]` = piezas hasta el inicio del minuto `i` (a[0] = 0). */
export function acumulado(porMinuto: number[]): number[] {
  const a = [0]
  for (const v of porMinuto) a.push(a[a.length - 1]! + v)
  return a
}

/**
 * El trazo sólido: los minutos cerrados hasta antes de la lectura anterior, y de ahí la recta real
 * anterior → última. Nunca baja (el acumulado no retrocede) ni pasa de la lectura anterior antes de tiempo.
 */
export function trazoHastaLectura(acum: number[], previa: Punto | null, ultima: Punto): Punto[] {
  const corte = previa ? previa.min : ultima.min
  const tope = previa ? previa.v : ultima.v
  const out: Punto[] = []
  for (let i = 0; i < acum.length; i++) {
    if (i >= corte) break
    out.push({ min: i, v: Math.min(acum[i]!, tope) })
  }
  if (previa) out.push(previa)
  out.push(ultima)
  return out
}

/** Valor de una curva (puntos ordenados por minuto) en el minuto `m`, interpolado; null fuera de su rango. */
export function valorEnCurva(ps: Punto[], m: number): number | null {
  if (ps.length === 0) return null
  if (m < ps[0]!.min) return null
  if (m > ps[ps.length - 1]!.min) return null
  for (let i = 0; i < ps.length - 1; i++) {
    const a = ps[i]!, b = ps[i + 1]!
    if (m >= a.min && m <= b.min) return b.min === a.min ? b.v : a.v + ((m - a.min) / (b.min - a.min)) * (b.v - a.v)
  }
  return ps[ps.length - 1]!.v
}

/** La curva hasta el minuto `hasta`: el tramo que lo cruza se corta por interpolación (nunca se extrapola). */
export function recortarCurva(ps: Punto[], hasta: number): Punto[] {
  const out: Punto[] = []
  for (let i = 0; i < ps.length; i++) {
    const p = ps[i]!
    if (p.min <= hasta) { out.push(p); continue }
    const a = ps[i - 1]
    if (a && a.min < hasta) out.push({ min: hasta, v: a.v + ((hasta - a.min) / (p.min - a.min)) * (p.v - a.v) })
    break
  }
  return out
}

// ── Proyección ───────────────────────────────────────────────────────────────

export interface Proyeccion {
  desde: Punto
  /** Dónde termina en el eje que se ve (puede ser antes del cierre si el turno no se ve entero). */
  hasta: Punto
  /** Línea detenida: horizontal, al valor actual. */
  aplanada: boolean
  /** El eje llega al fin del turno: la punta ES la cifra «Al cierre». */
  alCierre: boolean
}

/**
 * La proyección punteada desde la punta hasta el final del eje. UNA sola fuente para el valor final:
 * `cierre` es la misma cifra de «Al cierre». Detenida, se aplana en horizontal (proyección en pausa).
 * Sin cierre calculado no hay proyección (null): jamás se inventa una pendiente.
 */
export function proyeccion(args: { punta: Punto; finEje: number; totalMin: number; cierre: number | null; detenida: boolean }): Proyeccion | null {
  const { punta, finEje, totalMin, cierre, detenida } = args
  if (finEje <= punta.min) return null
  const alCierre = finEje >= totalMin
  if (detenida) {
    return { desde: punta, hasta: { min: finEje, v: punta.v }, aplanada: true, alCierre }
  }
  if (cierre == null || totalMin <= punta.min) return null
  const v = alCierre ? cierre : punta.v + ((cierre - punta.v) * (finEje - punta.min)) / (totalMin - punta.min)
  return { desde: punta, hasta: { min: finEje, v: Math.max(punta.v, v) }, aplanada: false, alCierre }
}

// ── Minuto a minuto y filas por Baader ───────────────────────────────────────

export type TonoRitmo = 'bien' | 'atento' | 'mal' | 'sin'

/**
 * Los cortes de Shoplogix: ≥75 % del esperado bien, 50–75 atento, <50 mal. Sin esperado no hay vara con qué juzgar
 * (misma regla que `ritmoVivo.ts`: se calla): neutro, jamás «bien» solo porque hubo piezas.
 */
export function tonoRitmo(v: number | null | undefined, esperado: number | null): TonoRitmo {
  if (v == null || esperado == null || esperado <= 0) return 'sin'
  const r = v / esperado
  return r >= 0.75 ? 'bien' : r >= 0.5 ? 'atento' : 'mal'
}

/** % de los minutos que anduvieron a ritmo (≥75 % del esperado); null sin esperado ni minutos. */
export function pctARitmo(ciclos: Array<number | null | undefined>, esperado: number | null): number | null {
  const datos = ciclos.filter((c): c is number => c != null)
  if (esperado == null || esperado <= 0 || datos.length === 0) return null
  return Math.round((datos.filter((c) => tonoRitmo(c, esperado) === 'bien').length / datos.length) * 100)
}

/** Suma por minuto de varias máquinas (la línea). Una serie más corta aporta 0 donde no tiene minuto. */
export function sumaPorMinuto(maquinas: Array<{ cycles: number[] }>, n: number): number[] {
  return Array.from({ length: n }, (_, k) => maquinas.reduce((a, m) => a + (m.cycles[k] ?? 0), 0))
}

/**
 * El esperado de la línea en cada minuto: la suma de los esperados de las máquinas QUE TIENEN ese minuto (la misma
 * base que `sumaPorMinuto`). null si alguna de ellas no tiene esperado, o si ninguna tiene el minuto.
 */
export function esperadoPorMinuto(maquinas: Array<{ cycles: number[]; esperado: number | null }>, n: number): Array<number | null> {
  return Array.from({ length: n }, (_, k) => {
    const con = maquinas.filter((m) => k < m.cycles.length)
    if (con.length === 0 || con.some((m) => m.esperado == null || m.esperado <= 0)) return null
    return con.reduce((a, m) => a + m.esperado!, 0)
  })
}

/**
 * Minutos que se dibujan: los de la serie MÁS LARGA (una máquina atrasada un minuto no debe borrar el último minuto
 * de las demás). Con el turno cerrado, sin la cola en cero (el turno ya terminó).
 */
export function minutosVisibles(maquinas: Array<{ cycles: number[] }>, cerrado: boolean): number {
  let n = maquinas.length ? Math.max(...maquinas.map((m) => m.cycles.length)) : 0
  if (cerrado) {
    const suma = sumaPorMinuto(maquinas, n)
    while (n > 2 && suma[n - 1] === 0) n--
  }
  return n
}

/**
 * El último minuto que TODAS las máquinas ya entregaron (el menor de los largos). Es el que vale para una cifra de la
 * LÍNEA: con un minuto que solo algunas entregaron, la suma sería «la línea» de una Baader sola. 0 si alguna no tiene
 * ninguno. Las filas del gráfico siguen con `minutosVisibles` (cada una dibuja lo que tiene).
 */
export function minutosCompletos(maquinas: Array<{ cycles: number[] }>): number {
  return maquinas.length ? Math.min(...maquinas.map((m) => m.cycles.length)) : 0
}

export type EstadoBaader = 'andando' | 'lenta' | 'detenida' | 'parcial' | 'sin-dato'
export interface CeldaBaader {
  /** Color de la celda: `sin` = neutra (no se acusa a la Baader de lo que el dato no puede afirmar). */
  tono: TonoRitmo
  /** La palabra del globo. */
  estado: EstadoBaader
}

/**
 * Un minuto de UNA Baader a partir de su llenado NORMALIZADO (`ritmoVivo.llenadoDe`: piezas ÷ lo que daba andando a
 * su esperado; null = menos de 30 s andando o la línea entera en cero). Rojo solo si va < 50 % con la línea andando;
 * sin dato queda neutra (la explicación está en la fila de paradas).
 * `lineaEnCeroSinParada`: la línea entera marcó cero y ninguna parada registrada lo explica (puede ser una parada pactada
 * que no viaja en `stopEvents` o un minuto sin pescado): no se afirma «detenida», queda sin dato.
 */
export function celdaBaader(llenado: number | null | undefined, piezas: number, lineaEnCeroSinParada = false): CeldaBaader {
  if (llenado == null) {
    if (piezas === 0 && lineaEnCeroSinParada) return { tono: 'sin', estado: 'sin-dato' }
    return { tono: 'sin', estado: piezas > 0 ? 'parcial' : 'detenida' }
  }
  const tono = tonoDe(llenado / 100)
  return { tono, estado: tono === 'bien' ? 'andando' : tono === 'mal' && piezas === 0 ? 'detenida' : 'lenta' }
}

export type ParadasMaquina = Pick<EntradaRitmoVivo, 'stopEvents' | 'stopReasons' | 'stopMachines' | 'enCurso'>

/**
 * Las filas Ev del gráfico: una celda por minuto de la serie y por Baader, con la MISMA normalización que el llenado
 * de «Ritmo en vivo» (`llenadoDe`, sin duplicar sus reglas). Sin paradas por máquina se supone andando todo el minuto;
 * una Baader sin esperado no tiene vara para juzgarse (con piezas queda sin dato, no «andando»); un minuto que su serie
 * no tiene queda sin dato. `llenados` es el % normalizado de cada minuto (null = sin dato): la base del tono y la palabra.
 */
export function filasBaader(
  serie: { desde: string; maquinas: MaquinaSerie[] },
  n: number,
  paradas?: ParadasMaquina | null,
): Array<{ id: string; celdas: CeldaBaader[]; llenados: Array<number | null> }> {
  const entrada = {
    stopEvents: paradas?.stopEvents ?? null,
    stopReasons: paradas?.stopReasons ?? null,
    stopMachines: paradas?.stopMachines ?? null,
    enCurso: paradas?.enCurso ?? [],
  }
  const { lineas } = llenadoDe({ serie, acumulado: null, ...entrada }, 0, n)
  const pp = paradasPorMaquina(entrada)
  const t0 = Date.parse(serie.desde)
  /* Cero de TODA la línea sin una parada de esa Baader que cubra el minuto (≥ 30 s): no se afirma que esté detenida. */
  const ceroSinParada = (id: string, k: number) => {
    if (!serie.maquinas.every((x) => (x.cycles[k] ?? 0) === 0)) return false
    const ini = t0 + k * 60_000
    return 60 - segundosCubiertos(pp.todas.get(id), ini, ini + 60_000) >= ANDANDO_MIN_S
  }
  return serie.maquinas.map((m) => {
    const l = lineas.find((x) => x.id === m.id)
    return {
      id: m.id,
      llenados: Array.from({ length: n }, (_, k) => (l && k < m.cycles.length ? l.fills[k] ?? null : null)),
      celdas: Array.from({ length: n }, (_, k): CeldaBaader => {
        /* Una Baader que solo va atrasada un minuto no está detenida: ese minuto aún no llegó, queda sin dato. */
        if (k >= m.cycles.length) return { tono: 'sin', estado: 'sin-dato' }
        const piezas = m.cycles[k] ?? 0
        if (l) return celdaBaader(l.fills[k], piezas, ceroSinParada(m.id, k))
        return piezas > 0 ? { tono: 'sin', estado: 'sin-dato' } : { tono: 'sin', estado: ceroSinParada(m.id, k) ? 'sin-dato' : 'detenida' }
      }),
    }
  })
}

/** % de los minutos con dato en que la Baader anduvo a ritmo; null si ninguno tiene dato. */
export function pctAndando(celdas: CeldaBaader[]): number | null {
  const medidas = celdas.filter((c) => c.tono !== 'sin')
  return medidas.length === 0 ? null : Math.round((medidas.filter((c) => c.tono === 'bien').length / medidas.length) * 100)
}

// ── Paradas con dueño ────────────────────────────────────────────────────────

export interface ParadaEje {
  desdeMin: number
  hastaMin: number
  dueno: DuenoPerdida
  causa: string
  maquina: string | null
  /** El id de la máquina (el mismo de `minuto.maquinas`): de ahí sale el nombre que la fila ya usa. */
  maquinaId?: string | null
}

/**
 * Las paradas de `agruparEventos`, ubicadas en el eje del turno. Sus `desdeMin/hastaMin` cuentan desde el primer
 * dato (`t0Ms`); acá se pasan a minutos desde el inicio del turno (`iniMs`). Las que no se pueden ubicar se omiten.
 */
export function paradasEnEje(grupos: GrupoDelTurno[] | null | undefined, t0Ms: number | null, iniMs: number): ParadaEje[] {
  if (!grupos || t0Ms == null || !Number.isFinite(t0Ms)) return []
  const out: ParadaEje[] = []
  for (const g of grupos) {
    for (const c of g.causas) {
      for (const p of c.paradas) {
        if (p.desdeMin == null || p.hastaMin == null) continue
        out.push({
          desdeMin: (t0Ms + p.desdeMin * 60_000 - iniMs) / 60_000,
          hastaMin: (t0Ms + p.hastaMin * 60_000 - iniMs) / 60_000,
          dueno: g.dueno,
          causa: c.reason,
          maquina: p.maquina ?? null,
          maquinaId: p.maquinaId ?? null,
        })
      }
    }
  }
  return out.sort((a, b) => a.desdeMin - b.desdeMin)
}

const cubre = (p: ParadaEje, m: number) => m >= p.desdeMin && m < Math.max(p.hastaMin, p.desdeMin + 1)

/** La parada que cubre el minuto `m` (la más larga si hay varias), o null. */
export function paradaEn(paradas: ParadaEje[], m: number): ParadaEje | null {
  return paradasEn(paradas, m)[0] ?? null
}

/** TODAS las paradas que cubren el minuto `m` (una por máquina parada), la más larga primero. */
export function paradasEn(paradas: ParadaEje[], m: number): ParadaEje[] {
  return paradas.filter((p) => cubre(p, m)).sort((a, b) => (b.hastaMin - b.desdeMin) - (a.hastaMin - a.desdeMin))
}

/**
 * Los intervalos de parada fusionados (sin las programadas): lo que el reloj de planta vio detenido, sin contar dos
 * veces lo que dos Baader paran a la vez. Con `limites` se recorta al tramo que el eje muestra.
 */
export function intervalosDeParada(paradas: ParadaEje[], limites?: { min: number; max: number }): Array<[number, number]> {
  const lo = limites?.min ?? -Infinity
  const hi = limites?.max ?? Infinity
  const iv = paradas
    .filter((p) => p.dueno !== 'programado')
    .map((p): [number, number] => [Math.max(lo, p.desdeMin), Math.min(hi, p.hastaMin)])
    .filter(([a, b]) => b > a)
    .sort((a, b) => a[0] - b[0])
  const out: Array<[number, number]> = []
  for (const [a, b] of iv) {
    const u = out[out.length - 1]
    if (u && a <= u[1]) u[1] = Math.max(u[1], b)
    else out.push([a, b])
  }
  return out
}

/** Minutos de RELOJ con alguna parada (unión de intervalos, sin programadas): tres Baader paradas a la vez cuentan una vez. */
export const minutosConParada = (paradas: ParadaEje[], limites?: { min: number; max: number }) =>
  intervalosDeParada(paradas, limites).reduce((a, [x, y]) => a + (y - x), 0)

/** Cuántos episodios de parada hay una vez fusionados los que se solapan (sin programadas). */
export const episodiosParada = (paradas: ParadaEje[], limites?: { min: number; max: number }) => intervalosDeParada(paradas, limites).length

/** El color de cada dueño en rellenos y swatches, y la trama de Mantención (rayas oscuras sobre el ámbar, para no depender solo del color). */
export const RELLENO_DUENO = { mantencion: 'var(--v2-mant)', externo: 'var(--v2-ext)', 'sin-imputar': 'var(--v2-gris)', programado: 'var(--v2-prog)' } as const
export const TRAMA_MANT = 'repeating-linear-gradient(135deg, rgb(0 0 0 / 0.4) 0 2px, transparent 2px 5px), var(--v2-mant)'

// ── Diseño vertical ──────────────────────────────────────────────────────────

/** Por el ancho del GRÁFICO (no de la ventana): ≥ 1.480 pantalla de 1920, ≥ 600 la de 1366 y tablets, debajo el celular. */
export type TamanoGrafico = 'grande' | 'medio' | 'chico'
export const tamanoGrafico = (w: number): TamanoGrafico => (w >= 1480 ? 'grande' : w >= 600 ? 'medio' : 'chico')

/** Las medidas del mockup aprobado (1920 / 1366 / 375): columna de rótulos izquierda y derecha y alto de cada banda. */
const MEDIDAS: Record<TamanoGrafico, { lab: number; der: number; acum: number; barras: number; ev: number }> = {
  grande: { lab: 74, der: 128, acum: 290, barras: 84, ev: 14 },
  medio: { lab: 70, der: 104, acum: 206, barras: 60, ev: 11 },
  chico: { lab: 70, der: 0, acum: 160, barras: 48, ev: 10 },
}

export interface Diseno {
  tam: TamanoGrafico
  /** Margen izquierdo (rótulos) y derecho (rótulos; en el celular solo el aire de 4 px). */
  pl: number
  pr: number
  plotW: number
  pt: number
  acum: { y0: number; h: number }
  /** null sin serie minuto a minuto. */
  barras: { y0: number; h: number } | null
  carriles: Array<{ y0: number; h: number }>
  paradas: { y0: number; h: number }
  /** Parte alta de la fila de horas (el texto va 12 px más abajo). */
  ejeX: number
  alto: number
}

/**
 * Reparte el alto: acumulado · +16 · barras por minuto · +10 · una fila por Baader (sep 3) · +6 · paradas · +8 · horas (18).
 * Con 3 Baader da 504 / 384 / 322 px a 1920 / 1366 / 375. Sin serie por minuto no hay barras ni filas (solo +16).
 */
export function disenar(w: number, tam: TamanoGrafico, nMaquinas: number, conBarras: boolean): Diseno {
  const m = MEDIDAS[tam]
  const pt = 10
  let y = pt + m.acum
  let barras: Diseno['barras'] = null
  if (conBarras) {
    y += 16
    barras = { y0: y, h: m.barras }
    y += m.barras
  }
  const filas = conBarras ? nMaquinas : 0
  const carriles: Diseno['carriles'] = []
  if (filas > 0) {
    y += 10
    for (let i = 0; i < filas; i++) carriles.push({ y0: y + i * (m.ev + 3), h: m.ev })
    y += filas * m.ev + (filas - 1) * 3
  }
  y += conBarras ? 6 : 16
  const paradas = { y0: y, h: m.ev }
  const ejeX = paradas.y0 + m.ev + 8
  const pr = m.der + (tam === 'chico' ? 4 : 0)
  return { tam, pl: m.lab, pr, plotW: Math.max(40, w - m.lab - pr), pt, acum: { y0: pt, h: m.acum }, barras, carriles, paradas, ejeX, alto: ejeX + 18 }
}

// ── Barras con poco ancho: cubetas ───────────────────────────────────────────

/** Minutos por cubeta: 1 desde 2 px por minuto; debajo, los que hagan falta para ≥ 3 px por barra (a 375 en «Turno» son 6). */
export const minutosPorCubeta = (pxPorMin: number) => (pxPorMin >= 2 || !(pxPorMin > 0) ? 1 : Math.ceil(3 / pxPorMin))

export interface Cubeta {
  /** Primer minuto de la serie (índice) y cuántos cubre. */
  k0: number
  len: number
  /** Promedio de pz/min de los minutos CERRADOS de la cubeta (sin ellos, los parciales). */
  prom: number
  /** Promedio del esperado de esos mismos minutos; null si alguno no tiene. */
  esperado: number | null
  /** Todos sus minutos son parciales (alguna Baader aún no los entregó): se dibuja atenuada. */
  parcial: boolean
}

/**
 * Agrupa la serie de la línea en cubetas de `c` minutos para que cada barra mida lo suficiente. Un minuto parcial
 * (índice ≥ `completos`: no todas las Baader lo entregaron) no entra al promedio si la cubeta tiene minutos cerrados:
 * dibujaría un bajón falso. El globo sigue leyendo el minuto exacto.
 */
export function cubetasDeLinea(suma: number[], esperado: Array<number | null>, c: number, completos: number): Cubeta[] {
  const out: Cubeta[] = []
  for (let k0 = 0; k0 < suma.length; k0 += c) {
    const len = Math.min(c, suma.length - k0)
    const ks = Array.from({ length: len }, (_, i) => k0 + i)
    const cerrados = ks.filter((k) => k < completos)
    const usar = cerrados.length > 0 ? cerrados : ks
    const prom = usar.reduce((a, k) => a + (suma[k] ?? 0), 0) / usar.length
    const esp = usar.map((k) => esperado[k] ?? null)
    out.push({ k0, len, prom, esperado: esp.some((e) => e == null) ? null : esp.reduce<number>((a, e) => a + (e ?? 0), 0) / esp.length, parcial: cerrados.length === 0 && completos < suma.length })
  }
  return out
}

/**
 * El tono de una cubeta de una fila Ev: el PEOR tono con dato que ocupe 2 o más de sus minutos (1 si la cubeta es de un
 * minuto); si ninguno llega, el peor presente. Sin ningún minuto con dato, neutro.
 */
export function tonoDeCubeta(tonos: TonoRitmo[]): TonoRitmo {
  if (tonos.length === 0) return 'sin'
  const orden: Array<Exclude<TonoRitmo, 'sin'>> = ['mal', 'atento', 'bien']
  const piso = Math.min(2, tonos.length)
  for (const t of orden) if (tonos.filter((x) => x === t).length >= piso) return t
  return orden.find((t) => tonos.includes(t)) ?? 'sin'
}

// ── Turno cerrado: hasta dónde llega el eje ──────────────────────────────────

/**
 * El fin del eje. En vivo, el fin previsto. Cerrado: nunca menos que el previsto (un corte anticipado no encoge el eje) y
 * lo que alcance el fin real o el último minuto con dato, para que se vea la cola.
 */
export function finDelEje(args: { finMs: number; cerrado: boolean; finRealMs?: number | null; ultimoDatoMs?: number | null }): number {
  const { finMs, cerrado, finRealMs, ultimoDatoMs } = args
  if (!cerrado) return finMs
  return Math.max(finMs, finRealMs != null && Number.isFinite(finRealMs) ? finRealMs : 0, ultimoDatoMs != null && Number.isFinite(ultimoDatoMs) ? ultimoDatoMs : 0)
}

// ── Turno anterior: UNA sola cifra ───────────────────────────────────────────

/**
 * La cifra del turno anterior que dicen la leyenda y la hoja «Piezas del turno» (una sola definición):
 * - EN VIVO: el valor de su curva en el mismo minuto desde la primera pieza (lo que se dibuja);
 * - CERRADO: su total (el último punto de su curva COMPLETA, el mismo de «Comparado con otros días»).
 * `curva` está en minutos desde SU primera pieza y se dibuja corrida `baseMin` (la primera pieza de hoy, en minutos desde
 * el inicio del turno); `ultimaMin` es la punta de hoy en minutos desde el inicio. null si la curva no llega a ese minuto
 * (no se extrapola).
 */
export function cifraTurnoAnterior(args: { curva: Array<{ minutes: number; pieces: number }> | null | undefined; cerrado: boolean; ultimaMin: number; baseMin: number }): { piezas: number; modo: 'al-cierre' | 'a-esta-hora' } | null {
  const { curva, cerrado, ultimaMin, baseMin } = args
  if (!curva || curva.length < 2) return null
  if (cerrado) return { piezas: curva[curva.length - 1]!.pieces, modo: 'al-cierre' }
  const v = valorEnCurva([{ min: 0, v: 0 }, ...curva.map((q) => ({ min: q.minutes + baseMin, v: q.pieces }))], ultimaMin)
  return v == null ? null : { piezas: v, modo: 'a-esta-hora' }
}

// ── Rótulos que se cruzan ────────────────────────────────────────────────────

/**
 * Separa dos rótulos que se cruzan en el lienzo («a esta hora» y «al cierre»): si distan menos de `minDist` en y, la
 * brecha baja a `yCierre + minDist`; si no cabe, el cierre sube a `yBrecha − minDist`. `yMax` es el piso del lienzo.
 */
export function separarRotulos(yBrecha: number, yCierre: number, yMax: number, minDist = 16): { yBrecha: number; yCierre: number } {
  if (Math.abs(yBrecha - yCierre) >= minDist) return { yBrecha, yCierre }
  if (yCierre + minDist <= yMax) return { yBrecha: yCierre + minDist, yCierre }
  return { yBrecha, yCierre: yBrecha - minDist }
}
