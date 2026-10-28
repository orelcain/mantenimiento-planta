/**
 * La tarjeta «Ritmo» (A3 «sub-tarjeta») y su detalle: lo que dice la tabla, cuándo calla una comparación y que cada columna suma la
 * Línea a la vista. La geometría (alineación al píxel, «Línea» en la base de la cifra, nada colado al borde derecho) la mide
 * Playwright sobre el monitor vivo; aquí solo se guardan las condiciones de estructura y de CSS que la hacen posible.
 */
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { cleanup, fireEvent, render } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import type { RitmoDeMaquina, RitmosPorMaquina } from '@/services/shoplogix/ritmoPorMaquina'
import type { ReferenciaAporte } from '../aporteHistorico'
import { armarAporte } from '../aporteBaaders'
import { FranjaCinta } from '../FranjaCinta'
import type { EjeDatos } from '../GraficoRitmoVivo'
import { MonitorV2, type MonitorV2Props } from '../MonitorV2'
import type { RelojDeDatos } from '../useRelojDeDatos'

const INI = Date.UTC(2026, 9, 27, 21, 30)
const AHORA = 305
const serie = (base: number, ultimo: number) => Array.from({ length: AHORA }, (_, k) => (k === AHORA - 1 ? ultimo : base))

const eje: EjeDatos = {
  iniMs: INI,
  finMs: INI + 450 * 60_000,
  minuto: {
    desde: new Date(INI).toISOString(),
    maquinas: [
      { id: 'a', nombre: 'Evisceradora 1', esperado: 19, cycles: serie(17, 19) },
      { id: 'b', nombre: 'Evisceradora 2', esperado: 16, cycles: serie(14, 16) },
      { id: 'c', nombre: 'Evisceradora 3', esperado: 16, cycles: serie(14, 15) },
    ],
  },
  primeraPiezaMs: null,
  detenidaEstado: false,
  paradas: [],
  llenado: null,
  unidad: 'carros',
}

const maquinas = [
  { name: 'Evisceradora 1', status: 'produciendo', desdeMin: null, ahora: 19, promedio: 15.2, razon: null, piezas: 2246, dispPct: 82 },
  { name: 'Evisceradora 2', status: 'produciendo', desdeMin: null, ahora: 16, promedio: 12.6, razon: null, piezas: 1893, dispPct: 83 },
  { name: 'Evisceradora 3', status: 'produciendo', desdeMin: null, ahora: 15, promedio: 13.8, razon: null, piezas: 2242, dispPct: 91 },
]

/** Lo que `ritmoPorMaquina` + `conRepartoPorMaquina` dejan: aportes 13,46 / 11,38 / 13,47 (suma 38,31). */
const rpm = (extra: Partial<RitmoDeMaquina> = {}): RitmosPorMaquina => ({
  maquinas: [
    { nombre: 'Evisceradora 1', cpm: 15.2, piezas: 2246, detenida: false, uptimePct: 82, aporteCpm: 13.46, pulsoCpm: 19, ahoraCpm: 18, ...extra },
    { nombre: 'Evisceradora 2', cpm: 12.6, piezas: 1893, detenida: false, uptimePct: 83, aporteCpm: 11.38, pulsoCpm: 16, ahoraCpm: 15, ...extra },
    { nombre: 'Evisceradora 3', cpm: 13.8, piezas: 2242, detenida: false, uptimePct: 91, aporteCpm: 13.47, pulsoCpm: 15, ahoraCpm: 14, ...extra },
  ],
  promedio: 13.8,
  parejas: false,
})
const ref = (turnos: number, ...v: number[]): ReferenciaAporte => ({
  porMaquina: new Map([['Evisceradora 1', v[0]!], ['Evisceradora 2', v[1]!], ['Evisceradora 3', v[2]!]]),
  turnos,
  desde: '2026-10-26',
})
/** Referencias que dejan ▲ 1,0 y ▼ 0,7 y «— 0,2» en las tres Baader: 13,46 − 12,46 = 1,0; 11,38 − 12,08 = −0,7; 13,47 − 13,27 = 0,2. */
const refUlt = ref(1, 12.46, 12.08, 13.27)
const refProm = ref(5, 12.76, 11.1, 12.77)

const aporteCon = (extra: Record<string, unknown> = {}) => armarAporte({
  maquinas: rpm(), producingMin: 300, promedioLinea: 38.31, parada: false, cerrado: false, pulsoFresco: true, refUltimo: refUlt, refProm, ...extra,
} as Parameters<typeof armarAporte>[0])

