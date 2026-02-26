/**
 * ARIA Orchestrator — ARIA como jefa de agentes IA
 * 
 * Recibe tareas, analiza complejidad, elige el mejor agente (o varios),
 * ejecuta con fallbacks automáticos, y logea cada misión.
 * 
 * Flujo:
 *  1. Analizar tipo de tarea (reasoning, speed, vision, code, general)
 *  2. Seleccionar agente óptimo para esa capability
 *  3. Ejecutar con fallback chain si falla
 *  4. Registrar en mission log
 */
import { logger } from '@/lib/logger'
import {
  type AgentCapability,
  getAgentsForCapability,
  getAllAgents,
  callAgent,
  callAgentStream,
  addMissionLog,
  isAgentAvailable,
  getAgentsConfig,
} from './aiAgents'

// ═══════════════════════════════════════════════════════════════════════
// TIPOS
// ═══════════════════════════════════════════════════════════════════════

export type TaskType = 'reasoning' | 'analysis' | 'code' | 'vision' | 'speed' | 'general'

export interface OrchestratorTask {
  messages: Array<{ role: string; content: string }>
  /** Tipo de tarea — determina qué agente se elige */
  taskType: TaskType
  /** Preview del task para logs (primeros ~80 chars del último mensaje user) */
  taskPreview?: string
  /** Opciones */
  opts?: {
    temperature?: number
    max_tokens?: number
    thinkingBudget?: number
    /** Forzar un agente específico */
    forceAgent?: string
    /** Excluir agentes */
    excludeAgents?: string[]
  }
}

export interface OrchestratorResult {
  content: string
  tokens: number
  agentId: string
  agentName: string
  latencyMs: number
  /** ¿Hubo fallback? */
  fallbackUsed: boolean
  /** Cadena de intentos */
  attempts: Array<{ agentId: string; success: boolean; error?: string }>
}

// ═══════════════════════════════════════════════════════════════════════
// MAPEO tarea → capability
// ═══════════════════════════════════════════════════════════════════════

const TASK_TO_CAPABILITY: Record<TaskType, AgentCapability> = {
  reasoning: 'reasoning',
  analysis: 'analysis',
  code: 'code',
  vision: 'vision',
  speed: 'speed',
  general: 'general',
}

// ═══════════════════════════════════════════════════════════════════════
// DETECCIÓN AUTOMÁTICA de tipo de tarea
// ═══════════════════════════════════════════════════════════════════════

const REASONING_PATTERNS = /\b(por qu[eé]|analiz|compar|evalu|diagnostic|razon|explain|causa ra[ií]z|root cause|profund|complej)\b/i
const CODE_PATTERNS = /\b(c[oó]digo|script|funci[oó]n|variable|debug|error de c|programar?|api|json|sql)\b/i
const SPEED_PATTERNS = /\b(r[aá]pid|quick|simple|s[ií]|no|ok|hola|list|dame|cu[aá]nto)\b/i
const ANALYSIS_PATTERNS = /\b(tendencia|histori|estad[ií]stic|patr[oó]n|predicti|gr[aá]fic|reporte|resumen|sensor|telemetr[ií]a)\b/i

export function detectTaskType(userMessage: string): TaskType {
  const msg = userMessage.toLowerCase()
  
  // Vision se detecta externamente (cuando hay imágenes)
  if (REASONING_PATTERNS.test(msg)) return 'reasoning'
  if (CODE_PATTERNS.test(msg)) return 'code'
  if (ANALYSIS_PATTERNS.test(msg)) return 'analysis'
  if (SPEED_PATTERNS.test(msg) && msg.length < 60) return 'speed'
  return 'general'
}

// ═══════════════════════════════════════════════════════════════════════
// ORQUESTACIÓN PRINCIPAL
// ═══════════════════════════════════════════════════════════════════════

/**
 * Ejecuta una tarea eligiendo el mejor agente disponible,
 * con fallback automático si el primero falla.
 */
