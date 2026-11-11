/**
 * Eviscerado tiene tres Baader 142 y cada parada es de UNA de ellas. El backend
 * publica `m` (índice en `stopMachines`) desde el 27-10: la lista de una causa
 * tiene que decir de qué máquina fue cada parada, y dos Baader paradas a la vez
 * por la misma causa son DOS paradas, no un episodio fundido.
 */
import { describe, it, expect } from 'vitest'
import { agruparEventos } from '../monitorEventos'

const tb = { windowMin: 120, producingMin: 100, plannedMin: 0, recoverableMin: 20, planned: [],
  recoverable: [{ reason: 'ACUMULACION', min: 9, count: 3, lineMin: 3 }] }

const args = {
  tb,
  stopReasons: ['ACUMULACION'],
  stopMachines: ['m1', 'm2', 'm3'],
  nombresMaquina: { m1: 'Evisceradora 1', m2: 'Evisceradora 2', m3: 'Evisceradora 3' },
  stopEvents: [
    { r: 0, f: '2026-10-27T09:13:35.000Z', s: 195, m: 0 },
    { r: 0, f: '2026-10-27T09:14:00.000Z', s: 120, m: 2 },  // a la vez, en OTRA Baader
    { r: 0, f: '2026-10-27T09:30:20.000Z', s: 180, m: 0 },
  ],
  t0: '2026-10-27T07:20:00.000Z',
}

describe('paradas por máquina', () => {
  it('cada parada dice su Baader y las simultáneas no se funden', () => {
    const c = agruparEventos(args as Parameters<typeof agruparEventos>[0])
      .flatMap((g) => g.causas).find((x) => x.reason === 'ACUMULACION')!
    expect(c.paradas).toHaveLength(3)
    expect(c.paradas.map((p) => p.maquina).sort()).toEqual(['Evisceradora 1', 'Evisceradora 1', 'Evisceradora 3'])
    expect(c.paradas.find((p) => p.maquina === 'Evisceradora 3')!.maquinaId).toBe('m3')
  })

  it('sin `m` (docs viejos) sigue funcionando y no inventa máquina', () => {
    const viejos = { ...args, stopMachines: undefined, stopEvents: args.stopEvents.map(({ m: _m, ...e }) => e) }
    const c = agruparEventos(viejos as Parameters<typeof agruparEventos>[0])
      .flatMap((g) => g.causas).find((x) => x.reason === 'ACUMULACION')!
    expect(c.paradas.every((p) => p.maquina == null)).toBe(true)
    expect(c.paradas).toHaveLength(2)  // sin máquina, las simultáneas se funden como antes
  })
})
