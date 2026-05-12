/**
 * ARIA Context Engine — detect → execute → inject.
 *
 * Pattern: tool-as-context-injection.
 *  1. Detecta tools relevantes por triggers regex (sin LLM call).
 *  2. Infiere params del texto libre.
 *  3. Ejecuta las tools en paralelo.
 *  4. Formatea resultados como bloque markdown para inyectar como system message.
 *
 * Mantiene a ARIA independiente del modelo: cualquier agente del orquestador
 * (Gemini/Groq/Claude/OpenAI) consume el mismo contexto.
 */
import { logger } from '@/lib/logger'
import { executeTool, inferToolParams, matchTools } from './tools'

const MAX_TOOLS_PER_MESSAGE = 3

export interface AriaContext {
  hasResults: boolean
  /** Bloque listo para inyectar como system message */
  contextBlock: string
  /** Tools invocadas con resultado */
  invocations: Array<{ tool: string; label?: string; ok: boolean; error?: string }>
}

/**
 * Detecta y ejecuta tools relevantes al mensaje del usuario.
 * Hard limit de 3 tools por mensaje para no inflar el prompt.
 */
export async function buildAriaContext(userMessage: string): Promise<AriaContext> {
  const matches = matchTools(userMessage).slice(0, MAX_TOOLS_PER_MESSAGE)
  if (matches.length === 0) {
    return { hasResults: false, contextBlock: '', invocations: [] }
  }

  const results = await Promise.all(
    matches.map(async (m) => {
      const params = inferToolParams(m.tool.name, userMessage)
      const result = await executeTool(m.tool.name, params)
      return { tool: m.tool.name, result }
    }),
  )

  const blocks: string[] = []
  const invocations: AriaContext['invocations'] = []

  for (const { tool, result } of results) {
    invocations.push({
      tool,
      ...(result.label !== undefined && { label: result.label }),
      ok: result.ok,
      ...(result.error !== undefined && { error: result.error }),
    })
    if (!result.ok) {
      logger.warn(`[ariaContext] Tool ${tool} falló: ${result.error || 'sin razón'}`)
      continue
    }
    if (result.summary) {
      const heading = result.label ? `▸ ${result.label}` : `▸ ${tool}`
      blocks.push(`${heading}\n${result.summary}`)
    }
  }

  if (blocks.length === 0) {
    return { hasResults: false, contextBlock: '', invocations }
  }

  const contextBlock = [
    '📊 DATOS REALES CONSULTADOS EN LA BASE DE DATOS (úsalos como verdad absoluta — NO inventes números):',
    '',
    blocks.join('\n\n'),
    '',
    'INSTRUCCIONES: Cita estos datos exactos cuando respondas. Si el usuario pide algo no incluido en estos datos, dilo claramente en lugar de inventar. Mantén tu respuesta breve, directa y con unidades.',
  ].join('\n')

  return { hasResults: true, contextBlock, invocations }
}
