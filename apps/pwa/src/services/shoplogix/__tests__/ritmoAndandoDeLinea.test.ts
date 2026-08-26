/**
 * Caso real, monitor de Eviscerado de Planta Principal el 26-08 a las 01:03,
 * con las tres Baader corriendo y 7.942 piezas:
 *
 *   uptimeSec / 60  = 571,8 min  ← SUMA de las 3 máquinas   → 13,9 pz/min
 *   producingMin    = 213 min    ← tiempo de LÍNEA          → 37,3 pz/min
 *   piecesPerMinute del backend                             → 37,2 pz/min
 *
 * La pantalla decía "Pide 23,4 pz/min y la línea, andando, va a 13,9" y
 * concluía "Dentro del horario no alcanza · cierra en 9.164 pz (92%)". Con el
 * ritmo real cierra en 11.111 (111%): **decía que no se llegaba cuando sí**.
 */
import { describe, it, expect } from 'vitest'
import { ritmoAndandoDeLinea } from '../ritmoAndandoDeLinea'

describe('ritmoAndandoDeLinea', () => {
  it('el caso real: 37,3 pz/min, no 13,9', () => {
    const r = ritmoAndandoDeLinea({
      totalPieces: 7942,
      tiempos: { producingMin: 213 },
      uptimeSec: 34306,
      machinesTotal: 3,
    })
    expect(r).toBeCloseTo(37.3, 1)
    // Lo que mostraba antes, para que quede escrito de qué se sale:
    expect(7942 / (34306 / 60)).toBeCloseTo(13.9, 1)
  })

  it('coincide con el pz/min que publica el backend', () => {
    const r = ritmoAndandoDeLinea({ totalPieces: 7942, tiempos: { producingMin: 213 } })!
    expect(Math.abs(r - 37.15)).toBeLessThan(0.5)
  })

  it('con una sola máquina no cambia nada — Filete queda igual', () => {
    // 3.000 piezas, 200 min de línea y 200 min de la única máquina.
    const conLinea = ritmoAndandoDeLinea({
      totalPieces: 3000, tiempos: { producingMin: 200 }, uptimeSec: 12_000, machinesTotal: 1,
    })
    const sinLinea = ritmoAndandoDeLinea({
      totalPieces: 3000, tiempos: null, uptimeSec: 12_000, machinesTotal: 1,
    })
    expect(conLinea).toBeCloseTo(15, 5)
    expect(sinLinea).toBeCloseTo(15, 5)
  })

  it('sin producingMin reparte el uptime entre las máquinas, no lo suma', () => {
    const r = ritmoAndandoDeLinea({
      totalPieces: 7942, tiempos: null, uptimeSec: 34306, machinesTotal: 3,
    })
    expect(r).toBeCloseTo(41.7, 1)   // 7942 / (571,8/3)
    expect(r).toBeGreaterThan(30)    // y nunca el 13,9 de antes
  })

  it('sin piezas no inventa un ritmo', () => {
    expect(ritmoAndandoDeLinea({ totalPieces: 0, tiempos: { producingMin: 213 } })).toBeNull()
    expect(ritmoAndandoDeLinea({ totalPieces: null, tiempos: { producingMin: 213 } })).toBeNull()
  })

  it('sin tiempos utilizables devuelve null en vez de dividir por cero', () => {
    expect(ritmoAndandoDeLinea({ totalPieces: 100, tiempos: { producingMin: 0 }, uptimeSec: 0 })).toBeNull()
  })
})
