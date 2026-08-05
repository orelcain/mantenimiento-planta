/**
 * Comparativo de período — el resumen que contesta "¿vamos mejor?".
 *
 * POR QUÉ EXISTE
 * --------------
 * El resumen de turno (`graderExecutiveSummary`) explica UN turno. Un turno
 * aislado nunca puede demostrar mejora continua: para eso hace falta mirar el
 * mes. Esta es la hoja que se entrega después del turno malo, cuando la
 * pregunta deja de ser "¿qué pasó?" y pasa a ser "¿esto va mejorando?".
 *
 * LA DECISIÓN QUE ORDENA TODO EL TEXTO
 * ------------------------------------
 * Separar lo que Mantención controla de lo que no. MTTR, averías resueltas y
 * micro-detenciones absorbidas son resultado del trabajo de Mantención. Cuántas
 * máquinas arrancaron el turno, no. Mezclarlos produce el reporte de siempre —
 * "el mes estuvo malo"— que no dice a quién le toca hacer qué.
 *
 * NO INVENTAR TENDENCIAS. Con dos turnos no hay tendencia, hay dos puntos. El
 * veredicto lo dice en vez de dibujar una flecha hacia arriba: un comparativo
 * que afirma mejora sin datos para sostenerla se desarma en la primera pregunta
 * y se lleva puesta la credibilidad del resto de la hoja.
 *
 * Es LÓGICA PURA: recibe lo ya cargado y calculado (turnos, stats mensuales,
 * confiabilidad) y devuelve texto y números. Los renderers —PNG y PDF— consumen
 * este mismo modelo, así que no pueden contar dos historias del mismo mes.
 */

import type { PeriodShift } from '@/services/grader/graderShiftPeriod'
import type { PeriodMonthlyStats } from '@/services/grader/graderPeriodMonthlyStats'
import type { ExecutiveKpi, TurnSeverity } from '@/services/grader/graderExecutiveSummary'
import { displayShiftName } from '@/services/grader/graderShiftDisplay'

/**
 * Cuántos turnos hacen falta para hablar de tendencia. Por debajo de esto la
 * hoja describe lo que hubo, sin proyectar.
 */
const MIN_SHIFTS_FOR_TREND = 4
/** Diferencia de uptime (puntos) entre mitades para llamarlo mejora o caída. */
const TREND_DELTA_PTS = 8
/** Sobre esta amplitud entre el mejor y el peor turno, el mes es "disparejo". */
const SPREAD_PTS = 25
/** Turnos mínimos de un grupo para poder compararlo con otro grupo. */
const MIN_SHIFTS_TO_RANK_GROUP = 3
/** Bajo esta diferencia de uptime, dos turnos andan igual y no se rankean. */
const MIN_SPREAD_TO_RANK = 3
/** Bajo este uptime promedio, el techo del período sigue siendo disponibilidad. */
const HEALTHY_UPTIME_PCT = 75
/** Más filas que esto no caben legibles: la tabla pasa a agregar por turno. */
const MAX_DETAIL_ROWS = 12

export type PeriodTrend = 'mejora' | 'cae' | 'parejo' | 'dispar' | 'sin-tendencia' | 'sin-datos'

export interface PeriodRow {
  label: string
  cycles: number
  uptimePct: number | null
  /** Averías macro atribuidas. `null` cuando ese turno no tiene Excel cargado. */
  breakdowns: number | null
  /** Etiqueta corta de estado: "mejor del mes", "máquina parada", … */
  flag: string
  tone: 'ok' | 'warn' | 'bad' | 'neutral'
}

export interface PeriodSummary {
  title: string
  subtitle: string
  severity: TurnSeverity

  /** Una frase sobre cómo evolucionó el período. */
  verdict: string
  verdictDetail: string
  trend: PeriodTrend

  /** KPIs del aporte acumulado de Mantención. */
  kpis: ExecutiveKpi[]

  tableTitle: string
  rows: PeriodRow[]
  /** `turnos` = una fila por turno; `agregado` = una fila por tipo de turno. */
  rowsMode: 'turnos' | 'agregado'
  /** Qué se está mostrando y qué quedó fuera. Nunca se recorta en silencio. */
  rowsNote: string

  /** Lo que los datos permiten concluir, separando responsabilidades. */
  ask: string
  sourceNote: string
  generatedAt: Date
}

