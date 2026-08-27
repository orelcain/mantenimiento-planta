/**
 * El amarre que evita que vuelva a pasar lo que Orel vio: el número de arriba
 * y la curva de abajo tienen que ser EL MISMO dato.
 */
import { describe, it, expect } from 'vitest'
import {
  mediaMovil, ritmoAhoraCpm, ritmoAhoraAndando, repartoAhoraAndando, estadoRitmo, fraccionDeRegla, pedidoAndando, PASO_MIN,
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

describe('repartoAhoraAndando', () => {
  /*
   * ⚠⚠ EL CONTRATO: los repartos por máquina SUMAN la media de 15 min de la
   * línea. Es lo que hace intuible la columna del monitor («la Ev 1 pone 9,8
   * de los 28,1») — si alguien cambia el denominador de uno de los dos lados,
   * este test cae.
   */
  it('los repartos suman exactamente el ritmo andando de la línea', () => {
    const linea = serie([30, 60, 90, 45])
    const maquinas = [
      [10, 20, 30, 15],
      [10, 20, 30, 15],
      [10, 20, 30, 15],
    ]
    const reparto = repartoAhoraAndando(linea, maquinas)!
    const suma = reparto.reduce((a, v) => a + v, 0)
    expect(suma).toBeCloseTo(ritmoAhoraAndando(linea)!, 10)
    // Y como acá las tres son idénticas, cada una pone un tercio.
    expect(reparto[0]).toBeCloseTo(ritmoAhoraAndando(linea)! / 3, 10)
  })

  it('suma también con tramos parados en la ventana (denominador andando)', () => {
    // Tramo del medio en 0: la línea paró. El denominador es el de la LÍNEA
    // (10 min andando), no los minutos propios de cada máquina.
    const linea = serie([60, 50, 0, 40])
    const maquinas = [
      [30, 30, 0, 30],
      [30, 20, 0, 10],
    ]
    const reparto = repartoAhoraAndando(linea, maquinas)!
    expect(reparto.reduce((a, v) => a + v, 0)).toBeCloseTo(ritmoAhoraAndando(linea)!, 10)
    expect(reparto[0]).toBeCloseTo((30 + 0 + 30) / 10, 10)
  })

  it('una máquina sin serie reparte 0, sin romper a las demás', () => {
    const linea = serie([60, 60, 60])
    const reparto = repartoAhoraAndando(linea, [[20, 20, 20], null])!
    expect(reparto[1]).toBe(0)
    expect(reparto[0]).toBeGreaterThan(0)
  })

  it('sin serie de línea devuelve null, no ceros', () => {
    expect(repartoAhoraAndando([], [[1, 2]])).toBeNull()
    expect(repartoAhoraAndando(null, [[1, 2]])).toBeNull()
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

/*
 * ⚠⚠ LA BASE IMPORTA (Orel, 17-08: «¿este ritmo es en producción o de reloj?»).
 * La regla compara contra el set point de la MÁQUINA, que es una velocidad
 * andando. Si el relleno fuera de reloj y el techo andando, la barra
 * subestimaría siempre — y la marca del promedio del turno, que también es
 * andando, quedaría en otra base que el relleno: dos denominadores en la misma
 * barra.
 */
describe('ritmoAhoraAndando · la misma base que el techo y que la marca', () => {
  it('descuenta los tramos parados de la ventana', () => {
    // 3 tramos: 60 pz, 0 (paro), 60 pz → 120 pz en 10 min ANDANDO = 12 pz/min.
    const s = serie([60, 0, 60])
    expect(ritmoAhoraAndando(s)).toBeCloseTo(12, 5)
    // De reloj sería 120/15 = 8: el mismo turno, dos lecturas distintas.
    expect(ritmoAhoraCpm(s)).toBeCloseTo(8, 5)
  })

  it('sin paros, ambas bases coinciden', () => {
    const s = serie([50, 50, 50])
    expect(ritmoAhoraAndando(s)).toBeCloseTo(10, 5)
    expect(ritmoAhoraCpm(s)).toBeCloseTo(10, 5)
  })

  it('la línea parada toda la ventana da 0, no null', () => {
    // Los ceros del final se cortan como en la curva; si TODO es cero no hay
    // ventana que medir y devuelve null (no hay ritmo, no es «va a cero»).
    expect(ritmoAhoraAndando(serie([0, 0, 0]))).toBeNull()
  })

  it('serie vacía o ausente no rompe', () => {
    expect(ritmoAhoraAndando([])).toBeNull()
    expect(ritmoAhoraAndando(null)).toBeNull()
  })
})

/*
 * La marca de la regla pasa a ser el OBJETIVO (pedido de Orel, 17-08): «esa
 * marca podría ser el indicativo dinámico de la velocidad que espera la línea
 * para cumplir la cuota». Para que sea comparable con el relleno —y realista—
 * hay que convertirla a la base andando con el uptime real del turno.
 */
describe('pedidoAndando · el objetivo en la misma base que el ritmo', () => {
  it('convierte el requerido de reloj a ritmo andando con el uptime real', () => {
    // Pide 14 de reloj y la línea produce el 80 % del tiempo → 17,5 andando.
    expect(pedidoAndando(14, 80, 100)).toBeCloseTo(17.5, 5)
  })

  it('con la línea corriendo sin parar, ambas bases coinciden', () => {
    expect(pedidoAndando(14, 100, 100)).toBeCloseTo(14, 5)
  })

  it('⚠ con poco turno corrido NO extrapola: el uptime todavía es ruido', () => {
    // 10 min producidos de 40 disponibles daría 4× — un arranque tardío no
    // significa que la línea vaya a parar el 75 % del turno.
    expect(pedidoAndando(14, 10, 40)).toBeCloseTo(14, 5)
  })

  it('sin meta o sin datos devuelve null o el valor tal cual', () => {
    expect(pedidoAndando(null, 80, 100)).toBeNull()
    expect(pedidoAndando(0, 80, 100)).toBeNull()
    expect(pedidoAndando(14, null, null)).toBeCloseTo(14, 5)
  })
})
