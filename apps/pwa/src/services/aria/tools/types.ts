/**
 * ARIA Tool Registry — tipos.
 *
 * Una "tool" es una función nombrada que ARIA puede invocar para consultar
 * datos exactos de la app (KPIs, métricas, búsquedas, agregaciones). El
 * resultado se inyecta como contexto en el prompt del LLM, garantizando
 * respuestas con datos reales en lugar de alucinaciones.
 *
 * Patrón: tool-as-context-injection (model-agnostic, funciona con cualquier
 * agente del orquestador — Gemini, Groq, Claude, OpenAI).
 */

export type ToolCategory =
  | 'shift'
  | 'grader'
  | 'equipment'
  | 'repuestos'
  | 'insumos'
  | 'incidents'
  | 'system'

export interface ToolParam {
  name: string
  type: 'string' | 'number' | 'boolean' | 'date'
  required?: boolean
  description: string
  default?: unknown
  enum?: string[]
}

export interface Tool {
  /** Identificador único — formato 'categoria.accion' (ej: 'shift.today') */
  name: string
  category: ToolCategory
  /** Qué hace la tool (consumido por el LLM como hint) */
  description: string
  /** Parámetros que acepta */
  params: ToolParam[]
  /** Patrones conversacionales que la disparan */
  triggers: RegExp[]
  /** Ejecutor — recibe params ya parseados */
  execute: (params: Record<string, unknown>) => Promise<ToolResult> | ToolResult
}

export interface ToolResult {
  /** ¿La tool encontró datos válidos? */
  ok: boolean
  /** Datos crudos serializables (se exponen al LLM como JSON si hay summary vacío) */
  data?: Record<string, unknown> | unknown[]
  /** Resumen humano-legible (markdown) — preferido por el LLM */
  summary?: string
  /** Mensaje de error si ok=false */
  error?: string
  /** Etiqueta corta para mostrar en UI (ej. "Turno actual", "Top 5 P0%") */
  label?: string
}

/** Match detectado en un mensaje del usuario */
export interface ToolMatch {
  tool: Tool
  params: Record<string, unknown>
  /** Confianza heurística del match (0-1) */
  confidence: number
}
