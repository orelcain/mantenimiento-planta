/**
 * El turno anterior con UNA sola cifra: la leyenda del gráfico «Ritmo en vivo» y la hoja «Piezas del turno» dicen lo mismo
 * (en vivo, su curva al mismo minuto desde la primera pieza; cerrado, su total, el de «Comparado con otros días»).
 */
import { cleanup, fireEvent, render } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { MonitorV2, type MonitorV2Props } from '../MonitorV2'
import type { EjeDatos } from '../GraficoRitmoVivo'

const INI = Date.UTC(2026, 9, 27, 21, 30)
const AHORA = 305
const serie = (n: number) => Array.from({ length: AHORA }, () => n)

const eje: EjeDatos = {
  iniMs: INI,
  finMs: INI + 450 * 60_000,
  finRealMs: INI + 440 * 60_000,
  minuto: {
    desde: new Date(INI).toISOString(),
    maquinas: [
      { id: 'a', nombre: 'Evisceradora 1', esperado: 19, cycles: serie(17) },
      { id: 'b', nombre: 'Evisceradora 2', esperado: 16, cycles: serie(14) },
    ],
  },
  primeraPiezaMs: INI + 5 * 60_000,
  detenidaEstado: false,
  paradas: [],
  llenado: null,
  unidad: 'carros',
}

const curva = {
  hoy: [{ minutes: 0, pieces: 0 }, { minutes: 300, pieces: 9690 }],
  previo: { label: 'lun 26', curve: [{ minutes: 0, pieces: 0 }, { minutes: 200, pieces: 6000 }, { minutes: 440, pieces: 14000 }] },
  objetivo: [{ minutes: 0, pieces: 0 }, { minutes: 450, pieces: 15000 }],
  maxMin: 450,
}

const props = (extra: Partial<MonitorV2Props> = {}): MonitorV2Props => ({
  piezas: 9690,
  corteHora: '02:35',
  cuota: { piezas: 10667, hora: '02:35' },
  meta: 15000,
  proyeccion: 15623,
  ritmo: 41,
  ritmoAhora: 44,
  ritmoNecesario: 36.7,
  ritmoMedia15: 44.8,
  ritmoPedido: 36.7,
  setPoint: null,
  /* El valor que NO debe aparecer: el de siempre, alineado por otro minuto. */
  vsAyer: { label: 'lun 26', pieces: 9111, diff: 579 },
  mant: { fallas: 0, fallaMin: 0, mttr: null, mttrPrevio: null, dispPct: 100 },
  eventos: [],
  rielMttr: [],
  perdidas: [{ dueno: 'mantencion', min: 0 }, { dueno: 'externo', min: 0 }, { dueno: 'sin-imputar', min: 0 }],
  causas: [],
  programadas: [],
  maquinas: [
    { name: 'Evisceradora 1', status: 'produciendo', desdeMin: null, ahora: 17, promedio: 16, razon: null, piezas: 4800, dispPct: 100 },
    { name: 'Evisceradora 2', status: 'produciendo', desdeMin: null, ahora: 14, promedio: 14, razon: null, piezas: 4200, dispPct: 100 },
  ],
  curva,
  inicioMs: INI,
  cierre: null,
  ritmoInfo: { recienteCpm: 27.6, recienteMin: 30, medianaCpm: null, mejorCpm: null, muestras: null, setPointFecha: null, setPointMetodo: null },
  mantPorMaquina: [],
  cerrado: false,
  mas: { cascada: null, cascadaDetalle: null, tiempo: null, comparado: [] },
  eje,
  lectura: { valor: 9690, atMs: INI + AHORA * 60_000 },
  banda: <div role="status">parada en curso</div>,
  ritmoLinea: <p>tabla de cada máquina</p>,
  caminoMeta: <p>camino a la meta</p>,
  duelo: <p>duelo de equipos</p>,
  ritmoVivoAmpliado: <p>detalle de ritmo en vivo</p>,
  vista: 0,
  onVista: () => {},
  ...extra,
})

beforeEach(() => {
  window.matchMedia = ((q: string) => ({
    matches: q.includes('min-width: 1024px') || q.includes('min-width: 768px'),
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
  Object.defineProperty(HTMLElement.prototype, 'clientWidth', { configurable: true, get: () => 1806 })
  Object.defineProperty(HTMLElement.prototype, 'clientHeight', { configurable: true, get: () => 600 })
})
afterEach(() => {
  cleanup()
  document.body.innerHTML = ''
})

/** Los números de un texto, tal como se leen en pantalla («14.000» → 14000). */
const numeros = (t: string) => (t.match(/\d{1,3}(?:\.\d{3})+|\d+/g) ?? []).map((n) => Number(n.replace(/\./g, '')))

describe('turno anterior · una sola cifra en la leyenda y en la hoja «Piezas del turno»', () => {
  it('cerrado: los dos dicen el TOTAL del turno anterior (el último punto de su curva) y no el de «a esta altura»', () => {
    const { container, getByRole } = render(<MonitorV2 {...props({ cerrado: true, proyeccion: null })} />)
    const leyenda = container.querySelector('.rv-grafico')!.textContent ?? ''
    expect(leyenda).toContain('lun 26 · 14.000 al cierre')
    fireEvent.click(getByRole('button', { name: 'Piezas del turno: ver detalle' }))
    const hoja = getByRole('dialog').textContent ?? ''
    expect(hoja).toContain('lun 26 al cierre')
    expect(hoja).toContain('14.000 pz')
    expect(hoja).not.toContain('a esta altura')
    expect(hoja).not.toContain('9.111')
    expect(hoja).toContain('este turno')
  })

  it('en vivo: los dos dicen el valor de la curva previa en el mismo minuto desde la primera pieza (lo que se dibuja)', () => {
    const { container, getByRole } = render(<MonitorV2 {...props()} />)
    const leyenda = container.querySelector('.rv-grafico')!.textContent ?? ''
    const m = /lun 26 · ([\d.]+) a esta hora/.exec(leyenda)
    expect(m).not.toBeNull()
    const enLeyenda = Number(m![1]!.replace(/\./g, ''))
    /* La punta está en el minuto 305 y la primera pieza en el 5: su curva a los 300 min = 6.000 + 100/240 × 8.000. */
    expect(enLeyenda).toBe(Math.round(6000 + (100 / 240) * 8000))
    fireEvent.click(getByRole('button', { name: 'Piezas del turno: ver detalle' }))
    const hoja = getByRole('dialog').textContent ?? ''
    expect(hoja).toContain('lun 26 a esta hora')
    const celda = hoja.slice(hoja.indexOf('lun 26 a esta hora') + 'lun 26 a esta hora'.length)
    expect(numeros(celda)[0]).toBe(enLeyenda)
    expect(hoja).not.toContain('9.111')
    expect(hoja).not.toContain('a esta altura')
  })

  it('sin lectura del contador en vivo no hay con qué alinear el minuto: queda la cifra de siempre', () => {
    const { getByRole } = render(<MonitorV2 {...props({ lectura: null })} />)
    fireEvent.click(getByRole('button', { name: 'Piezas del turno: ver detalle' }))
    const hoja = getByRole('dialog').textContent ?? ''
    expect(hoja).toContain('lun 26 a esta altura')
    expect(hoja).toContain('9.111 pz')
  })
})