export interface BuildPeriodSummaryInput {
  shifts: readonly PeriodShift[]
  /** Stats del panel mensual. Se reciben para que la hoja y la app no discrepen. */
  stats: PeriodMonthlyStats | null
  /** Cualquier fecha dentro del mes que se reporta. */
  monthDate: Date
  /** "P. Principal · Eviscerado". */
  areaLabel: string
  /** Confiabilidad agregada del período, ya calculada por la app. */
  reliability?: {
    mttrMacroSec: number
    mtbfSec: number
    macroCount: number
    microCount: number
    microSec: number
    shiftsWithData: number
  } | null
  /** Averías macro por turno, indexadas por `PeriodShift.key`. */
  breakdownsByShiftKey?: ReadonlyMap<string, number>
  now?: Date
}

// ── formato ───────────────────────────────────────────────────────────────────

const nf = (n: number) => Math.round(n).toLocaleString('es-CL')
const pct = (n: number) => `${Math.round(n)}%`
const dec1 = (n: number) => n.toFixed(1).replace('.', ',')

/** "3 ago" — etiqueta corta de un dateKey, sin construir Date en hora local. */
function shortDate(dateKey: string): string {
  const [, m, d] = dateKey.split('-')
  const meses = ['ene', 'feb', 'mar', 'abr', 'may', 'jun', 'jul', 'ago', 'sep', 'oct', 'nov', 'dic']
  return `${Number(d)} ${meses[Number(m) - 1] ?? ''}`.trim()
}

function monthTitle(d: Date): string {
  // `toLocaleDateString` devuelve "agosto de 2026"; el "de" sobra en un título.
  const t = d.toLocaleDateString('es-CL', { month: 'long', year: 'numeric' }).replace(' de ', ' ')
  return t.charAt(0).toUpperCase() + t.slice(1)
}

function mean(xs: readonly number[]): number {
  return xs.length ? xs.reduce((a, b) => a + b, 0) / xs.length : 0
}

/**
 * Mediana. Se usa para comparar mitades del período porque la media se deja
 * arrastrar por un turno suelto: un mes que subió de 45 % a 80 % con una
 * catástrofe el último día daba delta +7 con media (o sea "sin tendencia") y da
 * +17 con mediana, que es lo que efectivamente pasó.
 */
function median(xs: readonly number[]): number {
  if (xs.length === 0) return 0
  const s = [...xs].sort((a, b) => a - b)
  const mid = Math.floor(s.length / 2)
  return s.length % 2 ? s[mid]! : (s[mid - 1]! + s[mid]!) / 2
}

// ── tendencia ─────────────────────────────────────────────────────────────────

/**
 * Compara la primera mitad del período contra la segunda.
 *
 * Se usan MITADES y no el primero contra el último porque un solo turno malo al
 * final daría "empeora" en un mes que mejoró. Y se comparan por MEDIANA, no por
 * media, por lo mismo: un outlier no debe decidir la conclusión del mes.
 * Con pocos turnos ni siquiera se intenta: se devuelve `sin-tendencia`, que la
 * hoja dice con todas las letras.
 */
function resolveTrend(uptimes: readonly number[]): {
  trend: PeriodTrend
  deltaPts: number
  spreadPts: number
} {
  if (uptimes.length === 0) return { trend: 'sin-datos', deltaPts: 0, spreadPts: 0 }
  const spreadPts = Math.max(...uptimes) - Math.min(...uptimes)
  if (uptimes.length < MIN_SHIFTS_FOR_TREND) {
    return { trend: 'sin-tendencia', deltaPts: 0, spreadPts }
  }
  const mid = Math.floor(uptimes.length / 2)
  const deltaPts = median(uptimes.slice(mid)) - median(uptimes.slice(0, mid))
  if (deltaPts >= TREND_DELTA_PTS) return { trend: 'mejora', deltaPts, spreadPts }
  if (deltaPts <= -TREND_DELTA_PTS) return { trend: 'cae', deltaPts, spreadPts }
  if (spreadPts >= SPREAD_PTS) return { trend: 'dispar', deltaPts, spreadPts }
  return { trend: 'parejo', deltaPts, spreadPts }
}

