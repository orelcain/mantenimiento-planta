/**
 * `bordeLibre.ts`: lo fijo de la página que tapa un globo (la cabecera y la barra de PC, sticky z-20, y la banda de la detención en curso, sticky z-10 bajo la
 * cabecera en PC) y cómo se trae un globo a la vista sin dejarlo debajo de ello. jsdom no tiene geometría: se simula el `getBoundingClientRect` de cada pieza.
 */
import { afterEach, describe, expect, it, vi } from 'vitest'
import { AIRE_BORDE, bordeLibreArriba, traerALaVista } from '../bordeLibre'

const rect = (top: number, h: number) => ({ top, bottom: top + h, left: 0, right: 0, width: 0, height: h, x: 0, y: top, toJSON: () => ({}) }) as DOMRect
const pieza = (clase: string, top: number, h: number, position = 'static') => {
  const el = document.createElement('div')
  el.className = clase
  el.style.position = position
  el.getBoundingClientRect = () => rect(top, h)
  document.body.appendChild(el)
  return el
}

afterEach(() => { document.body.innerHTML = '' })

describe('bordeLibreArriba · el primer px de la ventana que lo fijo de la página no tapa', () => {
  it('sin nada fijo es 0', () => {
    expect(bordeLibreArriba()).toBe(0)
  })

  it('la cabecera sola (56 px) y la barra de PC (49 px): manda la de más abajo', () => {
    pieza('v2-cabecera', 0, 56)
    expect(bordeLibreArriba()).toBe(56)
    pieza('v2-barra-pc', 0, 49)
    expect(bordeLibreArriba()).toBe(56)
  })

  it('la banda PEGADA (sticky, 52 px bajo la cabecera de 56) manda: el borde libre es el de abajo de la banda (108 px)', () => {
    pieza('v2-cabecera v2-barra-pc', 0, 56)
    pieza('rv-banda', 56, 52, 'sticky')
    expect(bordeLibreArriba()).toBe(108)
  })

  it('la banda en el flujo de la página (celular: no es sticky) no cuenta, ni una pieza oculta (alto 0)', () => {
    pieza('v2-cabecera', 0, 56)
    pieza('rv-banda', 300, 52, 'static')
    pieza('v2-barra-pc', 0, 0)
    expect(bordeLibreArriba()).toBe(56)
  })
})

describe('traerALaVista · lo mínimo, sin quedar bajo lo fijo', () => {
  it('el margen de arriba es el borde libre más el aire (cabecera 56 + banda hasta 108 + 8 = 116 px) y se usa `block: nearest`', () => {
    pieza('v2-cabecera', 0, 56)
    pieza('rv-banda', 56, 52, 'sticky')
    const globo = document.createElement('div')
    document.body.appendChild(globo)
    const ver = vi.fn()
    globo.scrollIntoView = ver
    traerALaVista(globo)
    expect(globo.style.scrollMarginTop).toBe(`${108 + AIRE_BORDE}px`)
    expect(ver).toHaveBeenCalledTimes(1)
    expect(ver.mock.calls[0]![0]).toMatchObject({ block: 'nearest' })
  })

  it('sin `scrollIntoView` (entorno viejo) no revienta', () => {
    const globo = document.createElement('div')
    document.body.appendChild(globo)
    expect(() => traerALaVista(globo)).not.toThrow()
  })
})
