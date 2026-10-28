/**
 * La franja «cinta» de «El turno»: sus celdas en el mismo orden en PC y celular (Piezas · Ritmo · Contra la meta · Camino), y UNA
 * sola cifra de «A esta hora» en la franja, el gráfico y Camino a la meta. La tarjeta Ritmo (A3) y sus reglas de datos se prueban
 * en `RitmoBaaders.test.tsx` y `aporteBaaders.test.ts`. jsdom no mide ni dibuja: el ancho se simula y la geometría fina la prueba
 * `ejeTurno.test.ts` y el navegador. Sin `jest-dom`: se asierta sobre el texto renderizado.
 */
import { cleanup, fireEvent, render } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { agruparEventos } from '@/services/shoplogix/monitorEventos'
import type { PublicMonitorLive } from '@/services/shoplogix/publicShiftMonitor.service'
import { FranjaCinta, PiezasBaader } from '../FranjaCinta'
import { GraficoRitmoVivo, type EjeDatos } from '../GraficoRitmoVivo'
import { TiempoDelTurno } from '../MonitorShiftParts'
import type { MonitorV2Props } from '../MonitorV2'
import { aEstaHora, piezasMostradas } from '../aEstaHora'
import { armarTope, type EntradaRep } from '../reproduccionMinuto'
import type { CuadroReloj, RelojDeDatos } from '../useRelojDeDatos'

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

