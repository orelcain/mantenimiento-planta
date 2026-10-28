/**
 * La franja «cinta» de «El turno»: cinco celdas en el mismo orden en PC y celular, y UNA sola cifra de «A esta hora» en
 * la franja, el gráfico y Camino a la meta. jsdom no mide ni dibuja: el ancho se simula y la geometría fina la prueba
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
    /* La marca «Shoplogix HH:MM» va UNA vez en la barra del monitor, no en una celda: todas las cifras salen de la misma lectura. */
    expect(t).not.toContain('Shoplogix')
    expect(t).toContain('64 % de 15.000')
    expect(t).not.toMatch(/raya blanca|la raya:/i)
  })

  it('«Piezas del turno»: UNA nota en un renglón, «64 % de 15.000» y «▮ tocaban 10.667» (la marca de 2×10 px es su leyenda)', () => {
    const { container } = franja()
    const nota = container.querySelector('.fc-nota-piezas')!
    expect(nota.textContent).toBe('64 % de 15.000tocaban 10.667')
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

  it('«Ritmo de la línea»: último minuto cerrado de su esperado y las tres varas en la misma base andando', () => {
    const { container } = franja()
    const t = container.textContent ?? ''
    /* 18 + 10 + 16 = 44 de 19 + 16 + 16 = 51. */
    expect(container.querySelector('.fc-cifra-c')?.textContent).toBe('44')
    /* «de 51 pz/min» va en la fila de la cifra; la nota «de 51 esperado · 86 %» salió (la barra fina y su color lo dicen). */
    expect(container.querySelector('.fc-ritmo-fila .fc-u')?.textContent).toBe('de 51 pz/min')
    expect(t).not.toContain('esperado · 86 %')
    /* La nota de la cabecera es corta: «min 02:34», no «último minuto 02:34». */
    expect(container.querySelector('.fc-c-ritmo .fc-cab .fc-nota-der')?.textContent).toBe('min 02:34')
    expect(t).not.toContain('último minuto')
    /* Las tres referencias, en un dl de tres columnas (clave 12 px, valor 15/600), con los mismos datos de siempre. */
    const refs = Array.from(container.querySelectorAll('.fc-ritmo-refs > div')).map((d) => `${d.querySelector('dt')?.textContent} ${d.querySelector('dd')?.textContent}`)
    expect(refs).toEqual(['15 min 44,8', 'turno 41,0', 'necesario 36,7'])
    /* La cadencia de reloj de 30 min (27,6) ya no está en la vista. */
    expect(t).not.toContain('27,6')
    expect(t).not.toContain('media 30 min')
  })

  it('«Ritmo de la línea» con el turno cerrado: no repite la cifra grande; compara con el mejor turno y lo normal si existen', () => {
    const cerrado = con({ cerrado: true, piezas: 15400, proyeccion: null, ritmo: 42.1, ritmoInfo: { ...base.ritmoInfo, mejorCpm: 47.3, medianaCpm: 40.2 } })
    const { container } = franja(cerrado)
    expect(container.querySelector('.fc-cifra-c')?.textContent).toBe('42,1')
    expect((container.textContent ?? '').match(/42,1/g)).toHaveLength(1)
    expect(Array.from(container.querySelectorAll('.fc-ritmo-refs > div')).map((d) => `${d.querySelector('dt')?.textContent} ${d.querySelector('dd')?.textContent}`)).toEqual(['mejor turno 47,3', 'normal 40,2'])
    cleanup()
    /* Sin esos datos no inventa nada: ni referencias ni renglón vacío. */
    const sin = franja(con({ cerrado: true, piezas: 15400, proyeccion: null, ritmo: 42.1, ritmoInfo: { ...base.ritmoInfo, mejorCpm: null, medianaCpm: null } })).container
    expect(sin.querySelector('.fc-ritmo-refs')).toBeNull()
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
    expect(container.querySelector('.fc-ritmo-fila .fc-u')?.textContent).toBe('de 51 pz/min')
    expect(container.querySelector('.fc-c-ritmo .fc-cab .fc-nota-der')?.textContent).toBe('min 02:34')
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
    expect(t).toContain('hechas − tocaban')
    expect(t).not.toContain('hechas − las que tocaban')
    expect(t).toContain('+623 pz')
    expect(t).toContain('proyección 15.623')
    expect(t).not.toContain('proyección 15.623 − meta')
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

  it('una cifra de 5 dígitos (−12.345) lo dice para que el CSS calle la unidad bajo 1600 px', () => {
    const { container } = franja(con({ piezas: 0, cuota: { piezas: 12345, hora: '02:35' } }))
    expect(container.textContent).toContain('−12.345 pz')
    expect(container.querySelector('.fc-cifra-5')?.textContent).toContain('−12.345')
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

  it('línea detenida: la causa (la del aviso «Ahora mismo», que la franja calla) va en la nota del «en pausa», con su título completo', () => {
    const sinCausa = franja(con({ eje: { ...eje, detenidaEstado: true } }))
    expect(sinCausa.container.querySelector('.fc-nota-pausa')?.textContent).toBe('línea detenida')
    expect(sinCausa.container.querySelector('.fc-nota-pausa')?.getAttribute('title')).toBeNull()
    cleanup()
    const { container } = franja(con({ eje: { ...eje, detenidaEstado: true }, causaParada: 'Detención programada' }))
    const nota = container.querySelector('.fc-nota-pausa')
    expect(nota?.textContent).toBe('línea detenida · Detención programada')
    expect(nota?.getAttribute('title')).toBe('línea detenida · Detención programada')
    /* En marcha no hay nota de pausa, aunque llegue una causa vieja. */
    cleanup()
    expect(franja(con({ causaParada: 'Detención programada' })).container.querySelector('.fc-nota-pausa')).toBeNull()
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

  it('cada caso de cuatro celdas lleva su propio atributo (sin Camino, sin Baader) para que la grilla sepa cuál es', () => {
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

  it('una sola Baader (Filete): sin celda «Cada Baader»; si no anda, su palabra va junto a la cifra de Ritmo', () => {
    const [a] = maquinasSerie
    /* 10 de 19 = 53 % → lenta. */
    const lenta = { ...a!, cycles: serie(17, 10) }
    const { container } = franja(con({ maquinas: [maquinas[0]!], eje: { ...eje, minuto: { desde: eje.minuto!.desde, maquinas: [lenta] } } }))
    expect(container.querySelector('.fc-c-baader')).toBeNull()
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
    /* Piezas, Ritmo, Al cierre y Mantención; Cada Baader y A esta hora no abren nada. */
    expect(container.querySelectorAll('.fc-chev')).toHaveLength(4)
    for (const z of getAllByRole('button')) {
      expect(z.getAttribute('aria-haspopup')).toBe('dialog')
      expect(z.querySelector('.fc-chev')).not.toBeNull()
      expect(z.querySelector('.fc-chev')?.getAttribute('aria-hidden')).toBe('true')
    }
    expect(container.querySelector('.fc-c-baader .fc-chev')).toBeNull()
  })

  it('«Cada Baader»: las piezas salen del contador vivo cuando suma lo mismo que la cifra grande; si no, del doc del corte', () => {
    const entrada: EntradaRep = { desdeMs: INI, maquinas: [], paradas: {}, pulsoAtMs: null }
    /* PSM solo arma `porMaquina` si `totalCycles === contador` (la guarda): llega ya decidido en `repro.tope`. */
    const conGuarda = franja(con({ repro: { entrada, tope: armarTope(9690, { a: 3400, b: 3000, c: 3290 }) } })).container
    expect(Array.from(conGuarda.querySelectorAll('.fc-baader-pz')).map((x) => x.textContent)).toEqual(['3.400', '3.000', '3.290'])
    cleanup()
    const sinGuarda = franja(con({ repro: { entrada, tope: armarTope(9690, null) } })).container
    expect(Array.from(sinGuarda.querySelectorAll('.fc-baader-pz')).map((x) => x.textContent)).toEqual(['3.316', '3.077', '3.297'])
    cleanup()
    const sinRepro = franja().container
    expect(Array.from(sinRepro.querySelectorAll('.fc-baader-pz')).map((x) => x.textContent)).toEqual(['3.316', '3.077', '3.297'])
  })

  it('«Cada Baader»: el número y la barra son el conteo crudo del minuto; si anduvo menos de 55 s, la nota dice cuántos', () => {
    /* Ev 2 paró 25 s del último minuto cerrado: anduvo 35 s. 10 pz en 35 s dan 107 % de lo que daba andando (andando), pero el
       número «10 de 16» y la barra (62,5 %) siguen siendo lo que Shoplogix contó. */
    const paradasMaquina = {
      stopEvents: [{ r: 0, f: new Date(INI + (AHORA - 1) * 60_000).toISOString(), s: 25, m: 1 }],
      stopReasons: ['Detencion'],
      stopMachines: ['a', 'b', 'c'],
      enCurso: [],
    }
    const { container } = franja(con({ eje: { ...eje, paradasMaquina } }))
    const filas = Array.from(container.querySelectorAll('.fc-baader'))
    expect(filas[1]!.querySelector('.fc-baader-nota')?.textContent).toBe('anduvo 35 s')
    expect(filas[1]!.textContent).toContain('10 de 16 pz/min')
    expect((filas[1]!.querySelector('.fc-baader-pista > div') as HTMLElement).style.width).toBe('62.5%')
    /* Punto normalizado: a ritmo cuando anduvo, no «lenta» por el conteo crudo. */
    expect((filas[1]!.querySelector('.fc-baader-nombre > i') as HTMLElement).style.background).toBe('var(--v2-acento)')
    expect(filas[1]!.textContent).not.toMatch(/lenta|detenida/)
    /* Las que anduvieron el minuto entero no llevan nota. */
    expect(filas[0]!.querySelector('.fc-baader-nota')).toBeNull()
    expect(filas[2]!.querySelector('.fc-baader-nota')).toBeNull()
  })

  it('«Cada Baader» sin paradas registradas, o parada el minuto entero, no inventa «anduvo N s»', () => {
    expect(franja().container.querySelector('.fc-baader-nota')).toBeNull()
    cleanup()
    const todoElMinuto = {
      stopEvents: [{ r: 0, f: new Date(INI + (AHORA - 1) * 60_000).toISOString(), s: 60, m: 1 }],
      stopReasons: ['Detencion'],
      stopMachines: ['a', 'b', 'c'],
      enCurso: [],
    }
    expect(franja(con({ eje: { ...eje, paradasMaquina: todoElMinuto } })).container.querySelector('.fc-baader-nota')).toBeNull()
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
    expect(leyenda(container)).toEqual(['Hechas 9.690 pz', 'Paradas 2.460 pz', 'Por ritmo 0 pz', 'Por jugar 4.333 pz'])
    expect(container.textContent).not.toContain('Programado')
    expect(container.textContent).not.toMatch(/\d min\b/)
    /* La barra reparte la meta: hechas · paradas (la parte que cabe en la brecha) · por jugar (sin «por ritmo»: es 0). */
    const a = anchos(container)
    expect(a).toHaveLength(3)
    expect(a[0]).toBeCloseTo((9690 / 15000) * 100, 1)
    expect(a[2]).toBeCloseTo((4333 / 15000) * 100, 1)
    expect(a.reduce((x, y) => x + y, 0)).toBeCloseTo(100, 1)
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
    expect(leyenda(container.parentElement!)).toEqual(['Hechas 9.690 pz', 'Paradas 410 pz', 'Por ritmo 567 pz', 'Por jugar 4.333 pz'])
    expect(9690 + 410 + 567 + 4333).toBe(15000)
  })

  it('cerrado: Hechas · Paradas · Por ritmo (meta − hechas − paradas), sin «Por jugar»', () => {
    const { container } = celda({ cerrado: true, hechas: 12000 })
    expect(leyenda(container)).toEqual(['Hechas 12.000 pz', 'Paradas 2.460 pz', 'Por ritmo 540 pz'])
    expect(anchos(container).reduce((x, y) => x + y, 0)).toBeCloseTo(100, 1)
    expect(container.querySelector('.fc-camino-raya')).toBeNull()
  })

  it('meta superada: la escala crece hasta hechas + paradas, el tramo rojo sigue a la vista y una raya marca la meta (también en el nombre accesible)', () => {
    const { container, getByRole } = celda({ cerrado: true, hechas: 15479 })
    expect(leyenda(container)).toEqual(['Hechas 15.479 pz', 'Paradas 2.460 pz'])
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

  it('sin la cuenta en piezas (sin ritmo andando) cae a los minutos, cada tramo con su cifra, y sin raya', () => {
    const { container } = celda({ hechas: 9690, cpmAndando: null })
    expect(leyenda(container)).toEqual(['Produciendo 5 h 40 min', 'Paradas evitables 1 h', 'Programado 50 min'])
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
    const { container } = render(<PiezasBaader reloj={relojCon({ valor: 5384 })} id="a" respaldo={5384} className="fc-baader-pz" />)
    expect(container.textContent).toBe('5.384')
    expect(container.querySelector('.fc-baader-pz')).not.toBeNull()
  })

  it('una Baader que la reproducción no trae (id distinto) se queda con su respaldo', () => {
    const rep = { frac: 1, seg: 60, total: 10, totalPiso: 10, totalFinal: 10, atrasada: false, animando: false, porMaquina: [{ id: 'z', valor: 10, encendidas: 0, n: 0, estado: 'andando' as const }] }
    const { container } = render(<PiezasBaader reloj={relojCon({ valor: 10, rep })} id="a" respaldo={1234} />)
    expect(container.textContent).toBe('1.234')
  })
})
