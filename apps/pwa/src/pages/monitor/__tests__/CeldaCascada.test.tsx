/**
 * Camino a la meta con la cascada a la meta (la de «Dónde se fueron las piezas» del tablero): la celda de la franja y su
 * ampliado. Turno Chonchi 03-11 (perillas 17 · 16 · 16), el mismo fixture que la prueba de la cascada. Sin cascada (null, o
 * sin piezas que medir) la celda queda como antes: se prueba al final como respaldo.
 */
import { cleanup, fireEvent, render } from '@testing-library/react'
import { afterEach, describe, expect, it } from 'vitest'
import fixture from './fixtures/chonchi_0311_turno1_minutos.json'
import { agruparEventos } from '@/services/shoplogix/monitorEventos'
import type { PublicMonitorLive } from '@/services/shoplogix/publicShiftMonitor.service'
import { TiempoDelTurno } from '../MonitorShiftParts'
import { CascadaMetaV2 } from '../CascadaMetaV2'
import { cascadaPorMeta, type CascadaArgs, type PiezasVista } from '../cascadaPerilla'
import { detalleCascadaMeta } from '../cascadaMetaDetalle'
import { paradasDetalle, type EntradaRitmoVivo } from '../ritmoVivo'
import type { PerillasDeLinea } from '../perilla'
import type { NotaDeOperador } from '../notasOperador'

const N = fixture.maquinas[0]!.cycles.length
const T0 = Date.parse(fixture.desde)
const IDS = fixture.maquinas.map((m) => m.id)
const desde = fixture.desde

const serie: CascadaArgs['serie'] = {
  desde: fixture.desde,
  maquinas: fixture.maquinas.map(({ id, nombre, esperado, cycles }) => ({ id, nombre, esperado, cycles })),
}
const stopEvents: NonNullable<EntradaRitmoVivo['stopEvents']> = []
fixture.maquinas.forEach((m, mi) => m.det.forEach((d, k) => {
  const r = m.raz[k]!
  if (d > 0 && r >= 0) stopEvents.push({ r, f: new Date(T0 + k * 60_000).toISOString(), s: d, m: mi })
}))
const paradas = paradasDetalle({ stopEvents, stopReasons: fixture.razones, stopMachines: IDS, enCurso: [] })
const PERILLAS_17_16_16: PerillasDeLinea = {
  actual: {
    [IDS[0]!]: { cpm: 17, desde },
    [IDS[1]!]: { cpm: 16, desde },
    [IDS[2]!]: { cpm: 16, desde },
  },
  historial: [],
}
const args = (perillas?: PerillasDeLinea | null): CascadaArgs => ({ serie, n: N, paradas, perillas })
const cascada = cascadaPorMeta(args(PERILLAS_17_16_16))
const L: PiezasVista = cascada.linea

/* Formato del tablero: miles con punto (es-CL), como `fmtInt` de la celda. */
const fmt = (n: number) => Math.round(n).toLocaleString('es-CL')
/* Horas como las escribe el tablero («2 h 05 min», «45 min»). */
const horas = (min: number) => {
  const h = Math.floor(min / 60)
  const m = Math.round(min - h * 60)
  return h ? `${h} h ${m} min` : `${m} min`
}

const tb: PublicMonitorLive['timeBreakdown'] = {
  windowMin: 450, producingMin: 340, plannedMin: 50, recoverableMin: 60,
  planned: [{ reason: 'COLACION', min: 50, count: 1, lineMin: 50 }],
  recoverable: [{ reason: 'Detencion', min: 60, count: 2, lineMin: 60 }],
}
const grupos = agruparEventos({ tb, cpmGlobal: 41 })

/* jsdom no implementa la animación de la capa; la prueba no la mide, solo abre y lee el texto. */
if (!('animate' in Element.prototype)) {
  Object.defineProperty(Element.prototype, 'animate', { value: () => ({ finished: Promise.resolve(), cancel() {}, finish() {}, addEventListener() {}, removeEventListener() {} }), configurable: true })
}

afterEach(() => cleanup())

/** La leyenda de la celda: rótulo y cifra de cada fila de `.fc-camino-cifras`. */
const leyenda = (c: HTMLElement) => Array.from(c.querySelectorAll('.fc-camino-cifras > div')).map((d) => ({
  k: d.querySelector('dt')?.textContent ?? '',
  v: Number((d.querySelector('dd')?.textContent ?? '').replace(/[^\d]/g, '')),
}))
/** Ancho de cada tramo de la barra, en %. */
const anchos = (c: HTMLElement) => Array.from(c.querySelectorAll('.fc-camino-barra > span')).map((x) => parseFloat((x as HTMLElement).style.width))

