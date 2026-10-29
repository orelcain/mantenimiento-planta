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
 *     arranque y cierre) y un punto por cada puesto de alimentación ganado. «Minutos a buen ritmo» NO es indicador.
 *     Marcador de la jornada = `puntajeJornada`: puntos FIRMES (carrera, ritmo, micro) y puntos EN JUEGO (arranque y
 *     cierre, alimentación) hasta que cierra la jornada; PC y celular leen la misma función.
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
import { duenoDe } from '@/services/shoplogix/monitorEventos'
import { numeroDeTurno } from './aporteHistorico'
import { arranqueDeTurno, type ModoArranque, type SerieMinuto } from './dueloSerie'
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
 * La JORNADA de un turno: su fecha de PRODUCCIÓN. Se decide con la HORA PLANIFICADA DE INICIO (`h0`, de
 * `scheduledStart`; NO la de la primera pieza) y la fecha del documento:
 *  - inicio ≥ 17:00 (la noche que arranca a las 21:30): jornada = fecha del documento + 1 día;
 *  - inicio 00:00–04:59 (la noche que arranca pasada la medianoche): el documento YA lleva la fecha de producción;
 *  - de día: la fecha del documento.
 * Ahí se juntan la noche y el día de la misma jornada, que hacen equipos distintos.
 *
 * Por qué NO una regla única «toda noche = día siguiente»: `2026-10-26_Turno 1 Lunes` arranca a las 00:00 del lunes y
 * ya se llama por su fecha de producción; con la regla única caía en la jornada 27-10 (que quedaba con dos noches y la
 * 26-10 con ninguna), el marcador de la semana 44 salía «Cárdenas 10 – 1» en vez de «2 – 0» y el 27-10 se comparaba
 * contra 15.801 pz en vez de 15.427.
 *
 * Sin `h0` (turno que el backend aún no rearmó): si se pasa `shiftDocId` y la noche lleva día de la semana en el
 * nombre, se toma como inicio 00:00 y no se corre; el resto de las noches se corre un día.
 */
export function jornadaDe(dateKey: string, esNoche: boolean, h0?: string | null, shiftDocId?: string): string {
  if (!esNoche) return dateKey
  const m = /^(\d{1,2}):(\d{2})/.exec(h0 ?? '')
  const arrancaPasadaMedianoche = m
    ? Number(m[1]) < 5
    : shiftDocId != null && /(lunes|martes|miercoles|jueves|viernes|sabado|domingo)\s*$/.test(normalizar(shiftDocId.slice(11)))
  if (arrancaPasadaMedianoche) return dateKey
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
  h0?: string | null,
): EquipoId {
  const corregido = overrides?.[shiftDocId]
  if (esEquipoId(corregido)) return corregido
  const diaEsRebolledo = ((semanasDesdeAncla(jornadaDe(shiftDocId.slice(0, 10), esNoche, h0, shiftDocId)) % 2) + 2) % 2 === 0
  return esNoche === diaEsRebolledo ? 'cardenas' : 'rebolledo'
}

/** ¿Hay una corrección manual que cambie lo que diría la rotación? */
export function equipoCorregido(
  shiftDocId: string,
  esNoche: boolean,
  overrides?: Readonly<Record<string, EquipoId>> | null,
  h0?: string | null,
): boolean {
  return equipoDelTurno(shiftDocId, esNoche, overrides, h0) !== equipoDelTurno(shiftDocId, esNoche, null, h0)
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
  /**
   * Arranque del turno en minutos, medido SIEMPRE desde el inicio planificado (`scheduledStart`) y según `arranqueModo`:
   * Eviscerado = hasta el 90 % del ritmo esperado; Filete = hasta la primera pieza. null = todavía no arranca o sin dato.
   */
  arranqueMin: number | null
  arranqueModo: ModoArranque
  /** Minutos entre el inicio planificado y la primera pieza productiva: corre el eje de producción (no es el KPI de arranque). */
  iniProdMin: number | null
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
  /** El arranque ya medido (modo y minutos). Sin él: primera pieza según `duelo.ini`. */
  arranque?: { modo: ModoArranque; min: number | null }
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
    jornada: jornadaDe(e.dateKey, e.esNoche, e.h0, e.shiftDocId),
    h0: e.h0,
    shiftId: e.shiftId,
    esNoche: e.esNoche,
    equipo: equipoDelTurno(e.shiftDocId, e.esNoche, e.overrides, e.h0),
    cerrado: e.cerrado,
    piezas: e.piezas,
    dispMin,
    fallasN: rp.causas.filter((c) => c.dueno === 'mantencion').reduce((a, c) => a + c.count, 0),
    fallaMin,
    piezasMant: rp.pz.mantencion,
    ritmo: e.stat.producingMin > 0 ? e.piezas / e.stat.producingMin : null,
    microMinH: e.duelo.mic != null && dispMin != null && dispMin > 0 ? e.duelo.mic / nMaq / (dispMin / 60) : null,
    arranqueMin: e.arranque ? e.arranque.min : e.duelo.ini ?? null,
    arranqueModo: e.arranque?.modo ?? 'primera-pieza',
    iniProdMin: e.duelo.ini ?? null,
    ultimaHoraPz: e.duelo.uh ?? null,
    puestos: e.duelo.alim.map((p) => ({ clave: normalizar(p.n), etiqueta: etiquetaMaquina(p.n), llenado: p.f ?? null })),
  }
}

/** Cómo se mide el arranque de un turno y con qué serie minuto a minuto (si la hay). */
export interface OpcionesArranque {
  modo: ModoArranque
  serie?: SerieMinuto | null
}

/** Eviscerado (carros, Baader 142) arranca al 90 % del ritmo; el resto (Filete) con la primera pieza. */
export const modoArranqueDe = (unidad: 'carros' | 'silletas' | null): ModoArranque => (unidad === 'carros' ? 'ritmo90' : 'primera-pieza')

