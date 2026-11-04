/**
 * CascadaTurnoCard (B-2): la card de «Dónde se fueron las piezas» con la cascada a la meta y la perilla, turno de Chonchi 03-11
 * (perillas 17 · 16 · 16, metas 18 · 16 · 16). Las cifras esperadas se escriben a mano (las del encargo B-1/B-2); la card solo
 * las muestra. La prueba clave: el selector de Baader cambia la línea de dueños (si no la cambia, se rompe).
 */
import { cleanup, fireEvent, render } from '@testing-library/react'
import { afterEach, describe, expect, it } from 'vitest'
import fixture from './fixtures/chonchi_0311_turno1_minutos.json'
import { CascadaTurnoCard } from '../CascadaTurnoCard'
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