function buildVerdict(
  trend: PeriodTrend,
  uptimes: readonly number[],
  deltaPts: number,
): { verdict: string; severity: TurnSeverity } {
  const n = uptimes.length
  const avg = mean(uptimes)

  switch (trend) {
    case 'sin-datos':
      return {
        verdict: 'Sin turnos con producción registrada en el período.',
        severity: 'warn',
      }
    case 'sin-tendencia':
      return {
        verdict: `Con ${n} turno${n === 1 ? '' : 's'} con datos, el período todavía no permite hablar de tendencia.`,
        severity: 'warn',
      }
    case 'mejora':
      return {
        verdict: `El período mejora: la disponibilidad sube ${Math.round(deltaPts)} puntos entre la primera y la segunda mitad del mes.`,
        severity: 'ok',
      }
    case 'cae':
      return {
        verdict: `El período empeora: la disponibilidad cae ${Math.round(Math.abs(deltaPts))} puntos entre la primera y la segunda mitad del mes.`,
        severity: 'critical',
      }
    case 'dispar':
      return {
        verdict: `Turnos muy dispares: la disponibilidad va de ${pct(Math.min(...uptimes))} a ${pct(Math.max(...uptimes))} dentro del mismo mes.`,
        severity: 'warn',
      }
    default:
      return {
        verdict: `El período se mantiene parejo, en torno a ${pct(avg)} de disponibilidad.`,
        severity: avg >= 75 ? 'ok' : avg >= 50 ? 'warn' : 'critical',
      }
  }
}

// ── filas ─────────────────────────────────────────────────────────────────────

function shiftUptime(s: PeriodShift): number | null {
  return s.uptimePct
}

/** Un turno donde alguna máquina no registró un solo ciclo. */
function hasStoppedMachine(s: PeriodShift): boolean {
  return s.machines.some(m => m.totalCycles === 0)
}

function buildDetailRows(
  ranked: readonly PeriodShift[],
  best: PeriodMonthlyStats['bestShift'],
  worst: PeriodMonthlyStats['worstShift'],
  breakdowns: ReadonlyMap<string, number> | undefined,
): PeriodRow[] {
  return ranked.map(s => {
    const isBest = !!best && best.dateKey === s.dateKey && best.shiftId === s.shiftId
    const isWorst = !!worst && worst.dateKey === s.dateKey && worst.shiftId === s.shiftId
    const stopped = hasStoppedMachine(s)

    // El orden importa: una máquina parada explica el turno mejor que "peor del
    // mes", que solo lo rankea. Se nombra la causa antes que la posición.
    let flag = '—'
    let tone: PeriodRow['tone'] = 'neutral'
    if (stopped) { flag = 'máquina parada'; tone = 'bad' }
    else if (isWorst) { flag = 'peor del mes'; tone = 'bad' }
    else if (isBest) { flag = 'mejor del mes'; tone = 'ok' }

    return {
      label: `${shortDate(s.dateKey)} · ${displayShiftName(s.shiftId)}`,
      cycles: s.attributedCycles ?? s.cycles,
      uptimePct: shiftUptime(s),
      breakdowns: breakdowns?.get(s.key) ?? null,
      flag,
      tone,
    }
  })
}

/**
 * Cuando el mes tiene demasiados turnos para listarlos, se agrupa por TIPO de
 * turno (Turno 1 / 2 / 3).
 *
 * No es un recorte disfrazado: contesta la pregunta que un mes completo hace
 * interesante —¿hay un turno que anda peor que los otros?— que la lista larga
 * esconde justamente por ser larga.
 */
function buildAggregateRows(
  ranked: readonly PeriodShift[],
  breakdowns: ReadonlyMap<string, number> | undefined,
): PeriodRow[] {
  const byShift = new Map<string, { cycles: number; ups: number[]; brk: number | null; n: number }>()
  for (const s of ranked) {
    const name = displayShiftName(s.shiftId)
    const e = byShift.get(name) ?? { cycles: 0, ups: [], brk: null, n: 0 }
    e.cycles += s.attributedCycles ?? s.cycles
    const u = shiftUptime(s)
    if (u != null) e.ups.push(u)
    const b = breakdowns?.get(s.key)
    if (b != null) e.brk = (e.brk ?? 0) + b
    e.n += 1
    byShift.set(name, e)
  }

  const rows = [...byShift.entries()].map(([name, e]) => ({
    label: `${name} · ${e.n} turno${e.n === 1 ? '' : 's'}`,
    cycles: e.cycles,
    uptimePct: e.ups.length ? mean(e.ups) : null,
    breakdowns: e.brk,
    flag: '—',
    tone: 'neutral' as PeriodRow['tone'],
    shiftCount: e.n,
  }))
  rows.sort((a, b) => b.cycles - a.cycles)

  // El peor y el mejor por disponibilidad, que es la comparación que se busca.
  // Solo si la diferencia es real: etiquetar "más disponible" un 59 % frente a
  // un 58 % inventa una conclusión donde los dos turnos andan igual.
  // Un grupo de un solo turno no representa a ese turno: llamarlo "el menos
  // disponible del mes" convierte un registro suelto en un patrón. Julio de Yal
  // tenía 24 turnos del Turno 2 y UNO del Turno 1 — y ese uno se llevaba la
  // etiqueta.
  const conUptime = rows.filter(r => r.uptimePct != null && r.shiftCount >= MIN_SHIFTS_TO_RANK_GROUP)
  const spread = conUptime.length > 1
    ? Math.max(...conUptime.map(r => r.uptimePct!)) - Math.min(...conUptime.map(r => r.uptimePct!))
    : 0
  if (conUptime.length > 1 && spread >= MIN_SPREAD_TO_RANK) {
    const peor = conUptime.reduce((a, b) => (a.uptimePct! <= b.uptimePct! ? a : b))
    const mejor = conUptime.reduce((a, b) => (a.uptimePct! >= b.uptimePct! ? a : b))
    peor.flag = 'menos disponible'
    peor.tone = 'bad'
    mejor.flag = 'más disponible'
    mejor.tone = 'ok'
  }
  return rows.map(({ shiftCount: _n, ...r }) => r)
}

