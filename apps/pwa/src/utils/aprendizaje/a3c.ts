/**
 * Lógica pura de la Tarjeta A3C · BAADER 142: qué se elige, qué LED prende, qué dice la
 * ficha, el buscador, la cámara del lienzo, el toque y el quiz. Sin React ni DOM, para
 * probarla sola (`__tests__/a3c.test.ts`).
 *
 * Una selección es una clave de texto:
 *   `e:<clave>`  un elemento del glosario (B4, Y8, SM2…)
 *   `b:<n>`      un borne X5 que no pertenece a ningún elemento (51 Start, 92 Störung…)
 *   `l:<id>`     un LED de estado propio de la tarjeta (RL1, STEP3, RESET…)
 */
import type { A3CDatos, Borne, Elemento, LedEstado, PresetV5, Rect, Texto } from '@/data/baader142A3c'

export type Idioma = 'es' | 'or'
export type ClaveSel = string

// ─── Regletas ─────────────────────────────────────────────────────────────

export interface Regleta {
  desde: number
  hasta: number
  /** Clave del atajo de zoom de la hoja 23 (`presets_v5.hoja23`). */
  preset: string
  original: string
  es: string
}

/** Las 7 regletas X5, con el título de su módulo tal como lo rotula el plano (no hay 135). */
export const REGLETAS: Regleta[] = [
  { desde: 1, hasta: 29, preset: 'r1', original: 'SM3 Sauger', es: 'SM3 aspirador' },
  { desde: 30, hasta: 54, preset: 'r30', original: 'SM2 Schlitzmesser', es: 'SM2 cuchilla hendedora' },
  { desde: 55, hasta: 65, preset: 'r55', original: 'SM1 Zentrierung · RS232', es: 'SM1 centrado · RS232' },
  { desde: 66, hasta: 94, preset: 'r66', original: 'SM4 Kratzer A', es: 'SM4 raspador A' },
  { desde: 95, hasta: 123, preset: 'r95', original: 'SM5 Kratzer B', es: 'SM5 raspador B' },
  { desde: 124, hasta: 134, preset: 'r124', original: 'SM6 Antrieb', es: 'SM6 accionamiento' },
  { desde: 136, hasta: 145, preset: 'r136', original: 'Versorgung', es: 'Alimentación' },
]

export function regletaDe(n: number): Regleta | undefined {
  return REGLETAS.find(r => n >= r.desde && n <= r.hasta)
}

/**
 * Bornes X5 cuyo LED es VERDE, según la foto de la placa de la N2 (prefijo `verde-` del
 * `data-estado` de cada `led-X5-n` en `placa-n2.svg`; el test de integridad lo compara). La foto
 * es lo único que respalda el color: el plano no lo dice. Tabla estática para no tener que
 * cargar la placa en la vista «Plano».
 */
export const LEDS_VERDES_FOTO: ReadonlySet<number> = new Set([
  1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 14, 16, 18, 20, 22, 24, 26, 28,
  66, 68, 70, 72, 74, 76, 78, 80, 82, 84, 92, 93, 94,
  95, 96, 97, 98, 99, 100, 101, 102, 103, 104, 105, 106, 107, 108, 109, 110, 111,
])

/**
 * Color del LED de un borne X5: verde si la foto de la N2 lo muestra verde; rojo en el resto
 * y en los LED de estado. Los LED que la foto no muestra (139–145, zona de potencia) quedan en
 * rojo solo como dibujo: ningún texto de la herramienta afirma su color.
 */
export type ColorLed = 'r' | 'g'
export function colorLed(n: number): ColorLed {
  return LEDS_VERDES_FOTO.has(n) ? 'g' : 'r'
}

// ─── Modelo ───────────────────────────────────────────────────────────────

export interface ModeloA3c {
  datos: A3CDatos
  bornes: Map<number, Borne>
  ledsEstado: Map<string, LedEstado>
}

export function construirModelo(datos: A3CDatos): ModeloA3c {
  return {
    datos,
    bornes: new Map(datos.bornes.map(b => [b.borne, b])),
    ledsEstado: new Map(datos.ledsEstado.map(l => [l.id, l])),
  }
}

/** Sin el prefijo de nota «8) » que el plano pone a algunas señales. */
export function limpiarSenal(s: string): string {
  return s.replace(/^\d\)\s*/, '').trim()
}

/**
 * Rótulo del borne para mostrarlo. `senal_original` de los bornes 112–115 trae «Peso N»,
 * palabra que la hoja 23 no dibuja (solo los números 2, 4, 8, 16 del grupo S20–S24), y alimenta
 * `codigoCorto`; a la vista va el rótulo literal de `senal_es`.
 */
