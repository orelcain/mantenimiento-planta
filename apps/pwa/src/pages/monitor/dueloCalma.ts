/**
 * Cifras y textos del Duelo «calmo» (revelado progresivo, mockup v6 variante A del 28-10). Funciones puras y probadas:
 * el componente solo ubica y dibuja. Ninguna calcula «a la misma hora» ni los puntos por su cuenta: todo sale de
 * `duelo.ts` (`piezasALaMismaHora`, `puntajeJornada`, `serieVentaja`, `pinesDeDetenciones`) y de `dueloDatosPC.ts`.
 */
import { nombreCorto, piezasALaMismaHora, type CarreraDuelo, type DatosDuelo, type DetencionPin, type EquipoId, type NombresEquipos, type PuntoVentaja } from './duelo'
import { filasRiel, puntajeRiel, type LadoEje } from './dueloDatosPC'
import { dec, int } from './dueloTextos'
import type { PacePoint } from '@/services/shoplogix/monitorCompare'

export const EQ_ORDEN: readonly EquipoId[] = ['cardenas', 'rebolledo']
export type Lado = 'c' | 'r'
export const ladoDeEquipo = (e: EquipoId): Lado => (e === 'cardenas' ? 'c' : 'r')
export const equipoDeLado = (l: Lado): EquipoId => (l === 'c' ? 'cardenas' : 'rebolledo')

// ── Temas del detalle ────────────────────────────────────────────────────────

export type TemaDuelo = 'hora' | 'porque' | 'semana' | 'mantencion'

export const TEMAS: ReadonlyArray<{ id: TemaDuelo; titulo: string }> = [
  { id: 'hora', titulo: 'Hora a hora' },
  { id: 'porque', titulo: 'Por qué se perdió tiempo' },
  { id: 'semana', titulo: 'Semana y mes' },
  { id: 'mantencion', titulo: 'Mantención' },
]

// ── Curvas ───────────────────────────────────────────────────────────────────

/**
 * Trazo SUAVE y monótono (Fritsch–Carlson): las piezas hechas nunca bajan, así que la curva no puede «rebotar» entre
 * dos puntos. Recibe puntos ya en píxeles, de izquierda a derecha.
 */
export function trazoSuave(pts: ReadonlyArray<readonly [number, number]>): string {
  const n = pts.length
  if (n === 0) return ''
  const f = (v: number) => (Math.round(v * 10) / 10).toString()
  if (n === 1) return `M${f(pts[0]![0])} ${f(pts[0]![1])}`
  if (n === 2) return `M${f(pts[0]![0])} ${f(pts[0]![1])}L${f(pts[1]![0])} ${f(pts[1]![1])}`
  const dx: number[] = []
  const s: number[] = []
  for (let i = 0; i < n - 1; i++) {
    dx.push(pts[i + 1]![0] - pts[i]![0])
    s.push(dx[i]! === 0 ? 0 : (pts[i + 1]![1] - pts[i]![1]) / dx[i]!)
  }
  const m: number[] = [s[0]!]
  for (let i = 1; i < n - 1; i++) m.push(s[i - 1]! * s[i]! <= 0 ? 0 : (s[i - 1]! + s[i]!) / 2)
  m.push(s[n - 2]!)
  for (let i = 0; i < n - 1; i++) {
    if (s[i] === 0) { m[i] = 0; m[i + 1] = 0; continue }
    const a = m[i]! / s[i]!
    const b = m[i + 1]! / s[i]!
    const h = Math.hypot(a, b)
    if (h > 3) { m[i] = (3 * a / h) * s[i]!; m[i + 1] = (3 * b / h) * s[i]! }
  }
  let d = `M${f(pts[0]![0])} ${f(pts[0]![1])}`
  for (let i = 0; i < n - 1; i++) {
    const x0 = pts[i]![0]
    const y0 = pts[i]![1]
    const x1 = pts[i + 1]![0]
    const y1 = pts[i + 1]![1]
    const h = dx[i]! / 3
    d += `C${f(x0 + h)} ${f(y0 + m[i]! * h)} ${f(x1 - h)} ${f(y1 - m[i + 1]! * h)} ${f(x1)} ${f(y1)}`
  }
  return d
}

