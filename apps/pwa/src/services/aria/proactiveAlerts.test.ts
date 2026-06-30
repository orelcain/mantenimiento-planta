import { describe, it, expect } from 'vitest'
import {
  kpiTurnoAlerts,
  preventivaVencidaAlerts,
  equipoCondicionAlerts,
  incidenciaCriticaAlerts,
  formatAlertsMessage,
} from './proactiveAlerts'
import type { PlantKPIs } from '@/services/grader/plantKpiCompute'
import type { PreventiveTask, Equipment, Incident } from '@/types'

function makeKpis(over: Partial<PlantKPIs>): PlantKPIs {
  return {
    dateKey: '2026-02-27', shiftId: 'Turno 2', periodLabel: 'Turno 2 · 2026-02-27',
    shiftsCount: 1, availability: 0.95, performance: 0.95, quality: 0.98, oee: 0.88,
    mttrMin: 3, mtbfHours: 4, failureCount: 1, microCount: 0, microMin: 0, machines: [],
    ...over,
  }
}
const days = (n: number): Date => new Date(Date.now() - n * 86_400_000)
const hours = (n: number): Date => new Date(Date.now() - n * 3_600_000)

describe('kpiTurnoAlerts', () => {
  it('turno sano → sin avisos', () => {
    expect(kpiTurnoAlerts(makeKpis({}), 'chonchi', 'Planta Principal')).toEqual([])
  })
  it('dispara por KPI bajo umbral, críticos primero, shape generalizado', () => {
    const a = kpiTurnoAlerts(makeKpis({ oee: 0.4, availability: 0.8, mttrMin: 20 }), 'chonchi', 'Planta Principal')
    expect(a.map((x) => `${x.title}:${x.severity}`)).toEqual([
      'OEE:critical', 'MTTR:critical', 'Disponibilidad:warn',
    ])
    expect(a[0]!.kind).toBe('kpi')
    expect(a[0]!.id).toBe('kpi:oee:chonchi:2026-02-27:Turno 2')
    expect(a[0]!.link).toBe('/analisis-grader')
    expect(a[0]!.message).toContain('OEE en 40%')
  })
})

describe('preventivaVencidaAlerts', () => {
  const task = (over: Partial<PreventiveTask>): PreventiveTask =>
    ({ id: 't1', equipmentId: 'e1', nombre: 'Lubricación', activo: true, proximaEjecucion: days(5), ...over } as PreventiveTask)
  const eqName = (id: string) => (id === 'e1' ? 'Bomba 1' : id)

  it('vencida y activa → aviso warn con nombre de equipo', () => {
    const a = preventivaVencidaAlerts([task({})], eqName)
    expect(a).toHaveLength(1)
    expect(a[0]!.kind).toBe('preventiva')
    expect(a[0]!.severity).toBe('warn')
    expect(a[0]!.message).toContain('Bomba 1')
    expect(a[0]!.link).toBe('/calendario-mantencion')
  })
  it('vencida hace >30 días → critical', () => {
    expect(preventivaVencidaAlerts([task({ proximaEjecucion: days(40) })], eqName)[0]!.severity).toBe('critical')
  })
  it('futura o inactiva → sin aviso', () => {
    expect(preventivaVencidaAlerts([task({ proximaEjecucion: days(-3) })], eqName)).toEqual([])
    expect(preventivaVencidaAlerts([task({ activo: false })], eqName)).toEqual([])
  })
})

describe('equipoCondicionAlerts', () => {
  const eq = (over: Partial<Equipment>): Equipment =>
    ({ id: 'e1', codigo: '720004607', nombre: 'Bomba 1', criticidad: 'media', estado: 'operativo', ...over } as Equipment)

  it('condición 3 → critical', () => {
    const a = equipoCondicionAlerts([eq({ fichaTecnica: { condicion: 3 } })])
    expect(a).toHaveLength(1)
    expect(a[0]!.kind).toBe('equipo')
    expect(a[0]!.severity).toBe('critical')
    expect(a[0]!.message).toContain('720004607')
  })
  it('condición 1/2/sin ficha o eliminado → sin aviso', () => {
    expect(equipoCondicionAlerts([eq({ fichaTecnica: { condicion: 2 } })])).toEqual([])
    expect(equipoCondicionAlerts([eq({})])).toEqual([])
    expect(equipoCondicionAlerts([eq({ fichaTecnica: { condicion: 3 }, deleted: true })])).toEqual([])
  })
})

describe('incidenciaCriticaAlerts', () => {
  const inc = (over: Partial<Incident>): Incident =>
    ({ id: 'i1', titulo: 'Fuga', prioridad: 'critica', status: 'pendiente', createdAt: hours(30), ...over } as Incident)

  it('crítica abierta >24h → critical', () => {
    const a = incidenciaCriticaAlerts([inc({})])
    expect(a).toHaveLength(1)
    expect(a[0]!.kind).toBe('incidencia')
    expect(a[0]!.severity).toBe('critical')
    expect(a[0]!.link).toBe('/incidents')
  })
  it('crítica reciente (<24h) o cerrada → sin aviso', () => {
    expect(incidenciaCriticaAlerts([inc({ createdAt: hours(2) })])).toEqual([])
    expect(incidenciaCriticaAlerts([inc({ status: 'cerrada' })])).toEqual([])
  })
  it('alta vieja (>72h) → warn; alta de 30h → sin aviso', () => {
    expect(incidenciaCriticaAlerts([inc({ prioridad: 'alta', createdAt: days(4) })])[0]!.severity).toBe('warn')
    expect(incidenciaCriticaAlerts([inc({ prioridad: 'alta', createdAt: hours(30) })])).toEqual([])
  })
})

describe('formatAlertsMessage', () => {
  it('sin avisos → null', () => {
    expect(formatAlertsMessage([])).toBeNull()
  })
  it('arma mensaje con conteo y avisos', () => {
    const a = kpiTurnoAlerts(makeKpis({ oee: 0.4 }), 'chonchi', 'Planta Principal')
    const msg = formatAlertsMessage(a)!
    expect(msg).toContain('Mantención')
    expect(msg).toContain('OEE en 40%')
  })
})
