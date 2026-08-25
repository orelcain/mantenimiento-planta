/**
 * En Telegram, cuando ARIA queda corta la pregunta se guarda en `ariaGaps` y
 * después se le puede preguntar "¿qué no has sabido responder?". Hay 6
 * registradas y son concretas — *"Agrega ese repuesto de bomba a los estanques
 * de exterior"* → "No encontré el equipo ESTANQUES DE EXTERIOR en la jerarquía".
 *
 * En el chat de la PWA no pasaba nada de eso: ni se registraban ni se podían
 * ver. La heurística de acá es LA MISMA que la del bot a propósito: si una
 * considera laguna lo que la otra no, la lista deja de servir.
 */
import { describe, it, expect } from 'vitest'
import { quedoCorta, formatearLagunas, type Laguna } from '../lagunas'

describe('quedoCorta', () => {
  it('reconoce las respuestas reales que quedaron registradas', () => {
    expect(quedoCorta('No encontré el equipo "ESTANQUES DE EXTERIOR" en la jerarquía.')).toBe(true)
    expect(quedoCorta('No tengo ese código SAP en los repuestos.')).toBe(true)
    expect(quedoCorta('No hay datos de ese turno todavía.')).toBe(true)
    expect(quedoCorta('Sin datos para esta semana.')).toBe(true)
    expect(quedoCorta('No dispongo de esa información.')).toBe(true)
  })

  it('una respuesta con datos no es laguna', () => {
    expect(quedoCorta('Hay 12 incidencias: 1 crítica y 3 pendientes.')).toBe(false)
    expect(quedoCorta('El compresor GA90 es el COMPRESOR AIRE N2 (SAP 720004366).')).toBe(false)
  })

  it('no registra laguna donde "no encontré" ES la respuesta correcta', () => {
    // Preguntarle justamente por sus lagunas no puede generar otra laguna.
    expect(quedoCorta('No tengo lagunas registradas.', 'lagunas')).toBe(false)
    expect(quedoCorta('No encontré nada que confirmar.', 'confirmar')).toBe(false)
    expect(quedoCorta('No tengo eso guardado.', 'olvidar')).toBe(false)
  })

  it('no rompe con vacío', () => {
    expect(quedoCorta('')).toBe(false)
    expect(quedoCorta(null)).toBe(false)
    expect(quedoCorta(undefined)).toBe(false)
  })
})

describe('formatearLagunas', () => {
  const laguna = (over: Partial<Laguna>): Laguna => ({
    id: '1', pregunta: '¿?', respuesta: '', accion: '?', origen: 'telegram',
    fecha: new Date('2026-08-22T10:02:00Z'), ...over,
  })

  it('dice de dónde vino cada una', () => {
    const texto = formatearLagunas([
      laguna({ pregunta: 'Agrega ese repuesto de bomba a los estanques de exterior' }),
      laguna({ id: '2', pregunta: '¿cuántos motores hay?', origen: 'pwa' }),
    ])
    expect(texto).toContain('[telegram] "Agrega ese repuesto de bomba a los estanques de exterior"')
    expect(texto).toContain('[pwa] "¿cuántos motores hay?"')
    expect(texto).toContain('últimas 2')
  })

  it('sin lagunas lo dice sin inventar', () => {
    expect(formatearLagunas([])).toContain('No tengo lagunas registradas')
  })

  it('una laguna sin fecha no rompe la lista', () => {
    expect(formatearLagunas([laguna({ fecha: null })])).toContain('s/f')
  })
})
