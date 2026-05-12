/**
 * ARIA Tool Registry — punto de entrada.
 *
 * Importar este módulo registra todas las tools como side-effect.
 * Las tools se invocan luego con executeTool() / matchTools().
 */
export type { Tool, ToolCategory, ToolMatch, ToolParam, ToolResult } from './types'
export { clearRegistry, executeTool, getTool, listTools, matchTools, registerTool } from './registry'
export { inferToolParams } from './grader'

// Side effect: registrar tools del dominio Grader
import './grader'
