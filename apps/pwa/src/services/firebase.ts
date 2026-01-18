import { initializeApp } from 'firebase/app'
import { getAuth } from 'firebase/auth'
import { getFirestore } from 'firebase/firestore'
import { getStorage } from 'firebase/storage'
import { getDatabase } from 'firebase/database'
import { getMessaging, isSupported } from 'firebase/messaging'

// Configuración de Firebase hardcodeada (segura para cliente)
// Estos valores son públicos y se incluyen en el bundle del cliente
const firebaseConfig = {
  apiKey: "AIzaSyBsJSh6x3ZGEyuXsM18dSWsJKyU7--KJss",
  authDomain: "mantenimiento-planta-771a3.firebaseapp.com",
  databaseURL: "https://mantenimiento-planta-771a3-default-rtdb.firebaseio.com",
  projectId: "mantenimiento-planta-771a3",
  storageBucket: "mantenimiento-planta-771a3.firebasestorage.app",
  messagingSenderId: "1019421112530",
  appId: "1:1019421112530:web:9afd9962e0b53152f8d50b",
}

// Inicializar Firebase
const app = initializeApp(firebaseConfig)

// Servicios de Firebase
export const auth = getAuth(app)
export const db = getFirestore(app)
export const storage = getStorage(app)
export const rtdb = getDatabase(app)

// Messaging (con verificación de soporte)
let messaging: ReturnType<typeof getMessaging> | null = null
let messagingInitPromise: Promise<ReturnType<typeof getMessaging> | null> | null = null

// Inicializar messaging de forma asíncrona
messagingInitPromise = (async () => {
  try {
    console.log('🔄 Checking Firebase Messaging support...')
    const supported = await isSupported()
    
    if (supported) {
      console.log('✅ Firebase Messaging is supported')
      
      // Registrar el service worker primero
      if ('serviceWorker' in navigator) {
        try {
          const baseUrl = import.meta.env.BASE_URL || '/'
          const swUrl = `${baseUrl}firebase-messaging-sw.js`
          console.log(`📝 Registering SW at: ${swUrl} (scope: ${baseUrl})`)
          
          const registration = await navigator.serviceWorker.register(swUrl, {
            scope: baseUrl
          })
          console.log('✅ Firebase Messaging Service Worker registered:', swUrl)
          console.log('   Active:', !!registration.active)
          console.log('   Scope:', registration.scope)
        } catch (swError) {
          console.warn('⚠️ Error registering FCM service worker:')
          console.warn('   Message:', swError instanceof Error ? swError.message : String(swError))
          if (swError instanceof Error) {
            console.warn('   Stack:', swError.stack)
          }
        }
      } else {
        console.warn('⚠️ Service Workers not available in this environment')
      }
      
      console.log('📦 Initializing Firebase Messaging instance...')
      messaging = getMessaging(app)
      console.log('✅ Firebase Messaging initialized successfully')
      return messaging
    } else {
      console.warn('⚠️ Firebase Messaging not supported in this browser')
      console.warn('   Browser:', navigator.userAgent)
      return null
    }
  } catch (error) {
    console.error('❌ Error checking messaging support:')
    console.error('   Error:', error instanceof Error ? error.message : String(error))
    if (error instanceof Error) {
      console.error('   Stack:', error.stack)
    }
    return null
  }
})()

export { messaging }

/**
 * Esperar a que Firebase Messaging esté listo
 * @returns Promise que se resuelve con el objeto messaging o null si no está soportado
 */
export async function getMessagingInstance(): Promise<ReturnType<typeof getMessaging> | null> {
  if (messagingInitPromise) {
    await messagingInitPromise
  }
  return messaging
}

console.log('✅ Firebase initialized successfully for project:', firebaseConfig.projectId)

export default app
