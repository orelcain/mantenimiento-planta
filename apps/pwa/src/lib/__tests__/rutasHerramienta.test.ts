import { describe, expect, it } from 'vitest'
import { modoHerramienta } from '../rutasHerramienta'

describe('modoHerramienta', () => {
  it.each([
    '/aprendizaje/hmi-knuro',
    '/aprendizaje/hmi-knuro/Planta%20Principal%20-%20BAA142%20-%20N1',
    '/aprendizaje/hmi-grader',
    '/aprendizaje/hmi-bombeo-s2',
    '/aprendizaje/perilla-5',
    '/aprendizaje/baader-142/tarjeta-a3c',
    '/aprendizaje/baader-142/tarjeta-a3c/',
    '/aprendizaje/planos/baader-142-888',
    '/hmi-knuro',
    '/hmi-grader',
  ])('%s es lienzo', (ruta) => {
    expect(modoHerramienta(ruta)).toBe('lienzo')
  })

  it.each([
    '/aprendizaje/planos',
    '/aprendizaje/variadores',
    '/aprendizaje/maquina/baader-142',
    '/aprendizaje/baader-200/terreno',
    '/aprendizaje/baader-200/terreno/seccion-1',
    '/aprendizaje/baader-142/tarjeta-a3c/por-confirmar',
  ])('%s es lectura', (ruta) => {
    expect(modoHerramienta(ruta)).toBe('lectura')
  })

  it.each([
    '/',
    '/aprendizaje',
    '/aprendizaje/',
    '/aprendizaje/admin',
    '/aprendizaje/admin/baader-142',
    '/repuestos',
    '/hmi-knuro-otro',
    '/analisis-turno',
  ])('%s conserva el layout normal (null)', (ruta) => {
    expect(modoHerramienta(ruta)).toBeNull()
  })
})
