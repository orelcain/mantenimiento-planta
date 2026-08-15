/**
 * El modelo de la máquina: velocidad × llenado de silletas.
 *
 * Los números son los del turno de Filete del 14-08 leídos del doc del monitor.
 */
import { describe, it, expect } from 'vitest'
import { specDeMaquina, llenadoDeSilletas, comoDeCada100 } from '../monitorMaquina'

describe('specDeMaquina', () => {
  it('conoce la Baader 200 y sus silletas', () => {
    const s = specDeMaquina('Baader 200')!
    expect(s.cantidad).toBe(5)
    expect(s.setCpm).toBe(18)   // ficha técnica: 18 pz/min a 47 Hz
    expect(s.maxCpm).toBe(21)   // máximo documentado en la ficha del manual HMI
  })

  it('no le inventa mecanismo a una máquina que no conoce', () => {
    // ⚠ La Baader 142 es otra máquina: no tiene silletas ni esta cuenta.
    expect(specDeMaquina('Baader 142')).toBeNull()
    expect(specDeMaquina('GEA')).toBeNull()
    expect(specDeMaquina(null)).toBeNull()
    expect(specDeMaquina('')).toBeNull()
  })

  it('no se rompe por mayúsculas ni espacios', () => {
    expect(specDeMaquina('  BAADER 200 ')).not.toBeNull()
  })
})

describe('llenadoDeSilletas', () => {
  it('traduce el ritmo andando a silletas llenas', () => {
    // Filete el 14-08: 11,6 pz/min andando con la máquina a 18.
    const l = llenadoDeSilletas({ model: 'Baader 200', cpmAndando: 11.6 })!
    expect(comoDeCada100(l.actual)).toBe(64)
  })

  it('dice cuánto llenado haría falta para la meta', () => {
    // Faltan 1.500 pz y quedan 120 min de producción: 1.500 / (120 × 18).
    const l = llenadoDeSilletas({
      model: 'Baader 200', cpmAndando: 11.6, remainingPieces: 1500, workMin: 120,
    })!
    expect(comoDeCada100(l.necesaria!)).toBe(69)
    expect(l.imposible).toBe(false)
  })

  it('⚠ marca imposible lo que no cabe ni a máquina llena', () => {
    /*
     * El caso que motivó todo: 15:25, faltan 1.120 pz y quedan 5 min. Eso pide
     * 224 pz/min — la pantalla lo mostraba como si fuera una meta. Ni con las
     * silletas llenas y la máquina en su máximo documentado (21) entra.
     */
    const l = llenadoDeSilletas({
      model: 'Baader 200', cpmAndando: 11.6, remainingPieces: 1120, workMin: 5,
    })!
    expect(l.imposible).toBe(true)
    expect(l.necesaria!).toBeGreaterThan(1)
  })

  it('lo imposible se mide contra el MÁXIMO, no contra el set point', () => {
    // 1.100 pz en 60 min = 18,3 pz/min: pasa el set point (18) pero cabe en el
    // máximo documentado (21). Subir la velocidad es una decisión posible.
    const l = llenadoDeSilletas({
      model: 'Baader 200', cpmAndando: 11.6, remainingPieces: 1100, workMin: 60,
    })!
    expect(l.necesaria!).toBeGreaterThan(1)
    expect(l.imposible).toBe(false)
  })

  it('publica lo que la máquina habría dado con todo lleno', () => {
    // 288 min andando × 18 pz/min.
    const l = llenadoDeSilletas({ model: 'Baader 200', cpmAndando: 11.6, producingMin: 288 })!
    expect(l.potencial).toBe(5184)
  })

  /*
   * La defensa contra una config que envejece: si la máquina corre a otra
   * velocidad, los propios datos lo desmienten y el aviso sale solo. Nadie
   * tiene que acordarse de revisar el set point.
   */
  describe('comprobación del set point contra los datos', () => {
    it('avisa cuando un tramo supera la velocidad configurada', () => {
      const l = llenadoDeSilletas({
        model: 'Baader 200', cpmAndando: 14, maxTramoCpm: 19.6,
      })!
      expect(l.contradiceSetPoint).toBe(19.6)
    })

    it('no se queja por el redondeo del bucket de 5 min', () => {
      // 18,4 con el set point en 18 son 92 piezas en un tramo: redondeo, no
      // prueba de que la máquina corra más rápido.
      const l = llenadoDeSilletas({
        model: 'Baader 200', cpmAndando: 14, maxTramoCpm: 18.4,
      })!
      expect(l.contradiceSetPoint).toBeNull()
    })

    it('con el turno real de Filete no se queja: 16,6 está por debajo de 18', () => {
      const l = llenadoDeSilletas({
        model: 'Baader 200', cpmAndando: 11.6, maxTramoCpm: 16.6,
      })!
      expect(l.contradiceSetPoint).toBeNull()
    })

    it('sin el dato del mejor tramo no afirma nada', () => {
      expect(llenadoDeSilletas({ model: 'Baader 200', cpmAndando: 11.6 })!.contradiceSetPoint)
        .toBeNull()
    })
  })

  it('sin meta no inventa un llenado necesario', () => {
    const l = llenadoDeSilletas({ model: 'Baader 200', cpmAndando: 11.6 })!
    expect(l.necesaria).toBeNull()
    expect(l.imposible).toBe(false)
  })

  it('sin máquina conocida o sin ritmo, no hay bloque', () => {
    expect(llenadoDeSilletas({ model: 'Baader 142', cpmAndando: 11.6 })).toBeNull()
    expect(llenadoDeSilletas({ model: 'Baader 200', cpmAndando: 0 })).toBeNull()
    expect(llenadoDeSilletas({ model: 'Baader 200', cpmAndando: null })).toBeNull()
  })
})

describe('setCpmOverride', () => {
  it('el set point editado pisa al del código, sin tocar el máximo del manual', () => {
    const l = llenadoDeSilletas({ model: 'Baader 200', cpmAndando: 10, setCpmOverride: 16 })!
    expect(l.spec.setCpm).toBe(16)
    expect(l.spec.setHz).toBeUndefined()  // el Hz era del set point viejo: no se hereda
    expect(l.spec.maxCpm).toBe(21)        // el techo sale del manual, no se edita
  })

  it('sin override, el spec del código sigue mandando', () => {
    expect(llenadoDeSilletas({ model: 'Baader 200', cpmAndando: 10 })!.spec.setCpm).toBe(18)
    expect(llenadoDeSilletas({ model: 'Baader 200', cpmAndando: 10, setCpmOverride: 0 })!.spec.setCpm).toBe(18)
  })
})
