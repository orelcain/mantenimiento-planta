/**
 * AI Agents Registry — Registro de agentes IA disponibles
 * 
 * Cada agente tiene: proveedor, modelo, capabilities, estado, costos.
 * DeepSeek R1, Qwen QwQ-32B (Groq), Gemini Flash, Llama 3.3 (Groq).
 * 
 * Formato OpenAI-compatible para DeepSeek y Groq.
 * Gemini usa su propio formato (adaptado en ai.ts).
 */
import { logger } from '@/lib/logger'
import { RateLimitError } from './ai'
import { doc, getDoc, setDoc, serverTimestamp } from '@/services/firestoreTracked'
import { db } from './firebase'

// ═══════════════════════════════════════════════════════════════════════
// TIPOS
// ═══════════════════════════════════════════════════════════════════════

export type AgentCapability = 'reasoning' | 'vision' | 'code' | 'speed' | 'general' | 'analysis'
export type AgentStatus = 'online' | 'rate-limited' | 'offline' | 'disabled'

export interface AIAgent {
  id: string
  name: string
  provider: 'deepseek' | 'groq' | 'gemini' | 'openai'
  model: string
  emoji: string
  capabilities: AgentCapability[]
  /** Mayor = se prefiere para esa capability */
  priority: number
  /** free / cheap / moderate */
  costTier: 'free' | 'cheap' | 'moderate'
  /** Límite RPD estimado (requests per day) */
  dailyLimit: number
  /** ¿Soporta streaming? */
  streaming: boolean
  /** ¿Soporta modo thinking/reasoning nativo? */
  thinking: boolean
  /** Estado actual en runtime */
  status: AgentStatus
  /** Timestamp de cuándo se marcó rate-limited */
  rateLimitedUntil?: number
  /** Requests usados hoy */
  usedToday: number
  /** Tokens usados hoy */
  tokensToday: number
}

export interface AgentCallResult {
  content: string
  tokens: number
  agentId: string
  latencyMs: number
}

export interface MissionLog {
  id: string
  timestamp: number
  taskType: string
  taskPreview: string
  agentId: string
  agentName: string
  status: 'success' | 'error' | 'fallback'
  latencyMs: number
  tokens: number
  /** Costo estimado en USD (basado en costTier + tokens) */
  estimatedCostUsd?: number
  errorMsg?: string
  fallbackTo?: string
}

// ═══════════════════════════════════════════════════════════════════════
// KEYS DE PROVIDERS (solo se usan si Cloud Functions no están disponibles)
// SECURITY: las keys no se envían al browser en producción si VITE_*
// no están configuradas. Preferir siempre Cloud Functions.
// ═══════════════════════════════════════════════════════════════════════

const GROQ_API_KEY = ''   // BLOQUEADO: usar Cloud Function groqProxy
const GEMINI_API_KEY = '' // BLOQUEADO: usar Cloud Function geminiProxy
const DEEPSEEK_API_KEY = '' // BLOQUEADO: usar Cloud Function deepseekProxy

// ═══════════════════════════════════════════════════════════════════════
// REGISTRO DE AGENTES
// ═══════════════════════════════════════════════════════════════════════

const agents: Map<string, AIAgent> = new Map()

function registerDefaults() {
  const defaults: AIAgent[] = [
    {
      id: 'gemini-flash',
      name: 'Gemini 2.5 Flash',
      provider: 'gemini',
      model: 'gemini-2.5-flash',
      emoji: '⚡',
      capabilities: ['general', 'vision', 'reasoning', 'code', 'analysis'],
      priority: 90,
      costTier: 'free',
      dailyLimit: 1500,
      streaming: true,
      thinking: true,
      status: GEMINI_API_KEY ? 'online' : 'disabled',
      usedToday: 0,
      tokensToday: 0,
    },
    {
      id: 'deepseek-r1',
      name: 'DeepSeek R1',
      provider: 'deepseek',
      model: 'deepseek-reasoner',
      emoji: '🧠',
      capabilities: ['reasoning', 'code', 'analysis'],
      priority: 95,
      costTier: 'cheap',
      dailyLimit: 500,
      streaming: true,
      thinking: true,
      status: DEEPSEEK_API_KEY ? 'online' : 'disabled',
      usedToday: 0,
      tokensToday: 0,
    },
    {
      id: 'qwen-qwq',
      name: 'Qwen QwQ-32B',
      provider: 'groq',
      model: 'qwen-qwq-32b',
      emoji: '🔮',
      capabilities: ['reasoning', 'code', 'analysis'],
      priority: 80,
      costTier: 'free',
      dailyLimit: 14400,
      streaming: true,
      thinking: true,
      status: GROQ_API_KEY ? 'online' : 'disabled',
      usedToday: 0,
      tokensToday: 0,
    },
    {
      id: 'llama-versatile',
      name: 'Llama 3.3 70B',
      provider: 'groq',
      model: 'llama-3.3-70b-versatile',
      emoji: '🦙',
      capabilities: ['general', 'speed', 'code', 'analysis'],
      priority: 70,
      costTier: 'free',
      dailyLimit: 14400,
      streaming: true,
      thinking: false,
      status: GROQ_API_KEY ? 'online' : 'disabled',
      usedToday: 0,
      tokensToday: 0,
    },
  ]

  for (const agent of defaults) {
    agents.set(agent.id, agent)
  }
}

