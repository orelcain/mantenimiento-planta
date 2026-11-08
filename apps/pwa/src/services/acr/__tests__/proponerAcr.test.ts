import { describe, expect, it } from 'vitest'
import { interpretarPropuesta } from '../proponerAcr'

/** Respuesta buena: el caso del mockup R1 (física, humana, latente y una acción fuerte). */
const BUENA = JSON.stringify({
  causas: [
    { texto: 'Resorte cortado por fatiga', nivel: 'fisica' },
    { texto: 'Se cambia sin registrar horas de uso', nivel: 'humana' },
    { texto: 'Golpe de la chapaleta sin amortiguar en N1 y N2', nivel: 'latente' },
  ],
  acciones: [{ texto: 'Regulador de aire en N1 y N2', fuerza: 'fuerte', causa: 3 }],
})

describe('interpretarPropuesta · respuesta buena', () => {
  it('convierte el JSON en causas y acciones con ids, y enlaza la acción con su causa', () => {
    const p = interpretarPropuesta(BUENA, 'callGroq')
    expect(p.modelo).toBe('callGroq')
    expect(p.causas.map((c) => c.nivel)).toEqual(['fisica', 'humana', 'latente'])
    expect(p.acciones).toHaveLength(1)
    expect(p.acciones[0]?.fuerza).toBe('fuerte')
    expect(p.acciones[0]?.causaId).toBe(p.causas[2]?.id)
    expect(p.causas.every((c) => c.id.length > 0)).toBe(true)
  })

  it('acepta el JSON envuelto en cercas de markdown o con texto alrededor', () => {
    const envuelto = '```json\n' + BUENA + '\n```'
    expect(interpretarPropuesta(envuelto, 'x').causas).toHaveLength(3)
  })
})

describe('interpretarPropuesta · respuesta mala', () => {
  it('sin causa latente lanza error (la UI cae a armar a mano)', () => {
    const sinLatente = JSON.stringify({
      causas: [{ texto: 'Resorte cortado', nivel: 'fisica' }, { texto: 'Descuido', nivel: 'humana' }],
      acciones: [{ texto: 'Capacitar', fuerza: 'debil', causa: 2 }],
    })
    expect(() => interpretarPropuesta(sinLatente, 'x')).toThrow('causa latente')
  })

  it('descarta una acción con fuerza inválida y conserva las demás', () => {
    const mezclada = JSON.stringify({
      causas: [{ texto: 'Golpe sin amortiguar', nivel: 'latente' }],
      acciones: [
        { texto: 'Regulador de aire', fuerza: 'mucha', causa: 1 },
        { texto: 'Checklist de engrase', fuerza: 'media', causa: 1 },
      ],
    })
    const p = interpretarPropuesta(mezclada, 'x')
    expect(p.acciones.map((a) => a.texto)).toEqual(['Checklist de engrase'])
  })

  it('descarta una causa con nivel inválido: si queda sin latente, error', () => {
    const nivelRaro = JSON.stringify({
      causas: [{ texto: 'Algo', nivel: 'organizacional' }, { texto: 'Golpe', nivel: 'latente' }],
      acciones: [{ texto: 'Revisar', fuerza: 'media', causa: 2 }],
    })
    const p = interpretarPropuesta(nivelRaro, 'x')
    expect(p.causas).toHaveLength(1)
    expect(p.acciones[0]?.causaId).toBe(p.causas[0]?.id)
  })

  it('texto que no es JSON lanza error', () => {
    expect(() => interpretarPropuesta('Lo siento, no puedo ayudar.', 'x')).toThrow('no devolvió JSON')
    expect(() => interpretarPropuesta('{"causas": [}', 'x')).toThrow('mal formado')
  })

  it('sin acciones válidas lanza error', () => {
    const sinAcciones = JSON.stringify({
      causas: [{ texto: 'Golpe', nivel: 'latente' }],
      acciones: [{ texto: '', fuerza: 'fuerte', causa: 1 }],
    })
    expect(() => interpretarPropuesta(sinAcciones, 'x')).toThrow('acciones válidas')
  })

  it('una acción que apunta a una causa fuera del límite de 3 queda sin causa, no huérfana', () => {
    const cuatro = JSON.stringify({
      causas: [
        { texto: 'A', nivel: 'fisica' },
        { texto: 'D', nivel: 'latente' },
        { texto: 'B', nivel: 'humana' },
        { texto: 'C', nivel: 'humana' },
      ],
      // La causa 4 («C») queda fuera del límite de 3; la latente («D», la 2) sí entra.
      acciones: [{ texto: 'Accion', fuerza: 'fuerte', causa: 4 }],
    })
    const p = interpretarPropuesta(cuatro, 'x')
    expect(p.causas).toHaveLength(3)
    expect(p.acciones[0]?.causaId).toBeNull()
  })
})
