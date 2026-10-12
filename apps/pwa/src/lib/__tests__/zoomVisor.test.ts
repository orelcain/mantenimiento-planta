import { describe, it, expect } from 'vitest'
import { acotarPaneo, acotarZoom, zoomEnPunto, VISTA_INICIAL } from '../zoomVisor'

const m = { imgW: 400, imgH: 300, contW: 400, contH: 600 }

describe('zoomVisor', () => {
  it('acota el zoom entre 1 y 5 (y no se rompe con NaN)', () => {
    expect(acotarZoom(0.3)).toBe(1)
    expect(acotarZoom(9)).toBe(5)
    expect(acotarZoom(Number.NaN)).toBe(1)
  })

  it('el pellizco deja fijo el punto entre los dedos (no se desplaza la imagen)', () => {
    const p = { x: 100, y: -50 }
    const v = zoomEnPunto(VISTA_INICIAL, 2, p)
    // el punto de la imagen que estaba bajo los dedos sigue bajo los dedos
    const q = { x: (p.x - VISTA_INICIAL.x) / VISTA_INICIAL.z, y: (p.y - VISTA_INICIAL.y) / VISTA_INICIAL.z }
    expect(v.x + v.z * q.x).toBeCloseTo(p.x)
    expect(v.y + v.z * q.y).toBeCloseTo(p.y)
  })

  it('si los dedos se mueven, la imagen los acompaña', () => {
    const v = zoomEnPunto({ z: 2, x: 0, y: 0 }, 2, { x: 0, y: 0 }, { x: 30, y: 10 })
    expect(v).toEqual({ z: 2, x: 30, y: 10 })
  })

  it('el paneo no saca la imagen de la pantalla', () => {
    // con zoom 2 la imagen mide 800×600: sobra 200 px a cada lado en X y nada en Y (contH 600)
    expect(acotarPaneo({ z: 2, x: 500, y: 80 }, m)).toEqual({ z: 2, x: 200, y: 0 })
    expect(acotarPaneo({ z: 2, x: -500, y: -80 }, m)).toEqual({ z: 2, x: -200, y: 0 })
  })

  it('sin zoom la imagen queda centrada', () => {
    expect(acotarPaneo({ z: 1, x: 40, y: -40 }, m)).toEqual({ z: 1, x: 0, y: 0 })
  })
})