/**
 * El arranque de un turno cerrado, desde su inicio planificado (`dateKey` + `h0`). Con la serie minuto a minuto se mide al
 * minuto; sin ella, `primera-pieza` cae a `duelo.ini` (tramos de 5 min, mismo origen) y `ritmo90` queda en «sin dato».
 */
function arranqueDeStat(t: ShiftStat, o: OpcionesArranque): { modo: ModoArranque; min: number | null } {
  const inicioPlanMs = Date.parse(`${t.dateKey}T${t.duelo?.h0 ?? ''}:00Z`)
  const fino = arranqueDeTurno({ modo: o.modo, inicioPlanMs, serie: o.serie })
  return { modo: o.modo, min: fino ?? (o.modo === 'primera-pieza' ? t.duelo?.ini ?? null : null) }
}

/** Un turno cerrado de `shiftStats`; null si el backend todavía no lo rearmó con los datos del duelo. */
export function resumenDeStat(t: ShiftStat, overrides?: Readonly<Record<string, EquipoId>> | null, arranque?: OpcionesArranque): ResumenTurno | null {
  const esNoche = esNocheDesdeHora(t.duelo?.h0)
  if (!t.duelo || esNoche == null) return null
  return armarResumen({
    shiftDocId: t.shiftDocId, dateKey: t.dateKey, h0: t.duelo.h0 ?? null, shiftId: t.shiftId, esNoche, cerrado: true,
    piezas: t.total || 0, stat: t, duelo: t.duelo, overrides,
    ...(arranque ? { arranque: arranqueDeStat(t, arranque) } : {}),
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
  /** Modo y serie minuto a minuto para medir el arranque desde `scheduledStart`. Sin él, primera pieza por tramos de 5 min. */
  arranque?: OpcionesArranque
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
  const inicioPlanMs = Date.parse(live.scheduledStart ?? '')
  const arranque = args.arranque
    ? { modo: args.arranque.modo, min: arranqueDeTurno({ modo: args.arranque.modo, inicioPlanMs, serie: args.arranque.serie, tramos: live.series }) }
    : undefined
  return armarResumen({
    shiftDocId, dateKey: stat.dateKey, h0: live.scheduledStart?.slice(11, 16) ?? null, shiftId: stat.shiftId, esNoche, cerrado, piezas, stat,
    ...(arranque ? { arranque } : {}),
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
  /** El turno de A ya cerró: todos los puntos son firmes. */
  cerrado: boolean
  motivo: string | null
  /** Los KPI de cabecera (carrera, ritmo, micro, arranque y cierre). */
  kpis: KpiMarcador[]
  puestos: PuestoMarcador[]
  puntosA: number
  puntosB: number
  /** Cuántos puntos se pueden ganar en total (4 KPI + los puestos con dato en ambos). No es «en juego»: eso lo dice `puntajeJornada`. */
  puntosPosibles: number
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
 * `microEnVivo` hace lo mismo con la micro detención (min/h/máq. hasta el mismo minuto de producción).
 */
export function compararTurnos(a: ResumenTurno, b: ResumenTurno, opciones?: { carreraEnVivo?: { a: number; b: number } | null; microEnVivo?: { a: number; b: number } | null }): Marcador {
  const cerrado = a.cerrado
  if (a.dispMin != null && b.dispMin != null && cerrado) {
    const chico = Math.min(a.dispMin, b.dispMin)
    const grande = Math.max(a.dispMin, b.dispMin)
    if (grande > 0 && chico / grande < FRACCION_SIN_DUELO) {
      return { sinDuelo: true, cerrado, motivo: `Uno de los turnos tuvo menos del ${Math.round(FRACCION_SIN_DUELO * 100)} % de los minutos del otro`, kpis: [], puestos: [], puntosA: 0, puntosB: 0, puntosPosibles: 0, ganador: 'sin-duelo' }
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
    filas: [{ rotulo: enVivo ? 'Hechas a esta hora' : 'Piezas con Mantención sumada', a: carreraA, b: carreraB, unidad: 'pz', decimales: 0, mejor: 'mayor', ganador: comparar(carreraA, carreraB, 'mayor') }],
    ganador: !cerrado && !enVivo ? 'pendiente' : comparar(carreraA, carreraB, 'mayor'),
  }
  const ritmo: KpiMarcador = {
    id: 'ritmo',
    rotulo: 'Ritmo andando',
    nota: 'Piezas por minuto sobre los minutos con piezas.',
    filas: [{ rotulo: 'Ritmo', a: a.ritmo, b: b.ritmo, unidad: 'pz/min', decimales: 1, mejor: 'mayor', ganador: comparar(a.ritmo, b.ritmo, 'mayor', 1) }],
    ganador: comparar(a.ritmo, b.ritmo, 'mayor', 1),
  }
  /* En vivo, hasta el mismo minuto de producción: el 29-10 el rival cerrado entraba con su turno ENTERO (0,7 = 15,1 min en
     7,6 h) bajo el rótulo «hasta la misma hora»; a esa hora llevaba 12,8 min (0,9). */
  const microVivo = !cerrado ? opciones?.microEnVivo ?? null : null
  const microA = microVivo ? microVivo.a : a.microMinH
  const microB = microVivo ? microVivo.b : b.microMinH
  const micro: KpiMarcador = {
    id: 'micro',
    rotulo: 'Menos micro detenciones',
    nota: microVivo
      ? 'Minutos de micro detención por hora de producción, por máquina, hasta el mismo minuto de los dos turnos (clasificación oficial de Shoplogix).'
      : 'Minutos de micro detención por hora disponible, por máquina (clasificación oficial de Shoplogix).',
    filas: [{ rotulo: 'Micro detención', a: microA, b: microB, unidad: 'min/h', decimales: 1, mejor: 'menor', ganador: comparar(microA, microB, 'menor', 1) }],
    ganador: comparar(microA, microB, 'menor', 1),
  }
  const ganaArranque = comparar(a.arranqueMin, b.arranqueMin, 'menor')
  const ganaCierre: Resultado = !cerrado ? 'pendiente' : comparar(a.ultimaHoraPz, b.ultimaHoraPz, 'mayor')
  const al90 = a.arranqueModo === 'ritmo90'
  const arranque: KpiMarcador = {
    id: 'arranque',
    rotulo: 'Arranque y cierre',
    nota: `${al90 ? 'Minutos desde el inicio planificado hasta el 90 % del ritmo esperado' : 'Minutos desde el inicio planificado hasta la primera pieza'} y piezas de la última hora. Gana quien gana los dos.`,
    filas: [
      { rotulo: al90 ? 'Hasta el 90 % del ritmo' : 'Hasta la primera pieza', a: a.arranqueMin, b: b.arranqueMin, unidad: 'min', decimales: 0, mejor: 'menor', ganador: ganaArranque },
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
  const puntosPosibles = todos.filter((r) => r !== 'sin-dato').length
  return {
    sinDuelo: false, cerrado, motivo: null, kpis, puestos, puntosA, puntosB, puntosPosibles,
    ganador: !cerrado ? 'pendiente' : puntosA === puntosB ? 'empate' : puntosA > puntosB ? 'a' : 'b',
  }
}

// ── Puntaje de la jornada: firmes y en juego ─────────────────────────────────

/** Indicador que da punto: los cuatro KPI y la alimentación (un punto por puesto). «Minutos a buen ritmo» no está. */
export type IndicadorPunto = KpiId | 'alimentacion'

export interface PuntoEnJuego {
  indicador: IndicadorPunto
  rotulo: string
  /** Solo en `alimentacion`: el puesto («Ev 1»). */
  puesto?: string
  /** Quién va adelante hoy en ese indicador: `a` = el turno que se mira, `b` = su rival; null = parejos o sin dato todavía. */
  quienVaAdelante: 'a' | 'b' | null
}

export interface PuntajeJornada {
  /** Puntos ya decididos: carrera, ritmo y micro detención ganados. Con la jornada cerrada, todos los puntos. */
  firmes: { a: number; b: number }
  /** Puntos que todavía se juegan (arranque y cierre, alimentación; la carrera mientras no hay con qué comparar). */
  enJuego: number
  detalleEnJuego: PuntoEnJuego[]
  /** La jornada cerró: ya no hay nada en juego. */
  cerrada: boolean
}

const KPI_FIRMES: readonly KpiId[] = ['carrera', 'ritmo', 'micro']

/**
 * EL marcador de la jornada, el mismo para el PC y el celular. Los puntos firmes son los que no se reabren con el turno
 * corriendo (carrera, ritmo, micro detención); el arranque y cierre y la alimentación quedan «en juego» y se firman al
 * cierre, aunque hoy alguien vaya adelante. Con la jornada cerrada todo pasa a firme. Un «sin duelo» no tiene puntaje (null).
 */
export function puntajeJornada(m: Marcador | null | undefined): PuntajeJornada | null {
  if (!m || m.sinDuelo) return null
  if (m.cerrado) return { firmes: { a: m.puntosA, b: m.puntosB }, enJuego: 0, detalleEnJuego: [], cerrada: true }
  const firmes = { a: 0, b: 0 }
  const detalleEnJuego: PuntoEnJuego[] = []
  const adelante = (r: Resultado | undefined): 'a' | 'b' | null => (r === 'a' || r === 'b' ? r : null)
  for (const k of m.kpis) {
    if (KPI_FIRMES.includes(k.id)) {
      if (k.ganador === 'a') firmes.a += 1
      else if (k.ganador === 'b') firmes.b += 1
      else if (k.ganador === 'pendiente') detalleEnJuego.push({ indicador: k.id, rotulo: k.rotulo, quienVaAdelante: adelante(k.filas[0]?.ganador) })
    } else if (k.ganador !== 'sin-dato') {
      detalleEnJuego.push({ indicador: k.id, rotulo: k.rotulo, quienVaAdelante: adelante(k.filas[0]?.ganador) })
    }
  }
  for (const p of m.puestos) {
    if (p.ganador === 'sin-dato') continue
    detalleEnJuego.push({ indicador: 'alimentacion', rotulo: `Alimentación ${p.etiqueta}`, puesto: p.etiqueta, quienVaAdelante: adelante(p.ganador) })
  }
  return { firmes, enJuego: detalleEnJuego.length, detalleEnJuego, cerrada: false }
}

// ── Curvas ───────────────────────────────────────────────────────────────────

/** Hechas a los `min` minutos (interpolado); pasado el final, el total: ese turno ya terminó. */
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

/**
 * «Hechas a la misma hora»: UNA sola función para la cabecera, el indicador de carrera, la tabla, el globo y la TV. Lee la
 * curva acumulada del turno (la minuto a minuto si se tiene; si no, la compacta `cv`) en el MINUTO DE PRODUCCIÓN pedido
 * (1.ª hora = minutos 0 a 60 desde la primera pieza, no la hora de reloj) y devuelve piezas enteras. Pasado el final del
 * turno devuelve su total; sin curva, null.
 */
export function piezasALaMismaHora(serie: readonly PacePoint[], minutoDeProduccion: number): number | null {
  const v = piezasAlMinuto(serie, minutoDeProduccion)
  return v == null ? null : Math.round(v)
}

/**
 * Micro detención «hasta la misma hora»: los minutos de micro de las N máquinas hasta el minuto de producción pedido, ÷ las
 * horas transcurridas, ÷ N máquinas = minutos por hora por máquina. Es la fórmula de la cifra del duelo (0,7 y 1,2 min/h/máq.).
 * La hora a medias entra en proporción a lo transcurrido. null sin micro por hora, sin máquinas o con menos de un minuto.
 */
export function microALaMismaHora(
  h: readonly number[] | null | undefined,
  hastaMin: number,
  nMaquinas: number,
): { totalMin: number; horas: number; minPorHoraPorMaquina: number } | null {
  if (!h?.length || !(nMaquinas > 0) || !(hastaMin >= 1)) return null
  const horas = hastaMin / 60
  let total = 0
  for (let i = 0; i < h.length && i * 60 < hastaMin; i++) total += (h[i] ?? 0) * Math.min(1, (hastaMin - i * 60) / 60)
  return { totalMin: Math.round(total * 10) / 10, horas, minPorHoraPorMaquina: total / horas / nMaquinas }
}

/** Las dos micro (hoy y rival) al mismo minuto, para `compararTurnos`; null si a alguno le falta la micro por hora. */
export function microEnVivoDe(m: MicroHorasDuelo | null | undefined, minuto: number): { a: number; b: number } | null {
  if (!m) return null
  const a = microALaMismaHora(m.hoy, minuto, m.nHoy)
  const b = microALaMismaHora(m.rival, minuto, m.nRival)
  return a && b ? { a: a.minPorHoraPorMaquina, b: b.minPorHoraPorMaquina } : null
}

/** Micro por hora de producción de hoy y de su rival (backend `mantencion.microH` / `duelo.micH`) y cuántas Baader cuenta cada uno. */
export interface MicroHorasDuelo {
  hoy: number[] | null
  rival: number[] | null
  nHoy: number
  nRival: number
}

export interface PuntoVentaja {
  /** Minuto de producción. */
  minuto: number
  /** Hechas de cada equipo a ese minuto (`piezasALaMismaHora`). */
  hechas: Record<EquipoId, number>
  /** Quién va adelante (N adelante / N atrás); null = parejos. */
  lider: EquipoId | null
  /** Piezas de ventaja del líder (siempre ≥ 0). */
  ventaja: number
}

/**
 * La serie de ventaja a la misma hora, minuto a minuto de producción desde 0 hasta `hastaMin`: para la carrera v6 (línea
 * de ventaja, quién lidera y por cuánto en cada instante). Mismos valores que el indicador, porque sale de la misma función.
 */
export function serieVentaja(
  a: { equipo: EquipoId; curva: readonly PacePoint[] },
  b: { equipo: EquipoId; curva: readonly PacePoint[] },
  hastaMin: number,
  pasoMin = 1,
): PuntoVentaja[] {
  if (a.equipo === b.equipo || a.curva.length < 2 || b.curva.length < 2 || !(hastaMin > 0) || !(pasoMin > 0)) return []
  const out: PuntoVentaja[] = []
  const punto = (minuto: number): PuntoVentaja => {
    const pa = piezasALaMismaHora(a.curva, minuto) ?? 0
    const pb = piezasALaMismaHora(b.curva, minuto) ?? 0
    return {
      minuto,
      hechas: { [a.equipo]: pa, [b.equipo]: pb } as Record<EquipoId, number>,
      lider: pa === pb ? null : pa > pb ? a.equipo : b.equipo,
      ventaja: Math.abs(pa - pb),
    }
  }
  for (let m = 0; m < hastaMin; m += pasoMin) out.push(punto(m))
  out.push(punto(hastaMin))
  return out
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
      return noche === hoy.esNoche && jornadaDe(f.shiftDocId.slice(0, 10), noche, horaDe(f.shiftDocId), f.shiftDocId) < hoy.jornada && equipoDelTurno(f.shiftDocId, noche, overrides, horaDe(f.shiftDocId)) === hoy.equipo
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
  /** Sus detenciones de 5 min o más, ya en el eje de horas de producción. */
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
  const equipo = equipoDelTurno(rc.shiftDocId, esNoche, overrides, rc.h0)
  if (equipo === hoy.equipo) return null
  const jornada = jornadaDe(rc.dateKey, esNoche, rc.h0, rc.shiftDocId)
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
 * `shiftStats[].duelo.cv` a puntos de curva (mismo eje que `rivalCurve`: minutos desde el arranque productivo). Vacío
 * si el turno no trae curva o el paso es inválido.
 */
export function curvaDeCv(d: Pick<ShiftDuelo, 'cv' | 'cvp' | 'cvm'> | null | undefined): PacePoint[] {
  const cv = d?.cv
  const paso = d?.cvp
  if (!cv || cv.length < 2 || !paso || !(paso > 0)) return []
  const fin = d?.cvm != null && d.cvm > (cv.length - 1) * paso ? d.cvm : cv.length * paso
  return cv.map((pieces, i) => ({ minutes: i === cv.length - 1 ? fin : (i + 1) * paso, pieces }))
}

/**
 * La línea punteada de un turno que ya pasó (o de cualquier turno si `rivalCurve` no está): la curva compacta del
 * rival directo de la MISMA jornada, de `shiftStats[].duelo.cv`. El rival lo decide `rivalDirecto` (otro horario, misma
 * jornada, otro equipo); aquí solo se arma. null si ese turno no trae curva.
 */
export function fantasmaDeStat(rival: ResumenTurno, stats: readonly ShiftStat[]): FantasmaRival | null {
  const st = stats.find((x) => x.shiftDocId === rival.shiftDocId)
  const curva = curvaDeCv(st?.duelo)
  if (!st || curva.length < 2) return null
  return {
    tipo: 'jornada',
    equipo: rival.equipo, shiftDocId: rival.shiftDocId, jornada: rival.jornada, esNoche: rival.esNoche,
    curva, total: curva[curva.length - 1]!.pieces, turnos: 1,
    ...datosDeArranque(st),
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
        && jornadaDe(id.slice(0, 10), noche, horaDe(id), id) < hoy.jornada
        && equipoDelTurno(id, noche, overrides, horaDe(id)) === rival
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
      fantasma: { ...base, tipo: 'ultimo', shiftDocId: ultimo.id, jornada: jornadaDe(ultimo.id.slice(0, 10), hoy.esNoche, horaDe(ultimo.id), ultimo.id), curva: ultimo.curva, total: ultimo.f?.total ?? null, turnos: 1, ...datosDeArranque(stats.find((x) => x.shiftDocId === ultimo.id)) },
      banda,
    }
  }
  if (banda) return { fantasma: { ...base, tipo: 'promedio', shiftDocId: null, jornada: null, curva: banda.media, total: null, turnos: banda.turnos, inicioMin: null, eventos: [] }, banda }
  return { fantasma: null, banda: null }
}

/** Arranque productivo, reloj y detenciones de un turno cerrado, a partir de su `shiftStats[].duelo`. */
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

// ── Horas de producción y detenciones del turno ─────────────────────────────────
//
// REGLA DEL EJE: las dos curvas parten de la PRIMERA PIEZA de su turno (arranque productivo), así que «1ª hora» es el
// primer tramo de 60 min desde ahí, para los dos equipos. Las detenciones se corren a ese mismo eje restándoles los
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

/** Detención de 5 min o más tal como la publica el backend (`shiftStats[].duelo.ev`). */
export interface EventoCrudo {
  n: string
  /** Minutos desde el inicio planificado. */
  o: number
  d: number
  p?: 1
}

/** Una detención ubicada en el eje de horas de producción de su turno. */
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
 * Corre las detenciones del eje «desde el inicio planificado» al de horas de producción: se resta el arranque (`ini`).
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

/** Mínimo de una detención para marcarla (igual que el backend). */
export const PARADA_MIN_SEG = 300

/**
 * Las detenciones del turno que se está mirando, con el MISMO criterio que `eventosDelDuelo` del backend: unidas entre
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
 * marcas de la curva, así que incluye las detenciones de esa hora: es el ritmo de la hora, no el de «andando».
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

export type PeriodoCosto = 'hoy' | 'ciclo'

export interface CostoPeriodo {
  /** `hoy` = la jornada que se mira (la noche y el día); `ciclo` = las dos semanas del ciclo en curso. */
  periodo: PeriodoCosto
  /** Para el rótulo: «jornada 28/10» o «ciclo 26/10 al 08/11». */
  etiqueta: string
  inicio: string
  fin: string
  equipos: Record<EquipoId, CostoEquipo>
}

const ddmm = (k: string) => `${k.slice(8, 10)}/${k.slice(5, 7)}`

/**
 * El costo de Mantención con el período a la vista, de UNA sola fuente (`piezasMant` / `fallaMin` de cada ResumenTurno):
 * `hoy` = los turnos de la jornada de `hoy`; `ciclo` = los del ciclo de dos semanas de `hoy`. `resumenes` trae los turnos
 * cerrados y el que se mira (aunque siga corriendo: su costo es hasta ahora).
 */
export function costoDeMantencionPeriodo(resumenes: readonly ResumenTurno[], hoy: Pick<ResumenTurno, 'jornada'>, periodo: PeriodoCosto): CostoPeriodo {
  const ciclo = cicloDe(hoy.jornada)
  const delPeriodo = resumenes.filter((r) => (periodo === 'hoy' ? r.jornada === hoy.jornada : cicloDe(r.jornada).indice === ciclo.indice))
  return {
    periodo,
    etiqueta: periodo === 'hoy' ? `jornada ${ddmm(hoy.jornada)}` : `ciclo ${ddmm(ciclo.inicio)} al ${ddmm(ciclo.fin)}`,
    inicio: periodo === 'hoy' ? hoy.jornada : ciclo.inicio,
    fin: periodo === 'hoy' ? hoy.jornada : ciclo.fin,
    equipos: costoMantencion(delPeriodo),
  }
}

// ── Corte, detenciones y proyección de la carrera ────────────────────────────

/** El corte que comparten el carril «Detenciones ≥ 5 min» y «Por qué se perdió tiempo»: el rótulo lo dice tal cual. */
export interface CorteDuelo {
  /** El turno sigue corriendo: la cifra es «hasta ahora». */
  hastaAhora: boolean
  /** Minuto de producción hasta donde se cuenta. En curso = el último tramo de 5 min CERRADO (como `timeBreakdown`). */
  minuto: number
  /** Hora de producción (1, 2, 3…) a la que cae el corte. */
  hora: number
  etiqueta: string
}

const TRAMO_CERRADO_MIN = 5

export function corteDelDuelo(cerrado: boolean, minutoAhora: number): CorteDuelo {
  const minuto = cerrado ? Math.max(0, Math.round(minutoAhora)) : Math.max(0, Math.floor(minutoAhora / TRAMO_CERRADO_MIN) * TRAMO_CERRADO_MIN)
  const hora = horaTranscurrida(minuto)
  return {
    hastaAhora: !cerrado, minuto, hora,
    etiqueta: cerrado ? `turno completo · ${minuto} min de producción` : `hasta ahora · minuto ${minuto} de producción (${etiquetaHora(hora)})`,
  }
}

/** Deja las detenciones que caen antes del corte, recortando la que lo cruza. Cerrado: tal cual. */
export function detencionesHastaElCorte(eventos: readonly EventoTurno[], corte: CorteDuelo): EventoTurno[] {
  if (!corte.hastaAhora) return [...eventos]
  return eventos.filter((e) => e.desde < corte.minuto).map((e) => ({ ...e, hasta: Math.min(e.hasta, corte.minuto) }))
}

export type DuenoDetencion = 'mantencion' | 'externo' | 'sin-imputar' | 'prog'

/** Una detención de 5 min o más para pintarla como pin en la carrera. */
export interface DetencionPin {
  /** Minuto de producción en que empieza. */
  desdeMin: number
  hastaMin: number
  duracionMin: number
  causa: string
  corta: string
  programada: boolean
  /** Falla técnica: la causa es de equipos (Mantención) y no es programada. */
  fallaTecnica: boolean
  dueno: DuenoDetencion
}

export function pinesDeDetenciones(eventos: readonly EventoTurno[]): DetencionPin[] {
  return eventos.map((e) => {
    const d = duenoDe(e.causa).dueno
    const dueno: DuenoDetencion = e.programada ? 'prog' : d === 'mantencion' ? 'mantencion' : d === 'externo' ? 'externo' : 'sin-imputar'
    return {
      desdeMin: e.desde, hastaMin: e.hasta, duracionMin: Math.max(0, e.hasta - e.desde), causa: e.causa, corta: e.corta,
      programada: e.programada, fallaTecnica: dueno === 'mantencion', dueno,
    }
  })
}

/** Los últimos minutos con los que se mide «el ritmo de ahora» (el de la proyección y el de la frase de empate). */
export const VENTANA_RITMO_ACTUAL_MIN = 30

/** pz/min de los últimos `ventanaMin` minutos de la curva; null con menos de 5 minutos de curva. */
export function ritmoActualDeCurva(curva: readonly PacePoint[], ventanaMin = VENTANA_RITMO_ACTUAL_MIN): number | null {
  if (curva.length < 2) return null
  const fin = curva[curva.length - 1]!.minutes
  const ini = Math.max(0, fin - ventanaMin)
  if (fin - ini < 5) return null
  return ((piezasAlMinuto(curva, fin) ?? 0) - (piezasAlMinuto(curva, ini) ?? 0)) / (fin - ini)
}

export interface ProyeccionEquipo {
  equipo: EquipoId
  /** Hechas hasta ahora (o al cierre, si el turno cerró). */
  hechas: number
  /** pz/min de los últimos 30 min; null en un turno cerrado o sin curva. */
  ritmoActual: number | null
  /** Minutos de producción que le quedan al turno; 0 si cerró; null si no se sabe cuándo termina. */
  minutosQueQuedan: number | null
  /** Hechas + ritmo actual × minutos que quedan; cerrado = sus hechas; null si falta un dato. */
  proyeccion: number | null
  /** Lo máximo que puede rendir la línea (la suma de lo esperado de sus máquinas); null si no se sabe. */
  techo: number | null
  cerrado: boolean
  /** La proyección es la «Al cierre» de El turno (`oficial`), no la de 30 min de la curva. */
  oficial?: boolean
}

export function proyeccionAlCierre(o: {
  equipo: EquipoId
  curva: readonly PacePoint[]
  hechas: number
  /** Minuto de producción de ahora. */
  minuto: number
  /** Minuto de producción en que termina el turno planificado. */
  finPrevistoMin: number | null
  cerrado: boolean
  techo: number | null
  /**
   * «Al cierre» de El turno (contador + ritmo × minutos productivos que quedan). Manda sobre la de 30 min: el 29-10 el mismo
   * turno decía 14.182 en El turno y ≈ 14.662 en el Duelo (antes, 14.172 contra 13.216). El ritmo pasa a ser el implícito.
   */
  oficial?: number | null
}): ProyeccionEquipo {
  if (o.cerrado) return { equipo: o.equipo, hechas: o.hechas, ritmoActual: null, minutosQueQuedan: 0, proyeccion: o.hechas, techo: o.techo, cerrado: true }
  const minutosQueQuedan = o.finPrevistoMin != null ? Math.max(0, o.finPrevistoMin - o.minuto) : null
  if (o.oficial != null && Number.isFinite(o.oficial) && minutosQueQuedan != null && minutosQueQuedan > 0) {
    const proyeccion = Math.max(o.hechas, o.oficial)
    return {
      equipo: o.equipo, hechas: o.hechas, ritmoActual: (proyeccion - o.hechas) / minutosQueQuedan, minutosQueQuedan,
      techo: o.techo, cerrado: false, proyeccion, oficial: true,
    }
  }
  const ritmoActual = ritmoActualDeCurva(o.curva)
  return {
    equipo: o.equipo, hechas: o.hechas, ritmoActual, minutosQueQuedan, techo: o.techo, cerrado: false,
    proyeccion: ritmoActual != null && minutosQueQuedan != null ? o.hechas + ritmoActual * minutosQueQuedan : null,
  }
}

/** «Necesita 37,8 pz/min en 1 h 19 min; va a 37,2; su techo es 42,2»: lo que le falta al que va atrás para alcanzar la meta del otro. */
export interface FraseEmpate {
  /** El que va atrás (proyección menor) y su rival. */
  equipo: EquipoId
  rival: EquipoId
  /** La meta: lo que el rival hizo (cerrado) o proyecta al cierre. */
  metaPz: number
  hechas: number
  minutosQueQuedan: number
  /** (meta − hechas) ÷ minutos que quedan. */
  necesitaPzMin: number
  ritmoActual: number | null
  techo: number | null
  /** ¿Lo que necesita cabe bajo el techo de la línea? null si no se conoce el techo. */
  alcanzable: boolean | null
}

/** null si alguna proyección falta, van parejos o el que va atrás ya cerró (no puede hacer nada). Usa piezas brutas, sin las de Mantención. */
export function fraseDeEmpate(a: ProyeccionEquipo, b: ProyeccionEquipo): FraseEmpate | null {
  if (a.proyeccion == null || b.proyeccion == null || Math.round(a.proyeccion) === Math.round(b.proyeccion)) return null
  const [atras, rival] = a.proyeccion < b.proyeccion ? [a, b] : [b, a]
  if (atras.cerrado || atras.minutosQueQuedan == null || !(atras.minutosQueQuedan > 0)) return null
  const necesitaPzMin = (rival.proyeccion! - atras.hechas) / atras.minutosQueQuedan
  return {
    equipo: atras.equipo, rival: rival.equipo, metaPz: Math.round(rival.proyeccion!), hechas: atras.hechas,
    minutosQueQuedan: atras.minutosQueQuedan, necesitaPzMin, ritmoActual: atras.ritmoActual, techo: atras.techo,
    alcanzable: atras.techo != null ? necesitaPzMin <= atras.techo : null,
  }
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
  /** Detenciones de hoy en el eje de horas de producción, hasta el `corte`. */
  eventosHoy: EventoTurno[]
  /** El corte de las detenciones y de «Por qué se perdió tiempo»: es el mismo y se rotula igual. */
  corte: CorteDuelo
  /** Detenciones de 5 min o más de cada equipo (hoy hasta el corte; el rival, su turno completo) para pintarlas como pines. */
  detenciones: Partial<Record<EquipoId, DetencionPin[]>>
  /** Ventaja a la misma hora, minuto a minuto de producción (vacía sin la curva del rival). */
  ventaja: PuntoVentaja[]
  /** Proyección al cierre de cada equipo (ritmo actual × minutos que quedan); el rival que cerró proyecta lo que hizo. */
  proyeccion: Partial<Record<EquipoId, ProyeccionEquipo>>
  /** Lo que necesita el que va atrás para alcanzar al otro; null si no hay con qué calcularla. */
  fraseEmpate: FraseEmpate | null
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
  /** Las hechas de ese turno a esta misma hora de producción. */
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
  /** Micro por hora de hoy y del rival: con el día corriendo, el marcador la compara al mismo minuto (`microEnVivoDe`). */
  microHoras?: MicroHorasDuelo | null
  marcador: Marcador | null
  carrera: CarreraDuelo | null
  semanaAnterior: SemanaAnterior | null
  ciclo: CicloDuelo
  cicloPrevio: CicloDuelo
  rachas: Record<EquipoId, Racha>
  records: RecordTurno[]
  /** El puntaje de la jornada (firmes y en juego), el mismo para PC y celular; null sin rival o sin duelo. */
  puntaje: PuntajeJornada | null
  /** Costo de Mantención del CICLO en curso (dos semanas), y el de la JORNADA que se mira: cada uno dice su período. */
  costo: CostoPeriodo
  costoHoy: CostoPeriodo
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
  /** Serie minuto a minuto del turno que se mira: mide el arranque al 90 % del ritmo (Eviscerado). */
  serieHoy?: SerieMinuto | null
  /** Series archivadas de los últimos turnos (`seriesMinuto`): el arranque de los turnos del rival. */
  series?: ReadonlyArray<SerieMinuto & { shiftDocId: string }> | null
  overrides?: Readonly<Record<string, EquipoId>> | null
  /** Quién y cuándo corrigió cada turno (`monitor_config.duelo.overridesMeta`). */
  overridesMeta?: Readonly<Record<string, CorreccionMeta>> | null
  /** «Al cierre» de El turno (`pace.projectedPieces`): UNA proyección en todo el monitor. */
  proyeccionOficial?: number | null
}

/** El techo de la línea: la suma de lo esperado (`targetCpm`) de sus máquinas; null si alguna no lo trae (no se inventa). */
export function techoDeLinea(live: Pick<PublicMonitorLive, 'machines'>): number | null {
  const ms = live.machines ?? []
  return ms.length > 0 && ms.every((m) => (m.targetCpm ?? 0) > 0) ? ms.reduce((a, m) => a + (m.targetCpm ?? 0), 0) : null
}

/** Junta todo lo que la tarjeta y la pestaña muestran. null si el turno no trae su hora de inicio. */
export function construirDuelo(e: EntradaDuelo): DatosDuelo | null {
  const modo = modoArranqueDe(unidadDeMaquinas(e.live.machines))
  const hoy = resumenDeLive({ shiftDocId: e.shiftDocId, live: e.live, piezas: e.piezas, cerrado: e.cerrado, overrides: e.overrides, arranque: { modo, serie: e.serieHoy } })
  if (!hoy) return null

  const deStats = e.stats
    .map((s) => resumenDeStat(s, e.overrides, { modo, serie: e.series?.find((x) => x.shiftDocId === s.shiftDocId) }))
    .filter((r): r is ResumenTurno => r != null && r.shiftDocId !== hoy.shiftDocId)
  /* Para el ciclo, los récords y el costo, el turno de hoy cuenta si ya cerró. */
  const cerrados = hoy.cerrado ? [...deStats, hoy] : deStats
  const duelos = duelosDeTurnos(cerrados)

  /* La NOCHE abre la jornada y no compite con nadie mientras corre: el rival (el día de la misma fecha) juega después.
     Cerrada, se compara solo si su día ya cerró. El DÍA corre contra la noche de su jornada, que ya cerró. */
  const abreJornada = hoy.esNoche
  const rival = abreJornada && !hoy.cerrado ? null : rivalDirecto(hoy, deStats)
  const esperando = abreJornada && hoy.cerrado && !rival ? otroEquipo(hoy.equipo) : null
  const inicioDia = [...deStats].filter((r) => !r.esNoche && r.h0).sort((x, y) => (antes(x, y) ? 1 : -1))[0]?.h0 ?? null

  /* La línea punteada: el día corre contra la noche de su jornada con `rivalCurve` (más resolución, solo del turno
     vigente) y, si no está, con la curva compacta del rival en `shiftStats`. Un turno PASADO no tiene `rivalCurve`:
     usa siempre la compacta. La noche que corre no compite; la noche cerrada se compara con su día si ya existe. */
  const fantasmaInfo = abreJornada && !hoy.cerrado
    ? null
    : (abreJornada ? null : fantasmaDeJornada(hoy, e.rivalCurve, e.stats, e.overrides)) ?? (rival ? fantasmaDeStat(rival, e.stats) : null)
  const fantasma = fantasmaInfo ? fantasmaInfo.curva : null

  /* El total y el punto actual son el contador EN VIVO, no el último tramo cerrado de la curva. */
  const primeraPieza = desdePrimeraPieza(e.live.series).find((p) => (p.pieces ?? 0) > 0)
  const t0 = primeraPieza?.t ? Date.parse(primeraPieza.t) : NaN
  const ahoraMin = e.ahoraMs != null && Number.isFinite(t0) ? (e.ahoraMs - t0) / 60_000 : null
  const curvaHoy = curvaConContador(e.curvaHoy, e.piezas, ahoraMin)
  const minuto = curvaHoy.length ? curvaHoy[curvaHoy.length - 1]!.minutes : 0
  const hoyPz = e.piezas > 0 ? e.piezas : curvaHoy.length ? curvaHoy[curvaHoy.length - 1]!.pieces : 0
  const fantasmaPz = fantasma && fantasma.length ? piezasALaMismaHora(fantasma, minuto) : null

  /* A igual tiempo de turno solo si el fantasma ES el rival del marcador. */
  const mismoRival = rival != null && fantasmaInfo != null && fantasmaInfo.shiftDocId === rival.shiftDocId
  const statHoy = e.stats.find((s) => s.shiftDocId === hoy.shiftDocId)
  const statRival = rival ? e.stats.find((s) => s.shiftDocId === rival.shiftDocId) : null
  const microH = (h: number[] | null | undefined) => (Array.isArray(h) && h.length > 0 ? h : null)
  const microHoras: MicroHorasDuelo | null = rival
    ? {
        hoy: microH(e.live.mantencion?.microH) ?? microH(statHoy?.duelo?.micH),
        rival: microH(statRival?.duelo?.micH),
        nHoy: Math.max(1, hoy.puestos.length),
        nRival: Math.max(1, rival.puestos.length),
      }
    : null
  const marcador = rival
    ? compararTurnos(hoy, rival, {
        carreraEnVivo: !hoy.cerrado && fantasmaPz != null && mismoRival ? { a: hoy.piezas, b: fantasmaPz } : null,
        microEnVivo: !hoy.cerrado ? microEnVivoDe(microHoras, minuto) : null,
      })
    : null

  /* Dato secundario, sin puntos: el mismo horario de la semana anterior. No aplica a la noche que corre sola. */
  const mismoHorario = referenciaMismoHorario(hoy, e.forecast, e.stats, e.overrides)
  const propia = fantasmaInfo ? null : referenciaPropia(hoy, e.forecast, e.stats, e.overrides)
  const banda = fantasmaInfo ? mismoHorario.banda : propia
  const semanaAnterior: SemanaAnterior | null = mismoHorario.fantasma && !(abreJornada && !hoy.cerrado)
    ? (() => {
        const pzAHora = mismoHorario.fantasma.curva.length ? piezasALaMismaHora(mismoHorario.fantasma.curva, minuto) : null
        return {
          fantasma: mismoHorario.fantasma,
          pzAHora,
          diferencia: pzAHora != null && curvaHoy.length ? hoyPz - pzAHora : null,
        }
      })()
    : null

  const corte = corteDelDuelo(hoy.cerrado, minuto)
  const eventosHoy = detencionesHastaElCorte(eventosEnEjeProduccion(eventosCrudosDeLive(e.live), hoy.iniProdMin), corte)
  const finPlanMs = Date.parse(e.live.plannedEnd ?? e.live.scheduledEnd ?? '')
  const finPrevistoMin = Number.isFinite(finPlanMs) && Number.isFinite(t0) ? (finPlanMs - t0) / 60_000 : null
  const techo = techoDeLinea(e.live)
  const proyHoy = proyeccionAlCierre({ equipo: hoy.equipo, curva: curvaHoy, hechas: hoyPz, minuto, finPrevistoMin, cerrado: hoy.cerrado, techo, oficial: e.proyeccionOficial })
  const rivalEq = otroEquipo(hoy.equipo)
  const proyRival: ProyeccionEquipo | null = fantasmaInfo && fantasmaInfo.total != null
    ? { equipo: rivalEq, hechas: fantasmaInfo.total, ritmoActual: null, minutosQueQuedan: 0, proyeccion: fantasmaInfo.total, techo, cerrado: true }
    : null
  const carrera: CarreraDuelo | null = curvaHoy.length
    ? {
        hoy: curvaHoy, fantasma, fantasmaInfo, rivalEquipo: rivalEq, banda, bandaPropia: fantasmaInfo == null,
        ritmoHoras: ritmoHoraAHora(curvaHoy, fantasma ?? []),
        eventosHoy, corte,
        detenciones: { [hoy.equipo]: pinesDeDetenciones(eventosHoy), ...(fantasmaInfo ? { [rivalEq]: pinesDeDetenciones(fantasmaInfo.eventos) } : {}) },
        ventaja: fantasma ? serieVentaja({ equipo: hoy.equipo, curva: curvaHoy }, { equipo: rivalEq, curva: fantasma }, minuto) : [],
        proyeccion: { [hoy.equipo]: proyHoy, ...(proyRival ? { [rivalEq]: proyRival } : {}) },
        fraseEmpate: proyRival ? fraseDeEmpate(proyHoy, proyRival) : null,
        minuto, hora: horaTranscurrida(minuto),
        hoyPz, fantasmaPz,
        diferencia: fantasmaPz != null ? hoyPz - fantasmaPz : null,
      }
    : null

  const ciclo = cicloDe(hoy.jornada)
  const hoyIndice = ciclo.indice
  /* El costo cuenta el turno que se mira aunque siga corriendo (hasta ahora): ciclo y jornada salen de la misma lista. */
  const paraCosto = [...deStats, hoy]
  return {
    hoy, rival, abreJornada, esperando, inicioDia, marcador, carrera, semanaAnterior, microHoras,
    ciclo: marcadorDeCiclo(duelos, hoyIndice, hoyIndice),
    cicloPrevio: marcadorDeCiclo(duelos, hoyIndice - 1, hoyIndice),
    rachas: rachasPorEquipo(duelos),
    records: recordsDe(duelos),
    puntaje: puntajeJornada(marcador),
    costo: costoDeMantencionPeriodo(paraCosto, hoy, 'ciclo'),
    costoHoy: costoDeMantencionPeriodo(paraCosto, hoy, 'hoy'),
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
