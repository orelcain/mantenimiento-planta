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

/**
 * LED X5 que la foto de la N2 muestra (los `led-X5-n` de `placa-n2.svg`) y, de ellos, los que
 * estaban ENCENDIDOS (`data-estado` «…-encendido»). Es una foto sin proceso, no un estado en vivo:
 * solo respalda la línea «En la foto de la N2: …». El test de integridad la compara con el SVG.
 */
export const LEDS_FOTO: ReadonlySet<number> = new Set([
  1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 14, 16, 18, 20, 22, 24, 26, 28,
  32, 33, 34, 35, 36, 37, 38, 39, 40, 41, 42, 43, 44, 45, 46, 47, 48, 49, 50, 51, 52, 53, 54,
  66, 68, 70, 72, 74, 76, 78, 80, 82, 84, 92, 93, 94,
  95, 96, 97, 98, 99, 100, 101, 102, 103, 104, 105, 106, 107, 108, 109, 110, 111,
  116, 117, 118, 119, 120, 121, 122, 123, 124, 125, 126, 127, 128, 129, 130, 131, 132, 133, 134,
])
export const LEDS_ENCENDIDOS_FOTO: ReadonlySet<number> = new Set([
  4, 6, 9, 10, 32, 35, 37, 38, 39, 40, 48, 49, 72, 78, 80, 82, 98, 101, 103, 109, 110, 111,
  116, 117, 122, 124, 125, 132, 134,
])

/** Tono de un LED que se marca sin encenderse: gris neutro, o el color que tenía en la foto. */
export type TonoNeutro = 'gris' | 'ambar' | 'amarillo'

/** LED de estado que la foto muestra, con su color (`led-estado-k` · `data-led-plano`); todos encendidos. */
export const LEDS_ESTADO_FOTO: Readonly<Record<string, Exclude<TonoNeutro, 'gris'>>> = {
  V60_1: 'amarillo',
  V60_2: 'amarillo',
  V60_3: 'ambar',
  V60_4: 'ambar',
  V60_5: 'ambar',
  V60_6: 'ambar',
}
const NOMBRE_TONO: Record<TonoNeutro, string> = { gris: 'gris', ambar: 'ámbar', amarillo: 'amarillo' }

const estadoFoto = (n: number) => (LEDS_ENCENDIDOS_FOTO.has(n) ? 'encendido' : 'apagado')

/**
 * «En la foto de la N2: …» para los LED X5 de un ítem, o null si la foto no muestra ninguno.
 * Un LED: solo su estado; varios: «1 y 2 apagados» o «3 apagado, 4 encendido».
 */
export function textoFoto(ns: number[]): string | null {
  const vs = ns.filter(n => LEDS_FOTO.has(n))
  const v0 = vs[0]
  if (v0 == null) return null
  if (ns.length === 1) return `En la foto de la N2: ${estadoFoto(v0)}.`
  if (vs.length === 1) return `En la foto de la N2: ${v0} ${estadoFoto(v0)}.`
  if (vs.every(n => estadoFoto(n) === estadoFoto(v0))) {
    return `En la foto de la N2: ${vs.slice(0, -1).join(', ')}${vs.length > 1 ? ` y ${vs[vs.length - 1]}` : ''} ${estadoFoto(v0)}${vs.length > 1 ? 's' : ''}.`
  }
  return `En la foto de la N2: ${vs.map(n => `${n} ${estadoFoto(n)}`).join(', ')}.`
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
  /**
   * Cómo se muestran sus LED (`leds` y `ledsEstado`). Principio: solo se ENCIENDE el LED que el
   * plano, el manual o la foto respaldan como señal de ESTE elemento al activarse.
   *   `senal`    se encienden (núcleo, halo y anillos).
   *   `contorno` se marcan con contorno punteado fijo, sin encender: bits de un código (B13), canales
   *              A/B de un encoder o de pulsos (B27), los LED de estado de un motor SM, un LED que ya
   *              está encendido en reposo (B11), uno que las hojas se contradicen en asignar (Y51/Y52,
   *              128) o uno que solo la hoja 23 dibuja, sin decir cuándo prende (92, codificación).
   *   `neutro`   punto fijo gris (o del color que tenía en la foto), sin animación: un LED de estado
   *              o de alimentación elegido por sí mismo, del que el plano no dice cuándo prende.
   */
  modoLed: ModoLed
  /** Tono del punto en modo `neutro`. */
  tono: TonoNeutro | null
  /** Franja propia (cuando el texto genérico no aplica). `texto` sin la línea de la foto. */
  franja: { grande: string | null; texto: string | null }
  /** Franja de un ítem sin LED, cuando el plano dice por qué. */
  sinLed: { grande: string | null; texto: string } | null
  /** «En la foto de la N2: …» de sus LED X5, o null si la foto no los muestra. */
  foto: string | null
  senal: string
  /** Texto tal cual en el plano (alemán o código), para la ficha. */
  enPlano: string
  modulo: string | null
  fuentes: string[]
  nota: string | null
  tipoSensor: string | null
  /** Aviso junto al tipo de sensor (el plano admite otro tipo). */
  tipoSensorNota: string | null
  preguntaTerreno: string | null
}

