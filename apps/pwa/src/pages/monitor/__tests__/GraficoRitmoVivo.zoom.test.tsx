/**
 * «Ritmo en vivo» con el zoom «15 min»: el minuto por dentro. Lo que se protege es que, desde 12 px por minuto, el gráfico dibuja cada parada
 * al segundo (escalón del ritmo, bloque de la detención, muesca de la micro, rótulos), que el globo del minuto es el nuevo (cada parada con su
 * hora y su duración exactas, y la fila de la micro abre su globo) y que sin paradas por máquina o con menos zoom todo queda como siempre.
 * jsdom no mide ni dibuja: el ancho se simula y la geometría fina la ve el navegador.
 */
import { act, cleanup, fireEvent, render, screen } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { GraficoRitmoVivo, type EjeDatos } from '../GraficoRitmoVivo'
import type { MonitorV2Props } from '../MonitorV2'
import type { RelojDeDatos } from '../useRelojDeDatos'

const INI = Date.UTC(2026, 9, 27, 21, 30)
const AHORA = 305
const serie = (esperado: number) => Array.from({ length: AHORA }, (_, k) => (k >= 100 && k < 160 ? 0 : esperado - 2))
const iso = (min: number, seg = 0) => new Date(INI + min * 60_000 + seg * 1000).toISOString()

/* Minuto 3 del turno (21:33): Ev 2 con una detención de 2 min 15 s y Ev 1 con una micro de 45 s anotada a las 21:33:00,4. */
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
  paradas: [
    { desdeMin: 3, hastaMin: 5.25, dueno: 'sin-imputar', causa: 'Detencion', maquina: 'Evisceradora 2', maquinaId: 'b' },
    { desdeMin: 3.0067, hastaMin: 3.7567, dueno: 'sin-imputar', causa: 'Micro Detencion', maquina: 'Evisceradora 1', maquinaId: 'a' },
  ],
  paradasMaquina: {
    stopEvents: [{ r: 0, f: iso(3), s: 135, m: 1 }, { r: 1, f: `${iso(3).slice(0, 19)}.400Z`, s: 45, m: 0 }],
    stopReasons: ['Detencion', 'Micro Detencion'],
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
    matches: q.includes('min-width: 1024px'), media: q, addEventListener: () => {}, removeEventListener: () => {}, addListener: () => {}, removeListener: () => {}, onchange: null, dispatchEvent: () => false,
  })) as unknown as typeof window.matchMedia
  Element.prototype.animate = (() => ({ cancel: () => {}, set onfinish(f: (() => void) | null) { if (f) setTimeout(f, 0) } })) as unknown as typeof Element.prototype.animate
  globalThis.ResizeObserver = class { observe() {} unobserve() {} disconnect() {} } as unknown as typeof ResizeObserver
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

const ancho = (c: HTMLElement) => Number((c.querySelector('.v2-minuto-scroll svg') as SVGElement).getAttribute('width'))
/** x del medio del minuto `m` con el zoom puesto (450 min en el lienzo, 6 px de aire a la derecha). */
const xZoom = (c: HTMLElement, m: number) => Math.round((m / 450) * (ancho(c) - 6))
const textos = (c: HTMLElement) => Array.from(c.querySelectorAll('svg text')).map((t) => t.textContent)

