import { describe, it, expect } from 'vitest'
import { formatFechaDia, formatFechaHora, pareceIdDeUsuario, validarPrioridadIncidencia } from '../utils'

describe('pareceIdDeUsuario', () => {
  it('detecta un id de Firebase y deja pasar nombres', () => {
    expect(pareceIdDeUsuario('y2B2X0MqHGWBb5DU02910S4euxp2')).toBe(true)
    expect(pareceIdDeUsuario('Danilo Cortes Barria Hernandez')).toBe(false)
    expect(pareceIdDeUsuario('mantencion.plantachonchi@correo')).toBe(false)
    expect(pareceIdDeUsuario(undefined)).toBe(false)
  })
})

describe('formatFechaDia', () => {
  it('escribe día-mes-año con ceros, en hora local', () => {
    expect(formatFechaDia(new Date(2026, 1, 8, 0, 10))).toBe('08-02-2026')
  })

  it('acepta texto ISO y número de milisegundos', () => {
    expect(formatFechaDia(new Date(2026, 1, 8, 12, 0).toISOString())).toBe('08-02-2026')
    expect(formatFechaDia(new Date(2026, 1, 8, 12, 0).getTime())).toBe('08-02-2026')
  })

  it('valor inválido o ausente da cadena vacía, sin lanzar', () => {
    expect(formatFechaDia('no es fecha')).toBe('')
    expect(formatFechaDia(Number.NaN)).toBe('')
    expect(formatFechaDia(undefined)).toBe('')
    expect(formatFechaDia(null)).toBe('')
  })
})

describe('formatFechaHora', () => {
  it('escribe día, mes, año y hora de 24 h con ceros', () => {
    expect(formatFechaHora(new Date(2026, 1, 8, 0, 10))).toBe('08-02-2026 00:10')
    expect(formatFechaHora(new Date(2026, 10, 8, 18, 5))).toBe('08-11-2026 18:05')
  })

  it('valor inválido o ausente da cadena vacía, sin lanzar', () => {
    expect(formatFechaHora('basura')).toBe('')
    expect(formatFechaHora(undefined)).toBe('')
  })
})

describe('validarPrioridadIncidencia', () => {
  it('acepta las cuatro prioridades', () => {
    for (const p of ['critica', 'alta', 'media', 'baja']) {
      expect(validarPrioridadIncidencia(p)).toBeNull()
    }
  })

  it('rechaza vacío, ausente y valores fuera de la lista (sin preselección)', () => {
    expect(validarPrioridadIncidencia('')).toBe('Elige la prioridad')
    expect(validarPrioridadIncidencia(undefined)).toBe('Elige la prioridad')
    expect(validarPrioridadIncidencia(null)).toBe('Elige la prioridad')
    expect(validarPrioridadIncidencia('urgente')).toBe('Elige la prioridad')
  })
})
