/**
 * CascadaMetaV2: la tarjeta «Dónde se fueron las piezas» del tablero v2 (opción A, pestañas) sobre el turno Chonchi del 03-11
 * (perillas 17 · 16 · 16, motivo «por el Knuro» en la Ev 1). Los textos esperados se escriben a mano (los del encargo y del
 * prototipo aprobado). Al final, `MonitorV2` pinta esta tarjeta cuando su `mas` trae `cascadaMeta`.
 */
import { cleanup, fireEvent, render } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import fixture from './fixtures/chonchi_0311_turno1_minutos.json'
import { CascadaMetaV2 } from '../CascadaMetaV2'
import { cascadaPorMeta, type CascadaArgs, type CascadaPorMeta } from '../cascadaPerilla'
import { detalleCascadaMeta, type DetalleCascadaMeta } from '../cascadaMetaDetalle'
import { paradasDetalle, type EntradaRitmoVivo } from '../ritmoVivo'
import type { PerillasDeLinea } from '../perilla'
import type { EjeDatos } from '../GraficoRitmoVivo'
import { MonitorV2, type MonitorV2Props } from '../MonitorV2'

const N = fixture.maquinas[0]!.cycles.length
const T0 = Date.parse(fixture.desde)
const IDS = fixture.maquinas.map((m) => m.id)
const desde = fixture.desde

const serie: CascadaArgs['serie'] = {
  desde,
  maquinas: fixture.maquinas.map(({ id, nombre, esperado, cycles }) => ({ id, nombre, esperado, cycles })),
}
const stopEvents: NonNullable<EntradaRitmoVivo['stopEvents']> = []
fixture.maquinas.forEach((m, mi) => m.det.forEach((d, k) => {
  const r = m.raz[k]!
  if (d > 0 && r >= 0) stopEvents.push({ r, f: new Date(T0 + k * 60_000).toISOString(), s: d, m: mi })
}))
const paradas = paradasDetalle({ stopEvents, stopReasons: fixture.razones, stopMachines: IDS, enCurso: [] })

const CON_MOTIVO: PerillasDeLinea = {
  actual: {
    [IDS[0]!]: { cpm: 17, desde, motivo: 'por el Knuro' },
    [IDS[1]!]: { cpm: 16, desde },
    [IDS[2]!]: { cpm: 16, desde },
  },
  historial: [],
}

/** La cascada y su detalle, con los mismos `args` (como en `PublicShiftMonitorPage`). */
function armar(over: Partial<CascadaArgs> = {}): { c: CascadaPorMeta; d: DetalleCascadaMeta } {
  const args: CascadaArgs = { serie, n: N, paradas, perillas: CON_MOTIVO, ...over }
  const c = cascadaPorMeta(args)
  return { c, d: detalleCascadaMeta(args, c) }
}

const texto = (el: Element) => el.textContent ?? ''
/** El botón de la fila (Detenciones, Microdetenciones, Carros/Silletas vacíos): su texto contiene el rótulo. */
const fila = (el: HTMLElement, rotulo: string) => [...el.querySelectorAll<HTMLButtonElement>('button[aria-expanded]')].find((b) => b.textContent?.includes(rotulo))!
/** Las pestañas del detalle (no las del selector de Baader, que tiene su propio nombre). */
const pestanasDetalle = (el: HTMLElement) => [...el.querySelectorAll('[role="tablist"]:not([aria-label]) [role="tab"]')].map((t) => t.textContent)
const segmento = (el: HTMLElement, rotulo: string) => [...el.querySelectorAll<HTMLButtonElement>('[role="tablist"][aria-label="Ver por Baader"] [role="tab"]')].find((t) => t.textContent === rotulo)!

afterEach(() => cleanup())