export function rotuloBorne(b: Borne): string {
  return limpiarSenal(/^\s*(\d\)\s*)?Peso(?!\w)/.test(b.senal_original) ? b.senal_es : b.senal_original)
}

/** Clave canónica al tocar un borne: su elemento si lo tiene; si no, el borne suelto. */
export function claveDeBorne(m: ModeloA3c, n: number): ClaveSel {
  const b = m.bornes.get(n)
  return b?.elemento && m.datos.elementos[b.elemento] ? `e:${b.elemento}` : `b:${n}`
}

// ─── Lo que se muestra de una selección ────────────────────────────────────

export type TipoItem = 'sensor' | 'encoder' | 'salida' | 'motor' | 'alimentacion' | 'comunicacion' | 'led' | 'otro' | 'sin'

export const ETIQUETA_TIPO: Record<TipoItem, string> = {
  sensor: 'Sensor · entrada',
  encoder: 'Encoder · entrada',
  salida: 'Salida',
  motor: 'Motor',
  alimentacion: 'Alimentación',
  comunicacion: 'Comunicación',
  led: 'LED de estado de la tarjeta',
  otro: 'Señal',
  sin: 'Sin etiqueta en el plano',
}

export const SIN_DESCRIPCION = 'Sin descripción en el plano ni el manual.'

export interface ItemA3c {
  clave: ClaveSel
  codigo: string
  /** Nombre en el idioma elegido. */
  nombre: string
  /** Con «Original», el nombre en español va debajo como apoyo. */
  nombreApoyo: string | null
  tipo: TipoItem
  /**
   * La píldora de tipo solo se muestra si el manual o el catálogo lo respaldan para ESTE
   * elemento (ver `tipoRespaldado`). Un elemento de certeza baja nunca la muestra.
   */
  mostrarTipo: boolean
  bornes: number[]
  /** Bornes de este ítem que tienen su LED dibujado en el plano. */
  leds: number[]
  ledsEstado: LedEstado[]
  hotspots: Rect[]
  queHace: { texto: string; conDatos: boolean }
  cuandoLed: string
  senal: string
  /** Texto tal cual en el plano (alemán o código), para la ficha. */
  enPlano: string
  modulo: string | null
  fuentes: string[]
  nota: string | null
  tipoSensor: string | null
  preguntaTerreno: string | null
}

/**
 * ¿El tipo del elemento está respaldado por una fuente propia de ESE elemento? Certeza alta,
 * citado en el manual o el catálogo, y coherente con el sentido que dice la tarjeta (un
 * pulsador que no llega a la A3C no es «Sensor · entrada»). Lo deducido por cercanía en el
 * dibujo o por la letra del código no cuenta.
 */
export function tipoRespaldado(e: Elemento): boolean {
  if (e.certeza !== 'alta') return false
  if (!(e.fuentes ?? []).some(f => /^(Manual|Catálogo)/.test(f))) return false
  if (e.tipo === 'sensor' || e.tipo === 'encoder') return e.senal_a3c === 'entrada'
  if (e.tipo === 'salida') return e.senal_a3c === 'salida'
  return /^motor/.test(e.tipo)
}

function tipoDeElemento(e: Elemento): TipoItem {
  if (e.certeza === 'baja') return 'otro'
  if (/^motor/.test(e.tipo)) return 'motor'
  if (e.senal_a3c === 'salida' || e.tipo === 'salida') return 'salida'
  if (e.tipo === 'sensor') return 'sensor'
  if (e.tipo === 'encoder') return 'encoder'
  if (e.senal_a3c === 'alimentacion') return 'alimentacion'
  if (e.senal_a3c === 'comunicacion') return 'comunicacion'
  return 'otro'
}

function tipoDeBorne(b: Borne): TipoItem {
  if (b.tipo === 'sin' || b.sentido === 'sin_etiqueta') return 'sin'
  if (b.sentido === 'salida' || b.tipo === 'salida') return 'salida'
  if (b.tipo === 'sensor') return 'sensor'
  if (b.tipo === 'encoder') return 'encoder'
  if (b.sentido === 'alimentacion') return 'alimentacion'
  if (b.sentido === 'comunicacion') return 'comunicacion'
  return 'otro'
}

