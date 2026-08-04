/**
 * Resumen ejecutivo de un turno — el modelo que alimenta el PNG y la primera
 * página del PDF.
 *
 * POR QUÉ EXISTE
 * --------------
 * La exportación anterior apilaba todo lo que había (timeline, KPIs, pausas,
 * gates, causas, upstream) sin jerarquía ni conclusión. Sirve como registro
 * técnico; no sirve para entregarle a alguien que tiene tres minutos.
 *
 * Este módulo responde cuatro preguntas EN ORDEN, que es como las hace quien
 * recibe el reporte:
 *
 *   1. ¿Cómo fue el turno?      → `verdict`
 *   2. ¿Por qué?                → `cause` + `machines`
 *   3. ¿Qué hizo Mantención?    → `maintenance`
 *   4. ¿Qué se necesita?        → `ask`
 *
 * Es LÓGICA PURA a propósito: recibe datos ya cargados y devuelve texto y
 * números. Así el veredicto se puede testear con turnos reales sin renderizar
 * nada, y los dos renderers (PNG y PDF) consumen exactamente el mismo modelo —
 * si divergen, es un bug del renderer, no dos verdades distintas.
 *
 * PRINCIPIO DE REDACCIÓN: nunca afirmar más de lo que el dato soporta. Cuando
 * falta el Excel del Grader no hay piezas ni P0, así que el resumen lo DICE en
 * vez de imprimir una sección vacía o, peor, un cero que se lee como "no hubo".
 */

import type { GraderDailySummary } from '@/services/grader/types'
import type { UpstreamLineSnapshot, UpstreamMachineShift } from '@/services/shoplogix/types'

/** Qué tan mal salió el turno. Ordena el color y el tono del encabezado. */
export type TurnSeverity = 'ok' | 'warn' | 'critical'

/**
 * De qué lado del OEE vino la pérdida. Es la pregunta que decide a quién llamar.
 *
 * `ninguna` existe porque el default NO puede ser un culpable: sin esta opción,
 * un turno sano al 95 % de ritmo caía en `'ritmo'` y el resumen afirmaba que
 * había corrido por debajo del objetivo. Un reporte que inventa una pérdida
 * inexistente es peor que uno que no dice nada.
 */
export type LossDriver = 'disponibilidad' | 'ritmo' | 'calidad' | 'ninguna' | 'sin-datos'

/** Bajo este ritmo (% del objetivo del sensor) se considera que hubo pérdida. */
const RATE_LOSS_THRESHOLD = 80
/** Bajo este uptime se considera que la pérdida vino de disponibilidad. */
const UPTIME_LOSS_THRESHOLD = 80

export interface ExecutiveKpi {
  label: string
  value: string
  /** El contexto que hace legible el número: "de 7 h 09 de turno". */
  context: string
  tone: 'ok' | 'warn' | 'bad' | 'neutral'
}

export interface ExecutiveMachineRow {
  name: string
  cycles: number
  uptimePct: number | null
  /** Ritmo real vs objetivo del sensor, 0-100. */
  ratePct: number | null
  /** Etiqueta corta de estado: "parada", "41%", … */
  flag: string
  stopped: boolean
}

export interface ExecutiveSummary {
  title: string
  subtitle: string
  severity: TurnSeverity

  /** Una frase. Lo primero que se lee y lo único que algunos van a leer. */
  verdict: string
  /** Dos o tres líneas que sostienen el veredicto con números. */
  verdictDetail: string

  kpis: ExecutiveKpi[]
  machines: ExecutiveMachineRow[]
  /** De dónde salió la pérdida, en una línea. */
  cause: string
  lossDriver: LossDriver

  /** Lo que hizo Mantención, cuantificado. La meta del proyecto, en el papel. */
  maintenance: string[]
  /** El pedido concreto con el que termina la hoja. */
  ask: string

  /** "Shoplogix · sin Excel del Grader cargado" — de dónde salió todo esto. */
  sourceNote: string
  generatedAt: Date
}

