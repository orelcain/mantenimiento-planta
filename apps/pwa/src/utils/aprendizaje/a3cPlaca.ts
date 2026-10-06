/**
 * Vista «Placa» de la tarjeta A3C: geometría del dibujo de la placa REAL de la N2 (Línea 2),
 * hecho desde una foto (`public/learning-assets/baader-142/a3c/placa-n2.svg`).
 *
 * El SVG trae IDs estables (`borne-X5-n`, `led-X5-n`, `regleta-X5-a-b`) dentro de grupos con
 * `transform`. Aquí se leen una sola vez y se pasan a coordenadas del dibujo (las del viewBox
 * raíz) para tocar, encender y encuadrar sin depender de `getBBox` (que no existe en pruebas).
 *
 * HONESTIDAD: `data-estado` de cada LED es el estado que tenía en la FOTO, no un estado en
 * vivo. Da el color del LED (rojo / verde / ámbar) y la línea «En la foto de la N2: …» (tablas
 * `LEDS_*_FOTO` de `a3c.ts`, comparadas con este SVG en las pruebas). La herramienta los dibuja
 * todos apagados y enciende solo el LED que es señal del elemento elegido (modo `senal`); el resto
 * se marca con contorno o con un punto neutro (`ItemA3c.modoLed`).
 */
import type { PresetV5, Rect, ViewBox } from '@/data/baader142A3c'
import { claveDeBorne, colorLed, type ColorLed, type ItemA3c, type LimitesCamara, type LineaLed, type ModeloA3c, type Objetivo, type PuntoLed, type PuntoNeutro } from './a3c'

export interface LedPlaca { x: number; y: number; r: number; color: ColorLed }
/** LED de estado de la placa (`led-estado-k`) ya asociado a un LED de estado del plano. */
export interface LedEstadoPlaca extends LedPlaca { svgId: string }
export interface RegletaPlaca { desde: number; hasta: number; r: Rect }
export interface GeoPlaca {
  viewBox: ViewBox
  bornes: Map<number, Rect>
  leds: Map<number, LedPlaca>
  /** Por id del LED de estado del plano (`data-led-plano`, p. ej. «V60_1»). */
  ledsEstado: Map<string, LedEstadoPlaca>
  regletas: RegletaPlaca[]
}

// ─── Transformaciones SVG (afines) ─────────────────────────────────────────

/** [a, b, c, d, e, f] de `matrix(a b c d e f)`. */
type Matriz = [number, number, number, number, number, number]
const IDENTIDAD: Matriz = [1, 0, 0, 1, 0, 0]

function multiplicar(p: Matriz, q: Matriz): Matriz {
  return [
    p[0] * q[0] + p[2] * q[1],
    p[1] * q[0] + p[3] * q[1],
    p[0] * q[2] + p[2] * q[3],
    p[1] * q[2] + p[3] * q[3],
    p[0] * q[4] + p[2] * q[5] + p[4],
    p[1] * q[4] + p[3] * q[5] + p[5],
  ]
}

/** Lee `matrix`, `translate`, `scale` y `rotate` (las que usa el dibujo de la placa). */
export function leerTransform(t: string | null): Matriz {
  if (!t) return IDENTIDAD
  let m = IDENTIDAD
  for (const [, fn, args] of t.matchAll(/(\w+)\s*\(([^)]*)\)/g)) {
    const v = (args ?? '').split(/[\s,]+/).filter(Boolean).map(Number)
    const [a = 0, b, c, d, e, f] = v
    let q: Matriz = IDENTIDAD
    if (fn === 'matrix' && v.length === 6) q = [a, b!, c!, d!, e!, f!]
    else if (fn === 'translate') q = [1, 0, 0, 1, a, b ?? 0]
    else if (fn === 'scale') q = [a, 0, 0, b ?? a, 0, 0]
    else if (fn === 'rotate') {
      const r = (a * Math.PI) / 180
      const [cs, sn] = [Math.cos(r), Math.sin(r)]
      const cx = b ?? 0
      const cy = c ?? 0
      q = [cs, sn, -sn, cs, cx - cs * cx + sn * cy, cy - sn * cx - cs * cy]
    }
    m = multiplicar(m, q)
  }
  return m
}

