/**
 * Diagrama Jack-Knife de Mantención: carga y cálculo.
 *
 * El sync (functions/shoplogix/jackKnife.js) deja en cada doc padre de turno un
 * campo chico `jackKnife` con los eventos de Mantención, las detenciones sin
 * imputar y los comentarios de operador. Acá se leen esos docs y se suman por
 * ventana de tiempo.
 *
 * Lectura: el SDK web no permite proyectar campos (`select`), así que se leen
 * los docs padre completos de la planta, una vez por sesión (caché en memoria).
 * Cada apertura de la card cuesta una lectura por turno de la planta; ver el
 * contador `firestoreTracked`.
 *
 * `calcularJackKnife` es PURO: el mismo cálculo que `calc()` del mockup aprobado
 * (scratchpad jack-knife-mockup, 07-11-2026).
 */

import { collection, getDocs } from '@/services/firestoreTracked'
import { db } from '../firebase'

export type VistaJK = 'imp' | 'sin' | 'todas'
export type CuadranteJK = 'amb' | 'agu' | 'cro' | 'ok'
export type VentanaJK = 'turno' | '7' | '30' | '90' | 'todo'

/** Etiqueta de la línea «sin imputar» dentro de la vista «Todas». */
export const SIN_IMPUTAR = 'Sin imputar'

/** Forma del campo `jackKnife` (v1). Ver functions/shoplogix/jackKnife.js. */
export interface ResumenJK {
  v: 1
  eventos: [causa: string, inicioMs: number, min: number][]
  sinImputar: [maquina: string, inicioMs: number, min: number][]
  sinImputarLinea: [inicioMs: number, min: number][]
  comentarios: [causa: string, inicioMs: number, texto: string][]
  conCausaMin: number
  sinCausaMin: number
  uptimeMin: number
}

/** Un turno ya validado: tiene resumen y uptime > 0. */
export interface TurnoJK {
  id: string
  dateKey: string
  shiftId: string
  resumen: ResumenJK
}

export interface PuntoJK {
  k: string
  ev: number
  min: number
  mttr: number
  q: CuadranteJK
}

export interface CalculoJK {
  pts: PuntoJK[]
  /** Eventos totales de la ventana. */
  N: number
  /** Minutos totales de la ventana. */
  D: number
  /** Umbral de frecuencia: eventos ÷ nº de causas (o de máquinas, en «Sin imputar»). */
  un: number
  /** Umbral de duración: minutos ÷ eventos. */
  um: number
  /** Cobertura de causa, con microdetenciones. null si no hay minutos. */
  cob: number | null
  /** Minutos por turno con el filtro de la vista, para el riel. */
  barras: number[]
  desde: number
  hasta: number
}

/** Turno tal como llega de Firestore (antes de validar). */
export interface TurnoCrudo {
  id: string
  dateKey: string
  shiftId: string
  jackKnife: ResumenJK | null
}

// ── Validación ──────────────────────────────────────────────────────────────

const RE_UNSCHEDULED = /_Unscheduled$/

/**
 * Deja los turnos que cuentan: con resumen y uptime > 0. Unscheduled no es un
 * turno: no tiene resumen por diseño y no entra al «sin resumen».
 */
export function prepararTurnos(crudos: readonly TurnoCrudo[]): { turnos: TurnoJK[]; sinResumen: number } {
  const turnos: TurnoJK[] = []
  let sinResumen = 0
  for (const t of crudos) {
    if (RE_UNSCHEDULED.test(t.id)) continue
    if (!t.jackKnife) { sinResumen++; continue }
    if (!(t.jackKnife.uptimeMin > 0)) continue
    turnos.push({ id: t.id, dateKey: t.dateKey, shiftId: t.shiftId, resumen: t.jackKnife })
  }
  turnos.sort((a, b) => (a.id < b.id ? -1 : a.id > b.id ? 1 : 0))
  return { turnos, sinResumen }
}

// ── Ventanas ────────────────────────────────────────────────────────────────