export interface PuntoRelleno { m: number; c: number; r: number }
export interface TramoRelleno { lider: EquipoId; puntos: PuntoRelleno[] }

/**
 * La banda entre las dos curvas, partida donde se cruzan: cada tramo lleva el color de quien va adelante. Los puntos de
 * cruce se interpolan para que los dos tramos se toquen sin hueco. Hasta `hastaMin`, cada `paso` minutos.
 */
export function tramosDeRelleno(curvas: Record<EquipoId, readonly PacePoint[]>, hastaMin: number, paso = 2): TramoRelleno[] {
  if (!(hastaMin > 0) || curvas.cardenas.length < 2 || curvas.rebolledo.length < 2) return []
  const pts: PuntoRelleno[] = []
  for (let m = 0; m < hastaMin; m += paso) pts.push({ m, c: piezasALaMismaHora(curvas.cardenas, m) ?? 0, r: piezasALaMismaHora(curvas.rebolledo, m) ?? 0 })
  pts.push({ m: hastaMin, c: piezasALaMismaHora(curvas.cardenas, hastaMin) ?? 0, r: piezasALaMismaHora(curvas.rebolledo, hastaMin) ?? 0 })
  const tramos: TramoRelleno[] = []
  let actual: TramoRelleno | null = null
  const liderDe = (p: PuntoRelleno, previo: EquipoId | null): EquipoId => (p.c > p.r ? 'cardenas' : p.r > p.c ? 'rebolledo' : previo ?? 'cardenas')
  for (let i = 0; i < pts.length; i++) {
    const p = pts[i]!
    const lid = liderDe(p, actual?.lider ?? null)
    if (!actual) { actual = { lider: lid, puntos: [p] }; tramos.push(actual); continue }
    if (lid === actual.lider) { actual.puntos.push(p); continue }
    const q = pts[i - 1]!
    const dq = q.c - q.r
    const dp = p.c - p.r
    const t = dq === dp ? 0.5 : dq / (dq - dp)
    const cruce: PuntoRelleno = { m: q.m + (p.m - q.m) * t, c: q.c + (p.c - q.c) * t, r: q.r + (p.r - q.r) * t }
    actual.puntos.push(cruce)
    actual = { lider: lid, puntos: [cruce, p] }
    tramos.push(actual)
  }
  return tramos
}

/** Marcas del eje de piezas con un paso redondo: 4 marcas como máximo. */
export function marcasDePiezas(max: number): { paso: number; marcas: number[] } {
  const pasos = [500, 1000, 2000, 2500, 5000, 10000, 20000]
  const paso = pasos.find((p) => max / p <= 4) ?? 20000
  const marcas: number[] = []
  for (let v = paso; v <= max; v += paso) marcas.push(v)
  return { paso, marcas }
}

/** «5 mil», «10 mil», «2,5 mil»: la marca del eje en el celular. */
export const milTexto = (v: number): string => `${dec(v / 1000, v % 1000 === 0 ? 0 : 1)} mil`

/** Minuto en que una curva llega por primera vez a `umbral` hechas; null si no llega (dentro de `hastaMin`). */
export function minutoDeCruce(curva: readonly PacePoint[], umbral: number, hastaMin: number): number | null {
  for (let m = 1; m <= hastaMin; m++) if ((piezasALaMismaHora(curva, m) ?? 0) >= umbral) return m
  return null
}

// ── Hitos de la carrera ──────────────────────────────────────────────────────

export interface HitoMayorVentaja { min: number; ventaja: number; lider: EquipoId }
export interface HitoCruce { umbral: number; primero: EquipoId; minPrimero: number; minSegundo: number; difMin: number }
export interface HitoFalla { equipo: EquipoId; pin: DetencionPin }