const SENAL_NO_INDICADO = 'El plano no indica el sentido'
const SENAL: Record<string, string | undefined> = {
  entrada: 'Entrada: el elemento manda la señal a la A3C',
  salida: 'Salida: la A3C activa el elemento',
  alimentacion: 'Alimentación',
  comunicacion: 'Comunicación serie',
  no_llega_a_la_A3C: 'No llega a la A3C',
  no_indicado: 'El plano no indica el sentido',
  sin_etiqueta: 'El plano no le pone etiqueta',
  led: 'Indicador interno de la tarjeta',
}

/** Quita las frases de «confirmar en terreno»: la ficha dice lo que el plano y el manual afirman. */
function textoLed(t: string): string {
  return t
    .split(/(?<=[.;])\s+/)
    .filter(x => !/confirmar en terreno/i.test(x))
    .join(' ')
    .replace(/;\s*$/, '.')
    .trim()
}

/** LED de estado de un elemento: los que el paquete le asigna + Step SMn para el motor SMn. */
function ledsEstadoDe(m: ModeloA3c, clave: string): LedEstado[] {
  const propios = m.datos.ledsEstado.filter(l => l.elemento === clave)
  const sm = /^SM(\d)$/.exec(clave)
  const step = sm ? m.ledsEstado.get(`STEP${sm[1]}`) : undefined
  return step && !propios.includes(step) ? [...propios, step] : propios
}

export function describir(m: ModeloA3c, clave: ClaveSel, idioma: Idioma): ItemA3c | null {
  const [k, id] = [clave.slice(0, 1), clave.slice(2)]
  if (k === 'e') {
    const e = m.datos.elementos[id]
    if (!e) return null
    const tipo = tipoDeElemento(e)
    const bornes = [...e.borne].sort((a, b) => a - b)
    const nombre = idioma === 'or' && e.original ? e.original : e.es
    const conDatos = e.certeza !== 'baja' && !!e.que_hace && e.que_hace !== SIN_DESCRIPCION
    return {
      clave,
      codigo: e.etiqueta,
      nombre,
      nombreApoyo: idioma === 'or' && nombre !== e.es ? e.es : null,
      tipo,
      mostrarTipo: tipoRespaldado(e),
      bornes,
      leds: bornes.filter(n => m.bornes.get(n)?.led),
      ledsEstado: ledsEstadoDe(m, id),
      hotspots: e.hoja22_hotspots,
      queHace: { texto: conDatos ? e.que_hace : SIN_DESCRIPCION, conDatos },
      cuandoLed: e.led_texto ? textoLed(e.led_texto) : '',
      senal: e.certeza === 'baja' ? SENAL_NO_INDICADO : (SENAL[e.senal_a3c] ?? SENAL_NO_INDICADO),
      enPlano: e.original,
      modulo: e.modulo,
      fuentes: conDatos ? (e.fuentes ?? []) : [],
      nota: e.nota ?? null,
      tipoSensor: e.tipo_sensor ?? null,
      preguntaTerreno: e.certeza === 'baja' ? (e.pregunta_terreno ?? null) : null,
    }
  }
  if (k === 'b') {
    const n = Number(id)
    const b = m.bornes.get(n)
    if (!b) return null
    const tipo = tipoDeBorne(b)
    const original = rotuloBorne(b)
    const es = tipo === 'sin' ? 'Sin etiqueta en el plano' : limpiarSenal(b.senal_es) || original
    const nombre = idioma === 'or' && original ? original : es
    let queHace: ItemA3c['queHace'] = { texto: SIN_DESCRIPCION, conDatos: false }
    if (tipo === 'alimentacion') queHace = { texto: 'Alimentación de la tarjeta. No es una señal.', conDatos: true }
    else if (tipo === 'comunicacion') queHace = { texto: 'Línea de comunicación serie. No corresponde a un sensor.', conDatos: true }
    else if (tipo === 'sin') queHace = { texto: 'El plano no le pone etiqueta a este borne.', conDatos: false }
    return {
      clave,
      codigo: `X5:${n}`,
      nombre,
      nombreApoyo: idioma === 'or' && nombre !== es ? es : null,
      tipo,
      mostrarTipo: true,
      bornes: [n],
      leds: b.led ? [n] : [],
      ledsEstado: [],
      hotspots: [],
      queHace,
      cuandoLed: '',
      senal: SENAL[b.sentido] ?? SENAL_NO_INDICADO,
      enPlano: original,
      modulo: null,
      fuentes: [],
      nota: null,
      tipoSensor: null,
      preguntaTerreno: null,
    }
  }
  if (k === 'l') {
    const l = m.ledsEstado.get(id)
    if (!l) return null
    const nombre = idioma === 'or' ? l.original : l.es
    return {
      clave,
      codigo: l.etiqueta,
      nombre,
      nombreApoyo: idioma === 'or' && nombre !== l.es ? l.es : null,
      tipo: 'led',
      mostrarTipo: true,
      bornes: [],
      leds: [],
      ledsEstado: [l],
      hotspots: [],
      queHace: { texto: `LED de la tarjeta rotulado «${l.original}»${l.es !== l.original ? ` (${l.es})` : ''}.`, conDatos: true },
      cuandoLed: '',
      senal: 'Indicador interno de la tarjeta',
      enPlano: l.original,
      modulo: 'Tarjeta A3C',
      fuentes: [],
      nota: null,
      tipoSensor: null,
      preguntaTerreno: null,
    }
  }
  return null
}