/** Resta días a una fecha YYYY-MM-DD (aritmética UTC, como el mockup). */
function restarDias(dateKey: string, dias: number): string {
  const d = new Date(`${dateKey}T12:00:00Z`)
  d.setUTCDate(d.getUTCDate() - dias)
  return d.toISOString().slice(0, 10)
}

/**
 * Índices inclusivos (desde, hasta) de la ventana. Los días se cuentan hacia
 * atrás desde el último turno, igual que en el mockup.
 */
export function ventanaJK(turnos: readonly TurnoJK[], ventana: VentanaJK): { desde: number; hasta: number } {
  const n = turnos.length
  if (n === 0) return { desde: 0, hasta: -1 }
  const ultimo = n - 1
  if (ventana === 'todo') return { desde: 0, hasta: ultimo }
  if (ventana === 'turno') return { desde: ultimo, hasta: ultimo }
  const limite = restarDias(turnos[ultimo]!.dateKey, Number(ventana) - 1)
  let desde = ultimo
  while (desde > 0 && turnos[desde - 1]!.dateKey >= limite) desde--
  return { desde, hasta: ultimo }
}

// ── Cálculo ─────────────────────────────────────────────────────────────────

const enVentana = (desde: number, hasta: number, i: number) => i >= desde && i <= hasta

/** Eventos de un turno según la vista, como [causa, minutos]. */
function eventosDeVista(r: ResumenJK, vista: VistaJK): [string, number][] {
  if (vista === 'sin') return r.sinImputar.map(([m, , min]) => [m, min])
  const base: [string, number][] = r.eventos.map(([c, , min]) => [c, min])
  if (vista === 'todas') {
    for (const [, min] of r.sinImputarLinea) base.push([SIN_IMPUTAR, min])
  }
  return base
}

/** Cuadrante según el mockup: frecuencia y duración contra sus umbrales. */
function cuadrante(ev: number, mttr: number, un: number, um: number): CuadranteJK {
  if (ev > un) return mttr > um ? 'amb' : 'cro'
  return mttr > um ? 'agu' : 'ok'
}

/**
 * Suma los eventos de la ventana por causa (o por máquina, en «Sin imputar»),
 * con los umbrales y el cuadrante de cada punto. Pura.
 */
export function calcularJackKnife(
  turnos: readonly TurnoJK[],
  desde: number,
  hasta: number,
  vista: VistaJK,
): CalculoJK {
  const barras = turnos.map((t) => eventosDeVista(t.resumen, vista).reduce((s, [, min]) => s + min, 0))

  const acumulado = new Map<string, { ev: number; min: number }>()
  let con = 0
  let sin = 0
  for (let i = 0; i < turnos.length; i++) {
    if (!enVentana(desde, hasta, i)) continue
    const r = turnos[i]!.resumen
    for (const [causa, min] of eventosDeVista(r, vista)) {
      const x = acumulado.get(causa) ?? { ev: 0, min: 0 }
      x.ev++
      x.min += min
      acumulado.set(causa, x)
    }
    con += r.conCausaMin
    sin += r.sinCausaMin
  }

  const filas = [...acumulado.entries()]
  const N = filas.reduce((s, [, x]) => s + x.ev, 0)
  const D = filas.reduce((s, [, x]) => s + x.min, 0)
  const un = filas.length ? N / filas.length : 0
  const um = N ? D / N : 0
  const pts: PuntoJK[] = filas.map(([k, x]) => {
    const mttr = x.min / x.ev
    return { k, ev: x.ev, min: x.min, mttr, q: cuadrante(x.ev, mttr, un, um) }
  })

  return {
    pts,
    N,
    D,
    un,
    um,
    cob: con + sin > 0 ? con / (con + sin) : null,
    barras,
    desde,
    hasta,
  }
}

// ── Comentarios del detalle ─────────────────────────────────────────────────

export interface ComentarioJK {
  dateKey: string
  shiftId: string
  inicioMs: number
  texto: string
}

