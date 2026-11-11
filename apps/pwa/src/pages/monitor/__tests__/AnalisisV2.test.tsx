/**
 * La pestaña Análisis con datos de ejemplo: las cinco preguntas, el cuadre con «Tiempo perdido» de El turno (misma suma de
 * `perdidas`), los globos que explican cada dato (hover y toque) y que cada tarjeta abre su detalle.
 */
import { cleanup, fireEvent, render, screen, within } from '@testing-library/react'
import { afterEach, beforeAll, describe, expect, it } from 'vitest'
import { AnalisisV2, type AnalisisV2Props } from '../AnalisisV2'
import type { HourlyRow } from '@/services/shoplogix/monitorHourly'
import type { FallaRepetidaMonitor, FallaRepetidaSemana } from '@/services/shoplogix/publicShiftMonitor.service'
import fixture from './fixtures/fallas_mantencion_semanas_2026-11-02.json'
import { PROHIBIDAS } from './vocabulario'

beforeAll(() => {
  if (!window.matchMedia) {
    window.matchMedia = ((q: string) => ({ matches: false, media: q, addEventListener: () => {}, removeEventListener: () => {}, addListener: () => {}, removeListener: () => {}, onchange: null, dispatchEvent: () => false })) as unknown as typeof window.matchMedia
  }
})
afterEach(cleanup)

const iso = (h: number, m = 0) => new Date(Date.UTC(2026, 9, 28, h, m)).toISOString()
const fila = (i: number, pieces: number, partial = false, cubre = 60): HourlyRow => ({
  hourStart: iso(7 + i, 15), index: i + 1, from: iso(7 + i, 15), to: iso(7 + i, 15 + cubre), pieces,
  minutesCovered: cubre, piecesPerHour: Math.round((pieces / cubre) * 60), partial,
})

const base = (): AnalisisV2Props => ({
  pareto: {
    rows: [
      { label: 'Falta MMPP Flujo Acopio', minutes: 80, piezas: 2760, shifts: 2, count: 2, sharePct: 36, cumPct: 36, dueno: 'externo' },
      { label: 'Micro Detencion', minutes: 23, piezas: 879, shifts: 9, count: 30, sharePct: 10, cumPct: 46, dueno: 'sin-imputar' },
      { label: 'GRADER', minutes: 10, piezas: 399, shifts: 1, count: 1, sharePct: 4, cumPct: 50, dueno: 'mantencion' },
    ],
    totalMin: 222, totalPiezas: 8256, shifts: 10, porDueno: { mantencion: 21, externo: 100, 'sin-imputar': 101 },
  } as AnalisisV2Props['pareto'],
  semanas: [
    { semana: '2026-10-19', turnos: 5, piezas: 1, min: { mantencion: 30, externo: 128, 'sin-imputar': 83 }, pz: { mantencion: 0, externo: 0, 'sin-imputar': 0 }, causas: { mantencion: [], externo: [], 'sin-imputar': [] }, detalle: [] },
    { semana: '2026-10-26', turnos: 2, piezas: 1, min: { mantencion: 9, externo: 9, 'sin-imputar': 207 }, pz: { mantencion: 0, externo: 0, 'sin-imputar': 0 }, causas: { mantencion: [], externo: [], 'sin-imputar': [] }, detalle: [] },
  ],
  hoy: '2026-10-28',
  horas: [fila(0, 2163), fila(1, 804), fila(2, 853, true, 26)],
  metaPorHora: 1935,
  perdidas: [{ dueno: 'mantencion', min: 9 }, { dueno: 'externo', min: 1 }, { dueno: 'sin-imputar', min: 67 }],
  causas: [
    { causa: 'Detencion', min: 60, dueno: 'sin-imputar', veces: 1 },
    { causa: 'KNURO', min: 7, dueno: 'mantencion', veces: 3 },
  ],
  eventos: [{ maquina: 'Evisceradora 1', desde: iso(8, 20), hasta: iso(8, 26), min: 6, causa: 'KNURO', causas: ['KNURO'] }],
  mant: { fallas: 5, fallaMin: 26, mttr: 5.2, mttrPrevio: 12.8, dispPct: 90 },
  cerrado: false,
  vista: 0,
  onVista: () => {},
})