const aplicar = (m: Matriz, x: number, y: number): [number, number] => [m[0] * x + m[2] * y + m[4], m[1] * x + m[3] * y + m[5]]

/** Caja (en coordenadas raíz) de un rectángulo local transformado. */
function cajaTransformada(m: Matriz, x: number, y: number, w: number, h: number): Rect {
  const ps = [aplicar(m, x, y), aplicar(m, x + w, y), aplicar(m, x, y + h), aplicar(m, x + w, y + h)]
  const xs = ps.map(p => p[0])
  const ys = ps.map(p => p[1])
  const x0 = Math.min(...xs)
  const y0 = Math.min(...ys)
  return { x: x0, y: y0, w: Math.max(...xs) - x0, h: Math.max(...ys) - y0 }
}

function unir(a: Rect | null, b: Rect): Rect {
  if (!a) return b
  const x0 = Math.min(a.x, b.x)
  const y0 = Math.min(a.y, b.y)
  return { x: x0, y: y0, w: Math.max(a.x + a.w, b.x + b.w) - x0, h: Math.max(a.y + a.h, b.y + b.h) - y0 }
}

const num = (el: Element, a: string) => Number(el.getAttribute(a) ?? 0)

/** Caja de las piezas de un borne: rectángulos, círculos y la línea separadora (`M x y h dx`). */
function cajaDe(el: Element, m: Matriz): Rect | null {
  let caja: Rect | null = null
  const tag = el.tagName.toLowerCase()
  if (tag === 'rect') caja = cajaTransformada(m, num(el, 'x'), num(el, 'y'), num(el, 'width'), num(el, 'height'))
  else if (tag === 'circle') {
    const r = num(el, 'r')
    caja = cajaTransformada(m, num(el, 'cx') - r, num(el, 'cy') - r, 2 * r, 2 * r)
  } else if (tag === 'path') {
    const p = /^\s*M\s*([-\d.]+)[\s,]+([-\d.]+)\s*h\s*([-\d.]+)\s*$/i.exec(el.getAttribute('d') ?? '')
    if (p) caja = cajaTransformada(m, Number(p[1]), Number(p[2]), Number(p[3]), 0)
  }
  for (const h of Array.from(el.children)) {
    const c = cajaDe(h, multiplicar(m, leerTransform(h.getAttribute('transform'))))
    if (c) caja = unir(caja, c)
  }
  return caja
}

/**
 * Lee la geometría del SVG de la placa. Usa `DOMParser` (navegador y pruebas con happy-dom);
 * el texto ya viene del mismo origen (`public/`) y no se inserta desde aquí.
 */
