/**
 * El amarre que evita que vuelva a pasar lo que Orel vio: el número de arriba
 * y la curva de abajo tienen que ser EL MISMO dato.
 */
import { describe, it, expect } from 'vitest'
import {
  mediaMovil, ritmoAhoraCpm, estadoRitmo, fraccionDeRegla, PASO_MIN,
  type TramoSerie,
} from '../monitorRitmo'

const serie = (piezas: number[]): TramoSerie[] =>
  piezas.map((pieces, i) => ({ t: new Date(Date.UTC(2026, 7, 17, 0, i * 5)).toISOString(), pieces }))

describe('mediaMovil', () => {
  it('promedia los últimos 3 tramos', () => {
    // 30, 60, 90 → el tercero promedia (30+60+90)/3 = 60
    expect(mediaMovil(serie([30, 60, 90]))).toEqual([30, 45, 60])
  })

  it('⚠ corta la cola de ceros: un turno que terminó no «se desploma»', () => {
    // Sin esto la curva cae al suelo al final de cada turno y parece un derrumbe.
    expect(mediaMovil(serie([60, 60, 0, 0]))).toHaveLength(2)
  })

  it('los ceros del MEDIO se conservan: son la colación o una falla', () => {
    const m = mediaMovil(serie([60, 0, 0, 60]))
    expect(m).toHaveLength(4)
    expect(m[2]).toBe(20)          // (60+0+0)/3
  })

  it('serie vacía o ausente no rompe', () => {
    expect(mediaMovil([])).toEqual([])
    expect(mediaMovil(null)).toEqual([])
    expect(mediaMovil(undefined)).toEqual([])
  })
})

describe('ritmoAhoraCpm', () => {
  /*
   * ⚠⚠ EL INVARIANTE: el número protagonista ES el último punto de la curva.
   * Si alguien «optimiza» uno de los dos por su cuenta, este test cae.
   */
  it('es exactamente el último punto de la media, en pz/min', () => {
    const s = serie([30, 60, 90, 45])
    const media = mediaMovil(s)
    const ultimo = media[media.length - 1]! / PASO_MIN
    expect(ritmoAhoraCpm(s)).toBeCloseTo(ultimo, 10)
    expect(ritmoAhoraCpm(s)).toBeCloseTo(65 / 5, 5)   // (60+90+45)/3 = 65 pz → 13 pz/min
  })

  it('sin una sola pieza devuelve null, no 0', () => {
    // Un 0 se leería como «la línea va lentísima»; null es «todavía no hay ritmo».
    expect(ritmoAhoraCpm(serie([0, 0, 0]))).toBeNull()
    expect(ritmoAhoraCpm([])).toBeNull()
  })
})

describe('estadoRitmo', () => {
  it('sobre el 80 % del techo va bien', () => {
    expect(estadoRitmo(15, 18)).toBe('ok')
    expect(estadoRitmo(18, 18)).toBe('ok')
    expect(estadoRitmo(20, 18)).toBe('ok')      // por encima del techo sigue siendo ok
  })

  it('entre 50 y 80 % va lento', () => {
    expect(estadoRitmo(12, 18)).toBe('lento')   // 67 %
    expect(estadoRitmo(9, 18)).toBe('lento')    // 50 % justo
  })

  it('bajo el 50 % está prácticamente parada', () => {
    expect(estadoRitmo(4, 18)).toBe('parada')
  })

  it('sin techo conocido no se juzga', () => {
    expect(estadoRitmo(12, null)).toBe('ok')
    expect(estadoRitmo(null, 18)).toBe('ok')
  })
})

describe('fraccionDeRegla', () => {
  it('es la fracción del techo, acotada a 1', () => {
    expect(fraccionDeRegla(9, 18)).toBe(0.5)
    expect(fraccionDeRegla(25, 18)).toBe(1)
    expect(fraccionDeRegla(0, 18)).toBe(0)
  })

  it('sin techo la regla se llena: no hay escala contra la cual mentir', () => {
    expect(fraccionDeRegla(12, null)).toBe(1)
  })
})
