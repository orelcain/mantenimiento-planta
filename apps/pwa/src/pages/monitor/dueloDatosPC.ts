/**
 * Lógica PURA del «Duelo» en PC (≥ 1280 px) · opción B «Eje» (mockup 28-10-2026, PLAN_DUELO_EQUIPOS.md, 5b).
 *
 * Todo lo que el lienzo, «Por qué», «Semana a semana» y el riel muestran sale de acá; los componentes
 * (`DueloPC.tsx`) solo ubican y dibujan. Se apoya en `duelo.ts` (carrera, marcador, periodos) y no toca la regla de
 * jornada: usa `resumen.jornada` tal como la entrega.
 *
 * Reglas que este módulo hace cumplir:
 *  1. Un dato que falta es «sin dato» (null), nunca un cero ni una cifra derivada de otra fuente que no cuadra:
 *     el micro por hora y por máquina viene SOLO de `duelo.micH`/`micM` (misma regla que `mic`), y los minutos a
 *     ≥ 90 % de `duelo.v90` o de la serie minuto a minuto archivada.
 *  2. Los minutos de «Por qué» son de LÍNEA, los mismos que «El turno» (`equivMin ?? lineMin`). Un turno que no los
 *     trae (el backend aún no lo rearmó) es «sin dato»: ni `min` (minutos de máquina, la trampa que infló el Pareto
 *     5,6×) ni el prorrateo de `repartoDeTurno`, que no es lo que dice «El turno».
 *  3. Cárdenas va siempre arriba y Rebolledo abajo; el color de cada equipo es fijo.
 */
import type { PacePoint } from '@/services/shoplogix/monitorCompare'
import { duenoDe } from '@/services/shoplogix/monitorEventos'
import type { PublicMonitorLive, ShiftStat } from '@/services/shoplogix/publicShiftMonitor.service'
import {
  curvaDeCv, eventosEnEjeProduccion, marcadorDePeriodo, nombreCorto, ritmoHoraAHora, rotuloFantasma, rotuloTurno, semanaIso,
  type DatosDuelo, type EquipoId, type EventoTurno, type NombresEquipos, type PuntoSemana, type PromedioSemana, type Resultado,
} from './duelo'
import { lunesDe } from './repartoSemanal'
import { normalizar } from './ritmoVivo'

const r1 = (n: number) => Math.round(n * 10) / 10

/**
 * La letra que identifica a un equipo en los carriles, chips y ejes: la inicial de su nombre corto («C» Cárdenas,
 * «R» Rebolledo) y, sin nombres cargados, «G2» / «G1» (Grupo 2 / Grupo 1): una letra suelta no diría de quién habla.
 */
export function letraEquipo(id: EquipoId, nombres?: NombresEquipos | null): string {
  const n = nombreCorto(id, nombres)
  const g = /^grupo\s+(\d+)/i.exec(n)
  return g ? `G${g[1]}` : (n.charAt(0) || '?').toUpperCase()
}

// ── Serie minuto a minuto: minutos sostenidos a ≥ 90 % ───────────────────────

/** Un minuto de la línea cuenta como «sostenido» cuando rinde al menos esta fracción de su esperado. */
export const UMBRAL_SOSTENIDA = 0.9

export interface SerieMinuto {
  desde: string
  maquinas: Array<{ id: string; esperado: number | null; cycles: number[] }>
}

/** Suma por minuto de la línea y su esperado (null si alguna máquina no trae esperado: no se puede afirmar «a ritmo»). */
export function sumaDeLinea(s: SerieMinuto | null | undefined): { suma: number[]; esperado: number | null } | null {
  if (!s?.maquinas?.length) return null
  const largo = Math.min(...s.maquinas.map((m) => m.cycles.length))
  if (!(largo > 0)) return null
  const suma = Array.from({ length: largo }, (_, i) => s.maquinas.reduce((a, m) => a + (m.cycles[i] ?? 0), 0))
  const completo = s.maquinas.every((m) => m.esperado != null && m.esperado > 0)
  return { suma, esperado: completo ? s.maquinas.reduce((a, m) => a + (m.esperado ?? 0), 0) : null }
}

/**
 * Minuto del arranque PRODUCTIVO en una serie por minuto: el primero con piezas, saltando picos sueltos (más de 60 min
 * de vacío hasta lo siguiente). Es la misma regla que el backend (`indiceArranqueProductivo`) y la de la curva del Duelo.
 * -1 si no hay piezas.
 */
export function arranqueEnSerie(suma: readonly number[]): number {
  const conPz: number[] = []
  suma.forEach((v, i) => { if (v > 0) conPz.push(i) })
  if (conPz.length === 0) return -1
  let inicio = conPz[0]!
  for (let k = 1; k < conPz.length; k++) {
    if (conPz[k]! - conPz[k - 1]! - 1 > 60) inicio = conPz[k]!
    else break
  }
  return inicio
}

export interface Sostenida {
  /** Minutos (desde la primera pieza, el mismo eje de la carrera) en que la línea rindió ≥ 90 % de su esperado. */
  minutos: number[]
  /** Esperado de la línea (pz/min). */
  esperado: number
}

