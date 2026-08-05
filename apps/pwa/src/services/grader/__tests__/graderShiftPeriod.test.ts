import { describe, it, expect } from 'vitest'
import {
  buildPeriodShifts,
  periodShiftRows,
  periodDayKeys,
  formatShiftWindow,
  dateKeyOfWallUTC,
  type PeriodShift,
} from '../graderShiftPeriod'
import type { ShoplogixShiftParent } from '@/services/shoplogix/shoplogixShift.service'
import type { GraderDailySummary } from '@/services/grader/types'

/** Wall-clock-as-UTC: hora de pizarra con sufijo Z, como la guarda el CF. */
const wall = (s: string) => new Date(`${s}.000Z`)

function parent(over: Partial<ShoplogixShiftParent> & { dateKey: string; shiftId: string }): ShoplogixShiftParent {
  return {
    scheduledStart: null, scheduledEnd: null, lastSyncAt: null,
    parentSchemaVersion: 2, machines: [], hasAggregates: true,
    correctionDetected: false, reconciliationNote: null,
    effectiveStart: null, effectiveEnd: null,
    officialStart: null, officialEnd: null,
    ...over,
  }
}

const machine = (totalCycles: number, shiftRuntime: number, expected = 0) => ({
  machineid: `m${totalCycles}`, name: 'Baader', totalCycles,
  uptimeSec: 0, shiftRuntime, overallRatio: 0,
  expectedTotalCycles: expected, breakdown: null, stateAggregates: undefined,
})

function summary(over: Partial<GraderDailySummary> & { dateKey: string; shiftId: string }): GraderDailySummary {
  return {
    id: `${over.dateKey}__${over.shiftId}`,
    totalPieces: 0, pointZeroPieces: 0, pointZeroPct: 0,
    updatedBy: 'test', updatedAt: '2026-08-01T00:00:00.000Z',
    ...over,
  } as GraderDailySummary
}

/** Alias reales de chonchi: el Grader dice "Turno día", Shoplogix "Turno 2". */
const candidates = (shiftId: string): string[] =>
  shiftId === 'Turno 2' ? ['Turno 2', 'Turno día']
  : shiftId === 'Turno 1' ? ['Turno 1', 'Turno noche']
  : [shiftId]

const build = (parents: ShoplogixShiftParent[], summaries: GraderDailySummary[] = []) =>
  buildPeriodShifts({ parents, summaries, plantSlug: 'chonchi', getCandidates: candidates })

