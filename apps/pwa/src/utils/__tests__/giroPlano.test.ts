import { describe, expect, it } from 'vitest'
import { geometriaGiro, siguienteGiro } from '../giroPlano'

/** Aplica la matriz de la transformación CSS a mano para comprobar que `punto` dice lo mismo. */
function cssAplicado(giro: 0 | 90 | 180 | 270, W: number, H: number, x: number, y: number) {
  const rad = (giro * Math.PI) / 180
  const [c, s] = [Math.round(Math.cos(rad)), Math.round(Math.sin(rad))]
  const [tx, ty] = giro === 90 ? [H, 0] : giro === 180 ? [W, H] : giro === 270 ? [0, W] : [0, 0]
  return [c * x - s * y + tx, s * x + c * y + ty] as const
}

describe('geometriaGiro', () => {
  const W = 800, H = 1131
  it.each([0, 90, 180, 270] as const)('a %i° el punto coincide con la transformación CSS y cae dentro del marco', (g) => {
    const geo = geometriaGiro(g, W, H)
    for (const [x, y] of [[0, 0], [W, 0], [0, H], [W, H], [123, 456]] as const) {
      const [px, py] = geo.punto(x, y)
      const [cx, cy] = cssAplicado(g, W, H, x, y)
      expect(px).toBeCloseTo(cx)
      expect(py).toBeCloseTo(cy)
      expect(px).toBeGreaterThanOrEqual(0)
      expect(px).toBeLessThanOrEqual(geo.VW)
      expect(py).toBeGreaterThanOrEqual(0)
      expect(py).toBeLessThanOrEqual(geo.VH)
    }
  })
  it('a 90° y 270° el marco queda acostado', () => {
    expect(geometriaGiro(90, W, H)).toMatchObject({ VW: H, VH: W })
    expect(geometriaGiro(270, W, H)).toMatchObject({ VW: H, VH: W })
  })
})

describe('siguienteGiro', () => {
  it('da la vuelta completa', () => {
    expect([undefined, 90, 180, 270].map((g) => siguienteGiro(g as never))).toEqual([90, 180, 270, 0])
  })
})