export type ModoLed = 'senal' | 'contorno' | 'neutro'

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

/**
 * Salida de certeza baja cuyos bornes la hoja 23 marca como salidas de la A3C (Y3, Y6, Y51, Y52):
 * lo dudoso es el nombre o el uso, no el sentido; eso queda en «Pendiente de confirmar».
 */
function salidaPorBorne(m: ModeloA3c, e: Elemento): boolean {
  return e.senal_a3c === 'salida' && e.borne.length > 0 && e.borne.every(n => m.bornes.get(n)?.sentido === 'salida')
}

function tipoDeElemento(m: ModeloA3c, e: Elemento): TipoItem {
  if (e.certeza === 'baja') return salidaPorBorne(m, e) ? 'salida' : 'otro'
  if (/^motor/.test(e.tipo)) return 'motor'
  if (e.senal_a3c === 'salida' || e.tipo === 'salida') return 'salida'
  // Un pulsador que no llega a la A3C (S1, S3…) no va con los sensores de la tarjeta.
  if (e.senal_a3c === 'no_llega_a_la_A3C') return 'otro'
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

const TEXTO_GRUPO_BITS =
  'Un LED por bit (Bit 0 a Bit 9). En la foto de la N2 solo estaban encendidos 32, 35 y 37 a 40.'

/** ¿Todos los bornes del elemento son bits de un código («Bit 0», «Bit 1»…)? */
function esGrupoBits(m: ModeloA3c, bornes: number[]): boolean {
  return bornes.length >= 4 && bornes.every(n => /^Bit *[0-9]/.test(limpiarSenal(m.bornes.get(n)?.senal_original ?? '')))
}

/** ¿Los dos bornes son los canales A y B de un encoder («… A», «… B»), como B21–B25? */
function esParAB(m: ModeloA3c, bornes: number[]): boolean {
  const [a, b] = bornes.map(n => limpiarSenal(m.bornes.get(n)?.senal_original ?? ''))
  return bornes.length === 2 && !!a && !!b && / A$/.test(a) && / B$/.test(b) && a.slice(0, -1) === b.slice(0, -1)
}

/** Texto de un par A/B: qué LED es cada canal y cómo estaban en la foto (no se encienden). */
function textoParAB(a: number, b: number): string {
  return `Canal A = LED ${a}, canal B = LED ${b}.${textoFoto([a, b]) ? ` ${textoFoto([a, b])}` : ''}`
}

/** Los LED de estado de un motor SM (60V DC y Step): qué son y cómo estaba el 60V DC en la foto. */
function textoLedsMotor(sm: string, ls: LedEstado[]): string {
  const v60 = ls.find(l => l.original === '60V DC')
  const tono = v60 ? LEDS_ESTADO_FOTO[v60.id] : undefined
  const foto = tono ? ` En la foto de la N2, 60V DC estaba encendido (${NOMBRE_TONO[tono]}).` : ''
  return `LED rotulados 60V DC y Step ${sm} del bloque ${sm}. El plano no dice cuándo prende cada uno.${foto}`
}

/** Une un texto y la línea de la foto (si la hay y el texto no la trae ya). */
function conFoto(texto: string, foto: string | null): string {
  if (!foto || texto.includes('En la foto de la N2')) return texto
  return texto ? `${texto.replace(/[.\s]+$/, '')}. ${foto}` : foto
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
    const tipo = tipoDeElemento(m, e)
    const bornes = [...e.borne].sort((a, b) => a - b)
    const nombre = idioma === 'or' && e.original ? e.original : e.es
    const conDatos = e.certeza !== 'baja' && !!e.que_hace && e.que_hace !== SIN_DESCRIPCION
    const ledsEstado = ledsEstadoDe(m, id)
    const leds = e.leds_posibles ?? bornes.filter(n => m.bornes.get(n)?.led)
    const bits = esGrupoBits(m, bornes)
    const [a, b] = leds
    const parAB = !bits && a != null && b != null && leds.length === 2 && esParAB(m, bornes)
    // Solo LED de estado (motores SM, y los grupos A3C.R_L_SM… que no se eligen): ninguno es la señal del elemento.
    const soloEstado = !leds.length && ledsEstado.length > 0
    const foto = textoFoto(leds)
    // Texto propio de un grupo (no se enciende): el mismo en la franja y en «Cuándo prende».
    const textoGrupo = bits ? TEXTO_GRUPO_BITS
      : parAB ? textoParAB(a, b)
        : soloEstado && /^motor/.test(e.tipo) ? textoLedsMotor(id, ledsEstado)
          : soloEstado ? `LED de estado de la tarjeta (${ledsEstado.map(l => l.etiqueta).join(', ')}). El plano no dice cuándo prende cada uno.`
            : null
    return {
      clave,
      codigo: e.etiqueta,
      nombre,
      nombreApoyo: idioma === 'or' && nombre !== e.es ? e.es : null,
      tipo,
      mostrarTipo: tipoRespaldado(e),
      bornes,
      leds,
      ledsEstado,
      hotspots: e.hoja22_hotspots,
      queHace: { texto: conDatos ? e.que_hace : SIN_DESCRIPCION, conDatos },
      cuandoLed: textoGrupo ?? (e.cuando_texto ? conFoto(e.cuando_texto, foto) : e.led_texto ? conFoto(textoLed(e.led_texto), foto) : ''),
      modoLed: textoGrupo ? 'contorno' : (e.led_modo ?? 'senal'),
      tono: null,
      franja: {
        grande: e.franja_grande ?? null,
        texto: bits ? 'Uno por bit (Bit 0 a Bit 9). En la foto de la N2 solo estaban encendidos 32, 35 y 37 a 40.' : (textoGrupo ?? e.franja_texto ?? null),
      },
      sinLed: e.sin_led_texto ? { grande: e.sin_led_grande ?? null, texto: e.sin_led_texto } : null,
      foto,
      senal:
        e.senal_texto ??
        (e.certeza === 'baja' ? (salidaPorBorne(m, e) ? SENAL.salida! : SENAL_NO_INDICADO) : (SENAL[e.senal_a3c] ?? SENAL_NO_INDICADO)),
      enPlano: e.original,
      modulo: e.modulo,
      fuentes: conDatos ? (e.fuentes ?? []) : [],
      nota: e.nota ?? null,
      tipoSensor: e.tipo_sensor ?? null,
      tipoSensorNota: e.tipo_sensor_nota ?? null,
      preguntaTerreno: (e.certeza === 'baja' ? e.pregunta_terreno : e.pregunta_terreno_led) ?? null,
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
    if (tipo === 'alimentacion') queHace = { texto: 'Borne de alimentación.', conDatos: true }
    else if (tipo === 'comunicacion') queHace = { texto: 'Línea de comunicación serie. No corresponde a un sensor.', conDatos: true }
    else if (tipo === 'sin') queHace = { texto: 'El plano no le pone etiqueta a este borne.', conDatos: false }
    // Regleta de alimentación (136–145): su LED no es la señal de ningún elemento; punto gris.
    const alimentacion = !!b.led && regletaDe(n)?.desde === 136
    // Un borne de un elemento hereda su restricción (B13, B21–B25, B11, B50): la UI abre el
    // elemento (`claveDeBorne`), pero `b:N` tampoco debe encender lo que el elemento no enciende.
    const delElemento = b.elemento && m.datos.elementos[b.elemento] ? describir(m, `e:${b.elemento}`, idioma)?.modoLed : undefined
    const modoLed: ModoLed = !b.led ? 'senal'
      : alimentacion ? 'neutro'
        : (b.led_modo ?? (tipo === 'sin' || (delElemento && delElemento !== 'senal') ? 'contorno' : 'senal'))
    let franja: string | null = b.franja_texto ?? null
    if (!franja && alimentacion) {
      franja = `${tipo === 'sin' ? 'Borne sin rótulo de la regleta de alimentación' : `Borne de alimentación «${original}»`}. El plano no dice cuándo prende.`
    } else if (!franja && modoLed === 'contorno') {
      franja = tipo === 'sin' && !delElemento ? 'Borne sin rótulo: el plano no dice de qué señal es este LED' : `LED del elemento ${b.elemento}: ve su ficha`
    }
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
      modoLed,
      tono: modoLed === 'neutro' ? 'gris' : null,
      franja: { grande: null, texto: franja },
      sinLed: !b.led && b.sin_led_texto ? { grande: b.sin_led_grande ?? null, texto: b.sin_led_texto } : null,
      foto: b.led ? textoFoto([n]) : null,
      senal: SENAL[b.sentido] ?? SENAL_NO_INDICADO,
      enPlano: original,
      modulo: null,
      fuentes: [],
      nota: b.nota ?? null,
      tipoSensor: null,
      tipoSensorNota: null,
      preguntaTerreno: b.pregunta_terreno ?? null,
    }
  }
  if (k === 'l') {
    const l = m.ledsEstado.get(id)
    if (!l) return null
    const nombre = idioma === 'or' ? l.original : l.es
    // LED de estado elegido por sí mismo: el plano no dice cuándo prende; punto fijo, gris o del color de la foto.
    const tono: TonoNeutro = LEDS_ESTADO_FOTO[l.id] ?? 'gris'
    const bloque = l.original === '60V DC' && l.elemento ? ` del bloque ${l.elemento}` : ''
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
      modoLed: 'neutro',
      tono,
      franja: { grande: null, texto: `LED rotulado «${l.original}»${bloque}. El plano no dice cuándo prende.` },
      sinLed: null,
      foto: tono === 'gris' ? null : `En la foto de la N2: encendido (${NOMBRE_TONO[tono]}).`,
      senal: 'Indicador interno de la tarjeta',
      enPlano: l.original,
      modulo: 'Tarjeta A3C',
      fuentes: [],
      nota: null,
      tipoSensor: null,
      tipoSensorNota: null,
      preguntaTerreno: null,
    }
  }
  return null
}

