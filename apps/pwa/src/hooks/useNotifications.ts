/**
 * Hook para gestionar notificaciones push
 * Proporciona funciones para solicitar permisos, estado y configuración
 */

import { useState, useEffect, useCallback } from 'react'
import { useAuthStore } from '@/store'
import {
  requestNotificationPermission,
  areNotificationsEnabled,
  getNotificationPermission,
  revokeNotificationPermission,
  setupForegroundMessageListener,
  showLocalNotification,
} from '@/services/notifications'
import { logger } from '@/lib/logger'
import type { MessagePayload } from 'firebase/messaging'

export function useNotifications() {
  const user = useAuthStore((state) => state.user)
  const [isEnabled, setIsEnabled] = useState(areNotificationsEnabled())
  const [permission, setPermission] = useState<NotificationPermission>(getNotificationPermission())
  const [isLoading, setIsLoading] = useState(false)

  // Verificar permisos al montar
  useEffect(() => {
    const checkPermission = () => {
      setIsEnabled(areNotificationsEnabled())
      setPermission(getNotificationPermission())
    }

    checkPermission()
    
    // Verificar cada 5 segundos (por si el usuario cambia permisos en el navegador)
    const interval = setInterval(checkPermission, 5000)
    
    return () => clearInterval(interval)
  }, [])

  // Configurar listener de mensajes en foreground
  useEffect(() => {
    if (!isEnabled) return

    let unsubscribe: (() => void) | undefined

    setupForegroundMessageListener((payload: MessagePayload) => {
      // Mostrar notificación local cuando la app está en foreground
      const { title, body } = payload.notification || {}
      if (title) {
        showLocalNotification(title, { body, data: payload.data })
      }
    }).then((unsub) => {
      unsubscribe = unsub
    })

    return () => {
      if (unsubscribe) unsubscribe()
    }
  }, [isEnabled])

  // Solicitar permisos
  const requestPermission = useCallback(async () => {
    if (!user) {
      logger.warn('Cannot request notifications: no user logged in')
      return false
    }

    setIsLoading(true)
    try {
      const token = await requestNotificationPermission(user.id)
      const success = token !== null
      
      // Actualizar estado inmediatamente
      setIsEnabled(success)
      setPermission(success ? 'granted' : 'denied')
      
      // Re-verificar desde localStorage después de un pequeño delay
      // para asegurar que el estado se sincroniza correctamente
      setTimeout(() => {
        const enabled = areNotificationsEnabled()
        const perm = getNotificationPermission()
        setIsEnabled(enabled)
        setPermission(perm)
        logger.info('✅ Estado verificado:', { enabled, permission: perm })
      }, 100)
      
      return success
    } catch (error) {
      logger.error('Error requesting notification permission', error instanceof Error ? error : new Error(String(error)))
      return false
    } finally {
      setIsLoading(false)
    }
  }, [user])

  // Revocar permisos
  const revokePermission = useCallback(async () => {
    if (!user) return

    setIsLoading(true)
    try {
      await revokeNotificationPermission(user.id)
      setIsEnabled(false)
      setPermission('default')
    } catch (error) {
      logger.error('Error revoking notification permission', error instanceof Error ? error : new Error(String(error)))
    } finally {
      setIsLoading(false)
    }
  }, [user])

  // Mostrar notificación de prueba
  const showTestNotification = useCallback(() => {
    if (!isEnabled) {
      logger.warn('Cannot show test notification: not enabled')
      return
    }

    showLocalNotification('🔔 Notificación de prueba', {
      body: 'Las notificaciones están funcionando correctamente',
      requireInteraction: false,
    })
  }, [isEnabled])

  return {
    isEnabled,
    permission,
    isLoading,
    canRequest: permission !== 'denied' && !isEnabled,
    isDenied: permission === 'denied',
    requestPermission,
    revokePermission,
    showTestNotification,
  }
}