/** Últimos `max` comentarios de una causa dentro de la ventana, más recientes primero. */
export function comentariosDe(
  turnos: readonly TurnoJK[],
  desde: number,
  hasta: number,
  causa: string,
  max = 5,
): ComentarioJK[] {
  const out: ComentarioJK[] = []
  for (let i = hasta; i >= desde && i >= 0; i--) {
    const t = turnos[i]!
    const cs = t.resumen.comentarios
    for (let j = cs.length - 1; j >= 0; j--) {
      const [c, ms, texto] = cs[j]!
      if (c !== causa) continue
      out.push({ dateKey: t.dateKey, shiftId: t.shiftId, inicioMs: ms, texto })
      if (out.length >= max) return out
    }
  }
  return out
}

// ── Carga ───────────────────────────────────────────────────────────────────

const cachePlanta = new Map<string, Promise<TurnoCrudo[]>>()

/** Lee los docs padre de los turnos de la planta, una vez por sesión. */
export function cargarTurnosCrudos(planta: string): Promise<TurnoCrudo[]> {
  const previa = cachePlanta.get(planta)
  if (previa) return previa
  const p = getDocs(collection(db, 'shoplogix', planta, 'shifts')).then((snap) =>
    snap.docs.map((d) => {
      const data = d.data() as { jackKnife?: ResumenJK; dateKey?: string; shiftId?: string }
      const id = d.id
      return {
        id,
        dateKey: data.dateKey ?? id.slice(0, 10),
        shiftId: data.shiftId ?? id.slice(11),
        jackKnife: data.jackKnife ?? null,
      }
    }),
  )
  // Si falla, no se deja cacheado el error: la próxima apertura reintenta.
  p.catch(() => cachePlanta.delete(planta))
  cachePlanta.set(planta, p)
  return p
}

/** Solo para pruebas y para forzar una relectura. */
export function limpiarCacheJackKnife(planta?: string): void {
  if (planta) cachePlanta.delete(planta)
  else cachePlanta.clear()
}

// ── Comparación de períodos ─────────────────────────────────────────────────

/** Modo de comparación: «Vs. período anterior», «Vs. mes pasado», «Elegir a mano», «Sin comparar». */
export type ModoCmpJK = 'ant' | 'mes' | 'mano' | 'no'
export interface RangoJK { desde: number; hasta: number }
/** Período de comparación. `parcial` = la historia no alcanza para un período completo. */
export interface PreviaJK extends RangoJK { parcial: boolean }

/** Resta un mes a una fecha YYYY-MM-DD (aritmética UTC, como el mockup). */
function restarMes(dateKey: string): string {
  const d = new Date(`${dateKey}T12:00:00Z`)
  d.setUTCMonth(d.getUTCMonth() - 1)
  return d.toISOString().slice(0, 10)
}

/** Período inmediatamente anterior, del mismo largo. Null si no hay historia. */
export function previaAnterior(desde: number, hasta: number): PreviaJK | null {
  if (desde <= 0) return null
  const n = hasta - desde + 1
  return { desde: Math.max(0, desde - n), hasta: desde - 1, parcial: desde - n < 0 }
}

/** Mismas fechas, un mes antes. Null si no hay turnos en ese rango. */
export function previaMesPasado(turnos: readonly TurnoJK[], desde: number, hasta: number): PreviaJK | null {
  if (!turnos.length || hasta < desde) return null
  const lo = restarMes(turnos[desde]!.dateKey)
  const hi = restarMes(turnos[hasta]!.dateKey)
  const a = turnos.findIndex((t) => t.dateKey >= lo)
  let b = -1
  for (let i = turnos.length - 1; i >= 0; i--) {
    if (turnos[i]!.dateKey <= hi) { b = i; break }
  }
  return a < 0 || b < a ? null : { desde: a, hasta: b, parcial: false }
}

/** Período de comparación según el modo. `manual` solo se usa en «Elegir a mano». */
export function previaJK(
  turnos: readonly TurnoJK[],
  rango: RangoJK,
  modo: ModoCmpJK,
  manual?: RangoJK,
): PreviaJK | null {
  if (modo === 'no') return null
  if (modo === 'ant') return previaAnterior(rango.desde, rango.hasta)
  if (modo === 'mano') {
    if (!manual) return null
    return { desde: Math.min(manual.desde, manual.hasta), hasta: Math.max(manual.desde, manual.hasta), parcial: false }
  }
  return previaMesPasado(turnos, rango.desde, rango.hasta)
}

