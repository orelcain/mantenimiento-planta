/**
 * «Ritmo en vivo», el gráfico unido: lo que se protege es que dibuja con datos reales sin romperse (cabecera, leyenda de
 * 4, atajos de zoom, rótulos, «ahora»), que el globo dice la MISMA cifra de «a esta hora» que la franja y que «Ampliar»
 * solo aparece con detalle que abrir. jsdom no mide ni dibuja: el ancho se simula y la geometría fina la prueba
 * `ejeTurno.test.ts` (alturas, escala Y, filas Ev) y el navegador.
 */
import { act, cleanup, fireEvent, render, screen } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { GraficoRitmoVivo, type EjeDatos } from '../GraficoRitmoVivo'
import type { MonitorV2Props } from '../MonitorV2'
import { armarTope } from '../reproduccionMinuto'
import type { RelojDeDatos } from '../useRelojDeDatos'

const INI = Date.UTC(2026, 9, 27, 21, 30)
const AHORA = 305
const serie = (esperado: number) => Array.from({ length: AHORA }, (_, k) => (k >= 100 && k < 160 ? 0 : esperado - 2))

const eje: EjeDatos = {
  iniMs: INI,
  finMs: INI + 450 * 60_000,
  minuto: {
    desde: new Date(INI).toISOString(),
    maquinas: [
      { id: 'a', nombre: 'Evisceradora 1', esperado: 19, cycles: serie(19) },
      { id: 'b', nombre: 'Evisceradora 2', esperado: 16, cycles: serie(16) },
      { id: 'c', nombre: 'Evisceradora 3', esperado: 16, cycles: serie(16) },
    ],
  },
  primeraPiezaMs: null,
  detenidaEstado: false,
  paradas: [{ desdeMin: 100, hastaMin: 160, dueno: 'sin-imputar', causa: 'Detencion', maquina: null }],
  /* La misma parada, por máquina (de ahí salen las paradas de arriba): cubre los 60 min en cero de las tres. */
  paradasMaquina: {
    stopEvents: [0, 1, 2].map((m) => ({ r: 0, f: new Date(INI + 100 * 60_000).toISOString(), s: 3600, m })),
    stopReasons: ['Detencion'],
    stopMachines: ['a', 'b', 'c'],
    enCurso: [],
  },
  llenado: [{ id: 'a', ultimo: 95 }, { id: 'b', ultimo: 100 }, { id: 'c', ultimo: 100 }],
  unidad: 'carros',
}

const p = {
  piezas: 9690,
  corteHora: '02:35',
  meta: 15000,
  proyeccion: 15623,
  cuota: { piezas: 10667, hora: '02:35' },
  cerrado: false,
  curva: {
    hoy: [{ minutes: 5, pieces: 100 }, { minutes: 300, pieces: 9690 }],
    previo: { label: 'lun 26', curve: [{ minutes: 5, pieces: 90 }, { minutes: AHORA, pieces: 9325 }, { minutes: 440, pieces: 14000 }] },
    objetivo: [{ minutes: 0, pieces: 0 }, { minutes: 450, pieces: 15000 }],
    maxMin: 450,
  },
} as unknown as MonitorV2Props

const reloj: RelojDeDatos = {
  cuadro: () => ({ valor: 9690, frac: 1, previa: null, ultima: { valor: 9690, atMs: INI + AHORA * 60_000 }, atrasada: false }),
  alCuadro: () => () => {},
  version: 1,
  detenida: false,
  reducido: false,
}

beforeEach(() => {
  window.matchMedia = ((q: string) => ({
    matches: q.includes('min-width: 1024px'),
    media: q,
    addEventListener: () => {},
    removeEventListener: () => {},
    addListener: () => {},
    removeListener: () => {},
    onchange: null,
    dispatchEvent: () => false,
  })) as unknown as typeof window.matchMedia
  Element.prototype.animate = (() => ({ cancel: () => {}, set onfinish(f: (() => void) | null) { if (f) setTimeout(f, 0) } })) as unknown as typeof Element.prototype.animate
  globalThis.ResizeObserver = class { observe() {} unobserve() {} disconnect() {} } as unknown as typeof ResizeObserver
  /* 1920: la tarjeta mide 1806 px por dentro. */
  Object.defineProperty(HTMLElement.prototype, 'clientWidth', { configurable: true, get: () => 1806 })
  Object.defineProperty(HTMLElement.prototype, 'clientHeight', { configurable: true, get: () => 600 })
  const raiz = document.createElement('div')
  raiz.id = 'root'
  document.body.appendChild(raiz)
})
afterEach(() => {
  cleanup()
  document.body.innerHTML = ''
})

