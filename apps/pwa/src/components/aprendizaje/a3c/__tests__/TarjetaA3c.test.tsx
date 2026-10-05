// @vitest-environment happy-dom
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { cleanup, fireEvent, render, screen, within } from '@testing-library/react'
import { interiorSvg, type A3CDatos, type PaqueteA3c } from '@/data/baader142A3c'
import { camaraDePreset, limitarCamara, matrizCamara } from '@/utils/aprendizaje/a3c'
import { TarjetaA3c } from '../TarjetaA3c'

// Paquete real (el mismo que sirve la app desde public/), sin red.
const assets = resolve(__dirname, '../../../../../public/learning-assets/baader-142/a3c')
const paquete: PaqueteA3c = {
  datos: JSON.parse(readFileSync(resolve(assets, 'a3c-datos.json'), 'utf8')) as A3CDatos,
  dibujo: {
    '22': interiorSvg(readFileSync(resolve(assets, 'hoja22.svg'), 'utf8')),
    '23': interiorSvg(readFileSync(resolve(assets, 'hoja23.svg'), 'utf8')),
  },
}

const montar = (dosColumnas: boolean, tactil?: boolean, p: PaqueteA3c = paquete) =>
  render(<TarjetaA3c paquete={p} onVolver={() => {}} etiquetaVolver="Baader 142" dosColumnas={dosColumnas} tactil={tactil} />)

const ledsEncendidos = () => [...document.querySelectorAll('[data-testid="leds-encendidos"] [data-led]')].map(g => g.getAttribute('data-led'))

beforeEach(() => localStorage.clear())
afterEach(cleanup)

