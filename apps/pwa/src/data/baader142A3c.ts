/**
 * Tarjeta A3C · BAADER 142 (plano 142.71.00.888, hojas 22 y 23 · máquinas N2 y N3).
 *
 * Los datos y los dos dibujos son ASSETS en `public/learning-assets/baader-142/a3c/`:
 * el JSON pesa ~200 KB y los SVG ~95 KB, y solo los necesita esta herramienta. Se piden
 * con `fetch` la primera vez que se abre la página (una sola vez por sesión) para no
 * inflar ningún chunk de JavaScript.
 *
 * El esquema es el del paquete validado (`a3c-datos.d.ts`): coordenadas en unidades SVG,
 * hoja 23 ya girada (x' = y, y' = 1131,73 − x), dibujos sin texto (los textos los pone la
 * app desde `textos`).
 */

export type ViewBox = [x: number, y: number, w: number, h: number]
export interface Rect { x: number; y: number; w: number; h: number }
/** r = 2.9: radio del área interactiva de un LED. */
export interface Led { x: number; y: number; r: number }
export type Sentido = 'entrada' | 'salida' | 'alimentacion' | 'comunicacion' | 'no_indicado' | 'sin_etiqueta'
export interface Borne {
  borne: number
  regleta: string
  tipo: string
  senal_original: string
  senal_es: string
  elemento: string | null
  sentido: Sentido
  led: Led | null
  celda: Rect
}
export interface Elemento {
  etiqueta: string
  original: string
  es: string
  tipo: string
  que_hace: string
  senal_a3c: string
  /** Todos los bornes asociados, incluidos pares encoder y bits; [] si ninguno. */
  borne: number[]
  led_texto: string
  modulo: string | null
  certeza: 'alta' | 'baja'
  /** Fuentes en forma corta, p. ej. «Manual 2005, p. 66»; obligatorias en certeza alta. */
  fuentes?: string[]
  /** Aviso breve cuando las hojas del plano se contradicen. */
  nota?: string
  /** Tipo de sensor declarado por la lista eléctrica del manual. */
  tipo_sensor?: string
  /** Solo en certeza baja: qué confirmar en terreno. */
  pregunta_terreno?: string
  /** [] cuando no hay ubicación en la hoja 22. */
  hoja22_hotspots: Rect[]
}
export interface LayoutV5 {
  k: 't' | 'title'
  x: number
  y?: number
  cy?: number
  a?: 'start' | 'end'
  size: number
  or: string
  es: string
  tlo: number
  tle?: number
  g?: string | null
  maxW?: number
  lines?: [texto: string, ancho: number][]
  fs?: number
  ys?: number[]
  k_es?: number
}
export interface Texto {
  x: number
  y: number
  size: number
  rot: number
  original: string
  es: string
  es_codigo: boolean
  maxAncho: number
  layout_v5: LayoutV5
}
export interface LedEstado {
  id: string
  etiqueta: string
  original: string
  es: string
  elemento: string | null
  led: Led
}
export interface Pregunta {
  contexto: 'pc' | 'telefono'
  lit: number[]
  q: string
  ops: [codigo: string, descripcion: string][]
  ok: number
  why: string
  after?: number[]
}
export interface PresetV5 {
  bb?: [x0: number, y0: number, x1: number, y1: number]
  cx: number
  cy: number
  w: number
  l: string
}
export interface A3CDatos {
  fuente: { plano: string; hojas: number[]; maquinas: string[] }
  bornes: Borne[]
  elementos: Record<string, Elemento>
  textos: { hoja22: Texto[]; hoja23: Texto[] }
  vistas: { hoja22: Record<string, ViewBox>; hoja23: Record<string, ViewBox> }
  ledsEstado: LedEstado[]
  quiz: Pregunta[]
  presets_v5: { hoja22: Record<string, PresetV5>; hoja23: Record<string, PresetV5> }
}

export type Hoja = '22' | '23'

/** Lo que la herramienta necesita para dibujar: datos + el interior de cada SVG. */
export interface PaqueteA3c {
  datos: A3CDatos
  /** Interior del SVG (sin la etiqueta <svg> ni su <style>), listo para un <g>. */
  dibujo: Record<Hoja, string>
}

const BASE = import.meta.env?.BASE_URL ?? '/'
export const RUTA_ASSETS_A3C = `${BASE}learning-assets/baader-142/a3c/`

/**
 * Deja solo el contenido del SVG y renombra sus clases con prefijo `a3c-`: el <style> del
 * archivo es global si se inserta en la página, y `.tinta` / `.s2` son nombres demasiado
 * genéricos. Las reglas equivalentes viven en `components/aprendizaje/a3c/a3c.css`.
 */
export function interiorSvg(svg: string): string {
  const ini = svg.indexOf('>', svg.indexOf('<svg'))
  const fin = svg.lastIndexOf('</svg>')
  const cuerpo = ini >= 0 && fin > ini ? svg.slice(ini + 1, fin) : svg
  return cuerpo
    .replace(/<style[\s\S]*?<\/style>/g, '')
    .replace(/class="([^"]*)"/g, (_m, c: string) => `class="${c.split(/\s+/).filter(Boolean).map(x => `a3c-${x}`).join(' ')}"`)
}

let cache: Promise<PaqueteA3c> | null = null

/** Pide los tres assets una sola vez por sesión. Si falla, el siguiente intento reintenta. */
export function cargarA3c(): Promise<PaqueteA3c> {
  if (!cache) {
    const texto = (archivo: string) => fetch(`${RUTA_ASSETS_A3C}${archivo}`).then(r => {
      if (!r.ok) throw new Error(`No se pudo cargar ${archivo} (${r.status})`)
      return r.text()
    })
    cache = Promise.all([texto('a3c-datos.json'), texto('hoja22.svg'), texto('hoja23.svg')])
      .then(([json, h22, h23]) => ({
        datos: JSON.parse(json) as A3CDatos,
        dibujo: { '22': interiorSvg(h22), '23': interiorSvg(h23) },
      }))
      .catch(err => {
        cache = null
        throw err
      })
  }
  return cache
}