describe('FranjaCinta · las celdas', () => {
  it('dice las cosas en su orden y con su texto', () => {
    const { container } = franja()
    const t = container.textContent ?? ''
    const orden = ['Piezas del turno', 'Ritmo', 'Línea', 'A esta hora', 'Al cierre', 'Mantención']
    let desde = 0
    for (const r of orden) {
      const i = t.indexOf(r, desde)
      expect(i, `«${r}» después de la posición ${desde}`).toBeGreaterThanOrEqual(0)
      desde = i
    }
    /* La marca «Shoplogix HH:MM» va UNA vez en la barra del monitor, no en una celda: todas las cifras salen de la misma lectura. */
    expect(t).not.toContain('Shoplogix')
    expect(t).toContain('64 % de 15.000')
    expect(t).not.toMatch(/raya blanca|la raya:/i)
  })

  it('«Piezas del turno»: UNA nota en un renglón, «64 % de 15.000» y «▮ meta a esta hora 10.667» (la marca de 2×10 px es su leyenda)', () => {
    const { container } = franja()
    const nota = container.querySelector('.fc-nota-piezas')!
    /* «a esta hora» va en su propio span: el CSS lo muestra donde hay sitio (celdas apiladas y desde 1600 px); en 1280–1599 queda «meta 10.667». */
    expect(nota.textContent).toBe('64 % de 15.000meta a esta hora 10.667')
    expect(nota.querySelector('.fc-tocaban .fc-hora-larga')?.textContent).toBe(' a esta hora')
    expect(nota.textContent).not.toMatch(/tocaban/)
    expect(nota.querySelector('.fc-pct b')?.textContent).toBe('64 %')
    expect(nota.querySelector('.fc-tocaban .fc-raya-mini')).not.toBeNull()
    expect(container.querySelectorAll('.fc-nota-piezas')).toHaveLength(1)
  })

  it('«Piezas del turno» cerrado, o con la cuota ya en la meta: sin raya ni parte derecha', () => {
    const cerrada = franja(con({ cerrado: true, piezas: 15400, proyeccion: null })).container
    expect(cerrada.querySelector('.fc-nota-piezas')?.textContent).toBe('102 % de 15.000')
    expect(cerrada.querySelector('.fc-barra-raya')).toBeNull()
    expect(cerrada.querySelector('.fc-raya-mini')).toBeNull()
    cleanup()
    const alDia = franja(con({ cuota: { piezas: 15000, hora: '02:35' } })).container
    expect(alDia.querySelector('.fc-barra-raya')).toBeNull()
    expect(alDia.querySelector('.fc-tocaban')).toBeNull()
    expect(alDia.querySelector('.fc-nota-piezas')?.textContent).toBe('64 % de 15.000')
  })

  it('«Piezas del turno»: la cifra viva, la barra con la raya de las que tocaban en 71 % de la meta', () => {
    const { container } = franja()
    expect(container.querySelector('.fc-cifra-p')?.textContent).toBe('9.690')
    const raya = container.querySelector('.fc-barra-raya') as HTMLElement
    expect(raya.style.left).toContain('71.1')
  })

  it('«Ritmo»: la Línea con el último minuto cerrado de su esperado y sus referencias (15 min, necesario) en la misma base andando', () => {
    const { container } = franja()
    const t = container.textContent ?? ''
    /* 18 + 10 + 16 = 44 de 19 + 16 + 16 = 51. */
    expect(container.querySelector('.rb-big')?.textContent).toBe('44')
    expect(container.querySelector('.rb-big-u')?.textContent).toBe('de 51 pz/min')
    /* El grupo dice «Último minuto» con su hora (02:34), no «min 02:34». */
    expect(container.querySelector('.rb-g-min')?.textContent).toBe('Último minuto 02:34')
    expect(container.querySelector('.rb-h-min')?.textContent).toBe('carros con pieza')
    expect(container.querySelector('.rb-g-prom')?.textContent).toBe('Promedio del turno')
    const refs = Array.from(container.querySelectorAll('.rb-ref')).map((r) => r.textContent)
    expect(refs).toEqual(['15 min44,8', 'necesario36,7'])
    /* La cadencia de reloj de 30 min (27,6) y el «turno» suelto ya no están en la vista. */
    expect(t).not.toContain('27,6')
    expect(t).not.toContain('media 30 min')
  })

  it('«Ritmo» con el turno cerrado: la cifra es el promedio andando, sin columnas de minuto; compara con el mejor turno y lo normal si existen', () => {
    const cerrado = con({ cerrado: true, piezas: 15400, proyeccion: null, ritmo: 42.1, ritmoInfo: { ...base.ritmoInfo, mejorCpm: 47.3, medianaCpm: 40.2 } })
    const { container } = franja(cerrado)
    expect(container.querySelector('.rb')?.getAttribute('data-modo')).toBe('promedio')
    expect(container.querySelector('.rb-big')?.textContent).toBe('42,1')
    expect(container.querySelector('.rb-big-u')?.textContent).toBe('pz/min andando')
    expect((container.textContent ?? '').match(/42,1/g)).toHaveLength(1)
    expect(container.querySelector('.rb-g-min')).toBeNull()
    expect(container.querySelector('.rb-sep')).toBeNull()
    expect(container.querySelector('.rb-h-min')?.textContent).toBe('aporte al promedio')
    expect(Array.from(container.querySelectorAll('.rb-ref')).map((r) => r.textContent)).toEqual(['mejor turno47,3', 'normal40,2'])
    /* Cada Baader: su promedio andando, y punto gris (el turno ya cerró). */
    const ev = Array.from(container.querySelectorAll('.rb-f-ev'))
    expect(ev.map((f) => f.querySelector('.rb-min')?.textContent)).toEqual(['16,0pz/min', '14,0pz/min', '14,0pz/min'])
    for (const f of ev) expect((f.querySelector('.rb-punto') as HTMLElement).style.background).toBe('var(--v2-gris)')
    cleanup()
    /* Sin esos datos no inventa nada: ni referencias ni renglón vacío. */
    const sin = franja(con({ cerrado: true, piezas: 15400, proyeccion: null, ritmo: 42.1, ritmoInfo: { ...base.ritmoInfo, mejorCpm: null, medianaCpm: null } })).container
    expect(sin.querySelector('.rb-refs')).toBeNull()
  })

  it('«Ritmo» sale UNA sola vez en toda la franja, con su chevron', () => {
    const { container } = franja()
    expect(Array.from(container.querySelectorAll('.fc-rotulo')).filter((r) => r.textContent === 'Ritmo')).toHaveLength(1)
    expect(container.querySelector('.rb-rot .fc-chev')).not.toBeNull()
    expect(container.textContent).not.toContain('Ritmo de la línea')
    expect(container.textContent).not.toContain('Cada Baader')
  })

  it('cada Baader: la palabra solo aparece si no anda, el número de la detenida es su conteo (nunca «—») y «carros» dice qué se cuenta', () => {
    const { container } = franja(con({ maquinas: maquinas.map((m, i) => (i === 2 ? { ...m, status: 'detenida' } : m)) }))
    const filas = Array.from(container.querySelectorAll('.rb-f-ev')).map((li) => li.querySelector('.rb-min')?.textContent ?? '')
    expect(filas).toHaveLength(3)
    /* Ev 1: 18 de 19 → andando, sin palabra. */
    expect(filas[0]).toBe('18 de 19')
    /* Ev 2: 10 de 16 = 62 % → lenta (atento). */
    expect(filas[1]).toBe('10 de 16lenta')
    /* Ev 3: parada ahora (pulso fresco) manda sobre lo que dijo su último minuto. El hueco de la palabra lo reservan TODAS las filas. */
    expect(filas[2]).toBe('16 de 16detenida')
    expect(container.querySelectorAll('.rb-est')).toHaveLength(3)
    expect(container.querySelector('.rb-h-min')?.textContent).toBe('carros con pieza')
    /* Colores: lenta en el ámbar de texto, detenida en el rojo de texto con el número también en rojo. */
    const est = Array.from(container.querySelectorAll('.rb-est')) as HTMLElement[]
    expect(est[1]!.style.color).toBe('var(--v2-atento-texto)')
    expect(est[2]!.style.color).toBe('var(--v2-mal-texto)')
    expect((container.querySelectorAll('.rb-f-ev')[2]!.querySelector('.rb-min-t b') as HTMLElement).style.color).toBe('var(--v2-mal-texto)')
  })

  it('sin ninguna palabra ni «anduvo N s» no se reserva el hueco (las pistas ocupan el ancho)', () => {
    /* Las tres a ritmo (esperado − 1 en el último minuto, sin paradas): ninguna dice nada. */
    const aRitmo = { ...eje, minuto: { desde: eje.minuto!.desde, maquinas: maquinasSerie.map((m) => ({ ...m, cycles: serie(m.esperado - 1, m.esperado - 1) })) } }
    expect(franja(con({ eje: aRitmo })).container.querySelectorAll('.rb-est')).toHaveLength(0)
  })

  it('«Ritmo» con un minuto que solo una Baader entregó: vale el último minuto de TODAS, no la suma de una sola', () => {
    const [a, b, c] = maquinasSerie
    const aMedias = { ...eje, minuto: { desde: eje.minuto!.desde, maquinas: [{ ...a!, cycles: [...a!.cycles, 5] }, b!, c!] } }
    const { container } = franja(con({ eje: aMedias }))
    expect(container.querySelector('.rb-big')?.textContent).toBe('44')
    expect(container.querySelector('.rb-big-u')?.textContent).toBe('de 51 pz/min')
    expect(container.querySelector('.rb-g-min')?.textContent).toBe('Último minuto 02:34')
  })

  it('la línea entera en cero sin parada registrada no pone «detenida» en cada Baader; con la parada registrada, sí', () => {
    const enCero = { ...eje, minuto: { desde: eje.minuto!.desde, maquinas: maquinasSerie.map((m) => ({ ...m, cycles: [...m.cycles.slice(0, -1), 0] })) } }
    const sin = franja(con({ eje: enCero }))
    for (const li of Array.from(sin.container.querySelectorAll('.rb-f-ev'))) expect(li.textContent).not.toMatch(/detenida|parcial|sin dato/)
    cleanup()
    const paradasMaquina = {
      stopEvents: [0, 1, 2].map((m) => ({ r: 0, f: new Date(INI + (AHORA - 1) * 60_000).toISOString(), s: 60, m })),
      stopReasons: ['Detencion'],
      stopMachines: ['a', 'b', 'c'],
      enCurso: [],
    }
    const con1 = franja(con({ eje: { ...enCero, paradasMaquina } }))
    for (const li of Array.from(con1.container.querySelectorAll('.rb-f-ev'))) expect(li.textContent).toContain('detenida')
  })

  it('cada fila lleva en su título el llenado normalizado en el que se basan su punto, su palabra y su barra', () => {
    const { container } = franja()
    /* Ev 1: 18 de 19 andando todo el minuto = 95 %. */
    expect(container.querySelectorAll('.rb-f-ev')[0]!.getAttribute('title')).toContain('95 % de lo que daba mientras anduvo')
  })

  it('«A esta hora» y «Al cierre»: 977 atrás de la meta a esta hora y 623 adelante de la meta (cifra sin signo, la palabra en el hueco de la unidad)', () => {
    const { container } = franja()
    const t = container.textContent ?? ''
    expect(t).toContain('977 atrás')
    expect(t).toContain('hechas − meta')
    expect(t).not.toMatch(/tocaban|hechas − las que tocaban/)
    expect(t).toContain('623 adelante')
    expect(t).not.toMatch(/[+−]\s?(977|623)/)
    expect(t).toContain('proyección 15.623')
    expect(t).not.toContain('proyección 15.623 − meta')
    /* El número y la palabra: «977» en la cifra y «atrás» en el hueco de la unidad (<small>), con el color de siempre. */
    const celdaAHora = container.querySelector('.fc-meta-grid > div')!
    expect(celdaAHora.querySelector('.fc-cifra-dif')?.firstChild?.textContent).toBe('977')
    expect(celdaAHora.querySelector('.fc-cifra-dif small')?.textContent).toBe('atrás')
    expect((celdaAHora.querySelector('.fc-cifra-dif') as HTMLElement).style.color).toBe('var(--v2-mal-texto)')
  })

  it('con 0 de diferencia la cifra dice «al día» (a tamaño de cifra y sin unidad)', () => {
    const { container } = franja(con({ piezas: 10667, cuota: { piezas: 10667, hora: '02:35' } }))
    const celda = container.querySelector('.fc-meta-grid > div')!
    expect(celda.querySelector('.fc-cifra-dif')?.textContent).toBe('al día')
    expect(celda.querySelector('.fc-cifra-dif small')).toBeNull()
  })

  it('Contra la meta con dos cifras va en dos columnas; con UNA sola ocupa la celda entera (`fc-meta-uno`)', () => {
    expect(franja().container.querySelector('.fc-meta-grid')?.className).not.toContain('fc-meta-uno')
    cleanup()
    /* Cerrado: solo «Resultado del turno». */
    expect(franja(con({ cerrado: true, piezas: 15400, proyeccion: null })).container.querySelector('.fc-meta-grid')?.className).toContain('fc-meta-uno')
    cleanup()
    /* Sin cuota no hay «A esta hora»: queda «Al cierre» sola. */
    expect(franja(con({ cuota: null })).container.querySelector('.fc-meta-grid')?.className).toContain('fc-meta-uno')
  })

  it('una cifra de 5 dígitos (12.345 atrás) lo dice para que el CSS baje la palabra bajo el número (sin signo no se puede callar)', () => {
    const { container } = franja(con({ piezas: 0, cuota: { piezas: 12345, hora: '02:35' } }))
    expect(container.textContent).toContain('12.345 atrás')
    expect(container.querySelector('.fc-cifra-5')?.textContent).toContain('12.345')
    expect(container.querySelector('.fc-cifra-5.fc-cifra-dif small')?.textContent).toBe('atrás')
    cleanup()
    expect(franja().container.querySelector('.fc-cifra-5')).toBeNull()
  })

  it('Mantención en dos renglones: el rótulo con su chevron y debajo «0 fallas · disponibilidad 100,0 %»', () => {
    const { container } = franja()
    const mant = container.querySelector('.fc-mant')!
    expect(mant.textContent).toBe('Mantención0 fallas · disponibilidad 100,0 %')
    expect(mant.querySelector('.fc-mant-cab')?.textContent).toBe('Mantención')
    expect(mant.querySelector('.fc-mant-cab .fc-chev')).not.toBeNull()
    expect(mant.querySelector('.fc-nota-m')?.textContent).toBe('0 fallas · disponibilidad 100,0 %')
    expect(mant.querySelector('.fc-mant-n')?.textContent).toBe('0')
  })

  it('con fallas dice los minutos por falla y cómo va contra los turnos previos', () => {
    const { container } = franja(con({ mant: { fallas: 2, fallaMin: 30, mttr: 15, mttrPrevio: 12, dispPct: 96 } }))
    expect(container.querySelector('.fc-nota-m')?.textContent).toBe('2 fallas · 15,0 min por falla · +3,0 vs previos')
    expect(container.querySelector('.fc-nota-m')?.textContent).not.toContain('disponibilidad')
  })

  it('línea detenida: «Al cierre» queda en pausa en vez de prometer una proyección', () => {
    const { container } = franja(con({ eje: { ...eje, detenidaEstado: true } }))
    const t = container.textContent ?? ''
    expect(t).toContain('en pausa')
    expect(t).toContain('línea detenida')
    expect(t).not.toContain('proyección 15.623')
    /* «en pausa» va en la caja de la cifra grande (20/600): las bases de las dos columnas quedan alineadas. */
    expect(container.querySelector('.fc-cifra-m.fc-pausa')?.textContent).toBe('en pausa')
  })

  it('línea detenida: con banda de parada la nota dice solo «línea detenida»; sin banda, la causa va en un segundo renglón (sin elipsis ni título)', () => {
    const sinCausa = franja(con({ eje: { ...eje, detenidaEstado: true } }))
    expect(sinCausa.container.querySelector('.fc-nota-pausa')?.textContent).toBe('línea detenida')
    expect(sinCausa.container.querySelector('.fc-nota-causa')).toBeNull()
    cleanup()
    /* SIN banda: «línea detenida» y, debajo, la causa en su propio renglón (puede bajar de línea: nunca se corta con «…»). */
    const { container } = franja(con({ eje: { ...eje, detenidaEstado: true }, causaParada: 'Detención programada' }))
    expect(container.querySelector('.fc-nota-pausa')?.textContent).toBe('línea detenida')
    expect(container.querySelector('.fc-nota-causa')?.textContent).toBe('Detención programada')
    expect(container.querySelector('.fc-nota-pausa')?.getAttribute('title')).toBeNull()
    cleanup()
    /* CON banda de parada a la vista (ella ya dice la causa): solo «línea detenida», sin segundo renglón. */
    const conBanda = franja(con({ eje: { ...eje, detenidaEstado: true }, causaParada: 'Detención programada', conBanda: true })).container
    expect(conBanda.querySelector('.fc-nota-pausa')?.textContent).toBe('línea detenida')
    expect(conBanda.querySelector('.fc-nota-causa')).toBeNull()
    expect(conBanda.textContent).not.toContain('Detención programada')
    /* En marcha no hay nota de pausa, aunque llegue una causa vieja. */
    cleanup()
    expect(franja(con({ causaParada: 'Detención programada' })).container.querySelector('.fc-nota-pausa')).toBeNull()
    expect(franja(con({ causaParada: 'Detención programada' })).container.querySelector('.fc-nota-causa')).toBeNull()
  })

  it('turno cerrado: sin «A esta hora» ni «Al cierre», el resultado contra la meta', () => {
    const { container } = franja(con({ cerrado: true, piezas: 15400, proyeccion: null }))
    const t = container.textContent ?? ''
    expect(t).not.toContain('A esta hora')
    expect(t).not.toContain('Al cierre')
    expect(t).toContain('Resultado del turno')
    expect(t).toContain('400 adelante')
    expect(t).not.toContain('+400')
    /* «meta 15.000» no se parte entre renglones: lleva un espacio duro. */
    expect(t).toContain('15.400 hechas · meta\u00a015.000')
  })

  it('sin serie por minuto no inventa el último minuto: queda el «ahora» del pulso', () => {
    const { container } = franja(con({ eje: null }))
    /* Sin serie por minuto no hay columnas de minuto: la cifra es el promedio andando de la línea y cada Baader dice el suyo. */
    expect(container.querySelector('.rb')?.getAttribute('data-modo')).toBe('promedio')
    expect(container.querySelector('.rb-big')?.textContent).toBe('41,0')
    expect(container.textContent).not.toContain('Último minuto')
    expect(container.querySelectorAll('.rb-f-ev')).toHaveLength(3)
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
    expect(pc.container.querySelector('section.fc')?.getAttribute('data-celdas')).toBe('4')
    expect(pc.container.querySelector('.v2-camino')?.textContent).toBe('camino a la meta')
    cleanup()
    ancho = 375
    const movil = franja(p, camino)
    expect(movil.container.querySelectorAll('.v2-tarjeta')).toHaveLength(4)
    expect(movil.container.querySelector('.fc-apilada')).not.toBeNull()
    /* El orden de lectura es el de la pantalla: Piezas · Meta, luego Ritmo a todo el ancho y Camino. */
    expect(Array.from(movil.container.querySelectorAll('.fc-apilada > .fc-celda')).map((c) => c.className.split(' ').find((x) => x.startsWith('fc-c-')))).toEqual(['fc-c-piezas', 'fc-c-meta', 'fc-c-ritmo', 'fc-c-camino'])
    expect(movil.container.querySelector('.fc-c-camino')?.className).toContain('v2-camino')
  })

  it('sin Camino a la meta (sin desglose del tiempo) la franja queda en tres celdas', () => {
    const { container } = franja()
    expect(container.querySelector('section.fc')?.getAttribute('data-celdas')).toBe('3')
    expect(container.querySelector('.v2-camino')).toBeNull()
  })

  it('cada caso lleva su propio atributo (sin Camino, sin Baader) para que la grilla sepa cuál es', () => {
    const sinCamino = franja().container.querySelector('section.fc')!
    expect(sinCamino.getAttribute('data-sin-camino')).toBe('true')
    expect(sinCamino.hasAttribute('data-sin-baader')).toBe(false)
    cleanup()
    const completa = franja(p, <div>camino</div>).container.querySelector('section.fc')!
    expect(completa.hasAttribute('data-sin-camino')).toBe(false)
    expect(completa.hasAttribute('data-sin-baader')).toBe(false)
    cleanup()
    const [a] = maquinasSerie
    const unaSola = con({ maquinas: [maquinas[0]!], eje: { ...eje, minuto: { desde: eje.minuto!.desde, maquinas: [a!] } } })
    const sinBaader = franja(unaSola, <div>camino</div>).container.querySelector('section.fc')!
    expect(sinBaader.getAttribute('data-celdas')).toBe('4')
    expect(sinBaader.getAttribute('data-sin-baader')).toBe('true')
    expect(sinBaader.hasAttribute('data-sin-camino')).toBe(false)
  })

  it('una sola Baader (Filete): sin tabla (la línea sería ella misma); si no anda, su palabra va junto a la cifra de Ritmo', () => {
    const [a] = maquinasSerie
    /* 10 de 19 = 53 % → lenta. */
    const lenta = { ...a!, cycles: serie(17, 10) }
    const { container } = franja(con({ maquinas: [maquinas[0]!], eje: { ...eje, minuto: { desde: eje.minuto!.desde, maquinas: [lenta] } } }))
    expect(container.querySelector('.rb')).toBeNull()
    expect(container.textContent).not.toContain('Cada Baader')
    expect(container.textContent).not.toContain('carros')
    expect(container.querySelector('.fc-cifra-c')?.textContent).toBe('10')
    expect(container.querySelector('.fc-ritmo-fila')?.textContent).toContain('de 19 pz/min')
    expect(container.querySelector('.fc-ritmo-estado')?.textContent).toBe('lenta')
    cleanup()
    /* Andando a ritmo: ninguna palabra (solo lo que no anda se dice). */
    const ok = franja(con({ maquinas: [maquinas[0]!], eje: { ...eje, minuto: { desde: eje.minuto!.desde, maquinas: [a!] } } })).container
    expect(ok.querySelector('.fc-ritmo-estado')).toBeNull()
    cleanup()
    /* Parada ahora (pulso fresco): «detenida» manda. */
    const parada = franja(con({ maquinas: [{ ...maquinas[0]!, status: 'detenida' }], eje: { ...eje, minuto: { desde: eje.minuto!.desde, maquinas: [a!] } } })).container
    expect(parada.querySelector('.fc-ritmo-estado')?.textContent).toBe('detenida')
  })

  it('una sola señal de «esto se toca»: el chevron tras el rótulo de cada zona tocable, y todas abren un diálogo', () => {
    const { container, getAllByRole } = franja()
    /* Piezas, Ritmo, Al cierre y Mantención; «A esta hora» no abre nada. */
    expect(container.querySelectorAll('.fc-chev')).toHaveLength(4)
    for (const z of getAllByRole('button')) {
      expect(z.getAttribute('aria-haspopup')).toBe('dialog')
      expect(z.querySelector('.fc-chev')).not.toBeNull()
      expect(z.querySelector('.fc-chev')?.getAttribute('aria-hidden')).toBe('true')
    }
  })

  it('piezas de cada Baader: del contador vivo cuando suma lo mismo que la cifra grande (Σ Baader = Piezas del turno); si no, del doc del corte', () => {
    const entrada: EntradaRep = { desdeMs: INI, maquinas: [], paradas: {}, pulsoAtMs: null }
    /* PSM solo arma `porMaquina` si `totalCycles === contador` (la guarda): llega ya decidido en `repro.tope`. */
    const piezasDe = (c: HTMLElement) => Array.from(c.querySelectorAll('.rb-pz')).map((x) => x.textContent)
    const conGuarda = franja(con({ repro: { entrada, tope: armarTope(9690, { a: 3400, b: 3000, c: 3290 }) } })).container
    expect(piezasDe(conGuarda)).toEqual(['3.400', '3.000', '3.290'])
    expect(3400 + 3000 + 3290).toBe(9690)
    expect(conGuarda.querySelector('.fc-cifra-p')?.textContent).toBe('9.690')
    /* Cada número lleva su unidad: «3.400 pz», sin encabezado «piezas» colgando arriba. */
    expect(conGuarda.querySelector('.rb-pzc')?.textContent).toBe('3.400 pz')
    expect(conGuarda.textContent).not.toMatch(/\bpiezas\b/)
    cleanup()
    const sinGuarda = franja(con({ repro: { entrada, tope: armarTope(9690, null) } })).container
    expect(piezasDe(sinGuarda)).toEqual(['3.316', '3.077', '3.297'])
    cleanup()
    const sinRepro = franja().container
    expect(piezasDe(sinRepro)).toEqual(['3.316', '3.077', '3.297'])
  })

  it('cada Baader: el número y la barra son el conteo crudo del minuto; si anduvo menos de 55 s, la nota dice cuántos', () => {
    /* Ev 2 paró 25 s del último minuto cerrado: anduvo 35 s. 10 pz en 35 s dan 107 % de lo que daba andando (andando), pero el
       número «10 de 16» y la barra (62,5 %) siguen siendo lo que Shoplogix contó. */
    const paradasMaquina = {
      stopEvents: [{ r: 0, f: new Date(INI + (AHORA - 1) * 60_000).toISOString(), s: 25, m: 1 }],
      stopReasons: ['Detencion'],
      stopMachines: ['a', 'b', 'c'],
      enCurso: [],
    }
    const { container } = franja(con({ eje: { ...eje, paradasMaquina } }))
    const filas = Array.from(container.querySelectorAll('.rb-f-ev'))
    expect(filas[1]!.querySelector('.rb-anduvo')?.textContent).toBe('anduvo 35 s')
    expect(filas[1]!.querySelector('.rb-min-t')?.textContent).toBe('10 de 16')
    expect((filas[1]!.querySelector('.rb-pista > span') as HTMLElement).style.width).toBe('62.5%')
    /* Punto normalizado: a ritmo cuando anduvo, no «lenta» por el conteo crudo. */
    expect((filas[1]!.querySelector('.rb-punto') as HTMLElement).style.background).toBe('var(--v2-acento)')
    expect(filas[1]!.textContent).not.toMatch(/lenta|detenida/)
    /* Las que anduvieron el minuto entero no llevan nota, pero reservan el hueco (las pistas empiezan y terminan igual). */
    expect(filas[0]!.querySelector('.rb-anduvo')).toBeNull()
    expect(filas[2]!.querySelector('.rb-anduvo')).toBeNull()
    expect(container.querySelectorAll('.rb-est')).toHaveLength(3)
  })

  it('cada Baader sin paradas registradas, o parada el minuto entero, no inventa «anduvo N s»', () => {
    expect(franja().container.querySelector('.rb-anduvo')).toBeNull()
    cleanup()
    const todoElMinuto = {
      stopEvents: [{ r: 0, f: new Date(INI + (AHORA - 1) * 60_000).toISOString(), s: 60, m: 1 }],
      stopReasons: ['Detencion'],
      stopMachines: ['a', 'b', 'c'],
      enCurso: [],
    }
    expect(franja(con({ eje: { ...eje, paradasMaquina: todoElMinuto } })).container.querySelector('.rb-anduvo')).toBeNull()
  })
})

