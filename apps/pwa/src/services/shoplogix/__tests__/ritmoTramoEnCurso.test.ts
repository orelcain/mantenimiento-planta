/**
 * El ritmo de "ahora" contaba el tramo EN CURSO como si durara sus 5 minutos.
 *
 * Caso real, monitor de Chonchi el 26-08 a las 00:46 con la línea andando: los
 * tres tramos de la ventana eran **147, 132 y 41** piezas, el último con
 * minuto y medio de datos. El número protagonista daba **21,3 pz/min**, por
 * debajo del pulso de Shoplogix (25,0) y del promedio de 30 min del backend
 * (23,3). Los tramos cerrados de esa misma ventana iban a 26-29 pz/min.
 *
 * Un "ritmo de ahora" que queda sistemáticamente por debajo del real no sirve
 * para decidir en planta — y el monitor lo está mirando producción.
 */
import { describe, it, expect } from 'vitest'
import { ritmoAhoraCpm, ritmoAhoraAndando, minutosDelUltimoTramo } from '../monitorRitmo'

/** La ventana real de aquel momento. El último tramo abrió a las 00:45. */
const SERIE = [
  { t: '2026-08-26T00:30:00.000Z', pieces: 121 },
  { t: '2026-08-26T00:35:00.000Z', pieces: 147 },
  { t: '2026-08-26T00:40:00.000Z', pieces: 132 },
  { t: '2026-08-26T00:45:00.000Z', pieces: 41 },
]
const A_LAS_00_46_30 = Date.parse('2026-08-26T00:46:30.000Z')
const A_LAS_00_51 = Date.parse('2026-08-26T00:51:00.000Z')

describe('minutosDelUltimoTramo', () => {
  it('mide los minutos que LLEVA el tramo en curso', () => {
    expect(minutosDelUltimoTramo('2026-08-26T00:45:00.000Z', A_LAS_00_46_30)).toBeCloseTo(1.5, 1)
  })

  it('un tramo ya cerrado vale sus 5 minutos', () => {
    expect(minutosDelUltimoTramo('2026-08-26T00:45:00.000Z', A_LAS_00_51)).toBe(5)
  })

  it('sin saber la hora, se comporta como antes', () => {
    expect(minutosDelUltimoTramo('2026-08-26T00:45:00.000Z', null)).toBe(5)
    expect(minutosDelUltimoTramo(null, A_LAS_00_46_30)).toBe(5)
  })
})

describe('ritmo de ahora con el tramo en curso', () => {
  it('antes hundía el número: 21,3 pz/min', () => {
    expect(ritmoAhoraCpm(SERIE)).toBeCloseTo(21.3, 1)
  })

  it('contando los minutos reales sube a lo que la línea está haciendo', () => {
    // (147 + 132 + 41) / (5 + 5 + 1,5) = 27,8
    expect(ritmoAhoraCpm(SERIE, A_LAS_00_46_30)).toBeCloseTo(27.8, 1)
    expect(ritmoAhoraAndando(SERIE, A_LAS_00_46_30)).toBeCloseTo(27.8, 1)
  })

  it('con el tramo ya cerrado no cambia nada', () => {
    expect(ritmoAhoraCpm(SERIE, A_LAS_00_51)).toBeCloseTo(ritmoAhoraCpm(SERIE)!, 5)
  })

  it('un tramo recién abierto se descarta en vez de disparar el número', () => {
    // 3 piezas en 10 segundos serían 18 pz/min de ruido.
    const serie = [...SERIE.slice(0, 3), { t: '2026-08-26T00:45:00.000Z', pieces: 3 }]
    const alSegundo10 = Date.parse('2026-08-26T00:45:10.000Z')
    // Se ignora ese tramo: quedan 121, 147 y 132 en 15 min.
    expect(ritmoAhoraCpm(serie, alSegundo10)).toBeCloseTo(26.7, 1)
  })

  it('la línea parada toda la ventana sigue dando 0 andando', () => {
    const parada = [
      { t: '2026-08-26T00:30:00.000Z', pieces: 10 },
      { t: '2026-08-26T00:35:00.000Z', pieces: 0 },
      { t: '2026-08-26T00:40:00.000Z', pieces: 0 },
    ]
    expect(ritmoAhoraAndando(parada, A_LAS_00_46_30)).toBe(10 / 5)
  })
})
