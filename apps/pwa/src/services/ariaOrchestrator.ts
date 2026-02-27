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
  agentEmoji: string
  latencyMs: number
  /** ¿Hubo fallback? */
  fallbackUsed: boolean
  /** Cadena de intentos */
  attempts: Array<{ agentId: string; success: boolean; error?: string }>
}

/** Evento de status que el orquestador emite para que el UI muestre actividad */
export interface AgentStatusEvent {
  phase: 'analyzing' | 'selecting' | 'calling' | 'streaming' | 'fallback' | 'done' | 'error'
  agentId?: string
  agentName?: string
  agentEmoji?: string
  taskType?: TaskType
  message: string
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

const REASONING_PATTERNS = /\b(por qu[eé]|analiz[ae]|compar|evalu|diagnostic|razon|explain|causa ra[ííi]z|root cause|profund|complej|investigar?|deduci|hipotesis|conclusi[oó]n)\b/i
const CODE_PATTERNS = /\b(c[oó]digo|script|funci[oó]n|variable|debug|error de c|programar?|api|json|sql|regex|algoritmo)\b/i
const SPEED_PATTERNS = /\b(r[aá]pid|quick|simple|s[ííi]|no|ok|hola|list|dame|cu[aá]nto|gracias|chao|adi[oó]s)\b/i
const ANALYSIS_PATTERNS = /\b(tendencia|histori|estad[ííi]stic|patr[oó]n|predicti|gr[aá]fic|reporte|resumen|sensor|telemetr[ííi]a|consumo|m[eé]trica|kpi|indicador|rendimiento|eficiencia|producci[oó]n)\b/i
// Palabras clave del contexto industrial de la planta
const INDUSTRIAL_PATTERNS = /\b(repuesto|motor|grader|bomba|compresor|variador|plc|equipo|componente|falla|incidencia|mantenci[oó]n|mantenimiento|cat[aá]logo|stock|inventario|sap|t[eé]cnico|operador|turno|alerta|cr[ií]tic)\b/i

export function detectTaskType(userMessage: string): TaskType {
  const msg = userMessage.toLowerCase()
  
  // Vision se detecta externamente (cuando hay imágenes)
  if (REASONING_PATTERNS.test(msg)) return 'reasoning'
  if (CODE_PATTERNS.test(msg)) return 'code'
  if (ANALYSIS_PATTERNS.test(msg)) return 'analysis'
  // Consultas industriales requieren análisis de contexto (RAG) — usar agentes fuertes
  if (INDUSTRIAL_PATTERNS.test(msg)) return 'analysis'
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
    // Forzar agente pero agregar fallbacks por si falla
    const fallbackAgents = getAgentsForCapability(capability)
      .map(a => a.id)
      .filter(id => id !== task.opts!.forceAgent)
    agentChain = [task.opts.forceAgent, ...fallbackAgents]
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
      const logEntry1: Parameters<typeof addMissionLog>[0] = {
        taskType: task.taskType,
        taskPreview: preview,
        agentId,
        agentName: agent?.name || agentId,
        status: attempts.length > 1 ? 'fallback' : 'success',
        latencyMs: result.latencyMs,
        tokens: result.tokens,
      }
      if (attempts.length > 1) logEntry1.fallbackTo = agentId
      addMissionLog(logEntry1)

      return {
        content: result.content,
        tokens: result.tokens,
        agentId,
        agentName: agent?.name || agentId,
        agentEmoji: agent?.emoji || '🤖',
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
 * @param onStatus — callback para mostrar al usuario qué agente está haciendo qué
 */
export async function orchestrateStream(
  task: OrchestratorTask,
  onChunk: (text: string) => void,
  onStatus?: (event: AgentStatusEvent) => void,
): Promise<OrchestratorResult> {
  await getAgentsConfig()

  const capability = TASK_TO_CAPABILITY[task.taskType]
  const preview = task.taskPreview || task.messages[task.messages.length - 1]?.content?.slice(0, 80) || '(empty)'

  // Fase 1: Analizando
  onStatus?.({
    phase: 'analyzing',
    taskType: task.taskType,
    message: `Analizando consulta · tipo: ${task.taskType}`,
  })

  let agentChain: string[]
  if (task.opts?.forceAgent) {
    // Forzar agente pero agregar fallbacks por si falla (ej: 402 sin saldo)
    const fallbackAgents = getAgentsForCapability(capability)
      .map(a => a.id)
      .filter(id => id !== task.opts!.forceAgent)
    agentChain = [task.opts.forceAgent, ...fallbackAgents]
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
    onStatus?.({ phase: 'error', message: 'No hay agentes disponibles' })
    throw new Error('No hay agentes IA disponibles.')
  }

  // Fase 2: Seleccionando agente
  const firstAgent = getAllAgents().find(a => a.id === agentChain[0])
  onStatus?.({
    phase: 'selecting',
    agentId: agentChain[0],
    agentName: firstAgent?.name,
    agentEmoji: firstAgent?.emoji,
    message: `Seleccionando ${firstAgent?.emoji || ''} ${firstAgent?.name || agentChain[0]}`,
  })

  const attempts: OrchestratorResult['attempts'] = []
  let lastError: Error | null = null

  for (const agentId of agentChain) {
    if (!isAgentAvailable(agentId)) {
      attempts.push({ agentId, success: false, error: 'not available' })
      continue
    }

    const agent = getAllAgents().find(a => a.id === agentId)

    // Fase 3: Llamando al agente
    onStatus?.({
      phase: attempts.length > 0 ? 'fallback' : 'calling',
      agentId,
      agentName: agent?.name,
      agentEmoji: agent?.emoji,
      message: attempts.length > 0
        ? `Cambiando a ${agent?.emoji || ''} ${agent?.name || agentId}...`
        : `${agent?.emoji || ''} ${agent?.name || agentId} procesando...`,
    })

    try {
      // Fase 4: Streaming
      onStatus?.({
        phase: 'streaming',
        agentId,
        agentName: agent?.name,
        agentEmoji: agent?.emoji,
        message: `${agent?.emoji || ''} ${agent?.name || agentId} respondiendo...`,
      })

      const result = await callAgentStream(agentId, task.messages, onChunk, {
        temperature: task.opts?.temperature,
        max_tokens: task.opts?.max_tokens,
        thinkingBudget: task.opts?.thinkingBudget,
      })

      attempts.push({ agentId, success: true })

      // Fase 5: Done
      onStatus?.({
        phase: 'done',
        agentId,
        agentName: agent?.name,
        agentEmoji: agent?.emoji,
        message: `${agent?.emoji || ''} ${agent?.name || agentId} completó en ${result.latencyMs > 1000 ? (result.latencyMs / 1000).toFixed(1) + 's' : result.latencyMs + 'ms'}`,
      })

      const logEntry2: Parameters<typeof addMissionLog>[0] = {
        taskType: task.taskType,
        taskPreview: preview,
        agentId,
        agentName: agent?.name || agentId,
        status: attempts.length > 1 ? 'fallback' : 'success',
        latencyMs: result.latencyMs,
        tokens: result.tokens,
      }
      if (attempts.length > 1) logEntry2.fallbackTo = agentId
      addMissionLog(logEntry2)

      return {
        content: result.content,
        tokens: result.tokens,
        agentId,
        agentName: agent?.name || agentId,
        agentEmoji: agent?.emoji || '🤖',
        latencyMs: result.latencyMs,
        fallbackUsed: attempts.length > 1,
        attempts,
      }
    } catch (err) {
      lastError = err instanceof Error ? err : new Error(String(err))
      attempts.push({ agentId, success: false, error: lastError.message })

      onStatus?.({
        phase: 'fallback',
        agentId,
        agentName: agent?.name,
        agentEmoji: agent?.emoji,
        message: `${agent?.emoji || ''} ${agent?.name || agentId} falló · buscando alternativa...`,
      })

      logger.warn(`Stream agent ${agentId} falló: ${lastError.message}`)
    }
  }

  onStatus?.({ phase: 'error', message: 'Todos los agentes fallaron' })

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
