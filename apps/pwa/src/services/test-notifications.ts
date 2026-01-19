/**
 * Servicio para enviar notificaciones de prueba
 */

import { httpsCallable } from 'firebase/functions'
import { getFunctions } from 'firebase/functions'
import { logger } from '@/lib/logger'

const functions = getFunctions()

export async function sendTestNotification(): Promise<{
  success: boolean
  message: string
  sent: number
  failed: number
}> {
  try {
    logger.info('🧪 Calling sendTestNotification...')

    const sendTest = httpsCallable(functions, 'sendTestNotification')
    const result = await sendTest({})

    logger.info('✅ Test notification result:', result.data)
    return result.data as any
  } catch (error) {
    logger.error('❌ Error sending test notification:', error instanceof Error ? error.message : String(error))
    throw error
  }
}