export interface LineaLed {
  /** «LED 45», «LED 32–41», «Sin LED»… */
  grande: string
  texto: string
  /** Color del LED que se ENCIENDE (solo en modo `senal`); null si nada se enciende. */
  color: ColorLed | null
  /** Hay algo que mostrar en la tarjeta (habilita «Ver»). */
  encendible: boolean
  /** Qué nombra «Ver» cuando no es un LED (p. ej. «el borne 136»); si falta, `grande`. */
  nombreVer?: string
  /** Los LED se marcan con contorno, sin encenderse (grupo, en reposo o asignación dudosa). */
  grupo?: boolean
  /** El LED se marca con un punto fijo de este tono, sin encenderse. */
  tono?: TonoNeutro
}

function rango(ns: number[]): string {
  if (ns.length > 2) return `${ns[0]}–${ns[ns.length - 1]}`
  return ns.join(' y ')
}

/** La franja «qué LED prende». */
export function lineaLed(item: ItemA3c): LineaLed {
  const l0 = item.ledsEstado[0]
  if (!item.leds.length && l0) {
    const ls = item.ledsEstado
    const ln = ls[ls.length - 1] ?? l0
    const grande = ls.length > 2 ? `LED ${l0.etiqueta} a ${ln.etiqueta}` : ls.length === 2 ? `LED ${l0.etiqueta} y ${ln.etiqueta}` : `LED ${l0.etiqueta}`
    const texto = conFoto(item.franja.texto ?? 'LED de estado de la tarjeta, sin borne X5', item.foto)
    if (item.modoLed === 'neutro') return { grande, texto, color: null, encendible: true, tono: item.tono ?? 'gris' }
    return { grande, texto, color: null, encendible: true, grupo: true }
  }
  if (!item.bornes.length) {
    if (item.sinLed) return { grande: item.sinLed.grande ?? 'Sin LED', texto: item.sinLed.texto, color: null, encendible: false }
    return { grande: 'Sin LED en la A3C', texto: 'No tiene borne X5 en la tarjeta', color: null, encendible: false }
  }
  const n0 = item.leds[0]
  if (n0 == null) {
    return { grande: item.sinLed?.grande ?? 'Sin LED', texto: item.sinLed?.texto ?? `Borne ${rango(item.bornes)}: el plano no le dibuja LED`, color: null, encendible: false }
  }
  const grande = item.franja.grande ?? `LED ${rango(item.leds)}`
  if (item.modoLed === 'contorno') {
    return { grande, texto: conFoto(item.franja.texto ?? '', item.foto), color: null, encendible: true, grupo: true }
  }
  if (item.modoLed === 'neutro') {
    return { grande, texto: conFoto(item.franja.texto ?? '', item.foto), color: null, encendible: true, tono: item.tono ?? 'gris' }
  }
  const r = regletaDe(n0)
  const cuando =
    item.franja.texto ??
    (item.tipo === 'salida' ? 'prende cuando la A3C activa la salida'
      : item.tipo === 'sensor' || item.tipo === 'encoder' ? 'prende con la señal del elemento'
        : 'el plano no indica el sentido de esta señal')
  return {
    grande,
    texto: conFoto(`${r ? `Regleta ${r.desde}–${r.hasta} · ` : ''}${cuando}`, item.foto),
    color: colorLed(n0),
    encendible: true,
  }
}

