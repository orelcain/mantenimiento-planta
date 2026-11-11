/**
 * Pruebas de desglose.ts: el desglose por zona y por fila (`desgloseDe`), la línea por zona (`desgloseLineaDe`), las detenciones por
 * minuto (`detencionesPorMinuto`), el reparto de porcentajes (`repartirPorMayorResto`), la marcha inicial y la vara que cambia
 * (`varaCambio`). El caso real es el turno noche del 03-11 de Chonchi (Ev 1 con perilla 17, fixture): sus cifras esperadas son las de la
 * calibración del 04-11 (lectura de Firestore, solo lectura), no salen de este código. Los casos chicos se cuentan a mano.
 */
import { describe, expect, it } from 'vitest'
import fixture from './fixtures/chonchi_0311_turno1_minutos.json'
import type { ParadaDetalle } from '../ritmoVivo'
import {
  desgloseDe,
  desgloseLineaDe,
  detencionesPorMinuto,
  MARCHA_INICIAL_MIN,
  repartirPorMayorResto,
  varaCambio,
  type Desglose,
} from '../desglose'

const MIN = 60_000
const T0 = Date.parse('2026-11-04T01:00:00.000Z')

/** Una detención de una Baader, en segundos desde T0 (la forma que da `paradasDetalle`, con el inicio ya bajado al segundo). */
const detencion = (desdeS: number, hastaS: number, razon: string | null): ParadaDetalle => ({
  tipo: 'detencion',
  iniMs: T0 + desdeS * 1000,
  finMs: T0 + hastaS * 1000,
  durS: hastaS - desdeS,
  inicioCrudoMs: T0 + desdeS * 1000,
  razon,
})

const fila = (d: Desglose, v: number) => d.zonas.flatMap((z) => z.filas).find((f) => f.v === v)!

const ev1 = fixture.maquinas.find((m) => m.nombre === 'Evisceradora 1')!
const conDelFixture = ev1.det.map((s) => s > 0)
const razonDelFixture = ev1.raz.map((i) => (i >= 0 ? (fixture.razones[i] ?? null) : null))
const VARA_EV1 = { cpm: 17, fuente: 'perilla' as const, modo: 'calibrado' as const }

describe('repartirPorMayorResto: enteros que suman el total', () => {
  it('el resto va a la mayor fracción (39 entre 82, 29 y 68 minutos: bajo 18, parcial 6, detenida 15)', () => {
    expect(repartirPorMayorResto([82, 29, 68], 39)).toEqual([18, 6, 15])
  })

  it('a igualdad de fracción gana el primero: 100 entre tres pesos iguales', () => {
    expect(repartirPorMayorResto([1, 1, 1], 100)).toEqual([34, 33, 33])
  })

  it('sin nada que repartir da ceros', () => {
    expect(repartirPorMayorResto([0, 0, 0], 100)).toEqual([0, 0, 0])
    expect(repartirPorMayorResto([], 100)).toEqual([])
  })
})

describe('detencionesPorMinuto: el segundo y el motivo de cada minuto', () => {
  it('sin registros de detención, ningún minuto con detención', () => {
    expect(detencionesPorMinuto(undefined, T0, 3)).toEqual({ con: [false, false, false], razon: [null, null, null] })
  })

  it('una detención que cruza dos minutos marca los dos, con su motivo; el tercero no', () => {
    expect(detencionesPorMinuto([detencion(30, 90, 'COLACION')], T0, 3)).toEqual({
      con: [true, true, false],
      razon: ['COLACION', 'COLACION', null],
    })
  })

  it('una detención que termina justo cuando empieza un minuto no cuenta en ese minuto', () => {
    expect(detencionesPorMinuto([detencion(0, 60, 'AJUSTE OPERADOR')], T0, 2)).toEqual({
      con: [true, false],
      razon: ['AJUSTE OPERADOR', null],
    })
  })

  it('el motivo es el de la detención que cubre más segundos del minuto', () => {
    const detenciones = [detencion(0, 10, 'Micro Detencion'), detencion(10, 50, 'COLACION')]
    expect(detencionesPorMinuto(detenciones, T0, 1)).toEqual({ con: [true], razon: ['COLACION'] })
  })

  it('una detención en curso marca desde su inicio y no trae motivo', () => {
    const enCurso: ParadaDetalle = {
      tipo: 'detencion',
      iniMs: T0 + 2 * MIN,
      finMs: Number.POSITIVE_INFINITY,
      durS: Number.POSITIVE_INFINITY,
      inicioCrudoMs: T0 + 2 * MIN,
      razon: null,
      abierta: true,
    }
    expect(detencionesPorMinuto([enCurso], T0, 4)).toEqual({ con: [false, false, true, true], razon: [null, null, null, null] })
  })
})

