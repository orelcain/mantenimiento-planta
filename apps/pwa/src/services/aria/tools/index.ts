/**
 * ARIA Tool Registry — punto de entrada.
 *
 * Importar este módulo registra todas las tools como side-effect.
 * Las tools se invocan luego con executeTool() / matchTools().
 */
export type { Tool, ToolCategory, ToolMatch, ToolParam, ToolResult } from './types'
export { clearRegistry, executeTool, getTool, listTools, matchTools, registerTool } from './registry'

// Side effects: registrar tools de cada dominio
import './grader'
import './incidents'
import './equipment'

import { inferToolParams as inferGraderParams } from './grader'
import { inferEquipmentParams } from './equipment'

/**
 * Inferencia combinada — enruta al inference del dominio correspondiente
 * según el prefijo del tool name.
 */
export function inferToolParams(toolName: string, userMessage: string): Record<string, unknown> {
  if (toolName.startsWith('shift.') || toolName.startsWith('period.')) {
    return inferGraderParams(toolName, userMessage)
  }
  if (toolName.startsWith('equipment.') || toolName.startsWith('incidents.')) {
    return inferEquipmentParams(toolName, userMessage)
  }
  return {}
}
