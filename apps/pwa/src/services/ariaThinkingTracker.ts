/**
 * ARIA Thinking Mode Tracker
 * 
 * Rastrea el uso diario del modo pensamiento profundo por usuario.
 * Almacena datos en Firestore: /ariaThinkingUsage/{YYYY-MM-DD}/users/{userId}
 * Config global en: /settings/ariaConfig
 */
import { doc, getDoc, setDoc, getDocs, collection, serverTimestamp, updateDoc, increment } from '@/services/firestoreTracked'
import { db } from './firebase'
import { logger } from '@/lib/logger'

// ═══════════════════════════════════════════════════════════════════════
// TIPOS
// ═══════════════════════════════════════════════════════════════════════

export interface AriaConfig {
  /** Límite global diario de requests con thinking (0 = ilimitado) */
  dailyThinkingLimit: number
  /** Budget de tokens para thinking (cuánto "piensa" Gemini por request) */
  thinkingBudget: number
  /** Overrides por usuario: userId → límite diario personalizado */
  userLimits: Record<string, number>
  /** Voz TTS del navegador (voiceURI de SpeechSynthesisVoice) */
  voiceURI?: string
  /** Nombre legible de la voz seleccionada (para mostrar en el panel) */
  voiceName?: string
  /** Velocidad de lectura en voz alta (0.5–2.0; default 1.0) */
  speechRate?: number
  updatedAt?: unknown
  updatedBy?: string
}

export interface UserThinkingUsage {
  userId: string
  userName?: string
  count: number         // Requests con thinking hoy
  tokensUsed: number    // Tokens usados en thinking hoy
  lastUsedAt?: unknown
}

export interface DailyUsageSummary {
  date: string
  users: UserThinkingUsage[]
  totalRequests: number
  totalTokens: number
}

// ═══════════════════════════════════════════════════════════════════════
// CONSTANTES
// ═══════════════════════════════════════════════════════════════════════

const CONFIG_DOC = 'ariaConfig'
const SETTINGS_COLLECTION = 'settings'
const USAGE_COLLECTION = 'ariaThinkingUsage'

/** Default: 50 requests con thinking por usuario/día */
const DEFAULT_DAILY_LIMIT = 50
/** Default thinking budget (tokens) */
const DEFAULT_THINKING_BUDGET = 2048

function getTodayKey(): string {
  return new Date().toISOString().slice(0, 10) // YYYY-MM-DD
}

// ═══════════════════════════════════════════════════════════════════════
// CONFIG (settings/ariaConfig)
// ═══════════════════════════════════════════════════════════════════════

/** Cache local para evitar lecturas repetidas en la misma sesión */
let configCache: AriaConfig | null = null
let configCacheTime = 0
const CONFIG_CACHE_TTL = 60_000 // 1 min

export async function getAriaConfig(): Promise<AriaConfig> {
  // Cache hit
  if (configCache && Date.now() - configCacheTime < CONFIG_CACHE_TTL) {
    return configCache
  }

  try {
    const docRef = doc(db, SETTINGS_COLLECTION, CONFIG_DOC)
    const snap = await getDoc(docRef)
    
    if (snap.exists()) {
      const data = snap.data() as AriaConfig
      const cfg: AriaConfig = {
        dailyThinkingLimit: data.dailyThinkingLimit ?? DEFAULT_DAILY_LIMIT,
        thinkingBudget: data.thinkingBudget ?? DEFAULT_THINKING_BUDGET,
        userLimits: data.userLimits ?? {},
      }
      // Campos de voz (opcionales): solo se incluyen si existen, para no
      // arrastrar `undefined` a Firestore al volver a guardar.
      if (data.voiceURI !== undefined) cfg.voiceURI = data.voiceURI
      if (data.voiceName !== undefined) cfg.voiceName = data.voiceName
      if (data.speechRate !== undefined) cfg.speechRate = data.speechRate
      configCache = cfg
    } else {
      configCache = {
        dailyThinkingLimit: DEFAULT_DAILY_LIMIT,
        thinkingBudget: DEFAULT_THINKING_BUDGET,
        userLimits: {},
      }
    }
    configCacheTime = Date.now()
    return configCache
  } catch (error) {
    logger.error('Error loading ARIA config', error instanceof Error ? error : undefined)
    return {
      dailyThinkingLimit: DEFAULT_DAILY_LIMIT,
      thinkingBudget: DEFAULT_THINKING_BUDGET,
      userLimits: {},
    }
  }
}

