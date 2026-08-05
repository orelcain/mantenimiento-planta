/**
 * Tests del comparativo de período.
 *
 * Lo que se protege acá no es el layout: es que la hoja NO AFIRME más de lo que
 * el dato sostiene. Los tres bugs que encontró la revisión visual —declarar la
 * disponibilidad "resuelta" con 58 % de uptime, rankear dos turnos que andan
 * igual, y hablar de tendencia con tres turnos— tienen su caso acá para que no
 * vuelvan.
 */
import { describe, it, expect } from 'vitest'
import { buildPeriodSummary } from '../graderPeriodSummary'
import { computePeriodMonthlyStats } from '../graderPeriodMonthlyStats'
import { getShiftMeta } from '../graderShiftDisplay'
import type { PeriodShift } from '../graderShiftPeriod'

const wall = (s: string) => new Date(`${s}.000Z`)
const NOW = wall('2026-08-20T12:00:00')
const MONTH = new Date(2026, 7, 1)

function machine(name: string, cycles: number, runtime: number) {
  return {
    machineid: name, name, totalCycles: cycles, uptimeSec: Math.round(runtime * 8 * 3600),
    shiftRuntime: runtime, overallRatio: cycles / 8420, expectedTotalCycles: 8420,
    breakdown: null, stateAggregates: null,
  } as PeriodShift['machines'][number]
}

function shift(
  dateKey: string, shiftId: string, cycles: number, uptimePct: number,
  opts: { stopped?: boolean } = {},
): PeriodShift {
  const machines = opts.stopped
    ? [machine('Baader 1', cycles, uptimePct / 100), machine('Baader 2', 0, 0)]
    : [machine('Baader 1', Math.round(cycles / 2), uptimePct / 100),
       machine('Baader 2', Math.round(cycles / 2), uptimePct / 100)]
  return {
    key: `${dateKey}__${shiftId}`, dateKey, shiftId, meta: getShiftMeta(shiftId),
    start: wall(`${dateKey}T08:00:00`), end: wall(`${dateKey}T16:00:00`),
    windowSource: 'effective', startDayOffset: 0, endDayOffset: 0, crossesMidnight: false,
    endDateKey: dateKey, durationMin: 480,
    cycles, uptimePct, expectedCycles: 16840, uptimeSec: Math.round((uptimePct / 100) * 8 * 3600),
    machines, pieces: null, p0Pieces: null, p0Pct: null,
    hasSlx: true, hasGrader: false, lowActivity: false, unscheduled: false,
  }
}

const rel = (over: Partial<Parameters<typeof buildPeriodSummary>[0]['reliability'] & object> = {}) => ({
  mttrMacroSec: 300, mtbfSec: 1800, macroCount: 20, microCount: 50, microSec: 1500,
  shiftsWithData: 5, ...over,
})

type Rel = Parameters<typeof buildPeriodSummary>[0]['reliability']
function build(shifts: PeriodShift[], reliability: Rel = rel()) {
  return buildPeriodSummary({
    shifts, stats: computePeriodMonthlyStats(shifts), monthDate: MONTH,
    areaLabel: 'P. Principal · Eviscerado', reliability, now: NOW,
  })
}

/** N turnos con rampa lineal de uptime. */
function ramp(n: number, from: number, to: number): PeriodShift[] {
  return Array.from({ length: n }, (_, i) => {
    const up = from + ((to - from) * i) / Math.max(1, n - 1)
    const day = String(1 + Math.floor(i / 2)).padStart(2, '0')
    return shift(`2026-08-${day}`, i % 2 === 0 ? 'Turno 1' : 'Turno 2', Math.round(up * 60), up)
  })
}