const CINCO_MIN = 300_000

/**
 * Los minutos sostenidos de un turno, ubicados en el eje de producción. El origen es el inicio del tramo de 5 min de la
 * primera pieza (como `curvaCompacta`), así que cae en el mismo minuto que la curva. null sin serie o sin esperado.
 */
export function sostenidaDeSerie(s: SerieMinuto | null | undefined): Sostenida | null {
  const base = sumaDeLinea(s)
  if (!s || !base || base.esperado == null) return null
  const desdeMs = Date.parse(s.desde)
  const i0 = arranqueEnSerie(base.suma)
  if (!Number.isFinite(desdeMs) || i0 < 0) return null
  const t0 = Math.floor((desdeMs + i0 * 60_000) / CINCO_MIN) * CINCO_MIN
  const minutos: number[] = []
  for (let i = i0; i < base.suma.length; i++) {
    if (base.suma[i]! >= UMBRAL_SOSTENIDA * base.esperado) minutos.push(Math.round((desdeMs + i * 60_000 - t0) / 60_000))
  }
  return { minutos, esperado: base.esperado }
}

// ── Ritmo por hora y hora ganada ─────────────────────────────────────────────

export interface HoraLado {
  /** pz/min de la hora de producción; null = la curva no cubre lo suficiente de esa hora. */
  v: number | null
  /** La hora no se completó (turno en curso o terminado a media hora). */
  parcial: boolean
}

/** Ritmo de cada hora de producción de UNA curva (índice 0 = 1.ª hora). Mismo cálculo que el ritmo hora a hora del celular. */
export function horasDeCurva(curva: readonly PacePoint[]): HoraLado[] {
  const r = ritmoHoraAHora(curva, [])
  if (!r.length) return []
  const n = Math.max(...r.map((x) => x.hora))
  return Array.from({ length: n }, (_, i) => {
    const x = r.find((y) => y.hora === i + 1)
    return { v: x?.a ?? null, parcial: x?.parcialA ?? false }
  })
}

/** Diferencia mínima (pz/min) para decir que una hora la ganó alguien. */
export const EMPATE_HORA = 0.05

export interface HoraGanada {
  ganador: EquipoId | 'empate'
  /** Diferencia absoluta en pz/min. */
  dif: number
  /** Cuenta para «hora ganada»: ninguna de las dos curvas la tiene a medias por estar en curso. */
  cuenta: boolean
}

export function horasGanadas(
  c: Pick<LadoEje, 'horas' | 'enCurso'> | null,
  r: Pick<LadoEje, 'horas' | 'enCurso'> | null,
): { horas: Array<HoraGanada | null>; cardenas: number; rebolledo: number } {
  const out: Array<HoraGanada | null> = []
  let cardenas = 0
  let rebolledo = 0
  const n = Math.max(c?.horas.length ?? 0, r?.horas.length ?? 0)
  for (let h = 0; h < n; h++) {
    const a = c?.horas[h]
    const b = r?.horas[h]
    if (!a || !b || a.v == null || b.v == null) { out.push(null); continue }
    const dif = a.v - b.v
    const ganador = Math.abs(dif) < EMPATE_HORA ? 'empate' : dif > 0 ? 'cardenas' : 'rebolledo'
    const cuenta = ganador !== 'empate' && !(a.parcial && c!.enCurso) && !(b.parcial && r!.enCurso)
    if (cuenta) { if (ganador === 'cardenas') cardenas++; else rebolledo++ }
    out.push({ ganador, dif: Math.abs(dif), cuenta })
  }
  return { horas: out, cardenas, rebolledo }
}

// ── Micro detención ──────────────────────────────────────────────────────────

export interface MicroLado {
  /** Minutos de micro (de máquina, sumados) por hora de producción; null = sin dato. */
  h: number[] | null
  /** Minutos de micro por máquina. */
  m: Array<{ n: string; min: number }> | null
  /** Total del turno (= `mic`); null sin dato. */
  total: number | null
}

const sumaR1 = (xs: readonly number[]) => r1(xs.reduce((a, b) => a + b, 0))

/** Micro del turno que se mira, desde su `live` (`mantencion.microH` y `porMaquina[].microMin`). */
export function microDeLive(live: Pick<PublicMonitorLive, 'mantencion'> | null | undefined): MicroLado {
  const mt = live?.mantencion
  const h = mt && Array.isArray(mt.microH) && mt.microH.length > 0 ? mt.microH : null
  const m = mt?.porMaquina?.length ? mt.porMaquina.map((x) => ({ n: x.name, min: x.microMin ?? 0 })) : null
  return { h, m, total: m ? sumaR1(m.map((x) => x.min)) : h ? sumaR1(h) : null }
}

