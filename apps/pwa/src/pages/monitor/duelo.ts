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
 * La JORNADA de un turno: su fecha de PRODUCCIÓN. Shoplogix data cada turno por el día en que parte su documento
 * (`2026-10-26_Turno 1` es la noche que alimenta la jornada del 27-10), así que TODA noche pertenece a la jornada del
 * día siguiente a la fecha de su documento, sea cual sea la hora de inicio que traiga. El día es de su propia fecha.
 * Ahí se juntan la noche y el día de la misma jornada, que hacen equipos distintos.
 */
export function jornadaDe(dateKey: string, esNoche: boolean): string {
  if (!esNoche) return dateKey
  const t = Date.parse(`${dateKey}T12:00:00Z`)
  return Number.isFinite(t) ? new Date(t + DIA_MS).toISOString().slice(0, 10) : dateKey
}

/**
 * El equipo que hizo un turno. `shiftDocId` = `YYYY-MM-DD_<turno>`. La rotación semanal se cuenta por JORNADA (la
 * noche que parte el domingo es del lunes y de la semana nueva), no por la fecha de reloj del documento.
 * Una corrección manual (`overrides[shiftDocId]`) gana a la rotación.
 */
export function equipoDelTurno(
  shiftDocId: string,
  esNoche: boolean,
  overrides?: Readonly<Record<string, EquipoId>> | null,
): EquipoId {
  const corregido = overrides?.[shiftDocId]
  if (esEquipoId(corregido)) return corregido
  const diaEsRebolledo = ((semanasDesdeAncla(jornadaDe(shiftDocId.slice(0, 10), esNoche)) % 2) + 2) % 2 === 0
  return esNoche === diaEsRebolledo ? 'cardenas' : 'rebolledo'
}