describe('buildPeriodSummary · veredicto', () => {
  it('no habla de tendencia con menos de 4 turnos', () => {
    const s = build([
      shift('2026-08-01', 'Turno 2', 2397, 69),
      shift('2026-08-03', 'Turno 1', 4013, 40),
      shift('2026-08-03', 'Turno 2', 1880, 26),
    ])
    expect(s.trend).toBe('sin-tendencia')
    expect(s.verdict).toContain('no permite hablar de tendencia')
    // Aunque el rango 26-69 % sea amplio, no se reporta como "dispar": con tres
    // puntos esa afirmación tampoco se sostiene.
    expect(s.verdict).not.toContain('dispares')
  })

  it('detecta mejora comparando mitades, no primero contra último', () => {
    const s = build(ramp(10, 48, 82))
    expect(s.trend).toBe('mejora')
    expect(s.severity).toBe('ok')
    expect(s.verdict).toMatch(/sube \d+ puntos/)
  })

  it('detecta caída', () => {
    const s = build(ramp(10, 84, 46))
    expect(s.trend).toBe('cae')
    expect(s.severity).toBe('critical')
  })

  it('un turno malo al final no convierte un mes que mejora en uno que empeora', () => {
    const s = build([...ramp(9, 45, 80), shift('2026-08-09', 'Turno 2', 600, 10)])
    expect(s.trend).toBe('mejora')
  })

  it('llama disparejo al mes con mitades iguales pero turnos muy distintos', () => {
    const s = build([
      shift('2026-08-01', 'Turno 1', 4800, 80),
      shift('2026-08-01', 'Turno 2', 1800, 30),
      shift('2026-08-02', 'Turno 1', 4680, 78),
      shift('2026-08-02', 'Turno 2', 1920, 32),
    ])
    expect(s.trend).toBe('dispar')
    expect(s.verdict).toContain('30%')
    expect(s.verdict).toContain('80%')
  })

  it('sin turnos lo dice, en vez de mostrar ceros', () => {
    const s = build([], null)
    expect(s.trend).toBe('sin-datos')
    expect(s.rows).toHaveLength(0)
    expect(s.kpis).toHaveLength(0)
    expect(s.ask).toContain('Cargar los datos')
  })

  it('ignora los bloques Unscheduled y los turnos sin producción', () => {
    const uns = { ...shift('2026-08-05', 'Unscheduled', 9999, 90), unscheduled: true }
    const vacio = shift('2026-08-06', 'Turno 3', 0, 0)
    const s = build([...ramp(4, 60, 70), uns, vacio])
    expect(s.rows).toHaveLength(4)
    expect(s.subtitle).toContain('4 turnos con proceso')
  })
})

