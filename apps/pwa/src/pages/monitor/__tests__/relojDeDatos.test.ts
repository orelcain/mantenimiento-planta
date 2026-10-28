/**
 * Tests del reloj de datos. Las reglas que no se pueden romper:
 * lineal entre lecturas reales, nunca por encima de la última, congelado si la
 * lectura se atrasa, salto con «reducir movimiento» y detención por 2 lecturas
 * seguidas sin piezas.
 */
import { describe, expect, it } from 'vitest'
import {
  HUECO_MAX_MS, INTERVALO_DEFECTO_MS, TOPE_INTERVALO_MS,
  detenidaPorLecturas, fraccion, intervaloMedido, interpolando, lecturaAtrasada,
  lecturasSinPiezas, registrarLectura, relojInicial, valorMostrado,
} from '../relojDeDatos'

const MIN = 60_000

/** Dos lecturas vecinas: 1.000 pz a las t=0 y 1.040 pz un minuto después; la segunda llega en `llegada`. */
function dosLecturas(llegada = 10_000) {
  let e = relojInicial()
  e = registrarLectura(e, { valor: 1000, atMs: 0 }, 1)
  e = registrarLectura(e, { valor: 1040, atMs: MIN }, llegada)
  return e
}

describe('interpolación lineal entre lecturas', () => {
  it('la primera lectura se muestra tal cual, sin recta', () => {
    const e = registrarLectura(relojInicial(), { valor: 1000, atMs: 0 }, 5)
    expect(valorMostrado(e, 5, false)).toBe(1000)
    expect(interpolando(e, 5, false)).toBe(false)
  })

  it('va de la anterior a la última en línea recta durante el intervalo medido', () => {
    const e = dosLecturas(10_000)
    expect(e.duracionMs).toBe(MIN)
    expect(valorMostrado(e, 10_000, false)).toBe(1000)
    expect(valorMostrado(e, 10_000 + MIN / 2, false)).toBe(1020)
    expect(valorMostrado(e, 10_000 + MIN, false)).toBe(1040)
    expect(fraccion(e, 10_000 + MIN / 4, false)).toBeCloseTo(0.25, 10)
  })

  it('nunca supera la última lectura, por mucho que pase el tiempo', () => {
    const e = dosLecturas()
    for (const t of [MIN, MIN * 2, MIN * 60, 1e12]) expect(valorMostrado(e, 10_000 + t, false)).toBeLessThanOrEqual(1040)
    expect(valorMostrado(e, 10_000 + MIN * 5, false)).toBe(1040)
  })

  it('nunca baja de la lectura anterior aunque el reloj vaya hacia atrás', () => {
    const e = dosLecturas(10_000)
    expect(valorMostrado(e, 0, false)).toBe(1000)
  })

  it('el intervalo se mide entre lecturas y se topa en 90 s', () => {
    expect(intervaloMedido({ valor: 1, atMs: 0 }, { valor: 2, atMs: 45_000 }, 0, 0)).toBe(45_000)
    expect(intervaloMedido({ valor: 1, atMs: 0 }, { valor: 2, atMs: 150_000 }, 0, 0)).toBe(TOPE_INTERVALO_MS)
  })

  it('sin hora de lectura, mide por la llegada; sin ninguna, usa el minuto de siempre', () => {
    expect(intervaloMedido({ valor: 1, atMs: null }, { valor: 2, atMs: null }, 1000, 31_000)).toBe(30_000)
    expect(intervaloMedido({ valor: 1, atMs: null }, { valor: 2, atMs: null }, 0, 31_000)).toBe(INTERVALO_DEFECTO_MS)
  })

  it('un hueco largo entre lecturas no se anima: salta', () => {
    let e = registrarLectura(relojInicial(), { valor: 1000, atMs: 0 }, 1)
    e = registrarLectura(e, { valor: 1900, atMs: HUECO_MAX_MS + 1 }, 50_000)
    expect(valorMostrado(e, 50_000, false)).toBe(1900)
    expect(interpolando(e, 50_000, false)).toBe(false)
  })

  it('un contador que baja (otro turno) no se anima ni mezcla historial', () => {
    let e = dosLecturas()
    e = registrarLectura(e, { valor: 12, atMs: 2 * MIN }, 70_000)
    expect(valorMostrado(e, 70_000, false)).toBe(12)
    expect(e.historial).toEqual([12])
  })

  it('la misma lectura repetida no cambia el estado (misma identidad)', () => {
    const e = dosLecturas()
    expect(registrarLectura(e, { valor: 1040, atMs: MIN }, 99_999)).toBe(e)
  })
})

describe('lectura atrasada y reducir movimiento', () => {
  it('si la siguiente no llega, queda congelado en la última y se marca atrasada', () => {
    const e = dosLecturas(10_000)
    expect(lecturaAtrasada(e, 10_000 + MIN)).toBe(false)
    expect(lecturaAtrasada(e, 10_000 + 3 * MIN)).toBe(true)
    expect(valorMostrado(e, 10_000 + 3 * MIN, false)).toBe(1040)
    expect(interpolando(e, 10_000 + 3 * MIN, false)).toBe(false)
  })

  it('con reducir movimiento salta directo a la última lectura', () => {
    const e = dosLecturas(10_000)
    expect(valorMostrado(e, 10_000, true)).toBe(1040)
    expect(fraccion(e, 10_000, true)).toBe(1)
    expect(interpolando(e, 10_000, true)).toBe(false)
  })
})

describe('línea detenida por lecturas', () => {
  it('2 lecturas seguidas sin piezas = detenida (hacen falta 3 valores)', () => {
    expect(detenidaPorLecturas([100, 140, 140])).toBe(false)
    expect(detenidaPorLecturas([100, 140, 140, 140])).toBe(true)
    expect(detenidaPorLecturas([140, 140])).toBe(false)
    expect(detenidaPorLecturas([])).toBe(false)
  })

  it('en cuanto vuelve a sumar deja de estar detenida', () => {
    let e = relojInicial([100, 140, 140, 140])
    expect(detenidaPorLecturas(e.historial)).toBe(true)
    e = registrarLectura(e, { valor: 140, atMs: 0 }, 1)
    e = registrarLectura(e, { valor: 175, atMs: MIN }, 2)
    expect(detenidaPorLecturas(e.historial)).toBe(false)
  })

  it('la semilla del doc y la primera lectura vigente no cuentan dos veces el mismo valor', () => {
    const e = registrarLectura(relojInicial([100, 140]), { valor: 140, atMs: 0 }, 1)
    expect(e.historial).toEqual([100, 140])
    expect(detenidaPorLecturas(e.historial)).toBe(false)
    const parada = registrarLectura(relojInicial([140, 140, 140]), { valor: 140, atMs: 0 }, 1)
    expect(detenidaPorLecturas(parada.historial)).toBe(true)
  })

  it('cuenta las lecturas seguidas sin piezas', () => {
    expect(lecturasSinPiezas([1, 2, 3])).toBe(0)
    expect(lecturasSinPiezas([1, 2, 2, 2])).toBe(2)
  })

  it('la memoria es corta: no crece sin fin', () => {
    let e = relojInicial()
    for (let i = 0; i < 30; i++) e = registrarLectura(e, { valor: i, atMs: i * MIN }, i + 1)
    expect(e.historial.length).toBeLessThanOrEqual(8)
  })
})
