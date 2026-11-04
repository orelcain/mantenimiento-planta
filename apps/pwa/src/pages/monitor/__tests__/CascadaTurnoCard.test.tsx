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

describe('CascadaTurnoCard: el motivo de la perilla en el escalón', () => {
  const PERILLAS_CON_MOTIVO: PerillasDeLinea = {
    actual: {
      [IDS[0]!]: { cpm: 17, desde, motivo: 'por el Knuro' },
      [IDS[1]!]: { cpm: 16, desde },
      [IDS[2]!]: { cpm: 16, desde },
    },
    historial: [],
  }
  const cascadaConMotivo = cascadaPorMeta({ serie, n: N, paradas, perillas: PERILLAS_CON_MOTIVO })

  it('en Ev 1, el detalle «Perilla más lenta» dice «17 en vez de 18 · por el Knuro»', () => {
    const { container, getByRole } = render(<CascadaTurnoCard cascada={cascadaConMotivo} minutosTurno={N} />)
    fireEvent.click(getByRole('tab', { name: 'Ev 1' }))
    expect(container.textContent ?? '').toContain('17 en vez de 18 · por el Knuro')
  })

  it('en la línea, la Baader con pérdida lleva su motivo entre paréntesis: «Ev 1 17 en vez de 18 (por el Knuro)»', () => {
    const { container } = render(<CascadaTurnoCard cascada={cascadaConMotivo} minutosTurno={N} />)
    expect(container.textContent ?? '').toContain('Ev 1 17 en vez de 18 (por el Knuro)')
  })

  it('sin motivo, el detalle queda como antes: «17 en vez de 18» y no aparece ningún motivo', () => {
    const { container, getByRole } = render(<CascadaTurnoCard cascada={cascada} minutosTurno={N} />)
    fireEvent.click(getByRole('tab', { name: 'Ev 1' }))
    const texto = container.textContent ?? ''
    expect(texto).toContain('17 en vez de 18')
    expect(texto).not.toContain('por el Knuro')
  })
})

/* Ev 1 con esperado 0 (sin meta de Shoplogix en el turno): el caso de producción del 04-11 (la Línea no cuadraba). */
const serieEv1SinMeta: CascadaArgs['serie'] = { ...serie, maquinas: serie.maquinas.map((m, i) => (i === 0 ? { ...m, esperado: 0 } : m)) }
const cascadaSinMeta = cascadaPorMeta({ serie: serieEv1SinMeta, n: N, paradas, perillas: PERILLAS })
const AVISO_EV1 = 'Ev 1 sin meta de Shoplogix en este turno: no entra en la cuenta'

describe('CascadaTurnoCard: Baader sin meta de Shoplogix (Ev 1 con esperado 0)', () => {
  it('la línea cuadra exacto y lleva la nota «Ev 1 sin meta de Shoplogix en este turno: no entra en la cuenta»', () => {
    const { container } = render(<CascadaTurnoCard cascada={cascadaSinMeta} minutosTurno={N} />)
    const L = cascadaSinMeta.linea
    const texto = container.textContent ?? ''
    expect(texto).toContain(`Cuadre: ${es(L.podia)} − ${es(L.perilla)} − ${es(L.detenciones.piezas)} − ${es(L.micro.piezas)} − ${es(L.vacios)} = ${es(L.hizo)} piezas hechas.`)
    expect(texto).toContain(AVISO_EV1)
  })

  it('la línea no suma a Ev 1: su meta no aparece en la lista de metas', () => {
    const { container } = render(<CascadaTurnoCard cascada={cascadaSinMeta} minutosTurno={N} />)
    const metas = `${cascadaSinMeta.baaders[1]!.meta} + ${cascadaSinMeta.baaders[2]!.meta} pz/min`
    expect(container.textContent ?? '').toContain(metas)
  })

  it('la línea sigue mostrando «Al rendimiento le faltan» y su línea de dueños (antes salían solo en Ev 2 y Ev 3)', () => {
    const { container } = render(<CascadaTurnoCard cascada={cascadaSinMeta} minutosTurno={N} />)
    const texto = container.textContent ?? ''
    expect(texto).toContain('Al rendimiento le faltan')
    expect(texto).toContain(`De ${es(cascadaSinMeta.linea.perdido)} piezas bajo la meta`)
  })

  it('la vista de Ev 1 muestra solo el aviso: sin escalones, sin cuadre y sin rendimiento', () => {
    const { container, getByRole } = render(<CascadaTurnoCard cascada={cascadaSinMeta} minutosTurno={N} />)
    fireEvent.click(getByRole('tab', { name: 'Ev 1' }))
    const texto = container.textContent ?? ''
    expect(texto).toContain(AVISO_EV1)
    expect(texto).not.toContain('Cuadre:')
    expect(texto).not.toContain('Tiempo de producción')
    expect(texto).not.toContain('Podía hacer a la meta')
    expect(texto).not.toContain('Al rendimiento le faltan')
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

  it('el rótulo es «Carros vacíos» en Eviscerado (carros) y «Silletas vacías» en Filete (silletas)', () => {
    const { container } = render(<CascadaTurnoCard cascada={cascada} minutosTurno={N} contenedor="carro" />)
    expect(container.textContent ?? '').toContain('Carros vacíos')
    const f = render(<CascadaTurnoCard cascada={cascada} minutosTurno={N} contenedor="silleta" />)
    expect(f.container.textContent ?? '').toContain('Silletas vacías')
    expect(f.container.textContent ?? '').not.toContain('Carros vacíos')
  })

  it('con una sola máquina (Filete) no sale el selector «Línea» y el texto no nombra «Baader»', () => {
    const una = cascadaPorMeta({ serie: { ...serie, maquinas: [serie.maquinas[0]!] }, n: N, paradas, perillas: PERILLAS })
    const { container, queryByRole } = render(<CascadaTurnoCard cascada={una} minutosTurno={N} contenedor="silleta" />)
    expect(queryByRole('tab', { name: 'Línea' })).toBeNull()
    expect(queryByRole('tablist')).toBeNull()
    const texto = container.textContent ?? ''
    expect(texto).toContain('Tiempo de producción')
    expect(texto).toContain('Cuadre:')
    expect(texto).not.toContain('Baader')
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
