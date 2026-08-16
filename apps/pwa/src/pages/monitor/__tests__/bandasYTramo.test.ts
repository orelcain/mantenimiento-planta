/**
 * Lo que el gráfico puede afirmar de un tramo, y cuánto mide una banda.
 *
 * ⚠⚠ Los dos defectos que esto congela salieron de mirar «Micro Detencion» del
 * 12-08 en Filete (datos REALES, verificados contra Firestore):
 *
 *   08:26:06 → 08:26:21   15 s
 *   08:26:36 → 08:26:51   15 s
 *   08:29:36 → 08:30:51   75 s   ← un solo evento, no una fusión
 *
 * 1. El chip del tramo 08:25-08:30 decía «Micro Detencion 15 s» porque tomaba
 *    el PRIMER evento que rozara el tramo. Ni la parada más larga, ni el
 *    total, ni lo que cabía adentro: 54 s (15 + 15 + los 24 s de la de 75 que
 *    entran antes de las 08:30).
 * 2. La banda se dibujaba con un piso de 0,6 barras — media barra de 5 min
 *    para una parada de 15 s. La duración se leía veinte veces más larga.
 *
 * Las funciones viven dentro del componente `Sparkbars`, así que acá se
 * replica su aritmética exacta: si cambia allá, este test deja de proteger y
 * hay que moverlo. Es el precio de no exportar internals solo para testear.
 */
import { describe, it, expect } from 'vitest'

/** Los eventos reales de esa ventana. */
const EVENTOS = [
  { f: '2026-08-12T08:26:06.000Z', s: 15 },
  { f: '2026-08-12T08:26:36.000Z', s: 15 },
  { f: '2026-08-12T08:29:36.000Z', s: 75 },
  { f: '2026-08-12T08:31:06.000Z', s: 15 },
]
const PASO = 5 * 60_000
const T_TRAMO = Date.parse('2026-08-12T08:25:00.000Z')

/** La suma que hace `paroEnTramo`: solape de cada parada CON el tramo. */
function segundosEnTramo(desde: number) {
  const hasta = desde + PASO
  let sec = 0
  let cuantas = 0
  for (const e of EVENTOS) {
    const a = Date.parse(e.f)
    const b = a + e.s * 1000
    const solape = Math.min(b, hasta) - Math.max(a, desde)
    if (solape <= 0) continue
    sec += solape / 1000
    cuantas += 1
  }
  return { sec: Math.round(sec), cuantas }
}

describe('el tramo dice lo que de verdad paró adentro', () => {
  it('⚠ suma las paradas del tramo en vez de mostrar la primera', () => {
    const r = segundosEnTramo(T_TRAMO)
    // 15 + 15 + 24 (lo que la de 75 s alcanza a meter antes de las 08:30)
    expect(r.sec).toBe(54)
    expect(r.cuantas).toBe(3)
    // El número viejo, el que se veía en pantalla:
    expect(r.sec).not.toBe(15)
  })

  it('la cola de una parada larga cuenta en el tramo SIGUIENTE, no entera', () => {
    const r = segundosEnTramo(T_TRAMO + PASO)   // 08:30-08:35
    // 51 s de la de 75 + 15 s de la de las 08:31
    expect(r.sec).toBe(66)
    expect(r.cuantas).toBe(2)
  })
})

describe('la banda mide lo que duró la parada', () => {
  /** La interpolación de `xDe`: índice del tramo + fracción adentro. */
  const stepX = 1
  const xDe = (ms: number) => {
    const i = Math.floor((ms - T_TRAMO) / PASO)
    const frac = (ms - (T_TRAMO + i * PASO)) / PASO
    return (i + frac) * stepX
  }

  it('⚠ una microparada de 15 s NO ocupa media barra de 5 min', () => {
    const a = Date.parse('2026-08-12T08:26:06.000Z')
    const ancho = xDe(a + 15_000) - xDe(a)
    // 15 s de 300 = 5% del tramo. El piso viejo (0,6 barras) daba 60%.
    expect(ancho).toBeCloseTo(0.05, 2)
    expect(ancho).toBeLessThan(0.6)
  })

  it('la de 75 s ocupa un cuarto del tramo, y cruza al siguiente', () => {
    const a = Date.parse('2026-08-12T08:29:36.000Z')
    const ancho = xDe(a + 75_000) - xDe(a)
    expect(ancho).toBeCloseTo(0.25, 2)
    // Empieza en el primer tramo (índice 0) y termina en el segundo.
    expect(xDe(a)).toBeLessThan(1)
    expect(xDe(a + 75_000)).toBeGreaterThan(1)
  })
})
