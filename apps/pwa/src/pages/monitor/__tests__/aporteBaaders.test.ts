/**
 * Las reglas de datos de la tarjeta «Ritmo» (A3): el aporte de cada Baader por restos mayores (la columna suma la Línea a la
 * vista), las comparaciones de la Línea (promedio de la línea − Σ referencias de sus Baader, sin redondear antes) y cuándo se
 * compara y cuándo se calla.
 */
import { describe, expect, it } from 'vitest'
import type { RitmoDeMaquina, RitmosPorMaquina } from '@/services/shoplogix/ritmoPorMaquina'
import { APORTE_MIN_PROD_MIN, type ReferenciaAporte } from '../aporteHistorico'
import { armarAporte, comparacion, deltaLinea, repartoPorRestos } from '../aporteBaaders'

const dec1 = (n: number) => n.toLocaleString('es-CL', { minimumFractionDigits: 1, maximumFractionDigits: 1 })
const suma1 = (v: number[]) => Math.round(v.reduce((a, b) => a + b * 10, 0)) / 10

describe('repartoPorRestos · la columna suma la Línea a la vista', () => {
  it('el caso del spec: 13,5 + 11,4 + 13,6 = 38,5 (redondeando uno a uno daba 38,4)', () => {
    /* Aportes 13,46 + 11,38 + 13,47 = 38,31: la Línea dice 38,3. Redondeando uno a uno: 13,5 + 11,4 + 13,5 = 38,4 (no suma). */
    const crudos = [13.46, 11.38, 13.47]
    const simple = crudos.map((v) => Math.round(v * 10) / 10)
    expect(suma1(simple)).toBe(38.4) // el defecto: la columna no suma la Línea (38,3)
    const r = repartoPorRestos(crudos, 1, 38.31)
    expect(suma1(r)).toBe(38.3)
    /* Sube el que tiene el mayor resto (11,38 → 11,4 y 13,47 → 13,5); el de 13,46 se queda en 13,4. */
    expect(r).toEqual([13.4, 11.4, 13.5])
    /* El del spec: 13,5 + 11,4 + 13,6 = 38,5 (Línea 38,5). */
    expect(repartoPorRestos([13.46, 11.44, 13.6], 1, 38.5)).toEqual([13.5, 11.4, 13.6])
  })

  it('el mayor resto sube primero (y los empates por orden de fila)', () => {
    /* 10,04 + 10,04 + 10,92 = 31,0: pisos 10,0 + 10,0 + 10,9 = 30,9 → falta 1 paso; los dos primeros empatan en resto (0,4):
       sube la primera fila. */
    expect(repartoPorRestos([10.04, 10.04, 10.92], 1, 31)).toEqual([10.1, 10, 10.9])
    /* Cinco de 0,04 suman 0,2: la suma redonda sigue siendo 0,2 (y no 0,0 como daría redondear cada una). */
    expect(repartoPorRestos([0.04, 0.04, 0.04, 0.04, 0.04], 1)).toEqual([0.1, 0.1, 0, 0, 0])
  })

  it('para cualquier reparto razonable la suma de lo mostrado es la Línea mostrada (barrido determinista)', () => {
    /* Semilla fija (LCG): 400 repartos de 3 Baader con aportes de 5 a 20 pz/min. */
    let x = 12345
    const azar = () => { x = (x * 1664525 + 1013904223) % 4294967296; return x / 4294967296 }
    for (let k = 0; k < 400; k++) {
      const crudos = [0, 0, 0].map(() => 5 + azar() * 15)
      const linea = crudos.reduce((a, b) => a + b, 0)
      const r = repartoPorRestos(crudos, 1, linea)
      expect(suma1(r), `reparto ${k}: ${crudos.join(', ')}`).toBe(Math.round(linea * 10) / 10)
      r.forEach((v, i) => expect(Math.abs(v - crudos[i]!), 'cada una a un paso de lo suyo').toBeLessThanOrEqual(0.1 + 1e-9))
    }
  })

  it('si el objetivo se aleja de la suma real más de un paso no deforma a una Baader: redondea cada una por separado', () => {
    expect(repartoPorRestos([13.46, 11.38, 13.47], 1, 40)).toEqual([13.5, 11.4, 13.5])
    expect(repartoPorRestos([], 1)).toEqual([])
    expect(repartoPorRestos([Number.NaN, 1], 1, 3)).toEqual([Number.NaN, 1])
  })
})