/** ¿Hay una corrección manual que cambie lo que diría la rotación? */
export function equipoCorregido(
  shiftDocId: string,
  esNoche: boolean,
  overrides?: Readonly<Record<string, EquipoId>> | null,
): boolean {
  return equipoDelTurno(shiftDocId, esNoche, overrides) !== equipoDelTurno(shiftDocId, esNoche, null)
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

/** Quién (uid) y cuándo (ISO UTC) corrigió a mano el equipo de un turno. */
export interface CorreccionMeta {
  uid: string
  at: string
}

export interface ConfigDuelo {
  equipos?: NombresEquipos
  overrides?: Record<string, EquipoId>
  overridesMeta?: Record<string, CorreccionMeta>
}

/** «27/10 20:05» en hora de Chile a partir del ISO guardado; null si no se entiende. */
export function fechaCorreccion(at: string | null | undefined): string | null {
  const t = Date.parse(at ?? '')
  if (!Number.isFinite(t)) return null
  const p = new Intl.DateTimeFormat('es-CL', { timeZone: 'America/Santiago', day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit', hour12: false }).formatToParts(new Date(t))
  const g = (k: string) => p.find((x) => x.type === k)?.value ?? ''
  return `${g('day')}/${g('month')} ${g('hour')}:${g('minute')}`
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
  /** Fecha de producción: la noche que parte el 27-10 a las 21:00 es la jornada del 28-10. */
  jornada: string
  /** Hora planificada de inicio (HH:MM). */
  h0: string | null
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
  h0: string | null
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
    jornada: jornadaDe(e.dateKey, e.esNoche),
    h0: e.h0,
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
    shiftDocId: t.shiftDocId, dateKey: t.dateKey, h0: t.duelo.h0 ?? null, shiftId: t.shiftId, esNoche, cerrado: true,
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
    shiftDocId, dateKey: stat.dateKey, h0: live.scheduledStart?.slice(11, 16) ?? null, shiftId: stat.shiftId, esNoche, cerrado, piezas, stat,
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
  /** Qué valor gana la fila: el mayor (piezas, ritmo) o el menor (minutos de micro detención o de arranque). */
  mejor: 'mayor' | 'menor'
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
    filas: [{ rotulo: enVivo ? 'Piezas a esta hora' : 'Piezas con Mantención sumada', a: carreraA, b: carreraB, unidad: 'pz', decimales: 0, mejor: 'mayor', ganador: comparar(carreraA, carreraB, 'mayor') }],
    ganador: !cerrado && !enVivo ? 'pendiente' : comparar(carreraA, carreraB, 'mayor'),
  }
  const ritmo: KpiMarcador = {
    id: 'ritmo',
    rotulo: 'Ritmo andando',
    nota: 'Piezas por minuto sobre los minutos con piezas.',
    filas: [{ rotulo: 'Ritmo', a: a.ritmo, b: b.ritmo, unidad: 'pz/min', decimales: 1, mejor: 'mayor', ganador: comparar(a.ritmo, b.ritmo, 'mayor', 1) }],
    ganador: comparar(a.ritmo, b.ritmo, 'mayor', 1),
  }
  const micro: KpiMarcador = {
    id: 'micro',
    rotulo: 'Menos micro detenciones',
    nota: 'Minutos de micro detención por hora disponible, por máquina (clasificación oficial de Shoplogix).',
    filas: [{ rotulo: 'Micro detención', a: a.microMinH, b: b.microMinH, unidad: 'min/h', decimales: 1, mejor: 'menor', ganador: comparar(a.microMinH, b.microMinH, 'menor', 1) }],
    ganador: comparar(a.microMinH, b.microMinH, 'menor', 1),
  }
  const ganaArranque = comparar(a.arranqueMin, b.arranqueMin, 'menor')
  const ganaCierre: Resultado = !cerrado ? 'pendiente' : comparar(a.ultimaHoraPz, b.ultimaHoraPz, 'mayor')
  const arranque: KpiMarcador = {
    id: 'arranque',
    rotulo: 'Arranque y cierre',
    nota: 'Minutos hasta la primera pieza y piezas de la última hora. Gana quien gana los dos.',
    filas: [
      { rotulo: 'Hasta la primera pieza', a: a.arranqueMin, b: b.arranqueMin, unidad: 'min', decimales: 0, mejor: 'menor', ganador: ganaArranque },
      { rotulo: 'Piezas de la última hora', a: a.ultimaHoraPz, b: b.ultimaHoraPz, unidad: 'pz', decimales: 0, mejor: 'mayor', ganador: ganaCierre },
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

// ── La referencia propia: el promedio del equipo en su mismo horario ─────────

/**
 * Lo que corre solo (la noche, que abre la jornada, o un día sin noche): su propia referencia en gris, el promedio y
 * el rango de los últimos turnos DEL MISMO EQUIPO en el mismo horario (los de `forecastHistory`, que son del mismo
 * turno por nombre). Con un solo turno es ese turno; sin ninguno, null.
 */
export function referenciaPropia(
  hoy: TurnoHoy,
  forecast: readonly ForecastHistoryShift[],
  stats: readonly ShiftStat[],
  overrides?: Readonly<Record<string, EquipoId>> | null,
  maxN = 4,
): BandaRival | null {
  const horaDe = (id: string) => stats.find((s) => s.shiftDocId === id)?.duelo?.h0
  const curvas = forecast
    .filter((f) => {
      if (f.shiftDocId === hoy.shiftDocId || numeroDeTurno(f.shiftDocId.slice(11)) !== numeroDeTurno(hoy.shiftId)) return false
      const noche = esNocheDesdeHora(horaDe(f.shiftDocId)) ?? hoy.esNoche
      return noche === hoy.esNoche && jornadaDe(f.shiftDocId.slice(0, 10), noche) < hoy.jornada && equipoDelTurno(f.shiftDocId, noche, overrides) === hoy.equipo
    })
    .sort((x, y) => (x.shiftDocId < y.shiftDocId ? 1 : x.shiftDocId > y.shiftDocId ? -1 : 0))
    .map((f) => curvaDeForecast(f.curve))
    .filter((c) => c.length >= 2)
    .slice(0, maxN)
  if (curvas.length === 0) return null
  if (curvas.length === 1) return { media: curvas[0]!, min: curvas[0]!, max: curvas[0]!, turnos: 1 }
  return bandaDeCurvas(curvas)
}

/**
 * Pone el último punto de la curva al día con el contador en vivo (el mismo número de «Piezas ahora»): la curva
 * llega hasta el último tramo cerrado y se queda atrás. Si ya hay curva, se agrega (o se corrige) el punto de «ahora»;
 * si todavía no hay ningún tramo con piezas pero el contador ya cuenta, queda un punto con ese total.
 * `ahoraMin` = minuto de producción al que corresponde el contador; sin él, el punto se pone en el último minuto.
 */
export function curvaConContador(curva: readonly PacePoint[], piezas: number, ahoraMin?: number | null): PacePoint[] {
  const out = [...curva]
  if (!(piezas > 0)) return out
  const ultimo = out[out.length - 1]
  if (!ultimo) return [{ minutes: Math.max(1, Math.round(ahoraMin ?? 1)), pieces: piezas }]
  if (piezas <= ultimo.pieces) return out
  const minutes = Math.max(ultimo.minutes, Math.round(ahoraMin ?? ultimo.minutes))
  if (minutes === ultimo.minutes) out[out.length - 1] = { minutes, pieces: piezas }
  else out.push({ minutes, pieces: piezas })
  return out
}

// ── Color fijo por equipo ────────────────────────────────────────────────────

/** Un color por equipo en TODAS las vistas (Cárdenas = acento, Rebolledo = naranjo suave); se define en `monitorGlass.css`. */
export const COLOR_EQUIPO: Readonly<Record<EquipoId, string>> = {
  cardenas: 'var(--v2-eq-cardenas)',
  rebolledo: 'var(--v2-eq-rebolledo)',
}

/** La variante para TEXTO (contraste ≥ 4,5:1 en claro y oscuro); el trazo y las barras usan `COLOR_EQUIPO`. */
export const COLOR_EQUIPO_TEXTO: Readonly<Record<EquipoId, string>> = {
  cardenas: 'var(--v2-eq-cardenas-texto)',
  rebolledo: 'var(--v2-eq-rebolledo-texto)',
}

// ── El fantasma: el último turno del rival en el mismo horario ───────────────

export interface FantasmaRival {
  /**
   * `jornada` = la noche de LA MISMA jornada, que ya cerró (solo la corre el día); `ultimo` = el mismo horario de la
   * semana anterior (dato secundario); `promedio` = promedio, si el último turno no trae curva.
   */
  tipo: 'jornada' | 'ultimo' | 'promedio'
  equipo: EquipoId
  /** Solo si es un turno concreto. */
  shiftDocId: string | null
  /** Fecha de producción de ese turno. */
  jornada: string | null
  esNoche: boolean
  curva: PacePoint[]
  /** Piezas con las que cerró ese turno (solo si es un turno concreto). */
  total: number | null
  /** Turnos que promedia (1 si es un turno concreto). */
  turnos: number
  /** Minuto del día (hora de planta) de la primera pieza de ese turno; null si no se sabe. Para el reloj del globo. */
  inicioMin: number | null
  /** Sus paradas de 5 min o más, ya en el eje de horas de producción. */
  eventos: EventoTurno[]
}

export interface ReferenciaRival {
  fantasma: FantasmaRival | null
  /** Promedio y rango de los últimos turnos del rival (necesita al menos dos). */
  banda: BandaRival | null
}

type TurnoHoy = Pick<ResumenTurno, 'shiftDocId' | 'dateKey' | 'jornada' | 'shiftId' | 'esNoche' | 'equipo'>

/**
 * La mitad del rótulo que dice quién y cuándo: «noche 28/10», con la fecha de PRODUCCIÓN (la jornada), no la del
 * reloj de inicio.
 */
export const horarioYJornada = (esNoche: boolean, jornada: string): string => `${esNoche ? 'noche' : 'día'} ${jornada.slice(8, 10)}/${jornada.slice(5, 7)}`

/**
 * La línea punteada de la carrera del DÍA: la noche de la MISMA jornada, ya cerrada. Sale de `rivalCurve`, que el
 * backend publica para el turno vigente: el último turno CERRADO del otro nombre. Si no es de esta jornada o lo hizo
 * el mismo equipo no es el rival y no se usa: la noche abre la jornada y no compite con nadie mientras corre.
 */
export function fantasmaDeJornada(
  hoy: TurnoHoy,
  rc: RivalCurve | null | undefined,
  stats: readonly ShiftStat[],
  overrides?: Readonly<Record<string, EquipoId>> | null,
): FantasmaRival | null {
  if (!rc || !(rc.curve?.length >= 2)) return null
  const esNoche = esNocheDesdeHora(rc.h0) ?? !hoy.esNoche
  if (esNoche === hoy.esNoche) return null
  const equipo = equipoDelTurno(rc.shiftDocId, esNoche, overrides)
  if (equipo === hoy.equipo) return null
  const jornada = jornadaDe(rc.dateKey, esNoche)
  if (jornada !== hoy.jornada) return null
  return {
    tipo: 'jornada',
    equipo, shiftDocId: rc.shiftDocId, jornada, esNoche,
    curva: rc.curve.map((x) => ({ minutes: x.m, pieces: x.p })),
    total: rc.total, turnos: 1,
    ...datosDeArranque(stats.find((x) => x.shiftDocId === rc.shiftDocId)),
  }
}

/**
 * El mismo horario de la semana anterior: el ÚLTIMO turno que el equipo rival hizo en el mismo horario (mismo turno,
 * mismo lado del día). Es un dato secundario, sin puntos. Los turnos salen de `forecastHistory` y `shiftStats`; la
 * curva, de `forecastHistory`. Si ese último turno no trae curva se usa el promedio de los anteriores, rotulado.
 */
export function referenciaMismoHorario(
  hoy: TurnoHoy,
  forecast: readonly ForecastHistoryShift[],
  stats: readonly ShiftStat[],
  overrides?: Readonly<Record<string, EquipoId>> | null,
  maxBanda = 4,
): ReferenciaRival {
  const rival = otroEquipo(hoy.equipo)
  const horaDe = (id: string) => stats.find((s) => s.shiftDocId === id)?.duelo?.h0
  const ids = new Set<string>([...forecast.map((f) => f.shiftDocId), ...stats.map((s) => s.shiftDocId)])
  const delRival = [...ids]
    .filter((id) => {
      if (id === hoy.shiftDocId) return false
      if (numeroDeTurno(id.slice(11)) !== numeroDeTurno(hoy.shiftId)) return false
      const noche = esNocheDesdeHora(horaDe(id)) ?? hoy.esNoche
      return noche === hoy.esNoche
        && jornadaDe(id.slice(0, 10), noche) < hoy.jornada
        && equipoDelTurno(id, noche, overrides) === rival
    })
    .sort((x, y) => (x < y ? 1 : x > y ? -1 : 0))
  if (!delRival.length) return { fantasma: null, banda: null }

  const conCurva = delRival
    .map((id) => {
      const f = forecast.find((x) => x.shiftDocId === id)
      return { id, f, curva: f ? curvaDeForecast(f.curve) : [] }
    })
    .filter((c) => c.curva.length >= 2)
  const banda = bandaDeCurvas(conCurva.slice(0, maxBanda).map((c) => c.curva))
  const ultimo = conCurva[0]
  const base = { equipo: rival, esNoche: hoy.esNoche }
  if (ultimo && ultimo.id === delRival[0]) {
    return {
      fantasma: { ...base, tipo: 'ultimo', shiftDocId: ultimo.id, jornada: jornadaDe(ultimo.id.slice(0, 10), hoy.esNoche), curva: ultimo.curva, total: ultimo.f?.total ?? null, turnos: 1, ...datosDeArranque(stats.find((x) => x.shiftDocId === ultimo.id)) },
      banda,
    }
  }
  if (banda) return { fantasma: { ...base, tipo: 'promedio', shiftDocId: null, jornada: null, curva: banda.media, total: null, turnos: banda.turnos, inicioMin: null, eventos: [] }, banda }
  return { fantasma: null, banda: null }
}

/** Arranque productivo, reloj y paradas de un turno cerrado, a partir de su `shiftStats[].duelo`. */
function datosDeArranque(st: ShiftStat | undefined): { inicioMin: number | null; eventos: EventoTurno[] } {
  const d = st?.duelo
  const h0 = minutoDelDia(d?.h0)
  return {
    inicioMin: h0 != null && d?.ini != null ? (h0 + d.ini) % 1440 : null,
    eventos: eventosEnEjeProduccion(d?.ev, d?.ini ?? null),
  }
}

/** «07:20» a 440. */
export function minutoDelDia(hhmm: string | null | undefined): number | null {
  const m = /^(\d{1,2}):(\d{2})/.exec(hhmm ?? '')
  return m ? Number(m[1]) * 60 + Number(m[2]) : null
}

/** Minuto del día a «07:20». */
export const relojDeMinuto = (min: number): string => {
  const m = ((Math.round(min) % 1440) + 1440) % 1440
  return `${String(Math.floor(m / 60)).padStart(2, '0')}:${String(m % 60).padStart(2, '0')}`
}

/** El rótulo de la línea punteada, con equipo, horario y jornada: «Rebolledo · día 28/10»; el promedio: «Rebolledo · promedio de 3 turnos». */
export function rotuloFantasma(f: FantasmaRival, nombre: string): string {
  if (f.tipo === 'promedio' || !f.jornada) return `${nombre} · promedio de ${f.turnos} ${f.turnos === 1 ? 'turno' : 'turnos'}`
  return `${nombre} · ${horarioYJornada(f.esNoche, f.jornada)}`
}

/**
 * La frase de la noche que abre la jornada: quién corre contra su curva, cuándo y desde qué hora. La usan la carrera
 * y la tarjeta exprés, para que digan lo mismo: «Rebolledo corre contra esta curva el 28/10 desde las 07:15».
 */
export const textoCorreContraEstaCurva = (rival: string, jornada: string, inicioDia: string | null): string =>
  `${rival} corre contra esta curva el ${jornada.slice(8, 10)}/${jornada.slice(5, 7)} ${inicioDia ? `desde las ${inicioDia}` : 'en el turno día'}`

/** El rótulo del turno que se mira: «Cárdenas · noche 28/10». */
export const rotuloTurno = (nombre: string, t: Pick<ResumenTurno, 'esNoche' | 'jornada'>): string => `${nombre} · ${horarioYJornada(t.esNoche, t.jornada)}`

// ── Horas de producción y paradas del turno ─────────────────────────────────
//
// REGLA DEL EJE: las dos curvas parten de la PRIMERA PIEZA de su turno (arranque productivo), así que «1ª hora» es el
// primer tramo de 60 min desde ahí, para los dos equipos. Las paradas se corren a ese mismo eje restándoles los
// minutos que cada turno tardó en arrancar desde su inicio planificado.

/** La hora de producción (1, 2, 3…) a la que pertenece un minuto transcurrido. */
export const horaTranscurrida = (min: number): number => Math.floor(Math.max(0, min) / 60) + 1

/** «3ª hora». */
export const etiquetaHora = (n: number): string => `${n}ª hora`

export interface BandaHora {
  n: number
  desde: number
  hasta: number
  /** La hora llega a los 60 min dentro del eje; la última suele quedar a medias. */
  completa: boolean
}

/** Las horas que caben en un eje de `maxMin` minutos. */
export function bandasDeHoras(maxMin: number): BandaHora[] {
  if (!(maxMin > 0)) return []
  const out: BandaHora[] = []
  for (let n = 1; (n - 1) * 60 < maxMin; n++) {
    const hasta = Math.min(n * 60, maxMin)
    out.push({ n, desde: (n - 1) * 60, hasta, completa: hasta - (n - 1) * 60 >= 59.5 })
  }
  return out
}

/** Parada de 5 min o más tal como la publica el backend (`shiftStats[].duelo.ev`). */
export interface EventoCrudo {
  n: string
  /** Minutos desde el inicio planificado. */
  o: number
  d: number
  p?: 1
}

/** Una parada ubicada en el eje de horas de producción de su turno. */
export interface EventoTurno {
  causa: string
  /** Nombre corto para el globo. */
  corta: string
  desde: number
  hasta: number
  programada: boolean
}

/** «Colación», «Falta de MMPP» o la causa en minúsculas con la primera mayúscula, recortada. */
export function causaCorta(causa: string): string {
  const k = normalizar(causa)
  if (/colacion/.test(k)) return 'Colación'
  if (/mmpp|materia prima/.test(k)) return 'Falta de MMPP'
  const t = causa.trim().replace(/\s+/g, ' ').toLowerCase()
  const c = t.charAt(0).toUpperCase() + t.slice(1)
  return c.length > 26 ? `${c.slice(0, 25)}…` : c
}

/**
 * Corre las paradas del eje «desde el inicio planificado» al de horas de producción: se resta el arranque (`ini`).
 * Lo que terminó antes de la primera pieza no se dibuja; lo que la cruza se recorta en 0. Sin `ini` no se sabe
 * dónde caen, y no se adivina: queda vacío.
 */
export function eventosEnEjeProduccion(crudos: readonly EventoCrudo[] | null | undefined, ini: number | null | undefined): EventoTurno[] {
  if (ini == null || !Number.isFinite(ini)) return []
  const out: EventoTurno[] = []
  for (const e of crudos ?? []) {
    if (!e || !(e.d > 0) || !Number.isFinite(e.o)) continue
    const desde = e.o - ini
    const hasta = desde + e.d
    if (hasta <= 0) continue
    out.push({ causa: e.n, corta: causaCorta(e.n), desde: Math.max(0, desde), hasta, programada: e.p === 1 })
  }
  return out.sort((x, y) => x.desde - y.desde)
}

/** Mínimo de una parada para marcarla (igual que el backend). */
export const PARADA_MIN_SEG = 300

/**
 * Las paradas del turno que se está mirando, con el MISMO criterio que `eventosDelDuelo` del backend: unidas entre
 * máquinas por causa, solo las de 5 min o más. Programada = la causa está en el desglose de paros programados.
 */
export function eventosCrudosDeLive(live: Pick<PublicMonitorLive, 'stopEvents' | 'stopReasons' | 'scheduledStart' | 'timeBreakdown'>): EventoCrudo[] {
  const iniMs = Date.parse(live.scheduledStart ?? '')
  if (!Number.isFinite(iniMs)) return []
  const causas = live.stopReasons ?? []
  const programadas = new Set((live.timeBreakdown?.planned ?? []).map((c) => c.reason))
  const porCausa = new Map<string, Array<[number, number]>>()
  for (const e of live.stopEvents ?? []) {
    const n = causas[e.r]
    const f = Date.parse(e.f)
    if (!n || !Number.isFinite(f) || !(e.s > 0)) continue
    porCausa.set(n, [...(porCausa.get(n) ?? []), [f, f + e.s * 1000]])
  }
  const out: EventoCrudo[] = []
  for (const [n, rangos] of porCausa) {
    const unidos: Array<[number, number]> = []
    for (const r of [...rangos].sort((x, y) => x[0] - y[0])) {
      const u = unidos[unidos.length - 1]
      if (u && r[0] <= u[1]) u[1] = Math.max(u[1], r[1])
      else unidos.push([r[0], r[1]])
    }
    for (const [d0, d1] of unidos) {
      if ((d1 - d0) / 1000 < PARADA_MIN_SEG) continue
      out.push({ n, o: Math.round((d0 - iniMs) / 60_000), d: Math.round((d1 - d0) / 60_000), ...(programadas.has(n) ? { p: 1 as const } : {}) })
    }
  }
  return out.sort((x, y) => x.o - y.o)
}

// ── Franja entre las dos curvas ──────────────────────────────────────────────

export interface TramoFranja {
  /** Quién va adelante en este tramo: `a` = hoy, `b` = el fantasma. */
  adelante: 'a' | 'b'
  puntos: Array<{ m: number; a: number; b: number }>
}

/**
 * Los tramos entre dos curvas acumuladas hasta el minuto `hasta`, uno por cada vez que cambia quién va adelante
 * (el cruce se interpola, así la franja se cierra justo donde las líneas se tocan).
 */
export function franjasEntre(a: readonly PacePoint[], b: readonly PacePoint[], hasta: number, paso = 2): TramoFranja[] {
  if (a.length < 2 || b.length < 2 || !(hasta > 0)) return []
  const tramos: TramoFranja[] = []
  let actual: TramoFranja | null = null
  let prev: { m: number; a: number; b: number; d: number } | null = null
  const n = Math.ceil(hasta / paso)
  for (let i = 0; i <= n; i++) {
    const m = Math.min(hasta, i * paso)
    const pa = piezasAlMinuto(a, m) ?? 0
    const pb = piezasAlMinuto(b, m) ?? 0
    const d = pa - pb
    const s = { m, a: pa, b: pb, d }
    if (prev && prev.d !== 0 && d !== 0 && Math.sign(prev.d) !== Math.sign(d)) {
      const t = prev.d / (prev.d - d)
      const v = prev.a + t * (pa - prev.a)
      const cruce = { m: prev.m + t * (m - prev.m), a: v, b: v }
      actual?.puntos.push(cruce)
      actual = { adelante: d > 0 ? 'a' : 'b', puntos: [cruce] }
      tramos.push(actual)
    }
    if (d !== 0) {
      if (!actual) {
        actual = { adelante: d > 0 ? 'a' : 'b', puntos: prev && prev.d === 0 ? [prev] : [] }
        tramos.push(actual)
      }
      actual.puntos.push(s)
    } else if (actual) {
      actual.puntos.push(s)
      actual = null
    }
    prev = s
  }
  return tramos.filter((t) => t.puntos.length >= 2)
}

// ── Ritmo hora a hora ────────────────────────────────────────────────────────

/** Una hora con menos de este tiempo cubierto no se muestra: 5 minutos de piezas dan un ritmo sin sentido. */
export const MIN_CUBIERTO_HORA = 15

export interface HoraRitmo {
  /** 1 = la primera hora desde la primera pieza. */
  hora: number
  /** pz/min de esa hora; null = esa curva no cubre la hora. */
  a: number | null
  b: number | null
  /** La hora no se completó (el turno sigue o terminó a mitad de hora): el ritmo es sobre lo cubierto. */
  parcialA: boolean
  parcialB: boolean
}

function ritmoDeHora(curva: readonly PacePoint[], hora: number): { pzMin: number; parcial: boolean } | null {
  if (curva.length < 2) return null
  const fin = curva[curva.length - 1]!.minutes
  const ini = (hora - 1) * 60
  const hasta = Math.min(hora * 60, fin)
  const cubierto = hasta - ini
  if (cubierto < MIN_CUBIERTO_HORA) return null
  const pz = (piezasAlMinuto(curva, hasta) ?? 0) - (piezasAlMinuto(curva, ini) ?? 0)
  return { pzMin: Math.max(0, pz) / cubierto, parcial: cubierto < 59.5 }
}

/**
 * Ritmo de cada hora (pz/min) de dos curvas acumuladas que parten de la primera pieza. Sale de las piezas entre dos
 * marcas de la curva, así que incluye las paradas de esa hora: es el ritmo de la hora, no el de «andando».
 */
export function ritmoHoraAHora(a: readonly PacePoint[], b: readonly PacePoint[], maxHoras = 12): HoraRitmo[] {
  const fin = Math.max(a[a.length - 1]?.minutes ?? 0, b[b.length - 1]?.minutes ?? 0)
  const out: HoraRitmo[] = []
  for (let h = 1; h <= Math.min(maxHoras, Math.ceil(fin / 60)); h++) {
    const ra = ritmoDeHora(a, h)
    const rb = ritmoDeHora(b, h)
    if (ra || rb) out.push({ hora: h, a: ra?.pzMin ?? null, b: rb?.pzMin ?? null, parcialA: ra?.parcial ?? false, parcialB: rb?.parcial ?? false })
  }
  return out
}

// ── KPI a KPI ────────────────────────────────────────────────────────────────

export interface FilaVs {
  /** `carrera`, `ritmo`, `micro` o `arranque`: el KPI al que pertenece (arranque y cierre comparten un punto). */
  kpi: KpiId
  rotulo: string
  unidad: string
  decimales: number
  mejor: 'mayor' | 'menor'
  a: number | null
  b: number | null
  /** Largo de cada barra, 0–1, sobre el mayor de los dos valores (las barras arrancan en cero). */
  fa: number
  fb: number
  ganador: Resultado
}

/** Las filas del marcador listas para dibujar barras enfrentadas. Sin marcador (o sin duelo) no hay filas. */
export function filasKpiAKpi(m: Marcador | null | undefined): FilaVs[] {
  if (!m || m.sinDuelo) return []
  return m.kpis.flatMap((k) =>
    k.filas.map((f) => {
      const tope = Math.max(f.a ?? 0, f.b ?? 0)
      const frac = (v: number | null) => (v != null && tope > 0 ? Math.max(0, v) / tope : 0)
      return { kpi: k.id, rotulo: f.rotulo, unidad: f.unidad, decimales: f.decimales, mejor: f.mejor, a: f.a, b: f.b, fa: frac(f.a), fb: frac(f.b), ganador: f.ganador }
    }),
  )
}

// ── Tendencia semanal ────────────────────────────────────────────────────────

export interface PromedioSemana {
  /** Piezas por turno, promedio de los turnos cerrados de ese equipo esa semana. */
  prom: number
  turnos: number
  /** Cada semana un equipo hace el día y el otro la noche: el punto lo dice. */
  horario: 'dia' | 'noche' | 'mixto'
}

export interface PuntoSemana {
  /** Lunes de la semana ISO. */
  lunes: string
  equipos: Record<EquipoId, PromedioSemana | null>
}

/** Piezas por turno de cada equipo, semana a semana (las últimas `maxSemanas` con algún turno cerrado). */
export function tendenciaSemanal(resumenes: readonly ResumenTurno[], maxSemanas = 8): PuntoSemana[] {
  const semanas = new Map<string, ResumenTurno[]>()
  for (const r of resumenes) {
    if (!r.cerrado || !(r.piezas > 0)) continue
    const k = lunesDe(r.jornada)
    semanas.set(k, [...(semanas.get(k) ?? []), r])
  }
  const de = (rs: ResumenTurno[], e: EquipoId): PromedioSemana | null => {
    const mios = rs.filter((r) => r.equipo === e)
    if (!mios.length) return null
    const noches = mios.filter((r) => r.esNoche).length
    return {
      prom: mios.reduce((acc, r) => acc + r.piezas, 0) / mios.length,
      turnos: mios.length,
      horario: noches === 0 ? 'dia' : noches === mios.length ? 'noche' : 'mixto',
    }
  }
  return [...semanas.keys()].sort().slice(-maxSemanas).map((lunes) => ({
    lunes,
    equipos: { rebolledo: de(semanas.get(lunes)!, 'rebolledo'), cardenas: de(semanas.get(lunes)!, 'cardenas') },
  }))
}

// ── El duelo completo ────────────────────────────────────────────────────────

export interface TurnoDuelo {
  resumen: ResumenTurno
  rival: ResumenTurno | null
  marcador: Marcador | null
}

/** Orden de juego: por jornada, y dentro de ella la noche (que parte la víspera) antes que el día. */
const antes = (x: ResumenTurno, y: ResumenTurno) =>
  x.jornada < y.jornada
  || (x.jornada === y.jornada && (x.esNoche !== y.esNoche ? x.esNoche : x.shiftDocId < y.shiftDocId))

/**
 * El rival directo es el turno del OTRO horario de la MISMA jornada, hecho por el otro equipo: la noche contra el día
 * de la misma fecha de producción. Un partido por jornada. Si ese turno todavía no existe o no cerró, no hay rival.
 */
export function rivalDirecto(turno: ResumenTurno, candidatos: readonly ResumenTurno[]): ResumenTurno | null {
  return candidatos.find((c) =>
    c.shiftDocId !== turno.shiftDocId && c.jornada === turno.jornada && c.esNoche !== turno.esNoche && c.equipo !== turno.equipo) ?? null
}

/** Cada turno cerrado contra su rival de jornada, en orden de juego. Cada jornada es un partido que cuenta una vez por equipo. */
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
    if (!d.marcador || d.marcador.sinDuelo || cicloDe(d.resumen.jornada).indice !== indice) continue
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

// ── Marcador por semana y por mes ────────────────────────────────────────────

export type PeriodoTipo = 'semana' | 'mes'

export interface MarcadorPeriodo {
  tipo: PeriodoTipo
  /** Lunes ISO (semana) o `YYYY-MM` (mes). */
  clave: string
  /** «Semana 44» o «octubre 2026». */
  etiqueta: string
  inicio: string
  fin: string
  vigente: boolean
  /** Puntos de los turnos cerrados con duelo que hizo cada equipo. */
  puntos: Record<EquipoId, number>
  ganados: Record<EquipoId, number>
  empatados: Record<EquipoId, number>
  perdidos: Record<EquipoId, number>
  /** Turnos cerrados del equipo en el período, con o sin rival. */
  turnos: Record<EquipoId, number>
  /** Piezas por turno (promedio de sus turnos cerrados); null sin turnos. */
  piezasProm: Record<EquipoId, number | null>
  /** Quién gana el período por puntos; null si no hay ningún turno con duelo. */
  ganador: EquipoId | 'empate' | null
}

const MESES = ['enero', 'febrero', 'marzo', 'abril', 'mayo', 'junio', 'julio', 'agosto', 'septiembre', 'octubre', 'noviembre', 'diciembre'] as const

/** Número de semana ISO a partir de su lunes (el jueves decide el año). */
export function semanaIso(lunes: string): number {
  const t = Date.parse(`${lunes}T12:00:00Z`)
  if (!Number.isFinite(t)) return 0
  const jueves = new Date(t + 3 * DIA_MS)
  const ene1 = Date.UTC(jueves.getUTCFullYear(), 0, 1, 12)
  return Math.floor((jueves.getTime() - ene1) / (7 * DIA_MS)) + 1
}

const claveDe = (tipo: PeriodoTipo, dateKey: string) => (tipo === 'semana' ? lunesDe(dateKey) : dateKey.slice(0, 7))

/** Las claves de período con turnos, de la más nueva a la más vieja; la de hoy va siempre (aunque aún no tenga turnos). */
export function periodosDisponibles(duelos: readonly TurnoDuelo[], hoyKey: string, tipo: PeriodoTipo, max = 12): string[] {
  const claves = new Set<string>([claveDe(tipo, hoyKey), ...duelos.map((d) => claveDe(tipo, d.resumen.jornada))])
  return [...claves].sort().reverse().slice(0, max)
}

/** Marcador de una semana o de un mes calendario completo: puntos, turnos ganados/empatados/perdidos y piezas por turno. */
export function marcadorDePeriodo(duelos: readonly TurnoDuelo[], tipo: PeriodoTipo, clave: string, hoyKey: string): MarcadorPeriodo {
  const out: MarcadorPeriodo = {
    tipo, clave, etiqueta: '', inicio: '', fin: '', vigente: claveDe(tipo, hoyKey) === clave,
    puntos: porEquipo(0), ganados: porEquipo(0), empatados: porEquipo(0), perdidos: porEquipo(0), turnos: porEquipo(0),
    piezasProm: { rebolledo: null, cardenas: null }, ganador: null,
  }
  if (tipo === 'semana') {
    out.etiqueta = `Semana ${semanaIso(clave)}`
    out.inicio = clave
    out.fin = new Date(Date.parse(`${clave}T12:00:00Z`) + 6 * DIA_MS).toISOString().slice(0, 10)
  } else {
    const [y, mm] = clave.split('-').map(Number)
    out.etiqueta = `${MESES[(mm ?? 1) - 1] ?? clave} ${y}`
    out.inicio = `${clave}-01`
    out.fin = new Date(Date.UTC(y ?? 1970, mm ?? 1, 0, 12)).toISOString().slice(0, 10)
  }
  const sumaPz = porEquipo(0)
  let conDuelo = 0
  for (const d of duelos) {
    if (claveDe(tipo, d.resumen.jornada) !== clave) continue
    const e = d.resumen.equipo
    if (d.resumen.cerrado && d.resumen.piezas > 0) { out.turnos[e] += 1; sumaPz[e] += d.resumen.piezas }
    const m = d.marcador
    if (!m || m.sinDuelo || m.ganador === 'pendiente' || m.ganador === 'sin-duelo') continue
    conDuelo += 1
    out.puntos[e] += m.puntosA
    if (m.ganador === 'a') out.ganados[e] += 1
    else if (m.ganador === 'b') out.perdidos[e] += 1
    else out.empatados[e] += 1
  }
  for (const e of EQUIPOS) out.piezasProm[e] = out.turnos[e] > 0 ? sumaPz[e] / out.turnos[e] : null
  if (conDuelo > 0) out.ganador = out.puntos.rebolledo === out.puntos.cardenas ? 'empate' : out.puntos.rebolledo > out.puntos.cardenas ? 'rebolledo' : 'cardenas'
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
    if (top) out.push({ id, rotulo, valor: top.v, unidad, decimales, equipo: top.d.resumen.equipo, dateKey: top.d.resumen.jornada })
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
  /** La curva que corre enfrente: la noche de la misma jornada (solo la corre el día). */
  fantasma: PacePoint[] | null
  /** Quién es el fantasma; null si no hay curva. */
  fantasmaInfo: FantasmaRival | null
  /** El equipo contra el que se corre, haya o no curva para mostrar. */
  rivalEquipo: EquipoId
  /**
   * La referencia en gris: con fantasma, el rango del rival en el mismo horario; sin él (la noche que abre la jornada,
   * o un día sin noche), el promedio y rango del PROPIO equipo (`bandaPropia`).
   */
  banda: BandaRival | null
  bandaPropia: boolean
  /** Ritmo de cada hora, hoy contra el fantasma. */
  ritmoHoras: HoraRitmo[]
  /** Paradas de hoy en el eje de horas de producción. */
  eventosHoy: EventoTurno[]
  /** Minuto de producción que se compara (el último de hoy). */
  minuto: number
  /** «2ª hora» = segunda hora de producción. */
  hora: number
  hoyPz: number
  fantasmaPz: number | null
  diferencia: number | null
}

/** El mismo horario de la semana anterior, en una línea y sin puntos. */
export interface SemanaAnterior {
  fantasma: FantasmaRival
  /** Lo que llevaba ese turno a esta misma hora de producción. */
  pzAHora: number | null
  diferencia: number | null
}

export interface DatosDuelo {
  hoy: ResumenTurno
  /** El rival de la jornada: la noche si miramos el día, o el día si miramos una noche ya cerrada. Null mientras no existe o la noche corre. */
  rival: ResumenTurno | null
  /** Este turno es la NOCHE: abre la jornada y no compite con nadie mientras corre. */
  abreJornada: boolean
  /** La noche ya cerró y su día todavía no: la jornada espera a este equipo para asignar puntos. */
  esperando: EquipoId | null
  /** HH:MM de inicio planificado del turno día, si se conoce (para «corre contra esta curva mañana desde las…»). */
  inicioDia: string | null
  marcador: Marcador | null
  carrera: CarreraDuelo | null
  semanaAnterior: SemanaAnterior | null
  ciclo: CicloDuelo
  cicloPrevio: CicloDuelo
  rachas: Record<EquipoId, Racha>
  records: RecordTurno[]
  costo: Record<EquipoId, CostoEquipo>
  /** Las barras del KPI a KPI (vacío sin rival o sin duelo). */
  kpiAKpi: FilaVs[]
  /** Piezas por turno de cada equipo, semana a semana. */
  tendencia: PuntoSemana[]
  /** Cada turno cerrado contra su rival de jornada (para el marcador por semana y por mes). */
  duelos: TurnoDuelo[]
  /** Jornada (fecha de producción) del turno que se mira. */
  hoyKey: string
  /** Quién y cuándo corrigió el equipo de este turno, si lo corrigió. */
  correccion: CorreccionMeta | null
  /** El turno fue corregido a mano respecto de la rotación. */
  corregido: boolean
  /** Turnos de `shiftStats` ya rearmados con los datos del duelo, sobre el total publicado. */
  listos: { con: number; de: number }
}

export interface EntradaDuelo {
  shiftDocId: string
  live: PublicMonitorLive
  /** El contador EN VIVO que muestra la pantalla («Piezas ahora»): manda sobre el último punto de la curva. */
  piezas: number
  /** Hora de planta (wall-clock en ms) a la que corresponde ese contador; extiende la curva hasta «ahora». */
  ahoraMs?: number | null
  cerrado: boolean
  /** Curva acumulada de hoy desde la primera pieza (`cumulativeFromStart`). */
  curvaHoy: readonly PacePoint[]
  /** Solo para el turno vigente: el último turno cerrado del otro horario (la curva del rival de la jornada). */
  rivalCurve?: RivalCurve | null
  stats: readonly ShiftStat[]
  forecast: readonly ForecastHistoryShift[]
  overrides?: Readonly<Record<string, EquipoId>> | null
  /** Quién y cuándo corrigió cada turno (`monitor_config.duelo.overridesMeta`). */
  overridesMeta?: Readonly<Record<string, CorreccionMeta>> | null
}

/** Junta todo lo que la tarjeta y la pestaña muestran. null si el turno no trae su hora de inicio. */
export function construirDuelo(e: EntradaDuelo): DatosDuelo | null {
  const hoy = resumenDeLive({ shiftDocId: e.shiftDocId, live: e.live, piezas: e.piezas, cerrado: e.cerrado, overrides: e.overrides })
  if (!hoy) return null

  const deStats = e.stats.map((s) => resumenDeStat(s, e.overrides)).filter((r): r is ResumenTurno => r != null && r.shiftDocId !== hoy.shiftDocId)
  /* Para el ciclo, los récords y el costo, el turno de hoy cuenta si ya cerró. */
  const cerrados = hoy.cerrado ? [...deStats, hoy] : deStats
  const duelos = duelosDeTurnos(cerrados)

  /* La NOCHE abre la jornada y no compite con nadie mientras corre: el rival (el día de la misma fecha) juega después.
     Cerrada, se compara solo si su día ya cerró. El DÍA corre contra la noche de su jornada, que ya cerró. */
  const abreJornada = hoy.esNoche
  const rival = abreJornada && !hoy.cerrado ? null : rivalDirecto(hoy, deStats)
  const esperando = abreJornada && hoy.cerrado && !rival ? otroEquipo(hoy.equipo) : null
  const inicioDia = [...deStats].filter((r) => !r.esNoche && r.h0).sort((x, y) => (antes(x, y) ? 1 : -1))[0]?.h0 ?? null

  /* La línea punteada sale de la curva del rival publicada para el turno vigente, y solo la corre el día. */
  const fantasmaInfo = abreJornada ? null : fantasmaDeJornada(hoy, e.rivalCurve, e.stats, e.overrides)
  const fantasma = fantasmaInfo ? fantasmaInfo.curva : null

  /* El total y el punto actual son el contador EN VIVO, no el último tramo cerrado de la curva. */
  const primeraPieza = desdePrimeraPieza(e.live.series).find((p) => (p.pieces ?? 0) > 0)
  const t0 = primeraPieza?.t ? Date.parse(primeraPieza.t) : NaN
  const ahoraMin = e.ahoraMs != null && Number.isFinite(t0) ? (e.ahoraMs - t0) / 60_000 : null
  const curvaHoy = curvaConContador(e.curvaHoy, e.piezas, ahoraMin)
  const minuto = curvaHoy.length ? curvaHoy[curvaHoy.length - 1]!.minutes : 0
  const hoyPz = e.piezas > 0 ? e.piezas : curvaHoy.length ? curvaHoy[curvaHoy.length - 1]!.pieces : 0
  const fantasmaPz = fantasma && fantasma.length ? piezasAlMinuto(fantasma, minuto) : null

  /* A igual tiempo de turno solo si el fantasma ES el rival del marcador. */
  const mismoRival = rival != null && fantasmaInfo != null && fantasmaInfo.shiftDocId === rival.shiftDocId
  const marcador = rival
    ? compararTurnos(hoy, rival, { carreraEnVivo: !hoy.cerrado && fantasmaPz != null && mismoRival ? { a: hoy.piezas, b: fantasmaPz } : null })
    : null

  /* Dato secundario, sin puntos: el mismo horario de la semana anterior. No aplica a la noche que corre sola. */
  const mismoHorario = referenciaMismoHorario(hoy, e.forecast, e.stats, e.overrides)
  const propia = fantasmaInfo ? null : referenciaPropia(hoy, e.forecast, e.stats, e.overrides)
  const banda = fantasmaInfo ? mismoHorario.banda : propia
  const semanaAnterior: SemanaAnterior | null = mismoHorario.fantasma && !(abreJornada && !hoy.cerrado)
    ? (() => {
        const pzAHora = mismoHorario.fantasma.curva.length ? piezasAlMinuto(mismoHorario.fantasma.curva, minuto) : null
        return {
          fantasma: mismoHorario.fantasma,
          pzAHora,
          diferencia: pzAHora != null && curvaHoy.length ? hoyPz - pzAHora : null,
        }
      })()
    : null

  const carrera: CarreraDuelo | null = curvaHoy.length
    ? {
        hoy: curvaHoy, fantasma, fantasmaInfo, rivalEquipo: otroEquipo(hoy.equipo), banda, bandaPropia: fantasmaInfo == null,
        ritmoHoras: ritmoHoraAHora(curvaHoy, fantasma ?? []),
        eventosHoy: eventosEnEjeProduccion(eventosCrudosDeLive(e.live), hoy.arranqueMin),
        minuto, hora: horaTranscurrida(minuto),
        hoyPz, fantasmaPz,
        diferencia: fantasmaPz != null ? hoyPz - fantasmaPz : null,
      }
    : null

  const ciclo = cicloDe(hoy.jornada)
  const hoyIndice = ciclo.indice
  const delCiclo = cerrados.filter((r) => cicloDe(r.jornada).indice === hoyIndice)
  return {
    hoy, rival, abreJornada, esperando, inicioDia, marcador, carrera, semanaAnterior,
    ciclo: marcadorDeCiclo(duelos, hoyIndice, hoyIndice),
    cicloPrevio: marcadorDeCiclo(duelos, hoyIndice - 1, hoyIndice),
    rachas: rachasPorEquipo(duelos),
    records: recordsDe(duelos),
    costo: costoMantencion(hoy.cerrado ? delCiclo : [...delCiclo, hoy]),
    kpiAKpi: filasKpiAKpi(marcador),
    tendencia: tendenciaSemanal(cerrados),
    duelos,
    hoyKey: hoy.jornada,
    correccion: e.overridesMeta?.[hoy.shiftDocId] ?? null,
    corregido: equipoCorregido(hoy.shiftDocId, hoy.esNoche, e.overrides),
    listos: { con: deStats.length, de: e.stats.length },
  }
}

/** Unidad de alimentación de la línea, para el rótulo («carros» / «silletas»). */
export const unidadDeLinea = (live: Pick<PublicMonitorLive, 'machines'>) => unidadDeMaquinas(live.machines)
