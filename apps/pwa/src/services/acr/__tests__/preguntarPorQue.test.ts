import { describe, expect, it } from 'vitest'
import { interpretarPregunta } from '../preguntarPorQue'

describe('interpretarPregunta', () => {
  it('acepta una pregunta válida tal cual', () => {
    expect(interpretarPregunta('¿Qué plan de revisión incluye el regulador de aire?')).toBe(
      '¿Qué plan de revisión incluye el regulador de aire?',
    )
  })

  it('quita comillas y espacios de los extremos', () => {
    expect(interpretarPregunta('  "¿Quién revisa el regulador en N1?"  ')).toBe('¿Quién revisa el regulador en N1?')
    expect(interpretarPregunta('«¿Quién revisa el regulador en N1?»')).toBe('¿Quién revisa el regulador en N1?')
    expect(interpretarPregunta("'¿Quién revisa el regulador en N1?'")).toBe('¿Quién revisa el regulador en N1?')
  })

  it('toma la primera línea no vacía y descarta lo que viene después', () => {
    const crudo = '\n\n¿Qué stock de reguladores hay en bodega?\nEspero que sirva.'
    expect(interpretarPregunta(crudo)).toBe('¿Qué stock de reguladores hay en bodega?')
  })

  it('rechaza una respuesta sin «¿» al inicio', () => {
    expect(() => interpretarPregunta('Qué plan de revisión incluye el regulador?')).toThrow()
  })

  it('rechaza una respuesta que no termina en «?»', () => {
    expect(() => interpretarPregunta('¿Qué plan de revisión incluye el regulador.')).toThrow()
  })

  it('rechaza una pregunta muy corta (menos de 8 caracteres)', () => {
    expect(() => interpretarPregunta('¿Y eso?')).toThrow()
  })

  it('rechaza una pregunta muy larga (más de 140 caracteres)', () => {
    const larga = '¿' + 'a'.repeat(140) + '?'
    expect(larga.length).toBeGreaterThan(140)
    expect(() => interpretarPregunta(larga)).toThrow()
  })

  it('rechaza una respuesta vacía', () => {
    expect(() => interpretarPregunta('   \n  ')).toThrow()
  })
})