describe('tarjeta de la cascada: cifras de la línea (turno Chonchi 03-11)', () => {
  it('muestra «3.409» y «pz bajo la meta», el selector con 4 opciones y «Quién responde de las 3.409»', () => {
    const { c, d } = armar()
    const { container } = render(<CascadaMetaV2 cascada={c} detalle={d} contenedor="carro" />)
    const t = texto(container)
    expect(t).toContain('3.409')
    expect(t).toContain('pz bajo la meta')
    expect(t).toContain('Quién responde de las 3.409')
    const opciones = [...container.querySelectorAll('[role="tablist"][aria-label="Ver por Baader"] [role="tab"]')].map((x) => x.textContent)
    expect(opciones).toEqual(['Línea', 'Ev 1', 'Ev 2', 'Ev 3'])
  })

  it('el cuadre: «Cuadre: 19.692 − 378 − 465 − 339 − 2.227 = 16.283»', () => {
    const { c, d } = armar()
    const { container } = render(<CascadaMetaV2 cascada={c} detalle={d} contenedor="carro" />)
    expect(texto(container)).toContain('Cuadre: 19.692 − 378 − 465 − 339 − 2.227 = 16.283')
  })

  it('la perilla de la línea nombra a la Ev 1 («17 en vez de 18», con su motivo) y el rendimiento sale con sus puntos', () => {
    const { c, d } = armar()
    const { container } = render(<CascadaMetaV2 cascada={c} detalle={d} contenedor="carro" />)
    const t = texto(container)
    expect(t).toContain('Ev 1: 17 en vez de 18 (por el Knuro) · producción')
    expect(t).toContain('Al rendimiento le faltan 13,7 pts')
    expect(t).toContain('de carros vacíos')
  })

  it('«Cómo se calcula» abre la explicación del rendimiento', () => {
    const { c, d } = armar()
    const { container, getByRole, queryByText } = render(<CascadaMetaV2 cascada={c} detalle={d} contenedor="carro" />)
    expect(queryByText(/El rendimiento cuenta solo los minutos andando/)).toBeNull()
    fireEvent.click(getByRole('button', { name: 'Cómo se calcula' }))
    expect(texto(container)).toContain('El rendimiento cuenta solo los minutos andando. Las detenciones y las micro le restan a la disponibilidad; por eso lo que faltó para llegar a la perilla son los carros vacíos.')
  })
})

describe('el «Ver detalle» de cada fila', () => {
  it('al abrir «Detenciones» salen las pestañas Causa, Baader y Hora, y la causa «Ajuste operador»', () => {
    const { c, d } = armar()
    const { container } = render(<CascadaMetaV2 cascada={c} detalle={d} contenedor="carro" />)
    fireEvent.click(fila(container, 'Detenciones'))
    expect(fila(container, 'Detenciones').getAttribute('aria-expanded')).toBe('true')
    expect(pestanasDetalle(container)).toEqual(['Causa', 'Baader', 'Hora'])
    expect(texto(container)).toMatch(/ajuste operador/i)
  })

  it('en «Ev 1» no hay pestaña Baader: causa y hora', () => {
    const { c, d } = armar()
    const { container } = render(<CascadaMetaV2 cascada={c} detalle={d} contenedor="carro" />)
    fireEvent.click(segmento(container, 'Ev 1'))
    fireEvent.click(fila(container, 'Detenciones'))
    expect(pestanasDetalle(container)).toEqual(['Causa', 'Hora'])
  })

  it('cambiar de vista cierra la fila abierta', () => {
    const { c, d } = armar()
    const { container } = render(<CascadaMetaV2 cascada={c} detalle={d} contenedor="carro" />)
    fireEvent.click(fila(container, 'Detenciones'))
    expect(pestanasDetalle(container)).toHaveLength(3)
    fireEvent.click(segmento(container, 'Ev 2'))
    expect(fila(container, 'Detenciones').getAttribute('aria-expanded')).toBe('false')
    expect(pestanasDetalle(container)).toEqual([])
  })

  it('vacíos en la línea (con carros): la nota dice que la Baader andaba y el carro pasó sin pieza', () => {
    const { c, d } = armar()
    const { container } = render(<CascadaMetaV2 cascada={c} detalle={d} contenedor="carro" />)
    fireEvent.click(fila(container, 'Carros vacíos'))
    expect(texto(container)).toContain('La Baader andaba y el carro pasó sin pieza: lo que faltó para llegar a la perilla. No es tiempo detenido.')
  })
})