describe('el turno que cruza medianoche es UNO, anclado al día en que arranca', () => {
  it('Turno 1 de Chonchi (21:30 → 05:45) es una sola entrada en su día de inicio', () => {
    const [s] = build([parent({
      dateKey: '2026-08-03', shiftId: 'Turno 1',
      effectiveStart: wall('2026-08-03T21:30:00'),
      effectiveEnd:   wall('2026-08-04T05:45:00'),
      machines: [machine(3720, 0.57)],
    })])

    expect(s!.dateKey).toBe('2026-08-03')      // columna = día de INICIO
    expect(s!.crossesMidnight).toBe(true)
    expect(s!.endDateKey).toBe('2026-08-04')
    expect(s!.durationMin).toBe(8 * 60 + 15)   // 495 min, no un valor negativo
  })

  it('terminar exactamente a las 00:00 NO es cruzar (caso real de Yal)', () => {
    // 4 de los 5 "cruces" de Yal en julio 2026 eran esto. El turno cerró justo
    // al terminar su día; marcarlo ⁺1 gastaba la señal del cruce verdadero.
    const [s] = build([parent({
      dateKey: '2026-07-06', shiftId: 'Turno 2',
      effectiveStart: wall('2026-07-06T14:54:00'),
      effectiveEnd:   wall('2026-07-07T00:00:00'),
      machines: [machine(20395, 0.82)],
    })])
    expect(s!.crossesMidnight).toBe(false)
    expect(s!.endDayOffset).toBe(0)
    expect(s!.endDateKey).toBeNull()
    expect(formatShiftWindow(s!)).toBe('14:54 → 00:00')
    expect(s!.durationMin).toBe(9 * 60 + 6)   // la duración sigue siendo la real
  })

  it('un minuto pasada la medianoche SÍ es cruzar', () => {
    const [s] = build([parent({
      dateKey: '2026-07-06', shiftId: 'Turno 2',
      effectiveStart: wall('2026-07-06T14:54:00'),
      effectiveEnd:   wall('2026-07-07T00:01:00'),
      machines: [machine(20395, 0.82)],
    })])
    expect(s!.crossesMidnight).toBe(true)
    expect(formatShiftWindow(s!)).toBe('14:54 → 00:01 ⁺1')
  })

  it('un turno que NO cruza no marca endDateKey', () => {
    const [s] = build([parent({
      dateKey: '2026-08-03', shiftId: 'Turno 2',
      effectiveStart: wall('2026-08-03T09:00:00'),
      effectiveEnd:   wall('2026-08-03T17:15:00'),
      machines: [machine(4180, 0.76)],
    })])
    expect(s!.crossesMidnight).toBe(false)
    expect(s!.endDateKey).toBeNull()
    expect(s!.durationMin).toBe(495)
  })

  // Casos REALES encontrados validando contra Firestore (scripts/validate-shift-period.js).
  // El dateKey lo fija el CF desde el horario PROGRAMADO; si la producción real
  // arrancó pasada la medianoche, la ventana efectiva cae entera en el día
  // siguiente al dateKey. Medir el cruce entre start y end no lo detecta.
  describe('el turno ocurre entero el día siguiente al suyo (caso real)', () => {
    // `2026-07-31_Turno 1` de Chonchi: programado 21:30, primer pescado 01:34
    // del 1-ago, último 05:11. Es el turno de 1.533 piezas que se ve en la app.
    const [s] = build(
      [parent({
        dateKey: '2026-07-31', shiftId: 'Turno 1',
        effectiveStart: wall('2026-08-01T01:34:00'),
        effectiveEnd:   wall('2026-08-01T05:11:00'),
        machines: [machine(1533, 0.31)],
      })],
      [summary({ dateKey: '2026-07-31', shiftId: 'Turno 1', totalPieces: 1533, pointZeroPieces: 109, pointZeroPct: 7.1 })],
    )

    it('se ancla en su dateKey, no se muda a la columna del día siguiente', () => {
      expect(s!.dateKey).toBe('2026-07-31')
    })

    it('registra que empieza Y termina al día siguiente', () => {
      expect(s!.startDayOffset).toBe(1)
      expect(s!.endDayOffset).toBe(1)
    })

    it('NO es un cruce de medianoche: transcurre entero dentro del 1-ago', () => {
      expect(s!.crossesMidnight).toBe(false)
    })

    it('la ventana avisa el corrimiento — nunca dice "01:34 → 05:11" a secas', () => {
      // Sin el marcador, la celda del 31 afirmaría que esto pasó el 31.
      expect(formatShiftWindow(s!)).toBe('⁺1 01:34 → 05:11')
      expect(s!.endDateKey).toBe('2026-08-01')
      expect(s!.durationMin).toBe(217)
    })
  })

  it('caso real: Unscheduled 2026-08-02 que arranca el 3 y dura hasta el 3', () => {
    const [s] = build([parent({
      dateKey: '2026-08-02', shiftId: 'Unscheduled',
      effectiveStart: wall('2026-08-02T14:30:00'),
      effectiveEnd:   wall('2026-08-03T07:18:00'),
      machines: [machine(3851, 0.44)],
    })])
    expect(s!.startDayOffset).toBe(0)
    expect(s!.endDayOffset).toBe(1)
    expect(s!.crossesMidnight).toBe(true)
    expect(formatShiftWindow(s!)).toBe('14:30 → 07:18 ⁺1')
  })

  it('la hora se lee wall-clock-as-UTC: no la corre el huso local', () => {
    // Con getHours() en vez de getUTCHours(), en Chile (UTC-4) esto daría 17:30.
    const [s] = build([parent({
      dateKey: '2026-08-03', shiftId: 'Turno 1',
      effectiveStart: wall('2026-08-03T21:30:00'),
      effectiveEnd:   wall('2026-08-04T05:45:00'),
      machines: [machine(900, 0.5)],
    })])
    expect(formatShiftWindow(s!)).toBe('21:30 → 05:45 ⁺1')
    expect(dateKeyOfWallUTC(s!.start!)).toBe('2026-08-03')
  })
})