describe('desgloseDe: un caso chico con los cuatro bloques (4 de 9 a ritmo)', () => {
  /* Perilla 17 calibrada: a ritmo desde 16, bajo desde 9. Cuatro minutos de 17 (a ritmo), tres de 10 (bajo), dos de 5 (parcial), ninguno detenido. */
  const cycles = [17, 17, 17, 17, 10, 10, 10, 5, 5]
  const d = desgloseDe({
    cycles,
    n: 9,
    vara: { cpm: 17, fuente: 'perilla' },
    con: Array.from({ length: 9 }, () => false),
    razon: Array.from({ length: 9 }, () => null),
  })!

  it('el «a ritmo» del frente es 4 de 9 = 44 %; bajo, parcial y detenida reparten el resto (34, 22, 0)', () => {
    expect(d.zonas.map((z) => [z.zona, z.n, z.pct])).toEqual([
      ['ritmo', 4, 44],
      ['bajo', 3, 34],
      ['parcial', 2, 22],
      ['detenida', 0, 0],
    ])
  })

  it('cada fila con minutos lleva su %, y las filas suman 100', () => {
    const filas = d.zonas.flatMap((z) => z.filas)
    expect(filas.filter((f) => f.n > 0).map((f) => [f.v, f.pct])).toEqual([
      [17, 44],
      [10, 34],
      [5, 22],
    ])
    expect(filas.reduce((a, f) => a + f.pct, 0)).toBe(100)
  })
})

describe('desgloseDe con el turno real de Chonchi (noche 03-11, Ev 1 con perilla 17)', () => {
  const d = desgloseDe({ cycles: ev1.cycles, n: ev1.cycles.length, vara: VARA_EV1, con: conDelFixture, razon: razonDelFixture })!
  const filas = d.zonas.flatMap((z) => z.filas)

  it('calibrado: umbral 16 y bajo desde 9', () => {
    expect([d.umbral, d.bajo]).toEqual([16, 9])
  })

  it('zonas: a ritmo 276 (61 %), bajo 82 (18 %), parcial 29 (6 %), detenida 68 (15 %)', () => {
    expect(d.zonas.map((z) => [z.zona, z.n, z.pct])).toEqual([
      ['ritmo', 276, 61],
      ['bajo', 82, 18],
      ['parcial', 29, 6],
      ['detenida', 68, 15],
    ])
  })

  it('filas de arriba abajo, con minutos por entero (18 es «tope o más»)', () => {
    expect(filas.map((f) => [f.v, f.n])).toEqual([
      [18, 24], [17, 189], [16, 63], [15, 28], [14, 15], [13, 15], [12, 10], [11, 3], [10, 8],
      [9, 3], [8, 5], [7, 7], [6, 3], [5, 3], [4, 4], [3, 3], [2, 3], [1, 1], [0, 68],
    ])
    expect(filas.filter((f) => f.mas).map((f) => f.v)).toEqual([18])
  })

  it('sin y con detención por fila: la 17 tiene 188 y 1; la 0 tiene 68 con detención; en total 363 y 92', () => {
    expect([fila(d, 17).sin, fila(d, 17).con]).toEqual([188, 1])
    expect(fila(d, 0).con).toBe(68)
    expect(filas.reduce((a, f) => a + f.sin, 0)).toBe(363)
    expect(filas.reduce((a, f) => a + f.con, 0)).toBe(92)
  })

  it('bajo sin detención: 89 minutos, y de esos 15 de marcha inicial', () => {
    expect([d.bajoSinDetencion, d.marchaInicial]).toEqual([89, 15])
  })

  it('los % de fila suman 100 y cada zona es la suma de sus filas', () => {
    expect(filas.reduce((a, f) => a + f.pct, 0)).toBe(100)
    for (const z of d.zonas) expect(z.filas.reduce((a, f) => a + f.pct, 0)).toBe(z.pct)
  })

  it('cada minuto con detención tiene su motivo: los motivos suman 92', () => {
    expect(filas.reduce((a, f) => a + Object.values(f.razones).reduce((b, x) => b + x, 0), 0)).toBe(92)
  })

  it('en modo óptimo, a ritmo es la perilla completa: 213 minutos, 47 %', () => {
    const o = desgloseDe({ cycles: ev1.cycles, n: ev1.cycles.length, vara: { ...VARA_EV1, modo: 'optimo' }, con: conDelFixture, razon: razonDelFixture })!
    expect(o.umbral).toBe(17)
    expect([o.zonas[0]!.n, o.zonas[0]!.pct]).toEqual([213, 47])
  })

  it('con porZona (la línea) las zonas quedan igual, sin filas', () => {
    const z = desgloseDe({ cycles: ev1.cycles, n: ev1.cycles.length, vara: VARA_EV1, con: conDelFixture, razon: razonDelFixture, porZona: true })!
    expect(z.zonas.map((b) => [b.n, b.pct])).toEqual([
      [276, 61],
      [82, 18],
      [29, 6],
      [68, 15],
    ])
    expect(z.zonas.every((b) => b.filas.length === 0)).toBe(true)
  })
})

