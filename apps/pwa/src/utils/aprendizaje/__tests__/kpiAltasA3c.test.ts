import { describe, expect, it } from 'vitest'
import type { ParteFisica, PartesPlano } from '@/hooks/usePartesPlano'
import partes888 from '../../../../public/planos/baader-142-888/partes.json'
import { kpiAltas } from '../kpiAltasA3c'

const p = (nr: string, extra: Partial<ParteFisica> = {}): ParteFisica => ({
  nr, es: `Pieza ${nr}`, de: '', fig: null, hoja: null, pos: '1', confianza: 'propuesto', nivel: 'pieza', ...extra,
})
const plano = (): Pick<PartesPlano, 'aparatos'> => ({
  aparatos: {
    K20: [p('42203183', { confianza: 'catalogo' })],
    K22: [p('42203183', { confianza: 'catalogo' })],
    Y1: [p('34974309', { nivel: 'conjunto' })],
    Y2: [p('34974309', { nivel: 'conjunto' })],
    Y3: [p('34974309', { nivel: 'conjunto' })],
    A4: [p('42902090')],
    // con SAP en el plano: no es «sin SAP»
    K23: [p('42203310', { sap: '3300080929' })],
  },
})

describe('kpiAltas', () => {
  it('cuenta los códigos distintos sin SAP y los elementos que cubren', () => {
    const k = kpiAltas(plano(), [])
    expect(k.total).toBe(3)
    expect(k.sinPedir).toBe(3)
    expect(k.enBodega).toBe(0)
    expect(k.dadasDeAlta).toBe(0)
    expect(k.elementosCubiertos).toBe(6)
  })

  it('ordena por cuántos elementos cubre cada código (el orden en que conviene pedirlos)', () => {
    const k = kpiAltas(plano(), [])
    expect(k.codigos.map(c => [c.codigo, c.elementos.length])).toEqual([['34974309', 3], ['42203183', 2], ['42902090', 1]])
    expect(k.codigos[1]?.elementos).toEqual(['K20', 'K22'])
    expect(k.codigos[0]?.nivel).toBe('conjunto')
  })

  it('las tres cifras son excluyentes y suman el total; una rechazada vuelve a «sin pedir»', () => {
    const k = kpiAltas(plano(), [
      { codigoFabricante: '42203183', estado: 'creada', sapCreado: '3300112345' },
      { codigoFabricante: '34974309', estado: 'pendiente' },
      { codigoFabricante: '42902090', estado: 'rechazada' },
    ])
    expect(k).toMatchObject({ total: 3, dadasDeAlta: 1, enBodega: 1, sinPedir: 1 })
    expect(k.dadasDeAlta + k.enBodega + k.sinPedir).toBe(k.total)
    expect(k.codigos.find(c => c.codigo === '42203183')).toMatchObject({ estado: 'dada_de_alta', sapCreado: '3300112345' })
    expect(k.codigos.find(c => c.codigo === '42902090')?.estado).toBe('sin_pedir')
  })

  it('el alta se empareja por código normalizado y un alta de un código ajeno al plano no suma', () => {
    const k = kpiAltas(plano(), [
      { codigoFabricante: '4220 3183', estado: 'pendiente' },
      { codigoFabricante: '99999999', estado: 'creada', sapCreado: '3300000000' },
    ])
    expect(k).toMatchObject({ total: 3, enBodega: 1, dadasDeAlta: 0, sinPedir: 2 })
  })

  it('sin plano todo es cero', () => {
    expect(kpiAltas(null, [])).toMatchObject({ total: 0, sinPedir: 0, codigos: [] })
  })

  it('datos reales del plano 888: los códigos sin SAP suman lo mismo que sus estados', () => {
    const k = kpiAltas(partes888 as unknown as PartesPlano, [{ codigoFabricante: '42203183', estado: 'pendiente' }])
    expect(k.total).toBeGreaterThan(0)
    expect(k.dadasDeAlta + k.enBodega + k.sinPedir).toBe(k.total)
    expect(k.enBodega).toBe(1)
    // el que cubre más elementos va primero
    const cubre = k.codigos.map(c => c.elementos.length)
    expect([...cubre].sort((a, b) => b - a)).toEqual(cubre)
  })
})
