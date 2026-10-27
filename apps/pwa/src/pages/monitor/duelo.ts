/**
 * Lógica PURA del «Duelo de equipos» del monitor de turno v2 (27-10-2026).
 *
 * Plan: ARIA_MANTENIMIENTO_PLANTA/docs/PLAN_DUELO_EQUIPOS.md. Los dos equipos de
 * producción rotan día/noche cada semana ISO y cubren Eviscerado y Filete a la
 * vez. Acá vive todo lo que decide quién va ganando; la UI (`DueloV2.tsx`) solo
 * lo dibuja.
 *
 * ── Reglas que este módulo hace cumplir ─────────────────────────────────────
 *  1. El equipo de cada turno sale de la paridad de la semana ISO contra un ancla
 *     (semana del 26-10-2026: DÍA = rebolledo, NOCHE = cardenas) y de una
 *     corrección manual por turno. Día o noche se decide por el INICIO
 *     PLANIFICADO de Shoplogix (05:00–16:59 = día), no por el nombre del turno.
 *  2. Cada turno cerrado se mide contra el último turno del MISMO horario del
 *     OTRO equipo (la semana anterior). Esa es la «tabla justa»: noche contra
 *     noche, día contra día.
 *  3. Un punto por KPI ganado (carrera, ritmo andando, micro detenciones,
 *     arranque y cierre) y un punto por cada puesto de alimentación ganado.
 *  4. Las fallas técnicas NO restan puntos: se descuentan del tiempo comparable y
 *     sus piezas (minutos de falla × ritmo andando del propio turno) se SUMAN al
 *     total del equipo en la carrera. Van al bloque «Costo de Mantención».
 *  5. Un turno que dispone de menos del 60 % de los minutos del rival es «sin
 *     duelo»: no da ni quita puntos.
 *  6. Un dato que falta es «sin dato», nunca un cero: no se inventa para decidir.
 *
 * Las horas de planta de los ISO del monitor son wall-clock sellados como UTC.
 */
import type {
  ForecastHistoryShift, PublicMonitorLive, RivalCurve, ShiftDuelo, ShiftStat,
} from '@/services/shoplogix/publicShiftMonitor.service'
import type { PacePoint } from '@/services/shoplogix/monitorCompare'
import { desdePrimeraPieza } from '@/services/shoplogix/monitorActividad'
import { numeroDeTurno } from './aporteHistorico'
import { lunesDe, repartoDeTurno } from './repartoSemanal'
import { etiquetaMaquina, normalizar, unidadDeMaquinas } from './ritmoVivo'

// ── Equipos ──────────────────────────────────────────────────────────────────

export type EquipoId = 'rebolledo' | 'cardenas'
export const EQUIPOS: readonly EquipoId[] = ['rebolledo', 'cardenas']

/** Lunes de la semana ISO del 26-10-2026: ahí el turno de DÍA es del equipo Rebolledo. */
export const ANCLA_LUNES = '2026-10-26'
/** Debajo de esta fracción de los minutos del rival, el turno es «sin duelo». */
export const FRACCION_SIN_DUELO = 0.6

const DIA_MS = 86_400_000

export const otroEquipo = (e: EquipoId): EquipoId => (e === 'rebolledo' ? 'cardenas' : 'rebolledo')

export const esEquipoId = (v: unknown): v is EquipoId => v === 'rebolledo' || v === 'cardenas'

/** HH:MM de inicio planificado → ¿noche? Entre 05:00 y 16:59 es día. null si la hora no se entiende. */
export function esNocheDesdeHora(hhmm: string | null | undefined): boolean | null {
  const m = /^(\d{1,2}):(\d{2})/.exec(hhmm ?? '')
  if (!m) return null
  const h = Number(m[1])
  if (!Number.isFinite(h) || h < 0 || h > 23) return null
  return !(h >= 5 && h < 17)
}

/** Semanas ISO que separan la semana del dateKey de la semana ancla (negativo = antes). */
export function semanasDesdeAncla(dateKey: string): number {
  const lunes = Date.parse(`${lunesDe(dateKey)}T12:00:00Z`)
  const ancla = Date.parse(`${ANCLA_LUNES}T12:00:00Z`)
  if (!Number.isFinite(lunes)) return 0
  return Math.round((lunes - ancla) / (7 * DIA_MS))
}

/**
 * El equipo que hizo un turno. `shiftDocId` = `YYYY-MM-DD_<turno>`; la fecha manda,
 * no el nombre. Una corrección manual (`overrides[shiftDocId]`) gana a la rotación.
 */
export function equipoDelTurno(
  shiftDocId: string,
  esNoche: boolean,
  overrides?: Readonly<Record<string, EquipoId>> | null,
): EquipoId {
  const corregido = overrides?.[shiftDocId]
  if (esEquipoId(corregido)) return corregido
  const diaEsRebolledo = ((semanasDesdeAncla(shiftDocId.slice(0, 10)) % 2) + 2) % 2 === 0
  return esNoche === diaEsRebolledo ? 'cardenas' : 'rebolledo'
}

