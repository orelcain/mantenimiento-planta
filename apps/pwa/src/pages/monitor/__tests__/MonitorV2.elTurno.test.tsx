/**
 * «El turno» del monitor v2 tiene UN solo orden en todos los anchos (opción A «cinta»): la parada en curso → la franja →
 * «Ritmo en vivo» → control del pulso (la tabla «Cada máquina» es ahora la tarjeta Ritmo de la franja) → «Ver más del turno». Duelo,
 * fallas y tiempo perdido solo con «Ver más».
 * Se prueba el esqueleto con datos de ejemplo: no hay fork de PC, nada se repite y nada de lo que salió reaparece.
 */
import { act, cleanup, fireEvent, render } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
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
  ritmoLinea: <p>control del pulso</p>,
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

describe('MonitorV2 · al pasar a otro turno la cifra grande salta directo', () => {
  it('de 8.370 (en vivo) a 15.479 (cerrado): la cifra dice 15.479 de inmediato y no cuenta hacia arriba; con el mismo turno, sí', () => {
    const enVivo = { ...props(0), piezas: 8370, lectura: { valor: 8370, atMs: 100 * 60_000 }, turnoId: 'vivo' }
    const { container, rerender } = render(<MonitorV2 {...enVivo} />)
    expect(container.querySelector('.fc-cifra-p')?.textContent).toBe('8.370')
    /* «Anterior»: el turno cerrado entra con SU total y la hora de su última lectura (otra hora). */
    const cerrado = { ...props(0), piezas: 15479, proyeccion: null, cerrado: true, lectura: { valor: 15479, atMs: 5 * 60_000 }, turnoId: 'cerrado' }
    rerender(<MonitorV2 {...cerrado} />)
    expect(container.querySelector('.fc-cifra-p')?.textContent).toBe('15.479')
    /* El mismo turno con piezas nuevas conserva la recta: arranca en la cifra anterior y sube. */
    const mismo = { ...props(0), piezas: 8400, lectura: { valor: 8400, atMs: 101 * 60_000 }, turnoId: 'vivo' }
    cleanup()
    const a = render(<MonitorV2 {...enVivo} />)
    a.rerender(<MonitorV2 {...mismo} />)
    expect(a.container.querySelector('.fc-cifra-p')?.textContent).toBe('8.370')
  })
})

