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
