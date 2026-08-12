/**
 * machineSpeedMeaning — traducir el pz/min a algo que se pueda decidir.
 *
 * Los casos usan los números REALES de las tres Baader de Chonchi medidos en
 * producción sobre 60 turnos: la Evisceradora 1 corre con objetivo 19 pz/min y
 * las 2 y 3 con 16. Ese detalle NO es cosmético: es justo el que hace que sus
 * porcentajes no se comparen entre sí.
 */
import { describe, it, expect } from 'vitest'
import { buildMachineSpeedSummary } from '../machineSpeedMeaning'
import type { UpstreamMachineShift } from '@/services/shoplogix/types'

const T0 = Date.parse('2026-08-11T21:15:00Z')

/** Máquina sintética con N piezas repartidas en tramos de 5 min desde T0. */
function maquina(opts: {
  id: string
  nombre: string
  piezas: number
  objetivoCpm: number
  uptimeMin: number
  downtimeMin: number
}): UpstreamMachineShift {
  const tramos = Math.max(1, Math.round(opts.uptimeMin / 5))
  const porTramo = opts.piezas / tramos
  return {
    machineid: opts.id,
    machineName: opts.nombre,
    intervals: Array.from({ length: tramos }, (_, i) => ({
      startAt: new Date(T0 + i * 5 * 60_000),
      cycles: porTramo,
      // targetCpmFromIntervals lee expectedCycles y divide por 5.
      expectedCycles: opts.objetivoCpm * 5,
    })),
    states: [
      { type: 'uptime', startAt: new Date(T0), durationSec: opts.uptimeMin * 60 },
      { type: 'downtime', startAt: new Date(T0 + opts.uptimeMin * 60_000), durationSec: opts.downtimeMin * 60 },
    ],
  } as unknown as UpstreamMachineShift
}

/** Las tres Baader con su configuración real. */
const TRES = [
  maquina({ id: 'ev1', nombre: 'Evisceradora 1', piezas: 3489, objetivoCpm: 19, uptimeMin: 274, downtimeMin: 46 }),
  maquina({ id: 'ev2', nombre: 'Evisceradora 2', piezas: 4295, objetivoCpm: 16, uptimeMin: 353, downtimeMin: 108 }),
  maquina({ id: 'ev3', nombre: 'Evisceradora 3', piezas: 4557, objetivoCpm: 16, uptimeMin: 352, downtimeMin: 113 }),
]

describe('buildMachineSpeedSummary', () => {
  it('traduce el ritmo a piezas por hora', () => {
    const s = buildMachineSpeedSummary(TRES)!
    const ev1 = s.rows.find((r) => r.machineid === 'ev1')!
    expect(ev1.ritmoCpm).toBeCloseTo(3489 / 274, 2)
    expect(ev1.ritmoPorHora).toBeCloseTo(ev1.ritmoCpm * 60, 4)
  })

  it('dice cuántas piezas deja en el camino cada hora producida', () => {
    const s = buildMachineSpeedSummary(TRES)!
    const ev1 = s.rows.find((r) => r.machineid === 'ev1')!
    // objetivo 19 pz/min contra su ritmo real, por hora
    expect(ev1.brechaPorHora).toBeCloseTo((19 - 3489 / 274) * 60, 2)
  })

  it('NUNCA da brecha negativa: superar el objetivo no es una pérdida', () => {
    const veloz = [maquina({ id: 'x', nombre: 'Rápida', piezas: 6000, objetivoCpm: 10, uptimeMin: 300, downtimeMin: 0 })]
    expect(buildMachineSpeedSummary(veloz)!.rows[0]!.brechaPorHora).toBe(0)
  })

  it('separa lo perdido por ritmo de lo perdido por detención', () => {
    const s = buildMachineSpeedSummary(TRES)!
    for (const r of s.rows) {
      expect(r.perdidasPorRitmo).toBeGreaterThanOrEqual(0)
      expect(r.perdidasPorDetencion).toBeGreaterThanOrEqual(0)
    }
    // La que más tiempo estuvo parada pierde más por detención que la que menos.
    const ev1 = s.rows.find((r) => r.machineid === 'ev1')!
    const ev3 = s.rows.find((r) => r.machineid === 'ev3')!
    expect(ev3.perdidasPorDetencion).toBeGreaterThan(ev1.perdidasPorDetencion)
  })

  it('mide contra la cadencia de la LÍNEA, no contra el objetivo propio', () => {
    const s = buildMachineSpeedSummary(TRES)!
    expect(s.lineaCpm).not.toBeNull()
    // La mediana de los tres ritmos reales, no 19 ni 16.
    const ritmos = s.rows.map((r) => r.ritmoCpm).sort((a, b) => a - b)
    expect(s.lineaCpm).toBeCloseTo(ritmos[1]!, 4)
  })

  it('detecta que los objetivos difieren — la señal para avisar que NO se comparan', () => {
    expect(buildMachineSpeedSummary(TRES)!.objetivosDistintos).toBe(true)
  })

  it('con todas al mismo objetivo no levanta el aviso', () => {
    const parejas = [
      maquina({ id: 'a', nombre: 'Evisceradora 1', piezas: 3000, objetivoCpm: 16, uptimeMin: 250, downtimeMin: 30 }),
      maquina({ id: 'b', nombre: 'Evisceradora 2', piezas: 3200, objetivoCpm: 16, uptimeMin: 250, downtimeMin: 30 }),
    ]
    expect(buildMachineSpeedSummary(parejas)!.objetivosDistintos).toBe(false)
  })

  it('ignora máquinas sin producción real — su ritmo sería ruido', () => {
    const conMuerta = [
      ...TRES,
      maquina({ id: 'muerta', nombre: 'Evisceradora 4', piezas: 3, objetivoCpm: 16, uptimeMin: 60, downtimeMin: 0 }),
    ]
    expect(buildMachineSpeedSummary(conMuerta)!.rows.map((r) => r.machineid)).not.toContain('muerta')
  })

  it('devuelve null cuando no hay nada que decir', () => {
    expect(buildMachineSpeedSummary([])).toBeNull()
    const solaMuerta = [maquina({ id: 'z', nombre: 'Evisceradora 1', piezas: 2, objetivoCpm: 16, uptimeMin: 30, downtimeMin: 0 })]
    expect(buildMachineSpeedSummary(solaMuerta)).toBeNull()
  })
})

