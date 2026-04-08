/**
 * Servicios de IA para mejora de ETT
 * Utiliza el proxy centralizado de Groq (Cloud Function o directo)
 */

import { logger } from '@/lib/logger'
import type { ETTSugerenciaIA } from '@/types'

// Re-usar la infraestructura centralizada de ai.ts
// Import dinámico para evitar dependencias circulares
async function callGroqAPI(prompt: string, temperature = 0.7): Promise<string> {
  try {
    // Importar dinámicamente callGroq de ai.ts
    const { isAIConfigured } = await import('./ai')
    if (!isAIConfigured()) {
      logger.warn('IA no configurada, devolviendo texto original')
      return prompt
    }

    // Usar httpsCallable directamente o fallback
    const { httpsCallable } = await import('firebase/functions')
    const { getFunctions } = await import('firebase/functions')
    const firebaseApp = (await import('@/services/firebase')).default

    try {
      const functions = getFunctions(firebaseApp)
      const groqProxy = httpsCallable(functions, 'groqProxy')
      const result = await groqProxy({
        messages: [{ role: 'user', content: prompt }],
        model: 'llama-3.3-70b-versatile',
        temperature,
        max_tokens: 1000,
      })
      const data = result.data as { content: string }
      return data.content || ''
    } catch (cfErr) {
      throw new Error('IA no disponible (Cloud Function): ' + (cfErr instanceof Error ? cfErr.message : String(cfErr)))
    }
  } catch (error) {
    logger.error('Error calling Groq API', error instanceof Error ? error : new Error(String(error)))
    throw error
  }
}

/**
 * Mejora la descripción del trabajo
 * - Agrega tecnicismo
 * - Clarifica objetivos
 * - Enfatiza seguridad
 */
export async function improveTrabajoDescripcion(
  textoOriginal: string
): Promise<ETTSugerenciaIA> {
  const prompt = `Como experto en mantenimiento industrial, mejora la siguiente descripción de trabajo.
La versión mejorada debe:
- Ser más técnica y precisa
- Incluir objetivos claros
- Destacar consideraciones de seguridad
- Ser concisa pero completa

Texto original:
"${textoOriginal}"

Responde SOLO con el texto mejorado, sin explicaciones adicionales.`

  try {
    const mejorado = await callGroqAPI(prompt, 0.7)

    return {
      campo: 'trabajo_descripcion',
      texto_original: textoOriginal,
      texto_mejorado: mejorado.trim(),
      mejoras: [
        'Añadida terminología técnica',
        'Clarificados objetivos',
        'Enfatizada seguridad',
        'Mejorada estructura'
      ]
    }
  } catch (error) {
    logger.error('Error improving trabajo descripcion', error instanceof Error ? error : new Error(String(error)))
    throw error
  }
}

/**
 * Mejora la especificación de un material
 * - Agrega estándares (ISO, DIN)
 * - Clarifica propiedades técnicas
 * - Añade alternativas comerciales
 */
export async function improveMaterialEspecificacion(
  textoOriginal: string
): Promise<ETTSugerenciaIA> {
  const prompt = `Como experto en procura y especificaciones técnicas, mejora la siguiente especificación de material.
La versión mejorada debe:
- Incluir normas aplicables (ISO, DIN, ASTM, etc.)
- Especificar propiedades técnicas claras
- Ser comercialmente viable
- Incluir criterios de aceptación

Especificación original:
"${textoOriginal}"

Responde SOLO con la especificación mejorada, sin explicaciones adicionales.`

  try {
    const mejorado = await callGroqAPI(prompt, 0.7)

    return {
      campo: 'material_especificacion',
      texto_original: textoOriginal,
      texto_mejorado: mejorado.trim(),
      mejoras: [
        'Añadidas normas técnicas',
        'Clarificadas propiedades',
        'Mejora comercial',
        'Criterios de aceptación'
      ]
    }
  } catch (error) {
    logger.error('Error improving material especificacion', error instanceof Error ? error : new Error(String(error)))
    throw error
  }
}

