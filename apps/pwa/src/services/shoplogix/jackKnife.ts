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

import { collection, documentId, endAt, getDocs, orderBy, query, startAt } from '@/services/firestoreTracked'
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

/**
 * Resúmenes de los turnos de un día (2-3 documentos). Si la planta ya está en caché, filtra
 * de ahí; si no, pide solo los docs de esa fecha (ids `YYYY-MM-DD_…`). Nunca trae los 571.
 */
export async function resumenesJKDeFecha(planta: string, fecha: string): Promise<ResumenJK[]> {
  const previa = cachePlanta.get(planta)
  if (previa) {
    return (await previa)
      .filter((t) => t.dateKey === fecha && t.jackKnife)
      .map((t) => t.jackKnife as ResumenJK)
  }
  const snap = await getDocs(
    query(
      collection(db, 'shoplogix', planta, 'shifts'),
      orderBy(documentId()),
      startAt(fecha),
      endAt(fecha + ''),
    ),
  )
  return snap.docs
    .map((d) => (d.data() as { jackKnife?: ResumenJK | null }).jackKnife ?? null)
    .filter((r): r is ResumenJK => r !== null)
}

// ── Comparación de períodos ─────────────────────────────────────────────────

/** Modo de comparación: «Vs. período anterior», «Vs. mes pasado», «Elegir a mano», «Sin comparar». */
export type ModoCmpJK = 'ant' | 'mes' | 'mano' | 'no'
export interface RangoJK { desde: number; hasta: number }
/** Período de comparación. `parcial` = la historia no alcanza para un período completo. */
export interface PreviaJK extends RangoJK { parcial: boolean }

/**
 * Resta un mes a una fecha YYYY-MM-DD. Si el día no existe en el mes anterior,
 * usa su último día: 31-mar → 28/29-feb, nunca 3-mar (el mockup se pasaba).
 */
export function restarMes(dateKey: string): string {
  const [y, m, d] = dateKey.split('-').map(Number) as [number, number, number]
  const mesAnterior0 = m - 2 // índice base 0 del mes anterior
  const anio = mesAnterior0 < 0 ? y - 1 : y
  const mes0 = (mesAnterior0 + 12) % 12
  const ultimoDia = new Date(Date.UTC(anio, mes0 + 1, 0)).getUTCDate()
  const dia = Math.min(d, ultimoDia)
  return `${anio}-${String(mes0 + 1).padStart(2, '0')}-${String(dia).padStart(2, '0')}`
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

export type VeredictoJK = 'mejoro' | 'empeoro' | 'igual' | 'nueva' | 'sinHistoria' | 'sinEventos'
/** Veredicto por causa: minutos por turno, ±10 %. */
export function veredicto(
  ahora: PuntoJK | undefined,
  antes: PuntoJK | undefined,
  nAhora: number,
  nAntes: number,
  tieneHistoria = true,
): VeredictoJK {
  if (!antes) return tieneHistoria ? 'nueva' : 'sinHistoria'
  if (!ahora) return 'sinEventos'
  const r = (ahora.min / nAhora) / (antes.min / nAntes)
  return r < 0.9 ? 'mejoro' : r > 1.1 ? 'empeoro' : 'igual'
}

export const ETIQUETA_VEREDICTO: Record<VeredictoJK, string> = {
  mejoro: 'mejoró',
  empeoro: 'empeoró',
  igual: 'igual',
  nueva: 'apareció',
  sinHistoria: 'sin historia',
  sinEventos: 'sin eventos ahora',
}

/** Resumen numérico de la comparación para la tesis. Null si no hay período de comparación. */
export interface ResumenComparacionJK {
  nAntes: number
  nAhora: number
  minAntes: number
  minAhora: number
  horasAntes: number
  parcial: boolean
  mejoraron: number
  empeoraron: number
  desaparecieron: number
  aparecieron: number
  sinHistoria: number
}
export function resumenComparacion(
  ahora: CalculoJK,
  antes: CalculoJK | null,
  previa: PreviaJK | null,
  historia: ReadonlySet<string> = new Set(),
): ResumenComparacionJK | null {
  if (!antes || !previa) return null
  const nAhora = ahora.hasta - ahora.desde + 1
  const nAntes = previa.hasta - previa.desde + 1
  const PV = new Map(antes.pts.map((p) => [p.k, p]))
  const AH = new Map(ahora.pts.map((p) => [p.k, p]))
  const claves = new Set([...PV.keys(), ...AH.keys()])
  let mejoraron = 0
  let empeoraron = 0
  let desaparecieron = 0
  let aparecieron = 0
  let sinHistoria = 0
  for (const k of claves) {
    const v = veredicto(AH.get(k), PV.get(k), nAhora, nAntes, historia.has(k))
    if (v === 'mejoro') mejoraron++
    else if (v === 'empeoro') empeoraron++
    else if (v === 'sinEventos') desaparecieron++
    else if (v === 'nueva') aparecieron++
    else if (v === 'sinHistoria') sinHistoria++
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
    desaparecieron, aparecieron, sinHistoria,
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
  variacionPct: number | null
  /** Regla de ±10 %. */
  resultado: 'mejoro' | 'empeoro' | 'se_mantiene'
  mejoraron: string[]
  empeoraron: string[]
  desaparecieron: string[]
  aparecieron: string[]
  sinHistoria: string[]
  prioridad1: string[]
  filas: FilaInformeJK[]
  /** Dos comentarios más repetidos de cada causa prioritaria o empeorada (máx. 4 causas). */
  comentariosClave: { causa: string; top: { texto: string; n: number }[] }[]
}

/** Datos del informe, sin formato. Conserva causas nuevas incluso si el período base no tiene eventos. */
export function datosInforme(
  turnos: readonly TurnoJK[],
  ahora: CalculoJK,
  antes: CalculoJK,
  previa: PreviaJK,
  vista: VistaJK = 'imp',
): InformeJK | null {
  const nAhora = ahora.hasta - ahora.desde + 1
  const nAntes = previa.hasta - previa.desde + 1
  const PV = new Map(antes.pts.map((p) => [p.k, p]))
  const AH = new Map(ahora.pts.map((p) => [p.k, p]))
  const claves = [...new Set([...AH.keys(), ...PV.keys()])]

  const historia = causasConHistoria(turnos, ahora.desde, vista)
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
      veredicto: veredicto(a, b, nAhora, nAntes, historia.has(causa)),
      delta: minAhora10 - minAntes10,
    }
  })
  filas.sort((x, y) => (x.ahora ? nivelPrioridad(x.ahora, ahora.un, ahora.um) : 6) - (y.ahora ? nivelPrioridad(y.ahora, ahora.un, ahora.um) : 6) || (y.ahora?.min ?? 0) - (x.ahora?.min ?? 0))

  const de = (...vs: VeredictoJK[]) => filas.filter((f) => vs.includes(f.veredicto)).map((f) => f.causa)
  const mejoraron = de('mejoro')
  const empeoraron = de('empeoro')
  const prioridad1 = ahora.pts
    .filter((p) => p.q === 'amb')
    .sort((x, y) => y.min - x.min)
    .map((p) => p.k)

  const minTurnoAntes = antes.D / nAntes
  const minTurnoAhora = ahora.D / nAhora
  const variacionPct = minTurnoAntes ? ((minTurnoAhora - minTurnoAntes) / minTurnoAntes) * 100 : null
  const resultado = variacionPct === null ? (minTurnoAhora ? 'empeoro' : 'se_mantiene') : Math.abs(variacionPct) < 10 ? 'se_mantiene' : variacionPct < 0 ? 'mejoro' : 'empeoro'

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
    desaparecieron: de('sinEventos'), aparecieron: de('nueva'), sinHistoria: de('sinHistoria'),
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
  lb?: boolean
  ha?: string
  hb?: string
  ca?: string
  cb?: string
  /** Causa marcada en el gráfico (parámetro `c`). */
  causa?: string
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
  if (e.lb !== undefined) p.set('lb', e.lb ? '1' : '0')
  if (e.ha) p.set('ha', e.ha)
  if (e.hb) p.set('hb', e.hb)
  if (e.ca) p.set('ca', e.ca)
  if (e.cb) p.set('cb', e.cb)
  if (e.causa) p.set('c', e.causa)
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
    ...(p.has('lb') ? { lb: p.get('lb') !== '0' } : {}),
    v: (VENTANAS_URL.includes(v) ? v : '90') as VentanaJK | 'libre',
    vs: (VISTAS_URL.includes(vs) ? vs : 'imp') as VistaJK,
    cmp: (MODOS_URL.includes(cmp) ? cmp : 'ant') as ModoCmpJK,
    ha: p.get('ha') ?? undefined,
    hb: p.get('hb') ?? undefined,
    ca: p.get('ca') ?? undefined,
    cb: p.get('cb') ?? undefined,
    causa: p.get('c') ?? undefined,
  }
}