const celda = (over: { cerrado?: boolean; contenedor?: 'silleta' | 'carro'; linea?: PiezasVista | null } = {}) => render(
  <TiempoDelTurno
    tb={tb} cerrado={over.cerrado ?? false} meta={15000} hechas={9690} cuotaAhora={10667} horaAhora="02:35" cpmAndando={41}
    grupos={grupos} v2="celda" ampliado={<div>detalle camino</div>}
    cascada={over.linea === null ? null : { linea: over.linea ?? L, contenedor: over.contenedor ?? 'silleta' }}
  />,
)

describe('Camino a la meta con la cascada: las cifras son las de «Dónde se fueron las piezas»', () => {
  it('la leyenda son las cinco partes de la cascada, con sus piezas y en su orden', () => {
    const { container } = celda()
    expect(leyenda(container)).toEqual([
      { k: 'Hechas', v: Math.round(L.hizo) },
      { k: 'Detenciones', v: Math.round(L.detenciones.piezas) },
      { k: 'Micro', v: Math.round(L.micro.piezas) },
      { k: 'Silletas vacías', v: Math.round(L.vacios) },
      { k: 'Perilla', v: Math.round(L.perilla) },
    ])
  })

  it('Hechas + pérdidas suman lo que podía hacer a la meta (la cascada cuadra en este turno)', () => {
    expect(L.cuadra).toBe(true)
    const { container } = celda()
    const suma = leyenda(container).reduce((a, x) => a + x.v, 0)
    expect(suma).toBe(Math.round(L.podia))
  })

  it('no lleva «Por ritmo» ni «Por jugar»: esas son de la resta vieja', () => {
    const { container } = celda()
    expect(container.textContent).not.toContain('Por ritmo')
    expect(container.textContent).not.toContain('Por jugar')
    expect(container.textContent).not.toContain('aún por jugar')
  })

  it('título, subtítulo con la duración del tablero y la cifra grande: pz bajo la meta · hizo X de Y', () => {
    const { container } = celda()
    expect(container.querySelector('.fc-rotulo')?.textContent).toBe('Dónde se fueron las piezas')
    expect(container.querySelector('.fc-nota')?.textContent).toBe(`a la meta de Shoplogix · ${horas(L.minProduccion)} de producción`)
    /* La cifra y «hizo X de Y» van en líneas separadas: la cifra con su unidad, y el detalle en texto secundario. */
    expect(container.querySelector('.fc-cifra-m')?.textContent).toBe(`${fmt(L.perdido)} pz bajo la meta`)
    expect(container.querySelector('.fc-camino-hizo')?.textContent).toBe(`hizo ${fmt(L.hizo)} de ${fmt(L.podia)}`)
  })

  it('la barra reparte lo que podía hacer: un tramo por cifra que redondea a más de 0, con ancho piezas / podía', () => {
    const { container } = celda()
    const cifras = leyenda(container).filter((x) => x.v > 0)
    const a = anchos(container)
    expect(a).toHaveLength(cifras.length)
    cifras.forEach((x, i) => expect(a[i]).toBeCloseTo((x.v / L.podia) * 100, 1))
    expect(a.reduce((x, y) => x + y, 0)).toBeCloseTo(100, 1)
    expect(container.querySelector('.fc-camino-raya')).toBeNull()
  })

  it('en vivo y cerrado dan las mismas cifras: la cascada no depende de la hora de la cuota', () => {
    const enVivo = leyenda(celda().container)
    const cerrado = leyenda(celda({ cerrado: true }).container)
    expect(cerrado).toEqual(enVivo)
  })

  it('Eviscerado (carros): el rótulo de los vacíos dice «Carros vacíos»', () => {
    const { container } = celda({ contenedor: 'carro' })
    expect(leyenda(container)[3]!.k).toBe('Carros vacíos')
    expect(container.textContent).not.toContain('Silletas')
  })

  it('las cifras de la celda son las de cascadaPorMeta: ni una sale de otra cuenta', () => {
    const { container } = celda()
    const esperado = [L.hizo, L.detenciones.piezas, L.micro.piezas, L.vacios, L.perilla].map(Math.round)
    expect(leyenda(container).map((x) => x.v)).toEqual(esperado)
  })
})

