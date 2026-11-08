/**
 * PlantKPIBoard en la piel Apple: conclusión con filete, cifras sin caja y
 * máquinas en tabla que se pliega. El hook de datos va mockeado; lo que se fija
 * acá es la forma, no el cálculo (eso lo cubren sus propios tests).
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { render, fireEvent } from '@testing-library/react'
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
    document.documentElement.removeAttribute('data-skin')
  })

  it('no es una tarjeta: la sección es la pantalla', () => {
    const { container } = render(<PlantKPIBoard {...props} />)
    expect(container.querySelector('section[aria-label="Indicadores de rendimiento"]')).not.toBeNull()
  })

  it('la conclusión trae «OEE sin calidad», la cifra y la composición', () => {
    const { container } = render(<PlantKPIBoard {...props} />)
    const texto = container.textContent ?? ''
    expect(texto).toContain('OEE sin calidad')
    expect(texto).toContain(`61,4${NBSP}%`)
    expect(texto).toContain(`Disponibilidad 78,8${NBSP}% por rendimiento 77,9${NBSP}%`)
  })

  it('nombra la máquina que más pierde con sus piezas y su parte por detenciones', () => {
    const { container } = render(<PlantKPIBoard {...props} />)
    const frase = container.textContent ?? ''
    // Evisceradora 3: 1.717 piezas perdidas, 1.500 de ellas por detenciones → 87 %.
    expect(frase).toContain('es la que más pierde: 1.717 piezas, el 87')
    expect(frase).toContain('por detenciones.')
  })

  it('las cuatro cifras de tiempo van sin caja, con su rótulo debajo', () => {
    const { container } = render(<PlantKPIBoard {...props} />)
    const texto = container.textContent ?? ''
    expect(texto).toContain('MTTR, baja es mejor')
    expect(texto).toContain('MTBF, alta es mejor')
    expect(texto).toContain('averías de 5 min o más')
    // fmtMin (helper compartido) escribe un decimal: «30,0 min», como «19,4 min» del MTTR.
    expect(texto).toContain('microdetenciones, 30,0 min en total, fuera del MTTR')
    expect(container.querySelector('.rounded-card')).toBeNull()
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

  it('el ícono de alcance va junto al rótulo OEE, no en una línea propia', () => {
    const { container } = render(<PlantKPIBoard {...props} />)
    const boton = container.querySelector('button[aria-label="Alcance de los indicadores"]')!
    expect(boton).toBeTruthy()
    // El botón comparte fila con el rótulo: su padre directo también contiene el texto «OEE sin calidad».
    expect(boton.parentElement?.textContent).toContain('OEE sin calidad')
    fireEvent.click(boton)
    expect(boton.getAttribute('aria-expanded')).toBe('true')
  })
})
