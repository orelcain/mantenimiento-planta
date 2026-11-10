/**
 * Período único (piel Apple): Día/Semana/Mes y «‹ fecha ›». La navegación mueve la
 * referencia un día, siete días o un mes, y la etiqueta cambia con el período.
 */
import { describe, it, expect, vi, afterEach } from 'vitest'
import { render, fireEvent, screen, cleanup } from '@testing-library/react'
import { PeriodoNavegador } from '../PeriodoNavegador'
import { desplazarPeriodo, etiquetaPeriodo, fechaDeClave, claveDeFecha } from '@/services/grader/periodoNavegacion'

const ref = new Date(2026, 10, 7, 12) // 7 de noviembre de 2026

afterEach(() => cleanup())

describe('PeriodoNavegador · piel Apple', () => {
  it('en día muestra la fecha corta: «7 nov»', () => {
    render(<PeriodoNavegador period="day" onPeriodChange={() => {}} referencia={ref} onStep={() => {}} />)
    expect(screen.getByText('7 nov')).toBeTruthy()
  })

  it('en semana muestra el rango de siete días que termina en la referencia', () => {
    render(<PeriodoNavegador period="week" onPeriodChange={() => {}} referencia={ref} onStep={() => {}} />)
    expect(screen.getByText('1 al 7 nov')).toBeTruthy()
  })

  it('en mes muestra el mes completo', () => {
    render(<PeriodoNavegador period="month" onPeriodChange={() => {}} referencia={ref} onStep={() => {}} />)
    expect(screen.getByText('Noviembre 2026')).toBeTruthy()
  })

  it('las flechas emiten el sentido del paso', () => {
    const onStep = vi.fn()
    render(<PeriodoNavegador period="day" onPeriodChange={() => {}} referencia={ref} onStep={onStep} />)
    fireEvent.click(screen.getByRole('button', { name: 'Período anterior' }))
    fireEvent.click(screen.getByRole('button', { name: 'Período siguiente' }))
    expect(onStep).toHaveBeenNthCalledWith(1, -1)
    expect(onStep).toHaveBeenNthCalledWith(2, 1)
  })

  it('las flechas miden 44 px como mínimo', () => {
    render(<PeriodoNavegador period="day" onPeriodChange={() => {}} referencia={ref} onStep={() => {}} />)
    expect(screen.getByRole('button', { name: 'Período anterior' }).className).toContain('size-11')
  })

  it('el período va como texto: tres botones y el elegido marcado (modo lectura)', () => {
    render(<PeriodoNavegador period="week" onPeriodChange={() => {}} referencia={ref} onStep={() => {}} />)
    const grupo = screen.getByRole('group', { name: 'Período del análisis' })
    const botones = Array.from(grupo.querySelectorAll('button'))
    expect(botones.map((b) => b.textContent)).toEqual(['Día', 'Semana', 'Mes'])
    expect(botones.map((b) => b.getAttribute('aria-pressed'))).toEqual(['false', 'true', 'false'])
    // Sin cápsula: ni lista de pestañas ni fondo.
    expect(document.querySelector('[role="tablist"]')).toBeNull()
    botones.forEach((b) => expect(b.className).toContain('min-h-11'))
  })

  it('cambiar el período emite el período elegido', () => {
    const onPeriodChange = vi.fn()
    render(<PeriodoNavegador period="day" onPeriodChange={onPeriodChange} referencia={ref} onStep={() => {}} />)
    fireEvent.click(screen.getByText('Mes'))
    expect(onPeriodChange).toHaveBeenCalledWith('month')
  })
})

describe('periodoNavegacion · cálculo del período', () => {
  it('un día hacia adelante desde el 30 de noviembre cae el 1 de diciembre', () => {
    const f = desplazarPeriodo(new Date(2026, 10, 30, 12), 'day', 1)
    expect(claveDeFecha(f)).toBe('2026-12-01')
  })

  it('una semana hacia atrás desde el 7 de noviembre cae el 31 de octubre', () => {
    const f = desplazarPeriodo(ref, 'week', -1)
    expect(claveDeFecha(f)).toBe('2026-10-31')
  })

  it('un mes hacia atrás desde noviembre cae en octubre', () => {
    const f = desplazarPeriodo(ref, 'month', -1)
    expect(claveDeFecha(f)).toBe('2026-10-01')
  })

  it('una semana que cruza de mes lo dice: «28 oct al 3 nov»', () => {
    expect(etiquetaPeriodo(new Date(2026, 10, 3, 12), 'week')).toBe('28 oct al 3 nov')
  })

  it('la clave de fecha se lee como día local, sin corrimiento', () => {
    expect(claveDeFecha(fechaDeClave('2026-11-07'))).toBe('2026-11-07')
  })
})