// ── Veredictos y variación ──────────────────────────────────────────────────

export type SentidoJK = 'mejor' | 'peor' | 'igual'
/** Variación con umbral ±10 %: «igual» si el cambio relativo es menor a 10 %. */
export function sentidoCambio(antes: number, ahora: number): SentidoJK {
  const d = ahora - antes
  const rel = antes ? Math.abs(d) / antes : 1
  if (rel < 0.1) return 'igual'
  return d < 0 ? 'mejor' : 'peor'
}

export type VeredictoJK = 'mejoro' | 'empeoro' | 'igual' | 'nueva' | 'sinEventos'
/** Veredicto por causa: minutos por turno, ±10 %. */
export function veredicto(
  ahora: PuntoJK | undefined,
  antes: PuntoJK | undefined,
  nAhora: number,
  nAntes: number,
): VeredictoJK {
  if (!antes) return 'nueva'
  if (!ahora) return 'sinEventos'
  const r = (ahora.min / nAhora) / (antes.min / nAntes)
  return r < 0.9 ? 'mejoro' : r > 1.1 ? 'empeoro' : 'igual'
}

export const ETIQUETA_VEREDICTO: Record<VeredictoJK, string> = {
  mejoro: 'mejoró',
  empeoro: 'empeoró',
  igual: 'igual',
  nueva: 'nueva',
  sinEventos: 'sin eventos ahora',
}

/** Resumen numérico de la comparación para la tesis. Null si no hay eventos antes. */
export interface ResumenComparacionJK {
  nAntes: number
  nAhora: number
  minAntes: number
  minAhora: number
  horasAntes: number
  parcial: boolean
  mejoraron: number
  empeoraron: number
}
export function resumenComparacion(
  ahora: CalculoJK,
  antes: CalculoJK | null,
  previa: PreviaJK | null,
): ResumenComparacionJK | null {
  if (!antes || !previa || antes.N === 0) return null
  const nAhora = ahora.hasta - ahora.desde + 1
  const nAntes = previa.hasta - previa.desde + 1
  const PV = new Map(antes.pts.map((p) => [p.k, p]))
  const AH = new Map(ahora.pts.map((p) => [p.k, p]))
  const claves = new Set([...PV.keys(), ...AH.keys()])
  let mejoraron = 0
  let empeoraron = 0
  for (const k of claves) {
    const v = veredicto(AH.get(k), PV.get(k), nAhora, nAntes)
    if (v === 'mejoro' || v === 'sinEventos') mejoraron++
    else if (v === 'empeoro' || v === 'nueva') empeoraron++
  }
  return {
    nAntes,
    nAhora,
    minAntes: antes.D / nAntes,
    minAhora: ahora.D / nAhora,
    horasAntes: antes.D,
    parcial: previa.parcial,
    mejoraron,
    empeoraron,
  }
}

// ── Comentarios: palabras, agrupación y filtro ──────────────────────────────

/** Texto normalizado: minúsculas, sin tildes, solo letras, números y espacios simples. */
export function normalizarTexto(t: string): string {
  return t
    .toLowerCase()
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/[^a-z0-9ñ ]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
}

/** Palabras que no cuentan para los chips (mockup: VACIAS). */
const PALABRAS_VACIAS = new Set(
  'de la el en y a con se por no del al lo las los un una que para es mas sin muy le su o e se realiza cambio'.split(' '),
)

/** Las `max` palabras más repetidas (más de 3 letras, sin vacías ni números), contadas una vez por comentario. */
export function palabrasFrecuentes(textos: readonly string[], max = 10): { palabra: string; n: number }[] {
  const cuenta = new Map<string, number>()
  for (const t of textos) {
    for (const w of new Set(normalizarTexto(t).split(' '))) {
      if (w.length <= 3 || PALABRAS_VACIAS.has(w) || /^\d+$/.test(w)) continue
      cuenta.set(w, (cuenta.get(w) ?? 0) + 1)
    }
  }
  return [...cuenta.entries()]
    .map(([palabra, n]) => ({ palabra, n }))
    .sort((a, b) => b.n - a.n || (a.palabra < b.palabra ? -1 : 1))
    .slice(0, max)
}