export function geometriaPlaca(svg: string): GeoPlaca {
  // Sin la declaración XML: con comillas simples (`<?xml version='1.0'?>`) happy-dom no la acepta.
  const doc = new DOMParser().parseFromString(svg.replace(/^\s*<\?xml[^>]*\?>/, ''), 'image/svg+xml')
  const raiz = doc.documentElement
  if (!raiz || raiz.tagName.toLowerCase() !== 'svg') throw new Error('El dibujo de la placa no es un SVG válido')
  const vb = (raiz.getAttribute('viewBox') ?? '').split(/[\s,]+/).map(Number)
  const geo: GeoPlaca = {
    viewBox: vb.length === 4 && vb.every(Number.isFinite) ? (vb as ViewBox) : [0, 0, 1000, 1000],
    bornes: new Map(),
    leds: new Map(),
    ledsEstado: new Map(),
    regletas: [],
  }
  /** Centro y radio (coordenadas raíz) del círculo de un LED. */
  const circuloDe = (el: Element, m: Matriz) => {
    const c = el.querySelector('circle')
    if (!c) return null
    // El círculo puede tener su propio transform (hoy no lo tiene).
    const mc = multiplicar(m, leerTransform(c.getAttribute('transform')))
    const [x, y] = aplicar(mc, num(c, 'cx'), num(c, 'cy'))
    return { x, y, r: num(c, 'r') * Math.sqrt(Math.abs(mc[0] * mc[3] - mc[1] * mc[2])) }
  }
  const visitar = (el: Element, m0: Matriz) => {
    const m = multiplicar(m0, leerTransform(el.getAttribute('transform')))
    const id = el.getAttribute('id') ?? ''
    let k: RegExpExecArray | null
    if ((k = /^borne-X5-(\d+)$/.exec(id))) {
      const c = cajaDe(el, m)
      if (c) geo.bornes.set(Number(k[1]), c)
    } else if ((k = /^led-X5-(\d+)$/.exec(id))) {
      // Solo lo cierto: un LED cuya asociación al borne es dudosa no se enciende como si fuera suyo.
      const c = el.getAttribute('data-asociacion') === 'ambigua' ? null : circuloDe(el, m)
      if (c) {
        const color: ColorLed = (el.getAttribute('data-estado') ?? '').startsWith('verde') ? 'g' : 'r'
        geo.leds.set(Number(k[1]), { ...c, color })
      }
    } else if (/^led-estado-\d+$/.test(id)) {
      // Solo los que ya tienen su LED del plano asignado (`data-led-plano`).
      const plano = el.getAttribute('data-led-plano')
      const c = plano ? circuloDe(el, m) : null
      if (plano && c) geo.ledsEstado.set(plano, { ...c, color: 'r', svgId: id })
    } else if ((k = /^regleta-X5-(\d+)-(\d+)$/.exec(id))) {
      // El cuerpo es el primer <rect> (en las regletas izquierdas va dentro de un <g> extra).
      const cuerpo = el.querySelector('rect')
      if (cuerpo) {
        let mr = IDENTIDAD
        for (let a: Element | null = cuerpo; a && a !== el; a = a.parentElement) mr = multiplicar(leerTransform(a.getAttribute('transform')), mr)
        mr = multiplicar(m, mr)
        geo.regletas.push({
          desde: Number(k[1]),
          hasta: Number(k[2]),
          r: cajaTransformada(mr, num(cuerpo, 'x'), num(cuerpo, 'y'), num(cuerpo, 'width'), num(cuerpo, 'height')),
        })
      }
    }
    for (const h of Array.from(el.children)) visitar(h, m)
  }
  visitar(raiz, IDENTIDAD)
  geo.regletas.sort((a, b) => a.desde - b.desde)
  return geo
}

// ─── Encuadres, objetivos y LED ───────────────────────────────────────────

/** Atajos de zoom de la placa: todo y una zona por grupo de regletas (como están en la foto). */
export const ZONAS_PLACA: { k: string; l: string; desde: number; hasta: number }[] = [
  { k: 'p1', l: '1–29', desde: 1, hasta: 29 },
  { k: 'p30', l: '30–54', desde: 30, hasta: 54 },
  { k: 'p55', l: '55–94', desde: 55, hasta: 94 },
  { k: 'p95', l: '95–134', desde: 95, hasta: 134 },
]

/** Zona (atajo) de un borne, o null si la placa no lo dibuja (136–145). */
export const zonaPlaca = (n: number) => ZONAS_PLACA.find(z => n >= z.desde && n <= z.hasta)?.k ?? null

