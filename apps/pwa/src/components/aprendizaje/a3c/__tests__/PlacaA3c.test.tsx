// @vitest-environment happy-dom
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { cleanup, fireEvent, render, screen, within } from '@testing-library/react'
import { interiorPlaca, interiorSvg, type A3CDatos, type PaqueteA3c, type PaquetePlaca } from '@/data/baader142A3c'
import { camaraDePreset, colorLed, LEDS_VERDES_FOTO, limitarCamara, matrizCamara } from '@/utils/aprendizaje/a3c'
import { geometriaPlaca, limitesPlaca, presetsPlaca, ZONAS_PLACA } from '@/utils/aprendizaje/a3cPlaca'
import { TarjetaA3c } from '../TarjetaA3c'

const assets = resolve(__dirname, '../../../../../public/learning-assets/baader-142/a3c')
const leer = (f: string) => readFileSync(resolve(assets, f), 'utf8')
const datos = JSON.parse(leer('a3c-datos.json')) as A3CDatos
const paquete: PaqueteA3c = { datos, dibujo: { '22': interiorSvg(leer('hoja22.svg')), '23': interiorSvg(leer('hoja23.svg')) } }
const svgPlaca = leer('placa-n2.svg')
const placa: PaquetePlaca = { dibujo: interiorPlaca(svgPlaca), geo: geometriaPlaca(svgPlaca) }

const montar = () =>
  render(<TarjetaA3c paquete={paquete} placa={placa} onVolver={() => {}} etiquetaVolver="Baader 142" dosColumnas tactil={false} />)
const host = () => document.querySelector<HTMLElement>('[data-lienzo="placa"]')
const encendidos = () => [...document.querySelectorAll('[data-lienzo="placa"] [data-encendido]')].map(e => e.id)
const ficha = () => within(screen.getByTestId('ficha-a3c'))

beforeEach(() => localStorage.clear())
afterEach(cleanup)

describe('Tarjeta A3C · vista Placa', () => {
  it('alterna Plano | Placa y recuerda la elección', () => {
    montar()
    expect(host()).toBeNull()
    expect(document.querySelector('[data-lienzo="23"]')).toBeTruthy()
    fireEvent.click(screen.getByRole('tab', { name: 'Placa' }))
    expect(host()).toBeTruthy()
    expect(document.querySelector('[data-lienzo="23"]')).toBeNull()
    expect(screen.getByText(/Placa de la N2 \(Línea 2\), dibujada desde foto/)).toBeTruthy()
    cleanup()
    montar()
    expect(host()).toBeTruthy()
    fireEvent.click(screen.getByRole('tab', { name: 'Plano' }))
    expect(host()).toBeNull()
    cleanup()
    montar()
    expect(host()).toBeNull()
  })

  it('elegir B11 enciende solo led-X5-116 en la placa y resalta borne-X5-116', () => {
    localStorage.setItem('a3c-vista-tarjeta', 'placa')
    montar()
    fireEvent.click(screen.getByRole('button', { name: /^Borne 116,/ }))
    expect(ficha().getByText('B11')).toBeTruthy()
    expect(encendidos()).toEqual(['led-X5-116'])
    expect(host()!.querySelector('#borne-X5-116')!.hasAttribute('data-elegido')).toBe(true)
    expect(host()!.querySelector('#borne-X5-45')!.hasAttribute('data-elegido')).toBe(false)
    const capa = [...document.querySelectorAll('[data-testid="leds-placa"] [data-led]')].map(g => g.getAttribute('data-led'))
    expect(capa).toEqual(['e:B11:116'])
  })

  it('sin un elemento con LED, ningún LED de la placa está encendido (el estado de la foto no se muestra)', () => {
    localStorage.setItem('a3c-vista-tarjeta', 'placa')
    montar()
    fireEvent.click(screen.getByRole('button', { name: 'Borne 11, sin etiqueta, sin LED' }))
    expect(encendidos()).toEqual([])
    expect(document.querySelectorAll('[data-testid="leds-placa"] [data-led]').length).toBe(0)
    expect(host()!.querySelector('#borne-X5-11')!.hasAttribute('data-elegido')).toBe(true)
    expect(within(screen.getByTestId('franja-led')).getByText('Sin LED')).toBeTruthy()
    // El dibujo trae LED «encendidos» en la foto: siguen ahí como dato, pero sin marca de la app.
    expect(host()!.querySelectorAll('[data-estado$="-encendido"]').length).toBeGreaterThan(0)
  })

  it('un LED verde de la foto (borne 72) sale verde en el plano, en la placa y en la franja', () => {
    montar()
    fireEvent.click(screen.getByRole('button', { name: /^Borne 72,/ }))
    const verde = (sel: string) => document.querySelector(sel)!.classList.contains('a3c-verde')
    expect(verde('[data-testid="leds-encendidos"] [data-led]')).toBe(true)
    expect(verde('[data-testid="franja-led"] .a3c-foco')).toBe(true)
    fireEvent.click(screen.getByRole('tab', { name: 'Placa' }))
    expect(encendidos()).toEqual(['led-X5-72'])
    expect(verde('[data-testid="leds-placa"] [data-led]')).toBe(true)
    // Y un rojo de la foto (B11, borne 116) no.
    fireEvent.click(screen.getByRole('button', { name: /^Borne 116,/ }))
    expect(verde('[data-testid="leds-placa"] [data-led]')).toBe(false)
  })

  it('un clic en borne-X5-45 de la placa elige B4', () => {
    localStorage.setItem('a3c-vista-tarjeta', 'placa')
    montar()
    fireEvent.click(screen.getByRole('button', { name: /^Borne 116,/ }))
    expect(ficha().getByText('B11')).toBeTruthy()
    // Elegir B11 movió la cámara de la placa: vuelve a «Todo». Sin layout en happy-dom el lienzo
    // mide 343 × 340, así que el borne se ubica en px con la misma matemática de la cámara.
    fireEvent.click(within(host()!).getByRole('button', { name: 'Todo' }))
    const cam = limitarCamara(camaraDePreset(presetsPlaca(placa.geo).todo!, 343, 340), limitesPlaca(placa.geo))
    const mz = matrizCamara(cam, 343, 340)
    const b = placa.geo.bornes.get(45)!
    const x = (b.x + b.w / 2) * mz.s + mz.tx
    const y = (b.y + b.h / 2) * mz.s + mz.ty
    const svg = host()!.querySelector('svg')!
    fireEvent.pointerDown(svg, { pointerId: 1, pointerType: 'mouse', button: 0, clientX: x, clientY: y })
    fireEvent.pointerUp(svg, { pointerId: 1, pointerType: 'mouse', button: 0, clientX: x, clientY: y })
    expect(ficha().getByText('B4')).toBeTruthy()
    expect(encendidos()).toEqual(['led-X5-45'])
  })
})

