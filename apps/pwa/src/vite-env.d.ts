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
  readonly VITE_USE_EMULATORS?: string
  
  // AI API Keys (optional)
  readonly VITE_GROQ_API_KEY?: string
  readonly VITE_OPENROUTER_API_KEY?: string
}

interface ImportMeta {
  readonly env: ImportMetaEnv
}

// Identidad del build, inyectada por `define` en vite.config.ts.
// Ver src/constants/buildInfo.ts.
declare const __BUILD_SHA__: string
declare const __BUILD_TIME__: string