// ── KPIs ──────────────────────────────────────────────────────────────────────

/**
 * El aporte acumulado de Mantención, en números.
 *
 * Va SIEMPRE, incluso sin datos: una hoja que omite la sección cuando no hay
 * Excel cargado se lee como "Mantención no hizo nada", que es exactamente lo
 * contrario de lo que pasó. Sin datos, el papel dice que faltan datos.
 */
function buildKpis(rel: BuildPeriodSummaryInput['reliability']): ExecutiveKpi[] {
  if (!rel || rel.shiftsWithData === 0) return []

  const kpis: ExecutiveKpi[] = []
  kpis.push({
    label: 'Averías resueltas',
    value: String(rel.macroCount),
    context: `en ${rel.shiftsWithData} turno${rel.shiftsWithData === 1 ? '' : 's'} con Excel`,
    tone: rel.macroCount > 0 ? 'ok' : 'neutral',
  })
  if (rel.macroCount > 0) {
    const mttrMin = rel.mttrMacroSec / 60
    kpis.push({
      label: 'MTTR promedio',
      value: `${dec1(mttrMin)} min`,
      context: 'reparación por avería',
      // Menos es mejor: es el único KPI de la hoja donde el número bajo es bueno.
      tone: mttrMin <= 10 ? 'ok' : mttrMin <= 30 ? 'warn' : 'bad',
    })
  }
  if (rel.microCount > 0) {
    const microMin = rel.microSec / 60
    kpis.push({
      label: 'Micro-detenciones',
      value: String(rel.microCount),
      context: `${dec1(microMin)} min absorbidos`,
      tone: 'warn',
    })
  }
  return kpis
}

// ── construcción ──────────────────────────────────────────────────────────────

