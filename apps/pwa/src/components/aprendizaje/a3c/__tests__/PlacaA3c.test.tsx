// @vitest-environment happy-dom
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { cleanup, fireEvent, render, screen, within } from '@testing-library/react'
import { interiorPlaca, interiorSvg, type A3CDatos, type PaqueteA3c, type PaquetePlaca } from '@/data/baader142A3c'
import { camaraDePreset, colorLed, construirModelo, describir, LEDS_VERDES_FOTO, limitarCamara, matrizCamara } from '@/utils/aprendizaje/a3c'
import { geometriaPlaca, leerTransform, ledsGrupoPlaca, ledsNeutrosPlaca, ledsPlaca, limitesPlaca, presetsPlaca, ZONAS_PLACA } from '@/utils/aprendizaje/a3cPlaca'
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

  it('elegir B11 marca led-X5-116 con contorno (en reposo ya está encendido), sin encenderlo, y resalta borne-X5-116', () => {
    localStorage.setItem('a3c-vista-tarjeta', 'placa')
    montar()
    fireEvent.click(screen.getByRole('button', { name: /^Borne 116,/ }))
    expect(ficha().getByText('B11')).toBeTruthy()
    expect(encendidos()).toEqual([])
    expect([...host()!.querySelectorAll('[id^="led-"][data-grupo]')].map(e => e.id)).toEqual(['led-X5-116'])
    expect(host()!.querySelector('#borne-X5-116')!.hasAttribute('data-elegido')).toBe(true)
    expect(host()!.querySelector('#borne-X5-45')!.hasAttribute('data-elegido')).toBe(false)
    expect(document.querySelectorAll('[data-testid="leds-placa"] [data-led]')).toHaveLength(0)
    expect(screen.getByTestId('franja-led').textContent).toContain('se espera que se apague')
    expect(screen.getByTestId('franja-led').textContent).toContain('En la foto de la N2: encendido')
  })

  it('elegir B13 no enciende ningún LED de la placa y marca los 10 como grupo', () => {
    localStorage.setItem('a3c-vista-tarjeta', 'placa')
    montar()
    fireEvent.click(screen.getByRole('button', { name: /^Borne 32,/ }))
    expect(ficha().getByText('B13')).toBeTruthy()
    expect(encendidos()).toEqual([])
    expect(document.querySelectorAll('[data-testid="leds-placa"] [data-led]')).toHaveLength(0)
    const grupo = [...host()!.querySelectorAll('[id^="led-"][data-grupo]')].map(e => e.id).sort()
    expect(grupo).toEqual(Array.from({ length: 10 }, (_, i) => `led-X5-${32 + i}`).sort())
    expect(document.querySelectorAll('[data-testid="leds-placa-grupo"] circle')).toHaveLength(10)
    expect(screen.getByTestId('franja-led').textContent).toContain('estaban encendidos 32, 35 y 37 a 40')
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
    // Y un rojo de la foto (B1, borne 42) no.
    fireEvent.click(screen.getByRole('button', { name: /^Borne 42,/ }))
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

/** Toca (mouse) un punto del dibujo de la placa con la cámara en «Todo» (lienzo de 343 × 340 en happy-dom). */
function tocarPlaca(x: number, y: number) {
  fireEvent.click(within(host()!).getByRole('button', { name: 'Todo' }))
  const cam = limitarCamara(camaraDePreset(presetsPlaca(placa.geo).todo!, 343, 340), limitesPlaca(placa.geo))
  const mz = matrizCamara(cam, 343, 340)
  const svg = host()!.querySelector('svg')!
  const e = { pointerId: 1, pointerType: 'mouse', button: 0, clientX: x * mz.s + mz.tx, clientY: y * mz.s + mz.ty }
  fireEvent.pointerDown(svg, e)
  fireEvent.pointerUp(svg, e)
}

describe('Tarjeta A3C · LED de estado «60V DC» en la placa', () => {
  it('tocar led-estado-4 elige el LED 60V DC SM4: punto ámbar fijo (color de la foto), sin encenderlo', () => {
    localStorage.setItem('a3c-vista-tarjeta', 'placa')
    montar()
    const l = placa.geo.ledsEstado.get('V60_4')!
    tocarPlaca(l.x, l.y)
    expect(within(screen.getByTestId('franja-led')).getByText('LED 60V DC SM4')).toBeTruthy()
    expect(screen.getByTestId('franja-led').textContent).toContain('En la foto de la N2: encendido (ámbar)')
    expect(encendidos()).toEqual([])
    expect([...host()!.querySelectorAll('[id^="led-"][data-neutro]')].map(e => e.id)).toEqual(['led-estado-4'])
    expect(document.querySelector('[data-testid="leds-placa-neutros"] circle')!.classList.contains('a3c-ambar')).toBe(true)
    fireEvent.click(screen.getByRole('tab', { name: 'Plano' }))
    expect(document.querySelectorAll('[data-testid="leds-encendidos"] [data-led]')).toHaveLength(0)
    const plano = [...document.querySelectorAll('[data-testid="leds-neutros"] [data-neutro]')].map(g => g.getAttribute('data-neutro'))
    expect(plano).toEqual(['l:V60_4:V60_4'])
  })

  it('elegir el motor SM1 marca led-estado-1 (su LED «60V DC») con contorno, sin encenderlo; «Ver» queda en la placa', () => {
    localStorage.setItem('a3c-vista-tarjeta', 'placa')
    montar()
    fireEvent.change(screen.getByLabelText('Buscar elemento, borne o LED'), { target: { value: 'SM1' } })
    fireEvent.click(screen.getAllByRole('button', { name: /^SM1 / })[0]!)
    expect(ficha().getByText('SM1')).toBeTruthy()
    expect(encendidos()).toEqual([])
    expect([...host()!.querySelectorAll('[id^="led-"][data-grupo]')].map(e => e.id)).toEqual(['led-estado-1'])
    expect(screen.getByTestId('franja-led').textContent).toContain('El plano no dice cuándo prende cada uno')
    expect(within(screen.getByTestId('franja-led')).getByText('LED 60V DC SM1 y Step SM1')).toBeTruthy()
    expect(screen.getByRole('button', { name: 'Ver LED 60V DC SM1 y Step SM1 en la tarjeta' })).toBeTruthy()
  })

  it('X5:139 no está dibujado en la placa: la franja lo dice y «Ver en el plano» cambia a Plano con el LED 139 en gris', () => {
    localStorage.setItem('a3c-vista-tarjeta', 'placa')
    montar()
    fireEvent.click(screen.getByRole('button', { name: /^Borne 139,/ }))
    expect(encendidos()).toEqual([])
    const franja = within(screen.getByTestId('franja-led'))
    expect(franja.getByText(/No está dibujado en la placa/)).toBeTruthy()
    fireEvent.click(franja.getByRole('button', { name: 'Ver LED 139 en el plano' }))
    expect(host()).toBeNull()
    expect(screen.getByRole('tab', { name: 'Plano' }).getAttribute('aria-selected')).toBe('true')
    expect(document.querySelectorAll('[data-testid="leds-encendidos"] [data-led]')).toHaveLength(0)
    const plano = [...document.querySelectorAll('[data-testid="leds-neutros"] [data-neutro]')].map(g => g.getAttribute('data-neutro'))
    expect(plano).toEqual(['b:139:139'])
    expect(within(screen.getByTestId('franja-led')).getByRole('button', { name: 'Ver LED 139 en la tarjeta' })).toBeTruthy()
  })

  it('X5:136 (sin LED) tampoco está en la placa: la franja lo dice y «Ver en el plano» lleva a su celda', () => {
    localStorage.setItem('a3c-vista-tarjeta', 'placa')
    montar()
    fireEvent.click(screen.getByRole('button', { name: /^Borne 136,/ }))
    const franja = within(screen.getByTestId('franja-led'))
    expect(franja.getByText('Sin LED')).toBeTruthy()
    expect(franja.getByText(/No está dibujado en la placa/)).toBeTruthy()
    fireEvent.click(franja.getByRole('button', { name: 'Ver el borne 136 en el plano' }))
    expect(host()).toBeNull()
    expect(screen.getByRole('tab', { name: 'Plano' }).getAttribute('aria-selected')).toBe('true')
    // En el plano vuelve a ser «Sin LED», sin botón.
    expect(within(screen.getByTestId('franja-led')).queryByRole('button')).toBeNull()
  })

  it('el borne 103 enciende led-X5-103 (un LED por fila en el plano; lo dudoso era solo el estado de la foto)', () => {
    localStorage.setItem('a3c-vista-tarjeta', 'placa')
    montar()
    fireEvent.click(screen.getByRole('button', { name: /^Borne 103,/ }))
    expect(encendidos()).toEqual(['led-X5-103'])
  })
})

describe('Tarjeta A3C · B50 y B42 (hojas 11 y 21)', () => {
  const buscarYElegir = (q: string) => {
    fireEvent.change(screen.getByLabelText('Buscar elemento, borne o LED'), { target: { value: q } })
    fireEvent.click(screen.getAllByRole('button', { name: new RegExp(`^${q} `) })[0]!)
  }
  const plano = () => [...document.querySelectorAll('[data-testid="leds-encendidos"] [data-led]')].map(g => g.getAttribute('data-led'))

  it('elegir B50 enciende el LED 126 (hoja 11) y la ficha avisa de la hoja 23 en el 128', () => {
    montar()
    buscarYElegir('B50')
    expect(ficha().getByText('B50')).toBeTruthy()
    expect(plano()).toEqual(['e:B50:126'])
    expect(document.querySelectorAll('[data-testid="leds-grupo"] [data-grupo]')).toHaveLength(0)
    expect(screen.getByTestId('franja-led').textContent).toContain('LED 126')
    expect(screen.getByTestId('franja-led').textContent).toContain('Plano 888, hoja 11: LED en la entrada X5:126')
    expect(ficha().getByText(/La hoja 23 rotula B50 en el 128, pero las hojas 9 y 21 llevan al 128 la señal A3C_128 del contacto K7/)).toBeTruthy()
    fireEvent.click(screen.getByRole('tab', { name: 'Placa' }))
    expect(encendidos()).toEqual(['led-X5-126'])
    expect(host()!.querySelectorAll('[id^="led-"][data-grupo]')).toHaveLength(0)
  })

  it('B42 se alcanza desde el buscador y desde su borne 127', () => {
    montar()
    buscarYElegir('B42')
    expect(plano()).toEqual(['e:B42:127'])
    fireEvent.click(screen.getByRole('button', { name: /^Borne 45,/ }))
    fireEvent.click(screen.getByRole('button', { name: /^Borne 127,/ }))
    expect(ficha().getByText('B42')).toBeTruthy()
  })

  it('el borne 128 queda suelto, con contorno, el rótulo de la hoja 23 y la señal de K7 (hojas 9 y 21)', () => {
    montar()
    fireEvent.click(screen.getByRole('button', { name: /^Borne 128,/ }))
    expect(ficha().getAllByText('X5:128').length).toBeGreaterThan(0)
    expect(ficha().getByText(/las hojas 9 y 21 le llevan la señal A3C_128 del contacto K7/)).toBeTruthy()
    // No se enciende como sensor B50: solo contorno, y la franja dice por qué.
    expect(plano()).toEqual([])
    expect(document.querySelectorAll('[data-testid="leds-grupo"] [data-grupo]')).toHaveLength(1)
    expect(screen.getByTestId('franja-led').textContent).toContain('la señal A3C_128 del contacto K7 (relé), y la hoja 11 cablea B50 al 126')
    expect(screen.getByTestId('franja-led').textContent).not.toContain('prende con la señal')
  })
})

describe('placa-n2.svg · integridad y seguridad', () => {
  it('principio rector en la placa: solo se encienden LED de ítems en modo «señal»; ningún LED de estado se enciende', () => {
    const m = construirModelo(datos)
    const claves = [
      ...Object.keys(datos.elementos).map(k => `e:${k}`),
      ...datos.bornes.map(b => `b:${b.borne}`),
      ...datos.ledsEstado.map(l => `l:${l.id}`),
    ]
    for (const c of claves) {
      const it = describir(m, c, 'es')!
      const on = ledsPlaca(placa.geo, it)
      if (it.modoLed !== 'senal') expect(on, c).toEqual([])
      for (const l of on) expect(l.svgId, c).toMatch(/^led-X5-\d+$/)
      if (it.modoLed !== 'contorno') expect(ledsGrupoPlaca(placa.geo, it), c).toEqual([])
      if (it.modoLed !== 'neutro') expect(ledsNeutrosPlaca(placa.geo, it), c).toEqual([])
    }
    expect(ledsPlaca(placa.geo, describir(m, 'e:B1', 'es')!).map(l => l.svgId)).toEqual(['led-X5-42'])
    expect(ledsPlaca(placa.geo, describir(m, 'e:Y8', 'es')!).map(l => l.svgId)).toEqual(['led-X5-68'])
    for (const k of ['B13', 'B21', 'B22', 'B23', 'B24', 'B25', 'SM1', 'SM2', 'SM3', 'SM4', 'SM5', 'SM6']) {
      const it = describir(m, `e:${k}`, 'es')!
      expect(ledsPlaca(placa.geo, it), k).toEqual([])
      expect(ledsGrupoPlaca(placa.geo, it).length, k).toBeGreaterThan(0)
    }
  })

  it('cada led-estado-k asignado es un LED «60V DC» del plano, en su bloque X4 y en la misma posición relativa', () => {
    // Cajas de los conectores X4 de la placa (primer <rect> de cada grupo, con su transform).
    const x4 = new Map<string, { x0: number; x1: number; y0: number; y1: number }>()
    for (const g of svgPlaca.matchAll(/<g id="conector-X4-\d+"[^>]*transform="([^"]+)"[^>]*data-bornes="(\d+-\d+)"[^>]*>[\s\S]*?<rect x="([\d.]+)" y="([\d.]+)" width="([\d.]+)" height="([\d.]+)"/g)) {
      const [a, , , d, e, f] = leerTransform(g[1]!)
      const [x, y, w, h] = [g[3], g[4], g[5], g[6]].map(Number) as [number, number, number, number]
      x4.set(g[2]!, { x0: a * x + e, x1: a * (x + w) + e, y0: d * y + f, y1: d * (y + h) + f })
    }
    // Plano (hoja 23): a la izquierda el LED va entre el conector de 4 y el de 2 (sobre este);
    // a la derecha, justo bajo el de 2 y antes del de 4. Igual en la placa.
    const bloques: [string, string, string, 'izq' | 'der'][] = [
      ['V60_1', '15-18', '13-14', 'izq'], ['V60_2', '9-12', '7-8', 'izq'], ['V60_3', '3-6', '1-2', 'izq'],
      ['V60_4', '19-20', '21-24', 'der'], ['V60_5', '25-26', '27-30', 'der'], ['V60_6', '31-32', '33-36', 'der'],
    ]
    expect([...placa.geo.ledsEstado.keys()].sort()).toEqual(bloques.map(b => b[0]))
    for (const [id, arriba, abajo, lado] of bloques) {
      const l = placa.geo.ledsEstado.get(id)!
      const [a, b] = [x4.get(arriba)!, x4.get(abajo)!]
      expect(l.y > a.y1 && l.y < b.y0).toBe(true)
      // Pegado al de 2 bornes (≤ 1/4 del tramo entre conectores).
      const dos = lado === 'izq' ? b.y0 - l.y : l.y - a.y1
      expect(dos).toBeLessThan((b.y0 - a.y1) / 4)
      expect(l.x > Math.min(a.x0, b.x0) - 5 && l.x < Math.max(a.x1, b.x1) + 5).toBe(true)
      expect(lado === 'izq' ? l.x < 500 : l.x > 700).toBe(true)
      expect(datos.ledsEstado.some(e => e.id === id && e.original === '60V DC')).toBe(true)
    }
  })

  it('un LED con asociación ambigua no se toma como LED de su borne', () => {
    const svg = '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 10 10"><g id="led-X5-7" data-asociacion="ambigua"><circle cx="1" cy="1" r="1"/></g><g id="led-X5-8"><circle cx="3" cy="1" r="1"/></g><g id="led-estado-1"><circle cx="5" cy="5" r="1"/></g></svg>'
    const g = geometriaPlaca(svg)
    expect([...g.leds.keys()]).toEqual([8])
    expect(g.ledsEstado.size).toBe(0)
    expect(svgPlaca).not.toMatch(/data-asociacion="ambigua"/)
  })


  it('cada led-X5-n de la placa es un borne de a3c-datos.json, y cada borne X5 1–134 está dibujado', () => {
    const bornes = new Set(datos.bornes.map(b => b.borne))
    const leds = [...svgPlaca.matchAll(/id="led-X5-(\d+)"/g)].map(m => Number(m[1]))
    expect(leds.length).toBe(placa.geo.leds.size)
    // 136–145 (alimentación) no tienen numeración asignada en la placa: no hay borne-X5 de ellos.
    for (let n = 136; n <= 145; n++) expect(placa.geo.bornes.has(n)).toBe(false)
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
