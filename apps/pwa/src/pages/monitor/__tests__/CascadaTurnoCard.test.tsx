/**
 * CascadaTurnoCard (B-2): la card de «Dónde se fueron las piezas» con la cascada a la meta y la perilla, turno de Chonchi 03-11
 * (perillas 17 · 16 · 16, metas 18 · 16 · 16). Las cifras esperadas se escriben a mano (las del encargo B-1/B-2); la card solo
 * las muestra. La prueba clave: el selector de Baader cambia la línea de dueños (si no la cambia, se rompe).
 */
import { cleanup, fireEvent, render } from '@testing-library/react'
import { afterEach, describe, expect, it } from 'vitest'
import fixture from './fixtures/chonchi_0311_turno1_minutos.json'
import { CascadaTurnoCard, TarjetaCascada } from '../CascadaTurnoCard'
import { construirCascada } from '../cascadaTurno'
import type { PublicMonitorLive } from '@/services/shoplogix/publicShiftMonitor.service'
import { cascadaPorMeta, type CascadaArgs } from '../cascadaPerilla'
import { paradasDetalle, type EntradaRitmoVivo } from '../ritmoVivo'
import type { PerillasDeLinea } from '../perilla'

const N = fixture.maquinas[0]!.cycles.length
const T0 = Date.parse(fixture.desde)
const IDS = fixture.maquinas.map((m) => m.id)
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
const desde = fixture.desde
const PERILLAS: PerillasDeLinea = {
  actual: {
    [IDS[0]!]: { cpm: 17, desde },
    [IDS[1]!]: { cpm: 16, desde },
    [IDS[2]!]: { cpm: 16, desde },
  },
  historial: [],
}

const cascada = cascadaPorMeta({ serie, n: N, paradas, perillas: PERILLAS })
const es = (n: number) => Math.round(n).toLocaleString('es-CL')

afterEach(cleanup)

describe('CascadaTurnoCard: dueños por vista', () => {
  it('la línea abre con su línea de dueños: 3.409 bajo la meta, 378 de producción (perilla)', () => {
    const { container } = render(<CascadaTurnoCard cascada={cascada} minutosTurno={N} />)
    const texto = container.textContent ?? ''
    expect(texto).toContain(`De ${es(3_409)} piezas bajo la meta, ${es(cascada.linea.duenos.mantOp)} son de Mantención y operación`)
    expect(texto).toContain(`${es(cascada.linea.duenos.aguas)} de aguas arriba`)
    expect(texto).toContain(`${es(378)} de producción (perilla)`)
  })

  it('elegir Ev 1 cambia la línea de dueños: De 1.222 piezas bajo la meta, 378 de producción', () => {
    const { container, getByRole } = render(<CascadaTurnoCard cascada={cascada} minutosTurno={N} />)
    fireEvent.click(getByRole('tab', { name: 'Ev 1' }))
    const texto = container.textContent ?? ''
    expect(texto).toContain(`De ${es(1_222)} piezas bajo la meta`)
    expect(texto).toContain(`${es(378)} de producción (perilla)`)
    expect(texto).toContain('Tiempo de producción')
    expect(texto).toContain(`395 min`)
  })

  it('Ev 2 (perilla igual a su meta): sin parte de producción', () => {
    const { container, getByRole } = render(<CascadaTurnoCard cascada={cascada} minutosTurno={N} />)
    fireEvent.click(getByRole('tab', { name: 'Ev 2' }))
    expect(container.textContent ?? '').toContain('0 de producción (perilla)')
  })

  it('el cuadre de la vista elegida: podía − perilla − detenciones − micro − vacíos = hizo', () => {
    const { container, getByRole } = render(<CascadaTurnoCard cascada={cascada} minutosTurno={N} />)
    fireEvent.click(getByRole('tab', { name: 'Ev 1' }))
    expect(container.textContent ?? '').toContain(`Cuadre: ${es(7_114)} − ${es(378)} − ${es(148)} − ${es(106)} − ${es(590)} = ${es(5_892)} piezas hechas.`)
  })
})

describe('CascadaTurnoCard: fila de rendimiento, rótulo y regresión (B-2)', () => {
  it('arriba de los escalones: la línea dice 13,7 pts con 378 de la perilla y 2.213 bajo ella', () => {
    const { container } = render(<CascadaTurnoCard cascada={cascada} minutosTurno={N} />)
    const texto = container.textContent ?? ''
    expect(texto).toContain('Al rendimiento le faltan')
    expect(texto).toContain('13,7 pts')
    expect(texto).toContain('de producción · 378 piezas')
    expect(texto).toContain('vacíos y micro · 2.213 piezas')
    expect(texto.indexOf('Al rendimiento le faltan')).toBeLessThan(texto.indexOf('Podía hacer a la meta'))
  })

  it('la fila cambia con el selector: Ev 2 no tiene parte de producción, Ev 1 sí', () => {
    const { container, getByRole } = render(<CascadaTurnoCard cascada={cascada} minutosTurno={N} />)
    fireEvent.click(getByRole('tab', { name: 'Ev 2' }))
    expect(container.textContent ?? '').toContain('de producción · 0 piezas')
    expect(container.textContent ?? '').not.toContain('de producción · 378 piezas')
    fireEvent.click(getByRole('tab', { name: 'Ev 1' }))
    expect(container.textContent ?? '').toContain('de producción · 378 piezas')
  })

  it('el rótulo es «Carros vacíos»', () => {
    const { container } = render(<CascadaTurnoCard cascada={cascada} minutosTurno={N} />)
    expect(container.textContent ?? '').toContain('Carros vacíos')
  })

  it('sin serie por minuto, la tarjeta vuelve a la cascada anterior (construirCascada), como antes de B-2', () => {
    const live = {
      totalPieces: 924, shiftPieces: 924,
      series: [{ t: '2026-08-20T22:55:00.000Z', pieces: 462 }, { t: '2026-08-20T23:05:00.000Z', pieces: 462 }],
      timeBreakdown: { windowMin: 95, producingMin: 81, plannedMin: 0, recoverableMin: 14, planned: [], recoverable: [{ reason: 'Detencion', min: 10, count: 4, lineMin: 10 }] },
    } as unknown as PublicMonitorLive
    const anterior = construirCascada({ live, ritmoMaquina: 18 })!
    expect(anterior).not.toBeNull()
    const { container, unmount } = render(<TarjetaCascada meta={null} anterior={anterior} />)
    const sinMeta = container.textContent ?? ''
    expect(sinMeta).toContain('Dónde se fueron las piezas')
    expect(sinMeta).toContain('andando')
    expect(sinMeta).not.toContain('Cuadre:')
    expect(sinMeta).not.toContain('Tiempo de producción')
    unmount()
    const { container: nueva } = render(<TarjetaCascada meta={{ cascada, minutos: N }} anterior={anterior} />)
    expect(nueva.textContent ?? '').toContain('Cuadre:')
  })

  it('sin ninguna de las dos, no hay tarjeta', () => {
    const { container } = render(<TarjetaCascada meta={null} anterior={null} />)
    expect(container.textContent ?? '').toBe('')
  })
})
