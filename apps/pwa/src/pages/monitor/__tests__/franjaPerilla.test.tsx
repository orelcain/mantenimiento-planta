/**
 * La franja «El turno completo» con la perilla como vara (MinutoTurnoV2): las dos columnas de arriba, la vara bajo cada nombre,
 * «con N o más por minuto», los enteros del ⓘ y el texto de la leyenda. Los carros con pieza salen de `vaciosTurnoDe` sobre la
 * serie entera (la página lo calcula y lo pasa): aquí se prueban los tres casos del spec (con detenciones, sin detenciones y el tope
 * de 100 %). Las cifras esperadas se calculan a mano en cada caso, no con el código que se prueba.
 *
 * Fixture común: Evisceradora 1 con perilla 17 (vigente desde antes del turno) y esperado de Shoplogix 18; Evisceradora 2 sin
 * perilla y esperado 16. Diez minutos de 60 s desde 01:00 (hora de planta sellada como UTC).
 */
import { cleanup, fireEvent, render } from '@testing-library/react'
import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest'
import { useAuthStore } from '@/store/authStore'
import { leerPerillasHistorial, setMonitorPerilla } from '@/services/shoplogix/pinShiftEnd'
import type { ParadasMaquina } from '../ejeTurno'
import { MinutoTurnoV2, type MinutoTurno } from '../MonitorV2'
import { bandasEnteras, perillaVigenteEn, type PerillasDeLinea } from '../perilla'
import { vaciosTurnoDe } from '../ritmoVivo'

vi.mock('@/services/shoplogix/pinShiftEnd', () => ({
  setMonitorPerilla: vi.fn(),
  leerPerillasHistorial: vi.fn(),
}))

const MIN = 60_000
const MINUTOS = 10
const DESDE = '2026-11-04T01:00:00.000Z'
const T0 = Date.parse(DESDE)
const PERILLAS: PerillasDeLinea = { actual: { ev1: { cpm: 17, desde: '2026-11-04T00:00:00.000Z' } }, historial: [] }

const cyc = (pz: number) => Array.from({ length: MINUTOS }, () => pz)
const turno = (ev1: number[], ev2: number[]): MinutoTurno => ({
  desde: DESDE,
  maquinas: [
    { id: 'ev1', nombre: 'Evisceradora 1', esperado: 18, cycles: ev1 },
    { id: 'ev2', nombre: 'Evisceradora 2', esperado: 16, cycles: ev2 },
  ],
})
/** 30 s de detención de la Evisceradora 1 en cada minuto: anda 30 s de cada 60. */
const detenciones30Ev1 = (): ParadasMaquina => ({
  stopEvents: Array.from({ length: MINUTOS }, (_, k) => ({ r: 0, f: new Date(T0 + k * MIN).toISOString(), s: 30, m: 0 })),
  stopReasons: ['Detencion'],
  stopMachines: ['ev1', 'ev2'],
  enCurso: [],
})

/** Lo que la página calcula y pasa a la franja: `vaciosTurnoDe` sobre la serie entera. */
const carrosDe = (d: MinutoTurno, detenciones: ParadasMaquina | null) =>
  vaciosTurnoDe(d, Math.min(...d.maquinas.map((m) => m.cycles.length)), detenciones, PERILLAS)

const renderFranja = (d: MinutoTurno, detenciones: ParadasMaquina | null) =>
  render(<MinutoTurnoV2 d={d} cerrado={false} perillas={PERILLAS} carros={carrosDe(d, detenciones)} perillaEditor={null} />)

beforeAll(() => {
  globalThis.ResizeObserver = class { observe() {} unobserve() {} disconnect() {} } as unknown as typeof ResizeObserver
})
beforeEach(() => {
  vi.mocked(leerPerillasHistorial).mockResolvedValue([])
  vi.mocked(setMonitorPerilla).mockResolvedValue(undefined)
  useAuthStore.setState({ user: null })
})
afterEach(() => {
  cleanup()
  useAuthStore.setState({ user: null })
})

