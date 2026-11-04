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
    /* Con perilla 17 (calibrada por omisión), a ritmo es 16 o más; sin perilla, el 75 % de la meta 16 es 12. */
    expect(container.textContent).toContain('con 16 o más por minuto')
    expect(container.textContent).toContain('con 12 o más por minuto')
  })

  it('ya no hay el párrafo bajo la franja que explicaba «Carros con pieza» y «Minutos a ritmo»: lo dicen los ⓘ', () => {
    const d = turno(cyc(15), cyc(18))
    const { container } = renderFranja(d, null)
    expect(container.textContent).not.toContain('Carros con pieza cuenta solo mientras la Baader anda')
    expect(container.textContent).not.toContain('cada detención resta')
  })

  it('«anotada dd-mm» no se corta: va en un bloque que no parte la línea', () => {
    const d = turno([17, 17, 17, 17, 17, 17, 15, 15, 15, 15], cyc(18))
    const { container } = renderFranja(d, null)
    const anotada = Array.from(container.querySelectorAll<HTMLElement>('span.whitespace-nowrap')).find((s) => s.textContent === 'anotada 04-11')
    expect(anotada).toBeTruthy()
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
  it('con perilla calibrada por omisión (a ritmo desde 16): 6 de 10 minutos con 17 dan 60 %', () => {
    const d = turno([17, 17, 17, 17, 17, 17, 15, 15, 15, 15], cyc(18))
    const { getByText } = renderFranja(d, null)
    expect(getByText('60')).toBeTruthy()
  })

  it('el ⓘ lista los enteros de cada máquina: a ritmo, bajo y muy bajo', () => {
    const d = turno(cyc(15), cyc(18))
    const { container, getByRole } = renderFranja(d, null)
    expect(container.textContent).not.toContain('a ritmo con 16 o más; bajo de 9 a 15; muy bajo con 8 o menos')
    fireEvent.click(getByRole('button', { name: 'Enteros de cada máquina' }))
    expect(container.textContent).toContain('Ev 1: a ritmo con 16 o más; bajo de 9 a 15; muy bajo con 8 o menos')
    expect(container.textContent).toContain('Ev 2: a ritmo con 12 o más; bajo de 8 a 11; muy bajo con 7 o menos')
  })
})

