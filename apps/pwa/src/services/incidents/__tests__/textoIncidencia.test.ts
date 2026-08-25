/**
 * El caso real: la incidencia del 05-02-2026 tiene por título `"\n´\n"` y por
 * descripción `"}"`. Lleva seis meses **en proceso**, aparece en la lista y
 * ARIA la cuenta entre las abiertas del día como "Incidencia sin título (´)".
 */
import { describe, it, expect } from 'vitest'
import { normalizarTextoIncidencia, diceAlgo } from '../textoIncidencia'

describe('normalizarTextoIncidencia', () => {
  it('saca el espacio final que hacía distintas a dos incidencias iguales', () => {
    // Las dos "Baader sucia " guardadas el 27-12 traen ese espacio.
    expect(normalizarTextoIncidencia('Baader sucia ')).toBe('Baader sucia')
    expect(normalizarTextoIncidencia('Sensor tolva ')).toBe('Sensor tolva')
  })

  it('colapsa saltos de línea y espacios repetidos', () => {
    expect(normalizarTextoIncidencia('\n´\n')).toBe('´')
    expect(normalizarTextoIncidencia('correa   dañada\n\nen el ventilador'))
      .toBe('correa dañada en el ventilador')
  })

  it('no rompe con basura ni con nada', () => {
    expect(normalizarTextoIncidencia(undefined)).toBe('')
    expect(normalizarTextoIncidencia(null)).toBe('')
    expect(normalizarTextoIncidencia(42)).toBe('')
  })
})

describe('diceAlgo', () => {
  it('rechaza exactamente el título y la descripción de la incidencia fantasma', () => {
    expect(diceAlgo('\n´\n')).toBe(false)
    expect(diceAlgo('}')).toBe(false)
  })

  it('rechaza lo que no dice nada', () => {
    expect(diceAlgo('')).toBe(false)
    expect(diceAlgo('   ')).toBe(false)
    expect(diceAlgo('...')).toBe(false)
    expect(diceAlgo('-')).toBe(false)
  })

  it('acepta los títulos reales, incluidos los cortos y los que arma el protocolo', () => {
    expect(diceAlgo('Puerta caida')).toBe(true)
    expect(diceAlgo('Excavador B SM5: 348/1000 correcciones (protocolo Baader 142 N1)')).toBe(true)
    expect(diceAlgo('E825')).toBe(true) // código suelto: dice algo
    expect(diceAlgo('ok')).toBe(true)   // corto, pero es texto
  })
})
