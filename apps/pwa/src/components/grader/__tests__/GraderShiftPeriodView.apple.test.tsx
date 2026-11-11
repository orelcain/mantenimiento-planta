/**
 * Turnos del período en la piel Apple (vista + matriz): sin tarjeta, mes con su
 * nombre sin «De», rótulos completos del segmentado, totales legibles y el
 * turno fijado como texto. Con la piel anterior, la forma de siempre.
 */
import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import { render, fireEvent, cleanup } from '@testing-library/react'
import { GraderShiftPeriodView } from '../GraderShiftPeriodView'

const NBSP = String.fromCharCode(160)

function turno(dia: number, shiftId: string, cycles: number, uptime: number): Record<string, unknown> {
  const dk = `2026-11-${String(dia).padStart(2, '0')}`
  return {
    key: `${dk}__${shiftId}`,
    dateKey: dk,
    shiftId,
    start: new Date(`${dk}T07:00:00Z`),
    end: new Date(`${dk}T15:00:00Z`),
    windowSource: 'effective',
    startDayOffset: 0,
    endDayOffset: 0,
    crossesMidnight: false,
    endDateKey: null,
    durationMin: 480,
    cycles,
    attributedCycles: 0,
    uptimePct: uptime,
    pieces: 1000,
    p0Pct: 1.5,
    hasGrader: true,
    lowActivity: false,
    unscheduled: false,
  }
}

const shifts = [
  turno(2, 'Turno 1', 20000, 80),
  turno(3, 'Turno 1', 18000, 70),
]
const rows = ['Turno 1']
const days = ['2026-11-02', '2026-11-03']
const byKey = new Map(shifts.map((s) => [s.key as string, s as never]))

function vista(props: Partial<Parameters<typeof GraderShiftPeriodView>[0]> = {}) {
  return render(
    <GraderShiftPeriodView
      shifts={shifts as never}
      rows={rows}
      days={days}
      byKey={byKey as never}
      month={new Date(2026, 10, 1)}
      onMonthChange={() => {}}
      {...props}
    />,
  )
}

describe('GraderShiftPeriodView · piel Apple', () => {
  beforeEach(() => {
    document.documentElement.setAttribute('data-skin', 'apple')
  })
  afterEach(() => {
    cleanup()
    document.documentElement.removeAttribute('data-skin')
  })

  it('no trae su propio selector de mes: el período único de la página lo mueve', () => {
    const { container } = vista()
    const texto = container.textContent ?? ''
    expect(texto).not.toContain('Hoy')
    expect(container.querySelector('button[aria-label="Mes anterior"]')).toBeNull()
    expect(container.querySelector('button[aria-label="Mes siguiente"]')).toBeNull()
  })

  it('el segmentado trae los rótulos completos, no las abreviaturas que se cortaban', () => {
    const { container } = vista()
    const texto = container.textContent ?? ''
    expect(texto).toContain('Ciclos')
    expect(texto).toContain('Uptime')
    expect(texto).toContain('Piezas')
    expect(texto).toContain('P0 %')
    expect(texto).not.toContain('UPT')
    expect(texto).not.toContain('Pzs OK')
  })

  it('la matriz no se dibuja como tarjeta: el Card de la UI va sin borde ni fondo', () => {
    const { container } = vista()
    expect(container.querySelector('[class*="!bg-transparent"]')).not.toBeNull()
    expect(container.querySelector('[class*="!border-0"]')).not.toBeNull()
  })

  it('la fila de cierre lleva Σ 24 h con los totales por día', () => {
    const { container } = vista()
    const texto = (container.textContent ?? '').split(NBSP).join(' ')
    expect(texto).toContain('Σ 24 h')
    expect(texto).toContain('20.000')
  })

  it('la grilla usa columnas de ancho fijo para que las cifras no se monten', () => {
    const { container } = vista()
    const grilla = Array.from(container.querySelectorAll('div')).find((d) =>
      (d as HTMLElement).style.gridTemplateColumns.includes('52px'))
    expect(grilla).toBeDefined()
  })

  it('al fijar un turno, su detalle sale como texto y el botón lleva a su análisis', () => {
    let abierto: unknown = null
    const { container, getByText } = vista({
      selectedKey: '2026-11-02__Turno 1',
      onOpenShift: (s) => { abierto = s },
    })
    expect(container.textContent).toContain('20.000 ciclos')
    fireEvent.click(getByText('Ver turno'))
    expect(abierto).not.toBeNull()
  })

  it('la piel anterior sigue con su mes en minúsculas y el segmentado de siempre', () => {
    document.documentElement.removeAttribute('data-skin')
    const { container } = vista()
    expect(container.textContent).toContain('noviembre de 2026')
    expect(container.textContent).toContain('UPT')
  })
})
