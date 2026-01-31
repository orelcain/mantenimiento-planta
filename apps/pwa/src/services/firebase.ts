import { initializeApp } from 'firebase/app'
import { getAuth } from 'firebase/auth'
import { getFirestore } from 'firebase/firestore'
import { getStorage } from 'firebase/storage'
import { getDatabase } from 'firebase/database'
import { getMessaging, isSupported } from 'firebase/messaging'

// Configuración de Firebase hardcodeada (segura para cliente)
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

// Servicios básicos
export const auth = getAuth(app)
export const db = getFirestore(app)
export const storage = getStorage(app)
export const rtdb = getDatabase(app)

// Messaging - inicializar solo cuando se solicite
let messaging: ReturnType<typeof getMessaging> | null = null

export async function getMessagingInstance(): Promise<ReturnType<typeof getMessaging> | null> {
  if (messaging) return messaging
  
  try {
    const supported = await isSupported()
    if (!supported) {
      console.warn('Firebase Messaging not supported')
      return null
    }
    
    messaging = getMessaging(app)
    console.log('✅ Firebase Messaging initialized')
    return messaging
  } catch (error) {
    console.error('Error initializing messaging:', error)
    return null
  }
}

console.log('✅ Firebase initialized:', firebaseConfig.projectId)

export default app