// Init
registerDefaults()

// ═══════════════════════════════════════════════════════════════════════
// GETTERS
// ═══════════════════════════════════════════════════════════════════════

export function getAgent(id: string): AIAgent | undefined {
  return agents.get(id)
}

export function getAllAgents(): AIAgent[] {
  return Array.from(agents.values())
}

export function getOnlineAgents(): AIAgent[] {
  return getAllAgents().filter(a => a.status === 'online')
}

export function getAgentsForCapability(cap: AgentCapability): AIAgent[] {
  return getOnlineAgents()
    .filter(a => a.capabilities.includes(cap))
    .sort((a, b) => b.priority - a.priority)
}

export function getBestAgent(cap: AgentCapability): AIAgent | undefined {
  return getAgentsForCapability(cap)[0]
}

export function isAgentAvailable(id: string): boolean {
  const agent = agents.get(id)
  if (!agent) return false
  if (agent.status !== 'online') return false
  if (agent.rateLimitedUntil && Date.now() < agent.rateLimitedUntil) return false
  return true
}

// ═══════════════════════════════════════════════════════════════════════
// STATUS
// ═══════════════════════════════════════════════════════════════════════

export function markRateLimited(id: string, retryAfterMs: number = 60000) {
  const agent = agents.get(id)
  if (agent) {
    agent.status = 'rate-limited'
    agent.rateLimitedUntil = Date.now() + retryAfterMs
    logger.warn(`Agent ${agent.name} rate-limited por ${Math.round(retryAfterMs / 1000)}s`)
    // Auto-recover
    setTimeout(() => {
      if (agent.status === 'rate-limited') {
        agent.status = 'online'
        agent.rateLimitedUntil = undefined
        logger.info(`Agent ${agent.name} recuperado de rate-limit`)
      }
    }, retryAfterMs)
  }
}

export function markAgentError(id: string, errorMsg?: string) {
  const agent = agents.get(id)
  if (agent) {
    // Error de pago: marcar disabled en vez de offline (no se recupera solo)
    const isBillingError = errorMsg?.includes('402') || errorMsg?.includes('sin saldo') || errorMsg?.includes('Payment Required')
    if (isBillingError) {
      agent.status = 'disabled'
      logger.warn(`Agent ${agent.name} deshabilitado: sin saldo (402)`)
      return
    }
    agent.status = 'offline'
    // Intentar recuperar en 2 min (reducido de 5 min)
    setTimeout(() => {
      if (agent.status === 'offline') {
        agent.status = 'online'
        logger.info(`Agent ${agent.name} reactivado tras cooldown`)
      }
    }, 2 * 60 * 1000)
  }
}

export function recordAgentUsage(id: string, tokens: number) {
  const agent = agents.get(id)
  if (agent) {
    agent.usedToday++
    agent.tokensToday += tokens
  }
}

// ═══════════════════════════════════════════════════════════════════════
// LLAMADAS GENÉRICAS POR PROVIDER (formato OpenAI-compatible)
// ═══════════════════════════════════════════════════════════════════════

function parseRetryAfter(response: Response): number {
  const header = response.headers.get('Retry-After') || response.headers.get('retry-after')
  if (!header) return 60_000
  const secs = Number(header)
  if (!isNaN(secs)) return Math.max(secs * 1000, 5_000)
  return 60_000
}

/**
 * Llamada OpenAI-compatible (Groq, DeepSeek, etc.)
 */
