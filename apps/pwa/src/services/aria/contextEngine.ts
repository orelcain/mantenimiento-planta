/**
 * ARIA Context Engine — detect → execute → inject.
 *
 * Selección de tools HÍBRIDA (aditiva, nunca pierde cobertura):
 *  1. Regex triggers (matchTools) — rápido, sin LLM, cubre lo obvio.
 *  2. Tools elegidas por el LLM (extraToolNames) — por INTENCIÓN, rompe el
 *     techo del regex: si el usuario no dice la frase-gatillo exacta pero el
 *     sentido pide una tool que existe, el LLM la elige igual.
 *  Se ejecuta la UNIÓN (dedup + cap). Los params SIEMPRE los rellena el
 *  inferidor determinista (inferToolParams) — el LLM solo elige el NOMBRE, no
 *  inventa params.
 *
 * Formatea resultados como bloque markdown para inyectar como system message.
 * Mantiene a ARIA independiente del modelo: cualquier agente del orquestador
 * (Gemini/Groq/DeepSeek/Claude) consume el mismo contexto.
 */
import { logger } from '@/lib/logger'
import { executeTool, getTool, inferToolParams, listTools, matchTools } from './tools'

const MAX_TOOLS_PER_MESSAGE = 4

export interface AriaContext {
  hasResults: boolean
  /** Bloque listo para inyectar como system message */
  contextBlock: string
  /** Tools invocadas con resultado */
  invocations: Array<{ tool: string; label?: string; ok: boolean; error?: string }>
}

/**
 * Catálogo compacto (nombre: descripción) de TODAS las tools registradas, para
 * que el LLM del pre-análisis elija por intención. No incluye params (los
 * infiere el código).
 */
export function buildToolCatalog(): string {
  return listTools()
    .map((t) => `- ${t.name}: ${t.description}`)
    .join('\n')
}

/**
 * Resuelve los NOMBRES de tools a ejecutar: unión de (a) match por regex y
 * (b) tools elegidas por el LLM (validadas contra el registry). Dedup + cap.
 * El LLM va primero (intención explícita), luego los del regex.
 */
export function resolveToolNames(userMessage: string, extraToolNames: string[] = []): string[] {
  const fromRegex = matchTools(userMessage).map((m) => m.tool.name)
  const fromLLM = extraToolNames.filter((n) => typeof n === 'string' && !!getTool(n))
  const seen = new Set<string>()
  const ordered: string[] = []
  for (const name of [...fromLLM, ...fromRegex]) {
    if (!seen.has(name)) {
      seen.add(name)
      ordered.push(name)
    }
  }
  return ordered.slice(0, MAX_TOOLS_PER_MESSAGE)
}

/**
 * Detecta y ejecuta tools relevantes al mensaje del usuario.
 * @param extraToolNames tools que el LLM eligió (opcional) — se unen a las del regex.
 */
export async function buildAriaContext(
  userMessage: string,
  extraToolNames: string[] = [],
): Promise<AriaContext> {
  const toolNames = resolveToolNames(userMessage, extraToolNames)
  if (toolNames.length === 0) {
    return { hasResults: false, contextBlock: '', invocations: [] }
  }

  const results = await Promise.all(
    toolNames.map(async (name) => {
      const params = inferToolParams(name, userMessage)
      const result = await executeTool(name, params)
      return { tool: name, result }
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
