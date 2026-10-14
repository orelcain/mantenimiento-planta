// @vitest-environment happy-dom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { cleanup, fireEvent, render } from '@testing-library/react'
import { LienzoA3c } from '../LienzoA3c'

// Lienzo de 343 × 340 px en (0, 0); la cámara del atajo «todo» muestra 343 u de ancho (1 px = 1 u).
const caja = { x: 0, y: 0, left: 0, top: 0, right: 343, bottom: 340, width: 343, height: 340, toJSON: () => ({}) }

beforeEach(() => {
  vi.spyOn(Element.prototype, 'getBoundingClientRect').mockReturnValue(caja as DOMRect)
})
afterEach(() => {
  cleanup()
  vi.restoreAllMocks()
})

const montar = (bounds: [number, number, number, number] = [-5000, -5000, 5000, 5000]) => {
  const onHover = vi.fn()
  render(
    <LienzoA3c
      hoja="23"
      dibujo=""
      textos={[]}
      idioma="es"
      presets={{ todo: { cx: 171.5, cy: 170, w: 343, l: 'Todo' } }}
      inicio="todo"
      limites={{ minW: 20, maxW: 2000, bounds }}
      etiqueta="Plano"
      onHover={onHover}
    />,
  )
  return { svg: document.querySelector('svg.a3c-lienzo')!, onHover }
}
const mouse = (x: number, y: number) => ({ pointerId: 1, pointerType: 'mouse', button: 0, clientX: x, clientY: y })
const ultimo = (f: ReturnType<typeof vi.fn>) => f.mock.calls[f.mock.calls.length - 1]

describe('LienzoA3c · globo de hover durante los gestos', () => {
  it('al apretar para arrastrar oculta el globo (no queda pegado mientras el dibujo se mueve)', () => {
    const { svg, onHover } = montar()
    fireEvent.pointerMove(svg, mouse(100, 100))
    expect(ultimo(onHover)?.[0]).toEqual([100, 100])
    fireEvent.pointerDown(svg, mouse(100, 100))
    expect(ultimo(onHover)).toEqual([null])
    onHover.mockClear()
    fireEvent.pointerMove(svg, mouse(160, 140))
    // Durante el arrastre no se vuelve a mostrar.
    expect(onHover).not.toHaveBeenCalled()
  })

  it('al soltar, el globo vuelve a nombrar lo que quedó bajo el puntero (no lo de antes del arrastre)', () => {
    const { svg, onHover } = montar()
    fireEvent.pointerDown(svg, mouse(100, 100))
    fireEvent.pointerMove(svg, mouse(160, 140))
    fireEvent.pointerUp(svg, mouse(160, 140))
    // El dibujo se corrió 60 × 40 px: bajo el puntero está el punto que antes estaba en (100, 100).
    const [u, ev] = ultimo(onHover)!
    expect(u[0]).toBeCloseTo(100)
    expect(u[1]).toBeCloseTo(100)
    expect(ev).toEqual({ x: 160, y: 140 })
  })

  it('soltar fuera del lienzo no vuelve a mostrar el globo', () => {
    const { svg, onHover } = montar()
    fireEvent.pointerDown(svg, mouse(100, 100))
    fireEvent.pointerMove(svg, mouse(400, 380))
    onHover.mockClear()
    fireEvent.pointerUp(svg, mouse(400, 380))
    expect(onHover).not.toHaveBeenCalled()
  })

  it('la rueda acerca y el globo se recalcula con la cámara ya movida (también si el límite la corre)', () => {
    // Límites estrechos: el zoom anclado en (200, 50) queda corrido por el límite, así que el
    // punto del dibujo bajo el puntero CAMBIA y solo se acierta leyendo la cámara nueva.
    const { svg, onHover } = montar([150, 150, 200, 200])
    fireEvent.pointerMove(svg, mouse(200, 50))
    onHover.mockClear()
    const rueda = new WheelEvent('wheel', { deltaY: -240, deltaMode: 0, bubbles: true, cancelable: true })
    // happy-dom no copia clientX/clientY del init de WheelEvent (el navegador sí).
    Object.defineProperties(rueda, { clientX: { value: 200 }, clientY: { value: 50 } })
    svg.dispatchEvent(rueda)
    const [s, , , , tx, ty] = (document.querySelector('.a3c-cam') as SVGGElement).style.transform.match(/-?[\d.]+(e-?\d+)?/g)!.map(Number)
    expect(s).toBeGreaterThan(1.2)
    const [u, ev] = ultimo(onHover)!
    expect(u[0]).toBeCloseTo((200 - tx!) / s!)
    expect(u[1]).toBeCloseTo((50 - ty!) / s!)
    expect(Math.abs(u[1] - 50)).toBeGreaterThan(1)
    expect(ev).toEqual({ x: 200, y: 50 })
  })
})
