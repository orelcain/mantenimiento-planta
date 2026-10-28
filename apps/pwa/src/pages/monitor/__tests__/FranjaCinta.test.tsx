/**
 * La franja «cinta» de «El turno»: cinco celdas en el mismo orden en PC y celular, y UNA sola cifra de «A esta hora» en
 * la franja, el gráfico y Camino a la meta. jsdom no mide ni dibuja: el ancho se simula y la geometría fina la prueba
 * `ejeTurno.test.ts` y el navegador. Sin `jest-dom`: se asierta sobre el texto renderizado.
 */
import { cleanup, fireEvent, render } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { agruparEventos } from '@/services/shoplogix/monitorEventos'
import type { PublicMonitorLive } from '@/services/shoplogix/publicShiftMonitor.service'
import { FranjaCinta } from '../FranjaCinta'
import { GraficoRitmoVivo, type EjeDatos } from '../GraficoRitmoVivo'
import { TiempoDelTurno } from '../MonitorShiftParts'
import type { MonitorV2Props } from '../MonitorV2'
import { aEstaHora, piezasMostradas } from '../aEstaHora'
import { armarTope, type EntradaRep } from '../reproduccionMinuto'
import type { RelojDeDatos } from '../useRelojDeDatos'

const INI = Date.UTC(2026, 9, 27, 21, 30)
const AHORA = 305
/** Cada Baader da `esperado − 2` por minuto, salvo el último minuto cerrado, que se fija por máquina. */
const serie = (base: number, ultimo: number) => Array.from({ length: AHORA }, (_, k) => (k === AHORA - 1 ? ultimo : base))

const maquinasSerie = [
  { id: 'a', nombre: 'Evisceradora 1', esperado: 19, cycles: serie(17, 18) },
  { id: 'b', nombre: 'Evisceradora 2', esperado: 16, cycles: serie(14, 10) },
  { id: 'c', nombre: 'Evisceradora 3', esperado: 16, cycles: serie(14, 16) },
]

const eje: EjeDatos = {
  iniMs: INI,
  finMs: INI + 450 * 60_000,
  minuto: { desde: new Date(INI).toISOString(), maquinas: maquinasSerie },
  primeraPiezaMs: null,
  detenidaEstado: false,
  paradas: [],
  llenado: null,
  unidad: 'carros',
}

const maquinas = [
  { name: 'Evisceradora 1', status: 'produciendo', desdeMin: null, ahora: 18, promedio: 16, razon: null, piezas: 3316, dispPct: 100 },
  { name: 'Evisceradora 2', status: 'produciendo', desdeMin: null, ahora: 10, promedio: 14, razon: null, piezas: 3077, dispPct: 100 },
  { name: 'Evisceradora 3', status: 'produciendo', desdeMin: null, ahora: 16, promedio: 14, razon: null, piezas: 3297, dispPct: 100 },
]

const base = {
  piezas: 9690,
  corteHora: '02:35',
  meta: 15000,
  proyeccion: 15623,
  cuota: { piezas: 10667, hora: '02:35' },
  cerrado: false,
  ritmo: 41,
  ritmoAhora: 44,
  ritmoMedia15: 44.8,
  ritmoPedido: 36.7,
  ritmoInfo: { recienteCpm: 27.6, recienteMin: 30, medianaCpm: null, mejorCpm: null, muestras: null, setPointFecha: null, setPointMetodo: null },
  mant: { fallas: 0, fallaMin: 0, mttr: null, mttrPrevio: null, dispPct: 100 },
  maquinas,
  eje,
  curva: {
    hoy: [{ minutes: 5, pieces: 100 }, { minutes: 300, pieces: 9690 }],
    previo: { label: 'lun 26', curve: [{ minutes: 5, pieces: 90 }, { minutes: AHORA, pieces: 9325 }, { minutes: 440, pieces: 14000 }] },
    objetivo: [{ minutes: 0, pieces: 0 }, { minutes: 450, pieces: 15000 }],
    maxMin: 450,
  },
}
const p = base as unknown as MonitorV2Props
const con = (extra: Record<string, unknown>) => ({ ...base, ...extra }) as unknown as MonitorV2Props