async function callOpenAICompatible(
  apiUrl: string,
  apiKey: string,
  model: string,
  messages: Array<{ role: string; content: string }>,
  opts: { temperature?: number; max_tokens?: number },
  providerName: string,
): Promise<{ content: string; tokens: number }> {
  const response = await fetch(apiUrl, {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${apiKey}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      model,
      messages,
      temperature: opts.temperature ?? 0.3,
      max_tokens: opts.max_tokens || 2048,
    }),
  })

  if (!response.ok) {
    if (response.status === 429) {
      throw new RateLimitError(parseRetryAfter(response), providerName)
    }
    if (response.status === 402) {
      throw new Error(`${providerName} sin saldo: 402 Payment Required. Recarga tu cuenta de ${providerName}.`)
    }
    const errText = await response.text().catch(() => '')
    throw new Error(`${providerName} API error: ${response.status} ${errText.slice(0, 200)}`)
  }

  const data = await response.json()
  return {
    content: data.choices?.[0]?.message?.content || '',
    tokens: data.usage?.total_tokens || 0,
  }
}

/**
 * Streaming OpenAI-compatible (Groq, DeepSeek)
 */
async function streamOpenAICompatible(
  apiUrl: string,
  apiKey: string,
  model: string,
  messages: Array<{ role: string; content: string }>,
  onChunk: (text: string) => void,
  opts: { temperature?: number; max_tokens?: number },
  providerName: string,
): Promise<{ content: string; tokens: number }> {
  const response = await fetch(apiUrl, {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${apiKey}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      model,
      messages,
      temperature: opts.temperature ?? 0.3,
      max_tokens: opts.max_tokens || 2048,
      stream: true,
    }),
  })

  if (!response.ok) {
    if (response.status === 429) {
      throw new RateLimitError(parseRetryAfter(response), providerName)
    }
    if (response.status === 402) {
      throw new Error(`${providerName} sin saldo: 402 Payment Required. Recarga tu cuenta de ${providerName}.`)
    }
    throw new Error(`${providerName} stream error: ${response.status}`)
  }

  const reader = response.body?.getReader()
  if (!reader) throw new Error('No readable stream')

  const decoder = new TextDecoder()
  let fullContent = ''
  let buffer = ''

  while (true) {
    const { done, value } = await reader.read()
    if (done) break
    buffer += decoder.decode(value, { stream: true })
    const lines = buffer.split('\n')
    buffer = lines.pop() || ''
    for (const line of lines) {
      const trimmed = line.trim()
      if (!trimmed || trimmed === 'data: [DONE]') continue
      if (!trimmed.startsWith('data: ')) continue
      try {
        const json = JSON.parse(trimmed.slice(6))
        // DeepSeek R1 devuelve reasoning_content + content
        const delta = json.choices?.[0]?.delta?.content
        if (delta) {
          fullContent += delta
          onChunk(fullContent)
        }
      } catch { /* skip */ }
    }
  }
  return { content: fullContent, tokens: 0 }
}

// ═══════════════════════════════════════════════════════════════════════
// CALL AGENT — Función unificada para llamar a cualquier agente
// ═══════════════════════════════════════════════════════════════════════

const PROVIDER_URLS: Record<string, string> = {
  groq: 'https://api.groq.com/openai/v1/chat/completions',
  deepseek: 'https://api.deepseek.com/chat/completions',
}

const PROVIDER_KEYS: Record<string, string> = {
  groq: GROQ_API_KEY,
  deepseek: DEEPSEEK_API_KEY,
}

/** Permite actualizar keys en runtime (desde config Firestore) */
export function updateProviderKey(provider: string, key: string) {
  if (key) PROVIDER_KEYS[provider] = key
}

/**
 * Llama a un agente específico por su ID.
 * Para Gemini usa las funciones de ai.ts; para el resto usa OpenAI-compatible.
 */
