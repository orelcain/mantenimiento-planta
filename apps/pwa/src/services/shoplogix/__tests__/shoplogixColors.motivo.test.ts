import { describe, it, expect } from 'vitest'
import { motivoEnEspanol } from '../shoplogixColors'

describe('motivoEnEspanol · el monitor público habla en español', () => {
  it('traduce el único motivo que el sensor pone en inglés', () => {
    // De los 42 motivos distintos que hay en los datos, «Planned Downtime» es
    // el único en inglés (301 apariciones): no lo escribe un operador, lo pone
    // Shoplogix. Se veía así en la pantalla de la TV de planta.
    expect(motivoEnEspanol('Planned Downtime')).toBe('Parada programada')
  })

  it('no toca las causas que escribe el operador', () => {
    // Vienen en español sin tildes, tal cual las tipean en Shoplogix.
    for (const c of ['COLACION', 'ATASCAMIENTO', 'FALTA MMPP', 'Micro Detencion', 'Limpieza de Ducto']) {
      expect(motivoEnEspanol(c)).toBe(c)
    }
  })

  it('no distingue mayúsculas ni espacios de sobra', () => {
    expect(motivoEnEspanol('  planned downtime ')).toBe('Parada programada')
    expect(motivoEnEspanol('UNSCHEDULED')).toBe('Fuera de turno')
  })

  it('sin motivo devuelve lo que le dieron', () => {
    expect(motivoEnEspanol(null)).toBeNull()
    expect(motivoEnEspanol(undefined)).toBeNull()
    expect(motivoEnEspanol('')).toBe('')
  })
})
