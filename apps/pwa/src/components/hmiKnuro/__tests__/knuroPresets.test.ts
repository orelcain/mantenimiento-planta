import { describe, expect, it } from 'vitest'
import { agruparPorPlanta, frasePreset, modeloPresets, partirPreset, presetAlCambiarPlanta } from '../knuroPresets'

const PROD = [
  'Planta Principal - BAA142 - N1', 'Planta Principal - BAA142 - N2', 'Planta Principal - BAA142 - N3',
  'Planta Yal - BAA142 - N1', 'Planta Yal - BAA142 - N2', 'Planta Yal - BAA142 - N3',
]

describe('partirPreset', () => {
  it('parte el nombre de producción', () => {
    expect(partirPreset('Planta Principal - BAA142 - N1')).toEqual({
      name: 'Planta Principal - BAA142 - N1', planta: 'Principal', linea: 'BAA142', maquina: '1',
    })
  })
  it('tolera espacios, guiones largos y N°', () => {
    expect(partirPreset('Planta Yal – BAA 142 –  N°02')?.maquina).toBe('2')
  })
  it('rechaza lo que no calza', () => {
    expect(partirPreset('Planta Principal - BAA142 - N1 - copia')).toBeNull()
    expect(partirPreset('Preset de prueba')).toBeNull()
    expect(partirPreset('Planta Yal - BAA142 - Norte')).toBeNull()
  })
})

describe('modeloPresets', () => {
  it('arma plantas y máquinas con los 6 de producción', () => {
    const m = modeloPresets(PROD)!
    expect(m.plantas).toEqual(['Principal', 'Yal'])
    expect(m.maquinas).toEqual(['1', '2', '3'])
    expect(m.mapa.Yal!['2']).toBe('Planta Yal - BAA142 - N2')
  })
  it('cae a null con un nombre libre, dos líneas o demasiadas plantas', () => {
    expect(modeloPresets([...PROD, 'Planta Principal - BAA142 - N1 - copia'])).toBeNull()
    expect(modeloPresets([...PROD, 'Planta Yal - BAA200 - N1'])).toBeNull()
    expect(modeloPresets([...PROD, 'Planta A - BAA142 - N1', 'Planta B - BAA142 - N1'])).toBeNull()
    expect(modeloPresets([])).toBeNull()
  })
  it('conserva la máquina al cambiar de planta, o toma la primera', () => {
    const m = modeloPresets(['Planta Principal - BAA142 - N1', 'Planta Principal - BAA142 - N3', 'Planta Yal - BAA142 - N1'])!
    expect(presetAlCambiarPlanta(m, 'Yal', '1')).toBe('Planta Yal - BAA142 - N1')
    expect(presetAlCambiarPlanta(m, 'Yal', '3')).toBe('Planta Yal - BAA142 - N1')
    expect(presetAlCambiarPlanta(m, 'Principal', '3')).toBe('Planta Principal - BAA142 - N3')
  })
})

describe('textos', () => {
  it('frase de lectura', () => {
    expect(frasePreset(partirPreset('Planta Principal - BAA142 - N1')!)).toBe('Planta Principal (PP) · Baader 142 N°1')
    expect(frasePreset(partirPreset('Planta Yal - BAA142 - N2')!)).toBe('Planta Yal · Baader 142 N°2')
  })
  it('agrupa por planta para el menú de respaldo', () => {
    const g = agruparPorPlanta(['Planta Yal - BAA142 - N1', 'Libre', 'Planta Yal - BAA142 - N2'])
    expect(g.map(x => x.grupo)).toEqual(['Planta Yal', 'Otros'])
    expect(g[0]!.items.map(i => i.label)).toEqual(['Baader 142 N°1', 'Baader 142 N°2'])
  })
})
