/**
 * El caso real: `errorLogs` tiene 147.824 documentos y 143.623 de ellos son la
 * misma línea ("Error fetching isometric maps"), escrita entre febrero y marzo
 * desde `/map`. Un solo día dejó 1.101 copias.
 */
import { describe, it, expect } from 'vitest'
import { FrenoDeErroresRepetidos, claveDeError, VENTANA_POR_DEFECTO_MS } from '../errorLogThrottle'

const T0 = 1_770_000_000_000

describe('FrenoDeErroresRepetidos', () => {
  it('deja pasar la primera vez', () => {
    const freno = new FrenoDeErroresRepetidos()
    expect(freno.decidir('a', T0)).toMatchObject({ escribir: true, repeticionesOmitidas: 0 })
  })

  it('calla las repeticiones dentro de la ventana', () => {
    const freno = new FrenoDeErroresRepetidos()
    freno.decidir('a', T0)
    expect(freno.decidir('a', T0 + 1_000).escribir).toBe(false)
    expect(freno.decidir('a', T0 + 60_000).escribir).toBe(false)
  })

  it('vuelve a escribir al vencer la ventana y dice cuántas calló', () => {
    const freno = new FrenoDeErroresRepetidos()
    freno.decidir('a', T0)
    freno.decidir('a', T0 + 1_000)
    freno.decidir('a', T0 + 2_000)
    const d = freno.decidir('a', T0 + VENTANA_POR_DEFECTO_MS + 1)
    expect(d).toMatchObject({ escribir: true, repeticionesOmitidas: 2 })
  })

  it('no mezcla errores distintos', () => {
    const freno = new FrenoDeErroresRepetidos()
    freno.decidir('a', T0)
    expect(freno.decidir('b', T0 + 10).escribir).toBe(true)
  })

  it('las 1.101 copias de un día quedan en unas pocas escrituras', () => {
    const freno = new FrenoDeErroresRepetidos()
    let escritas = 0
    // 1.101 fallas repartidas en 8 horas, como el 27 de marzo.
    for (let i = 0; i < 1101; i++) {
      const ahora = T0 + Math.round((i * 8 * 3_600_000) / 1101)
      if (freno.decidir('isometric', ahora).escribir) escritas++
    }
    expect(escritas).toBeLessThanOrEqual(97) // 8 h / ventana de 5 min
    expect(escritas).toBeGreaterThan(0)
  })

  it('el tope por sesión corta una pestaña que falla toda la noche', () => {
    const freno = new FrenoDeErroresRepetidos(1, 5) // ventana de 1 ms
    let escritas = 0
    for (let i = 0; i < 500; i++) {
      if (freno.decidir(`error-${i}`, T0 + i * 10).escribir) escritas++
    }
    expect(escritas).toBe(6) // 5 permitidas + 1 línea que avisa del tope
  })
})

describe('claveDeError', () => {
  it('separa dos errores con el mismo mensaje y distinto origen', () => {
    const a = claveDeError('Error fetching X', 'FirebaseError: Missing or insufficient permissions.\n  at map')
    const b = claveDeError('Error fetching X', 'TypeError: undefined is not a function\n  at otro')
    expect(a).not.toBe(b)
  })

  it('sin stack usa solo el mensaje', () => {
    expect(claveDeError('boom')).toBe('boom')
  })
})