describe('Camino a la meta como celda: la leyenda ES los tramos de la barra, en piezas', () => {
  const tb: PublicMonitorLive['timeBreakdown'] = {
    windowMin: 450, producingMin: 340, plannedMin: 50, recoverableMin: 60,
    planned: [{ reason: 'COLACION', min: 50, count: 1, lineMin: 50 }],
    recoverable: [{ reason: 'Detencion', min: 60, count: 2, lineMin: 60 }],
  }
  const celda = (extra: { cerrado?: boolean; hechas: number; cpmAndando?: number | null }) => render(
    <TiempoDelTurno
      tb={tb} cerrado={extra.cerrado ?? false} meta={15000} hechas={extra.hechas} cuotaAhora={10667} horaAhora="02:35"
      cpmAndando={extra.cpmAndando === undefined ? 41 : extra.cpmAndando}
      grupos={agruparEventos({ tb, cpmGlobal: 41 })} v2="celda" ampliado={<div>detalle camino</div>}
    />,
  )
  const leyenda = (c: HTMLElement) => Array.from(c.querySelectorAll('.fc-camino-cifras > div')).map((d) => `${d.querySelector('dt')?.textContent} ${d.querySelector('dd')?.textContent}`)
  const anchos = (c: HTMLElement) => Array.from(c.querySelectorAll('.fc-camino-barra > span')).map((x) => parseFloat((x as HTMLElement).style.width))

  it('en vivo: Hechas · Paradas · Por ritmo · Por jugar, en piezas y en el orden de la barra; «Programado» (minutos) ya no está', () => {
    const { container } = celda({ hechas: 9690 })
    expect(leyenda(container)).toEqual(['Hechas 9.690 pz', 'Detenciones 2.460 pz', 'Por ritmo 0 pz', 'Por jugar 4.333 pz'])
    expect(container.textContent).not.toContain('Programado')
    expect(container.textContent).not.toMatch(/\d min\b/)
    /* La leyenda ES lo dibujado, con el número real de cada tramo: hechas · paradas (2.460, las reales, mayores que la brecha de 977) ·
       por jugar (sin «por ritmo»: es 0). La suma pasa la meta (16.483): la escala crece hasta ella y una raya marca la meta. */
    const a = anchos(container)
    expect(a).toHaveLength(3)
    expect(a[0]).toBeCloseTo((9690 / 16483) * 100, 1)
    expect(a[1]).toBeCloseTo((2460 / 16483) * 100, 1)
    expect(a[2]).toBeCloseTo((4333 / 16483) * 100, 1)
    expect(a.reduce((x, y) => x + y, 0)).toBeCloseTo(100, 1)
    expect(container.querySelector('.fc-camino-raya')).not.toBeNull()
    /* «Por jugar»: la reja con un borde de 1 px, en el tramo y en su punto (no un relleno que no se ve). */
    const tramos = Array.from(container.querySelectorAll('.fc-camino-barra > span')) as HTMLElement[]
    expect(tramos[2]!.style.background).toBe('var(--v2-reja)')
    expect(tramos[2]!.style.boxShadow).toContain('var(--v2-gris)')
    const puntos = Array.from(container.querySelectorAll('.fc-pto')) as HTMLElement[]
    expect(puntos[3]!.style.boxShadow).toContain('var(--v2-gris)')
    expect(puntos[0]!.style.boxShadow).toBe('')
  })

  it('en vivo «Por ritmo» es la cuota a esta hora − hechas − paradas, y las cuatro partes suman la meta', () => {
    /* 10 min de parada de línea = 410 pz a 41 pz/min; la brecha contra la cuota es 977. */
    const tb10: PublicMonitorLive['timeBreakdown'] = { ...tb, producingMin: 390, recoverableMin: 10, recoverable: [{ reason: 'Detencion', min: 10, count: 1, lineMin: 10 }] }
    const { container } = render(
      <TiempoDelTurno tb={tb10} cerrado={false} meta={15000} hechas={9690} cuotaAhora={10667} horaAhora="02:35" cpmAndando={41} grupos={agruparEventos({ tb: tb10, cpmGlobal: 41 })} v2="celda" ampliado={<div />} />,
    )
    expect(leyenda(container.parentElement!)).toEqual(['Hechas 9.690 pz', 'Detenciones 410 pz', 'Por ritmo 567 pz', 'Por jugar 4.333 pz'])
    expect(9690 + 410 + 567 + 4333).toBe(15000)
  })

  it('cerrado: Hechas · Paradas · Por ritmo (meta − hechas − paradas), sin «Por jugar»', () => {
    const { container } = celda({ cerrado: true, hechas: 12000 })
    expect(leyenda(container)).toEqual(['Hechas 12.000 pz', 'Detenciones 2.460 pz', 'Por ritmo 540 pz'])
    expect(anchos(container).reduce((x, y) => x + y, 0)).toBeCloseTo(100, 1)
    expect(container.querySelector('.fc-camino-raya')).toBeNull()
  })

  it('meta superada: la escala crece hasta hechas + paradas, el tramo rojo sigue a la vista y una raya marca la meta (también en el nombre accesible)', () => {
    const { container, getByRole } = celda({ cerrado: true, hechas: 15479 })
    expect(leyenda(container)).toEqual(['Hechas 15.479 pz', 'Detenciones 2.460 pz'])
    const a = anchos(container)
    expect(a).toHaveLength(2)
    expect(a[0]).toBeCloseTo((15479 / (15479 + 2460)) * 100, 1)
    expect(a[1]).toBeCloseTo((2460 / (15479 + 2460)) * 100, 1)
    const raya = container.querySelector('.fc-camino-raya') as HTMLElement
    /* 15.000 de 17.939 = 83,62 % del ancho, menos la parte de los 3 px de separación que le toca (3 × 0,836 + 1 de media raya). */
    expect(raya.style.left).toBe('calc(83.62% - 3.5px)')
    const nombre = getByRole('button', { name: /^Camino a la meta:/ }).getAttribute('aria-label') ?? ''
    expect(nombre).toContain('la raya marca la meta de 15.000 pz')
  })

  it('paradas mayores que la brecha (Ev 9.162 · 3.330 · 0 · 5.525): la leyenda ES los tramos dibujados con el número real, la escala crece hasta la suma (18.017) y la raya marca la meta', () => {
    /* 60 min de línea detenida × 55,5 pz/min = 3.330 pz de paradas reales; la cuota a esta hora es 9.475 (por jugar 15.000 − 9.475 = 5.525)
       y la brecha contra ella 313: las paradas explican más que la brecha, y el tramo ya no se topa a 313. */
    const { container, getByRole } = render(
      <TiempoDelTurno
        tb={tb} cerrado={false} meta={15000} hechas={9162} cuotaAhora={9475} horaAhora="02:35" cpmAndando={55.5}
        grupos={agruparEventos({ tb, cpmGlobal: 55.5 })} v2="celda" ampliado={<div />}
      />,
    )
    expect(leyenda(container)).toEqual(['Hechas 9.162 pz', 'Detenciones 3.330 pz', 'Por ritmo 0 pz', 'Por jugar 5.525 pz'])
    const suma = 9162 + 3330 + 0 + 5525
    expect(suma).toBe(18017)
    const a = anchos(container)
    /* «Por ritmo» es 0: no se dibuja; los otros tres miden su valor real sobre 18.017. */
    expect(a).toHaveLength(3)
    expect(a[0]).toBeCloseTo((9162 / suma) * 100, 1)
    expect(a[1]).toBeCloseTo((3330 / suma) * 100, 1)
    expect(a[2]).toBeCloseTo((5525 / suma) * 100, 1)
    expect(a.reduce((x, y) => x + y, 0)).toBeCloseTo(100, 1)
    /* La raya de 2 px en la meta: 15.000 de 18.017 = 83,25 % (menos los 3 px × 2 huecos × 0,8325 y la media raya). */
    const raya = container.querySelector('.fc-camino-raya') as HTMLElement
    expect(raya).not.toBeNull()
    expect(raya.style.left).toBe('calc(83.25% - 6.0px)')
    /* El nombre accesible lo dice: la raya, la meta y que los tramos suman más. */
    const nombre = getByRole('button', { name: /^Camino a la meta:/ }).getAttribute('aria-label') ?? ''
    expect(nombre).toContain('la raya marca la meta de 15.000 pz')
    expect(nombre).toContain('los tramos suman 18.017 pz')
  })

  it('si las paradas caben en la brecha las cuatro partes suman exactamente la meta: sin raya ni escala crecida', () => {
    const tb10: PublicMonitorLive['timeBreakdown'] = { ...tb, producingMin: 390, recoverableMin: 10, recoverable: [{ reason: 'Detencion', min: 10, count: 1, lineMin: 10 }] }
    const { container } = render(
      <TiempoDelTurno tb={tb10} cerrado={false} meta={15000} hechas={9690} cuotaAhora={10667} horaAhora="02:35" cpmAndando={41} grupos={agruparEventos({ tb: tb10, cpmGlobal: 41 })} v2="celda" ampliado={<div />} />,
    )
    expect(container.querySelector('.fc-camino-raya')).toBeNull()
    expect(anchos(container.parentElement!).reduce((x, y) => x + y, 0)).toBeCloseTo(100, 1)
    expect((9690 / 15000) * 100).toBeCloseTo(anchos(container.parentElement!)[0]!, 1)
  })

  it('sin la cuenta en piezas (sin ritmo andando) cae a los minutos, cada tramo con su cifra, y sin raya', () => {
    const { container } = celda({ hechas: 9690, cpmAndando: null })
    expect(leyenda(container)).toEqual(['Produciendo 5 h 40 min', 'Detenciones evitables 1 h', 'Programado 50 min'])
    expect(container.querySelector('.fc-camino-raya')).toBeNull()
  })

  it('la celda ENTERA es el botón: sin pastilla «Ampliar»/«Ver», con el chevron, aria-haspopup y el mismo ampliado de siempre', () => {
    const { container, getByRole } = celda({ hechas: 9690 })
    expect(container.querySelector('.v2-amp')).toBeNull()
    expect(container.textContent).not.toMatch(/Ampliar|\bVer\b/)
    const zona = getByRole('button', { name: /^Camino a la meta:/ })
    expect(zona.getAttribute('aria-haspopup')).toBe('dialog')
    expect(zona.getAttribute('aria-expanded')).toBe('false')
    expect(zona.querySelector('.fc-chev')).not.toBeNull()
    /* La barra, la leyenda y el rótulo están DENTRO de la zona tocable. */
    expect(zona.querySelector('.fc-camino-barra')).not.toBeNull()
    expect(zona.querySelector('.fc-camino-cifras')).not.toBeNull()
    expect(document.body.textContent).not.toContain('detalle camino')
    fireEvent.click(zona)
    expect(document.body.textContent).toContain('detalle camino')
    expect(zona.getAttribute('aria-expanded')).toBe('true')
  })

  it('la leyenda no se corta con «…»: sin `truncate` y con la unidad aparte', () => {
    const { container } = celda({ hechas: 9690 })
    expect(container.querySelector('.truncate')).toBeNull()
    expect(container.querySelector('.fc-camino-cifras dd small')?.textContent).toBe('pz')
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
    expect(f).toContain('977 atrás')
    expect(g).toContain('977 atrás')
    expect(c).toMatch(/977\s*atrás/)
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
    expect(f).toContain('996 atrás')
    expect(f).not.toContain('977 atrás')
    expect(g).toContain('996 atrás')
    expect(c).toMatch(/996\s*atrás/)
  })
})

