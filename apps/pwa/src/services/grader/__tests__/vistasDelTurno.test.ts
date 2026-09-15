import { describe, it, expect } from 'vitest'
import { vistasDelTurno } from '../vistasDelTurno'
import { getPlantLineConfig } from '@/config/plantLines'

/** Las tres líneas reales, con su config real. */
const vistas = (id: string) => {
  const c = getPlantLineConfig(id as Parameters<typeof getPlantLineConfig>[0])
  return vistasDelTurno({ clasifica: c.isClassificationPlant !== false, tieneGrader: c.hasGraderData !== false })
}

describe('vistasDelTurno con la config real de cada línea', () => {
  it('Chonchi eviscerado (clasifica, pasa por Grader) ofrece todas', () => {
    expect(vistas('chonchi-eviscerado')).toEqual(['resumen', 'calidad', 'gates', 'linea', 'mantencion', 'accion'])
  })

  it('Yal (pasa por Grader pero no clasifica) no ofrece Gates', () => {
    const v = vistas('yal-eviscerado')
    expect(v).toContain('calidad')
    expect(v).not.toContain('gates')
  })

  it('Filete (no pasa por Grader) no ofrece Calidad: se abría en blanco', () => {
    const v = vistas('chonchi-filete')
    expect(v).not.toContain('calidad')
    expect(v).not.toContain('gates')
    expect(v).toEqual(['resumen', 'linea', 'mantencion', 'accion'])
  })

  it('Resumen, Línea, Mantención y ¿Qué hacer? están en todas las líneas', () => {
    for (const id of ['chonchi-eviscerado', 'yal-eviscerado', 'chonchi-filete']) {
      expect(vistas(id)).toEqual(expect.arrayContaining(['resumen', 'linea', 'mantencion', 'accion']))
    }
  })
})
