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

  it('«Ritmo de la línea»: la media de 15 min (andando) reemplaza a «Últimos 30 min» y solo en vivo', () => {
    const vivo = render(<MonitorV2 {...props(0)} />)
    abrir(vivo, 'Ritmo de la línea: ver detalle')
    const capa = vivo.getByRole('dialog').textContent ?? ''
    expect(capa).toContain('Media 15 min (andando)')
    expect(capa).toContain('44,8 pz/min')
    expect(capa).not.toContain('Últimos')
    cleanup()
    const cerrado = render(<MonitorV2 {...props(0)} cerrado ritmoAhora={null} />)
    abrir(cerrado, 'Ritmo de la línea: ver detalle')
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
    abrir({ getByRole } as ReturnType<typeof render>, 'Ritmo de la línea: ver detalle')
    const fila = Array.from(getByRole('dialog').querySelectorAll('div[class*="min-h-[44px]"]')).find((f) => f.textContent?.startsWith('Promedio del turno')) as HTMLElement
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
    abrir(c, 'Ritmo de la línea: ver detalle')
    expect(c.getByRole('button', { name: 'Reducir Ritmo de la línea' })).toBeTruthy()
    fireEvent.click(c.getByRole('button', { name: 'Reducir Ritmo de la línea' }))
    expect(c.queryByRole('button', { name: 'Reducir Ritmo de la línea' })).toBeNull()
    abrir(c, 'Mantención: ver detalle')
    expect(c.getByRole('button', { name: 'Reducir Respuesta de Mantención' })).toBeTruthy()
  })

  it('«Piezas del turno»: con la meta cumplida dice «Sobre la meta +479 pz», no «Faltan 0 pz»', () => {
    const sobre = render(<MonitorV2 {...props(0)} piezas={15479} proyeccion={null} cerrado />)
    abrir(sobre, 'Piezas del turno: ver detalle')
    const capa = sobre.getByRole('dialog').textContent ?? ''
    expect(capa).toContain('Sobre la meta')
    expect(capa).toContain('+479 pz')
    expect(capa).not.toContain('Faltan')
    cleanup()
    const falta = render(<MonitorV2 {...props(0)} />)
    abrir(falta, 'Piezas del turno: ver detalle')
    const c2 = falta.getByRole('dialog').textContent ?? ''
    expect(c2).toContain('Faltan')
    expect(c2).not.toContain('Sobre la meta')
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