/** ¿Hay una corrección manual que cambie lo que diría la rotación? */
export function equipoCorregido(
  shiftDocId: string,
  esNoche: boolean,
  overrides?: Readonly<Record<string, EquipoId>> | null,
): boolean {
  return equipoDelTurno(shiftDocId, esNoche, overrides) !== equipoDelTurno(shiftDocId, esNoche)
}

export type NombresEquipos = Partial<Record<EquipoId, string>>

/** Nombres de fábrica: Eviscerado (carros, Baader 142) trae los supervisores; el resto, «Grupo 1/2». */
export function nombresPorDefecto(unidad: 'carros' | 'silletas' | null): NombresEquipos {
  return unidad === 'carros' ? { rebolledo: 'Francisco Rebolledo', cardenas: 'Cristian Cárdenas' } : {}
}

/** El nombre completo del equipo; sin nombre cargado, «Grupo 1» (rebolledo) / «Grupo 2» (cardenas). */
export function nombreEquipo(id: EquipoId, nombres?: NombresEquipos | null): string {
  const n = nombres?.[id]?.trim()
  return n || (id === 'rebolledo' ? 'Grupo 1' : 'Grupo 2')
}

/** Para espacios chicos: el último apellido («Francisco Rebolledo» → «Rebolledo»); «Grupo 1» queda igual. */
export function nombreCorto(id: EquipoId, nombres?: NombresEquipos | null): string {
  const n = nombreEquipo(id, nombres)
  if (/^grupo\s/i.test(n)) return n
  const partes = n.split(/\s+/)
  return partes[partes.length - 1] ?? n
}

export interface ConfigDuelo {
  equipos?: NombresEquipos
  overrides?: Record<string, EquipoId>
}

/** Nombres efectivos: los cargados por el admin sobre los de fábrica de la línea. */
export function nombresEfectivos(config: ConfigDuelo | null | undefined, unidad: 'carros' | 'silletas' | null): NombresEquipos {
  const base = nombresPorDefecto(unidad)
  const cargados = config?.equipos ?? {}
  return {
    rebolledo: cargados.rebolledo?.trim() || base.rebolledo,
    cardenas: cargados.cardenas?.trim() || base.cardenas,
  }
}

// ── Ciclo de dos semanas ─────────────────────────────────────────────────────

/** El ciclo (2 semanas: cada equipo hace día y noche) al que pertenece una fecha. */
export function cicloDe(dateKey: string): { indice: number; inicio: string; fin: string } {
  const indice = Math.floor(semanasDesdeAncla(dateKey) / 2)
  const dia = (n: number) => new Date(Date.parse(`${ANCLA_LUNES}T12:00:00Z`) + n * DIA_MS).toISOString().slice(0, 10)
  return { indice, inicio: dia(indice * 14), fin: dia(indice * 14 + 13) }
}

// ── Resumen de un turno ──────────────────────────────────────────────────────

export interface PuestoTurno {
  /** Clave de cruce (nombre normalizado) y etiqueta corta («Ev 1»). */
  clave: string
  etiqueta: string
  /** Llenado 0–100; null = sin dato. */
  llenado: number | null
}

export interface ResumenTurno {
  shiftDocId: string
  dateKey: string
  shiftId: string
  esNoche: boolean
  equipo: EquipoId
  cerrado: boolean
  piezas: number
  /** Minutos disponibles = ventana − convenio − fallas técnicas (minutos de LÍNEA). */
  dispMin: number | null
  fallasN: number
  fallaMin: number
  /** Piezas que la falla técnica le quitó al equipo: minutos de falla × ritmo andando del propio turno. */
  piezasMant: number
  /** pz/min sobre minutos con piezas. */
  ritmo: number | null
  /** Minutos de micro detención por hora disponible, por máquina. */
  microMinH: number | null
  arranqueMin: number | null
  ultimaHoraPz: number | null
  puestos: PuestoTurno[]
}

interface EntradaResumen {
  shiftDocId: string
  dateKey: string
  shiftId: string
  esNoche: boolean
  cerrado: boolean
  piezas: number
  stat: ShiftStat
  duelo: Pick<ShiftDuelo, 'ini' | 'uh' | 'mic' | 'alim'>
  overrides?: Readonly<Record<string, EquipoId>> | null
}

