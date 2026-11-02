/**
 * Dónde cae el globo de la micro en PC respecto del encabezado fijo de la página y de la marca. Las medidas son las REALES de Chonchi a 1366 × 768 con la
 * página al final del scroll (barrido de 70 globos): lienzo del gráfico a 170,75 px del borde de la ventana, primera fila Ev a 236 px del
 * borde de arriba del lienzo, encabezado fijo de 49 px de alto, gráfico de 1.220 px de ancho; el globo mide de 250 a 430 px.
 */
import { describe, expect, it } from 'vitest'
import { GLOBO_AIRE_MARCA, GLOBO_SOBRE_FILA, ubicarGloboPc, type EntradaUbicacion } from '../globoPosicion'

const LIENZO_TOP = 170.75
const FILA_TOP = 236
/** El encabezado fijo (49 px) más 8 px de aire. */
const MIN_TOP = 49 + 8
const ANCHO = 640
const W = 1220

const ubicar = (alto: number, extra: Partial<EntradaUbicacion> = {}) =>
  ubicarGloboPc({ lienzoTop: LIENZO_TOP, filaTop: FILA_TOP, alto, minTop: MIN_TOP, marcaX: 600, ancho: ANCHO, izqMin: 8, derMax: W - 8, ...extra })

describe('ubicarGloboPc · el globo no queda bajo el encabezado fijo', () => {
  it('si cabe sobre la fila Ev 1 sin pasar bajo el encabezado, queda ahí, centrado en la marca: su borde de abajo 10 px sobre la fila, como siempre', () => {
    const u = ubicar(313)
    expect(u.lado).toBe('arriba')
    expect(u.top + 313).toBe(FILA_TOP - GLOBO_SOBRE_FILA)
    expect(u.left).toBe(600 - ANCHO / 2)
    /* Su borde de arriba, en la ventana, queda debajo del encabezado. */
    expect(LIENZO_TOP + u.top).toBeGreaterThanOrEqual(MIN_TOP)
  })

  it('el centrado se acota al gráfico: entre 8 px del borde izquierdo y 8 px del derecho', () => {
    expect(ubicar(300, { marcaX: 100 }).left).toBe(8)
    expect(ubicar(300, { marcaX: 1200 }).left).toBe(W - 8 - ANCHO)
  })

  it('el más alto que aún cabe (339 px) queda arriba; con 340 ya no cabe y se baja', () => {
    expect(ubicar(339).lado).toBe('arriba')
    expect(ubicar(340).lado).toBe('bajado')
  })

  it('un globo de 398 px arranca justo bajo el encabezado, con la identificación de la micro a la vista', () => {
    const u = ubicar(398)
    expect(u.lado).toBe('bajado')
    expect(LIENZO_TOP + u.top).toBe(MIN_TOP)
    /* Sin esta regla su borde de arriba quedaba a −1,25 px de la ventana: bajo el encabezado de 49 px, con la línea «Ev 1 · micro de …» tapada. */
    expect(LIENZO_TOP + (FILA_TOP - GLOBO_SOBRE_FILA - 398)).toBeLessThan(MIN_TOP)
  })

  it('con la página más arriba (más aire sobre el gráfico) el mismo globo de 398 px sí cabe encima de la fila', () => {
    const u = ubicar(398, { lienzoTop: 280 })
    expect(u.lado).toBe('arriba')
    expect(280 + u.top).toBeGreaterThanOrEqual(MIN_TOP)
  })

  it('de 250 a 430 px nunca queda bajo el encabezado, y baja solo los que no caben', () => {
    let bajados = 0
    for (let alto = 250; alto <= 430; alto++) {
      const u = ubicar(alto)
      expect(LIENZO_TOP + u.top, `alto ${alto}`).toBeGreaterThanOrEqual(MIN_TOP)
      if (u.lado === 'bajado') bajados++
      else expect(u.top + alto).toBe(FILA_TOP - GLOBO_SOBRE_FILA)
    }
    /* De 250 a 339 caben (90 alturas); de 340 a 430 se bajan (91). */
    expect(bajados).toBe(91)
  })

  it('sin encabezado fijo que esquivar (minTop = el aire de la ventana) el globo solo se baja si saldría por arriba de la ventana', () => {
    expect(ubicar(388, { minTop: 8 }).lado).toBe('arriba')
    const u = ubicar(398, { minTop: 8 })
    expect(u.lado).toBe('bajado')
    expect(LIENZO_TOP + u.top).toBe(8)
    expect(ubicar(340, { minTop: 8, lienzoTop: 100 }).lado).toBe('bajado')
  })
})

describe('ubicarGloboPc · bajado, el globo se corre a un lado para no tapar la marca que se señala', () => {
  it('a la izquierda del gráfico (la marca cerca de 200 px): el globo va a su DERECHA, a 14 px de ella', () => {
    const u = ubicar(398, { marcaX: 200 })
    expect(u.lado).toBe('bajado')
    expect(u.left).toBe(200 + GLOBO_AIRE_MARCA)
    /* No cubre la marca: su borde izquierdo queda a la derecha de ella. */
    expect(u.left).toBeGreaterThan(200)
  })

  it('a la derecha del gráfico (la marca cerca de 1.000 px): el globo va a su IZQUIERDA, a 14 px de ella', () => {
    const u = ubicar(398, { marcaX: 1000 })
    expect(u.lado).toBe('bajado')
    expect(u.left + ANCHO).toBe(1000 - GLOBO_AIRE_MARCA)
    expect(u.left + ANCHO).toBeLessThan(1000)
  })

  it('en el medio, donde no cabe a ningún lado (marca en 600), se queda centrado', () => {
    const u = ubicar(398, { marcaX: 600 })
    expect(u.lado).toBe('bajado')
    expect(u.left).toBe(600 - ANCHO / 2)
  })

  it('el límite: a la derecha cabe si left + 640 ≤ ancho − 8, a la izquierda si left ≥ 8', () => {
    /* marcaX = W − 8 − ANCHO − 14: el globo a la derecha termina justo en el borde permitido. */
    const justoDer = W - 8 - ANCHO - GLOBO_AIRE_MARCA
    expect(ubicar(398, { marcaX: justoDer }).left).toBe(justoDer + GLOBO_AIRE_MARCA)
    /* Un px más y ya no cabe a la derecha: pasa a la izquierda si cabe, y si no, centrado. */
    const u = ubicar(398, { marcaX: justoDer + 1 })
    expect(u.left).not.toBe(justoDer + 1 + GLOBO_AIRE_MARCA)
    /* A la izquierda, justo en el borde: marcaX = 8 + 640 + 14. */
    const justoIzq = 8 + ANCHO + GLOBO_AIRE_MARCA
    expect(ubicar(398, { marcaX: justoIzq, derMax: justoIzq + 100 }).left).toBe(8)
  })

  it('un globo bajado que no llega a pasar sobre la fila Ev 1 (solo roza el aire de 10 px) se queda centrado: no hay marca que proteger', () => {
    /* 340 px: se baja 0,25 px y su borde de abajo queda a 9,75 px de la fila Ev 1, todavía por encima de ella. */
    const u = ubicar(340, { marcaX: 200 })
    expect(u.lado).toBe('bajado')
    expect(u.left).toBe(8)
  })

  it('arriba (cabe) nunca se corre a un lado', () => {
    for (const marcaX of [100, 300, 600, 900, 1150]) {
      const u = ubicar(300, { marcaX })
      expect(u.lado).toBe('arriba')
      expect(u.left).toBe(Math.min(W - 8 - ANCHO, Math.max(8, marcaX - ANCHO / 2)))
    }
  })
})
