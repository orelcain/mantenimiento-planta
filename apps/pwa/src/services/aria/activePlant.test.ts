import { describe, it, expect, afterEach } from 'vitest'
import { getActivePlantLineId, getActivePlantSlug } from './activePlant'

/** Fija la query string de la URL para simular el board con ?linea=. */
function setUrl(search: string): void {
  window.history.pushState({}, '', search || '/')
}

describe('activePlant (planta activa desde ?linea=)', () => {
  afterEach(() => setUrl('/'))

  it('sin ?linea= → undefined (mantiene el default del llamador)', () => {
    setUrl('/analisis-grader')
    expect(getActivePlantLineId()).toBeUndefined()
    expect(getActivePlantSlug()).toBeUndefined()
  })

  it('?linea=yal-eviscerado → línea yal + slug yal', () => {
    setUrl('/analisis-grader?linea=yal-eviscerado')
    expect(getActivePlantLineId()).toBe('yal-eviscerado')
    expect(getActivePlantSlug()).toBe('yal')
  })

  it('?linea=chonchi-eviscerado → línea chonchi + slug chonchi', () => {
    setUrl('/analisis-grader?linea=chonchi-eviscerado')
    expect(getActivePlantLineId()).toBe('chonchi-eviscerado')
    expect(getActivePlantSlug()).toBe('chonchi')
  })

  it('?linea= basura no registrada → undefined (no adivina)', () => {
    setUrl('/analisis-grader?linea=inexistente')
    expect(getActivePlantLineId()).toBeUndefined()
    expect(getActivePlantSlug()).toBeUndefined()
  })
})
