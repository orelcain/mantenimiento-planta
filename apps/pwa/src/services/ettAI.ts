/**
 * Servicios de IA para ETT
 *
 * Expone DOS funciones:
 *
 *   1. `mejorarTexto(texto, contexto)`
 *        Mejora la redacción de un texto corto (1-5 líneas).
 *        Usado desde el editor WYSIWYG en el botón "✨ Mejorar" de cada bloque.
 *
 *   2. `completarPlantillaIA(ctx)`
 *        A partir de una plantilla + descripción libre del usuario, devuelve
 *        un objeto estructurado con los campos rellenos y la lista de campos
 *        faltantes que la IA no pudo inferir.
 *
 * Ambas usan el proxy centralizado de Groq vía Cloud Function `groqProxy`.
 */

import { logger } from '@/lib/logger'
import type { ETTContextoIA, ETTCompletadoIA } from '@/types'
import { getPlantilla } from '@/data/ettTemplates'

// ============================================================================
// HELPER: llamada al proxy de Groq
// ============================================================================

async function callGroqAPI(
  prompt: string,
  opts: { temperature?: number; maxTokens?: number; jsonMode?: boolean } = {},
): Promise<string> {
  try {
    const { isAIConfigured } = await import('./ai')
    if (!isAIConfigured()) {
      throw new Error('IA no configurada (falta API key de Groq)')
    }

    const { httpsCallable, getFunctions } = await import('firebase/functions')
    const firebaseApp = (await import('@/services/firebase')).default

    const functions = getFunctions(firebaseApp)
    const groqProxy = httpsCallable(functions, 'groqProxy')

    const result = await groqProxy({
      messages: [{ role: 'user', content: prompt }],
      model: 'llama-3.3-70b-versatile',
      temperature: opts.temperature ?? 0.5,
      max_tokens: opts.maxTokens ?? 1500,
      response_format: opts.jsonMode ? { type: 'json_object' } : undefined,
    })

    const data = result.data as { content: string }
    return data.content || ''
  } catch (error) {
    logger.error(
      'Error llamando a Groq',
      error instanceof Error ? error : new Error(String(error)),
    )
    throw error
  }
}

// ============================================================================
// 1. MEJORAR TEXTO (para botón "✨ Mejorar" de cada bloque)
// ============================================================================

/** Contexto del texto a mejorar — guía a la IA sobre el tono y formato esperado */
export type ContextoMejora =
  | 'parrafo' // Párrafo descriptivo general
  | 'lista_item' // Item de una lista con viñetas
  | 'responsabilidad' // Responsabilidad del contratista
  | 'area' // Descripción del área de intervención

/**
 * Mejora la redacción técnica de un texto corto.
 *
 * La IA:
 *   - Usa terminología técnica de mantenimiento industrial
 *   - Mantiene el largo similar al original (no infla el texto)
 *   - Devuelve SOLO el texto mejorado, sin explicaciones
 *   - Respeta el contexto (si es lista item, no agrega "En primer lugar...")
 */
