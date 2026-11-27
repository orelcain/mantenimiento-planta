/**
 * Buscador de componente sobre el Jack-Knife (spec SPEC_BUSCADOR_JACK_KNIFE.md §1).
 * Lógica pura: sin Firestore ni React. Los turnos entran ya validados (`prepararTurnos`).
 *
 * Regla del cruce (una a una, corregida el 27-11 por el coordinador):
 * cada comentario coincidente se asigna a SU detención más cercana de la MISMA causa.
 * Distancia = 0 si el comentario cae en [inicio−5 min, fin+5 min]; si no,
 * min(|c−inicio|, |c−fin|). Se asigna solo si la distancia es ≤ 30 min.
 * Las detenciones del turno son el conjunto (sin repetir) de las asignadas.
 */
import type { EventoBitacora } from '@/services/bitacora/bitacora.types'
import { normalizarTexto, type TurnoJK } from './jackKnife'

const MIN = 60_000
const VENTANA_MS = 5 * MIN
const CERCANIA_MS = 30 * MIN

/** Sinónimos por término buscado. Claves y valores ya normalizados (minúsculas, sin tildes). */
export const SINONIMOS: Readonly<Record<string, readonly string[]>> = {
  expulsador: ['expulsador', 'expulsado', 'pulsador', 'empujador'],
}

/** Términos de búsqueda: la consulta normalizada, o su lista de sinónimos si la tabla la tiene. */
export function terminosDe(consulta: string): string[] {
  const q = normalizarTexto(consulta)
  if (!q) return []
  const lista = SINONIMOS[q]
  return lista ? lista.map((t) => normalizarTexto(t)) : [q]
}

function coincide(texto: string, terminos: readonly string[]): boolean {
  const n = normalizarTexto(texto)
  return terminos.some((t) => n.includes(t))
}

/** [causa, inicioMs, min] de un evento del Jack-Knife. */
export type DetencionComponente = [causa: string, inicioMs: number, min: number]
/** [causa, inicioMs, texto] de un comentario del operador. */
export type ComentarioComponente = [causa: string, inicioMs: number, texto: string]

export interface FilaComponente {
  turnoId: string
  dateKey: string
  shiftId: string
  /** Detenciones asignadas a algún comentario coincidente (sin repetir). */
  detenciones: DetencionComponente[]
  /** Comentarios coincidentes, sin repetir el mismo texto de la misma causa. */
  comentarios: ComentarioComponente[]
  /** Trabajos de Bitácora del turno que nombran el componente. */
  trabajos: EventoBitacora[]
}

export interface CausaComponente {
  causa: string
  /** Turnos donde un comentario coincidente tiene esa causa. */
  turnos: number
}

export interface ResultadoBuscador {
  terminos: string[]
  causas: CausaComponente[]
  filas: FilaComponente[]
  totalDetenciones: number
  /** Suma sin redondear; la vista redondea. */
  totalMin: number
  turnosConDetencion: number
  /** Turnos con comentario coincidente y ninguna detención asignada. */
  comentariosSinDetencion: number
}

/** Asigna cada comentario coincidente a su detención más cercana de la misma causa. Devuelve índices de `eventos`. */
function detencionesAsignadas(eventos: readonly DetencionComponente[], comentarios: readonly ComentarioComponente[]): Set<number> {
  const usadas = new Set<number>()
  for (const [causa, ms] of comentarios) {
    let mejorI = -1
    let mejorD = Infinity
    for (let i = 0; i < eventos.length; i++) {
      const [c, ini, min] = eventos[i]!
      if (c !== causa) continue
      const fin = ini + min * MIN
      const d = ms >= ini - VENTANA_MS && ms <= fin + VENTANA_MS
        ? 0
        : Math.min(Math.abs(ms - ini), Math.abs(ms - fin))
      if (d <= CERCANIA_MS && d < mejorD) {
        mejorD = d
        mejorI = i
      }
    }
    if (mejorI >= 0) usadas.add(mejorI)
  }
  return usadas
}