export interface PuntoLed { k: string; x: number; y: number; color: ColorLed }
export interface PuntoNeutro { k: string; x: number; y: number; tono: TonoNeutro }

/** Los LED que se ENCIENDEN en la hoja 23 para un ítem: solo en modo `senal`. */
export function puntosLed(m: ModeloA3c, item: ItemA3c): PuntoLed[] {
  if (item.modoLed !== 'senal') return []
  const out: PuntoLed[] = []
  for (const n of item.leds) {
    const l = m.bornes.get(n)?.led
    if (l) out.push({ k: `${item.clave}:${n}`, x: l.x, y: l.y, color: colorLed(n) })
  }
  for (const l of item.ledsEstado) out.push({ k: `${item.clave}:${l.id}`, x: l.led.x, y: l.led.y, color: 'r' })
  return out
}

/** Los LED que se marcan con CONTORNO (fijo, sin encender): modo `contorno`, X5 y de estado. */
export function puntosGrupo(m: ModeloA3c, item: ItemA3c): PuntoLed[] {
  if (item.modoLed !== 'contorno') return []
  const out: PuntoLed[] = []
  for (const n of item.leds) {
    const l = m.bornes.get(n)?.led
    if (l) out.push({ k: `${item.clave}:${n}`, x: l.x, y: l.y, color: colorLed(n) })
  }
  for (const l of item.ledsEstado) out.push({ k: `${item.clave}:${l.id}`, x: l.led.x, y: l.led.y, color: 'r' })
  return out
}