export async function saveAriaConfig(
  config: Partial<AriaConfig>,
  updatedBy: string,
): Promise<void> {
  try {
    const docRef = doc(db, SETTINGS_COLLECTION, CONFIG_DOC)
    const current = await getAriaConfig()
    const merged: Record<string, unknown> = {
      ...current,
      ...config,
      updatedAt: serverTimestamp(),
      updatedBy,
    }
    // Firestore rechaza `undefined`: lo eliminamos antes de escribir.
    Object.keys(merged).forEach((k) => merged[k] === undefined && delete merged[k])
    await setDoc(docRef, merged)
    configCache = { ...current, ...config }
    configCacheTime = Date.now()
    logger.info('ARIA config saved', { updatedBy })
  } catch (error) {
    logger.error('Error saving ARIA config', error instanceof Error ? error : undefined)
    throw error
  }
}

// ═══════════════════════════════════════════════════════════════════════
// USAGE TRACKING
// ═══════════════════════════════════════════════════════════════════════

/**
 * Verifica si un usuario puede usar thinking mode hoy.
 * Retorna { allowed: boolean, remaining: number, limit: number, used: number }
 */
export async function checkThinkingAllowance(userId: string): Promise<{
  allowed: boolean
  remaining: number
  limit: number
  used: number
}> {
  const config = await getAriaConfig()
  const userLimit = config.userLimits[userId] ?? config.dailyThinkingLimit
  
  // 0 = ilimitado
  if (userLimit === 0) {
    return { allowed: true, remaining: Infinity, limit: 0, used: 0 }
  }

  const today = getTodayKey()
  try {
    const usageRef = doc(db, USAGE_COLLECTION, today, 'users', userId)
    const snap = await getDoc(usageRef)
    const used = snap.exists() ? (snap.data() as UserThinkingUsage).count : 0
    
    return {
      allowed: used < userLimit,
      remaining: Math.max(0, userLimit - used),
      limit: userLimit,
      used,
    }
  } catch {
    // En caso de error, permitir (fail-open)
    return { allowed: true, remaining: userLimit, limit: userLimit, used: 0 }
  }
}

/**
 * Registra un uso de thinking mode.
 * Llamar después de una respuesta exitosa con thinking.
 */
export async function recordThinkingUsage(
  userId: string,
  userName?: string,
  tokensUsed: number = 0,
): Promise<void> {
  const today = getTodayKey()
  const usageRef = doc(db, USAGE_COLLECTION, today, 'users', userId)

  try {
    const snap = await getDoc(usageRef)
    
    if (snap.exists()) {
      await updateDoc(usageRef, {
        count: increment(1),
        tokensUsed: increment(tokensUsed),
        lastUsedAt: serverTimestamp(),
        ...(userName && { userName }),
      })
    } else {
      await setDoc(usageRef, {
        userId,
        userName: userName || '',
        count: 1,
        tokensUsed,
        lastUsedAt: serverTimestamp(),
      })
    }
  } catch (error) {
    logger.error('Error recording thinking usage', error instanceof Error ? error : undefined)
    // No-throw: tracking failure shouldn't block the user
  }
}

// ═══════════════════════════════════════════════════════════════════════
// ADMIN MONITORING
// ═══════════════════════════════════════════════════════════════════════

/**
 * Obtiene el consumo de un día específico (todos los usuarios)
 */
export async function getDailyUsage(date?: string): Promise<DailyUsageSummary> {
  const day = date || getTodayKey()
  const usersRef = collection(db, USAGE_COLLECTION, day, 'users')
  
  try {
    const snap = await getDocs(usersRef)
    const users: UserThinkingUsage[] = []
    let totalRequests = 0
    let totalTokens = 0
    
    snap.forEach((d) => {
      const data = d.data() as UserThinkingUsage
      users.push({ ...data, userId: d.id })
      totalRequests += data.count || 0
      totalTokens += data.tokensUsed || 0
    })
    
    // Ordenar por consumo descendente
    users.sort((a, b) => b.count - a.count)
    
    return { date: day, users, totalRequests, totalTokens }
  } catch (error) {
    logger.error('Error loading daily usage', error instanceof Error ? error : undefined)
    return { date: day, users: [], totalRequests: 0, totalTokens: 0 }
  }
}

/**
 * Obtiene los últimos N días de uso (para gráfico de tendencia)
 */
export async function getUsageHistory(days: number = 7): Promise<DailyUsageSummary[]> {
  const results: DailyUsageSummary[] = []
  const today = new Date()
  
  for (let i = 0; i < days; i++) {
    const d = new Date(today)
    d.setDate(d.getDate() - i)
    const dateKey = d.toISOString().slice(0, 10)
    const usage = await getDailyUsage(dateKey)
    results.push(usage)
  }
  
  return results.reverse() // más antiguo primero
}
