import { describe, it, expect } from 'vitest'
import { avisoDeTurnosSinPiezas } from '../graderTurnosSinPiezas'

describe('avisoDeTurnosSinPiezas', () => {
  it('el caso medido: julio 2025, 17 con piezas y 37 sin ninguna', () => {
    expect(avisoDeTurnosSinPiezas(17, 37)).toContain('37 de los 54 turnos')
  })

  it('no avisa cuando todos los turnos tienen piezas', () => {
    expect(avisoDeTurnosSinPiezas(54, 0)).toBeNull()
  })

  it('no avisa cuando el archivo es un Puerta 0 suelto: el Wizard ya lo dice', () => {
    expect(avisoDeTurnosSinPiezas(0, 12)).toBeNull()
  })

  it('concuerda en singular con un solo turno sin piezas', () => {
    expect(avisoDeTurnosSinPiezas(3, 1)).toContain('1 de los 4 turno ')
  })
})