describe('GraficoRitmoVivo · el minuto por dentro (zoom «15 min»)', () => {
  it('con todo el turno a la vista (menos de 12 px por minuto) no cambia nada: ni escalón ni bloques de parada, y la micro no cuenta como detención', () => {
    const { container } = render(<GraficoRitmoVivo p={p} e={eje} reloj={reloj} />)
    expect(container.querySelector('path[stroke="var(--rv-escalon)"]')).toBeNull()
    expect(container.querySelector('path[fill="var(--rv-detenida)"]')).toBeNull()
    expect(screen.getByText('1 detención')).toBeTruthy()
    expect(screen.queryByText(/^ritmo andando de cada Baader/)).toBeNull()
    expect(screen.getByText('piezas por minuto de cada Baader')).toBeTruthy()
  })

  it('en «15 min» dibuja el escalón del ritmo, el bloque de la detención, la muesca de la micro y su leyenda; «Detenciones» sigue sin contar la micro', () => {
    const { container } = render(<GraficoRitmoVivo p={p} e={eje} reloj={reloj} />)
    fireEvent.click(screen.getByRole('button', { name: '15 min' }))
    expect(container.querySelector('path[stroke="var(--rv-escalon)"]')).not.toBeNull()
    expect(container.querySelector('path[fill="var(--rv-detenida)"]')).not.toBeNull()
    expect(container.querySelector('path[fill="var(--rv-velo)"]')).not.toBeNull()
    expect(container.querySelector('path[fill="var(--rv-micro)"]')).not.toBeNull()
    /* El escalón es una división, no una medida: la leyenda lo dice calculado (y el trazo lleva el mismo rótulo). */
    expect(screen.getByText('ritmo andando de cada Baader (calculado: piezas del minuto ÷ segundos andando)')).toBeTruthy()
    expect(container.querySelector('path[stroke="var(--rv-escalon)"] title')?.textContent).toBe('Ritmo andando, calculado: piezas del minuto ÷ segundos andando')
    for (const t of ['micro', 'detención', 'programada']) expect(screen.getAllByText(t).length).toBeGreaterThan(0)
    expect(screen.getByText('1 detención')).toBeTruthy()
    /* El rótulo de la detención (cabe en 135 s a ~93 px por minuto) y el de la micro (45 s: ~70 px). */
    expect(textos(container)).toEqual(expect.arrayContaining(['Detención 2 min 15 s · falta dueño', 'micro 45 s']))
  })

  it('en «15 min» el globo del minuto es «el minuto por dentro»: cada parada con su hora y duración exactas, y la banda y las guías del minuto', () => {
    const { container } = render(<GraficoRitmoVivo p={p} e={eje} reloj={reloj} />)
    fireEvent.click(screen.getByRole('button', { name: '15 min' }))
    const lienzo = container.querySelector('.v2-minuto-scroll') as HTMLElement
    act(() => { fireEvent.pointerMove(lienzo, { pointerType: 'mouse', clientX: xZoom(container, 3.5), buttons: 0 }) })
    const globo = screen.getByRole('tooltip', { name: 'El minuto por dentro' })
    const t = (globo.textContent ?? '').replace(/\u00a0/g, ' ')
    expect(t).toContain('21:33')
    expect(t).toContain('Ev 2 21:33:00 → 21:35:15 · 2 min 15 s · Sin imputar · falta dueño')
    expect(t).toContain('Ev 1 21:33:00 → 21:33:45 · 45 s')
    expect(t).toContain('Hechas')
    /* La banda del minuto y las tres guías con su rótulo, en el overlay (el lienzo no se redibuja al mover el cursor). */
    expect(container.querySelector('rect[fill="var(--rv-foco)"]')).not.toBeNull()
    expect(textos(container)).toEqual(expect.arrayContaining([':15', ':30', ':45']))
  })

  it('con el mouse encima de la fila de la micro del globo sale su globo (causa probable); al salir se cierra', () => {
    const { container } = render(<GraficoRitmoVivo p={p} e={eje} reloj={reloj} />)
    fireEvent.click(screen.getByRole('button', { name: '15 min' }))
    const lienzo = container.querySelector('.v2-minuto-scroll') as HTMLElement
    act(() => { fireEvent.pointerMove(lienzo, { pointerType: 'mouse', clientX: xZoom(container, 3.5), buttons: 0 }) })
    const fila = container.querySelector('button.rv-gm-ev') as HTMLElement
    expect(fila).not.toBeNull()
    expect(screen.queryByRole('tooltip', { name: 'Micro detención y su causa probable' })).toBeNull()
    act(() => { fireEvent.pointerEnter(fila, { pointerType: 'mouse' }) })
    expect(screen.getByRole('tooltip', { name: 'Micro detención y su causa probable' })).toBeTruthy()
    act(() => { fireEvent.pointerLeave(fila, { pointerType: 'mouse' }) })
    expect(screen.queryByRole('tooltip', { name: 'Micro detención y su causa probable' })).toBeNull()
  })

  it('PC: el globo sigue al mouse y no recibe el puntero; un clic en el gráfico lo deja FIJO (ya no cambia de minuto y recibe el mouse) y otro lo suelta', () => {
    const { container } = render(<GraficoRitmoVivo p={p} e={eje} reloj={reloj} />)
    fireEvent.click(screen.getByRole('button', { name: '15 min' }))
    const lienzo = container.querySelector('.v2-minuto-scroll') as HTMLElement
    const hora = () => (screen.getByRole('tooltip', { name: 'El minuto por dentro' }).querySelector('.rv-gm-cab b') as HTMLElement).textContent
    act(() => { fireEvent.pointerMove(lienzo, { pointerType: 'mouse', clientX: xZoom(container, 3.5), buttons: 0 }) })
    expect(hora()).toBe('21:33')
    expect(screen.getByRole('tooltip', { name: 'El minuto por dentro' }).getAttribute('data-fijo')).toBeNull()
    /* Sin fijar, mover el mouse cambia de minuto (por eso las filas de micro no se alcanzaban). */
    act(() => { fireEvent.pointerMove(lienzo, { pointerType: 'mouse', clientX: xZoom(container, 4.5), buttons: 0 }) })
    expect(hora()).toBe('21:34')
    act(() => { fireEvent.pointerMove(lienzo, { pointerType: 'mouse', clientX: xZoom(container, 3.5), buttons: 0 }) })
    act(() => { fireEvent.click(lienzo, { clientX: xZoom(container, 3.5) }) })
    expect(screen.getByRole('tooltip', { name: 'El minuto por dentro' }).getAttribute('data-fijo')).toBe('true')
    act(() => { fireEvent.pointerMove(lienzo, { pointerType: 'mouse', clientX: xZoom(container, 4.5), buttons: 0 }) })
    expect(hora()).toBe('21:33')
    /* Salir del gráfico hacia el globo fijo no lo cierra; hacia otra parte, sí. */
    const globo = screen.getByRole('tooltip', { name: 'El minuto por dentro' })
    act(() => { fireEvent.pointerLeave(lienzo, { pointerType: 'mouse', relatedTarget: globo }) })
    expect(screen.queryByRole('tooltip', { name: 'El minuto por dentro' })).not.toBeNull()
    act(() => { fireEvent.pointerLeave(globo, { pointerType: 'mouse', relatedTarget: document.body }) })
    expect(screen.queryByRole('tooltip', { name: 'El minuto por dentro' })).toBeNull()
    /* Otro clic lo suelta. */
    act(() => { fireEvent.pointerMove(lienzo, { pointerType: 'mouse', clientX: xZoom(container, 3.5), buttons: 0 }) })
    act(() => { fireEvent.click(lienzo, { clientX: xZoom(container, 3.5) }) })
    act(() => { fireEvent.click(lienzo, { clientX: xZoom(container, 3.5) }) })
    act(() => { fireEvent.pointerMove(lienzo, { pointerType: 'mouse', clientX: xZoom(container, 4.5), buttons: 0 }) })
    expect(hora()).toBe('21:34')
  })

  it('sin paradas por máquina (doc anterior) el zoom queda como siempre: el globo de siempre y la curva fina', () => {
    const { container } = render(<GraficoRitmoVivo p={p} e={{ ...eje, paradasMaquina: null }} reloj={reloj} />)
    fireEvent.click(screen.getByRole('button', { name: '15 min' }))
    expect(container.querySelector('path[stroke="var(--rv-escalon)"]')).toBeNull()
    expect(screen.queryByText(/^ritmo andando de cada Baader/)).toBeNull()
    const lienzo = container.querySelector('.v2-minuto-scroll') as HTMLElement
    act(() => { fireEvent.pointerMove(lienzo, { pointerType: 'mouse', clientX: xZoom(container, 250.5), buttons: 0 }) })
    expect(screen.getByRole('tooltip').textContent).toContain('Meta a esa hora')
    expect(screen.queryByRole('tooltip', { name: 'El minuto por dentro' })).toBeNull()
  })
})
