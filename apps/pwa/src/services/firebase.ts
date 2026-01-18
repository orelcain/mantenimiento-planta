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
messagingInitPromise = isSupported()
  .then((supported) => {
    if (supported) {
      messaging = getMessaging(app)
      console.log('✅ Firebase Messaging supported')
      return messaging
    } else {
      console.warn('⚠️ Firebase Messaging not supported in this browser')
      return null
    }
  })
  .catch((error) => {
    console.error('❌ Error checking messaging support:', error)
    return null
  })

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