const base = {
  piezas: 9690,
  corteHora: '02:35',
  meta: 15000,
  proyeccion: 15623,
  cuota: { piezas: 10667, hora: '02:35' },
  cerrado: false,
  ritmo: 38.31,
  ritmoAhora: 50,
  ritmoNecesario: 39.8,
  ritmoMedia15: 41.3,
  ritmoPedido: 39.8,
  setPoint: null,
  vsAyer: null,
  eventos: [],
  rielMttr: [],
  perdidas: [],
  causas: [],
  programadas: [],
  ritmoInfo: { recienteCpm: 27.6, recienteMin: 30, medianaCpm: 32.5, mejorCpm: 37, muestras: 8, setPointFecha: null, setPointMetodo: null },
  mantPorMaquina: [],
  mas: { cascada: null, cascadaDetalle: null, tiempo: null, comparado: [] },
  mant: { fallas: 0, fallaMin: 0, mttr: null, mttrPrevio: null, dispPct: 100 },
  maquinas,
  eje,
  curva: null,
  inicioMs: INI,
  cierre: null,
  vista: 0,
  onVista: () => {},
  aporte: aporteCon(),
  ritmoPulso: <p>pulso: actualizar ahora</p>,
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
    return { matches: min ? ancho >= Number(min[1]) : false, media: q, addEventListener: () => {}, removeEventListener: () => {}, addListener: () => {}, removeListener: () => {}, onchange: null, dispatchEvent: () => false }
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

const franja = (props: MonitorV2Props = p) => render(<FranjaCinta p={props} reloj={reloj} ampliadoPiezas={<div />} abrir={() => {}} />).container
const t = (el: Element | null | undefined) => el?.textContent ?? ''
const num = (s: string) => Number(s.replace(',', '.'))

describe('tarjeta Ritmo · lo que dice la tabla', () => {
  it('encabezados de grupo y de columna, y la Línea primero con su aporte y sus comparaciones', () => {
    const c = franja()
    expect(t(c.querySelector('.rb-rot'))).toBe('Ritmo')
    expect(t(c.querySelector('.rb-g-min'))).toBe('Último minuto 02:34')
    expect(t(c.querySelector('.rb-g-prom'))).toBe('Promedio del turno')
    expect(Array.from(c.querySelectorAll('.rb-f-cols .rb-h')).map(t)).toEqual(['carros con pieza', 'aporte', 'vs último', 'vs prom. 5'])
    /* La Línea es la primera fila de datos: 19 + 16 + 15 = 50 de 51, aporte 38,3 y las comparaciones de la Línea. */
    const linea = c.querySelector('.rb-f-linea')!
    expect(t(linea.querySelector('.rb-n-linea'))).toBe('Línea')
    expect(t(linea.querySelector('.rb-big'))).toBe('50')
    expect(t(linea.querySelector('.rb-big-u'))).toBe('de 51 pz/min')
    expect(t(linea.querySelector('.rb-ap-l'))).toBe('38,3')
    expect(c.querySelector('.rb-f-linea')!.compareDocumentPosition(c.querySelector('.rb-f-ev')!) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy()
    /* Línea: 38,31 − (12,46 + 12,08 + 13,27 = 37,81) = ▲ 0,5 contra el último; 38,31 − (12,76 + 11,10 + 12,77 = 36,63) = ▲ 1,7 contra el promedio. */
    expect(Array.from(linea.querySelectorAll('.rb-vs')).map(t)).toEqual(['▲ 0,5', '▲ 1,7'])
  })

  it('la columna de aporte suma la Línea a la vista (13,4 + 11,4 + 13,5 = 38,3), sin el 38,4 que da redondear cada una', () => {
    const c = franja()
    const aportes = Array.from(c.querySelectorAll('.rb-f-ev .rb-ap')).map((x) => num(t(x)))
    expect(aportes).toEqual([13.4, 11.4, 13.5])
    expect(Math.round(aportes.reduce((a, b) => a + b * 10, 0)) / 10).toBe(num(t(c.querySelector('.rb-ap-l'))))
  })

  it('▲ en el acento, ▼ en el rojo de texto y bajo 0,3 «— 0,2» en raya; texto sin cápsula', () => {
    const c = franja()
    const filas = Array.from(c.querySelectorAll('.rb-f-ev'))
    const vs = filas.map((f) => Array.from(f.querySelectorAll('.rb-d')).map((d) => ({ texto: t(d), clase: d.className })))
    /* Ev 1: 13,46 − 12,46 = ▲ 1,0 y − 12,76 = ▲ 0,7. Ev 2: 11,38 − 12,08 = ▼ 0,7 y − 11,10 = — 0,3. Ev 3: 13,47 − 13,27 = — 0,2 y − 12,77 = ▲ 0,7. */
    expect(vs.map((f) => f.map((x) => x.texto))).toEqual([['▲ 1,0', '▲ 0,7'], ['▼ 0,7', '— 0,3'], ['— 0,2', '▲ 0,7']])
    expect(vs[0]![0]!.clase).toContain('rb-d-sube')
    expect(vs[1]![0]!.clase).toContain('rb-d-baja')
    expect(vs[2]![0]!.clase).toContain('rb-d-raya')
    expect(c.querySelector('.rb .rb-pil')).toBeNull()
  })

  it('antes de 45 min produciendo: UNA columna «vs turnos previos», con la nota en la Línea y las Baader en blanco', () => {
    const c = franja(con({ aporte: aporteCon({ producingMin: 30 }) }))
    expect(c.querySelector('.rb')?.getAttribute('data-vs')).toBe('previos')
    expect(Array.from(c.querySelectorAll('.rb-f-cols .rb-h')).map(t)).toEqual(['carros con pieza', 'aporte', 'vs turnos previos'])
    expect(t(c.querySelector('.rb-f-linea .rb-nota'))).toBe('desde los 45 minproduciendo')
    expect(c.querySelectorAll('.rb-f-ev .rb-d')).toHaveLength(0)
  })

  it('con muestra de 1 turno, solo «vs último»', () => {
    const c = franja(con({ aporte: aporteCon({ refProm: ref(1, 12.76, 11.1, 12.77) }) }))
    expect(c.querySelector('.rb')?.getAttribute('data-vs')).toBe('ultimo')
    expect(Array.from(c.querySelectorAll('.rb-f-cols .rb-h')).map(t)).toEqual(['carros con pieza', 'aporte', 'vs último'])
    expect(c.querySelectorAll('.rb-f-ev')[0]!.querySelectorAll('.rb-d')).toHaveLength(1)
  })

  it('sin referencias no hay columnas de comparación', () => {
    const c = franja(con({ aporte: aporteCon({ refUltimo: null, refProm: null }) }))
    expect(c.querySelector('.rb')?.getAttribute('data-vs')).toBe('ninguno')
    expect(Array.from(c.querySelectorAll('.rb-f-cols .rb-h')).map(t)).toEqual(['carros con pieza', 'aporte'])
  })

  it('una Baader sin referencia propia lleva un punto, no una raya inventada, y mantiene la columna', () => {
    const sinEv3 = { ...refUlt, porMaquina: new Map([['Evisceradora 1', 12.46], ['Evisceradora 2', 12.08]]) }
    const c = franja(con({ aporte: aporteCon({ refUltimo: sinEv3 }) }))
    const ev3 = c.querySelectorAll('.rb-f-ev')[2]!
    expect(ev3.querySelector('.rb-d-vacio')).not.toBeNull()
    expect(ev3.querySelector('[data-col="vu"]')).not.toBeNull()
    expect(t(c.querySelector('.rb-f-linea [data-col="vu"]'))).toBe('·')
  })

  it('turno cerrado: la flexible es el aporte («13,4 pz/min»), cada Baader con punto gris, y siguen las comparaciones', () => {
    const c = franja(con({ cerrado: true, proyeccion: null, ritmo: 38.31, aporte: aporteCon({ cerrado: true }) }))
    expect(c.querySelector('.rb')?.getAttribute('data-modo')).toBe('promedio')
    expect(t(c.querySelector('.rb-big'))).toBe('38,3')
    expect(t(c.querySelector('.rb-big-u'))).toBe('pz/min andando')
    expect(Array.from(c.querySelectorAll('.rb-f-ev .rb-min')).map(t)).toEqual(['13,4pz/min', '11,4pz/min', '13,5pz/min'])
    expect(c.querySelector('.rb-g-min')).toBeNull()
    expect(Array.from(c.querySelectorAll('.rb-f-cols .rb-h')).map(t)).toEqual(['aporte al promedio', 'vs último', 'vs prom. 5'])
  })
})

describe('tarjeta Ritmo · los tres arreglos de Orel (estructura y CSS; la geometría la mide Playwright)', () => {
  const css = readFileSync(resolve(process.cwd(), 'src/pages/monitor/monitorGlass.css'), 'utf8')
  const regla = (sel: string) => {
    const i = css.indexOf(`\n${sel} {`)
    expect(i, `regla «${sel}»`).toBeGreaterThanOrEqual(0)
    return css.slice(i, css.indexOf('}', i))
  }

  it('2 · «Línea» comparte fila con la cifra grande y su aporte, y la fila alinea por línea base', () => {
    const c = franja()
    const fila = c.querySelector('.rb-f-linea')!
    expect(fila.contains(c.querySelector('.rb-n-linea'))).toBe(true)
    expect(fila.contains(c.querySelector('.rb-big'))).toBe(true)
    expect(fila.contains(c.querySelector('.rb-ap-l'))).toBe(true)
    /* El rótulo es texto puro (un punto vacío, aunque sea invisible, lo bajaría de la base: pasó en el mockup). */
    expect(c.querySelector('.rb-n-linea')!.children).toHaveLength(0)
    expect(t(c.querySelector('.rb-n-linea'))).toBe('Línea')
    expect(regla('.rb-f')).toContain('align-items: baseline')
    /* Mismo hueco del punto que las Ev (8 + 6 px) a la izquierda. */
    expect(regla('.rb-n')).toContain('padding-left: 14px')
    expect(c.querySelector('.rb-f-ev .rb-n i.rb-punto')).not.toBeNull()
  })

  it('3 · no hay encabezado «piezas» colgando: el número lleva su unidad («2.246 pz»)', () => {
    const c = franja()
    expect(Array.from(c.querySelectorAll('.rb-h')).map(t)).not.toContain('piezas')
    expect(Array.from(c.querySelectorAll('.rb-f-ev .rb-pzc')).map(t)).toEqual(['2.246 pz', '1.893 pz', '2.242 pz'])
  })

  it('1 · nada se cuela al borde: la última columna tiene su hueco y la sub-tarjeta 20 px hasta la celda siguiente', () => {
    /* La sub-tarjeta se sale 12 px de su celda por lado: con 32 px de hueco quedan 20 hasta «A esta hora» (44 desde 1600 px). */
    expect(css).toMatch(/@media \(min-width: 1280px\) \{\s*\.fc \{ grid-template-columns: 1fr 2\.5fr 1\.18fr 1fr; column-gap: 32px;/)
    expect(css).toMatch(/@media \(min-width: 1600px\) \{ \.fc \{ column-gap: 44px;/)
    expect(css).toMatch(/\.fc:not\(\[data-sin-baader\]\) > \.fc-c-ritmo \{[^}]*margin: -8px -12px; padding: 8px 12px; border-radius: 22px; background: rgb\(142 142 147 \/ 0\.08\)/)
    /* La grilla no deja que una columna se salga: la flexible encoge (minmax(0, 1fr)) y las demás miden su contenido. */
    expect(css).toContain('--rb-min: [min] minmax(0, 1fr);')
    expect(css).toContain('--rb-vs: [vu] max-content [v5] max-content [fin];')
    /* Bajo 470 px de contenedor sin piezas; bajo 430 la palabra baja de renglón en vez de pisar el aporte. */
    expect(css).toContain('@container rb (max-width: 469px)')
    expect(css).toContain('@container rb (max-width: 429px)')
  })
})

describe('detalle de Ritmo', () => {
  const abrir = (props: MonitorV2Props) => {
    const r = render(<MonitorV2 {...props} />)
    fireEvent.click(r.getByRole('button', { name: 'Ritmo: ver detalle' }))
    return r.getByRole('dialog')
  }

  it('la tabla con «ahora», la Línea primero, el % del turno andando por Baader y el pulso tal cual', () => {
    const d = abrir(p)
    expect(Array.from(d.querySelectorAll('.rb-dt .rb-f-cols .rb-h')).map(t)).toEqual(['', 'piezas', 'carros con pieza', 'ahora', 'aporte', 'vs último', 'vs prom. 5'])
    const filas = Array.from(d.querySelectorAll('.rb-dt .rb-f-linea-d, .rb-dt .rb-f-ev-d')).map((f) => t(f))
    expect(filas[0]).toContain('Línea')
    expect(filas[0]).toContain('50de 51')
    expect(filas[0]).toContain('50,0')
    expect(filas[0]).toContain('38,3')
    expect(filas).toHaveLength(4)
    expect(t(d.querySelector('.rb-bloque .rb-sub'))).toContain('andando 82 % del turno, a 15,2 pz/min')
    expect(d.textContent).toContain('pulso: actualizar ahora')
    expect(d.textContent).toContain('Referencias de la línea')
    expect(d.textContent).toContain('Media 15 min (andando)')
    expect(d.textContent).toContain('Lo normal de esta línea')
    expect(d.textContent).toContain('Mejor turno')
  })

  it('«Carros del turno, por Baader»: pasaron · con pieza · vacíos · % con pieza, la Línea es la suma y se dice que es una estimación', () => {
    const d = abrir(p)
    const sec = d.querySelector('.rb-vac')!
    expect(t(sec.querySelector('.rb-tit'))).toBe('Carros del turno, por Baader')
    expect(t(sec)).toContain('Estimación según la velocidad seteada y el tiempo andando')
    expect(Array.from(sec.querySelectorAll('.rb-cf-cab .rb-h')).map(t)).toEqual(['', 'pasaron', 'con pieza', 'vacíos', '% con pieza'])
    const filas = Array.from(sec.querySelectorAll('.rb-cf:not(.rb-cf-cab)')).map((f) => Array.from(f.querySelectorAll('.rb-cv')).map((x) => num(t(x).replace(/\./g, '').replace(' %', ''))))
    const [linea, ...evs] = filas
    expect(evs).toHaveLength(3)
    for (let col = 0; col < 3; col++) expect(linea![col]).toBe(evs.reduce((a, f) => a + f[col]!, 0))
    /* pasaron − con pieza = vacíos, fila por fila (nadie pasó con menos de lo que contó en esta fixture). */
    for (const f of filas) expect(f[0]! - f[1]!).toBe(f[2])
    expect(t(sec.querySelector('.rb-pie'))).toContain('no una falla de la máquina')
  })

  it('turno cerrado: sin columna «ahora» ni comparaciones inventadas; el pulso lo trae el padre (cerrado no lo dibuja)', () => {
    const d = abrir(con({ cerrado: true, proyeccion: null, ritmoAhora: null, aporte: aporteCon({ cerrado: true }) }))
    expect(Array.from(d.querySelectorAll('.rb-dt .rb-f-cols .rb-h')).map(t)).toEqual(['', 'piezas', 'aporte al promedio', 'vs último', 'vs prom. 5'])
    expect(d.textContent).not.toContain('Media 15 min')
    expect(d.querySelector('.rb-det')?.getAttribute('data-ahora')).toBe('no')
  })

  it('con la línea detenida la columna «ahora» dice 0,0 (si es cero que salga cero), no un hueco', () => {
    const d = abrir(con({ aporte: aporteCon({ parada: true }) }))
    const ahora = Array.from(d.querySelectorAll('.rb-dt [data-col="ahora"]')).map(t).filter((x) => x !== 'ahora' && x !== '')
    expect(ahora).toEqual(['0,0', '0,0', '0,0', '0,0'])
  })

  it('con UNA sola Baader (Filete) no hay filas de Baader ni Línea duplicada: una fila con su % andando', () => {
    const una = rpm()
    const unaSola = { maquinas: [una.maquinas[0]!], promedio: 15.2, parejas: false }
    const [a] = eje.minuto!.maquinas
    const d = abrir(con({
      maquinas: [maquinas[0]!],
      eje: { ...eje, minuto: { desde: eje.minuto!.desde, maquinas: [a!] } },
      aporte: armarAporte({ maquinas: unaSola, producingMin: 300, promedioLinea: 13.46, parada: false, cerrado: false, pulsoFresco: true, refUltimo: null, refProm: null }),
    }))
    expect(d.querySelectorAll('.rb-f-ev-d')).toHaveLength(0)
    expect(d.querySelectorAll('.rb-f-linea-d')).toHaveLength(1)
    expect(t(d.querySelector('.rb-f-linea-d'))).toContain('Ev 1')
    expect(t(d.querySelector('.rb-sub'))).toContain('andando 82 % del turno')
    expect(Array.from(d.querySelectorAll('.rb-dt .rb-f-cols .rb-h')).map(t)).not.toContain('piezas')
  })
})
