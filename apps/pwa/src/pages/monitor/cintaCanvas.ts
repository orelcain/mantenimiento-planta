/**
 * La cinta continua de 60 s de cada Baader (spec §5 de SPEC_MONITOR_EN_VIVO_COLA): cada pieza que el reloj único reproduce
 * entra por la derecha y pasa hacia la izquierda; entre minuto y minuto NO se detiene ni se reinicia (la cola la alimenta).
 *
 * Aquí vive todo lo que NO es React: sacar de un minuto reproducido (y del anterior) en qué instante cayó cada pieza y dónde
 * estuvo parada la Baader, y dibujarlo en un canvas 2D. Los datos son los del reloj (`MinutoVista`: `horario` y `tramos` ya
 * repartidos por la regla del minuto): no se calcula ninguna pieza nueva.
 *
 * Movimiento (DESIGN.md §8, excepción «reloj de datos»): un canvas que se repinta con cada cuadro del reloj; nada de layout.
 * Con «reducir movimiento» la cinta es una regla en bucle (el minuto de 0 a 60 s, sin cabezal y sin deslizar): la pieza aparece
 * en su sitio y no se mueve.
 *
 * Tokens (mockup `piezas-en-vivo.html`): alto 28 PC / 24 móvil (lo pone el CSS); ventana 60 s; marca de 3 px × 62 % del alto, radio
 * 1,5; rejilla cada 10 s; marca en `--v2-bien` con alfa 1 → 0,3 según su edad; la recién llegada crece 1,3 → 1 en 300 ms; cabezal de
 * 2 px en `fg` al 50 %; detenida = trama a 45° en `--v2-gris` cada 6 px.
 */
import { MIN_MS, SEG_MINUTO, type MinutoMaq } from './reproduccionMinuto'
import type { MinutoVista } from './useReproduccionMinuto'

/** Lo que la cinta de UNA Baader necesita de los dos minutos que cubre su ventana, ya en milisegundos de planta. */
export interface DatosCinta {
  /** Inicio del minuto que corre. */
  iniMs: number
  /** Instante de cada pieza del minuto que corre. */
  piezas: number[]
  /** Instante de cada pieza del minuto anterior (vacío si aún no hubo uno). */
  piezasPrevio: number[]
  /** Tramos (ms) en que la Baader NO anduvo, en los dos minutos: son los que llevan trama. */
  huecos: Array<[number, number]>
}

/** «1 cada X,X s» de una Baader: 60 ÷ piezas de su último minuto cerrado, con un decimal; «—» si estuvo detenida (o aún no hay). */
export function textoCadencia(cadenciaS: number | null): string {
  return cadenciaS != null && cadenciaS > 0 ? `1 cada ${cadenciaS.toLocaleString('es-CL', { minimumFractionDigits: 1, maximumFractionDigits: 1 })} s` : '—'
}

/** Los segundos del minuto en que la Baader NO andaba: el complemento de sus tramos andando; un minuto de 0 piezas es entero. */
export function huecosDeMinuto(m: MinutoMaq): Array<[number, number]> {
  if (m.n === 0) return [[0, SEG_MINUTO]]
  const out: Array<[number, number]> = []
  let previo = 0
  for (const [a, b] of [...m.tramos, [SEG_MINUTO, SEG_MINUTO] as const]) {
    if (a - previo > 0.5) out.push([previo, a])
    previo = b
  }
  return out
}

/** Los datos de la cinta de la Baader `id` a partir del minuto que corre y el anterior. */
export function datosCinta(minuto: MinutoVista, id: string): DatosCinta {
  const actual = minuto.maquinas.find((q) => q.id === id)
  const previo = minuto.previo?.find((q) => q.id === id)
  const iniPrevio = minuto.iniMs - MIN_MS
  const huecos: Array<[number, number]> = []
  if (previo) for (const [a, b] of huecosDeMinuto(previo)) huecos.push([iniPrevio + a * 1000, iniPrevio + b * 1000])
  if (actual) for (const [a, b] of huecosDeMinuto(actual)) huecos.push([minuto.iniMs + a * 1000, minuto.iniMs + b * 1000])
  return {
    iniMs: minuto.iniMs,
    piezas: actual ? actual.horario.map((s) => minuto.iniMs + s * 1000) : [],
    piezasPrevio: previo ? previo.horario.map((s) => iniPrevio + s * 1000) : [],
    huecos,
  }
}

/** Una marca visible: su posición en la ventana (0 = la más vieja, 1 = ahora) y cuánto hace que cayó. */
export interface MarcaCinta { pos: number; edadS: number; previa: boolean }

/**
 * Las piezas que caen en la ventana de 60 s que termina en el instante reproducido `tMs`. Ninguna pieza futura (t > tMs)
 * entra: la cinta solo muestra lo que el reloj ya reprodujo.
 */
