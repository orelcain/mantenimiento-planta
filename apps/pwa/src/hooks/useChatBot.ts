/**
 * Hook para el Chatbot — v5 ARIA
 * ARIA mode: acciones ejecutables, fotos por chat, auto-asignación, notificaciones
 * Memoria por usuario, corrección de typos, historial persistente por userId
 */
import { useState, useCallback, useRef, useEffect } from 'react'
import { sendChatMessage, generateDailySummary, generateWeeklySummary, checkCreatedIncidents, checkProactiveAlerts, checkPredictivePatterns, loadUserMemory, loadMemoryFromFirestore, saveUserMemory, type ChatMessage, type ChatAction, type PendingAction } from '@/services/chatbot'
import type { AgentStatusEvent } from '@/services/ariaOrchestrator'
import { getAllAgents, type AIAgent } from '@/services/aiAgents'
import { RateLimitError } from '@/services/ai'
import { uploadChatPhoto } from '@/services/chatActions'
import { showLocalNotification, areNotificationsEnabled } from '@/services/notifications'
import { useAuthStore } from '@/store/authStore'
import { usePermissionsStore } from '@/store/permissionsStore'

const STORAGE_PREFIX = 'chatbot_history_'
const MAX_PERSISTED = 50

function generateId(): string {
  return `msg_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`
}

const WELCOME_MESSAGE: ChatMessage = {
  id: 'welcome',
  role: 'assistant',
  content: '¡Hola! 👋 Soy **ARIA** — *Asistente de Reportes e Incidencias Automatizada*.\n\n' +
    'Puedo ayudarte con:\n' +
    '• 🔧 **Crear incidencias** — describe la falla y yo genero el reporte\n' +
    '• 📷 **Adjuntar fotos** — envía una imagen directamente desde el chat\n' +
    '• 🔍 **Buscar repuestos** — por nombre, código SAP o fabricante\n' +
    '• 📋 **Actualizar estado** — resolver, cerrar o cambiar incidencias por voz\n' +
    '• 👷 **Asignar técnicos** — sugiero al técnico más adecuado\n' +
    '• ⚙️ **Estado de equipos** — criticidad y disponibilidad\n' +
    '• 📊 **Resúmenes** — panorama general de la planta\n\n' +
    'Ejemplo: *"se rompió la cinta de filete"* → creo la incidencia por ti.\n\n' +
    '¿En qué puedo ayudarte?',
  timestamp: new Date(),
}

// ─── Persistencia localStorage POR USUARIO ───────────────────────────

function getStorageKey(userId: string | undefined): string {
  return `${STORAGE_PREFIX}${userId || 'anonymous'}`
}

function loadHistory(userId: string | undefined): ChatMessage[] {
  try {
    const raw = localStorage.getItem(getStorageKey(userId))
    if (!raw) return [WELCOME_MESSAGE]
    const parsed = JSON.parse(raw) as ChatMessage[]
    return parsed.map(m => ({ ...m, timestamp: new Date(m.timestamp) }))
  } catch {
    return [WELCOME_MESSAGE]
  }
}

function saveHistory(messages: ChatMessage[], userId: string | undefined): void {
  try {
    const toSave = messages.slice(-MAX_PERSISTED)
    localStorage.setItem(getStorageKey(userId), JSON.stringify(toSave))
  } catch { /* localStorage full */ }
}

// ─── Hook principal ──────────────────────────────────────────────────

