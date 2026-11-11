/**
 * La cinta continua de 60 s (spec §5): qué marcas entran en la ventana, dónde van las tramas y qué se pinta con y sin «reducir
 * movimiento». Se dibuja contra un contexto que anota las llamadas (jsdom no tiene canvas): lo que se protege es la geometría
 * y los tokens del mockup (marca 3 px × 62 % del alto, cabezal 2 px al 50 %, trama cada 6 px), no los píxeles.
 */
import { describe, expect, it } from 'vitest'
import {
  alfaMarca, crecimientoMarca, datosCinta, dibujarCinta, huecosDeMinuto, marcasCinta, type ColoresCinta,
} from '../cintaCanvas'
import type { MinutoMaq } from '../reproduccionMinuto'
import type { MinutoVista } from '../useReproduccionMinuto'

const INI = Date.UTC(2026, 9, 28, 1, 0)
const S = 1000
const COL: ColoresCinta = { bien: 'azul', reja: 'reja', gris: 'gris', fg: 'fg' }

const maq = (id: string, n: number, horario: number[], tramos: Array<[number, number]> = [[0, 60]]): MinutoMaq => ({
  id, nombre: id, modelo: null, esperado: 16, n, horario, tramos, segAndando: tramos.reduce((s, [a, b]) => s + b - a, 0), estado: n === 0 ? 'detenida' : 'andando',
})
const vista = (actual: MinutoMaq[], previo: MinutoMaq[] | null): MinutoVista => ({ iniMs: INI, finMs: INI + 60 * S, maquinas: actual, previo, pulsoAtMs: null, animado: true })

/** Un contexto 2D que solo anota qué se pintó. */
function ctxEspia() {
  const llamadas: Array<{ f: string; a: number[]; alfa: number; estilo: string }> = []
  const c: Record<string, unknown> = { globalAlpha: 1, fillStyle: '', strokeStyle: '', lineWidth: 1 }
  for (const f of ['setTransform', 'clearRect', 'fillRect', 'beginPath', 'rect', 'clip', 'moveTo', 'lineTo', 'stroke', 'save', 'restore', 'roundRect', 'fill']) {
    c[f] = (...a: number[]) => { llamadas.push({ f, a, alfa: c.globalAlpha as number, estilo: String(c.fillStyle) }) }
  }
  return { x: c as unknown as CanvasRenderingContext2D, llamadas }
}
const de = (l: ReturnType<typeof ctxEspia>['llamadas'], f: string) => l.filter((q) => q.f === f)

describe('huecosDeMinuto', () => {
  it('un minuto de 0 piezas está parado entero; si no, el hueco es el complemento de los tramos andando', () => {
    expect(huecosDeMinuto(maq('a', 0, []))).toEqual([[0, 60]])
    expect(huecosDeMinuto(maq('a', 5, [1, 2], [[0, 20], [30, 60]]))).toEqual([[20, 30]])
    expect(huecosDeMinuto(maq('a', 5, [1, 2], [[10, 60]]))).toEqual([[0, 10]])
    expect(huecosDeMinuto(maq('a', 5, [1, 2], [[0, 60]]))).toEqual([])
  })
})

describe('marcasCinta · la ventana de 60 s que termina en el instante reproducido', () => {
  const d = datosCinta(vista([maq('a', 3, [10, 30, 50])], [maq('a', 2, [5, 55])]), 'a')

  it('entran las piezas del minuto anterior y del que corre que ya cayeron; ninguna futura, ninguna de hace más de 60 s', () => {
    const m = marcasCinta(d, INI + 20 * S)
    expect(m).toHaveLength(2)
    expect(m[0]).toMatchObject({ previa: true, edadS: 25 })
    expect(m[0]!.pos).toBeCloseTo(35 / 60, 6)
    expect(m[1]).toMatchObject({ previa: false, edadS: 10 })
    expect(m[1]!.pos).toBeCloseTo(50 / 60, 6)
  })

  it('pasa de un minuto al otro sin cortes: con el cabezal en 59 s se ven las del minuto anterior que aún caben', () => {
    const m = marcasCinta(d, INI + 59 * S)
    /* previo: 5 s → t = INI−55 (hace 114 s: fuera); 55 s → INI−5 (hace 64 s: fuera). Actual: 10, 30, 50 s (hace 49, 29 y 9 s). */
    expect(m.map((q) => q.edadS)).toEqual([49, 29, 9])
    const m2 = marcasCinta(d, INI + 2 * S)
    expect(m2.map((q) => q.edadS)).toEqual([57, 7])
  })

  it('sin minuto anterior (recién cargado) solo hay marcas del que corre', () => {
    const sin = datosCinta(vista([maq('a', 3, [10, 30, 50])], null), 'a')
    expect(marcasCinta(sin, INI + 40 * S)).toHaveLength(2)
  })

  it('una Baader que no está en el minuto no inventa piezas', () => {
    expect(marcasCinta(datosCinta(vista([maq('a', 3, [10])], null), 'zzz'), INI + 30 * S)).toEqual([])
  })
})

describe('tokens de la marca', () => {
  it('alfa 1 → 0,3 según la edad y la recién llegada crece 1,3 → 1 en 300 ms', () => {
    expect(alfaMarca(0)).toBe(1)
    expect(alfaMarca(60)).toBeCloseTo(0.3, 6)
    expect(alfaMarca(30)).toBeCloseTo(0.65, 6)
    expect(alfaMarca(500)).toBeCloseTo(0.3, 6)
    expect(crecimientoMarca(0)).toBeCloseTo(1.3, 6)
    expect(crecimientoMarca(0.15)).toBeCloseTo(1.15, 6)
    expect(crecimientoMarca(0.3)).toBe(1)
    expect(crecimientoMarca(20)).toBe(1)
  })
})

