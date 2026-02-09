import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import path from 'path'

export default defineConfig({
  plugins: [
    react(),
    // VitePWA eliminado - usamos manifest.json y sw.js manuales en public/
  ],
  resolve: {
    alias: {
      '@': path.resolve(__dirname, './src')
    }
  },
  base: process.env.VITE_BASE_URL || '/mantenimiento-planta/',
  build: {
    outDir: 'dist',
    sourcemap: false,
    rollupOptions: {
      output: {
        manualChunks: {
          vendor: ['react', 'react-dom', 'react-router-dom'],
          firebase: ['firebase/app', 'firebase/auth', 'firebase/firestore', 'firebase/storage'],
          ui: ['@radix-ui/react-dialog', '@radix-ui/react-dropdown-menu', '@radix-ui/react-select'],
          // Three.js se carga dinámicamente via lazy import de Visor3D (~1MB)
        }
      }
    }
  }
})
