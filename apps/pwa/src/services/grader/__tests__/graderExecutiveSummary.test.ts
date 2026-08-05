import { describe, it, expect } from 'vitest'
import { buildExecutiveSummary, formatDuration } from '../graderExecutiveSummary'
import type { GraderDailySummary } from '@/services/grader/types'
import type { UpstreamLineSnapshot, UpstreamMachineShift } from '@/services/shoplogix/types'

const wall = (s: string) => new Date(`${s}.000Z`)

function machine(name: string, cycles: number, expected: number, runtime: number): UpstreamMachineShift {
  return {
    machineid: name, machineName: name, machineType: 'baader_142',
    dateKey: '2026-08-03', shiftId: 'Turno 1',
    shiftStart: wall('2026-08-03T00:06:00'), shiftEnd: wall('2026-08-03T07:15:00'),
    totalCycles: cycles, expectedTotalCycles: expected, totalPieces: 0,
    actualRuntime: runtime,
  } as unknown as UpstreamMachineShift
}

function snapshot(machines: UpstreamMachineShift[]): UpstreamLineSnapshot {
  return { dateKey: '2026-08-03', shiftId: 'Turno 1', machines } as unknown as UpstreamLineSnapshot
}

const summary = {
  id: '2026-08-03__Turno 1', dateKey: '2026-08-03', shiftId: 'Turno 1',
  totalPieces: 0, pointZeroPieces: 0, pointZeroPct: 0,
  updatedBy: 't', updatedAt: '',
} as GraderDailySummary

/**
 * El turno REAL del 3-ago-2026 en Chonchi, tomado de la app: Baader 1 con
 * 3.452 ciclos, Baader 2 en CERO y Baader 3 con 268. Es el caso que motivó
 * todo el formato — si el resumen no explica este turno, no sirve.
 */
const turnoReal = {
  summary,
  upstream: snapshot([
    machine('Baader 1', 3452, 8420, 0.73),
    machine('Baader 2', 0,    8420, 0),
    machine('Baader 3', 268,  8420, 0.48),
  ]),
  shiftLabel: 'Turno 1',
  start: wall('2026-08-03T00:06:00'),
  end:   wall('2026-08-03T07:15:00'),
  reliability: { mttrMacroSec: 354, mtbfSec: 720, macroCount: 19, microCount: 69, microSec: 1890 },
  uptimePct: 39,
  now: wall('2026-08-04T16:20:00'),
}

describe('turno real 3-ago: la Baader 2 no arrancó', () => {
  const r = buildExecutiveSummary(turnoReal)

  it('el veredicto NOMBRA la máquina parada, no solo el mal resultado', () => {
    expect(r.verdict).toContain('Baader 2')
    expect(r.verdict).toContain('no produjo un solo ciclo')
    expect(r.severity).toBe('critical')
  })

  it('atribuye la pérdida a DISPONIBILIDAD, no a ritmo', () => {
    // Es la diferencia entre "aceleren la línea" y "revisen esa máquina".
    expect(r.lossDriver).toBe('disponibilidad')
    expect(r.verdictDetail).toContain('capacidad que nunca entró en línea')
  })

  it('sostiene el veredicto con la brecha real de ciclos', () => {
    expect(r.verdictDetail).toContain('3.720')   // 3452 + 0 + 268
    expect(r.verdictDetail).toContain('25.260')  // 8420 × 3
  })

  it('cada KPI trae su contexto — un porcentaje suelto no dice nada', () => {
    const disp = r.kpis.find(k => k.label === 'Disponibilidad')!
    expect(disp.value).toBe('39%')
    expect(disp.context).toContain('7 h 09')
    expect(disp.tone).toBe('bad')
  })

  it('MTTR bajo se marca como BUENO: es el único KPI donde menos es mejor', () => {
    const mttr = r.kpis.find(k => k.label === 'MTTR')!
    expect(mttr.value).toBe('5,9 min')
    expect(mttr.tone).toBe('ok')       // ← turno malo, respuesta buena
  })

  it('cuantifica el aporte de Mantención (la meta del proyecto)', () => {
    const texto = r.maintenance.join(' ')
    expect(texto).toContain('19 averías atendidas')
    expect(texto).toContain('5,9 min')
    expect(texto).toContain('69 micro-detenciones')
  })

  it('el pedido final es accionable y separa respuesta de causa', () => {
    expect(r.ask).toContain('Baader 2')
    expect(r.ask).toContain('no es la velocidad de respuesta')
  })

  it('las máquinas van ordenadas por producción, con la parada marcada', () => {
    expect(r.machines.map(m => m.name)).toEqual(['Baader 1', 'Baader 3', 'Baader 2'])
    expect(r.machines.find(m => m.name === 'Baader 2')!.stopped).toBe(true)
    expect(r.machines.find(m => m.name === 'Baader 2')!.flag).toBe('parada')
  })

  it('declara que no hay Excel del Grader en vez de imprimir ceros', () => {
    expect(r.sourceNote).toContain('sin Excel del Grader')
    // Y no inventa KPIs de piezas ni P0 que no existen.
    expect(r.kpis.some(k => /pieza|P0/i.test(k.label))).toBe(false)
  })
})