describe('dibujarCinta', () => {
  const W = 400
  const H = 28

  it('continua: una marca por pieza (3 px × 62 % del alto), cabezal de 2 px al 50 % pegado a la derecha y rejilla cada 10 s', () => {
    const d = datosCinta(vista([maq('a', 3, [10, 30, 50])], [maq('a', 2, [5, 55])]), 'a')
    const { x, llamadas } = ctxEspia()
    dibujarCinta(x, W, H, d, INI + 20 * S, COL, false)
    const marcas = de(llamadas, 'roundRect')
    expect(marcas).toHaveLength(2)
    for (const mk of marcas) { expect(mk.a[2]).toBe(3); expect(mk.a[3]).toBeCloseTo(H * 0.62 * 1, 6); expect(mk.a[4]).toBe(1.5) }
    expect(marcas[1]!.a[0]! + 1.5).toBeCloseTo(2 + (50 / 60) * (W - 4), 6)
    /* La más joven pesa más que la vieja. */
    expect(marcas[1]!.alfa).toBeGreaterThan(marcas[0]!.alfa)
    const cabezal = de(llamadas, 'fillRect').filter((q) => q.a[0] === W - 2 && q.a[2] === 2 && q.a[3] === H)
    expect(cabezal).toHaveLength(1)
    expect(cabezal[0]!.alfa).toBe(0.5)
    /* Rejilla: ticks de 1 × 4 px abajo; con el borde incluido, 7 en 60 s. */
    expect(de(llamadas, 'fillRect').filter((q) => q.a[2] === 1 && q.a[3] === 4)).toHaveLength(7)
  })

  it('con la recién llegada la marca crece (1,3 × 62 % del alto)', () => {
    const d = datosCinta(vista([maq('a', 1, [20])], null), 'a')
    const { x, llamadas } = ctxEspia()
    dibujarCinta(x, W, H, d, INI + 20.1 * S, COL, false)
    const [mk] = de(llamadas, 'roundRect')
    expect(mk!.a[3]).toBeCloseTo(H * 0.62 * 1.2, 4)
  })

  it('un minuto de 0 piezas lleva trama (líneas a 45° cada 6 px, recortadas a lo parado); uno andando, no', () => {
    const parada = datosCinta(vista([maq('a', 0, [])], [maq('a', 0, [])]), 'a')
    const a = ctxEspia()
    dibujarCinta(a.x, W, H, parada, INI + 30 * S, COL, false)
    expect(de(a.llamadas, 'lineTo').length).toBeGreaterThan(40)
    expect(de(a.llamadas, 'clip')).toHaveLength(de(a.llamadas, 'save').length)
    expect(de(a.llamadas, 'roundRect')).toHaveLength(0)
    const anda = datosCinta(vista([maq('a', 2, [10, 20])], [maq('a', 2, [10, 20])]), 'a')
    const b = ctxEspia()
    dibujarCinta(b.x, W, H, anda, INI + 30 * S, COL, false)
    expect(de(b.llamadas, 'lineTo')).toHaveLength(0)
  })

  it('con «reducir movimiento» es una regla en bucle: sin cabezal, las piezas del minuto en su sitio y las del anterior que aún no «llegan» tenues', () => {
    const d = datosCinta(vista([maq('a', 3, [10, 30, 50])], [maq('a', 2, [5, 55])]), 'a')
    const { x, llamadas } = ctxEspia()
    dibujarCinta(x, W, H, d, INI + 20 * S, COL, true)
    expect(de(llamadas, 'fillRect').filter((q) => q.a[2] === 2 && q.a[3] === H)).toHaveLength(0)
    const marcas = de(llamadas, 'roundRect')
    /* Anterior: 5 s ya pasó (cabezal en 20) → no; 55 s está por delante → sí, tenue. Actual: solo el de 10 s. */
    expect(marcas.map((m) => m.alfa)).toEqual([0.22, 1])
    expect(marcas[1]!.a[0]! + 1.5).toBeCloseTo(2 + (10 / 60) * (W - 4), 6)
    expect(marcas[0]!.a[0]! + 1.5).toBeCloseTo(2 + (55 / 60) * (W - 4), 6)
    /* Y no se desliza: el mismo minuto 5 s después pinta la pieza de 10 s EN EL MISMO SITIO. */
    const otra = ctxEspia()
    dibujarCinta(otra.x, W, H, d, INI + 25 * S, COL, true)
    expect(de(otra.llamadas, 'roundRect').slice(-1)[0]!.a[0]).toBe(marcas[1]!.a[0])
  })

  it('continua, en cambio, SÍ desliza: la misma pieza cinco segundos después está más a la izquierda', () => {
    const d = datosCinta(vista([maq('a', 1, [10])], null), 'a')
    const a = ctxEspia()
    const b = ctxEspia()
    dibujarCinta(a.x, W, H, d, INI + 20 * S, COL, false)
    dibujarCinta(b.x, W, H, d, INI + 25 * S, COL, false)
    expect(de(b.llamadas, 'roundRect')[0]!.a[0]).toBeLessThan(de(a.llamadas, 'roundRect')[0]!.a[0]!)
  })
})
