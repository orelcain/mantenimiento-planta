/**
 * Hook para el Chatbot — v2
 * Gestiona mensajes, historial persistente, streaming y estado
 */
import { useState, useCallback, useRef, useEffect } from 'react'
import { sendChatMessage, type ChatMessage, type ChatAction } from '@/services/chatbot'

const STORAGE_KEY = 'chatbot_history'
const MAX_PERSISTED = 50

function generateId(): string {
  return `msg_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`
}

const WELCOME_MESSAGE: ChatMessage = {
  id: 'welcome',
  role: 'assistant',
  content: '¡Hola! 👋 Soy el asistente de planta. Puedo ayudarte con:\n\n• **Repuestos** — buscar piezas por nombre, código SAP o fabricante\n• **Incidencias** — ver reportes abiertos, filtrar por estado o prioridad\n• **Equipos** — consultar estado de máquinas y criticidad\n• **Resúmenes** — panorama general de la planta\n\n¿En qué puedo ayudarte?',
  timestamp: new Date(),
}

// ─── Persistencia localStorage ───────────────────────────────────────

function loadHistory(): ChatMessage[] {
  try {
    const raw = localStorage.getItem(STORAGE_KEY)
    if (!raw) return [WELCOME_MESSAGE]
    const parsed = JSON.parse(raw) as ChatMessage[]
    // Reconstituir Date objects
    return parsed.map(m => ({ ...m, timestamp: new Date(m.timestamp) }))
  } catch {
    return [WELCOME_MESSAGE]
  }
}

function saveHistory(messages: ChatMessage[]): void {
  try {
    const toSave = messages.slice(-MAX_PERSISTED)
    localStorage.setItem(STORAGE_KEY, JSON.stringify(toSave))
  } catch {
    // localStorage full o no disponible
  }
}

// ─── Hook principal ──────────────────────────────────────────────────

export function useChatBot() {
  const [messages, setMessages] = useState<ChatMessage[]>(() => loadHistory())
  const [isLoading, setIsLoading] = useState(false)
  const [isOpen, setIsOpen] = useState(false)
  const [hasUnread, setHasUnread] = useState(false)
  const [streamingContent, setStreamingContent] = useState<string | null>(null)
  const [lastActions, setLastActions] = useState<ChatAction[]>([])
  const abortRef = useRef(false)
  const isOpenRef = useRef(false)

  // Sincronizar ref con estado
  useEffect(() => {
    isOpenRef.current = isOpen
  }, [isOpen])

  // Persistir historial cuando cambia
  useEffect(() => {
    saveHistory(messages)
  }, [messages])

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

      const { reply, context, actions } = await sendChatMessage(
        trimmed,
        history,
        // Streaming callback
        (partial) => {
          if (!abortRef.current) {
            setStreamingContent(partial)
          }
        }
      )

      if (abortRef.current) return

      setStreamingContent(null)
      setLastActions(actions)

      const assistantMsg: ChatMessage = {
        id: generateId(),
        role: 'assistant',
        content: reply,
        timestamp: new Date(),
        context,
        actions: actions.length > 0 ? actions : undefined,
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
  }, [messages, isLoading])

  const clearHistory = useCallback(() => {
    setMessages([WELCOME_MESSAGE])
    setStreamingContent(null)
    setLastActions([])
    localStorage.removeItem(STORAGE_KEY)
  }, [])

  return {
    messages,
    isLoading,
    isOpen,
    hasUnread,
    streamingContent,
    lastActions,
    toggle,
    open,
    close,
    sendMessage,
    clearHistory,
  }
}