export async function callAgent(
  agentId: string,
  messages: Array<{ role: string; content: string }>,
  opts: { temperature?: number; max_tokens?: number; thinkingBudget?: number } = {},
): Promise<AgentCallResult> {
  const agent = agents.get(agentId)
  if (!agent) throw new Error(`Agent ${agentId} no encontrado`)
  if (agent.status === 'disabled') throw new Error(`Agent ${agent.name} está deshabilitado (sin API key)`)
  if (agent.status === 'rate-limited') throw new Error(`Agent ${agent.name} está rate-limited`)

  const start = Date.now()

  try {
    let result: { content: string; tokens: number }

    if (agent.provider === 'gemini') {
      const { callGemini } = await import('./ai')
      result = await callGemini(messages, opts)
    } else if (agent.provider === 'groq' || agent.provider === 'deepseek') {
      // Usar Cloud Functions proxy (no exponer keys en el browser)
      const { httpsCallable, getFunctions } = await import('firebase/functions')
      const firebaseApp = (await import('@/services/firebase')).default
      const functions = getFunctions(firebaseApp)
      const proxyName = agent.provider === 'groq' ? 'groqProxy' : 'deepseekProxy'
      const proxy = httpsCallable(functions, proxyName)
      const cfResult = await proxy({
        messages,
        model: agent.model,
        temperature: opts.temperature ?? 0.3,
        max_tokens: opts.max_tokens || 2048,
      })
      const data = cfResult.data as { content: string; tokens?: number }
      result = { content: data.content || '', tokens: data.tokens || 0 }
    } else {
      const url = PROVIDER_URLS[agent.provider]
      const key = PROVIDER_KEYS[agent.provider]
      if (!url || !key) throw new Error(`Provider ${agent.provider} no configurado`)
      result = await callOpenAICompatible(url, key, agent.model, messages, opts, agent.name)
    }

    recordAgentUsage(agentId, result.tokens)
    return {
      content: result.content,
      tokens: result.tokens,
      agentId,
      latencyMs: Date.now() - start,
    }
  } catch (err) {
    if (err instanceof RateLimitError) {
      markRateLimited(agentId, err.retryAfterMs)
    } else {
      markAgentError(agentId, err instanceof Error ? err.message : String(err))
    }
    throw err
  }
}

/**
 * Llama a un agente con streaming
 */
export async function callAgentStream(
  agentId: string,
  messages: Array<{ role: string; content: string }>,
  onChunk: (text: string) => void,
  opts: { temperature?: number; max_tokens?: number; thinkingBudget?: number } = {},
): Promise<AgentCallResult> {
  const agent = agents.get(agentId)
  if (!agent) throw new Error(`Agent ${agentId} no encontrado`)
  if (agent.status === 'disabled') throw new Error(`Agent ${agent.name} deshabilitado`)

  const start = Date.now()

  try {
    let result: { content: string; tokens: number }

    if (agent.provider === 'gemini') {
      const { callGeminiStream } = await import('./ai')
      result = await callGeminiStream(messages, onChunk, opts)
    } else {
      const url = PROVIDER_URLS[agent.provider]
      const key = PROVIDER_KEYS[agent.provider]
      if (!url || !key) throw new Error(`Provider ${agent.provider} sin key`)
      result = await streamOpenAICompatible(url, key, agent.model, messages, onChunk, opts, agent.name)
    }

    recordAgentUsage(agentId, result.tokens)
    return {
      content: result.content,
      tokens: result.tokens,
      agentId,
      latencyMs: Date.now() - start,
    }
  } catch (err) {
    if (err instanceof RateLimitError) {
      markRateLimited(agentId, err.retryAfterMs)
    } else {
      markAgentError(agentId, err instanceof Error ? err.message : String(err))
    }
    throw err
  }
}

// ═══════════════════════════════════════════════════════════════════════
// COST ESTIMATION — USD por token según modelo
// ═══════════════════════════════════════════════════════════════════════

/** Precios estimados por 1M tokens (input+output promedio) */
const COST_PER_MILLION_TOKENS: Record<string, number> = {
  'gemini-flash': 0,         // Free tier
  'deepseek-r1': 0.55,       // $0.55/M input, ~$2.19/M output → promedio ~$0.55
  'qwen-qwq': 0,             // Groq free tier
  'llama-versatile': 0,      // Groq free tier
}

export function estimateCostUsd(agentId: string, tokens: number): number {
  const rate = COST_PER_MILLION_TOKENS[agentId] || 0
  return (tokens / 1_000_000) * rate
}

/** Resumen de costos de hoy por agente */
export function getTodayCostSummary(): Array<{ agentId: string; agentName: string; emoji: string; requests: number; tokens: number; estimatedCostUsd: number }> {
  return getAllAgents().map(a => ({
    agentId: a.id,
    agentName: a.name,
    emoji: a.emoji,
    requests: a.usedToday,
    tokens: a.tokensToday,
    estimatedCostUsd: estimateCostUsd(a.id, a.tokensToday),
  }))
}

// ═══════════════════════════════════════════════════════════════════════
// MISSION LOG — Persistencia en Firestore
// ═══════════════════════════════════════════════════════════════════════

const MAX_LOG_MEMORY = 200
const missionLogs: MissionLog[] = []

