/**
 * `graderConfigChangeLog` tiene 3.953 documentos y **2.538 de ellos (64%)**
 * tienen un lado vacío: se ven como "0,5 → —" en el historial de configuración.
 * En las últimas 50 líneas —lo que alcanza a ver el usuario— 35 son de esas.
 *
 * No eran cambios de nadie: el diff registraba también cuando uno de los dos
 * lados era `undefined` (config todavía sin cargar, u objeto parcial).
 */
import { describe, it, expect } from 'vitest'
import { diffPhysicalConfig } from '../graderConfigChangeLog.service'

describe('diffPhysicalConfig', () => {
  it('registra un cambio de verdad', () => {
    const d = diffPhysicalConfig({ avgSalmonLengthCm: 55 }, { avgSalmonLengthCm: 60 })
    expect(d).toEqual([{ field: 'avgSalmonLengthCm', prevValue: 55, nextValue: 60 }])
  })

  it('NO registra cuando el valor nuevo todavía no existe', () => {
    expect(diffPhysicalConfig({ flipperHeightAboveBeltMm: 0.5 }, {})).toEqual([])
  })

  it('NO registra cuando el valor viejo no existía', () => {
    expect(diffPhysicalConfig({}, { flipperHeightAboveBeltMm: 0.5 })).toEqual([])
  })

  it('la carga inicial de la config no deja rastro en el historial', () => {
    // Lo que pasaba: un objeto parcial contra la config completa dejaba una
    // línea por cada campo, todas "valor → —".
    const parcial = {}
    const completa = {
      avgSalmonLengthCm: 55,
      avgSalmonWidthCm: 18,
      flipperDelayOpenMs: 120,
      flipperMinOpenTimeMs: 80,
      delayBeforeGateCloseMs: 200,
      delayGateCloseMs: 150,
      minGateOpenMs: 60,
      maxBinWeightG: 25000,
    }
    expect(diffPhysicalConfig(parcial, completa)).toHaveLength(0)
    expect(diffPhysicalConfig(completa, parcial)).toHaveLength(0)
  })

  it('las cintas siguen el mismo criterio', () => {
    const conVelocidad = { belts: [{ beltId: 'main', speedMps: 0.39, lengthMeters: 5 }] }
    const sinVelocidad = { belts: [{ beltId: 'main', lengthMeters: 5 }] }
    expect(diffPhysicalConfig(conVelocidad, sinVelocidad)).toEqual([])
    const cambioReal = { belts: [{ beltId: 'main', speedMps: 0.45, lengthMeters: 5 }] }
    expect(diffPhysicalConfig(conVelocidad, cambioReal)).toEqual([
      { field: 'belts.main.speedMps', prevValue: 0.39, nextValue: 0.45 },
    ])
  })

  it('las posiciones de flipper también', () => {
    const con = { flipperPositions: [{ gateNumber: 1, distanceFromSensorMeters: 2.4 }] }
    const sin = { flipperPositions: [{ gateNumber: 1 }] }
    expect(diffPhysicalConfig(con, sin)).toEqual([])
  })
})