describe('comparacion · ▲ ▼ y la raya bajo 0,3', () => {
  it('sube, baja y raya (|Δ| < 0,3 no es ni logro ni caída)', () => {
    expect(comparacion(1.04)).toEqual({ texto: '▲ 1,0', clase: 'sube' })
    expect(comparacion(-0.74)).toEqual({ texto: '▼ 0,7', clase: 'baja' })
    expect(comparacion(0.2)).toEqual({ texto: '— 0,2', clase: 'raya' })
    expect(comparacion(-0.29)).toEqual({ texto: '— 0,3', clase: 'raya' })
    expect(comparacion(0.3)).toEqual({ texto: '▲ 0,3', clase: 'sube' })
  })

  it('sin dato no inventa: null', () => {
    expect(comparacion(null)).toBeNull()
    expect(comparacion(undefined)).toBeNull()
    expect(comparacion(Number.NaN)).toBeNull()
  })
})

/** Una Baader con aporte, y el resto de lo que `ritmoPorMaquina` + `conRepartoPorMaquina` le dejan. */
const baader = (nombre: string, aporte: number | null, extra: Partial<RitmoDeMaquina> = {}): RitmoDeMaquina => ({
  nombre, cpm: 15, piezas: 3000, detenida: false, uptimePct: 80, aporteCpm: aporte, pulsoCpm: null, ahoraCpm: null, ...extra,
})
const maquinas = (...v: RitmoDeMaquina[]): RitmosPorMaquina => ({ maquinas: v, promedio: 14, parejas: false })
const ref = (turnos: number, base: Record<string, number>): ReferenciaAporte => ({ porMaquina: new Map(Object.entries(base)), turnos, desde: '2026-10-27' })

const ARG = {
  producingMin: 300,
  parada: false,
  cerrado: false,
  pulsoFresco: true,
  refUltimo: null as ReferenciaAporte | null,
  refProm: null as ReferenciaAporte | null,
}
const ev = (...a: Array<number | null>) => maquinas(...a.map((v, i) => baader(`Ev ${i + 1}`, v)))

