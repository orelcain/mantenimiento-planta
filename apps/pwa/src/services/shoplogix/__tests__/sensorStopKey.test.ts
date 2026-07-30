/**
 * `sensorStopKey` es el doc id de la anotación de causa de un paro del sensor.
 * Que sea determinístico es lo que hace que re-anotar CORRIJA en vez de crear
 * un duplicado, y que un paro anotado se reconozca al recargar la vista.
 */
import { describe, it, expect } from 'vitest'
import { sensorStopKey } from '@/services/paros'

const base = {
  plantSlug: 'filete',
  dateKey: '2026-07-28',
  shiftId: 'Turno Dia',
  machineid: '3c0581da-9f19-49f0-aa15-b1596ae94dbd',
  startAt: new Date('2026-07-28T15:45:00.000Z'),
}

describe('sensorStopKey', () => {
  it('es estable para el mismo paro', () => {
    expect(sensorStopKey(base)).toBe(sensorStopKey({ ...base, startAt: new Date(base.startAt) }))
  })

  it('normaliza los espacios del turno (Firestore no acepta "/" en un doc id)', () => {
    const key = sensorStopKey(base)
    expect(key).toContain('Turno-Dia')
    expect(key).not.toContain(' ')
    expect(key).not.toContain('/')
  })

  it('distingue paros por hora, máquina, turno y planta', () => {
    const key = sensorStopKey(base)
    expect(sensorStopKey({ ...base, startAt: new Date('2026-07-28T15:46:00.000Z') })).not.toBe(key)
    expect(sensorStopKey({ ...base, machineid: 'otra-maquina' })).not.toBe(key)
    expect(sensorStopKey({ ...base, shiftId: 'Turno 2' })).not.toBe(key)
    expect(sensorStopKey({ ...base, plantSlug: 'chonchi' })).not.toBe(key)
  })

  it('un turno con nombre raro sigue dando un doc id válido', () => {
    // Shoplogix nombra los turnos como quiere: "Turno 1 Lunes", "Turno 2*",
    // "Unscheduled". Ninguno debe romper el doc id.
    for (const shiftId of ['Turno 1 Lunes', 'Turno 2*', 'Unscheduled', 'Turno/raro']) {
      const key = sensorStopKey({ ...base, shiftId })
      expect(key).not.toContain('/')
      expect(key).not.toContain('*')
      expect(key.length).toBeLessThan(1500)  // límite de Firestore para doc ids
    }
  })
})