function armarResumen(e: EntradaResumen): ResumenTurno {
  const rp = repartoDeTurno(e.stat)
  const fallaMin = rp.min.mantencion
  const win = e.stat.windowMin
  const dispMin = win != null ? Math.max(0, win - (e.stat.plannedMin ?? 0) - fallaMin) : null
  const nMaq = Math.max(1, e.duelo.alim.length)
  return {
    shiftDocId: e.shiftDocId,
    dateKey: e.dateKey,
    shiftId: e.shiftId,
    esNoche: e.esNoche,
    equipo: equipoDelTurno(e.shiftDocId, e.esNoche, e.overrides),
    cerrado: e.cerrado,
    piezas: e.piezas,
    dispMin,
    fallasN: rp.causas.filter((c) => c.dueno === 'mantencion').reduce((a, c) => a + c.count, 0),
    fallaMin,
    piezasMant: rp.pz.mantencion,
    ritmo: e.stat.producingMin > 0 ? e.piezas / e.stat.producingMin : null,
    microMinH: e.duelo.mic != null && dispMin != null && dispMin > 0 ? e.duelo.mic / nMaq / (dispMin / 60) : null,
    arranqueMin: e.duelo.ini ?? null,
    ultimaHoraPz: e.duelo.uh ?? null,
    puestos: e.duelo.alim.map((p) => ({ clave: normalizar(p.n), etiqueta: etiquetaMaquina(p.n), llenado: p.f ?? null })),
  }
}

/** Un turno cerrado de `shiftStats`; null si el backend todavía no lo rearmó con los datos del duelo. */
export function resumenDeStat(t: ShiftStat, overrides?: Readonly<Record<string, EquipoId>> | null): ResumenTurno | null {
  const esNoche = esNocheDesdeHora(t.duelo?.h0)
  if (!t.duelo || esNoche == null) return null
  return armarResumen({
    shiftDocId: t.shiftDocId, dateKey: t.dateKey, shiftId: t.shiftId, esNoche, cerrado: true,
    piezas: t.total || 0, stat: t, duelo: t.duelo, overrides,
  })
}

/** Llenado de un puesto: piezas ÷ (esperado × minutos andando), tope 100. Misma fórmula que el backend. */
export function llenadoDePuesto(piezas: number, targetCpm: number | null | undefined, uptimeSec: number | null | undefined): number | null {
  if (!(targetCpm != null && targetCpm > 0) || !(uptimeSec != null && uptimeSec > 0)) return null
  return Math.min(100, Math.round((100 * piezas) / (targetCpm * (uptimeSec / 60))))
}

/**
 * El turno que se está mirando, desde su `live`. `piezas` es el contador que la
 * pantalla muestra (el pulso puede ir por delante del corte); `cerrado` es lo que
 * la pantalla decide (turno terminado o ya no vigente).
 */
export function resumenDeLive(args: {
  shiftDocId: string
  live: PublicMonitorLive
  piezas?: number
  cerrado: boolean
  overrides?: Readonly<Record<string, EquipoId>> | null
}): ResumenTurno | null {
  const { shiftDocId, live, cerrado, overrides } = args
  const esNoche = esNocheDesdeHora(live.scheduledStart?.slice(11, 16))
  if (esNoche == null) return null
  const tb = live.timeBreakdown
  const piezas = args.piezas ?? live.totalPieces ?? 0
  const stat: ShiftStat = {
    shiftDocId, dateKey: shiftDocId.slice(0, 10), shiftId: shiftDocId.slice(11),
    total: piezas,
    producingMin: tb?.producingMin ?? 0,
    windowMin: tb?.windowMin ?? null,
    plannedMin: tb?.plannedMin ?? null,
    recoverableMin: tb?.recoverableMin ?? null,
    recoverable: (tb?.recoverable ?? []).map((c) => ({ reason: c.reason, min: c.min, count: c.count })),
  }
  const serie = desdePrimeraPieza(live.series)
  const primera = serie.find((p) => (p.pieces ?? 0) > 0)
  const ini = primera?.t && live.scheduledStart
    ? Math.max(0, Math.round((Date.parse(primera.t) - Date.parse(live.scheduledStart)) / 60_000))
    : undefined
  const finMs = Date.parse(live.plannedEnd ?? live.scheduledEnd ?? '')
  /* La última hora solo existe cuando el turno cerró: antes, «piezas de la última hora» no es un dato. */
  const uh = cerrado && Number.isFinite(finMs)
    ? (live.series ?? [])
        .filter((p) => { const t = Date.parse(p.t); return t >= finMs - 3_600_000 && t < finMs })
        .reduce((a, p) => a + (p.pieces || 0), 0)
    : undefined
  const mant = live.mantencion?.porMaquina
  const mic = mant ? mant.reduce((a, m) => a + (m.microMin || 0), 0) : undefined
  return armarResumen({
    shiftDocId, dateKey: stat.dateKey, shiftId: stat.shiftId, esNoche, cerrado, piezas, stat,
    duelo: {
      ...(ini != null ? { ini } : {}),
      ...(uh != null ? { uh } : {}),
      ...(mic != null ? { mic } : {}),
      alim: live.machines.map((m) => ({ n: m.name, ...llenadoOpcional(llenadoDePuesto(m.pieces, m.targetCpm, m.uptimeSec)) })),
    },
    overrides,
  })
}