describe('Piezas de cada Baader · siguen al mismo reloj que la cifra grande', () => {
  /** Un reloj que emite UN cuadro al suscribirse (como el real: `alCuadro` llama a `fn` con el cuadro de ahora). */
  const relojCon = (cuadro: Partial<CuadroReloj>): RelojDeDatos => ({
    cuadro: () => ({ valor: null, frac: 1, previa: null, ultima: null, atrasada: false, ...cuadro }),
    alCuadro: (fn) => { fn({ valor: null, frac: 1, previa: null, ultima: null, atrasada: false, ...cuadro }); return () => {} },
    version: 1, detenida: false, reducido: false,
  })

  it('con la reproducción activa dicen el valor de ESA Baader en el cuadro (su suma es la cifra de la línea), no el contador ya llegado', () => {
    const rep = {
      frac: 0.5, seg: 30, total: 1655, totalPiso: 1640, totalFinal: 1668, atrasada: false, animando: true,
      porMaquina: [
        { id: 'a', valor: 470, encendidas: 5, n: 9, estado: 'andando' as const },
        { id: 'b', valor: 520, encendidas: 4, n: 8, estado: 'andando' as const },
        { id: 'c', valor: 665, encendidas: 3, n: 9, estado: 'andando' as const },
      ],
    }
    const r = relojCon({ valor: 1655, rep })
    const { container } = render(<><PiezasBaader reloj={r} id="a" respaldo={474} /><PiezasBaader reloj={r} id="b" respaldo={528} /><PiezasBaader reloj={r} id="c" respaldo={666} /></>)
    const v = [...container.querySelectorAll('span')].map((x) => Number((x.textContent ?? '').replace(/\./g, '')))
    expect(v).toEqual([470, 520, 665])
    expect(v.reduce((a, b) => a + b, 0)).toBe(1655)
  })

  it('sin reproducción (turno cerrado, sin serie por minuto) dicen su cifra de siempre', () => {
    const { container } = render(<PiezasBaader reloj={relojCon({ valor: 5384 })} id="a" respaldo={5384} className="rb-pz" />)
    expect(container.textContent).toBe('5.384')
    expect(container.querySelector('.rb-pz')).not.toBeNull()
  })

  it('una Baader que la reproducción no trae (id distinto) se queda con su respaldo', () => {
    const rep = { frac: 1, seg: 60, total: 10, totalPiso: 10, totalFinal: 10, atrasada: false, animando: false, porMaquina: [{ id: 'z', valor: 10, encendidas: 0, n: 0, estado: 'andando' as const }] }
    const { container } = render(<PiezasBaader reloj={relojCon({ valor: 10, rep })} id="a" respaldo={1234} />)
    expect(container.textContent).toBe('1.234')
  })
})