describe('AnalisisV2', () => {
  it('muestra los dos bloques con las cinco preguntas', () => {
    render(<AnalisisV2 {...base()} />)
    expect(screen.getByRole('region', { name: 'Este turno' })).toBeTruthy()
    expect(screen.getByRole('region', { name: 'Lo que se repite' })).toBeTruthy()
    for (const q of ['¿Cómo vamos hora a hora?', '¿Cuánto se detuvo la línea hoy?', '¿Qué causa nos quita más tiempo y cuál vuelve siempre?', '¿Cuánto pesa Mantención en lo perdido?', '¿De quién fue lo perdido cada semana?']) {
      expect(screen.getByRole('heading', { name: q })).toBeTruthy()
    }
  })

  it('cuadra: la cifra de detenciones es la suma de `perdidas` (lo mismo que «Tiempo perdido» de El turno)', () => {
    render(<AnalisisV2 {...base()} />)
    const t2 = screen.getByRole('article', { name: 'Detenciones de hoy' })
    expect(within(t2).getByText('1 h 17')).toBeTruthy() // 9 + 1 + 67 = 77 min
  })

  it('la hora en curso se compara con la meta a esta hora (1.935 × 26 ÷ 60 = 839) y la peor hora sale «atrás»', () => {
    render(<AnalisisV2 {...base()} />)
    const t1 = screen.getByRole('article', { name: 'Hora por hora' })
    expect(within(t1).getByText(/3\.ª hora: 853 de 839/)).toBeTruthy()
    expect(within(t1).getAllByText(/1\.131 atrás/).length).toBeGreaterThan(0)
  })

  it('no inventa: sin meta no hay «adelante/atrás»', () => {
    render(<AnalisisV2 {...base()} metaPorHora={null} />)
    const t1 = screen.getByRole('article', { name: 'Hora por hora' })
    expect(within(t1).queryAllByText(/atrás|adelante/).length).toBe(0)
  })

  it('«acumulado» se escribe entero y su globo explica con el valor concreto (toque)', () => {
    render(<AnalisisV2 {...base()} />)
    expect(screen.queryByText(/\bacum\b/i)).toBeNull()
    const rotulo = screen.getAllByRole('button', { name: 'acumulado' })[0]!
    fireEvent.pointerDown(rotulo, { pointerType: 'touch' })
    fireEvent.click(rotulo, { detail: 1 })
    const tip = screen.getByRole('tooltip')
    expect(tip.textContent).toMatch(/esa causa y las de arriba sobre las 1,9 h perdidas en los últimos 10 turnos/)
    fireEvent.pointerDown(document.body)
    expect(screen.queryByRole('tooltip')).toBeNull()
  })

  it('el globo se abre con hover del mouse', () => {
    render(<AnalisisV2 {...base()} />)
    const rotulo = screen.getByRole('button', { name: 'Respuesta de Mantención' })
    fireEvent.pointerEnter(rotulo, { pointerType: 'mouse' })
    expect(screen.getByRole('tooltip').textContent).toMatch(/Hoy 5,2 min, turnos previos 12,8 min/)
    fireEvent.pointerLeave(rotulo, { pointerType: 'mouse' })
    expect(screen.queryByRole('tooltip')).toBeNull()
  })

  it('«Ver detalle» abre el detalle con la pregunta y la evidencia numerada', () => {
    render(<AnalisisV2 {...base()} />)
    fireEvent.click(screen.getByRole('button', { name: 'Ver detalle: detenciones de hoy' }))
    expect(screen.getAllByText('¿Cuánto se detuvo la línea hoy y de quién fue?').length).toBeGreaterThan(0)
    /* En PC la sección sale también en el índice del costado (DetalleExpedientePC). */
    expect(screen.getAllByText('Cada falla de equipo').length).toBeGreaterThan(0)
    expect(screen.getByText(/Evisceradora 1 · 08:20–08:26/)).toBeTruthy()
  })
})

