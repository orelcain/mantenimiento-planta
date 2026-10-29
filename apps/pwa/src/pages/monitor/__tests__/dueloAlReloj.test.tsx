/**
 * El Duelo «calmo» al cuadro del reloj único (spec SPEC_MONITOR_EN_VIVO_COLA §2): las hechas de hoy, las del rival a la misma hora
 * y la cabeza de la curva salen del cuadro de la cola de reproducción, no del contador vivo (que va 2-4 min adelante).
 */
import { act, render } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { PublicMonitorLive, ShiftStat } from '@/services/shoplogix/publicShiftMonitor.service'
import type { DatosDuelo } from '../duelo'
import { construirDuelo } from '../duelo'
import { datosAlReloj } from '../dueloAlReloj'
import { DueloCalmo } from '../DueloCalmo'
import type { CarreraViva } from '../useCarreraViva'
import { ReproduccionCtx, type Reproduccion } from '../useReproduccionMinuto'
import type { CuadroReloj, RelojDeDatos } from '../useRelojDeDatos'

/* La carrera se pinta en SVG de tamaño medido y el detalle es una hoja: aquí solo importa el `d` que reciben. */
vi.mock('../CarreraCalma', () => ({
  CarreraCalma: ({ d }: { d: DatosDuelo }) => (
    <span data-t="carrera" data-hoy={d.carrera?.hoyPz} data-rival={d.carrera?.fantasmaPz} data-dif={d.carrera?.diferencia} data-cabeza={d.carrera?.hoy.at(-1)?.pieces} data-cabeza-min={d.carrera?.hoy.at(-1)?.minutes} />
  ),
}))
vi.mock('../DetalleDuelo', () => ({ DetalleDuelo: () => null }))

const tras = (inicio: string, min: number) => new Date(Date.parse(inicio) + min * 60_000).toISOString()
const INICIO = '2026-11-02T07:00:00.000Z'
const live = {
  scheduledStart: INICIO,
  plannedEnd: '2026-11-02T15:00:00.000Z',
  totalPieces: 3980,
  series: [{ t: tras(INICIO, 10), pieces: 1000 }, { t: tras(INICIO, 15), pieces: 1000 }, { t: tras(INICIO, 20), pieces: 1000 }, { t: tras(INICIO, 25), pieces: 980 }],
  timeBreakdown: { producingMin: 100, windowMin: 120, plannedMin: 0, recoverableMin: 0, planned: [{ reason: 'COLACION', min: 30, count: 1 }], recoverable: [] },
  mantencion: { porMaquina: [{ microMin: 2 }] },
  machines: [{ name: 'Evisceradora 1', pieces: 3980, targetCpm: 19, uptimeSec: 6000 }],
  stopReasons: ['COLACION', 'FALTA MMPP'],
  stopEvents: [],
} as unknown as PublicMonitorLive
const noche = {
  shiftDocId: '2026-11-01_Turno Noche', dateKey: '2026-11-01', shiftId: 'Turno Noche', h0: '21:00',
  curve: [{ m: 5, p: 800 }, { m: 10, p: 1700 }, { m: 15, p: 2500 }, { m: 20, p: 3300 }, { m: 480, p: 10000 }], total: 10000, producingMin: 400,
}
const statNoche: ShiftStat = {
  shiftDocId: '2026-11-01_Turno Noche', dateKey: '2026-11-01', shiftId: 'Turno Noche', total: 10000, producingMin: 400, windowMin: 480, plannedMin: 60, recoverableMin: 0, recoverable: [],
  duelo: { h0: '21:00', ini: 10, uh: 1500, mic: 30, alim: [{ n: 'Evisceradora 1', f: 90 }] },
}
const curvaHoy = [{ minutes: 5, pieces: 1000 }, { minutes: 10, pieces: 2000 }, { minutes: 15, pieces: 3000 }, { minutes: 20, pieces: 3980 }]

function armar(cerrado = false): DatosDuelo {
  return construirDuelo({
    shiftDocId: '2026-11-02_Turno Dia', live, piezas: 3980, cerrado, curvaHoy, stats: [statNoche], forecast: [], rivalCurve: noche,
  })!
}

/* Un cuadro del reloj de la cola a los 17 min de producción: 3.600 hechas (el contador vivo ya dice 3.980). */
const INI_MS = Date.parse(INICIO) // hora de planta de la primera pieza (el origen de los minutos de producción)
const MIN17 = INI_MS + 17 * 60_000
const viva = (p: Partial<CarreraViva> = {}): CarreraViva => ({ hechas: 3600, rival: 2820, hora: 1, min: 17, ...p })