export interface BuildExecutiveSummaryInput {
  summary: GraderDailySummary
  upstream?: UpstreamLineSnapshot | null
  /** Nombre legible del turno, ya sin el sufijo de día ("Turno 1"). */
  shiftLabel: string
  /** Ventana real del turno. */
  start?: Date | null
  end?: Date | null
  /** Confiabilidad ya calculada por la app — no se recalcula acá. */
  reliability?: {
    mttrMacroSec: number
    mtbfSec: number
    macroCount: number
    microCount: number
    microSec: number
  } | null
  /** Uptime de la línea 0-100. */
  uptimePct?: number | null
  now?: Date
}

// ── formato ───────────────────────────────────────────────────────────────────

const nf = (n: number) => Math.round(n).toLocaleString('es-CL')
const pct = (n: number) => `${Math.round(n)}%`

function hhmm(d: Date): string {
  return `${String(d.getUTCHours()).padStart(2, '0')}:${String(d.getUTCMinutes()).padStart(2, '0')}`
}

/** "7 h 09". Duración en minutos → texto para el subtítulo. */
export function formatDuration(min: number): string {
  const h = Math.floor(min / 60)
  const m = Math.round(min % 60)
  return h > 0 ? `${h} h ${String(m).padStart(2, '0')}` : `${m} min`
}

function minutesBetween(a: Date, b: Date): number {
  return Math.max(0, (b.getTime() - a.getTime()) / 60_000)
}

// ── construcción ──────────────────────────────────────────────────────────────

/**
 * Ordena las máquinas por producción y marca las paradas.
 *
 * Una máquina en 0 ciclos NO es "la que menos produjo": es capacidad que nunca
 * entró en línea, y merece decirse distinto — es la diferencia entre un
 * problema de ritmo y un problema de arranque.
 */
function buildMachineRows(machines: readonly UpstreamMachineShift[]): ExecutiveMachineRow[] {
  return [...machines]
    .sort((a, b) => b.totalCycles - a.totalCycles)
    .map(m => {
      const stopped = m.totalCycles === 0
      const ratePct = m.expectedTotalCycles > 0
        ? (m.totalCycles / m.expectedTotalCycles) * 100
        : null
      const uptimePct = typeof m.actualRuntime === 'number' ? m.actualRuntime * 100 : null
      return {
        name: m.machineName,
        cycles: m.totalCycles,
        uptimePct,
        ratePct,
        flag: stopped ? 'parada' : ratePct != null ? pct(ratePct) : '—',
        stopped,
      }
    })
}

/**
 * De qué lado del OEE vino la pérdida.
 *
 * Se mira primero DISPONIBILIDAD porque es la que se arregla distinto: si la
 * máquina no estuvo encendida, acelerarla no sirve de nada. Solo cuando el
 * tiempo estuvo disponible tiene sentido hablar de ritmo.
 */
function resolveLossDriver(
  machines: readonly ExecutiveMachineRow[],
  uptimePct: number | null | undefined,
): LossDriver {
  if (machines.length === 0 && uptimePct == null) return 'sin-datos'

  // Disponibilidad primero: si la máquina no estuvo encendida, acelerarla no
  // sirve. Una parada total manda sobre cualquier otra consideración.
  if (machines.some(m => m.stopped)) return 'disponibilidad'
  if (uptimePct != null && uptimePct < UPTIME_LOSS_THRESHOLD) return 'disponibilidad'

  // El tiempo estuvo disponible: recién acá tiene sentido mirar el ritmo.
  const rates = machines.map(m => m.ratePct).filter((r): r is number => r != null)
  if (rates.length > 0) {
    const avg = rates.reduce((a, b) => a + b, 0) / rates.length
    if (avg < RATE_LOSS_THRESHOLD) return 'ritmo'
  }

  // Ni paros ni ritmo bajo: no hubo pérdida que atribuir.
  return 'ninguna'
}

/**
 * El veredicto en una frase. Es lo primero que se lee y, para mucha gente, lo
 * único — así que nombra la causa, no solo el resultado.
 */