const reloj: RelojDeDatos = {
  cuadro: () => ({ valor: 9690, frac: 1, previa: null, ultima: { valor: 9690, atMs: INI + AHORA * 60_000 }, atrasada: false }),
  alCuadro: () => () => {},
  version: 1,
  detenida: false,
  reducido: false,
}

let ancho = 1366
beforeEach(() => {
  ancho = 1366
  window.matchMedia = ((q: string) => {
    const min = /min-width:\s*(\d+)px/.exec(q)
    return {
      matches: min ? ancho >= Number(min[1]) : false,
      media: q,
      addEventListener: () => {},
      removeEventListener: () => {},
      addListener: () => {},
      removeListener: () => {},
      onchange: null,
      dispatchEvent: () => false,
    }
  }) as unknown as typeof window.matchMedia
  Element.prototype.animate = (() => ({ cancel: () => {}, set onfinish(f: (() => void) | null) { if (f) setTimeout(f, 0) } })) as unknown as typeof Element.prototype.animate
  globalThis.ResizeObserver = class { observe() {} unobserve() {} disconnect() {} } as unknown as typeof ResizeObserver
  Object.defineProperty(HTMLElement.prototype, 'clientWidth', { configurable: true, get: () => 1806 })
  Object.defineProperty(HTMLElement.prototype, 'clientHeight', { configurable: true, get: () => 600 })
})
afterEach(() => {
  cleanup()
  document.body.innerHTML = ''
})

const franja = (props: MonitorV2Props = p, camino?: React.ReactNode) =>
  render(<FranjaCinta p={props} reloj={reloj} ampliadoPiezas={<div>detalle de piezas</div>} abrir={() => {}} camino={camino} />)

