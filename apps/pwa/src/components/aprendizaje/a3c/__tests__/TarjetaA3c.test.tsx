// @vitest-environment happy-dom
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { cleanup, fireEvent, render, screen, within } from '@testing-library/react'
import { interiorSvg, type A3CDatos, type PaqueteA3c } from '@/data/baader142A3c'
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
