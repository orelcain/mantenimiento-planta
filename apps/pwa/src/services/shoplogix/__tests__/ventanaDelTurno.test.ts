/**
 * Los dos turnos reales que motivaron el pedido, medidos en Firestore.
 */
import { describe, it, expect } from 'vitest'
import { ventanaDelTurno } from '../ventanaDelTurno'

describe('ventanaDelTurno', () => {
  it('OJO: el 26-08 el turno terminó 10 min después de lo planificado', () => {
    const v = ventanaDelTurno({
      scheduledStart: '2026-08-26T07:15:00Z', scheduledEnd: '2026-08-26T15:00:00Z',
      realStart: '2026-08-26T07:20:00Z', realEnd: '2026-08-26T15:10:00Z',
    })!
    expect(v.planificado).toEqual({ desde: '07:15', hasta: '15:00' })
    expect(v.real).toEqual({ desde: '07:20', hasta: '15:10' })
  })

  it('el 24-08 el mismo «Turno 2» iba de 09:15 a 17:00 — el horario se mueve', () => {
    const v = ventanaDelTurno({
      scheduledStart: '2026-08-24T09:15:00Z', scheduledEnd: '2026-08-24T17:00:00Z',
      realStart: '2026-08-24T09:17:46Z', realEnd: '2026-08-24T16:56:06Z',
    })!
    expect(v.planificado).toEqual({ desde: '09:15', hasta: '17:00' })
    // Arrancó 2 min tarde pero cerró 4 min antes: ninguno llega al umbral.
    expect(v.real).toBeNull()
  })

  it('arrancar un par de minutos tarde no ensucia la cabecera', () => {
    const v = ventanaDelTurno({
      scheduledStart: '2026-08-26T07:15:00Z', scheduledEnd: '2026-08-26T15:00:00Z',
      realStart: '2026-08-26T07:17:00Z', realEnd: '2026-08-26T15:02:00Z',
    })!
    expect(v.real).toBeNull()
  })

  it('basta que UN extremo se corra para mostrar el rango entero', () => {
    const v = ventanaDelTurno({
      scheduledStart: '2026-08-26T07:15:00Z', scheduledEnd: '2026-08-26T15:00:00Z',
      realStart: '2026-08-26T07:16:00Z', realEnd: '2026-08-26T16:40:00Z',
    })!
    expect(v.real).toEqual({ desde: '07:16', hasta: '16:40' })
  })

  it('la hora es de PLANTA, no del huso del navegador', () => {
    const v = ventanaDelTurno({
      scheduledStart: '2026-08-26T21:15:00Z', scheduledEnd: '2026-08-27T05:00:00Z',
      realStart: '2026-08-26T21:25:00Z', realEnd: '2026-08-27T05:10:00Z',
    })!
    expect(v.planificado).toEqual({ desde: '21:15', hasta: '05:00' })
    expect(v.real).toEqual({ desde: '21:25', hasta: '05:10' })
  })

  it('sin horario planificado no hay nada que contrastar', () => {
    expect(ventanaDelTurno({ realStart: '2026-08-26T07:20:00Z' })).toBeNull()
    expect(ventanaDelTurno({ scheduledStart: 'no es fecha', scheduledEnd: 'tampoco' })).toBeNull()
  })
})