export async function orchestrate(task: OrchestratorTask): Promise<OrchestratorResult> {
  // Asegurar config cargada
  await getAgentsConfig()

  const capability = TASK_TO_CAPABILITY[task.taskType]
  const preview = task.taskPreview || task.messages[task.messages.length - 1]?.content?.slice(0, 80) || '(empty)'

  // Construir cadena de agentes
  let agentChain: string[]
  if (task.opts?.forceAgent) {
    agentChain = [task.opts.forceAgent]
  } else {
    agentChain = getAgentsForCapability(capability).map(a => a.id)
    // Excluir manualmente
    if (task.opts?.excludeAgents) {
      agentChain = agentChain.filter(id => !task.opts!.excludeAgents!.includes(id))
    }
  }

  if (agentChain.length === 0) {
    // Último recurso: cualquier agente online
    agentChain = getAllAgents().filter(a => a.status === 'online').map(a => a.id)
  }

  if (agentChain.length === 0) {
    throw new Error('No hay agentes IA disponibles. Verifica las API keys.')
  }

  const attempts: OrchestratorResult['attempts'] = []
  let lastError: Error | null = null

  for (const agentId of agentChain) {
    if (!isAgentAvailable(agentId)) {
      attempts.push({ agentId, success: false, error: 'not available' })
      continue
    }

    try {
      const result = await callAgent(agentId, task.messages, {
        temperature: task.opts?.temperature,
        max_tokens: task.opts?.max_tokens,
        thinkingBudget: task.opts?.thinkingBudget,
      })

      const agent = getAllAgents().find(a => a.id === agentId)
      attempts.push({ agentId, success: true })

      // Log misión exitosa
      addMissionLog({
        taskType: task.taskType,
        taskPreview: preview,
        agentId,
        agentName: agent?.name || agentId,
        status: attempts.length > 1 ? 'fallback' : 'success',
        latencyMs: result.latencyMs,
        tokens: result.tokens,
        fallbackTo: attempts.length > 1 ? agentId : undefined,
      })

      return {
        content: result.content,
        tokens: result.tokens,
        agentId,
        agentName: agent?.name || agentId,
        latencyMs: result.latencyMs,
        fallbackUsed: attempts.length > 1,
        attempts,
      }
    } catch (err) {
      lastError = err instanceof Error ? err : new Error(String(err))
      attempts.push({ agentId, success: false, error: lastError.message })
      logger.warn(`Agent ${agentId} falló: ${lastError.message}, intentando siguiente...`)
    }
  }

  // Todos fallaron
  addMissionLog({
    taskType: task.taskType,
    taskPreview: preview,
    agentId: agentChain[0] || 'none',
    agentName: 'TODOS',
    status: 'error',
    latencyMs: 0,
    tokens: 0,
    errorMsg: lastError?.message || 'Todos los agentes fallaron',
  })

  throw new Error(`Todos los agentes fallaron para tarea "${task.taskType}": ${lastError?.message}`)
}

/**
 * Igual que orchestrate pero con streaming — le da al usuario la respuesta progresiva
 */
export async function orchestrateStream(
  task: OrchestratorTask,
  onChunk: (text: string) => void,
): Promise<OrchestratorResult> {
  await getAgentsConfig()

  const capability = TASK_TO_CAPABILITY[task.taskType]
  const preview = task.taskPreview || task.messages[task.messages.length - 1]?.content?.slice(0, 80) || '(empty)'

  let agentChain: string[]
  if (task.opts?.forceAgent) {
    agentChain = [task.opts.forceAgent]
  } else {
    agentChain = getAgentsForCapability(capability).map(a => a.id)
    if (task.opts?.excludeAgents) {
      agentChain = agentChain.filter(id => !task.opts!.excludeAgents!.includes(id))
    }
  }

  if (agentChain.length === 0) {
    agentChain = getAllAgents().filter(a => a.status === 'online').map(a => a.id)
  }

  if (agentChain.length === 0) {
    throw new Error('No hay agentes IA disponibles.')
  }

  const attempts: OrchestratorResult['attempts'] = []
  let lastError: Error | null = null

  for (const agentId of agentChain) {
    if (!isAgentAvailable(agentId)) {
      attempts.push({ agentId, success: false, error: 'not available' })
      continue
    }

    try {
      const result = await callAgentStream(agentId, task.messages, onChunk, {
        temperature: task.opts?.temperature,
        max_tokens: task.opts?.max_tokens,
        thinkingBudget: task.opts?.thinkingBudget,
      })

      const agent = getAllAgents().find(a => a.id === agentId)
      attempts.push({ agentId, success: true })

      addMissionLog({
        taskType: task.taskType,
        taskPreview: preview,
        agentId,
        agentName: agent?.name || agentId,
        status: attempts.length > 1 ? 'fallback' : 'success',
        latencyMs: result.latencyMs,
        tokens: result.tokens,
        fallbackTo: attempts.length > 1 ? agentId : undefined,
      })

      return {
        content: result.content,
        tokens: result.tokens,
        agentId,
        agentName: agent?.name || agentId,
        latencyMs: result.latencyMs,
        fallbackUsed: attempts.length > 1,
        attempts,
      }
    } catch (err) {
      lastError = err instanceof Error ? err : new Error(String(err))
      attempts.push({ agentId, success: false, error: lastError.message })
      logger.warn(`Stream agent ${agentId} falló: ${lastError.message}`)
    }
  }

  addMissionLog({
    taskType: task.taskType,
    taskPreview: preview,
    agentId: agentChain[0] || 'none',
    agentName: 'TODOS',
    status: 'error',
    latencyMs: 0,
    tokens: 0,
    errorMsg: lastError?.message,
  })

  throw new Error(`Todos los agentes de streaming fallaron: ${lastError?.message}`)
}