export function marcasCinta(d: DatosCinta, tMs: number): MarcaCinta[] {
  const desde = tMs - MIN_MS
  const out: MarcaCinta[] = []
  for (const t of d.piezasPrevio) if (t >= desde && t <= tMs) out.push({ pos: (t - desde) / MIN_MS, edadS: (tMs - t) / 1000, previa: true })
  for (const t of d.piezas) if (t >= desde && t <= tMs) out.push({ pos: (t - desde) / MIN_MS, edadS: (tMs - t) / 1000, previa: false })
  return out
}

/** Los colores que usa el canvas, ya resueltos (un canvas no entiende `var()`). */
export interface ColoresCinta { bien: string; reja: string; gris: string; fg: string }

/** Lee los colores del tema vigente desde el propio canvas (sus variables CSS y su `color`). */
export function leerColoresCinta(el: HTMLElement): ColoresCinta {
  const cs = getComputedStyle(el)
  const v = (n: string, o: string) => cs.getPropertyValue(n).trim() || o
  return { bien: v('--v2-bien', '#2e75b6'), reja: v('--v2-reja', 'rgb(142 142 147 / 0.14)'), gris: v('--v2-gris', 'rgb(142 142 147 / 0.75)'), fg: cs.color || '#1c1c1e' }
}

type Ctx = CanvasRenderingContext2D

function trama(x: Ctx, x0: number, x1: number, h: number, c: ColoresCinta) {
  if (x1 - x0 <= 0) return
  x.save()
  x.beginPath()
  x.rect(x0, 0, x1 - x0, h)
  x.clip()
  x.strokeStyle = c.gris
  x.globalAlpha = 0.45
  x.lineWidth = 1
  for (let i = x0 - h; i < x1; i += 6) {
    x.beginPath()
    x.moveTo(i, h)
    x.lineTo(i + h, 0)
    x.stroke()
  }
  x.restore()
}

function marca(x: Ctx, cx: number, y: number, hh: number) {
  const px = cx - 1.5
  if (typeof x.roundRect === 'function') { x.beginPath(); x.roundRect(px, y, 3, hh, 1.5); x.fill() } else x.fillRect(px, y, 3, hh)
}

/** El crecimiento de la marca recién llegada: 1,3 → 1 en 300 ms. */
export const crecimientoMarca = (edadS: number): number => (edadS < 0.3 ? 1.3 - edadS : 1)
/** El alfa de una marca según su edad: 1 → 0,3 a lo largo de la ventana. */
export const alfaMarca = (edadS: number): number => 1 - (0.7 * Math.min(60, Math.max(0, edadS))) / 60

/**
 * Pinta la cinta. `tMs` es el instante reproducido; `reducido` pinta la regla en bucle (el minuto que corre de 0 a 60 s, sin
 * cabezal ni deslizamiento).
 */
export function dibujarCinta(x: Ctx, w: number, h: number, d: DatosCinta, tMs: number, c: ColoresCinta, reducido: boolean): void {
  const mh = h * 0.62
  const y0 = (h - mh) / 2
  if (reducido) {
    const seg = Math.min(SEG_MINUTO, Math.max(0, (tMs - d.iniMs) / 1000))
    const X = (s: number) => 2 + (s / SEG_MINUTO) * (w - 4)
    x.fillStyle = c.reja
    for (let q = 0; q <= SEG_MINUTO; q += 10) x.fillRect(X(q), h - 4, 1, 4)
    for (const [a, b] of d.huecos) {
      const s0 = (a - d.iniMs) / 1000
      const s1 = Math.min(seg, (b - d.iniMs) / 1000)
      if (s1 > Math.max(0, s0)) trama(x, X(Math.max(0, s0)), X(s1), h, c)
    }
    x.fillStyle = c.bien
    for (const t of d.piezasPrevio) {
      const s = (t - (d.iniMs - MIN_MS)) / 1000
      if (s <= seg) continue
      x.globalAlpha = 0.22
      marca(x, X(s), y0, mh)
    }
    for (const t of d.piezas) {
      if (t > tMs) continue
      x.globalAlpha = 1
      marca(x, X((t - d.iniMs) / 1000), y0, mh)
    }
    x.globalAlpha = 1
    return
  }
  const X = (p: number) => 2 + p * (w - 4)
  x.fillStyle = c.reja
  for (let s = Math.ceil((tMs - MIN_MS) / 10_000) * 10_000; s <= tMs; s += 10_000) x.fillRect(X((s - (tMs - MIN_MS)) / MIN_MS), h - 4, 1, 4)
  for (const [a, b] of d.huecos) {
    const p0 = Math.max(0, (a - (tMs - MIN_MS)) / MIN_MS)
    const p1 = Math.min(1, (Math.min(b, tMs) - (tMs - MIN_MS)) / MIN_MS)
    if (p1 > p0) trama(x, X(p0), X(p1), h, c)
  }
  x.fillStyle = c.bien
  for (const m of marcasCinta(d, tMs)) {
    x.globalAlpha = alfaMarca(m.edadS)
    const hh = mh * crecimientoMarca(m.edadS)
    marca(x, X(m.pos), (h - hh) / 2, hh)
  }
  x.globalAlpha = 0.5
  x.fillStyle = c.fg
  x.fillRect(w - 2, 0, 2, h)
  x.globalAlpha = 1
}