describe('la línea con tres Baaders en perilla: su umbral calibrado descuenta una pieza por Baader', () => {
  it('perillas 17 + 16 + 16 = 49, con 3 Baaders: «con 46 o más por minuto» (no 48, que sería descontar una sola vez)', () => {
    const d: MinutoTurno = {
      desde: DESDE,
      maquinas: [
        { id: 'ev1', nombre: 'Evisceradora 1', esperado: 18, cycles: cyc(18) },
        { id: 'ev2', nombre: 'Evisceradora 2', esperado: 16, cycles: cyc(16) },
        { id: 'ev3', nombre: 'Evisceradora 3', esperado: 16, cycles: cyc(16) },
      ],
    }
    const perillas3: PerillasDeLinea = {
      actual: {
        ev1: { cpm: 17, desde: '2026-11-04T00:00:00.000Z' },
        ev2: { cpm: 16, desde: '2026-11-04T00:00:00.000Z' },
        ev3: { cpm: 16, desde: '2026-11-04T00:00:00.000Z' },
      },
      historial: [],
    }
    const { container } = render(
      <MinutoTurnoV2 d={d} cerrado={false} perillas={perillas3} carros={vaciosTurnoDe(d, MINUTOS, null, perillas3)} perillaEditor={null} />,
    )
    expect(container.textContent).toContain('con 46 o más por minuto')
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

  it('bandasEnteras con perilla 17 calibrada: a ritmo desde 16, bajo desde 9; con modo óptimo, desde 17; sin perilla y meta 16: 12 y 8', () => {
    expect(bandasEnteras({ cpm: 17, fuente: 'perilla' })).toEqual({ aRitmo: 16, bajo: 9 })
    expect(bandasEnteras({ cpm: 17, fuente: 'perilla', modo: 'optimo' })).toEqual({ aRitmo: 17, bajo: 9 })
    expect(bandasEnteras({ cpm: 16, fuente: 'shoplogix' })).toEqual({ aRitmo: 12, bajo: 8 })
    expect(bandasEnteras({ cpm: null, fuente: 'shoplogix' })).toBeNull()
  })
})

/* Maquetación de la cabecera de cada franja. jsdom no calcula anchos: estas pruebas fijan las clases que los dan (bajo 640 px,
   grilla con el nombre en minmax(0, 1fr) y las cifras de 72 y 80 px; desde 640 px, flex y las cifras de 76 y 120 px como antes).
   Las líneas que ocupa cada texto se miden en el navegador (Playwright, banco de la perilla). */
describe('maquetación de la cabecera de cada franja (clases de anchos)', () => {
  const cabeceraDe = (container: HTMLElement, texto: string) =>
    Array.from(container.querySelectorAll<HTMLElement>('.sticky.z-10.mb-2')).find((el) => el.textContent?.includes(texto))!

  it('bajo 640 px la cabecera es grilla (nombre en minmax(0, 1fr) y el grupo de cifras); desde 640 px vuelve a flex', () => {
    const { container } = renderFranja(turno(cyc(15), cyc(18)), null)
    const cab = cabeceraDe(container, 'Evisceradora 1')
    expect(cab.className).toContain('grid grid-cols-[minmax(0,1fr)_auto]')
    expect(cab.className).toContain('sm:flex sm:justify-between')
  })

  it('las dos cifras miden 72 y 80 px bajo 640 px (76 y 120 desde 640) y no llevan ancho en línea', () => {
    const { container } = renderFranja(turno(cyc(15), cyc(18)), null)
    const [carros, minutos] = Array.from(cabeceraDe(container, 'Evisceradora 1').querySelectorAll<HTMLElement>('div.text-right'))
    expect(carros!.className).toContain('w-[72px] sm:w-[76px]')
    expect(minutos!.className).toContain('w-[80px] sm:w-[120px]')
    expect(carros!.getAttribute('style')).toBeNull()
    expect(minutos!.getAttribute('style')).toBeNull()
  })

  it('«con N o más por minuto» se parte en «con N o más» y «por minuto» solo bajo 640 px; el texto no cambia', () => {
    const { container } = renderFranja(turno(cyc(15), cyc(18)), null)
    /* La segunda cifra de la cabecera (minutos a ritmo): la primera, carros, también tiene su pie «similar a la Baader». */
    const pie = cabeceraDe(container, 'Evisceradora 1').querySelectorAll<HTMLElement>('div.text-right')[1]!.querySelector<HTMLElement>('.leading-snug')!
    expect(pie.textContent).toBe('con 16 o más por minuto')
    expect(pie.querySelector('br')?.className).toBe('sm:hidden')
  })

  it('los rótulos de arriba siguen las mismas columnas y se parten en «carros / con pieza» y «minutos / a ritmo» bajo 640 px', () => {
    const { container } = renderFranja(turno(cyc(15), cyc(18)), null)
    const spans = Array.from(container.querySelectorAll<HTMLElement>('span'))
    const carros = spans.find((s) => s.textContent === 'carros con pieza')!
    const minutos = spans.find((s) => s.textContent === 'minutos a ritmo')!
    expect(carros.className).toContain('w-[72px] sm:w-[76px]')
    expect(minutos.className).toContain('w-[80px] sm:w-[120px]')
    expect(carros.querySelector('br')?.className).toBe('sm:hidden')
    expect(minutos.querySelector('br')?.className).toBe('sm:hidden')
  })
})

/* Los ⓘ (A2-2a): cada globo abre y cierra con su botón, «Ver desglose» abre el panel de la Baader y los carros solo se explican en las
   Baaders (la línea no tiene pie). El desglose de la Evisceradora 1 con 6 minutos a ritmo de 10: la misma cifra que el frente. */
describe('los ⓘ de la franja y «Ver desglose»', () => {
  const cabeceraEv1 = (container: HTMLElement) =>
    Array.from(container.querySelectorAll<HTMLElement>('.sticky.z-10.mb-2')).find((el) => el.textContent?.includes('Evisceradora 1'))!
  const botonInfo = (container: HTMLElement, etiqueta: string) =>
    cabeceraEv1(container).querySelector<HTMLButtonElement>(`button[aria-label="${etiqueta}"]`)!
  const ETQ_RITMO = 'Cómo se cuentan los minutos a ritmo'
  const ETQ_CARROS = 'Cómo se calculan los carros con pieza'

  it('el ⓘ de minutos a ritmo abre su globo con la cuenta y lo cierra con otro toque', () => {
    const { container } = renderFranja(turno([17, 17, 17, 17, 17, 17, 15, 15, 15, 15], cyc(18)), null)
    const info = botonInfo(container, ETQ_RITMO)
    expect(info.getAttribute('aria-expanded')).toBe('false')
    fireEvent.click(info)
    const globo = container.querySelector<HTMLElement>('[role="dialog"][aria-label="Minutos a ritmo de la Evisceradora 1"]')!
    expect(globo.textContent).toContain('6 de 10 minutos llegaron a 16 o más por minuto.')
    expect(globo.textContent).toContain('El umbral es la perilla 17 menos 1')
    expect(botonInfo(container, ETQ_RITMO).getAttribute('aria-expanded')).toBe('true')
    fireEvent.click(botonInfo(container, ETQ_RITMO))
    expect(container.querySelector('[role="dialog"][aria-label="Minutos a ritmo de la Evisceradora 1"]')).toBeNull()
  })

  it('«Ver desglose» del globo abre el panel de la Baader con su suma a ritmo igual al 60 % del frente', () => {
    const { container, getByText } = renderFranja(turno([17, 17, 17, 17, 17, 17, 15, 15, 15, 15], cyc(18)), null)
    fireEvent.click(botonInfo(container, ETQ_RITMO))
    fireEvent.click(getByText('Ver desglose'))
    const panel = container.querySelector<HTMLElement>('[role="region"][aria-label="Desglose de la Evisceradora 1"]')!
    expect(panel).toBeTruthy()
    const ritmo = Array.from(panel.querySelectorAll<HTMLElement>('[data-zona="ritmo"] [data-fila]'))
    const suma = ritmo.reduce((a, f) => a + Number((Array.from(f.querySelectorAll('span')).find((s) => /^\d+ %$/.test(s.textContent ?? ''))?.textContent ?? '').replace(' %', '')), 0)
    expect(suma).toBe(60)
    expect(container.querySelector('[role="dialog"]')).toBeNull()
  })

  it('el ⓘ de carros abre la explicación de cada Baader (con perilla, la perilla; sin ella, la meta) y la línea no tiene ⓘ', () => {
    const { container } = renderFranja(turno(cyc(15), cyc(18)), null)
    /* Dos Baaders: dos ⓘ de carros, uno por fila de Baader; la fila de la línea no lleva pie. */
    expect(container.querySelectorAll(`button[aria-label="${ETQ_CARROS}"]`).length).toBe(2)
    fireEvent.click(botonInfo(container, ETQ_CARROS))
    const globo = container.querySelector<HTMLElement>('[role="dialog"][aria-label="Carros con pieza de la Evisceradora 1"]')!
    expect(globo.textContent).toContain('% de los carros llevaron pieza.')
    expect(globo.textContent).toContain('la perilla en 17')
    expect(botonInfo(container, ETQ_CARROS).getAttribute('aria-expanded')).toBe('true')
  })

  it('el pie «similar a la Baader» sale en cada Baader, no en la línea', () => {
    const { container } = renderFranja(turno(cyc(15), cyc(18)), null)
    expect(container.textContent!.split('similar a la Baader').length - 1).toBe(2)
  })
})