describe('marcha inicial: el arranque y los dos minutos después de una detención', () => {
  it('la ventana es de 2 minutos', () => {
    expect(MARCHA_INICIAL_MIN).toBe(2)
  })

  it('al inicio del turno cuentan los dos primeros minutos bajo el umbral', () => {
    const d = desgloseDe({
      cycles: [5, 5, 5, 5],
      n: 4,
      vara: { cpm: 17, fuente: 'perilla' },
      con: [false, false, false, false],
      razon: [null, null, null, null],
    })!
    expect([d.bajoSinDetencion, d.marchaInicial]).toEqual([4, 2])
  })

  it('después de una detención cuentan los dos minutos siguientes, no el tercero', () => {
    const d = desgloseDe({
      cycles: [5, 5, 5, 5, 5, 5],
      n: 6,
      vara: { cpm: 17, fuente: 'perilla' },
      con: [false, true, false, false, false, false],
      razon: [null, 'AJUSTE OPERADOR', null, null, null, null],
    })!
    /* Bajo sin detención: los minutos 0, 2, 3, 4 y 5. Marcha inicial: el 0 (inicio), el 2 y el 3 (siguen a la detención del 1). El 4 ya es marcha plena. */
    expect([d.bajoSinDetencion, d.marchaInicial]).toEqual([5, 3])
  })
})

describe('desgloseDe con vara de Shoplogix (sin modo): 75 % y 50 % de siempre', () => {
  it('meta 16: a ritmo desde 12, bajo desde 8; la detenida lleva su motivo', () => {
    const d = desgloseDe({
      cycles: [12, 11, 8, 7, 0],
      n: 5,
      vara: { cpm: 16, fuente: 'shoplogix' },
      con: [false, false, false, false, true],
      razon: [null, null, null, null, 'COLACION'],
    })!
    expect([d.umbral, d.bajo]).toEqual([12, 8])
    expect(d.zonas.map((z) => [z.zona, z.n, z.pct])).toEqual([
      ['ritmo', 1, 20],
      ['bajo', 2, 40],
      ['parcial', 1, 20],
      ['detenida', 1, 20],
    ])
    expect(fila(d, 0).razones).toEqual({ COLACION: 1 })
  })
})

describe('desgloseLineaDe: la línea es la suma de sus Baaders, por zona', () => {
  /* Dos Baaders con perillas 17 y 16 (suma 33). La línea calibrada va a ritmo desde 31 (16 + 15). */
  const maquinas = [
    { cycles: [17, 17, 10], con: [false, false, true] },
    { cycles: [16, 0, 12], con: [false, false, false] },
  ]
  const d = desgloseLineaDe(maquinas, 3, { cpm: 33, fuente: 'perilla', modo: 'calibrado', partes: 2 })!

  it('suma las piezas por minuto y cuenta la detención si alguna Baader la tuvo', () => {
    expect([d.umbral, d.bajo]).toEqual([31, 17])
    /* Minuto 1: la línea hace 17 sin detención (la Baader 1 anda, la 2 hace 0 sin detención) y es arranque. */
    expect([d.bajoSinDetencion, d.marchaInicial]).toEqual([1, 1])
  })

  it('por zona y sin filas: a ritmo 1 de 3 (33 %), bajo 2 de 3 (67 %)', () => {
    expect(d.zonas.map((z) => [z.zona, z.n, z.pct, z.filas.length])).toEqual([
      ['ritmo', 1, 33, 0],
      ['bajo', 2, 67, 0],
      ['parcial', 0, 0, 0],
      ['detenida', 0, 0, 0],
    ])
  })
})

describe('desgloseDe sin vara usable no hay desglose', () => {
  it('sin cifra o con cifra cero, null', () => {
    const base = { cycles: [10], n: 1, con: [false], razon: [null] }
    expect(desgloseDe({ ...base, vara: { cpm: null, fuente: 'shoplogix' } })).toBeNull()
    expect(desgloseDe({ ...base, vara: { cpm: 0, fuente: 'perilla' } })).toBeNull()
  })
})

describe('varaCambio: si la vara del último minuto no es la de todos', () => {
  const calibrado17 = { cpm: 17, fuente: 'perilla' as const, modo: 'calibrado' as const }

  it('sin minutos, o con la misma vara en todos, no hay cambio', () => {
    expect(varaCambio([])).toBe(false)
    expect(varaCambio([calibrado17, calibrado17, calibrado17])).toBe(false)
  })

  it('una anotación a mitad de turno (17 → 19) sí es cambio', () => {
    expect(varaCambio([calibrado17, calibrado17, { ...calibrado17, cpm: 19 }])).toBe(true)
  })

  it('un cambio de modo cuenta, y también un cambio en medio aunque el último minuto vuelva a la vara de siempre', () => {
    expect(varaCambio([calibrado17, { ...calibrado17, modo: 'optimo' as const }])).toBe(true)
    expect(varaCambio([calibrado17, { ...calibrado17, cpm: 19 }, calibrado17])).toBe(true)
  })
})