const llenadoOpcional = (f: number | null): { f?: number } => (f != null ? { f } : {})

// ── Comparar dos turnos ──────────────────────────────────────────────────────

export type Resultado = 'a' | 'b' | 'empate' | 'pendiente' | 'sin-dato'
export type KpiId = 'carrera' | 'ritmo' | 'micro' | 'arranque'

export interface FilaKpi {
  rotulo: string
  a: number | null
  b: number | null
  unidad: string
  decimales: number
  ganador: Resultado
}

export interface KpiMarcador {
  id: KpiId
  rotulo: string
  /** Una línea para explicar cómo se mide. */
  nota: string
  filas: FilaKpi[]
  ganador: Resultado
}

export interface PuestoMarcador {
  clave: string
  etiqueta: string
  a: number | null
  b: number | null
  ganador: Resultado
}

export interface Marcador {
  sinDuelo: boolean
  motivo: string | null
  /** Los KPI de cabecera (carrera, ritmo, micro, arranque y cierre). */
  kpis: KpiMarcador[]
  puestos: PuestoMarcador[]
  puntosA: number
  puntosB: number
  /** Cuántos puntos hay en juego (4 KPI + los puestos con dato en ambos). */
  enJuego: number
  /** Quién gana el turno: sólo con el turno de A cerrado y puntos decididos. */
  ganador: 'a' | 'b' | 'empate' | 'pendiente' | 'sin-duelo'
}

function comparar(a: number | null | undefined, b: number | null | undefined, mejor: 'mayor' | 'menor', decimales = 0): Resultado {
  if (a == null || b == null || !Number.isFinite(a) || !Number.isFinite(b)) return 'sin-dato'
  const f = 10 ** decimales
  const ra = Math.round(a * f)
  const rb = Math.round(b * f)
  if (ra === rb) return 'empate'
  return (mejor === 'mayor' ? ra > rb : ra < rb) ? 'a' : 'b'
}

/** Arranque y cierre: gana quien gana los dos; si uno empata decide el otro; si se reparten, empate. */
function combinar(x: Resultado, y: Resultado): Resultado {
  if (x === 'sin-dato' || y === 'sin-dato') return 'sin-dato'
  if (x === 'pendiente' || y === 'pendiente') return 'pendiente'
  if (x === y) return x
  if (x === 'empate') return y
  if (y === 'empate') return x
  return 'empate'
}

/**
 * Compara el turno A (el que se mira) contra B (su rival del mismo horario).
 *
 * `carreraEnVivo` reemplaza la carrera final por piezas a igual tiempo
 * transcurrido: con el turno de A todavía corriendo, comparar su parcial contra
 * el total del rival sería injusto. En ese caso el punto es provisorio.
 */