export interface LineaLed {
  /** «LED 45», «LED 32–41», «Sin LED»… */
  grande: string
  texto: string
  color: ColorLed | null
  /** Hay algo que encender en la tarjeta (habilita «Ver»). */
  encendible: boolean
  /** Qué nombra «Ver» cuando no es un LED (p. ej. «el borne 136»); si falta, `grande`. */
  nombreVer?: string
}

function rango(ns: number[]): string {
  if (ns.length > 2) return `${ns[0]}–${ns[ns.length - 1]}`
  return ns.join(' y ')
}

/** La franja «qué LED prende». */
export function lineaLed(item: ItemA3c): LineaLed {
  if (item.tipo === 'led') {
    return { grande: `LED ${item.codigo}`, texto: 'LED propio de la tarjeta, sin borne X5', color: 'r', encendible: true }
  }
  const l0 = item.ledsEstado[0]
  if (!item.leds.length && l0) {
    const ls = item.ledsEstado
    const ln = ls[ls.length - 1] ?? l0
    const grande = ls.length > 2 ? `LED ${l0.etiqueta} a ${ln.etiqueta}` : ls.length === 2 ? `LED ${l0.etiqueta} y ${ln.etiqueta}` : `LED ${l0.etiqueta}`
    return { grande, texto: 'LED de estado de la tarjeta, sin borne X5', color: 'r', encendible: true }
  }
  if (!item.bornes.length) {
    return { grande: 'Sin LED en la A3C', texto: 'No tiene borne X5 en la tarjeta', color: null, encendible: false }
  }
  const n0 = item.leds[0]
  if (n0 == null) {
    return { grande: 'Sin LED', texto: `Borne ${rango(item.bornes)}: el plano no le dibuja LED`, color: null, encendible: false }
  }
  const r = regletaDe(n0)
  const cuando =
    item.codigo === 'B13' ? 'un LED por bit (Bit 0 a Bit 9)'
      : item.tipo === 'salida' ? 'prende cuando la A3C activa la salida'
        : item.tipo === 'sensor' || item.tipo === 'encoder' ? 'prende con la señal del elemento'
          : 'el plano no indica el sentido de esta señal'
  return {
    grande: `LED ${rango(item.leds)}`,
    texto: `${r ? `Regleta ${r.desde}–${r.hasta} · ` : ''}${cuando}`,
    color: colorLed(n0),
    encendible: true,
  }
}

export interface PuntoLed { k: string; x: number; y: number; color: ColorLed }

/** Los LED que se encienden en la hoja 23 para un ítem. */
export function puntosLed(m: ModeloA3c, item: ItemA3c): PuntoLed[] {
  const out: PuntoLed[] = []
  for (const n of item.leds) {
    const l = m.bornes.get(n)?.led
    if (l) out.push({ k: `${item.clave}:${n}`, x: l.x, y: l.y, color: colorLed(n) })
  }
  for (const l of item.ledsEstado) out.push({ k: `${item.clave}:${l.id}`, x: l.led.x, y: l.led.y, color: 'r' })
  return out
}

/** Punto al que ir en la tarjeta: el primer LED o, si no hay, el centro del primer borne. */
export function puntoFoco(m: ModeloA3c, item: ItemA3c): [number, number] | null {
  const p = puntosLed(m, item)[0]
  if (p) return [p.x, p.y]
  const b = item.bornes[0] != null ? m.bornes.get(item.bornes[0]) : undefined
  return b ? [b.celda.x + b.celda.w / 2, b.celda.y + b.celda.h / 2] : null
}

// ─── Regleta recorrible ───────────────────────────────────────────────────