export interface HitosCarrera {
  /** La mayor ventaja del tramo comparado; null si nunca hubo (parejos todo el tiempo). */
  mayor: HitoMayorVentaja | null
  /** El cruce redondo más alto que alcanzaron los dos (5.000 / 10.000 …), con los minutos de diferencia. */
  cruce: HitoCruce | null
  /** La detención más larga: de preferencia una falla técnica. */
  falla: HitoFalla | null
}

export function hitosDeCarrera(c: Pick<CarreraDuelo, 'ventaja' | 'detenciones'>, curvas: Record<EquipoId, readonly PacePoint[]>, hastaMin: number): HitosCarrera {
  let mayor: HitoMayorVentaja | null = null
  for (const v of c.ventaja) if (v.lider && (!mayor || v.ventaja > mayor.ventaja)) mayor = { min: v.minuto, ventaja: v.ventaja, lider: v.lider }

  let cruce: HitoCruce | null = null
  const alAhora = Math.min(piezasALaMismaHora(curvas.cardenas, hastaMin) ?? 0, piezasALaMismaHora(curvas.rebolledo, hastaMin) ?? 0)
  const mayorPz = Math.max(piezasALaMismaHora(curvas.cardenas, hastaMin) ?? 0, piezasALaMismaHora(curvas.rebolledo, hastaMin) ?? 0)
  const paso = mayorPz >= 10000 ? 5000 : 1000
  const umbral = Math.floor(alAhora / paso) * paso
  if (umbral >= paso) {
    const mc = minutoDeCruce(curvas.cardenas, umbral, hastaMin)
    const mr = minutoDeCruce(curvas.rebolledo, umbral, hastaMin)
    if (mc != null && mr != null && mc !== mr) {
      const primero: EquipoId = mc < mr ? 'cardenas' : 'rebolledo'
      cruce = { umbral, primero, minPrimero: Math.min(mc, mr), minSegundo: Math.max(mc, mr), difMin: Math.abs(mc - mr) }
    }
  }

  let falla: HitoFalla | null = null
  const todas: HitoFalla[] = []
  for (const eq of EQ_ORDEN) for (const pin of c.detenciones[eq] ?? []) if (!pin.programada) todas.push({ equipo: eq, pin })
  const masLarga = (xs: HitoFalla[]) => xs.reduce<HitoFalla | null>((a, x) => (!a || x.pin.duracionMin > a.pin.duracionMin ? x : a), null)
  falla = masLarga(todas.filter((x) => x.pin.fallaTecnica)) ?? masLarga(todas)
  return { mayor, cruce, falla }
}

/** Colación del turno en minutos de producción (la única banda de alto completo). Primera que se encuentre. */
export function colacionDe(lados: Record<EquipoId, Pick<LadoEje, 'eventos'> | null>): { desde: number; hasta: number } | null {
  for (const eq of EQ_ORDEN) {
    const e = lados[eq]?.eventos.find((x) => x.programada && /colaci/i.test(x.causa.normalize('NFD').replace(/[̀-ͯ]/g, '')))
    if (e) return { desde: e.desde, hasta: e.hasta }
  }
  return null
}

// ── Ventaja y tendencia ──────────────────────────────────────────────────────

export interface TendenciaVentaja {
  /** Quién va adelante AHORA; null = parejos. */
  lider: EquipoId | null
  ventaja: number
  /** Cambio de la ventaja del líder en la última hora (+ crece, − se achica); null si no hay una hora atrás o el liderazgo cambió. */
  cambio: number | null
  /** Hace una hora iba adelante el OTRO: el liderazgo cambió de manos. `atrasPz` = por cuánto iba atrás el líder de ahora. */
  pasoAdelante: { atrasPz: number } | null
}