/** Encuadres desde las cajas reales de las regletas X5, sus bornes y sus LED, con un margen. */
export function presetsPlaca(geo: GeoPlaca): Record<string, PresetV5> {
  const [vx, vy, vw, vh] = geo.viewBox
  const out: Record<string, PresetV5> = {
    todo: { bb: [vx, vy, vx + vw, vy + vh], cx: vx + vw / 2, cy: vy + vh / 2, w: vw, l: 'Todo' },
  }
  const M = 10
  for (const z of ZONAS_PLACA) {
    let caja: Rect | null = null
    for (const r of geo.regletas) if (r.desde >= z.desde && r.hasta <= z.hasta) caja = unir(caja, r.r)
    for (const [n, b] of geo.bornes) if (n >= z.desde && n <= z.hasta) caja = unir(caja, b)
    for (const [n, l] of geo.leds) if (n >= z.desde && n <= z.hasta) caja = unir(caja, { x: l.x - l.r, y: l.y - l.r, w: 2 * l.r, h: 2 * l.r })
    if (!caja) continue
    const bb: [number, number, number, number] = [caja.x - M, caja.y - M, caja.x + caja.w + M, caja.y + caja.h + M]
    out[z.k] = { bb, cx: (bb[0] + bb[2]) / 2, cy: (bb[1] + bb[3]) / 2, w: bb[2] - bb[0], l: z.l }
  }
  return out
}

export function limitesPlaca(geo: GeoPlaca): LimitesCamara {
  const [vx, vy, vw, vh] = geo.viewBox
  return { minW: 50, maxW: vw * 1.4, bounds: [vx, vy, vx + vw, vy + vh] }
}

/** Bornes y LED tocables: los dos llevan al mismo elemento (mismo mapeo que el plano). */
export function objetivosPlaca(m: ModeloA3c, geo: GeoPlaca): Objetivo[] {
  const out: Objetivo[] = []
  const caja = (l: LedPlaca): Rect => ({ x: l.x - l.r, y: l.y - l.r, w: 2 * l.r, h: 2 * l.r })
  for (const [n, r] of geo.bornes) if (m.bornes.has(n)) out.push({ clave: claveDeBorne(m, n), n, r })
  for (const [n, l] of geo.leds) if (m.bornes.has(n)) out.push({ clave: claveDeBorne(m, n), n, r: caja(l) })
  // LED de estado: llevan a su LED del plano (como tocar ese LED en la hoja 23).
  for (const [id, l] of geo.ledsEstado) if (m.ledsEstado.has(id)) out.push({ clave: `l:${id}`, r: caja(l) })
  return out
}

/** Alto típico de un borne en la placa (para decidir si un dedo toca dos a la vez). */
export function altoBornePlaca(geo: GeoPlaca): number {
  const hs = [...geo.bornes.values()].map(r => r.h).sort((a, b) => a - b)
  return hs[Math.floor(hs.length / 2)] ?? 10
}

export type LedEncendidoPlaca = PuntoLed & { r: number; /** Grupo del LED en el SVG de la placa. */ svgId: string; n?: number }
export type LedNeutroPlaca = PuntoNeutro & { r: number; svgId: string; n?: number }

/** LED X5 y de estado de la placa que tocan a un ítem (los que la placa dibuja), con su id en el SVG. */
function ledsDeItem(geo: GeoPlaca, item: ItemA3c): { k: string; n?: number; svgId: string; l: LedPlaca }[] {
  const out: { k: string; n?: number; svgId: string; l: LedPlaca }[] = []
  for (const n of item.leds) {
    const l = geo.leds.get(n)
    if (l) out.push({ k: `${item.clave}:${n}`, n, svgId: `led-X5-${n}`, l })
  }
  for (const e of item.ledsEstado) {
    const l = geo.ledsEstado.get(e.id)
    if (l) out.push({ k: `${item.clave}:${e.id}`, svgId: l.svgId, l })
  }
  return out
}

/**
 * Los LED de la placa que se ENCIENDEN para un ítem (solo en modo `senal`): los de sus bornes con
 * LED en el plano y sus LED de estado que la placa tiene asignados (`data-led-plano`).
 */
