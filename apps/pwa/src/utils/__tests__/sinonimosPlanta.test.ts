import { describe, it, expect } from 'vitest'
import { SINONIMOS_PLANTA, sinonimoDe } from '../sinonimosPlanta'

/**
 * Buscar "golilla" daba 60 resultados en Planos y "Sin resultados" en
 * Repuestos, con 135 arandelas en el catálogo: el mapa vivía dentro del índice
 * de un plano y el otro módulo no lo tenía. Ahora es una sola fuente.
 */
describe('sinónimos de planta', () => {
  it('traduce el chilenismo al término del fabricante', () => {
    expect(sinonimoDe('golilla')).toBe('arandela')
    expect(sinonimoDe('descanso')).toBe('cojinete')
    expect(sinonimoDe('chumacera')).toBe('cojinete')
  })

  it('tolera mayúsculas y espacios de más', () => {
    expect(sinonimoDe('  GOLILLA ')).toBe('arandela')
  })

  it('devuelve null cuando no hay traducción', () => {
    expect(sinonimoDe('arandela')).toBeNull()
    expect(sinonimoDe('xyzqw')).toBeNull()
  })

  it('ningún sinónimo apunta a sí mismo ni queda vacío', () => {
    for (const [de, a] of Object.entries(SINONIMOS_PLANTA)) {
      expect(a.trim()).not.toBe('')
      expect(a.toLowerCase()).not.toBe(de.toLowerCase())
    }
  })

  it('las claves están en minúscula (el lookup normaliza a eso)', () => {
    for (const k of Object.keys(SINONIMOS_PLANTA)) expect(k).toBe(k.toLowerCase())
  })
})
