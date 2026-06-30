import { describe, it, expect } from 'vitest'
import { computeMaintenanceWork, maintenanceWorkHeadline } from './maintenanceWork'
import type { Incident, PreventiveExecution } from '@/types'

const RANGE = { start: '2026-05-01', end: '2026-05-31' }

function inc(over: Partial<Incident>): Incident {
  return {
    id: 'i', tipo: 'correctivo', status: 'cerrada', equipmentId: 'e1',
    createdAt: new Date('2026-05-10'), ...over,
  } as Incident
}
function exe(fecha: string): PreventiveExecution {
  return { id: 'x', taskId: 't', equipmentId: 'e1', fechaEjecucion: new Date(fecha) } as PreventiveExecution
}

describe('computeMaintenanceWork', () => {
  it('correctivas resueltas + MTTR (mediana) + causa raíz', () => {
    const incs = [
      inc({ id: 'a', resolvedAt: new Date('2026-05-12'), tiempoResolucionMinutos: 60, causaRaiz: 'rodamiento' }),
      inc({ id: 'b', resolvedAt: new Date('2026-05-13'), tiempoResolucionMinutos: 120, causaRaiz: '' }),
      inc({ id: 'c', resolvedAt: new Date('2026-05-14'), tiempoResolucionMinutos: 180, causaRaiz: 'correa' }),
      // fuera de rango (resuelta en abril) → no cuenta
      inc({ id: 'd', resolvedAt: new Date('2026-04-20'), tiempoResolucionMinutos: 999 }),
    ]
    const w = computeMaintenanceWork(incs, [], 0, RANGE)
    expect(w.correctivasResueltas).toBe(3)
    expect(w.mttrCorrectivoMin).toBe(120) // mediana de [60,120,180]
    expect(w.conCausaRaiz).toBe(2)
    expect(w.causaRaizPct).toBeCloseTo((2 / 3) * 100)
  })

  it('madurez TPM: % proactivo sobre lo creado en el rango', () => {
    const incs = [
      inc({ id: '1', tipo: 'correctivo', createdAt: new Date('2026-05-02') }),
      inc({ id: '2', tipo: 'preventivo', createdAt: new Date('2026-05-03') }),
      inc({ id: '3', tipo: 'predictivo', createdAt: new Date('2026-05-04') }),
      inc({ id: '4', tipo: 'proactivo', createdAt: new Date('2026-05-05') }),
    ]
    const w = computeMaintenanceWork(incs, [], 0, RANGE)
    expect(w.totalIncidencias).toBe(4)
    expect(w.correctivas).toBe(1)
    expect(w.proactivas).toBe(3)
    expect(w.proactivoPct).toBe(75)
  })

  it('preventivas: cumplidas en rango vs vencidas hoy → % cumplimiento', () => {
    const exes = [exe('2026-05-10'), exe('2026-05-20'), exe('2026-04-01') /* fuera */]
    const w = computeMaintenanceWork([], exes, 1, RANGE)
    expect(w.preventivasCumplidas).toBe(2)
    expect(w.preventivasVencidas).toBe(1)
    expect(w.cumplimientoPct).toBeCloseTo((2 / 3) * 100)
  })

  it('recurrencia: equipos con ≥2 incidencias en el rango', () => {
    const incs = [
      inc({ id: '1', equipmentId: 'eA', createdAt: new Date('2026-05-02') }),
      inc({ id: '2', equipmentId: 'eA', createdAt: new Date('2026-05-09') }),
      inc({ id: '3', equipmentId: 'eB', createdAt: new Date('2026-05-09') }),
    ]
    expect(computeMaintenanceWork(incs, [], 0, RANGE).equiposRecurrentes).toBe(1) // solo eA
  })

  it('rango vacío → métricas neutras (null donde no hay base)', () => {
    const w = computeMaintenanceWork([], [], 0, RANGE)
    expect(w.correctivasResueltas).toBe(0)
    expect(w.mttrCorrectivoMin).toBeNull()
    expect(w.causaRaizPct).toBeNull()
    expect(w.proactivoPct).toBeNull()
  })
})

describe('maintenanceWorkHeadline', () => {
  it('cuenta el ciclo TPM (causa raíz + prevención + proactivo), no solo el conteo', () => {
    const w = computeMaintenanceWork(
      [
        inc({ id: 'a', tipo: 'correctivo', resolvedAt: new Date('2026-05-12'), tiempoResolucionMinutos: 60, causaRaiz: 'x' }),
        inc({ id: 'b', tipo: 'preventivo', createdAt: new Date('2026-05-03') }),
      ],
      [exe('2026-05-10')],
      0,
      RANGE,
    )
    const h = maintenanceWorkHeadline(w)
    expect(h).toContain('causa raíz')
    expect(h).toContain('proactivo')
  })
  it('sin datos → frase neutra', () => {
    expect(maintenanceWorkHeadline(computeMaintenanceWork([], [], 0, RANGE))).toContain('Sin actividad')
  })
})
