import { describe, expect, it } from 'vitest'
import { esComunDe, maquinaCalzaConEquipo, particionaFavoritos } from '../favoritosUnificado'

const eq = (machineId: string, machineName: string) => ({ machineId, machineName })
const B2 = eq('b2', 'EVISCERADORA BAADER 142 N2')
const B200 = eq('f1', 'FILETEADORA BAADER 200 N1')
const nombreDe = (slug: string) => ({ 'baader-142': 'Evisceradora Baader 142 N3', 'baader-200': 'Baader 200' }[slug] ?? slug)

const fila = (rowKey: string, comunEn: string[], equipos = [B2]) => ({ rowKey, codigoSAP: rowKey, comunEn, equipos })

describe('maquinaCalzaConEquipo', () => {
  it('la familia calza con cualquier unidad, sin tildes ni mayúsculas', () => {
    expect(maquinaCalzaConEquipo('Evisceradora Baader 142 N3', 'EVISCERADORA BAADER 142 N2')).toBe(true)
    expect(maquinaCalzaConEquipo('Baader 200', 'EVISCERADORA BAADER 142 N2')).toBe(false)
    expect(maquinaCalzaConEquipo('', 'X')).toBe(false)
  })
})

describe('esComunDe', () => {
  it('sin alcance vale cualquier común; con alcance, solo los de esa máquina', () => {
    const r = fila('1', ['baader-200'])
    expect(esComunDe(r, null, nombreDe)).toBe(true)
    expect(esComunDe(r, [B2], nombreDe)).toBe(false)
    expect(esComunDe(r, [B200], nombreDe)).toBe(true)
  })
  it('una pieza no común nunca lo es', () => {
    expect(esComunDe(fila('2', []), null, nombreDe)).toBe(false)
  })
})

describe('particionaFavoritos', () => {
  it('común y mía va en comunes (una vez); mías solo las que no son comunes', () => {
    const rows = [fila('a', ['baader-142']), fila('b', []), fila('c', ['baader-142']), fila('d', ['baader-200'])]
    const fav = new Set(['a', 'b'])
    const { comunes, mias } = particionaFavoritos(rows, fav, () => [B2], nombreDe)
    expect(comunes.map((r) => r.rowKey)).toEqual(['a', 'c'])
    expect(mias.map((r) => r.rowKey)).toEqual(['b'])
  })
})