function buildVerdict(
  machines: readonly ExecutiveMachineRow[],
  driver: LossDriver,
  uptimePct: number | null | undefined,
): { verdict: string; severity: TurnSeverity } {
  const stopped = machines.filter(m => m.stopped)

  if (stopped.length > 0) {
    const names = stopped.map(m => m.name).join(' y ')
    const verbo = stopped.length === 1 ? 'no produjo un solo ciclo' : 'no produjeron un solo ciclo'
    return {
      verdict: `Turno perdido por parada de máquina: ${names} ${verbo}.`,
      severity: 'critical',
    }
  }
  if (uptimePct != null && uptimePct < 50) {
    return {
      verdict: `Turno con la línea detenida más de la mitad del tiempo (${pct(uptimePct)} de uptime).`,
      severity: 'critical',
    }
  }
  if (driver === 'ritmo') {
    return {
      verdict: 'La línea estuvo disponible pero corrió por debajo de su objetivo de ritmo.',
      severity: 'warn',
    }
  }
  if (driver === 'disponibilidad' && uptimePct != null) {
    return {
      verdict: `Turno con paros frecuentes: ${pct(uptimePct)} de uptime sobre el tiempo de turno.`,
      severity: 'warn',
    }
  }
  return { verdict: 'Turno sin incidencias que comprometieran la producción.', severity: 'ok' }
}

/**
 * Lo que hizo Mantención, en números.
 *
 * Existe porque el reporte anterior dejaba invisible el trabajo: un turno malo
 * y una respuesta rápida son DOS hechos distintos, y el formato viejo solo
 * mostraba el primero. Un MTTR bajo con muchas averías dice que la línea pidió
 * ayuda seguido y la tuvo.
 */
function buildMaintenance(rel: BuildExecutiveSummaryInput['reliability']): string[] {
  if (!rel || (rel.macroCount === 0 && rel.microCount === 0)) {
    return ['Sin averías registradas en el turno.']
  }
  const out: string[] = []
  if (rel.macroCount > 0) {
    const mttrMin = rel.mttrMacroSec / 60
    out.push(
      `${rel.macroCount} aver${rel.macroCount === 1 ? 'ía atendida' : 'ías atendidas'} y resueltas, ` +
      `con ${mttrMin.toFixed(1).replace('.', ',')} min de reparación promedio.`,
    )
  }
  if (rel.microCount > 0) {
    const microMin = rel.microSec / 60
    out.push(
      `${rel.microCount} micro-detenciones absorbidas en ${microMin.toFixed(1).replace('.', ',')} min totales.`,
    )
  }
  if (rel.mtbfSec > 0) {
    const mtbfMin = rel.mtbfSec / 60
    out.push(
      `Tiempo entre averías: ${formatDuration(mtbfMin)}. La línea pidió intervención cada ` +
      `${formatDuration(mtbfMin)} y la tuvo.`,
    )
  }
  return out
}

/** El pedido con el que cierra la hoja. Siempre accionable, nunca un gráfico. */
function buildAsk(
  machines: readonly ExecutiveMachineRow[],
  driver: LossDriver,
  rel: BuildExecutiveSummaryInput['reliability'],
): string {
  const stopped = machines.filter(m => m.stopped)
  const mttrMin = rel && rel.mttrMacroSec > 0 ? rel.mttrMacroSec / 60 : null

  if (stopped.length > 0) {
    const names = stopped.map(m => m.name).join(' y ')
    const coda = mttrMin != null
      ? ` Con MTTR de ${mttrMin.toFixed(1).replace('.', ',')} min, el problema no es la velocidad de respuesta: es que esa capacidad no entró en servicio.`
      : ''
    return `Diagnóstico de ${names} antes del próximo turno.${coda}`
  }
  if (driver === 'ritmo') {
    return 'Revisar alimentación aguas arriba: el tiempo estuvo disponible, las piezas no llegaron al ritmo objetivo.'
  }
  if (driver === 'disponibilidad') {
    return 'Revisar las causas de paro más repetidas del turno para atacar la disponibilidad, que es donde está la pérdida.'
  }
  return 'Sin acción pendiente de Mantención para este turno.'
}

