import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import { VitePWA } from 'vite-plugin-pwa'
import path from 'path'

export default defineConfig({
  plugins: [
    react(),
    VitePWA({
      // Desactivar completamente la generación de SW de Workbox
      // Usamos nuestro propio sw.js y firebase-messaging-sw.js en public/
      strategies: 'injectManifest',
      srcDir: 'public',
      filename: 'sw.js',
      registerType: 'autoUpdate',
      injectRegister: false,  // No inyectar registro automático
      devOptions: {
        enabled: false  // Desactivar en desarrollo
      },
      injectManifest: {
        injectionPoint: undefined  // No inyectar nada en el SW
      },
      manifest: {
        name: 'Sistema de Mantenimiento Industrial',
        short_name: 'Mantenimiento',
        description: 'PWA para gestión de mantenimiento industrial con IA, IoT y 4 tipos de mantenimiento',
        version: '2.23.0',
        start_url: '/mantenimiento-planta/',
        scope: '/mantenimiento-planta/',
        display: 'standalone',
        background_color: '#121212',
        theme_color: '#121212',
        lang: 'es',
        orientation: 'portrait',
        icons: [
          {
            src: 'icons/icon.svg',
            sizes: 'any',
            type: 'image/svg+xml',
            purpose: 'any'
          },
          {
            src: 'icons/icon-192.svg',
            sizes: '192x192',
            type: 'image/svg+xml'
          },
          {
            src: 'icons/icon-512.svg',
            sizes: '512x512',
            type: 'image/svg+xml'
          },
          {
            src: 'icons/icon-512.svg',
            sizes: '512x512',
            type: 'image/svg+xml',
            purpose: 'maskable'
          }
        ]
      }
    })
  ],
  resolve: {
    alias: {
      '@': path.resolve(__dirname, './src')
    }
  },
  base: '/mantenimiento-planta/',
  build: {
    outDir: 'dist',
    sourcemap: false,
    rollupOptions: {
      output: {
        manualChunks: {
          vendor: ['react', 'react-dom', 'react-router-dom'],
          firebase: ['firebase/app', 'firebase/auth', 'firebase/firestore', 'firebase/storage'],
          ui: ['@radix-ui/react-dialog', '@radix-ui/react-dropdown-menu', '@radix-ui/react-select']
        }
      }
    }
  }
})
