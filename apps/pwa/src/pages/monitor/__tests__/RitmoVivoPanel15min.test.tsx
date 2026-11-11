/**
 * El panel «Carros con pieza, por máquina · últimos 15 minutos» (`RitmoVivoAmpliado`). Lo que se protege: que la cifra de cada
 * Baader sea el PROMEDIO de la ventana y no el último minuto, que la raya diga su entero («16 o más» con perilla calibrada, «12 o más»
 * sin ella) y que la vara bajo el nombre sea la perilla o la meta de Shoplogix. jsdom no mide: el ancho se simula.
 */
import { cleanup, render, screen } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { calcularRitmoVivo, llenadoDelPanel, type EntradaRitmoVivo } from '../ritmoVivo'
import { RitmoVivoAmpliado } from '../RitmoVivoV2'
import { GraficoRitmoVivo, type EjeDatos } from '../GraficoRitmoVivo'
import type { MonitorV2Props } from '../MonitorV2'
import type { RelojDeDatos } from '../useRelojDeDatos'

const T0 = Date.parse('2026-10-27T11:00:00.000Z')
const iso = (min: number) => new Date(T0 + min * 60_000).toISOString()

/* 14 minutos cerrados por Baader. Ev 1 con perilla 17 desde el inicio: 13 minutos a 14 pz y el último a 17. Σ 199 de 238 = 84 %.
   Ev 2 sin perilla, meta Shoplogix 16: 13 minutos a 12 pz y el último a 16. Σ 172 de 224 = 77 %. El último minuto daría 100 % en las dos. */
const entrada: EntradaRitmoVivo = {
  serie: {
    desde: iso(0),
    maquinas: [
      { id: 'ev1', nombre: 'Evisceradora 1', esperado: 19, cycles: [...Array.from({ length: 13 }, () => 14), 17] },
      { id: 'ev2', nombre: 'Evisceradora 2', esperado: 16, cycles: [...Array.from({ length: 13 }, () => 12), 16] },
    ],
  },
  acumulado: null,
  enCurso: [],
  perillas: { actual: { ev1: { cpm: 17, desde: iso(0) } }, historial: [] },
}

beforeEach(() => {
  globalThis.ResizeObserver = class { observe() {} unobserve() {} disconnect() {} } as unknown as typeof ResizeObserver
  Object.defineProperty(HTMLElement.prototype, 'clientWidth', { configurable: true, get: () => 600 })
})
afterEach(() => {
  cleanup()
  document.body.innerHTML = ''
})

const renderPanel = () => {
  const r = calcularRitmoVivo(entrada, 'carros')!
  return render(<RitmoVivoAmpliado r={r} turno={null} cerrado={false} marca={null} onQuitarMarca={() => {}} />)
}

describe('panel de 15 minutos: cifra promedio, raya en el umbral y vara bajo el nombre', () => {
  it('la cifra de cada Baader es el promedio de la ventana, no el porcentaje del último minuto', () => {
    renderPanel()
    expect(screen.getByText('Carros con pieza, por máquina · últimos 15 minutos')).toBeTruthy()
    expect(screen.getByText('84 %')).toBeTruthy()
    expect(screen.getByText('77 %')).toBeTruthy()
    expect(screen.queryByText('100 %')).toBeNull()
  })

  it('la raya dice su entero: 16 o más con perilla 17 calibrada por omisión, 12 o más sin ella, y la vara va bajo el nombre', () => {
    renderPanel()
    expect(screen.getByText('16 o más')).toBeTruthy()
    expect(screen.getByText('12 o más')).toBeTruthy()
    expect(screen.getByText('perilla 17')).toBeTruthy()
    expect(screen.getByText('Shoplogix 16')).toBeTruthy()
  })

  it('el rótulo «16 o más» va pintado encima de la línea de datos de su fila (la línea cruza su inicio); el halo lo mide el banco, jsdom no aplica paint-order', () => {
    renderPanel()
    const rotulo = screen.getByText('16 o más')
    const lineas = Array.from(rotulo.parentElement!.querySelectorAll('polyline'))
    expect(lineas.length).toBeGreaterThan(0)
    expect(lineas.some((pl) => (pl.compareDocumentPosition(rotulo) & Node.DOCUMENT_POSITION_FOLLOWING) !== 0)).toBe(true)
  })
})

/* La tarjeta («Ritmo en vivo») pone a la derecha de cada Baader la misma cifra del panel de 15 min, no su último minuto (que aquí
   daría 100 % en las dos). Con ancho de PC la tarjeta dibuja esa columna. */
const N = 14
const TOTAL = entrada.serie.maquinas.reduce((a, m) => a + m.cycles.reduce((x, y) => x + y, 0), 0)
const pTarjeta = {
  piezas: TOTAL,
  corteHora: '11:14',
  meta: 3000,
  proyeccion: 2950,
  cuota: { piezas: 3000, hora: '11:14' },
  cerrado: false,
  curva: {
    hoy: [{ minutes: 5, pieces: 0 }, { minutes: N, pieces: TOTAL }],
    previo: { label: 'turno de prueba', curve: [{ minutes: 5, pieces: 0 }, { minutes: N, pieces: Math.round(TOTAL * 0.95) }, { minutes: 450, pieces: 3000 }] },
    objetivo: [{ minutes: 0, pieces: 0 }, { minutes: 450, pieces: 3000 }],
    maxMin: 450,
  },
} as unknown as MonitorV2Props
const relojTarjeta: RelojDeDatos = {
  cuadro: () => ({ valor: TOTAL, frac: 1, previa: null, ultima: { valor: TOTAL, atMs: T0 + N * 60_000 }, atrasada: false }),
  alCuadro: () => () => {},
  version: 1,
  detenida: false,
  reducido: false,
}

describe('la tarjeta y el panel dicen la misma cifra por Baader', () => {
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
    Object.defineProperty(HTMLElement.prototype, 'clientWidth', { configurable: true, get: () => 1280 })
  })

  it('Ev 1 y Ev 2 dicen 84 % y 77 % carros en la tarjeta, las mismas cifras del panel, y no el 100 % de su último minuto', () => {
    const r = calcularRitmoVivo(entrada, 'carros')!
    const eje: EjeDatos = {
      iniMs: T0,
      finMs: T0 + 450 * 60_000,
      minuto: entrada.serie,
      primeraPiezaMs: null,
      detenidaEstado: false,
      paradas: [],
      llenado: llenadoDelPanel(r),
      unidad: 'carros',
      perillas: entrada.perillas,
    }
    render(
      <>
        <GraficoRitmoVivo p={pTarjeta} e={eje} reloj={relojTarjeta} />
        <RitmoVivoAmpliado r={r} turno={null} cerrado={false} marca={null} onQuitarMarca={() => {}} />
      </>,
    )
    expect(screen.getByText('84 % carros')).toBeTruthy()
    expect(screen.getByText('77 % carros')).toBeTruthy()
    expect(screen.getByText('84 %')).toBeTruthy()
    expect(screen.getByText('77 %')).toBeTruthy()
    expect(screen.queryByText('100 % carros')).toBeNull()
  })
})
