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
/** HH:MM de un instante wall-as-UTC (la hora de planta). */
export const relojDe = (ms: number) => new Date(ms).toISOString().slice(11, 16)
export const horasMin = (min: number) => (min >= 60 ? `${Math.floor(min / 60)} h ${Math.round(min % 60)} min` : `${Math.round(min)} min`)

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
 */
export function escalaAcumulado(tope: number): { paso: number; max: number; rejilla: number } {
  const t = Math.max(1, tope)
  const paso = t <= 8000 ? 1000 : t <= 20000 ? 2000 : 5000
  return { paso, max: Math.ceil(t / paso) * paso, rejilla: paso * 2 }
}

// ── Marcas de hora ───────────────────────────────────────────────────────────

const PASOS_MARCA_MIN = [1, 2, 5, 10, 15, 30, 60, 120, 180, 240]

/** El paso de marca más chico (min) que deja al menos `minPx` entre dos marcas. */
export function pasoMarcas(pxPorMin: number, minPx: number): number {
  return PASOS_MARCA_MIN.find((p) => p * pxPorMin >= minPx) ?? 240
}

/**
 * Minutos (desde el inicio del turno) donde va una hora en el eje X: cada `pasoMarcas` y el fin del turno si queda
 * lugar. La marca que cae a menos de `ahoraPx` del «ahora» se omite: ahí va el rótulo «02:35 ahora».
 */
export function marcasEje(args: { totalMin: number; pxPorMin: number; minPx: number; ahoraMin: number | null; ahoraPx: number }): number[] {
  const { totalMin, pxPorMin, minPx, ahoraMin, ahoraPx } = args
  if (!(totalMin > 0) || !(pxPorMin > 0)) return []
  const paso = pasoMarcas(pxPorMin, minPx)
  const out: number[] = []
  for (let t = 0; t <= totalMin; t += paso) out.push(t)
  const ultimo = out[out.length - 1]!
  if (ultimo < totalMin && (totalMin - ultimo) * pxPorMin >= minPx * 0.45) out.push(totalMin)
  return ahoraMin == null ? out : out.filter((t) => Math.abs(t - ahoraMin) * pxPorMin >= ahoraPx)
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
        if (k >= m.cycles.length) return { tono: 'sin', estado: 'detenida' }
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
        })
      }
    }
  }
  return out.sort((a, b) => a.desdeMin - b.desdeMin)
}

/** La parada que cubre el minuto `m` (la más larga si hay varias), o null. */
export function paradaEn(paradas: ParadaEje[], m: number): ParadaEje | null {
  let mejor: ParadaEje | null = null
  for (const p of paradas) {
    if (m >= p.desdeMin && m < Math.max(p.hastaMin, p.desdeMin + 1)) {
      if (!mejor || p.hastaMin - p.desdeMin > mejor.hastaMin - mejor.desdeMin) mejor = p
    }
  }
  return mejor
}

/** El color de cada dueño en rellenos y swatches, y la trama de Mantención (rayas oscuras sobre el ámbar, para no depender solo del color). */
export const RELLENO_DUENO = { mantencion: 'var(--v2-mant)', externo: 'var(--v2-ext)', 'sin-imputar': 'var(--v2-gris)', programado: 'var(--v2-prog)' } as const
export const TRAMA_MANT = 'repeating-linear-gradient(135deg, rgb(0 0 0 / 0.4) 0 2px, transparent 2px 5px), var(--v2-mant)'

// ── Diseño vertical ──────────────────────────────────────────────────────────

/** Por el ancho del GRÁFICO (no de la ventana): ≥ 1.480 pantalla de 1920, ≥ 600 la de 1366 y tablets, debajo el celular. */
export type TamanoGrafico = 'grande' | 'medio' | 'chico'
export const tamanoGrafico = (w: number): TamanoGrafico => (w >= 1480 ? 'grande' : w >= 600 ? 'medio' : 'chico')

/** Las medidas del mockup aprobado (1920 / 1366 / 375): columna de rótulos izquierda y derecha y alto de cada banda. */
const MEDIDAS: Record<TamanoGrafico, { lab: number; der: number; acum: number; barras: number; ev: number }> = {
  grande: { lab: 52, der: 128, acum: 290, barras: 84, ev: 14 },
  medio: { lab: 48, der: 104, acum: 206, barras: 60, ev: 11 },
  chico: { lab: 44, der: 0, acum: 160, barras: 48, ev: 10 },
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