export function buildPeriodSummary(input: BuildPeriodSummaryInput): PeriodSummary {
  const { shifts, stats, monthDate, areaLabel, reliability, breakdownsByShiftKey, now } = input

  // Mismo criterio que el panel mensual: turnos reales con producción, en orden
  // cronológico para que "primera mitad vs segunda" signifique algo.
  const ranked = shifts
    .filter(s => !s.unscheduled && s.cycles > 0)
    .slice()
    .sort((a, b) => (a.dateKey === b.dateKey
      ? a.shiftId.localeCompare(b.shiftId)
      : a.dateKey.localeCompare(b.dateKey)))

  const uptimes = ranked.map(shiftUptime).filter((u): u is number => u != null)
  const { trend, deltaPts } = resolveTrend(uptimes)
  const { verdict, severity } = buildVerdict(trend, uptimes, deltaPts)

  // Rango real cubierto, no el mes calendario: decir "1 – 31 de agosto" cuando
  // solo se procesó hasta el 4 sobredimensiona el período.
  const first = ranked[0]?.dateKey
  const last = ranked[ranked.length - 1]?.dateKey
  // "1 – 5 ago", no "1 ago – 5 ago": repetir el mes en ambos extremos es ruido
  // cuando el período es un mes calendario, que es siempre.
  const rangeText = (() => {
    if (!first || !last) return 'sin turnos con datos'
    if (first === last) return shortDate(first)
    const sameMonth = first.slice(0, 7) === last.slice(0, 7)
    return sameMonth
      ? `${Number(first.slice(8))} – ${shortDate(last)}`
      : `${shortDate(first)} – ${shortDate(last)}`
  })()
  const subtitle = `${ranked.length} turno${ranked.length === 1 ? '' : 's'} con proceso · ${rangeText}`

  // Detalle del veredicto: dónde está el techo. Las máquinas que no arrancan son
  // lo que Mantención NO controla, y por eso se cuentan aparte.
  const stoppedShifts = ranked.filter(hasStoppedMachine).length
  const detailParts: string[] = []
  const totalCycles = stats?.totalCycles ?? ranked.reduce((a, s) => a + (s.attributedCycles ?? s.cycles), 0)
  if (totalCycles > 0) {
    detailParts.push(`${nf(totalCycles)} ciclos procesados en el período.`)
  }
  if (stoppedShifts > 0) {
    detailParts.push(
      `En ${stoppedShifts} de ${ranked.length} turnos al menos una máquina no registró un solo ciclo: ` +
      'ahí está el techo, y no es tiempo de reparación.',
    )
  } else if (uptimes.length > 0 && trend !== 'sin-tendencia') {
    detailParts.push(`Disponibilidad promedio del período: ${pct(mean(uptimes))}.`)
  }

  // Tabla: detalle mientras se pueda leer; agregada por tipo de turno cuando no.
  const useDetail = ranked.length <= MAX_DETAIL_ROWS
  const rows = useDetail
    ? buildDetailRows(ranked, stats?.bestShift ?? null, stats?.worstShift ?? null, breakdownsByShiftKey)
    : buildAggregateRows(ranked, breakdownsByShiftKey)
  const rowsNote = useDetail
    ? `${ranked.length} turno${ranked.length === 1 ? '' : 's'} con producción en el período.`
    : `${ranked.length} turnos agrupados por tipo de turno — la matriz del período los muestra uno a uno.`

  // El cierre: qué controla Mantención y qué no. Es la conclusión de la hoja.
  let ask: string
  const avgUptime = uptimes.length ? mean(uptimes) : null
  const mttrMin = reliability && reliability.macroCount > 0 ? reliability.mttrMacroSec / 60 : null
  if (trend === 'sin-datos') {
    ask = 'Sin turnos procesados no hay período que comparar. Cargar los datos del mes para poder medir la tendencia.'
  } else if (stoppedShifts > 0 && mttrMin != null) {
    ask = `Mantención responde en ${dec1(mttrMin)} min por avería y sostiene ese ritmo. ` +
      `El techo del período no está en la reparación: está en cuántas máquinas arrancan el turno ` +
      `(${stoppedShifts} de ${ranked.length} arrancaron con una máquina fuera).`
  } else if (stoppedShifts > 0) {
    ask = `El techo del período no está en la reparación: en ${stoppedShifts} de ${ranked.length} turnos ` +
      'al menos una máquina no entró en servicio. Ahí está la capacidad que falta.'
  } else if (mttrMin != null && avgUptime != null && avgUptime < HEALTHY_UPTIME_PCT) {
    // Ninguna máquina en cero, pero la línea igual estuvo detenida buena parte
    // del tiempo. Decir "disponibilidad resuelta" con este uptime sería falso:
    // el techo sigue ahí, solo que en paros cortos y repetidos.
    ask = `Mantención sostiene ${dec1(mttrMin)} min de reparación por avería. ` +
      `Con ${pct(avgUptime)} de disponibilidad promedio, la pérdida no está en cuánto demora cada ` +
      'reparación sino en cuántas veces hay que hacerla: el paso siguiente es atacar las causas de paro más repetidas.'
  } else if (mttrMin != null) {
    ask = `Mantención sostiene ${dec1(mttrMin)} min de reparación por avería y la línea estuvo disponible ` +
      `${avgUptime != null ? pct(avgUptime) : 'la mayor parte'} del tiempo. ` +
      'Con la disponibilidad resuelta, la mejora siguiente está aguas arriba, en la alimentación de la línea.'
  } else {
    ask = 'Sin averías registradas en el período. Para medir el aporte de Mantención hace falta el Excel del Grader de cada turno.'
  }

  const withGrader = reliability?.shiftsWithData ?? 0
  const sourceNote = withGrader > 0
    ? `Fuente: Shoplogix + Grader (${withGrader} de ${ranked.length} turnos con Excel)`
    : 'Fuente: Shoplogix · sin Excel del Grader en el período'

  return {
    title: `${monthTitle(monthDate)} · ${areaLabel}`,
    subtitle,
    severity,
    verdict,
    verdictDetail: detailParts.join(' '),
    trend,
    kpis: buildKpis(reliability),
    tableTitle: useDetail ? 'TURNOS DEL PERÍODO' : 'RESUMEN POR TIPO DE TURNO',
    rows,
    rowsMode: useDetail ? 'turnos' : 'agregado',
    rowsNote,
    ask,
    sourceNote,
    generatedAt: now ?? new Date(),
  }
}