describe('Tarjeta A3C', () => {
  it('arranca con B4: el LED 45 encendido en la tarjeta, la franja y la regleta', () => {
    montar(true)
    expect(within(screen.getByTestId('franja-led')).getByText('LED 45')).toBeTruthy()
    expect(ledsEncendidos()).toEqual(['e:B4:45'])
    expect(screen.getByRole('button', { name: /^Borne 45,/ }).getAttribute('aria-pressed')).toBe('true')
    expect(within(screen.getByTestId('ficha-a3c')).getByText('B4')).toBeTruthy()
  })

  it('B11 muestra qué hace, el tipo inductivo y la fuente', () => {
    montar(true)
    fireEvent.click(screen.getByRole('button', { name: /^Borne 116,/ }))
    const ficha = within(screen.getByTestId('ficha-a3c'))
    expect(ficha.getByText('B11')).toBeTruthy()
    expect(ficha.getAllByText(/palpador/).length).toBeGreaterThan(0)
    expect(ficha.getByText('Interruptor de aproximación inductivo (manual 2005, p. 66)')).toBeTruthy()
    expect(ficha.getByText(/Fuente: Manual 2005, p\. 66/)).toBeTruthy()
  })

  it('un elemento sin respaldo (B30, Y3) dice que no hay descripción y pide confirmar en terreno', () => {
    montar(true)
    for (const codigo of ['B30', 'Y3']) {
      fireEvent.change(screen.getByLabelText('Buscar elemento, borne o LED'), { target: { value: codigo } })
      fireEvent.click(screen.getAllByRole('button', { name: new RegExp(codigo) })[0]!)
      const ficha = within(screen.getByTestId('ficha-a3c'))
      expect(ficha.getByText('Sin descripción en el plano ni el manual.')).toBeTruthy()
      expect(ficha.getByText(/Pendiente de confirmar en terreno/)).toBeTruthy()
      expect(ficha.queryByText('Deducido del plano')).toBeNull()
    }
  })

  it('elegir el borne 68 enciende el LED de Y8 y muestra su ficha como salida', () => {
    montar(true)
    fireEvent.click(screen.getByRole('button', { name: /^Borne 68,/ }))
    expect(ledsEncendidos()).toEqual(['e:Y8:68'])
    const ficha = within(screen.getByTestId('ficha-a3c'))
    expect(ficha.getByText('Y8')).toBeTruthy()
    expect(ficha.getByText('Salida')).toBeTruthy()
    expect(ficha.getByText('Salida: la A3C activa el elemento')).toBeTruthy()
    expect(within(screen.getByTestId('franja-led')).getByText(/activa la salida/)).toBeTruthy()
    expect(screen.getByRole('button', { name: /^Borne 68,/ }).getAttribute('aria-pressed')).toBe('true')
    expect(screen.getByRole('button', { name: /^Borne 45,/ }).getAttribute('aria-pressed')).toBe('false')
  })

  it('un borne sin etiqueta dice «sin etiqueta» y no enciende nada', () => {
    montar(true)
    fireEvent.click(screen.getByRole('button', { name: 'Borne 11, sin etiqueta, sin LED' }))
    expect(ledsEncendidos()).toEqual([])
    expect(within(screen.getByTestId('ficha-a3c')).getAllByText('Sin etiqueta en el plano').length).toBeGreaterThan(0)
    expect(within(screen.getByTestId('franja-led')).getByText('Sin LED')).toBeTruthy()
  })

  it('ES | Original cambia los textos del dibujo y de la ficha, y se recuerda', () => {
    montar(true)
    const lienzo = document.querySelector('svg[data-hoja="23"]')!
    expect(lienzo.textContent).toContain('B21 encoder SM1 B')
    // En español el texto del plano solo aparece en «En el plano», no como nombre.
    expect(within(screen.getByTestId('ficha-a3c')).getAllByText(paquete.datos.elementos.B4!.original)).toHaveLength(1)

    fireEvent.click(screen.getByRole('tab', { name: 'Original' }))
    expect(lienzo.textContent).toContain('B21 Drehwertgeber SM1 B')
    expect(lienzo.textContent).not.toContain('B21 encoder SM1 B')
    const ficha = within(screen.getByTestId('ficha-a3c'))
    expect(ficha.getAllByText(paquete.datos.elementos.B4!.original)).toHaveLength(2)
    expect(ficha.getByText(paquete.datos.elementos.B4!.es)).toBeTruthy()
    expect(localStorage.getItem('a3c-idioma')).toBe('or')
    cleanup()

    montar(true)
    expect(screen.getByRole('tab', { name: 'Original' }).getAttribute('aria-selected')).toBe('true')
  })

  it('con mouse, un clic sobre S20..S25 (misma zona del plano) pregunta cuál en vez de elegir S20', () => {
    montar(true, false)
    const cam = limitarCamara(camaraDePreset(paquete.datos.presets_v5.hoja22.todo!, 343, 340), { minW: 70, maxW: 2200, bounds: [40, 45, 1080, 675] })
    const mz = matrizCamara(cam, 343, 340)
    const h = paquete.datos.elementos.S20!.hoja22_hotspots[0]!
    const svg = document.querySelector('svg[data-hoja="22"]')!
    const e = { pointerId: 1, pointerType: 'mouse', button: 0, clientX: (h.x + h.w / 2) * mz.s + mz.tx, clientY: (h.y + h.h / 2) * mz.s + mz.ty }
    fireEvent.pointerDown(svg, e)
    fireEvent.pointerUp(svg, e)
    const hoja = screen.getByRole('dialog')
    expect(within(hoja).getByText('¿Cuál?')).toBeTruthy()
    for (const k of ['S20', 'S21', 'S22', 'S23', 'S24', 'S25']) expect(within(hoja).getByText(k)).toBeTruthy()
  })

  it('los selectores Idioma, Modo y Plano | Placa miden 44 px en PC', () => {
    montar(true)
    for (const n of ['Idioma de los textos del plano', 'Modo', 'Vista de la tarjeta']) {
      const t = screen.getByRole('tablist', { name: n })
      expect(t.className).toContain('h-[44px]')
      expect(t.className).toContain('[&>button]:h-[44px]')
    }
  })

  it('el buscador encuentra por número de borne y elegir el resultado cambia la selección', () => {
    montar(true)
    fireEvent.change(screen.getByLabelText('Buscar elemento, borne o LED'), { target: { value: '124' } })
    fireEvent.click(screen.getByRole('button', { name: /^B18 / }))
    expect(ledsEncendidos()).toEqual(['e:B18:124'])
  })

  it('en el teléfono alterna Máquina | Tarjeta y «Ver» lleva a la tarjeta', () => {
    montar(false)
    expect(document.querySelector('svg[data-hoja="22"]')).toBeTruthy()
    expect(document.querySelector('svg[data-hoja="23"]')).toBeNull()
    fireEvent.click(screen.getByRole('button', { name: 'Ver LED 45 en la tarjeta' }))
    expect(document.querySelector('svg[data-hoja="23"]')).toBeTruthy()
    expect(screen.getByRole('tab', { name: 'Tarjeta' }).getAttribute('aria-selected')).toBe('true')
    // celdas de la regleta de 44 px en el teléfono
    expect(screen.getByRole('button', { name: /^Borne 45,/ }).className).toContain('w-[44px]')
  })

  it('Practicar: responder bien sube la racha y queda guardada', () => {
    montar(false)
    fireEvent.click(screen.getByRole('tab', { name: 'Practicar' }))
    expect(screen.getByText('Pregunta 1 de 6')).toBeTruthy()
    const p = paquete.datos.quiz.filter(q => q.contexto === 'telefono')[0]!
    const correcta = p.ops[p.ok]!
    fireEvent.click(screen.getByRole('button', { name: new RegExp(`^${correcta[0]}`) }))
    expect(screen.getByText('Correcto.')).toBeTruthy()
    expect(screen.getByTestId('racha').textContent).toBe('Racha 1 · mejor 1')
    expect(JSON.parse(localStorage.getItem('a3c-racha')!)).toEqual({ racha: 1, mejor: 1 })
  })

  it('tablet de 2 columnas con puntero táctil: atajos, zoom y regleta de 44 px', () => {
    montar(true, true)
    expect(screen.getAllByRole('button', { name: 'Acercar' })[0]!.className).toContain('size-[44px]')
    expect(within(screen.getAllByRole('group', { name: 'Atajos de zoom' })[0]!).getAllByRole('button')[0]!.className).toContain('h-[44px]')
    expect(screen.getByRole('button', { name: /^Borne 45,/ }).className).toContain('w-[44px]')
  })

  it('PC con mouse conserva los controles compactos', () => {
    montar(true, false)
    expect(screen.getAllByRole('button', { name: 'Acercar' })[0]!.className).toContain('size-[32px]')
    expect(screen.getByRole('button', { name: /^Borne 45,/ }).className).toContain('w-[30px]')
  })

  it('alternar ES/Original no mueve la regleta', () => {
    montar(true, false)
    const regleta = screen.getByRole('group', { name: /Regleta X5/ })
    const mover = vi.fn()
    regleta.scrollTo = mover as unknown as typeof regleta.scrollTo
    fireEvent.click(screen.getByRole('tab', { name: 'Original' }))
    expect(mover).not.toHaveBeenCalled()
  })

  it('Practicar sin preguntas muestra un estado vacío con salida', () => {
    montar(false, undefined, { ...paquete, datos: { ...paquete.datos, quiz: [] } })
    fireEvent.click(screen.getByRole('tab', { name: 'Practicar' }))
    expect(screen.getByText(/No hay preguntas de práctica/)).toBeTruthy()
    fireEvent.click(screen.getByRole('button', { name: 'Volver a explorar' }))
    expect(screen.getByRole('tab', { name: 'Explorar' }).getAttribute('aria-selected')).toBe('true')
  })
})