export function useChatBot() {
  const user = useAuthStore(state => state.user)
  const userId = user?.id
  const userName = user ? `${user.nombre} ${user.apellido}`.trim() : undefined
  const canThink = usePermissionsStore(state => state.can('aria', 'configurar'))
  const [thinkingEnabled, setThinkingEnabled] = useState(() => {
    if (typeof window === 'undefined') return false
    return localStorage.getItem(`aria_thinking_${user?.id}`) === '1'
  })
  
  // Modelo forzado por el usuario (null = auto)
  const [selectedAgent, setSelectedAgent] = useState<string | null>(() => {
    if (typeof window === 'undefined') return null
    return localStorage.getItem(`aria_selected_agent_${user?.id}`) || null
  })
  
  const [messages, setMessages] = useState<ChatMessage[]>(() => loadHistory(userId))
  const [isLoading, setIsLoading] = useState(false)
  const [isOpen, setIsOpen] = useState(false)
  const [hasUnread, setHasUnread] = useState(false)
  const [streamingContent, setStreamingContent] = useState<string | null>(null)
  const [agentStatus, setAgentStatus] = useState<AgentStatusEvent | null>(null)
  const [lastActions, setLastActions] = useState<ChatAction[]>([])
  const [pendingAction, setPendingAction] = useState<PendingAction | null>(null)
  const [retryCountdown, setRetryCountdown] = useState(0) // segundos restantes
  const abortRef = useRef(false)
  const isOpenRef = useRef(false)
  const prevUserIdRef = useRef(userId)
  const retryTimerRef = useRef<ReturnType<typeof setInterval> | null>(null)
  const retryDataRef = useRef<{ text: string; photos?: File[] } | null>(null)
  
  // Recargar historial cuando cambia el usuario
  useEffect(() => {
    if (prevUserIdRef.current !== userId) {
      setMessages(loadHistory(userId))
      prevUserIdRef.current = userId
    }
  }, [userId])

  // Sincronizar ref con estado
  useEffect(() => {
    isOpenRef.current = isOpen
  }, [isOpen])

  // Persistir historial cuando cambia
  useEffect(() => {
    saveHistory(messages, userId)
  }, [messages, userId])

  // Limpiar timer de retry al desmontar
  useEffect(() => {
    return () => {
      if (retryTimerRef.current) clearInterval(retryTimerRef.current)
    }
  }, [])

  // #4 — Resumen ejecutivo diario: se dispara al abrir el chat la primera vez del día
  const dailySummaryTriggered = useRef(false)
  const triggerDailySummary = useCallback(async () => {
    if (dailySummaryTriggered.current || !userId) return
    const todayKey = `aria_daily_${userId}_${new Date().toISOString().slice(0, 10)}`
    if (localStorage.getItem(todayKey)) {
      dailySummaryTriggered.current = true
      // Aún si ya se hizo el resumen diario, verificar alertas y seguimiento
      triggerProactiveChecks()
      return
    }
    dailySummaryTriggered.current = true

    try {
      // #4 — Resumen semanal los lunes
      const isMonday = new Date().getDay() === 1
      const weeklyKey = `aria_weekly_${userId}_${new Date().toISOString().slice(0, 10)}`
      if (isMonday && !localStorage.getItem(weeklyKey)) {
        const weeklySummary = await generateWeeklySummary()
        if (weeklySummary) {
          const weeklyMsg: ChatMessage = {
            id: generateId(),
            role: 'assistant',
            content: `📊 ${weeklySummary}`,
            timestamp: new Date(),
          }
          setMessages(prev => [...prev, weeklyMsg])
          localStorage.setItem(weeklyKey, '1')
        }
      }

      const summary = await generateDailySummary()
      if (summary) {
        const summaryMsg: ChatMessage = {
          id: generateId(),
          role: 'assistant',
          content: `📋 **Resumen del día — ${new Date().toLocaleDateString('es-CL', { weekday: 'long', day: 'numeric', month: 'long' })}**\n\n${summary}`,
          timestamp: new Date(),
        }
        setMessages(prev => [...prev, summaryMsg])
        localStorage.setItem(todayKey, '1')
      }
    } catch { /* non-blocking */ }

    // Verificar alertas proactivas + seguimiento de incidencias
    triggerProactiveChecks()
  }, [userId])

  // #5 — Alertas proactivas + #10 Auto-seguimiento
  const triggerProactiveChecks = useCallback(async () => {
    if (!userId) return

    try {
      // #6 — Intentar cargar memoria desde Firestore si local está vacía
      const localMem = loadUserMemory(userId)
      if (localMem.lastQueries.length === 0) {
        const firestoreMem = await loadMemoryFromFirestore(userId)
        if (firestoreMem && firestoreMem.lastQueries.length > 0) {
          saveUserMemory(firestoreMem)
        }
      }

      // #5 — Verificar alertas proactivas
      const proactiveAlert = await checkProactiveAlerts()
      if (proactiveAlert) {
        const alertMsg: ChatMessage = {
          id: generateId(),
          role: 'assistant',
          content: proactiveAlert,
          timestamp: new Date(),
        }
        setMessages(prev => [...prev, alertMsg])

        // #7 v2.60 — Push notification si el chat está cerrado
        if (!isOpenRef.current && areNotificationsEnabled()) {
          showLocalNotification('ARIA — Alerta Proactiva', {
            body: proactiveAlert.replace(/[*#_`]/g, '').slice(0, 200),
            tag: 'aria-proactive',
          })
          setHasUnread(true)
        }
      }

      // #3 v2.60 — Patrones predictivos de fallas
      const predictiveKey = `aria_predictive_${userId}_${new Date().toISOString().slice(0, 10)}`
      if (!localStorage.getItem(predictiveKey)) {
        const predictiveMsg = await checkPredictivePatterns()
        if (predictiveMsg) {
          localStorage.setItem(predictiveKey, '1')
          const predMsg: ChatMessage = {
            id: generateId(),
            role: 'assistant',
            content: predictiveMsg,
            timestamp: new Date(),
          }
          setMessages(prev => [...prev, predMsg])

          // #7 v2.60 — Push notification si el chat está cerrado
          if (!isOpenRef.current && areNotificationsEnabled()) {
            showLocalNotification('ARIA — Patrón Predictivo', {
              body: predictiveMsg.replace(/[*#_`]/g, '').slice(0, 200),
              tag: 'aria-predictive',
            })
            setHasUnread(true)
          }
        }
      }

      // #10 — Auto-seguimiento de incidencias creadas
      const mem = loadUserMemory(userId)
      if (mem.createdIncidentIds && mem.createdIncidentIds.length > 0) {
        const followUp = await checkCreatedIncidents(mem.createdIncidentIds)
        if (followUp) {
          const followUpMsg: ChatMessage = {
            id: generateId(),
            role: 'assistant',
            content: followUp,
            timestamp: new Date(),
          }
          setMessages(prev => [...prev, followUpMsg])

          // #7 v2.60 — Push notification si el chat está cerrado
          if (!isOpenRef.current && areNotificationsEnabled()) {
            showLocalNotification('ARIA — Seguimiento de Incidencia', {
              body: followUp.replace(/[*#_`]/g, '').slice(0, 200),
              tag: 'aria-followup',
            })
            setHasUnread(true)
          }
        }
      }
    } catch { /* non-blocking */ }
  }, [userId])

  const toggle = useCallback(() => {
    setIsOpen(prev => {
      if (!prev) {
        setHasUnread(false)
        triggerDailySummary()
      }
      return !prev
    })
  }, [triggerDailySummary])

  const open = useCallback(() => {
    setIsOpen(true)
    setHasUnread(false)
    triggerDailySummary()
  }, [triggerDailySummary])

  const close = useCallback(() => {
    setIsOpen(false)
  }, [])

  const sendMessage = useCallback(async (text: string, photos?: File[]) => {
    const trimmed = text.trim()
    if ((!trimmed && (!photos || photos.length === 0)) || isLoading) return

    // Upload photos first if any
    let photoUrls: string[] = []
    if (photos && photos.length > 0 && userId) {
      try {
        const uploadPromises = photos.map(f => uploadChatPhoto(userId, f))
        photoUrls = await Promise.all(uploadPromises)
      } catch {
        // Continue without photos if upload fails
      }
    }

    const userMsg: ChatMessage = {
      id: generateId(),
      role: 'user',
      content: trimmed || (photoUrls.length > 0 ? `📷 [${photoUrls.length} foto${photoUrls.length > 1 ? 's' : ''} adjunta${photoUrls.length > 1 ? 's' : ''}]` : ''),
      timestamp: new Date(),
      ...(photoUrls.length > 0 && { photoUrls }),
    }

    setMessages(prev => [...prev, userMsg])
    setIsLoading(true)
    setStreamingContent(null)
    setAgentStatus(null)
    setLastActions([])
    abortRef.current = false

    try {
      const history = [...messages, userMsg].filter(m => m.role !== 'system')

      // If photos were uploaded and there's a pending incident action, inject them
      const messageWithPhotoContext = photoUrls.length > 0
        ? `${trimmed || 'Adjunté fotos'}\n[SISTEMA: El usuario adjuntó ${photoUrls.length} foto(s) desde el chat. URLs: ${photoUrls.join(', ')}]`
        : trimmed || ''

      const result = await sendChatMessage(
        messageWithPhotoContext,
        history,
        // Streaming callback — ocultar tag [SUGERENCIAS] durante streaming
        (partial) => {
          if (!abortRef.current) {
            const clean = partial.replace(/\n?\[SUGERENCIAS\]\s*:.*$/im, '')
            setStreamingContent(clean)
          }
        },
        userId,
        pendingAction,
        userName,
        user?.rol,
        canThink && thinkingEnabled,
        // Agent status callback — mostrar qué agente está haciendo qué
        (event) => {
          if (!abortRef.current) setAgentStatus(event)
        },
        // forceAgent — modelo elegido por el usuario (null = auto)
        selectedAgent || undefined,
      )

      if (abortRef.current) return

      setStreamingContent(null)
      setAgentStatus(null)
      setLastActions(result.actions)

      // Actualizar pending action
      if (result.pendingAction) {
        if (result.pendingAction.status === 'completed' || result.pendingAction.status === 'cancelled') {
          setPendingAction(null)
        } else {
          setPendingAction(result.pendingAction)
        }
      } else if (!pendingAction) {
        setPendingAction(null)
      }

      const assistantMsg: ChatMessage = {
        id: generateId(),
        role: 'assistant',
        content: result.reply,
        timestamp: new Date(),
        context: result.context,
        actions: result.actions.length > 0 ? result.actions : undefined,
        suggestions: result.suggestions,
        agentInfo: result.agentInfo,
      }

      setMessages(prev => [...prev, assistantMsg])

      if (!isOpenRef.current) {
        setHasUnread(true)
      }
    } catch (err) {
      if (abortRef.current) return

      setStreamingContent(null)

      // Rate limit: mostrar countdown y auto-reintentar
      if (err instanceof RateLimitError) {
        const waitSecs = Math.ceil(err.retryAfterMs / 1000)
        retryDataRef.current = { text, photos }

        // Mensaje de espera con countdown
        const waitMsg: ChatMessage = {
          id: 'rate_limit_wait',
          role: 'assistant',
          content: `⏳ Límite de consultas alcanzado. Reintentando automáticamente en **${waitSecs}** segundos...`,
          timestamp: new Date(),
        }
        setMessages(prev => {
          // Reemplazar si ya hay un mensaje de rate limit previo
          const filtered = prev.filter(m => m.id !== 'rate_limit_wait')
          return [...filtered, waitMsg]
        })

        setRetryCountdown(waitSecs)
        setIsLoading(true) // mantener loading durante countdown

        // Limpiar timer previo si existe
        if (retryTimerRef.current) clearInterval(retryTimerRef.current)

        let remaining = waitSecs
        retryTimerRef.current = setInterval(() => {
          remaining -= 1
          setRetryCountdown(remaining)

          // Actualizar mensaje con countdown
          setMessages(prev => prev.map(m =>
            m.id === 'rate_limit_wait'
              ? {
                  ...m,
                  content: remaining > 0
                    ? `⏳ Límite de consultas alcanzado. Reintentando automáticamente en **${remaining}** segundo${remaining !== 1 ? 's' : ''}...`
                    : `♻️ Reintentando consulta...`,
                }
              : m
          ))

          if (remaining <= 0) {
            clearInterval(retryTimerRef.current!)
            retryTimerRef.current = null
            setRetryCountdown(0)

            // Remover mensaje de espera y reintentar
            setMessages(prev => prev.filter(m => m.id !== 'rate_limit_wait'))
            const retryData = retryDataRef.current
            retryDataRef.current = null
            setIsLoading(false)
            if (retryData) {
              // Reintentar automáticamente
              sendMessage(retryData.text, retryData.photos)
            }
          }
        }, 1000)

        return
      }

      const errorMsg: ChatMessage = {
        id: generateId(),
        role: 'assistant',
        content: '❌ Error al procesar tu consulta. Intenta de nuevo.',
        timestamp: new Date(),
      }
      setMessages(prev => [...prev, errorMsg])
    } finally {
      // No desactivar loading si hay countdown de rate limit activo
      if (!retryTimerRef.current) {
        setIsLoading(false)
      }
    }
  }, [messages, isLoading, userId, pendingAction])

  const clearHistory = useCallback(() => {
    setMessages([WELCOME_MESSAGE])
    setStreamingContent(null)
    setLastActions([])
    setPendingAction(null)
    localStorage.removeItem(getStorageKey(userId))
  }, [userId])

  // Reintentar último mensaje del usuario
  const retryLastMessage = useCallback(() => {
    if (isLoading) return
    // Encontrar el último mensaje del usuario
    const lastUserMsgIdx = messages.map((m, i) => ({ m, i })).reverse().find(x => x.m.role === 'user')
    if (!lastUserMsgIdx) return
    const lastUserMsg = lastUserMsgIdx.m
    // Eliminar la respuesta de ARIA que vino después (si existe)
    const nextMsgs = messages.slice(lastUserMsgIdx.i + 1)
    const ariaReplyIdx = nextMsgs.findIndex(m => m.role === 'assistant')
    if (ariaReplyIdx !== -1) {
      const globalIdx = lastUserMsgIdx.i + 1 + ariaReplyIdx
      setMessages(prev => prev.filter((_, i) => i !== globalIdx))
    }
    // También eliminar el propio mensaje de usuario para que sendMessage lo re-agregue
    setMessages(prev => prev.filter((_, i) => i !== lastUserMsgIdx.i))
    // Reintentar con el mismo texto y fotos
    sendMessage(lastUserMsg.content, undefined)
  }, [messages, isLoading, sendMessage])

  const toggleThinking = useCallback(() => {
    setThinkingEnabled(prev => {
      const next = !prev
      localStorage.setItem(`aria_thinking_${userId}`, next ? '1' : '0')
      return next
    })
  }, [userId])

  const changeAgent = useCallback((agentId: string | null) => {
    setSelectedAgent(agentId)
    if (agentId) {
      localStorage.setItem(`aria_selected_agent_${userId}`, agentId)
    } else {
      localStorage.removeItem(`aria_selected_agent_${userId}`)
    }
  }, [userId])

  // Lista de agentes disponibles para el selector UI
  const availableAgents = useCallback((): AIAgent[] => {
    return getAllAgents()
  }, [])

  return {
    messages,
    isLoading,
    isOpen,
    hasUnread,
    streamingContent,
    agentStatus,
    lastActions,
    pendingAction,
    retryCountdown,
    userId,
    toggle,
    open,
    close,
    sendMessage,
    clearHistory,
    retryLastMessage,
    thinkingEnabled,
    canThink,
    toggleThinking,
    selectedAgent,
    changeAgent,
    availableAgents,
  }
}
