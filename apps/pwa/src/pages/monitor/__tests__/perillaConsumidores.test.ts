/**
 * Fase A de la perilla: los cálculos de «Ritmo en vivo» usan la vara de cada minuto (la perilla vigente en ese instante o, si no
 * hay, el esperado de Shoplogix). Sin perillas, todo tiene que salir igual que antes; con ellas, el denominador de cada minuto
 * es la vara de ese minuto.
 */
import { describe, expect, it } from 'vitest'
import type { PerillaHistorial, PerillaMaquina } from '@/services/shoplogix/pinShiftEnd'
import type { PerillasDeLinea } from '../perilla'
import { esperadoPorMinuto, filasBaader } from '../ejeTurno'
import { pctARitmoFila } from '../MonitorV2'
import { calcularRitmoVivo, llenadoDe, vaciosTurnoDe, varaDeMinuto, varaEnMinuto, type EntradaRitmoVivo, type MaquinaSerie } from '../ritmoVivo'

/* Hora de planta (wall-as-UTC), la misma convención que `serieMinuto.desde`. */
const T0 = '2026-11-04T10:00:00.000Z'
const t0 = Date.parse(T0)
const MIN = 60_000

const cpm = (valor: number, desde: string): PerillaMaquina => ({ cpm: valor, desde, por: 'prueba' })
const hist = (machineId: string, valor: number, desde: string): PerillaHistorial => ({ machineId, cpm: valor, desde, por: 'prueba' })
const perillasDe = (actual: Record<string, PerillaMaquina>, historial: PerillaHistorial[] = []): PerillasDeLinea => ({ actual, historial })

const maq = (id: string, esperado: number | null, cycles: number[]): MaquinaSerie => ({ id, nombre: `Evisceradora ${id}`, esperado, cycles })
const entrada = (maquinas: MaquinaSerie[], perillas?: PerillasDeLinea | null): EntradaRitmoVivo => ({
  serie: { desde: T0, maquinas },
  acumulado: null,
  enCurso: [],
  perillas,
})
const minutos = (n: number, pz: number) => Array.from({ length: n }, () => pz)

describe('sin perillas: igual que antes', () => {
  it('llenadoDe y calcularRitmoVivo dan lo mismo con perillas null que sin el campo', () => {
    const maquinas = [maq('ev1', 18, minutos(8, 13)), maq('ev2', 16, minutos(8, 12))]
    expect(llenadoDe(entrada(maquinas, null), 0, 8)).toEqual(llenadoDe(entrada(maquinas), 0, 8))
    expect(calcularRitmoVivo(entrada(maquinas, null), null)).toEqual(calcularRitmoVivo(entrada(maquinas), null))
  })

  it('esperadoPorMinuto sin vara, o con vara sin perillas, da el esperado de Shoplogix', () => {
    const maquinas = [maq('ev1', 18, minutos(4, 13)), maq('ev2', 16, minutos(4, 12))]
    expect(esperadoPorMinuto(maquinas, 4)).toEqual([34, 34, 34, 34])
    expect(esperadoPorMinuto(maquinas, 4, { desde: T0, perillas: null })).toEqual([34, 34, 34, 34])
  })
})

