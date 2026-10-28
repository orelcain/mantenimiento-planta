/**
 * Las tres cuentas de la pestaña Análisis: lo que se protege es que "meta a esta hora" prorratee bien, que las fallas
 * caigan en la hora correcta (y se repartan si cruzan la frontera) y que el acumulado del pareto cierre en 100.
 */
import { describe, expect, it } from 'vitest'
import { datosDeHoy, detencionesPorHora, metaAEstaHora, paretoAcumulado } from '../analisisV2Datos'

const iso = (h: number, m = 0) => new Date(Date.UTC(2026, 9, 28, h, m)).toISOString()
const hora = (h: number, m = 0) => ({ hourStart: iso(h, m), from: iso(h, m) })
const ev = (maquina: string, d: string, a: string, causa: string | null = 'KNURO') => ({ maquina, desde: d, hasta: a, causa, causas: causa ? [causa] : [] })

describe('metaAEstaHora', () => {
  it('prorratea la meta de la hora: 1.935 pz/h a los 26 min = 839', () => {
    expect(metaAEstaHora(1935, 26)).toBe(839)
  })
  it('a los 60 min o más vale la hora completa', () => {
    expect(metaAEstaHora(1935, 60)).toBe(1935)
    expect(metaAEstaHora(1935, 75)).toBe(1935)
  })
  it('sin meta o sin minutos no hay resta honesta', () => {
    expect(metaAEstaHora(null, 30)).toBeNull()
    expect(metaAEstaHora(undefined, 30)).toBeNull()
    expect(metaAEstaHora(0, 30)).toBeNull()
    expect(metaAEstaHora(1935, 0)).toBeNull()
    expect(metaAEstaHora(1935, Number.NaN)).toBeNull()
  })
})

describe('detencionesPorHora', () => {
  const horas = [hora(7, 15), hora(8, 15), hora(9, 15)]

  it('pone cada falla en su hora', () => {
    const r = detencionesPorHora([ev('Evisceradora 1', iso(7, 33), iso(7, 40)), ev('Evisceradora 2', iso(8, 40), iso(8, 46))], horas)
    expect(r.map((x) => x.fallas)).toEqual([1, 1, 0])
    expect(r[0]!.min).toBeCloseTo(7)
    expect(r[1]!.min).toBeCloseTo(6)
    expect(r[2]!.items).toEqual([])
  })

  it('una falla que cruza la frontera de la hora se reparte', () => {
    const r = detencionesPorHora([ev('Evisceradora 1', iso(8, 10), iso(8, 25))], horas)
    expect(r[0]!.min).toBeCloseTo(5)
    expect(r[1]!.min).toBeCloseTo(10)
    expect(r[0]!.fallas).toBe(1)
    expect(r[1]!.fallas).toBe(1)
    expect(r[0]!.min + r[1]!.min).toBeCloseTo(15)
  })

  it('suma varias fallas de la misma hora y conserva la causa', () => {
    const r = detencionesPorHora([ev('E1', iso(7, 20), iso(7, 25), 'KNURO'), ev('E2', iso(7, 30), iso(7, 36), null)], horas)
    expect(r[0]!.fallas).toBe(2)
    expect(r[0]!.min).toBeCloseTo(11)
    expect(r[0]!.items.map((i) => i.causa)).toEqual(['KNURO', null])
  })

  it('ignora fechas ilegibles y no falla sin eventos ni horas', () => {
    expect(detencionesPorHora([ev('E1', 'x', 'y')], horas).every((h) => h.fallas === 0)).toBe(true)
    expect(detencionesPorHora([], horas).map((h) => h.min)).toEqual([0, 0, 0])
    expect(detencionesPorHora([ev('E1', iso(7, 20), iso(7, 25))], [])).toEqual([])
  })
})

describe('paretoAcumulado', () => {
  it('acumula sobre el total y cierra en 100', () => {
    const r = paretoAcumulado([{ minutes: 60 }, { minutes: 20 }, { minutes: 15 }, { minutes: 5 }])
    expect(r.map((x) => Math.round(x))).toEqual([60, 80, 95, 100])
    expect(r[r.length - 1]).toBeCloseTo(100)
  })
  it('es no decreciente', () => {
    const r = paretoAcumulado([{ minutes: 8 }, { minutes: 8 }, { minutes: 1 }])
    expect(r[1]!).toBeGreaterThanOrEqual(r[0]!)
    expect(r[2]!).toBeGreaterThanOrEqual(r[1]!)
  })
  it('sin minutos devuelve ceros, sin dividir por cero', () => {
    expect(paretoAcumulado([{ minutes: 0 }, { minutes: 0 }])).toEqual([0, 0])
    expect(paretoAcumulado([])).toEqual([])
  })
})

describe('datosDeHoy (misma cuenta que El turno)', () => {
  const live = {
    timeBreakdown: {
      windowMin: 100, producingMin: 40, plannedMin: 0, recoverableMin: 60, planned: [],
      recoverable: [
        { reason: 'Detencion', min: 60, count: 1, lineMin: 60 },
        { reason: 'KNURO', min: 21, count: 3, lineMin: 7, equivMin: 7 },
        { reason: 'Micro Detencion', min: 8, count: 4, lineMin: 8 },
      ],
    },
    mantencion: {
      porMaquina: [
        { name: 'E1', dispTecnicaPct: 90, eventosFalla: 2, fallaMin: 10, mttrMin: 5, mtbfMin: null, microN: 0, microMin: 0, causasFalla: [] },
        { name: 'E2', dispTecnicaPct: 80, eventosFalla: 3, fallaMin: 16, mttrMin: 5, mtbfMin: null, microN: 0, microMin: 0, causasFalla: [] },
      ],
      eventos: [{ maquina: 'E1', desde: iso(7, 33), hasta: iso(7, 40), min: 7, causas: ['KNURO'], paros: 1 }],
    },
  } as unknown as Parameters<typeof datosDeHoy>[0]

  it('usa los minutos de línea (equivMin antes que lineMin) y ordena las causas', () => {
    const d = datosDeHoy(live, [])
    expect(d.causas.map((c) => [c.causa, c.min])).toEqual([['Detencion', 60], ['Micro Detencion', 8], ['KNURO', 7]])
    expect(d.perdidas.reduce((a, p) => a + p.min, 0)).toBe(75)
  })

  it('mttr = minutos de falla ÷ fallas; el previo es el promedio de los turnos anteriores con fallas', () => {
    const previo = (min: number, n: number) => ({ live: { mantencion: { porMaquina: [{ eventosFalla: n, fallaMin: min }] } } }) as unknown as Parameters<typeof datosDeHoy>[1] extends Array<infer T> | null | undefined ? T : never
    const d = datosDeHoy(live, [previo(30, 3), previo(0, 0), previo(20, 1)])
    expect(d.mant?.fallas).toBe(5)
    expect(d.mant?.mttr).toBeCloseTo(26 / 5)
    expect(d.mant?.mttrPrevio).toBeCloseTo((10 + 20) / 2)
  })

  it('sin mantención publicada, mant es null', () => {
    expect(datosDeHoy({ timeBreakdown: null }, null).mant).toBeNull()
  })
})