/** Filtra por texto de búsqueda (sin tildes) y por palabra de chip (palabra exacta). */
export function filtrarComentarios<T extends { texto: string }>(
  lista: readonly T[],
  busqueda: string,
  palabra: string | null,
): T[] {
  const q = normalizarTexto(busqueda)
  return lista.filter((c) => {
    const n = normalizarTexto(c.texto)
    return (!q || n.includes(q)) && (!palabra || n.split(' ').includes(palabra))
  })
}

export interface GrupoComentarioJK {
  texto: string
  n: number
  ultimoMs: number
}
/** Agrupa por texto normalizado (×n) y guarda la fecha del último. Más repetidos primero. */
export function agruparComentarios(lista: readonly { texto: string; inicioMs: number }[]): GrupoComentarioJK[] {
  const grupos = new Map<string, GrupoComentarioJK>()
  for (const c of lista) {
    const clave = normalizarTexto(c.texto)
    const g = grupos.get(clave)
    if (g) {
      g.n++
      g.ultimoMs = Math.max(g.ultimoMs, c.inicioMs)
    } else {
      grupos.set(clave, { texto: c.texto, n: 1, ultimoMs: c.inicioMs })
    }
  }
  return [...grupos.values()].sort((a, b) => b.n - a.n || b.ultimoMs - a.ultimoMs)
}

// ── Informe ─────────────────────────────────────────────────────────────────

export interface FilaInformeJK {
  causa: string
  ahora: PuntoJK | undefined
  antes: PuntoJK | undefined
  /** Por cada 10 turnos. */
  evAhora10: number
  evAntes10: number
  minAhora10: number
  minAntes10: number
  veredicto: VeredictoJK
}

export interface InformeJK {
  nAhora: number
  nAntes: number
  minTurnoAntes: number
  minTurnoAhora: number
  /** Variación de minutos por turno, en %. */
  variacionPct: number
  /** Regla de ±10 %. */
  resultado: 'mejoro' | 'empeoro' | 'se_mantiene'
  mejoraron: string[]
  empeoraron: string[]
  prioridad1: string[]
  filas: FilaInformeJK[]
  /** Dos comentarios más repetidos de cada causa prioritaria o empeorada (máx. 4 causas). */
  comentariosClave: { causa: string; top: { texto: string; n: number }[] }[]
}

