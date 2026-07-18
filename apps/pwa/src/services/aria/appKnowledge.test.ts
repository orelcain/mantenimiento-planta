import { describe, it, expect } from 'vitest'
import { buildAppKnowledgeBlock, APP_MODULES } from './appKnowledge'

describe('appKnowledge — mapa de la app', () => {
  it('admin ve módulos en desarrollo (marcados)', () => {
    const b = buildAppKnowledgeBlock('admin')
    expect(b).toContain('/equipment')          // en desarrollo
    expect(b).toContain('en desarrollo')
    expect(b).toContain('/analisis-grader')     // producción
  })

  it('técnico NO ve módulos en desarrollo listados, sí los de producción', () => {
    const b = buildAppKnowledgeBlock('tecnico')
    expect(b).not.toContain('`/equipment`')     // en desarrollo → no listado
    expect(b).not.toContain('`/sensors`')
    expect(b).toContain('/analisis-grader')     // producción → sí
    expect(b).toContain('/repuestos')
  })

  it('siempre incluye qué puede responder por chat (aunque el módulo esté en dev)', () => {
    const b = buildAppKnowledgeBlock('tecnico')
    expect(b).toContain('DATOS QUE PODÉS RESPONDER POR CHAT')
    expect(b.toLowerCase()).toContain('producción del turno/día')
  })

  it('panel admin solo para admin', () => {
    expect(buildAppKnowledgeBlock('admin')).toContain('/admin')
    expect(buildAppKnowledgeBlock('tecnico')).not.toContain('/admin')
  })

  it('catálogo sano: rutas únicas y con descripción', () => {
    const rutas = APP_MODULES.map(m => m.ruta)
    expect(new Set(rutas).size).toBe(rutas.length)       // sin duplicados
    expect(APP_MODULES.every(m => m.descripcion.length > 0)).toBe(true)
  })
})