describe('GraficoRitmoVivo', () => {
  it('dibuja título, subtítulo, leyenda de 4, atajos de zoom y el «ahora»', () => {
    render(<GraficoRitmoVivo p={p} e={eje} reloj={reloj} />)
    expect(screen.getByRole('heading', { name: 'Ritmo en vivo' })).toBeTruthy()
    expect(screen.getByText('21:30 → 05:00 · leído de Shoplogix 02:35')).toBeTruthy()
    for (const t of ['hoy', 'ritmo de la meta', 'proyección', 'lun 26 · 9.325 a esta hora']) expect(screen.getByText(t)).toBeTruthy()
    expect(screen.getByRole('button', { name: 'Turno' }).getAttribute('aria-pressed')).toBe('true')
    expect(screen.getByRole('button', { name: '1 h' }).getAttribute('aria-pressed')).toBe('false')
    expect(screen.getByRole('button', { name: '15 min' })).toBeTruthy()
    expect(screen.getByText('02:35 ahora')).toBeTruthy()
    expect(screen.getByText('meta 15.000')).toBeTruthy()
    /* Meta 15.000 y proyección 15.623 → 0…16.000, rejilla cada 4.000 (no 20.000). */
    expect(screen.getByText('16.000')).toBeTruthy()
    expect(screen.queryByText('20.000')).toBeNull()
    expect(screen.getByText('Paradas')).toBeTruthy()
    /* En la columna de 128 px «1 parada · 1 h 0 min» no cabe: queda el número y el tiempo, bajo el rótulo «Paradas». */
    expect(screen.getByText('1 · 1 h 0 min')).toBeTruthy()
  })

  it('«1 h» y «15 min» marcan su atajo y «Turno» vuelve a todo el turno', () => {
    render(<GraficoRitmoVivo p={p} e={eje} reloj={reloj} />)
    fireEvent.click(screen.getByRole('button', { name: '1 h' }))
    expect(screen.getByRole('button', { name: '1 h' }).getAttribute('aria-pressed')).toBe('true')
    fireEvent.click(screen.getByRole('button', { name: '15 min' }))
    expect(screen.getByRole('button', { name: '15 min' }).getAttribute('aria-pressed')).toBe('true')
    expect(screen.getByRole('button', { name: '1 h' }).getAttribute('aria-pressed')).toBe('false')
    fireEvent.click(screen.getByRole('button', { name: 'Turno' }))
    expect(screen.getByRole('button', { name: 'Turno' }).getAttribute('aria-pressed')).toBe('true')
  })

  it('el globo del minuto en curso dice la misma «a esta hora» que el rótulo del gráfico', () => {
    const { container } = render(<GraficoRitmoVivo p={p} e={eje} reloj={reloj} />)
    /* Sin globo, la cifra ya está en el rótulo junto a la punta: 9.690 − 10.667. */
    expect(screen.getAllByText('a esta hora −977').length).toBe(1)
    const lienzo = container.querySelector('.v2-minuto-scroll') as HTMLElement
    /* x del minuto 305 dentro del gráfico (1.626 px para 450 min). */
    act(() => { fireEvent.pointerMove(lienzo, { pointerType: 'mouse', clientX: Math.round((305.5 / 450) * 1626), buttons: 0 }) })
    expect(screen.getByRole('tooltip').textContent).toContain('(−977)')
    expect(screen.getByRole('tooltip').textContent).toContain('9.690 pz')
    expect(screen.getByRole('tooltip').textContent).toContain('10.667')
  })

  it('un minuto con la línea en cero lista cada Baader sin acusarla y nombra la parada y su dueño', () => {
    const { container } = render(<GraficoRitmoVivo p={p} e={eje} reloj={reloj} />)
    const lienzo = container.querySelector('.v2-minuto-scroll') as HTMLElement
    act(() => { fireEvent.pointerMove(lienzo, { pointerType: 'mouse', clientX: Math.round((130.5 / 450) * 1626), buttons: 0 }) })
    const globo = screen.getByRole('tooltip').textContent ?? ''
    expect(globo).toContain('Ritmo de la línea')
    expect(globo).toContain('0 de 51 pz/min')
    expect((globo.match(/detenida/g) ?? []).length).toBe(3)
    expect(globo).toContain('Sin imputar')
    expect(globo).toContain('falta dueño')
  })

  it('un minuto con la línea en cero SIN parada registrada no acusa: cada Baader queda «sin dato», no «detenida»', () => {
    const { container } = render(<GraficoRitmoVivo p={p} e={{ ...eje, paradasMaquina: null }} reloj={reloj} />)
    const lienzo = container.querySelector('.v2-minuto-scroll') as HTMLElement
    act(() => { fireEvent.pointerMove(lienzo, { pointerType: 'mouse', clientX: Math.round((130.5 / 450) * 1626), buttons: 0 }) })
    const globo = screen.getByRole('tooltip').textContent ?? ''
    expect((globo.match(/sin dato/g) ?? []).length).toBe(3)
    expect(globo).not.toContain('detenida')
  })

  it('el globo no es una región viva (no anuncia cada movimiento) y sigue siendo el mismo nodo mientras el cursor está en el mismo minuto', () => {
    const { container } = render(<GraficoRitmoVivo p={p} e={eje} reloj={reloj} />)
    const lienzo = container.querySelector('.v2-minuto-scroll') as HTMLElement
    act(() => { fireEvent.pointerMove(lienzo, { pointerType: 'mouse', clientX: Math.round((130.2 / 450) * 1626), buttons: 0 }) })
    const globo = screen.getByRole('tooltip')
    expect(screen.queryByRole('status')).toBeNull()
    act(() => { fireEvent.pointerMove(lienzo, { pointerType: 'mouse', clientX: Math.round((130.8 / 450) * 1626), buttons: 0 }) })
    expect(screen.getByRole('tooltip')).toBe(globo)
  })

  it('el resumen del gráfico dice las piezas de la vista (con reproducción, la suma de los minutos cerrados)', () => {
    const entrada = {
      desdeMs: INI,
      maquinas: [
        { id: 'a', nombre: 'Evisceradora 1', esperado: 19, cycles: [3309] },
        { id: 'b', nombre: 'Evisceradora 2', esperado: 16, cycles: [3071] },
        { id: 'c', nombre: 'Evisceradora 3', esperado: 16, cycles: [3291] },
      ],
      paradas: {},
      pulsoAtMs: null,
    }
    const conRepro = { ...p, repro: { entrada, tope: armarTope(9690, null) } } as unknown as MonitorV2Props
    const { container } = render(<GraficoRitmoVivo p={conRepro} e={eje} reloj={reloj} />)
    expect(container.querySelector('[role="img"]')?.getAttribute('aria-label')).toContain('Piezas acumuladas del turno: 9.671 de 15.000')
  })

  it('el globo también sale con un toque; tocar el mismo minuto o fuera lo cierra', () => {
    const { container } = render(<GraficoRitmoVivo p={p} e={eje} reloj={reloj} />)
    const lienzo = container.querySelector('.v2-minuto-scroll') as HTMLElement
    const x = Math.round((250.5 / 450) * 1626)
    act(() => { fireEvent.pointerDown(lienzo, { pointerType: 'touch', clientX: x }) })
    act(() => { fireEvent.click(lienzo, { clientX: x }) })
    expect(screen.getByRole('tooltip').textContent).toContain('Acumulado')
    act(() => { fireEvent.click(lienzo, { clientX: x }) })
    expect(screen.queryByRole('tooltip')).toBeNull()
    act(() => { fireEvent.click(lienzo, { clientX: x }) })
    expect(screen.getByRole('tooltip')).toBeTruthy()
    act(() => { fireEvent.pointerDown(document.body, { pointerType: 'touch' }) })
    expect(screen.queryByRole('tooltip')).toBeNull()
  })

  it('«Ampliar» solo existe si hay detalle y lo abre', () => {
    const { rerender } = render(<GraficoRitmoVivo p={p} e={eje} reloj={reloj} />)
    expect(screen.queryByRole('button', { name: 'Ampliar Ritmo en vivo' })).toBeNull()
    rerender(<GraficoRitmoVivo p={p} e={eje} reloj={reloj} ampliado={<p>detalle del ritmo</p>} />)
    fireEvent.click(screen.getByRole('button', { name: 'Ampliar Ritmo en vivo' }))
    expect(screen.getByText('detalle del ritmo')).toBeTruthy()
  })

  it('la leyenda ⓘ abre el globo de estados y dueños y Esc lo cierra', () => {
    render(<GraficoRitmoVivo p={p} e={eje} reloj={reloj} />)
    expect(screen.queryByText('Paradas, por dueño')).toBeNull()
    fireEvent.click(screen.getByRole('button', { name: 'Qué significan los colores' }))
    expect(screen.getByText('Paradas, por dueño')).toBeTruthy()
    expect(screen.getByText('75 % o más del esperado')).toBeTruthy()
    fireEvent.keyDown(document, { key: 'Escape' })
    expect(screen.queryByText('Paradas, por dueño')).toBeNull()
  })

  it('en el celular (375) la leyenda baja, el segmentado va en su fila y los rótulos de la derecha van dentro', () => {
    Object.defineProperty(HTMLElement.prototype, 'clientWidth', { configurable: true, get: () => 309 })
    render(<GraficoRitmoVivo p={p} e={eje} reloj={reloj} ampliado={<p>x</p>} />)
    expect(screen.getByText('al cierre 15.623')).toBeTruthy()
    expect(screen.getByText('4 mil')).toBeTruthy()
    expect(screen.getByRole('button', { name: '15 min' })).toBeTruthy()
  })

  it('con el turno cerrado no hay proyección ni «a esta hora»', () => {
    const cerrado = { ...p, cerrado: true, proyeccion: null } as unknown as MonitorV2Props
    render(<GraficoRitmoVivo p={cerrado} e={eje} reloj={reloj} />)
    expect(screen.queryByText('proyección')).toBeNull()
    expect(screen.queryByText(/^a esta hora/)).toBeNull()
  })
})
