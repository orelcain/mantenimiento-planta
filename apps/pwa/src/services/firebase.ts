import { initializeApp } from 'firebase/app'
import { getAuth } from 'firebase/auth'
import { initializeFirestore, persistentLocalCache, persistentMultipleTabManager } from 'firebase/firestore'
import { getStorage } from 'firebase/storage'
import { getDatabase } from 'firebase/database'
import { getMessaging, isSupported } from 'firebase/messaging'

// Configuración de Firebase desde variables de entorno (.env.local)
// NUNCA hardcodear keys aquí — configurar en .env.local o CI/CD build vars
const firebaseConfig = {
  apiKey: import.meta.env.VITE_FIREBASE_API_KEY,
  authDomain: import.meta.env.VITE_FIREBASE_AUTH_DOMAIN,
  databaseURL: import.meta.env.VITE_FIREBASE_DATABASE_URL,
  projectId: import.meta.env.VITE_FIREBASE_PROJECT_ID,
  storageBucket: import.meta.env.VITE_FIREBASE_STORAGE_BUCKET,
  messagingSenderId: import.meta.env.VITE_FIREBASE_MESSAGING_SENDER_ID,
  appId: import.meta.env.VITE_FIREBASE_APP_ID,
}

if (!firebaseConfig.apiKey) {
  console.error('Firebase no configurado. Copia .env.example → .env.local y completa los valores.')
}

// Inicializar Firebase
const app = initializeApp(firebaseConfig)

// Servicios básicos
export const auth = getAuth(app)

// Firestore con persistencia offline moderna (soporta multi-tab)
export const db = initializeFirestore(app, {
  localCache: persistentLocalCache({
    tabManager: persistentMultipleTabManager(),
  }),
})
console.log('✅ Firestore initialized with persistent multi-tab cache')

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