describe('casos que el prototipo no cubre', () => {
  it('una sola Baader (Filete): sin selector, sin pestaña Baader, «Toca una pérdida para ver causa y hora.» y «la máquina» en la nota de vacíos', () => {
    const una: CascadaArgs['serie'] = { desde, maquinas: [serie.maquinas[0]!] }
    const perillas: PerillasDeLinea = { actual: { [IDS[0]!]: { cpm: 17, desde, motivo: 'por el Knuro' } }, historial: [] }
    const { c, d } = armar({ serie: una, perillas })
    const { container } = render(<CascadaMetaV2 cascada={c} detalle={d} contenedor="silleta" />)
    expect(container.querySelector('[role="tablist"][aria-label="Ver por Baader"]')).toBeNull()
    expect(texto(container)).toContain('Toca una pérdida para ver causa y hora.')
    fireEvent.click(fila(container, 'Silletas vacías'))
    /* Solo queda la pestaña Hora: sin pestañas no hay tablist del detalle, y ninguna nota dice «Baader». */
    expect(container.querySelector('[role="tablist"]:not([aria-label])')).toBeNull()
    expect(texto(container)).not.toContain('Baader')
    expect(texto(container)).toContain('La máquina andaba y la silleta pasó vacía: lo que faltó para llegar a la perilla. No es tiempo detenido.')
  })

  it('una Baader sin meta: su vista es solo el aviso; la línea lo nombra al final', () => {
    const sinMeta: CascadaArgs['serie'] = { desde, maquinas: serie.maquinas.map((m, i) => (i === 0 ? { ...m, esperado: 0 } : m)) }
    const { c, d } = armar({ serie: sinMeta })
    const { container } = render(<CascadaMetaV2 cascada={c} detalle={d} contenedor="carro" />)
    const aviso = 'Ev 1 sin meta de Shoplogix en este turno: no entra en la cuenta'
    expect(texto(container)).toContain(aviso)
    fireEvent.click(segmento(container, 'Ev 1'))
    expect(texto(container)).toContain(aviso)
    expect(texto(container)).not.toContain('Podía hacer a la meta')
    expect(container.querySelector('[role="tablist"]:not([aria-label])')).toBeNull()
    fireEvent.click(segmento(container, 'Línea'))
    expect(texto(container)).toContain('Podía hacer a la meta')
    expect(container.textContent?.endsWith(aviso)).toBe(true)
  })

  it('sin perillas: la perilla de cada Baader dice «sin perilla anotada»', () => {
    const { c, d } = armar({ perillas: null })
    const { container } = render(<CascadaMetaV2 cascada={c} detalle={d} contenedor="carro" />)
    fireEvent.click(segmento(container, 'Ev 2'))
    expect(texto(container)).toContain('Perilla más lenta que la meta')
    expect(texto(container)).toContain('sin perilla anotada · producción')
  })
})

describe('MonitorV2 pinta la cascada a la meta cuando su «Más del turno» la trae (cascadaMeta)', () => {
  const INI = Date.UTC(2026, 9, 27, 21, 30)
  const AHORA = 305
  const serieCorta = (n: number) => Array.from({ length: AHORA }, () => n)
  const eje: EjeDatos = {
    iniMs: INI,
    finMs: INI + 450 * 60_000,
    minuto: { desde: new Date(INI).toISOString(), maquinas: [{ id: 'a', nombre: 'Evisceradora 1', esperado: 19, cycles: serieCorta(17) }] },
    primeraPiezaMs: null,
    detenidaEstado: false,
    paradas: [],
    llenado: null,
    unidad: 'carros',
  }
  const props = (mas: MonitorV2Props['mas']): MonitorV2Props => ({
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
    maquinas: [{ name: 'Evisceradora 1', status: 'produciendo', desdeMin: null, ahora: 17, promedio: 16, razon: null, piezas: 4800, dispPct: 100 }],
    curva: null,
    inicioMs: INI,
    cierre: null,
    ritmoInfo: { recienteCpm: 27.6, recienteMin: 30, medianaCpm: null, mejorCpm: null, muestras: null, setPointFecha: null, setPointMetodo: null },
    mantPorMaquina: [],
    cerrado: false,
    mas,
    eje,
    banda: <div role="status">parada en curso</div>,
    ritmoLinea: <p>control del pulso</p>,
    caminoMeta: <p>camino a la meta</p>,
    duelo: <p>duelo de equipos</p>,
    ritmoVivoAmpliado: <p>detalle de ritmo en vivo</p>,
    vista: 1,
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

  it('con cascadaMeta, «Más del turno» pinta la tarjeta nueva («pz bajo la meta»)', () => {
    const { c, d } = armar()
    const { container } = render(<MonitorV2 {...props({ cascada: null, cascadaDetalle: null, cascadaMeta: { cascada: c, detalle: d, contenedor: 'carro' }, tiempo: null, comparado: [] })} />)
    expect(texto(container)).toContain('pz bajo la meta')
  })

  it('sin cascadaMeta, no sale la tarjeta nueva (el respaldo es la cascada anterior)', () => {
    const { container } = render(<MonitorV2 {...props({ cascada: null, cascadaDetalle: null, tiempo: null, comparado: [] })} />)
    expect(texto(container)).not.toContain('pz bajo la meta')
  })
})
