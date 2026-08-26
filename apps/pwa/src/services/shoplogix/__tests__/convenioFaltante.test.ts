/**
 * Los `plannedMin` reales de los 8 turnos del historial publicado, más el de
 * hoy. Ver el porqué en `convenioFaltante`.
 */
import { describe, it, expect } from 'vitest'
import { convenioFaltante } from '../convenioFaltante'

/** 24-08, 21-08, 20-08, 19-08, 18-08, 17-08, 13-08, 11-08. */
const HISTORIA = [58, 47, 58, 0, 55, 46, 65, 1].map((plannedMin) => ({ plannedMin }))

describe('convenioFaltante', () => {
  it('⚠ el turno real: 0 min de convenio contra ~55 habituales', () => {
    const r = convenioFaltante(0, HISTORIA)!
    expect(r.tipicoMin).toBe(57)      // mediana de 46/47/55/58/58/65 = 56,5
    expect(r.turnosCon).toBe(6)
    expect(r.turnosMirados).toBe(8)
  })

  it('un turno CON convenio no dispara nada', () => {
    expect(convenioFaltante(58, HISTORIA)).toBeNull()
    expect(convenioFaltante(5, HISTORIA)).toBeNull()
  })

  it('unos pocos minutos sueltos siguen contando como "no hay"', () => {
    expect(convenioFaltante(1, HISTORIA)).not.toBeNull()
    expect(convenioFaltante(4, HISTORIA)).not.toBeNull()
  })

  it('si lo habitual es NO tener convenio, no se sospecha', () => {
    // Una línea donde el convenio nunca se registra: avisar cada turno es ruido.
    expect(convenioFaltante(0, [0, 0, 1, 58, 0].map((plannedMin) => ({ plannedMin })))).toBeNull()
  })

  it('con menos de tres turnos comparables no alcanza', () => {
    expect(convenioFaltante(0, [{ plannedMin: 58 }, { plannedMin: 47 }])).toBeNull()
    expect(convenioFaltante(0, [])).toBeNull()
  })

  it('los turnos sin el dato no cuentan como "sin convenio"', () => {
    const r = convenioFaltante(0, [
      { plannedMin: null }, { plannedMin: undefined },
      { plannedMin: 58 }, { plannedMin: 47 }, { plannedMin: 55 },
    ])!
    expect(r.turnosMirados).toBe(3)
    expect(r.turnosCon).toBe(3)
    expect(r.tipicoMin).toBe(55)
  })
})
