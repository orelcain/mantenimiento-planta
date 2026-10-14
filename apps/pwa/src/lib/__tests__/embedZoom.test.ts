/**
 * public/embed-zoom.js — zoom táctil compartido por los embeds de HMI (Knuro, Grader, Bombeo).
 * El script es JS plano (se sirve como archivo estático): se evalúa aquí contra happy-dom con cajas
 * simuladas y eventos de puntero sintéticos.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'

type Estado = { z: number; tx: number; ty: number }
interface Zoom { reiniciar(): void; refit(): void; zoom(): number; estado(): Estado }
declare global {
  interface Window { EmbedZoom?: { init(o: Record<string, unknown>): Zoom | null } }
}

const CODIGO = readFileSync(resolve(__dirname, '../../../public/embed-zoom.js'), 'utf8')
let t = 0

function caja(el: Element, w: number, h: number, left = 0, top = 0) {
  el.getBoundingClientRect = () => ({ left, top, width: w, height: h, right: left + w, bottom: top + h, x: left, y: top, toJSON() {} }) as DOMRect
}
function puntero(el: Element, tipo: string, id: number, x: number, y: number, ms = 0) {
  const e = new MouseEvent(tipo, { bubbles: true, cancelable: true, clientX: x, clientY: y })
  Object.defineProperty(e, 'pointerId', { value: id })
  Object.defineProperty(e, 'pointerType', { value: 'touch' })
  Object.defineProperty(e, 'timeStamp', { value: (t += ms || 10) })
  el.dispatchEvent(e)
}

describe('embed-zoom.js', () => {
  let stage: HTMLDivElement, layer: HTMLDivElement, vista: { width: number; height: number }, z: Zoom

  beforeEach(() => {
    document.head.innerHTML = ''
    document.body.innerHTML = '<div id="stage"><div id="layer"><button id="valvula">v</button></div></div>'
    stage = document.getElementById('stage') as HTMLDivElement
    layer = document.getElementById('layer') as HTMLDivElement
    vista = { width: 360, height: 300 }
    caja(stage, 360, 300)
    caja(layer, 360, 270)
    ;(0, eval)(CODIGO)
    z = window.EmbedZoom!.init({ layer, stage, view: () => ({ left: 0, top: 0, ...vista }), esControl: (x: Element) => !!x.closest('#valvula') })!
  })
  afterEach(() => { delete window.EmbedZoom })

  const pellizco = (de: number, a: number) => {
    puntero(layer, 'pointerdown', 1, 180 - de / 2, 150)
    puntero(layer, 'pointerdown', 2, 180 + de / 2, 150)
    puntero(stage, 'pointermove', 1, 180 - a / 2, 150)
    puntero(stage, 'pointermove', 2, 180 + a / 2, 150)
    puntero(stage, 'pointerup', 1, 180 - a / 2, 150)
    puntero(stage, 'pointerup', 2, 180 + a / 2, 150)
  }

  it('el pellizco amplía (máx. 3×), «1×» lo deshace y el panel recibe touch-action:none', () => {
    expect(layer.style.touchAction).toBe('none')
    pellizco(60, 240)
    expect(z.zoom()).toBeGreaterThan(2.5)
    expect(z.zoom()).toBeLessThanOrEqual(3)
    expect(layer.style.transform).toContain('scale(')
    const boton = document.getElementById('btn-zoom1')!
    expect(boton.classList.contains('visible')).toBe(true)
    boton.click()
    expect(z.estado()).toEqual({ z: 1, tx: 0, ty: 0 })
    expect(layer.style.transform).toBe('')
    expect(boton.classList.contains('visible')).toBe(false)
  })

  it('no bloquea el scroll del documento al ampliar (sin overflow en <html>)', () => {
    pellizco(60, 240)
    expect(document.documentElement.classList.contains('ez-zoom')).toBe(false)
    expect(document.documentElement.style.overflow).toBe('')
    expect(layer.style.overscrollBehavior).toBe('contain')
  })

  it('el doble toque alterna 1× / 2× salvo sobre una válvula', () => {
    const v = document.getElementById('valvula')!
    puntero(layer, 'pointerdown', 1, 100, 100); puntero(stage, 'pointerup', 1, 100, 100)
    puntero(layer, 'pointerdown', 1, 100, 100); puntero(stage, 'pointerup', 1, 100, 100)
    expect(z.zoom()).toBe(2)
    puntero(layer, 'pointerdown', 1, 100, 100); puntero(stage, 'pointerup', 1, 100, 100)
    puntero(layer, 'pointerdown', 1, 100, 100); puntero(stage, 'pointerup', 1, 100, 100)
    expect(z.zoom()).toBe(1)
    puntero(v, 'pointerdown', 1, 50, 50); puntero(stage, 'pointerup', 1, 50, 50)
    puntero(v, 'pointerdown', 1, 50, 50); puntero(stage, 'pointerup', 1, 50, 50)
    expect(z.zoom()).toBe(1)
  })

  it('girar la pantalla (o cambiar mucho el ancho) vuelve al panel completo; un cambio chico no', () => {
    pellizco(60, 240)
    expect(z.zoom()).toBeGreaterThan(1)
    vista = { width: 350, height: 300 } // -3 %: se conserva
    z.refit()
    expect(z.zoom()).toBeGreaterThan(1)
    vista = { width: 640, height: 300 } // apaisado
    z.refit()
    expect(z.estado()).toEqual({ z: 1, tx: 0, ty: 0 })
    expect(document.getElementById('btn-zoom1')!.classList.contains('visible')).toBe(false)
    pellizco(60, 240)
    vista = { width: 420, height: 300 } // +31 % de ancho sin cambiar de orientación
    z.refit()
    expect(z.zoom()).toBe(1)
  })

  it('un arrastre a 1× sobre una válvula se traga el clic siguiente; un toque limpio no', () => {
    const v = document.getElementById('valvula')!
    const clic = vi.fn()
    v.addEventListener('click', clic)
    puntero(v, 'pointerdown', 1, 50, 50)
    puntero(stage, 'pointermove', 1, 120, 90)
    puntero(stage, 'pointerup', 1, 120, 90)
    v.dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true }))
    expect(clic).not.toHaveBeenCalled()
    // pasado el instante de gracia, un toque normal vuelve a accionar
    vi.useFakeTimers(); vi.advanceTimersByTime(100); vi.useRealTimers()
  })

  it('un toque limpio sí acciona la válvula', async () => {
    const v = document.getElementById('valvula')!
    const clic = vi.fn()
    v.addEventListener('click', clic)
    await new Promise(r => setTimeout(r, 90)) // vence la supresión del arrastre anterior (60 ms)
    puntero(v, 'pointerdown', 1, 50, 50)
    puntero(stage, 'pointerup', 1, 50, 50)
    v.dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true }))
    expect(clic).toHaveBeenCalledTimes(1)
  })
})
