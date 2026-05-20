/// <reference types="vite/client" />

interface ImportMetaEnv {
  // Vite Built-in Variables
  readonly DEV: boolean
  readonly PROD: boolean
  readonly MODE: string
  readonly BASE_URL: string
  readonly SSR: boolean
  
  // Firebase Environment Variables
  readonly VITE_FIREBASE_API_KEY: string
  readonly VITE_FIREBASE_AUTH_DOMAIN: string
  readonly VITE_FIREBASE_PROJECT_ID: string
  readonly VITE_FIREBASE_STORAGE_BUCKET: string
  readonly VITE_FIREBASE_MESSAGING_SENDER_ID: string
  readonly VITE_FIREBASE_APP_ID: string
  readonly VITE_FIREBASE_MEASUREMENT_ID?: string
  readonly VITE_FIREBASE_VAPID_KEY?: string
  readonly VITE_USE_EMULATORS?: string

  // App Check — reCAPTCHA Enterprise site key (pública por diseño)
  readonly VITE_RECAPTCHA_SITE_KEY?: string

  // OTA — password local de actualización de firmware ESP (LAN only)
  readonly VITE_OTA_PASSWORD?: string

  // Google OAuth — client ID (público por diseño)
  readonly VITE_GOOGLE_CLIENT_ID?: string

  // Misc
  readonly VITE_APP_VERSION?: string
  readonly VITE_APP_BASE_URL?: string
  readonly VITE_SHOPLOGIX_DEMO?: string

  // NO declarar VITE_*_API_KEY de IA aquí. Cualquier referencia a Groq/Gemini/Deepseek
  // en el cliente debe pasar por Cloud Functions proxy. Las keys viven en GCP Secret Manager.
}

interface ImportMeta {
  readonly env: ImportMetaEnv
}