describe('un padre = un turno: el alias del Grader no puede doble-contar', () => {
  it('el summary guardado como "Turno día" se adjunta al padre "Turno 2", sin duplicar', () => {
    const shifts = build(
      [parent({
        dateKey: '2026-08-03', shiftId: 'Turno 2',
        effectiveStart: wall('2026-08-03T09:00:00'),
        effectiveEnd:   wall('2026-08-03T17:15:00'),
        machines: [machine(4000, 0.8)],
      })],
      [summary({ dateKey: '2026-08-03', shiftId: 'Turno día', totalPieces: 3720, pointZeroPieces: 141, pointZeroPct: 3.8 })],
    )

    expect(shifts).toHaveLength(1)             // ← el bug que se está evitando
    expect(shifts[0]!.shiftId).toBe('Turno 2') // nombre FIEL a Shoplogix
    expect(shifts[0]!.pieces).toBe(3720)       // dato del Grader, adjuntado
    expect(shifts[0]!.cycles).toBe(4000)
    expect(shifts[0]!.hasSlx && shifts[0]!.hasGrader).toBe(true)
  })

  it('el mismo summary no se adjunta a dos padres distintos', () => {
    const shifts = build(
      [
        parent({ dateKey: '2026-08-03', shiftId: 'Turno 1', machines: [machine(3000, 0.6)],
                 effectiveStart: wall('2026-08-03T21:30:00'), effectiveEnd: wall('2026-08-04T05:45:00') }),
        parent({ dateKey: '2026-08-03', shiftId: 'Turno 2', machines: [machine(4000, 0.8)],
                 effectiveStart: wall('2026-08-03T09:00:00'), effectiveEnd: wall('2026-08-03T17:15:00') }),
      ],
      [summary({ dateKey: '2026-08-03', shiftId: 'Turno día', totalPieces: 3720 })],
    )
    expect(shifts.filter(s => s.pieces === 3720)).toHaveLength(1)
  })
})

describe('nada desaparece en silencio', () => {
  it('un turno que solo existe en el Grader se muestra igual', () => {
    const shifts = build([], [summary({
      dateKey: '2026-08-05', shiftId: 'Turno día', totalPieces: 2397,
      startAt: '2026-08-05T07:20:00.000Z', endAt: '2026-08-05T15:40:00.000Z',
    })])
    expect(shifts).toHaveLength(1)
    expect(shifts[0]!.hasSlx).toBe(false)
    expect(shifts[0]!.windowSource).toBe('grader')
    expect(shifts[0]!.pieces).toBe(2397)
  })

  it('ruido (<50 ciclos) se descarta, pero NO si tiene datos del Grader', () => {
    const soloRuido = build([parent({ dateKey: '2026-08-06', shiftId: 'Turno 2', machines: [machine(12, 0.01)] })])
    expect(soloRuido).toHaveLength(0)

    const ruidoConExcel = build(
      [parent({ dateKey: '2026-08-06', shiftId: 'Turno 2', machines: [machine(12, 0.01)] })],
      [summary({ dateKey: '2026-08-06', shiftId: 'Turno 2', totalPieces: 800 })],
    )
    expect(ruidoConExcel).toHaveLength(1)
  })

  it('Unscheduled aparece como turno propio y queda último en las filas', () => {
    const shifts = build([
      parent({ dateKey: '2026-08-07', shiftId: 'Unscheduled', machines: [machine(11600, 0.4)],
               effectiveStart: wall('2026-08-07T03:00:00'), effectiveEnd: wall('2026-08-07T06:00:00') }),
      parent({ dateKey: '2026-08-07', shiftId: 'Turno 2', machines: [machine(4000, 0.8)],
               effectiveStart: wall('2026-08-07T09:00:00'), effectiveEnd: wall('2026-08-07T17:00:00') }),
    ])
    expect(shifts.find(s => s.shiftId === 'Unscheduled')!.unscheduled).toBe(true)
    expect(periodShiftRows(shifts)).toEqual(['Turno 2', 'Unscheduled'])
  })
})

describe('la ventana degrada con honestidad', () => {
  const base = { dateKey: '2026-08-08', shiftId: 'Turno 2', machines: [machine(4000, 0.8)] }

  it('prefiere effective sobre official y scheduled', () => {
    const [s] = build([parent({ ...base,
      effectiveStart: wall('2026-08-08T09:05:00'), effectiveEnd: wall('2026-08-08T17:02:00'),
      officialStart:  wall('2026-08-08T09:00:00'), officialEnd:  wall('2026-08-08T17:15:00'),
      scheduledStart: wall('2026-08-08T08:00:00'), scheduledEnd: wall('2026-08-08T18:00:00'),
    })])
    expect(s!.windowSource).toBe('effective')
    expect(formatShiftWindow(s!)).toBe('09:05 → 17:02')
  })

  it('cae a official cuando no hay effective (docs previos a 2026-07-21)', () => {
    const [s] = build([parent({ ...base,
      officialStart: wall('2026-08-08T09:00:00'), officialEnd: wall('2026-08-08T17:15:00'),
      scheduledStart: wall('2026-08-08T08:00:00'), scheduledEnd: wall('2026-08-08T18:00:00'),
    })])
    expect(s!.windowSource).toBe('official')
  })

  it('sin ninguna referencia horaria no inventa una ventana', () => {
    const [s] = build([parent(base)])
    expect(s!.windowSource).toBe('none')
    expect(s!.start).toBeNull()
    expect(s!.durationMin).toBeNull()
    expect(formatShiftWindow(s!)).toBe('—')
  })
})