describe('datosAlReloj: la carrera puesta en el instante del cuadro', () => {
  it('hechas de hoy, rival a la misma hora, diferencia y cabeza de la curva salen del cuadro', () => {
    const d = armar()
    expect(d.carrera?.hoyPz).toBe(3980)
    const r = datosAlReloj(d, viva())
    expect(r.carrera?.hoyPz).toBe(3600)
    expect(r.hoy.piezas).toBe(3600)
    expect(r.carrera?.fantasmaPz).toBe(2820)
    expect(r.carrera?.diferencia).toBe(780)
    expect(r.carrera?.minuto).toBe(17)
    expect(r.carrera?.hora).toBe(1)
    /* la cabeza reemplaza el tramo final: lo posterior al cuadro (el minuto 20 del contador) no está en la curva */
    expect(r.carrera?.hoy).toEqual([{ minutes: 5, pieces: 1000 }, { minutes: 10, pieces: 2000 }, { minutes: 15, pieces: 3000 }, { minutes: 17, pieces: 3600 }])
    const ult = r.carrera!.ventaja[r.carrera!.ventaja.length - 1]!
    expect(ult).toMatchObject({ minuto: 17, lider: 'cardenas', ventaja: 780 })
    expect(r.marcador?.kpis[0]!.ganador).toBe('a')
    /* no muta lo recibido */
    expect(d.carrera?.hoyPz).toBe(3980)
    expect(d.carrera?.hoy.at(-1)).toEqual({ minutes: 20, pieces: 3980 })
  })

  it('sin cuadro, con el turno cerrado o sin minuto del cuadro devuelve el mismo objeto', () => {
    const d = armar()
    expect(datosAlReloj(d, null)).toBe(d)
    expect(datosAlReloj(d, viva({ hechas: null }))).toBe(d)
    expect(datosAlReloj(d, viva({ min: null }))).toBe(d)
    expect(datosAlReloj(d, viva({ min: 0 }))).toBe(d)
    const cerrado = armar(true)
    expect(datosAlReloj(cerrado, viva())).toBe(cerrado)
  })

  it('sin curva del rival en el cuadro conserva la cifra de siempre del rival', () => {
    const d = armar()
    const r = datosAlReloj(d, viva({ rival: null }))
    expect(r.carrera?.fantasmaPz).toBe(d.carrera?.fantasmaPz)
    expect(r.carrera?.hoyPz).toBe(3600)
  })
})

describe('DueloCalmo bajo el reloj único', () => {
  let cuadro: CuadroReloj
  const oyentes = new Set<(c: CuadroReloj) => void>()
  const reloj: RelojDeDatos = {
    cuadro: () => cuadro, alCuadro: (fn) => { oyentes.add(fn); return () => { oyentes.delete(fn) } }, version: 0, detenida: false, reducido: false,
  }
  const poner = (valor: number, atMs: number): CuadroReloj => ({ valor, frac: 1, previa: null, ultima: { atMs, valor } as CuadroReloj['ultima'], atrasada: false })
  const rep = (activa: boolean): Reproduccion => ({ activa, reloj, minuto: null, tope: null })
  const extra = { live, stats: [statNoche], serieHoy: null, series: null, lectura: null, semilla: [] }
  const montar = (d: DatosDuelo, r: Reproduccion | null) => render(
    <ReproduccionCtx.Provider value={r}>
      <DueloCalmo datos={d} nombres={{}} unidad={null} inicioMs={INI_MS} extra={extra} />
    </ReproduccionCtx.Provider>,
  )

  beforeEach(() => {
    oyentes.clear()
    cuadro = poner(3600, MIN17)
    ;(globalThis as { ResizeObserver?: unknown }).ResizeObserver = class { observe() {} unobserve() {} disconnect() {} }
  })
  afterEach(() => { vi.restoreAllMocks() })

  it('con reproducción activa, la carrera y el marcador dicen lo del cuadro, no el contador vivo', () => {
    const { container } = montar(armar(), rep(true))
    const c = container.querySelector('[data-t="carrera"]')!
    expect(c.getAttribute('data-hoy')).toBe('3600')
    expect(c.getAttribute('data-rival')).toBe('2820')
    expect(c.getAttribute('data-dif')).toBe('780')
    expect(c.getAttribute('data-cabeza')).toBe('3600')
    expect(container.textContent).toContain('780 adelante')
  })

  it('sigue al reloj: un cuadro nuevo con otro entero rehace la carrera', () => {
    const { container } = montar(armar(), rep(true))
    act(() => {
      cuadro = poner(3650, MIN17 + 60_000)
      oyentes.forEach((fn) => fn(cuadro))
    })
    const c = container.querySelector('[data-t="carrera"]')!
    expect(c.getAttribute('data-hoy')).toBe('3650')
    expect(c.getAttribute('data-cabeza-min')).toBe('18')
  })

  it('sin proveedor o con reproducción inactiva queda el contador vivo de siempre', () => {
    for (const r of [null, rep(false)]) {
      const { container, unmount } = montar(armar(), r)
      const c = container.querySelector('[data-t="carrera"]')!
      expect(c.getAttribute('data-hoy')).toBe('3980')
      expect(c.getAttribute('data-rival')).toBe('3300')
      unmount()
    }
  })

  it('con el turno cerrado no usa el reloj aunque esté activo', () => {
    const { container } = montar(armar(true), rep(true))
    expect(container.querySelector('[data-t="carrera"]')!.getAttribute('data-hoy')).toBe('3980')
  })
})