export function tendenciaDeVentaja(serie: readonly PuntoVentaja[], ventanaMin = 60): TendenciaVentaja | null {
  const ult = serie[serie.length - 1]
  if (!ult) return null
  const firmada = (p: PuntoVentaja) => p.hechas.cardenas - p.hechas.rebolledo
  const previo = [...serie].reverse().find((p) => p.minuto <= ult.minuto - ventanaMin)
  const lider = ult.lider
  const signo = lider === 'rebolledo' ? -1 : 1
  const vioAtras = lider && previo ? signo * firmada(previo) : null
  if (lider && vioAtras != null && vioAtras < 0) return { lider, ventaja: ult.ventaja, cambio: null, pasoAdelante: { atrasPz: Math.abs(vioAtras) } }
  const cambio = lider && previo ? signo * (firmada(ult) - firmada(previo)) : null
  return { lider, ventaja: ult.ventaja, cambio, pasoAdelante: null }
}

// ── Marcador ─────────────────────────────────────────────────────────────────

export interface EnJuego {
  indicador: string
  rotulo: string
  adelante: Lado | null
  /** Las dos cifras de ese indicador hoy (Cárdenas, Rebolledo), si las hay. */
  valores: { c: number; r: number; unidad: string; dec: number } | null
}

export interface ModeloMarcador {
  /** Hay puntaje (con rival); si no, el Duelo todavía no compara. */
  conPuntaje: boolean
  c: number
  r: number
  enJuego: number
  detalle: EnJuego[]
  cerrada: boolean
  /** Quién va ganando por los puntos firmes; null = parejos. */
  lider: Lado | null
}

export function modeloMarcador(d: DatosDuelo): ModeloMarcador {
  const p = puntajeRiel(d)
  if (!p) return { conPuntaje: false, c: 0, r: 0, enJuego: 0, detalle: [], cerrada: false, lider: null }
  const hoyEsC = d.hoy.equipo === 'cardenas'
  const m = d.marcador
  const valores = (indicador: string, puesto?: string): EnJuego['valores'] => {
    if (!m) return null
    const sel = (a: number | null, b: number | null, unidad: string, decimales: number): EnJuego['valores'] =>
      a == null || b == null ? null : hoyEsC ? { c: a, r: b, unidad, dec: decimales } : { c: b, r: a, unidad, dec: decimales }
    if (indicador === 'arranque') {
      const f = m.kpis.find((k) => k.id === 'arranque')?.filas[0]
      return f ? sel(f.a, f.b, 'min', 0) : null
    }
    if (indicador === 'alimentacion') {
      const x = m.puestos.find((q) => q.etiqueta === puesto)
      return x ? sel(x.a, x.b, '%', 0) : null
    }
    return null
  }
  return {
    conPuntaje: true, c: p.c, r: p.r, enJuego: p.enJuego, cerrada: !p.provisional,
    lider: p.c === p.r ? null : p.c > p.r ? 'c' : 'r',
    detalle: p.detalleEnJuego.map((x) => ({ indicador: x.indicador, rotulo: x.rotulo, adelante: x.adelante, valores: valores(x.indicador, x.puesto) })),
  }
}

// ── Filas: una por indicador que da punto ────────────────────────────────────

export type GanaFila = Lado | 'empate' | 'pend' | 'sin'

export interface FilaPunto {
  id: 'carrera' | 'ritmo' | 'micro'
  rotulo: string
  /** Qué mide y en qué unidad (con la fórmula en micro detención). */
  sub: string
  /** La cuenta completa, para el globo. */
  formula: string
  c: number | null
  r: number | null
  unidad: string
  dec: number
  gana: GanaFila
  /** La frase que explica la ventaja, ya armada. */
  frase: string
  /** Solo micro detención: total del turno de cada equipo, al lado de la cifra normalizada. */
  totalC?: number | null
  totalR?: number | null
  /** De qué tramo es ese total: «en el turno» (cerrado) o «hasta esta hora» (en vivo, igual que la cifra). */
  totalRotulo?: string
  nMaquinas?: number | null
}