/** Micro de un turno cerrado, desde `shiftStats[].duelo` (`micH`, `micM`, `mic`). */
export function microDeStat(st: ShiftStat | null | undefined): MicroLado {
  const d = st?.duelo
  if (!d) return { h: null, m: null, total: null }
  const h = Array.isArray(d.micH) && d.micH.length > 0 ? d.micH : null
  const m = Array.isArray(d.micM) && d.micM.length > 0
    ? d.micM.map((min, i) => ({ n: d.alim[i]?.n ?? st?.porMaquina?.[i]?.n ?? `Máquina ${i + 1}`, min }))
    : null
  return { h, m, total: d.mic ?? (m ? sumaR1(m.map((x) => x.min)) : null) }
}

/**
 * Micro del turno que se mira: lo de su `live` y, si ese `live` es anterior al micro por hora (los turnos del historial
 * se publicaron antes), lo que su `shiftStats` ya trae. Nunca se mezclan dos reglas: cada dato sale entero de una fuente.
 */
export function microDeHoy(live: Pick<PublicMonitorLive, 'mantencion'> | null | undefined, st: ShiftStat | null | undefined): MicroLado {
  const a = microDeLive(live)
  if (a.h && a.m) return a
  const b = microDeStat(st)
  return { h: a.h ?? b.h, m: a.m ?? b.m, total: a.total ?? b.total }
}

// ── Los dos lados del eje ────────────────────────────────────────────────────

export interface LadoEje {
  eq: EquipoId
  shiftDocId: string
  nombre: string
  /** «Cárdenas · noche 27/10». */
  rotulo: string
  /** Es el turno que se está mirando (el otro es su rival de jornada). */
  esHoy: boolean
  enCurso: boolean
  curva: PacePoint[]
  total: number
  /** Minuto de producción del último punto de la curva. */
  finMin: number
  horas: HoraLado[]
  /** Paradas de 5 min o más, ya en el eje de producción. */
  eventos: EventoTurno[]
  /** Minutos sostenidos a ≥ 90 % (para dibujar la franja); null sin serie minuto a minuto. */
  sost: Sostenida | null
  /** Cuántos minutos fueron: lo publicado (`duelo.v90`) y, si no, lo que cuenta la franja. null = sin dato. */
  v90: number | null
  micro: MicroLado
}

export interface EntradaLados {
  d: DatosDuelo
  nombres: NombresEquipos
  live: PublicMonitorLive
  stats: readonly ShiftStat[]
  /** Serie minuto a minuto del turno que se mira. */
  serieHoy: SerieMinuto | null | undefined
  /** Series archivadas de los últimos turnos (`seriesMinuto`), para el rival. */
  series: ReadonlyArray<SerieMinuto & { shiftDocId: string }> | null | undefined
}

function armarLado(p: Omit<LadoEje, 'horas' | 'finMin' | 'v90'> & { v90Publicado: number | null | undefined }): LadoEje {
  const { v90Publicado, ...resto } = p
  return {
    ...resto,
    finMin: p.curva.length ? p.curva[p.curva.length - 1]!.minutes : 0,
    horas: horasDeCurva(p.curva),
    v90: v90Publicado ?? (p.sost ? p.sost.minutos.length : null),
  }
}

/** Los dos turnos de la jornada puestos en su casilla: Cárdenas y Rebolledo (el que no juega queda null). */
export function construirLados(e: EntradaLados): Record<EquipoId, LadoEje | null> {
  const { d } = e
  const out: Record<EquipoId, LadoEje | null> = { cardenas: null, rebolledo: null }
  const stat = (id: string | null | undefined) => (id ? e.stats.find((s) => s.shiftDocId === id) : undefined)
  const c = d.carrera
  if (c) {
    const nombre = nombreCorto(d.hoy.equipo, e.nombres)
    out[d.hoy.equipo] = armarLado({
      eq: d.hoy.equipo, shiftDocId: d.hoy.shiftDocId, nombre, rotulo: rotuloTurno(nombre, d.hoy), esHoy: true, enCurso: !d.hoy.cerrado,
      curva: c.hoy, total: c.hoyPz, eventos: c.eventosHoy, sost: sostenidaDeSerie(e.serieHoy), micro: microDeHoy(e.live, stat(d.hoy.shiftDocId)),
      v90Publicado: stat(d.hoy.shiftDocId)?.duelo?.v90,
    })
    const f = c.fantasmaInfo
    if (f && f.shiftDocId && f.curva.length >= 2) {
      const n = nombreCorto(f.equipo, e.nombres)
      const st = stat(f.shiftDocId)
      out[f.equipo] = armarLado({
        eq: f.equipo, shiftDocId: f.shiftDocId, nombre: n, rotulo: rotuloFantasma(f, n), esHoy: false, enCurso: false,
        curva: f.curva, total: f.total ?? f.curva[f.curva.length - 1]!.pieces, eventos: f.eventos,
        sost: sostenidaDeSerie(e.series?.find((s) => s.shiftDocId === f.shiftDocId)), micro: microDeStat(st),
        v90Publicado: st?.duelo?.v90,
      })
    }
  }
  return out
}