describe('Tarjeta «¿Tras una falla de máquina (Mantención), viene otra antes de 2 h?»', () => {
  const tarjeta = { name: 'Fallas repetidas de Mantención' }
  const verDetalle = { name: 'Ver detalle: fallas repetidas de Mantención' }
  const frCon = (semanas?: FallaRepetidaSemana[]): FallaRepetidaMonitor => ({ meses: [], causas: [], avisos: [], desde: null, calculadoEl: null, semanas })
  /** Con el `hoy` del fixture: lunes 2026-11-02, la semana en curso. */
  const conFallas = (semanas?: FallaRepetidaSemana[]): AnalisisV2Props => ({ ...base(), hoy: '2026-11-02', fallaRepetida: frCon(semanas) })
  const chonchi: FallaRepetidaSemana[] = fixture.chonchi
  const yal: FallaRepetidaSemana[] = fixture.yal

  it('Chonchi: 9 % contra 37 %, «Mejor», −28 pts y la raya del promedio de 9 meses', () => {
    render(<AnalisisV2 {...conFallas(chonchi)} />)
    const card = screen.getByRole('article', tarjeta)
    expect(within(card).getByText('¿Tras una falla de máquina (Mantención), viene otra antes de 2 h?')).toBeTruthy()
    expect(within(card).getByText('9')).toBeTruthy()
    expect(within(card).getByText('% tuvo otra en la misma Baader')).toBeTruthy()
    expect(within(card).getByText('Mejor que las 4 semanas anteriores')).toBeTruthy()
    expect(card.querySelector('.an-ref')?.textContent).toBe('−28 pts contra las 4 semanas anteriores (37 %)')
    expect(within(card).getByText('Últimas 4 semanas')).toBeTruthy()
    expect(within(card).getByText('05-10 al 01-11 · 4 de 44')).toBeTruthy()
    expect(within(card).getByText('9 %')).toBeTruthy()
    expect(within(card).getByText('4 semanas antes')).toBeTruthy()
    expect(within(card).getByText('07-09 al 04-10 · 13 de 35')).toBeTruthy()
    expect(within(card).getByText('37 %')).toBeTruthy()
    expect(within(card).getByText('promedio de 9 meses: 26 %')).toBeTruthy()
  })

  it('Yal: 24 % contra 7 %, «Peor», +17 pts', () => {
    render(<AnalisisV2 {...conFallas(yal)} />)
    const card = screen.getByRole('article', tarjeta)
    expect(within(card).getByText('24')).toBeTruthy()
    expect(within(card).getByText('Peor que las 4 semanas anteriores')).toBeTruthy()
    expect(card.querySelector('.an-ref')?.textContent).toBe('+17 pts contra las 4 semanas anteriores (7 %)')
    expect(within(card).getByText('7 %')).toBeTruthy()
  })

  it('sin `semanas` no hay tarjeta', () => {
    render(<AnalisisV2 {...conFallas(undefined)} />)
    expect(screen.queryByRole('article', tarjeta)).toBeNull()
  })

  it('sin `fallaRepetida` del backend no hay tarjeta', () => {
    render(<AnalisisV2 {...base()} />)
    expect(screen.queryByRole('article', tarjeta)).toBeNull()
  })

  it('«Ver detalle» abre el panel con las semanas: la en curso fuera de la cifra y el resumen de 4 y 4', () => {
    render(<AnalisisV2 {...conFallas(chonchi)} />)
    fireEvent.click(screen.getByRole('button', verDetalle))
    expect(screen.getByText('Semana a semana · fallas de más de 5 min')).toBeTruthy()
    expect(screen.getByText('Semana del 02-11 · en curso')).toBeTruthy()
    expect(screen.getByText('Semana del 26-10')).toBeTruthy()
    expect(screen.getByText('Semana del 28-09')).toBeTruthy()
    expect(screen.getByText('Últimas 4')).toBeTruthy()
    expect(screen.getByText('4 antes')).toBeTruthy()
    expect(screen.getByText('La semana en curso no entra en la cifra.')).toBeTruthy()
    expect(screen.getByText('Una semana sola va de 0 a 52 %: por eso la tarjeta suma 4.')).toBeTruthy()
  })

  it('ningún texto nuevo casa con PROHIBIDAS ni dice «desvío»', () => {
    render(<AnalisisV2 {...conFallas(chonchi)} />)
    const card = screen.getByRole('article', tarjeta)
    expect(PROHIBIDAS.test(card.textContent ?? '')).toBe(false)
    expect(card.textContent).not.toMatch(/desvío/i)
    fireEvent.click(screen.getByRole('button', verDetalle))
    const panel = screen.getByRole('dialog')
    expect(PROHIBIDAS.test(panel.textContent ?? '')).toBe(false)
    expect(panel.textContent).not.toMatch(/desvío/i)
  })
})
