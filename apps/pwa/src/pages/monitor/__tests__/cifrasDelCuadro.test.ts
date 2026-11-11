/**
 * PR B — las cifras de «El turno» al ritmo de la reproducción del minuto. Hechas y cuota se leen en la hora del MISMO cuadro:
 * en reposo dicen lo mismo que el PR A2 y, al pasar de un minuto al siguiente, «A esta hora» no salta.
 */
import { describe, expect, it } from 'vitest'
import { aEstaHora, cifrasDelCuadro, horaDelCuadro } from '../aEstaHora'
import { cuotaA } from '@/services/shoplogix/monitorCompare'

const P = Date.parse('2026-10-28T21:15:00Z')
const MIN = 60_000
/* Cuota de 10 pz/min desde la primera pieza (meta 4.800 en 480 min). */
const optimal = Array.from({ length: 97 }, (_, i) => ({ minutes: i * 5, pieces: i * 50 }))
const cuotaEn = (t: number) => cuotaA(optimal, (t - P) / MIN, 4800)

/** El cuadro de la reproducción del minuto k (de k a k+1 desde P): piso → final, con `frac` corrido y `valor` ya escalonado. */
const cuadro = (k: number, piso: number, final: number, frac: number) => ({
  valor: piso + Math.floor((final - piso) * frac),
  frac,
  previa: { valor: piso, atMs: P + k * MIN },
  ultima: { valor: final, atMs: P + (k + 1) * MIN },
})

describe('horaDelCuadro', () => {
  it('avanza con la reproducción; en reposo es T, el fin del último minuto cerrado', () => {
    expect(horaDelCuadro(cuadro(10, 100, 110, 0.5))).toBe(P + 10.5 * MIN)
    expect(horaDelCuadro(cuadro(10, 100, 110, 1))).toBe(P + 11 * MIN)
    expect(horaDelCuadro({ valor: 5, frac: 1, previa: null, ultima: { valor: 5, atMs: 123 } })).toBe(123)
    expect(horaDelCuadro({ valor: null, frac: 1, previa: null, ultima: null })).toBeNull()
  })
})

describe('cifrasDelCuadro', () => {
  it('en reposo es la cifra del PR A2: mostradas − cuota en T', () => {
    const c = cifrasDelCuadro(cuadro(10, 95, 105, 1), cuotaEn, 4800, 105)
    expect(c.hechas).toBe(105)
    expect(c.aHora).toBe(aEstaHora(105, cuotaA(optimal, 11, 4800), 4800)) // 105 − 110 = −5
    expect(c.aHora).toBe(-5)
  })
  it('al pasar al minuto siguiente «A esta hora» no salta (el fin de uno es el comienzo del otro)', () => {
    const fin = cifrasDelCuadro(cuadro(10, 95, 105, 1), cuotaEn, 4800, 105)
    const ini = cifrasDelCuadro(cuadro(11, 105, 115, 0), cuotaEn, 4800, 105)
    expect(ini.aHora).toBe(fin.aHora)
  })
  it('a la mitad del minuto, piezas y cuota son de la misma media hora: produciendo al ritmo de la meta, ≈ 0', () => {
    const c = cifrasDelCuadro(cuadro(10, 100, 110, 0.5), cuotaEn, 4800, 110)
    expect(c.hechas).toBe(105)
    expect(c.cuota).toBe(105)
    expect(c.aHora).toBe(0)
  })
  it('sin curva de cuota no hay resta: el llamador usa la de reposo', () => {
    expect(cifrasDelCuadro(cuadro(10, 100, 110, 0.5), null, 4800, 110).aHora).toBeNull()
  })
})