describe('Camino a la meta con la cascada: el ampliado sin piezas de la resta vieja', () => {
  const ampliado = (over: { cascada?: boolean; notas?: Map<string, NotaDeOperador[]> } = {}) => render(
    <TiempoDelTurno
      tb={tb} cerrado={false} meta={15000} hechas={9690} cuotaAhora={10667} horaAhora="02:35" cpmAndando={41}
      grupos={grupos} v2="ampliado" notas={over.notas}
      cascada={over.cascada === false ? null : { linea: L, contenedor: 'silleta' }}
    />,
  )

  it('no muestra piezas ni «por ritmo», «atrás» o «por qué no llegamos»', () => {
    const { container } = ampliado({})
    const t = container.textContent ?? ''
    expect(t).not.toMatch(/\d pz\b/)
    expect(t).not.toContain('Por ritmo')
    expect(t).not.toContain('por ritmo')
    expect(t).not.toContain('atrás')
    expect(t).not.toContain('Por qué no llegamos')
  })

  it('conserva las detenciones con su minuto y la nota del operador', () => {
    const nota: NotaDeOperador = { desde: '10:02', hasta: null, texto: 'Guía de bronce floja', desdeMin: null, hastaMin: null }
    const { container } = ampliado({ notas: new Map([['Detencion', [nota]]]) })
    expect(container.textContent).toContain('Detencion')
    expect(container.textContent).toContain('Guía de bronce floja')
    expect(container.textContent).toMatch(/\d+ min/)
  })

  it('sin cascada (respaldo) el ampliado conserva la resta de siempre: «977 atrás» y la fila Ritmo', () => {
    const { container } = ampliado({ cascada: false })
    expect(container.textContent).toContain('977 atrás')
    expect(container.textContent).toContain('Ritmo')
  })
})

describe('Camino a la meta: la capa con la cascada no repite su título', () => {
  it('dentro de la capa (enCapa) la cascada va sin tarjeta; fuera de la capa conserva su título', () => {
    const detalle = detalleCascadaMeta(args(PERILLAS_17_16_16), cascada)
    const dentro = render(<CascadaMetaV2 enCapa cascada={cascada} detalle={detalle} contenedor="silleta" />)
    expect(dentro.container.querySelector('section')).toBeNull()
    expect(dentro.container.textContent).toContain(`hizo ${fmt(L.hizo)} de ${fmt(L.podia)}`)
    cleanup()
    const fuera = render(<CascadaMetaV2 cascada={cascada} detalle={detalle} contenedor="silleta" />)
    expect(fuera.container.querySelector('section')?.textContent).toContain('Dónde se fueron las piezas')
  })
})

describe('Camino a la meta sin cascada: el respaldo es la celda de siempre', () => {
  it('cascada null: la celda de la resta vieja (Camino a la meta, con «Por ritmo»)', () => {
    const { container } = celda({ linea: null })
    expect(container.querySelector('.fc-rotulo')?.textContent).toBe('Camino a la meta')
    expect(container.textContent).not.toContain('Dónde se fueron las piezas')
    expect(leyenda(container).map((x) => x.k)).toContain('Por ritmo')
  })

  it('cascada sin piezas que medir (podía = 0): también la celda de siempre', () => {
    const { container } = celda({ linea: { ...L, podia: 0 } })
    expect(container.textContent).not.toContain('Dónde se fueron las piezas')
    expect(container.querySelector('.fc-rotulo')?.textContent).toBe('Camino a la meta')
  })
})

describe('Camino a la meta con la cascada: la capa muestra el título una sola vez', () => {
  it('abierta la capa, «Dónde se fueron las piezas» aparece una vez dentro de ella (el encabezado de la capa, sin uno interno)', () => {
    const detalle = detalleCascadaMeta(args(PERILLAS_17_16_16), cascada)
    const { getByRole } = render(
      <TiempoDelTurno
        tb={tb} cerrado={false} meta={15000} hechas={9690} cuotaAhora={10667} horaAhora="02:35" cpmAndando={41}
        grupos={grupos} v2="celda" cascada={{ linea: L, contenedor: 'silleta' }}
        ampliado={<CascadaMetaV2 enCapa cascada={cascada} detalle={detalle} contenedor="silleta" />}
      />,
    )
    fireEvent.click(getByRole('button', { name: /^Dónde se fueron las piezas:/ }))
    const capa = document.querySelector('[role="dialog"]')
    expect(capa).not.toBeNull()
    const veces = (capa?.textContent ?? '').split('Dónde se fueron las piezas').length - 1
    expect(veces).toBe(1)
  })
})