describe('otros turnos', () => {
  it('línea disponible pero lenta → la causa es RITMO, no disponibilidad', () => {
    const r = buildExecutiveSummary({
      ...turnoReal,
      upstream: snapshot([
        machine('Baader 1', 3000, 8000, 0.92),
        machine('Baader 2', 2800, 8000, 0.90),
        machine('Baader 3', 3100, 8000, 0.91),
      ]),
      uptimePct: 91,
    })
    expect(r.lossDriver).toBe('ritmo')
    expect(r.verdict).toContain('por debajo de su objetivo de ritmo')
    expect(r.ask).toContain('aguas arriba')
  })

  it('turno sano no dramatiza', () => {
    const r = buildExecutiveSummary({
      ...turnoReal,
      upstream: snapshot([
        machine('Baader 1', 7600, 8000, 0.95),
        machine('Baader 2', 7400, 8000, 0.94),
        machine('Baader 3', 7500, 8000, 0.96),
      ]),
      uptimePct: 95,
      reliability: { mttrMacroSec: 300, mtbfSec: 7200, macroCount: 2, microCount: 3, microSec: 240 },
    })
    expect(r.severity).toBe('ok')
    expect(r.verdict).toContain('sin incidencias')
    expect(r.ask).toContain('Sin acción pendiente')
  })

  it('dos máquinas paradas se nombran las dos, en plural', () => {
    const r = buildExecutiveSummary({
      ...turnoReal,
      upstream: snapshot([
        machine('Baader 1', 1000, 8000, 0.3),
        machine('Baader 2', 0, 8000, 0),
        machine('Baader 3', 0, 8000, 0),
      ]),
    })
    expect(r.verdict).toContain('Baader 2 y Baader 3')
    expect(r.verdict).toContain('no produjeron')
  })

  it('sin datos de máquinas no inventa una causa', () => {
    const r = buildExecutiveSummary({
      summary, upstream: null, shiftLabel: 'Turno 2',
      start: null, end: null, reliability: null, uptimePct: null,
      now: wall('2026-08-04T16:20:00'),
    })
    expect(r.lossDriver).toBe('sin-datos')
    expect(r.cause).toContain('Sin datos por máquina')
    expect(r.subtitle).toContain('sin ventana registrada')
    expect(r.maintenance[0]).toContain('Sin averías registradas')
  })

  it('con Excel del Grader cargado cambia la fuente declarada', () => {
    const r = buildExecutiveSummary({
      ...turnoReal,
      summary: { ...summary, totalPieces: 1533, pointZeroPieces: 109, pointZeroPct: 7.1 },
    })
    expect(r.sourceNote).toContain('Grader (Marelec)')
    expect(r.sourceNote).not.toContain('sin Excel')
  })
})

describe('formatDuration', () => {
  it('formatea como se lee en planta', () => {
    expect(formatDuration(429)).toBe('7 h 09')
    expect(formatDuration(60)).toBe('1 h 00')
    expect(formatDuration(45)).toBe('45 min')
  })
})
