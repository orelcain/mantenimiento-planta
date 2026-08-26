import { describe, expect, it } from 'vitest'
import { compactarTramos, compararTags } from '../designaciones'

describe('compararTags', () => {
  it('ordena natural, no alfabético', () => {
    expect(['B10', 'B2', 'B1'].sort(compararTags)).toEqual(['B1', 'B2', 'B10'])
  })
  it('agrupa por letra antes que por número', () => {
    expect(['K2', 'B10', 'B2'].sort(compararTags)).toEqual(['B2', 'B10', 'K2'])
  })
})

describe('compactarTramos', () => {
  it('el caso real del aviso de B14: el hueco de B10 se ve', () => {
    const tags = ['B1', 'B2', 'B3', 'B4', 'B5', 'B6', 'B7', 'B8', 'B9', 'B11', 'B12']
    expect(compactarTramos(tags)).toEqual(['B1–B9', 'B11', 'B12'])
  })
  it('dos seguidas van con coma, no con guion', () => {
    expect(compactarTramos(['B11', 'B12'])).toEqual(['B11', 'B12'])
  })
  it('tres seguidas sí colapsan', () => {
    expect(compactarTramos(['B4', 'B5', 'B6'])).toEqual(['B4–B6'])
  })
  it('una sola queda tal cual', () => {
    expect(compactarTramos(['Y7'])).toEqual(['Y7'])
  })
  it('letras distintas nunca se mezclan en una corrida', () => {
    expect(compactarTramos(['B1', 'B2', 'B3', 'K4'])).toEqual(['B1–B3', 'K4'])
  })
})
