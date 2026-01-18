/**
 * Servicio de notificaciones push con Firebase Cloud Messaging
 * Maneja permisos, tokens y envío de notificaciones
 */

import { getToken, onMessage, deleteToken, MessagePayload } from 'firebase/messaging'
import { getMessagingInstance } from './firebase'
import { db } from './firebase'
import { doc, setDoc, deleteDoc, serverTimestamp } from 'firebase/firestore'
import { logger } from '@/lib/logger'

/**
 * Solicitar permiso de notificaciones y obtener token FCM
 */
export async function requestNotificationPermission(userId: string): Promise<string | null> {
  try {
    // Esperar a que messaging esté listo
    const messaging = await getMessagingInstance()
    
    if (!messaging) {
      logger.warn('Messaging not supported')
      return null
    }

    // Solicitar permiso al usuario
    const permission = await Notification.requestPermission()
    
    if (permission !== 'granted') {
      logger.warn('Notification permission denied')
      return null
    }

    // Obtener token de FCM
    const token = await getToken(messaging, {
      vapidKey: 'BNjR3wX8X_W-VxqQ9yF8ZdvKq5xG8dR4qY7wJ6K3dX5pQ8vF9rT3wN2xJ7yK5dR6vL8qT9wF3xN4yH7rJ2kP5dV',  // Tu VAPID key de Firebase Console
    })

    if (token) {
      logger.info('FCM token obtained', { tokenPreview: token.substring(0, 20) + '...' })
      
      // Guardar token por dispositivo (docId = token)
      await setDoc(doc(db, 'fcmTokens', token), {
        token,
        userId,
        updatedAt: serverTimestamp(),
        platform: navigator.userAgent.includes('Mobile') ? 'mobile' : 'desktop',
      })

      try {
        localStorage.setItem('fcm_token', token)
      } catch {
        // noop
      }
      
      return token
    }

    return null
  } catch (error) {
    logger.error('Error getting FCM token', error instanceof Error ? error : new Error(String(error)))
    return null
  }
}

/**
 * Verificar si las notificaciones están habilitadas
 */
export function areNotificationsEnabled(): boolean {
  if (!('Notification' in window) || Notification.permission !== 'granted') {
    return false
  }

  try {
    return Boolean(localStorage.getItem('fcm_token'))
  } catch {
    return false
  }
}

/**
 * Obtener estado del permiso de notificaciones
 */
export function getNotificationPermission(): NotificationPermission {
  if ('Notification' in window) {
    return Notification.permission
  }
  return 'default'
}

/**
 * Eliminar token FCM del usuario
 */
export async function revokeNotificationPermission(userId: string): Promise<void> {
  try {
    const messaging = await getMessagingInstance()
    
    if (!messaging) return

    let storedToken: string | null = null
    try {
      storedToken = localStorage.getItem('fcm_token')
    } catch {
      storedToken = null
    }

    // Eliminar token de FCM
    await deleteToken(messaging)

    // Eliminar token de Firestore (por token)
    if (storedToken) {
      await deleteDoc(doc(db, 'fcmTokens', storedToken))
    }

    try {
      localStorage.removeItem('fcm_token')
    } catch {
      // noop
    }
    
    logger.info('FCM token revoked successfully')
  } catch (error) {
    logger.error('Error revoking FCM token', error instanceof Error ? error : new Error(String(error)))
  }
}

/**
 * Configurar listener para mensajes en foreground
 */
export async function setupForegroundMessageListener(
  callback: (payload: MessagePayload) => void
): Promise<() => void> {
  const messaging = await getMessagingInstance()
  
  if (!messaging) {
    return () => {}
  }

  const unsubscribe = onMessage(messaging, (payload) => {
    logger.info('Foreground message received', { title: payload.notification?.title })
    callback(payload)
  })

  return unsubscribe
}

/**
 * Mostrar notificación local (para mensajes en foreground)
 */
export function showLocalNotification(title: string, options?: NotificationOptions): void {
  if (!areNotificationsEnabled()) {
    logger.warn('Cannot show notification: permission not granted')
    return
  }

  try {
    new Notification(title, {
      icon: '/mantenimiento-planta/icons/icon-192.svg',
      badge: '/mantenimiento-planta/icons/icon-192.svg',
      ...options,
    })
  } catch (error) {
    logger.error('Error showing notification', error instanceof Error ? error : new Error(String(error)))
  }
}

/**
 * Tipos de notificaciones del sistema
 */
export enum NotificationType {
  INCIDENT_CREATED = 'incident_created',
  INCIDENT_ASSIGNED = 'incident_assigned',
  INCIDENT_CONFIRMED = 'incident_confirmed',
  INCIDENT_REJECTED = 'incident_rejected',
  INCIDENT_CLOSED = 'incident_closed',
  MAINTENANCE_DUE = 'maintenance_due',
}

/**
 * Obtener configuración de notificación según tipo
 */
export function getNotificationConfig(type: NotificationType, data: any): { title: string; body: string; icon?: string } {
  switch (type) {
    case NotificationType.INCIDENT_CREATED:
      return {
        title: '🆕 Nueva incidencia reportada',
        body: `${data.titulo} - Prioridad: ${data.prioridad}`,
      }
    case NotificationType.INCIDENT_ASSIGNED:
      return {
        title: '👤 Incidencia asignada',
        body: `Te han asignado: ${data.titulo}`,
      }
    case NotificationType.INCIDENT_CONFIRMED:
      return {
        title: '✅ Incidencia confirmada',
        body: `Tu incidencia "${data.titulo}" ha sido confirmada`,
      }
    case NotificationType.INCIDENT_REJECTED:
      return {
        title: '❌ Incidencia rechazada',
        body: `Tu incidencia "${data.titulo}" fue rechazada: ${data.reason}`,
      }
    case NotificationType.INCIDENT_CLOSED:
      return {
        title: '🏁 Incidencia cerrada',
        body: `"${data.titulo}" ha sido resuelta`,
      }
    case NotificationType.MAINTENANCE_DUE:
      return {
        title: '⏰ Mantenimiento pendiente',
        body: `${data.equipmentName} requiere mantenimiento preventivo`,
      }
    default:
      return {
        title: 'Notificación',
        body: 'Tienes una nueva actualización',
      }
  }
}