/** Código corto (≤ 6 caracteres) para la celda de 44 px de la regleta. */
export function codigoCorto(b: Borne): string {
  if (b.tipo === 'sin' || b.sentido === 'sin_etiqueta') return '—'
  const l = limpiarSenal(b.senal_original)
  const t = l.split(' ')
  if (/^Bit/.test(l)) return `bit${t[1]}`
  if (/^B2[1-5]\b/.test(l)) return `${t[0]}${t[t.length - 1]}`
  if (/^Geschw/.test(l)) return `v${l.slice(-1)}`
  if (/^Peso/.test(l)) return `S·${t[1]}`
  if (t[0] === 'Kodierung') return 'Kod'
  if (/^24V|^GND/.test(l)) return l.includes('GND') ? 'GND' : '24V'
  if (t[0] === 'Stop') return 'StopVP'
  if (t[0] === 'Maschinentakt,') return 'Takt'
  if (t[0] === '1=') return '6-Kl'
  if (t[0] === 'SPS') return 'SPS'
  if (l === 'A3C OK') return 'OK'
  return (t[0] ?? '').replace(/[:/]$/, '').slice(0, 6)
}

// ─── Buscador / lista ─────────────────────────────────────────────────────

const GRUPOS: [TipoItem, string][] = [
  ['sensor', 'Sensores'],
  ['encoder', 'Encoders'],
  ['salida', 'Salidas'],
  ['motor', 'Motores'],
  ['led', 'LED de estado de la tarjeta'],
  ['otro', 'Otras señales y elementos'],
]

function norm(s: string): string {
  return s.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase()
}

/** Todo lo que se puede elegir en la lista (sin buscar): lo que tiene borne o ubicación. */
export function clavesListables(m: ModeloA3c): ClaveSel[] {
  const out: ClaveSel[] = []
  for (const [k, e] of Object.entries(m.datos.elementos)) {
    if (e.borne.length || e.hoja22_hotspots.length) out.push(`e:${k}`)
  }
  for (const b of m.datos.bornes) {
    if (!b.elemento && (b.sentido === 'entrada' || b.sentido === 'salida' || b.sentido === 'no_indicado')) out.push(`b:${b.borne}`)
  }
  for (const l of m.datos.ledsEstado) out.push(`l:${l.id}`)
  return out
}

export interface GrupoLista { titulo: string; items: ItemA3c[] }

export function buscar(m: ModeloA3c, consulta: string, idioma: Idioma): GrupoLista[] {
  const q = norm(consulta.trim())
  const claves = clavesListables(m)
  // Un número de borne siempre se encuentra, aunque sea un borne de alimentación o sin etiqueta.
  if (/^\d+$/.test(q) && m.bornes.has(Number(q))) {
    const c = claveDeBorne(m, Number(q))
    if (!claves.includes(c)) claves.push(c)
  }
  const items = claves
    .map(c => describir(m, c, idioma))
    .filter((x): x is ItemA3c => !!x)
    .filter(it => {
      if (!q) return true
      const otro = describir(m, it.clave, idioma === 'es' ? 'or' : 'es')
      const heno = norm([it.codigo, it.nombre, otro?.nombre ?? '', it.enPlano, it.bornes.join(' '), it.mostrarTipo ? ETIQUETA_TIPO[it.tipo] : ''].join(' '))
      if (/^\d+$/.test(q)) return it.bornes.includes(Number(q)) || norm(it.codigo).includes(q)
      return heno.includes(q)
    })
  const grupoDe = (t: TipoItem): TipoItem => (GRUPOS.some(g => g[0] === t) ? t : 'otro')
  return GRUPOS.map(([t, titulo]) => ({
    titulo,
    items: items
      .filter(it => grupoDe(it.tipo) === t)
      .sort((a, b) => (a.bornes[0] ?? 999) - (b.bornes[0] ?? 999) || a.codigo.localeCompare(b.codigo, 'es', { numeric: true })),
  })).filter(g => g.items.length)
}

// ─── Textos dibujados por la app ──────────────────────────────────────────

export interface LineaTexto {
  x: number
  y: number
  size: number
  texto: string
  /** Largo exacto en unidades (mismo largo que el texto del plano). */
  largo?: number
  anchor?: 'start' | 'end'
  transform?: string
}

function partirPalabras(t: string, max: number, size: number): string[] {
  const out: string[] = []
  let cur = ''
  for (const w of t.split(' ')) {
    const n = cur ? `${cur} ${w}` : w
    if (cur && n.length * size * 0.55 > max) {
      out.push(cur)
      cur = w
    } else cur = n
  }
  if (cur) out.push(cur)
  return out
}

