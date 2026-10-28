/**
 * «El turno» del monitor v2 tiene UN solo orden en todos los anchos (opción A «cinta»): la parada en curso → la franja →
 * «Ritmo en vivo» → «Cada máquina · aporte» → «Ver más del turno». Duelo, fallas y tiempo perdido solo con «Ver más».
 * Se prueba el esqueleto con datos de ejemplo: no hay fork de PC, nada se repite y nada de lo que salió reaparece.
 */
import { cleanup, fireEvent, render } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { MonitorV2, type MonitorV2Props } from '../MonitorV2'
import type { EjeDatos } from '../GraficoRitmoVivo'
import { armarTope, type EntradaRep } from '../reproduccionMinuto'

const INI = Date.UTC(2026, 9, 27, 21, 30)
const AHORA = 305
const serie = (n: number) => Array.from({ length: AHORA }, () => n)

const eje: EjeDatos = {
  iniMs: INI,
  finMs: INI + 450 * 60_000,
  minuto: {
    desde: new Date(INI).toISOString(),
    maquinas: [
      { id: 'a', nombre: 'Evisceradora 1', esperado: 19, cycles: serie(17) },
      { id: 'b', nombre: 'Evisceradora 2', esperado: 16, cycles: serie(14) },
    ],
  },
  primeraPiezaMs: null,
  detenidaEstado: false,
  paradas: [],
  llenado: null,
  unidad: 'carros',
}

