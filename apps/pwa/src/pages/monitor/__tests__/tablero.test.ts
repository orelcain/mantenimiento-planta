import { describe, expect, it } from 'vitest'
import { combinarTablero, type TarjetaLayout } from '../Tablero'

const FABRICA: TarjetaLayout[] = [
  { id: 'a', w: 3, h: 4 },
  { id: 'b', w: 3, h: 8 },
  { id: 'c', w: 6, h: 12 },
  { id: 'd', w: 3, h: 2 },
]

describe('combinarTablero', () => {
  it('sin nada guardado devuelve la fábrica (copiada, no la misma referencia)', () => {
    const r = combinarTablero(null, FABRICA)
    expect(r).toEqual(FABRICA)
    expect(r[0]).not.toBe(FABRICA[0])
  })

  it('lo guardado manda: orden y tamaños del usuario', () => {
    const guardado = [
      { id: 'c', w: 4, h: 6 },
      { id: 'a', w: 2, h: 3 },
      { id: 'b', w: 3, h: 8 },
      { id: 'd', w: 3, h: 2 },
    ]
    expect(combinarTablero(guardado, FABRICA)).toEqual(guardado)
  })

  it('una tarjeta nueva (no está en lo guardado) entra en su posición de fábrica', () => {
    /* El usuario guardó antes de que existiera "c": no puede nacer enterrada
       al final — entra donde la fábrica la pone. */
    const guardado = [
      { id: 'b', w: 3, h: 8 },
      { id: 'a', w: 3, h: 4 },
      { id: 'd', w: 3, h: 2 },
    ]
    const r = combinarTablero(guardado, FABRICA)
    expect(r.map((t) => t.id)).toEqual(['b', 'a', 'c', 'd'])
    expect(r[2]).toEqual({ id: 'c', w: 6, h: 12 })
  })

  it('ids que ya no existen se descartan sin romper el orden del usuario', () => {
    const guardado = [
      { id: 'fantasma', w: 3, h: 3 },
      { id: 'd', w: 4, h: 5 },
      { id: 'a', w: 3, h: 4 },
    ]
    const r = combinarTablero(guardado, FABRICA)
    /* El usuario puso `d` primero: eso manda. Las que faltan (b, c) entran
       en sus posiciones de fábrica dentro de lo que queda. */
    expect(r.map((t) => t.id)).toEqual(['d', 'b', 'c', 'a'])
    expect(r[0]).toEqual({ id: 'd', w: 4, h: 5 })
  })

  it('solo ids muertos guardados = fábrica limpia', () => {
    const r = combinarTablero([{ id: 'x', w: 3, h: 3 }], FABRICA)
    expect(r).toEqual(FABRICA)
  })

  it('tamaños guardados fuera de rango se acotan al riel (2-6 × 2-24)', () => {
    const guardado = [
      { id: 'a', w: 1, h: 99 },
      { id: 'b', w: 9, h: 0 },
      { id: 'c', w: 6, h: 12 },
      { id: 'd', w: 3, h: 2 },
    ]
    const r = combinarTablero(guardado, FABRICA)
    expect(r[0]).toEqual({ id: 'a', w: 2, h: 24 })
    expect(r[1]).toEqual({ id: 'b', w: 6, h: 2 })
  })

  it('el estado del turno cambia la fábrica sin perder lo personalizado', () => {
    /* La fábrica VIVA trae una tarjeta extra (pronóstico): el layout guardado
       en cerrado la recibe en su lugar de fábrica al pasar a vivo. */
    const fabricaViva: TarjetaLayout[] = [
      FABRICA[0]!, { id: 'pronostico', w: 3, h: 5 }, ...FABRICA.slice(1),
    ]
    const guardadoCerrado = [
      { id: 'd', w: 5, h: 3 },
      { id: 'a', w: 3, h: 4 },
      { id: 'b', w: 3, h: 8 },
      { id: 'c', w: 6, h: 12 },
    ]
    const r = combinarTablero(guardadoCerrado, fabricaViva)
    expect(r.map((t) => t.id)).toEqual(['d', 'pronostico', 'a', 'b', 'c'])
    expect(r[0]!.w).toBe(5)
  })
})
