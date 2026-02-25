/**
 * Hook para el Chatbot — v4
 * JARVIS mode: acciones ejecutables (crear incidencias, actualizar estado)
 * Memoria por usuario, corrección de typos, historial persistente por userId
 */
import { useState, useCallback, useRef, useEffect } from 'react'
import { sendChatMessage, type ChatMessage, type ChatAction, type PendingAction } from '@/services/chatbot'
import { useAuthStore } from '@/store/authStore'

const STORAGE_PREFIX = 'chatbot_history_'
const MAX_PERSISTED = 50

function generateId(): string {
  return `msg_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`
}

const WELCOME_MESSAGE: ChatMessage = {
  id: 'welcome',
  role: 'assistant',
  content: '¡Hola! 👋 Soy **JARVIS**, el asistente inteligente de planta. Puedo:\n\n' +
    '• 🔧 **Crear incidencias** — describe la falla y yo genero el reporte\n' +
    '• 🔍 **Buscar repuestos** — por nombre, código SAP o fabricante\n' +
    '• 📋 **Consultar incidencias** — estado, prioridad, historial\n' +
    '• ⚙️ **Estado de equipos** — criticidad y disponibilidad\n' +
    '• 📊 **Resúmenes** — panorama general de la planta\n\n' +
    'Entiendo errores de tipeo y lenguaje natural.\n' +
    'Ejemplo: *"se rompió la cinta de filete, hay que reemplazarla"* → creo la incidencia por ti.\n\n' +
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
  
  const [messages, setMessages] = useState<ChatMessage[]>(() => loadHistory(userId))
  const [isLoading, setIsLoading] = useState(false)
  const [isOpen, setIsOpen] = useState(false)
  const [hasUnread, setHasUnread] = useState(false)
  const [streamingContent, setStreamingContent] = useState<string | null>(null)
  const [lastActions, setLastActions] = useState<ChatAction[]>([])
  const [pendingAction, setPendingAction] = useState<PendingAction | null>(null)
  const abortRef = useRef(false)
  const isOpenRef = useRef(false)
  const prevUserIdRef = useRef(userId)
  
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

  const toggle = useCallback(() => {
    setIsOpen(prev => {
      if (!prev) setHasUnread(false)
      return !prev
    })
  }, [])

  const open = useCallback(() => {
    setIsOpen(true)
    setHasUnread(false)
  }, [])

  const close = useCallback(() => {
    setIsOpen(false)
  }, [])

  const sendMessage = useCallback(async (text: string) => {
    const trimmed = text.trim()
    if (!trimmed || isLoading) return

    const userMsg: ChatMessage = {
      id: generateId(),
      role: 'user',
      content: trimmed,
      timestamp: new Date(),
    }

    setMessages(prev => [...prev, userMsg])
    setIsLoading(true)
    setStreamingContent(null)
    setLastActions([])
    abortRef.current = false

    try {
      const history = [...messages, userMsg].filter(m => m.role !== 'system')

      const result = await sendChatMessage(
        trimmed,
        history,
        // Streaming callback
        (partial) => {
          if (!abortRef.current) {
            setStreamingContent(partial)
          }
        },
        userId,
        pendingAction,
      )

      if (abortRef.current) return

      setStreamingContent(null)
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
      }

      setMessages(prev => [...prev, assistantMsg])

      if (!isOpenRef.current) {
        setHasUnread(true)
      }
    } catch {
      if (abortRef.current) return

      setStreamingContent(null)
      const errorMsg: ChatMessage = {
        id: generateId(),
        role: 'assistant',
        content: '❌ Error al procesar tu consulta. Intenta de nuevo.',
        timestamp: new Date(),
      }
      setMessages(prev => [...prev, errorMsg])
    } finally {
      setIsLoading(false)
    }
  }, [messages, isLoading, userId, pendingAction])

  const clearHistory = useCallback(() => {
    setMessages([WELCOME_MESSAGE])
    setStreamingContent(null)
    setLastActions([])
    setPendingAction(null)
    localStorage.removeItem(getStorageKey(userId))
  }, [userId])

  return {
    messages,
    isLoading,
    isOpen,
    hasUnread,
    streamingContent,
    lastActions,
    pendingAction,
    toggle,
    open,
    close,
    sendMessage,
    clearHistory,
  }
}
