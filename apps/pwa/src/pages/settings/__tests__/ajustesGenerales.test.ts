import { describe, it, expect } from 'vitest'
import { leerAjustesGenerales, AJUSTES_GENERALES_POR_DEFECTO } from '../ajustesGenerales'

describe('leerAjustesGenerales', () => {
  it('con el documento vacío usa los valores por defecto', () => {
    expect(leerAjustesGenerales({})).toEqual(AJUSTES_GENERALES_POR_DEFECTO)
    expect(leerAjustesGenerales(undefined)).toEqual(AJUSTES_GENERALES_POR_DEFECTO)
  })

  it('devuelve lo guardado — que es lo que la pantalla no hacía', () => {
    const guardado = {
      requireValidation: false,
      autoAssign: true,
      tiempoCriticaMin: 5,
      tiempoAltaMin: 45,
      tiempoMediaMin: 90,
      tiempoBajaMin: 240,
    }
    expect(leerAjustesGenerales(guardado)).toEqual(guardado)
  })

  it('un switch a medio guardar no arrastra al otro', () => {
    const r = leerAjustesGenerales({ autoAssign: true })
    expect(r.autoAssign).toBe(true)
    expect(r.requireValidation).toBe(AJUSTES_GENERALES_POR_DEFECTO.requireValidation)
  })

  it('acepta el número escrito como texto', () => {
    expect(leerAjustesGenerales({ tiempoCriticaMin: '45' }).tiempoCriticaMin).toBe(45)
  })

  it('no acepta un tiempo de respuesta de 0 ni negativo', () => {
    expect(leerAjustesGenerales({ tiempoCriticaMin: 0 }).tiempoCriticaMin).toBe(1)
    expect(leerAjustesGenerales({ tiempoAltaMin: -30 }).tiempoAltaMin).toBe(1)
  })

  it('recorta un dedo de más (1500 min = 25 h) al tope de una semana', () => {
    expect(leerAjustesGenerales({ tiempoBajaMin: 99999 }).tiempoBajaMin).toBe(10_080)
  })

  it('ignora basura', () => {
    expect(leerAjustesGenerales({ tiempoMediaMin: 'ochenta' }).tiempoMediaMin)
      .toBe(AJUSTES_GENERALES_POR_DEFECTO.tiempoMediaMin)
    expect(leerAjustesGenerales({ requireValidation: 'sí' }).requireValidation).toBe(true)
  })
})
