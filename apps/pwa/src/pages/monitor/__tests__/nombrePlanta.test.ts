import { describe, expect, it } from 'vitest'
import { getMachineKind } from '@/config/plantLines'
import {
  grupoDeLinea, lineaDeMonitor, nombrePlanta, ordenSelector, rotuloSelector, subtituloMaquina,
} from '../nombrePlanta'

describe('nombrePlanta (h1 del monitor, calculado desde plantLineId)', () => {
  it('usa los textos exactos de la tabla aprobada', () => {
    expect(nombrePlanta('chonchi-eviscerado')).toBe('Principal · Eviscerado')
    expect(nombrePlanta('chonchi-filete')).toBe('Principal · Filete')
    expect(nombrePlanta('yal-eviscerado')).toBe('Yal · Eviscerado')
  })

  it('sin plantLineId resuelve por plantSlug', () => {
    expect(nombrePlanta(null, 'chonchi')).toBe('Principal · Eviscerado')
    expect(nombrePlanta(undefined, 'filete')).toBe('Principal · Filete')
    expect(nombrePlanta(null, 'yal')).toBe('Yal · Eviscerado')
  })

  it('una línea desconocida no inventa nombre: devuelve null', () => {
    expect(nombrePlanta('chonchi-inexistente', null)).toBeNull()
    expect(nombrePlanta(null, 'nada')).toBeNull()
  })

  it('prefiere plantLineId sobre plantSlug cuando ambos vienen', () => {
    expect(nombrePlanta('chonchi-filete', 'chonchi')).toBe('Principal · Filete')
  })

  it('lineaDeMonitor: el id manda; el slug es respaldo', () => {
    expect(lineaDeMonitor('yal-eviscerado', 'chonchi')?.id).toBe('yal-eviscerado')
    expect(lineaDeMonitor(null, 'chonchi')?.id).toBe('chonchi-eviscerado')
  })
})

describe('selector agrupado por planta', () => {
  const linea = (id: string) => {
    const l = lineaDeMonitor(id)
    if (!l) throw new Error(`falta ${id}`)
    return l
  }

  it('rótulos del selector: Eviscerado, Filete, Yal', () => {
    expect(rotuloSelector(linea('chonchi-eviscerado'))).toBe('Eviscerado')
    expect(rotuloSelector(linea('chonchi-filete'))).toBe('Filete')
    expect(rotuloSelector(linea('yal-eviscerado'))).toBe('Yal')
  })

  it('grupos: Planta Principal (rótulo corto Principal) y Referencia para Yal', () => {
    expect(grupoDeLinea(linea('chonchi-eviscerado'))).toEqual({ clave: 'principal', titulo: 'Planta Principal', tituloCorto: 'Principal' })
    expect(grupoDeLinea(linea('chonchi-filete'))).toEqual({ clave: 'principal', titulo: 'Planta Principal', tituloCorto: 'Principal' })
    expect(grupoDeLinea(linea('yal-eviscerado'))).toEqual({ clave: 'referencia', titulo: 'Referencia', tituloCorto: 'Referencia' })
  })

  it('orden fijo: Eviscerado, Filete, Yal; lo desconocido al final', () => {
    const ids = ['yal-eviscerado', 'chonchi-filete', 'chonchi-eviscerado']
    expect([...ids].sort((a, b) => ordenSelector(a) - ordenSelector(b))).toEqual(['chonchi-eviscerado', 'chonchi-filete', 'yal-eviscerado'])
    expect(ordenSelector('otra')).toBeGreaterThan(ordenSelector('yal-eviscerado'))
  })
})

describe('subtítulo de la máquina (tablet y PC)', () => {
  const subtitulo = (id: string) => {
    const l = lineaDeMonitor(id)
    if (!l) throw new Error(`falta ${id}`)
    return subtituloMaquina(l, getMachineKind(l.id).long)
  }

  it('usa los textos exactos de la tabla aprobada', () => {
    expect(subtitulo('chonchi-eviscerado')).toBe('Evisceradora Baader 142')
    expect(subtitulo('chonchi-filete')).toBe('Baader 200 · Línea 1')
    expect(subtitulo('yal-eviscerado')).toBe('Evisceradora Baader 142')
  })

  it('no repite el título: ningún subtítulo contiene la planta ni el área', () => {
    for (const id of ['chonchi-eviscerado', 'chonchi-filete', 'yal-eviscerado']) {
      const s = subtitulo(id)
      expect(s).not.toMatch(/Principal|Yal|Eviscerado de|Filete$/)
    }
  })
})
