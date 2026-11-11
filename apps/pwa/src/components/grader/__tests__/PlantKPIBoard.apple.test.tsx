/**
 * PlantKPIBoard en la piel Apple (modo lectura): titular, una frase con el OEE y
 * las máquinas en tabla con filete que se pliega. El hook de datos va mockeado; lo que se fija
 * acá es la forma, no el cálculo (eso lo cubren sus propios tests).
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { render, fireEvent, cleanup } from '@testing-library/react'
import { PlantKPIBoard } from '../PlantKPIBoard'
import type { PlantKPIs } from '@/services/grader/plantKpiCompute'

const NBSP = String.fromCharCode(160)

const kpisFixture = {
  dateKey: '2026-11-04',
  shiftId: 'Turno 1',
  periodLabel: 'Mes',
  shiftsCount: 12,
  availability: 0.788,
  performance: 0.779,
  quality: null,
  oee: null,
  mttrMin: 19.4,
  mtbfHours: 1.3,
  failureCount: 14,
  microCount: 148,
  microMin: 30,
  machines: [
    { machineid: 'm1', machineName: 'Evisceradora 1', availability: 0.78, performance: 0.75, mttrMin: 21.9, failureCount: 4, totalCycles: 900, lostBySpeed: 200, lostByStops: 300, shoplogixTargetCpm: 18 },
    { machineid: 'm2', machineName: 'Evisceradora 2', availability: 0.8, performance: 0.82, mttrMin: 14.6, failureCount: 6, totalCycles: 950, lostBySpeed: 50, lostByStops: 100, shoplogixTargetCpm: 16 },
    { machineid: 'm3', machineName: 'Evisceradora 3', availability: 0.78, performance: 0.77, mttrMin: 21.7, failureCount: 4, totalCycles: 880, lostBySpeed: 217, lostByStops: 1500, shoplogixTargetCpm: 16 },
  ],
} as unknown as PlantKPIs

vi.mock('@/hooks/usePlantKPIs', () => ({
  usePlantKPIsForPeriod: () => ({ loading: false, error: null, kpis: kpisFixture }),
}))

const props = {
  plantSlug: 'chonchi' as never,
  graderSummaries: [],
  enabled: true,
  currentMonth: new Date(2026, 10, 1),
}

describe('PlantKPIBoard · piel Apple', () => {
  beforeEach(() => {
    document.documentElement.setAttribute('data-skin', 'apple')
  })
  afterEach(() => {
    cleanup()
    document.documentElement.removeAttribute('data-skin')
  })

  it('modo lectura: un titular h1 y «Por máquina» como sección con filete, sin tarjeta', () => {
    const { container } = render(<PlantKPIBoard {...props} />)
    expect(container.querySelector('h1')).not.toBeNull()
    const maquinas = container.querySelector('[data-testid="kpi-maquinas"]')!
    expect(maquinas.tagName).toBe('SECTION')
    expect(maquinas.className).toContain('border-t')
    expect(maquinas.querySelector('h2')?.textContent).toBe('Por máquina')
    // La tabla es de lectura: sin marco ni banda de encabezado.
    expect(maquinas.querySelector('.rounded-ctl.border')).toBeNull()
    expect(maquinas.querySelector('thead')?.className).not.toContain('bg-muted')
    expect(container.querySelector('.rounded-card')).toBeNull()
  })

  it('el titular nombra la máquina que más pierde con sus piezas y su parte por detenciones', () => {
    const { container } = render(<PlantKPIBoard {...props} />)
    // Evisceradora 3: 1.717 piezas perdidas, 1.500 de ellas por detenciones → 87 %.
    expect(container.querySelector('h1')?.textContent).toContain('es la que más pierde: 1.717 piezas, el 87')
  })

  it('la frase trae «OEE sin calidad», la cifra, la composición, MTTR y MTBF', () => {
    const { container } = render(<PlantKPIBoard {...props} />)
    const texto = container.textContent ?? ''
    expect(texto).toContain(`OEE sin calidad 61,4${NBSP}%: disponibilidad 78,8${NBSP}% por rendimiento 77,9${NBSP}%.`)
    expect(texto).toContain('MTTR 19,4 min y MTBF 1,3 h.')
  })

  it('la máquina que más pierde va en tinta crítica y la nota cuenta averías y micro', () => {
    const { container } = render(<PlantKPIBoard {...props} />)
    const filas = container.querySelectorAll('[data-testid="kpi-maquinas"] tbody tr:not([hidden])')
    expect(filas[2]!.className).toContain('text-ink-crit')
    expect(filas[0]!.className).not.toContain('text-ink-crit')
    const texto = container.textContent ?? ''
    expect(texto).toContain('14 averías, 148 micro.')
    // fmtMin (helper compartido) escribe un decimal: «30,0 min», como «19,4 min» del MTTR.
    expect(texto).toContain('Las microdetenciones suman 30,0 min y van fuera del MTTR.')
  })

  it('las máquinas van en tabla plegable: los botones traen aria-expanded', () => {
    const { container } = render(<PlantKPIBoard {...props} />)
    const botones = container.querySelectorAll('tbody button')
    expect(botones).toHaveLength(3)
    botones.forEach((b) => expect(b.getAttribute('aria-expanded')).toBe('false'))
  })

  it('al abrir una máquina aparecen sus detenciones y su velocidad nominal', () => {
    const { container } = render(<PlantKPIBoard {...props} />)
    const boton = container.querySelectorAll('tbody button')[0]!
    fireEvent.click(boton)
    const detalle = document.getElementById(boton.getAttribute('aria-controls')!)!
    expect(detalle.textContent).toContain('Detenciones')
    expect(detalle.textContent).toContain('18,0 pz/min')
  })

  it('no trae su propio selector de período: lo lleva la página, arriba', () => {
    const { container } = render(<PlantKPIBoard {...props} />)
    expect(container.querySelector('[role="tablist"]')).toBeNull()
  })

  it('el ícono de alcance va en la frase del OEE, no en una línea propia', () => {
    const { container } = render(<PlantKPIBoard {...props} />)
    const boton = container.querySelector('button[aria-label="Alcance de los indicadores"]')!
    expect(boton).toBeTruthy()
    // El botón comparte fila con el rótulo: su padre directo también contiene el texto «OEE sin calidad».
    expect(boton.parentElement?.textContent).toContain('OEE sin calidad')
    fireEvent.click(boton)
    expect(boton.getAttribute('aria-expanded')).toBe('true')
  })
})