/** Esperado de la línea (pz/min) para las rayas «esperado» y «90 %». null si no se sabe: no se dibuja ni se inventa. */
export function esperadoDeLinea(serieHoy: SerieMinuto | null | undefined, live: Pick<PublicMonitorLive, 'machines'>): number | null {
  const deSerie = sumaDeLinea(serieHoy)?.esperado
  if (deSerie != null) return deSerie
  const ms = live.machines ?? []
  return ms.length > 0 && ms.every((m) => (m.targetCpm ?? 0) > 0) ? ms.reduce((a, m) => a + (m.targetCpm ?? 0), 0) : null
}

/** Hasta cuántos minutos llega el eje X: 8 h como mínimo, más si algún turno es más largo (tope 12 h). */
export function maxMinutosEje(lados: ReadonlyArray<Pick<LadoEje, 'finMin'> | null>, previstoMin?: number | null): number {
  const tope = Math.max(0, previstoMin ?? 0, ...lados.map((l) => l?.finMin ?? 0))
  return Math.min(720, Math.max(480, Math.ceil(tope / 60) * 60))
}

// ── Por qué: minutos de línea por dueño ──────────────────────────────────────

export type DuenoPQ = 'mic' | 'sin' | 'mant' | 'ext' | 'prog'
export const DUENOS_PQ: readonly DuenoPQ[] = ['mic', 'sin', 'mant', 'ext', 'prog']

export interface CausasLado {
  /** Minutos de LÍNEA por dueño. */
  min: Record<DuenoPQ, number>
  /** Las causas de cada dueño, de mayor a menor. */
  det: Record<DuenoPQ, Array<{ n: string; min: number }>>
  /** Turnos que aportan. */
  turnos: number
  /** Turnos que no traen sus causas en minutos de línea y quedaron fuera (sin dato). */
  sinDato: number
}

export const causasVacias = (): CausasLado => ({
  min: { mic: 0, sin: 0, mant: 0, ext: 0, prog: 0 },
  det: { mic: [], sin: [], mant: [], ext: [], prog: [] },
  turnos: 0,
  sinDato: 0,
})

/** El dueño de una causa recuperable. Micro detención es de operación, no de equipos ni sin imputar. */
export function duenoPQ(causa: string): Exclude<DuenoPQ, 'prog'> {
  if (/micro/.test(normalizar(causa))) return 'mic'
  const d = duenoDe(causa).dueno
  return d === 'mantencion' ? 'mant' : d === 'externo' ? 'ext' : 'sin'
}

export interface CausaLinea { causa: string; min: number }

type CausaCruda = { reason: string; min: number; count?: number; lineMin?: number; equivMin?: number }

/**
 * Los minutos de LÍNEA por causa de un turno, como los cuenta «El turno» (`equivMin ?? lineMin`). Si alguna causa no
 * los trae, null: no se afirma (y no se escala ni se usan los minutos de máquina). Sin causas, `[]` (no hubo paradas).
 */
export function causasDeLinea(rec: readonly CausaCruda[] | null | undefined): CausaLinea[] | null {
  if (!rec) return null
  if (!rec.every((c) => (c.equivMin ?? c.lineMin) != null)) return null
  return rec.map((c) => ({ causa: c.reason, min: c.equivMin ?? c.lineMin ?? 0 }))
}

/**
 * Minutos programados (colación, reunión…) de las paradas de 5 min o más, DENTRO de las horas de producción del turno:
 * lo que se pasa del último minuto (la detención programada del cierre dura horas) no es del turno.
 */
export const minutosProgramados = (eventos: readonly EventoTurno[], finMin: number): number =>
  eventos.filter((e) => e.programada).reduce((a, e) => a + Math.max(0, Math.min(e.hasta, finMin) - e.desde), 0)

/** Suma un turno al acumulado de su equipo; sin causas (`null`) lo cuenta como «sin dato» y no suma. */
export function acumularCausas(acc: CausasLado, causas: readonly CausaLinea[] | null, programadas: number): CausasLado {
  acc.turnos++
  if (causas == null) { acc.sinDato++; return acc }
  const por = new Map<string, number>()
  for (const c of causas) {
    if (!(c.min > 0)) continue
    const k = duenoPQ(c.causa)
    acc.min[k] += c.min
    por.set(`${k}|${c.causa}`, (por.get(`${k}|${c.causa}`) ?? 0) + c.min)
  }
  for (const [k, min] of por) {
    const [dueno, ...resto] = k.split('|')
    acc.det[dueno as DuenoPQ].push({ n: resto.join('|'), min })
  }
  if (programadas > 0) acc.min.prog += programadas
  return acc
}

/** Une los detalles repetidos entre turnos (misma causa) y los ordena. Se llama al final de acumular. */
export function cerrarCausas(acc: CausasLado): CausasLado {
  for (const k of DUENOS_PQ) {
    const m = new Map<string, number>()
    for (const c of acc.det[k]) m.set(c.n, (m.get(c.n) ?? 0) + c.min)
    acc.det[k] = [...m].map(([n, min]) => ({ n, min })).sort((a, b) => b.min - a.min)
  }
  return acc
}