/**
 * Mejora la descripción de un procedimiento
 * - Estructura paso a paso
 * - Agrega precauciones
 * - Clarifica tiempos y personal
 */
export async function improveProcedimiento(
  textoOriginal: string
): Promise<ETTSugerenciaIA> {
  const prompt = `Como experto en procesos de mantenimiento, mejora el siguiente procedimiento.
La versión mejorada debe:
- Estructurada en pasos claros y numerados
- Incluir precauciones de seguridad específicas
- Usar verbos imperativos
- Ser fácil de seguir para técnicos

Procedimiento original:
"${textoOriginal}"

Responde SOLO con el procedimiento mejorado, sin explicaciones adicionales.`

  try {
    const mejorado = await callGroqAPI(prompt, 0.7)

    return {
      campo: 'procedimiento',
      texto_original: textoOriginal,
      texto_mejorado: mejorado.trim(),
      mejoras: [
        'Estructura paso a paso',
        'Precauciones añadidas',
        'Verbos imperativos',
        'Claridad mejorada'
      ]
    }
  } catch (error) {
    logger.error('Error improving procedimiento', error instanceof Error ? error : new Error(String(error)))
    throw error
  }
}

/**
 * Mejora medidas de riesgo
 * - Especifica EPP requerido
 * - Clarifica controles
 * - Cumplimiento normativo
 */
export async function improveRiesgoMedidas(
  textoOriginal: string
): Promise<ETTSugerenciaIA> {
  const prompt = `Como experto en seguridad y salud en el trabajo, mejora las siguientes medidas de prevención.
La versión mejorada debe:
- Especificar EPP (Equipos de Protección Personal)
- Incluir controles operacionales
- Referenciar cumplimiento normativo
- Ser implementable en planta

Medidas originales:
"${textoOriginal}"

Responde SOLO con las medidas mejoradas, sin explicaciones adicionales.`

  try {
    const mejorado = await callGroqAPI(prompt, 0.7)

    return {
      campo: 'riesgo_medidas',
      texto_original: textoOriginal,
      texto_mejorado: mejorado.trim(),
      mejoras: [
        'EPP especificado',
        'Controles operacionales añadidos',
        'Cumplimiento normativo',
        'Implementabilidad mejorada'
      ]
    }
  } catch (error) {
    logger.error('Error improving riesgo medidas', error instanceof Error ? error : new Error(String(error)))
    throw error
  }
}

/**
 * Genera una sección completa cuando está vacía
 */
export async function generateETTSection(
  tipoSeccion: 'trabajo' | 'procedimientos' | 'riesgos',
  contexto: string
): Promise<ETTSugerenciaIA> {
  const prompts: Record<string, string> = {
    trabajo: `Como experto en mantenimiento industrial, genera una descripción técnica completa para:
"${contexto}"

La descripción debe incluir:
- Objetivo claro del trabajo
- Consideraciones técnicas
- Requisitos de seguridad
- Tiempo estimado

Responde SOLO con la descripción, sin explicaciones.`,

    procedimientos: `Como experto en procedimientos de mantenimiento, genera un procedimiento detallado para:
"${contexto}"

Incluye:
- Pasos numerados y claros
- Precauciones específicas
- Tiempo por paso
- Personal requerido

Responde SOLO con el procedimiento, sin explicaciones.`,

    riesgos: `Como experto en análisis de riesgos, genera un análisis de riesgos completo para:
"${contexto}"

Incluye:
- Peligros identificados
- Probabilidad y consecuencia
- Medidas preventivas
- EPP requerido

Responde SOLO con el análisis, sin explicaciones.`
  }

  try {
    const resultado = await callGroqAPI(prompts[tipoSeccion] || '', 0.8)

    return {
      campo: tipoSeccion,
      texto_original: contexto,
      texto_mejorado: resultado.trim(),
      mejoras: [`Sección ${tipoSeccion} generada completamente`]
    }
  } catch (error) {
    logger.error(`Error generating ETT section ${tipoSeccion}`, error instanceof Error ? error : new Error(String(error)))
    throw error
  }
}
