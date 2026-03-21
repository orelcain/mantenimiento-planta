/**
 * Servicio para enviar notificaciones de prueba
 */

import { httpsCallable } from 'firebase/functions'
import { getFunctions } from 'firebase/functions'
import { logger } from '@/lib/logger'

const functions = getFunctions()

export async function scheduleClimaPortoTestNotification(delaySeconds: number): Promise<{
  success: boolean
  ri: number
  level: string
  dmKey: string
}> {
  const fn = httpsCallable(functions, 'scheduleClimaPortoTestNotification')
  const result = await fn({ delaySeconds })
  return result.data as any
}

export async function sendTestNotification(): Promise<{
  success: boolean
  message: string
  emisario: string
  sent: number
  failed: number
  destinatarios: string[]
  fallidos: { nombre: string; razon: string }[]
  sinToken: string[]
}> {
  try {
    logger.info('🧪 Calling sendTestNotification...')

    const sendTest = httpsCallable(functions, 'sendTestNotification')
    const result = await sendTest({})

    logger.info('✅ Test notification result', { data: result.data as Record<string, unknown> })
    return result.data as any
  } catch (error) {
    logger.error('❌ Error sending test notification', error instanceof Error ? error : new Error(String(error)))
    throw error
  }
}
