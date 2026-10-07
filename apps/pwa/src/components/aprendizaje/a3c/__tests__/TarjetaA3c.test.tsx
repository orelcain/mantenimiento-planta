// @vitest-environment happy-dom
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { cleanup, fireEvent, render, screen, within } from '@testing-library/react'
import { interiorSvg, type A3CDatos, type PaqueteA3c } from '@/data/baader142A3c'
import { camaraDePreset, limitarCamara, matrizCamara } from '@/utils/aprendizaje/a3c'
import { TarjetaA3c } from '../TarjetaA3c'
import { ALTO_DIVISOR, FICHA_MIN, SOLAPE_DIVISOR, UBICACION_MIN, distribuirPc } from '../distribucionPc'

// La ficha monta la sección «Repuesto» y la cabecera el indicador: sin red ni Firestore en estos tests.
vi.mock('@/hooks/usePartesPlano', () => ({ usePartesPlano: () => null }))
vi.mock('@/hooks/usePlanoVinculos', () => ({ usePlanoVinculos: () => ({ vinculos: new Map(), confirmar: async () => {}, subirFoto: async () => '', resumen: { confirmados: 0, corregidos: 0, total: 0 }, error: null }) }))
vi.mock('@/hooks/repuestos/useRepuestosByCodigos', () => ({ useRepuestosByCodigos: () => ({ bySap: new Map(), loading: false }) }))

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

  it('B13 en el plano: ningún LED encendido y los 10 marcados como grupo; B1 sí enciende su LED', () => {
    montar(true)
    fireEvent.click(screen.getByRole('button', { name: /^Borne 32,/ }))
    expect(document.querySelectorAll('[data-testid="leds-encendidos"] [data-led]')).toHaveLength(0)
    expect(document.querySelectorAll('[data-testid="leds-grupo"] circle')).toHaveLength(10)
    expect(document.querySelectorAll('.a3c-punto.a3c-encendido')).toHaveLength(0)
    expect(document.querySelectorAll('.a3c-punto.a3c-grupo')).toHaveLength(10)
    fireEvent.click(screen.getByRole('button', { name: /^Borne 42,/ }))
    expect(document.querySelectorAll('[data-testid="leds-encendidos"] [data-led]')).toHaveLength(1)
    expect(document.querySelectorAll('[data-testid="leds-grupo"] circle')).toHaveLength(0)
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
    // En PC la regleta es una columna vertical: filas de 44 px con puntero táctil.
    expect(screen.getByRole('button', { name: /^Borne 45,/ }).className).toContain('h-[44px]')
  })

  it('PC con mouse conserva los controles compactos', () => {
    montar(true, false)
    expect(screen.getAllByRole('button', { name: 'Acercar' })[0]!.className).toContain('size-[32px]')
    expect(screen.getByRole('button', { name: /^Borne 45,/ }).className).toContain('h-[30px]')
  })

  it('la regleta X5 es vertical en PC y horizontal en el teléfono', () => {
    montar(true, false)
    expect(screen.getByRole('group', { name: /Regleta X5/ }).getAttribute('data-orientacion')).toBe('vertical')
    cleanup()
    montar(false)
    expect(screen.getByRole('group', { name: /Regleta X5/ }).getAttribute('data-orientacion')).toBe('horizontal')
  })

  it('reparto de PC: la tarjeta ocupa al menos la mitad del ancho y el plano de ubicación es grande', () => {
    for (const [ancho, alto] of [[1000, 640], [1180, 740], [1660, 930], [2300, 1300]] as const) {
      const d = distribuirPc(ancho, alto)
      expect(d.anchoTarjeta).toBeGreaterThanOrEqual(ancho * 0.5 - 1)
      expect(d.anchoTarjeta).toBeLessThanOrEqual(ancho * 0.62 + 1)
      expect(d.altoUbicacion).toBeGreaterThanOrEqual(Math.max(UBICACION_MIN, Math.min(alto * 0.58, d.maxUbicacion)) - 1)
      expect(alto - d.maxUbicacion - (ALTO_DIVISOR - SOLAPE_DIVISOR)).toBeGreaterThanOrEqual(FICHA_MIN)
    }
  })

  it('PC medido: grilla al alto de la ventana y divisor con teclado que se recuerda', () => {
    const d = Object.getOwnPropertyDescriptor(HTMLElement.prototype, 'clientWidth')
    Object.defineProperty(HTMLElement.prototype, 'clientWidth', {
      configurable: true,
      get(this: HTMLElement) {
        return this.dataset.testid === 'grilla-pc' ? 1400 : 0
      },
    })
    try {
      montar(true, false)
      const grilla = screen.getByTestId('grilla-pc')
      const alto = Math.max(560, window.innerHeight - 16)
      expect(grilla.style.height).toBe(`${alto}px`)
      expect(grilla.style.gridTemplateColumns).toBe(`${distribuirPc(1400, alto).anchoTarjeta}px minmax(0,1fr)`)
      const sep = screen.getByRole('separator', { name: /plano de ubicación y de la ficha/ })
      const antes = Number(sep.getAttribute('aria-valuenow'))
      fireEvent.keyDown(sep, { key: 'ArrowUp' })
      expect(Number(sep.getAttribute('aria-valuenow'))).toBe(antes - 24)
      expect(Number(localStorage.getItem('a3c-pc-ubicacion'))).toBeCloseTo((antes - 24) / alto, 2)
      fireEvent.keyDown(sep, { key: 'Home' })
      expect(Number(sep.getAttribute('aria-valuenow'))).toBe(UBICACION_MIN)
      fireEvent.keyDown(sep, { key: 'End' })
      expect(Number(sep.getAttribute('aria-valuenow'))).toBe(distribuirPc(1400, alto).maxUbicacion)
    } finally {
      if (d) Object.defineProperty(HTMLElement.prototype, 'clientWidth', d)
    }
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

describe('Tarjeta A3C · solo se enciende la señal del elemento', () => {
  const grupoPlano = () => [...document.querySelectorAll('[data-testid="leds-grupo"] [data-grupo]')].map(g => g.getAttribute('data-grupo'))
  const elegirDeLista = (codigo: string) => {
    fireEvent.change(screen.getByLabelText('Buscar elemento, borne o LED'), { target: { value: codigo } })
    fireEvent.click(screen.getAllByRole('button', { name: new RegExp(`^${codigo} `) })[0]!)
  }

  it('B21 (encoder A/B): los LED 1 y 2 con contorno, ninguno encendido, y el estado de la foto', () => {
    montar(true)
    fireEvent.click(screen.getByRole('button', { name: /^Borne 1,/ }))
    expect(ledsEncendidos()).toEqual([])
    expect(grupoPlano()).toEqual(['e:B21:1', 'e:B21:2'])
    expect(document.querySelectorAll('.a3c-punto.a3c-encendido')).toHaveLength(0)
    expect(document.querySelectorAll('.a3c-punto.a3c-grupo')).toHaveLength(2)
    expect(screen.getByTestId('franja-led').textContent).toContain('Canal A = LED 1, canal B = LED 2. En la foto de la N2: 1 y 2 apagados.')
  })

  it('B11: sin anillos de encendido; contorno y el texto del manual', () => {
    montar(true)
    fireEvent.click(screen.getByRole('button', { name: /^Borne 116,/ }))
    expect(ledsEncendidos()).toEqual([])
    // (Los anillos del plano de ubicación, hoja 22, marcan dónde está el sensor, no un LED.)
    expect(document.querySelectorAll('[data-testid="leds-encendidos"] .a3c-anillo')).toHaveLength(0)
    expect(grupoPlano()).toEqual(['e:B11:116'])
    expect(within(screen.getByTestId('ficha-a3c')).getByText(/Manual p\. 28 \(impresa 26\): con las puntas juntas se enciende el diodo del interruptor/)).toBeTruthy()
  })

  it('SM3 elegido por la lista: 60V DC y Step con contorno, ninguno encendido; SM6 también se puede elegir', () => {
    montar(true)
    elegirDeLista('SM3')
    expect(ledsEncendidos()).toEqual([])
    expect(grupoPlano()).toEqual(['e:SM3:V60_3', 'e:SM3:STEP3'])
    expect(screen.getByTestId('franja-led').textContent).toContain('En la foto de la N2, 60V DC estaba encendido (ámbar)')
    elegirDeLista('SM6')
    expect(within(screen.getByTestId('ficha-a3c')).getByText('SM6')).toBeTruthy()
    expect(grupoPlano()).toEqual(['e:SM6:V60_6', 'e:SM6:STEP6'])
  })

  it('Y8 enciende su LED 68 con anillos; el borne 139 (alimentación) queda como punto gris', () => {
    montar(true)
    fireEvent.click(screen.getByRole('button', { name: /^Borne 68,/ }))
    expect(ledsEncendidos()).toEqual(['e:Y8:68'])
    expect(document.querySelectorAll('[data-testid="leds-encendidos"] .a3c-anillo')).toHaveLength(2)
    fireEvent.click(screen.getByRole('button', { name: /^Borne 139,/ }))
    expect(ledsEncendidos()).toEqual([])
    expect([...document.querySelectorAll('[data-testid="leds-neutros"] [data-neutro]')].map(g => g.getAttribute('data-neutro'))).toEqual(['b:139:139'])
    expect(document.querySelectorAll('.a3c-punto.a3c-neutro')).toHaveLength(1)
    expect(document.querySelector('[data-testid="franja-led"] .a3c-foco')!.classList.contains('a3c-neutro')).toBe(true)
  })
})