/** Datos del informe, sin formato. Null si no hay comparación con eventos. */
export function datosInforme(
  turnos: readonly TurnoJK[],
  ahora: CalculoJK,
  antes: CalculoJK,
  previa: PreviaJK,
): InformeJK | null {
  if (antes.N === 0) return null
  const nAhora = ahora.hasta - ahora.desde + 1
  const nAntes = previa.hasta - previa.desde + 1
  const PV = new Map(antes.pts.map((p) => [p.k, p]))
  const AH = new Map(ahora.pts.map((p) => [p.k, p]))
  const claves = [...new Set([...AH.keys(), ...PV.keys()])]

  const filas: (FilaInformeJK & { delta: number })[] = claves.map((causa) => {
    const a = AH.get(causa)
    const b = PV.get(causa)
    const minAhora10 = a ? (a.min / nAhora) * 10 : 0
    const minAntes10 = b ? (b.min / nAntes) * 10 : 0
    return {
      causa,
      ahora: a,
      antes: b,
      evAhora10: a ? (a.ev / nAhora) * 10 : 0,
      evAntes10: b ? (b.ev / nAntes) * 10 : 0,
      minAhora10,
      minAntes10,
      veredicto: veredicto(a, b, nAhora, nAntes),
      delta: minAhora10 - minAntes10,
    }
  })
  filas.sort((x, y) => Math.abs(y.delta) - Math.abs(x.delta))

  const de = (...vs: VeredictoJK[]) => filas.filter((f) => vs.includes(f.veredicto)).map((f) => f.causa)
  const mejoraron = de('mejoro', 'sinEventos')
  const empeoraron = de('empeoro', 'nueva')
  const prioridad1 = ahora.pts
    .filter((p) => p.q === 'amb')
    .sort((x, y) => y.min - x.min)
    .map((p) => p.k)

  const minTurnoAntes = antes.D / nAntes
  const minTurnoAhora = ahora.D / nAhora
  const variacionPct = minTurnoAntes ? ((minTurnoAhora - minTurnoAntes) / minTurnoAntes) * 100 : 0
  const resultado = Math.abs(variacionPct) < 10 ? 'se_mantiene' : variacionPct < 0 ? 'mejoro' : 'empeoro'

  const claveCausas = [...new Set([...prioridad1, ...empeoraron])].slice(0, 4)
  const comentariosClave = claveCausas.map((causa) => {
    const textos = comentariosDe(turnos, ahora.desde, ahora.hasta, causa, Infinity)
    return {
      causa,
      top: agruparComentarios(textos).slice(0, 2).map((g) => ({ texto: g.texto, n: g.n })),
    }
  })

  return {
    nAhora,
    nAntes,
    minTurnoAntes,
    minTurnoAhora,
    variacionPct,
    resultado,
    mejoraron,
    empeoraron,
    prioridad1,
    filas: filas.map(({ delta: _d, ...f }) => f),
    comentariosClave,
  }
}

// ── Estado en la URL (QR del informe) ───────────────────────────────────────

/**
 * Filtros de la tarjeta en el hash, con el mismo patrón que `/nuevos` (`#t=`):
 * `#jk=pl=chonchi&v=90&vs=imp&cmp=ant`. Los extremos manuales van por id de turno,
 * no por índice, para que el enlace siga apuntando al mismo día si llegan turnos nuevos.
 */
export interface EstadoURLJK {
  pl: string
  v: VentanaJK | 'libre'
  vs: VistaJK
  cmp: ModoCmpJK
  ha?: string
  hb?: string
  ca?: string
  cb?: string
}

const VENTANAS_URL: readonly string[] = ['turno', '7', '30', '90', 'todo', 'libre']
const VISTAS_URL: readonly string[] = ['imp', 'sin', 'todas']
const MODOS_URL: readonly string[] = ['ant', 'mes', 'mano', 'no']

export function codificarEstadoJK(e: EstadoURLJK): string {
  const p = new URLSearchParams()
  p.set('pl', e.pl)
  p.set('v', e.v)
  p.set('vs', e.vs)
  p.set('cmp', e.cmp)
  if (e.ha) p.set('ha', e.ha)
  if (e.hb) p.set('hb', e.hb)
  if (e.ca) p.set('ca', e.ca)
  if (e.cb) p.set('cb', e.cb)
  return `#jk=${p.toString()}`
}

/** Lee el hash. Null si no es de la tarjeta o es de otra planta. Valores inválidos se ignoran. */
export function leerEstadoJK(hash: string, planta: string): EstadoURLJK | null {
  if (!hash.startsWith('#jk=')) return null
  const p = new URLSearchParams(hash.slice(4))
  if (p.get('pl') !== planta) return null
  const v = p.get('v') ?? '90'
  const vs = p.get('vs') ?? 'imp'
  const cmp = p.get('cmp') ?? 'ant'
  return {
    pl: planta,
    v: (VENTANAS_URL.includes(v) ? v : '90') as VentanaJK | 'libre',
    vs: (VISTAS_URL.includes(vs) ? vs : 'imp') as VistaJK,
    cmp: (MODOS_URL.includes(cmp) ? cmp : 'ant') as ModoCmpJK,
    ha: p.get('ha') ?? undefined,
    hb: p.get('hb') ?? undefined,
    ca: p.get('ca') ?? undefined,
    cb: p.get('cb') ?? undefined,
  }
}
