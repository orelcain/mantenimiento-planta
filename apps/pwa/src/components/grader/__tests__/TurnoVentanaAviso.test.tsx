import { describe, it, expect, afterEach } from 'vitest'
import { render, screen, cleanup } from '@testing-library/react'
import { TurnoVentanaAviso } from '../TurnoVentanaAviso'

afterEach(cleanup)

const w = (s: string) => new Date(`${s}.000Z`)

describe('TurnoVentanaAviso', () => {
  it('sin nada que avisar no ocupa espacio', () => {
    const { container } = render(<TurnoVentanaAviso missingHeadMin={0} earlyStartMin={0} />)
    expect(container.innerHTML).toBe('')
  })

  it('avisa los minutos que faltan con las dos horas, no solo "faltan datos"', () => {
    // Caso real chonchi 2026-08-05: declarado 07:15, con datos desde 08:00.
    render(
      <TurnoVentanaAviso
        missingHeadMin={45}
        earlyStartMin={0}
        realStart={w('2026-08-05T07:15:00')}
        dataStart={w('2026-08-05T08:00:00')}
      />,
    )
    const el = screen.getByTestId('aviso-arranque-sin-datos')
    expect(el.textContent).toContain('45 min')
    expect(el.textContent).toContain('07:15')
    expect(el.textContent).toContain('08:00')
    // Lo importante no es que falten datos, sino qué implica: el total miente.
    expect(el.textContent).toContain('incompleto')
    expect(el.textContent).toContain('día anterior')
  })

  it('la hora se lee wall-clock-as-UTC, no la corre el huso local', () => {
    // Con getHours() en vez de getUTCHours(), en Chile (UTC-4) daría 03:15.
    render(
      <TurnoVentanaAviso missingHeadMin={45} earlyStartMin={0}
        realStart={w('2026-08-05T07:15:00')} dataStart={w('2026-08-05T08:00:00')} />,
    )
    expect(screen.getByTestId('aviso-arranque-sin-datos').textContent).toContain('07:15')
  })

  it('el arranque anticipado real es otro aviso y NO dice que falten datos', () => {
    // Caso real yal 2026-08-02: produjo 2 h 15 antes de lo declarado, con datos.
    render(<TurnoVentanaAviso missingHeadMin={0} earlyStartMin={135} />)
    const el = screen.getByTestId('aviso-arranque-anticipado')
    expect(el.textContent).toContain('2 h 15')
    expect(el.textContent).toContain('está incluida')
    expect(screen.queryByTestId('aviso-arranque-sin-datos')).toBeNull()
  })

  it('los dos avisos pueden convivir sin pisarse', () => {
    render(
      <TurnoVentanaAviso missingHeadMin={30} earlyStartMin={20}
        realStart={w('2026-07-29T07:30:00')} dataStart={w('2026-07-29T08:00:00')} />,
    )
    expect(screen.getByTestId('aviso-arranque-sin-datos')).toBeTruthy()
    expect(screen.getByTestId('aviso-arranque-anticipado')).toBeTruthy()
  })

  it('sin las horas no se rompe: degrada a guion', () => {
    render(<TurnoVentanaAviso missingHeadMin={45} earlyStartMin={0} />)
    expect(screen.getByTestId('aviso-arranque-sin-datos').textContent).toContain('—')
  })
})
