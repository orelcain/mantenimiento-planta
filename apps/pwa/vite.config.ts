import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import { VitePWA } from 'vite-plugin-pwa'
import path from 'path'

export default defineConfig({
  plugins: [
    react(),
    VitePWA({
      registerType: 'autoUpdate',
      workbox: {
        globPatterns: ['**/*.{js,css,html,ico,svg,webp}'],
        // NO cachear imágenes PNG - Firebase Storage las sirve directamente
        navigateFallback: 'index.html',
        navigateFallbackDenylist: [/^\/api/, /firebasestorage/, /googleapis/],
        // Sin runtimeCaching - las imágenes van directo a la red
        runtimeCaching: []
      },
      manifest: {
        name: 'Sistema de Mantenimiento Industrial',
        short_name: 'Mantenimiento',
        description: 'PWA para gestión de mantenimiento industrial y levantamiento de incidencias - v1.0.2',
        version: '1.0.2',
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
