import { describe, it, expect } from 'vitest'
import { vistasDelTurno, vistaDesdeUrl } from '../vistasDelTurno'
import { getPlantLineConfig } from '@/config/plantLines'

/** Las tres líneas reales, con su config real. */
const vistas = (id: string, tieneExcel = true) => {
  const c = getPlantLineConfig(id as Parameters<typeof getPlantLineConfig>[0])
  return vistasDelTurno({
    clasifica: c.isClassificationPlant !== false,
    tieneGrader: c.hasGraderData !== false,
    tieneExcel,
  })
}

describe('vistasDelTurno con la config real de cada línea', () => {
  it('Chonchi eviscerado con Excel ofrece todas, sin Línea', () => {
    expect(vistas('chonchi-eviscerado')).toEqual(['resumen', 'calidad', 'gates', 'mantencion', 'accion'])
  })

  it('Yal (pasa por Grader pero no clasifica) no ofrece Gates', () => {
    const v = vistas('yal-eviscerado')
    expect(v).toContain('calidad')
    expect(v).not.toContain('gates')
  })

  it('Filete (no pasa por Grader) nunca ofrece Calidad, haya o no Excel', () => {
    for (const excel of [true, false]) {
      const v = vistas('chonchi-filete', excel)
      expect(v).not.toContain('calidad')
      expect(v).not.toContain('gates')
      expect(v).toEqual(['resumen', 'mantencion', 'accion'])
    }
  })

  it('sin Excel, Calidad no se ofrece en líneas con Grader', () => {
    for (const id of ['chonchi-eviscerado', 'yal-eviscerado']) {
      expect(vistas(id, false)).not.toContain('calidad')
      expect(vistas(id, true)).toContain('calidad')
    }
    expect(vistas('chonchi-eviscerado', false)).toEqual(['resumen', 'gates', 'mantencion', 'accion'])
  })

  it('Línea ya no es una pestaña', () => {
    for (const id of ['chonchi-eviscerado', 'yal-eviscerado', 'chonchi-filete']) {
      expect(vistas(id)).not.toContain('linea')
    }
  })

  it('Resumen, Mantención y ¿Qué hacer? están en todas las líneas, con o sin Excel', () => {
    for (const id of ['chonchi-eviscerado', 'yal-eviscerado', 'chonchi-filete']) {
      for (const excel of [true, false]) {
        expect(vistas(id, excel)).toEqual(expect.arrayContaining(['resumen', 'mantencion', 'accion']))
      }
    }
  })
})

describe('vistaDesdeUrl', () => {
  it('?vista=linea (links viejos) abre Resumen', () => {
    expect(vistaDesdeUrl('linea')).toBe('resumen')
  })
  it('vistas vigentes se respetan', () => {
    expect(vistaDesdeUrl('calidad')).toBe('calidad')
    expect(vistaDesdeUrl('mantencion')).toBe('mantencion')
  })
  it('ausente o desconocida cae a Resumen', () => {
    expect(vistaDesdeUrl(null)).toBe('resumen')
    expect(vistaDesdeUrl('xyz')).toBe('resumen')
  })
})
