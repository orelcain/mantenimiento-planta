/* eslint-disable no-console -- bootstrap del SDK Firebase: el logger central no está disponible aún */
import { initializeApp } from 'firebase/app'
import { getAuth } from 'firebase/auth'
import { initializeFirestore, persistentLocalCache, persistentMultipleTabManager } from 'firebase/firestore'
import { getStorage } from 'firebase/storage'
import { getDatabase } from 'firebase/database'
import { getMessaging, isSupported } from 'firebase/messaging'
import { initializeAppCheck, ReCaptchaEnterpriseProvider } from 'firebase/app-check'

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

// ─── App Check ────────────────────────────────────────────────────────────
// Valida que las peticiones a Firebase vengan de esta app real (no de un script
// con la API key copiada del bundle público). Bloquea bots/abuso a Cloud
// Functions, Firestore y Storage cuando `enforceAppCheck` está activo en el
// backend.
//
// Para activar:
//   1. Crear un site key de reCAPTCHA Enterprise en Google Cloud Console.
//   2. Registrar el dominio en Firebase Console → App Check.
//   3. Setear VITE_RECAPTCHA_SITE_KEY en build vars (deploy.yml + .env.local).
//   4. Subir gradualmente `enforceAppCheck: true` en los proxies de IA
//      (functions/index.js) una vez que el front esté enviando tokens.
//
// Si la env var no está seteada, App Check no se inicializa — la app sigue
// funcionando con la protección actual (Firestore Rules + request.auth).
const recaptchaSiteKey = import.meta.env.VITE_RECAPTCHA_SITE_KEY
if (recaptchaSiteKey) {
  try {
    initializeAppCheck(app, {
      provider: new ReCaptchaEnterpriseProvider(recaptchaSiteKey),
      isTokenAutoRefreshEnabled: true,
    })
    console.log('✅ App Check initialized (reCAPTCHA Enterprise)')
  } catch (error) {
    console.error('App Check init failed (continuing without):', error)
  }
} else if (import.meta.env.PROD) {
  console.warn('⚠ VITE_RECAPTCHA_SITE_KEY no configurada — App Check inactivo en producción')
}

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