describe('FranjaCinta · las cinco celdas', () => {
  it('dice las cinco cosas en su orden y con su texto', () => {
    const { container } = franja()
    const t = container.textContent ?? ''
    const orden = ['Piezas del turno', 'Cada Baader', 'Ritmo de la línea', 'A esta hora', 'Al cierre', 'Mantención']
    let desde = 0
    for (const r of orden) {
      const i = t.indexOf(r, desde)
      expect(i, `«${r}» después de la posición ${desde}`).toBeGreaterThanOrEqual(0)
      desde = i
    }
    expect(t).toContain('Shoplogix 02:35')
    expect(t).toContain('64 % de 15.000')
    expect(t).toContain('la raya: 10.667 que tocaban a esta hora')
    expect(t).not.toMatch(/raya blanca/i)
  })

  it('«Piezas del turno»: la cifra viva, la barra con la raya de las que tocaban en 71 % de la meta', () => {
    const { container } = franja()
    expect(container.querySelector('.fc-cifra-p')?.textContent).toBe('9.690')
    const raya = container.querySelector('.fc-barra-raya') as HTMLElement
    expect(raya.style.left).toContain('71.1')
  })

  it('«Ritmo de la línea»: último minuto cerrado de su esperado y las tres varas en la misma base andando', () => {
    const { container } = franja()
    const t = container.textContent ?? ''
    /* 18 + 10 + 16 = 44 de 19 + 16 + 16 = 51. */
    expect(container.querySelector('.fc-cifra-c')?.textContent).toBe('44')
    expect(t).toContain('de 51 esperado · 86 %')
    expect(t).toContain('último minuto 02:34')
    expect(t).toContain('media 15 min 44,8 · promedio turno 41,0 · necesario 36,7')
    /* La cadencia de reloj de 30 min (27,6) ya no está en la vista. */
    expect(t).not.toContain('27,6')
    expect(t).not.toContain('media 30 min')
  })

  it('«Ritmo de la línea» sale UNA sola vez en toda la franja', () => {
    const { container } = franja()
    expect((container.textContent ?? '').split('Ritmo de la línea').length - 1).toBe(1)
  })

  it('«Cada Baader»: la palabra solo aparece si la Baader no anda, y «carros» dice qué se cuenta', () => {
    const { container } = franja(con({ maquinas: maquinas.map((m, i) => (i === 2 ? { ...m, status: 'detenida' } : m)) }))
    const filas = Array.from(container.querySelectorAll('.fc-baader')).map((li) => li.textContent ?? '')
    expect(filas).toHaveLength(3)
    /* Ev 1: 18 de 19 → andando, sin palabra. */
    expect(filas[0]).toContain('3.316')
    expect(filas[0]).toContain('18 de 19 pz/min')
    expect(filas[0]).not.toMatch(/andando|lenta|detenida/)
    /* Ev 2: 10 de 16 = 62 % → lenta (atento). */
    expect(filas[1]).toContain('10 de 16 pz/min')
    expect(filas[1]).toContain('lenta')
    /* Ev 3: parada ahora (pulso fresco) manda sobre lo que dijo su último minuto. */
    expect(filas[2]).toContain('detenida')
    expect(container.textContent).toContain('carros · pz/min vs esperado')
  })

  it('«Ritmo de la línea» con un minuto que solo una Baader entregó: vale el último minuto de TODAS, no la suma de una sola', () => {
    const [a, b, c] = maquinasSerie
    const aMedias = { ...eje, minuto: { desde: eje.minuto!.desde, maquinas: [{ ...a!, cycles: [...a!.cycles, 5] }, b!, c!] } }
    const { container } = franja(con({ eje: aMedias }))
    expect(container.querySelector('.fc-cifra-c')?.textContent).toBe('44')
    expect(container.textContent).toContain('de 51 esperado · 86 %')
    expect(container.textContent).toContain('último minuto 02:34')
  })

  it('la línea entera en cero sin parada registrada no pone «detenida» en cada Baader; con la parada registrada, sí', () => {
    const enCero = { ...eje, minuto: { desde: eje.minuto!.desde, maquinas: maquinasSerie.map((m) => ({ ...m, cycles: [...m.cycles.slice(0, -1), 0] })) } }
    const sin = franja(con({ eje: enCero }))
    for (const li of Array.from(sin.container.querySelectorAll('.fc-baader'))) expect(li.textContent).not.toMatch(/detenida|parcial|sin dato/)
    cleanup()
    const paradasMaquina = {
      stopEvents: [0, 1, 2].map((m) => ({ r: 0, f: new Date(INI + (AHORA - 1) * 60_000).toISOString(), s: 60, m })),
      stopReasons: ['Detencion'],
      stopMachines: ['a', 'b', 'c'],
      enCurso: [],
    }
    const con1 = franja(con({ eje: { ...enCero, paradasMaquina } }))
    for (const li of Array.from(con1.container.querySelectorAll('.fc-baader'))) expect(li.textContent).toContain('detenida')
  })

  it('cada fila lleva en su título el llenado normalizado en el que se basan su punto, su palabra y su barra', () => {
    const { container } = franja()
    /* Ev 1: 18 de 19 andando todo el minuto = 95 %. */
    expect(container.querySelectorAll('.fc-baader')[0]!.getAttribute('title')).toContain('95 % de lo que daba mientras anduvo')
  })

  it('«A esta hora» y «Al cierre»: −977 contra lo que tocaba y +623 contra la meta', () => {
    const { container } = franja()
    const t = container.textContent ?? ''
    expect(t).toContain('−977 pz')
    expect(t).toContain('hechas − las que tocaban')
    expect(t).toContain('+623 pz')
    expect(t).toContain('proyección 15.623 − meta')
  })

  it('Mantención: «0 fallas · disponibilidad 100,0 %»', () => {
    const { container } = franja()
    expect(container.querySelector('.fc-mant')?.textContent).toBe('Mantención0 fallas · disponibilidad 100,0 %')
  })

  it('con fallas dice los minutos por falla y cómo va contra los turnos previos', () => {
    const { container } = franja(con({ mant: { fallas: 2, fallaMin: 30, mttr: 15, mttrPrevio: 12, dispPct: 96 } }))
    expect(container.querySelector('.fc-mant')?.textContent).toContain('2 fallas · 15,0 min por falla · +3,0 vs previos')
  })

  it('línea detenida: «Al cierre» queda en pausa en vez de prometer una proyección', () => {
    const { container } = franja(con({ eje: { ...eje, detenidaEstado: true } }))
    const t = container.textContent ?? ''
    expect(t).toContain('en pausa')
    expect(t).toContain('línea detenida')
    expect(t).not.toContain('proyección 15.623')
  })

  it('turno cerrado: sin «A esta hora» ni «Al cierre», el resultado contra la meta', () => {
    const { container } = franja(con({ cerrado: true, piezas: 15400, proyeccion: null }))
    const t = container.textContent ?? ''
    expect(t).not.toContain('A esta hora')
    expect(t).not.toContain('Al cierre')
    expect(t).toContain('Resultado del turno')
    expect(t).toContain('+400 pz')
  })

  it('sin serie por minuto no inventa el último minuto: queda el «ahora» del pulso', () => {
    const { container } = franja(con({ eje: null }))
    expect(container.querySelector('.fc-cifra-c')?.textContent).toBe('44,0')
    expect(container.textContent).not.toContain('último minuto')
    expect(container.querySelectorAll('.fc-baader')).toHaveLength(3)
  })

  it('tocar «Piezas del turno» abre su detalle de siempre (la curva y la hora a hora)', () => {
    const { container, getByRole } = franja()
    expect(container.textContent).not.toContain('detalle de piezas')
    fireEvent.click(getByRole('button', { name: 'Piezas del turno: ver detalle' }))
    expect(document.body.textContent).toContain('detalle de piezas')
  })

  it('el celular apila: cada celda en su tarjeta y Camino a la meta a todo el ancho; el PC, una sola tarjeta', () => {
    const camino = <div>camino a la meta</div>
    const pc = franja(p, camino)
    expect(pc.container.querySelectorAll('.v2-tarjeta')).toHaveLength(1)
    expect(pc.container.querySelector('section.fc')?.getAttribute('data-celdas')).toBe('5')
    expect(pc.container.querySelector('.v2-camino')?.textContent).toBe('camino a la meta')
    cleanup()
    ancho = 375
    const movil = franja(p, camino)
    expect(movil.container.querySelectorAll('.v2-tarjeta')).toHaveLength(5)
    expect(movil.container.querySelector('.fc-apilada')).not.toBeNull()
    expect(movil.container.querySelector('.fc-c-camino')?.className).toContain('v2-camino')
  })

  it('sin Camino a la meta (sin desglose del tiempo) la franja queda en cuatro celdas', () => {
    const { container } = franja()
    expect(container.querySelector('section.fc')?.getAttribute('data-celdas')).toBe('4')
    expect(container.querySelector('.v2-camino')).toBeNull()
  })
})