/** Un turno cerrado de `shiftStats` en minutos de línea por causa + sus paradas programadas. */
export function causasDeStat(t: ShiftStat): { causas: CausaLinea[] | null; programadas: number } {
  const curva = curvaDeCv(t.duelo)
  const fin = curva.length ? curva[curva.length - 1]!.minutes : Infinity
  return { causas: causasDeLinea(t.recoverable), programadas: minutosProgramados(eventosEnEjeProduccion(t.duelo?.ev, t.duelo?.ini), fin) }
}

/** El turno que se mira, desde su `live` y las paradas ya ubicadas en su eje de producción. */
export function causasDeLive(live: Pick<PublicMonitorLive, 'timeBreakdown'>, eventos: readonly EventoTurno[], finMin: number): { causas: CausaLinea[] | null; programadas: number } {
  return { causas: causasDeLinea(live.timeBreakdown?.recoverable), programadas: minutosProgramados(eventos, finMin) }
}

export type PeriodoPQ = 'jornada' | 'semana' | 'mes'

export interface TurnoDePeriodo { eq: EquipoId; shiftDocId: string; esHoy: boolean }

const claveMes = (jornada: string) => jornada.slice(0, 7)

/**
 * Los turnos que entran a «Por qué» en cada periodo. Jornada: el turno que se mira y su rival (aunque uno siga en
 * curso). Semana y mes: los turnos CERRADOS de esa semana (lunes a domingo) o mes calendario de la jornada que se mira.
 */
export function turnosDelPeriodo(d: DatosDuelo, periodo: PeriodoPQ): TurnoDePeriodo[] {
  if (periodo === 'jornada') {
    const out: TurnoDePeriodo[] = [{ eq: d.hoy.equipo, shiftDocId: d.hoy.shiftDocId, esHoy: true }]
    if (d.rival) out.push({ eq: d.rival.equipo, shiftDocId: d.rival.shiftDocId, esHoy: false })
    return out
  }
  const clave = periodo === 'semana' ? lunesDe(d.hoyKey) : claveMes(d.hoyKey)
  const de = (j: string) => (periodo === 'semana' ? lunesDe(j) : claveMes(j))
  return d.duelos
    .map((x) => x.resumen)
    .filter((r) => r.cerrado && de(r.jornada) === clave)
    .map((r) => ({ eq: r.equipo, shiftDocId: r.shiftDocId, esHoy: r.shiftDocId === d.hoy.shiftDocId }))
}

export interface EntradaPorQue {
  d: DatosDuelo
  live: PublicMonitorLive
  stats: readonly ShiftStat[]
  periodo: PeriodoPQ
}

export interface PorQue {
  causas: Record<EquipoId, CausasLado | null>
  /** Micro por máquina (min de máquina), sumado en el periodo; null = sin dato en ese equipo. */
  micro: Record<EquipoId, Array<{ n: string; min: number }> | null>
  /** Piezas que Mantención le quitó a cada equipo (solo jornada: es lo que suma a su carrera). */
  piezasMant: Record<EquipoId, number | null>
  turnos: Record<EquipoId, number>
}

/** «Por qué», para el periodo elegido. */
export function construirPorQue(e: EntradaPorQue): PorQue {
  const acc: Record<EquipoId, CausasLado | null> = { cardenas: null, rebolledo: null }
  const mic: Record<EquipoId, Map<string, number> | null> = { cardenas: null, rebolledo: null }
  const pzMant: Record<EquipoId, number | null> = { cardenas: null, rebolledo: null }
  const turnos: Record<EquipoId, number> = { cardenas: 0, rebolledo: 0 }
  const resumenes = new Map([...e.d.duelos.map((x) => x.resumen), e.d.hoy, ...(e.d.rival ? [e.d.rival] : [])].map((r) => [r.shiftDocId, r]))
  for (const t of turnosDelPeriodo(e.d, e.periodo)) {
    const st = e.stats.find((s) => s.shiftDocId === t.shiftDocId)
    if (!t.esHoy && !st) continue
    const { causas, programadas } = t.esHoy ? causasDeLive(e.live, e.d.carrera?.eventosHoy ?? [], e.d.carrera?.hoy[e.d.carrera.hoy.length - 1]?.minutes ?? Infinity) : causasDeStat(st!)
    acc[t.eq] = acumularCausas(acc[t.eq] ?? causasVacias(), causas, programadas)
    turnos[t.eq]++
    const micro = t.esHoy ? microDeHoy(e.live, st) : microDeStat(st)
    if (micro.m) {
      const m = mic[t.eq] ?? new Map<string, number>()
      for (const x of micro.m) m.set(x.n, r1((m.get(x.n) ?? 0) + x.min))
      mic[t.eq] = m
    }
    if (e.periodo === 'jornada') pzMant[t.eq] = Math.round(resumenes.get(t.shiftDocId)?.piezasMant ?? 0)
  }
  for (const k of ['cardenas', 'rebolledo'] as const) if (acc[k]) cerrarCausas(acc[k]!)
  const lista = (m: Map<string, number> | null) => (m ? [...m].map(([n, min]) => ({ n, min })) : null)
  return { causas: acc, micro: { cardenas: lista(mic.cardenas), rebolledo: lista(mic.rebolledo) }, piezasMant: pzMant, turnos }
}