describe('MonitorV2 · «El turno» ordenado', () => {
  it('el orden: banda → franja → Ritmo en vivo → control del pulso → Ver más', () => {
    const { container } = render(<MonitorV2 {...props(0)} />)
    const hijos = Array.from(container.querySelector('.monitor-v2')!.children)
    const idx = (frag: string) => hijos.findIndex((h) => texto(h).includes(frag))
    const pos = [idx('parada en curso'), idx('Piezas del turno'), idx('Ritmo en vivo'), idx('control del pulso'), idx('Ver más del turno')]
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

  it('cada cifra una sola vez: «Piezas del turno», la tarjeta «Ritmo» (la línea y cada Baader) y el «Ritmo en vivo» del gráfico', () => {
    const { container } = render(<MonitorV2 {...props(0)} />)
    const t = texto(container)
    expect(t.split('Piezas del turno').length - 1).toBe(1)
    /* UN solo rótulo «Ritmo» en la franja, y la tabla «Cada máquina» ya no está bajo el gráfico. */
    expect(Array.from(container.querySelectorAll('.fc-rotulo')).filter((r) => r.textContent === 'Ritmo')).toHaveLength(1)
    expect(container.querySelectorAll('.rb')).toHaveLength(1)
    expect(t).not.toContain('Ritmo de la línea')
    expect(t).not.toContain('Cada máquina')
    expect(t).not.toContain('Cada Baader')
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

  it('el detalle de «Piezas del turno» dice la misma cifra que la celda: con la cola, la del instante reproducido (no el contador de planta)', () => {
    /* 3 minutos cerrados: la cola arranca con 2 en cola, así que al cargar la cifra es la del primer minuto cerrado (8.800), no el
       contador de planta (9.690) ni la suma de todo lo cerrado (9.671). */
    const entrada: EntradaRep = {
      desdeMs: INI,
      maquinas: [
        { id: 'a', nombre: 'Evisceradora 1', esperado: 19, cycles: [3000, 200, 109] },
        { id: 'b', nombre: 'Evisceradora 2', esperado: 16, cycles: [2800, 150, 121] },
        { id: 'c', nombre: 'Evisceradora 3', esperado: 16, cycles: [3000, 150, 141] },
      ],
      paradas: {},
      pulsoAtMs: null,
    }
    const { getByRole, container } = render(<MonitorV2 {...props(0)} repro={{ entrada, tope: armarTope(9690, null) }} />)
    const celda = container.querySelector('.fc-cifra-p')?.textContent
    expect(celda).toBe('8.800')
    fireEvent.click(getByRole('button', { name: 'Piezas del turno: ver detalle' }))
    const capa = getByRole('dialog').textContent ?? ''
    expect(capa).toContain('8.800')
    expect(capa).not.toContain('9.690')
    expect(capa).not.toContain('9.671')
    /* Faltan = meta − lo mostrado. */
    expect(capa).toContain('6.200')
  })

  it('el detalle de «Ritmo» pide «necesario» en la misma base andando que la franja', () => {
    const { getByRole } = render(<MonitorV2 {...props(0)} ritmoNecesario={30.1} ritmoPedido={36.7} />)
    fireEvent.click(getByRole('button', { name: 'Ritmo: ver detalle' }))
    const capa = getByRole('dialog').textContent ?? ''
    expect(capa).toContain('36,7')
    expect(capa).not.toContain('30,1')
  })
})

describe('MonitorV2 · hojas de detalle (FilaCifra, «Reducir», rótulos del riel)', () => {
  /* El ancho se simula por consulta: la hoja del celular (< 1024) y el panel lateral de PC no son el mismo componente. */
  const ancho = (px: number) => {
    window.matchMedia = ((q: string) => {
      const min = /min-width:\s*(\d+)px/.exec(q)
      return { matches: min ? px >= Number(min[1]) : false, media: q, addEventListener: () => {}, removeEventListener: () => {}, addListener: () => {}, removeListener: () => {}, onchange: null, dispatchEvent: () => false }
    }) as unknown as typeof window.matchMedia
  }
  const abrir = (c: ReturnType<typeof render>, nombre: string) => fireEvent.click(c.getByRole('button', { name: nombre }))
  const hora = (i: number, partial: boolean) => ({
    hourStart: `2026-10-27T${String(21 + i).padStart(2, '0')}:30:00.000Z`, index: i + 1,
    from: `2026-10-27T${String(21 + i).padStart(2, '0')}:30:00.000Z`, to: `2026-10-27T${String(22 + i).padStart(2, '0')}:30:00.000Z`,
    pieces: 2000, minutesCovered: partial ? 35 : 60, piecesPerHour: 2000, partial,
  })

  it('«Ritmo»: la media de 15 min (andando) reemplaza a «Últimos 30 min» y solo en vivo', () => {
    const vivo = render(<MonitorV2 {...props(0)} />)
    abrir(vivo, 'Ritmo: ver detalle')
    const capa = vivo.getByRole('dialog').textContent ?? ''
    expect(capa).toContain('Media 15 min (andando)')
    expect(capa).toContain('44,8 pz/min')
    expect(capa).not.toContain('Últimos')
    cleanup()
    const cerrado = render(<MonitorV2 {...props(0)} cerrado ritmoAhora={null} />)
    abrir(cerrado, 'Ritmo: ver detalle')
    expect(cerrado.getByRole('dialog').textContent).not.toContain('Media 15 min')
  })

  it('«Respuesta de Mantención»: sin fallas dice «sin fallas», no «—»', () => {
    const { getByRole } = render(<MonitorV2 {...props(0)} />)
    abrir({ getByRole } as ReturnType<typeof render>, 'Mantención: ver detalle')
    const filas = Array.from(getByRole('dialog').querySelectorAll('div[class*="min-h-[44px]"]')).map((f) => f.textContent ?? '')
    expect(filas.find((f) => f.startsWith('Hoy'))).toBe('Hoysin fallas')
  })

  it('las filas de las hojas son FilaCifra: el rótulo a 15/400 y la cifra a 17/600 a la derecha, 44 px de alto mínimo', () => {
    const { getByRole } = render(<MonitorV2 {...props(0)} />)
    abrir({ getByRole } as ReturnType<typeof render>, 'Ritmo: ver detalle')
    const fila = Array.from(getByRole('dialog').querySelectorAll('div[class*="min-h-[44px]"]')).find((f) => f.textContent?.startsWith('Necesario para la meta')) as HTMLElement
    expect(fila).toBeTruthy()
    expect(fila.className).toContain('min-h-[44px]')
    const [izq, der] = Array.from(fila.children) as HTMLElement[]
    expect(izq!.firstElementChild!.className).toContain('text-[15px]')
    expect(izq!.firstElementChild!.className).not.toContain('font-semibold')
    expect(der!.firstElementChild!.className).toContain('text-[17px]')
    expect(der!.firstElementChild!.className).toContain('font-semibold')
    expect(der!.className).toContain('tabular-nums')
  })

  it('en el celular las hojas de Ritmo y Mantención traen «Reducir» (como Piezas, Camino y Ritmo en vivo)', () => {
    ancho(390)
    const c = render(<MonitorV2 {...props(0)} />)
    abrir(c, 'Ritmo: ver detalle')
    expect(c.getByRole('button', { name: 'Reducir Ritmo' })).toBeTruthy()
    fireEvent.click(c.getByRole('button', { name: 'Reducir Ritmo' }))
    expect(c.queryByRole('button', { name: 'Reducir Ritmo' })).toBeNull()
    abrir(c, 'Mantención: ver detalle')
    expect(c.getByRole('button', { name: 'Reducir Respuesta de Mantención' })).toBeTruthy()
  })

  it('«Piezas del turno»: con la meta cumplida dice «Meta superada · 479 pz adelante», no «Faltan 0 pz»', () => {
    const sobre = render(<MonitorV2 {...props(0)} piezas={15479} proyeccion={null} cerrado />)
    abrir(sobre, 'Piezas del turno: ver detalle')
    const capa = sobre.getByRole('dialog').textContent ?? ''
    expect(capa).toContain('Meta superada')
    expect(capa).toContain('479 pz adelante')
    expect(capa).not.toContain('+479')
    expect(capa).not.toContain('Faltan')
    cleanup()
    const falta = render(<MonitorV2 {...props(0)} />)
    abrir(falta, 'Piezas del turno: ver detalle')
    const c2 = falta.getByRole('dialog').textContent ?? ''
    expect(c2).toContain('Faltan')
    expect(c2).not.toContain('Meta superada')
  })

  it('«Piezas del turno»: la hora incompleta dice «en curso» solo con el turno en vivo', () => {
    const horas = { filas: [hora(0, false), hora(1, true)], metaPorHora: 2000, porMaquina: [] }
    const vivo = render(<MonitorV2 {...props(0)} horas={horas} />)
    abrir(vivo, 'Piezas del turno: ver detalle')
    expect(vivo.getByRole('dialog').textContent).toContain('en curso')
    cleanup()
    const cerrado = render(<MonitorV2 {...props(0)} horas={horas} cerrado proyeccion={null} />)
    abrir(cerrado, 'Piezas del turno: ver detalle')
    const capa = cerrado.getByRole('dialog').textContent ?? ''
    expect(capa).not.toContain('en curso')
    expect(capa).not.toContain('tramo en curso')
  })

  it('«Fallas de equipos» (Ver más): el rótulo del riel va en dos renglones, «27/10» y «T2», sin truncar', () => {
    const riel = [{ label: '26/10 T1', mttr: 12 }, { label: '27/10 T2', mttr: null }, { label: 'Hoy', mttr: null, hoy: true }]
    const { container } = render(<MonitorV2 {...props(1)} rielMttr={riel} />)
    const rotulos = Array.from(container.querySelectorAll('[aria-label="Minutos por falla en los últimos turnos"]')[0]!.parentElement!.querySelectorAll('span.text-center'))
    expect(rotulos).toHaveLength(3)
    expect(rotulos.map((r) => r.innerHTML.replace('<br>', '|'))).toEqual(['26/10|T1', '27/10|T2', 'Hoy'])
    expect(rotulos.every((r) => !r.className.includes('truncate'))).toBe(true)
  })
})

describe('MonitorV2 · todo lo que se mueve sigue al reloj único de la cola', () => {
  const num = (t: string | null | undefined) => Number((t ?? '').replace(/\./g, ''))
  const abrir = (c: ReturnType<typeof render>, nombre: string) => fireEvent.click(c.getByRole('button', { name: nombre }))
  const entradaCola: EntradaRep = {
    desdeMs: INI,
    maquinas: [
      { id: 'a', nombre: 'Evisceradora 1', esperado: 19, cycles: [3000, 200, 109, 40] },
      { id: 'b', nombre: 'Evisceradora 2', esperado: 16, cycles: [2800, 150, 121, 40] },
    ],
    paradas: {},
    pulsoAtMs: null,
  }
  beforeEach(() => {
    vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout', 'setInterval', 'clearInterval', 'requestAnimationFrame', 'cancelAnimationFrame', 'performance'] })
  })
  afterEach(() => { vi.useRealTimers() })

  it('«Al cierre» es UNA cifra: la proyección (15.623) en la franja y en el ampliado, aunque las hechas del cuadro suban; «Faltan para la meta» sí sigue a las hechas', () => {
    const cierre = { hora: '04:50', quedaMin: 100, faltan: 5310, colacionMin: 0, extraCpm: null, extraFactible: null }
    const c = render(<MonitorV2 {...props(0)} cierre={cierre} repro={{ entrada: entradaCola, tope: armarTope(9690, null) }} />)
    const container = c.container
    const lee = () => {
      const hechas = num(container.querySelector('.fc-cifra-p')?.textContent)
      const nota = [...container.querySelectorAll('.fc-nota')].map((n) => n.textContent ?? '').find((t) => t.startsWith('proyección')) ?? ''
      return { hechas, cierre: num(nota.replace('proyección', '').trim()) }
    }
    const a = lee()
    /* El cuadro va por detrás del contador (9.690): `hechas + (proyección − contador)` daría otra cifra. */
    expect(a.hechas).toBeLessThan(9690)
    expect(a.cierre).toBe(15623)
    act(() => { vi.advanceTimersByTime(40_000) })
    const b = lee()
    expect(b.hechas).toBeGreaterThan(a.hechas)
    expect(b.cierre).toBe(15623)
    abrir(c, 'Al cierre: ver detalle')
    const capa = c.getByRole('dialog').textContent ?? ''
    expect(capa).toContain('15.623 pz')
    /* «Faltan para la meta» = meta − hechas del cuadro (la misma resta de «Faltan» en Piezas del turno), no el 5.310 del contador. */
    const faltan = num(/Faltan para la meta([\d.]+) pz/.exec(capa)?.[1])
    expect(faltan).not.toBe(5310)
    expect(faltan + num(container.querySelector('.fc-cifra-p')?.textContent)).toBeGreaterThanOrEqual(15000 - 3)
    expect(faltan + num(container.querySelector('.fc-cifra-p')?.textContent)).toBeLessThanOrEqual(15000 + 3)
  })

  it('«Hora a hora»: con la serie de 5 min por delante del cuadro (la hora anterior ya suma más que las hechas) las horas igual suman la cifra grande', () => {
    const filaSerie = (i: number, pieces: number, partial: boolean) => ({
      hourStart: new Date(INI + i * 3_600_000).toISOString(), index: i + 1, from: new Date(INI + i * 3_600_000).toISOString(),
      to: new Date(INI + (i + 1) * 3_600_000).toISOString(), pieces, minutesCovered: partial ? 5 : 60, piecesPerHour: pieces, partial,
    })
    /* la serie ya dio 7.000 en la hora 1 y abrió la 2; el cuadro (≈ 5.900) todavía está dentro de la hora 1 */
    const horas = { filas: [filaSerie(0, 7000, false), filaSerie(1, 120, true)], metaPorHora: 2000, porMaquina: [] }
    const c = render(<MonitorV2 {...props(0)} horas={horas} repro={{ entrada: entradaCola, tope: armarTope(9690, null) }} />)
    abrir(c, 'Piezas del turno: ver detalle')
    act(() => { vi.advanceTimersByTime(20_000) })
    const capa = c.getByRole('dialog')
    const grande = num(capa.querySelector('.v2-cifra')?.textContent)
    const filasTabla = [...capa.querySelectorAll('[role="row"]')].slice(1)
    const celdas = filasTabla.map((f) => num(f.querySelectorAll('[role="cell"]')[1]?.textContent))
    expect(filasTabla).toHaveLength(1)
    expect(celdas.reduce((a, x) => a + x, 0)).toBe(grande)
    expect(capa.textContent).not.toContain('Las horas suman')
  })

  it('«Por máquina» del ampliado: cada Baader dice lo de su cuadro y las dos suman la cifra de «Piezas del turno»', () => {
    const { container, getByRole } = render(<MonitorV2 {...props(0)} repro={{ entrada: entradaCola, tope: armarTope(9690, null) }} />)
    fireEvent.click(getByRole('button', { name: 'Piezas del turno: ver detalle' }))
    act(() => { vi.advanceTimersByTime(20_000) })
    const capa = getByRole('dialog')
    const grande = num(capa.querySelector('.v2-cifra')?.textContent)
    const m = /Por máquinaEvisceradora 1([\d.]+) pzEvisceradora 2([\d.]+) pz/.exec(capa.textContent ?? '')
    expect(m).not.toBeNull()
    /* cada Baader es lo del cuadro (no las 4.800 / 4.200 estáticas de `p.maquinas`) y suman la cifra grande */
    expect(num(m![1]) + num(m![2])).toBe(grande)
    expect(num(m![1])).not.toBe(4800)
    expect(container).toBeTruthy()
  })
})