/** Los LED que se marcan con un PUNTO FIJO neutro (gris o color de la foto): modo `neutro`. */
export function puntosNeutros(m: ModeloA3c, item: ItemA3c): PuntoNeutro[] {
  if (item.modoLed !== 'neutro') return []
  const tono = item.tono ?? 'gris'
  const out: PuntoNeutro[] = []
  for (const n of item.leds) {
    const l = m.bornes.get(n)?.led
    if (l) out.push({ k: `${item.clave}:${n}`, x: l.x, y: l.y, tono })
  }
  for (const l of item.ledsEstado) out.push({ k: `${item.clave}:${l.id}`, x: l.led.x, y: l.led.y, tono })
  return out
}

/** Punto al que ir en la tarjeta: el primer LED o, si no hay, el centro del primer borne. */
export function puntoFoco(m: ModeloA3c, item: ItemA3c): [number, number] | null {
  const p = puntosLed(m, item)[0] ?? puntosGrupo(m, item)[0] ?? puntosNeutros(m, item)[0]
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

/**
 * Todo lo que se puede elegir en la lista (sin buscar): lo que tiene borne o ubicación, y los
 * motores con LED de estado en la tarjeta aunque no tengan ninguna de las dos (SM6).
 */
export function clavesListables(m: ModeloA3c): ClaveSel[] {
  const out: ClaveSel[] = []
  for (const [k, e] of Object.entries(m.datos.elementos)) {
    const motorConLed = /^motor/.test(e.tipo) && ledsEstadoDe(m, k).length > 0
    if (e.borne.length || e.hoja22_hotspots.length || motorConLed) out.push(`e:${k}`)
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