/** Minutos de «Por qué» sin los programados (es lo que se dice en el subtítulo). */
export const sinProgramadas = (c: CausasLado | null): number => (c ? c.min.mic + c.min.sin + c.min.mant + c.min.ext : 0)

// ── Riel: KPI a KPI ──────────────────────────────────────────────────────────

export type GanFila = 'c' | 'r' | 'empate' | 'pend' | 'info' | 'sin'

export interface FilaRiel {
  id: string
  rotulo: string
  sub: string
  /** Valor de Cárdenas (o del turno que se mira, en la noche sin rival) y de Rebolledo (o su promedio). */
  c: number | null
  r: number | null
  /** Texto ya armado cuando la fila junta dos números («arranque · última hora»). */
  cTxt?: string
  rTxt?: string
  unidad: string
  dec: number
  gan: GanFila
  /** Nombre del puesto de alimentación (solo en las filas `alim-*`): lo usa el globo de ayuda. */
  puesto?: string
}

export interface EntradaRiel {
  d: DatosDuelo
  lados: Record<EquipoId, LadoEje | null>
  /** Con el ancho chico las tres alimentaciones se juntan en una fila de puntos. */
  compacto: boolean
  /** «carros» (Baader 142) o «silletas» (Baader 200): el rótulo de la alimentación. */
  unidad?: 'carros' | 'silletas' | null
}

const ladoDe = (r: Resultado, hoy: EquipoId): GanFila =>
  r === 'a' ? (hoy === 'cardenas' ? 'c' : 'r')
    : r === 'b' ? (hoy === 'cardenas' ? 'r' : 'c')
      : r === 'empate' ? 'empate' : r === 'pendiente' ? 'pend' : 'sin'

/** Filas del KPI a KPI (con rival). Cárdenas a la izquierda y Rebolledo a la derecha, sea cual sea el turno que se mira. */
export function filasRiel(e: EntradaRiel): FilaRiel[] {
  const { d, lados, compacto } = e
  const m = d.marcador
  if (!m || m.sinDuelo || !d.rival) return []
  const hoy = d.hoy.equipo
  const enCurso = !d.hoy.cerrado
  const dosLados = (a: number | null, b: number | null): Pick<FilaRiel, 'c' | 'r'> =>
    (hoy === 'cardenas' ? { c: a, r: b } : { c: b, r: a })
  const txtLados = (a: string, b: string) => (hoy === 'cardenas' ? { cTxt: a, rTxt: b } : { cTxt: b, rTxt: a })
  const kpi = (id: string) => m.kpis.find((k) => k.id === id)
  const filas: FilaRiel[] = []

  const car = kpi('carrera')?.filas[0]
  if (car) filas.push({ id: 'carrera', rotulo: 'Carrera', sub: enCurso ? 'piezas a la misma hora' : 'piezas, con Mantención sumada', ...dosLados(car.a, car.b), unidad: 'pz', dec: 0, gan: ladoDe(car.ganador, hoy) })
  const rit = kpi('ritmo')?.filas[0]
  if (rit) filas.push({ id: 'ritmo', rotulo: 'Ritmo andando', sub: 'piezas por minuto', ...dosLados(rit.a, rit.b), unidad: 'pz/min', dec: 1, gan: ladoDe(rit.ganador, hoy) })
  const mic = kpi('micro')?.filas[0]
  if (mic) filas.push({ id: 'micro', rotulo: 'Micro detención', sub: 'minutos por hora · menos gana', ...dosLados(mic.a, mic.b), unidad: 'min/h', dec: 1, gan: ladoDe(mic.ganador, hoy) })
  const arr = kpi('arranque')
  if (arr && arr.filas.length >= 2) {
    const [ini, uh] = arr.filas as [typeof arr.filas[number], typeof arr.filas[number]]
    const t = (x: number | null, y: number | null) => `${x != null ? Math.round(x).toLocaleString('es-CL') : '—'} min · ${y != null && !enCurso ? Math.round(y).toLocaleString('es-CL') : '—'} pz`
    filas.push({
      id: 'arranque', rotulo: 'Arranque y cierre', sub: enCurso ? 'el cierre se juega al final' : 'minutos a la 1.ª pieza y piezas de la última hora',
      ...dosLados(enCurso ? null : uh.a, enCurso ? null : uh.b), ...txtLados(t(ini.a, uh.a), t(ini.b, uh.b)), unidad: 'pz', dec: 0, gan: ladoDe(arr.ganador, hoy),
    })
  }

  const puestos = m.puestos
  if (puestos.length) {
    const gp = puestos.map((p) => ladoDe(p.ganador, hoy))
    if (compacto) {
      const pc = gp.filter((g) => g === 'c').length
      const pr = gp.filter((g) => g === 'r').length
      filas.push({
        id: 'alim', rotulo: 'Alimentación', sub: 'puestos ganados', c: pc, r: pr, ...txtLados(`${pc} ${pc === 1 ? 'punto' : 'puntos'}`, `${pr} ${pr === 1 ? 'punto' : 'puntos'}`),
        unidad: 'pt', dec: 0, gan: enCurso ? 'pend' : pc > pr ? 'c' : pr > pc ? 'r' : 'empate',
      })
    } else {
      puestos.forEach((p, i) => filas.push({
        id: `alim-${p.clave}`, rotulo: `Alimentación ${p.etiqueta}`, sub: enCurso ? 'se compara al cierre' : `${e.unidad ?? 'puestos'} con pieza / tiempo andando`,
        ...dosLados(p.a, p.b), unidad: '%', dec: 0, gan: enCurso ? 'pend' : gp[i]!, puesto: p.etiqueta,
      }))
    }
  }

  const v = (eq: EquipoId) => lados[eq]?.v90 ?? null
  filas.push({ id: 'sostenida', rotulo: 'Minutos a buen ritmo', sub: '≥ 90 % de lo esperado · sin punto', c: v('cardenas'), r: v('rebolledo'), unidad: 'min', dec: 0, gan: 'info' })
  return filas
}