export function ledsPlaca(geo: GeoPlaca, item: ItemA3c): LedEncendidoPlaca[] {
  if (item.modoLed !== 'senal') return []
  // Mismo color que en el plano (tabla de la foto en `colorLed`; rojo para los de estado): una sola fuente.
  return ledsDeItem(geo, item).map(({ k, n, svgId, l }) => ({ k, n, svgId, x: l.x, y: l.y, r: l.r, color: n != null ? colorLed(n) : 'r' }))
}

/** Los LED de la placa que se marcan con contorno (modo `contorno`): fijo, sin encender. */
export function ledsGrupoPlaca(geo: GeoPlaca, item: ItemA3c): LedEncendidoPlaca[] {
  if (item.modoLed !== 'contorno') return []
  return ledsDeItem(geo, item).map(({ k, n, svgId, l }) => ({ k, n, svgId, x: l.x, y: l.y, r: l.r, color: n != null ? colorLed(n) : 'r' }))
}

/** Los LED de la placa que se marcan con un punto fijo neutro (modo `neutro`). */
export function ledsNeutrosPlaca(geo: GeoPlaca, item: ItemA3c): LedNeutroPlaca[] {
  if (item.modoLed !== 'neutro') return []
  const tono = item.tono ?? 'gris'
  return ledsDeItem(geo, item).map(({ k, n, svgId, l }) => ({ k, n, svgId, x: l.x, y: l.y, r: l.r, tono }))
}

/**
 * La franja «qué LED prende» vista desde la placa. El plano manda (mismo número de LED), pero
 * si en la placa no hay nada que mostrar se dice, y «Ver» lleva al plano en vez de no hacer nada.
 */
export function lineaEnPlaca(linea: LineaLed, geo: GeoPlaca, item: ItemA3c): LineaLed & { soloPlano: boolean } {
  const foco = focoPlaca(geo, item)
  if (!linea.encendible) {
    // Un borne sin LED que la placa no dibuja (136–145): igual se puede ver dónde está en el plano.
    if (item.bornes.length && !foco) {
      const nombreVer = `el borne ${item.bornes.join(', ')}`
      // Un borne que otra hoja sí dibuja con LED (31) no dice «Sin LED en el plano».
      const texto = item.sinLed
        ? `${item.sinLed.texto.replace(/[.\s]+$/, '')} · No está dibujado en la placa`
        : 'Sin LED en el plano · No está dibujado en la placa'
      return { ...linea, texto, encendible: true, nombreVer, soloPlano: true }
    }
    return { ...linea, soloPlano: false }
  }
  if (ledsDeItem(geo, item).length) return { ...linea, soloPlano: false }
  const base = linea.texto.replace(/[.\s]+$/, '')
  if (!foco) return { ...linea, texto: `${base} · No está dibujado en la placa`, soloPlano: true }
  return { ...linea, texto: `${base} · Sin LED identificado en la placa`, soloPlano: false }
}

/** Punto al que ir en la placa: el primer LED del ítem que la placa dibuja o, si no hay, el centro del primer borne. */
export function focoPlaca(geo: GeoPlaca, item: ItemA3c): [number, number] | null {
  const l = ledsDeItem(geo, item)[0]
  if (l) return [l.l.x, l.l.y]
  for (const n of item.bornes) {
    const b = geo.bornes.get(n)
    if (b) return [b.x + b.w / 2, b.y + b.h / 2]
  }
  return null
}

// ─── Preferencia Plano | Placa ────────────────────────────────────────────

export type VistaTarjeta = 'plano' | 'placa'
const K_VISTA = 'a3c-vista-tarjeta'

export function leerVistaTarjeta(): VistaTarjeta {
  try {
    return localStorage.getItem(K_VISTA) === 'placa' ? 'placa' : 'plano'
  } catch {
    return 'plano'
  }
}

export function guardarVistaTarjeta(v: VistaTarjeta): void {
  try {
    localStorage.setItem(K_VISTA, v)
  } catch {
    /* sin almacenamiento: la vista vale solo para esta visita */
  }
}