/**
 * Líneas de un texto del plano en el idioma elegido, con la posición y el tamaño de la
 * línea base original. «Original» ocupa exactamente el largo del plano; el español ya viene
 * medido en el paquete (achicado hasta ~18 % o partido en dos líneas, sin montarse).
 */
export function lineasDeTexto(t: Texto, idioma: Idioma): LineaTexto[] {
  const L = t.layout_v5
  if (L.k === 'title') {
    const texto = idioma === 'or' ? L.or : L.es
    const ls = partirPalabras(texto, 70, L.size)
    const fs = L.size * 0.9
    const y0 = (L.cy ?? t.y) - (ls.length - 1) * fs * 0.55 + fs * 0.35
    return ls.map((s, i) => ({ x: L.x, y: +(y0 + i * fs * 1.1).toFixed(2), size: +fs.toFixed(2), texto: s, anchor: L.a })) // decimal-tecnico: coordenadas y tamano de texto de un atributo SVG, no una cifra que alguien lea
  }
  const transform = L.g ?? undefined
  if (idioma === 'or' || !L.lines?.length) {
    return [{ x: L.x, y: L.y ?? t.y, size: L.size, texto: L.or, largo: L.tlo, transform }]
  }
  return L.lines.map(([s, ancho], i) => ({
    x: L.x,
    y: L.ys?.[i] ?? L.y ?? t.y,
    size: L.fs ?? L.size,
    texto: s,
    largo: s === L.or ? L.tlo : ancho,
    transform,
  }))
}

// ─── Cámara del lienzo ────────────────────────────────────────────────────

export interface Camara { cx: number; cy: number; w: number }
export interface LimitesCamara { minW: number; maxW: number; bounds: [number, number, number, number] }

/** Encaja un atajo de zoom en un lienzo de `vw × vh` px. */
export function camaraDePreset(p: PresetV5, vw: number, vh: number): Camara {
  if (p.bb) {
    const [x0, y0, x1, y1] = p.bb
    return { cx: (x0 + x1) / 2, cy: (y0 + y1) / 2, w: Math.max(x1 - x0, ((y1 - y0) * vw) / Math.max(vh, 1)) }
  }
  return { cx: p.cx, cy: p.cy, w: p.w }
}

export function limitarCamara(c: Camara, lim: LimitesCamara): Camara {
  const [bx0, by0, bx1, by1] = lim.bounds
  return {
    w: Math.max(lim.minW, Math.min(lim.maxW, c.w)),
    cx: Math.max(bx0, Math.min(bx1, c.cx)),
    cy: Math.max(by0, Math.min(by1, c.cy)),
  }
}

/** Escala (px por unidad) y traslación para `matrix(s,0,0,s,tx,ty)`. */
export function matrizCamara(c: Camara, vw: number, vh: number): { s: number; tx: number; ty: number } {
  const s = vw / c.w
  const x = c.cx - c.w / 2
  const y = c.cy - vh / s / 2
  return { s, tx: -x * s, ty: -y * s }
}

/** De un punto en px del lienzo (origen arriba a la izquierda) a unidades del dibujo. */
export function pantallaAUnidades(c: Camara, vw: number, vh: number, px: number, py: number): [number, number] {
  const s = vw / c.w
  return [c.cx - c.w / 2 + px / s, c.cy - vh / s / 2 + py / s]
}

/** Acerca (f < 1) o aleja (f > 1) manteniendo fijo el punto (ux, uy) si se da. */
export function zoomCamara(c: Camara, f: number, lim: LimitesCamara, ux?: number, uy?: number): Camara {
  const w = Math.max(lim.minW, Math.min(lim.maxW, c.w * f))
  if (ux == null || uy == null) return limitarCamara({ ...c, w }, lim)
  const k = w / c.w
  return limitarCamara({ w, cx: ux + (c.cx - ux) * k, cy: uy + (c.cy - uy) * k }, lim)
}

/**
 * Cámara durante un pellizco: el ancho sigue a la distancia entre los dedos y el punto del
 * dibujo que estaba bajo su punto medio al empezar queda bajo el punto medio actual (el zoom
 * se ancla entre los dedos, como la rueda bajo el puntero). `m0`/`m1` en px del lienzo.
 */
export function camaraPellizco(
  c0: Camara,
  d0: number,
  m0: [number, number],
  d1: number,
  m1: [number, number],
  vw: number,
  vh: number,
  lim: LimitesCamara,
): Camara {
  const w = Math.max(lim.minW, Math.min(lim.maxW, (c0.w * d0) / Math.max(d1, 1)))
  const [ux, uy] = pantallaAUnidades(c0, vw, vh, m0[0], m0[1])
  const s = vw / w
  return { w, cx: ux + w / 2 - m1[0] / s, cy: uy + vh / s / 2 - m1[1] / s }
}