describe('Ev1 con perilla 17 y Shoplogix 18', () => {
  const ev1 = maq('ev1', 18, minutos(6, 13))
  const perillas = perillasDe({ ev1: cpm(17, T0) })

  it('llenadoDe usa 17: 13 piezas quedan a ritmo (76 %) y el esperado de la línea es 17', () => {
    const { lineas } = llenadoDe(entrada([ev1], perillas), 0, 6)
    expect(lineas[0]!.fills).toEqual([76, 76, 76, 76, 76, 76])
    expect(lineas[0]!.esperado).toBe(17)
  })

  it('sin perilla el mismo minuto da 72 % (13 de 18): no llega a ritmo', () => {
    const { lineas } = llenadoDe(entrada([ev1]), 0, 6)
    expect(lineas[0]!.fills).toEqual([72, 72, 72, 72, 72, 72])
    expect(lineas[0]!.esperado).toBe(18)
  })

  it('aRitmo (pctARitmoFila): con perilla 17, 13 piezas NO son a ritmo (la perilla completa); 17 sí', () => {
    const conPerilla = Array.from({ length: 6 }, (_, k) => varaDeMinuto(ev1, t0, k, perillas))
    expect(pctARitmoFila(ev1.cycles, conPerilla, 6, 18)).toBe(0)
    expect(pctARitmoFila(minutos(6, 17), conPerilla, 6, 18)).toBe(100)
    const sinPerilla = Array.from({ length: 6 }, (_, k) => varaDeMinuto(ev1, t0, k, null))
    expect(pctARitmoFila(ev1.cycles, sinPerilla, 6, 18)).toBe(0)
  })

  it('Baader sin vara (meta 0 y sin perilla): pctARitmoFila da null («—»), no un porcentaje sin umbral', () => {
    const sinVara = Array.from({ length: 6 }, () => ({ cpm: 0, fuente: 'shoplogix' as const }))
    expect(pctARitmoFila(minutos(6, 12), sinVara, 6, 0)).toBeNull()
    expect(pctARitmoFila(minutos(6, 12), sinVara, 6, 16)).toBeNull()
  })

  it('la franja (filasBaader) pinta el minuto como andando con 17 y como lenta con 18', () => {
    expect(filasBaader({ desde: T0, maquinas: [ev1] }, 6, null, perillas)[0]!.celdas[0]!.estado).toBe('andando')
    expect(filasBaader({ desde: T0, maquinas: [ev1] }, 6, null)[0]!.celdas[0]!.estado).toBe('lenta')
  })

  it('vaciosTurnoDe calcula lo que pasó con la vara: 17 × 6 = 102; sin perilla 18 × 6 = 108', () => {
    expect(vaciosTurnoDe({ desde: T0, maquinas: [ev1] }, 6, null, perillas).maquinas[0]!.pasaron).toBe(102)
    expect(vaciosTurnoDe({ desde: T0, maquinas: [ev1] }, 6).maquinas[0]!.pasaron).toBe(108)
  })
})

describe('cambio de perilla a mitad del turno (17 → 19)', () => {
  const ev1 = maq('ev1', 18, minutos(10, 13))
  const perillas = perillasDe({ ev1: cpm(19, new Date(t0 + 5 * MIN).toISOString()) }, [hist('ev1', 17, T0)])

  it('llenadoDe mide los minutos 0 a 4 contra 17 y del 5 en adelante contra 19', () => {
    const { lineas } = llenadoDe(entrada([ev1], perillas), 0, 10)
    expect(lineas[0]!.fills).toEqual([76, 76, 76, 76, 76, 68, 68, 68, 68, 68])
  })

  it('esperadoPorMinuto cambia exactamente en el minuto de la anotación', () => {
    expect(esperadoPorMinuto([ev1], 10, { desde: T0, perillas })).toEqual([17, 17, 17, 17, 17, 19, 19, 19, 19, 19])
  })
})

describe('línea mixta: una Baader con perilla y otra sin ella', () => {
  const ev1 = maq('ev1', 18, minutos(8, 13))
  const ev2 = maq('ev2', 16, minutos(8, 12))
  const perillas = perillasDe({ ev1: cpm(17, T0) })

  it('cada Baader usa su vara: 17 la que tiene perilla y 16 la otra', () => {
    const r = calcularRitmoVivo(entrada([ev1, ev2], perillas), null)!
    expect(r.porMaquina.map((m) => m.esperado)).toEqual([17, 16])
    expect(r.esperadoLinea).toBe(33)
    expect(llenadoDe(entrada([ev1, ev2], perillas), 0, 8).lineas.map((l) => l.fills[0])).toEqual([76, 75])
    expect(esperadoPorMinuto([ev1, ev2], 8, { desde: T0, perillas })[0]).toBe(33)
  })

  it('el minuto de la línea (25 pz) queda a ritmo con 33 y no con 34', () => {
    const conPerilla = calcularRitmoVivo(entrada([ev1, ev2], perillas), null)!
    expect(conPerilla.minutos[0]!.tono).toBe('bien')
    expect(conPerilla.ahoraPct).toBe(76)
    const sinPerilla = calcularRitmoVivo(entrada([ev1, ev2]), null)!
    expect(sinPerilla.minutos[0]!.tono).toBe('atento')
    expect(sinPerilla.ahoraPct).toBe(74)
  })
})

describe('varaEnMinuto: los bordes', () => {
  it('sin esperado de Shoplogix no hay vara, aunque haya perilla (la compuerta de datos sigue igual)', () => {
    expect(varaEnMinuto({ id: 'ev1', esperado: null }, t0, 0, perillasDe({ ev1: cpm(17, T0) }))).toBeNull()
  })

  it('sin t0 válido no consulta la perilla: NaN la daría por vigente en cualquier instante', () => {
    expect(varaEnMinuto({ id: 'ev1', esperado: 18 }, NaN, 0, perillasDe({ ev1: cpm(17, T0) }))).toBe(18)
  })
})