export function compararTurnos(a: ResumenTurno, b: ResumenTurno, opciones?: { carreraEnVivo?: { a: number; b: number } | null }): Marcador {
  const cerrado = a.cerrado
  if (a.dispMin != null && b.dispMin != null && cerrado) {
    const chico = Math.min(a.dispMin, b.dispMin)
    const grande = Math.max(a.dispMin, b.dispMin)
    if (grande > 0 && chico / grande < FRACCION_SIN_DUELO) {
      return { sinDuelo: true, motivo: `Uno de los turnos tuvo menos del ${Math.round(FRACCION_SIN_DUELO * 100)} % de los minutos del otro`, kpis: [], puestos: [], puntosA: 0, puntosB: 0, enJuego: 0, ganador: 'sin-duelo' }
    }
  }

  const enVivo = !cerrado ? opciones?.carreraEnVivo ?? null : null
  const carreraA = enVivo ? enVivo.a : a.piezas + a.piezasMant
  const carreraB = enVivo ? enVivo.b : b.piezas + b.piezasMant
  const carrera: KpiMarcador = {
    id: 'carrera',
    rotulo: 'Carrera',
    nota: enVivo
      ? 'Piezas a igual tiempo de turno. El punto se confirma al cierre, sumando las piezas que las fallas técnicas le quitaron a cada equipo.'
      : 'Piezas del turno más las que las fallas técnicas le quitaron al equipo.',
    filas: [{ rotulo: enVivo ? 'Piezas a esta hora' : 'Piezas con Mantención sumada', a: carreraA, b: carreraB, unidad: 'pz', decimales: 0, ganador: comparar(carreraA, carreraB, 'mayor') }],
    ganador: !cerrado && !enVivo ? 'pendiente' : comparar(carreraA, carreraB, 'mayor'),
  }
  const ritmo: KpiMarcador = {
    id: 'ritmo',
    rotulo: 'Ritmo andando',
    nota: 'Piezas por minuto sobre los minutos con piezas.',
    filas: [{ rotulo: 'Ritmo', a: a.ritmo, b: b.ritmo, unidad: 'pz/min', decimales: 1, ganador: comparar(a.ritmo, b.ritmo, 'mayor', 1) }],
    ganador: comparar(a.ritmo, b.ritmo, 'mayor', 1),
  }
  const micro: KpiMarcador = {
    id: 'micro',
    rotulo: 'Menos micro detenciones',
    nota: 'Minutos de micro detención por hora disponible, por máquina (clasificación oficial de Shoplogix).',
    filas: [{ rotulo: 'Micro detención', a: a.microMinH, b: b.microMinH, unidad: 'min/h', decimales: 1, ganador: comparar(a.microMinH, b.microMinH, 'menor', 1) }],
    ganador: comparar(a.microMinH, b.microMinH, 'menor', 1),
  }
  const ganaArranque = comparar(a.arranqueMin, b.arranqueMin, 'menor')
  const ganaCierre: Resultado = !cerrado ? 'pendiente' : comparar(a.ultimaHoraPz, b.ultimaHoraPz, 'mayor')
  const arranque: KpiMarcador = {
    id: 'arranque',
    rotulo: 'Arranque y cierre',
    nota: 'Minutos hasta la primera pieza y piezas de la última hora. Gana quien gana los dos.',
    filas: [
      { rotulo: 'Hasta la primera pieza', a: a.arranqueMin, b: b.arranqueMin, unidad: 'min', decimales: 0, ganador: ganaArranque },
      { rotulo: 'Piezas de la última hora', a: a.ultimaHoraPz, b: b.ultimaHoraPz, unidad: 'pz', decimales: 0, ganador: ganaCierre },
    ],
    ganador: combinar(ganaArranque, ganaCierre),
  }

  const puestos: PuestoMarcador[] = []
  for (const pa of a.puestos) {
    const pb = b.puestos.find((x) => x.clave === pa.clave)
    if (!pb) continue
    puestos.push({ clave: pa.clave, etiqueta: pa.etiqueta, a: pa.llenado, b: pb.llenado, ganador: comparar(pa.llenado, pb.llenado, 'mayor') })
  }

  const kpis = [carrera, ritmo, micro, arranque]
  const todos: Resultado[] = [...kpis.map((k) => k.ganador), ...puestos.map((p) => p.ganador)]
  const puntosA = todos.filter((r) => r === 'a').length
  const puntosB = todos.filter((r) => r === 'b').length
  const enJuego = todos.filter((r) => r !== 'sin-dato').length
  return {
    sinDuelo: false, motivo: null, kpis, puestos, puntosA, puntosB, enJuego,
    ganador: !cerrado ? 'pendiente' : puntosA === puntosB ? 'empate' : puntosA > puntosB ? 'a' : 'b',
  }
}

// ── Curvas ───────────────────────────────────────────────────────────────────

/** Piezas acumuladas a los `min` minutos (interpolado); pasado el final, el total: ese turno ya terminó. */
export function piezasAlMinuto(curva: readonly PacePoint[], min: number): number | null {
  if (!curva.length) return null
  if (min <= 0) return 0
  const primero = curva[0]!
  if (min < primero.minutes) return primero.minutes > 0 ? (min / primero.minutes) * primero.pieces : 0
  for (let i = 0; i < curva.length - 1; i++) {
    const x = curva[i]!
    const y = curva[i + 1]!
    if (min >= x.minutes && min <= y.minutes) return y.minutes === x.minutes ? y.pieces : x.pieces + ((min - x.minutes) / (y.minutes - x.minutes)) * (y.pieces - x.pieces)
  }
  return curva[curva.length - 1]!.pieces
}

/** `{m, p}` del backend → puntos; si arranca con tramos vacíos se corre el eje al primer tramo con piezas. */
export function curvaDeForecast(curve: ReadonlyArray<{ m: number; p: number }> | null | undefined): PacePoint[] {
  const pts = (curve ?? []).filter((x) => Number.isFinite(x.m) && Number.isFinite(x.p)).map((x) => ({ minutes: x.m, pieces: x.p }))
  const i = pts.findIndex((x) => x.pieces > 0)
  if (i <= 0) return pts
  const origen = pts[i - 1]!.minutes
  return pts.slice(i).map((x) => ({ minutes: Math.max(1, x.minutes - origen), pieces: x.pieces }))
}

export interface BandaRival {
  /** Promedio, mínimo y máximo de los turnos del rival, cada 15 min. */
  media: PacePoint[]
  min: PacePoint[]
  max: PacePoint[]
  turnos: number
}