export async function mejorarTexto(
  textoOriginal: string,
  contexto: ContextoMejora = 'parrafo',
): Promise<string> {
  const instruccionesPorContexto: Record<ContextoMejora, string> = {
    parrafo:
      'Mejora este párrafo manteniendo su extensión. Usa terminología técnica precisa de mantenimiento industrial.',
    lista_item:
      'Mejora este item de lista. Debe ser conciso (1 línea), empezar con un verbo en infinitivo o sustantivo, sin conectores narrativos.',
    responsabilidad:
      'Mejora esta responsabilidad del contratista. Debe empezar con verbo en infinitivo, ser específica y medible.',
    area:
      'Mejora esta descripción de área de intervención. Debe ser específica (ubicación, superficie, referencias visuales) pero concisa.',
  }

  const prompt = `Como experto en ingeniería de mantenimiento industrial, ${instruccionesPorContexto[contexto]}

Texto original:
"""
${textoOriginal}
"""

Responde SOLO con el texto mejorado, sin comillas, sin prefijos, sin explicaciones.`

  const mejorado = await callGroqAPI(prompt, { temperature: 0.4, maxTokens: 500 })
  return mejorado.trim().replace(/^["']|["']$/g, '')
}

// ============================================================================
// 2. COMPLETAR PLANTILLA CON IA (asistente conversacional)
// ============================================================================

/**
 * A partir de una descripción libre del usuario, completa los campos
 * de una plantilla ETT con structured output (JSON).
 *
 * Flujo esperado en la UI:
 *
 *   1. Usuario elige "Asistente IA" y dicta/escribe qué trabajo necesita
 *   2. Se llama esta función con la plantilla base + la descripción
 *   3. La IA devuelve `ETTCompletadoIA`:
 *      - Campos que pudo inferir (cabecera, area_intervencion, bloques, ...)
 *      - Lista de `campos_faltantes` con preguntas concretas
 *   4. La UI muestra los valores inferidos + lista de preguntas
 *   5. Usuario responde las preguntas una por una
 *   6. Al final, el documento se abre en el editor WYSIWYG para ajuste fino
 */
export async function completarPlantillaIA(
  ctx: ETTContextoIA,
): Promise<ETTCompletadoIA> {
  const plantilla = getPlantilla(ctx.plantilla_id)

  const prompt = `Eres un ingeniero experto en mantenimiento industrial que prepara Especificaciones Técnicas de Trabajo (ETT) para AquaChile - Planta Chonchi.

Tu tarea es completar los campos variables de una plantilla ETT a partir de la descripción libre del usuario.

PLANTILLA BASE (${plantilla.nombre}):
${JSON.stringify(plantilla.defaults, null, 2)}

DESCRIPCIÓN DEL USUARIO:
"""
${ctx.descripcion_usuario}
"""

PERFIL DEL USUARIO:
- Departamento: ${ctx.user_profile?.departamento ?? 'Dpto. Mantención Chonchi'}
- Nombre: ${ctx.user_profile?.nombre ?? '(no informado)'}

INSTRUCCIONES:
1. Reemplaza los slots con corchetes \`[...]\` por valores concretos basados en la descripción del usuario.
2. Usa el mismo estilo técnico del ejemplo (frases directas, sin coloquialismos).
3. Si algún campo NO puede inferirse con certeza, déjalo con su valor original \`[...]\` Y agrégalo a \`campos_faltantes\` con una pregunta clara.
4. Mantén la ESTRUCTURA de bloques intacta (no cambies tipos, solo reemplaza strings).
5. Para fechas, usa objetos \`{ "__date__": "YYYY-MM-DD" }\` que serán convertidos a Date por el frontend.

FORMATO DE RESPUESTA (JSON estricto):
{
  "cabecera": {
    "proyecto": "...",
    "usuario_solicitante": "...",
    "sector_realizacion": "..."
  },
  "area_intervencion": "...",
  "descripcion_trabajos": [ ... bloques con la misma estructura que la plantilla ... ],
  "responsabilidades_contratista": [ "...", "..." ],
  "campos_faltantes": [
    { "campo": "fecha_inicio", "pregunta": "¿Fecha estimada de inicio?", "tipo": "fecha" },
    { "campo": "cantidad", "pregunta": "¿Cuántas unidades?", "tipo": "numero" }
  ]
}

Devuelve SOLO el JSON, sin markdown, sin texto adicional.`

  const raw = await callGroqAPI(prompt, {
    temperature: 0.3,
    maxTokens: 2500,
    jsonMode: true,
  })

  try {
    const parsed = JSON.parse(raw) as ETTCompletadoIA
    // Garantizar que campos_faltantes siempre sea un array
    if (!Array.isArray(parsed.campos_faltantes)) {
      parsed.campos_faltantes = []
    }
    return parsed
  } catch (err) {
    logger.error(
      'IA devolvió JSON inválido en completarPlantillaIA',
      err instanceof Error ? err : new Error(String(err)),
    )
    // Fallback: devolver solo los campos_faltantes pidiendo al usuario que complete todo
    return {
      campos_faltantes: [
        {
          campo: 'descripcion',
          pregunta:
            'No pude interpretar tu descripción. ¿Podés explicarla con más detalle?',
          tipo: 'texto',
        },
      ],
    }
  }
}