/** Un trabajo cae en el turno del Jack-Knife por su `jkClave` (su turno de Bitácora es otro: `fecha_banda`); sin clave, por el id como antes. */
function perteneceTurnoJK(w: EventoBitacora, turnoJkId: string): boolean {
  if (w.jkClave) return parsearJkClave(w.jkClave)?.turnoId === turnoJkId
  return w.turnoId === turnoJkId
}

function trabajoCoincide(t: EventoBitacora, terminos: readonly string[]): boolean {
  const repuestos = (t.repuestos ?? []).map((r) => `${r.nombre} ${r.nombreComun ?? ''}`).join(' ')
  return coincide([t.componente ?? '', t.descripcion, repuestos].join(' '), terminos)
}

export function buscarComponente(
  turnos: readonly TurnoJK[],
  trabajos: readonly EventoBitacora[],
  consulta: string,
): ResultadoBuscador {
  const terminos = terminosDe(consulta)
  const vacio: ResultadoBuscador = {
    terminos, causas: [], filas: [], totalDetenciones: 0, totalMin: 0, turnosConDetencion: 0, comentariosSinDetencion: 0,
  }
  if (terminos.length === 0) return vacio

  const causasTurnos = new Map<string, Set<string>>()
  const filas: FilaComponente[] = []
  let totalDetenciones = 0
  let totalMin = 0
  let turnosConDetencion = 0
  let comentariosSinDetencion = 0

  for (const t of turnos) {
    const { eventos, comentarios } = t.resumen
    const coinc: ComentarioComponente[] = comentarios.filter(([, , texto]) => coincide(texto, terminos))
    for (const [causa] of coinc) {
      if (!causasTurnos.has(causa)) causasTurnos.set(causa, new Set())
      causasTurnos.get(causa)!.add(t.id)
    }
    const usadas = detencionesAsignadas(eventos, coinc)
    const dets = [...usadas].sort((a, b) => eventos[a]![1] - eventos[b]![1]).map((i) => eventos[i]!)
    const trabajosTurno = trabajos.filter((w) => perteneceTurnoJK(w, t.id) && trabajoCoincide(w, terminos))

    if (coinc.length > 0 && dets.length === 0) comentariosSinDetencion++
    if (dets.length === 0 && coinc.length === 0 && trabajosTurno.length === 0) continue

    if (dets.length > 0) {
      turnosConDetencion++
      totalDetenciones += dets.length
      totalMin += dets.reduce((s, d) => s + d[2], 0)
    }
    const vistos = new Set<string>()
    const comentariosFila: ComentarioComponente[] = []
    for (const c of coinc) {
      const clave = `${c[0]}|${normalizarTexto(c[2])}`
      if (vistos.has(clave)) continue
      vistos.add(clave)
      comentariosFila.push(c)
    }
    filas.push({
      turnoId: t.id,
      dateKey: t.dateKey,
      shiftId: t.shiftId,
      detenciones: dets,
      comentarios: comentariosFila,
      trabajos: trabajosTurno,
    })
  }

  const causas: CausaComponente[] = [...causasTurnos.entries()]
    .map(([causa, set]) => ({ causa, turnos: set.size }))
    .sort((a, b) => b.turnos - a.turnos || (a.causa < b.causa ? -1 : 1))

  return { terminos, causas, filas, totalDetenciones, totalMin, turnosConDetencion, comentariosSinDetencion }
}

// ── Antes y después ─────────────────────────────────────────────────────────

const RE_CAMBIO_TEXTO = /\bcambi/

/** Fecha del último cambio dentro de las filas: trabajo con repuestos o comentario con «cambi». */
export function fechaDeCambio(filas: readonly FilaComponente[]): string | null {
  let fecha: string | null = null
  for (const f of filas) {
    const cambio =
      f.trabajos.some((w) => (w.repuestos?.length ?? 0) > 0) ||
      f.comentarios.some(([, , texto]) => RE_CAMBIO_TEXTO.test(normalizarTexto(texto)))
    if (cambio) fecha = f.dateKey
  }
  return fecha
}