export function buildExecutiveSummary(input: BuildExecutiveSummaryInput): ExecutiveSummary {
  const { summary, upstream, shiftLabel, start, end, reliability, uptimePct, now } = input

  const machines = buildMachineRows(upstream?.machines ?? [])
  const lossDriver = resolveLossDriver(machines, uptimePct)
  const { verdict, severity } = buildVerdict(machines, lossDriver, uptimePct)

  const durationMin = start && end ? minutesBetween(start, end) : null
  const windowText = start && end
    ? `${hhmm(start)} → ${hhmm(end)}${durationMin != null ? ` · ${formatDuration(durationMin)}` : ''}`
    : 'sin ventana registrada'

  const totalCycles = machines.reduce((a, m) => a + m.cycles, 0)
  const expected = upstream?.machines.reduce((a, m) => a + m.expectedTotalCycles, 0) ?? 0

  // Detalle del veredicto: los números que lo sostienen. Solo se afirma la
  // brecha cuando hay un esperado con el que compararla.
  const detailParts: string[] = []
  if (totalCycles > 0 && expected > 0) {
    detailParts.push(
      `Se procesaron ${nf(totalCycles)} de los ~${nf(expected)} ciclos esperados para el turno.`,
    )
  } else if (totalCycles > 0) {
    detailParts.push(`Se procesaron ${nf(totalCycles)} ciclos.`)
  }
  if (machines.some(m => m.stopped)) {
    detailParts.push('La brecha no es de ritmo: es capacidad que nunca entró en línea.')
  }

  // KPIs con su contexto. Un porcentaje suelto no dice nada.
  const kpis: ExecutiveKpi[] = []
  if (uptimePct != null) {
    kpis.push({
      label: 'Disponibilidad',
      value: pct(uptimePct),
      context: durationMin != null ? `de ${formatDuration(durationMin)} de turno` : 'del turno',
      tone: uptimePct < 50 ? 'bad' : uptimePct < 75 ? 'warn' : 'ok',
    })
  }
  if (expected > 0) {
    const ratio = (totalCycles / expected) * 100
    kpis.push({
      label: 'Ritmo',
      value: pct(ratio),
      context: 'vs objetivo del sensor',
      tone: ratio < 50 ? 'bad' : ratio < 80 ? 'warn' : 'ok',
    })
  }
  if (reliability && reliability.macroCount > 0) {
    const mttrMin = reliability.mttrMacroSec / 60
    kpis.push({
      label: 'MTTR',
      value: `${mttrMin.toFixed(1).replace('.', ',')} min`,
      context: 'reparación por avería',
      // MTTR bajo es BUENO — es el único KPI de la hoja donde menos es mejor.
      tone: mttrMin <= 10 ? 'ok' : mttrMin <= 30 ? 'warn' : 'bad',
    })
    kpis.push({
      label: 'Averías',
      value: String(reliability.macroCount),
      context: reliability.microCount > 0
        ? `+${reliability.microCount} micro (${(reliability.microSec / 60).toFixed(1).replace('.', ',')} min)`
        : 'macro (≥5 min)',
      tone: reliability.macroCount > 10 ? 'warn' : 'neutral',
    })
  }

  // Causa: se nombra la máquina que más arrastra, con su número.
  let cause: string
  const worst = machines.find(m => m.stopped) ?? machines[machines.length - 1]
  if (worst?.stopped) {
    cause = `${worst.name} no registró producción: es la capacidad que falta para explicar la brecha del turno.`
  } else if (worst && worst.ratePct != null) {
    cause = `${worst.name} es la que más arrastra, con ${pct(worst.ratePct)} de su objetivo de ritmo.`
  } else {
    cause = 'Sin datos por máquina para atribuir la pérdida.'
  }

  const hasGrader = summary.totalPieces > 0
  const sourceNote = hasGrader
    ? 'Fuente: Grader (Marelec) + Shoplogix'
    : 'Fuente: Shoplogix · sin Excel del Grader cargado'

  return {
    title: `${shiftLabel} · ${summary.dateKey}`,
    subtitle: windowText,
    severity,
    verdict,
    verdictDetail: detailParts.join(' '),
    kpis,
    machines,
    cause,
    lossDriver,
    maintenance: buildMaintenance(reliability),
    ask: buildAsk(machines, lossDriver, reliability),
    sourceNote,
    generatedAt: now ?? new Date(),
  }
}
