/**
 * «A esta hora» tiene UNA sola definición para toda la vista «El turno»: piezas mostradas − las que tocaban. Antes cada
 * bloque restaba contra otra base (contador vivo, punta del reloj) y la misma pantalla decía −953, −977 y −979.
 * Lo que se protege acá: la cuenta, la base «en reposo» de la reproducción y que nada la rehaga con otra vara.
 */
import { describe, expect, it } from 'vitest'
import { aEstaHora, piezasMostradas } from '../aEstaHora'
import { armarTope, finalesCerrados, totalEnReposo, type EntradaRep } from '../reproduccionMinuto'

const entrada = (cycles: number[][]): EntradaRep => ({
  desdeMs: Date.UTC(2026, 9, 27, 21, 30),
  maquinas: cycles.map((c, i) => ({ id: `m${i}`, nombre: `Evisceradora ${i + 1}`, esperado: 16, cycles: c })),
  paradas: {},
  pulsoAtMs: null,
})

describe('aEstaHora', () => {
  it('es lo mostrado menos lo que tocaba: 9.690 − 10.667 = −977', () => {
    expect(aEstaHora(9690, 10667)).toBe(-977)
  })

  it('al día o por encima da cero o positivo', () => {
    expect(aEstaHora(10667, 10667)).toBe(0)
    expect(aEstaHora(10700, 10667)).toBe(33)
  })

  it('sin cuota, o con la cuota en cero (el turno recién parte), no hay resta honesta', () => {
    expect(aEstaHora(9690, null)).toBeNull()
    expect(aEstaHora(9690, undefined)).toBeNull()
    expect(aEstaHora(9690, 0)).toBeNull()
    expect(aEstaHora(9690, Number.NaN)).toBeNull()
  })

  it('la cuota se topa a la meta, como la ve Camino a la meta', () => {
    expect(aEstaHora(14000, 15200, 15000)).toBe(-1000)
    expect(aEstaHora(14000, 15200)).toBe(-1200)
    /* Una meta en cero o ausente no topa nada. */
    expect(aEstaHora(14000, 15200, 0)).toBe(-1200)
    expect(aEstaHora(14000, 15200, null)).toBe(-1200)
  })

  it('redondea las dos puntas: la cifra siempre es entera', () => {
    expect(aEstaHora(100.4, 200.6)).toBe(-101)
  })
})

describe('piezasMostradas · la base de «A esta hora»', () => {
  it('sin reproducción es el contador vivo', () => {
    expect(piezasMostradas(null, 9690)).toBe(9690)
    expect(piezasMostradas(undefined, 9690)).toBe(9690)
    expect(piezasMostradas({ entrada: null, tope: null }, 9690)).toBe(9690)
  })

  it('con reproducción es la suma de los minutos cerrados, no el contador (que ya va con el minuto en curso)', () => {
    const e = entrada([[10, 12, 14], [9, 9, 9], [5, 6, 7]])
    /* 36 + 27 + 18 = 81; el contador de planta va 24 adelante. */
    expect(totalEnReposo(e, armarTope(105, null))).toBe(81)
    expect(piezasMostradas({ entrada: e, tope: armarTope(105, null) }, 105)).toBe(81)
  })

  it('el contador vivo es el techo: la reproducción jamás lo supera', () => {
    const e = entrada([[10, 12, 14], [9, 9, 9], [5, 6, 7]])
    expect(piezasMostradas({ entrada: e, tope: armarTope(70, null) }, 70)).toBe(70)
  })

  it('una Baader atrasada un minuto no inventa su minuto: se cuenta hasta el menor de los largos', () => {
    const e = entrada([[10, 12, 14], [9, 9], [5, 6, 7]])
    expect(finalesCerrados(e)).toEqual([22, 18, 11])
    expect(totalEnReposo(e, null)).toBe(51)
  })

  it('sin minutos cerrados no hay nada que reproducir', () => {
    expect(totalEnReposo(entrada([[], [], []]), armarTope(10, null))).toBeNull()
    expect(totalEnReposo(null, null)).toBeNull()
    expect(finalesCerrados(entrada([]))).toEqual([])
  })

  it('la franja, el gráfico y Camino restan lo mismo: con reproducción, −996 y no −977', () => {
    /* El caso del 27-10: contador 9.690, minutos cerrados suman 9.671 → todo el mundo dice −996 contra 10.667. */
    const e = entrada([[3000, 309], [3000, 71], [3000, 291]])
    const base = piezasMostradas({ entrada: e, tope: armarTope(9690, null) }, 9690)
    expect(base).toBe(9671)
    expect(aEstaHora(base, 10667, 15000)).toBe(-996)
  })
})
