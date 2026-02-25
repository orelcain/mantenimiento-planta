/**
 * Hook para el Chatbot — gestiona mensajes, historial y estado
 */
import { useState, useCallback, useRef } from 'react'
import { sendChatMessage, type ChatMessage } from '@/services/chatbot'

function generateId(): string {
  return `msg_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`
}

const WELCOME_MESSAGE: ChatMessage = {
  id: 'welcome',
  role: 'assistant',
  content: '¡Hola! 👋 Soy el asistente de planta. Puedo ayudarte con:\n\n• **Repuestos** — buscar piezas por nombre, código SAP o fabricante\n• **Incidencias** — ver reportes abiertos, filtrar por estado o prioridad\n• **Equipos** — consultar estado de máquinas y criticidad\n• **Resúmenes** — panorama general de la planta\n\n¿En qué puedo ayudarte?',
  timestamp: new Date(),
}

export function useChatBot() {
  const [messages, setMessages] = useState<ChatMessage[]>([WELCOME_MESSAGE])
  const [isLoading, setIsLoading] = useState(false)
  const [isOpen, setIsOpen] = useState(false)
  const [hasUnread, setHasUnread] = useState(false)
  const abortRef = useRef(false)

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

    // Agregar mensaje del usuario
    const userMsg: ChatMessage = {
      id: generateId(),
      role: 'user',
      content: trimmed,
      timestamp: new Date(),
    }

    setMessages(prev => [...prev, userMsg])
    setIsLoading(true)
    abortRef.current = false

    try {
      // Enviar al servicio (RAG + LLM)
      const history = [...messages, userMsg].filter(m => m.role !== 'system')
      const { reply, context } = await sendChatMessage(trimmed, history)

      if (abortRef.current) return

      const assistantMsg: ChatMessage = {
        id: generateId(),
        role: 'assistant',
        content: reply,
        timestamp: new Date(),
        context,
      }

      setMessages(prev => [...prev, assistantMsg])

      // Si el chat está cerrado, marcar como no leído
      setIsOpen(current => {
        if (!current) setHasUnread(true)
        return current
      })
    } catch (err) {
      if (abortRef.current) return

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
  }, [])

  return {
    messages,
    isLoading,
    isOpen,
    hasUnread,
    toggle,
    open,
    close,
    sendMessage,
    clearHistory,
  }
}