export interface EntradaFilas {
  d: DatosDuelo
  nombres: NombresEquipos
  /** Total de micro del turno de cada equipo y cuántas máquinas cuentan (de `microDelEquipo`). */
  micro: Record<EquipoId, { totalTurno: number | null; nMaquinas: number }>
}

const nombreDeLado = (l: Lado, nombres: NombresEquipos) => nombreCorto(equipoDeLado(l), nombres)

/**
 * Las filas «por qué» del marcador: carrera, ritmo y micro detención, con quién gana y una frase que explica la ventaja.
 * El arranque y la alimentación NO van aquí: se firman al cierre y viven en «N en juego».
 */
export function filasDePuntos(e: EntradaFilas): FilaPunto[] {
  const base = filasRiel({ d: e.d, lados: { cardenas: null, rebolledo: null }, compacto: true })
  const enCurso = !e.d.hoy.cerrado
  const out: FilaPunto[] = []
  for (const f of base) {
    if (f.id !== 'carrera' && f.id !== 'ritmo' && f.id !== 'micro') continue
    const gana: GanaFila = f.gan === 'c' || f.gan === 'r' ? f.gan : f.gan === 'empate' ? 'empate' : f.gan === 'pend' ? 'pend' : 'sin'
    const dif = f.c != null && f.r != null ? Math.abs(f.c - f.r) : null
    const quien = gana === 'c' || gana === 'r' ? nombreDeLado(gana, e.nombres) : ''
    let frase = 'Todavía no hay con qué comparar.'
    if (gana === 'empate') frase = 'Parejos en este indicador.'
    else if (gana === 'pend') frase = 'Se define al cierre del turno.'
    else if (dif != null && quien) {
      if (f.id === 'carrera') frase = `${quien} ${int(dif)} ${enCurso ? 'adelante a la misma hora' : 'más piezas al cierre'}.`
      else if (f.id === 'ritmo') frase = `${quien} rinde ${dec(dif)} pz/min más cuando anda.`
      else frase = `${quien} pierde ${dec(dif)} min menos por hora por máquina.`
    }
    const fila: FilaPunto = {
      id: f.id, rotulo: f.rotulo,
      sub: f.id === 'carrera' ? (enCurso ? 'piezas hechas a la misma hora' : 'piezas hechas al cierre, con Mantención sumada')
        : f.id === 'ritmo' ? 'piezas por minuto con la línea andando'
          : 'min por hora por máquina, hasta la misma hora',
      formula: f.id === 'micro'
        ? 'Micro detención por hora por máquina = minutos de micro detención de todas las Baader del turno, hasta la misma hora de producción ÷ horas transcurridas ÷ cantidad de Baader. Gana el que pierde menos.'
        : f.id === 'ritmo' ? 'Ritmo andando = piezas ÷ minutos con piezas. Gana el que saca más piezas por minuto cuando la línea anda.'
          : enCurso ? 'Hechas a la misma hora de producción: las piezas de cada equipo al mismo minuto desde su primera pieza. Gana el que lleva más.' : 'Piezas del turno completo, con las que Mantención les quitó sumadas. Gana el que hizo más.',
      c: f.c, r: f.r, unidad: f.unidad, dec: f.dec, gana, frase,
    }
    if (f.id === 'micro') {
      fila.totalC = e.micro.cardenas.totalTurno
      fila.totalR = e.micro.rebolledo.totalTurno
      fila.totalRotulo = enCurso ? 'hasta esta hora' : 'en el turno'
      fila.nMaquinas = Math.max(e.micro.cardenas.nMaquinas, e.micro.rebolledo.nMaquinas) || null
    }
    out.push(fila)
  }
  return out
}

/**
 * La frase de arriba de «Por qué»: «Cárdenas va adelante por más ritmo andando y menos micro detención.» Con los
 * puntos repartidos dice qué ganó cada uno.
 */
