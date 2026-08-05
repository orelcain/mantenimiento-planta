/**
 * OEE de área: la máquina instrumentada + las etapas que no lo están.
 *
 * Lo que estos tests protegen es la regla de doble conteo: un paro de etapa solo
 * suma tiempo si NO detuvo a la máquina (si la detuvo, ya está en el downtime
 * del sensor y se anota como causa de ese paro). Sin esa regla, cada paro de la
 * GEA que además paraba la Baader castigaba dos veces la disponibilidad.
 */
import { describe, it, expect } from 'vitest'
import { computeAreaOee, type StageStop } from '../areaOeeCompute'
import type { PlantKPIs, MachineKPI } from '../plantKpiCompute'

function machine(over: Partial<MachineKPI> = {}): MachineKPI {
  return {
    machineid: 'm1', machineName: 'Linea 1',
    availability: 0.8, performance: 0.9,
    mttrMin: 10, mtbfHours: 2, failureCount: 2, microCount: 0, microMin: 0,
    shoplogixTargetCpm: 20, totalCycles: 1000,
    lostBySpeed: 0, lostByStops: 0,
    uptimeMin: 400, downtimeMin: 100, setupMin: 0,
    ...over,
  }
}

function kpis(over: Partial<PlantKPIs> = {}): PlantKPIs {
  return {
    dateKey: '2026-07-28', shiftId: 'Turno Dia', periodLabel: 'Julio 2026', shiftsCount: 1,
    availability: 0.8, performance: 0.9, quality: null, oee: null,
    mttrMin: 10, mtbfHours: 2, failureCount: 2, microCount: 0, microMin: 0,
    machines: [machine()],
    ...over,
  }
}

const etapa = (over: Partial<StageStop> = {}): StageStop => ({
  etapa: 'GEA', duracionMin: 30, origen: 'manual', causa: 'sin producto', ...over,
})

describe('computeAreaOee', () => {
  it('sin KPIs de máquina no afirma nada del área', () => {
    expect(computeAreaOee(null, [etapa()])).toBeNull()
  })

  it('sin paros de etapa, el área es la máquina', () => {
    const r = computeAreaOee(kpis(), [])!
    expect(r.availabilityArea).toBeCloseTo(400 / 500, 4)
    expect(r.availabilityArea).toBeCloseTo(r.availabilityMachine!, 4)
    expect(r.etapaMin).toBe(0)
  })

  it('un paro de etapa entra a la base de tiempo y baja la disponibilidad del área', () => {
    const r = computeAreaOee(kpis(), [etapa({ duracionMin: 100 })])!
    // uptime 400 sobre (400+100 rastreados + 100 de la etapa) = 0,667
    expect(r.baseMin).toBe(600)
    expect(r.availabilityArea).toBeCloseTo(400 / 600, 4)
    expect(r.availabilityArea!).toBeLessThan(r.availabilityMachine!)
  })

  it('NO cuenta dos veces: las anotaciones de paros del sensor no suman tiempo', () => {
    // Este paro es la CAUSA de un paro que el sensor ya midió (está dentro de
    // los 100 min de downtime). Si sumara, la base sería 660 y el área caería
    // sin que se haya perdido un minuto extra.
    const r = computeAreaOee(kpis(), [
      etapa({ origen: 'shoplogix', duracionMin: 60, causa: 'atasco en salida', stopKey: 'slx__x' }),
    ])!
    expect(r.etapaMin).toBe(0)
    expect(r.baseMin).toBe(500)
    expect(r.availabilityArea).toBeCloseTo(r.availabilityMachine!, 4)
  })

  it('sin calidad (Filete: no hay Grader) el OEE es A×R y queda rotulado', () => {
    const r = computeAreaOee(kpis({ quality: null }), [etapa({ duracionMin: 100 })])!
    expect(r.sinCalidad).toBe(true)
    expect(r.oeeArea).toBeCloseTo((400 / 600) * 0.9, 4)
    expect(r.oeeMachine).toBeCloseTo(0.8 * 0.9, 4)
  })

  it('con calidad multiplica A×R×Q', () => {
    const r = computeAreaOee(kpis({ quality: 0.98 }), [])!
    expect(r.sinCalidad).toBe(false)
    expect(r.oeeArea).toBeCloseTo((400 / 500) * 0.9 * 0.98, 4)
  })

  it('el pareto reparte el downtime por causa anotada y expone lo que falta anotar', () => {
    const r = computeAreaOee(kpis(), [
      etapa({ origen: 'shoplogix', duracionMin: 60, causa: 'atasco en salida' }),
      etapa({ origen: 'shoplogix', duracionMin: 15, causa: 'cambio de cuchillo' }),
      etapa({ origen: 'manual', etapa: 'GEA', duracionMin: 30 }),
    ])!
    const byLabel = new Map(r.perdidas.map((p) => [p.label, p]))
    expect(byLabel.get('atasco en salida')!.min).toBe(60)
    expect(byLabel.get('atasco en salida')!.fuente).toBe('maquina')
    expect(byLabel.get('GEA')!.fuente).toBe('etapa')
    // downtime 100 − 75 anotados = 25 min todavía sin explicar
    expect(byLabel.get('Paros sin causa anotada')!.min).toBe(25)
    expect(r.perdidas[0]!.label).toBe('atasco en salida')  // ordenado por minutos
  })

  it('si lo anotado supera el downtime medido no aparece un balde negativo', () => {
    const r = computeAreaOee(kpis(), [
      etapa({ origen: 'shoplogix', duracionMin: 500, causa: 'anotación de otro período' }),
    ])!
    expect(r.perdidas.find((p) => p.label === 'Paros sin causa anotada')).toBeUndefined()
    expect(r.perdidas.every((p) => p.min >= 0)).toBe(true)
  })

  it('varias máquinas suman su tiempo rastreado', () => {
    const r = computeAreaOee(kpis({
      machines: [
        machine({ uptimeMin: 400, downtimeMin: 100 }),
        machine({ machineid: 'm2', uptimeMin: 300, downtimeMin: 200 }),
      ],
    }), [])!
    expect(r.baseMin).toBe(1000)
    expect(r.availabilityArea).toBeCloseTo(700 / 1000, 4)
  })
})
