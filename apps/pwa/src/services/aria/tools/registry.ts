/**
 * ARIA Tool Registry — registro central + executor.
 */
import { logger } from '@/lib/logger'
import type { Tool, ToolMatch, ToolResult } from './types'

const REGISTRY = new Map<string, Tool>()

export function registerTool(tool: Tool): void {
  if (REGISTRY.has(tool.name)) {
    logger.warn(`[ariaTools] Tool ya registrada (sobrescribiendo): ${tool.name}`)
  }
  REGISTRY.set(tool.name, tool)
}

export function getTool(name: string): Tool | undefined {
  return REGISTRY.get(name)
}

export function listTools(category?: Tool['category']): Tool[] {
  const all = Array.from(REGISTRY.values())
  return category ? all.filter(t => t.category === category) : all
}

/**
 * Detecta qué tools podrían responder un mensaje del usuario.
 * Retorna ordenadas por confianza descendente.
 */
export function matchTools(userMessage: string): ToolMatch[] {
  const lower = userMessage.toLowerCase()
  const matches: ToolMatch[] = []
  for (const tool of REGISTRY.values()) {
    for (const trigger of tool.triggers) {
      if (trigger.test(lower)) {
        matches.push({ tool, params: {}, confidence: 0.8 })
        break // un trigger por tool basta
      }
    }
  }
  return matches.sort((a, b) => b.confidence - a.confidence)
}

/**
 * Ejecuta una tool por nombre con params.
 */
export async function executeTool(
  name: string,
  params: Record<string, unknown> = {},
): Promise<ToolResult> {
  const tool = REGISTRY.get(name)
  if (!tool) {
    return { ok: false, error: `Tool no registrada: ${name}` }
  }
  try {
    const result = await tool.execute(params)
    return result
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err)
    logger.error(`[ariaTools] Tool ${name} falló: ${msg}`)
    return { ok: false, error: msg }
  }
}

/** Solo para tests. */
export function clearRegistry(): void {
  REGISTRY.clear()
}