describe('buildPeriodSummary · lo que NO puede afirmar', () => {
  it('no declara la disponibilidad resuelta cuando el uptime promedio es bajo', () => {
    // Ninguna máquina en cero, pero la línea corrió al 58 %: decir "resuelta"
    // sería falso, y era exactamente lo que hacía la primera versión.
    const s = build(ramp(10, 56, 60))
    expect(s.ask).not.toContain('disponibilidad resuelta')
    expect(s.ask).toContain('cuántas veces hay que hacerla')
  })

  it('sí puede decirlo cuando la línea estuvo realmente disponible', () => {
    const s = build(ramp(10, 88, 92))
    expect(s.ask).toContain('disponibilidad resuelta')
    expect(s.ask).toContain('aguas arriba')
  })

  it('no rankea dos tipos de turno que andan igual', () => {
    // 30 turnos → tabla agregada. 58 % vs 59 % no es una diferencia que reportar.
    const s = build(ramp(30, 57, 60))
    expect(s.rowsMode).toBe('agregado')
    expect(s.rows.map(r => r.flag)).toEqual(['—', '—'])
  })

  it('sí rankea cuando la diferencia entre turnos es real', () => {
    const shifts = [
      ...Array.from({ length: 8 }, (_, i) => shift(`2026-08-${String(i + 1).padStart(2, '0')}`, 'Turno 1', 4800, 82)),
      ...Array.from({ length: 8 }, (_, i) => shift(`2026-08-${String(i + 1).padStart(2, '0')}`, 'Turno 2', 1800, 35)),
    ]
    const s = build(shifts)
    expect(s.rowsMode).toBe('agregado')
    expect(s.rows.map(r => r.flag).sort()).toEqual(['menos disponible', 'más disponible'])
  })

  it('no rankea un tipo de turno del que hay un solo registro', () => {
    // Caso real: julio de Yal tenía 24 turnos del Turno 2, 19 del Turno 3 y UNO
    // del Turno 1 al 0 %. Ese único registro se llevaba "menos disponible",
    // convirtiendo una anomalía suelta en un patrón del turno.
    const shifts = [
      ...Array.from({ length: 14 }, (_, i) => shift(`2026-08-${String(i + 1).padStart(2, '0')}`, 'Turno 2', 9000, 73)),
      ...Array.from({ length: 14 }, (_, i) => shift(`2026-08-${String(i + 1).padStart(2, '0')}`, 'Turno 3', 5000, 55)),
      shift('2026-08-15', 'Turno 1', 4797, 0),
    ]
    const s = build(shifts)
    expect(s.rowsMode).toBe('agregado')
    const solo = s.rows.find(r => r.label.startsWith('Turno 1'))!
    expect(solo.label).toContain('1 turno')
    expect(solo.flag).toBe('—')
    // Los dos grupos con muestra suficiente sí se comparan entre ellos.
    expect(s.rows.find(r => r.label.startsWith('Turno 2'))!.flag).toBe('más disponible')
    expect(s.rows.find(r => r.label.startsWith('Turno 3'))!.flag).toBe('menos disponible')
  })

  it('sin Excel del Grader no inventa un cero de averías', () => {
    const s = build(ramp(4, 60, 70))
    expect(s.rows.every(r => r.breakdowns === null)).toBe(true)
  })

  it('con Excel muestra las averías de cada turno', () => {
    const shifts = ramp(4, 60, 70)
    const s = buildPeriodSummary({
      shifts, stats: computePeriodMonthlyStats(shifts), monthDate: MONTH,
      areaLabel: 'x', reliability: rel(), now: NOW,
      breakdownsByShiftKey: new Map([[shifts[0]!.key, 7]]),
    })
    expect(s.rows[0]!.breakdowns).toBe(7)
    expect(s.rows[1]!.breakdowns).toBeNull()
  })

  it('el aporte de Mantención declara sobre cuántos turnos se midió', () => {
    const s = build(ramp(10, 60, 70), rel({ shiftsWithData: 3 }))
    expect(s.kpis[0]!.label).toBe('Averías resueltas')
    expect(s.kpis[0]!.context).toContain('3 turnos con Excel')
    expect(s.sourceNote).toContain('3 de 10 turnos')
  })

  it('sin confiabilidad no muestra KPIs vacíos', () => {
    const s = build(ramp(4, 60, 70), null)
    expect(s.kpis).toHaveLength(0)
    expect(s.sourceNote).toContain('sin Excel del Grader')
  })
})

describe('buildPeriodSummary · presentación', () => {
  it('el título no arrastra el "de" del locale', () => {
    const s = build(ramp(4, 60, 70))
    expect(s.title).toBe('Agosto 2026 · P. Principal · Eviscerado')
  })

  it('el rango no repite el mes en ambos extremos', () => {
    const s = build(ramp(10, 60, 70))
    expect(s.subtitle).toContain('1 – 5 ago')
  })

  it('el rango cubre lo procesado, no el mes calendario', () => {
    const s = build([shift('2026-08-02', 'Turno 1', 3000, 60), shift('2026-08-04', 'Turno 1', 3000, 62)])
    expect(s.subtitle).toContain('2 – 4 ago')
    expect(s.subtitle).not.toContain('31')
  })

  it('pasa a tabla agregada sobre 12 turnos y avisa qué está agrupando', () => {
    const pocos = build(ramp(12, 60, 66))
    expect(pocos.rowsMode).toBe('turnos')
    expect(pocos.rows).toHaveLength(12)

    const muchos = build(ramp(13, 60, 66))
    expect(muchos.rowsMode).toBe('agregado')
    expect(muchos.rowsNote).toContain('13 turnos agrupados')
    expect(muchos.tableTitle).toBe('RESUMEN POR TIPO DE TURNO')
  })

  it('nombra la máquina parada antes que la posición en el ranking', () => {
    const s = build([
      shift('2026-08-01', 'Turno 1', 5000, 85),
      shift('2026-08-02', 'Turno 1', 1000, 20, { stopped: true }),
    ])
    const peor = s.rows.find(r => r.label.includes('2 ago'))!
    // Es el peor del mes Y tiene una máquina parada: se reporta la causa, que
    // explica el turno, no el ranking, que solo lo ordena.
    expect(peor.flag).toBe('máquina parada')
    expect(s.verdictDetail).toContain('1 de 2 turnos')
  })
})