/** Promedio y rango de varias curvas del mismo horario. Con menos de 2 no hay banda. */
export function bandaDeCurvas(curvas: ReadonlyArray<readonly PacePoint[]>, pasoMin = 15): BandaRival | null {
  const validas = curvas.filter((c) => c.length >= 2)
  if (validas.length < 2) return null
  const fin = Math.max(...validas.map((c) => c[c.length - 1]!.minutes))
  const media: PacePoint[] = []
  const min: PacePoint[] = []
  const max: PacePoint[] = []
  for (let m = pasoMin; m <= fin + pasoMin - 1; m += pasoMin) {
    const t = Math.min(m, fin)
    const vs = validas.map((c) => piezasAlMinuto(c, t) ?? 0)
    media.push({ minutes: t, pieces: vs.reduce((a, v) => a + v, 0) / vs.length })
    min.push({ minutes: t, pieces: Math.min(...vs) })
    max.push({ minutes: t, pieces: Math.max(...vs) })
    if (t === fin) break
  }
  return { media, min, max, turnos: validas.length }
}

// ── El duelo completo ────────────────────────────────────────────────────────

export interface TurnoDuelo {
  resumen: ResumenTurno
  rival: ResumenTurno | null
  marcador: Marcador | null
}

/** La clave de «mismo horario»: mismo turno por nombre y mismo lado del día. */
const mismoHorario = (x: ResumenTurno, y: ResumenTurno) =>
  x.esNoche === y.esNoche && numeroDeTurno(x.shiftId) === numeroDeTurno(y.shiftId)

const antes = (x: ResumenTurno, y: ResumenTurno) =>
  x.dateKey < y.dateKey || (x.dateKey === y.dateKey && x.shiftDocId < y.shiftDocId)

/** El último turno anterior del mismo horario hecho por el OTRO equipo. */
export function rivalDirecto(turno: ResumenTurno, candidatos: readonly ResumenTurno[]): ResumenTurno | null {
  let mejor: ResumenTurno | null = null
  for (const c of candidatos) {
    if (c.shiftDocId === turno.shiftDocId || !mismoHorario(c, turno) || c.equipo === turno.equipo || !antes(c, turno)) continue
    if (!mejor || antes(mejor, c)) mejor = c
  }
  return mejor
}

/** Cada turno cerrado contra su rival directo, en orden cronológico. */
export function duelosDeTurnos(resumenes: readonly ResumenTurno[]): TurnoDuelo[] {
  const orden = [...resumenes].sort((x, y) => (antes(x, y) ? -1 : antes(y, x) ? 1 : 0))
  return orden.map((resumen) => {
    const rival = rivalDirecto(resumen, orden)
    return { resumen, rival, marcador: rival ? compararTurnos(resumen, rival) : null }
  })
}

export interface CicloDuelo {
  inicio: string
  fin: string
  puntos: Record<EquipoId, number>
  /** Turnos ganados / jugados (con duelo) por equipo. */
  ganados: Record<EquipoId, number>
  jugados: Record<EquipoId, number>
  /** El ciclo en curso (el de hoy). */
  vigente: boolean
}

const porEquipo = (v: number): Record<EquipoId, number> => ({ rebolledo: v, cardenas: v })

/** Marcador de un ciclo: los puntos de cada turno cerrado van al equipo que lo hizo. */
export function marcadorDeCiclo(duelos: readonly TurnoDuelo[], indice: number, hoyIndice: number): CicloDuelo {
  const base = Date.parse(`${ANCLA_LUNES}T12:00:00Z`)
  const inicio = new Date(base + indice * 14 * DIA_MS).toISOString().slice(0, 10)
  const fin = new Date(base + (indice * 14 + 13) * DIA_MS).toISOString().slice(0, 10)
  const out: CicloDuelo = { inicio, fin, puntos: porEquipo(0), ganados: porEquipo(0), jugados: porEquipo(0), vigente: indice === hoyIndice }
  for (const d of duelos) {
    if (!d.marcador || d.marcador.sinDuelo || cicloDe(d.resumen.dateKey).indice !== indice) continue
    const e = d.resumen.equipo
    out.puntos[e] += d.marcador.puntosA
    out.jugados[e] += 1
    if (d.marcador.ganador === 'a') out.ganados[e] += 1
  }
  return out
}

export interface Racha {
  actual: number
  mejor: number
}

/** Turnos ganados seguidos por equipo. Un empate o una derrota la corta; un «sin duelo» no cuenta. */
export function rachasPorEquipo(duelos: readonly TurnoDuelo[]): Record<EquipoId, Racha> {
  const out = { rebolledo: { actual: 0, mejor: 0 }, cardenas: { actual: 0, mejor: 0 } }
  for (const d of duelos) {
    const m = d.marcador
    if (!m || m.sinDuelo || m.ganador === 'pendiente') continue
    const r = out[d.resumen.equipo]
    if (m.ganador === 'a') { r.actual += 1; r.mejor = Math.max(r.mejor, r.actual) } else r.actual = 0
  }
  return out
}

