/**
 * El 22-08 quedaron 7 errores iguales al abrir una incidencia prellenada desde
 * el protocolo de la Baader 142:
 *   "Error extrayendo síntomas con IA: FirebaseError: Groq 404 (upstream)"
 * Probado hoy desde la app, sigue igual: Groq ya no sirve el modelo que se le
 * pide. Y como la extracción atrapa el error y devuelve `[]`, en pantalla no se
 * ve una falla — se ve una descripción "sin síntomas".
 */
import { describe, it, expect } from 'vitest'
import { groqNoVaAContestar, conTechoParaGemini, PISO_TOKENS_GEMINI } from '../groqCaido'

describe('groqNoVaAContestar', () => {
  it('reconoce el 404 real que dejó el protocolo de la 142', () => {
    expect(groqNoVaAContestar(new Error('FirebaseError: Groq 404 (upstream)'))).toBe(true)
  })

  it('reconoce los demás upstream que no se arreglan reintentando', () => {
    for (const codigo of [400, 401, 403, 413, 429, 500, 503]) {
      expect(groqNoVaAContestar(new Error(`Groq ${codigo} (upstream)`))).toBe(true)
    }
  })

  it('reconoce cuando el proxy mismo se cae o no está', () => {
    expect(groqNoVaAContestar(new Error('Groq: error interno del proxy'))).toBe(true)
    expect(groqNoVaAContestar(new Error('IA no disponible: Cloud Function groqProxy no configurada.'))).toBe(true)
  })

  it('NO se lleva por delante otros errores', () => {
    expect(groqNoVaAContestar(new Error('Network request failed'))).toBe(false)
    expect(groqNoVaAContestar(new Error('permission-denied'))).toBe(false)
    expect(groqNoVaAContestar(null)).toBe(false)
    expect(groqNoVaAContestar(undefined)).toBe(false)
  })

  it('un código raro no cuenta como caída conocida', () => {
    expect(groqNoVaAContestar(new Error('Groq 418 (upstream)'))).toBe(false)
  })
})

describe('conTechoParaGemini', () => {
  it('sube el presupuesto chico que dejaba a Gemini sin respuesta', () => {
    // 300 es el que usa la extracción de síntomas: se le va en pensar.
    expect(conTechoParaGemini({ max_tokens: 300 }).max_tokens).toBe(PISO_TOKENS_GEMINI)
    expect(conTechoParaGemini({ max_tokens: 20 }).max_tokens).toBe(PISO_TOKENS_GEMINI)
  })

  it('respeta un presupuesto mayor', () => {
    expect(conTechoParaGemini({ max_tokens: 4096 }).max_tokens).toBe(4096)
  })

  it('conserva el resto de las opciones', () => {
    expect(conTechoParaGemini({ max_tokens: 300, temperature: 0.1 }))
      .toEqual({ max_tokens: PISO_TOKENS_GEMINI, temperature: 0.1 })
  })

  it('sin opciones igual pone el piso', () => {
    expect(conTechoParaGemini().max_tokens).toBe(PISO_TOKENS_GEMINI)
  })
})