export function fraseDeVentaja(filas: readonly FilaPunto[], nombres: NombresEquipos): string | null {
  const gan = filas.filter((f) => f.gana === 'c' || f.gana === 'r')
  if (!gan.length) return null
  const motivo = (f: FilaPunto) => (f.id === 'carrera' ? 'más piezas a la misma hora' : f.id === 'ritmo' ? 'más ritmo andando' : 'menos micro detención')
  const asunto = (f: FilaPunto) => (f.id === 'carrera' ? 'la carrera' : f.id === 'ritmo' ? 'el ritmo andando' : 'la micro detención')
  const unir = (xs: string[]) => (xs.length <= 1 ? xs.join('') : `${xs.slice(0, -1).join(', ')} y ${xs[xs.length - 1]}`)
  const de = (l: Lado) => gan.filter((f) => f.gana === l)
  const c = de('c')
  const r = de('r')
  if (c.length && !r.length) return `${nombreDeLado('c', nombres)} va adelante por ${unir(c.map(motivo))}.`
  if (r.length && !c.length) return `${nombreDeLado('r', nombres)} va adelante por ${unir(r.map(motivo))}.`
  return `${nombreDeLado('c', nombres)} gana ${unir(c.map(asunto))}; ${nombreDeLado('r', nombres)}, ${unir(r.map(asunto))}.`
}

// ── Micro detención por Baader y por hora ────────────────────────────────────

export interface PatronMicro {
  /** Horas (1, 2…) con más micro de lo normal de ese equipo. */
  altas: Record<Lado, number[]>
  /** Horas altas en los dos equipos: patrón de la operación. */
  enAmbos: number[]
  /** Horas altas solo en uno: patrón del turno. */
  soloC: number[]
  soloR: number[]
}

/** Una hora es «alta» si su micro supera 1,5 veces el promedio del equipo y pasa de 2 min. Distingue operación (se repite en los dos) de turno (solo en uno). */
export function patronDeMicro(horasC: readonly number[] | null, horasR: readonly number[] | null): PatronMicro | null {
  if (!horasC?.length || !horasR?.length) return null
  const altas = (hs: readonly number[]) => {
    const prom = hs.reduce((a, b) => a + b, 0) / hs.length
    return hs.map((v, i) => (v > prom * 1.5 && v >= 2 ? i + 1 : 0)).filter((h) => h > 0)
  }
  const c = altas(horasC)
  const r = altas(horasR)
  return { altas: { c, r }, enAmbos: c.filter((h) => r.includes(h)), soloC: c.filter((h) => !r.includes(h)), soloR: r.filter((h) => !c.includes(h)) }
}

/** Intensidad 0–1 de una celda del mapa de calor: la MISMA escala para los dos equipos. */
export const intensidadCelda = (min: number, maxComun: number): number => (maxComun > 0 ? Math.min(1, Math.max(0, min / maxComun)) : 0)

// ── Horas de producción ──────────────────────────────────────────────────────

export const rotuloHora = (n: number, corto = false): string => (corto ? `${n}.ª` : `${n}.ª h`)

/** «2 h 14 min» o «45 min» de producción, para los globos. */
export function textoMinutoProduccion(min: number): string {
  const m = Math.max(0, Math.round(min))
  return m >= 60 ? `${Math.floor(m / 60)} h ${m % 60} min` : `${m} min`
}

/** Parte un texto en líneas de hasta `max` caracteres, cortando en espacios (y en «/» o «-» si no hay otro lugar). Nunca recorta con «…». */
export function partirTexto(texto: string, max: number): string[] {
  const palabras = texto.trim().replace(/\s+/g, ' ').split(/(?<=[/-])|\s/).filter(Boolean)
  const lineas: string[] = []
  let actual = ''
  for (const p of palabras) {
    const junto = actual ? (/[/-]$/.test(actual) ? `${actual}${p}` : `${actual} ${p}`) : p
    if (junto.length <= max || !actual) actual = junto
    else { lineas.push(actual); actual = p }
  }
  if (actual) lineas.push(actual)
  return lineas
}
