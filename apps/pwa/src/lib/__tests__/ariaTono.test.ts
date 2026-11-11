import { describe, expect, it } from 'vitest'
import { tonoDeTexto } from '../ariaTono'

describe('tonoDeTexto', () => {
  it('saluda cuando la respuesta empieza con hola', () => {
    expect(tonoDeTexto('¡Hola, Orel! ¿En qué te ayudo?')).toBe('saludo')
    expect(tonoDeTexto('Buenos días. Hoy la planta está tranquila.')).toBe('saludo')
  })
  it('alerta ante una detención o algo urgente', () => {
    expect(tonoDeTexto('Atención: revisa el sensor de la Baader 142.')).toBe('alerta')
    expect(tonoDeTexto('La Baader 142 está detenida desde las 7:40.')).toBe('alerta')
  })
  it('una falla común se explica, no es alerta', () => {
    expect(tonoDeTexto('La falla del sensor de entrada se repite en la mañana.')).toBe('explicando')
  })
  it('buena noticia cuando algo quedó resuelto', () => {
    expect(tonoDeTexto('La incidencia de la Grader quedó resuelta.')).toBe('buena_noticia')
  })
  it('error gana sobre todo lo demás', () => {
    expect(tonoDeTexto('Hola. Lo siento, no pude obtener la alerta.')).toBe('error')
  })
  it('por defecto explica', () => {
    expect(tonoDeTexto('')).toBe('explicando')
    expect(tonoDeTexto('El MTTR de la semana fue 42 minutos.')).toBe('explicando')
  })
})