export const ACCION_CUADRANTE: Record<CuadranteJK, string> = {
  amb: 'Prioridad 1: causa raíz y tiempo de reparación.',
  agu: 'Bajar el tiempo de reparación: repuestos a mano, procedimiento y acceso.',
  cro: 'Causa raíz para que no se repita: diseño, táctica de mantención, operación o capacitación.',
  ok: 'Mantener y vigilar.',
}
export function nivelPrioridad(p: PuntoJK, un: number, um: number): number {
  const q = cuadrante(p.ev, p.mttr, un, um)
  return q === 'amb' ? 1 : q === 'agu' ? 2 : q === 'cro' ? (p.min >= un * um ? 3 : 4) : 5
}
export function limitesPeriodoBase(ahora: CalculoJK, antes: CalculoJK | null, activo: boolean): CalculoJK {
  if (!activo || !antes || !antes.N) return ahora
  const un = antes.un * (ahora.hasta - ahora.desde + 1) / (antes.hasta - antes.desde + 1)
  const um = antes.um
  return { ...ahora, un, um, pts: ahora.pts.map(p => ({ ...p, q: cuadrante(p.ev, p.mttr, un, um) })) }
}
export function causasConHistoria(turnos: readonly TurnoJK[], inicio: number, vista: VistaJK = 'imp'): Set<string> {
  return new Set(turnos.slice(0, inicio).flatMap(t => eventosDeVista(t.resumen, vista).map(([k]) => k)))
}
export function frasePrioridad(c: CalculoJK, formato: (min: number) => string): string {
  const p = [...c.pts].filter(p => nivelPrioridad(p, c.un, c.um) === 1).sort((a,b) => b.min-a.min)[0]
  return (p ? 'Prioridad 1: ' + p.k + ', ' + p.ev + ' eventos y ' + formato(p.min) + '. ' : 'Ninguna causa cae en agudas y crónicas. ') + 'Mantención en total: ' + c.N + ' eventos y ' + formato(c.D) + '.'
}
export function textoResumenComparacion(r: ResumenComparacionJK): string {
  return [[r.mejoraron, 'mejoró', 'mejoraron'], [r.desaparecieron, 'desapareció', 'desaparecieron'], [r.empeoraron, 'empeoró', 'empeoraron'], [r.aparecieron, 'apareció', 'aparecieron'], [r.sinHistoria, 'sin historia', 'sin historia']].filter(([n]) => Number(n) > 0).map(([n, uno, varios]) => n + ' ' + (n === 1 ? uno : varios)).join(', ')
}
