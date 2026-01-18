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
    const messaging = await getMessagingInstance()
    
    if (!messaging) {
      logger.warn('Messaging not supported')
      return null
    }

    // Solicitar permiso
    const permission = await Notification.requestPermission()
    logger.info('Permission result:', { permission })
    
    if (permission !== 'granted') {
      logger.warn('Permission denied')
      return null
    }

    // Registrar SW
    const registration = await navigator.serviceWorker.register(
      `${import.meta.env.BASE_URL}firebase-messaging-sw.js`,
      { scope: import.meta.env.BASE_URL }
    )
    logger.info('SW registered')

    // Intentar obtener token SIN VAPID key primero
    try {
      const token = await getToken(messaging, { serviceWorkerRegistration: registration })
      logger.info('✅ Token obtained (no VAPID):', { preview: token.substring(0, 20) })
      
      // Guardar token
      await setDoc(doc(db, 'fcmTokens', token), {
        token,
        userId,
        updatedAt: serverTimestamp(),
        platform: navigator.userAgent.includes('Mobile') ? 'mobile' : 'desktop',
      })

      localStorage.setItem('fcm_token', token)
      logger.info('✅ Token guardado en localStorage y Firestore')
      logger.info('📱 Verificación:', { 
        tokenLength: token.length,
        inLocalStorage: localStorage.getItem('fcm_token') !== null,
        areEnabled: areNotificationsEnabled()
      })
      return token
    } catch (error) {
      logger.warn('Failed without VAPID, trying with VAPID key...')
      
      // Fallback con VAPID key
      const token = await getToken(messaging, {
        vapidKey: 'BB2ESVcTn4BvFVxnGpIuZsGTRpNgQMeS-4LBQ4QQHQiBrWEb-ZK7zglHTEfc5eJBQZv1MlBsvAKZfCSVMOavCz2o',
        serviceWorkerRegistration: registration
      })
      logger.info('✅ Token obtained (with VAPID):', { preview: token.substring(0, 20) })
      
      await setDoc(doc(db, 'fcmTokens', token), {
        token,
        userId,
        updatedAt: serverTimestamp(),
        platform: navigator.userAgent.includes('Mobile') ? 'mobile' : 'desktop',
      })

      localStorage.setItem('fcm_token', token)
      logger.info('✅ Token guardado en localStorage y Firestore (VAPID)')
      logger.info('📱 Verificación:', { 
        tokenLength: token.length,
        inLocalStorage: localStorage.getItem('fcm_token') !== null,
        areEnabled: areNotificationsEnabled()
      })
      return token
    }
  } catch (error) {
    logger.error('❌ Error:', error instanceof Error ? error.message : String(error))
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