/** Puntos de cada equipo: los oficiales con el turno cerrado y, en curso, solo lo ya decidido (provisional). */
export function puntajeRiel(d: DatosDuelo, filas: readonly FilaRiel[]): { c: number; r: number; pendientes: number; provisional: boolean } | null {
  const m = d.marcador
  if (!m || m.sinDuelo) return null
  if (d.hoy.cerrado) {
    return d.hoy.equipo === 'cardenas'
      ? { c: m.puntosA, r: m.puntosB, pendientes: 0, provisional: false }
      : { c: m.puntosB, r: m.puntosA, pendientes: 0, provisional: false }
  }
  const puntuables = filas.filter((f) => f.id !== 'sostenida')
  return {
    c: puntuables.filter((f) => f.gan === 'c').length,
    r: puntuables.filter((f) => f.gan === 'r').length,
    pendientes: puntuables.filter((f) => f.gan === 'pend').length,
    provisional: true,
  }
}

/** Filas del KPI a KPI cuando el turno que se mira corre solo (la noche abre la jornada): su valor y, en gris, su promedio. */
export function filasSinRival(d: DatosDuelo, lados: Record<EquipoId, LadoEje | null>, promedioCarrera: number | null): FilaRiel[] {
  const h = d.hoy
  const mio = lados[h.equipo]
  const filas: FilaRiel[] = [
    { id: 'carrera', rotulo: 'Carrera', sub: 'hechas contra su promedio a esta hora', c: h.piezas, r: promedioCarrera, unidad: 'pz', dec: 0, gan: 'sin' },
    { id: 'ritmo', rotulo: 'Ritmo andando', sub: 'piezas por minuto', c: h.ritmo, r: null, unidad: 'pz/min', dec: 1, gan: 'sin' },
    { id: 'micro', rotulo: 'Micro detención', sub: 'minutos por hora', c: h.microMinH, r: null, unidad: 'min/h', dec: 1, gan: 'sin' },
    { id: 'arranque', rotulo: 'Arranque', sub: 'minutos hasta la 1.ª pieza', c: h.arranqueMin, r: null, unidad: 'min', dec: 0, gan: 'sin' },
    ...h.puestos.map((p): FilaRiel => ({ id: `alim-${p.clave}`, rotulo: `Alimentación ${p.etiqueta}`, sub: 'en vivo', c: p.llenado, r: null, unidad: '%', dec: 0, gan: 'sin', puesto: p.etiqueta })),
    { id: 'sostenida', rotulo: 'Minutos a buen ritmo', sub: '≥ 90 % de lo esperado', c: mio?.v90 ?? null, r: null, unidad: 'min', dec: 0, gan: 'sin' },
  ]
  return filas
}

// ── Riel: semana, mes y jornadas ─────────────────────────────────────────────

export interface PeriodoRiel {
  etiqueta: string
  /** Jornadas ganadas por Cárdenas y Rebolledo. */
  jc: number
  jr: number
  /** Puntos. */
  pc: number
  pr: number
}

/** Semana y mes de la jornada que se mira: jornadas ganadas y puntos de cada equipo. */
export function periodosRiel(d: DatosDuelo): { semana: PeriodoRiel; mes: PeriodoRiel } {
  const de = (tipo: 'semana' | 'mes', clave: string, etiqueta: string): PeriodoRiel => {
    const p = marcadorDePeriodo(d.duelos, tipo, clave, d.hoyKey)
    return { etiqueta, jc: p.ganados.cardenas, jr: p.ganados.rebolledo, pc: p.puntos.cardenas, pr: p.puntos.rebolledo }
  }
  const lunes = lunesDe(d.hoyKey)
  const mes = marcadorDePeriodo(d.duelos, 'mes', d.hoyKey.slice(0, 7), d.hoyKey).etiqueta.split(' ')[0] ?? ''
  return {
    semana: de('semana', lunes, `Semana ${semanaIso(lunes)}`),
    mes: de('mes', d.hoyKey.slice(0, 7), mes.charAt(0).toUpperCase() + mes.slice(1)),
  }
}