// ─── Toque / clic en el dibujo ────────────────────────────────────────────

export interface Objetivo { clave: ClaveSel; n?: number; r: Rect }

export function distanciaARect(u: [number, number], r: Rect): number {
  const dx = Math.max(r.x - u[0], 0, u[0] - (r.x + r.w))
  const dy = Math.max(r.y - u[1], 0, u[1] - (r.y + r.h))
  return Math.hypot(dx, dy)
}

const rectLed = (x: number, y: number, r: number): Rect => ({ x: x - r, y: y - r, w: 2 * r, h: 2 * r })

/** Objetivos tocables de la hoja 23: celdas X5, sus LED y los LED de estado. */
export function objetivosHoja23(m: ModeloA3c): Objetivo[] {
  const out: Objetivo[] = []
  for (const b of m.datos.bornes) {
    const clave = claveDeBorne(m, b.borne)
    out.push({ clave, n: b.borne, r: b.celda })
    if (b.led) out.push({ clave, n: b.borne, r: rectLed(b.led.x, b.led.y, b.led.r) })
  }
  for (const l of m.datos.ledsEstado) out.push({ clave: `l:${l.id}`, r: rectLed(l.led.x, l.led.y, l.led.r) })
  return out
}

/** Objetivos de la hoja 22: las zonas marcadas de cada elemento. */
export function objetivosHoja22(m: ModeloA3c): Objetivo[] {
  const out: Objetivo[] = []
  for (const [k, e] of Object.entries(m.datos.elementos)) for (const r of e.hoja22_hotspots) out.push({ clave: `e:${k}`, r })
  return out
}

export interface Eleccion { cerca: { o: Objetivo; d: number }[]; distintos: number }

/** Objetivos a menos de `radio` unidades, del más cercano al más lejano. */
export function elegirEn(objs: Objetivo[], u: [number, number], radio: number): Eleccion {
  const cerca = objs
    .map(o => ({ o, d: distanciaARect(u, o.r) }))
    .filter(x => x.d <= radio)
    .sort((a, b) => a.d - b.d)
  const ids = new Set(cerca.map(x => `${x.o.clave}#${x.o.n ?? ''}`))
  return { cerca, distintos: ids.size }
}

export const centroRect = (r: Rect): [number, number] => [r.x + r.w / 2, r.y + r.h / 2]

export type ToqueAmbiguo =
  | { tipo: 'elegir'; clave: ClaveSel }
  | { tipo: 'acercar' }
  | { tipo: 'lista'; claves: ClaveSel[] }

/**
 * Qué hacer con un toque en el plano de ubicación (hoja 22). `cerca` viene de `elegirEn`
 * (del más cercano al más lejano). Si el elemento más cercano tiene otro a menos de `minPx`
 * en pantalla (centro a centro), el dedo no puede distinguirlos: se acerca la cámara si aún
 * se puede; si ya no, se elige el más cercano al punto tocado y, si siguen empatados (los
 * que están en el mismo sitio, como S20..S25), se devuelve la lista para que la persona elija.
 */
export function resolverToqueAmbiguo(
  cerca: { o: Objetivo; d: number }[],
  ppu: number,
  puedeAcercar: boolean,
  minPx = 44,
): ToqueAmbiguo | null {
  const vistos = new Set<ClaveSel>()
  const porClave = cerca.filter(x => (vistos.has(x.o.clave) ? false : (vistos.add(x.o.clave), true)))
  const primero = porClave[0]
  if (!primero) return null
  const [ax, ay] = centroRect(primero.o.r)
  const grupo = [
    primero,
    ...porClave.slice(1).filter(x => {
      const [bx, by] = centroRect(x.o.r)
      return Math.hypot(ax - bx, ay - by) * ppu < minPx
    }),
  ]
  if (grupo.length === 1) return { tipo: 'elegir', clave: primero.o.clave }
  if (puedeAcercar) return { tipo: 'acercar' }
  const EPS = 1e-6
  const empatados = grupo.filter(x => x.d - primero.d <= EPS)
  if (empatados.length === 1) return { tipo: 'elegir', clave: primero.o.clave }
  return { tipo: 'lista', claves: empatados.map(x => x.o.clave) }
}

