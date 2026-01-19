/**
 * Desactivar completamente el registro de Service Workers
 * Esto previene que Firebase Auth u otros módulos registren SWs automáticamente
 */

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
      console.warn('🚫 Blocked SW registration attempt:', urlString)
      // Devolver una promesa rechazada
      return Promise.reject(new Error(`Service Worker registration blocked: ${urlString}`))
    }
    
    console.log('✅ Allowed SW registration:', urlString)
    const result = originalRegister.call(navigator.serviceWorker, scriptURL, options)
    
    // Agregar logging al resultado
    result.then(() => {
      console.log('✅ SW registered successfully')
    }).catch((error) => {
      console.error('❌ SW registration failed:', error)
    })
    
    return result
  }
  
  console.log('🛡️ Service Worker registration interceptor installed')
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
        const success = await registration.unregister()
        if (success) {
          console.log('🧹 Unregistered unwanted SW:', scriptUrl)
        }
      }
    }
  } catch (error) {
    console.warn('Error cleaning up SWs:', error)
  }
}