export interface PeriodoComponente {
  turnos: number
  min: number
}

export interface AntesDespuesComponente {
  fechaCambio: string | null
  antes: PeriodoComponente
  despues: PeriodoComponente
  /** `null` mientras no haya 30 turnos con producción después del cambio (la referencia de «Efecto de las acciones»). */
  veredicto: null
}

/** Turnos con falla (detención o comentario) antes (incluido el día del cambio) y después del cambio. */
export function antesDespues(
  filas: readonly FilaComponente[],
  fechaCambio: string | null,
  _turnosConProduccionDespues: number,
): AntesDespuesComponente {
  const antes: PeriodoComponente = { turnos: 0, min: 0 }
  const despues: PeriodoComponente = { turnos: 0, min: 0 }
  for (const f of filas) {
    const falla = f.detenciones.length > 0 || f.comentarios.length > 0
    if (!falla) continue
    const min = f.detenciones.reduce((s, d) => s + d[2], 0)
    const lado = fechaCambio === null || f.dateKey <= fechaCambio ? antes : despues
    lado.turnos++
    lado.min += min
  }
  // Sin 30 turnos con producción después no hay veredicto. Con 30 o más, la referencia
  // de «Efecto de las acciones» aún no está conectada: se queda en null (spec §1).
  return { fechaCambio, antes, despues, veredicto: null }
}

// ── Trabajos sin aviso SAP ──────────────────────────────────────────────────

const RE_CAMBIO_SIN_AVISO = /\bcambi|reempla|se instala|instalaci/

export interface CambioSinAviso {
  tipo: 'comentario' | 'trabajo'
  turnoId: string
  dateKey: string
  causa: string | null
  texto: string
  trabajoId: string | null
}

/** Parte `jk:<planta>:<turnoId>:<inicioMs>`. */
function parsearJkClave(clave: string): { turnoId: string; inicioMs: number } | null {
  const p = clave.split(':')
  if (p.length < 4 || p[0] !== 'jk') return null
  const inicioMs = Number(p[p.length - 1])
  return { turnoId: p.slice(2, -1).join(':'), inicioMs }
}

export function cambiosSinAviso(turnos: readonly TurnoJK[], trabajos: readonly EventoBitacora[]): CambioSinAviso[] {
  const out: CambioSinAviso[] = []
  const vistos = new Set<string>()

  for (const t of turnos) {
    for (const [causa, , texto] of t.resumen.comentarios) {
      const n = normalizarTexto(texto)
      if (!RE_CAMBIO_SIN_AVISO.test(n)) continue
      const clave = `${t.dateKey}|${n}`
      if (vistos.has(clave)) continue
      vistos.add(clave)
      const yaRegistrado = trabajos.some((w) => {
        const jk = w.jkClave ? parsearJkClave(w.jkClave) : null
        if (!jk || jk.turnoId !== t.id) return false
        return t.resumen.eventos.some(([c, ini]) => c === causa && ini === jk.inicioMs)
      })
      if (yaRegistrado) continue
      out.push({ tipo: 'comentario', turnoId: t.id, dateKey: t.dateKey, causa, texto, trabajoId: null })
    }
  }

  for (const w of trabajos) {
    if ((w.repuestos?.length ?? 0) === 0 || w.avisoSap) continue
    out.push({
      tipo: 'trabajo',
      turnoId: w.turnoId,
      dateKey: w.fechaTurno,
      causa: null,
      texto: w.descripcion,
      trabajoId: w.id,
    })
  }

  return out.sort((a, b) => (a.dateKey < b.dateKey ? -1 : a.dateKey > b.dateKey ? 1 : 0))
}