const props = (vista: 0 | 1 | 2): MonitorV2Props => ({
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
  vsAyer: null,
  mant: { fallas: 0, fallaMin: 0, mttr: null, mttrPrevio: null, dispPct: 100 },
  eventos: [],
  rielMttr: [],
  perdidas: [{ dueno: 'mantencion', min: 0 }, { dueno: 'externo', min: 0 }, { dueno: 'sin-imputar', min: 60 }],
  causas: [{ causa: 'Detencion', min: 60, dueno: 'sin-imputar', veces: 2 }],
  programadas: [],
  maquinas: [
    { name: 'Evisceradora 1', status: 'produciendo', desdeMin: null, ahora: 17, promedio: 16, razon: null, piezas: 4800, dispPct: 100 },
    { name: 'Evisceradora 2', status: 'produciendo', desdeMin: null, ahora: 14, promedio: 14, razon: null, piezas: 4200, dispPct: 100 },
  ],
  curva: null,
  inicioMs: INI,
  cierre: null,
  ritmoInfo: { recienteCpm: 27.6, recienteMin: 30, medianaCpm: null, mejorCpm: null, muestras: null, setPointFecha: null, setPointMetodo: null },
  mantPorMaquina: [],
  cerrado: false,
  mas: { cascada: null, cascadaDetalle: null, tiempo: null, comparado: [] },
  eje,
  banda: <div role="status">parada en curso</div>,
  ritmoLinea: <p>tabla de cada máquina</p>,
  caminoMeta: <p>camino a la meta</p>,
  duelo: <p>duelo de equipos</p>,
  ritmoVivoAmpliado: <p>detalle de ritmo en vivo</p>,
  vista,
  onVista: () => {},
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

const texto = (el: Element) => el.textContent ?? ''

describe('MonitorV2 · «El turno» ordenado', () => {
  it('el orden: banda → franja → Ritmo en vivo → Cada máquina → Ver más', () => {
    const { container } = render(<MonitorV2 {...props(0)} />)
    const hijos = Array.from(container.querySelector('.monitor-v2')!.children)
    const idx = (frag: string) => hijos.findIndex((h) => texto(h).includes(frag))
    const pos = [idx('parada en curso'), idx('Piezas del turno'), idx('Ritmo en vivo'), idx('tabla de cada máquina'), idx('Ver más del turno')]
    expect(pos.every((i) => i >= 0)).toBe(true)
    expect([...pos].sort((a, b) => a - b)).toEqual(pos)
  })

  it('sin fork de PC: ni riel, ni «Piezas ahora», ni la fila de cuatro tarjetas', () => {
    const { container } = render(<MonitorV2 {...props(0)} />)
    const t = texto(container)
    expect(container.querySelector('.monitor-v2')?.hasAttribute('data-eje')).toBe(false)
    expect(container.querySelector('.v2-fila-cifras')).toBeNull()
    expect(container.querySelector('.eje-riel')).toBeNull()
    expect(t).not.toContain('Piezas ahora')
    expect(t).not.toContain('Respuesta de Mantención')
    expect(t).not.toContain('El turno en un solo eje')
  })

  it('cada cifra una sola vez: «Piezas del turno», «Ritmo de la línea» y el «Ritmo en vivo» del gráfico', () => {
    const { container } = render(<MonitorV2 {...props(0)} />)
    const t = texto(container)
    expect(t.split('Piezas del turno').length - 1).toBe(1)
    expect(t.split('Ritmo de la línea').length - 1).toBe(1)
    expect(container.querySelectorAll('h3').length).toBeGreaterThan(0)
    expect(Array.from(container.querySelectorAll('h3')).filter((h) => h.textContent === 'Ritmo en vivo')).toHaveLength(1)
  })

  it('Duelo, fallas de equipos y tiempo perdido NO están en la vista principal', () => {
    const t = texto(render(<MonitorV2 {...props(0)} />).container)
    expect(t).not.toContain('duelo de equipos')
    expect(t).not.toContain('Fallas de equipos')
    expect(t).not.toContain('Tiempo perdido')
    expect(t).not.toContain('Más del turno')
  })

  it('con «Ver más del turno» aparecen el Duelo, las fallas y el tiempo perdido, encima de «Más del turno»', () => {
    const { container } = render(<MonitorV2 {...props(1)} />)
    const t = texto(container)
    const orden = ['duelo de equipos', 'Fallas de equipos', 'Tiempo perdido', 'Más del turno']
    let desde = 0
    for (const r of orden) {
      const i = t.indexOf(r, desde)
      expect(i, `«${r}» en su lugar`).toBeGreaterThanOrEqual(0)
      desde = i
    }
  })

  it('«Ampliar» del gráfico solo existe con detalle que abrir, y Camino a la meta va dentro de la franja', () => {
    const { container, queryByRole } = render(<MonitorV2 {...props(0)} />)
    expect(queryByRole('button', { name: 'Ampliar Ritmo en vivo' })).not.toBeNull()
    expect(container.querySelector('.fc .v2-camino')?.textContent).toBe('camino a la meta')
    cleanup()
    const sinDetalle = render(<MonitorV2 {...props(0)} ritmoVivoAmpliado={undefined} />)
    expect(sinDetalle.queryByRole('button', { name: 'Ampliar Ritmo en vivo' })).toBeNull()
  })

  it('sin serie por minuto ni curva no hay gráfico: se dice (no desaparece en silencio) y la franja sigue', () => {
    const { container } = render(<MonitorV2 {...props(0)} eje={null} />)
    expect(texto(container)).toContain('Piezas del turno')
    expect(container.querySelector('.v2-minuto-scroll')).toBeNull()
    expect(container.querySelector('.rv-grafico')).toBeNull()
    expect(texto(container)).toContain('no se puede dibujar el gráfico')
  })

  it('con gráfico lleva la marca que esconde el aviso «Ahora mismo» en PC (la línea detenida ya la dicen la franja y el gráfico)', () => {
    const { container } = render(<MonitorV2 {...props(0)} />)
    expect(container.querySelector('.rv-grafico')).not.toBeNull()
  })

  it('el detalle de «Piezas del turno» dice la misma cifra que la celda: con reproducción, la suma de los minutos cerrados', () => {
    /* Σ cycles = 9.671; el contador de planta va 19 adelante por el minuto en curso. */
    const entrada: EntradaRep = {
      desdeMs: INI,
      maquinas: [
        { id: 'a', nombre: 'Evisceradora 1', esperado: 19, cycles: [3309] },
        { id: 'b', nombre: 'Evisceradora 2', esperado: 16, cycles: [3071] },
        { id: 'c', nombre: 'Evisceradora 3', esperado: 16, cycles: [3291] },
      ],
      paradas: {},
      pulsoAtMs: null,
    }
    const { getByRole } = render(<MonitorV2 {...props(0)} repro={{ entrada, tope: armarTope(9690, null) }} />)
    fireEvent.click(getByRole('button', { name: 'Piezas del turno: ver detalle' }))
    const capa = getByRole('dialog').textContent ?? ''
    expect(capa).toContain('9.671')
    expect(capa).not.toContain('9.690')
    /* Faltan = meta − lo mostrado. */
    expect(capa).toContain('5.329')
  })

  it('el detalle de «Ritmo de la línea» pide «necesario» en la misma base andando que la franja', () => {
    const { getByRole } = render(<MonitorV2 {...props(0)} ritmoNecesario={30.1} ritmoPedido={36.7} />)
    fireEvent.click(getByRole('button', { name: 'Ritmo de la línea: ver detalle' }))
    const capa = getByRole('dialog').textContent ?? ''
    expect(capa).toContain('36,7')
    expect(capa).not.toContain('30,1')
  })
})