export function addMissionLog(log: Omit<MissionLog, 'id' | 'timestamp'>): MissionLog {
  const entry: MissionLog = {
    ...log,
    id: `${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
    timestamp: Date.now(),
    estimatedCostUsd: log.estimatedCostUsd ?? estimateCostUsd(log.agentId, log.tokens),
  }
  missionLogs.unshift(entry)
  if (missionLogs.length > MAX_LOG_MEMORY) missionLogs.pop()

  // Persistir async (no bloquear)
  persistLog(entry).catch(() => {})
  return entry
}

export function getMissionLogs(limit: number = 50): MissionLog[] {
  return missionLogs.slice(0, limit)
}

async function persistLog(log: MissionLog) {
  try {
    const today = new Date().toISOString().slice(0, 10)
    // Firestore no acepta valores undefined — los removemos
    const clean: Record<string, unknown> = { savedAt: serverTimestamp() }
    for (const [k, v] of Object.entries(log)) {
      if (v !== undefined) clean[k] = v
    }
    await setDoc(
      doc(db, 'ariaMissionLogs', today, 'entries', log.id),
      clean,
    )
  } catch {
    // Silently fail — logs are best-effort
  }
}

/**
 * Carga logs de hoy desde Firestore (para el panel admin)
 */
export async function loadTodayLogs(): Promise<MissionLog[]> {
  try {
    const today = new Date().toISOString().slice(0, 10)
    const { getDocs, collection } = await import('@/services/firestoreTracked')
    const snap = await getDocs(collection(db, 'ariaMissionLogs', today, 'entries'))
    const logs: MissionLog[] = []
    snap.forEach(d => logs.push(d.data() as MissionLog))
    logs.sort((a, b) => b.timestamp - a.timestamp)

    // Hidratar array in-memory para que getMissionLogs() los devuelva
    // (evita que el auto-refresh del panel borre los logs de Firestore)
    const existingIds = new Set(missionLogs.map(l => l.id))
    for (const log of logs) {
      if (!existingIds.has(log.id)) missionLogs.push(log)
    }
    missionLogs.sort((a, b) => b.timestamp - a.timestamp)
    if (missionLogs.length > MAX_LOG_MEMORY) missionLogs.length = MAX_LOG_MEMORY

    return logs
  } catch {
    return []
  }
}

// ═══════════════════════════════════════════════════════════════════════
// AGENT CONFIG — Persistencia Firestore (admin puede deshabilitar agentes)
// ═══════════════════════════════════════════════════════════════════════

export interface AgentsConfig {
  /** Agentes deshabilitados por admin */
  disabledAgents: string[]
  /** Prioridades custom: agentId → priority override */
  priorityOverrides: Record<string, number>
  /** API keys guardadas por admin (provider → key) — para deploys sin env vars */
  providerKeys?: Record<string, string>
  updatedAt?: unknown
  updatedBy?: string
}

let agentsConfigCache: AgentsConfig | null = null
let configCacheTime = 0

export async function getAgentsConfig(): Promise<AgentsConfig> {
  if (agentsConfigCache && Date.now() - configCacheTime < 60_000) {
    return agentsConfigCache
  }
  try {
    const snap = await getDoc(doc(db, 'settings', 'ariaAgents'))
    if (snap.exists()) {
      agentsConfigCache = snap.data() as AgentsConfig
    } else {
      agentsConfigCache = { disabledAgents: [], priorityOverrides: {} }
    }
    configCacheTime = Date.now()

    // Aplicar config
    applyAgentsConfig(agentsConfigCache)
    return agentsConfigCache
  } catch {
    return { disabledAgents: [], priorityOverrides: {} }
  }
}

export async function saveAgentsConfig(config: AgentsConfig, userId: string) {
  await setDoc(doc(db, 'settings', 'ariaAgents'), {
    ...config,
    updatedAt: serverTimestamp(),
    updatedBy: userId,
  })
  agentsConfigCache = config
  configCacheTime = Date.now()
  applyAgentsConfig(config)
}

function applyAgentsConfig(config: AgentsConfig) {
  // Aplicar API keys guardadas en Firestore (overrides env vars vacías)
  if (config.providerKeys) {
    for (const [provider, key] of Object.entries(config.providerKeys)) {
      if (key) {
        PROVIDER_KEYS[provider] = key
      }
    }
  }

  for (const agent of agents.values()) {
    // Check disabled
    if (config.disabledAgents.includes(agent.id)) {
      agent.status = 'disabled'
    } else if (agent.status === 'disabled') {
      // Re-enable si tiene key (env var O Firestore)
      const hasKey = !!PROVIDER_KEYS[agent.provider]
        || (agent.provider === 'gemini' && !!GEMINI_API_KEY)
      if (hasKey) agent.status = 'online'
    }
    // Priority override
    if (config.priorityOverrides[agent.id] != null) {
      agent.priority = config.priorityOverrides[agent.id]!
    }
  }
}

// Init: load config on startup
getAgentsConfig().catch(() => {})
