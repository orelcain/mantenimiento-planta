/**
 * Colores de gráficos con la paleta Pizarra («foco, contexto, estado»).
 *
 * REGLA DE ORO: sin `data-paleta="pizarra"` en <html>, `elegirColor(hoy, …)` devuelve
 * EXACTAMENTE el literal `hoy` que el gráfico traía antes (mismo string, byte a byte).
 * Con Pizarra lee el token CSS (`--serie-1`, `--grafico-meta`, `--fill-warning`, …) con
 * getComputedStyle: Chart.js / ECharts / canvas no resuelven `var()`.
 *
 * Los tokens solo dependen de dos cosas (Pizarra sí/no y clase `dark` = Día/Penumbra),
 * así que la lectura se cachea por esa clave. El hook `useColoresGrafico()` (hooks/) vuelve
 * a leer al cambiar la intensidad.
 */

const cache = new Map<string, string | null>()

/** Para tests: los tokens se fijan con style.setProperty sin cambiar la clave de cache. */
export function limpiarCacheColores(): void {
  cache.clear()
}

/** ¿El documento tiene la paleta Pizarra? (misma condición que `paletaPizarraActiva`). */
export function hayPizarra(root?: HTMLElement): boolean {
  const el = root ?? (typeof document === 'undefined' ? null : document.documentElement)
  return el ? el.getAttribute('data-paleta') === 'pizarra' : false
}

/** Valor crudo del token (sin `--`), recortado; null si no existe. Cacheado por Pizarra+Día/Penumbra. */
export function leerTokenGrafico(nombre: string, el?: HTMLElement): string | null {
  if (typeof document === 'undefined') return null
  const root = el ?? document.documentElement
  const clave = `${hayPizarra(root) ? 'p' : 'n'}${root.classList.contains('dark') ? 'd' : 'l'}|${nombre}`
  if (cache.has(clave)) return cache.get(clave) ?? null
  const v = getComputedStyle(root).getPropertyValue(`--${nombre}`).trim()
  const r = v === '' ? null : v
  cache.set(clave, r)
  return r
}

function hexARgb(hex: string): [number, number, number] | null {
  const m = /^#([0-9a-f]{3}|[0-9a-f]{6})$/i.exec(hex)
  if (!m) return null
  let h = m[1]!
  if (h.length === 3) h = h.split('').map((c) => c + c).join('')
  return [parseInt(h.slice(0, 2), 16), parseInt(h.slice(2, 4), 16), parseInt(h.slice(4, 6), 16)]
}

/**
 * Convierte el valor de un token a un color CSS con la opacidad pedida.
 * Acepta canales «R G B», `#hex` y `rgb[a](...)` (este último se devuelve tal cual,
 * ignorando `alfa`: ya trae su transparencia). Null si no se entiende.
 */
export function colorDeToken(valor: string, alfa = 1): string | null {
  const canales = /^(\d{1,3})\s+(\d{1,3})\s+(\d{1,3})$/.exec(valor)
  if (canales) return alfa >= 1 ? `rgb(${canales[1]}, ${canales[2]}, ${canales[3]})` : `rgba(${canales[1]}, ${canales[2]}, ${canales[3]}, ${alfa})`
  const rgb = hexARgb(valor)
  if (rgb) return alfa >= 1 ? valor : `rgba(${rgb[0]}, ${rgb[1]}, ${rgb[2]}, ${alfa})`
  if (/^rgba?\(/i.test(valor)) return valor
  return null
}

/**
 * El color del gráfico: `hoy` (literal de siempre) sin Pizarra; con Pizarra, el token.
 * Si el token falta o no se entiende, cae a `hoy` (nunca deja un color vacío).
 *
 * @param hoy    literal EXACTO que el gráfico usaba antes
 * @param token  nombre sin `--` (p. ej. 'serie-1', 'grafico-meta', 'fill-critical', 'mon-hoy')
 * @param alfa   opacidad 0-1 (solo con Pizarra; sin ella `hoy` ya trae la suya)
 */
export function elegirColor(hoy: string, token: string, alfa = 1): string {
  if (typeof document === 'undefined' || !hayPizarra()) return hoy
  const v = leerTokenGrafico(token)
  return (v && colorDeToken(v, alfa)) || hoy
}

/** Atajo para componentes: «sin Pizarra → `hoy`, con Pizarra → `con`» (valores no-color). */
export function porPaleta<T>(hoy: T, con: T): T {
  return typeof document !== 'undefined' && hayPizarra() ? con : hoy
}

const tramas = new Map<string, HTMLCanvasElement | null>()

/**
 * Patrón de trama diagonal para canvas/ECharts: relleno `base` con franjas `raya` (el color
 * de la tarjeta). Devuelve un `PatternObject` de zrender (`fill: trama`), o el color liso si
 * no hay canvas (jsdom, SSR). Se usa solo con Pizarra («contexto»: colación, planificado).
 */
export function tramaDiagonal(base: string, raya: string): string | { type: 'pattern'; image: HTMLCanvasElement; repeat: 'repeat' } {
  if (typeof document === 'undefined') return base
  const clave = `${base}|${raya}`
  let c = tramas.get(clave)
  if (c === undefined) {
    c = document.createElement('canvas')
    c.width = 8
    c.height = 8
    const g = c.getContext?.('2d') ?? null
    if (!g) c = null
    else {
      g.fillStyle = base
      g.fillRect(0, 0, 8, 8)
      g.strokeStyle = raya
      g.lineWidth = 2
      g.beginPath()
      // diagonal a 45° que cierra en las esquinas del mosaico (continúa sin costura)
      g.moveTo(-2, 2); g.lineTo(2, -2)
      g.moveTo(0, 8); g.lineTo(8, 0)
      g.moveTo(6, 10); g.lineTo(10, 6)
      g.stroke()
    }
    tramas.set(clave, c)
  }
  return c ? { type: 'pattern', image: c, repeat: 'repeat' } : base
}
