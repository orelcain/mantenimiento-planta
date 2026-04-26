/**
 * Desactivar completamente el registro de Service Workers
 * Esto previene que Firebase Auth u otros módulos registren SWs automáticamente
 */
import { logger } from '@/lib/logger'

// Guardar la función original
const originalRegister = navigator.serviceWorker?.register

// Variable para trackear qué SWs están permitidos
const allowedSWs = ['firebase-messaging-sw.js']

// Sobrescribir la función de registro
if ('serviceWorker' in navigator && originalRegister) {
  navigator.serviceWorker.register = function(scriptURL: string | URL, options?: RegistrationOptions) {
    const urlString = scriptURL.toString()
    
    // Solo permitir firebase-messaging-sw.js
    const isAllowed = allowedSWs.some(allowed => urlString.includes(allowed))
    
    if (!isAllowed) {
      logger.warn('Blocked SW registration attempt')
      // Devolver una promesa rechazada
      return Promise.reject(new Error(`Service Worker registration blocked: ${urlString}`))
    }
    
    const result = originalRegister.call(navigator.serviceWorker, scriptURL, options)

    // Agregar logging al resultado
    result.then(() => {
      logger.info('SW registered successfully')
    }).catch((error: unknown) => {
      logger.error('SW registration failed', error instanceof Error ? error : new Error(String(error)))
    })
    
    return result
  }
  
}

/**
 * Limpiar todos los SWs existentes excepto los permitidos
 */
export async function cleanupServiceWorkers(): Promise<void> {
  if (!('serviceWorker' in navigator)) return
  
  try {
    const registrations = await navigator.serviceWorker.getRegistrations()
    
    for (const registration of registrations) {
      const scriptUrl = registration.active?.scriptURL || 
                       registration.installing?.scriptURL || 
                       registration.waiting?.scriptURL || ''
      
      const isAllowed = allowedSWs.some(allowed => scriptUrl.includes(allowed))
      
      if (!isAllowed && scriptUrl) {
        await registration.unregister()
      }
    }
  } catch (error) {
    logger.warn('Error cleaning up SWs')
  }
}