describe('ventana de tiempo (el zoom del gráfico)', () => {
  const UNA = [maquina({ id: 'a', nombre: 'Evisceradora 1', piezas: 3600, objetivoCpm: 16, uptimeMin: 300, downtimeMin: 60 })]

  it('cuenta solo los tramos de la ventana', () => {
    // 300 min de uptime en 60 tramos de 5 min → 60 pz por tramo.
    // Primera hora = 12 tramos = 720 pz.
    const s = buildMachineSpeedSummary(UNA, { startMs: T0, endMs: T0 + 60 * 60_000 })!
    expect(s.rows[0]!.piezas).toBe(720)
  })

  it('RECORTA los estados a la ventana en vez de contarlos enteros o descartarlos', () => {
    /*
     * El uptime del turno es un solo state de 300 min. Con una ventana de 1 h:
     * contarlo entero daría un ritmo 5 veces menor; descartarlo dejaría uptime
     * en 0 y el ritmo en infinito. Lo correcto es la parte que solapa: 60 min.
     */
    const s = buildMachineSpeedSummary(UNA, { startMs: T0, endMs: T0 + 60 * 60_000 })!
    expect(s.rows[0]!.uptimeSec).toBe(60 * 60)
    expect(s.rows[0]!.ritmoCpm).toBeCloseTo(720 / 60, 4)
  })

  it('una ventana antes del turno no inventa datos', () => {
    expect(buildMachineSpeedSummary(UNA, { startMs: T0 - 5 * 3600_000, endMs: T0 - 4 * 3600_000 })).toBeNull()
  })

  it('el objetivo sale del turno COMPLETO, no de la ventana', () => {
    // Si la ventana cae sobre el tramo de detención no hay `expectedCycles`
    // dentro, pero el objetivo de la máquina sigue siendo el mismo.
    const s = buildMachineSpeedSummary(UNA, { startMs: T0 + 30 * 60_000, endMs: T0 + 90 * 60_000 })!
    expect(s.rows[0]!.objetivoCpm).toBe(16)
  })

  it('el ritmo de un tramo bueno es MAYOR que el del turno completo', () => {
    // Turno completo: 3.600 pz / 300 min = 12 pz/min, con 60 min de paro aparte.
    const completo = buildMachineSpeedSummary(UNA)!
    const tramo = buildMachineSpeedSummary(UNA, { startMs: T0, endMs: T0 + 30 * 60_000 })!
    expect(tramo.rows[0]!.ritmoCpm).toBeGreaterThanOrEqual(completo.rows[0]!.ritmoCpm)
  })

  it('afloja el mínimo de piezas: 50 es "no hubo turno", no "no hubo tramo"', () => {
    // 15 min a 12 pz/min = 180 pz — pero una ventana de 5 min da 60.
    const s = buildMachineSpeedSummary(UNA, { startMs: T0, endMs: T0 + 5 * 60_000 })
    expect(s).not.toBeNull()
    expect(s!.rows[0]!.piezas).toBe(60)
  })
})

describe('casos que no deben romper', () => {
  it('sin nada que decir devuelve null (regresión del early return)', () => {
    expect(buildMachineSpeedSummary([])).toBeNull()
    const solaMuerta = [maquina({ id: 'z', nombre: 'Evisceradora 1', piezas: 2, objetivoCpm: 16, uptimeMin: 30, downtimeMin: 0 })]
    expect(buildMachineSpeedSummary(solaMuerta)).toBeNull()
  })

  it('una máquina sin objetivo reportado no inventa una brecha', () => {
    const sinObjetivo = [maquina({ id: 'a', nombre: 'Evisceradora 1', piezas: 3000, objetivoCpm: 0, uptimeMin: 250, downtimeMin: 20 })]
    const s = buildMachineSpeedSummary(sinObjetivo)!
    expect(s.rows[0]!.objetivoCpm).toBeNull()
    expect(s.rows[0]!.brechaPorHora).toBeNull()
  })

  it('da el objetivo también en pz/h — la referencia en la misma unidad', () => {
    const s = buildMachineSpeedSummary(TRES)!
    const ev1 = s.rows.find((r) => r.machineid === 'ev1')!
    expect(ev1.objetivoPorHora).toBe(19 * 60)
    const ev2 = s.rows.find((r) => r.machineid === 'ev2')!
    expect(ev2.objetivoPorHora).toBe(16 * 60)
  })

  it('los totales suman las filas', () => {
    const s = buildMachineSpeedSummary(TRES)!
    expect(s.totalPiezas).toBe(s.rows.reduce((a, r) => a + r.piezas, 0))
    expect(s.totalPorRitmo).toBe(s.rows.reduce((a, r) => a + r.perdidasPorRitmo, 0))
    expect(s.totalPorDetencion).toBe(s.rows.reduce((a, r) => a + r.perdidasPorDetencion, 0))
  })
})
