import { describe, it, expect } from 'vitest'
import { ubicacionCorta } from '../ubicacionCorta'

/** Rutas reales de `hierarchy`. */
const YAL = 'Aquachile Antarfood Chonchi > PLANTA YAL > PROCESO > EVISCERADO > EVISCERADORA BAADER 142 N1'
const CHONCHI = 'Aquachile Antarfood Chonchi > PLANTA CHONCHI > PROCESO > EVISCERADO > EVISCERADORA BAADER 142 N1'

describe('ubicacionCorta', () => {
  it('distingue las dos plantas de dos equipos que se llaman igual', () => {
    expect(ubicacionCorta(YAL)).toBe('PLANTA YAL · EVISCERADO')
    expect(ubicacionCorta(CHONCHI)).toBe('PLANTA CHONCHI · EVISCERADO')
  })

  it('descarta la empresa y el propio equipo', () => {
    expect(ubicacionCorta(YAL)).not.toContain('Aquachile')
    expect(ubicacionCorta(YAL)).not.toContain('BAADER')
  })

  it('descarta PROCESO, que está en todas las rutas', () => {
    expect(ubicacionCorta(YAL)).not.toContain('PROCESO')
  })

  it('con un solo nivel entre medio devuelve ese', () => {
    expect(ubicacionCorta('Empresa > PLANTA RILES > BOMBA N1')).toBe('PLANTA RILES')
  })

  it('no repite cuando la planta y el área son lo mismo', () => {
    expect(ubicacionCorta('Empresa > FRIGORIFICO > FRIGORIFICO > CAMARA 2')).toBe('FRIGORIFICO')
  })

  it('toma el primer y el último tramo cuando hay varios', () => {
    expect(ubicacionCorta('Empresa > PLANTA CHONCHI > PROCESO > SALA DE MAQUINAS > COMPRESOR > MOTOR N2'))
      .toBe('PLANTA CHONCHI · COMPRESOR')
  })

  it('sin ruta, o con una ruta que es solo el equipo, no inventa nada', () => {
    expect(ubicacionCorta(undefined)).toBeNull()
    expect(ubicacionCorta('')).toBeNull()
    expect(ubicacionCorta('EQUIPO SUELTO')).toBeNull()
    expect(ubicacionCorta('Empresa > EQUIPO')).toBeNull()
  })

  it('aguanta separadores con espacios de más', () => {
    expect(ubicacionCorta('Empresa  >  PLANTA YAL >> PROCESO >  FILETE  > B200')).toBe('PLANTA YAL · FILETE')
  })
})