export interface FilaJornada {
  jornada: string
  noche: { eq: EquipoId; pz: number } | null
  dia: { eq: EquipoId; pz: number } | null
  /** Puntos de cada equipo (Cárdenas, Rebolledo) cuando la jornada está jugada. */
  puntos: { c: number; r: number } | null
  ganador: EquipoId | 'empate' | null
  /** Diferencia de piezas a favor del ganador. */
  dif: number | null
  /** «noche en curso», «día en curso», «día por jugar»: la jornada que aún no se cierra. */
  vivo: string | null
}

/** Las jornadas del mes de la que se mira: la más nueva primero. Incluye la jornada en curso o por jugar. */
export function filasJornadas(d: DatosDuelo): FilaJornada[] {
  const mes = d.hoyKey.slice(0, 7)
  const porJornada = new Map<string, typeof d.duelos>()
  for (const x of d.duelos) {
    if (!x.resumen.jornada.startsWith(mes)) continue
    porJornada.set(x.resumen.jornada, [...(porJornada.get(x.resumen.jornada) ?? []), x])
  }
  const filas: FilaJornada[] = []
  for (const [jornada, xs] of porJornada) {
    const n = xs.find((x) => x.resumen.esNoche)
    const dia = xs.find((x) => !x.resumen.esNoche)
    if (!n || !dia) continue
    const m = n.marcador
    if (!m || m.sinDuelo) continue
    const puntos = n.resumen.equipo === 'cardenas' ? { c: m.puntosA, r: m.puntosB } : { c: m.puntosB, r: m.puntosA }
    const ganador = m.puntosA === m.puntosB ? 'empate' : m.puntosA > m.puntosB ? n.resumen.equipo : dia.resumen.equipo
    const dn = n.resumen.piezas - dia.resumen.piezas
    filas.push({
      jornada, noche: { eq: n.resumen.equipo, pz: n.resumen.piezas }, dia: { eq: dia.resumen.equipo, pz: dia.resumen.piezas },
      puntos, ganador, dif: ganador === 'empate' ? 0 : ganador === n.resumen.equipo ? dn : -dn, vivo: null,
    })
  }
  filas.sort((a, b) => (a.jornada < b.jornada ? 1 : a.jornada > b.jornada ? -1 : 0))
  const h = d.hoy
  if (!h.cerrado || d.esperando) {
    const rival = d.rival
    const mio = { eq: h.equipo, pz: h.piezas }
    const suyo = rival ? { eq: rival.equipo, pz: rival.piezas } : null
    filas.unshift({
      jornada: d.hoyKey,
      noche: h.esNoche ? mio : suyo,
      dia: h.esNoche ? suyo : mio,
      puntos: null, ganador: null, dif: null,
      vivo: h.cerrado ? 'día por jugar' : h.esNoche ? 'noche en curso' : 'día en curso',
    })
  }
  return filas
}

// ── Semana a semana ──────────────────────────────────────────────────────────

export interface SemanaPC {
  lunes: string
  /** «S44 · 26/10». */
  etiqueta: string
  cardenas: PromedioSemana | null
  rebolledo: PromedioSemana | null
  /** Jornadas ganadas en la semana. */
  jc: number
  jr: number
  vigente: boolean
}

/** Las últimas semanas con turnos cerrados: piezas por turno de cada equipo y jornadas ganadas. */
export function semanasPC(d: DatosDuelo, max = 4): SemanaPC[] {
  const sem: PuntoSemana[] = d.tendencia.slice(-max)
  return sem.map((s) => {
    const p = marcadorDePeriodo(d.duelos, 'semana', s.lunes, d.hoyKey)
    return {
      lunes: s.lunes, etiqueta: `S${semanaIso(s.lunes)} · ${s.lunes.slice(8, 10)}/${s.lunes.slice(5, 7)}`,
      cardenas: s.equipos.cardenas, rebolledo: s.equipos.rebolledo,
      jc: p.ganados.cardenas, jr: p.ganados.rebolledo, vigente: p.vigente,
    }
  })
}

/** Escala Y de «Semana a semana»: ventana de miles que envuelve los promedios (nunca se vende como si partiera de cero). */
export function escalaSemanas(semanas: readonly SemanaPC[]): { lo: number; hi: number } {
  const vs = semanas.flatMap((s) => [s.cardenas?.prom, s.rebolledo?.prom]).filter((v): v is number => v != null)
  if (!vs.length) return { lo: 0, hi: 1000 }
  let lo = Math.floor((Math.min(...vs) - 400) / 1000) * 1000
  let hi = Math.ceil((Math.max(...vs) + 400) / 1000) * 1000
  if (hi - lo < 3000) hi = lo + 3000
  lo = Math.max(0, lo)
  hi = Math.max(hi, lo + 3000)
  return { lo, hi }
}