export interface RecordTurno {
  id: 'piezas-dia' | 'piezas-noche' | 'ritmo' | 'puntos'
  rotulo: string
  valor: number
  unidad: string
  decimales: number
  equipo: EquipoId
  dateKey: string
}

/** Los mejores marcadores de la ventana publicada (hasta ~40 turnos): lo que hay, sin inventar historia. */
export function recordsDe(duelos: readonly TurnoDuelo[]): RecordTurno[] {
  const out: RecordTurno[] = []
  const mejor = (id: RecordTurno['id'], rotulo: string, unidad: string, decimales: number, valor: (d: TurnoDuelo) => number | null, filtro: (d: TurnoDuelo) => boolean = () => true) => {
    let top: { v: number; d: TurnoDuelo } | null = null
    for (const d of duelos) {
      if (!filtro(d)) continue
      const v = valor(d)
      if (v != null && Number.isFinite(v) && (!top || v > top.v)) top = { v, d }
    }
    if (top) out.push({ id, rotulo, valor: top.v, unidad, decimales, equipo: top.d.resumen.equipo, dateKey: top.d.resumen.dateKey })
  }
  mejor('piezas-dia', 'Más piezas en un turno de día', 'pz', 0, (d) => d.resumen.piezas, (d) => !d.resumen.esNoche)
  mejor('piezas-noche', 'Más piezas en un turno de noche', 'pz', 0, (d) => d.resumen.piezas, (d) => d.resumen.esNoche)
  mejor('ritmo', 'Mejor ritmo andando', 'pz/min', 1, (d) => d.resumen.ritmo)
  mejor('puntos', 'Más puntos en un turno', 'pt', 0, (d) => (d.marcador && !d.marcador.sinDuelo ? d.marcador.puntosA : null))
  return out
}

export interface CostoEquipo {
  turnos: number
  fallasN: number
  fallaMin: number
  piezasPerdidas: number
  /** Minutos de línea por falla; null sin fallas. */
  minPorFalla: number | null
}

/** Lo que las fallas técnicas le quitaron a cada equipo en los turnos dados. */
export function costoMantencion(resumenes: readonly ResumenTurno[]): Record<EquipoId, CostoEquipo> {
  const vacio = (): CostoEquipo => ({ turnos: 0, fallasN: 0, fallaMin: 0, piezasPerdidas: 0, minPorFalla: null })
  const out = { rebolledo: vacio(), cardenas: vacio() }
  for (const r of resumenes) {
    const c = out[r.equipo]
    c.turnos += 1
    c.fallasN += r.fallasN
    c.fallaMin += r.fallaMin
    c.piezasPerdidas += r.piezasMant
  }
  for (const e of EQUIPOS) out[e].minPorFalla = out[e].fallasN > 0 ? out[e].fallaMin / out[e].fallasN : null
  return out
}

export interface CarreraDuelo {
  hoy: PacePoint[]
  fantasma: PacePoint[] | null
  banda: BandaRival | null
  /** Minuto de turno que se compara (el último de hoy). */
  minuto: number
  /** «Hora 2» = segunda hora del turno. */
  hora: number
  hoyPz: number
  fantasmaPz: number | null
  diferencia: number | null
}

export interface DiaNoche {
  equipo: EquipoId
  esNoche: boolean
  shiftDocId: string
  dateKey: string
  curva: PacePoint[]
  total: number
  minuto: number
  hoyPz: number
  rivalPz: number | null
  diferencia: number | null
  /** Hoy y el rival los hizo el mismo equipo (el cambio de semana cae entre los dos turnos). */
  mismoEquipo: boolean
}

export interface DatosDuelo {
  hoy: ResumenTurno
  rival: ResumenTurno | null
  marcador: Marcador | null
  carrera: CarreraDuelo | null
  diaNoche: DiaNoche | null
  ciclo: CicloDuelo
  cicloPrevio: CicloDuelo
  rachas: Record<EquipoId, Racha>
  records: RecordTurno[]
  costo: Record<EquipoId, CostoEquipo>
  /** El turno fue corregido a mano respecto de la rotación. */
  corregido: boolean
  /** Turnos de `shiftStats` ya rearmados con los datos del duelo, sobre el total publicado. */
  listos: { con: number; de: number }
}

export interface EntradaDuelo {
  shiftDocId: string
  live: PublicMonitorLive
  /** El contador que muestra la pantalla. */
  piezas: number
  cerrado: boolean
  /** Curva acumulada de hoy desde la primera pieza (`cumulativeFromStart`). */
  curvaHoy: readonly PacePoint[]
  /** Solo para el turno vigente: el rival del otro horario. */
  rivalCurve?: RivalCurve | null
  stats: readonly ShiftStat[]
  forecast: readonly ForecastHistoryShift[]
  overrides?: Readonly<Record<string, EquipoId>> | null
}

