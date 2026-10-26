/**
 * Card de imputación del período: la serie y la tendencia.
 *
 * El punto de la card es responder «¿está mejorando?», no «¿cuánto va?»: un 60%
 * que viene de 20% es una buena noticia y uno que viene de 90% es una alarma.
 */
import { describe, it, expect } from 'vitest'
import { render, within } from '@testing-library/react'
import { ImputacionPeriodCard, tendenciaImputacion, topCausas, etiquetaDueno } from '../ImputacionPeriodCard'
import type { PeriodImputacion } from '@/services/grader/graderPeriodMonthlyStats'

const turno = (dateKey: string, cobertura: number) =>
  ({ dateKey, shiftId: 'Turno 1', cobertura, totalSec: 3600 })

const imp = (over: Partial<PeriodImputacion> = {}): PeriodImputacion => ({
  totalSec: 100 * 3600,
  imputadoSec: 90 * 3600,
  cobertura: 0.9,
  porTurno: [],
  topCategorias: [{ label: 'MMPP', durationSec: 40 * 3600 }],
  turnos: 12,
  ...over,
})

describe('tendenciaImputacion', () => {
  it('con menos de 6 turnos no afirma tendencia', () => {
    // Con 5 turnos la "tendencia" es ruido de dos o tres datos; decirla sería
    // peor que callarse.
    const pocos = ['08-01', '08-02', '08-03', '08-04', '08-05'].map((d, i) => turno(d, i / 10))
    expect(tendenciaImputacion(pocos)).toBeNull()
  })

  it('detecta mejora comparando la segunda mitad con la primera', () => {
    const serie = [0.2, 0.2, 0.3, 0.9, 0.95, 1].map((c, i) => turno(`2026-08-0${i + 1}`, c))
    const t = tendenciaImputacion(serie)
    expect(t?.dir).toBe('sube')
    expect(t!.deltaPts).toBeGreaterThan(50)
  })

  it('una diferencia menor a 5 puntos es "estable", no una mejora', () => {
    const serie = [0.90, 0.91, 0.90, 0.92, 0.93, 0.91].map((c, i) => turno(`2026-08-0${i + 1}`, c))
    expect(tendenciaImputacion(serie)?.dir).toBe('estable')
  })

  it('detecta caída', () => {
    const serie = [1, 0.95, 0.9, 0.3, 0.2, 0.1].map((c, i) => turno(`2026-08-0${i + 1}`, c))
    expect(tendenciaImputacion(serie)?.dir).toBe('baja')
  })
})

describe('ImputacionPeriodCard', () => {
  it('no se renderiza sin datos de imputación', () => {
    expect(render(<ImputacionPeriodCard imputacion={null} />).container.innerHTML).toBe('')
    expect(render(<ImputacionPeriodCard imputacion={imp({ totalSec: 0 })} />).container.innerHTML).toBe('')
  })

  it('muestra el porcentaje, el desglose y las categorías', () => {
    const { container } = render(<ImputacionPeriodCard imputacion={imp()} />)
    const txt = container.textContent ?? ''
    expect(txt).toContain('90%')
    expect(txt).toContain('con causal')
    expect(txt).toContain('10h sin anotar')
    expect(txt).toContain('en 12 turnos')
    expect(txt).toContain('MMPP')
  })

  it('dibuja un trazo por turno y anuncia la mejora', () => {
    const serie = [0.2, 0.25, 0.3, 0.9, 0.95, 1].map((c, i) => turno(`2026-08-0${i + 1}`, c))
    const { container } = render(<ImputacionPeriodCard imputacion={imp({ porTurno: serie })} />)
    const barras = container.querySelectorAll('div[title*="con causal ·"]')
    expect(barras).toHaveLength(6)
    expect(container.textContent).toContain('pts vs. la primera mitad')
    expect(container.textContent).toContain('▲')
  })

  it('rotula el nivel según la cobertura', () => {
    const bajo = render(<ImputacionPeriodCard imputacion={imp({ cobertura: 0.1 })} />)
    expect(within(bajo.container).getByTitle(/cuánto llegó con una causal/).textContent).toBe('Sin imputar')
    const alto = render(<ImputacionPeriodCard imputacion={imp({ cobertura: 0.97 })} />)
    expect(within(alto.container).getByTitle(/cuánto llegó con una causal/).textContent).toBe('Documentado')
  })
})

describe('topCausas (las 3 principales a la vista)', () => {
  const H = 3600
  const base = imp({
    totalSec: 100 * H,
    topCategorias: [
      { label: 'MMPP', durationSec: 31 * H, bucket: 'externo' },
      { label: 'Sin causal anotada', durationSec: 20 * H, bucket: 'sin-clasificar' },
      { label: 'Falla Mecánica', durationSec: 8 * H, bucket: 'mantencion' },
      { label: 'Operacionales', durationSec: 6 * H, bucket: 'externo' },
      { label: 'Paros Programados', durationSec: 3 * H, bucket: 'planificado' },
    ],
  })

  it('toma las 3 primeras, sin «Sin causal anotada», con % sobre el detenido total', () => {
    const t = topCausas(base)
    expect(t.map((c) => c.label)).toEqual(['MMPP', 'Falla Mecánica', 'Operacionales'])
    expect(t[0]!.frac).toBeCloseTo(0.31)
    expect(t[1]!.bucket).toBe('mantencion')
  })

  it('con menos de 3 muestra las que haya; con 0 no muestra nada', () => {
    expect(topCausas(imp({ topCategorias: [{ label: 'MMPP', durationSec: 3600, bucket: 'externo' }] }))).toHaveLength(1)
    expect(topCausas(imp({ topCategorias: [] }))).toEqual([])
    expect(topCausas(imp({ topCategorias: [{ label: 'Sin causal anotada', durationSec: 3600 }] }))).toEqual([])
  })

  it('etiqueta del dueño desde la taxonomía', () => {
    expect(etiquetaDueno('externo')).toBe('Externo · proceso / abastecimiento')
    expect(etiquetaDueno('mantencion')).toBe('Mantención · equipos')
    expect(etiquetaDueno(undefined)).toBeNull()
  })

  it('la card las dibuja y el plegable dice «Ver las N causales y lo sin anotar»', () => {
    const { container } = render(<ImputacionPeriodCard imputacion={base} />)
    const txt = container.textContent ?? ''
    expect(txt).toContain('Externo · proceso / abastecimiento')
    expect(txt).toContain('31%')
    expect(txt).toContain('Ver las 5 causales y lo sin anotar')
    expect(container.querySelectorAll('ul[aria-label] li')).toHaveLength(3)
  })
})
