/**
 * El resumen del día decía "📅 Preventivos: Sin alertas de retraso" mientras el
 * panel de avisos de la misma pantalla decía "Preventiva 'revision de correas'
 * de EVISCERADORA BAADER 142 N1 vencida hace 218 días".
 *
 * No lo inventó el modelo: el contexto le llegaba como "→ próxima: 19-01-2026",
 * y una fecha pasada presentada como "próxima" se lee como programada.
 */
import { describe, it, expect } from 'vitest'
import { estadoDePreventiva } from '../estadoPreventiva'

const HOY = new Date('2026-08-25T12:00:00Z')

describe('estadoDePreventiva', () => {
  it('el caso real: la de la Baader vencida hace 218 días', () => {
    const r = estadoDePreventiva(new Date('2026-01-19T12:00:00Z'), HOY)
    expect(r.vencida).toBe(true)
    expect(r.diasDeAtraso).toBe(218)
    expect(r.texto).toContain('VENCIDA hace 218 días')
  })

  it('una fecha futura sigue siendo "próxima"', () => {
    const r = estadoDePreventiva(new Date('2026-09-10T12:00:00Z'), HOY)
    expect(r.vencida).toBe(false)
    expect(r.texto).toMatch(/^próxima: /)
  })

  it('hoy todavía no está vencida', () => {
    expect(estadoDePreventiva(new Date('2026-08-25T20:00:00Z'), HOY).vencida).toBe(false)
  })

  it('un día de atraso se dice en singular', () => {
    expect(estadoDePreventiva(new Date('2026-08-24T11:00:00Z'), HOY).texto)
      .toContain('VENCIDA hace 1 día')
  })

  it('sin fecha lo dice en vez de inventar', () => {
    expect(estadoDePreventiva(null, HOY)).toMatchObject({ vencida: false, texto: 'sin fecha programada' })
    expect(estadoDePreventiva(new Date('x'), HOY).texto).toBe('sin fecha programada')
  })
})