describe('armarAporte · aporte y comparaciones', () => {
  it('las Baader suman la Línea a la vista aunque cada una, redondeada sola, no la sumara', () => {
    const d = armarAporte({ ...ARG, maquinas: ev(13.46, 11.38, 13.47), promedioLinea: 38.31 })!
    expect(d.filas.map((f) => f.aporte)).toEqual([13.4, 11.4, 13.5])
    expect(d.linea.aporte).toBe(38.3)
    expect(suma1(d.filas.map((f) => f.aporte!))).toBe(d.linea.aporte)
    expect(d.esAporte).toBe(true)
  })

  it('turno en vivo con 26 pz entre el doc de las Baader y el contador (150 min): la columna igual suma la Línea', () => {
    /* Σ Baader del doc = 6.355 pz; contador de la línea = 6.381: 26 ÷ 150 = 0,17 pz/min, más que el paso de 0,1. */
    const aporte = (pz: number) => pz / 150
    const d = armarAporte({ ...ARG, producingMin: 150, maquinas: ev(aporte(2115), aporte(2116), aporte(2124)), promedioLinea: 6381 / 150 })!
    expect(d.linea.aporte).toBe(42.5)
    expect(suma1(d.filas.map((f) => f.aporte!))).toBe(d.linea.aporte)
    /* Ninguna Baader se deforma más de lo que cuesta repartir 0,17 pz/min entre tres. */
    d.filas.forEach((f, i) => expect(Math.abs(f.aporte! - aporte([2115, 2116, 2124][i]!))).toBeLessThan(0.3))
  })

  it('la Línea es el promedio del turno de la línea; si no llega, la suma de sus Baader', () => {
    expect(armarAporte({ ...ARG, maquinas: ev(10, 10, 10), promedioLinea: 30.04 })!.linea.aporte).toBe(30)
    expect(armarAporte({ ...ARG, maquinas: ev(10, 10.04, 10), promedioLinea: null })!.linea.aporte).toBe(30)
  })

  it('comparaciones de la Línea = promedio de la línea − Σ referencias de sus Baader, sin redondear antes', () => {
    const r = ref(5, { 'Ev 1': 13.04, 'Ev 2': 11.06, 'Ev 3': 12.9 }) // Σ = 37,0
    const d = armarAporte({ ...ARG, maquinas: ev(13.46, 11.44, 13.6), promedioLinea: 38.5, refUltimo: r, refProm: r })!
    expect(d.conUltimo).toBe(true)
    expect(d.conProm).toBe(true)
    /* 38,5 − 37,0 = 1,5 (no 38,5 − (13,0 + 11,1 + 12,9) = 1,5 con cada referencia redondeada: ahí 1,5 sale de casualidad). */
    expect(d.linea.vsUltimo).toBeCloseTo(1.5, 9)
    /* Cada Baader contra sí misma, sin redondear. */
    expect(d.filas[0]!.vsUltimo).toBeCloseTo(13.46 - 13.04, 9)
    expect(d.filas[1]!.vsUltimo).toBeCloseTo(11.44 - 11.06, 9)
    expect(d.filas[2]!.vsUltimo).toBeCloseTo(13.6 - 12.9, 9)
    expect(d.turnosProm).toBe(5)
  })

  it('«sin redondear antes»: el delta de la Línea no es la suma de los deltas ya redondeados', () => {
    /* Referencias de 10,04 (×3) y aportes de 10,06 (×3): cada delta crudo 0,02; la Línea 30,18 − 30,12 = 0,06. */
    const r = ref(3, { 'Ev 1': 10.04, 'Ev 2': 10.04, 'Ev 3': 10.04 })
    const d = armarAporte({ ...ARG, maquinas: ev(10.06, 10.06, 10.06), promedioLinea: 30.18, refUltimo: r, refProm: r })!
    expect(d.linea.vsUltimo).toBeCloseTo(0.06, 9)
    expect(comparacion(d.linea.vsUltimo)!.clase).toBe('raya')
  })

  it('la Línea calla su comparación si a alguna Baader le falta referencia (no se compara contra la mitad)', () => {
    const r = ref(5, { 'Ev 1': 13, 'Ev 2': 11 }) // falta Ev 3
    const d = armarAporte({ ...ARG, maquinas: ev(13.5, 11.4, 13.5), promedioLinea: 38.4, refUltimo: r, refProm: r })!
    expect(d.linea.vsUltimo).toBeNull()
    expect(d.filas[0]!.vsUltimo).toBeCloseTo(0.5, 9)
    expect(d.filas[2]!.vsUltimo).toBeNull()
  })

  it('con muestra de 1 turno solo «vs último» (vs prom. repetiría lo mismo)', () => {
    const r = ref(1, { 'Ev 1': 13, 'Ev 2': 11, 'Ev 3': 13 })
    const d = armarAporte({ ...ARG, maquinas: ev(13.5, 11.4, 13.5), promedioLinea: 38.4, refUltimo: r, refProm: r })!
    expect(d.conUltimo).toBe(true)
    expect(d.conProm).toBe(false)
    expect(d.turnosProm).toBeNull()
    expect(d.filas[0]!.vsProm).toBeNull()
    expect(d.linea.vsProm).toBeNull()
  })

  it(`antes de ${APORTE_MIN_PROD_MIN} min produciendo no hay comparación: una sola columna «vs turnos previos»`, () => {
    const r = ref(5, { 'Ev 1': 13, 'Ev 2': 11, 'Ev 3': 13 })
    const d = armarAporte({ ...ARG, producingMin: APORTE_MIN_PROD_MIN - 1, maquinas: ev(13.5, 11.4, 13.5), promedioLinea: 38.4, refUltimo: r, refProm: r })!
    expect(d.antesDeRodar).toBe(true)
    expect(d.conUltimo).toBe(false)
    expect(d.conProm).toBe(false)
    expect(d.filas.every((f) => f.vsUltimo == null && f.vsProm == null)).toBe(true)
    expect(d.linea.vsUltimo).toBeNull()
    /* Y desde los 45 min sí. */
    const rodado = armarAporte({ ...ARG, producingMin: APORTE_MIN_PROD_MIN, maquinas: ev(13.5, 11.4, 13.5), promedioLinea: 38.4, refUltimo: r, refProm: r })!
    expect(rodado.antesDeRodar).toBe(false)
    expect(rodado.conUltimo).toBe(true)
  })

  it('sin ninguna referencia no hay columnas de comparación ni nota de espera', () => {
    const d = armarAporte({ ...ARG, maquinas: ev(13.5, 11.4, 13.5), promedioLinea: 38.4 })!
    expect(d.conUltimo).toBe(false)
    expect(d.conProm).toBe(false)
    expect(d.antesDeRodar).toBe(false)
    const temprano = armarAporte({ ...ARG, producingMin: 10, maquinas: ev(13.5, 11.4, 13.5), promedioLinea: 38.4 })!
    expect(temprano.antesDeRodar).toBe(false)
  })

  it('sin aporte (turno sin minutos produciendo) cae al ritmo andando y no compara', () => {
    const r = ref(5, { 'Ev 1': 13, 'Ev 2': 11, 'Ev 3': 13 })
    const d = armarAporte({ ...ARG, maquinas: ev(null, null, null), promedioLinea: 38.4, refUltimo: r, refProm: r })!
    expect(d.esAporte).toBe(false)
    expect(d.conUltimo).toBe(false)
    expect(d.filas.map((f) => f.aporte)).toEqual([15, 15, 15])
  })

  it('«ahora» del detalle: el pulso suma el ahora de la línea, o la media de 15 min, o el cero de la línea detenida; cerrado no hay', () => {
    const conPulso = maquinas(baader('Ev 1', 13, { pulsoCpm: 19.04 }), baader('Ev 2', 11, { pulsoCpm: 16.04 }), baader('Ev 3', 13, { pulsoCpm: 14.88 }))
    const d = armarAporte({ ...ARG, maquinas: conPulso, promedioLinea: 37 })!
    expect(d.ahoraModo).toBe('pulso')
    expect(suma1(d.filas.map((f) => f.ahora!))).toBe(d.linea.ahora)
    expect(d.linea.ahora).toBe(50)
    /* Sin pulso fresco, la media de 15 min si todas la traen. */
    const reparto = maquinas(baader('Ev 1', 13, { ahoraCpm: 18 }), baader('Ev 2', 11, { ahoraCpm: 15 }), baader('Ev 3', 13, { ahoraCpm: 16 }))
    expect(armarAporte({ ...ARG, maquinas: reparto, promedioLinea: 37, pulsoFresco: false })!.ahoraModo).toBe('media15')
    /* Línea detenida: cero (regla de Orel: «si es cero que salga cero»). */
    const parada = armarAporte({ ...ARG, maquinas: reparto, promedioLinea: 37, parada: true })!
    expect(parada.ahoraModo).toBe('cero')
    expect(parada.filas.map((f) => f.ahora)).toEqual([0, 0, 0])
    expect(parada.linea.ahora).toBe(0)
    /* Turno cerrado: sin columna «ahora». */
    const cerrado = armarAporte({ ...ARG, maquinas: conPulso, promedioLinea: 37, cerrado: true })!
    expect(cerrado.ahoraModo).toBeNull()
    expect(cerrado.linea.ahora).toBeNull()
  })

  it('sin máquinas no hay tabla', () => {
    expect(armarAporte({ ...ARG, maquinas: null, promedioLinea: 10 })).toBeNull()
    expect(armarAporte({ ...ARG, maquinas: maquinas(), promedioLinea: 10 })).toBeNull()
  })
})

describe('deltaLinea', () => {
  it('calla sin referencia, sin promedio o antes de los 45 min', () => {
    const r = ref(5, { 'Ev 1': 10 })
    expect(deltaLinea(null, ['Ev 1'], 11, 300)).toBeNull()
    expect(deltaLinea(r, ['Ev 1'], null, 300)).toBeNull()
    expect(deltaLinea(r, ['Ev 1'], 11, APORTE_MIN_PROD_MIN - 1)).toBeNull()
    expect(deltaLinea(r, ['Ev 1'], 11, 300)).toBeCloseTo(1, 9)
    expect(dec1(deltaLinea(r, ['Ev 1'], 11, 300)!)).toBe('1,0')
  })
})