/** `deltaY` de la rueda en píxeles, sea cual sea la unidad que reporte el navegador. */
export function deltaRuedaPx(deltaY: number, deltaMode: number): number {
  return deltaMode === 1 ? deltaY * 16 : deltaMode === 2 ? deltaY * 100 : deltaY
}

// ─── Práctica ─────────────────────────────────────────────────────────────

export interface EstadoQuiz {
  /** Índices de las preguntas de esta ronda (todas, o solo las erradas al repetir). */
  orden: number[]
  pos: number
  /** Respuesta por posición de la ronda: true/false, o undefined si falta. */
  aciertos: (boolean | undefined)[]
  elegida: number | null
  revision: boolean
  racha: number
  mejor: number
}

export function nuevoQuiz(n: number, racha = 0, mejor = 0): EstadoQuiz {
  return { orden: Array.from({ length: n }, (_, i) => i), pos: 0, aciertos: [], elegida: null, revision: false, racha, mejor }
}

export function responder(s: EstadoQuiz, preguntas: { ok: number }[], i: number): EstadoQuiz {
  if (s.elegida !== null || s.revision) return s
  const p = preguntas[s.orden[s.pos] ?? -1]
  if (!p) return s
  const ok = i === p.ok
  const aciertos = [...s.aciertos]
  aciertos[s.pos] = ok
  const racha = ok ? s.racha + 1 : 0
  return { ...s, elegida: i, aciertos, racha, mejor: Math.max(s.mejor, racha) }
}

export function siguiente(s: EstadoQuiz): EstadoQuiz {
  if (s.elegida === null) return s
  if (s.pos < s.orden.length - 1) return { ...s, pos: s.pos + 1, elegida: null }
  return { ...s, elegida: null, revision: true }
}

/** Ronda nueva completa, o solo con las preguntas erradas de la ronda que terminó. */
export function reiniciar(s: EstadoQuiz, total: number, soloErrores: boolean): EstadoQuiz {
  const errores = s.orden.filter((_, i) => s.aciertos[i] === false)
  const orden = soloErrores && errores.length ? errores : Array.from({ length: total }, (_, i) => i)
  return { ...s, orden, pos: 0, aciertos: [], elegida: null, revision: false }
}

/** Recorte de la hoja 23 que muestra la regleta de un borne (sin textos salvo números). */
export function recorteRegleta(m: ModeloA3c, n: number): { viewBox: [number, number, number, number]; regleta: Regleta } | null {
  const r = regletaDe(n)
  if (!r) return null
  const bs = m.datos.bornes.filter(b => b.borne >= r.desde && b.borne <= r.hasta)
  let x0 = Math.min(...bs.map(b => b.celda.x))
  let x1 = Math.max(...bs.map(b => b.celda.x + b.celda.w))
  const y0 = Math.min(...bs.map(b => b.celda.y)) - 4
  const y1 = Math.max(...bs.map(b => b.celda.y + b.celda.h)) + 4
  // El LED queda a la izquierda en las regletas de arriba y a la derecha en las de abajo.
  const izquierda = x0 < 300
  x0 = izquierda ? x0 - 11 : x0 - 2
  x1 = izquierda ? x1 + 2 : x1 + 11
  return { viewBox: [x0, y0, x1 - x0, y1 - y0], regleta: r }
}

// ─── Persistencia local (idioma y racha) ──────────────────────────────────

const K_IDIOMA = 'a3c-idioma'
const K_RACHA = 'a3c-racha'

export function leerIdioma(): Idioma {
  try {
    return localStorage.getItem(K_IDIOMA) === 'or' ? 'or' : 'es'
  } catch {
    return 'es'
  }
}

export function guardarIdioma(i: Idioma): void {
  try {
    localStorage.setItem(K_IDIOMA, i)
  } catch {
    /* sin almacenamiento: el idioma vale solo para esta visita */
  }
}

export function leerRacha(): { racha: number; mejor: number } {
  try {
    const v = JSON.parse(localStorage.getItem(K_RACHA) ?? 'null') as { racha?: unknown; mejor?: unknown } | null
    const num = (x: unknown) => (typeof x === 'number' && Number.isFinite(x) && x >= 0 ? Math.floor(x) : 0)
    return { racha: num(v?.racha), mejor: num(v?.mejor) }
  } catch {
    return { racha: 0, mejor: 0 }
  }
}

export function guardarRacha(racha: number, mejor: number): void {
  try {
    localStorage.setItem(K_RACHA, JSON.stringify({ racha, mejor }))
  } catch {
    /* sin almacenamiento */
  }
}