describe('«A esta hora» es la misma cifra en la franja, el gráfico y Camino a la meta', () => {
  const tb: PublicMonitorLive['timeBreakdown'] = {
    windowMin: 450, producingMin: 340, plannedMin: 50, recoverableMin: 60,
    planned: [{ reason: 'COLACION', min: 50, count: 1, lineMin: 50 }],
    recoverable: [{ reason: 'Detencion', min: 60, count: 2, lineMin: 60 }],
  }
  const camino = (hechas: number) => render(
    <TiempoDelTurno
      tb={tb} cerrado={false} meta={15000} hechas={hechas} cuotaAhora={10667} horaAhora="02:35" cpmAndando={41}
      grupos={agruparEventos({ tb, cpmGlobal: 41 })} v2="ampliado"
    />,
  ).container.textContent ?? ''

  it('sin reproducción: contador − cuota = −977 en las tres', () => {
    const f = franja().container.textContent ?? ''
    const g = render(<GraficoRitmoVivo p={p} e={eje} reloj={reloj} />).container.textContent ?? ''
    const c = camino(piezasMostradas(null, 9690))
    expect(f).toContain('−977 pz')
    expect(g).toContain('a esta hora −977')
    expect(c).toMatch(/−977\s*pz/)
    expect(c).toMatch(/a esta hora/i)
  })

  it('con reproducción: la suma de los minutos cerrados (9.671) manda sobre el contador (9.690): −996 en las tres', () => {
    /* Σ cycles de cada Baader = 9.671; el contador de planta va 19 adelante por el minuto en curso. */
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
    const repro = { entrada, tope: armarTope(9690, null) }
    const conRepro = con({ repro })
    const mostradas = piezasMostradas(repro, 9690)
    expect(mostradas).toBe(9671)
    expect(aEstaHora(mostradas, 10667, 15000)).toBe(-996)
    const f = franja(conRepro).container.textContent ?? ''
    const g = render(<GraficoRitmoVivo p={conRepro} e={eje} reloj={reloj} />).container.textContent ?? ''
    const c = camino(mostradas)
    expect(f).toContain('−996 pz')
    expect(f).not.toContain('−977 pz')
    expect(g).toContain('a esta hora −996')
    expect(c).toMatch(/−996\s*pz/)
  })
})