describe('encabezado de la franja', () => {
  it('los rótulos de las dos columnas aparecen una sola vez', () => {
    const d = turno(cyc(15), cyc(18))
    const { container } = renderFranja(d, null)
    const texto = container.textContent ?? ''
    expect(texto.split('carros con pieza').length - 1).toBe(1)
    expect(texto.split('minutos a ritmo').length - 1).toBe(1)
  })

  it('con perilla: la vara dice perilla, la fecha de la anotación (dd-mm de desde) y la meta de Shoplogix', () => {
    const d = turno([17, 17, 17, 17, 17, 17, 15, 15, 15, 15], cyc(18))
    const { container } = renderFranja(d, null)
    expect(container.textContent).toContain('perilla 17 · anotada 04-11 · meta Shoplogix 18')
  })

  it('sin perilla: «sin perilla anotada» con el color de atención y la meta de Shoplogix', () => {
    const d = turno(cyc(15), cyc(18))
    const { container } = renderFranja(d, null)
    expect(container.textContent).toContain('sin perilla anotada · meta Shoplogix 16')
    const aviso = Array.from(container.querySelectorAll('span')).find((s) => s.textContent === 'sin perilla anotada')
    expect(aviso?.getAttribute('style')).toContain('--v2-atento-texto')
  })

  it('«con N o más por minuto» usa el umbral de la vara vigente al final del turno', () => {
    const d = turno(cyc(15), cyc(18))
    const { container } = renderFranja(d, null)
    /* Con perilla 17, a ritmo es 17 o más; sin perilla, el 75 % de la meta 16 es 12. */
    expect(container.textContent).toContain('con 17 o más por minuto')
    expect(container.textContent).toContain('con 12 o más por minuto')
  })

  it('la leyenda trae el texto exacto con «Carros con pieza» y «Minutos a ritmo» en negrita', () => {
    const d = turno(cyc(15), cyc(18))
    const { container } = renderFranja(d, null)
    expect(container.textContent).toContain(
      'Carros con pieza cuenta solo mientras la Baader anda, como su pantalla. Minutos a ritmo cuenta todo el turno: cada detención resta.',
    )
    const negritas = Array.from(container.querySelectorAll('b')).map((b) => b.textContent)
    expect(negritas).toContain('Carros con pieza')
    expect(negritas).toContain('Minutos a ritmo')
  })
})

describe('carros con pieza: con detenciones, sin detenciones y el tope de 100 %', () => {
  it('sin detenciones, cada minuto cuenta andando entero: 80 piezas sobre 17 × 10 = 170 dan 47 %', () => {
    const d = turno(cyc(8), cyc(18))
    const { getByText } = renderFranja(d, null)
    expect(getByText('47')).toBeTruthy()
  })

  it('con detenciones, solo cuenta lo andando: 30 s de cada minuto dejan 17 × 0,5 × 10 = 85; 80 sobre 85 dan 94 %', () => {
    const d = turno(cyc(8), cyc(18))
    const { getByText, queryByText } = renderFranja(d, detenciones30Ev1())
    expect(getByText('94')).toBeTruthy()
    expect(queryByText('47')).toBeNull()
  })

  it('el tope: 180 piezas sobre 16 × 10 = 160 son 112,5 %, y se muestra 100 %', () => {
    const d = turno(cyc(15), cyc(18))
    const { getAllByText, queryByText } = renderFranja(d, null)
    expect(getAllByText('100').length).toBeGreaterThan(0)
    expect(queryByText('113')).toBeNull()
    expect(queryByText('112')).toBeNull()
  })
})

describe('minutos a ritmo y el ⓘ de los enteros', () => {
  it('con perilla, a ritmo es la perilla completa: 6 de 10 minutos en 17 o más dan 60 %', () => {
    const d = turno([17, 17, 17, 17, 17, 17, 15, 15, 15, 15], cyc(18))
    const { getByText } = renderFranja(d, null)
    expect(getByText('60')).toBeTruthy()
  })

  it('el ⓘ lista los enteros de cada máquina: a ritmo, bajo y muy bajo', () => {
    const d = turno(cyc(15), cyc(18))
    const { container, getByRole } = renderFranja(d, null)
    expect(container.textContent).not.toContain('a ritmo con 17 o más; bajo de 9 a 16; muy bajo con 8 o menos')
    fireEvent.click(getByRole('button', { name: 'Enteros de cada máquina' }))
    expect(container.textContent).toContain('Ev 1: a ritmo con 17 o más; bajo de 9 a 16; muy bajo con 8 o menos')
    expect(container.textContent).toContain('Ev 2: a ritmo con 12 o más; bajo de 8 a 11; muy bajo con 7 o menos')
  })
})

describe('funciones puras que usa la franja', () => {
  it('perillaVigenteEn toma la anotación más reciente que ya estaba vigente en ese instante', () => {
    const perillas: PerillasDeLinea = {
      actual: { ev1: { cpm: 18, desde: '2026-11-04T02:00:00.000Z' } },
      historial: [{ machineId: 'ev1', cpm: 17, desde: '2026-11-04T00:00:00.000Z' }],
    }
    expect(perillaVigenteEn(perillas, 'ev1', Date.parse('2026-11-04T01:30:00.000Z'))?.cpm).toBe(17)
    expect(perillaVigenteEn(perillas, 'ev1', Date.parse('2026-11-04T02:30:00.000Z'))?.cpm).toBe(18)
    expect(perillaVigenteEn(perillas, 'ev1', Date.parse('2026-10-31T00:00:00.000Z'))).toBeNull()
  })

  it('bandasEnteras con perilla 17: a ritmo desde 17, bajo desde 9; sin perilla y meta 16: 12 y 8', () => {
    expect(bandasEnteras({ cpm: 17, fuente: 'perilla' })).toEqual({ aRitmo: 17, bajo: 9 })
    expect(bandasEnteras({ cpm: 16, fuente: 'shoplogix' })).toEqual({ aRitmo: 12, bajo: 8 })
    expect(bandasEnteras({ cpm: null, fuente: 'shoplogix' })).toBeNull()
  })
})