/** Junta todo lo que la tarjeta y la pestaña muestran. null si el turno no trae su hora de inicio. */
export function construirDuelo(e: EntradaDuelo): DatosDuelo | null {
  const hoy = resumenDeLive({ shiftDocId: e.shiftDocId, live: e.live, piezas: e.piezas, cerrado: e.cerrado, overrides: e.overrides })
  if (!hoy) return null

  const deStats = e.stats.map((s) => resumenDeStat(s, e.overrides)).filter((r): r is ResumenTurno => r != null && r.shiftDocId !== hoy.shiftDocId)
  /* Para el ciclo, los récords y el costo, el turno de hoy cuenta si ya cerró. */
  const cerrados = hoy.cerrado ? [...deStats, hoy] : deStats
  const duelos = duelosDeTurnos(cerrados)

  const rival = rivalDirecto(hoy, deStats)
  const curvaFantasma = rival ? e.forecast.find((f) => f.shiftDocId === rival.shiftDocId)?.curve : null
  const fantasma = curvaFantasma ? curvaDeForecast(curvaFantasma) : null
  const curvaHoy = [...e.curvaHoy]
  const minuto = curvaHoy.length ? curvaHoy[curvaHoy.length - 1]!.minutes : 0
  const fantasmaPz = fantasma && fantasma.length ? piezasAlMinuto(fantasma, minuto) : null

  const marcador = rival
    ? compararTurnos(hoy, rival, { carreraEnVivo: !hoy.cerrado && fantasmaPz != null ? { a: hoy.piezas, b: fantasmaPz } : null })
    : null

  /* Banda: los últimos turnos del mismo horario hechos por el equipo rival (excluye hoy). */
  const delRival = e.forecast
    .filter((f) => f.shiftDocId !== hoy.shiftDocId && f.shiftDocId.slice(0, 10) < hoy.dateKey && equipoDelTurno(f.shiftDocId, hoy.esNoche, e.overrides) !== hoy.equipo)
    .sort((x, y) => (x.shiftDocId < y.shiftDocId ? 1 : -1))
    .slice(0, 4)
  const banda = bandaDeCurvas(delRival.map((f) => curvaDeForecast(f.curve)))

  const carrera: CarreraDuelo | null = curvaHoy.length
    ? {
        hoy: curvaHoy, fantasma, banda, minuto, hora: Math.floor(minuto / 60) + 1,
        hoyPz: curvaHoy[curvaHoy.length - 1]!.pieces, fantasmaPz,
        diferencia: fantasmaPz != null ? curvaHoy[curvaHoy.length - 1]!.pieces - fantasmaPz : null,
      }
    : null

  let diaNoche: DiaNoche | null = null
  const rc = e.rivalCurve
  if (rc && rc.curve?.length >= 2) {
    const esNoche = esNocheDesdeHora(rc.h0) ?? !hoy.esNoche
    const curva = rc.curve.map((x) => ({ minutes: x.m, pieces: x.p }))
    const rivalPz = piezasAlMinuto(curva, minuto)
    const equipo = equipoDelTurno(rc.shiftDocId, esNoche, e.overrides)
    diaNoche = {
      equipo, esNoche, shiftDocId: rc.shiftDocId, dateKey: rc.dateKey, curva, total: rc.total, minuto,
      hoyPz: hoy.piezas, rivalPz, diferencia: rivalPz != null && curvaHoy.length ? curvaHoy[curvaHoy.length - 1]!.pieces - rivalPz : null,
      mismoEquipo: equipo === hoy.equipo,
    }
  }

  const ciclo = cicloDe(hoy.dateKey)
  const hoyIndice = ciclo.indice
  const delCiclo = cerrados.filter((r) => cicloDe(r.dateKey).indice === hoyIndice)
  return {
    hoy, rival, marcador, carrera, diaNoche,
    ciclo: marcadorDeCiclo(duelos, hoyIndice, hoyIndice),
    cicloPrevio: marcadorDeCiclo(duelos, hoyIndice - 1, hoyIndice),
    rachas: rachasPorEquipo(duelos),
    records: recordsDe(duelos),
    costo: costoMantencion(hoy.cerrado ? delCiclo : [...delCiclo, hoy]),
    corregido: equipoCorregido(hoy.shiftDocId, hoy.esNoche, e.overrides),
    listos: { con: deStats.length, de: e.stats.length },
  }
}

/** Unidad de alimentación de la línea, para el rótulo («carros» / «silletas»). */
export const unidadDeLinea = (live: Pick<PublicMonitorLive, 'machines'>) => unidadDeMaquinas(live.machines)