describe('uptime: promedio entre máquinas, no suma', () => {
  it('3 Baaders al 60/70/80% dan 70%, no 210%', () => {
    const [s] = build([parent({
      dateKey: '2026-08-09', shiftId: 'Turno 2',
      machines: [machine(1000, 0.6), machine(1200, 0.7), machine(1100, 0.8)],
    })])
    expect(s!.uptimePct).toBeCloseTo(70, 5)
    expect(s!.cycles).toBe(3300)   // los ciclos SÍ se suman
  })
})

describe('filas y columnas de la matriz', () => {
  it('las filas se ordenan por hora real de inicio, no alfabéticamente', () => {
    const shifts = build([
      parent({ dateKey: '2026-08-10', shiftId: 'Turno 3', machines: [machine(2000, 0.5)],
               effectiveStart: wall('2026-08-10T00:10:00'), effectiveEnd: wall('2026-08-10T07:00:00') }),
      parent({ dateKey: '2026-08-10', shiftId: 'Turno 1', machines: [machine(3000, 0.6)],
               effectiveStart: wall('2026-08-10T21:30:00'), effectiveEnd: wall('2026-08-11T05:45:00') }),
      parent({ dateKey: '2026-08-10', shiftId: 'Turno 2', machines: [machine(4000, 0.8)],
               effectiveStart: wall('2026-08-10T09:00:00'), effectiveEnd: wall('2026-08-10T17:15:00') }),
    ])
    // T3 arranca 00:10, T2 a las 09:00, T1 a las 21:30 — ese es el orden real.
    expect(periodShiftRows(shifts)).toEqual(['Turno 3', 'Turno 2', 'Turno 1'])
  })

  it('periodDayKeys cubre el mes entero, incluidos los de 31 y los febreros', () => {
    expect(periodDayKeys(2026, 7)).toHaveLength(31)          // agosto
    expect(periodDayKeys(2026, 7)[0]).toBe('2026-08-01')
    expect(periodDayKeys(2026, 7)[30]).toBe('2026-08-31')
    expect(periodDayKeys(2026, 1)).toHaveLength(28)          // feb 2026
    expect(periodDayKeys(2024, 1)).toHaveLength(29)          // feb bisiesto
  })

  it('orden cronológico dentro del día por hora de inicio', () => {
    const shifts = build([
      parent({ dateKey: '2026-08-11', shiftId: 'Turno 1', machines: [machine(3000, 0.6)],
               effectiveStart: wall('2026-08-11T21:30:00'), effectiveEnd: wall('2026-08-12T05:45:00') }),
      parent({ dateKey: '2026-08-11', shiftId: 'Turno 2', machines: [machine(4000, 0.8)],
               effectiveStart: wall('2026-08-11T09:00:00'), effectiveEnd: wall('2026-08-11T17:15:00') }),
    ])
    expect(shifts.map((s: PeriodShift) => s.shiftId)).toEqual(['Turno 2', 'Turno 1'])
  })
})

describe('P0', () => {
  it('usa el pct del summary cuando viene, y lo deriva cuando no', () => {
    const [conPct] = build([], [summary({
      dateKey: '2026-08-12', shiftId: 'Turno 2', totalPieces: 1000, pointZeroPieces: 69, pointZeroPct: 6.9,
    })])
    expect(conPct!.p0Pct).toBeCloseTo(6.9, 5)

    const [sinPct] = build([], [summary({
      dateKey: '2026-08-13', shiftId: 'Turno 2', totalPieces: 1000, pointZeroPieces: 50,
      pointZeroPct: undefined as unknown as number,
    })])
    expect(sinPct!.p0Pct).toBeCloseTo(5, 5)
  })
})