describe('placa-n2.svg · integridad y seguridad', () => {
  it('cada led-X5-n de la placa es un borne de a3c-datos.json, y cada borne X5 1–134 está dibujado', () => {
    const bornes = new Set(datos.bornes.map(b => b.borne))
    const leds = [...svgPlaca.matchAll(/id="led-X5-(\d+)"/g)].map(m => Number(m[1]))
    expect(leds.length).toBe(placa.geo.leds.size)
    for (const n of leds) expect(bornes.has(n)).toBe(true)
    for (let n = 1; n <= 134; n++) expect(placa.geo.bornes.has(n)).toBe(true)
  })

  it('la tabla de LED verdes de la app es exactamente la de la foto (data-estado verde-*)', () => {
    const verdes = [...svgPlaca.matchAll(/id="led-X5-(\d+)"[^>]*data-estado="verde/g)].map(m => Number(m[1])).sort((a, b) => a - b)
    expect([...LEDS_VERDES_FOTO].sort((a, b) => a - b)).toEqual(verdes)
    for (const [n, l] of placa.geo.leds) expect(l.color).toBe(colorLed(n))
  })

  it('geometría y atajos salen de las regletas reales', () => {
    expect(placa.geo.regletas.map(r => `${r.desde}-${r.hasta}`)).toEqual(['1-29', '30-54', '55-65', '66-94', '95-123', '124-134'])
    const ps = presetsPlaca(placa.geo)
    expect(Object.keys(ps)).toEqual(['todo', ...ZONAS_PLACA.map(z => z.k)])
    // El borne 116 y su LED caen dentro del atajo 95–134.
    const [x0, y0, x1, y1] = ps.p95!.bb!
    const l = placa.geo.leds.get(116)!
    expect(l.x > x0 && l.x < x1 && l.y > y0 && l.y < y1).toBe(true)
  })

  it('no trae scripts, manejadores, enlaces externos ni objetos incrustados; lo insertado va sin <style> ni notas', () => {
    expect(svgPlaca).not.toMatch(/<script/i)
    expect(svgPlaca).not.toMatch(/\son[a-z]+\s*=/i)
    expect(svgPlaca).not.toMatch(/href\s*=\s*"(?!#)/i)
    expect(svgPlaca).not.toMatch(/<(foreignObject|image|iframe|use)\b/i)
    expect(placa.dibujo).not.toMatch(/<(style|title|desc|metadata)\b/)
    expect(placa.dibujo).toMatch(/class="a3cp-led"/)
  })
})
